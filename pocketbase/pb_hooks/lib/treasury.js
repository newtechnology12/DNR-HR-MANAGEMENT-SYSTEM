/// <reference path="../../pb_data/types.d.ts" />
/**
 * Bank and cash management (IMS M5).
 *
 * Accounts and cash books (bank_accounts) start from an opening balance at go-live; every movement after that
 * is a cash book entry written here: receipts and transfers once the DAF approves them, voucher payments when
 * the Cashier executes them (vouchers.js), bank charges and interest recorded from the statement. Entries are
 * never edited — a mistake is reversed with an opposite entry.
 *
 * Bank statements are imported from the bank's Excel / CSV file and matched to the cash book: automatically
 * (same amount and direction within N days, the reference first) or by hand (any lines against any entries
 * with equal totals). A reconciliation as of a statement date lists what is in the cash book but not yet on
 * the statement (outstanding receipts and payments) and what is on the statement but not in the cash book;
 * the difference must be nil. The Accountant prepares it, the DAF approves it (preparer ≠ approver), and its
 * matches are then locked. Nothing can be dated on or before the last approved reconciliation of an account.
 *
 * A cash book (kind "cash") is reconciled by counting the cash: counted = cash book balance.
 */
const core = require("./core.js");
const masterdata = require("./masterdata.js");

const VIEWERS = [
  "view_treasury", "manage_treasury", "manage_bank_accounts", "approve_treasury", "record_payments",
  "prepare_bank_reconciliation", "approve_bank_reconciliation", "export_treasury", "view_audit_logs",
];
const EDITABLE = ["draft", "returned"];
const OPEN_DOC = ["draft", "pending_approval", "returned"];
const FOLLOW_UP = ["timing", "investigate", "record", "correct", "resolved"];
const FOLLOW_UP_LABEL = { timing: "timing difference", investigate: "to investigate", record: "to record", correct: "error to correct", resolved: "resolved" };
const RECEIPT_METHODS = ["bank_transfer", "cheque", "mobile_money", "cash", "direct_deposit"];
const PAYER_TYPES = ["member", "government", "donor", "client", "staff", "other"];
const TRANSFER_METHODS = { "bank>bank": ["bank_transfer", "cheque"], "bank>cash": ["cash_withdrawal", "cheque"], "cash>bank": ["cash_deposit"] };
const METHOD_LABEL = {
  bank_transfer: "bank transfer", cheque: "cheque", mobile_money: "mobile money", cash: "cash", direct_deposit: "direct deposit",
  direct_debit: "direct debit", cash_withdrawal: "cash withdrawal", cash_deposit: "cash deposit", other: "other",
};
const TYPE_LABEL = { receipt: "Receipt", payment: "Payment", transfer_in: "Transfer in", transfer_out: "Transfer out", bank_charge: "Bank charge", interest: "Interest", other: "Other" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const r0 = (n) => Math.round(Number(n) || 0);
const fmt = (n) => core.formatMoney(n, "RWF");
const day = (s) => String(s || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;
const startOf = (d) => `${d} 00:00:00.000Z`;
const endOf = (d) => `${d} 23:59:59.999Z`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const signed = (direction, amount) => (direction === "in" ? amount : -amount);
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const pad = (n) => String(n).padStart(2, "0");

function showDay(d) {
  const x = new Date(`${day(d)}T12:00:00Z`);
  return isNaN(x.getTime()) ? String(d || "") : `${pad(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

/** "2026-10-21", "2026-10-21 12:00:00.000Z" or anything Date understands → "2026-10-21" ("" when not a date). */
function toDay(v) {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return isNaN(Date.parse(`${s.slice(0, 10)}T12:00:00Z`)) ? "" : s.slice(0, 10);
  const d = masterdata.toDate(s);
  return d ? d.toISOString().slice(0, 10) : "";
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
  const n = (k, d) => (s && s.getInt(k) > 0 ? s.getInt(k) : d);
  return { matchDays: n("bank_match_days", 7), staleDays: n("stale_cheque_days", 180) };
}

function scalar(dao, sql, params) {
  const m = new DynamicModel({ n: 0 });
  dao.db().newQuery(sql).bind(params || {}).one(m);
  return r0(m.n);
}

function canView(dao, auth) {
  return !auth || VIEWERS.some((p) => core.can(dao, auth, p));
}

function requireView(dao, auth) {
  if (!canView(dao, auth)) throw new ForbiddenError('You don\'t have permission to see bank and cash records. Ask for "view_treasury".');
}

/** list / view of every treasury collection. */
function guardRead(e) {
  requireView($app.dao(), e.httpContext.get("authRecord"));
}

const accountLabel = (a) => `${a.getString("code")} ${a.getString("name")}`;

function activeAccount(dao, id, what) {
  if (!id) throw new BadRequestError(`Choose ${what}.`);
  const a = load(dao, "bank_accounts", id, "Account");
  if (a.getString("status") !== "active") throw new BadRequestError(`${accountLabel(a)} is closed.`);
  return a;
}

function nameOf(dao, collection, id, field) {
  if (!id) return "";
  try {
    return dao.findRecordById(collection, id).getString(field || "name");
  } catch (_) {
    return "";
  }
}

// ------------------------------------------------------------------ balances
/** Money in and out of an account, up to and including a day ("" = everything). */
function movementSums(dao, accountId, toDay) {
  const rows = arrayOf(new DynamicModel({ d: "", s: 0 }));
  const where = toDay ? "account = {:a} AND entry_date <= {:t}" : "account = {:a}";
  dao.db().newQuery(`SELECT direction AS d, COALESCE(SUM(amount), 0) AS s FROM cash_book_entries WHERE ${where} GROUP BY direction`).bind(toDay ? { a: accountId, t: endOf(toDay) } : { a: accountId }).all(rows);
  const out = { in: 0, out: 0 };
  for (const x of rows) out[x.d] = r0(x.s);
  return out;
}

function bookBalance(dao, account, asOf) {
  const s = movementSums(dao, account.id, asOf || "");
  return account.getInt("opening_balance") + s.in - s.out;
}

function lastApproved(dao, accountId) {
  return (dao.findRecordsByFilter("bank_reconciliations", "account = {:a} && status = 'approved'", "-as_of", 1, 0, { a: accountId }) || [])[0] || null;
}

function pendingRec(dao, accountId) {
  return (dao.findRecordsByFilter("bank_reconciliations", "account = {:a} && status = 'pending_approval'", "-as_of", 1, 0, { a: accountId }) || [])[0] || null;
}

/** Recomputes the balance and status fields shown on the account (never incremental, so they cannot drift). */
function refreshAccount(dao, accountId) {
  const a = load(dao, "bank_accounts", accountId, "Account");
  const s = movementSums(dao, a.id, "");
  a.set("book_balance", a.getInt("opening_balance") + s.in - s.out);
  const last = dao.findRecordsByFilter("cash_book_entries", "account = {:a}", "-entry_date", 1, 0, { a: a.id }) || [];
  a.set("last_entry_date", last.length ? last[0].getString("entry_date") : "");
  const st = dao.findRecordsByFilter("bank_statements", "account = {:a}", "-statement_to", 1, 0, { a: a.id }) || [];
  a.set("statement_balance", st.length ? st[0].getInt("closing_balance") : 0);
  a.set("statement_date", st.length ? st[0].getString("statement_to") : "");
  const rec = lastApproved(dao, a.id);
  a.set("reconciled_to", rec ? rec.getString("as_of") : "");
  a.set("reconciled_balance", rec ? rec.getInt("statement_balance") : 0);
  const cash = a.getString("kind") === "cash";
  a.set("unmatched_book", scalar(dao, `SELECT COUNT(*) AS n FROM cash_book_entries WHERE account = {:a} AND ${cash ? "reconciliation = ''" : "match_group = ''"}`, { a: a.id }));
  a.set("unmatched_bank", cash ? 0 : scalar(dao, "SELECT COUNT(*) AS n FROM bank_statement_lines WHERE account = {:a} AND match_group = ''", { a: a.id }));
  dao.saveRecord(a);
  for (const x of dao.findRecordsByFilter("bank_statements", "account = {:a} && status = 'imported'", "", 500, 0, { a: a.id }) || []) {
    const n = scalar(dao, "SELECT COUNT(*) AS n FROM bank_statement_lines WHERE statement = {:s} AND match_group != ''", { s: x.id });
    if (n !== x.getInt("matched_count")) {
      x.set("matched_count", n);
      dao.saveRecord(x);
    }
  }
  return a;
}

/** Throws unless `d` may still receive movements on the account (after go-live, after the last approved reconciliation, open period, not future). */
function assertDateOpen(dao, account, d, what) {
  if (!d) throw new BadRequestError(`Enter the date of ${what}.`);
  if (d > todayStr()) throw new BadRequestError(`The date of ${what} cannot be in the future.`);
  const od = day(account.getString("opening_date"));
  if (od && d < od) throw new BadRequestError(`${accountLabel(account)} starts on ${showDay(od)} (its opening balance); ${what} cannot be dated before that.`);
  const rec = lastApproved(dao, account.id);
  if (rec && d <= day(rec.getString("as_of"))) {
    throw new BadRequestError(`${accountLabel(account)} is reconciled up to ${showDay(rec.getString("as_of"))} (${rec.getString("number")}); date ${what} after that.`);
  }
  masterdata.requireOpenPeriod(dao, noon(d), what);
}

/** Money must be there: the balance on the day and today must both cover the amount. */
function assertFunds(dao, account, amount, d, what) {
  const atDate = bookBalance(dao, account, d);
  const now = bookBalance(dao, account, "");
  const available = Math.min(atDate, now);
  if (amount > available) {
    throw new BadRequestError(
      `Not enough money in ${accountLabel(account)} for ${what}: the cash book balance is ${fmt(available)}${atDate !== now ? ` (${fmt(atDate)} on ${showDay(d)}, ${fmt(now)} today)` : ""} and ${fmt(amount)} is needed.`
    );
  }
}

/** Writes one cash book entry and refreshes the account. */
function postEntry(dao, o) {
  const a = o.account;
  const amount = r0(o.amount);
  if (amount <= 0) throw new BadRequestError("Cash book amounts must be positive.");
  if (a.getString("status") !== "active" && !o.reversalOf) throw new BadRequestError(`${accountLabel(a)} is closed.`);
  const e = new Record(dao.findCollectionByNameOrId("cash_book_entries"));
  e.set("account", a.id);
  e.set("entry_date", noon(o.date));
  e.set("direction", o.direction);
  e.set("amount", amount);
  e.set("type", o.type);
  e.set("method", o.method || "other");
  e.set("reference", String(o.reference || "").slice(0, 120));
  e.set("counterparty", String(o.counterparty || "").slice(0, 200));
  e.set("description", String(o.description || "").slice(0, 300));
  e.set("source_type", o.source.type);
  e.set("source_id", o.source.id);
  e.set("source_number", o.source.number || "");
  e.set("gl_account", o.gl_account || "");
  e.set("funding_source", o.funding_source || "");
  e.set("budget_line", o.budget_line || "");
  e.set("reversal_of", o.reversalOf || "");
  e.set("created_by", o.actor ? o.actor.id : "");
  dao.saveRecord(e);
  refreshAccount(dao, a.id);
  return e;
}

/** Validates a GL account used opposite the cash (income, expense, receivable…): posting, active, not a cash account. */
function contraAccount(dao, id, what, types) {
  if (!id) throw new BadRequestError(`Choose ${what}.`);
  const gl = load(dao, "gl_accounts", id, "GL account");
  const label = `${gl.getString("code")} ${gl.getString("name")}`;
  if (!gl.getBool("is_posting") || !gl.getBool("active")) throw new BadRequestError(`${label} is not an active posting account.`);
  if (gl.getString("cash_flow_class") === "cash") throw new BadRequestError(`${label} is a bank or cash account; use a transfer to move money between accounts.`);
  if (types && types.indexOf(gl.getString("type")) === -1) throw new BadRequestError(`${label} cannot be used here.`);
  return gl;
}

// ------------------------------------------------------------------ accounts
const ACCOUNT_SYSTEM = ["book_balance", "last_entry_date", "statement_balance", "statement_date", "reconciled_to", "reconciled_balance", "unmatched_book", "unmatched_bank", "created_by", "opening_journal"];
const LOCKED_LABEL = { kind: "type", gl_account: "GL account", opening_balance: "opening balance", opening_date: "opening date", currency: "currency" };

function hasMovements(dao, accountId) {
  return scalar(dao, "SELECT COUNT(*) AS n FROM cash_book_entries WHERE account = {:a}", { a: accountId }) + scalar(dao, "SELECT COUNT(*) AS n FROM bank_statement_lines WHERE account = {:a}", { a: accountId }) > 0;
}

function validateAccount(e, isNew) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_bank_accounts", "set up bank and cash accounts");
  const r = e.record;
  const before = isNew ? null : r.originalCopy();
  const code = String(r.getString("code") || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)) throw new BadRequestError("The code is 2–20 letters, digits or dashes, e.g. BK-OPS.");
  r.set("code", code);
  r.set("name", String(r.getString("name") || "").trim());
  if (r.getString("name").length < 3) throw new BadRequestError("Enter the account name.");
  const kind = r.getString("kind") || "bank";
  if (["bank", "cash"].indexOf(kind) === -1) throw new BadRequestError("Choose bank account or cash book.");
  r.set("kind", kind);
  const currency = String(r.getString("currency") || "RWF").trim().toUpperCase();
  if (currency !== "RWF") throw new BadRequestError("Only Rwandan franc (RWF) accounts are supported.");
  r.set("currency", currency);
  for (const f of ["bank_name", "branch", "account_number", "account_name", "swift_code", "signatories", "notes"]) r.set(f, String(r.getString(f) || "").trim());
  if (kind === "bank") {
    if (!r.getString("bank_name")) throw new BadRequestError("Enter the bank.");
    if (!/^[0-9][0-9 -]{4,33}$/.test(r.getString("account_number"))) throw new BadRequestError("Enter the account number (digits, spaces or dashes).");
    r.set("custodian", "");
    r.set("cash_limit", 0);
  } else {
    if (!r.getString("custodian")) throw new BadRequestError("Choose who holds the cash (the custodian).");
    load(dao, "users", r.getString("custodian"), "Custodian");
    if (r.getInt("cash_limit") < 0) throw new BadRequestError("The cash limit cannot be negative.");
    for (const f of ["bank_name", "branch", "account_number", "account_name", "swift_code"]) r.set(f, "");
  }
  if (!r.getString("gl_account")) throw new BadRequestError("Choose the cash account in the chart of accounts.");
  const gl = load(dao, "gl_accounts", r.getString("gl_account"), "GL account");
  if (!gl.getBool("is_posting") || !gl.getBool("active") || gl.getString("type") !== "asset" || gl.getString("cash_flow_class") !== "cash") {
    throw new BadRequestError(`${gl.getString("code")} ${gl.getString("name")} is not an active posting cash account (an asset with cash flow class "cash").`);
  }
  const clash = dao.findRecordsByFilter("bank_accounts", "gl_account = {:g} && id != {:id}", "", 1, 0, { g: gl.id, id: r.id || "" }) || [];
  if (clash.length) throw new BadRequestError(`GL ${gl.getString("code")} is already the cash account of ${clash[0].getString("code")}; each bank account or cash book has its own GL account.`);
  if (r.getString("funding_source")) load(dao, "funding_sources", r.getString("funding_source"), "Funding source");
  const od = toDay(r.getString("opening_date"));
  if (!od) throw new BadRequestError("Enter the opening date (the day of the opening balance, taken from the bank statement or a cash count).");
  if (od > todayStr()) throw new BadRequestError("The opening date cannot be in the future.");
  r.set("opening_date", noon(od));
  if (r.getInt("opening_balance") < 0) throw new BadRequestError("The opening balance cannot be negative.");
  if (!r.getString("status")) r.set("status", "active");
  if (["active", "closed"].indexOf(r.getString("status")) === -1) throw new BadRequestError("Unknown status.");

  if (before) {
    for (const f of ACCOUNT_SYSTEM) r.set(f, before.get(f));
    if (auth) r.set("statement_mapping", before.get("statement_mapping"));
    if (hasMovements(dao, r.id)) {
      for (const f of Object.keys(LOCKED_LABEL)) {
        if (before.getString(f) !== r.getString(f)) throw new BadRequestError(`${code} already has transactions, so its ${LOCKED_LABEL[f]} can no longer change.`);
      }
    } else {
      r.set("book_balance", r.getInt("opening_balance"));
    }
    if (r.getString("status") === "closed" && before.getString("status") !== "closed") {
      const balance = bookBalance(dao, before, "");
      if (balance !== 0) throw new BadRequestError(`${code} still holds ${fmt(balance)}; transfer it to another account before closing.`);
      const open = (dao.findRecordsByFilter("cash_receipts", "account = {:a} && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 1, 0, { a: r.id }) || []).length
        + (dao.findRecordsByFilter("bank_transfers", "(from_account = {:a} || to_account = {:a}) && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 1, 0, { a: r.id }) || []).length;
      if (open) throw new BadRequestError(`${code} has receipts or transfers still open; finish or cancel them first.`);
    }
  } else {
    for (const f of ACCOUNT_SYSTEM) r.set(f, "");
    r.set("book_balance", r.getInt("opening_balance"));
    r.set("created_by", auth ? auth.id : "");
  }
  if (r.getString("status") === "closed") r.set("is_default", false);
  if (r.getBool("is_default")) {
    for (const other of dao.findRecordsByFilter("bank_accounts", "kind = {:k} && is_default = true && id != {:id}", "", 20, 0, { k: kind, id: r.id || "" }) || []) {
      other.set("is_default", false);
      dao.saveRecord(other);
    }
  }
  if (before) {
    e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, r, ["code", "name", "kind", "bank_name", "branch", "account_number", "account_name", "gl_account", "funding_source", "opening_balance", "opening_date", "custodian", "cash_limit", "is_default", "status", "signatories"])));
  }
}

/** The account a voucher is paid from: chosen, or the default of the right kind. Checks kind and restricted funds. */
function paymentAccount(dao, accountId, method, voucher) {
  const kind = method === "cash" ? "cash" : "bank";
  let a = null;
  if (accountId) a = load(dao, "bank_accounts", accountId, "Account");
  else {
    const all = dao.findRecordsByFilter("bank_accounts", "kind = {:k} && status = 'active'", "-is_default,code", 50, 0, { k: kind }) || [];
    a = all.length && (all[0].getBool("is_default") || all.length === 1) ? all[0] : null;
    if (!a) throw new BadRequestError(`Choose the ${kind === "cash" ? "cash book" : "bank account"} the payment is made from.`);
  }
  if (a.getString("status") !== "active") throw new BadRequestError(`${accountLabel(a)} is closed.`);
  if (a.getString("kind") !== kind) {
    throw new BadRequestError(kind === "cash" ? `Cash is paid from a cash book, not from ${accountLabel(a)}.` : `${accountLabel(a)} is a cash book; bank transfers, cheques and mobile money are paid from a bank account.`);
  }
  const restricted = a.getString("funding_source");
  if (restricted && voucher.getString("funding_source") !== restricted) {
    const vf = voucher.getString("funding_source");
    throw new BadRequestError(`${accountLabel(a)} holds restricted money of ${nameOf(dao, "funding_sources", restricted) || "a donor"}; ${voucher.getString("number")} is funded by ${vf ? nameOf(dao, "funding_sources", vf) : "several or no funding sources"}. Pay it from an unrestricted account.`);
  }
  return a;
}

/** Called by vouchers.execute once the payments exist: one cash book entry for the money that leaves the account. */
function recordVoucherPayment(dao, v, account, opts) {
  const net = v.getInt("net_amount");
  if (net <= 0) return null;
  return postEntry(dao, {
    account, date: opts.date, direction: "out", amount: net, type: "payment", method: opts.method, reference: opts.reference,
    counterparty: v.getString("payee_name"), description: v.getString("description"),
    source: { type: "payment_voucher", id: v.id, number: v.getString("number") },
    gl_account: v.getString("voucher_type") === "direct" ? v.getString("expense_account") : "", funding_source: v.getString("funding_source"), actor: opts.actor,
  });
}

// ------------------------------------------------------------------ receipts
const RECEIPT_SYSTEM = ["number", "status", "recorded_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "entry", "cancel_reason", "reversal_reason", "reversed_by", "reversed_at"];

function normalizeReceipt(dao, r) {
  const a = activeAccount(dao, r.getString("account"), "the account the money was received in");
  const cash = a.getString("kind") === "cash";
  const method = r.getString("method") || (cash ? "cash" : "bank_transfer");
  if (RECEIPT_METHODS.indexOf(method) === -1) throw new BadRequestError("Choose how the money was received.");
  if ((method === "cash") !== cash) {
    throw new BadRequestError(cash ? `${accountLabel(a)} is a cash book; choose "Cash", or record the receipt in the bank account.` : 'Cash received at the office goes into a cash book; cash paid in at the bank is a "Direct deposit".');
  }
  r.set("method", method);
  const d = toDay(r.getString("receipt_date"));
  if (!d) throw new BadRequestError("Enter the date the money was received.");
  if (d > todayStr()) throw new BadRequestError("The receipt date cannot be in the future.");
  r.set("receipt_date", noon(d));
  if (r0(r.getFloat("amount")) <= 0) throw new BadRequestError("Enter the amount received.");
  r.set("amount", r0(r.getFloat("amount")));
  r.set("payer_name", String(r.getString("payer_name") || "").trim());
  if (r.getString("payer_name").length < 2) throw new BadRequestError("Enter who paid (district, ministry, partner or person).");
  if (!r.getString("payer_type")) r.set("payer_type", "other");
  if (PAYER_TYPES.indexOf(r.getString("payer_type")) === -1) throw new BadRequestError("Choose the kind of payer.");
  r.set("reference", String(r.getString("reference") || "").trim());
  if (method === "cheque" && r.getString("reference").length < 3) throw new BadRequestError("Enter the cheque number.");
  contraAccount(dao, r.getString("income_account"), "what the money is for (income or receivable account)", ["revenue", "liability", "asset"]);
  const restricted = a.getString("funding_source");
  if (restricted) {
    if (!r.getString("funding_source")) r.set("funding_source", restricted);
    if (r.getString("funding_source") !== restricted) {
      throw new BadRequestError(`${accountLabel(a)} holds only ${nameOf(dao, "funding_sources", restricted)} money; record other money in an unrestricted account.`);
    }
  }
  if (r.getString("funding_source")) load(dao, "funding_sources", r.getString("funding_source"), "Funding source");
  if (r.getString("project")) load(dao, "projects", r.getString("project"), "Project");
  r.set("description", String(r.getString("description") || "").trim().slice(0, 300));
  if (!r.getString("description")) r.set("description", `Received from ${r.getString("payer_name")}`);
  if (r.getString("statement_line")) {
    const l = load(dao, "bank_statement_lines", r.getString("statement_line"), "Statement line");
    if (l.getString("account") !== a.id || l.getString("direction") !== "in" || l.getInt("amount") !== r.getInt("amount")) {
      throw new BadRequestError(`The statement line is ${fmt(l.getInt("amount"))} ${l.getString("direction") === "in" ? "in" : "out"} on another account or amount; the receipt must match it.`);
    }
    if (l.getString("match_group")) throw new BadRequestError("That statement line is already matched to the cash book.");
  }
  return a;
}

function beforeCreateReceipt(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_treasury", "record receipts");
  const r = e.record;
  for (const f of RECEIPT_SYSTEM) r.set(f, "");
  r.set("status", "draft");
  if (auth) r.set("recorded_by", auth.id);
  normalizeReceipt(dao, r);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "receipt");
  });
  r.set("number", n);
}

function beforeUpdateReceipt(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_treasury", "edit receipts");
  const r = e.record;
  const before = r.originalCopy();
  if (auth && EDITABLE.indexOf(before.getString("status")) === -1) throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  for (const f of RECEIPT_SYSTEM) r.set(f, before.get(f));
  normalizeReceipt(dao, r);
  e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, r, ["account", "receipt_date", "payer_name", "payer_type", "amount", "method", "reference", "income_account", "funding_source", "project", "description"])));
}

function beforeDeleteDraft(e, permission, what) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  core.requirePermission($app.dao(), auth, permission, `delete ${what}`);
  if (e.record.getString("status") !== "draft" || e.record.getString("approval")) throw new BadRequestError("Only drafts that were never submitted can be deleted; cancel it instead.");
}

function submitReceipt(dao, id, actor, meta) {
  core.requirePermission(dao, actor, "manage_treasury", "submit receipts");
  const r = load(dao, "cash_receipts", id, "Receipt");
  if (EDITABLE.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is already ${r.getString("status").replace(/_/g, " ")}.`);
  const a = normalizeReceipt(dao, r);
  assertDateOpen(dao, a, day(r.getString("receipt_date")), `receipt ${r.getString("number")}`);
  return require("./approvals.js").start(dao, "cash_receipt", r, actor, meta);
}

/** Final approval: the receipt is posted to the cash book (and matched to its statement line when it came from one). */
function onReceiptApproved(dao, r, actor) {
  const a = load(dao, "bank_accounts", r.getString("account"), "Account");
  const d = day(r.getString("receipt_date"));
  assertDateOpen(dao, a, d, `receipt ${r.getString("number")}`);
  const entry = postEntry(dao, {
    account: a, date: d, direction: "in", amount: r.getInt("amount"), type: "receipt", method: r.getString("method"), reference: r.getString("reference"),
    counterparty: r.getString("payer_name"), description: r.getString("description"),
    source: { type: "cash_receipt", id: r.id, number: r.getString("number") }, gl_account: r.getString("income_account"), funding_source: r.getString("funding_source"), actor,
  });
  r.set("entry", entry.id);
  dao.saveRecord(r);
  require("./glpost.js").receipt(dao, r, entry, actor);
  let matched = false;
  if (r.getString("statement_line")) {
    try {
      const l = dao.findRecordById("bank_statement_lines", r.getString("statement_line"));
      if (!l.getString("match_group")) {
        makeGroup(dao, a, [entry], [l], "recorded", actor);
        matched = true;
      }
    } catch (_) {}
  }
  if (!matched) autoMatch(dao, a.id, actor);
  refreshAccount(dao, a.id);
  core.notify(dao, [r.getString("recorded_by")].filter((x) => x && (!actor || x !== actor.id)), {
    title: `${r.getString("number")} posted`, body: `${fmt(r.getInt("amount"))} from ${r.getString("payer_name")} into ${accountLabel(a)}`,
    link: `/dashboard/treasury/receipts/${r.id}`, type: "success",
  });
}

function cancelDoc(dao, type, collection, id, actor, reason, meta) {
  const r = load(dao, collection, id, type === "cash_receipt" ? "Receipt" : "Transfer");
  if (!core.can(dao, actor, "manage_treasury") && !core.can(dao, actor, "approve_treasury")) throw new ForbiddenError("You don't have permission to cancel this.");
  if (OPEN_DOC.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}; posted documents are reversed, not cancelled.`);
  if (!String(reason || "").trim()) throw new BadRequestError("Give a reason for cancelling.");
  require("./approvals.js").cancel(dao, type, r, actor, String(reason).trim(), meta);
  return r;
}

/** Undoes posted entries with opposite ones dated today; the pairs cancel each other out in the reconciliation. */
function reverseEntries(dao, entries, actor, reason, number) {
  const today = todayStr();
  for (const e of entries) {
    if (e.getBool("reversed")) throw new BadRequestError(`${number} is already reversed.`);
    if (e.getString("match_group")) {
      const line = (dao.findRecordsByFilter("bank_statement_lines", "match_group = {:g}", "", 1, 0, { g: e.getString("match_group") }) || [])[0];
      throw new BadRequestError(`${number} is matched to the bank statement${line ? ` (${showDay(line.getString("txn_date"))}, ${line.getString("description")})` : ""}: the money really moved. Unmatch it first if the statement line belongs to something else.`);
    }
    const a = load(dao, "bank_accounts", e.getString("account"), "Account");
    assertDateOpen(dao, a, today, `the reversal of ${number}`);
    if (e.getString("direction") === "in") assertFunds(dao, a, e.getInt("amount"), today, `the reversal of ${number}`);
  }
  const out = [];
  for (const e of entries) {
    const a = load(dao, "bank_accounts", e.getString("account"), "Account");
    const rev = postEntry(dao, {
      account: a, date: today, direction: e.getString("direction") === "in" ? "out" : "in", amount: e.getInt("amount"), type: e.getString("type"), method: e.getString("method"),
      reference: e.getString("reference"), counterparty: e.getString("counterparty"), description: `Reversal of ${number}: ${reason}`.slice(0, 300),
      source: { type: e.getString("source_type"), id: e.getString("source_id"), number }, gl_account: e.getString("gl_account"), funding_source: e.getString("funding_source"), actor, reversalOf: e.id,
    });
    e.set("reversed", true);
    dao.saveRecord(e);
    if (a.getString("kind") === "bank") makeGroup(dao, a, [e, rev], [], "auto", actor);
    refreshAccount(dao, a.id);
    out.push(rev);
  }
  require("./glpost.js").reversal(dao, entries, out, actor, `Reversal of ${number}: ${reason}`);
  return out;
}

function reverseDoc(dao, type, id, actor, reason, meta) {
  core.requirePermission(dao, actor, "approve_treasury", "reverse posted receipts and transfers");
  const collection = type === "cash_receipt" ? "cash_receipts" : "bank_transfers";
  const r = load(dao, collection, id, type === "cash_receipt" ? "Receipt" : "Transfer");
  const number = r.getString("number");
  if (r.getString("status") !== "approved") throw new BadRequestError(`${number} is ${r.getString("status").replace(/_/g, " ")}; only posted documents are reversed.`);
  const why = String(reason || "").trim();
  if (why.length < 10) throw new BadRequestError("Explain why it is reversed (at least 10 characters).");
  const ids = type === "cash_receipt" ? [r.getString("entry")] : [r.getString("out_entry"), r.getString("in_entry")];
  const entries = ids.filter(Boolean).map((x) => load(dao, "cash_book_entries", x, "Cash book entry"));
  reverseEntries(dao, entries, actor, why, number);
  r.set("status", "reversed");
  r.set("reversal_reason", why);
  r.set("reversed_by", actor.id);
  r.set("reversed_at", new Date().toISOString());
  dao.saveRecord(r);
  core.audit(dao, { actor, action: "reversed", collection, recordId: r.id, label: number, comment: why, meta, changes: { status: { old: "approved", new: "reversed" } } });
  return r;
}

// ------------------------------------------------------------------ transfers
const TRANSFER_SYSTEM = ["number", "status", "prepared_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "out_entry", "in_entry", "cancel_reason", "reversal_reason", "reversed_by", "reversed_at"];

function normalizeTransfer(dao, t) {
  const from = activeAccount(dao, t.getString("from_account"), "the account the money leaves");
  const to = activeAccount(dao, t.getString("to_account"), "the account the money goes to");
  if (from.id === to.id) throw new BadRequestError("Choose two different accounts.");
  const allowed = TRANSFER_METHODS[`${from.getString("kind")}>${to.getString("kind")}`];
  if (!allowed) throw new BadRequestError("Cash moves between cash books through a bank account: deposit it, then withdraw it.");
  const method = t.getString("method") || allowed[0];
  if (allowed.indexOf(method) === -1) throw new BadRequestError(`From ${accountLabel(from)} to ${accountLabel(to)} the method is ${allowed.map((m) => METHOD_LABEL[m]).join(" or ")}.`);
  t.set("method", method);
  const d = toDay(t.getString("transfer_date"));
  if (!d) throw new BadRequestError("Enter the transfer date.");
  if (d > todayStr()) throw new BadRequestError("The transfer date cannot be in the future.");
  t.set("transfer_date", noon(d));
  if (r0(t.getFloat("amount")) <= 0) throw new BadRequestError("Enter the amount to transfer.");
  t.set("amount", r0(t.getFloat("amount")));
  t.set("reference", String(t.getString("reference") || "").trim());
  if (method === "cheque" && t.getString("reference").length < 3) throw new BadRequestError("Enter the cheque number.");
  t.set("description", String(t.getString("description") || "").trim().slice(0, 300));
  const restricted = from.getString("funding_source");
  if (restricted && restricted !== to.getString("funding_source") && t.getString("description").length < 15) {
    throw new BadRequestError(`Money leaving the restricted ${nameOf(dao, "funding_sources", restricted)} account: explain why in the description (at least 15 characters), e.g. reimbursement of project costs paid from the operating account.`);
  }
  if (!t.getString("description")) t.set("description", `Transfer from ${accountLabel(from)} to ${accountLabel(to)}`);
  return { from, to };
}

function beforeCreateTransfer(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_treasury", "prepare transfers");
  const t = e.record;
  for (const f of TRANSFER_SYSTEM) t.set(f, "");
  t.set("status", "draft");
  if (auth) t.set("prepared_by", auth.id);
  normalizeTransfer(dao, t);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "bank_transfer");
  });
  t.set("number", n);
}

function beforeUpdateTransfer(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_treasury", "edit transfers");
  const t = e.record;
  const before = t.originalCopy();
  if (auth && EDITABLE.indexOf(before.getString("status")) === -1) throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  for (const f of TRANSFER_SYSTEM) t.set(f, before.get(f));
  normalizeTransfer(dao, t);
  e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, t, ["from_account", "to_account", "amount", "transfer_date", "method", "reference", "description"])));
}

function submitTransfer(dao, id, actor, meta) {
  core.requirePermission(dao, actor, "manage_treasury", "submit transfers");
  const t = load(dao, "bank_transfers", id, "Transfer");
  if (EDITABLE.indexOf(t.getString("status")) === -1) throw new BadRequestError(`${t.getString("number")} is already ${t.getString("status").replace(/_/g, " ")}.`);
  const { from, to } = normalizeTransfer(dao, t);
  const d = day(t.getString("transfer_date"));
  assertDateOpen(dao, from, d, `transfer ${t.getString("number")}`);
  assertDateOpen(dao, to, d, `transfer ${t.getString("number")}`);
  assertFunds(dao, from, t.getInt("amount"), d, `transfer ${t.getString("number")}`);
  return require("./approvals.js").start(dao, "bank_transfer", t, actor, meta);
}

/** Final approval: out of one account, into the other, on the transfer date. */
function onTransferApproved(dao, t, actor) {
  const from = load(dao, "bank_accounts", t.getString("from_account"), "Account");
  const to = load(dao, "bank_accounts", t.getString("to_account"), "Account");
  const d = day(t.getString("transfer_date"));
  const number = t.getString("number");
  assertDateOpen(dao, from, d, `transfer ${number}`);
  assertDateOpen(dao, to, d, `transfer ${number}`);
  assertFunds(dao, from, t.getInt("amount"), d, `transfer ${number}`);
  const common = { date: d, amount: t.getInt("amount"), method: t.getString("method"), reference: t.getString("reference"), source: { type: "bank_transfer", id: t.id, number }, actor };
  const out = postEntry(dao, { ...common, account: from, direction: "out", type: "transfer_out", counterparty: accountLabel(to), description: t.getString("description"), gl_account: to.getString("gl_account"), funding_source: from.getString("funding_source") });
  const inn = postEntry(dao, { ...common, account: to, direction: "in", type: "transfer_in", counterparty: accountLabel(from), description: t.getString("description"), gl_account: from.getString("gl_account"), funding_source: to.getString("funding_source") });
  t.set("out_entry", out.id);
  t.set("in_entry", inn.id);
  dao.saveRecord(t);
  require("./glpost.js").transfer(dao, t, out, inn, actor);
  autoMatch(dao, from.id, actor);
  autoMatch(dao, to.id, actor);
  core.notify(dao, [t.getString("prepared_by")].filter((x) => x && (!actor || x !== actor.id)), {
    title: `${number} approved and posted`, body: `${fmt(t.getInt("amount"))} from ${accountLabel(from)} to ${accountLabel(to)}`,
    link: `/dashboard/treasury/transfers/${t.id}`, type: "success",
  });
}

// ------------------------------------------------------------------ statements
function importStatement(dao, actor, input, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "import bank statements");
  const a = activeAccount(dao, input.account, "the bank account");
  if (a.getString("kind") !== "bank") throw new BadRequestError(`${accountLabel(a)} is a cash book; cash is counted, not imported.`);
  const raw = Array.isArray(input.rows) ? input.rows : [];
  if (!raw.length) throw new BadRequestError("The file has no transaction lines.");
  if (raw.length > 5000) throw new BadRequestError("Import at most 5,000 lines at a time (one statement).");
  const errors = [];
  const rows = raw.map((x, i) => {
    const n = i + 1;
    const o = x || {};
    const d = toDay(o.date);
    const vin = r0(o.amount_in);
    const vout = r0(o.amount_out);
    const desc = String(o.description || "").trim().slice(0, 300);
    const ref = String(o.reference || "").trim().slice(0, 120);
    if (!d) errors.push(`Line ${n}: the date is missing or not a date.`);
    if (vin < 0 || vout < 0) errors.push(`Line ${n}: amounts must be positive (money in and money out are separate).`);
    else if (vin > 0 && vout > 0) errors.push(`Line ${n}: both money in and money out are filled.`);
    else if (!vin && !vout) errors.push(`Line ${n}: no amount.`);
    if (!desc && !ref) errors.push(`Line ${n}: no description or reference.`);
    const hasBal = o.balance !== undefined && o.balance !== null && o.balance !== "";
    return { n, d, vd: toDay(o.value_date), desc, ref, direction: vin > 0 ? "in" : "out", amount: vin > 0 ? vin : vout, balance: hasBal ? r0(o.balance) : 0, hasBal };
  });
  if (errors.length) throw new BadRequestError(`${errors.length} problem${errors.length === 1 ? "" : "s"} in the file. ${errors.slice(0, 6).join(" ")}${errors.length > 6 ? " …" : ""}`);

  const dates = rows.map((r) => r.d).sort();
  const from = toDay(input.statement_from) || dates[0];
  const to = toDay(input.statement_to) || dates[dates.length - 1];
  if (from > to) throw new BadRequestError("The statement period ends before it starts.");
  if (to > todayStr()) throw new BadRequestError("The statement period cannot end in the future.");
  const outside = rows.find((r) => r.d < from || r.d > to);
  if (outside) throw new BadRequestError(`Line ${outside.n} (${showDay(outside.d)}) is outside the statement period ${showDay(from)} – ${showDay(to)}.`);
  const od = day(a.getString("opening_date"));
  if (from < od) throw new BadRequestError(`${accountLabel(a)} starts in the system on ${showDay(od)} (opening balance); import statement lines from that date.`);
  const rec = lastApproved(dao, a.id);
  if (rec && from <= day(rec.getString("as_of"))) throw new BadRequestError(`${accountLabel(a)} is reconciled up to ${showDay(rec.getString("as_of"))}; import lines after that date.`);
  const overlap = (dao.findRecordsByFilter("bank_statements", "account = {:a} && statement_from <= {:to} && statement_to >= {:from}", "statement_from", 1, 0, { a: a.id, from: startOf(from), to: endOf(to) }) || [])[0];
  if (overlap) {
    throw new BadRequestError(`${overlap.getString("number")} already covers ${showDay(overlap.getString("statement_from"))} – ${showDay(overlap.getString("statement_to"))}. Import from ${showDay(addDays(day(overlap.getString("statement_to")), 1))}, or delete that import first.`);
  }

  const totalIn = rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);
  const given = (v) => v !== undefined && v !== null && v !== "";
  let opening;
  if (given(input.opening_balance)) opening = r0(input.opening_balance);
  else if (rows[0].hasBal) opening = rows[0].balance - signed(rows[0].direction, rows[0].amount);
  else throw new BadRequestError("Enter the opening balance shown on the statement.");
  const closing = opening + totalIn - totalOut;
  if (given(input.closing_balance) && r0(input.closing_balance) !== closing) {
    throw new BadRequestError(`The lines add up to a closing balance of ${fmt(closing)}, but the statement shows ${fmt(input.closing_balance)}: a line is missing or was read wrongly (check the column mapping).`);
  }
  let run = opening;
  for (const r of rows) {
    run += signed(r.direction, r.amount);
    if (r.hasBal && r.balance !== run) {
      throw new BadRequestError(`Line ${r.n} (${showDay(r.d)}): the balance ${fmt(r.balance)} does not follow from the lines before it (${fmt(run)}). Check that the lines are in the bank's order and that money in and money out are not swapped.`);
    }
  }

  const warnings = [];
  const prev = (dao.findRecordsByFilter("bank_statements", "account = {:a} && statement_to < {:from}", "-statement_to", 1, 0, { a: a.id, from: startOf(from) }) || [])[0];
  if (prev) {
    const gap = daysBetween(day(prev.getString("statement_to")), from);
    if (prev.getInt("closing_balance") !== opening) {
      if (gap <= 1) throw new BadRequestError(`The opening balance ${fmt(opening)} does not match the closing balance ${fmt(prev.getInt("closing_balance"))} of ${prev.getString("number")} (to ${showDay(prev.getString("statement_to"))}). Check the statement or the opening balance entered.`);
      warnings.push(`No lines are imported between ${showDay(prev.getString("statement_to"))} and ${showDay(from)}, and the balances differ by ${fmt(opening - prev.getInt("closing_balance"))}.`);
    } else if (gap > 1) {
      warnings.push(`No lines are imported between ${showDay(prev.getString("statement_to"))} and ${showDay(from)} (the balances agree).`);
    }
  } else if (from === od && opening !== a.getInt("opening_balance")) {
    warnings.push(`The bank's opening balance (${fmt(opening)}) differs from the account's opening balance in the system (${fmt(a.getInt("opening_balance"))}) by ${fmt(opening - a.getInt("opening_balance"))}; the reconciliation shows this until it is explained.`);
  }
  const next = (dao.findRecordsByFilter("bank_statements", "account = {:a} && statement_from > {:to}", "statement_from", 1, 0, { a: a.id, to: endOf(to) }) || [])[0];
  if (next && daysBetween(to, day(next.getString("statement_from"))) <= 1 && next.getInt("opening_balance") !== closing) {
    throw new BadRequestError(`The closing balance ${fmt(closing)} does not match the opening balance ${fmt(next.getInt("opening_balance"))} of ${next.getString("number")} (from ${showDay(next.getString("statement_from"))}).`);
  }

  const st = new Record(dao.findCollectionByNameOrId("bank_statements"));
  st.set("number", core.nextNumber(dao, "bank_statement"));
  st.set("account", a.id);
  st.set("statement_from", noon(from));
  st.set("statement_to", noon(to));
  st.set("opening_balance", opening);
  st.set("closing_balance", closing);
  st.set("total_in", totalIn);
  st.set("total_out", totalOut);
  st.set("line_count", rows.length);
  st.set("matched_count", 0);
  st.set("file_name", String(input.file_name || "").slice(0, 200));
  st.set("mapping", input.mapping && typeof input.mapping === "object" ? input.mapping : {});
  st.set("status", "imported");
  st.set("notes", warnings.join(" ").slice(0, 2000));
  st.set("imported_by", actor.id);
  dao.saveRecord(st);
  const col = dao.findCollectionByNameOrId("bank_statement_lines");
  for (const r of rows) {
    const l = new Record(col);
    l.set("statement", st.id);
    l.set("account", a.id);
    l.set("line_no", r.n);
    l.set("txn_date", noon(r.d));
    l.set("value_date", r.vd ? noon(r.vd) : "");
    l.set("description", r.desc);
    l.set("reference", r.ref);
    l.set("direction", r.direction);
    l.set("amount", r.amount);
    l.set("balance", r.balance);
    l.set("has_balance", r.hasBal);
    dao.saveRecord(l);
  }
  if (input.mapping && typeof input.mapping === "object") {
    const fresh = load(dao, "bank_accounts", a.id, "Account");
    fresh.set("statement_mapping", input.mapping);
    dao.saveRecord(fresh);
  }
  const res = autoMatch(dao, a.id, actor);
  refreshAccount(dao, a.id);
  const matched = scalar(dao, "SELECT COUNT(*) AS n FROM bank_statement_lines WHERE statement = {:s} AND match_group != ''", { s: st.id });
  core.audit(dao, {
    actor, action: "statement_imported", collection: "bank_statements", recordId: st.id, label: st.getString("number"), meta,
    comment: `${accountLabel(a)} · ${showDay(from)} – ${showDay(to)} · ${rows.length} lines, ${matched} matched automatically`,
  });
  return { id: st.id, number: st.getString("number"), lines: rows.length, matched, ambiguous: res.ambiguous, opening, closing, total_in: totalIn, total_out: totalOut, warnings };
}

function deleteStatement(dao, id, actor, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "delete statement imports");
  const st = load(dao, "bank_statements", id, "Statement");
  const lines = dao.findRecordsByFilter("bank_statement_lines", "statement = {:s}", "line_no", 10000, 0, { s: st.id }) || [];
  if (lines.some((l) => l.getString("reconciliation"))) throw new BadRequestError(`${st.getString("number")} is part of an approved reconciliation and cannot be deleted.`);
  const pending = pendingRec(dao, st.getString("account"));
  if (pending && day(st.getString("statement_from")) <= day(pending.getString("as_of"))) {
    throw new BadRequestError(`${pending.getString("number")} (as of ${showDay(pending.getString("as_of"))}) is waiting for approval and uses this statement; ask the DAF to return it first.`);
  }
  const groups = lines.map((l) => l.getString("match_group")).filter((g, i, all) => g && all.indexOf(g) === i);
  for (const g of groups) clearGroup(dao, g);
  const number = st.getString("number");
  const accountId = st.getString("account");
  dao.deleteRecord(st);
  refreshAccount(dao, accountId);
  core.audit(dao, { actor, action: "statement_deleted", collection: "bank_statements", recordId: id, label: number, comment: `${lines.length} lines removed; ${groups.length} matches undone`, meta });
  return { number, lines: lines.length };
}

// ------------------------------------------------------------------ matching
const entryDay = (e) => day(e.getString("entry_date"));
const lineDay = (l) => day(l.getString("txn_date"));
const signedSum = (items) => items.reduce((s, x) => s + signed(x.getString("direction"), x.getInt("amount")), 0);

/** Marks entries and statement lines of one account as one match (equal signed totals). */
function makeGroup(dao, account, entries, lines, method, actor) {
  const all = entries.concat(lines);
  if (!all.length) throw new BadRequestError("Choose what to match.");
  for (const x of entries) if (x.getString("account") !== account.id) throw new BadRequestError("All items must belong to the same account.");
  for (const x of lines) if (x.getString("account") !== account.id) throw new BadRequestError("All items must belong to the same account.");
  if (all.some((x) => x.getString("match_group"))) throw new BadRequestError("One of the items is already matched; refresh the page.");
  const se = signedSum(entries);
  const sl = signedSum(lines);
  if ((!entries.length || !lines.length) && (all.length < 2 || se !== sl)) {
    throw new BadRequestError("Match statement lines with cash book entries; items on one side only must cancel each other out (e.g. an entry and its reversal).");
  }
  if (se !== sl) throw new BadRequestError(`The amounts don't agree: statement ${fmt(sl)}, cash book ${fmt(se)} (difference ${fmt(Math.abs(se - sl))}).`);
  const maxDate = entries.map(entryDay).concat(lines.map(lineDay)).sort().pop();
  const pending = pendingRec(dao, account.id);
  if (pending && maxDate <= day(pending.getString("as_of"))) {
    throw new BadRequestError(`${pending.getString("number")} (as of ${showDay(pending.getString("as_of"))}) is waiting for approval; matching items up to that date would change it. Ask the DAF to return it first.`);
  }
  const g = $security.randomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789");
  const now = new Date().toISOString();
  for (const x of all) {
    x.set("match_group", g);
    x.set("match_method", method);
    x.set("matched_at", now);
    x.set("matched_by", actor ? actor.id : "");
    x.set("follow_up", "");
    x.set("follow_up_note", "");
    dao.saveRecord(x);
  }
  return g;
}

function groupItems(dao, g) {
  return {
    entries: dao.findRecordsByFilter("cash_book_entries", "match_group = {:g}", "entry_date", 1000, 0, { g }) || [],
    lines: dao.findRecordsByFilter("bank_statement_lines", "match_group = {:g}", "txn_date", 1000, 0, { g }) || [],
  };
}

function clearGroup(dao, g) {
  const { entries, lines } = groupItems(dao, g);
  for (const x of entries.concat(lines)) {
    x.set("match_group", "");
    x.set("match_method", "");
    x.set("matched_at", "");
    x.set("matched_by", "");
    dao.saveRecord(x);
  }
}

function match(dao, actor, input, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "match bank statements");
  const a = load(dao, "bank_accounts", String(input.account || ""), "Account");
  if (a.getString("kind") !== "bank") throw new BadRequestError("Cash books are counted, not matched to statements.");
  const ids = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const entries = ids(input.entries).map((x) => load(dao, "cash_book_entries", x, "Cash book entry"));
  const lines = ids(input.lines).map((x) => load(dao, "bank_statement_lines", x, "Statement line"));
  if (entries.length + lines.length > 200) throw new BadRequestError("Match at most 200 items at once.");
  const g = makeGroup(dao, a, entries, lines, "manual", actor);
  refreshAccount(dao, a.id);
  core.audit(dao, {
    actor, action: "bank_matched", collection: "bank_accounts", recordId: a.id, label: a.getString("code"), meta,
    comment: `${lines.length} statement line${lines.length === 1 ? "" : "s"} ↔ ${entries.length} cash book entr${entries.length === 1 ? "y" : "ies"} · ${fmt(Math.abs(signedSum(lines)))}`,
  });
  return { group: g };
}

function unmatch(dao, actor, group, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "undo matches");
  const g = String(group || "");
  const { entries, lines } = groupItems(dao, g);
  const all = entries.concat(lines);
  if (!g || !all.length) throw new NotFoundError("Match not found.");
  const locked = all.find((x) => x.getString("reconciliation"));
  if (locked) {
    const rec = load(dao, "bank_reconciliations", locked.getString("reconciliation"), "Reconciliation");
    throw new BadRequestError(`This match is part of ${rec.getString("number")}, approved for ${showDay(rec.getString("as_of"))}; it cannot be undone.`);
  }
  const accountId = all[0].getString("account");
  const maxDate = entries.map(entryDay).concat(lines.map(lineDay)).sort().pop();
  const pending = pendingRec(dao, accountId);
  if (pending && maxDate <= day(pending.getString("as_of"))) {
    throw new BadRequestError(`${pending.getString("number")} (as of ${showDay(pending.getString("as_of"))}) is waiting for approval and includes this match; ask the DAF to return it first.`);
  }
  clearGroup(dao, g);
  const a = refreshAccount(dao, accountId);
  core.audit(dao, { actor, action: "bank_unmatched", collection: "bank_accounts", recordId: a.id, label: a.getString("code"), meta, comment: `${lines.length} statement line(s) ↔ ${entries.length} cash book entr${entries.length === 1 ? "y" : "ies"}` });
  return { ok: true };
}

/** Does the entry's reference (or document number) appear on the statement line, or the line's reference in the entry? */
function refMatch(e, l) {
  const hay = norm(`${l.getString("reference")} ${l.getString("description")}`);
  for (const r of [e.getString("reference"), e.getString("source_number")].map(norm)) {
    if (r.length >= 4 && hay.indexOf(r) !== -1) return true;
    const nz = r.replace(/^0+/, "");
    if (nz.length >= 4 && nz !== r && hay.indexOf(nz) !== -1) return true;
  }
  const lr = norm(l.getString("reference"));
  return lr.length >= 4 && norm(`${e.getString("reference")} ${e.getString("source_number")} ${e.getString("description")}`).indexOf(lr) !== -1;
}

/**
 * Automatic matching, one statement line to one cash book entry: same direction and amount within the
 * date window, the reference first; then pairs that are the only candidate both ways. A reversal and the
 * entry it reverses are paired. Ambiguous lines are left for matching by hand.
 */
function autoMatch(dao, accountId, actor) {
  const a = load(dao, "bank_accounts", accountId, "Account");
  if (a.getString("kind") !== "bank") return { matched: 0, ambiguous: 0 };
  const window = settings(dao).matchDays;
  const pending = pendingRec(dao, a.id);
  const frozenTo = pending ? day(pending.getString("as_of")) : "";
  const allowed = (dates) => !frozenTo || dates.slice().sort().pop() > frozenTo;
  const entries = dao.findRecordsByFilter("cash_book_entries", "account = {:a} && match_group = ''", "entry_date", 20000, 0, { a: a.id }) || [];
  const lines = dao.findRecordsByFilter("bank_statement_lines", "account = {:a} && match_group = ''", "txn_date,line_no", 20000, 0, { a: a.id }) || [];
  const used = {};
  let matched = 0;

  const byId = {};
  for (const e of entries) byId[e.id] = e;
  for (const e of entries) {
    const orig = byId[e.getString("reversal_of")];
    if (!orig || used[e.id] || used[orig.id] || !allowed([entryDay(e), entryDay(orig)])) continue;
    makeGroup(dao, a, [orig, e], [], "auto", actor);
    used[e.id] = used[orig.id] = true;
  }

  const near = (e, l) => e.getString("direction") === l.getString("direction") && e.getInt("amount") === l.getInt("amount") && Math.abs(daysBetween(entryDay(e), lineDay(l))) <= window;
  const candidates = (l) => entries.filter((e) => !used[e.id] && !e.getString("reversal_of") && !e.getBool("reversed") && near(e, l));
  const pair = (e, l) => {
    makeGroup(dao, a, [e], [l], "auto", actor);
    used[e.id] = used[l.id] = true;
    matched++;
  };
  for (const l of lines) {
    const strong = candidates(l).filter((e) => refMatch(e, l));
    if (strong.length === 1 && allowed([entryDay(strong[0]), lineDay(l)])) pair(strong[0], l);
  }
  for (const l of lines) {
    if (used[l.id]) continue;
    const c = candidates(l);
    if (c.length !== 1) continue;
    const back = lines.filter((x) => !used[x.id] && near(c[0], x));
    if (back.length === 1 && allowed([entryDay(c[0]), lineDay(l)])) pair(c[0], l);
  }
  const ambiguous = lines.filter((l) => !used[l.id] && candidates(l).length > 1).length;
  if (matched) refreshAccount(dao, a.id);
  return { matched, ambiguous };
}

/** Bank charges, interest and other bank-only items: written to the cash book from the statement line and matched to it. */
function recordFromLine(dao, actor, lineId, input, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "record bank charges and interest");
  const l = load(dao, "bank_statement_lines", lineId, "Statement line");
  if (l.getString("match_group")) throw new BadRequestError("This statement line is already matched.");
  const a = load(dao, "bank_accounts", l.getString("account"), "Account");
  const dir = l.getString("direction");
  const type = String(input.type || (dir === "out" ? "bank_charge" : "interest"));
  if (["bank_charge", "interest", "other"].indexOf(type) === -1) throw new BadRequestError("Choose bank charge, interest or other.");
  if (type === "bank_charge" && dir !== "out") throw new BadRequestError("A bank charge is money out.");
  if (type === "interest" && dir !== "in") throw new BadRequestError("Interest is money in.");
  let glId = String(input.gl_account || "");
  if (!glId && type !== "other") {
    try {
      glId = dao.findFirstRecordByFilter("gl_accounts", "code = {:c}", { c: type === "bank_charge" ? "5212" : "4203" }).id;
    } catch (_) {}
  }
  const gl = contraAccount(dao, glId, "the account to charge (chart of accounts)", null);
  let line = null;
  if (input.budget_line) {
    if (dir !== "out") throw new BadRequestError("Only money out is charged to a budget line.");
    line = load(dao, "budget_lines", String(input.budget_line), "Budget line");
    if (line.getString("status") !== "active") throw new BadRequestError(`${line.getString("code")} is not an active budget line.`);
    if (line.getString("gl_account") !== gl.id) throw new BadRequestError(`${line.getString("code")} is for another GL account than ${gl.getString("code")}.`);
  }
  const st = load(dao, "bank_statements", l.getString("statement"), "Statement");
  // A line from a period already reconciled is recorded on the first open day after it.
  let d = lineDay(l);
  const rec = lastApproved(dao, a.id);
  if (rec && d <= day(rec.getString("as_of"))) d = addDays(day(rec.getString("as_of")), 1);
  if (d > todayStr()) d = todayStr();
  assertDateOpen(dao, a, d, "the cash book entry");
  const description = String(input.description || "").trim() || l.getString("description");
  const entry = postEntry(dao, {
    account: a, date: d, direction: dir, amount: l.getInt("amount"), type, method: dir === "out" ? "direct_debit" : "direct_deposit", reference: l.getString("reference"),
    counterparty: a.getString("bank_name"), description, source: { type: "statement_line", id: l.id, number: st.getString("number") },
    gl_account: gl.id, funding_source: a.getString("funding_source"), budget_line: line ? line.id : "", actor,
  });
  if (line) {
    require("./budget.js").post(dao, { line, type: "actual", amount: l.getInt("amount"), source: { type: "cash_book", id: entry.id, number: st.getString("number") }, description: `${TYPE_LABEL[type]}: ${description}`, actor, date: noon(d) });
  }
  require("./glpost.js").statementEntry(dao, entry, st.getString("number"), actor);
  makeGroup(dao, a, [entry], [l], "recorded", actor);
  refreshAccount(dao, a.id);
  core.audit(dao, { actor, action: "bank_line_recorded", collection: "bank_accounts", recordId: a.id, label: a.getString("code"), meta, comment: `${TYPE_LABEL[type]} ${fmt(l.getInt("amount"))} · ${description} (${st.getString("number")})` });
  return { entry: entry.id };
}

function setFollowUp(dao, actor, input, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "follow up reconciling items");
  const fu = String(input.follow_up || "");
  if (fu && FOLLOW_UP.indexOf(fu) === -1) throw new BadRequestError("Unknown follow-up status.");
  const note = String(input.note || "").trim().slice(0, 300);
  if ((fu === "investigate" || fu === "correct") && note.length < 5) throw new BadRequestError("Say what is being checked or corrected (a short note).");
  const items = Array.isArray(input.items) ? input.items.slice(0, 500) : [];
  if (!items.length) throw new BadRequestError("Choose the items.");
  let n = 0;
  let accountId = "";
  for (const it of items) {
    const col = it && it.kind === "line" ? "bank_statement_lines" : "cash_book_entries";
    const x = load(dao, col, String((it && it.id) || ""), "Item");
    if (x.getString("match_group")) continue;
    x.set("follow_up", fu);
    x.set("follow_up_note", note);
    dao.saveRecord(x);
    accountId = x.getString("account");
    n++;
  }
  if (n && accountId) {
    const a = load(dao, "bank_accounts", accountId, "Account");
    core.audit(dao, { actor, action: "bank_follow_up", collection: "bank_accounts", recordId: a.id, label: a.getString("code"), meta, comment: `${n} item(s): ${fu || "cleared"}${note ? ` — ${note}` : ""}` });
  }
  return { updated: n };
}

// ------------------------------------------------------------------ reconciliation
/** Bank balance on a day from the imported statements. */
function statementBalanceAt(dao, a, asOf) {
  const sts = dao.findRecordsByFilter("bank_statements", "account = {:a}", "statement_from", 1000, 0, { a: a.id }) || [];
  const covering = sts.find((s) => day(s.getString("statement_from")) <= asOf && day(s.getString("statement_to")) >= asOf);
  if (covering) {
    const rows = arrayOf(new DynamicModel({ d: "", s: 0 }));
    dao.db().newQuery("SELECT direction AS d, COALESCE(SUM(amount), 0) AS s FROM bank_statement_lines WHERE statement = {:s} AND txn_date <= {:t} GROUP BY direction").bind({ s: covering.id, t: endOf(asOf) }).all(rows);
    let bal = covering.getInt("opening_balance");
    for (const x of rows) bal += x.d === "in" ? r0(x.s) : -r0(x.s);
    return { balance: bal, covered: true, through: asOf, statement: covering };
  }
  const before = sts.filter((s) => day(s.getString("statement_to")) < asOf).pop();
  if (before) return { balance: before.getInt("closing_balance"), covered: false, through: day(before.getString("statement_to")), statement: before };
  return { balance: null, covered: false, through: "", statement: null };
}

function itemOf(x, side, asOf, staleDays) {
  const isEntry = side === "book";
  const d = isEntry ? entryDay(x) : lineDay(x);
  const age = daysBetween(d, asOf);
  return {
    side, id: x.id, date: d, direction: x.getString("direction"), amount: x.getInt("amount"),
    description: x.getString("description") || (isEntry ? x.getString("counterparty") : ""), counterparty: isEntry ? x.getString("counterparty") : "",
    reference: x.getString("reference"), type: isEntry ? x.getString("type") : "", method: isEntry ? x.getString("method") : "",
    source_type: isEntry ? x.getString("source_type") : "", source_id: isEntry ? x.getString("source_id") : "", source_number: isEntry ? x.getString("source_number") : "",
    matched_later: Boolean(x.getString("match_group")), follow_up: x.getString("follow_up"), follow_up_note: x.getString("follow_up_note"), age,
    stale: isEntry && x.getString("direction") === "out" && x.getString("method") === "cheque" && age > staleDays,
  };
}

/**
 * The reconciliation as of a day. A match counts as reconciled at `asOf` only when all its items are dated on
 * or before it; every other item dated on or before `asOf` is a reconciling item on its own side.
 */
function computeRec(dao, a, asOf, entered) {
  const book = bookBalance(dao, a, asOf);
  const given = entered !== undefined && entered !== null && entered !== "";
  const warnings = [];
  if (a.getString("kind") === "cash") {
    const counted = given ? r0(entered) : book;
    return {
      kind: "cash", book_balance: book, statement_balance: counted, statement_balance_computed: book, covered: true, has_statement: true,
      outstanding_receipts: 0, outstanding_payments: 0, unrecorded_receipts: 0, unrecorded_payments: 0,
      adjusted_bank_balance: counted, adjusted_book_balance: book, difference: counted - book, items: [], warnings,
    };
  }
  const staleDays = settings(dao).staleDays;
  const sb = statementBalanceAt(dao, a, asOf);
  if (!sb.statement) warnings.push(`No bank statement is imported for ${showDay(asOf)}; import it under Bank statements.`);
  else if (!sb.covered) warnings.push(`Statements are imported up to ${showDay(sb.through)} only.`);
  const computed = sb.balance === null ? 0 : sb.balance;
  const stmt = given ? r0(entered) : computed;
  if (sb.statement && stmt !== computed) warnings.push(`The statement balance entered (${fmt(stmt)}) differs from the imported statement lines (${fmt(computed)}) by ${fmt(stmt - computed)}.`);

  const entries = dao.findRecordsByFilter("cash_book_entries", "account = {:a} && reconciliation = ''", "entry_date", 50000, 0, { a: a.id }) || [];
  const lines = dao.findRecordsByFilter("bank_statement_lines", "account = {:a} && reconciliation = ''", "txn_date,line_no", 50000, 0, { a: a.id }) || [];
  const groupMax = {};
  const note = (g, d) => {
    if (g && (!groupMax[g] || d > groupMax[g])) groupMax[g] = d;
  };
  for (const e of entries) note(e.getString("match_group"), entryDay(e));
  for (const l of lines) note(l.getString("match_group"), lineDay(l));
  const open = (g) => !g || groupMax[g] > asOf;
  const items = [];
  for (const e of entries) if (entryDay(e) <= asOf && open(e.getString("match_group"))) items.push(itemOf(e, "book", asOf, staleDays));
  for (const l of lines) if (lineDay(l) <= asOf && open(l.getString("match_group"))) items.push(itemOf(l, "bank", asOf, staleDays));
  const total = (side, dir) => items.filter((i) => i.side === side && i.direction === dir).reduce((s, i) => s + i.amount, 0);
  const or = total("book", "in");
  const op = total("book", "out");
  const ur = total("bank", "in");
  const up = total("bank", "out");
  const adjBank = stmt + or - op;
  const adjBook = book + ur - up;
  return {
    kind: "bank", book_balance: book, statement_balance: stmt, statement_balance_computed: computed, covered: sb.covered, has_statement: Boolean(sb.statement),
    statement_through: sb.through, outstanding_receipts: or, outstanding_payments: op, unrecorded_receipts: ur, unrecorded_payments: up,
    adjusted_bank_balance: adjBank, adjusted_book_balance: adjBook, difference: adjBank - adjBook, items, warnings,
  };
}

function applyRec(r, fig) {
  for (const k of ["book_balance", "statement_balance", "statement_balance_computed", "outstanding_receipts", "outstanding_payments", "unrecorded_receipts", "unrecorded_payments", "adjusted_bank_balance", "adjusted_book_balance", "difference"]) r.set(k, fig[k]);
  r.set("item_count", fig.items.length);
  r.set("items", fig.items);
  r.set("warnings", fig.warnings);
}

const REC_SYSTEM = ["number", "status", "prepared_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "cancel_reason", "period"];

function checkRecDate(dao, r, a) {
  const asOf = toDay(r.getString("as_of"));
  if (!asOf) throw new BadRequestError("Enter the statement date the reconciliation is made at.");
  if (asOf > todayStr()) throw new BadRequestError("The reconciliation date cannot be in the future.");
  const od = day(a.getString("opening_date"));
  if (asOf < od) throw new BadRequestError(`${accountLabel(a)} starts on ${showDay(od)}.`);
  const last = lastApproved(dao, a.id);
  if (last && asOf <= day(last.getString("as_of"))) throw new BadRequestError(`${accountLabel(a)} is already reconciled up to ${showDay(last.getString("as_of"))} (${last.getString("number")}).`);
  const open = (dao.findRecordsByFilter("bank_reconciliations", "account = {:a} && id != {:id} && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 1, 0, { a: a.id, id: r.id || "" }) || [])[0];
  if (open) throw new BadRequestError(`${open.getString("number")} (as of ${showDay(open.getString("as_of"))}) is still open for this account; finish or cancel it first.`);
  r.set("as_of", noon(asOf));
  const p = masterdata.periodFor(dao, noon(asOf));
  r.set("period", p ? p.id : "");
  return asOf;
}

function beforeCreateRec(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "prepare_bank_reconciliation", "prepare bank reconciliations");
  const r = e.record;
  for (const f of REC_SYSTEM) r.set(f, "");
  r.set("status", "draft");
  if (auth) r.set("prepared_by", auth.id);
  const a = load(dao, "bank_accounts", r.getString("account"), "Account");
  const asOf = checkRecDate(dao, r, a);
  r.set("notes", String(r.getString("notes") || "").trim());
  applyRec(r, computeRec(dao, a, asOf, r.get("statement_balance") === null ? "" : r.getInt("statement_balance")));
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "bank_reconciliation");
  });
  r.set("number", n);
}

function beforeUpdateRec(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "prepare_bank_reconciliation", "edit bank reconciliations");
  const r = e.record;
  const before = r.originalCopy();
  if (auth && EDITABLE.indexOf(before.getString("status")) === -1) throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  for (const f of REC_SYSTEM) r.set(f, before.get(f));
  r.set("account", before.getString("account"));
  const a = load(dao, "bank_accounts", r.getString("account"), "Account");
  const asOf = checkRecDate(dao, r, a);
  applyRec(r, computeRec(dao, a, asOf, r.getInt("statement_balance")));
  e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, r, ["as_of", "statement_balance", "difference", "notes"])));
}

/** Recalculates a draft after matches or new entries. */
function refreshRec(dao, id, actor) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "update bank reconciliations");
  const r = load(dao, "bank_reconciliations", id, "Reconciliation");
  if (EDITABLE.indexOf(r.getString("status")) === -1) return r;
  const a = load(dao, "bank_accounts", r.getString("account"), "Account");
  applyRec(r, computeRec(dao, a, day(r.getString("as_of")), r.getInt("statement_balance")));
  dao.saveRecord(r);
  return r;
}

function submitRec(dao, id, actor, meta) {
  core.requirePermission(dao, actor, "prepare_bank_reconciliation", "submit bank reconciliations");
  const r = load(dao, "bank_reconciliations", id, "Reconciliation");
  if (EDITABLE.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is already ${r.getString("status").replace(/_/g, " ")}.`);
  const a = load(dao, "bank_accounts", r.getString("account"), "Account");
  const asOf = day(r.getString("as_of"));
  const fig = computeRec(dao, a, asOf, r.getInt("statement_balance"));
  applyRec(r, fig);
  if (fig.kind === "bank" && !fig.has_statement) throw new BadRequestError(`Import the bank statement covering ${showDay(asOf)} first.`);
  if (fig.kind === "bank" && !fig.covered) throw new BadRequestError(`Import the bank statement up to ${showDay(asOf)} first (imported up to ${showDay(fig.statement_through)}).`);
  if (fig.difference !== 0) {
    throw new BadRequestError(fig.kind === "cash"
      ? `The cash counted (${fmt(fig.statement_balance)}) differs from the cash book (${fmt(fig.book_balance)}) by ${fmt(fig.difference)}. Record the shortage or surplus first.`
      : `The reconciliation does not balance: adjusted bank balance ${fmt(fig.adjusted_bank_balance)}, adjusted cash book balance ${fmt(fig.adjusted_book_balance)}, difference ${fmt(fig.difference)}. Match the remaining items, record bank charges and interest, or check the statement balance.`);
  }
  // an item already matched to a later statement line is a timing difference by definition
  const missing = fig.items.filter((i) => !i.follow_up && !i.matched_later).length;
  if (missing) throw new BadRequestError(`${missing} reconciling item${missing === 1 ? " has" : "s have"} no follow-up yet; say what happens to each (timing difference, to investigate, to record, error to correct).`);
  dao.saveRecord(r);
  return require("./approvals.js").start(dao, "bank_reconciliation", r, actor, meta);
}

/** Final approval: the figures must be those submitted; the matches it covers are then locked. */
function onRecApproved(dao, r, actor) {
  const a = load(dao, "bank_accounts", r.getString("account"), "Account");
  const asOf = day(r.getString("as_of"));
  const fig = computeRec(dao, a, asOf, r.getInt("statement_balance"));
  const same = ["book_balance", "statement_balance_computed", "outstanding_receipts", "outstanding_payments", "unrecorded_receipts", "unrecorded_payments", "difference"].every((k) => fig[k] === r.getInt(k)) && fig.items.length === r.getInt("item_count");
  if (!same) throw new BadRequestError(`${r.getString("number")} changed since it was submitted (new transactions or matches up to ${showDay(asOf)}). Return it so the preparer can refresh it.`);
  if (a.getString("kind") === "bank") {
    const entries = dao.findRecordsByFilter("cash_book_entries", "account = {:a} && reconciliation = '' && match_group != ''", "", 50000, 0, { a: a.id }) || [];
    const lines = dao.findRecordsByFilter("bank_statement_lines", "account = {:a} && reconciliation = '' && match_group != ''", "", 50000, 0, { a: a.id }) || [];
    const groupMax = {};
    for (const x of entries) groupMax[x.getString("match_group")] = [groupMax[x.getString("match_group")] || "", entryDay(x)].sort().pop();
    for (const x of lines) groupMax[x.getString("match_group")] = [groupMax[x.getString("match_group")] || "", lineDay(x)].sort().pop();
    for (const x of entries.concat(lines)) {
      if (groupMax[x.getString("match_group")] <= asOf) {
        x.set("reconciliation", r.id);
        dao.saveRecord(x);
      }
    }
    for (const s of dao.findRecordsByFilter("bank_statements", "account = {:a} && statement_to <= {:t} && status = 'imported'", "", 500, 0, { a: a.id, t: endOf(asOf) }) || []) {
      s.set("status", "reconciled");
      dao.saveRecord(s);
    }
  } else {
    for (const x of dao.findRecordsByFilter("cash_book_entries", "account = {:a} && reconciliation = '' && entry_date <= {:t}", "", 50000, 0, { a: a.id, t: endOf(asOf) }) || []) {
      x.set("reconciliation", r.id);
      dao.saveRecord(x);
    }
  }
  refreshAccount(dao, a.id);
  core.notify(dao, [r.getString("prepared_by")].filter((x) => x && (!actor || x !== actor.id)), {
    title: `${r.getString("number")} approved`, body: `${accountLabel(a)} reconciled as of ${showDay(asOf)}`, link: `/dashboard/treasury/reconciliations/${r.id}`, type: "success",
  });
}

function cancelRec(dao, id, actor, reason, meta) {
  const r = load(dao, "bank_reconciliations", id, "Reconciliation");
  if (!core.can(dao, actor, "prepare_bank_reconciliation") && !core.can(dao, actor, "approve_bank_reconciliation")) throw new ForbiddenError("You don't have permission to cancel reconciliations.");
  if (OPEN_DOC.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")} and cannot be cancelled.`);
  if (!String(reason || "").trim()) throw new BadRequestError("Give a reason for cancelling.");
  require("./approvals.js").cancel(dao, "bank_reconciliation", r, actor, String(reason).trim(), meta);
  return r;
}

/** Preview without saving (the reconciliation screen and the "prepare" dialog). */
function preview(dao, actor, accountId, asOf, entered) {
  requireView(dao, actor);
  const a = load(dao, "bank_accounts", accountId, "Account");
  const d = toDay(asOf) || todayStr();
  const fig = computeRec(dao, a, d, entered);
  const last = lastApproved(dao, a.id);
  return { account: a.id, as_of: d, ...fig, last_reconciled: last ? { id: last.id, number: last.getString("number"), as_of: day(last.getString("as_of")) } : null };
}

// ------------------------------------------------------------------ screens
function entryJson(e) {
  return {
    id: e.id, kind: "entry", date: entryDay(e), direction: e.getString("direction"), amount: e.getInt("amount"), type: e.getString("type"), method: e.getString("method"),
    reference: e.getString("reference"), counterparty: e.getString("counterparty"), description: e.getString("description"), source_type: e.getString("source_type"),
    source_id: e.getString("source_id"), source_number: e.getString("source_number"), reversed: e.getBool("reversed"), reversal_of: e.getString("reversal_of"),
    match_group: e.getString("match_group"), match_method: e.getString("match_method"), reconciliation: e.getString("reconciliation"),
    follow_up: e.getString("follow_up"), follow_up_note: e.getString("follow_up_note"),
  };
}
function lineJson(l) {
  return {
    id: l.id, kind: "line", date: lineDay(l), direction: l.getString("direction"), amount: l.getInt("amount"), reference: l.getString("reference"),
    description: l.getString("description"), statement: l.getString("statement"), line_no: l.getInt("line_no"), balance: l.getInt("balance"), has_balance: l.getBool("has_balance"),
    match_group: l.getString("match_group"), match_method: l.getString("match_method"), reconciliation: l.getString("reconciliation"),
    follow_up: l.getString("follow_up"), follow_up_note: l.getString("follow_up_note"),
  };
}

/** Matching screen: unmatched lines and entries, recent matches that can still be undone, and the live reconciliation. */
function workspace(dao, actor, accountId, asOf) {
  requireView(dao, actor);
  const a = load(dao, "bank_accounts", accountId, "Account");
  const d = toDay(asOf) || todayStr();
  const entries = (dao.findRecordsByFilter("cash_book_entries", "account = {:a} && match_group = ''", "entry_date", 5000, 0, { a: a.id }) || []).map(entryJson);
  const lines = (dao.findRecordsByFilter("bank_statement_lines", "account = {:a} && match_group = ''", "txn_date,line_no", 5000, 0, { a: a.id }) || []).map(lineJson);
  const recentE = dao.findRecordsByFilter("cash_book_entries", "account = {:a} && match_group != '' && reconciliation = ''", "-matched_at", 400, 0, { a: a.id }) || [];
  const recentL = dao.findRecordsByFilter("bank_statement_lines", "account = {:a} && match_group != '' && reconciliation = ''", "-matched_at", 400, 0, { a: a.id }) || [];
  const groups = {};
  const users = {};
  const who = (id) => {
    if (!id) return "";
    if (users[id] === undefined) users[id] = nameOf(dao, "users", id);
    return users[id];
  };
  for (const e of recentE) {
    const g = (groups[e.getString("match_group")] = groups[e.getString("match_group")] || { group: e.getString("match_group"), method: e.getString("match_method"), matched_at: e.getString("matched_at"), matched_by: who(e.getString("matched_by")), entries: [], lines: [] });
    g.entries.push(entryJson(e));
  }
  for (const l of recentL) {
    const g = (groups[l.getString("match_group")] = groups[l.getString("match_group")] || { group: l.getString("match_group"), method: l.getString("match_method"), matched_at: l.getString("matched_at"), matched_by: who(l.getString("matched_by")), entries: [], lines: [] });
    g.lines.push(lineJson(l));
  }
  const statements = (dao.findRecordsByFilter("bank_statements", "account = {:a}", "-statement_from", 24, 0, { a: a.id }) || []).map((s) => ({
    id: s.id, number: s.getString("number"), from: day(s.getString("statement_from")), to: day(s.getString("statement_to")), opening_balance: s.getInt("opening_balance"),
    closing_balance: s.getInt("closing_balance"), line_count: s.getInt("line_count"), matched_count: s.getInt("matched_count"), status: s.getString("status"),
  }));
  const open = (dao.findRecordsByFilter("bank_reconciliations", "account = {:a} && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "-as_of", 1, 0, { a: a.id }) || [])[0];
  return {
    account: accountJson(dao, a), as_of: d, entries, lines,
    matches: Object.values(groups).sort((x, y) => (x.matched_at < y.matched_at ? 1 : -1)).slice(0, 60),
    statements, reconciliation: preview(dao, actor, a.id, d, ""), open_reconciliation: open ? { id: open.id, number: open.getString("number"), as_of: day(open.getString("as_of")), status: open.getString("status") } : null,
    match_days: settings(dao).matchDays,
  };
}

function accountJson(dao, a) {
  return {
    id: a.id, code: a.getString("code"), name: a.getString("name"), kind: a.getString("kind"), bank_name: a.getString("bank_name"), branch: a.getString("branch"),
    account_number: a.getString("account_number"), account_name: a.getString("account_name"), status: a.getString("status"), is_default: a.getBool("is_default"),
    funding_source: a.getString("funding_source"), funding_name: nameOf(dao, "funding_sources", a.getString("funding_source")), gl_account: a.getString("gl_account"),
    gl_code: nameOf(dao, "gl_accounts", a.getString("gl_account"), "code"), opening_balance: a.getInt("opening_balance"), opening_date: day(a.getString("opening_date")),
    book_balance: a.getInt("book_balance"), statement_balance: a.getInt("statement_balance"), statement_date: day(a.getString("statement_date")),
    reconciled_to: day(a.getString("reconciled_to")), reconciled_balance: a.getInt("reconciled_balance"), unmatched_book: a.getInt("unmatched_book"), unmatched_bank: a.getInt("unmatched_bank"),
    custodian: a.getString("custodian"), custodian_name: nameOf(dao, "users", a.getString("custodian")), cash_limit: a.getInt("cash_limit"), last_entry_date: day(a.getString("last_entry_date")),
    statement_mapping: a.get("statement_mapping"),
  };
}

/** Cash position: every account with its balances, month-end totals of the fiscal year, this month's flows and the work waiting. */
function position(dao, actor) {
  requireView(dao, actor);
  const today = todayStr();
  const accounts = (dao.findRecordsByFilter("bank_accounts", "id != ''", "kind,code", 200, 0) || []).map((a) => accountJson(dao, a));
  const shown = accounts.filter((a) => a.status === "active" || a.book_balance !== 0);
  const sum = (list) => list.reduce((s, a) => s + a.book_balance, 0);
  const totals = {
    total: sum(shown), bank: sum(shown.filter((a) => a.kind === "bank")), cash: sum(shown.filter((a) => a.kind === "cash")),
    restricted: sum(shown.filter((a) => a.funding_source)), unrestricted: sum(shown.filter((a) => !a.funding_source)),
  };
  let fyStart = "";
  try {
    fyStart = day(dao.findFirstRecordByFilter("fiscal_years", "is_current = true").getString("start_date"));
  } catch (_) {}
  if (!fyStart) fyStart = `${today.slice(0, 4)}-01-01`;
  const months = [];
  let y = Number(fyStart.slice(0, 4));
  let m = Number(fyStart.slice(5, 7));
  for (let i = 0; i < 12; i++) {
    const first = `${y}-${pad(m)}-01`;
    if (first > today) break;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = last < today ? last : today;
    const byAccount = {};
    let total = 0;
    for (const a of shown) {
      const rec = dao.findRecordById("bank_accounts", a.id);
      const bal = end < a.opening_date ? 0 : bookBalance(dao, rec, end);
      byAccount[a.id] = bal;
      total += bal;
    }
    months.push({ month: `${y}-${pad(m)}`, label: `${MONTHS[m - 1]} ${y}`, end, total, accounts: byAccount });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  const mStart = `${today.slice(0, 7)}-01`;
  const flows = arrayOf(new DynamicModel({ t: "", d: "", s: 0 }));
  dao.db().newQuery("SELECT type AS t, direction AS d, COALESCE(SUM(amount), 0) AS s FROM cash_book_entries WHERE entry_date >= {:f} AND entry_date <= {:t} GROUP BY type, direction").bind({ f: startOf(mStart), t: endOf(today) }).all(flows);
  const flow = (type, dir) => flows.filter((x) => x.t === type && x.d === dir).reduce((s, x) => s + r0(x.s), 0);
  const thisMonth = {
    receipts: flow("receipt", "in") - flow("receipt", "out"), payments: flow("payment", "out") - flow("payment", "in"),
    charges: flow("bank_charge", "out"), interest: flow("interest", "in"), transfers: flow("transfer_out", "out"),
  };
  const count = (col, filter) => scalar(dao, `SELECT COUNT(*) AS n FROM ${col} WHERE ${filter}`, {});
  const pending = {
    receipts: count("cash_receipts", "status = 'pending_approval'"), transfers: count("bank_transfers", "status = 'pending_approval'"),
    reconciliations: count("bank_reconciliations", "status = 'pending_approval'"),
    drafts: count("cash_receipts", "status IN ('draft','returned')") + count("bank_transfers", "status IN ('draft','returned')"),
    to_pay: count("payment_vouchers", "status = 'approved'"),
  };
  const lastMonthEnd = addDays(mStart, -1);
  const due = shown.filter((a) => a.status === "active" && a.opening_date <= lastMonthEnd && (!a.reconciled_to || a.reconciled_to < lastMonthEnd)).map((a) => ({ id: a.id, code: a.code, name: a.name, kind: a.kind, reconciled_to: a.reconciled_to, due: lastMonthEnd }));
  return { generated_at: new Date().toISOString(), today, accounts, totals, months, this_month: thisMonth, pending, due };
}

// ------------------------------------------------------------------ reports
function names(dao, col, field) {
  const out = {};
  for (const r of dao.findRecordsByFilter(col, "id != ''", "", 20000, 0) || []) out[r.id] = r.getString(field || "name");
  return out;
}
const total = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const SOURCE_LINK = {
  cash_receipt: (id) => `/dashboard/treasury/receipts/${id}`, bank_transfer: (id) => `/dashboard/treasury/transfers/${id}`, payment_voucher: (id) => `/dashboard/finance/vouchers/${id}`,
};

function accountsFor(dao, f) {
  const all = dao.findRecordsByFilter("bank_accounts", "id != ''", "kind,code", 200, 0) || [];
  return f.account ? all.filter((a) => a.id === f.account) : all;
}

const REPORTS = {
  cash_position: {
    title: "Cash position",
    run: (dao, f) => {
      const asOf = f.to || todayStr();
      const fund = names(dao, "funding_sources");
      const rows = [];
      for (const a of accountsFor(dao, f)) {
        const bal = asOf < day(a.getString("opening_date")) ? 0 : bookBalance(dao, a, asOf);
        if (a.getString("status") !== "active" && !bal) continue;
        const sb = a.getString("kind") === "bank" ? statementBalanceAt(dao, a, asOf) : null;
        const last = lastApproved(dao, a.id);
        rows.push({
          account: accountLabel(a), kind: a.getString("kind") === "cash" ? "Cash book" : "Bank", bank: a.getString("bank_name"), number: a.getString("account_number"),
          funding: a.getString("funding_source") ? `${fund[a.getString("funding_source")] || "Restricted"} (restricted)` : "Unrestricted",
          book: bal, statement: sb && sb.balance !== null ? sb.balance : null, statement_to: sb ? sb.through : "", reconciled_to: last ? day(last.getString("as_of")) : "",
          link: `/dashboard/treasury/accounts/${a.id}`,
        });
      }
      return { columns: [["account", "Account"], ["kind", "Type"], ["bank", "Bank"], ["number", "Account number"], ["funding", "Funds"], ["book", "Cash book balance", "money"], ["statement", "Bank statement balance", "money"], ["statement_to", "Statement to", "date"], ["reconciled_to", "Reconciled to", "date"]], rows, totals: { book: total(rows, "book") }, note: `Cash book balance = opening balance + every receipt, payment, transfer and bank charge recorded up to ${asOf}.` };
    },
  },
  transaction_summary: {
    title: "Bank transaction summary",
    run: (dao, f) => {
      const from = f.from || `${todayStr().slice(0, 4)}-01-01`;
      const to = f.to || todayStr();
      const rows = [];
      for (const a of accountsFor(dao, f)) {
        const opening = from <= day(a.getString("opening_date")) ? a.getInt("opening_balance") : bookBalance(dao, a, addDays(from, -1));
        const sums = arrayOf(new DynamicModel({ t: "", d: "", s: 0 }));
        dao.db().newQuery("SELECT type AS t, direction AS d, COALESCE(SUM(amount), 0) AS s FROM cash_book_entries WHERE account = {:a} AND entry_date >= {:f} AND entry_date <= {:t} GROUP BY type, direction").bind({ a: a.id, f: startOf(from), t: endOf(to) }).all(sums);
        const s = (type, dir) => sums.filter((x) => (!type || x.t === type) && x.d === dir).reduce((acc, x) => acc + r0(x.s), 0);
        const allIn = s("", "in");
        const allOut = s("", "out");
        if (a.getString("status") !== "active" && !opening && !allIn && !allOut) continue;
        const receipts = s("receipt", "in") - s("receipt", "out");
        const payments = s("payment", "out") - s("payment", "in");
        const tin = s("transfer_in", "in") - s("transfer_in", "out");
        const tout = s("transfer_out", "out") - s("transfer_out", "in");
        const other = allIn - allOut - receipts + payments - tin + tout;
        rows.push({ account: accountLabel(a), opening, receipts, transfers_in: tin, payments, transfers_out: tout, other, closing: opening + allIn - allOut, link: `/dashboard/treasury/accounts/${a.id}` });
      }
      const t = {};
      for (const k of ["opening", "receipts", "transfers_in", "payments", "transfers_out", "other", "closing"]) t[k] = total(rows, k);
      return { columns: [["account", "Account"], ["opening", "Opening balance", "money"], ["receipts", "Receipts", "money"], ["transfers_in", "Transfers in", "money"], ["payments", "Payments", "money"], ["transfers_out", "Transfers out", "money"], ["other", "Charges, interest, other (net)", "money"], ["closing", "Closing balance", "money"]], rows, totals: t, note: `From ${from} to ${to}. Opening + receipts + transfers in − payments − transfers out + other = closing.` };
    },
  },
  cash_book: {
    title: "Cash book",
    run: (dao, f) => {
      if (!f.account) throw new BadRequestError("Choose the account.");
      const a = load(dao, "bank_accounts", f.account, "Account");
      const od = day(a.getString("opening_date"));
      const from = f.from && f.from > od ? f.from : od;
      const to = f.to || todayStr();
      let bal = from <= od ? a.getInt("opening_balance") : bookBalance(dao, a, addDays(from, -1));
      const rows = [{ date: from, number: "", type: "", description: from <= od ? "Opening balance" : "Balance brought forward", reference: "", money_in: null, money_out: null, balance: bal, status: "" }];
      const recs = names(dao, "bank_reconciliations", "number");
      for (const e of dao.findRecordsByFilter("cash_book_entries", "account = {:a} && entry_date >= {:f} && entry_date <= {:t}", "entry_date,created", 20000, 0, { a: a.id, f: startOf(from), t: endOf(to) }) || []) {
        const amt = e.getInt("amount");
        bal += signed(e.getString("direction"), amt);
        const link = SOURCE_LINK[e.getString("source_type")];
        rows.push({
          date: entryDay(e), number: e.getString("source_number"), type: TYPE_LABEL[e.getString("type")] || e.getString("type"), description: [e.getString("counterparty"), e.getString("description")].filter(Boolean).join(" · "),
          reference: e.getString("reference"), money_in: e.getString("direction") === "in" ? amt : null, money_out: e.getString("direction") === "out" ? amt : null, balance: bal,
          status: e.getString("reconciliation") ? `Reconciled (${recs[e.getString("reconciliation")] || ""})` : e.getString("match_group") ? "On statement" : a.getString("kind") === "cash" ? "" : "Not yet on statement",
          link: link ? link(e.getString("source_id")) : "",
        });
      }
      const flows = rows.slice(1);
      return { columns: [["date", "Date", "date"], ["number", "Document"], ["type", "Type"], ["description", "Payee / payer · description"], ["reference", "Reference"], ["money_in", "Money in", "money"], ["money_out", "Money out", "money"], ["balance", "Balance", "money"], ["status", "Status"]], rows, totals: { money_in: total(flows, "money_in"), money_out: total(flows, "money_out") }, note: `${accountLabel(a)} from ${from} to ${to}; closing balance ${fmt(bal)}.` };
    },
  },
  unreconciled: {
    title: "Unreconciled items",
    run: (dao, f) => {
      const asOf = f.to || todayStr();
      const rows = [];
      for (const a of accountsFor(dao, f)) {
        if (a.getString("kind") !== "bank") continue;
        for (const i of computeRec(dao, a, asOf, "").items) {
          rows.push({
            account: a.getString("code"), side: i.side === "book" ? (i.direction === "in" ? "Receipt not yet on statement" : "Payment not yet on statement") : i.direction === "in" ? "Bank credit not in cash book" : "Bank debit not in cash book",
            date: i.date, description: [i.counterparty, i.description].filter(Boolean).join(" · "), reference: i.reference || i.source_number, amount: i.amount, age: i.age,
            follow_up: FOLLOW_UP_LABEL[i.follow_up] || "not reviewed",
            note: i.follow_up_note, link: i.side === "book" && SOURCE_LINK[i.source_type] ? SOURCE_LINK[i.source_type](i.source_id) : `/dashboard/treasury/reconcile/${a.id}`,
          });
        }
      }
      rows.sort((x, y) => y.age - x.age);
      return { columns: [["account", "Account"], ["side", "Item"], ["date", "Date", "date"], ["description", "Description"], ["reference", "Reference"], ["amount", "Amount", "money"], ["age", "Days old", "number"], ["follow_up", "Follow-up", "status"], ["note", "Note"]], rows, totals: { amount: total(rows, "amount") }, note: `Items dated up to ${asOf} that are on one side only (cash book or bank statement).` };
    },
  },
  receipts_register: {
    title: "Receipts register",
    run: (dao, f) => {
      const from = f.from || `${todayStr().slice(0, 4)}-01-01`;
      const to = f.to || todayStr();
      const gl = names(dao, "gl_accounts", "code");
      const glName = names(dao, "gl_accounts");
      const fund = names(dao, "funding_sources");
      const acc = names(dao, "bank_accounts", "code");
      const rows = (dao.findRecordsByFilter("cash_receipts", "(status = 'approved' || status = 'reversed') && receipt_date >= {:f} && receipt_date <= {:t}", "receipt_date", 20000, 0, { f: startOf(from), t: endOf(to) }) || [])
        .filter((r) => !f.account || r.getString("account") === f.account)
        .map((r) => ({
          number: r.getString("number"), date: day(r.getString("receipt_date")), payer: r.getString("payer_name"), income: `${gl[r.getString("income_account")] || ""} ${glName[r.getString("income_account")] || ""}`.trim(),
          funding: fund[r.getString("funding_source")] || "", account: acc[r.getString("account")] || "", method: METHOD_LABEL[r.getString("method")] || r.getString("method"), reference: r.getString("reference"),
          amount: r.getString("status") === "reversed" ? 0 : r.getInt("amount"), status: r.getString("status") === "reversed" ? "reversed" : "posted", link: `/dashboard/treasury/receipts/${r.id}`,
        }));
      return { columns: [["number", "Receipt"], ["date", "Date", "date"], ["payer", "Received from"], ["income", "Income / account"], ["funding", "Funding source"], ["account", "Into"], ["method", "Method"], ["reference", "Reference"], ["amount", "Amount", "money"], ["status", "Status", "status"]], rows, totals: { amount: total(rows, "amount") }, note: "Posted receipts in the period; reversed receipts count as nil." };
    },
  },
  reconciliation_register: {
    title: "Reconciliation register",
    run: (dao, f) => {
      const users = names(dao, "users");
      const acc = names(dao, "bank_accounts", "code");
      const rows = (dao.findRecordsByFilter("bank_reconciliations", "status != 'cancelled'", "-as_of", 5000, 0) || [])
        .filter((r) => !f.account || r.getString("account") === f.account)
        .filter((r) => (!f.from || day(r.getString("as_of")) >= f.from) && (!f.to || day(r.getString("as_of")) <= f.to))
        .map((r) => ({
          number: r.getString("number"), account: acc[r.getString("account")] || "", as_of: day(r.getString("as_of")), statement: r.getInt("statement_balance"), book: r.getInt("book_balance"),
          items: r.getInt("item_count"), difference: r.getInt("difference"), status: r.getString("status"), prepared_by: users[r.getString("prepared_by")] || "", approved_at: day(r.getString("approved_at")),
          link: `/dashboard/treasury/reconciliations/${r.id}`,
        }));
      return { columns: [["number", "Reconciliation"], ["account", "Account"], ["as_of", "As of", "date"], ["statement", "Bank / counted", "money"], ["book", "Cash book", "money"], ["items", "Reconciling items", "number"], ["difference", "Difference", "money"], ["status", "Status", "status"], ["prepared_by", "Prepared by"], ["approved_at", "Approved", "date"]], rows, totals: {} };
    },
  },
};

function report(dao, actor, key, f) {
  requireView(dao, actor);
  const def = REPORTS[key];
  if (!def) throw new NotFoundError(`Unknown report "${key}".`);
  const out = def.run(dao, f);
  return { key, title: def.title, filters: f, generated_at: new Date().toISOString(), columns: out.columns.map(([k, label, type]) => ({ key: k, label, type: type || "text" })), rows: out.rows, totals: out.totals, note: out.note || "" };
}

module.exports = {
  VIEWERS, canView, guardRead, validateAccount, paymentAccount, recordVoucherPayment, assertDateOpen, assertFunds, bookBalance, refreshAccount, postEntry,
  beforeCreateReceipt, beforeUpdateReceipt, beforeDeleteDraft, submitReceipt, onReceiptApproved, cancelDoc, reverseDoc,
  beforeCreateTransfer, beforeUpdateTransfer, submitTransfer, onTransferApproved,
  importStatement, deleteStatement, match, unmatch, autoMatch, recordFromLine, setFollowUp,
  beforeCreateRec, beforeUpdateRec, refreshRec, submitRec, onRecApproved, cancelRec, preview, computeRec,
  workspace, position, report, accountJson, toDay, showDay,
};
