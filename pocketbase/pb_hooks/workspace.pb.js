/// <reference path="../pb_data/types.d.ts" />
/**
 * Staff workspace: work plans and attendance corrections. Rules live in lib/workspace.js.
 *
 *   work_plans                     collection API (own plans; drafts and returned plans are editable)
 *   POST /api/ims/plans/:id/submit                       to the supervisor
 *   POST /api/ims/plans/:id/review   { decision: approve | return, comment }      supervisor
 *   POST /api/ims/plans/:id/progress { items: [{ id, status, progress, achieved, comment }] }
 *   POST /api/ims/plans/:id/report   { report_summary, challenges, next_steps, support_needed, self_rating, items }
 *   POST /api/ims/plans/:id/assess   { decision: assess | return, rating, feedback }  supervisor
 *   POST /api/ims/plans/:id/copy     { all }              next period's plan as a draft
 *   GET  /api/ims/plans/period?type=&date=               the period containing a day
 *
 *   attendance_corrections         staff create their own; HR (update_attendance) decides
 *   POST /api/ims/attendance-corrections/:id/review { decision: approve | reject, comment }
 */

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/workspace.js`).beforeCreate(e), "work_plans");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/workspace.js`).beforeUpdate(e), "work_plans");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const r = e.record;
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "created", collection: "work_plans", recordId: r.id, label: r.getString("number"), comment: r.getString("title"), meta: core.requestMeta(e.httpContext) });
}, "work_plans");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (Object.keys(changes).length) core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "updated", collection: "work_plans", recordId: e.record.id, label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext) });
}, "work_plans");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/workspace.js`).beforeCreateCorrection(e), "attendance_corrections");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/workspace.js`).afterCreateCorrection(e), "attendance_corrections");

routerAdd("GET", "/api/ims/plans/period", (c) => {
  const ws = require(`${__hooks}/lib/workspace.js`);
  const type = c.queryParam("type") || "weekly";
  if (ws.TYPES.indexOf(type) === -1) throw new BadRequestError("Unknown plan type.");
  const d = String(c.queryParam("date") || new Date().toISOString()).slice(0, 10);
  const p = ws.periodOf($app.dao(), type, d);
  return c.json(200, { type, start: p.start, end: p.end, label: p.label, fiscal_year: p.fy });
}, $apis.requireAdminOrRecordAuth());

routerAdd("POST", "/api/ims/plans/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const ws = require(`${__hooks}/lib/workspace.js`);
  const info = $apis.requestInfo(c);
  const data = info.data || {};
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    let r;
    if (action === "submit") r = ws.submit(tx, id, info.authRecord, meta);
    else if (action === "review") r = ws.review(tx, id, info.authRecord, data, meta);
    else if (action === "progress") r = ws.progress(tx, id, info.authRecord, data, meta);
    else if (action === "report") r = ws.report(tx, id, info.authRecord, data, meta);
    else if (action === "assess") r = ws.assess(tx, id, info.authRecord, data, meta);
    else if (action === "copy") r = ws.copyForward(tx, id, info.authRecord, data, meta);
    else throw new NotFoundError(`Unknown action "${action}".`);
    out = { id: r.id, number: r.getString("number"), status: r.getString("status"), progress: r.getInt("progress") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/attendance-corrections/:id/review", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const ws = require(`${__hooks}/lib/workspace.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = ws.reviewCorrection(tx, c.pathParam("id"), info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: r.id, status: r.getString("status"), added_days: r.getInt("added_days") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));
