/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement phase 5 API: purchase returns, contracts (with daily alerts), procurement plans.
 * Rules in lib/returns.js, lib/contracts.js, lib/planning.js.
 */

// ------------------------------------------------------------------ returns
// POST /api/dnr/returns  { goods_receipt, items: [{ line, quantity, condition, reason }], reason, supplier_action, notes }
routerAdd("POST", "/api/dnr/returns", (c) => {
  const returns = require(`${__hooks}/lib/returns.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let r;
  $app.dao().runInTransaction((tx) => {
    r = returns.create(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: r.id, number: r.getString("number") });
}, $apis.requireRecordAuth());

// POST /api/dnr/returns/:id/{submit|dispatch|credit|cancel}
routerAdd("POST", "/api/dnr/returns/:id/:action", (c) => {
  const returns = require(`${__hooks}/lib/returns.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "submit") out = returns.submit(tx, info.authRecord, id, meta);
    else if (action === "dispatch") out = returns.dispatch(tx, info.authRecord, id, info.data || {}, meta);
    else if (action === "credit") out = returns.credit(tx, info.authRecord, id, info.data || {}, meta);
    else if (action === "cancel") out = returns.cancel(tx, info.authRecord, id, info.data || {}, meta);
    else throw new NotFoundError(`Unknown return action "${action}".`);
  });
  return c.json(200, { id: out.id });
}, $apis.requireRecordAuth());

// ------------------------------------------------------------------ contracts
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/contracts.js`).beforeCreate(e), "contracts");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/contracts.js`).beforeUpdate(e), "contracts");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/contracts.js`).afterSave(e, true), "contracts");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/contracts.js`).afterSave(e, false), "contracts");

// POST /api/dnr/contracts/:id/{submit|terminate|cancel}
routerAdd("POST", "/api/dnr/contracts/:id/:action", (c) => {
  const contracts = require(`${__hooks}/lib/contracts.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = contracts.action(tx, info.authRecord, c.pathParam("id"), c.pathParam("action"), info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: out.id });
}, $apis.requireRecordAuth());

// GET /api/dnr/contracts/alerts — current alerts (expiry, renewal, spending, missing documents)
routerAdd("GET", "/api/dnr/contracts/alerts", (c) => {
  const contracts = require(`${__hooks}/lib/contracts.js`);
  return c.json(200, { items: contracts.alerts($app.dao(), false) });
}, $apis.requireRecordAuth());

// GET /api/dnr/contracts/:id/utilisation
routerAdd("GET", "/api/dnr/contracts/:id/utilisation", (c) => {
  const contracts = require(`${__hooks}/lib/contracts.js`);
  const dao = $app.dao();
  const k = dao.findRecordById("contracts", c.pathParam("id"));
  const u = contracts.utilisation(dao, k.id, "");
  return c.json(200, { value: k.getFloat("value"), used: u.used, orders: u.orders, remaining: Math.round((k.getFloat("value") - u.used) * 100) / 100 });
}, $apis.requireRecordAuth());

// Every morning: expire contracts, send renewal / expiry / spending / document alerts once each.
cronAdd("contract_alerts", "0 7 * * *", () => {
  const contracts = require(`${__hooks}/lib/contracts.js`);
  const dao = $app.dao();
  for (const k of dao.findRecordsByFilter("contracts", "status = 'active'", "", 5000, 0) || []) contracts.sync(dao, k.id);
  contracts.alerts(dao, true);
});

// ------------------------------------------------------------------ planning
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/planning.js`).planBeforeCreate(e), "procurement_plans");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/planning.js`).planBeforeUpdate(e), "procurement_plans");
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/planning.js`).lineBeforeSave(e), "procurement_plan_lines");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/planning.js`).lineBeforeSave(e), "procurement_plan_lines");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/planning.js`).lineBeforeDelete(e), "procurement_plan_lines");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/planning.js`).recount($app.dao(), e.record.getString("plan")), "procurement_plan_lines");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/planning.js`).recount($app.dao(), e.record.getString("plan")), "procurement_plan_lines");
onRecordAfterDeleteRequest((e) => require(`${__hooks}/lib/planning.js`).recount($app.dao(), e.record.getString("plan")), "procurement_plan_lines");

// Requisitions raised against a plan line are checked in lib/requisitions.js (after the department is set).

// POST /api/dnr/plans/:id/{submit|close}
routerAdd("POST", "/api/dnr/plans/:id/:action", (c) => {
  const planning = require(`${__hooks}/lib/planning.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = planning.action(tx, info.authRecord, c.pathParam("id"), c.pathParam("action"), info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: out.id });
}, $apis.requireRecordAuth());

// GET /api/dnr/plans/:id/progress
routerAdd("GET", "/api/dnr/plans/:id/progress", (c) => {
  const planning = require(`${__hooks}/lib/planning.js`);
  return c.json(200, planning.progress($app.dao(), c.pathParam("id")));
}, $apis.requireRecordAuth());

// ------------------------------------------------------------------ reports
// GET /api/dnr/procurement/reports/:key?from=&to=&department=&supplier=&category=&status=
routerAdd("GET", "/api/dnr/procurement/reports/:key", (c) => {
  const reports = require(`${__hooks}/lib/reports.js`);
  const info = $apis.requestInfo(c);
  const f = {};
  for (const k of ["from", "to", "department", "supplier", "category", "status"]) {
    const v = c.queryParam(k);
    if (v) f[k] = String(v).replace(/[^A-Za-z0-9_\-]/g, "").slice(0, 40);
  }
  return c.json(200, reports.run($app.dao(), info.authRecord, c.pathParam("key"), f));
}, $apis.requireRecordAuth());
