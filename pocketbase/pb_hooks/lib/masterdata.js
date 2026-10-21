/// <reference path="../../pb_data/types.d.ts" />
/**
 * Master data (IMS M1): fiscal years and periods, chart of accounts, funding sources, projects,
 * cost centres and dated tax rates. Writes need the permission named in WRITE_PERMISSION; every
 * change is audited. Nothing here is deleted through the API — records are deactivated instead,
 * so historical transactions always keep their references.
 */
const core = require("./core.js");

const WRITE_PERMISSION = {
  gl_accounts: ["manage_chart_of_accounts", "change the chart of accounts"],
  cost_centres: ["manage_chart_of_accounts", "change cost centres"],
  funding_sources: ["manage_funding_sources", "change funding sources"],
  projects: ["manage_projects", "change projects"],
  tax_rates: ["manage_tax_rates", "change tax rates"],
  fiscal_years: ["manage_fiscal_years", "change fiscal years"],
  approval_limits: ["manage_approval_workflows", "change approval limits"],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const NORMAL = { asset: "debit", expense: "debit", liability: "credit", net_assets: "credit", revenue: "credit" };

function toDate(v) {
  const d = new Date(String(v || "").trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}
const pbDay = (y, m, d, end) => `${y}-${pad(m)}-${pad(d)} ${end ? "23:59:59.999" : "00:00:00.000"}Z`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function fiscalStartMonth(dao) {
  try {
    const s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
    const m = s ? s.getInt("fiscal_year_start_month") : 0;
    if (m >= 1 && m <= 12) return m;
  } catch (_) {}
  return 7; // July–June
}

/**
 * Creates a fiscal year starting in `startYear` with twelve monthly periods.
 * With the default July start, startYear 2026 gives "FY 2026/27" (1 Jul 2026 – 30 Jun 2027).
 */
function createFiscalYear(dao, startYear, actor, opts) {
  const o = opts || {};
  const startMonth = o.startMonth || fiscalStartMonth(dao);
  const y = parseInt(startYear, 10);
  if (!(y >= 2000 && y <= 2100)) throw new BadRequestError("Give the calendar year in which the fiscal year starts, e.g. 2026.");
  const endYear = startMonth === 1 ? y : y + 1;
  const code = startMonth === 1 ? String(y) : `${y}/${String(endYear).slice(2)}`;
  let exists = false;
  try {
    dao.findFirstRecordByFilter("fiscal_years", "code = {:c}", { c: code });
    exists = true;
  } catch (_) {}
  if (exists) throw new BadRequestError(`Fiscal year ${code} already exists.`);
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const fy = new Record(dao.findCollectionByNameOrId("fiscal_years"));
  fy.set("name", `FY ${code}`);
  fy.set("code", code);
  fy.set("start_date", pbDay(y, startMonth, 1));
  fy.set("end_date", pbDay(endYear, endMonth, lastDay(endYear, endMonth), true));
  fy.set("status", o.status || "open");
  fy.set("is_current", false);
  if (actor) fy.set("created_by", actor.id);
  dao.saveRecord(fy);

  const col = dao.findCollectionByNameOrId("fiscal_periods");
  for (let i = 0; i < 12; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const yy = startMonth - 1 + i >= 12 ? y + 1 : y;
    const p = new Record(col);
    p.set("fiscal_year", fy.id);
    p.set("number", i + 1);
    p.set("name", `${MONTHS[m - 1]} ${yy}`);
    p.set("code", `${yy}-${pad(m)}`);
    p.set("start_date", pbDay(yy, m, 1));
    p.set("end_date", pbDay(yy, m, lastDay(yy, m), true));
    p.set("status", "open");
    p.set("checklist", {});
    dao.saveRecord(p);
  }
  if (o.makeCurrent) setCurrent(dao, fy.id);
  core.audit(dao, {
    actor, action: "created", collection: "fiscal_years", recordId: fy.id, label: fy.getString("name"),
    changes: { start_date: { old: null, new: fy.getString("start_date") }, end_date: { old: null, new: fy.getString("end_date") } },
    meta: o.meta,
  });
  return fy;
}

function setCurrent(dao, fyId) {
  for (const r of dao.findRecordsByFilter("fiscal_years", "is_current = true", "", 50, 0) || []) {
    if (r.id === fyId) continue;
    r.set("is_current", false);
    dao.saveRecord(r);
  }
  const fy = dao.findRecordById("fiscal_years", fyId);
  fy.set("is_current", true);
  dao.saveRecord(fy);
  return fy;
}

/** The fiscal period containing a date, or null. */
function periodFor(dao, when) {
  const d = toDate(when) || new Date();
  const s = d.toISOString().replace("T", " ");
  try {
    return dao.findFirstRecordByFilter("fiscal_periods", "start_date <= {:d} && end_date >= {:d}", { d: s });
  } catch (_) {
    return null;
  }
}

/** Throws unless the date falls in an open period of an open fiscal year. Returns the period. */
function requireOpenPeriod(dao, when, what) {
  const p = periodFor(dao, when);
  const day = (toDate(when) || new Date()).toISOString().slice(0, 10);
  if (!p) throw new BadRequestError(`No fiscal period covers ${day}. Ask Finance to create the fiscal year under Setup → Fiscal years.`);
  if (p.getString("status") !== "open") throw new BadRequestError(`${p.getString("name")} is closed, so ${what || "this transaction"} cannot be dated ${day}. Use a date in an open period or ask the DAF to reopen it.`);
  const fy = dao.findRecordById("fiscal_years", p.getString("fiscal_year"));
  if (fy.getString("status") !== "open") throw new BadRequestError(`${fy.getString("name")} is ${fy.getString("status")}; postings are not allowed.`);
  return p;
}

// ------------------------------------------------------------------ validation per collection
function validate(e) {
  const dao = $app.dao();
  const r = e.record;
  const name = r.collection().name;
  if (name === "gl_accounts") validateAccount(dao, r);
  if (name === "funding_sources" || name === "projects" || name === "cost_centres") {
    r.set("code", String(r.getString("code") || "").trim().toUpperCase());
    if (!r.getString("code") || !r.getString("name").trim()) throw new BadRequestError("Code and name are required.");
    if (name === "funding_sources" && !r.getString("type")) r.set("type", "other");
    if (name === "projects" && !r.getString("status")) r.set("status", "active");
    if (name === "projects" && r.getInt("budget_amount") < 0) throw new BadRequestError("The project budget cannot be negative.");
  }
  if (name === "tax_rates") validateTaxRate(dao, r);
  if (name === "approval_limits") {
    if (!r.getString("role")) throw new BadRequestError("Choose the role this limit applies to.");
    if (r.getInt("max_amount") < 0 || r.getInt("min_amount") < 0) throw new BadRequestError("Limits cannot be negative.");
    if (r.getInt("max_amount") > 0 && r.getInt("max_amount") < r.getInt("min_amount")) throw new BadRequestError("The maximum must be greater than the minimum.");
  }
  if (name === "fiscal_years" && r.getBool("is_current")) {
    for (const other of dao.findRecordsByFilter("fiscal_years", "is_current = true && id != {:id}", "", 20, 0, { id: r.id }) || []) {
      other.set("is_current", false);
      dao.saveRecord(other);
    }
  }
}

function validateAccount(dao, r) {
  const code = String(r.getString("code") || "").trim();
  if (!/^[0-9A-Za-z.\-]{1,20}$/.test(code)) throw new BadRequestError("Account code must be 1–20 letters, digits, dots or dashes.");
  r.set("code", code);
  if (!r.getString("name").trim()) throw new BadRequestError("Account name is required.");
  const type = r.getString("type");
  if (!NORMAL[type]) throw new BadRequestError("Choose the account type: asset, liability, net assets, revenue or expense.");
  if (!r.getString("normal_balance")) r.set("normal_balance", NORMAL[type]);
  const parentId = r.getString("parent");
  if (parentId) {
    if (parentId === r.id) throw new BadRequestError("An account cannot be its own parent.");
    let parent;
    try {
      parent = dao.findRecordById("gl_accounts", parentId);
    } catch (_) {
      throw new BadRequestError("The parent account does not exist.");
    }
    if (parent.getBool("is_posting")) throw new BadRequestError(`${parent.getString("code")} ${parent.getString("name")} is a posting account and cannot have sub-accounts. Make it a header (non-posting) account first.`);
    if (parent.getString("type") !== type) throw new BadRequestError(`A sub-account must have the same type as its parent (${parent.getString("type").replace("_", " ")}).`);
    // No cycles: walk up from the parent.
    let cursor = parent;
    for (let i = 0; i < 20 && cursor; i++) {
      if (cursor.id === r.id) throw new BadRequestError("That parent would create a loop in the chart of accounts.");
      const up = cursor.getString("parent");
      cursor = up ? dao.findRecordById("gl_accounts", up) : null;
    }
    r.set("level", parent.getInt("level") + 1);
    if (!r.getString("statement_section")) r.set("statement_section", parent.getString("statement_section"));
    if (!r.getString("cash_flow_class")) r.set("cash_flow_class", parent.getString("cash_flow_class"));
  } else {
    r.set("level", 1);
  }
  if (!r.getString("cash_flow_class")) r.set("cash_flow_class", "none");
  // Once anything is posted to an account, its code, type and posting flag are frozen.
  if (r.id && hasPostings(dao, r.id)) {
    const before = r.originalCopy();
    for (const f of ["code", "type", "is_posting", "normal_balance"]) {
      if (String(before.get(f)) !== String(r.get(f))) throw new BadRequestError(`${before.getString("code")} already has postings, so its ${f.replace("_", " ")} cannot change. Create a new account and reclassify with a journal.`);
    }
  }
}

function hasPostings(dao, accountId) {
  try {
    dao.findCollectionByNameOrId("journal_lines");
  } catch (_) {
    return false;
  }
  try {
    dao.findFirstRecordByFilter("journal_lines", "account = {:a}", { a: accountId });
    return true;
  } catch (_) {
    return false;
  }
}

function validateTaxRate(dao, r) {
  r.set("code", String(r.getString("code") || "").trim().toUpperCase());
  if (!r.getString("code") || !r.getString("name").trim()) throw new BadRequestError("Code and name are required.");
  const rate = r.getFloat("rate");
  if (!(rate >= 0 && rate <= 100)) throw new BadRequestError("The rate must be a percentage between 0 and 100.");
  const from = toDate(r.getString("effective_from"));
  if (!from) throw new BadRequestError("Give the date from which this rate applies.");
  const to = toDate(r.getString("effective_to"));
  if (to && to < from) throw new BadRequestError("The end date must be after the start date.");
  // A changed rate must be confirmed by Finance again.
  if (r.id) {
    const before = r.originalCopy();
    if (before.getFloat("rate") !== rate || before.getString("effective_from") !== r.getString("effective_from")) {
      r.set("confirmed_by_finance", false);
      r.set("confirmed_by", "");
      r.set("confirmed_at", "");
    }
  } else {
    r.set("confirmed_by_finance", false);
  }
  if (r.getBool("active")) {
    const others = dao.findRecordsByFilter("tax_rates", "code = {:c} && active = true && id != {:id}", "", 50, 0, { c: r.getString("code"), id: r.id || "" }) || [];
    for (const o of others) {
      const of = toDate(o.getString("effective_from"));
      const ot = toDate(o.getString("effective_to"));
      const overlaps = (!ot || ot >= from) && (!to || to >= of);
      if (overlaps) throw new BadRequestError(`${r.getString("code")} already has an active rate (${o.getFloat("rate")}%) for an overlapping period. Set an end date on it first.`);
    }
  }
}

/** The rate (percent) of a tax code in force on a date, or null. */
function taxRate(dao, code, when) {
  const d = (toDate(when) || new Date()).toISOString().replace("T", " ");
  const rows = dao.findRecordsByFilter("tax_rates", "code = {:c} && active = true && effective_from <= {:d} && (effective_to = '' || effective_to >= {:d})", "-effective_from", 1, 0, { c: code, d }) || [];
  return rows[0] || null;
}

module.exports = { WRITE_PERMISSION, createFiscalYear, setCurrent, periodFor, requireOpenPeriod, validate, taxRate, fiscalStartMonth, toDate };
