/// <reference path="../pb_data/types.d.ts" />
/**
 * Fixed assets API (M7). The register and its documents are written only here; rules in lib/assets.js.
 *
 *   GET  /api/ims/assets/overview                        totals, what is waiting, depreciation status
 *   GET  /api/ims/assets/:id/schedule                    the depreciation still to come
 *   GET  /api/ims/asset-reports/:key?from=&to=&department=
 *   POST /api/ims/assets                                 register an asset bought outside a PO or donated
 *   POST /api/ims/assets/opening                         opening register at go-live { as_of, assets: [...] }
 *   POST /api/ims/assets/:id/capitalise|assign|status|transfer|maintenance|dispose
 *   POST /api/ims/asset-transfers/:id/cancel
 *   POST /api/ims/asset-disposals/:id/update|submit|cancel
 *   POST /api/ims/depreciation-runs                      { year, month } — calculate
 *   POST /api/ims/depreciation-runs/:id/recalculate|submit|cancel
 *   POST /api/ims/asset-verifications                    start a count
 *   POST /api/ims/asset-verifications/:id/complete|cancel
 *   POST /api/ims/asset-verification-lines/:id           record one asset's count
 *   POST /api/ims/asset-requests/:id/decide              answer a staff equipment request
 */

routerAdd("GET", "/api/ims/assets/overview", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/assets.js`).overview($app.dao(), info.authRecord));
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/assets/:id/schedule", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/assets.js`).projection($app.dao(), info.authRecord, c.pathParam("id")));
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/asset-reports/:key", (c) => {
  const info = $apis.requestInfo(c);
  const f = {};
  for (const k of ["from", "to", "department"]) f[k] = c.queryParam(k) || "";
  return c.json(200, require(`${__hooks}/lib/assets.js`).report($app.dao(), info.authRecord, c.pathParam("key"), f));
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/assets", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let a;
  $app.dao().runInTransaction((tx) => {
    a = require(`${__hooks}/lib/assets.js`).registerAsset(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: a.id, code: a.getString("code") });
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/assets/opening", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = require(`${__hooks}/lib/assets.js`).opening(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/assets/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const assets = require(`${__hooks}/lib/assets.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  const data = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    let r;
    if (action === "capitalise") r = assets.capitalise(tx, info.authRecord, id, data, meta);
    else if (action === "assign") r = assets.assign(tx, info.authRecord, id, data, meta);
    else if (action === "status") r = assets.setStatus(tx, info.authRecord, id, data, meta);
    else if (action === "transfer") r = assets.requestTransfer(tx, info.authRecord, id, data, meta);
    else if (action === "maintenance") r = assets.addMaintenance(tx, info.authRecord, id, data, meta);
    else if (action === "dispose") r = assets.createDisposal(tx, info.authRecord, id, data, meta);
    else throw new NotFoundError(`Unknown asset action "${action}".`);
    out = { id: r.id, number: r.getString("number"), code: r.getString("code"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/asset-transfers/:id/cancel", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/assets.js`).cancelTransfer(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
    out = { id: r.id, status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/asset-disposals/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const assets = require(`${__hooks}/lib/assets.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    let r;
    if (action === "update") r = assets.updateDisposal(tx, info.authRecord, id, info.data || {}, meta);
    else if (action === "submit") {
      assets.submitDisposal(tx, info.authRecord, id, meta);
      r = tx.findRecordById("asset_disposals", id);
    } else if (action === "cancel") r = assets.cancelDisposal(tx, info.authRecord, id, info.data || {}, meta);
    else throw new NotFoundError(`Unknown disposal action "${action}".`);
    out = { id: r.id, number: r.getString("number"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/depreciation-runs", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/assets.js`).computeRun(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: r.id, number: r.getString("number"), status: r.getString("status"), total: r.getInt("total"), asset_count: r.getInt("asset_count") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/depreciation-runs/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const assets = require(`${__hooks}/lib/assets.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "recalculate") assets.recalculateRun(tx, info.authRecord, id, meta);
    else if (action === "submit") assets.submitRun(tx, info.authRecord, id, meta);
    else if (action === "cancel") assets.cancelRun(tx, info.authRecord, id, info.data || {}, meta);
    else throw new NotFoundError(`Unknown depreciation action "${action}".`);
    const r = tx.findRecordById("depreciation_runs", id);
    out = { id: r.id, number: r.getString("number"), status: r.getString("status"), total: r.getInt("total"), asset_count: r.getInt("asset_count") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/asset-verifications", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/assets.js`).startVerification(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: r.id, number: r.getString("number"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/asset-verifications/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const assets = require(`${__hooks}/lib/assets.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    let r;
    if (action === "complete") r = assets.completeVerification(tx, info.authRecord, c.pathParam("id"), info.data || {}, meta);
    else if (action === "cancel") r = assets.cancelVerification(tx, info.authRecord, c.pathParam("id"), info.data || {}, meta);
    else throw new NotFoundError(`Unknown count action "${action}".`);
    out = { id: r.id, number: r.getString("number"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/asset-verification-lines/:id", (c) => {
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/assets.js`).countLine(tx, info.authRecord, c.pathParam("id"), info.data || {});
    out = { id: r.id, result: r.getString("result") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/asset-requests/:id/decide", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/assets.js`).decideRequest(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
    out = { id: r.id, status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));
