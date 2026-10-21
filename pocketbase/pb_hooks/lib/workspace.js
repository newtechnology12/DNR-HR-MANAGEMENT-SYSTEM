/// <reference path="../../pb_data/types.d.ts" />
/**
 * Staff workspace: individual work plans and attendance corrections.
 *
 * Work plans follow the public-sector / NGO planning cycle: an annual performance contract (objectives with
 * indicators, baseline, target, weight and means of verification — Imihigo style), quarterly outputs,
 * monthly and weekly activities. Each plan covers one period (weeks run Monday–Friday, quarters and years
 * follow the fiscal year) and can contribute to a higher-level plan of the same person. The staff member
 * drafts it, the supervisor (head of department; heads report to the Secretary General) approves or returns
 * it, the staff member updates progress, reports at the end of the period, and the supervisor assesses.
 * Nobody approves or assesses their own plan.
 *
 * Supervisors can also assign work: a task with its own dates, or a plan at any level (e.g. the annual
 * contract set from the strategic plan). Assigned work starts approved, with the assigner as supervisor.
 * A plan can be cascaded from a higher-level one (annual → quarter → month → week). Issues and risks are
 * raised on a plan by the owner or the supervisor and resolved with a note.
 *
 * Department plans: the head of department sets the month's shared activities (target in a unit, due date);
 * staff link activities of their monthly plans and tasks to them, and the department's achievement is the sum
 * of the staff results in approved plans. Drafts may be incomplete; what each level needs is checked when
 * the plan is sent (NEEDS).
 *
 * Attendance corrections: staff explain working days without a clock-in (mission, training…); HR approves
 * and the days are added to the attendance log.
 */
const core = require("./core.js");

const TYPES = ["weekly", "monthly", "quarterly", "annual"]; // periods people plan for themselves
const KINDS = TYPES.concat(["task", "department"]); // + tasks assigned by a supervisor, + the department's monthly plan
const TYPE_LABEL = { task: "Assigned task", department: "Department plan", weekly: "Weekly plan", monthly: "Monthly plan", quarterly: "Quarterly plan", annual: "Annual performance contract" };
const LEVEL = { task: 0, weekly: 1, monthly: 2, department: 2, quarterly: 3, annual: 4 };
/** What each level needs before it is sent (drafts may be incomplete). */
const NEEDS = {
  weekly: {},
  task: {},
  monthly: { due: true, output: true, objective: true, measure: true, weights: true },
  department: { due: true, objective: true, measure: true, weights: true },
  quarterly: { objective: true, measure: true, weights: true },
  annual: { objective: true, measure: true, weights: true },
};
/** Plans whose activities count towards department activities, and the statuses whose results count. */
const CONTRIBUTES = ["monthly", "task"];
const COUNTED = ["approved", "reported", "assessed"];
const CHILD = { annual: "quarterly", quarterly: "monthly", monthly: "weekly" };
const SEVERITY = ["low", "medium", "high"];
const MAX_TASK_DAYS = 92;
const ITEM_STATUS = ["not_started", "in_progress", "done", "postponed", "dropped"];
const PRIORITY = ["high", "medium", "low"];
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const EDITABLE = ["draft", "returned"];
const SYSTEM = [
  "number", "supervisor", "status", "submitted_at", "approved_at", "approved_by", "review_comment", "progress", "report_summary", "challenges",
  "next_steps", "support_needed", "self_rating", "reported_at", "supervisor_rating", "supervisor_feedback", "assessed_at", "assessed_by", "created_by",
  "period_end", "period_label", "fiscal_year", "department", "origin", "assigned_by", "source", "issues", "open_issues",
];
const REASONS = { mission: "Mission", training: "Training", meeting: "Meeting outside the office", approved_absence: "Approved absence", forgot: "Forgot to clock in", system: "System problem", other: "Other" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

const pad = (n) => String(n).padStart(2, "0");
const day = (s) => String(s || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const asDate = (d) => new Date(`${d}T12:00:00Z`);
const addDays = (d, n) => new Date(asDate(d).getTime() + n * 864e5).toISOString().slice(0, 10);
const showDay = (d) => {
  const x = asDate(day(d));
  return isNaN(x.getTime()) ? String(d || "") : `${x.getUTCDate()} ${SHORT[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
const str = (v, max) => String(v === undefined || v === null ? "" : v).trim().slice(0, max || 500);
/** The number in a target such as "24", "3 chapters" or "100%"; null when there is none. */
const numberIn = (v) => {
  const m = String(v === undefined || v === null ? "" : v).replace(/[\s,]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const nounOf = (type) => (type === "annual" ? "Objective" : type === "quarterly" ? "Output" : type === "task" ? "Deliverable" : "Activity");

function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

function settingsOf(dao) {
  try {
    return (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0] || null;
  } catch (_) {
    return null;
  }
}

/** "19–23 Oct 2026", "26 Oct – 6 Nov 2026", "29 Dec 2026 – 2 Jan 2027". */
function rangeLabel(a, b) {
  const x = asDate(a);
  const y = asDate(b);
  if (x.getUTCFullYear() !== y.getUTCFullYear()) return `${showDay(a)} – ${showDay(b)}`;
  if (x.getUTCMonth() !== y.getUTCMonth()) return `${x.getUTCDate()} ${SHORT[x.getUTCMonth()]} – ${y.getUTCDate()} ${SHORT[y.getUTCMonth()]} ${y.getUTCFullYear()}`;
  return x.getUTCDate() === y.getUTCDate() ? showDay(a) : `${x.getUTCDate()}–${y.getUTCDate()} ${SHORT[x.getUTCMonth()]} ${y.getUTCFullYear()}`;
}

function isoWeek(d) {
  const x = asDate(d);
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow + 3);
  const firstThursday = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((x.getTime() - firstThursday.getTime()) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** The period of a plan type containing a day: weeks Monday–Friday, quarters and years on the fiscal year. */
function periodOf(dao, type, anyDay) {
  const d = asDate(anyDay);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const fyStart = require("./masterdata.js").fiscalStartMonth(dao);
  const fy = m >= fyStart ? y : y - 1;
  const fyLabel = (s) => `FY ${s}/${String(s + 1).slice(2)}`;
  if (type === "weekly") {
    const mon = addDays(anyDay, -((d.getUTCDay() + 6) % 7));
    const fri = addDays(mon, 4);
    return { start: mon, end: fri, fy, label: `Week ${isoWeek(mon)} · ${rangeLabel(mon, fri)}` };
  }
  if (type === "monthly") {
    const start = `${y}-${pad(m)}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start, end, fy, label: `${MONTHS[m - 1]} ${y}` };
  }
  if (type === "quarterly") {
    const q = Math.floor(((m - fyStart + 12) % 12) / 3);
    const startMonth = ((fyStart - 1 + q * 3) % 12) + 1;
    const startYear = startMonth >= fyStart ? fy : fy + 1;
    const start = `${startYear}-${pad(startMonth)}-01`;
    const endDate = new Date(Date.UTC(startYear, startMonth + 2, 0));
    const end = endDate.toISOString().slice(0, 10);
    return { start, end, fy, label: `Q${q + 1} ${fyLabel(fy)} · ${SHORT[startMonth - 1]} – ${SHORT[endDate.getUTCMonth()]} ${endDate.getUTCFullYear()}` };
  }
  const start = `${fy}-${pad(fyStart)}-01`;
  const endDate = new Date(Date.UTC(fyStart === 1 ? fy : fy + 1, fyStart - 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, fy, label: `${fyLabel(fy)} · ${SHORT[fyStart - 1]} ${asDate(start).getUTCFullYear()} – ${SHORT[endDate.getUTCMonth()]} ${endDate.getUTCFullYear()}` };
}

/** A task's own dates (at most about a quarter). */
function taskPeriod(dao, from, to) {
  const start = day(from);
  const end = day(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || isNaN(asDate(start).getTime())) throw new BadRequestError("Give the start date of the task.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || isNaN(asDate(end).getTime())) throw new BadRequestError("Give the end date of the task.");
  if (end < start) throw new BadRequestError("The task ends before it starts.");
  if ((asDate(end).getTime() - asDate(start).getTime()) / 864e5 > MAX_TASK_DAYS) throw new BadRequestError("A task lasts at most three months; make it a quarterly plan instead.");
  return { start, end, fy: periodOf(dao, "annual", start).fy, label: rangeLabel(start, end) };
}

function headOf(dao, user) {
  if (!user || !user.getString("department")) return "";
  try {
    return dao.findRecordById("departments", user.getString("department")).getString("head");
  } catch (_) {
    return "";
  }
}

/** Head of department; heads (and staff of a department without a head) report to the Secretary General. */
function supervisorOf(dao, staff) {
  const head = headOf(dao, staff);
  if (head && head !== staff.id) return head;
  const sg = (dao.findRecordsByFilter("users", 'status = "Active" && id != {:me} && (role.code = "SG" || extra_roles.code ?= "SG")', "", 1, 0, { me: staff.id }) || [])[0];
  return sg ? sg.id : "";
}

const userName = (dao, id) => {
  try {
    return dao.findRecordById("users", id).getString("name");
  } catch (_) {
    return "";
  }
};

// ------------------------------------------------------------------ items
function normItems(dao, type, period, raw, ctx) {
  if (!Array.isArray(raw) || !raw.length) throw new BadRequestError(type === "annual" ? "Add at least one objective." : type === "task" ? "Add at least one deliverable." : "Add at least one activity.");
  if (raw.length > 40) throw new BadRequestError("A plan has at most 40 activities; split it.");
  const what = nounOf(type);
  const department = (ctx && ctx.department) || "";
  const seen = {};
  const items = raw.map((x, i) => {
    const o = x || {};
    const n = i + 1;
    let itemId = str(o.id, 20).replace(/[^a-z0-9]/gi, "");
    if (!itemId || seen[itemId]) itemId = $security.randomStringWithAlphabet(8, "abcdefghijklmnopqrstuvwxyz0123456789");
    seen[itemId] = true;
    const title = str(o.title, 200);
    if (title.length < 3) throw new BadRequestError(`${what} ${n}: describe it (at least 3 characters).`);
    const item = {
      id: itemId, title, output: str(o.output, 500), indicator: str(o.indicator, 300), baseline: str(o.baseline, 100), target: str(o.target, 100),
      verification: str(o.verification, 300), weight: Math.max(0, Math.min(100, Math.round(Number(o.weight) || 0))), start: day(o.start), due: day(o.due),
      days: Array.isArray(o.days) ? o.days.map(String).filter((d, k, all) => WEEKDAYS.indexOf(d) !== -1 && all.indexOf(d) === k) : [],
      priority: PRIORITY.indexOf(o.priority) !== -1 ? o.priority : "medium", objective: str(o.objective, 20), department_plan: str(o.department_plan, 20),
      cost: Math.max(0, Math.round(Number(o.cost) || 0)), quarters: Array.isArray(o.quarters) ? o.quarters.map(Number).filter((q, k, all) => q >= 1 && q <= 4 && all.indexOf(q) === k).sort() : [],
      status: ITEM_STATUS.indexOf(o.status) !== -1 ? o.status : "not_started", progress: Math.max(0, Math.min(100, Math.round(Number(o.progress) || 0))),
      achieved: str(o.achieved, 1000), comment: str(o.comment, 500), unit: str(o.unit, 30), code: type === "department" ? str(o.code, 10) : "",
      department_activity: str(o.department_activity, 20),
      actual: o.actual === undefined || o.actual === null || o.actual === "" ? null : Math.max(0, Number(o.actual) || 0),
      team: type === "department" ? Math.max(0, Math.round(Number(o.team) || 0)) : 0,
    };
    for (const k of ["start", "due"]) {
      if (item[k] && (item[k] < period.start || item[k] > period.end)) throw new BadRequestError(`${what} ${n}: the ${k === "due" ? "due" : "start"} date ${showDay(item[k])} is outside the period (${showDay(period.start)} – ${showDay(period.end)}).`);
    }
    if (item.start && item.due && item.due < item.start) throw new BadRequestError(`${what} ${n}: it is due before it starts.`);
    if (item.objective) load(dao, "strategic_objectives", item.objective, `Strategic objective of ${what.toLowerCase()} ${n}`);
    if (item.department_plan || item.department_activity) {
      if (CONTRIBUTES.indexOf(type) === -1) throw new BadRequestError(`${what} ${n}: department activities are linked from monthly plans and tasks.`);
      const dp = load(dao, "work_plans", item.department_plan, `Department plan of ${what.toLowerCase()} ${n}`);
      if (dp.getString("plan_type") !== "department") throw new BadRequestError(`${what} ${n}: link it to an activity of your department's plan.`);
      if (department && dp.getString("department") !== department) throw new BadRequestError(`${what} ${n}: that activity belongs to another department's plan.`);
      if (EDITABLE.indexOf(dp.getString("status")) !== -1) throw new BadRequestError(`${what} ${n}: ${dp.getString("number")} is not shared with the department yet.`);
      if (day(dp.getString("period_start")) > period.end || day(dp.getString("period_end")) < period.start) throw new BadRequestError(`${what} ${n}: ${dp.getString("number")} covers ${dp.getString("period_label")}, not this period.`);
      const da = core.parseJson(dp, "items", []).find((x) => x.id === item.department_activity);
      if (!da) throw new BadRequestError(`${what} ${n}: choose one of the department's activities.`);
      if (!item.unit) item.unit = da.unit || "";
    }
    if (item.status === "done") item.progress = 100;
    return item;
  });
  if (type === "department") {
    // stable references: DA-01, DA-02… (staff plans link by id; the code is what people read)
    let max = items.reduce((m, i) => {
      const k = /^DA-(\d+)$/.exec(i.code || "");
      return k ? Math.max(m, Number(k[1])) : m;
    }, 0);
    const used = {};
    for (const i of items) {
      if (!/^DA-\d+$/.test(i.code || "") || used[i.code]) i.code = `DA-${pad(++max)}`;
      used[i.code] = true;
    }
  }
  return items;
}

/** Before a plan is sent: what its level needs (indicators, targets, due dates, weights adding up to 100%…). */
function checkComplete(type, items) {
  const need = NEEDS[type] || {};
  const what = nounOf(type);
  items.forEach((i, k) => {
    const n = k + 1;
    if (need.due && !i.due) throw new BadRequestError(`${what} ${n}: give the due date.`);
    if (need.output && !i.output) throw new BadRequestError(`${what} ${n}: say what it will produce (expected output).`);
    if (need.objective && !i.objective) throw new BadRequestError(`${what} ${n}: choose the strategic objective it serves.`);
    if (need.measure && (!i.indicator || !i.target)) throw new BadRequestError(`${what} ${n}: give the indicator (how it is measured) and the target.`);
  });
  if (need.weights) {
    const total = items.filter((i) => i.status !== "dropped").reduce((sum, i) => sum + (Number(i.weight) || 0), 0);
    if (total !== 100) throw new BadRequestError(`The weights add up to ${total}%; they must add up to 100%.`);
  }
}

// ------------------------------------------------------------------ department achievement
/** Staff results counted towards each activity of a department plan: quantity achieved and the people contributing. */
function contributions(dao, dpId, department, from, to) {
  const per = {};
  if (!dpId || !department) return per;
  const rows = dao.findRecordsByFilter("work_plans", "department = {:d} && plan_type != 'department' && status != 'draft' && status != 'returned' && period_start <= {:to} && period_end >= {:from}", "", 0, 0, { d: department, from: noon(from), to: noon(to) }) || [];
  for (const p of rows) {
    if (CONTRIBUTES.indexOf(p.getString("plan_type")) === -1) continue;
    const counted = COUNTED.indexOf(p.getString("status")) !== -1;
    for (const i of core.parseJson(p, "items", [])) {
      if (i.department_plan !== dpId || !i.department_activity || i.status === "dropped") continue;
      const a = per[i.department_activity] || (per[i.department_activity] = { qty: 0, prog: 0, n: 0, team: {} });
      a.team[p.getString("staff")] = true;
      if (!counted) continue;
      const t = numberIn(i.target);
      a.qty += i.actual !== null && i.actual !== undefined ? Number(i.actual) || 0 : t !== null ? (t * (Number(i.progress) || 0)) / 100 : 0;
      a.prog += Number(i.progress) || 0;
      a.n++;
    }
  }
  return per;
}

function applyContributions(items, per) {
  for (const it of items) {
    const a = per[it.id] || { qty: 0, prog: 0, n: 0, team: {} };
    const target = numberIn(it.target);
    it.actual = Math.round(a.qty * 10) / 10;
    it.team = Object.keys(a.team).length;
    if (it.status === "dropped") continue;
    it.progress = target ? Math.min(100, Math.round((a.qty / target) * 100)) : a.n ? Math.round(a.prog / a.n) : 0;
    it.status = it.progress >= 100 ? "done" : it.progress > 0 ? "in_progress" : "not_started";
  }
  return items;
}

/** Recomputes a department plan from the staff plans that contribute to it. */
function syncDepartment(dao, dpId) {
  let dp;
  try {
    dp = dao.findRecordById("work_plans", dpId);
  } catch (_) {
    return;
  }
  if (dp.getString("plan_type") !== "department" || dp.getString("status") === "assessed") return;
  const items = applyContributions(core.parseJson(dp, "items", []), contributions(dao, dp.id, dp.getString("department"), day(dp.getString("period_start")), day(dp.getString("period_end"))));
  dp.set("items", items);
  dp.set("progress", progressOf(items));
  dao.saveRecord(dp);
}

/** After a plan changes: the department plans it contributes to (or itself, for a department plan). */
function syncLinked(dao, p) {
  if (p.getString("plan_type") === "department") return syncDepartment(dao, p.id);
  const ids = {};
  for (const i of core.parseJson(p, "items", [])) if (i.department_plan && i.department_activity) ids[i.department_plan] = true;
  for (const id of Object.keys(ids)) syncDepartment(dao, id);
}

function progressOf(items) {
  const live = items.filter((i) => i.status !== "dropped");
  if (!live.length) return 0;
  const weighted = live.some((i) => i.weight > 0);
  const total = weighted ? live.reduce((s, i) => s + i.weight, 0) : live.length;
  const sum = live.reduce((s, i) => s + i.progress * (weighted ? i.weight : 1), 0);
  return total ? Math.round(sum / total) : 0;
}

// ------------------------------------------------------------------ plan hooks
function prepare(dao, r, auth, before) {
  const type = r.getString("plan_type");
  if (KINDS.indexOf(type) === -1) throw new BadRequestError("Choose the kind of plan: weekly, monthly, quarterly or annual.");
  const staffId = r.getString("staff") || (auth ? auth.id : "");
  const staff = load(dao, "users", staffId, "Staff member");
  r.set("staff", staff.id);
  r.set("department", staff.getString("department"));
  const anyDay = day(r.getString("period_start")) || todayStr();
  if (isNaN(asDate(anyDay).getTime())) throw new BadRequestError("Choose a valid period.");
  const p = type === "task" ? taskPeriod(dao, anyDay, r.getString("period_end")) : periodOf(dao, type === "department" ? "monthly" : type, anyDay);
  r.set("period_start", noon(p.start));
  r.set("period_end", noon(p.end));
  r.set("period_label", p.label);
  r.set("fiscal_year", p.fy);
  if (type !== "task") {
    const dup = (dao.findRecordsByFilter("work_plans", "staff = {:s} && plan_type = {:t} && period_start = {:p} && id != {:id}", "", 1, 0, { s: staff.id, t: type, p: noon(p.start), id: r.id || "" }) || [])[0];
    if (dup) throw new BadRequestError(`${auth && auth.id === staff.id ? "You already have" : `${staff.getString("name")} already has`} a ${TYPE_LABEL[type].toLowerCase()} for ${p.label} (${dup.getString("number")}). Open it instead.`);
  }
  if (type === "department") {
    if (!staff.getString("department") || headOf(dao, staff) !== staff.id) throw new BadRequestError("The department plan is prepared by the head of department.");
    const other = (dao.findRecordsByFilter("work_plans", "plan_type = 'department' && department = {:d} && period_start = {:p} && id != {:id}", "", 1, 0, { d: staff.getString("department"), p: noon(p.start), id: r.id || "" }) || [])[0];
    if (other) throw new BadRequestError(`The department already has a plan for ${p.label} (${other.getString("number")}).`);
  }
  const title = str(r.getString("title"), 200);
  if (type === "task" && title.length < 5) throw new BadRequestError("Name the task (at least 5 characters).");
  r.set("title", title || `${TYPE_LABEL[type]} · ${p.label}`);
  r.set("focus", str(r.getString("focus"), 1000));
  if (r.getString("parent")) {
    const parent = load(dao, "work_plans", r.getString("parent"), "Higher-level plan");
    if (parent.getString("staff") !== staff.id) throw new BadRequestError("Link your plan to one of your own higher-level plans.");
    if (LEVEL[parent.getString("plan_type")] <= LEVEL[type]) throw new BadRequestError(`A ${TYPE_LABEL[type].toLowerCase()} contributes to a longer plan (${type === "task" ? "weekly, monthly, quarterly or annual" : "monthly, quarterly or annual"}).`);
    if (day(parent.getString("period_start")) > p.end || day(parent.getString("period_end")) < p.start) throw new BadRequestError(`${parent.getString("number")} covers ${parent.getString("period_label")}, not ${p.label}.`);
  }
  let items = normItems(dao, type, p, core.parseJson(r, "items", []), { department: staff.getString("department") });
  if (type === "department") items = applyContributions(items, contributions(dao, r.id, staff.getString("department"), p.start, p.end));
  r.set("items", items);
  r.set("progress", progressOf(items));
}

function beforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  const r = e.record;
  for (const f of SYSTEM) r.set(f, "");
  if (r.getString("plan_type") === "task") throw new BadRequestError("Tasks are assigned by a supervisor. Plan your week or month instead.");
  r.set("status", "draft");
  r.set("origin", "own");
  r.set("issues", []);
  r.set("open_issues", 0);
  if (auth) r.set("created_by", auth.id);
  prepare(dao, r, auth, null);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "work_plan");
  });
  r.set("number", n);
}

function beforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  const r = e.record;
  const before = r.originalCopy();
  if (auth && EDITABLE.indexOf(before.getString("status")) === -1) {
    throw new BadRequestError(`${before.getString("number")} is ${before.getString("status")}: update the progress of its activities, or write the report.`);
  }
  for (const f of SYSTEM) r.set(f, before.get(f));
  r.set("staff", before.getString("staff"));
  prepare(dao, r, auth, before);
  e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, r, ["plan_type", "period_label", "title", "focus", "progress", "parent"])));
}

// ------------------------------------------------------------------ plan actions
const planLink = (id) => `/dashboard/my/plans/${id}`;
const planName = (p) => `${TYPE_LABEL[p.getString("plan_type")]} · ${p.getString("period_label")}`;

function own(p, actor) {
  if (p.getString("staff") !== actor.id) throw new ForbiddenError("Only the owner of the plan can do this.");
}

function submit(dao, id, actor, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  own(p, actor);
  if (EDITABLE.indexOf(p.getString("status")) === -1) throw new BadRequestError(`${p.getString("number")} is already ${p.getString("status")}.`);
  checkComplete(p.getString("plan_type"), core.parseJson(p, "items", []));
  const staff = load(dao, "users", p.getString("staff"), "Staff member");
  const supervisor = supervisorOf(dao, staff);
  p.set("submitted_at", new Date().toISOString());
  p.set("review_comment", "");
  if (!supervisor) {
    // The Secretary General's own plan: nobody above in the system — recorded as approved on submission.
    p.set("status", "approved");
    p.set("approved_at", new Date().toISOString());
    p.set("review_comment", "No supervisor above this position in the system; approved on submission.");
  } else {
    p.set("supervisor", supervisor);
    p.set("status", "submitted");
    core.notify(dao, [supervisor], { title: `Plan to approve: ${staff.getString("name")}`, body: `${planName(p)} · ${core.parseJson(p, "items", []).length} activities`, link: planLink(p.id), type: "approval" });
  }
  dao.saveRecord(p);
  syncLinked(dao, p);
  core.audit(dao, { actor, action: "submitted", collection: "work_plans", recordId: p.id, label: p.getString("number"), comment: planName(p), meta, changes: { status: { old: "draft", new: p.getString("status") } } });
  return p;
}

function review(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  if (p.getString("status") !== "submitted") throw new BadRequestError(`${p.getString("number")} is ${p.getString("status")}, not waiting for approval.`);
  if (p.getString("staff") === actor.id) throw new ForbiddenError("You cannot approve your own plan.");
  if (p.getString("supervisor") !== actor.id) throw new ForbiddenError(`${p.getString("number")} is waiting for ${userName(dao, p.getString("supervisor")) || "the supervisor"}.`);
  const decision = String(input.decision || "");
  const comment = str(input.comment, 1000);
  if (["approve", "return"].indexOf(decision) === -1) throw new BadRequestError("Approve or return the plan.");
  if (decision === "return" && comment.length < 5) throw new BadRequestError("Say what to change (a short comment).");
  p.set("status", decision === "approve" ? "approved" : "returned");
  p.set("review_comment", comment);
  if (decision === "approve") {
    p.set("approved_at", new Date().toISOString());
    p.set("approved_by", actor.id);
  }
  dao.saveRecord(p);
  syncLinked(dao, p);
  core.notify(dao, [p.getString("staff")], {
    title: decision === "approve" ? `Plan approved: ${planName(p)}` : `Plan returned: ${planName(p)}`, body: comment || `Approved by ${actor.getString("name")}`,
    link: planLink(p.id), type: decision === "approve" ? "success" : "warning",
  });
  core.audit(dao, { actor, action: decision === "approve" ? "approval_approve" : "approval_return", collection: "work_plans", recordId: p.id, label: p.getString("number"), comment, meta, changes: { status: { old: "submitted", new: p.getString("status") } } });
  return p;
}

/** Progress, achievements and comments of the activities (approved plans only). */
function applyProgress(p, updates) {
  const items = core.parseJson(p, "items", []);
  const byId = {};
  for (const u of Array.isArray(updates) ? updates : []) if (u && u.id) byId[String(u.id)] = u;
  for (const i of items) {
    const u = byId[i.id];
    if (!u) continue;
    if (u.status !== undefined) {
      if (ITEM_STATUS.indexOf(u.status) === -1) throw new BadRequestError("Unknown activity status.");
      i.status = u.status;
    }
    if (u.progress !== undefined) i.progress = Math.max(0, Math.min(100, Math.round(Number(u.progress) || 0)));
    if (u.actual !== undefined) {
      // the quantity achieved ("16 people"): the percentage follows when the target is a number
      i.actual = u.actual === null || u.actual === "" ? null : Math.max(0, Number(u.actual) || 0);
      const t = numberIn(i.target);
      if (i.actual !== null && t) i.progress = Math.min(100, Math.round((i.actual / t) * 100));
      if (i.progress > 0 && i.status === "not_started") i.status = "in_progress";
    }
    if (i.status === "done") i.progress = 100;
    if (u.achieved !== undefined) i.achieved = str(u.achieved, 1000);
    if (u.comment !== undefined) i.comment = str(u.comment, 500);
  }
  p.set("items", items);
  p.set("progress", progressOf(items));
  return items;
}

function progress(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  own(p, actor);
  if (p.getString("status") !== "approved") throw new BadRequestError(p.getString("status") === "submitted" ? "Wait for your supervisor to approve the plan before recording progress." : `${p.getString("number")} is ${p.getString("status")}.`);
  if (p.getString("plan_type") === "department") throw new BadRequestError("Department activities are measured from the staff plans that contribute to them.");
  const before = p.getInt("progress");
  applyProgress(p, input.items);
  dao.saveRecord(p);
  syncLinked(dao, p);
  if (before !== p.getInt("progress")) core.audit(dao, { actor, action: "progress_updated", collection: "work_plans", recordId: p.id, label: p.getString("number"), meta, changes: { progress: { old: before, new: p.getInt("progress") } } });
  return p;
}

function report(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  own(p, actor);
  if (p.getString("status") !== "approved") throw new BadRequestError(`${p.getString("number")} is ${p.getString("status")}; only an approved plan is reported on.`);
  if (p.getString("plan_type") === "department") syncDepartment(dao, p.id);
  if (input.items) {
    // department activities keep their measured progress: only the explanations come from the report
    const updates = p.getString("plan_type") === "department" ? input.items.map((u) => ({ id: u && u.id, achieved: u && u.achieved, comment: u && u.comment })) : input.items;
    applyProgress(p, updates);
  }
  const summary = str(input.report_summary, 4000);
  if (summary.length < 20) throw new BadRequestError("Summarise what was achieved (at least 20 characters).");
  const rating = Math.round(Number(input.self_rating) || 0);
  if (rating && (rating < 1 || rating > 5)) throw new BadRequestError("Rate yourself from 1 to 5.");
  const open = core.parseJson(p, "items", []).filter((i) => i.status !== "done" && i.status !== "dropped" && !i.achieved);
  if (open.length) throw new BadRequestError(`${open.length} activit${open.length === 1 ? "y is" : "ies are"} not done: say what was achieved or why (column "Achieved / reason").`);
  p.set("report_summary", summary);
  p.set("challenges", str(input.challenges, 2000));
  p.set("next_steps", str(input.next_steps, 2000));
  p.set("support_needed", str(input.support_needed, 1000));
  p.set("self_rating", rating);
  p.set("reported_at", new Date().toISOString());
  p.set("status", "reported");
  dao.saveRecord(p);
  syncLinked(dao, p);
  const to = p.getString("supervisor") || p.getString("approved_by");
  if (to) core.notify(dao, [to], { title: `Report to assess: ${userName(dao, p.getString("staff"))}`, body: `${planName(p)} · ${p.getInt("progress")}% achieved`, link: planLink(p.id), type: "approval" });
  core.audit(dao, { actor, action: "reported", collection: "work_plans", recordId: p.id, label: p.getString("number"), comment: `${p.getInt("progress")}% achieved`, meta, changes: { status: { old: "approved", new: "reported" } } });
  return p;
}

function assess(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  if (p.getString("status") !== "reported") throw new BadRequestError(`${p.getString("number")} is ${p.getString("status")}, not waiting for an assessment.`);
  if (p.getString("staff") === actor.id) throw new ForbiddenError("You cannot assess your own plan.");
  const supervisor = p.getString("supervisor") || p.getString("approved_by");
  if (supervisor !== actor.id) throw new ForbiddenError(`${p.getString("number")} is assessed by ${userName(dao, supervisor) || "the supervisor"}.`);
  const decision = String(input.decision || "assess");
  const feedback = str(input.feedback, 2000);
  if (decision === "return") {
    if (feedback.length < 5) throw new BadRequestError("Say what to complete in the report.");
    p.set("status", "approved");
    p.set("supervisor_feedback", feedback);
    dao.saveRecord(p);
    core.notify(dao, [p.getString("staff")], { title: `Report sent back: ${planName(p)}`, body: feedback, link: planLink(p.id), type: "warning" });
    core.audit(dao, { actor, action: "approval_return", collection: "work_plans", recordId: p.id, label: p.getString("number"), comment: feedback, meta, changes: { status: { old: "reported", new: "approved" } } });
    return p;
  }
  const rating = Math.round(Number(input.rating) || 0);
  if (rating < 1 || rating > 5) throw new BadRequestError("Give a rating from 1 (far below expectations) to 5 (outstanding).");
  if (feedback.length < 5) throw new BadRequestError("Give feedback to the staff member.");
  p.set("supervisor_rating", rating);
  p.set("supervisor_feedback", feedback);
  p.set("assessed_at", new Date().toISOString());
  p.set("assessed_by", actor.id);
  p.set("status", "assessed");
  dao.saveRecord(p);
  core.notify(dao, [p.getString("staff")], { title: `Plan assessed: ${planName(p)}`, body: `Rating ${rating}/5 · ${feedback}`, link: planLink(p.id), type: "success" });
  core.audit(dao, { actor, action: "assessed", collection: "work_plans", recordId: p.id, label: p.getString("number"), comment: `Rating ${rating}/5`, meta, changes: { status: { old: "reported", new: "assessed" } } });
  return p;
}

/** Next period's plan as a draft, with the activities still open (or all of them). */
function copyForward(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  own(p, actor);
  const type = p.getString("plan_type");
  if (type === "task") throw new BadRequestError("A task has its own dates; it is not repeated. Plan your week or month instead.");
  const next = periodOf(dao, type, addDays(day(p.getString("period_end")), type === "weekly" ? 3 : 1));
  const dup = (dao.findRecordsByFilter("work_plans", "staff = {:s} && plan_type = {:t} && period_start = {:p}", "", 1, 0, { s: actor.id, t: type, p: noon(next.start) }) || [])[0];
  if (dup) throw new BadRequestError(`${TYPE_LABEL[type]} for ${next.label} already exists (${dup.getString("number")}).`);
  const all = Boolean(input.all);
  const items = core.parseJson(p, "items", [])
    .filter((i) => all || (i.status !== "done" && i.status !== "dropped"))
    .map((i) => ({ ...i, id: "", start: "", due: "", status: "not_started", progress: type === "department" || all ? 0 : i.progress, achieved: "", comment: "", actual: null, team: 0 }));
  if (!items.length) throw new BadRequestError("Every activity is done: start the next plan from scratch.");
  const r = new Record(dao.findCollectionByNameOrId("work_plans"));
  r.set("staff", actor.id);
  r.set("plan_type", type);
  r.set("period_start", noon(next.start));
  let parent = p.getString("parent");
  if (parent) {
    try {
      const pp = dao.findRecordById("work_plans", parent);
      if (day(pp.getString("period_end")) < next.start) parent = "";
    } catch (_) {
      parent = "";
    }
  }
  r.set("parent", parent);
  r.set("focus", p.getString("focus"));
  r.set("items", items);
  r.set("status", "draft");
  r.set("origin", "own");
  r.set("issues", []);
  r.set("open_issues", 0);
  r.set("created_by", actor.id);
  prepare(dao, r, actor, null);
  r.set("number", core.nextNumber(dao, "work_plan"));
  dao.saveRecord(r);
  core.audit(dao, { actor, action: "created", collection: "work_plans", recordId: r.id, label: r.getString("number"), comment: `Copied from ${p.getString("number")} (${items.length} activities)`, meta });
  return r;
}

// ------------------------------------------------------------------ assigned work
function hasRole(dao, user, code) {
  return (dao.findRecordsByFilter("users", "id = {:id} && (role.code = {:c} || extra_roles.code ?= {:c})", "", 1, 0, { id: user.id, c: code }) || []).length > 0;
}

/** Line managers assign work: the head of the person's department, their supervisor, or the Secretary General. */
function canAssign(dao, actor, staff) {
  if (!actor || !staff || actor.id === staff.id) return false;
  if (headOf(dao, staff) === actor.id || supervisorOf(dao, staff) === actor.id) return true;
  return hasRole(dao, actor, "SG");
}

/** The people the actor can assign work to. */
function team(dao, actor) {
  const sg = hasRole(dao, actor, "SG");
  const rows = dao.findRecordsByFilter("users", sg ? 'status = "Active" && id != {:me}' : 'status = "Active" && id != {:me} && department.head = {:me}', "name", 500, 0, { me: actor.id }) || [];
  if (!sg) {
    // heads of department who report to the actor (when the actor is someone's supervisor without the SG role)
    for (const u of dao.findRecordsByFilter("users", 'status = "Active" && id != {:me} && department.head = id', "name", 100, 0, { me: actor.id }) || []) {
      if (supervisorOf(dao, u) === actor.id && !rows.some((x) => x.id === u.id)) rows.push(u);
    }
  }
  dao.expandRecords(rows, ["department", "designation"], null);
  return rows.map((u) => ({
    id: u.id, name: u.getString("name"),
    department: u.expandedOne("department") ? u.expandedOne("department").getString("name") : "",
    designation: u.expandedOne("designation") ? u.expandedOne("designation").getString("name") : "",
  }));
}

/** A supervisor assigns a task (own dates, deliverables) or a plan of any level; it starts approved. */
function assign(dao, actor, input, meta) {
  const staff = load(dao, "users", str(input.staff, 20), "Staff member");
  if (staff.getString("status") && staff.getString("status") !== "Active") throw new BadRequestError(`${staff.getString("name")} is not an active staff member.`);
  if (!canAssign(dao, actor, staff)) {
    throw new ForbiddenError(`You can assign work to the people you supervise. ${staff.getString("name")} reports to ${userName(dao, supervisorOf(dao, staff)) || "another supervisor"}.`);
  }
  const type = String(input.plan_type || "task");
  if (KINDS.indexOf(type) === -1) throw new BadRequestError("Choose what to assign: a task, or a weekly, monthly, quarterly or annual plan.");
  if (type === "department") throw new BadRequestError("The department plan is prepared by the head of department, not assigned.");
  const now = new Date().toISOString();
  const r = new Record(dao.findCollectionByNameOrId("work_plans"));
  r.set("staff", staff.id);
  r.set("plan_type", type);
  r.set("period_start", noon(day(type === "task" ? input.start : input.date) || todayStr()));
  r.set("period_end", type === "task" ? noon(day(input.end)) : "");
  r.set("title", str(input.title, 200));
  r.set("focus", str(input.focus, 1000));
  r.set("parent", str(input.parent, 20));
  r.set("items", Array.isArray(input.items) ? input.items.map((i) => ({ ...(i || {}), status: "not_started", progress: 0, achieved: "", comment: "" })) : []);
  prepare(dao, r, actor, null);
  checkComplete(type, core.parseJson(r, "items", []));
  r.set("origin", "assigned");
  r.set("assigned_by", actor.id);
  r.set("source", str(input.source, 200));
  r.set("supervisor", actor.id);
  r.set("status", "approved");
  r.set("submitted_at", now);
  r.set("approved_at", now);
  r.set("approved_by", actor.id);
  r.set("review_comment", str(input.instructions, 1000));
  r.set("issues", []);
  r.set("open_issues", 0);
  r.set("created_by", actor.id);
  r.set("number", core.nextNumber(dao, "work_plan"));
  dao.saveRecord(r);
  syncLinked(dao, r);
  const what = type === "task" ? r.getString("title") : planName(r);
  core.notify(dao, [staff.id], {
    title: type === "task" ? `New task from ${actor.getString("name")}` : `${TYPE_LABEL[type]} assigned by ${actor.getString("name")}`,
    body: `${what} · ${r.getString("period_label")}`, link: planLink(r.id), type: "info",
  });
  core.audit(dao, { actor, action: "assigned", collection: "work_plans", recordId: r.id, label: r.getString("number"), comment: `${what} → ${staff.getString("name")}`, meta });
  return r;
}

const quarterOf = (dao, d) => {
  const fyStart = require("./masterdata.js").fiscalStartMonth(dao);
  return Math.floor(((asDate(d).getUTCMonth() + 1 - fyStart + 12) % 12) / 3) + 1;
};

/** The next level down prepared from an approved plan: annual → quarter → month → week (a draft to complete and send). */
function cascade(dao, id, actor, input, meta) {
  const src = load(dao, "work_plans", id, "Plan");
  const owner = load(dao, "users", src.getString("staff"), "Staff member");
  const mine = owner.id === actor.id;
  if (!mine && !canAssign(dao, actor, owner)) throw new ForbiddenError("Only the owner of the plan or the supervisor can plan from it.");
  if (["approved", "reported", "assessed"].indexOf(src.getString("status")) === -1) throw new BadRequestError(`${src.getString("number")} is ${src.getString("status")}: plan from it once it is approved.`);
  const srcType = src.getString("plan_type");
  const type = CHILD[srcType];
  if (!type) throw new BadRequestError("Plan from an annual contract, a quarterly plan or a monthly plan.");
  const from = day(src.getString("period_start"));
  const to = day(src.getString("period_end"));
  let anyDay = day(input.date) || todayStr();
  if (anyDay < from || anyDay > to) anyDay = from;
  const period = periodOf(dao, type, anyDay);
  const dup = (dao.findRecordsByFilter("work_plans", "staff = {:s} && plan_type = {:t} && period_start = {:p}", "", 1, 0, { s: owner.id, t: type, p: noon(period.start) }) || [])[0];
  if (dup) throw new BadRequestError(`The ${TYPE_LABEL[type].toLowerCase()} for ${period.label} already exists (${dup.getString("number")}). Open it instead.`);
  const open = core.parseJson(src, "items", []).filter((i) => i.status !== "done" && i.status !== "dropped");
  let picked = open;
  if (srcType === "annual") {
    const q = quarterOf(dao, period.start);
    picked = open.filter((i) => !(i.quarters || []).length || (i.quarters || []).indexOf(q) !== -1);
  } else if (srcType === "monthly") {
    const inWeek = open.filter((i) => i.due && i.due >= period.start && i.due <= period.end);
    if (inWeek.length) picked = inWeek;
  }
  if (!picked.length) throw new BadRequestError(`Nothing in ${src.getString("number")} is left for ${period.label}: plan it from scratch.`);
  const items = picked.map((i) => ({
    title: i.title, output: i.output, indicator: type !== "weekly" ? i.indicator : "", baseline: type === "quarterly" ? i.baseline : "",
    target: type !== "weekly" ? i.target : "", verification: type !== "weekly" ? i.verification : "", objective: i.objective,
    priority: i.priority, unit: i.unit, weight: type === "weekly" ? 0 : i.weight,
  }));
  const r = new Record(dao.findCollectionByNameOrId("work_plans"));
  r.set("staff", owner.id);
  r.set("plan_type", type);
  r.set("period_start", noon(period.start));
  r.set("parent", src.id);
  r.set("focus", str(input.focus, 1000));
  r.set("items", items);
  prepare(dao, r, actor, null);
  r.set("status", "draft");
  r.set("origin", "cascaded");
  r.set("assigned_by", mine ? "" : actor.id);
  r.set("issues", []);
  r.set("open_issues", 0);
  r.set("created_by", actor.id);
  r.set("number", core.nextNumber(dao, "work_plan"));
  dao.saveRecord(r);
  if (!mine) core.notify(dao, [owner.id], { title: `${TYPE_LABEL[type]} prepared for you`, body: `${period.label}, from ${src.getString("number")} — complete it and send it`, link: planLink(r.id), type: "info" });
  core.audit(dao, { actor, action: "created", collection: "work_plans", recordId: r.id, label: r.getString("number"), comment: `Cascaded from ${src.getString("number")} (${items.length} items)`, meta });
  return r;
}

// ------------------------------------------------------------------ planning context
function designationName(dao, user) {
  try {
    return user.getString("designation") ? dao.findRecordById("designations", user.getString("designation")).getString("name") : "";
  } catch (_) {
    return "";
  }
}

function hrAll(dao, user) {
  return (dao.findRecordsByFilter("users", 'id = {:id} && (role.hr_scope = "all" || extra_roles.hr_scope ?= "all")', "", 1, 0, { id: user.id }) || []).length > 0;
}

/** Who approves the caller's plans, their department, whether they head it and can assign work. */
function context(dao, actor) {
  const sup = supervisorOf(dao, actor);
  let supervisor = null;
  if (sup) {
    try {
      const u = dao.findRecordById("users", sup);
      supervisor = { id: u.id, name: u.getString("name"), designation: designationName(dao, u) };
    } catch (_) {}
  }
  let department = null;
  try {
    const d = actor.getString("department") ? dao.findRecordById("departments", actor.getString("department")) : null;
    if (d) department = { id: d.id, name: d.getString("name") };
  } catch (_) {}
  return {
    supervisor, department, is_head: Boolean(department) && headOf(dao, actor) === actor.id, can_assign: team(dao, actor).length > 0,
    fiscal_start_month: require("./masterdata.js").fiscalStartMonth(dao),
  };
}

/** The periods offered when planning: a few behind, more ahead. */
function periods(dao, type) {
  const kind = type === "department" ? "monthly" : type;
  if (TYPES.indexOf(kind) === -1) throw new BadRequestError("Unknown plan type.");
  const cur = periodOf(dao, kind, todayStr());
  const back = { weekly: 2, monthly: 2, quarterly: 2, annual: 1 }[kind];
  const ahead = { weekly: 10, monthly: 9, quarterly: 5, annual: 1 }[kind];
  const out = [cur];
  let p = cur;
  for (let i = 0; i < back; i++) {
    p = periodOf(dao, kind, addDays(p.start, -1));
    out.unshift(p);
  }
  p = cur;
  for (let i = 0; i < ahead; i++) {
    p = periodOf(dao, kind, addDays(p.end, kind === "weekly" ? 3 : 1));
    out.push(p);
  }
  return out.map((x) => ({ start: x.start, end: x.end, label: x.label, fiscal_year: x.fy, current: x.start === cur.start }));
}

/** The department plan of a month: each activity's target, achievement, what remains and how many people contribute. */
function departmentActivities(dao, actor, input) {
  const deptId = str(input.department, 20) || actor.getString("department");
  if (!deptId) throw new BadRequestError("You are not in a department.");
  const dept = load(dao, "departments", deptId, "Department");
  const allowed = actor.getString("department") === deptId || dept.getString("head") === actor.id || hasRole(dao, actor, "SG") || hrAll(dao, actor);
  if (!allowed) throw new ForbiddenError("You can see the plan of your own department.");
  const period = periodOf(dao, "monthly", day(input.date) || todayStr());
  const department = { id: dept.id, name: dept.getString("name") };
  const dp = (dao.findRecordsByFilter("work_plans", "plan_type = 'department' && department = {:d} && period_start = {:p}", "", 1, 0, { d: deptId, p: noon(period.start) }) || [])[0];
  if (!dp || (EDITABLE.indexOf(dp.getString("status")) !== -1 && dp.getString("staff") !== actor.id)) return { department, period, plan: null, activities: [], overall: 0 };
  const per = contributions(dao, dp.id, deptId, period.start, period.end);
  const mine = {};
  for (const p of dao.findRecordsByFilter("work_plans", "staff = {:s} && plan_type != 'department' && status != 'draft' && period_start <= {:to} && period_end >= {:from}", "", 0, 0, { s: actor.id, from: noon(period.start), to: noon(period.end) }) || []) {
    for (const i of core.parseJson(p, "items", [])) if (i.department_plan === dp.id && i.department_activity) mine[i.department_activity] = true;
  }
  const activities = core.parseJson(dp, "items", []).filter((i) => i.status !== "dropped").map((i) => {
    const a = per[i.id] || { qty: 0, prog: 0, n: 0, team: {} };
    const target = numberIn(i.target);
    const achieved = Math.round(a.qty * 10) / 10;
    const progress = target ? Math.min(100, Math.round((a.qty / target) * 100)) : a.n ? Math.round(a.prog / a.n) : 0;
    return {
      id: i.id, code: i.code, title: i.title, output: i.output, indicator: i.indicator, unit: i.unit, target: i.target, target_value: target, due: i.due,
      objective: i.objective, weight: i.weight, achieved, progress, remaining: target !== null ? Math.max(0, Math.round((target - achieved) * 10) / 10) : null,
      team: Object.keys(a.team).filter((x) => x !== actor.id).length, mine: Boolean(mine[i.id]),
    };
  });
  const weighted = activities.some((a) => a.weight > 0);
  const total = weighted ? activities.reduce((sum, a) => sum + a.weight, 0) : activities.length;
  const overall = total ? Math.round(activities.reduce((sum, a) => sum + a.progress * (weighted ? a.weight : 1), 0) / total) : 0;
  return {
    department, period, overall, activities,
    plan: { id: dp.id, number: dp.getString("number"), status: dp.getString("status"), title: dp.getString("title"), focus: dp.getString("focus"), period_label: dp.getString("period_label"), head: userName(dao, dp.getString("staff")) },
  };
}

// ------------------------------------------------------------------ issues
/** Problems and risks on a plan: the owner and the supervisor raise and resolve them. */
function issues(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  const staff = load(dao, "users", p.getString("staff"), "Staff member");
  const mine = staff.id === actor.id;
  const managing = p.getString("supervisor") === actor.id || p.getString("assigned_by") === actor.id || headOf(dao, staff) === actor.id;
  if (!mine && !managing) throw new ForbiddenError("Only the owner of the plan and the supervisor manage its issues.");
  const list = core.parseJson(p, "issues", []) || [];
  const action = String(input.action || "add");
  const now = new Date().toISOString();
  let label = "";
  if (action === "add") {
    if (["submitted", "approved", "returned", "reported"].indexOf(p.getString("status")) === -1) throw new BadRequestError(`${p.getString("number")} is ${p.getString("status")}: issues are raised on plans being carried out.`);
    const title = str(input.title, 160);
    if (title.length < 5) throw new BadRequestError("Describe the issue (at least 5 characters).");
    if (list.filter((x) => x.status === "open").length >= 20) throw new BadRequestError("This plan has 20 open issues: resolve some first.");
    const item = str(input.item, 20);
    if (item && !core.parseJson(p, "items", []).some((i) => i.id === item)) throw new BadRequestError("That activity is not in the plan.");
    const issue = {
      id: $security.randomStringWithAlphabet(8, "abcdefghijklmnopqrstuvwxyz0123456789"), title, detail: str(input.detail, 1000),
      severity: SEVERITY.indexOf(input.severity) !== -1 ? input.severity : "medium", item, status: "open",
      raised_by: actor.id, raised_by_name: actor.getString("name"), raised_at: now, resolution: "", resolved_by: "", resolved_by_name: "", resolved_at: "",
    };
    list.push(issue);
    label = title;
    const to = mine ? p.getString("supervisor") || headOf(dao, staff) : staff.id;
    if (to && to !== actor.id) core.notify(dao, [to], { title: `Issue on ${p.getString("number")}: ${title}`, body: `${issue.severity === "high" ? "High priority · " : ""}raised by ${actor.getString("name")}`, link: planLink(p.id), type: issue.severity === "high" ? "warning" : "info" });
  } else if (action === "resolve" || action === "reopen") {
    const issue = list.find((x) => x.id === String(input.id || ""));
    if (!issue) throw new NotFoundError("Issue not found.");
    label = issue.title;
    if (action === "resolve") {
      if (issue.status !== "open") throw new BadRequestError("This issue is already resolved.");
      const resolution = str(input.resolution, 1000);
      if (resolution.length < 5) throw new BadRequestError("Say how it was resolved (at least 5 characters).");
      issue.status = "resolved";
      issue.resolution = resolution;
      issue.resolved_by = actor.id;
      issue.resolved_by_name = actor.getString("name");
      issue.resolved_at = now;
    } else {
      if (issue.status === "open") throw new BadRequestError("This issue is open.");
      issue.status = "open";
      issue.resolution = "";
      issue.resolved_by = "";
      issue.resolved_by_name = "";
      issue.resolved_at = "";
    }
  } else throw new BadRequestError("Unknown issue action.");
  p.set("issues", list);
  p.set("open_issues", list.filter((x) => x.status === "open").length);
  dao.saveRecord(p);
  core.audit(dao, { actor, action: action === "add" ? "issue_raised" : action === "resolve" ? "issue_resolved" : "issue_reopened", collection: "work_plans", recordId: p.id, label: p.getString("number"), comment: label, meta });
  return p;
}

// ------------------------------------------------------------------ attendance corrections
function workingDays(dao) {
  const s = settingsOf(dao);
  let wd = [];
  try {
    wd = s ? core.parseJson(s, "working_days", []) : [];
  } catch (_) {}
  return Array.isArray(wd) && wd.length ? wd.map((x) => String(x).toLowerCase()) : ["monday", "tuesday", "wednesday", "thursday", "friday"];
}
const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function beforeCreateCorrection(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  const r = e.record;
  const employee = auth || load(dao, "users", r.getString("employee"), "Employee");
  r.set("employee", employee.id);
  const raw = core.parseJson(r, "dates", []);
  const dates = (Array.isArray(raw) ? raw : []).map((x) => day(x)).filter((d, i, all) => /^\d{4}-\d{2}-\d{2}$/.test(d) && all.indexOf(d) === i).sort();
  if (!dates.length) throw new BadRequestError("Choose the days to correct.");
  if (dates.length > 31) throw new BadRequestError("Correct at most 31 days at a time.");
  const today = todayStr();
  const oldest = addDays(today, -90);
  const wd = workingDays(dao);
  for (const d of dates) {
    if (d > today) throw new BadRequestError(`${showDay(d)} is in the future.`);
    if (d < oldest) throw new BadRequestError(`${showDay(d)} is more than 90 days ago; ask HR directly.`);
    if (wd.indexOf(DOW[asDate(d).getUTCDay()]) === -1) throw new BadRequestError(`${showDay(d)} is not a working day.`);
    const att = dao.findRecordsByFilter("attendance", "employee = {:e} && date >= {:a} && date <= {:b}", "", 1, 0, { e: employee.id, a: `${d} 00:00:00.000Z`, b: `${d} 23:59:59.999Z` }) || [];
    if (att.length) throw new BadRequestError(`You already have a clock-in on ${showDay(d)}.`);
    const open = dao.findRecordsByFilter("attendance_corrections", "employee = {:e} && status = 'pending' && dates ~ {:d}", "", 1, 0, { e: employee.id, d }) || [];
    if (open.length) throw new BadRequestError(`${showDay(d)} is already in ${open[0].getString("number")}, waiting for HR.`);
  }
  const reason = r.getString("reason");
  if (!REASONS[reason]) throw new BadRequestError("Choose why you did not clock in.");
  r.set("explanation", str(r.getString("explanation"), 1000));
  if (r.getString("explanation").length < 10) throw new BadRequestError("Explain briefly (at least 10 characters), e.g. the mission and where.");
  r.set("dates", dates);
  r.set("day_count", dates.length);
  r.set("status", "pending");
  for (const f of ["reviewed_by", "reviewed_at", "review_comment"]) r.set(f, "");
  r.set("added_days", 0);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "attendance_correction");
  });
  r.set("number", n);
}

function afterCreateCorrection(e) {
  const dao = $app.dao();
  const r = e.record;
  const employee = load(dao, "users", r.getString("employee"), "Employee");
  const reviewers = (dao.findRecordsByFilter("users", 'status = "Active"', "", 2000, 0) || []).filter((u) => u.id !== employee.id && core.can(dao, u, "update_attendance")).map((u) => u.id);
  core.notify(dao, reviewers, {
    title: `Attendance correction: ${employee.getString("name")}`,
    body: `${r.getInt("day_count")} day(s) · ${REASONS[r.getString("reason")]} — ${r.getString("explanation")}`.slice(0, 300),
    link: "/dashboard/hr/attendance-corrections", type: "approval",
  });
  core.audit(dao, { actor: e.httpContext.get("authRecord"), action: "created", collection: "attendance_corrections", recordId: r.id, label: r.getString("number"), comment: `${r.getInt("day_count")} day(s) · ${REASONS[r.getString("reason")]}`, meta: core.requestMeta(e.httpContext) });
}

/** HR decision; approved days get an attendance record for the normal working hours. */
function reviewCorrection(dao, id, actor, input, meta) {
  core.requirePermission(dao, actor, "update_attendance", "correct attendance");
  const r = load(dao, "attendance_corrections", id, "Correction request");
  if (r.getString("status") !== "pending") throw new BadRequestError(`${r.getString("number")} is already ${r.getString("status")}.`);
  if (r.getString("employee") === actor.id) throw new ForbiddenError("You cannot approve a correction of your own attendance.");
  const decision = String(input.decision || "");
  const comment = str(input.comment, 1000);
  if (["approve", "reject"].indexOf(decision) === -1) throw new BadRequestError("Approve or reject the request.");
  if (decision === "reject" && comment.length < 5) throw new BadRequestError("Say why the request is rejected.");
  let added = 0;
  if (decision === "approve") {
    const employee = load(dao, "users", r.getString("employee"), "Employee");
    const s = settingsOf(dao);
    const start = (s && s.getString("work_start_time")) || "08:00";
    const end = (s && s.getString("work_end_time")) || "17:00";
    const col = dao.findCollectionByNameOrId("attendance");
    for (const d of core.parseJson(r, "dates", [])) {
      const exists = dao.findRecordsByFilter("attendance", "employee = {:e} && date >= {:a} && date <= {:b}", "", 1, 0, { e: employee.id, a: `${d} 00:00:00.000Z`, b: `${d} 23:59:59.999Z` }) || [];
      if (exists.length) continue;
      const a = new Record(col);
      a.set("employee", employee.id);
      a.set("branch", employee.getString("branch"));
      a.set("type", "correction");
      a.set("behaviour", "early");
      a.set("date", noon(d));
      // Working hours are local Kigali time (UTC+2).
      a.set("clockin_time", new Date(`${d}T${start.slice(0, 5)}:00+02:00`).toISOString());
      a.set("clockout_time", new Date(`${d}T${end.slice(0, 5)}:00+02:00`).toISOString());
      a.set("notes", `Corrected by HR (${r.getString("number")}): ${REASONS[r.getString("reason")]} — ${r.getString("explanation")}`.slice(0, 500));
      dao.saveRecord(a);
      added++;
    }
  }
  r.set("status", decision === "approve" ? "approved" : "rejected");
  r.set("reviewed_by", actor.id);
  r.set("reviewed_at", new Date().toISOString());
  r.set("review_comment", comment);
  r.set("added_days", added);
  dao.saveRecord(r);
  core.notify(dao, [r.getString("employee")], {
    title: decision === "approve" ? `Attendance corrected: ${added} day(s)` : "Attendance correction rejected", body: comment || `${r.getString("number")} approved by ${actor.getString("name")}`,
    link: "/dashboard/my/attendance", type: decision === "approve" ? "success" : "warning",
  });
  core.audit(dao, { actor, action: decision === "approve" ? "approval_approve" : "approval_reject", collection: "attendance_corrections", recordId: r.id, label: r.getString("number"), comment: comment || `${added} day(s) added`, meta, changes: { status: { old: "pending", new: r.getString("status") } } });
  return r;
}

module.exports = {
  TYPES, KINDS, TYPE_LABEL, NEEDS, periodOf, taskPeriod, supervisorOf, canAssign, team, beforeCreate, beforeUpdate, submit, review, progress, report, assess, copyForward,
  assign, cascade, issues, checkComplete, syncDepartment, context, periods, departmentActivities,
  beforeCreateCorrection, afterCreateCorrection, reviewCorrection,
};
