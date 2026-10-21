/// <reference path="../../pb_data/types.d.ts" />
/**
 * Purchase returns: accepted goods sent back to the supplier.
 *   draft → approval (engine, "purchase_return") → approved → dispatched (stock out, PO received qty reduced)
 *   → credited (credit note recorded) | replacement expected
 * Records are never deleted: a return is cancelled with a reason.
 */
const core = require("./core.js");

function load(dao, id) {
  try {
    return dao.findRecordById("purchase_returns", id);
  } catch (_) {
    throw new NotFoundError("Return not found.");
  }
}
function canHandle(dao, actor) {
  return core.can(dao, actor, "receive_goods") || core.can(dao, actor, "manage_purchase_orders");
}
function audit(dao, actor, action, r, extra, meta) {
  core.audit(dao, { actor, action, collection: "purchase_returns", recordId: r.id, label: r.getString("number"), meta, comment: extra.comment || "", changes: extra.changes || {} });
}

/** Quantity of each GRN line already on other (non-cancelled, non-rejected) returns. */
function alreadyReturned(dao, grnId, excludeId) {
  const out = {};
  for (const r of dao.findRecordsByFilter("purchase_returns", "goods_receipt = {:g} && status != 'cancelled' && status != 'rejected'", "", 500, 0, { g: grnId }) || []) {
    if (r.id === excludeId) continue;
    for (const it of core.parseJson(r, "items", [])) out[it.line] = (out[it.line] || 0) + (Number(it.quantity) || 0);
  }
  return out;
}

function create(dao, actor, input, meta) {
  if (!canHandle(dao, actor)) throw new ForbiddenError("You don't have permission to return goods. Ask for the receive_goods permission.");
  let grn;
  try {
    grn = dao.findRecordById("goods_receipts", String(input.goods_receipt || ""));
  } catch (_) {
    throw new BadRequestError("Choose the goods receipt the items came in on.");
  }
  const po = dao.findRecordById("purchase_orders", grn.getString("purchase_order"));
  if (po.getString("status") === "cancelled") throw new BadRequestError(`${po.getString("number")} is cancelled.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new BadRequestError("Explain why the goods are returned (at least 10 characters).");
  const done = alreadyReturned(dao, grn.id, "");
  const lines = [];
  let total = 0;
  for (const raw of input.items || []) {
    const qty = Number(raw.quantity) || 0;
    if (qty <= 0) continue;
    const gl = core.parseJson(grn, "items", []).find((x) => Number(x.line) === Number(raw.line));
    if (!gl) throw new BadRequestError(`Line ${raw.line} is not on ${grn.getString("number")}.`);
    if (gl.line_type !== "goods") throw new BadRequestError(`${gl.description}: only stock items can be returned here (assets are handled in the asset register; services cannot be returned).`);
    const available = core.money((Number(gl.accepted) || 0) - (done[gl.line] || 0));
    if (qty > available) throw new BadRequestError(`${gl.description}: only ${available} ${gl.unit} can still be returned from ${grn.getString("number")}.`);
    const value = core.money(qty * (Number(gl.unit_cost) || 0));
    total += value;
    lines.push({ line: gl.line, description: gl.description, unit: gl.unit, received: gl.accepted, quantity: qty, unit_cost: gl.unit_cost, value, batch: gl.batch || "", condition: String(raw.condition || "defective"), reason: String(raw.reason || reason) });
  }
  if (!lines.length) throw new BadRequestError("Enter the quantity to return for at least one line.");
  const r = new Record(dao.findCollectionByNameOrId("purchase_returns"));
  r.set("number", core.nextNumber(dao, "purchase_return"));
  r.set("purchase_order", po.id);
  r.set("goods_receipt", grn.id);
  r.set("supplier", po.getString("supplier"));
  r.set("warehouse", grn.getString("warehouse"));
  r.set("items", lines);
  r.set("total_value", core.money(total));
  r.set("reason", reason);
  r.set("supplier_action", ["credit_note", "replacement", "refund"].indexOf(input.supplier_action) !== -1 ? input.supplier_action : "credit_note");
  r.set("status", "draft");
  r.set("requested_by", actor.id);
  r.set("notes", String(input.notes || ""));
  dao.saveRecord(r);
  audit(dao, actor, "created", r, { changes: { total_value: { old: null, new: r.getFloat("total_value") } } }, meta);
  return r;
}

function submit(dao, actor, id, meta) {
  const r = load(dao, id);
  if (!canHandle(dao, actor)) throw new ForbiddenError("You cannot submit returns.");
  if (["draft", "returned_for_changes"].indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}.`);
  // Re-check quantities against returns created since.
  const done = alreadyReturned(dao, r.getString("goods_receipt"), r.id);
  const grn = dao.findRecordById("goods_receipts", r.getString("goods_receipt"));
  for (const it of core.parseJson(r, "items", [])) {
    const gl = core.parseJson(grn, "items", []).find((x) => Number(x.line) === Number(it.line));
    if (it.quantity > (Number(gl.accepted) || 0) - (done[it.line] || 0)) throw new BadRequestError(`${it.description}: the quantity is no longer available to return.`);
  }
  r.set("requested_by", actor.id);
  dao.saveRecord(r);
  return require("./approvals.js").start(dao, "purchase_return", r, actor, meta);
}

/** Goods leave the warehouse: stock out, PO received quantity reduced. */
function dispatch(dao, actor, id, input, meta) {
  const pur = require("./purchasing.js");
  const r = load(dao, id);
  if (!core.can(dao, actor, "receive_goods")) throw new ForbiddenError("Recording the dispatch needs the receive_goods permission.");
  if (r.getString("status") !== "approved") throw new BadRequestError(`${r.getString("number")} must be approved before the goods leave the warehouse.`);
  const po = dao.findRecordById("purchase_orders", r.getString("purchase_order"));
  const items = core.parseJson(r, "items", []);
  const poLines = core.parseJson(po, "items", []);
  const ref = { type: "purchase_return", id: r.id, number: r.getString("number") };
  for (const it of items) {
    const pl = poLines.find((l) => Number(l.line) === Number(it.line)) || { description: it.description, unit: it.unit };
    const item = pur.findOrCreateItem(dao, pl, po);
    pur.moveStock(dao, { item, warehouseId: r.getString("warehouse"), qty: -it.quantity, unitCost: it.unit_cost, type: "return_to_supplier", ref, actor, batch: it.batch, reason: `Returned to supplier: ${it.reason}` });
  }
  const updated = poLines.map((l) => {
    const it = items.find((x) => Number(x.line) === Number(l.line));
    return it ? { ...l, received_qty: core.money((l.received_qty || 0) - it.quantity), returned_qty: core.money((l.returned_qty || 0) + it.quantity) } : l;
  });
  po.set("items", updated);
  po.set("received_value", core.money(po.getFloat("received_value") - r.getFloat("total_value")));
  if (po.getString("status") === "fully_received" && updated.some((l) => (l.received_qty || 0) < l.quantity)) po.set("status", "partially_received");
  dao.saveRecord(po);
  r.set("status", "dispatched");
  r.set("dispatched_at", new Date().toISOString());
  r.set("dispatched_by", actor.id);
  if (input.notes) r.set("notes", `${r.getString("notes")}\n${input.notes}`.trim());
  dao.saveRecord(r);
  audit(dao, actor, "return_dispatched", r, { comment: String(input.notes || ""), changes: { status: { old: "approved", new: "dispatched" } } }, meta);
  core.audit(dao, { actor, action: "goods_returned", collection: "purchase_orders", recordId: po.id, label: po.getString("number"), meta, comment: r.getString("number"), changes: { received_value: { old: null, new: po.getFloat("received_value") } } });
  core.notify(dao, [po.getString("buyer")].filter((x) => x !== actor.id), { title: `${r.getString("number")}: goods returned to supplier`, body: `${po.getString("number")} · ${core.formatMoney(r.getFloat("total_value"))}`, link: `/dashboard/procurement/returns/${r.id}`, type: "info" });
  return r;
}

function credit(dao, actor, id, input, meta) {
  const r = load(dao, id);
  core.requirePermission(dao, actor, "manage_invoices", "record supplier credit notes");
  if (r.getString("status") !== "dispatched") throw new BadRequestError("Record the credit note after the goods have been returned.");
  const number = String(input.credit_note_number || "").trim();
  const amount = core.money(Number(input.credit_amount) || 0);
  if (!number) throw new BadRequestError("Enter the supplier's credit note number.");
  if (!(amount > 0)) throw new BadRequestError("Enter the credit amount.");
  if (amount > r.getFloat("total_value") * 1.2 + 1) throw new BadRequestError("The credit amount is much higher than the value returned — check it.");
  r.set("credit_note_number", number);
  r.set("credit_amount", amount);
  r.set("credited_at", new Date().toISOString());
  r.set("status", "credited");
  dao.saveRecord(r);
  audit(dao, actor, "credit_note_recorded", r, { comment: number, changes: { credit_amount: { old: null, new: amount } } }, meta);
  return r;
}

function cancel(dao, actor, id, input, meta) {
  const r = load(dao, id);
  if (!canHandle(dao, actor)) throw new ForbiddenError("You cannot cancel returns.");
  const status = r.getString("status");
  if (["dispatched", "credited", "cancelled"].indexOf(status) !== -1) throw new BadRequestError(`${r.getString("number")} is ${status} and cannot be cancelled.`);
  const reason = String(input.reason || "").trim();
  if (!reason) throw new BadRequestError("Give a reason for cancelling the return.");
  if (status === "pending_approval") {
    require("./approvals.js").cancel(dao, "purchase_return", r, actor, reason, meta);
    return load(dao, id);
  }
  r.set("status", "cancelled");
  r.set("cancel_reason", reason);
  dao.saveRecord(r);
  audit(dao, actor, "cancelled", r, { comment: reason }, meta);
  return r;
}

module.exports = { create, submit, dispatch, credit, cancel };
