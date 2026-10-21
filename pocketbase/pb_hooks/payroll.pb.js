/// <reference path="../pb_data/types.d.ts" />
/**
 * Payroll API. Payroll records are written only here (API rules deny direct writes).
 * Approval goes through the approval engine (document type "payroll"); rules in lib/payroll.js.
 */

// POST /api/dnr/payroll  { year, month, branch?, notes? }
routerAdd("POST", "/api/dnr/payroll", (c) => {
  const payroll = require(`${__hooks}/lib/payroll.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let p;
  $app.dao().runInTransaction((tx) => {
    p = payroll.create(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: p.id, number: p.getString("number") });
}, $apis.requireRecordAuth());

// POST /api/dnr/payroll/preview  salary structure → full breakdown
// POST /api/dnr/payroll/preview-run   { year, month, branch? } — the whole payroll before it is created
routerAdd("POST", "/api/dnr/payroll/preview-run", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/payroll.js`).previewRun($app.dao(), info.authRecord, info.data || {}));
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/dnr/payroll/preview", (c) => {
  const payroll = require(`${__hooks}/lib/payroll.js`);
  const info = $apis.requestInfo(c);
  return c.json(200, payroll.preview($app.dao(), info.data || {}));
}, $apis.requireAdminOrRecordAuth());

// POST /api/dnr/payroll/:id/{compute|submit|paid|cancel}
routerAdd("POST", "/api/dnr/payroll/:id/:action", (c) => {
  const payroll = require(`${__hooks}/lib/payroll.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "compute") out = payroll.compute(tx, info.authRecord, id, meta);
    else if (action === "submit") out = payroll.submit(tx, info.authRecord, id, meta);
    else if (action === "paid") out = payroll.markPaid(tx, info.authRecord, id, info.data || {}, meta);
    else if (action === "cancel") out = payroll.cancel(tx, info.authRecord, id, info.data || {}, meta);
    else throw new NotFoundError(`Unknown payroll action "${action}".`);
  });
  return c.json(200, { id: out.id, status: out.getString("status") });
}, $apis.requireRecordAuth());

// Payroll configuration: only with "manage_payroll_settings".
["paye_bands", "statutory_contributions"].forEach((col) => {
  const guard = (e) => {
    const auth = e.httpContext.get("authRecord");
    if (auth) require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "manage_payroll_settings", "change payroll tax settings");
  };
  onRecordBeforeCreateRequest(guard, col);
  onRecordBeforeUpdateRequest(guard, col);
  onRecordBeforeDeleteRequest(guard, col);
});
["salary_structures"].forEach((col) => {
  const guard = (e) => {
    const auth = e.httpContext.get("authRecord");
    if (!auth) return;
    require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "manage_salaries", "edit salaries");
    e.record.set("updated_by", auth.id);
  };
  onRecordBeforeCreateRequest(guard, col);
  onRecordBeforeUpdateRequest(guard, col);
});

// Payslips keep a copy of their run's status (staff cannot read the run itself).
onModelAfterUpdate((e) => require(`${__hooks}/lib/payroll.js`).syncSlips(e.dao, e.model), "payrolls");
