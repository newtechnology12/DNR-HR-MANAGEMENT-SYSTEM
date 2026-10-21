/// <reference path="../../pb_data/types.d.ts" />
/**
 * Finance integration: budgets, three-way matching (PO ↔ goods receipts ↔ supplier invoice),
 * invoice exceptions, invoice approval and payments.
 *
 * Nothing mismatched is ever approved automatically: an invoice with a match exception must be
 * resolved by someone with "resolve_invoice_exceptions" (with a written reason) before approval.
 * Separation of duties on payment: whoever received the goods, or approved the invoice, cannot pay it.
 */
const core = require("./core.js");

const ACTIVE_INVOICE = ["received", "exception", "matched", "pending_approval", "approved", "returned", "partially_paid", "paid"];
const COMMITTING_PO = ["approved", "sent", "acknowledged", "partially_received", "fully_received", "partially_invoiced", "fully_invoiced"];

function toDate(v) {
  const d = new Date(String(v || "").trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}
function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

function settings(dao) {
  let s = null;
  try {
    s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0] || null;
  } catch (_) {}
  const priceTol = s && s.getFloat("invoice_price_tolerance_pct");
  const totalTol = s && s.getFloat("invoice_total_tolerance_pct");
  return {
    budgetControl: (s && s.getString("budget_control")) || "warn",
    priceTolerance: priceTol > 0 ? priceTol : 2,
    totalTolerance: totalTol > 0 ? totalTol : 0,
    qtyTolerance: (s && s.getFloat("invoice_qty_tolerance_pct")) || 0,
  };
}

// ------------------------------------------------------------------ budgets
function findBudget(dao, department, category, year) {
  if (!department) return null;
  const list = dao.findRecordsByFilter("budgets", 'status = "active" && fiscal_year = {:y} && department = {:d}', "", 50, 0, { y: year, d: department }) || [];
  return list.find((b) => category && b.getString("category") === category) || list.find((b) => !b.getString("category")) || null;
}

/** Live budget figures. Commitments = approved orders not yet invoiced; actuals = invoices (paid or not). */
function usage(dao, budget, excludePoId) {
  const dept = budget.getString("department");
  const cat = budget.getString("category");
  const year = budget.getInt("fiscal_year");
  const from = `${year}-01-01 00:00:00.000Z`;
  const to = `${year + 1}-01-01 00:00:00.000Z`;
  const pos = dao.findRecordsByFilter("purchase_orders", "department = {:d} && order_date >= {:f} && order_date < {:t}", "", 2000, 0, { d: dept, f: from, t: to }) || [];
  let committed = 0;
  for (const po of pos) {
    if (po.id === excludePoId || COMMITTING_PO.indexOf(po.getString("status")) === -1) continue;
    if (cat && po.getString("category") !== cat) continue;
    committed += Math.max(po.getFloat("grand_total") - po.getFloat("invoiced_value"), 0);
  }
  const invoices = dao.findRecordsByFilter("supplier_invoices", "department = {:d} && invoice_date >= {:f} && invoice_date < {:t}", "", 5000, 0, { d: dept, f: from, t: to }) || [];
  let invoiced = 0, paid = 0;
  for (const inv of invoices) {
    if (ACTIVE_INVOICE.indexOf(inv.getString("status")) === -1) continue;
    if (cat) {
      try {
        if (dao.findRecordById("purchase_orders", inv.getString("purchase_order")).getString("category") !== cat) continue;
      } catch (_) {
        continue;
      }
    }
    invoiced += inv.getFloat("total");
    paid += inv.getFloat("paid_amount");
  }
  const amount = budget.getFloat("amount");
  return {
    amount: core.money(amount),
    committed: core.money(committed),
    invoiced: core.money(invoiced),
    paid: core.money(paid),
    remaining: core.money(amount - committed - invoiced),
  };
}

/**
 * Budget check for a new commitment. Returns { ok, message } — with budget_control "block" an
 * over-budget commitment throws; with "warn" it is allowed and flagged.
 */
function checkBudget(dao, opts) {
  const s = settings(dao);
  if (s.budgetControl === "none") return { checked: false };
  const year = (toDate(opts.date) || new Date()).getFullYear();
  const budget = findBudget(dao, opts.department, opts.category, year);
  const deptName = (() => {
    try {
      return dao.findRecordById("departments", opts.department).getString("name");
    } catch (_) {
      return "this department";
    }
  })();
  if (!budget) {
    const message = `No ${year} budget is set up for ${deptName}.`;
    if (s.budgetControl === "block") throw new BadRequestError(`${message} Ask Finance to create one under Finance → Budgets before committing spend.`);
    return { checked: true, over: true, message };
  }
  const u = usage(dao, budget, opts.excludePoId);
  if (opts.amount > u.remaining) {
    const message = `${opts.label} (${core.formatMoney(opts.amount)}) exceeds the remaining ${year} budget of ${deptName}: ${core.formatMoney(u.remaining)} left of ${core.formatMoney(u.amount)}.`;
    if (s.budgetControl === "block") throw new BadRequestError(`${message} Budget control is set to block over-budget purchases.`);
    return { checked: true, over: true, message, budget: budget.id };
  }
  return { checked: true, over: false, remainingAfter: core.money(u.remaining - opts.amount), budget: budget.id };
}

function warnOverBudget(dao, actor, check, collection, recordId, label, meta) {
  if (!check || !check.over) return;
  core.audit(dao, { actor, action: "over_budget_warning", collection, recordId, label, comment: check.message, meta });
  const finance = (dao.findRecordsByFilter("users", 'status = "Active"', "", 1000, 0) || []).filter((u) => core.can(dao, u, "manage_budgets"));
  core.notify(dao, finance.map((u) => u.id), { title: `Over budget: ${label}`, body: check.message, link: "/dashboard/finance/budgets", type: "warning" });
}

// ------------------------------------------------------------------ invoices & three-way match
function otherInvoices(dao, poId, excludeId) {
  return (dao.findRecordsByFilter("supplier_invoices", "purchase_order = {:p}", "", 500, 0, { p: poId }) || []).filter(
    (i) => i.id !== excludeId && ACTIVE_INVOICE.indexOf(i.getString("status")) !== -1
  );
}

/** Normalise invoice lines against the PO, compute totals and run the three-way match. */
function computeAndMatch(dao, inv, po) {
  const tol = settings(dao);
  const poLines = core.parseJson(po, "items", []);
  const others = otherInvoices(dao, po.id, inv.id);
  const prevQty = {};
  let prevTotal = 0;
  for (const o of others) {
    prevTotal += o.getFloat("total");
    for (const l of core.parseJson(o, "items", [])) prevQty[l.line] = (prevQty[l.line] || 0) + (Number(l.quantity) || 0);
  }
  let subtotal = 0, taxTotal = 0;
  const lines = [];
  const issues = [];
  const warnings = [];
  for (const raw of core.parseJson(inv, "items", [])) {
    const qty = Number(raw.quantity) || 0;
    if (qty <= 0) continue;
    const poLine = poLines.find((l) => Number(l.line) === Number(raw.line));
    const price = Math.max(Number(raw.unit_price) || 0, 0);
    const taxRate = Math.min(Math.max(Number(raw.tax_rate) || 0, 0), 100);
    const net = core.money(qty * price);
    const tax = core.money((net * taxRate) / 100);
    subtotal += net;
    taxTotal += tax;
    const lineIssues = [];
    const check = { line: raw.line, description: poLine ? poLine.description : String(raw.description || ""), unit: poLine ? poLine.unit : "", quantity: qty, unit_price: price, tax_rate: taxRate, net, tax, total: core.money(net + tax) };
    if (!poLine) {
      lineIssues.push("This line is not on the purchase order");
    } else {
      const ordered = Number(poLine.quantity) || 0;
      const received = Number(poLine.received_qty) || 0;
      const invoicedSoFar = (prevQty[raw.line] || 0) + qty;
      const poUnit = ordered ? core.money(poLine.net / ordered) : 0;
      Object.assign(check, { ordered, received, invoiced_before: prevQty[raw.line] || 0, po_unit_price: poUnit, po_tax_rate: poLine.tax_rate });
      const qTol = (n) => n * (1 + tol.qtyTolerance / 100) + 1e-9;
      if (received <= 0) lineIssues.push(poLine.line_type === "service" ? "Service not yet confirmed as delivered" : "Missing goods receipt — nothing received on this line yet");
      else if (invoicedSoFar > qTol(received)) lineIssues.push(`Invoiced quantity ${invoicedSoFar} exceeds received quantity ${received}`);
      else if (invoicedSoFar > received) warnings.push(`Line ${raw.line}: invoiced ${invoicedSoFar}, received ${received} (within the ${tol.qtyTolerance}% quantity tolerance)`);
      if (invoicedSoFar > qTol(ordered)) lineIssues.push(`Invoiced quantity ${invoicedSoFar} exceeds ordered quantity ${ordered}`);
      if (poUnit > 0) {
        const diffPct = ((price - poUnit) / poUnit) * 100;
        if (Math.abs(diffPct) > tol.priceTolerance) lineIssues.push(`Unit price ${core.formatMoney(price)} differs from PO price ${core.formatMoney(poUnit)} (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)`);
        else if (Math.abs(diffPct) > 0.01) warnings.push(`Line ${raw.line}: price ${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}% vs PO (within the ${tol.priceTolerance}% tolerance)`);
      }
      if (Number(poLine.tax_rate) !== taxRate) lineIssues.push(`Tax rate ${taxRate}% differs from PO tax rate ${poLine.tax_rate}%`);
    }
    check.issues = lineIssues;
    lines.push(check);
    for (const i of lineIssues) issues.push(`Line ${raw.line}: ${i}`);
  }
  if (!lines.length) throw new BadRequestError("Enter an invoiced quantity for at least one line.");
  const total = core.money(subtotal + taxTotal);
  const poCap = core.money(po.getFloat("grand_total") * (1 + tol.totalTolerance / 100));
  if (prevTotal + total > poCap + 0.01) issues.push(`Invoices on ${po.getString("number")} would total ${core.formatMoney(prevTotal + total)}, above the order value of ${core.formatMoney(po.getFloat("grand_total"))}`);
  inv.set("items", lines);
  inv.set("subtotal", core.money(subtotal));
  inv.set("tax_total", core.money(taxTotal));
  inv.set("total", total);
  inv.set("balance", core.money(total - inv.getFloat("paid_amount")));
  inv.set("match_status", issues.length ? "exception" : warnings.length ? "partial" : "matched");
  inv.set("match_result", { issues, warnings, checked_at: new Date().toISOString(), price_tolerance_pct: tol.priceTolerance, qty_tolerance_pct: tol.qtyTolerance });
  inv.set("status", issues.length ? "exception" : "matched");
  return issues;
}

function syncPo(dao, poId) {
  const po = dao.findRecordById("purchase_orders", poId);
  const invs = otherInvoices(dao, poId, "");
  const invoiced = invs.reduce((a, i) => a + i.getFloat("total"), 0);
  const paid = invs.reduce((a, i) => a + i.getFloat("paid_amount"), 0);
  po.set("invoiced_value", core.money(invoiced));
  po.set("paid_value", core.money(paid));
  const fullyReceived = ["fully_received", "closed"].indexOf(po.getString("status")) !== -1;
  if (fullyReceived && invs.length && invs.every((i) => i.getString("status") === "paid") && paid >= po.getFloat("received_value") - 1) {
    po.set("status", "completed");
  }
  dao.saveRecord(po);
}

function invoiceBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_invoices", "record supplier invoices");
  const inv = e.record;
  const po0 = load(dao, "purchase_orders", inv.getString("purchase_order"), "Purchase order");
  try {
    const sup = dao.findRecordById("suppliers", po0.getString("supplier"));
    if (sup.getString("status") !== "active") throw new BadRequestError(`${sup.getString("name")} is ${sup.getString("status").replace(/_/g, " ")}; bills cannot be recorded for a supplier that is not active. Reactivate the supplier first (needs approval).`);
  } catch (err) {
    if (String(err).indexOf("bills cannot be recorded") !== -1) throw err;
  }
  const po = load(dao, "purchase_orders", inv.getString("purchase_order"), "Purchase order");
  if (["draft", "pending_approval", "returned", "rejected", "cancelled"].indexOf(po.getString("status")) !== -1) {
    throw new BadRequestError(`${po.getString("number")} is ${po.getString("status").replace(/_/g, " ")}; invoices can only be recorded against approved orders.`);
  }
  if (!inv.getString("supplier_invoice_number").trim()) throw new BadRequestError("Enter the supplier's invoice number.");
  for (const f of ["number", "status", "match_status", "match_result", "exception_overridden", "exception_resolution", "resolved_by", "resolved_at", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "paid_amount"]) inv.set(f, "");
  inv.set("supplier", po.getString("supplier"));
  inv.set("department", po.getString("department"));
  inv.set("currency", po.getString("currency") || "RWF");
  inv.set("paid_amount", 0);
  if (!inv.getString("invoice_date")) inv.set("invoice_date", new Date().toISOString());
  if (!inv.getString("due_date")) inv.set("due_date", new Date((toDate(inv.getString("invoice_date")) || new Date()).getTime() + 30 * 864e5).toISOString());
  if (auth) inv.set("recorded_by", auth.id);
  computeAndMatch(dao, inv, po);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "invoice");
  });
  inv.set("number", n);
}

function invoiceAfterCreate(e) {
  const dao = $app.dao();
  const inv = e.record;
  syncPo(dao, inv.getString("purchase_order"));
  const issues = core.parseJson(inv, "match_result", {}).issues || [];
  core.audit(dao, {
    actor: e.httpContext.get("authRecord"), action: "invoice_recorded", collection: "supplier_invoices", recordId: inv.id, label: inv.getString("number"),
    meta: core.requestMeta(e.httpContext), changes: { total: { old: null, new: inv.getFloat("total") }, match: { old: null, new: issues.length ? `${issues.length} exception(s)` : "matched" } },
  });
  if (issues.length) {
    const resolvers = (dao.findRecordsByFilter("users", 'status = "Active"', "", 1000, 0) || []).filter((u) => core.can(dao, u, "resolve_invoice_exceptions"));
    core.notify(dao, resolvers.map((u) => u.id), {
      title: `Invoice exception: ${inv.getString("number")}`, body: issues.slice(0, 2).join(" · "),
      link: `/dashboard/finance/invoices/${inv.id}`, type: "warning",
    });
  }
}

function invoiceBeforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_invoices", "edit supplier invoices");
  const inv = e.record;
  const before = inv.originalCopy();
  if (["received", "exception", "matched", "returned"].indexOf(before.getString("status")) === -1) {
    throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  }
  const editable = ["supplier_invoice_number", "invoice_date", "due_date", "items", "notes", "attachments"];
  for (const f of inv.collection().schema.fields().map((x) => x.name)) if (editable.indexOf(f) === -1) inv.set(f, before.get(f));
  computeAndMatch(dao, inv, load(dao, "purchase_orders", inv.getString("purchase_order"), "Purchase order"));
  inv.set("exception_overridden", false);
  inv.set("exception_resolution", "");
  const changes = core.diff(before, inv, ["supplier_invoice_number", "invoice_date", "due_date", "total", "match_status"]);
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function invoiceAfterUpdate(e) {
  const dao = $app.dao();
  syncPo(dao, e.record.getString("purchase_order"));
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (Object.keys(changes).length) {
    core.audit(dao, { actor: e.httpContext.get("authRecord"), action: "updated", collection: "supplier_invoices", recordId: e.record.id, label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext) });
  }
}

function invoiceAction(dao, id, actor, action, input, meta) {
  const inv = load(dao, "supplier_invoices", id, "Invoice");
  const number = inv.getString("number");
  const status = inv.getString("status");
  if (action === "resolve") {
    core.requirePermission(dao, actor, "resolve_invoice_exceptions", "resolve invoice exceptions");
    if (status !== "exception") throw new BadRequestError(`${number} has no open match exception.`);
    const reason = String(input.reason || "").trim();
    if (reason.length < 15) throw new BadRequestError("Explain how the exception was resolved (at least 15 characters), e.g. credit note agreed, price change approved by contract.");
    inv.set("exception_overridden", true);
    inv.set("exception_resolution", reason);
    inv.set("resolved_by", actor.id);
    inv.set("resolved_at", new Date().toISOString());
    inv.set("status", "matched");
    dao.saveRecord(inv);
    core.audit(dao, { actor, action: "exception_resolved", collection: "supplier_invoices", recordId: inv.id, label: number, comment: reason, meta, changes: { status: { old: "exception", new: "matched" }, issues: { old: null, new: (core.parseJson(inv, "match_result", {}).issues || []).join(" | ") } } });
    return inv;
  }
  if (action === "submit") {
    core.requirePermission(dao, actor, "manage_invoices", "submit invoices for approval");
    if (["matched", "returned"].indexOf(status) === -1) {
      throw new BadRequestError(status === "exception" ? `${number} has unresolved match exceptions. Resolve them (or correct the invoice) before approval.` : `${number} is ${status.replace(/_/g, " ")}.`);
    }
    if (inv.getString("match_status") === "exception" && !inv.getBool("exception_overridden")) throw new BadRequestError(`${number} has unresolved match exceptions.`);
    return require("./approvals.js").start(dao, "supplier_invoice", inv, actor, meta);
  }
  if (action === "cancel") {
    core.requirePermission(dao, actor, "manage_invoices", "cancel invoices");
    if (["partially_paid", "paid", "cancelled"].indexOf(status) !== -1) throw new BadRequestError(`${number} is ${status.replace(/_/g, " ")} and cannot be cancelled.`);
    const reason = String(input.reason || "").trim();
    if (!reason) throw new BadRequestError("Give a reason for cancelling the invoice.");
    require("./approvals.js").cancel(dao, "supplier_invoice", inv, actor, reason, meta);
    syncPo(dao, inv.getString("purchase_order"));
    return inv;
  }
  throw new NotFoundError(`Unknown invoice action "${action}".`);
}

function pay(dao, id, actor, input, meta) {
  core.requirePermission(dao, actor, "record_payments", "record payments");
  const inv = load(dao, "supplier_invoices", id, "Invoice");
  const number = inv.getString("number");
  if (["approved", "partially_paid"].indexOf(inv.getString("status")) === -1) throw new BadRequestError(`${number} must be approved before it can be paid (currently ${inv.getString("status").replace(/_/g, " ")}).`);
  const amount = core.money(Number(input.amount) || 0);
  const balance = inv.getFloat("balance");
  if (!(amount > 0)) throw new BadRequestError("Enter the amount paid.");
  if (amount > balance + 0.01) throw new BadRequestError(`The amount exceeds the outstanding balance of ${core.formatMoney(balance, inv.getString("currency"))}.`);
  const receivers = (dao.findRecordsByFilter("goods_receipts", "purchase_order = {:p}", "", 200, 0, { p: inv.getString("purchase_order") }) || []).map((g) => g.getString("received_by"));
  if (receivers.indexOf(actor.id) !== -1) throw new ForbiddenError("Separation of duties: you received goods on this order, so you cannot also record its payment.");
  let approvers = [];
  try {
    const approval = dao.findRecordById("approval_requests", inv.getString("approval"));
    approvers = (dao.findRecordsByFilter("approval_actions", 'approval = {:a} && action = "approve"', "", 50, 0, { a: approval.id }) || []).map((a) => a.getString("actor"));
  } catch (_) {}
  if (approvers.indexOf(actor.id) !== -1) throw new ForbiddenError("Separation of duties: you approved this invoice, so someone else must record the payment.");
  const method = String(input.method || "bank_transfer");
  if (["bank_transfer", "cheque", "mobile_money", "cash"].indexOf(method) === -1) throw new BadRequestError("Unknown payment method.");
  const p = new Record(dao.findCollectionByNameOrId("payments"));
  p.set("number", core.nextNumber(dao, "payment"));
  p.set("invoice", inv.id);
  p.set("supplier", inv.getString("supplier"));
  p.set("purchase_order", inv.getString("purchase_order"));
  p.set("amount", amount);
  p.set("currency", inv.getString("currency"));
  p.set("payment_date", (toDate(input.payment_date) || new Date()).toISOString());
  p.set("method", method);
  p.set("reference", String(input.reference || ""));
  p.set("notes", String(input.notes || ""));
  p.set("paid_by", actor.id);
  dao.saveRecord(p);
  const paid = core.money(inv.getFloat("paid_amount") + amount);
  const old = inv.getString("status");
  inv.set("paid_amount", paid);
  inv.set("balance", core.money(inv.getFloat("total") - paid));
  inv.set("status", inv.getFloat("balance") <= 0.01 ? "paid" : "partially_paid");
  dao.saveRecord(inv);
  syncPo(dao, inv.getString("purchase_order"));
  core.audit(dao, { actor, action: "payment_recorded", collection: "supplier_invoices", recordId: inv.id, label: number, meta, comment: `${p.getString("number")} · ${method.replace(/_/g, " ")} ${p.getString("reference")}`, changes: { status: { old, new: inv.getString("status") }, paid: { old: null, new: amount } } });
  core.notify(dao, [inv.getString("recorded_by")].filter((x) => x !== actor.id), { title: `${number} ${inv.getString("status") === "paid" ? "paid in full" : "partially paid"}`, body: core.formatMoney(amount, inv.getString("currency")), link: `/dashboard/finance/invoices/${inv.id}`, type: "success" });
  return p;
}

function budgetGuard(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  core.requirePermission($app.dao(), auth, "manage_budgets", "manage budgets");
  if (e.record.isNew && e.record.isNew()) e.record.set("created_by", auth.id);
  if (!e.record.getString("status")) e.record.set("status", "active");
  if (!(e.record.getFloat("amount") > 0)) throw new BadRequestError("The budget amount must be greater than zero.");
  if (!e.record.getString("department")) throw new BadRequestError("Choose the department this budget belongs to.");
  const y = e.record.getInt("fiscal_year");
  if (!(y >= 2000 && y <= 2100)) throw new BadRequestError("Enter a valid fiscal year, e.g. 2026.");
}

module.exports = { settings, findBudget, usage, checkBudget, warnOverBudget, invoiceBeforeCreate, invoiceAfterCreate, invoiceBeforeUpdate, invoiceAfterUpdate, invoiceAction, pay, budgetGuard, syncPo };
