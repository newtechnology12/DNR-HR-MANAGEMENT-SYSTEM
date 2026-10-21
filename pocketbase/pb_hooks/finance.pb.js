/// <reference path="../pb_data/types.d.ts" />
/**
 * Finance API: budgets, supplier invoices (three-way match), invoice approval and payments.
 * Rules live in lib/finance.js.
 */

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/finance.js`).budgetGuard(e), "budgets");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/finance.js`).budgetGuard(e), "budgets");
onRecordBeforeDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission($app.dao(), auth, "manage_budgets", "delete budgets");
}, "budgets");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "created", collection: "budgets", recordId: e.record.id, label: e.record.getString("name"), changes: { amount: { old: null, new: e.record.getFloat("amount") } }, meta: core.requestMeta(e.httpContext) });
}, "budgets");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "updated", collection: "budgets", recordId: e.record.id, label: e.record.getString("name"), changes: { amount: { old: null, new: e.record.getFloat("amount") } }, meta: core.requestMeta(e.httpContext) });
}, "budgets");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceBeforeCreate(e), "supplier_invoices");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceAfterCreate(e), "supplier_invoices");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceBeforeUpdate(e), "supplier_invoices");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceAfterUpdate(e), "supplier_invoices");

// GET /api/dnr/budgets/usage?year=2026 → every budget with live committed / invoiced / paid / remaining
routerAdd("GET", "/api/dnr/budgets/usage", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const finance = require(`${__hooks}/lib/finance.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "view_budgets") && !core.can(dao, info.authRecord, "manage_budgets")) {
    throw new ForbiddenError('You don\'t have permission to view budgets. Ask an administrator to grant "view_budgets" to your role.');
  }
  const year = parseInt(c.queryParam("year") || String(new Date().getFullYear()), 10);
  const budgets = dao.findRecordsByFilter("budgets", "fiscal_year = {:y}", "", 500, 0, { y: year }) || [];
  const items = budgets.map((b) => {
    let dept = "", cat = "";
    try { dept = dao.findRecordById("departments", b.getString("department")).getString("name"); } catch (_) {}
    try { if (b.getString("category")) cat = dao.findRecordById("procurement_categories", b.getString("category")).getString("name"); } catch (_) {}
    return { id: b.id, name: b.getString("name"), department: b.getString("department"), department_name: dept, category: b.getString("category"), category_name: cat, fiscal_year: year, status: b.getString("status"), cost_center: b.getString("cost_center"), notes: b.getString("notes"), ...finance.usage(dao, b) };
  });
  return c.json(200, { year, control: finance.settings(dao).budgetControl, items });
}, $apis.requireAdminOrRecordAuth());

// POST /api/dnr/invoices/:id/{resolve|submit|cancel|pay}
routerAdd("POST", "/api/dnr/invoices/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const finance = require(`${__hooks}/lib/finance.js`);
  const info = $apis.requestInfo(c);
  const action = c.pathParam("action");
  const meta = core.requestMeta(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "pay") {
      const p = finance.pay(tx, c.pathParam("id"), info.authRecord, info.data || {}, meta);
      out = { id: p.id, number: p.getString("number") };
    } else {
      const r = finance.invoiceAction(tx, c.pathParam("id"), info.authRecord, action, info.data || {}, meta);
      out = { id: r.id, status: r.getString("status") };
    }
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());
