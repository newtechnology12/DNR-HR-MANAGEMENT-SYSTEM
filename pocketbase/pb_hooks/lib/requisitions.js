/// <reference path="../../pb_data/types.d.ts" />
/**
 * Purchase requisition rules: numbering, server-side totals, what a requester may edit,
 * and what must be filled in before submission.
 */
const core = require("./core.js");

/** Fields only the server may set; client values are always discarded. */
const SYSTEM_FIELDS = [
  "number", "requester", "status", "approval", "pending_approvers", "approver_history",
  "submitted_at", "approved_at", "cancel_reason", "created_by", "subtotal", "tax_total", "total",
  "funding_source", "budget_override", "budget_check",
];
const EDITABLE_STATUSES = ["draft", "returned"];

function normalizeItems(record) {
  const raw = core.parseJson(record, "items", []);
  if (!Array.isArray(raw)) throw new BadRequestError("Items must be a list.");
  let subtotal = 0;
  let taxTotal = 0;
  const items = raw.map((it, i) => {
    const line = i + 1;
    const description = String((it && it.description) || "").trim();
    const quantity = Number(it && it.quantity);
    const unitCost = Number(it && it.unit_cost);
    const taxRate = Number((it && it.tax_rate) || 0);
    if (!description) throw new BadRequestError(`Line ${line}: describe the item or service.`);
    if (!(quantity > 0)) throw new BadRequestError(`Line ${line} (${description}): quantity must be greater than zero.`);
    if (!(unitCost >= 0)) throw new BadRequestError(`Line ${line} (${description}): estimated unit cost cannot be negative.`);
    if (!(taxRate >= 0 && taxRate <= 100)) throw new BadRequestError(`Line ${line} (${description}): tax rate must be between 0 and 100%.`);
    const net = core.money(quantity * unitCost);
    const tax = core.money((net * taxRate) / 100);
    subtotal += net;
    taxTotal += tax;
    return {
      line,
      description,
      specification: String((it && it.specification) || ""),
      quantity,
      unit: String((it && it.unit) || ""),
      unit_cost: core.money(unitCost),
      tax_rate: taxRate,
      net,
      tax,
      total: core.money(net + tax),
    };
  });
  record.set("items", items);
  record.set("subtotal", core.money(subtotal));
  record.set("tax_total", core.money(taxTotal));
  record.set("total", core.money(subtotal + taxTotal));
}

function beforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "create_purchase_requisition", "create purchase requisitions");
  const r = e.record;
  for (const f of SYSTEM_FIELDS) r.set(f, "");
  const requester = auth || null;
  if (requester) {
    r.set("requester", requester.id);
    r.set("created_by", requester.id);
    // Placement comes from the employee record — no re-entry, and no requesting on another department's budget
    // unless the role has organisation-wide procurement scope.
    const scope = core.permissionsOf(dao, requester).__scope;
    if (!r.getString("department") || scope !== "all") r.set("department", requester.getString("department"));
    if (!r.getString("branch") || scope !== "all") r.set("branch", requester.getString("branch"));
  }
  r.set("status", "draft");
  if (!r.getString("currency")) r.set("currency", "RWF");
  if (!r.getString("priority")) r.set("priority", "medium");
  normalizeItems(r);
  // The budget line must belong to the requester's department (organisation-wide scope may pick any).
  require("./budget.js").attachLine(dao, r, { department: r.getString("department"), anyDepartment: Boolean(requester) && core.permissionsOf(dao, requester).__scope === "all" });
  let number = "";
  dao.runInTransaction((tx) => {
    number = core.nextNumber(tx, "purchase_requisition");
  });
  r.set("number", number);
}

function beforeUpdate(e) {
  const r = e.record;
  const before = r.originalCopy();
  if (EDITABLE_STATUSES.indexOf(before.getString("status")) === -1) {
    throw new BadRequestError(
      `${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited. ` +
        (before.getString("status") === "pending_approval" ? "Cancel it, or ask the approver to send it back for changes." : "")
    );
  }
  for (const f of SYSTEM_FIELDS) r.set(f, before.get(f));
  const auth = e.httpContext.get("authRecord");
  if (auth && core.permissionsOf($app.dao(), auth).__scope !== "all") {
    r.set("department", before.getString("department"));
    r.set("branch", before.getString("branch"));
  }
  normalizeItems(r);
  require("./budget.js").attachLine($app.dao(), r, { department: r.getString("department"), anyDepartment: Boolean(auth) && core.permissionsOf($app.dao(), auth).__scope === "all" });
  // An override covers one line and amount; a new line needs a new override.
  if (before.getString("budget_line") !== r.getString("budget_line")) r.set("budget_override", "");
  const changes = core.diff(before, r);
  delete changes.updated;
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function assertReadyToSubmit(doc) {
  const missing = [];
  if (!doc.getString("title").trim()) missing.push("title");
  if (!doc.getString("request_type")) missing.push("request type");
  if (!doc.getString("category")) missing.push("purchase category");
  if (!doc.getString("budget_line")) missing.push("budget line");
  if (!doc.getString("required_date")) missing.push("required date");
  if (!doc.getString("justification").trim()) missing.push("business justification");
  if (!core.parseJson(doc, "items", []).length) missing.push("at least one item");
  if (missing.length) {
    throw new BadRequestError(`${doc.getString("number")} cannot be submitted yet. Please add: ${missing.join(", ")}.`);
  }
  if (!(doc.getFloat("total") > 0)) throw new BadRequestError(`${doc.getString("number")} has a total of 0. Add estimated costs before submitting.`);
}

module.exports = { SYSTEM_FIELDS, EDITABLE_STATUSES, normalizeItems, beforeCreate, beforeUpdate, assertReadyToSubmit };
