/// <reference path="../pb_data/types.d.ts" />
/**
 * Payment vouchers and payables reports (IMS M4). Rules live in lib/vouchers.js.
 *
 *   payment_vouchers                      prepared by the Accountant (draft / returned are editable)
 *   POST /api/ims/vouchers/:id/submit     to approval (DAF → SG above the DAF limit)
 *   POST /api/ims/vouchers/:id/pay        Cashier executes { payment_date, method, reference }
 *   POST /api/ims/vouchers/:id/cancel     { reason }
 *   GET  /api/ims/vouchers/payable?supplier=&voucher=   approved invoices still free to pay
 *   GET  /api/ims/payables/reports/:key   ageing | outstanding | payment_register | payment_summary | wht_schedule
 */

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/vouchers.js`).beforeCreate(e), "payment_vouchers");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/vouchers.js`).beforeUpdate(e), "payment_vouchers");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/vouchers.js`).beforeDelete(e), "payment_vouchers");
onRecordsListRequest((e) => require(`${__hooks}/lib/vouchers.js`).guardRead(e), "payment_vouchers");
onRecordViewRequest((e) => require(`${__hooks}/lib/vouchers.js`).guardRead(e), "payment_vouchers");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const v = e.record;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "created", collection: "payment_vouchers", recordId: v.id, label: v.getString("number"),
    comment: `${v.getString("payee_name")} · ${core.formatMoney(v.getInt("gross_amount"), "RWF")}`, meta: core.requestMeta(e.httpContext),
  });
}, "payment_vouchers");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (Object.keys(changes).length) {
    core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "updated", collection: "payment_vouchers", recordId: e.record.id, label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext) });
  }
}, "payment_vouchers");

// POST /api/ims/vouchers/:id/{submit|pay|cancel}
routerAdd("POST", "/api/ims/vouchers/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const vouchers = require(`${__hooks}/lib/vouchers.js`);
  const info = $apis.requestInfo(c);
  const action = c.pathParam("action");
  const meta = core.requestMeta(c);
  const data = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "submit") {
      const a = vouchers.submit(tx, c.pathParam("id"), info.authRecord, meta);
      out = { approval: a.id };
    } else if (action === "pay") {
      const r = vouchers.execute(tx, c.pathParam("id"), info.authRecord, data, meta);
      out = { id: r.voucher.id, status: r.voucher.getString("status"), payments: r.payments.map((p) => p.getString("number")) };
    } else if (action === "cancel") {
      const v = vouchers.cancel(tx, c.pathParam("id"), info.authRecord, data.reason, meta);
      out = { id: v.id, status: v.getString("status") };
    } else {
      throw new NotFoundError(`Unknown voucher action "${action}".`);
    }
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

// GET /api/ims/vouchers/statutory-accounts?voucher= — PAYE, WHT, VAT and RSSB liabilities with what is owed and still free
routerAdd("GET", "/api/ims/vouchers/statutory-accounts", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const vouchers = require(`${__hooks}/lib/vouchers.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "manage_payment_vouchers") && !vouchers.canView(dao, info.authRecord)) {
    throw new ForbiddenError("You don't have permission to prepare payment vouchers.");
  }
  return c.json(200, { items: vouchers.statutoryAccounts(dao, c.queryParam("voucher") || "") });
}, $apis.requireAdminOrRecordAuth());

routerAdd("GET", "/api/ims/vouchers/payable", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const vouchers = require(`${__hooks}/lib/vouchers.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "manage_payment_vouchers") && !vouchers.canView(dao, info.authRecord)) {
    throw new ForbiddenError('You don\'t have permission to prepare payment vouchers.');
  }
  const supplier = c.queryParam("supplier");
  if (!supplier) throw new BadRequestError("Choose the supplier.");
  return c.json(200, { items: vouchers.payable(dao, supplier, c.queryParam("voucher") || "") });
}, $apis.requireAdminOrRecordAuth());

routerAdd("GET", "/api/ims/payables/reports/:key", (c) => {
  const vouchers = require(`${__hooks}/lib/vouchers.js`);
  const info = $apis.requestInfo(c);
  const f = {};
  for (const k of ["from", "to", "supplier", "department"]) f[k] = c.queryParam(k) || "";
  return c.json(200, vouchers.report($app.dao(), info.admin ? null : info.authRecord, c.pathParam("key"), f));
}, $apis.requireAdminOrRecordAuth());
