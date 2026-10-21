/// <reference path="../../pb_data/types.d.ts" />
/**
 * General ledger core. Modules post balanced journals here (payroll now; vouchers, receipts, depreciation and
 * manual journals later). A posted journal is never edited or deleted: it is reversed by an opposite journal.
 * Each line carries the account and the dimensions (department, funding source, project, budget line,
 * cost centre) so the trial balance and the donor reports can be cut any way.
 *
 * Which account an automatic posting uses comes from posting_accounts (Setup → Posting accounts); when a key
 * is not configured the default chart-of-accounts code below is used.
 */
const core = require("./core.js");
/** 1234567 → "1,234,567" (the JS engine has no locale formatting). */
const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const masterdata = require("./masterdata.js");

/** key → [default account code, label, module] */
const POSTING = {
  "payroll.basic": ["5101", "Basic salaries", "payroll"],
  "payroll.allowances": ["5102", "Allowances", "payroll"],
  "payroll.employer_pension": ["5103", "Employer pension contribution", "payroll"],
  "payroll.employer_maternity": ["5104", "Employer maternity leave contribution", "payroll"],
  "payroll.employer_occ_hazard": ["5105", "Occupational hazards contribution", "payroll"],
  "payroll.employer_medical": ["5106", "Employer medical insurance contribution", "payroll"],
  "payroll.net_payable": ["2103", "Net salaries payable", "payroll"],
  "payroll.paye_payable": ["2104", "PAYE payable (RRA)", "payroll"],
  "payroll.pension_payable": ["2105", "Pension contributions payable (RSSB)", "payroll"],
  "payroll.maternity_payable": ["2106", "Maternity contributions payable (RSSB)", "payroll"],
  "payroll.cbhi_payable": ["2107", "CBHI contributions payable (RSSB)", "payroll"],
  "payroll.occ_hazard_payable": ["2112", "Occupational hazards contributions payable (RSSB)", "payroll"],
  "payroll.medical_payable": ["2113", "Medical insurance contributions payable (RSSB)", "payroll"],
  "payroll.advances": ["1120", "Salary advances recovered", "payroll"],
  "payroll.loans": ["1121", "Staff loan instalments recovered", "payroll"],
  "payroll.other_deductions": ["2111", "Other deductions payable", "payroll"],
  "payables.ap": ["2101", "Accounts payable — suppliers", "payables"],
  "payables.wht": ["2108", "Withholding tax payable (RRA)", "payables"],
  "treasury.opening_equity": ["3101", "Opening balances (accumulated surplus)", "treasury"],
  "assets.grni": ["2114", "Assets received, not yet invoiced", "assets"],
  "assets.donated": ["2201", "Donated assets (deferred capital grants)", "assets"],
  "assets.opening_equity": ["3101", "Fixed assets at go-live (accumulated surplus)", "assets"],
  "assets.disposal_proceeds": ["1111", "Disposal proceeds receivable", "assets"],
  "assets.disposal_gain": ["4205", "Gain on disposal of assets", "assets"],
  "assets.disposal_loss": ["5501", "Loss on disposal of assets", "assets"],
};

const r0 = (n) => Math.round(Number(n) || 0);
const day = (v) => String(v || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;

function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

/** The GL account a posting key uses: Setup → Posting accounts, else the default code. */
function accountFor(dao, key) {
  const def = POSTING[key];
  if (!def) throw new BadRequestError(`Unknown posting "${key}".`);
  let acc = null;
  const cfg = (dao.findRecordsByFilter("posting_accounts", "key = {:k}", "", 1, 0, { k: key }) || [])[0];
  if (cfg && cfg.getString("account")) acc = load(dao, "gl_accounts", cfg.getString("account"), "GL account");
  if (!acc) acc = (dao.findRecordsByFilter("gl_accounts", "code = {:c}", "", 1, 0, { c: def[0] }) || [])[0] || null;
  if (!acc) throw new BadRequestError(`No GL account is set for "${def[1]}". Set it in Setup → Posting accounts.`);
  if (!acc.getBool("is_posting") || !acc.getBool("active")) {
    throw new BadRequestError(`${acc.getString("code")} ${acc.getString("name")} (used for "${def[1]}") is not an active posting account. Change it in Setup → Posting accounts.`);
  }
  return acc;
}

const DIMS = ["department", "funding_source", "project", "budget_line", "cost_centre"];

/**
 * Posts a balanced journal. lines: [{ account (id), debit, credit, description, department, funding_source,
 * project, budget_line, cost_centre }]. Lines with the same account, side and dimensions are merged.
 */
function post(dao, o) {
  const d = day(o.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestError("A journal needs a date.");
  const period = masterdata.requireOpenPeriod(dao, noon(d), o.what || `the journal for ${o.source.number || o.description}`);
  const merged = {};
  const order = [];
  for (const l of o.lines || []) {
    const debit = r0(l.debit);
    const credit = r0(l.credit);
    if (debit < 0 || credit < 0) throw new BadRequestError("Journal amounts are positive; put them on the other side instead.");
    if (!debit && !credit) continue;
    if (debit && credit) throw new BadRequestError("A journal line is either a debit or a credit.");
    if (!l.account) throw new BadRequestError("Every journal line needs an account.");
    const side = debit ? "d" : "c";
    const k = [l.account, side, ...DIMS.map((x) => l[x] || "")].join("|");
    if (!merged[k]) {
      merged[k] = { ...l, debit: 0, credit: 0 };
      order.push(k);
    }
    merged[k].debit += debit;
    merged[k].credit += credit;
  }
  const lines = order.map((k) => merged[k]);
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (!lines.length || !totalDebit) throw new BadRequestError("The journal has no amounts.");
  if (totalDebit !== totalCredit) throw new BadRequestError(`The journal does not balance: debits ${num(totalDebit)}, credits ${num(totalCredit)}.`);
  const accounts = {};
  for (const l of lines) {
    if (accounts[l.account]) continue;
    const a = load(dao, "gl_accounts", l.account, "GL account");
    if (!a.getBool("is_posting")) throw new BadRequestError(`${a.getString("code")} ${a.getString("name")} is a heading, not a posting account.`);
    accounts[l.account] = a;
  }

  const now = new Date().toISOString();
  const j = new Record(dao.findCollectionByNameOrId("gl_journals"));
  j.set("number", core.nextNumber(dao, "journal_entry"));
  j.set("date", noon(d));
  j.set("fiscal_year", period.getString("fiscal_year"));
  j.set("period", period.id);
  j.set("journal_type", o.journalType || "automatic");
  j.set("status", "posted");
  j.set("source_type", o.source.type);
  j.set("source_id", o.source.id || "");
  j.set("source_number", o.source.number || "");
  j.set("description", String(o.description || "").slice(0, 500));
  j.set("total_debit", totalDebit);
  j.set("total_credit", totalCredit);
  j.set("line_count", lines.length);
  j.set("created_by", o.actor ? o.actor.id : "");
  j.set("posted_by", o.actor ? o.actor.id : "");
  j.set("posted_at", now);
  j.set("reversal_of", o.reversalOf || "");
  dao.saveRecord(j);
  const col = dao.findCollectionByNameOrId("gl_journal_lines");
  lines.forEach((l, i) => {
    const r = new Record(col);
    r.set("journal", j.id);
    r.set("line_no", i + 1);
    r.set("account", l.account);
    r.set("debit", l.debit);
    r.set("credit", l.credit);
    r.set("description", String(l.description || o.description || "").slice(0, 300));
    for (const x of DIMS) r.set(x, l[x] || "");
    r.set("date", noon(d));
    r.set("fiscal_year", period.getString("fiscal_year"));
    r.set("period", period.id);
    r.set("source_type", o.source.type);
    r.set("status", "posted");
    dao.saveRecord(r);
  });
  core.audit(dao, { actor: o.actor || null, action: "journal_posted", collection: "gl_journals", recordId: j.id, label: j.getString("number"), comment: `${o.source.number || ""} ${String(o.description || "")}`.trim().slice(0, 300), meta: o.meta });
  return j;
}

/** Reverses a posted journal with an opposite one dated `date` (default today). */
function reverse(dao, journalId, actor, reason, date, meta) {
  const j = load(dao, "gl_journals", journalId, "Journal");
  if (j.getString("status") !== "posted") throw new BadRequestError(`${j.getString("number")} is ${j.getString("status")}; only a posted journal can be reversed.`);
  const why = String(reason || "").trim();
  if (why.length < 5) throw new BadRequestError("Give the reason for the reversal.");
  const lines = dao.findRecordsByFilter("gl_journal_lines", "journal = {:j}", "line_no", 0, 0, { j: j.id }) || [];
  const rev = post(dao, {
    date: day(date) || new Date().toISOString().slice(0, 10), journalType: "reversal", actor, meta,
    source: { type: j.getString("source_type"), id: j.getString("source_id"), number: j.getString("source_number") },
    description: `Reversal of ${j.getString("number")}: ${why}`.slice(0, 500), reversalOf: j.id,
    lines: lines.map((l) => ({ account: l.getString("account"), debit: l.getInt("credit"), credit: l.getInt("debit"), description: l.getString("description"), ...Object.fromEntries(DIMS.map((x) => [x, l.getString(x)])) })),
  });
  j.set("status", "reversed");
  j.set("reversed_by", rev.id);
  j.set("reversal_reason", why);
  dao.saveRecord(j);
  for (const l of lines) {
    l.set("status", "reversed");
    dao.saveRecord(l);
  }
  return rev;
}

/** Journals are finance records: "view_journals", or payroll people for payroll journals' totals. */
function canView(dao, auth) {
  return !auth || core.can(dao, auth, "view_journals") || core.can(dao, auth, "export_ledger") || core.can(dao, auth, "approve_journals");
}
function guardRead(e) {
  const auth = e.httpContext.get("authRecord");
  if (!canView($app.dao(), auth)) throw new ForbiddenError('You don\'t have permission to see the general ledger. Ask for "view_journals".');
}

/** The posting keys with their current accounts (for Setup → Posting accounts). */
function postingList(dao) {
  return Object.keys(POSTING).map((key, i) => {
    let acc = null;
    let configured = false;
    try {
      const cfg = (dao.findRecordsByFilter("posting_accounts", "key = {:k}", "", 1, 0, { k: key }) || [])[0];
      if (cfg && cfg.getString("account")) {
        acc = dao.findRecordById("gl_accounts", cfg.getString("account"));
        configured = true;
      }
    } catch (_) {}
    if (!acc) acc = (dao.findRecordsByFilter("gl_accounts", "code = {:c}", "", 1, 0, { c: POSTING[key][0] }) || [])[0] || null;
    return { key, label: POSTING[key][1], module: POSTING[key][2], default_code: POSTING[key][0], sort: i + 1, configured, account: acc ? { id: acc.id, code: acc.getString("code"), name: acc.getString("name") } : null };
  });
}

module.exports = { POSTING, accountFor, post, reverse, canView, guardRead, postingList };
