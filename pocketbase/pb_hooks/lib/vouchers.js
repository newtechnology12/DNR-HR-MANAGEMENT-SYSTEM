/// <reference path="../../pb_data/types.d.ts" />
/**
 * Payment vouchers (IMS M4). The Accountant prepares a voucher for approved supplier invoices of one
 * supplier, or for a direct expense charged to a budget line; withholding tax comes from the dated tax
 * table and is computed on the amount before VAT. Approval: Accountant → DAF → SG above the DAF limit
 * (engine type "payment_voucher"). The Cashier executes: one payment per invoice settled, with the tax
 * withheld and the net paid. Whoever prepared or approved a voucher cannot execute it, and a voucher is
 * not paid if the supplier's verified bank details changed after it was prepared.
 *
 * An invoice can only be on one open voucher at a time for the same money (no double payment).
 */
const core = require("./core.js");

const OPEN = ["draft", "pending_approval", "approved", "returned"];
const EDITABLE = ["draft", "returned"];
const PAYABLE_INVOICE = ["approved", "partially_paid"];
const METHODS = ["bank_transfer", "cheque", "mobile_money", "cash"];
const BANK_FIELDS = ["bank_name", "bank_branch", "bank_account_name", "bank_account_number", "swift_code"];
const VIEWERS = ["view_payment_vouchers", "manage_payment_vouchers", "approve_payment_vouchers", "record_payments", "view_audit_logs"];
const SYSTEM_FIELDS = [
  "number", "status", "prepared_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at",
  "paid_by", "paid_at", "payment_date", "payment_reference", "cancel_reason", "budget_override", "actual_amount", "paid_from", "cash_entry",
];
const r0 = (n) => Math.round(Number(n) || 0);
const fmt = (n) => core.formatMoney(n, "RWF");
const day = (s) => String(s || "").slice(0, 10);

function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

function canView(dao, auth) {
  return !auth || VIEWERS.some((p) => core.can(dao, auth, p));
}

function bankOf(supplier) {
  const out = {};
  for (const f of BANK_FIELDS) out[f] = supplier.getString(f);
  return out;
}

/** Amount of an invoice already held by other open vouchers. */
function heldBy(dao, invoiceId, excludeVoucherId) {
  let held = 0;
  const open = dao.findRecordsByFilter("payment_vouchers", "voucher_type = 'invoice' && (status = 'draft' || status = 'pending_approval' || status = 'approved' || status = 'returned')", "", 5000, 0) || [];
  for (const v of open) {
    if (v.id === excludeVoucherId) continue;
    for (const l of core.parseJson(v, "lines", [])) if (l.invoice === invoiceId) held += r0(l.amount);
  }
  return held;
}

// ------------------------------------------------------------------ statutory payments
/** Liabilities paid by a statutory voucher, and to whom. */
const STATUTORY = {
  2104: "RRA", 2108: "RRA", 2109: "RRA",
  2105: "RSSB", 2106: "RSSB", 2107: "RSSB", 2112: "RSSB", 2113: "RSSB",
  2111: "Other",
};
const OPEN_VOUCHER = "(status = 'draft' || status = 'pending_approval' || status = 'approved' || status = 'returned')";

function statutoryAccount(dao, id, row) {
  let a;
  try {
    a = dao.findRecordById("gl_accounts", id);
  } catch (_) {
    throw new BadRequestError(`Line ${row}: choose what is paid.`);
  }
  if (!STATUTORY[a.getString("code")] || !a.getBool("is_posting") || !a.getBool("active")) {
    throw new BadRequestError(`Line ${row}: ${a.getString("code")} ${a.getString("name")} is not paid with a statutory voucher (PAYE, withholding tax, VAT, social security contributions and other deductions only).`);
  }
  return a;
}

/** What is owed on each statutory liability (ledger balance) and what other open vouchers already hold. */
function statutoryOwed(dao, excludeVoucherId) {
  const codes = Object.keys(STATUTORY);
  const accounts = (dao.findRecordsByFilter("gl_accounts", codes.map((c) => `code = '${c}'`).join(" || "), "code", 0, 0) || []);
  const out = {};
  for (const a of accounts) {
    const m = new DynamicModel({ n: 0 });
    dao.db().newQuery("SELECT COALESCE(SUM(credit - debit), 0) AS n FROM gl_journal_lines WHERE account = {:a} AND (status = 'posted' OR status = 'reversed')").bind({ a: a.id }).one(m);
    out[a.id] = { id: a.id, code: a.getString("code"), name: a.getString("name"), authority: STATUTORY[a.getString("code")], owed: r0(m.n), held: 0 };
  }
  for (const v of dao.findRecordsByFilter("payment_vouchers", `voucher_type = 'statutory' && ${OPEN_VOUCHER}`, "", 5000, 0) || []) {
    if (v.id === excludeVoucherId) continue;
    for (const l of core.parseJson(v, "lines", []) || []) if (out[l.account]) out[l.account].held += r0(l.amount);
  }
  return out;
}

/** GET /api/ims/vouchers/statutory-accounts — what can be paid over, with what is owed and still free. */
function statutoryAccounts(dao, excludeVoucherId) {
  return Object.values(statutoryOwed(dao, excludeVoucherId || "")).map((x) => Object.assign(x, { available: Math.max(x.owed - x.held, 0) }));
}

/** Approved invoices of a supplier with what is still free to put on a voucher. */
function payable(dao, supplierId, excludeVoucherId) {
  const invs = dao.findRecordsByFilter("supplier_invoices", "supplier = {:s} && (status = 'approved' || status = 'partially_paid')", "due_date", 500, 0, { s: supplierId }) || [];
  return invs
    .map((inv) => {
      const held = heldBy(dao, inv.id, excludeVoucherId || "");
      return {
        id: inv.id, number: inv.getString("number"), supplier_invoice_number: inv.getString("supplier_invoice_number"),
        invoice_date: day(inv.getString("invoice_date")), due_date: day(inv.getString("due_date")), total: r0(inv.getFloat("total")),
        subtotal: r0(inv.getFloat("subtotal")), balance: r0(inv.getFloat("balance")), held, open: Math.max(r0(inv.getFloat("balance")) - held, 0),
        budget_line: inv.getString("budget_line"),
      };
    })
    .filter((x) => x.balance > 0);
}

/** Computes lines, payee, withholding tax and totals. Throws on anything that must not be paid. */
function normalize(dao, v) {
  const type = v.getString("voucher_type") || "invoice";
  if (["invoice", "direct", "statutory"].indexOf(type) === -1) throw new BadRequestError("Choose the voucher type.");
  v.set("voucher_type", type);
  v.set("currency", "RWF");

  const code = String(v.getString("wht_code") || "").trim().toUpperCase();
  let rate = 0;
  if (code) {
    const tr = require("./masterdata.js").taxRate(dao, code, new Date().toISOString());
    if (!tr || tr.getString("category") !== "withholding") throw new BadRequestError(`${code} is not an active withholding tax rate (Setup → Tax & statutory rates).`);
    rate = tr.getFloat("rate");
  }
  v.set("wht_code", code);
  v.set("wht_rate", rate);

  let gross = 0;
  let base = 0;
  if (type === "invoice") {
    const supplier = load(dao, "suppliers", v.getString("supplier"), "Supplier");
    if (supplier.getString("status") !== "active") throw new BadRequestError(`${supplier.getString("name")} is ${supplier.getString("status").replace(/_/g, " ")}; only active suppliers are paid.`);
    const raw = core.parseJson(v, "lines", []);
    if (!Array.isArray(raw) || !raw.length) throw new BadRequestError("Choose at least one approved invoice to pay.");
    const seen = {};
    const lines = raw.map((x, i) => {
      const inv = load(dao, "supplier_invoices", String((x && x.invoice) || ""), `Invoice on row ${i + 1}`);
      const n = inv.getString("number");
      if (seen[inv.id]) throw new BadRequestError(`${n} appears twice on the voucher.`);
      seen[inv.id] = true;
      if (inv.getString("supplier") !== supplier.id) throw new BadRequestError(`${n} is from another supplier; one voucher pays one supplier.`);
      if (PAYABLE_INVOICE.indexOf(inv.getString("status")) === -1) throw new BadRequestError(`${n} is ${inv.getString("status").replace(/_/g, " ")}; only approved invoices can be paid.`);
      if (inv.getString("match_status") === "exception" && !inv.getBool("exception_overridden")) throw new BadRequestError(`${n} has an unresolved match exception.`);
      const balance = r0(inv.getFloat("balance"));
      const held = heldBy(dao, inv.id, v.id);
      const open = balance - held;
      const amount = x.amount === undefined || x.amount === null || x.amount === "" ? open : r0(x.amount);
      if (open <= 0) throw new BadRequestError(`${n}: nothing left to pay${held ? ` — ${fmt(held)} is already on other vouchers` : ""}.`);
      if (amount <= 0) throw new BadRequestError(`${n}: enter the amount to pay.`);
      if (amount > open) throw new BadRequestError(`${n}: ${fmt(amount)} is more than the ${fmt(open)} still unpaid${held ? ` (${fmt(held)} is already on other vouchers)` : ""}.`);
      const total = inv.getFloat("total");
      // Withholding tax is computed on the amount before VAT.
      const lineBase = total > 0 ? r0((amount * inv.getFloat("subtotal")) / total) : amount;
      gross += amount;
      base += lineBase;
      return {
        invoice: inv.id, number: n, supplier_invoice_number: inv.getString("supplier_invoice_number"), invoice_date: day(inv.getString("invoice_date")),
        due_date: day(inv.getString("due_date")), total: r0(total), balance, amount, base: lineBase, budget_line: inv.getString("budget_line"),
      };
    });
    const budgetLines = lines.map((l) => l.budget_line).filter((x, i, a) => x && a.indexOf(x) === i);
    v.set("budget_line", budgetLines.length === 1 ? budgetLines[0] : "");
    v.set("funding_source", "");
    if (budgetLines.length === 1) {
      try {
        v.set("funding_source", dao.findRecordById("budget_lines", budgetLines[0]).getString("funding_source"));
      } catch (_) {}
    }
    try {
      v.set("department", dao.findRecordById("supplier_invoices", lines[0].invoice).getString("department"));
    } catch (_) {}
    v.set("lines", lines);
    v.set("payee_name", supplier.getString("name"));
    v.set("payee_bank", bankOf(supplier));
    v.set("expense_account", "");
    if (!String(v.getString("description")).trim()) v.set("description", `Payment of ${lines.map((l) => `${l.number} (${l.supplier_invoice_number})`).join(", ")}`);
    if (!v.getString("due_date")) v.set("due_date", lines.map((l) => l.due_date).filter(Boolean).sort()[0] ? `${lines.map((l) => l.due_date).filter(Boolean).sort()[0]} 00:00:00.000Z` : "");
  } else if (type === "statutory") {
    // PAYE, withholding tax and VAT to RRA, contributions to RSSB, other deductions: the liabilities are paid; no budget
    if (code) throw new BadRequestError("A statutory payment has no withholding tax.");
    const raw = core.parseJson(v, "lines", []);
    if (!Array.isArray(raw) || !raw.length) throw new BadRequestError("Choose what is paid: PAYE, withholding tax, a social security contribution…");
    const owed = statutoryOwed(dao, v.id);
    const seen = {};
    const payee = { RRA: "RRA", RSSB: "RSSB", Other: "another payee" };
    let authority = "";
    const lines = raw.map((x, i) => {
      const a = statutoryAccount(dao, String((x && x.account) || ""), i + 1);
      const label = `${a.getString("code")} ${a.getString("name")}`;
      if (seen[a.id]) throw new BadRequestError(`${label} appears twice on the voucher.`);
      seen[a.id] = true;
      // one payee per voucher: RRA's taxes and RSSB's contributions are paid separately
      const who = STATUTORY[a.getString("code")];
      if (authority && who !== authority) throw new BadRequestError(`One voucher pays one authority: ${label} is paid to ${payee[who]}, the other lines to ${payee[authority]}. Prepare a voucher for each.`);
      authority = who;
      const amount = r0(x.amount);
      if (amount <= 0) throw new BadRequestError(`${label}: enter the amount.`);
      const o = owed[a.id] || { owed: 0, held: 0 };
      const open = o.owed - o.held;
      if (amount > open) throw new BadRequestError(`${label}: ${fmt(amount)} is more than the ${fmt(Math.max(open, 0))} still owed${o.held ? ` (${fmt(o.held)} is already on other vouchers)` : ""}.`);
      gross += amount;
      return { account: a.id, code: a.getString("code"), name: a.getString("name"), authority: STATUTORY[a.getString("code")], amount, period: String((x && x.period) || "").trim().slice(0, 60) };
    });
    if (v.getString("supplier")) {
      const supplier = load(dao, "suppliers", v.getString("supplier"), "Supplier");
      v.set("payee_name", supplier.getString("name"));
      v.set("payee_bank", bankOf(supplier));
    } else {
      if (!String(v.getString("payee_name")).trim()) throw new BadRequestError("Enter who is paid (Rwanda Revenue Authority, Rwanda Social Security Board…).");
      const given = core.parseJson(v, "payee_bank", {}) || {};
      const bank = {};
      for (const f of BANK_FIELDS) bank[f] = String(given[f] || "").trim();
      v.set("payee_bank", bank);
    }
    if (!String(v.getString("description")).trim()) v.set("description", `${lines.map((l) => l.name).join(", ")}${lines[0].period ? ` — ${lines[0].period}` : ""}`.slice(0, 500));
    v.set("lines", lines);
    v.set("budget_line", "");
    v.set("funding_source", "");
    v.set("expense_account", "");
    v.set("department", "");
    base = 0;
  } else {
    if (!v.getString("budget_line")) throw new BadRequestError("Choose the budget line the payment is charged to.");
    const line = require("./budget.js").attachLine(dao, v, null);
    v.set("department", line.getString("department"));
    if (!v.getString("expense_account")) v.set("expense_account", line.getString("gl_account"));
    gross = r0(v.getFloat("gross_amount"));
    if (gross <= 0) throw new BadRequestError("Enter the amount to pay.");
    base = gross;
    if (v.getString("supplier")) {
      const supplier = load(dao, "suppliers", v.getString("supplier"), "Supplier");
      if (supplier.getString("status") !== "active") throw new BadRequestError(`${supplier.getString("name")} is not an active supplier.`);
      v.set("payee_name", supplier.getString("name"));
      v.set("payee_bank", bankOf(supplier));
    } else {
      if (!String(v.getString("payee_name")).trim()) throw new BadRequestError("Enter the payee (or choose a registered supplier).");
      const given = core.parseJson(v, "payee_bank", {}) || {};
      const bank = {};
      for (const f of BANK_FIELDS) bank[f] = String(given[f] || "").trim();
      v.set("payee_bank", bank);
    }
    if (!String(v.getString("description")).trim()) throw new BadRequestError("Describe what is being paid.");
    v.set("lines", []);
  }
  const wht = r0((base * rate) / 100);
  v.set("gross_amount", gross);
  v.set("wht_base", base);
  v.set("wht_amount", wht);
  v.set("net_amount", gross - wht);
}

// ------------------------------------------------------------------ collection hooks
function beforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_payment_vouchers", "prepare payment vouchers");
  const v = e.record;
  for (const f of SYSTEM_FIELDS) v.set(f, "");
  v.set("status", "draft");
  v.set("actual_amount", 0);
  if (auth) v.set("prepared_by", auth.id);
  normalize(dao, v);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "payment_voucher");
  });
  v.set("number", n);
}

function beforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_payment_vouchers", "edit payment vouchers");
  const v = e.record;
  const before = v.originalCopy();
  if (auth && EDITABLE.indexOf(before.getString("status")) === -1) {
    throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  }
  for (const f of SYSTEM_FIELDS) v.set(f, before.get(f));
  // An override covers one line and amount.
  if (before.getString("budget_line") !== v.getString("budget_line") || before.getInt("gross_amount") < r0(v.getFloat("gross_amount"))) v.set("budget_override", "");
  normalize(dao, v);
  const changes = core.diff(before, v, ["voucher_type", "supplier", "payee_name", "description", "gross_amount", "wht_code", "wht_amount", "net_amount", "budget_line"]);
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function beforeDelete(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  core.requirePermission($app.dao(), auth, "manage_payment_vouchers", "delete payment vouchers");
  if (e.record.getString("status") !== "draft" || e.record.getString("approval")) throw new BadRequestError("Only drafts that were never submitted can be deleted; cancel the voucher instead.");
}

/** list / view: payables, approvers, cashiers and audit only. */
function guardRead(e) {
  const auth = e.httpContext.get("authRecord");
  if (canView($app.dao(), auth)) return;
  throw new ForbiddenError('You don\'t have permission to see payment vouchers. Ask for "view_payment_vouchers".');
}

// ------------------------------------------------------------------ workflow
function submit(dao, id, actor, meta) {
  core.requirePermission(dao, actor, "manage_payment_vouchers", "submit payment vouchers");
  const v = load(dao, "payment_vouchers", id, "Payment voucher");
  if (EDITABLE.indexOf(v.getString("status")) === -1) throw new BadRequestError(`${v.getString("number")} is already ${v.getString("status").replace(/_/g, " ")}.`);
  normalize(dao, v); // fresh balances, rates and bank details
  if (v.getString("voucher_type") === "direct") {
    const budget = require("./budget.js");
    const line = load(dao, "budget_lines", v.getString("budget_line"), "Budget line");
    const res = budget.assertAvailable(dao, { line, amount: v.getInt("gross_amount"), documentType: "payment_voucher", documentId: v.id, documentNumber: v.getString("number"), actor, meta });
    if (res.override) v.set("budget_override", res.override);
  }
  dao.saveRecord(v);
  return require("./approvals.js").start(dao, "payment_voucher", v, actor, meta);
}

/** Final approval: a direct voucher becomes an actual on its budget line; cashiers are told it can be paid. */
function onApproved(dao, v, actor, meta) {
  if (v.getString("voucher_type") === "direct") {
    const budget = require("./budget.js");
    const line = load(dao, "budget_lines", v.getString("budget_line"), "Budget line");
    const amount = v.getInt("gross_amount");
    const res = budget.assertAvailable(dao, { line, amount, documentType: "payment_voucher", documentId: v.id, documentNumber: v.getString("number"), actor, meta });
    budget.post(dao, { line, type: "actual", amount, source: { type: "payment_voucher", id: v.id, number: v.getString("number") }, description: v.getString("description"), actor, override: res.override || "" });
    v.set("actual_amount", amount);
    dao.saveRecord(v);
  }
  const cashiers = (dao.findRecordsByFilter("users", 'status = "Active"', "", 2000, 0) || []).filter((u) => core.can(dao, u, "record_payments") && u.id !== v.getString("prepared_by"));
  core.notify(dao, cashiers.map((u) => u.id), {
    title: `Ready to pay: ${v.getString("number")}`,
    body: `${v.getString("payee_name")} · net ${fmt(v.getInt("net_amount"))}${v.getInt("wht_amount") ? ` (withholding tax ${fmt(v.getInt("wht_amount"))})` : ""}`,
    link: `/dashboard/finance/vouchers/${v.id}`, type: "approval",
  });
}

function approversOf(dao, v) {
  if (!v.getString("approval")) return [];
  return (dao.findRecordsByFilter("approval_actions", 'approval = {:a} && action = "approve"', "", 50, 0, { a: v.getString("approval") }) || []).map((a) => a.getString("actor"));
}

/** The Cashier executes an approved voucher. */
function execute(dao, id, actor, input, meta) {
  core.requirePermission(dao, actor, "record_payments", "execute payments");
  const v = load(dao, "payment_vouchers", id, "Payment voucher");
  const number = v.getString("number");
  if (v.getString("status") !== "approved") throw new BadRequestError(`${number} is ${v.getString("status").replace(/_/g, " ")}; only approved vouchers are paid.`);
  if (v.getString("prepared_by") === actor.id) throw new ForbiddenError("Segregation of duties: you prepared this voucher, so someone else must execute the payment.");
  if (approversOf(dao, v).indexOf(actor.id) !== -1) throw new ForbiddenError("Segregation of duties: you approved this voucher, so someone else must execute the payment.");
  const method = String(input.method || "bank_transfer");
  if (METHODS.indexOf(method) === -1) throw new BadRequestError("Unknown payment method.");
  const reference = String(input.reference || "").trim();
  if ((method === "bank_transfer" || method === "cheque") && reference.length < 3) throw new BadRequestError(method === "cheque" ? "Enter the cheque number." : "Enter the bank transfer reference.");
  if (method === "bank_transfer" && !String((core.parseJson(v, "payee_bank", {}) || {}).bank_account_number || "").trim()) {
    throw new BadRequestError(`${v.getString("payee_name")} has no bank account on ${number}; pay by cheque, or cancel and prepare the voucher again once the account is on file.`);
  }
  const when = require("./masterdata.js").toDate(input.payment_date) || new Date();
  if (when.getTime() > Date.now() + 864e5) throw new BadRequestError("The payment date cannot be in the future.");

  if (v.getString("supplier")) {
    const supplier = load(dao, "suppliers", v.getString("supplier"), "Supplier");
    const now = bankOf(supplier);
    const then = core.parseJson(v, "payee_bank", {}) || {};
    if (BANK_FIELDS.some((f) => (now[f] || "") !== (then[f] || ""))) {
      throw new BadRequestError(`${supplier.getString("name")}'s verified bank details changed after ${number} was prepared. Cancel this voucher and prepare a new one so the approvers see the account being paid.`);
    }
  }

  // The money leaves one of RALGA's accounts: the right kind for the method, enough in it, open dates only,
  // and never restricted donor money for another funding source.
  const treasury = require("./treasury.js");
  const payDay = when.toISOString().slice(0, 10);
  const account = treasury.paymentAccount(dao, String(input.account || ""), method, v);
  treasury.assertDateOpen(dao, account, payDay, `the payment of ${number}`);
  treasury.assertFunds(dao, account, v.getInt("net_amount"), payDay, number);

  const finance = require("./finance.js");
  const payments = [];
  const whtTotal = v.getInt("wht_amount");
  if (v.getString("voucher_type") === "invoice") {
    const lines = core.parseJson(v, "lines", []);
    const baseTotal = lines.reduce((a, l) => a + r0(l.base), 0);
    let whtLeft = whtTotal;
    lines.forEach((l, i) => {
      const inv = load(dao, "supplier_invoices", l.invoice, "Invoice");
      const share = i === lines.length - 1 ? whtLeft : baseTotal ? r0((whtTotal * r0(l.base)) / baseTotal) : 0;
      whtLeft -= share;
      payments.push(finance.recordPayment(dao, inv, actor, { amount: r0(l.amount), wht: share, method, reference, payment_date: when.toISOString(), notes: `${number} · ${v.getString("description")}`.slice(0, 300), voucher: v, meta }));
    });
  } else {
    const p = new Record(dao.findCollectionByNameOrId("payments"));
    p.set("number", core.nextNumber(dao, "payment"));
    p.set("voucher", v.id);
    p.set("supplier", v.getString("supplier"));
    p.set("amount", v.getInt("gross_amount"));
    p.set("wht_amount", whtTotal);
    p.set("net_amount", v.getInt("net_amount"));
    p.set("currency", "RWF");
    p.set("payment_date", when.toISOString());
    p.set("method", method);
    p.set("reference", reference);
    p.set("notes", `${number} · ${v.getString("payee_name")}`);
    p.set("paid_by", actor.id);
    dao.saveRecord(p);
    payments.push(p);
  }
  v.set("status", "paid");
  v.set("paid_by", actor.id);
  v.set("paid_at", new Date().toISOString());
  v.set("payment_date", when.toISOString());
  v.set("payment_method", method);
  v.set("payment_reference", reference);
  for (const p of payments) {
    p.set("bank_account", account.id);
    dao.saveRecord(p);
  }
  const entry = treasury.recordVoucherPayment(dao, v, account, { date: payDay, method, reference, actor });
  v.set("paid_from", account.id);
  v.set("cash_entry", entry ? entry.id : "");
  dao.saveRecord(v);
  require("./glpost.js").voucherPaid(dao, v, account, entry, actor, meta);
  core.audit(dao, {
    actor, action: "payment_executed", collection: "payment_vouchers", recordId: v.id, label: number, meta,
    comment: `${method.replace(/_/g, " ")} ${reference} from ${account.getString("code")} · net ${fmt(v.getInt("net_amount"))}${whtTotal ? ` · withholding tax ${fmt(whtTotal)}` : ""}`,
    changes: { status: { old: "approved", new: "paid" } },
  });
  core.notify(dao, [v.getString("prepared_by")].filter((x) => x && x !== actor.id), {
    title: `${number} paid`, body: `${v.getString("payee_name")} · ${fmt(v.getInt("net_amount"))} (${method.replace(/_/g, " ")} ${reference})`,
    link: `/dashboard/finance/vouchers/${v.id}`, type: "success",
  });
  return { voucher: v, payments };
}

function cancel(dao, id, actor, reason, meta) {
  const v = load(dao, "payment_vouchers", id, "Payment voucher");
  if (!core.can(dao, actor, "manage_payment_vouchers") && !core.can(dao, actor, "approve_payment_vouchers")) {
    throw new ForbiddenError('You don\'t have permission to cancel payment vouchers.');
  }
  if (OPEN.indexOf(v.getString("status")) === -1) throw new BadRequestError(`${v.getString("number")} is ${v.getString("status").replace(/_/g, " ")} and cannot be cancelled.`);
  if (!String(reason || "").trim()) throw new BadRequestError("Give a reason for cancelling.");
  if (v.getInt("actual_amount") > 0) {
    const budget = require("./budget.js");
    const line = load(dao, "budget_lines", v.getString("budget_line"), "Budget line");
    budget.post(dao, { line, type: "actual_reversal", amount: v.getInt("actual_amount"), source: { type: "payment_voucher", id: v.id, number: v.getString("number") }, description: `Cancelled ${v.getString("number")}`, actor });
    v.set("actual_amount", 0);
  }
  require("./approvals.js").cancel(dao, "payment_voucher", v, actor, String(reason).trim(), meta);
  return v;
}

// ------------------------------------------------------------------ reports
const BUCKETS = [["not_due", "Not yet due"], ["d30", "1–30 days"], ["d60", "31–60 days"], ["d90", "61–90 days"], ["d90p", "Over 90 days"]];

function names(dao, col) {
  const out = {};
  for (const r of dao.findRecordsByFilter(col, "id != ''", "", 20000, 0) || []) out[r.id] = r.getString("name");
  return out;
}
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

function between(f, value) {
  const d = day(value);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
}

const REPORTS = {
  ageing: {
    title: "Supplier ageing (unpaid approved invoices)",
    run: (dao, f, n) => {
      const asOf = f.to || new Date().toISOString().slice(0, 10);
      const by = {};
      for (const inv of dao.findRecordsByFilter("supplier_invoices", "status = 'approved' || status = 'partially_paid'", "", 20000, 0) || []) {
        if (f.supplier && inv.getString("supplier") !== f.supplier) continue;
        if (f.department && inv.getString("department") !== f.department) continue;
        const balance = r0(inv.getFloat("balance"));
        if (balance <= 0) continue;
        const late = Math.floor((new Date(`${asOf}T12:00:00Z`).getTime() - new Date(`${day(inv.getString("due_date")) || asOf}T12:00:00Z`).getTime()) / 864e5);
        const key = late <= 0 ? "not_due" : late <= 30 ? "d30" : late <= 60 ? "d60" : late <= 90 ? "d90" : "d90p";
        const sid = inv.getString("supplier");
        const r = (by[sid] = by[sid] || { supplier: n.sup[sid] || "—", invoices: 0, not_due: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0, link: `/dashboard/procurement/suppliers/${sid}` });
        r.invoices++;
        r[key] += balance;
        r.total += balance;
      }
      const rows = Object.values(by).sort((a, b) => b.total - a.total);
      const totals = { invoices: sum(rows, "invoices"), total: sum(rows, "total") };
      for (const [k] of BUCKETS) totals[k] = sum(rows, k);
      return { columns: [["supplier", "Supplier"], ["invoices", "Invoices", "number"], ...BUCKETS.map(([k, l]) => [k, l, "money"]), ["total", "Total due", "money"]], rows, totals, note: `Days past the due date, as of ${asOf}.` };
    },
  },
  outstanding: {
    title: "Outstanding liabilities",
    run: (dao, f, n) => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = [];
      for (const inv of dao.findRecordsByFilter("supplier_invoices", "status = 'approved' || status = 'partially_paid'", "due_date", 20000, 0) || []) {
        if (f.supplier && inv.getString("supplier") !== f.supplier) continue;
        if (f.department && inv.getString("department") !== f.department) continue;
        const balance = r0(inv.getFloat("balance"));
        if (balance <= 0) continue;
        const due = day(inv.getString("due_date"));
        rows.push({
          number: inv.getString("number"), reference: inv.getString("supplier_invoice_number"), supplier: n.sup[inv.getString("supplier")] || "—", invoice_date: day(inv.getString("invoice_date")), due_date: due,
          days_overdue: due && due < today ? Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${due}T12:00:00Z`).getTime()) / 864e5) : 0,
          total: r0(inv.getFloat("total")), paid: r0(inv.getFloat("paid_amount")), balance, on_vouchers: heldBy(dao, inv.id, ""), status: inv.getString("status"), link: `/dashboard/finance/invoices/${inv.id}`,
        });
      }
      return { columns: [["number", "Invoice"], ["reference", "Supplier ref."], ["supplier", "Supplier"], ["invoice_date", "Invoice date", "date"], ["due_date", "Due", "date"], ["days_overdue", "Days overdue", "number"], ["total", "Total", "money"], ["paid", "Paid", "money"], ["balance", "Balance", "money"], ["on_vouchers", "On open vouchers", "money"], ["status", "Status", "status"]], rows, totals: { total: sum(rows, "total"), paid: sum(rows, "paid"), balance: sum(rows, "balance"), on_vouchers: sum(rows, "on_vouchers") } };
    },
  },
  payment_register: {
    title: "Payment register",
    run: (dao, f, n) => {
      const vouchers = {};
      for (const v of dao.findRecordsByFilter("payment_vouchers", "status = 'paid'", "", 20000, 0) || []) vouchers[v.id] = v;
      const invs = {};
      const rows = [];
      for (const p of dao.findRecordsByFilter("payments", "id != ''", "-payment_date", 20000, 0) || []) {
        if (!between(f, p.getString("payment_date"))) continue;
        if (f.supplier && p.getString("supplier") !== f.supplier) continue;
        const v = vouchers[p.getString("voucher")];
        if (f.department && (!v || v.getString("department") !== f.department)) continue;
        if (p.getString("invoice") && !invs[p.getString("invoice")]) {
          try {
            invs[p.getString("invoice")] = dao.findRecordById("supplier_invoices", p.getString("invoice")).getString("number");
          } catch (_) {}
        }
        const amount = r0(p.getFloat("amount"));
        const wht = r0(p.getFloat("wht_amount"));
        rows.push({
          number: p.getString("number"), date: day(p.getString("payment_date")), voucher: v ? v.getString("number") : "—", payee: v ? v.getString("payee_name") : n.sup[p.getString("supplier")] || "—",
          invoice: invs[p.getString("invoice")] || "", method: p.getString("method").replace(/_/g, " "), reference: p.getString("reference"),
          gross: amount, wht, net: p.getString("voucher") ? r0(p.getFloat("net_amount")) : amount - wht, paid_by: n.users[p.getString("paid_by")] || "",
          link: v ? `/dashboard/finance/vouchers/${v.id}` : p.getString("invoice") ? `/dashboard/finance/invoices/${p.getString("invoice")}` : "",
        });
      }
      return { columns: [["number", "Payment"], ["date", "Date", "date"], ["voucher", "Voucher"], ["payee", "Payee"], ["invoice", "Invoice"], ["method", "Method"], ["reference", "Reference"], ["gross", "Gross", "money"], ["wht", "Tax withheld", "money"], ["net", "Net paid", "money"], ["paid_by", "Paid by"]], rows, totals: { gross: sum(rows, "gross"), wht: sum(rows, "wht"), net: sum(rows, "net") } };
    },
  },
  payment_summary: {
    title: "Payment summary by payee",
    run: (dao, f) => {
      const by = {};
      for (const v of dao.findRecordsByFilter("payment_vouchers", "status = 'paid'", "", 20000, 0) || []) {
        if (!between(f, v.getString("payment_date"))) continue;
        if (f.supplier && v.getString("supplier") !== f.supplier) continue;
        if (f.department && v.getString("department") !== f.department) continue;
        const k = v.getString("supplier") || `payee:${v.getString("payee_name")}`;
        const r = (by[k] = by[k] || { payee: v.getString("payee_name"), vouchers: 0, gross: 0, wht: 0, net: 0 });
        r.vouchers++;
        r.gross += v.getInt("gross_amount");
        r.wht += v.getInt("wht_amount");
        r.net += v.getInt("net_amount");
      }
      const rows = Object.values(by).sort((a, b) => b.gross - a.gross);
      return { columns: [["payee", "Payee"], ["vouchers", "Vouchers", "number"], ["gross", "Gross", "money"], ["wht", "Tax withheld", "money"], ["net", "Net paid", "money"]], rows, totals: { vouchers: sum(rows, "vouchers"), gross: sum(rows, "gross"), wht: sum(rows, "wht"), net: sum(rows, "net") } };
    },
  },
  wht_schedule: {
    title: "Withholding tax schedule",
    run: (dao, f) => {
      const tins = {};
      for (const s of dao.findRecordsByFilter("suppliers", "id != ''", "", 20000, 0) || []) tins[s.id] = s.getString("tin");
      const rows = [];
      for (const v of dao.findRecordsByFilter("payment_vouchers", "status = 'paid' && wht_amount > 0", "payment_date", 20000, 0) || []) {
        if (!between(f, v.getString("payment_date"))) continue;
        if (f.supplier && v.getString("supplier") !== f.supplier) continue;
        rows.push({
          date: day(v.getString("payment_date")), voucher: v.getString("number"), payee: v.getString("payee_name"), tin: tins[v.getString("supplier")] || "", code: v.getString("wht_code"),
          rate: v.getFloat("wht_rate"), base: v.getInt("wht_base"), wht: v.getInt("wht_amount"), link: `/dashboard/finance/vouchers/${v.id}`,
        });
      }
      return { columns: [["date", "Paid on", "date"], ["voucher", "Voucher"], ["payee", "Supplier"], ["tin", "TIN"], ["code", "Tax code"], ["rate", "Rate %", "number"], ["base", "Taxable amount", "money"], ["wht", "Tax withheld", "money"]], rows, totals: { base: sum(rows, "base"), wht: sum(rows, "wht") }, note: "Tax withheld on supplier payments in the period, for the declaration to RRA." };
    },
  },
};

function report(dao, actor, key, f) {
  if (actor && !canView(dao, actor) && !core.can(dao, actor, "view_invoices")) throw new ForbiddenError('You don\'t have permission to view payables reports.');
  const def = REPORTS[key];
  if (!def) throw new NotFoundError(`Unknown report "${key}".`);
  const n = { sup: names(dao, "suppliers"), users: names(dao, "users") };
  const out = def.run(dao, f, n);
  return { key, title: def.title, filters: f, generated_at: new Date().toISOString(), columns: out.columns.map(([k, label, type]) => ({ key: k, label, type: type || "text" })), rows: out.rows, totals: out.totals, note: out.note || "" };
}

module.exports = { beforeCreate, beforeUpdate, beforeDelete, guardRead, submit, onApproved, execute, cancel, payable, report, canView, REPORTS, statutoryAccounts, STATUTORY };
