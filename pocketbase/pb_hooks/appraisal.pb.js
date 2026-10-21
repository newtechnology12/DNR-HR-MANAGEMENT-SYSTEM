/// <reference path="../pb_data/types.d.ts" />
/**
 * Appraisal API. Appraisals, reviews and claims are written only here; rules in lib/appraisal.js.
 */

// POST /api/dnr/appraisals/cycles/:id/launch
routerAdd("POST", "/api/dnr/appraisals/cycles/:id/launch", (c) => {
  const appraisal = require(`${__hooks}/lib/appraisal.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = appraisal.launch(tx, info.authRecord, c.pathParam("id"), core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// POST /api/dnr/appraisals/claims/:id/respond  { decision, response }
routerAdd("POST", "/api/dnr/appraisals/claims/:id/respond", (c) => {
  const appraisal = require(`${__hooks}/lib/appraisal.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = appraisal.respond(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: out.id, status: out.getString("status") });
}, $apis.requireRecordAuth());

// POST /api/dnr/appraisals/:id/{review|share|acknowledge|claim|finalize|refresh}
routerAdd("POST", "/api/dnr/appraisals/:id/:action", (c) => {
  const appraisal = require(`${__hooks}/lib/appraisal.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  const data = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "review") out = appraisal.review(tx, info.authRecord, id, data, meta);
    else if (action === "share") out = appraisal.share(tx, info.authRecord, id, data, meta);
    else if (action === "acknowledge") out = appraisal.acknowledge(tx, info.authRecord, id, data, meta);
    else if (action === "claim") out = appraisal.claim(tx, info.authRecord, id, data, meta);
    else if (action === "finalize") out = appraisal.finalize(tx, info.authRecord, id, meta);
    else if (action === "refresh") out = appraisal.refresh(tx, info.authRecord, id);
    else throw new NotFoundError(`Unknown appraisal action "${action}".`);
  });
  return c.json(200, { id: out.id, status: out.getString("status") });
}, $apis.requireRecordAuth());

// Templates and cycles: "manage_appraisals" only.
["appraisal_templates", "appraisal_cycles"].forEach((col) => {
  const guard = (e) => {
    const auth = e.httpContext.get("authRecord");
    if (!auth) return;
    require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "manage_appraisals", "configure appraisals");
    if (e.record.isNew()) e.record.set("created_by", auth.id);
  };
  onRecordBeforeCreateRequest(guard, col);
  onRecordBeforeUpdateRequest(guard, col);
  onRecordBeforeDeleteRequest(guard, col);
});

// GET /api/dnr/appraisals/mine — the signed-in employee's appraisals. Scores and evaluator feedback only
// once results are shared; before that, just what is needed for the self-assessment.
routerAdd("GET", "/api/dnr/appraisals/mine", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  const me = info.authRecord;
  const SHARED = ["shared", "acknowledged", "disputed", "finalized"];
  const rows = dao.findRecordsByFilter("appraisals", "employee = {:e}", "-created", 50, 0, { e: me.id }) || [];
  const out = rows.map((a) => {
    const cycle = dao.findRecordById("appraisal_cycles", a.getString("cycle"));
    const tpl = core.parseJson(a, "template_snapshot", {});
    const shared = SHARED.indexOf(a.getString("status")) !== -1;
    const reviews = dao.findRecordsByFilter("appraisal_reviews", "appraisal = {:a}", "", 50, 0, { a: a.id }) || [];
    const self = reviews.find((r) => r.getString("evaluator") === me.id);
    const item = {
      id: a.id, status: a.getString("status"),
      cycle: { id: cycle.id, name: cycle.getString("name"), status: cycle.getString("status"), period_start: cycle.getString("period_start"), period_end: cycle.getString("period_end"), due_date: cycle.getString("due_date") },
      template: tpl,
      self: self ? { status: self.getString("status"), ratings: core.parseJson(self, "ratings", {}), overall_comment: self.getString("overall_comment"), score: self.getFloat("score") } : null,
      shared,
    };
    if (shared) {
      const others = reviews.filter((r) => r.getString("role") !== "self" && r.getString("status") === "submitted");
      const avg = {};
      for (const sec of tpl.sections || []) for (const cr of sec.criteria || []) {
        const vals = others.map((r) => (core.parseJson(r, "ratings", {})[cr.id] || {}).value).filter((v) => v > 0);
        const notes = others.map((r) => (core.parseJson(r, "ratings", {})[cr.id] || {}).comment).filter((x) => x);
        avg[cr.id] = { value: vals.length ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 10) / 10 : null, comments: notes };
      }
      Object.assign(item, {
        final_score: a.getFloat("final_score"), evaluator_score: a.getFloat("evaluator_score"), activity_score: a.getFloat("activity_score"), self_score: a.getFloat("self_score"),
        activity_detail: core.parseJson(a, "activity_detail", {}), grade: a.getString("grade"), grade_label: a.getString("grade_label"), section_scores: core.parseJson(a, "section_scores", {}),
        manager_summary: a.getString("manager_summary"), employee_comment: a.getString("employee_comment"), criteria: avg,
        comments: others.filter((r) => r.getString("overall_comment")).map((r) => {
          let name = "";
          try {
            name = dao.findRecordById("users", r.getString("evaluator")).getString("name");
          } catch (_) {}
          return { evaluator: name, role: r.getString("role"), comment: r.getString("overall_comment") };
        }),
      });
    }
    return item;
  });
  return c.json(200, { items: out });
}, $apis.requireRecordAuth());
