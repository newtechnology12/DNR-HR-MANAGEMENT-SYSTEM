/// <reference path="../../pb_data/types.d.ts" />
/**
 * Supporting documents on business documents. Files can be added at any stage (a delivery note or a signed
 * copy often arrives after approval) by the people who work on that kind of document; they can only be
 * removed while the document is still being prepared — afterwards they are part of the record. Every
 * upload and removal is in the audit log. Files are stored by PocketBase (local disk or S3).
 */
const core = require("./core.js");

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv|pptx?|txt|zip|msg|eml)$/i;

// collection → file field, who may attach, owner field(s), statuses in which files may still be removed.
const DOCS = {
  budgets: { field: "attachments", perms: ["manage_budgets", "approve_budgets"], owners: ["prepared_by"], open: ["draft", "returned"] },
  budget_revisions: { field: "attachments", perms: ["manage_budgets", "approve_budgets"], owners: ["prepared_by"], open: ["draft", "returned"] },
  purchase_requisitions: { field: "attachments", perms: ["approve_purchase_requisitions", "manage_purchase_orders"], owners: ["requester"], open: ["draft", "returned"] },
  purchase_orders: { field: "attachments", perms: ["manage_purchase_orders", "approve_purchase_orders", "receive_goods", "manage_invoices"], owners: ["buyer"], open: ["draft", "returned"] },
  goods_receipts: { field: "attachments", perms: ["receive_goods", "manage_purchase_orders"], owners: ["received_by"], open: [] },
  supplier_invoices: { field: "attachments", perms: ["manage_invoices", "approve_invoices", "resolve_invoice_exceptions"], owners: ["recorded_by"], open: ["received", "exception", "matched", "returned"] },
  payment_vouchers: { field: "attachments", perms: ["manage_payment_vouchers", "approve_payment_vouchers", "record_payments"], owners: ["prepared_by"], open: ["draft", "returned"] },
  contracts: { field: "documents", perms: ["manage_contracts", "approve_contracts"], owners: ["created_by"], open: ["draft", "returned"] },
  purchase_returns: { field: "attachments", perms: ["manage_purchase_orders", "approve_purchase_returns", "receive_goods"], owners: ["created_by", "requested_by"], open: ["draft", "returned"] },
  supplier_bank_changes: { field: "attachments", perms: ["manage_suppliers", "approve_suppliers"], owners: ["requested_by"], open: ["pending_approval", "returned"] },
};

function load(dao, collection, id) {
  const def = DOCS[collection];
  if (!def) throw new NotFoundError("Documents cannot be attached here.");
  try {
    return { def, record: dao.findRecordById(collection, id) };
  } catch (_) {
    throw new NotFoundError("Document not found.");
  }
}

function mayAttach(dao, actor, def, record) {
  if (!actor) return true; // superuser
  if (def.owners.some((f) => record.getString(f) === actor.id)) return true;
  return def.perms.some((p) => core.can(dao, actor, p));
}

function label(record) {
  return record.getString("number") || record.getString("code") || record.getString("name") || record.id;
}

/** Adds the uploaded files ("files" in a multipart form). */
function add(c, collection, id) {
  const dao = $app.dao();
  const info = $apis.requestInfo(c);
  const actor = info.admin ? null : info.authRecord;
  const { def, record } = load(dao, collection, id);
  if (!mayAttach(dao, actor, def, record)) throw new ForbiddenError("You can't add documents to this record.");
  let headers = [];
  try {
    const form = c.multipartForm();
    headers = (form && form.file && form.file["files"]) || [];
  } catch (_) {}
  if (!headers.length) throw new BadRequestError("Choose at least one file.");
  const files = [];
  const names = [];
  for (const h of headers) {
    if (h.size > MAX_SIZE) throw new BadRequestError(`${h.filename} is larger than 20 MB.`);
    if (!ALLOWED.test(h.filename)) throw new BadRequestError(`${h.filename}: only PDF, images, Office documents, CSV, text, e-mail and zip files can be attached.`);
    files.push($filesystem.fileFromMultipart(h));
    names.push(h.filename);
  }
  const form = new RecordUpsertForm($app, record);
  form.addFiles(def.field, ...files);
  form.submit();
  const fresh = dao.findRecordById(collection, id);
  core.audit(dao, { actor, action: "document_attached", collection, recordId: id, label: label(fresh), comment: names.join(", "), meta: core.requestMeta(c) });
  return fresh.get(def.field);
}

/** Removes one file while the document is still being prepared. */
function remove(c, collection, id, filename) {
  const dao = $app.dao();
  const info = $apis.requestInfo(c);
  const actor = info.admin ? null : info.authRecord;
  const { def, record } = load(dao, collection, id);
  if (!mayAttach(dao, actor, def, record)) throw new ForbiddenError("You can't remove documents from this record.");
  if (def.open.indexOf(record.getString("status")) === -1) {
    throw new BadRequestError(`${label(record)} is ${record.getString("status").replace(/_/g, " ")}: its documents are part of the record and can no longer be removed.`);
  }
  const current = record.getStringSlice(def.field) || [];
  if (current.indexOf(filename) === -1) throw new NotFoundError("File not found on this document.");
  const form = new RecordUpsertForm($app, record);
  form.removeFiles(def.field, filename);
  form.submit();
  core.audit(dao, { actor, action: "document_removed", collection, recordId: id, label: label(record), comment: filename, meta: core.requestMeta(c) });
  return dao.findRecordById(collection, id).get(def.field);
}

module.exports = { DOCS, add, remove };
