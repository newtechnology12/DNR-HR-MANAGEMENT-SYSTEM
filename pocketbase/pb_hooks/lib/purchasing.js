/// <reference path="../../pb_data/types.d.ts" />
/**
 * Purchase orders, receiving and inventory.
 *
 *  PO sources:   awarded RFQ (prices locked to the winning quotation) or a direct purchase on an
 *                approved requisition (requires a written justification; flagged in reports).
 *  Line types:   goods → inventory stock, asset → one asset record per unit, service → confirmation only.
 *  Receiving:    partial and rejected quantities; nobody can accept more than was ordered.
 *  Valuation:    moving average cost, using the line's cost including VAT (VAT is not recoverable
 *                for the organisation, so the landed cost is what it actually pays).
 */
const core = require("./core.js");

const SERVICE_TYPES = ["services", "consultancy", "maintenance", "subscriptions", "construction"];
const RECEIVABLE = ["approved", "sent", "acknowledged", "partially_received"];

/** Over-receipt tolerance in % of the ordered quantity (0 = never). */
function overTolerance(dao) {
  try {
    const s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
    return s ? s.getFloat("receipt_over_tolerance_pct") : 0;
  } catch (_) {
    return 0;
  }
}

function toDate(v) {
  const d = new Date(String(v || "").trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}
function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

function lineTypeFor(dao, requisition) {
  if (SERVICE_TYPES.indexOf(requisition.getString("request_type")) !== -1) return "service";
  const cat = requisition.getString("category");
  if (cat) {
    try {
      if (dao.findRecordById("procurement_categories", cat).getBool("is_asset")) return "asset";
    } catch (_) {}
  }
  return "goods";
}

function computeTotals(po) {
  let subtotal = 0, discount = 0, tax = 0;
  const items = core.parseJson(po, "items", []).map((it) => {
    const qty = Number(it.quantity) || 0;
    const price = Math.max(Number(it.unit_price) || 0, 0);
    const discPct = Math.min(Math.max(Number(it.discount_pct) || 0, 0), 100);
    const taxRate = Math.min(Math.max(Number(it.tax_rate) || 0, 0), 100);
    const gross = core.money(qty * price);
    const d = core.money((gross * discPct) / 100);
    const t = core.money(((gross - d) * taxRate) / 100);
    subtotal += gross; discount += d; tax += t;
    return { ...it, quantity: qty, unit_price: price, discount_pct: discPct, tax_rate: taxRate, net: core.money(gross - d), tax: t, total: core.money(gross - d + t) };
  });
  po.set("items", items);
  po.set("subtotal", core.money(subtotal));
  po.set("discount_total", core.money(discount));
  po.set("tax_total", core.money(tax));
  po.set("grand_total", core.money(subtotal - discount + tax + po.getFloat("delivery_cost") + po.getFloat("other_charges")));
}

function newPo(dao, req, actor) {
  const po = new Record(dao.findCollectionByNameOrId("purchase_orders"));
  po.set("number", core.nextNumber(dao, "purchase_order"));
  po.set("title", req.getString("title"));
  po.set("requisition", req.id);
  po.set("buyer", actor.id);
  po.set("requester", req.getString("requester"));
  po.set("department", req.getString("department"));
  po.set("branch", req.getString("branch"));
  po.set("category", req.getString("category"));
  po.set("cost_center", req.getString("cost_center"));
  po.set("project", req.getString("project"));
  po.set("budget_line", req.getString("budget_line"));
  po.set("funding_source", req.getString("funding_source"));
  po.set("committed_amount", 0);
  po.set("delivery_location", req.getString("delivery_location"));
  po.set("currency", req.getString("currency") || "RWF");
  po.set("order_date", new Date().toISOString());
  const needed = toDate(req.getString("required_date"));
  po.set("expected_delivery_date", (needed && needed > new Date() ? needed : new Date(Date.now() + 14 * 864e5)).toISOString());
  po.set("status", "draft");
  po.set("terms_conditions", "Goods must match the specification. Delivery against this PO number only. Invoices must quote the PO number. Payment after receipt and acceptance.");
  return po;
}

function audit(dao, actor, action, po, extra, meta) {
  core.audit(dao, { actor, action, collection: "purchase_orders", recordId: po.id, label: po.getString("number"), meta, ...(extra || {}) });
}

/** Create a PO from the awarded quotation of an RFQ. */
function fromRfq(dao, rfqId, actor, meta) {
  const rfq = load(dao, "rfqs", rfqId, "RFQ");
  if (rfq.getString("status") !== "awarded") throw new BadRequestError(`${rfq.getString("number")} has not been awarded yet.`);
  const existing = dao.findRecordsByFilter("purchase_orders", "rfq = {:r} && status != 'cancelled'", "", 1, 0, { r: rfq.id });
  if (existing && existing.length) throw new BadRequestError(`${existing[0].getString("number")} already exists for ${rfq.getString("number")}.`);
  const quote = load(dao, "quotations", rfq.getString("awarded_quotation"), "Awarded quotation");
  const req = load(dao, "purchase_requisitions", rfq.getString("requisition"), "Requisition");
  const type = lineTypeFor(dao, req);
  const rfqItems = core.parseJson(rfq, "items", []);
  const items = core.parseJson(quote, "items", []).filter((i) => i.quoted).map((i) => {
    const ri = rfqItems.find((x) => Number(x.line) === Number(i.line)) || {};
    return {
      line: i.line, description: i.description, specification: ri.specification || "", brand: i.brand || "",
      quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, discount_pct: i.discount_pct, tax_rate: i.tax_rate,
      line_type: type, received_qty: 0, rejected_qty: 0,
    };
  });
  const po = newPo(dao, req, actor);
  po.set("source", "rfq");
  po.set("rfq", rfq.id);
  po.set("quotation", quote.id);
  po.set("supplier", quote.getString("supplier"));
  po.set("payment_terms", quote.getString("payment_terms") || rfq.getString("payment_terms"));
  po.set("delivery_terms", rfq.getString("delivery_terms"));
  po.set("delivery_cost", quote.getFloat("delivery_cost"));
  po.set("other_charges", quote.getFloat("other_charges"));
  if (quote.getInt("delivery_days") > 0) po.set("expected_delivery_date", new Date(Date.now() + quote.getInt("delivery_days") * 864e5).toISOString());
  po.set("notes", quote.getString("warranty") ? `Warranty: ${quote.getString("warranty")}` : "");
  po.set("items", items);
  computeTotals(po);
  dao.saveRecord(po);
  const reqOld = req.getString("status");
  req.set("status", "converted_to_po");
  dao.saveRecord(req);
  audit(dao, actor, "created", po, { changes: { source: { old: null, new: `RFQ ${rfq.getString("number")}` }, grand_total: { old: null, new: po.getFloat("grand_total") } } }, meta);
  core.audit(dao, { actor, action: "po_created", collection: "purchase_requisitions", recordId: req.id, label: req.getString("number"), meta, changes: { status: { old: reqOld, new: "converted_to_po" }, purchase_order: { old: null, new: po.getString("number") } } });
  return po;
}

/** Direct purchase: no competitive quotation. Needs a supplier and a written justification. */
function direct(dao, requisitionId, actor, input, meta) {
  const req = load(dao, "purchase_requisitions", requisitionId, "Requisition");
  if (req.getString("status") !== "approved") throw new BadRequestError(`${req.getString("number")} must be approved (and not already sourced) before a direct purchase order.`);
  const justification = String(input.justification || "").trim();
  if (justification.length < 20) throw new BadRequestError("Explain why no competitive quotation was obtained (at least 20 characters). Direct purchases are flagged for audit.");
  const supplier = load(dao, "suppliers", String(input.supplier || ""), "Supplier");
  if (supplier.getString("status") !== "active") throw new BadRequestError(`${supplier.getString("name")} is ${supplier.getString("status")} and cannot receive orders.`);
  const type = lineTypeFor(dao, req);
  const po = newPo(dao, req, actor);
  po.set("source", "direct");
  po.set("supplier", supplier.id);
  po.set("payment_terms", supplier.getString("payment_terms"));
  po.set("delivery_terms", "Delivered to the address above (DAP)");
  po.set("justification", justification);
  po.set("items", core.parseJson(req, "items", []).map((i, idx) => ({
    line: idx + 1, description: i.description, specification: i.specification || "", quantity: i.quantity, unit: i.unit,
    unit_price: i.unit_cost, discount_pct: 0, tax_rate: i.tax_rate, line_type: type, received_qty: 0, rejected_qty: 0,
  })));
  computeTotals(po);
  dao.saveRecord(po);
  req.set("status", "converted_to_po");
  dao.saveRecord(req);
  audit(dao, actor, "created", po, { comment: justification, changes: { source: { old: null, new: "direct purchase" }, supplier: { old: null, new: supplier.getString("name") } } }, meta);
  return po;
}

/** API edits: only while draft/returned; direct POs may adjust prices, RFQ-based POs are locked to the quote. */
function beforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission($app.dao(), auth, "manage_purchase_orders", "edit purchase orders");
  const po = e.record;
  const before = po.originalCopy();
  if (["draft", "returned"].indexOf(before.getString("status")) === -1) {
    throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  }
  const editable = ["expected_delivery_date", "delivery_location", "payment_terms", "delivery_terms", "notes", "terms_conditions", "items", "attachments", "delivery_cost", "other_charges", "contract", "budget_line"];
  const amended = before.getInt("revision") > 0;
  const fields = po.collection().schema.fields().map((f) => f.name);
  for (const f of fields) if (editable.indexOf(f) === -1) po.set(f, before.get(f));
  const oldItems = core.parseJson(before, "items", []);
  const newItems = core.parseJson(po, "items", []);
  const rfqBased = before.getString("source") === "rfq";
  if (rfqBased) {
    po.set("delivery_cost", before.getFloat("delivery_cost"));
    po.set("other_charges", before.getFloat("other_charges"));
  }
  po.set("items", oldItems.map((o) => {
    const n = newItems.find((x) => Number(x.line) === Number(o.line)) || {};
    const lineType = ["goods", "asset", "service"].indexOf(n.line_type) !== -1 ? n.line_type : o.line_type;
    // Amended orders may change quantities, never below what was already received (RFQ orders: not above the awarded quantity).
    let quantity = o.quantity;
    if (amended && n.quantity !== undefined && Number(n.quantity) !== Number(o.quantity)) {
      const q = Number(n.quantity);
      if (!(q >= (o.received_qty || 0))) throw new BadRequestError(`Line ${o.line}: the quantity cannot be lower than the ${o.received_qty || 0} already received.`);
      const awarded = o.awarded_qty || o.quantity;
      if (rfqBased && q > awarded) throw new BadRequestError(`Line ${o.line}: the quantity cannot exceed the ${awarded} awarded in the RFQ.`);
      quantity = q;
    }
    const base = { ...o, line_type: lineType, quantity, awarded_qty: o.awarded_qty || o.quantity };
    if (rfqBased) return base;
    return { ...base, unit_price: n.unit_price !== undefined ? n.unit_price : o.unit_price, tax_rate: n.tax_rate !== undefined ? n.tax_rate : o.tax_rate };
  }));
  computeTotals(po);
  // Only lines of the order's department; a committed order keeps its line (amend changes amounts only).
  if (before.getInt("committed_amount") > 0) po.set("budget_line", before.getString("budget_line"));
  require("./budget.js").attachLine($app.dao(), po, { department: po.getString("department") });
  const changes = core.diff(before, po, ["expected_delivery_date", "delivery_location", "payment_terms", "delivery_terms", "notes", "grand_total", "delivery_cost", "other_charges", "budget_line"]);
  if (JSON.stringify(oldItems.map((i) => [i.line_type, i.unit_price])) !== JSON.stringify(core.parseJson(po, "items", []).map((i) => [i.line_type, i.unit_price]))) {
    changes.items = { old: "…", new: "line types / prices changed" };
  }
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function transition(dao, id, actor, action, input, meta) {
  const po = load(dao, "purchase_orders", id, "Purchase order");
  const number = po.getString("number");
  const status = po.getString("status");
  const buyerOrAll = po.getString("buyer") === actor.id || core.permissionsOf(dao, actor).__scope === "all";
  if (!buyerOrAll) throw new ForbiddenError(`Only the buyer or procurement administrators can ${action} ${number}.`);
  const now = new Date().toISOString();
  const set = (s) => {
    audit(dao, actor, action === "send" ? "sent_to_supplier" : action, po, { comment: input.reason || "", changes: { status: { old: status, new: s } } }, meta);
    po.set("status", s);
  };
  if (action === "send") {
    if (status !== "approved") throw new BadRequestError(`${number} must be approved before it is sent to the supplier (currently ${status.replace(/_/g, " ")}).`);
    po.set("sent_at", now);
    set("sent");
  } else if (action === "acknowledge") {
    if (status !== "sent") throw new BadRequestError(`${number} has not been sent to the supplier.`);
    po.set("acknowledged_at", now);
    set("acknowledged");
  } else if (action === "close") {
    if (["partially_received", "fully_received"].indexOf(status) === -1) throw new BadRequestError(`Only received orders can be closed; ${number} is ${status.replace(/_/g, " ")}.`);
    if (!String(input.reason || "").trim()) throw new BadRequestError("Give a reason for closing the order (e.g. remaining quantity will not be delivered).");
    const openExc = dao.findRecordsByFilter("supplier_invoices", "purchase_order = {:p} && status = 'exception'", "", 10, 0, { p: po.id }) || [];
    if (openExc.length) throw new BadRequestError(`${number} has ${openExc.length} vendor bill(s) with an unresolved match exception (${openExc.map((i) => i.getString("number")).join(", ")}). Resolve them before closing.`);
    po.set("closed_at", now);
    set("closed");
  } else if (action === "amend") {
    if (["approved", "sent", "acknowledged", "partially_received"].indexOf(status) === -1) throw new BadRequestError(`${number} is ${status.replace(/_/g, " ")} and cannot be amended.`);
    core.requirePermission(dao, actor, "amend_purchase_orders", "amend approved purchase orders");
    const reason = String(input.reason || "").trim();
    if (reason.length < 10) throw new BadRequestError("Explain why the order is amended (at least 10 characters).");
    const revisions = core.parseJson(po, "revisions", []);
    revisions.push({ revision: po.getInt("revision"), status, items: core.parseJson(po, "items", []), grand_total: po.getFloat("grand_total"), expected_delivery_date: po.getString("expected_delivery_date"), payment_terms: po.getString("payment_terms"), delivery_terms: po.getString("delivery_terms"), approval: po.getString("approval"), amended_by: actor.getString("name"), amended_at: now, reason });
    po.set("revisions", revisions);
    po.set("revision", po.getInt("revision") + 1);
    po.set("amend_reason", reason);
    po.set("approval", "");
    po.set("pending_approvers", "");
    audit(dao, actor, "amended", po, { comment: reason, changes: { status: { old: status, new: "draft" }, revision: { old: po.getInt("revision") - 1, new: po.getInt("revision") } } }, meta);
    po.set("status", "draft");
    dao.saveRecord(po);
    core.notify(dao, [po.getString("requester")].filter((x) => x !== actor.id), { title: `${number} amended (revision ${po.getInt("revision")})`, body: reason, link: `/dashboard/procurement/purchase-orders/${po.id}`, type: "warning" });
    return po;
  } else if (action === "cancel") {
    if (["draft", "returned", "pending_approval", "approved", "sent", "acknowledged"].indexOf(status) === -1) throw new BadRequestError(`${number} has deliveries recorded and cannot be cancelled; close it instead.`);
    const reason = String(input.reason || "").trim();
    if (!reason) throw new BadRequestError("Give a reason for cancelling the purchase order.");
    require("./approvals.js").cancel(dao, "purchase_order", po, actor, reason, meta);
    require("./budget.js").releasePo(dao, po, actor, `Cancelled: ${reason}`);
    try {
      const req = dao.findRecordById("purchase_requisitions", po.getString("requisition"));
      if (req.getString("status") === "converted_to_po") {
        req.set("status", po.getString("source") === "rfq" ? "converted_to_rfq" : "approved");
        dao.saveRecord(req);
      }
    } catch (_) {}
    return po;
  } else {
    throw new NotFoundError(`Unknown purchase order action "${action}".`);
  }
  dao.saveRecord(po);
  if (action === "close") require("./budget.js").releasePo(dao, po, actor, `Closed short: ${String(input.reason || "").trim()}`);
  core.notify(dao, [po.getString("requester")], {
    title: `${number}: ${action === "send" ? "sent to supplier" : action === "acknowledge" ? "acknowledged by supplier" : "closed"}`,
    body: po.getString("title"), link: `/dashboard/procurement/purchase-orders/${po.id}`, type: "info",
  });
  return po;
}

// ------------------------------------------------------------------ inventory helpers
function findOrCreateItem(dao, line, po) {
  const category = po.getString("category");
  const name = String(line.description).trim();
  const found = (dao.findRecordsByFilter("inventory_items", "name ~ {:n}", "", 20, 0, { n: name }) || []).find(
    (i) => i.getString("name").trim().toLowerCase() === name.toLowerCase() && (!category || !i.getString("category") || i.getString("category") === category)
  );
  if (found) return found;
  const item = new Record(dao.findCollectionByNameOrId("inventory_items"));
  item.set("code", core.nextNumber(dao, "inventory_item"));
  item.set("name", name);
  item.set("description", line.specification || "");
  item.set("category", category);
  item.set("unit", line.unit || "Each");
  item.set("reorder_level", 0);
  item.set("total_quantity", 0);
  item.set("avg_cost", 0);
  item.set("active", true);
  dao.saveRecord(item);
  return item;
}

/** Apply a signed quantity to stock (moving average on receipts) and write the ledger entry. */
function moveStock(dao, opts) {
  const { item, warehouseId, qty, unitCost, type, ref, actor, batch, serial, expiry, reason, grnId } = opts;
  let level;
  try {
    level = dao.findFirstRecordByFilter("stock_levels", "item = {:i} && warehouse = {:w}", { i: item.id, w: warehouseId });
  } catch (_) {
    level = new Record(dao.findCollectionByNameOrId("stock_levels"));
    level.set("item", item.id);
    level.set("warehouse", warehouseId);
    level.set("quantity", 0);
    level.set("avg_cost", 0);
  }
  const oldQty = level.getFloat("quantity");
  const oldAvg = level.getFloat("avg_cost");
  const newQty = core.money(oldQty + qty);
  if (newQty < 0) throw new BadRequestError(`Not enough stock of ${item.getString("name")}: ${oldQty} available, ${-qty} requested.`);
  const avg = qty > 0 && newQty > 0 ? core.money((oldQty * oldAvg + qty * unitCost) / newQty) : oldAvg;
  level.set("quantity", newQty);
  level.set("avg_cost", avg);
  level.set("value", core.money(newQty * avg));
  dao.saveRecord(level);

  const all = dao.findRecordsByFilter("stock_levels", "item = {:i}", "", 200, 0, { i: item.id }) || [];
  const totalQty = all.reduce((a, l) => a + l.getFloat("quantity"), 0);
  const totalValue = all.reduce((a, l) => a + l.getFloat("value"), 0);
  item.set("total_quantity", core.money(totalQty));
  item.set("avg_cost", totalQty > 0 ? core.money(totalValue / totalQty) : item.getFloat("avg_cost"));
  dao.saveRecord(item);

  const m = new Record(dao.findCollectionByNameOrId("stock_movements"));
  m.set("item", item.id);
  m.set("warehouse", warehouseId);
  m.set("movement_type", type);
  m.set("quantity", qty);
  m.set("unit_cost", qty > 0 ? unitCost : avg);
  m.set("value", core.money(qty * (qty > 0 ? unitCost : avg)));
  m.set("balance_after", newQty);
  m.set("batch", batch || "");
  m.set("serial_number", serial || "");
  if (expiry) m.set("expiry_date", expiry);
  m.set("reference_type", ref ? ref.type : "");
  m.set("reference_id", ref ? ref.id : "");
  m.set("reference_number", ref ? ref.number : "");
  if (grnId) m.set("goods_receipt", grnId);
  m.set("reason", reason || "");
  m.set("created_by", actor.id);
  dao.saveRecord(m);
}

function assetCategoryFor(dao, po) {
  const catId = po.getString("category");
  let pcat = null;
  try {
    pcat = catId ? dao.findRecordById("procurement_categories", catId) : null;
  } catch (_) {}
  if (pcat && pcat.getString("asset_category")) return pcat.getString("asset_category");
  const name = pcat ? pcat.getString("name") : "Procured assets";
  let ac = (dao.findRecordsByFilter("assets_categories", "name ~ {:n}", "", 20, 0, { n: name }) || []).find(
    (c) => c.getString("name").toLowerCase() === name.toLowerCase()
  );
  if (!ac) {
    ac = new Record(dao.findCollectionByNameOrId("assets_categories"));
    ac.set("name", name);
    ac.set("description", `Created automatically from procurement category “${name}”.`);
    dao.saveRecord(ac);
  }
  if (pcat) {
    pcat.set("asset_category", ac.id);
    dao.saveRecord(pcat);
  }
  return ac.id;
}

function assetTypeFor(dao, assetCategoryId, description) {
  const types = dao.findRecordsByFilter("assets_types", "category = {:c}", "name", 50, 0, { c: assetCategoryId }) || [];
  const word = String(description).toLowerCase();
  const match = types.find((t) => word.indexOf(t.getString("name").toLowerCase()) !== -1);
  if (match) return match.id;
  if (types.length) return types[0].id;
  const t = new Record(dao.findCollectionByNameOrId("assets_types"));
  t.set("name", "General");
  t.set("description", "Created automatically for received assets.");
  t.set("category", assetCategoryId);
  dao.saveRecord(t);
  return t.id;
}

/**
 * Record a delivery against a PO. input.items: [{ line, received, rejected, rejection_reason, condition,
 * batch, expiry_date, serial_numbers: [..] }], input.warehouse for goods lines.
 */
function receive(dao, poId, actor, input, meta) {
  const po = load(dao, "purchase_orders", poId, "Purchase order");
  const number = po.getString("number");
  if (RECEIVABLE.indexOf(po.getString("status")) === -1) {
    throw new BadRequestError(`${number} is ${po.getString("status").replace(/_/g, " ")}; deliveries can only be recorded against approved orders.`);
  }
  const lines = core.parseJson(po, "items", []);
  const inputLines = Array.isArray(input.items) ? input.items : [];
  const overReceipts = [];
  let warehouse = null;
  const plan = [];
  for (const il of inputLines) {
    const line = lines.find((l) => Number(l.line) === Number(il.line));
    if (!line) throw new BadRequestError(`Line ${il.line} is not on ${number}.`);
    const received = Number(il.received) || 0;
    const rejected = Number(il.rejected) || 0;
    if (received === 0 && rejected === 0) continue;
    if (received < 0 || rejected < 0) throw new BadRequestError(`Line ${line.line}: quantities cannot be negative.`);
    if (rejected > received) throw new BadRequestError(`Line ${line.line}: rejected quantity cannot exceed the quantity delivered.`);
    const accepted = core.money(received - rejected);
    const remaining = core.money(line.quantity - (line.received_qty || 0));
    if (accepted > remaining) {
      // Over-receipt: only within the configured tolerance and by someone authorised to accept it.
      const tol = overTolerance(dao);
      const allowed = core.money((line.quantity * tol) / 100);
      const extra = core.money(accepted - remaining);
      if (!tol || extra > allowed) throw new BadRequestError(`Line ${line.line} (${line.description}): only ${remaining} ${line.unit} remain on the order; ${accepted} cannot be accepted${tol ? ` (over-receipt tolerance is ${tol}% = ${allowed} ${line.unit})` : ""}.`);
      if (!core.can(dao, actor, "authorize_over_receipt")) throw new ForbiddenError(`Line ${line.line}: accepting ${extra} ${line.unit} more than ordered needs the "authorize_over_receipt" permission.`);
      overReceipts.push(`Line ${line.line}: +${extra} ${line.unit} over the ordered quantity`);
    }
    if (rejected > 0 && !String(il.rejection_reason || "").trim()) throw new BadRequestError(`Line ${line.line}: give a reason for the rejected quantity.`);
    const serials = (Array.isArray(il.serial_numbers) ? il.serial_numbers : String(il.serial_numbers || "").split(","))
      .map((s) => String(s).trim()).filter(Boolean);
    if (line.line_type === "asset" && serials.length && serials.length !== accepted) {
      throw new BadRequestError(`Line ${line.line}: ${accepted} asset(s) accepted but ${serials.length} serial number(s) given. Enter one per unit or leave blank.`);
    }
    if (line.line_type === "goods" && accepted > 0 && !warehouse) {
      if (!input.warehouse) throw new BadRequestError("Choose the warehouse receiving the goods.");
      warehouse = load(dao, "warehouses", String(input.warehouse), "Warehouse");
      if (!warehouse.getBool("active")) throw new BadRequestError(`${warehouse.getString("name")} is inactive.`);
    }
    plan.push({ line, received, rejected, accepted, serials, il });
  }
  if (!plan.length) throw new BadRequestError("Enter the quantity delivered for at least one line.");
  if (overReceipts.length && !String(input.notes || "").trim()) throw new BadRequestError("Explain the over-receipt in the notes (who authorised it and why).");

  const types = plan.map((p) => p.line.line_type);
  const grn = new Record(dao.findCollectionByNameOrId("goods_receipts"));
  grn.set("number", core.nextNumber(dao, "goods_receipt"));
  grn.set("receipt_type", types.every((t) => t === "service") ? "service" : types.some((t) => t === "service") ? "mixed" : "goods");
  grn.set("purchase_order", po.id);
  grn.set("supplier", po.getString("supplier"));
  grn.set("received_by", actor.id);
  grn.set("receipt_date", toDate(input.receipt_date) ? toDate(input.receipt_date).toISOString() : new Date().toISOString());
  if (warehouse) grn.set("warehouse", warehouse.id);
  grn.set("delivery_note_number", String(input.delivery_note_number || ""));
  grn.set("notes", String(input.notes || ""));
  let acceptedValue = 0;
  grn.set("items", plan.map((p) => {
    const unitTotal = p.line.quantity ? p.line.total / p.line.quantity : 0;
    acceptedValue += p.accepted * unitTotal;
    return {
      line: p.line.line, description: p.line.description, unit: p.line.unit, line_type: p.line.line_type,
      ordered: p.line.quantity, previously_received: p.line.received_qty || 0, received: p.received, rejected: p.rejected,
      accepted: p.accepted, remaining_after: core.money(p.line.quantity - (p.line.received_qty || 0) - p.accepted),
      condition: String(p.il.condition || "good"), rejection_reason: String(p.il.rejection_reason || ""),
      batch: String(p.il.batch || ""), expiry_date: String(p.il.expiry_date || ""), serial_numbers: p.serials,
      unit_cost: core.money(unitTotal),
    };
  }));
  grn.set("accepted_value", core.money(acceptedValue));
  grn.set("has_rejections", plan.some((p) => p.rejected > 0));
  dao.saveRecord(grn);

  const ref = { type: "goods_receipt", id: grn.id, number: grn.getString("number") };
  const createdAssets = [];
  const quoteWarranty = (() => {
    try {
      return po.getString("quotation") ? dao.findRecordById("quotations", po.getString("quotation")).getString("warranty") : "";
    } catch (_) {
      return "";
    }
  })();
  for (const p of plan) {
    if (p.accepted <= 0) continue;
    const unitCost = core.money(p.line.quantity ? p.line.total / p.line.quantity : 0);
    if (p.line.line_type === "goods") {
      const item = findOrCreateItem(dao, p.line, po);
      moveStock(dao, {
        item, warehouseId: warehouse.id, qty: p.accepted, unitCost, type: "receipt", ref, actor, grnId: grn.id,
        batch: p.il.batch, expiry: toDate(p.il.expiry_date) ? toDate(p.il.expiry_date).toISOString() : "",
        reason: `Received on ${number}`,
      });
    } else if (p.line.line_type === "asset") {
      const assetCategory = assetCategoryFor(dao, po);
      const assetType = assetTypeFor(dao, assetCategory, p.line.description);
      for (let i = 0; i < p.accepted; i++) {
        const a = new Record(dao.findCollectionByNameOrId("assets"));
        a.set("name", p.line.description);
        a.set("code", core.nextNumber(dao, "asset"));
        a.set("serial_number", p.serials[i] || "");
        a.set("status", "in_stock");
        a.set("cost", unitCost);
        a.set("purchased_at", grn.getString("receipt_date"));
        a.set("category", assetCategory);
        a.set("type", assetType);
        a.set("supplier", po.getString("supplier"));
        a.set("purchase_order", po.id);
        a.set("goods_receipt", grn.id);
        a.set("department", po.getString("department"));
        a.set("warranty", quoteWarranty);
        a.set("notes", `Received on ${grn.getString("number")} against ${number}.`);
        a.set("created_by", actor.id);
        dao.saveRecord(a);
        createdAssets.push(a.getString("code"));
      }
    }
  }

  const updated = lines.map((l) => {
    const p = plan.find((x) => Number(x.line.line) === Number(l.line));
    return p ? { ...l, received_qty: core.money((l.received_qty || 0) + p.accepted), rejected_qty: core.money((l.rejected_qty || 0) + p.rejected) } : l;
  });
  const full = updated.every((l) => (l.received_qty || 0) >= l.quantity);
  const oldStatus = po.getString("status");
  po.set("items", updated);
  po.set("received_value", core.money(po.getFloat("received_value") + acceptedValue));
  po.set("status", full ? "fully_received" : "partially_received");
  dao.saveRecord(po);
  if (full) {
    try {
      const req = dao.findRecordById("purchase_requisitions", po.getString("requisition"));
      req.set("status", "completed");
      dao.saveRecord(req);
    } catch (_) {}
  }

  audit(dao, actor, "goods_received", po, {
    comment: grn.getString("number"),
    changes: {
      status: { old: oldStatus, new: po.getString("status") },
      accepted_value: { old: null, new: core.money(acceptedValue) },
      rejected: { old: null, new: plan.filter((p) => p.rejected > 0).map((p) => `line ${p.line.line}: ${p.rejected}`).join(", ") || "none" },
      assets_created: { old: null, new: createdAssets.length ? createdAssets.join(", ") : "none" },
    },
  }, meta);
  if (overReceipts.length) audit(dao, actor, "over_receipt_authorized", po, { comment: `${grn.getString("number")}: ${overReceipts.join("; ")} — ${String(input.notes || "")}`, changes: {} }, meta);
  core.notify(dao, [po.getString("buyer"), po.getString("requester")].filter((x) => x !== actor.id), {
    title: `${number}: ${full ? "fully received" : "partial delivery received"}`,
    body: `${grn.getString("number")} · ${core.formatMoney(acceptedValue, po.getString("currency"))} accepted${grn.getBool("has_rejections") ? " · some items rejected" : ""}`,
    link: `/dashboard/procurement/purchase-orders/${po.id}`, type: grn.getBool("has_rejections") ? "warning" : "success",
  });
  return { grn, assets: createdAssets };
}

/** Manual stock issue / adjustment (reason required, never below zero). */
function adjust(dao, actor, input, meta) {
  const item = load(dao, "inventory_items", String(input.item || ""), "Item");
  const wh = load(dao, "warehouses", String(input.warehouse || ""), "Warehouse");
  const qty = Number(input.quantity) || 0;
  const reason = String(input.reason || "").trim();
  const type = String(input.type || "");
  if (!qty) throw new BadRequestError("Enter a quantity.");
  if (!reason) throw new BadRequestError("A reason is required for every stock adjustment.");
  const map = { issue: "issue", adjustment: qty > 0 ? "adjustment_in" : "adjustment_out", return_to_supplier: "return_to_supplier" };
  if (!map[type]) throw new BadRequestError(`Unknown movement type "${type}".`);
  const signed = type === "adjustment" ? qty : -Math.abs(qty);
  moveStock(dao, { item, warehouseId: wh.id, qty: signed, unitCost: item.getFloat("avg_cost"), type: map[type], actor, reason, ref: { type: "manual", id: "", number: String(input.reference || "") } });
  core.audit(dao, { actor, action: `stock_${map[type]}`, collection: "inventory_items", recordId: item.id, label: `${item.getString("code")} ${item.getString("name")}`, comment: reason, meta, changes: { quantity: { old: null, new: signed }, warehouse: { old: null, new: wh.getString("name") } } });
  return item;
}

function itemBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission($app.dao(), auth, "manage_inventory", "create inventory items");
  e.record.set("total_quantity", 0);
  e.record.set("avg_cost", 0);
  if (!e.record.getString("unit")) e.record.set("unit", "Each");
  e.record.set("active", true);
  let code = "";
  $app.dao().runInTransaction((tx) => {
    code = core.nextNumber(tx, "inventory_item");
  });
  e.record.set("code", code);
}

function itemBeforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission($app.dao(), auth, "manage_inventory", "edit inventory items");
  const before = e.record.originalCopy();
  for (const f of ["code", "total_quantity", "avg_cost"]) e.record.set(f, before.get(f));
}

module.exports = { fromRfq, direct, beforeUpdate, transition, receive, adjust, itemBeforeCreate, itemBeforeUpdate, computeTotals, moveStock, findOrCreateItem };
