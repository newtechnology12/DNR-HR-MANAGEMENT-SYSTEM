/// <reference path="../../pb_data/types.d.ts" />
/**
 * Supplier bank-detail changes (IMS §3 rule 6). Once a supplier is approved its bank details change only
 * through a request approved by Finance; until then payments keep going to the verified account.
 * Every request keeps the old and the new details for the audit trail.
 */
const core = require("./core.js");

const BANK_FIELDS = ["bank_name", "bank_branch", "bank_account_name", "bank_account_number", "swift_code"];
const OPEN = ["pending_approval", "returned"];
const ONBOARDING = ["draft", "under_review", "rejected"];

function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

const detailsOf = (s) => {
  const out = {};
  for (const f of BANK_FIELDS) out[f] = s.getString(f);
  return out;
};

/** True when the supplier's bank details may only change through a request. */
function controlled(supplier) {
  return ONBOARDING.indexOf(supplier.getString("status")) === -1;
}

function openRequest(dao, supplierId) {
  const open = dao.findRecordsByFilter("supplier_bank_changes", "supplier = {:s} && (status = 'pending_approval' || status = 'returned')", "-created", 1, 0, { s: supplierId }) || [];
  return open[0] || null;
}

/** Procurement asks for new bank details; Finance approves through the engine. `dao` is a transaction DAO. */
function request(dao, supplierId, actor, input, meta) {
  core.requirePermission(dao, actor, "manage_suppliers", "request supplier bank detail changes");
  const supplier = load(dao, "suppliers", supplierId, "Supplier");
  if (!controlled(supplier)) throw new BadRequestError(`${supplier.getString("name")} is still in onboarding; edit its bank details directly before approval.`);
  const pending = openRequest(dao, supplier.id);
  if (pending) throw new BadRequestError(`${pending.getString("number")} is already open for ${supplier.getString("name")}. Finish or cancel it first.`);
  const old = detailsOf(supplier);
  const next = {};
  for (const f of BANK_FIELDS) next[f] = String(input[f] !== undefined ? input[f] : old[f] || "").trim();
  if (!next.bank_name || !next.bank_account_number) throw new BadRequestError("Enter the bank name and the account number.");
  if (!next.bank_account_name) throw new BadRequestError("Enter the account name exactly as the bank holds it.");
  if (BANK_FIELDS.every((f) => next[f] === old[f])) throw new BadRequestError("The new details are the same as the current ones.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new BadRequestError("Explain why the bank details change and how they were confirmed (at least 10 characters).");

  const r = new Record(dao.findCollectionByNameOrId("supplier_bank_changes"));
  r.set("number", core.nextNumber(dao, "supplier_bank_change"));
  r.set("supplier", supplier.id);
  r.set("supplier_name", supplier.getString("name"));
  r.set("old_details", old);
  r.set("new_details", next);
  r.set("reason", reason);
  r.set("requested_by", actor.id);
  r.set("status", "pending_approval");
  dao.saveRecord(r);
  require("./approvals.js").start(dao, "supplier_bank_change", r, actor, meta);

  supplier.set("bank_change_pending", true);
  dao.saveRecord(supplier);
  core.audit(dao, {
    actor, action: "bank_change_requested", collection: "suppliers", recordId: supplier.id, label: `${supplier.getString("code")} ${supplier.getString("name")}`,
    changes: diffDetails(old, next), comment: `${r.getString("number")}: ${reason}`, meta,
  });
  return r;
}

function diffDetails(old, next) {
  const out = {};
  for (const f of BANK_FIELDS) if ((old[f] || "") !== (next[f] || "")) out[f] = { old: old[f] || "", new: next[f] || "" };
  return out;
}

/** Final approval: the new details replace the verified ones. */
function onApproved(dao, change, actor, meta) {
  const supplier = load(dao, "suppliers", change.getString("supplier"), "Supplier");
  const old = detailsOf(supplier);
  const next = core.parseJson(change, "new_details", {});
  for (const f of BANK_FIELDS) supplier.set(f, next[f] || "");
  supplier.set("bank_change_pending", false);
  supplier.set("bank_verified_at", new Date().toISOString());
  supplier.set("bank_verified_by", actor.id);
  dao.saveRecord(supplier);
  change.set("applied_at", new Date().toISOString());
  dao.saveRecord(change);
  core.audit(dao, {
    actor, action: "bank_details_changed", collection: "suppliers", recordId: supplier.id, label: `${supplier.getString("code")} ${supplier.getString("name")}`,
    changes: diffDetails(old, next), comment: `Approved through ${change.getString("number")}`, meta,
  });
}

/** Rejected or cancelled: the supplier keeps its verified details. */
function onClosed(dao, change) {
  if (OPEN.indexOf(change.getString("status")) !== -1) return;
  try {
    const supplier = dao.findRecordById("suppliers", change.getString("supplier"));
    if (!openRequest(dao, supplier.id)) {
      supplier.set("bank_change_pending", false);
      dao.saveRecord(supplier);
    }
  } catch (_) {}
}

function cancel(dao, id, actor, reason, meta) {
  const r = load(dao, "supplier_bank_changes", id, "Bank change request");
  if (OPEN.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")} and cannot be cancelled.`);
  if (r.getString("requested_by") !== actor.id) core.requirePermission(dao, actor, "manage_suppliers", "cancel bank change requests");
  if (!String(reason || "").trim()) throw new BadRequestError("Give a reason for cancelling.");
  require("./approvals.js").cancel(dao, "supplier_bank_change", r, actor, String(reason).trim(), meta);
  onClosed(dao, r);
  return r;
}

/** Collection hook guard: no direct edits of a controlled supplier's bank details. */
function guardDirectEdit(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const before = e.record.originalCopy();
  if (!controlled(before)) return;
  const changed = BANK_FIELDS.filter((f) => before.getString(f) !== e.record.getString(f));
  if (changed.length) {
    throw new BadRequestError(
      `${before.getString("name")} is approved: bank details change only through a bank change request (Supplier → Change bank details), verified by Finance before any payment uses them.`
    );
  }
  for (const f of ["bank_change_pending", "bank_verified_at", "bank_verified_by"]) e.record.set(f, before.get(f));
}

module.exports = { BANK_FIELDS, request, onApproved, onClosed, cancel, guardDirectEdit, controlled, openRequest };

// ------------------------------------------------------------------ visibility
// Bank details are for the people who manage, verify or pay suppliers (and the Internal Auditor).
const BANK_READERS = ["view_suppliers", "manage_suppliers", "approve_suppliers", "manage_invoices", "approve_invoices", "record_payments", "view_audit_logs"];

function canReadBank(dao, auth) {
  return !auth || BANK_READERS.some((p) => core.can(dao, auth, p));
}

/** suppliers list / view: blank the bank fields for everyone else. */
function hideBankFields(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (canReadBank(dao, auth)) return;
  for (const r of e.records || (e.record ? [e.record] : [])) for (const f of BANK_FIELDS) r.set(f, "");
}

/** supplier_bank_changes list / view: only supplier, payables and audit roles. */
function guardRequests(e) {
  const auth = e.httpContext.get("authRecord");
  if (canReadBank($app.dao(), auth)) return;
  throw new ForbiddenError("Supplier bank details are visible to procurement, finance and audit roles only.");
}

module.exports.hideBankFields = hideBankFields;
module.exports.guardRequests = guardRequests;
