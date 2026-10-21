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
 * Attendance corrections: staff explain working days without a clock-in (mission, training…); HR approves
 * and the days are added to the attendance log.
 */
const core = require("./core.js");

const TYPES = ["weekly", "monthly", "quarterly", "annual"];
const TYPE_LABEL = { weekly: "Weekly plan", monthly: "Monthly plan", quarterly: "Quarterly plan", annual: "Annual performance contract" };
const LEVEL = { weekly: 1, monthly: 2, quarterly: 3, annual: 4 };
const ITEM_STATUS = ["not_started", "in_progress", "done", "postponed", "dropped"];
const PRIORITY = ["high", "medium", "low"];
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const EDITABLE = ["draft", "returned"];
const SYSTEM = [
  "number", "supervisor", "status", "submitted_at", "approved_at", "approved_by", "review_comment", "progress", "report_summary", "challenges",
  "next_steps", "support_needed", "self_rating", "reported_at", "supervisor_rating", "supervisor_feedback", "assessed_at", "assessed_by", "created_by",
  "period_end", "period_label", "fiscal_year", "department",
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
    return { start: mon, end: fri, fy, label: `Week ${isoWeek(mon)} · ${showDay(mon).replace(/ \d{4}$/, "")} – ${showDay(fri)}` };
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
  const end = new Date(Date.UTC(fyStart === 1 ? fy : fy + 1, fyStart - 1, 0)).toISOString().slice(0, 10);
  return { start, end, fy, label: fyLabel(fy) };
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
function normItems(dao, type, period, raw) {
  if (!Array.isArray(raw) || !raw.length) throw new BadRequestError(type === "annual" ? "Add at least one objective." : "Add at least one activity.");
  if (raw.length > 40) throw new BadRequestError("A plan has at most 40 activities; split it.");
  const what = type === "annual" ? "Objective" : type === "quarterly" ? "Output" : "Activity";
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
      achieved: str(o.achieved, 1000), comment: str(o.comment, 500),
    };
    for (const k of ["start", "due"]) {
      if (item[k] && (item[k] < period.start || item[k] > period.end)) throw new BadRequestError(`${what} ${n}: the ${k === "due" ? "due" : "start"} date ${showDay(item[k])} is outside the period (${showDay(period.start)} – ${showDay(period.end)}).`);
    }
    if (item.start && item.due && item.due < item.start) throw new BadRequestError(`${what} ${n}: it is due before it starts.`);
    if ((type === "annual" || type === "quarterly") && (!item.indicator || !item.target)) {
      throw new BadRequestError(`${what} ${n}: give the indicator (how it is measured) and the target.`);
    }
    if (item.objective) load(dao, "strategic_objectives", item.objective, `Strategic objective of ${what.toLowerCase()} ${n}`);
    if (item.department_plan) {
      const dp = load(dao, "actionPlans", item.department_plan, `Department plan of ${what.toLowerCase()} ${n}`);
      if (dp.getString("scope") !== "department") throw new BadRequestError(`${what} ${n}: link it to a department plan, not to a personal task.`);
    }
    if (item.status === "done") item.progress = 100;
    return item;
  });
  if (type === "annual") {
    const total = items.reduce((s, i) => s + i.weight, 0);
    if (total !== 100) throw new BadRequestError(`The weights of the objectives add up to ${total}%; they must add up to 100%.`);
  }
  return items;
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
  if (TYPES.indexOf(type) === -1) throw new BadRequestError("Choose the kind of plan: weekly, monthly, quarterly or annual.");
  const staffId = r.getString("staff") || (auth ? auth.id : "");
  const staff = load(dao, "users", staffId, "Staff member");
  r.set("staff", staff.id);
  r.set("department", staff.getString("department"));
  const anyDay = day(r.getString("period_start")) || todayStr();
  if (isNaN(asDate(anyDay).getTime())) throw new BadRequestError("Choose a valid period.");
  const p = periodOf(dao, type, anyDay);
  r.set("period_start", noon(p.start));
  r.set("period_end", noon(p.end));
  r.set("period_label", p.label);
  r.set("fiscal_year", p.fy);
  const dup = (dao.findRecordsByFilter("work_plans", "staff = {:s} && plan_type = {:t} && period_start = {:p} && id != {:id}", "", 1, 0, { s: staff.id, t: type, p: noon(p.start), id: r.id || "" }) || [])[0];
  if (dup) throw new BadRequestError(`You already have a ${TYPE_LABEL[type].toLowerCase()} for ${p.label} (${dup.getString("number")}). Open it instead.`);
  r.set("title", str(r.getString("title"), 200) || `${TYPE_LABEL[type]} · ${p.label}`);
  r.set("focus", str(r.getString("focus"), 1000));
  if (r.getString("parent")) {
    const parent = load(dao, "work_plans", r.getString("parent"), "Higher-level plan");
    if (parent.getString("staff") !== staff.id) throw new BadRequestError("Link your plan to one of your own higher-level plans.");
    if (LEVEL[parent.getString("plan_type")] <= LEVEL[type]) throw new BadRequestError(`A ${TYPE_LABEL[type].toLowerCase()} contributes to a longer plan (monthly, quarterly or annual).`);
    if (day(parent.getString("period_start")) > p.end || day(parent.getString("period_end")) < p.start) throw new BadRequestError(`${parent.getString("number")} covers ${parent.getString("period_label")}, not ${p.label}.`);
  }
  const items = normItems(dao, type, p, core.parseJson(r, "items", []));
  r.set("items", items);
  r.set("progress", progressOf(items));
}

function beforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  const r = e.record;
  for (const f of SYSTEM) r.set(f, "");
  r.set("status", "draft");
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
  const before = p.getInt("progress");
  applyProgress(p, input.items);
  dao.saveRecord(p);
  if (before !== p.getInt("progress")) core.audit(dao, { actor, action: "progress_updated", collection: "work_plans", recordId: p.id, label: p.getString("number"), meta, changes: { progress: { old: before, new: p.getInt("progress") } } });
  return p;
}

function report(dao, id, actor, input, meta) {
  const p = load(dao, "work_plans", id, "Plan");
  own(p, actor);
  if (p.getString("status") !== "approved") throw new BadRequestError(`${p.getString("number")} is ${p.getString("status")}; only an approved plan is reported on.`);
  if (input.items) applyProgress(p, input.items);
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
  const next = periodOf(dao, type, addDays(day(p.getString("period_end")), type === "weekly" ? 3 : 1));
  const dup = (dao.findRecordsByFilter("work_plans", "staff = {:s} && plan_type = {:t} && period_start = {:p}", "", 1, 0, { s: actor.id, t: type, p: noon(next.start) }) || [])[0];
  if (dup) throw new BadRequestError(`${TYPE_LABEL[type]} for ${next.label} already exists (${dup.getString("number")}).`);
  const all = Boolean(input.all);
  const items = core.parseJson(p, "items", [])
    .filter((i) => all || (i.status !== "done" && i.status !== "dropped"))
    .map((i) => ({ ...i, id: "", start: "", due: "", status: "not_started", progress: all ? 0 : i.progress, achieved: "", comment: "" }));
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
  r.set("created_by", actor.id);
  prepare(dao, r, actor, null);
  r.set("number", core.nextNumber(dao, "work_plan"));
  dao.saveRecord(r);
  core.audit(dao, { actor, action: "created", collection: "work_plans", recordId: r.id, label: r.getString("number"), comment: `Copied from ${p.getString("number")} (${items.length} activities)`, meta });
  return r;
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
  TYPES, TYPE_LABEL, periodOf, supervisorOf, beforeCreate, beforeUpdate, submit, review, progress, report, assess, copyForward,
  beforeCreateCorrection, afterCreateCorrection, reviewCorrection,
};
