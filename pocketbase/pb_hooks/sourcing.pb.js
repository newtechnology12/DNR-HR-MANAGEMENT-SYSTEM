/// <reference path="../pb_data/types.d.ts" />
/**
 * Sourcing API: suppliers, RFQs and quotations. Rules live in lib/sourcing.js.
 */

// ------------------------------------------------------------------ suppliers
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/sourcing.js`).supplierBeforeCreate(e), "suppliers");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).supplierBeforeUpdate(e), "suppliers");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).supplierAfterUpdate(e), "suppliers");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/sourcing.js`).supplierBeforeDelete(e), "suppliers");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "created", collection: "suppliers", recordId: e.record.id,
    label: `${e.record.getString("code")} ${e.record.getString("name")}`, meta: core.requestMeta(e.httpContext),
  });
}, "suppliers");
onRecordAfterDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "deleted", collection: "suppliers", recordId: e.record.id,
    label: `${e.record.getString("code")} ${e.record.getString("name")}`, meta: core.requestMeta(e.httpContext),
  });
}, "suppliers");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/sourcing.js`).childGuard(e, "edit supplier contacts and documents"), "supplier_contacts", "supplier_documents");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).childGuard(e, "edit supplier contacts and documents"), "supplier_contacts", "supplier_documents");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/sourcing.js`).childGuard(e, "edit supplier contacts and documents"), "supplier_contacts", "supplier_documents");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  if (e.record.collection().name !== "supplier_documents") return;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "document_added", collection: "suppliers", recordId: e.record.getString("supplier"),
    label: e.record.getString("document_type").replace(/_/g, " "), meta: core.requestMeta(e.httpContext),
    changes: { expiry_date: { old: null, new: e.record.getString("expiry_date") } },
  });
}, "supplier_documents");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/sourcing.js`).evaluationBeforeCreate(e), "supplier_evaluations");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/sourcing.js`).evaluationAfterCreate(e), "supplier_evaluations");

// ------------------------------------------------------------------ RFQs
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).rfqBeforeUpdate(e), "rfqs");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (!Object.keys(changes).length) return;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "updated", collection: "rfqs", recordId: e.record.id,
    label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext),
  });
}, "rfqs");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).inviteBeforeUpdate(e), "rfq_suppliers");

// POST /api/dnr/requisitions/:id/create-rfq   { closing_date?, suppliers? }
routerAdd("POST", "/api/dnr/requisitions/:id/create-rfq", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const sourcing = require(`${__hooks}/lib/sourcing.js`);
  const info = $apis.requestInfo(c);
  core.requirePermission($app.dao(), info.authRecord, "manage_rfqs", "create RFQs");
  let out;
  $app.dao().runInTransaction((tx) => {
    const rfq = sourcing.createFromRequisition(tx, c.pathParam("id"), info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: rfq.id, number: rfq.getString("number") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// POST /api/dnr/rfqs/:id/{send|close|cancel|award}
routerAdd("POST", "/api/dnr/rfqs/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const sourcing = require(`${__hooks}/lib/sourcing.js`);
  const info = $apis.requestInfo(c);
  const action = c.pathParam("action");
  const data = info.data || {};
  const dao = $app.dao();
  if (action === "award") core.requirePermission(dao, info.authRecord, "award_rfqs", "select the winning supplier");
  else core.requirePermission(dao, info.authRecord, "manage_rfqs", `${action} RFQs`);
  const meta = core.requestMeta(c);
  let out;
  dao.runInTransaction((tx) => {
    let rfq;
    if (action === "send") rfq = sourcing.send(tx, c.pathParam("id"), info.authRecord, meta);
    else if (action === "close") rfq = sourcing.close(tx, c.pathParam("id"), info.authRecord, meta);
    else if (action === "cancel") rfq = sourcing.cancel(tx, c.pathParam("id"), info.authRecord, String(data.reason || "").trim(), meta);
    else if (action === "award") rfq = sourcing.award(tx, c.pathParam("id"), info.authRecord, String(data.quotation || ""), String(data.reason || ""), meta);
    else throw new NotFoundError(`Unknown RFQ action "${action}".`);
    out = { id: rfq.id, status: rfq.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// ------------------------------------------------------------------ quotations
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/sourcing.js`).quotationBeforeCreate(e), "quotations");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/sourcing.js`).quotationAfterCreate(e), "quotations");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).quotationBeforeUpdate(e), "quotations");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/sourcing.js`).quotationAfterUpdate(e), "quotations");

// POST /api/dnr/suppliers/:id/submit — send a new supplier for onboarding approval
routerAdd("POST", "/api/dnr/suppliers/:id/submit", (c) => {
  const supplier = require(`${__hooks}/lib/supplier.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = supplier.submit(tx, c.pathParam("id"), info.authRecord, core.requestMeta(c));
  });
  return c.json(200, { approval: out.id });
}, $apis.requireRecordAuth());

// GET /api/dnr/suppliers/:id/readiness — what is missing before submission
routerAdd("GET", "/api/dnr/suppliers/:id/readiness", (c) => {
  const supplier = require(`${__hooks}/lib/supplier.js`);
  const dao = $app.dao();
  return c.json(200, { missing: supplier.readiness(dao, dao.findRecordById("suppliers", c.pathParam("id"))) });
}, $apis.requireRecordAuth());

// GET /api/dnr/suppliers/performance?supplier=… — calculated from orders, receipts, quotations, invoices
routerAdd("GET", "/api/dnr/suppliers/performance", (c) => {
  const supplier = require(`${__hooks}/lib/supplier.js`);
  const one = c.queryParam("supplier");
  return c.json(200, { items: supplier.performance($app.dao(), one ? [one] : null) });
}, $apis.requireRecordAuth());

// ------------------------------------------------------------------ supplier bank details (IMS §3 rule 6)
// POST /api/ims/suppliers/:id/bank-change   { bank_name, bank_branch, bank_account_name, bank_account_number, swift_code, reason }
routerAdd("POST", "/api/ims/suppliers/:id/bank-change", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = require(`${__hooks}/lib/supplierbank.js`).request(tx, c.pathParam("id"), info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, { id: out.id, number: out.getString("number"), status: out.getString("status") });
}, $apis.requireRecordAuth("users"));

// POST /api/ims/supplier-bank-changes/:id/cancel   { reason }
routerAdd("POST", "/api/ims/supplier-bank-changes/:id/cancel", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = require(`${__hooks}/lib/supplierbank.js`).cancel(tx, c.pathParam("id"), info.authRecord, (info.data || {}).reason, core.requestMeta(c));
  });
  return c.json(200, { id: out.id, status: out.getString("status") });
}, $apis.requireRecordAuth("users"));

// Bank details are not shown to staff without a supplier, payables or audit role.
onRecordsListRequest((e) => require(`${__hooks}/lib/supplierbank.js`).hideBankFields(e), "suppliers");
onRecordViewRequest((e) => require(`${__hooks}/lib/supplierbank.js`).hideBankFields(e), "suppliers");
onRecordsListRequest((e) => require(`${__hooks}/lib/supplierbank.js`).guardRequests(e), "supplier_bank_changes");
onRecordViewRequest((e) => require(`${__hooks}/lib/supplierbank.js`).guardRequests(e), "supplier_bank_changes");
