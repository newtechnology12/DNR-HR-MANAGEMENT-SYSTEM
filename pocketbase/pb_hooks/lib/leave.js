/// <reference path="../../pb_data/types.d.ts" />
/**
 * Leave engine: day counting (weekends and public holidays excluded), annual leave entitlement
 * (monthly accrual + seniority + carry-over + adjustments), balances, leave plans.
 *
 * Entitlement for year Y, per settings (defaults follow Law N° 66/2018):
 *   accrual    = leave_accrual_per_month × months of service in Y (prorated from the joining month)
 *   seniority  = floor(completed years of service at 1 Jan Y / leave_seniority_every_years) × leave_seniority_extra_days
 *                (capped by leave_seniority_max_days when > 0)
 *   carry-over = the plan's carried_over, or automatically: unused days of Y-1, capped by max_carryover_leaves
 *   total      = accrual + seniority + carry-over + adjustment
 */
const core = require("./core.js");

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`) : null);

function settings(dao) {
  let s = null;
  try {
    s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0] || null;
  } catch (_) {}
  const num = (k, d) => (s && s.getFloat(k)) || d;
  let working = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  if (s) {
    const w = core.parseJson(s, "working_days", null);
    if (w && w.length) working = w;
  }
  return {
    accrual: num("leave_accrual_per_month", 1.5),
    every: num("leave_seniority_every_years", 3),
    extra: s ? s.getFloat("leave_seniority_extra_days") : 1,
    maxSeniority: s ? s.getFloat("leave_seniority_max_days") : 0,
    maxCarry: s ? s.getFloat("max_carryover_leaves") : 5,
    allowNegative: s ? s.getBool("leave_allow_negative") : false,
    working,
  };
}

/** Set of "YYYY-MM-DD" (exact) and "MM-DD" (recurring) holiday keys. */
function holidays(dao) {
  const out = { exact: {}, recurring: {} };
  for (const h of dao.findRecordsByFilter("public_holidays", "id != ''", "", 500, 0) || []) {
    const d = String(h.getString("date")).slice(0, 10);
    if (h.getBool("recurring")) out.recurring[d.slice(5)] = true;
    out.exact[d] = true;
  }
  return out;
}

/** Days between two dates, inclusive; working basis skips weekends and holidays. Optionally per month. */
function countDays(start, end, basis, cfg, hol, byMonth) {
  const a = parse(start);
  const b = parse(end);
  const months = {};
  if (!a || !b || b < a) return byMonth ? { total: 0, months } : 0;
  let n = 0;
  for (const d = new Date(a.getTime()); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = ymd(d);
    const counts = basis === "calendar" || (cfg.working.indexOf(DAYS[d.getUTCDay()]) !== -1 && !hol.exact[key] && !hol.recurring[key.slice(5)]);
    if (!counts) continue;
    n++;
    const m = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    months[m] = (months[m] || 0) + 1;
  }
  return byMonth ? { total: n, months } : n;
}

function typesByName(dao) {
  const out = {};
  for (const t of dao.findRecordsByFilter("leave_types", "id != ''", "sort", 200, 0) || []) out[t.getString("name")] = t;
  // Older records used lowercase codes.
  if (out["Annual Leave"]) out.annual = out["Annual Leave"];
  return out;
}

function yearsOfService(joined, at) {
  if (!joined) return 0;
  const j = parse(joined);
  if (!j || j > at) return 0;
  let y = at.getUTCFullYear() - j.getUTCFullYear();
  if (at.getUTCMonth() < j.getUTCMonth() || (at.getUTCMonth() === j.getUTCMonth() && at.getUTCDate() < j.getUTCDate())) y--;
  return Math.max(0, y);
}

/** Base entitlement for a year (without carry-over and adjustment). */
function baseEntitlement(cfg, joinedAt, year) {
  const yearStart = new Date(Date.UTC(year, 0, 1, 12));
  const j = parse(joinedAt);
  let months = 12;
  if (j && j.getUTCFullYear() === year) months = 12 - j.getUTCMonth();
  if (j && j.getUTCFullYear() > year) months = 0;
  const accrual = Math.round(cfg.accrual * months * 100) / 100;
  const yrs = yearsOfService(joinedAt, yearStart);
  let seniority = cfg.every > 0 ? Math.floor(yrs / cfg.every) * (cfg.extra || 0) : 0;
  if (cfg.maxSeniority > 0) seniority = Math.min(seniority, cfg.maxSeniority);
  if (!months) seniority = 0;
  // Accrued so far this year (for "available now").
  const now = new Date();
  let accruedMonths = months;
  if (now.getUTCFullYear() === year) accruedMonths = Math.max(0, Math.min(months, now.getUTCMonth() + 1 - (12 - months)));
  else if (now.getUTCFullYear() < year) accruedMonths = 0;
  return { accrual, seniority, years: yrs, months, accruedToDate: Math.round((cfg.accrual * accruedMonths + seniority) * 100) / 100 };
}

/** Leaves of the given employees overlapping [from, to], grouped by employee. */
function leavesByEmployee(dao, employeeIds, from, to) {
  const out = {};
  if (!employeeIds.length) return out;
  const rows = dao.findRecordsByFilter("leaves", `start <= {:to} && end >= {:from} && (status = "approved" || status = "pending")`, "start", 20000, 0, { from, to }) || [];
  const want = {};
  employeeIds.forEach((id) => (want[id] = true));
  for (const l of rows) {
    const e = l.getString("employee");
    if (!want[e]) continue;
    (out[e] = out[e] || []).push(l);
  }
  return out;
}

/** Annual-leave usage (taken / pending, per month) of one employee in a year. */
function usage(leaves, year, cfg, hol, types) {
  const res = { taken: 0, pending: 0, takenMonths: {}, excludeId: null };
  for (const l of leaves || []) {
    const t = types[l.getString("type")];
    if (!t || !t.getBool("deducts_annual")) continue;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const s = l.getString("start").slice(0, 10) < from ? from : l.getString("start").slice(0, 10);
    const e = l.getString("end").slice(0, 10) > to ? to : l.getString("end").slice(0, 10);
    const c = countDays(s, e, t.getString("day_basis"), cfg, hol, true);
    if (l.getString("status") === "approved") {
      res.taken += c.total;
      for (const k in c.months) {
        const m = Number(k.split("-")[1]);
        res.takenMonths[m] = (res.takenMonths[m] || 0) + c.months[k];
      }
    } else res.pending += c.total;
  }
  return res;
}

function planFor(dao, employeeId, year) {
  try {
    return dao.findFirstRecordByFilter("leave_plans", "employee = {:e} && year = {:y}", { e: employeeId, y: year });
  } catch (_) {
    return null;
  }
}

/** Full balance for several employees. */
function balances(dao, users, year) {
  const cfg = settings(dao);
  const hol = holidays(dao);
  const types = typesByName(dao);
  const ids = users.map((u) => u.id);
  const cur = leavesByEmployee(dao, ids, `${year}-01-01 00:00:00.000Z`, `${year}-12-31 23:59:59.999Z`);
  const prev = leavesByEmployee(dao, ids, `${year - 1}-01-01 00:00:00.000Z`, `${year - 1}-12-31 23:59:59.999Z`);
  const plans = {};
  for (const p of dao.findRecordsByFilter("leave_plans", "year = {:y}", "", 5000, 0, { y: year }) || []) plans[p.getString("employee")] = p;
  const prevPlans = {};
  for (const p of dao.findRecordsByFilter("leave_plans", "year = {:y}", "", 5000, 0, { y: year - 1 }) || []) prevPlans[p.getString("employee")] = p;
  const deptNames = {};
  for (const d of dao.findRecordsByFilter("departments", "id != ''", "", 500, 0) || []) deptNames[d.id] = d.getString("name");

  return users.map((u) => {
    const joined = u.getString("joined_at");
    const base = baseEntitlement(cfg, joined, year);
    const use = usage(cur[u.id], year, cfg, hol, types);
    const plan = plans[u.id] || null;
    let carried = 0;
    let carriedAuto = true;
    if (plan && plan.getBool("carry_manual")) {
      carried = plan.getFloat("carried_over");
      carriedAuto = false;
    }
    if (carriedAuto) {
      const pb = baseEntitlement(cfg, joined, year - 1);
      const pu = usage(prev[u.id], year - 1, cfg, hol, types);
      const pp = prevPlans[u.id];
      const prevTotal = pb.accrual + pb.seniority + (pp ? pp.getFloat("carried_over") + pp.getFloat("adjustment") : 0);
      carried = pb.months ? Math.max(0, Math.min(cfg.maxCarry || 0, Math.round((prevTotal - pu.taken) * 100) / 100)) : 0;
    }
    const adjustment = plan ? plan.getFloat("adjustment") : 0;
    const entitlement = Math.round((base.accrual + base.seniority + carried + adjustment) * 100) / 100;
    const months = plan ? core.parseJson(plan, "months", {}) : {};
    let planned = 0;
    for (let m = 1; m <= 12; m++) planned += Number(months[m] || months[String(m)] || 0);
    return {
      employee: {
        id: u.id, name: u.getString("name"), email: u.getString("email"), department: u.getString("department"),
        department_name: deptNames[u.getString("department")] || "", joined_at: joined, gender: u.getString("gender"),
      },
      years_of_service: base.years,
      months_of_service: base.months,
      accrual: base.accrual,
      seniority_days: base.seniority,
      carried_over: carried,
      carried_auto: carriedAuto,
      adjustment,
      adjustment_reason: plan ? plan.getString("adjustment_reason") : "",
      entitlement,
      accrued_to_date: Math.round((base.accruedToDate + carried + adjustment) * 100) / 100,
      taken: use.taken,
      pending: use.pending,
      taken_months: use.takenMonths,
      planned,
      months,
      balance: Math.round((entitlement - use.taken) * 100) / 100,
      available: Math.round((entitlement - use.taken - use.pending) * 100) / 100,
      unplanned: Math.round((entitlement - planned) * 100) / 100,
      plan: plan ? { id: plan.id, status: plan.getString("status") || "draft", notes: plan.getString("notes"), updated: plan.getString("updated") } : null,
    };
  });
}

/** Users whose leave the actor may see. */
function visibleUsers(dao, auth, department) {
  const portal = require("./portal.js");
  const scope = auth ? portal.hrScope(dao, auth) : "all";
  let filter = 'status = "Active"';
  const params = {};
  if (department) {
    filter += " && department = {:d}";
    params.d = department;
  }
  let users = dao.findRecordsByFilter("users", filter, "name", 5000, 0, params) || [];
  if (scope === "all") return users;
  const headed = {};
  for (const d of dao.findRecordsByFilter("departments", "head = {:h}", "", 100, 0, { h: auth.id }) || []) headed[d.id] = true;
  return users.filter((u) => u.id === auth.id || headed[u.getString("department")] || (scope === "department" && u.getString("department") === auth.getString("department")));
}

// ------------------------------------------------------------------ plans
function savePlans(dao, auth, input, meta) {
  const portal = require("./portal.js");
  const year = parseInt(input.year, 10);
  if (!(year >= 2000 && year <= 2100)) throw new BadRequestError("Choose a valid year.");
  const rows = input.rows || [];
  if (!rows.length) throw new BadRequestError("Nothing to save.");
  if (rows.length > 500) throw new BadRequestError("Save at most 500 rows at a time.");
  const scope = auth ? portal.hrScope(dao, auth) : "all";
  const col = dao.findCollectionByNameOrId("leave_plans");
  const out = { saved: 0, errors: [] };
  for (const row of rows) {
    let emp;
    try {
      emp = dao.findRecordById("users", row.employee);
    } catch (_) {
      out.errors.push({ employee: row.employee, message: "Employee not found." });
      continue;
    }
    const self = auth && emp.id === auth.id;
    const manager = !auth || (portal.managesEmployee(dao, auth, emp) && !self && core.can(dao, auth, "update_leave"));
    if (auth && !self && !manager) {
      out.errors.push({ employee: emp.id, name: emp.getString("name"), message: "You can only plan leave for yourself or staff you manage." });
      continue;
    }
    let plan = planFor(dao, emp.id, year);
    if (self && !manager && plan && plan.getString("status") === "approved") {
      out.errors.push({ employee: emp.id, name: emp.getString("name"), message: "Your plan is approved; ask your manager to change it." });
      continue;
    }
    const months = {};
    let bad = false;
    for (let m = 1; m <= 12; m++) {
      const v = row.months ? row.months[m] !== undefined ? row.months[m] : row.months[String(m)] : undefined;
      const n = v === undefined || v === null || v === "" ? 0 : Number(v);
      if (!(n >= 0) || n > 31) bad = true;
      months[m] = Math.round(n * 2) / 2;
    }
    if (bad) {
      out.errors.push({ employee: emp.id, name: emp.getString("name"), message: "Planned days must be numbers between 0 and 31." });
      continue;
    }
    const before = plan ? core.parseJson(plan, "months", {}) : {};
    if (!plan) {
      plan = new Record(col);
      plan.set("employee", emp.id);
      plan.set("year", year);
      plan.set("status", "draft");
    }
    plan.set("months", months);
    if (scope === "all" || !auth) {
      if (row.carried_over !== undefined && row.carried_over !== null && row.carried_over !== "") {
        plan.set("carried_over", Math.max(0, Number(row.carried_over) || 0));
        plan.set("carry_manual", true);
      }
      if (row.adjustment !== undefined && row.adjustment !== null && row.adjustment !== "") {
        plan.set("adjustment", Number(row.adjustment) || 0);
        plan.set("adjustment_reason", String(row.adjustment_reason || plan.getString("adjustment_reason") || ""));
      }
    }
    if (row.notes !== undefined) plan.set("notes", String(row.notes || ""));
    if (self && !manager) plan.set("status", "draft");
    if (auth) plan.set("updated_by", auth.id);
    dao.saveRecord(plan);
    out.saved++;
    core.audit(dao, { actor: auth, action: "leave_plan_saved", collection: "leave_plans", recordId: plan.id, label: `${emp.getString("name")} ${year}`, meta, changes: { months: { old: JSON.stringify(before), new: JSON.stringify(months) } } });
  }
  return out;
}

function approvePlans(dao, auth, input, meta) {
  const portal = require("./portal.js");
  core.requirePermission(dao, auth, "update_leave", "approve leave plans");
  const year = parseInt(input.year, 10);
  let n = 0;
  for (const id of input.employees || []) {
    let emp;
    try {
      emp = dao.findRecordById("users", id);
    } catch (_) {
      continue;
    }
    if (emp.id === auth.id || !portal.managesEmployee(dao, auth, emp)) continue;
    const plan = planFor(dao, id, year);
    if (!plan || plan.getString("status") === "approved") continue;
    plan.set("status", "approved");
    plan.set("approved_by", auth.id);
    plan.set("approved_at", new Date().toISOString());
    dao.saveRecord(plan);
    core.notify(dao, [id], { title: `Your ${year} leave plan was approved`, body: `Approved by ${auth.getString("name")}`, link: "/dashboard/hr/leave-plan", type: "success" });
    core.audit(dao, { actor: auth, action: "leave_plan_approved", collection: "leave_plans", recordId: plan.id, label: `${emp.getString("name")} ${year}`, meta });
    n++;
  }
  return { approved: n };
}

// ------------------------------------------------------------------ leave requests
/** Server-side days, eligibility and balance checks for a leave request. */
function validateLeave(e) {
  const dao = $app.dao();
  const r = e.record;
  const auth = e.httpContext.get("authRecord");
  const cfg = settings(dao);
  const hol = holidays(dao);
  const types = typesByName(dao);
  const t = types[r.getString("type")];
  if (!t) {
    if (auth) throw new BadRequestError(`Unknown leave type "${r.getString("type")}". Choose one from the list.`);
    return;
  }
  if (!t.getBool("active") && auth) throw new BadRequestError(`${t.getString("name")} is not available.`);
  const start = r.getString("start");
  const end = r.getString("end");
  if (!start || !end) throw new BadRequestError("Choose the first and last day of the leave.");
  if (end.slice(0, 10) < start.slice(0, 10)) throw new BadRequestError("The last day cannot be before the first day.");
  const days = countDays(start, end, t.getString("day_basis"), cfg, hol);
  if (days <= 0) throw new BadRequestError("The selected period contains no working days (weekends and public holidays are excluded).");
  r.set("days", days);
  r.set("Leaveduration", days);
  if (!auth) return; // superuser / seed: trust the data

  let emp = null;
  try {
    emp = dao.findRecordById("users", r.getString("employee"));
  } catch (_) {}
  const gender = String((emp && emp.getString("gender")) || "").toLowerCase();
  const need = t.getString("eligible_gender");
  if (need && need !== "any" && gender && gender !== need) throw new BadRequestError(`${t.getString("name")} applies to ${need} employees only.`);
  const max = t.getFloat("max_per_request");
  if (max > 0 && days > max) throw new BadRequestError(`${t.getString("name")} is limited to ${max} ${t.getString("day_basis") === "calendar" ? "calendar" : "working"} days per request (you asked for ${days}).`);
  if (t.getBool("requires_attachment") && days > t.getFloat("attachment_after_days") && !r.getString("attachment")) {
    throw new BadRequestError(`Attach a supporting document (e.g. medical certificate) for ${t.getString("name").toLowerCase()} of more than ${t.getFloat("attachment_after_days") || 0} day(s).`);
  }
  if (t.getBool("deducts_annual") && !cfg.allowNegative && r.getString("status") === "pending" && emp) {
    const year = parse(start).getUTCFullYear();
    const bal = balances(dao, [emp], year)[0];
    let already = bal.taken + bal.pending;
    // When editing, do not count this request twice.
    if (!r.isNew()) {
      const before = r.originalCopy();
      const bt = types[before.getString("type")];
      if (bt && bt.getBool("deducts_annual") && ["pending", "approved"].indexOf(before.getString("status")) !== -1) already -= before.getFloat("days");
    }
    if (already + days > bal.entitlement + 0.001) {
      throw new BadRequestError(`Not enough annual leave: ${Math.max(0, Math.round((bal.entitlement - already) * 10) / 10)} day(s) available for ${year}, you asked for ${days}.`);
    }
  }
}

module.exports = { settings, holidays, countDays, baseEntitlement, balances, visibleUsers, savePlans, approvePlans, validateLeave, yearsOfService };
