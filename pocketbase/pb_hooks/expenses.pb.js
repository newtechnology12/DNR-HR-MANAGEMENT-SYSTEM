/// <reference path="../pb_data/types.d.ts" />
/**
 * Staff expenses and salary advances (rules in lib/expenses.js).
 *
 *   POST /api/ims/staff-expenses                       { category, amount, date, description, pay_by, momoNumber, momoName }
 *   POST /api/ims/staff-expenses/:id/update            a returned request, corrected and sent again
 *   POST /api/ims/staff-expenses/:id/cancel            { reason }
 *   POST /api/ims/staff-expenses/:id/pay               { account, method, date, reference } — the Cashier
 *
 * Expense categories: a claim category is charged to an active expense account; an advance category posts to staff
 * advances (Setup → posting accounts, "payroll.advances").
 */

routerAdd("POST", "/api/ims/staff-expenses", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = require(`${__hooks}/lib/expenses.js`).create(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: r.id, number: r.getString("number"), status: tx.findRecordById("prepayments", r.id).getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/staff-expenses/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const lib = require(`${__hooks}/lib/expenses.js`);
  const info = $apis.requestInfo(c);
  const meta = core.requestMeta(c);
  const id = c.pathParam("id");
  const action = c.pathParam("action");
  const data = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "update") lib.update(tx, info.authRecord, id, data, meta);
    else if (action === "cancel") lib.cancel(tx, info.authRecord, id, data, meta);
    else if (action === "pay") lib.pay(tx, info.authRecord, id, data, meta);
    else throw new NotFoundError(`Unknown action "${action}".`);
    const r = tx.findRecordById("prepayments", id);
    out = { id: r.id, number: r.getString("number"), status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/expenses.js`).checkCategory(e, true), "expenses_categories");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/expenses.js`).checkCategory(e, false), "expenses_categories");
