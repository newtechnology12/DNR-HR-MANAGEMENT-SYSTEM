/// <reference path="../../pb_data/types.d.ts" />
/**
 * Appraisal engine.
 *
 *  Evaluator score (0–100) = Σ section weight × (average rating in section ÷ top of scale), averaged over all
 *                            submitted reviews by the department head and designated evaluators (self excluded)
 *  Activity score  (0–100) = from the period's action plans and reports:
 *                            50% average plan completion, 25% plans completed on time, 25% reporting regularity
 *  Final score             = (100 − activity weight)% × evaluator score + activity weight% × activity score
 *  Grade                   = first grade band whose minimum the final score reaches
 */
const core = require("./core.js");

const LOCKED = ["shared", "acknowledged", "finalized"];

function portal() {
  return require("./portal.js");
}
function userOf(dao, id) {
  try {
    return id ? dao.findRecordById("users", id) : null;
  } catch (_) {
    return null;
  }
}
function ids(record, key) {
  const out = [];
  const s = record.getStringSlice(key) || [];
  for (let i = 0; i < s.length; i++) if (s[i]) out.push(String(s[i]));
  return out;
}
const round1 = (n) => Math.round(n * 10) / 10;

/** Weighted 0–100 score from ratings { criterionId: { value, comment } }. */
function scoreOf(template, ratings) {
  const scale = template.rating_scale || [];
  const top = Math.max.apply(null, scale.map((s) => Number(s.value) || 0).concat([1]));
  let total = 0;
  let weights = 0;
  const sections = {};
  for (const sec of template.sections || []) {
    let sum = 0;
    let w = 0;
    for (const c of sec.criteria || []) {
      const r = ratings && ratings[c.id];
      if (!r || !(Number(r.value) > 0)) continue;
      sum += (Number(r.value) / top) * (Number(c.weight) || 1);
      w += Number(c.weight) || 1;
    }
    if (!w) continue;
    const s = (sum / w) * 100;
    sections[sec.id] = round1(s);
    total += s * (Number(sec.weight) || 0);
    weights += Number(sec.weight) || 0;
  }
  return { score: weights ? round1(total / weights) : null, sections };
}

function gradeOf(template, score) {
  if (score === null || score === undefined) return { grade: "", label: "" };
  const bands = (template.grade_bands || []).slice().sort((a, b) => b.min - a.min);
  const b = bands.find((x) => score >= x.min) || bands[bands.length - 1];
  return b ? { grade: b.grade, label: b.label } : { grade: "", label: "" };
}

/** System score from action plans and reports in the appraisal period. */
function activity(dao, employeeId, start, end) {
  const from = String(start).slice(0, 10);
  const to = String(end).slice(0, 10);
  const plans = (dao.findRecordsByFilter("actionPlans", "staff_id = {:e} && scope != 'department' && status != 'cancelled' && start_date <= {:to} && end_date >= {:from}", "", 1000, 0, { e: employeeId, from: `${from} 00:00:00.000Z`, to: `${to} 23:59:59.999Z` }) || []);
  const reports = dao.findRecordsByFilter("employeeReports", "employee = {:e} && reportDate >= {:from} && reportDate <= {:to}", "", 1000, 0, { e: employeeId, from: `${from} 00:00:00.000Z`, to: `${to} 23:59:59.999Z` }) || [];
  const completion = plans.length ? plans.reduce((a, p) => a + (p.getString("status") === "completed" ? 100 : Math.min(100, p.getFloat("progress") || 0)), 0) / plans.length : null;
  const done = plans.filter((p) => p.getString("status") === "completed" && p.getString("deadline"));
  const onTime = done.length ? (done.filter((p) => p.getString("updated").slice(0, 10) <= p.getString("deadline").slice(0, 10)).length / done.length) * 100 : null;
  const months = Math.max(1, Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / (30.4 * 864e5)));
  const reporting = Math.min(100, (reports.length / months) * 100);
  const reviewed = reports.filter((r) => r.getString("status") === "reviewed").length;
  const parts = [[completion, 50], [onTime, 25], [reporting, 25]].filter(([v]) => v !== null);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const score = w ? round1(parts.reduce((a, [v, x]) => a + v * x, 0) / w) : 0;
  return {
    score,
    detail: {
      plans: plans.length, completed: plans.filter((p) => p.getString("status") === "completed").length, completion: completion === null ? null : round1(completion),
      on_time: onTime === null ? null : round1(onTime), reports: reports.length, reports_reviewed: reviewed, expected_reports: months, reporting: round1(reporting),
      note: !plans.length && !reports.length ? "No action plan or report recorded in the period." : "",
    },
  };
}

/** Department head plus colleagues in the department with the "evaluate_staff" permission. */
function evaluatorsFor(dao, employee) {
  const out = [];
  let head = "";
  try {
    head = dao.findRecordById("departments", employee.getString("department")).getString("head");
  } catch (_) {}
  if (head && head !== employee.id) out.push(head);
  const colleagues = dao.findRecordsByFilter("users", "department = {:d} && status = 'Active' && id != {:me}", "", 500, 0, { d: employee.getString("department"), me: employee.id }) || [];
  for (const u of colleagues) if (out.indexOf(u.id) === -1 && core.can(dao, u, "evaluate_staff")) out.push(u.id);
  return out;
}

function load(dao, id) {
  try {
    return dao.findRecordById("appraisals", id);
  } catch (_) {
    throw new NotFoundError("Appraisal not found.");
  }
}

function isManager(dao, auth, appraisal) {
  if (!auth) return true;
  const emp = userOf(dao, appraisal.getString("employee"));
  if (!emp || emp.id === auth.id) return false;
  return portal().managesEmployee(dao, auth, emp) || core.can(dao, auth, "manage_appraisals");
}
function canEvaluate(dao, auth, appraisal) {
  if (!auth || auth.id === appraisal.getString("employee")) return false;
  return ids(appraisal, "evaluators").indexOf(auth.id) !== -1 || isManager(dao, auth, appraisal);
}

/** Recalculate evaluator / self / final score and grade from the submitted reviews. */
function recompute(dao, a) {
  const tpl = core.parseJson(a, "template_snapshot", {});
  const reviews = dao.findRecordsByFilter("appraisal_reviews", "appraisal = {:a} && status = 'submitted'", "", 100, 0, { a: a.id }) || [];
  const others = reviews.filter((r) => r.getString("role") !== "self");
  const self = reviews.find((r) => r.getString("role") === "self");
  const evalScore = others.length ? round1(others.reduce((s, r) => s + r.getFloat("score"), 0) / others.length) : null;
  const sectionScores = {};
  for (const sec of tpl.sections || []) {
    const vals = others.map((r) => scoreOf(tpl, core.parseJson(r, "ratings", {})).sections[sec.id]).filter((v) => v !== undefined);
    if (vals.length) sectionScores[sec.id] = round1(vals.reduce((x, y) => x + y, 0) / vals.length);
  }
  const aw = Math.max(0, Math.min(100, Number(tpl.activity_weight) || 0));
  const final = evalScore === null ? null : round1(((100 - aw) * evalScore + aw * (a.getFloat("activity_score") || 0)) / 100);
  const g = gradeOf(tpl, final);
  a.set("evaluator_score", evalScore === null ? 0 : evalScore);
  a.set("self_score", self ? self.getFloat("score") : 0);
  a.set("final_score", final === null ? 0 : final);
  a.set("grade", g.grade);
  a.set("grade_label", g.label);
  a.set("section_scores", sectionScores);
  if (LOCKED.indexOf(a.getString("status")) === -1 && a.getString("status") !== "disputed") {
    const assigned = ids(a, "evaluators");
    const submittedBy = others.map((r) => r.getString("evaluator"));
    const allIn = others.length > 0 && assigned.every((x) => submittedBy.indexOf(x) !== -1);
    a.set("status", !reviews.length ? "not_started" : allIn ? "submitted" : "in_progress");
  }
  dao.saveRecord(a);
  return a;
}

// ------------------------------------------------------------------ actions
function launch(dao, auth, cycleId, meta) {
  core.requirePermission(dao, auth, "manage_appraisals", "launch appraisal cycles");
  let cycle;
  try {
    cycle = dao.findRecordById("appraisal_cycles", cycleId);
  } catch (_) {
    throw new NotFoundError("Appraisal cycle not found.");
  }
  if (cycle.getString("status") === "closed") throw new BadRequestError("This cycle is closed.");
  let tplRec;
  try {
    tplRec = dao.findRecordById("appraisal_templates", cycle.getString("template"));
  } catch (_) {
    throw new BadRequestError("Choose the appraisal template of the cycle.");
  }
  const tpl = {
    name: tplRec.getString("name"), rating_scale: core.parseJson(tplRec, "rating_scale", []), sections: core.parseJson(tplRec, "sections", []),
    grade_bands: core.parseJson(tplRec, "grade_bands", []), activity_weight: tplRec.getFloat("activity_weight"), allow_self_assessment: tplRec.getBool("allow_self_assessment"),
  };
  if (!tpl.sections.length) throw new BadRequestError(`Template "${tpl.name}" has no criteria.`);
  const depts = ids(cycle, "departments");
  const users = (dao.findRecordsByFilter("users", "status = 'Active' && department != ''", "name", 5000, 0) || []).filter((u) => !depts.length || depts.indexOf(u.getString("department")) !== -1);
  const col = dao.findCollectionByNameOrId("appraisals");
  let created = 0;
  const evaluatorLoad = {};
  for (const u of users) {
    let existing = null;
    try {
      existing = dao.findFirstRecordByFilter("appraisals", "cycle = {:c} && employee = {:e}", { c: cycle.id, e: u.id });
    } catch (_) {}
    if (existing) continue;
    const ev = evaluatorsFor(dao, u);
    const act = activity(dao, u.id, cycle.getString("period_start"), cycle.getString("period_end"));
    const a = new Record(col);
    a.load({ cycle: cycle.id, employee: u.id, department: u.getString("department"), evaluators: ev, status: "not_started", activity_score: act.score, activity_detail: act.detail, template_snapshot: tpl });
    dao.saveRecord(a);
    ev.forEach((x) => (evaluatorLoad[x] = (evaluatorLoad[x] || 0) + 1));
    created++;
  }
  cycle.set("status", "open");
  cycle.set("launched_at", new Date().toISOString());
  dao.saveRecord(cycle);
  for (const uid in evaluatorLoad) {
    core.notify(dao, [uid], { title: `Appraisals to complete: ${cycle.getString("name")}`, body: `${evaluatorLoad[uid]} staff member(s) to evaluate`, link: "/dashboard/hr/performance", type: "approval" });
  }
  if (tpl.allow_self_assessment) core.notify(dao, users.map((u) => u.id), { title: `${cycle.getString("name")}: self-assessment open`, body: "Rate your own performance before your supervisor's review.", link: "/dashboard/my/performance", type: "info" });
  core.audit(dao, { actor: auth, action: "appraisal_cycle_launched", collection: "appraisal_cycles", recordId: cycle.id, label: cycle.getString("name"), meta, changes: { appraisals: { old: null, new: created } } });
  return { created };
}

function review(dao, auth, id, input, meta) {
  const a = load(dao, id);
  const tpl = core.parseJson(a, "template_snapshot", {});
  const isSelf = auth.id === a.getString("employee");
  if (isSelf && !tpl.allow_self_assessment) throw new ForbiddenError("Self-assessment is not part of this appraisal.");
  if (!isSelf && !canEvaluate(dao, auth, a)) throw new ForbiddenError("You are not an evaluator for this staff member.");
  const status = a.getString("status");
  if (LOCKED.indexOf(status) !== -1) throw new BadRequestError("The results have been shared; ratings can only change if the employee raises a claim that is upheld.");
  if (isSelf && status === "disputed") throw new BadRequestError("Your self-assessment is closed.");
  const scale = (tpl.rating_scale || []).map((s) => Number(s.value));
  const ratings = {};
  const all = [];
  for (const sec of tpl.sections || []) for (const c of sec.criteria || []) all.push(c.id);
  for (const cid of all) {
    const r = (input.ratings || {})[cid];
    if (!r) continue;
    const v = Number(r.value);
    if (v && scale.indexOf(v) === -1) throw new BadRequestError("A rating is outside the scale.");
    ratings[cid] = { value: v || 0, comment: String(r.comment || "").slice(0, 2000) };
  }
  const submit = !!input.submit;
  if (submit) {
    const missing = all.filter((cid) => !(ratings[cid] && ratings[cid].value > 0));
    if (missing.length) throw new BadRequestError(`Rate every criterion before submitting (${missing.length} missing).`);
  }
  let r = null;
  try {
    r = dao.findFirstRecordByFilter("appraisal_reviews", "appraisal = {:a} && evaluator = {:e}", { a: a.id, e: auth.id });
  } catch (_) {}
  if (!r) {
    r = new Record(dao.findCollectionByNameOrId("appraisal_reviews"));
    r.set("appraisal", a.id);
    r.set("evaluator", auth.id);
  }
  let head = "";
  try {
    head = dao.findRecordById("departments", a.getString("department")).getString("head");
  } catch (_) {}
  r.set("role", isSelf ? "self" : auth.id === head ? "manager" : "evaluator");
  r.set("ratings", ratings);
  r.set("overall_comment", String(input.overall_comment || ""));
  r.set("score", scoreOf(tpl, ratings).score || 0);
  r.set("status", submit ? "submitted" : "draft");
  if (submit) r.set("submitted_at", new Date().toISOString());
  dao.saveRecord(r);
  if (!isSelf && ids(a, "evaluators").indexOf(auth.id) === -1) {
    a.set("evaluators", ids(a, "evaluators").concat([auth.id]));
  }
  recompute(dao, a);
  if (submit) core.audit(dao, { actor: auth, action: isSelf ? "self_assessment_submitted" : "appraisal_review_submitted", collection: "appraisals", recordId: a.id, label: userOf(dao, a.getString("employee")).getString("name"), meta, changes: { score: { old: null, new: r.getFloat("score") } } });
  return a;
}

function share(dao, auth, id, input, meta) {
  const a = load(dao, id);
  if (!isManager(dao, auth, a)) throw new ForbiddenError("Only the department head or HR can share appraisal results.");
  if (!(a.getFloat("evaluator_score") > 0)) throw new BadRequestError("At least one evaluator must submit a review before the results are shared.");
  if (["submitted", "in_progress", "disputed"].indexOf(a.getString("status")) === -1) throw new BadRequestError(`This appraisal is ${a.getString("status").replace(/_/g, " ")}.`);
  const open = dao.findRecordsByFilter("appraisal_claims", "appraisal = {:a} && status = 'open'", "", 10, 0, { a: a.id }) || [];
  if (open.length) throw new BadRequestError("Answer the employee's open claims first.");
  a.set("status", "shared");
  a.set("shared_at", new Date().toISOString());
  if (input.summary !== undefined) a.set("manager_summary", String(input.summary || ""));
  dao.saveRecord(a);
  core.notify(dao, [a.getString("employee")], { title: "Your appraisal results are available", body: `Score ${a.getFloat("final_score")} — grade ${a.getString("grade")} (${a.getString("grade_label")})`, link: "/dashboard/my/performance", type: "info" });
  core.audit(dao, { actor: auth, action: "appraisal_shared", collection: "appraisals", recordId: a.id, label: userOf(dao, a.getString("employee")).getString("name"), meta });
  return a;
}

function acknowledge(dao, auth, id, input, meta) {
  const a = load(dao, id);
  if (auth.id !== a.getString("employee")) throw new ForbiddenError("Only the employee can acknowledge their appraisal.");
  if (a.getString("status") !== "shared") throw new BadRequestError("There is nothing to acknowledge.");
  a.set("status", "acknowledged");
  a.set("acknowledged_at", new Date().toISOString());
  a.set("employee_comment", String(input.comment || ""));
  dao.saveRecord(a);
  core.notify(dao, ids(a, "evaluators"), { title: `${auth.getString("name")} acknowledged their appraisal`, body: String(input.comment || "").slice(0, 160), link: `/dashboard/hr/performance/appraisals/${a.id}`, type: "success" });
  core.audit(dao, { actor: auth, action: "appraisal_acknowledged", collection: "appraisals", recordId: a.id, label: auth.getString("name"), comment: input.comment, meta });
  return a;
}

function claim(dao, auth, id, input, meta) {
  const a = load(dao, id);
  if (auth.id !== a.getString("employee")) throw new ForbiddenError("Only the employee can raise a claim on their appraisal.");
  if (["shared", "disputed"].indexOf(a.getString("status")) === -1) throw new BadRequestError("Claims can be raised once the results are shared and before they are acknowledged or finalised.");
  const message = String(input.message || "").trim();
  if (message.length < 15) throw new BadRequestError("Explain your claim (at least 15 characters).");
  const c = new Record(dao.findCollectionByNameOrId("appraisal_claims"));
  c.load({ appraisal: a.id, author: auth.id, criterion: String(input.criterion || ""), message, status: "open" });
  dao.saveRecord(c);
  a.set("status", "disputed");
  dao.saveRecord(a);
  let head = "";
  try {
    head = dao.findRecordById("departments", a.getString("department")).getString("head");
  } catch (_) {}
  core.notify(dao, ids(a, "evaluators").concat([head]), { title: `${auth.getString("name")} raised a claim on their appraisal`, body: message.slice(0, 160), link: `/dashboard/hr/performance/appraisals/${a.id}`, type: "warning" });
  core.audit(dao, { actor: auth, action: "appraisal_claim_raised", collection: "appraisals", recordId: a.id, label: auth.getString("name"), comment: message, meta });
  return c;
}

function respond(dao, auth, claimId, input, meta) {
  let c;
  try {
    c = dao.findRecordById("appraisal_claims", claimId);
  } catch (_) {
    throw new NotFoundError("Claim not found.");
  }
  const a = load(dao, c.getString("appraisal"));
  if (!canEvaluate(dao, auth, a)) throw new ForbiddenError("Only an evaluator, the department head or HR can answer a claim.");
  if (c.getString("status") !== "open") throw new BadRequestError("This claim has already been answered.");
  const decision = ["upheld", "rejected", "answered"].indexOf(input.decision) !== -1 ? input.decision : "answered";
  const response = String(input.response || "").trim();
  if (response.length < 10) throw new BadRequestError("Write your answer (at least 10 characters).");
  c.set("status", decision);
  c.set("response", response);
  c.set("responded_by", auth.id);
  c.set("responded_at", new Date().toISOString());
  dao.saveRecord(c);
  const open = dao.findRecordsByFilter("appraisal_claims", "appraisal = {:a} && status = 'open'", "", 10, 0, { a: a.id }) || [];
  // An upheld claim keeps the appraisal open so evaluators can correct their ratings, then share again.
  if (!open.length && decision !== "upheld") {
    a.set("status", "shared");
    dao.saveRecord(a);
  }
  core.notify(dao, [a.getString("employee")], { title: `Your appraisal claim was ${decision === "upheld" ? "accepted" : decision === "rejected" ? "not accepted" : "answered"}`, body: response.slice(0, 160), link: "/dashboard/my/performance", type: decision === "rejected" ? "warning" : "info" });
  core.audit(dao, { actor: auth, action: `appraisal_claim_${decision}`, collection: "appraisals", recordId: a.id, label: c.getString("criterion") || "claim", comment: response, meta });
  return c;
}

function finalize(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "manage_appraisals", "finalise appraisals");
  const a = load(dao, id);
  if (["shared", "acknowledged"].indexOf(a.getString("status")) === -1) throw new BadRequestError("Only shared or acknowledged appraisals can be finalised (answer open claims first).");
  a.set("status", "finalized");
  a.set("finalized_at", new Date().toISOString());
  a.set("finalized_by", auth.id);
  dao.saveRecord(a);
  core.audit(dao, { actor: auth, action: "appraisal_finalized", collection: "appraisals", recordId: a.id, label: userOf(dao, a.getString("employee")).getString("name"), meta });
  return a;
}

function refresh(dao, auth, id) {
  const a = load(dao, id);
  if (!isManager(dao, auth, a)) throw new ForbiddenError("Only the department head or HR can refresh the activity score.");
  if (LOCKED.indexOf(a.getString("status")) !== -1) throw new BadRequestError("Results already shared.");
  const cycle = dao.findRecordById("appraisal_cycles", a.getString("cycle"));
  const act = activity(dao, a.getString("employee"), cycle.getString("period_start"), cycle.getString("period_end"));
  a.set("activity_score", act.score);
  a.set("activity_detail", act.detail);
  return recompute(dao, a);
}

module.exports = { scoreOf, gradeOf, activity, evaluatorsFor, launch, review, share, acknowledge, claim, respond, finalize, refresh, recompute };
