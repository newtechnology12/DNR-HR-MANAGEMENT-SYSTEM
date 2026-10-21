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
    if (auth) {
      require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "manage_salaries", "edit salaries");
      e.record.set("updated_by", auth.id);
    }
    require(`${__hooks}/lib/payroll.js`).beforeSaveStructure(e);
  };
  onRecordBeforeCreateRequest(guard, col);
  onRecordBeforeUpdateRequest(guard, col);
});

// Payslips keep a copy of their run's status (staff cannot read the run itself).
onModelAfterUpdate((e) => require(`${__hooks}/lib/payroll.js`).syncSlips(e.dao, e.model), "payrolls");

// GET /api/dnr/payroll/:id/reconciliation — this payroll against the previous one
routerAdd("GET", "/api/dnr/payroll/:id/reconciliation", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/payroll.js`).reconciliation($app.dao(), info.authRecord, c.pathParam("id")));
}, $apis.requireRecordAuth("users"));

// Salary payments for the Cashier: totals and the transfers to make, never the pay details.
//   GET /api/ims/salary-payments               approved payrolls to pay and the last paid ones
//   GET /api/ims/salary-payments/:id/transfers beneficiary, bank, account and net pay per employee
routerAdd("GET", "/api/ims/salary-payments", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, { items: require(`${__hooks}/lib/payroll.js`).paymentQueue($app.dao(), info.authRecord) });
}, $apis.requireRecordAuth("users"));
routerAdd("GET", "/api/ims/salary-payments/:id/transfers", (c) => {
  const info = $apis.requestInfo(c);
  return c.json(200, require(`${__hooks}/lib/payroll.js`).bankFile($app.dao(), info.authRecord, c.pathParam("id")));
}, $apis.requireRecordAuth("users"));

// Staff loans repaid through the payroll: HR records, Finance approves (never the same person).
//   POST /api/ims/payroll-loans                     { employee, loan_type, purpose, principal, installment, start_year, start_month }
//   POST /api/ims/payroll-loans/:id/decide          { decision: approve | reject, comment }
//   POST /api/ims/payroll-loans/:id/cancel          { reason }
routerAdd("POST", "/api/ims/payroll-loans", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/payroll.js`).createLoan(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: r.id, number: r.getString("number"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));
routerAdd("POST", "/api/ims/payroll-loans/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const payroll = require(`${__hooks}/lib/payroll.js`);
  const info = $apis.requestInfo(c);
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    let r;
    if (action === "decide") r = payroll.decideLoan(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
    else if (action === "cancel") r = payroll.cancelLoan(tx, info.authRecord, c.pathParam("id"), info.data || {}, core.requestMeta(c));
    else throw new NotFoundError(`Unknown action "${action}".`);
    out = { id: r.id, number: r.getString("number"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

// The general ledger is read with "view_journals" (the journals hold no personal pay data: payroll is posted by
// department and funding source).
onRecordsListRequest((e) => require(`${__hooks}/lib/ledger.js`).guardRead(e), "gl_journals", "gl_journal_lines");
onRecordViewRequest((e) => require(`${__hooks}/lib/ledger.js`).guardRead(e), "gl_journals", "gl_journal_lines");

// GET /api/ims/ledger/posting-accounts — every automatic posting with the account it uses
routerAdd("GET", "/api/ims/ledger/posting-accounts", (c) => {
  return c.json(200, { items: require(`${__hooks}/lib/ledger.js`).postingList($app.dao()) });
}, $apis.requireRecordAuth("users"));
