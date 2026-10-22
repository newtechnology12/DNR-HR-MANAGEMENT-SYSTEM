/// <reference path="../../pb_data/types.d.ts" />
/**
 * Posting rules: how the operational documents reach the general ledger (no manual double entry).
 *  - supplier invoice approved: Dr the budget line's account (or assets received, not yet invoiced, for a capital
 *    item that the asset register capitalises) / Cr accounts payable; cancelled after approval: reversed
 *  - payment voucher paid: invoices — Dr accounts payable / Cr bank and withholding tax payable; direct expense —
 *    Dr the expense / Cr bank and withholding tax payable
 *  - receipt posted: Dr bank / Cr income (or receivable); transfer: Dr receiving account / Cr paying account;
 *    bank charges, interest and other lines recorded from a statement: against the chosen account
 *  - reversal of a receipt or transfer: its journal is reversed
 *  - opening balance of a bank or cash account: Dr bank / Cr accumulated surplus (opening journal)
 * Payroll and fixed assets post from their own modules. backfill() posts documents recorded before these rules.
 * Every document keeps the journal it posted, so nothing is posted twice.
 */
const core = require("./core.js");
const ledger = require("./ledger.js");

const r0 = (n) => Math.round(Number(n) || 0);
const day = (v) => String(v || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;
const todayStr = () => new Date().toISOString().slice(0, 10);

function find(dao, collection, id) {
  if (!id) return null;
  try {
    return dao.findRecordById(collection, String(id));
  } catch (_) {
    return null;
  }
}

/** Department, funding source and project of a budget line (else the given ones). */
function dims(dao, budgetLineId, base) {
  const line = find(dao, "budget_lines", budgetLineId);
  const b = base || {};
  return {
    department: (line && line.getString("department")) || b.department || "",
    funding_source: (line && line.getString("funding_source")) || b.funding_source || "",
    project: (line && line.getString("project")) || b.project || "",
    budget_line: line ? line.id : "",
  };
}

/** The date a document posts on: its own date when its period is open, else the first open day after it. */
function openDay(dao, d) {
  const when = day(d) || todayStr();
  const p = require("./masterdata.js").periodFor(dao, noon(when));
  if (p && p.getString("status") === "open") {
    const fy = find(dao, "fiscal_years", p.getString("fiscal_year"));
    if (!fy || fy.getString("status") === "open") return when;
  }
  const next = (dao.findRecordsByFilter("fiscal_periods", "status = 'open' && start_date >= {:d}", "start_date", 1, 0, { d: `${when} 00:00:00.000Z` }) || [])[0];
  return next ? day(next.getString("start_date")) : when;
}

/**
 * A fixed-asset cost account (non-current asset with a debit balance — not accumulated depreciation): purchases
 * charged to it are capitalised through the asset register, so the invoice goes to "assets received, not invoiced".
 */
function isAssetCost(dao, accountId) {
  const a = find(dao, "gl_accounts", accountId);
  if (!a) return false;
  return a.getString("type") === "asset" && a.getString("statement_section") === "non_current_assets" && a.getString("normal_balance") !== "credit";
}

// ------------------------------------------------------------------ payables
function invoiceAccount(dao, inv) {
  const line = find(dao, "budget_lines", inv.getString("budget_line"));
  let acc = line ? line.getString("gl_account") : "";
  if (!acc) {
    const po = find(dao, "purchase_orders", inv.getString("purchase_order"));
    const cat = po ? find(dao, "procurement_categories", po.getString("category")) : null;
    acc = cat ? cat.getString("expense_account") : "";
  }
  if (!acc) acc = inv.getString("expense_account");
  if (!acc) throw new BadRequestError(`${inv.getString("number")} cannot be posted: its budget line has no GL account.`);
  return acc;
}

/** Approved supplier invoice: the cost (or the asset received) against accounts payable. */
function invoice(dao, inv, actor, meta) {
  if (inv.getString("journal")) return null;
  const total = r0(inv.getFloat("total"));
  if (total <= 0) return null;
  const acc = invoiceAccount(dao, inv);
  const debit = isAssetCost(dao, acc) ? ledger.accountFor(dao, "assets.grni").id : acc;
  const d = dims(dao, inv.getString("budget_line"), { department: inv.getString("department"), funding_source: inv.getString("funding_source") });
  const supplier = find(dao, "suppliers", inv.getString("supplier"));
  const who = supplier ? supplier.getString("name") : "Supplier";
  const ref = inv.getString("supplier_invoice_number");
  const j = ledger.post(dao, {
    date: openDay(dao, inv.getString("invoice_date")), source: { type: "supplier_invoice", id: inv.id, number: inv.getString("number") },
    description: `${who} — invoice ${ref}`.slice(0, 500), actor, meta, what: `invoice ${inv.getString("number")}`,
    lines: [
      Object.assign({ account: debit, debit: total, description: `${who} ${ref}`.slice(0, 300) }, d),
      { account: ledger.accountFor(dao, "payables.ap").id, credit: total, department: d.department, funding_source: d.funding_source, description: `${who} ${ref}`.slice(0, 300) },
    ],
  });
  inv.set("journal", j.id);
  dao.saveRecord(inv);
  return j;
}

/** An approved invoice cancelled: its journal is reversed. */
function invoiceCancelled(dao, inv, actor, reason, meta) {
  const j = find(dao, "gl_journals", inv.getString("journal"));
  if (!j || j.getString("status") !== "posted") return null;
  return ledger.reverse(dao, j.id, actor, `Invoice ${inv.getString("number")} cancelled: ${reason || "no reason given"}`, openDay(dao, todayStr()), meta);
}

/** Paid voucher: what is paid (payable or expense) against the bank and the withholding tax kept for RRA. */
function voucherPaid(dao, v, account, entry, actor, meta) {
  if (v.getString("journal")) return null;
  const gross = v.getInt("gross_amount");
  const wht = v.getInt("wht_amount");
  const net = v.getInt("net_amount");
  if (gross <= 0) return null;
  const payee = v.getString("payee_name");
  const lines = [];
  if (v.getString("voucher_type") === "statutory") {
    // what was withheld or contributed is paid over: each liability is cleared
    for (const l of core.parseJson(v, "lines", []) || []) lines.push({ account: l.account, debit: r0(l.amount), description: `${payee} — ${l.name}${l.period ? ` ${l.period}` : ""}`.slice(0, 300) });
  } else if (v.getString("voucher_type") === "invoice") {
    const numbers = (core.parseJson(v, "lines", []) || []).map((l) => l.supplier_invoice_number || l.number).filter(Boolean).join(", ");
    lines.push({ account: ledger.accountFor(dao, "payables.ap").id, debit: gross, department: v.getString("department"), funding_source: v.getString("funding_source"), description: `${payee} — ${numbers}`.slice(0, 300) });
  } else {
    if (!v.getString("expense_account")) throw new BadRequestError(`${v.getString("number")} has no expense account.`);
    lines.push(Object.assign({ account: v.getString("expense_account"), debit: gross, description: `${payee} — ${v.getString("description")}`.slice(0, 300) }, dims(dao, v.getString("budget_line"), { department: v.getString("department"), funding_source: v.getString("funding_source") })));
  }
  if (net > 0) lines.push({ account: account.getString("gl_account"), credit: net, funding_source: account.getString("funding_source"), description: `${account.getString("code")} · ${String(v.getString("payment_method")).replace(/_/g, " ")} ${v.getString("payment_reference")}`.trim() });
  if (wht > 0) lines.push({ account: ledger.accountFor(dao, "payables.wht").id, credit: wht, description: `Withholding tax ${v.getString("wht_code")} — ${payee}`.slice(0, 300) });
  const j = ledger.post(dao, {
    date: openDay(dao, v.getString("payment_date")), source: { type: "payment_voucher", id: v.id, number: v.getString("number") },
    description: `Payment ${v.getString("number")} — ${payee}`.slice(0, 500), actor, meta, what: `the payment of ${v.getString("number")}`, lines,
  });
  v.set("journal", j.id);
  dao.saveRecord(v);
  if (entry) {
    entry.set("journal", j.id);
    dao.saveRecord(entry);
  }
  return j;
}

// ------------------------------------------------------------------ staff expenses
/**
 * A staff expense paid from a cash book: a claim debits its expense account (department, funding source and budget
 * line), a salary advance debits staff advances (recovered by the payroll); the cash account is credited. Advances
 * carry no name in the ledger — like salaries, they stay with the people who handle them.
 */
function staffExpense(dao, r, account, entry, actor, meta) {
  if (r.getString("journal")) return null;
  const amount = r0(r.getFloat("amount"));
  if (amount <= 0) return null;
  const advance = r.getString("kind") === "advance";
  const number = r.getString("number");
  const employee = find(dao, "users", r.getString("employee"));
  const category = find(dao, "expenses_categories", r.getString("expenseCategory"));
  const what = advance ? `Salary advance ${number}` : `${category ? category.getString("name") : "Staff expense"} — ${employee ? employee.getString("name") : number}`;
  const d = advance ? { department: r.getString("department") } : dims(dao, r.getString("budget_line"), { department: r.getString("department"), funding_source: r.getString("funding_source") });
  const j = ledger.post(dao, {
    date: openDay(dao, day(entry.getString("entry_date"))), source: { type: "staff_expense", id: r.id, number },
    description: (advance ? what : `${number} — ${what}`).slice(0, 500), actor, meta, what: `the payment of ${number}`,
    lines: [
      Object.assign({ account: r.getString("gl_account"), debit: amount, description: (advance ? what : `${what}: ${r.getString("description")}`).slice(0, 300) }, d),
      { account: account.getString("gl_account"), credit: amount, funding_source: account.getString("funding_source"), description: `${account.getString("code")} · ${String(r.getString("payment_method")).replace(/_/g, " ")} ${r.getString("payment_reference")}`.trim().slice(0, 300) },
    ],
  });
  r.set("journal", j.id);
  entry.set("journal", j.id);
  dao.saveRecord(entry);
  return j;
}

// ------------------------------------------------------------------ bank and cash
/**
 * One journal for the cash book entries of one document: the bank side of each entry against its counter-account
 * (for a transfer only the two bank sides). Entries keep the journal.
 */
function cashEntries(dao, entries, o) {
  const lines = [];
  for (const e of entries) {
    const a = find(dao, "bank_accounts", e.getString("account"));
    if (!a || !a.getString("gl_account")) throw new BadRequestError("The bank or cash account has no GL account.");
    const amount = e.getInt("amount");
    const inflow = e.getString("direction") === "in";
    const bank = { account: a.getString("gl_account"), funding_source: a.getString("funding_source"), description: (o.description || e.getString("description")).slice(0, 300) };
    lines.push(Object.assign(bank, inflow ? { debit: amount } : { credit: amount }));
    if (o.transfer) continue;
    if (!e.getString("gl_account")) throw new BadRequestError(`${o.source.number || "The entry"} has no account to post against.`);
    const d = dims(dao, e.getString("budget_line"), { funding_source: e.getString("funding_source") });
    lines.push(Object.assign({ account: e.getString("gl_account"), description: (e.getString("counterparty") ? `${e.getString("counterparty")} — ${e.getString("description")}` : e.getString("description")).slice(0, 300) }, d, inflow ? { credit: amount } : { debit: amount }));
  }
  const j = ledger.post(dao, {
    date: openDay(dao, entries[0].getString("entry_date")), source: o.source, description: String(o.description || entries[0].getString("description")).slice(0, 500),
    actor: o.actor, meta: o.meta, what: o.what || o.source.number, lines,
  });
  for (const e of entries) {
    e.set("journal", j.id);
    dao.saveRecord(e);
  }
  return j;
}

function receipt(dao, r, entry, actor) {
  if (!entry || entry.getString("journal")) return null;
  return cashEntries(dao, [entry], { source: { type: "cash_receipt", id: r.id, number: r.getString("number") }, description: `Receipt ${r.getString("number")} — ${r.getString("payer_name")}`, actor, what: `receipt ${r.getString("number")}` });
}

function transfer(dao, t, out, inn, actor) {
  if (!out || !inn || out.getString("journal")) return null;
  return cashEntries(dao, [out, inn], { source: { type: "bank_transfer", id: t.id, number: t.getString("number") }, description: `Transfer ${t.getString("number")} — ${t.getString("description")}`, actor, transfer: true, what: `transfer ${t.getString("number")}` });
}

function statementEntry(dao, entry, number, actor) {
  if (!entry || entry.getString("journal")) return null;
  return cashEntries(dao, [entry], { source: { type: "statement_line", id: entry.getString("source_id"), number }, description: entry.getString("description"), actor, what: "the bank line" });
}

/** Reversed cash book entries: each original journal is reversed once; the new entries keep the reversal. */
function reversal(dao, originals, reversals, actor, reason) {
  const done = {};
  originals.forEach((e, i) => {
    const jid = e.getString("journal");
    if (!jid) return;
    if (done[jid] === undefined) {
      const j = find(dao, "gl_journals", jid);
      if (j && j.getString("status") === "posted") done[jid] = ledger.reverse(dao, jid, actor, reason, openDay(dao, todayStr())).id;
      else done[jid] = j ? j.getString("reversed_by") : "";
    }
    const rev = reversals[i];
    if (rev && done[jid]) {
      rev.set("journal", done[jid]);
      dao.saveRecord(rev);
    }
  });
}

/** Opening balance of a bank or cash account at go-live. */
function bankOpening(dao, a, actor) {
  if (a.getString("opening_journal")) return null;
  const bal = a.getInt("opening_balance");
  if (!bal || !a.getString("gl_account")) return null;
  const equity = ledger.accountFor(dao, "treasury.opening_equity").id;
  const amount = Math.abs(bal);
  const bank = { account: a.getString("gl_account"), funding_source: a.getString("funding_source"), description: `Opening balance ${a.getString("code")}` };
  const other = { account: equity, funding_source: a.getString("funding_source"), description: `Opening balance ${a.getString("code")}` };
  const j = ledger.post(dao, {
    date: openDay(dao, a.getString("opening_date")), journalType: "opening", source: { type: "bank_opening", id: a.id, number: a.getString("code") },
    description: `Opening balance of ${a.getString("code")} ${a.getString("name")}`.slice(0, 500), actor, what: `the opening balance of ${a.getString("code")}`,
    lines: bal > 0 ? [Object.assign(bank, { debit: amount }), Object.assign(other, { credit: amount })] : [Object.assign(other, { debit: amount }), Object.assign(bank, { credit: amount })],
  });
  a.set("opening_journal", j.id);
  dao.saveRecord(a);
  return j;
}

/** The opening balance changed before the account was used: the old opening journal is reversed, a new one posted. */
function bankOpeningChanged(dao, a, actor) {
  const old = find(dao, "gl_journals", a.getString("opening_journal"));
  if (old && old.getString("status") === "posted") ledger.reverse(dao, old.id, actor, `Opening balance of ${a.getString("code")} corrected`, openDay(dao, todayStr()));
  a.set("opening_journal", "");
  return bankOpening(dao, a, actor);
}

// ------------------------------------------------------------------ backfill
/**
 * Posts what was recorded before the posting rules existed (or on a migrated database): bank opening balances,
 * approved invoices, paid vouchers and cash book entries without a journal. Safe to run again: posted documents
 * are skipped. Anything that cannot be posted (closed period, missing account) is listed with the reason.
 */
function backfill(dao, actor, meta) {
  const out = { bank_openings: 0, invoices: 0, vouchers: 0, cash_documents: 0, reversals: 0, linked: 0, problems: [] };
  const attempt = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      out.problems.push(`${label}: ${e && e.message ? e.message : e}`);
      return null;
    }
  };
  for (const a of dao.findRecordsByFilter("bank_accounts", "opening_journal = ''", "code", 0, 0) || []) {
    if (attempt(`Opening balance ${a.getString("code")}`, () => bankOpening(dao, a, actor))) out.bank_openings++;
  }
  for (const inv of dao.findRecordsByFilter("supplier_invoices", "journal = '' && (status = 'approved' || status = 'partially_paid' || status = 'paid')", "invoice_date", 0, 0) || []) {
    if (attempt(inv.getString("number"), () => invoice(dao, inv, actor, meta))) out.invoices++;
  }
  for (const v of dao.findRecordsByFilter("payment_vouchers", "journal = '' && status = 'paid'", "payment_date", 0, 0) || []) {
    const account = find(dao, "bank_accounts", v.getString("paid_from"));
    if (!account) {
      out.problems.push(`${v.getString("number")}: the account it was paid from is not recorded`);
      continue;
    }
    const entry = find(dao, "cash_book_entries", v.getString("cash_entry"));
    if (attempt(v.getString("number"), () => voucherPaid(dao, v, account, entry, actor, meta))) out.vouchers++;
  }
  // cash book entries of receipts, transfers, statement lines and payroll payments; reversals after their originals
  const entries = dao.findRecordsByFilter("cash_book_entries", "journal = ''", "entry_date,created", 0, 0) || [];
  const groups = {};
  const order = [];
  for (const e of entries) {
    if (e.getString("reversal_of")) continue;
    const k = `${e.getString("source_type")}|${e.getString("source_id")}|${e.getString("type") === "transfer_in" || e.getString("type") === "transfer_out" ? "t" : e.id}`;
    if (!groups[k]) {
      groups[k] = [];
      order.push(k);
    }
    groups[k].push(e);
  }
  for (const k of order) {
    const g = groups[k];
    const first = g[0];
    const type = first.getString("source_type");
    const number = first.getString("source_number");
    attempt(number || type, () => {
      if (type === "payment_voucher") {
        const v = find(dao, "payment_vouchers", first.getString("source_id"));
        if (v && v.getString("journal")) {
          first.set("journal", v.getString("journal"));
          dao.saveRecord(first);
          out.linked++;
        }
        return;
      }
      if (type === "payroll") {
        const p = find(dao, "payrolls", first.getString("source_id"));
        if (p && p.getString("payment_journal")) {
          first.set("journal", p.getString("payment_journal"));
          dao.saveRecord(first);
          out.linked++;
        }
        return;
      }
      if (type === "bank_transfer") {
        const t = find(dao, "bank_transfers", first.getString("source_id"));
        const outE = g.find((e) => e.getString("direction") === "out");
        const inE = g.find((e) => e.getString("direction") === "in");
        if (t && outE && inE && transfer(dao, t, outE, inE, actor)) out.cash_documents++;
        return;
      }
      if (type === "cash_receipt") {
        const r = find(dao, "cash_receipts", first.getString("source_id"));
        if (r && receipt(dao, r, first, actor)) out.cash_documents++;
        return;
      }
      if (type === "statement_line" && statementEntry(dao, first, number, actor)) out.cash_documents++;
    });
  }
  for (const rev of dao.findRecordsByFilter("cash_book_entries", "journal = '' && reversal_of != ''", "entry_date", 0, 0) || []) {
    const orig = find(dao, "cash_book_entries", rev.getString("reversal_of"));
    if (!orig || !orig.getString("journal")) continue;
    attempt(`Reversal of ${rev.getString("source_number")}`, () => {
      reversal(dao, [orig], [rev], actor, `Reversal of ${rev.getString("source_number")}`);
      out.reversals++;
    });
  }
  return out;
}

module.exports = { openDay, dims, invoice, invoiceCancelled, voucherPaid, staffExpense, receipt, transfer, statementEntry, reversal, bankOpening, bankOpeningChanged, backfill };
