/// <reference path="../pb_data/types.d.ts" />
/**
 * General ledger API (M8). Rules in lib/gl.js (journals, trial balance, period close) and lib/glpost.js (posting
 * rules and the backfill).
 *
 *   POST /api/ims/journals                                manual journal (draft) { date, description, lines }
 *   POST /api/ims/journals/:id/update|submit|cancel|reverse
 *   POST /api/ims/recurring-journals                      recurring template { name, frequency, day_of_month, start_date, end_date, lines }
 *   POST /api/ims/recurring-journals/generate             journals due from every active template
 *   POST /api/ims/recurring-journals/:id/update|generate
 *   GET  /api/ims/ledger/trial-balance?from=&to=&department=&funding_source=&project=
 *   GET  /api/ims/ledger/account/:id?from=&to=&department=&funding_source=&project=
 *   GET  /api/ims/ledger/periods                          periods with their close checklist
 *   GET  /api/ims/ledger/periods/:id
 *   POST /api/ims/ledger/periods/:id/close|reopen
 *   POST /api/ims/period-reopen/:id/cancel
 *   POST /api/ims/ledger/backfill                         post documents recorded before the posting rules
 */

routerAdd("POST", "/api/ims/journals", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const j = require(`${__hooks}/lib/gl.js`).saveJournal(tx, info.authRecord, info.data || {}, null, core.requestMeta(c));
    out = { id: j.id, number: j.getString("number"), status: j.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/journals/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const gl = require(`${__hooks}/lib/gl.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  const data = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "update") gl.saveJournal(tx, info.authRecord, data, tx.findRecordById("gl_journals", id), meta);
    else if (action === "submit") gl.submitJournal(tx, info.authRecord, id, meta);
    else if (action === "cancel") gl.cancelJournal(tx, info.authRecord, id, data, meta);
    else if (action === "reverse") {
      const rev = gl.reverseJournal(tx, info.authRecord, id, data, meta);
      out = { id: rev.id, number: rev.getString("number"), status: rev.getString("status") };
      return;
    } else throw new NotFoundError(`Unknown journal action "${action}".`);
    const j = tx.findRecordById("gl_journals", id);
    out = { id: j.id, number: j.getString("number"), status: j.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/recurring-journals", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const t = require(`${__hooks}/lib/gl.js`).saveRecurring(tx, info.authRecord, info.data || {}, "", core.requestMeta(c));
    out = { id: t.id, next_date: t.getString("next_date") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/recurring-journals/generate", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = require(`${__hooks}/lib/gl.js`).generateDue(tx, info.authRecord, {}, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/recurring-journals/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const gl = require(`${__hooks}/lib/gl.js`);
  const info = $apis.requestInfo(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "update") {
      const t = gl.saveRecurring(tx, info.authRecord, info.data || {}, id, core.requestMeta(c));
      out = { id: t.id, next_date: t.getString("next_date") };
    } else if (action === "generate") out = gl.generateDue(tx, info.authRecord, { id }, core.requestMeta(c));
    else throw new NotFoundError(`Unknown action "${action}".`);
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/ledger/trial-balance", (c) => {
  const info = $apis.requestInfo(c);
  const f = {};
  for (const k of ["from", "to", "department", "funding_source", "project"]) f[k] = c.queryParam(k) || "";
  return c.json(200, require(`${__hooks}/lib/gl.js`).trialBalance($app.dao(), info.authRecord, f));
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/ledger/account/:id", (c) => {
  const info = $apis.requestInfo(c);
  const f = {};
  for (const k of ["from", "to", "department", "funding_source", "project"]) f[k] = c.queryParam(k) || "";
  return c.json(200, require(`${__hooks}/lib/gl.js`).accountLedger($app.dao(), info.authRecord, c.pathParam("id"), f));
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/ledger/periods", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/gl.js`).periods($app.dao(), info.authRecord));
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/ledger/periods/:id", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/gl.js`).periodDetail($app.dao(), info.authRecord, c.pathParam("id")));
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/ledger/periods/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const gl = require(`${__hooks}/lib/gl.js`);
  const info = $apis.requestInfo(c);
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "close") {
      const p = gl.closePeriod(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
      out = { id: p.id, status: p.getString("status") };
    } else if (action === "reopen") {
      const r = gl.requestReopen(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
      out = { id: r.id, number: r.getString("number"), status: tx.findRecordById("period_reopen_requests", r.id).getString("status") };
    } else throw new NotFoundError(`Unknown period action "${action}".`);
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/period-reopen/:id/cancel", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/gl.js`).cancelReopen(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
    out = { id: r.id, status: tx.findRecordById("period_reopen_requests", r.id).getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/ledger/backfill", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const auth = info.admin ? null : info.authRecord;
  const dao = $app.dao();
  if (auth && !core.can(dao, auth, "close_periods") && !core.can(dao, auth, "approve_journals")) {
    throw new ForbiddenError('Only the Director of Finance posts earlier documents to the ledger ("close_periods").');
  }
  let out;
  dao.runInTransaction((tx) => {
    out = require(`${__hooks}/lib/glpost.js`).backfill(tx, auth, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireAdminOrRecordAuth());
