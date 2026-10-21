/// <reference path="../pb_data/types.d.ts" />
/**
 * Finance API (budgets live in budget.pb.js): supplier invoices (three-way match), invoice approval and payments.
 * Rules live in lib/finance.js.
 */

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceBeforeCreate(e), "supplier_invoices");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceAfterCreate(e), "supplier_invoices");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceBeforeUpdate(e), "supplier_invoices");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/finance.js`).invoiceAfterUpdate(e), "supplier_invoices");

// GET /api/dnr/budgets/usage → compatibility alias of /api/ims/budget/usage (one item per budget line)
routerAdd("GET", "/api/dnr/budgets/usage", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const budget = require(`${__hooks}/lib/budget.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "view_budgets") && !core.can(dao, info.authRecord, "manage_budgets")) {
    throw new ForbiddenError('You don\'t have permission to view budgets. Ask an administrator to grant "view_budgets" to your role.');
  }
  const u = budget.usage(dao, info.admin ? null : info.authRecord, {});
  const items = u.items.map((i) => ({ ...i, amount: i.budget, invoiced: i.actual, remaining: i.available }));
  return c.json(200, { year: u.fiscal_year.code, control: u.control, items });
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
