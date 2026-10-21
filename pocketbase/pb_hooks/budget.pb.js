/// <reference path="../pb_data/types.d.ts" />
/**
 * Budgeting and budget control API (IMS M2). Rules live in lib/budget.js.
 *
 *   budgets / budget_lines        prepared by the Budget Officer while draft or returned
 *   budget_revisions              supplementary, reduction, virement, re-phasing
 *   POST /api/ims/budgets/:id/{submit|cancel}
 *   POST /api/ims/budgets/:id/lines            bulk lines (Excel import / editor) { lines, replace }
 *   POST /api/ims/budget-revisions/:id/{submit|cancel}
 *   GET  /api/ims/budget/usage                 utilisation per line (scoped for heads of department)
 *   GET  /api/ims/budget/bva                   budget vs actual for a period range, grouped
 *   GET  /api/ims/budget/available?line=&amount=   balance of one line (requesters of that department)
 *   GET  /api/ims/budget/lines/:id/ledger      commitments and actuals of a line
 *   POST /api/ims/budget/overrides             DAF override for one document { document_type, document_id, reason }
 */

// ------------------------------------------------------------------ budget documents
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/budget.js`).budgetBeforeCreate(e), "budgets");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/budget.js`).budgetBeforeUpdate(e), "budgets");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/budget.js`).budgetBeforeDelete(e), "budgets");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "created", collection: "budgets", recordId: e.record.id, label: e.record.getString("number"), comment: e.record.getString("name"), meta: core.requestMeta(e.httpContext) });
}, "budgets");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const raw = e.httpContext.get("dnrAudit");
  const changes = raw ? JSON.parse(raw) : {};
  if (Object.keys(changes).length) core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "updated", collection: "budgets", recordId: e.record.id, label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext) });
}, "budgets");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/budget.js`).lineBeforeWrite(e, "create"), "budget_lines");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/budget.js`).lineBeforeWrite(e, "update"), "budget_lines");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/budget.js`).lineBeforeWrite(e, "delete"), "budget_lines");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/budget.js`).lineAfterWrite(e), "budget_lines");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/budget.js`).lineAfterWrite(e), "budget_lines");
onRecordAfterDeleteRequest((e) => require(`${__hooks}/lib/budget.js`).lineAfterWrite(e), "budget_lines");

// Amounts are hidden from people without budget access (requesters may still pick a line by name).
onRecordsListRequest((e) => {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const budget = require(`${__hooks}/lib/budget.js`);
  for (const r of e.records || []) budget.hideAmounts($app.dao(), auth, r);
}, "budget_lines", "budgets", "budget_revisions", "budget_overrides");
onRecordViewRequest((e) => {
  const auth = e.httpContext.get("authRecord");
  if (auth) require(`${__hooks}/lib/budget.js`).hideAmounts($app.dao(), auth, e.record);
}, "budget_lines", "budgets", "budget_revisions", "budget_overrides");

// ------------------------------------------------------------------ revisions
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/budget.js`).revisionBeforeCreate(e), "budget_revisions");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/budget.js`).revisionBeforeUpdate(e), "budget_revisions");
onRecordBeforeDeleteRequest((e) => {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "manage_budgets", "delete budget revisions");
  if (e.record.getString("status") !== "draft" || e.record.getString("approval")) throw new BadRequestError("Only drafts that were never submitted can be deleted; cancel the revision instead.");
}, "budget_revisions");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "created", collection: "budget_revisions", recordId: e.record.id, label: e.record.getString("number"), comment: e.record.getString("title"), meta: core.requestMeta(e.httpContext) });
}, "budget_revisions");

// ------------------------------------------------------------------ actions
routerAdd("POST", "/api/ims/budgets/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const budget = require(`${__hooks}/lib/budget.js`);
  const info = $apis.requestInfo(c);
  const d = info.data || {};
  const meta = core.requestMeta(c);
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "submit") {
      const a = budget.submitBudget(tx, c.pathParam("id"), info.authRecord, meta);
      out = { approval: a.id, status: "pending_approval" };
    } else if (action === "cancel") {
      const b = budget.cancelBudget(tx, c.pathParam("id"), info.authRecord, d.reason, meta);
      out = { id: b.id, status: b.getString("status") };
    } else if (action === "lines") {
      out = { saved: budget.saveLines(tx, c.pathParam("id"), info.authRecord, d.lines, Boolean(d.replace), meta) };
    } else {
      throw new NotFoundError("Unknown budget action.");
    }
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/budget-revisions/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const budget = require(`${__hooks}/lib/budget.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "submit") {
      const a = budget.submitRevision(tx, c.pathParam("id"), info.authRecord, meta);
      out = { approval: a.id, status: "pending_approval" };
    } else if (action === "cancel") {
      const r = budget.cancelRevision(tx, c.pathParam("id"), info.authRecord, (info.data || {}).reason, meta);
      out = { id: r.id, status: r.getString("status") };
    } else {
      throw new NotFoundError("Unknown revision action.");
    }
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/budget/overrides", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const budget = require(`${__hooks}/lib/budget.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const ov = budget.grantOverride(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: ov.id, shortfall: ov.getInt("shortfall") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

// ------------------------------------------------------------------ reporting
routerAdd("GET", "/api/ims/budget/usage", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "view_budgets") && !core.can(dao, info.authRecord, "manage_budgets")) {
    throw new ForbiddenError('You don\'t have permission to view budgets. Ask an administrator to grant "view_budgets" to your role.');
  }
  const q = {};
  for (const k of ["fiscal_year", "department", "funding_source", "project", "kind", "gl_account"]) q[k] = c.queryParam(k) || "";
  return c.json(200, require(`${__hooks}/lib/budget.js`).usage(dao, info.admin ? null : info.authRecord, q));
}, $apis.requireAdminOrRecordAuth());

routerAdd("GET", "/api/ims/budget/bva", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "view_budgets") && !core.can(dao, info.authRecord, "manage_budgets")) {
    throw new ForbiddenError('You don\'t have permission to view budgets. Ask an administrator to grant "view_budgets" to your role.');
  }
  const q = {};
  for (const k of ["fiscal_year", "department", "funding_source", "project", "kind", "gl_account", "from_period", "to_period", "group_by"]) q[k] = c.queryParam(k) || "";
  return c.json(200, require(`${__hooks}/lib/budget.js`).bva(dao, info.admin ? null : info.authRecord, q));
}, $apis.requireAdminOrRecordAuth());

routerAdd("GET", "/api/ims/budget/available", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const budget = require(`${__hooks}/lib/budget.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  let line;
  try {
    line = dao.findRecordById("budget_lines", c.queryParam("line"));
  } catch (_) {
    throw new NotFoundError("Budget line not found.");
  }
  const auth = info.authRecord;
  const viewer = info.admin || core.can(dao, auth, "view_budgets") || core.can(dao, auth, "manage_budgets");
  if (!viewer && line.getString("department") !== auth.getString("department")) throw new ForbiddenError("You can only check the budget lines of your own department.");
  const f = budget.lineFigures(dao, line);
  const amount = Math.round(Number(c.queryParam("amount")) || 0);
  return c.json(200, {
    line: { id: line.id, code: line.getString("code"), name: line.getString("name") },
    available: f.available, sufficient: amount ? amount <= f.available : f.available > 0, status: f.status, control: budget.settings(dao).control,
    ...(viewer ? { budget: f.budget, committed: f.committed, actual: f.actual, used_pct: f.used_pct } : {}),
  });
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/budget/lines/:id/ledger", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "view_budgets") && !core.can(dao, info.authRecord, "manage_budgets")) {
    throw new ForbiddenError('You don\'t have permission to view budgets. Ask an administrator to grant "view_budgets" to your role.');
  }
  const budget = require(`${__hooks}/lib/budget.js`);
  let line;
  try {
    line = dao.findRecordById("budget_lines", c.pathParam("id"));
  } catch (_) {
    throw new NotFoundError("Budget line not found.");
  }
  return c.json(200, { figures: budget.lineFigures(dao, line), entries: budget.ledgerOf(dao, line.id) });
}, $apis.requireAdminOrRecordAuth());
