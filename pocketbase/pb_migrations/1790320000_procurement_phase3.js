/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement — Phase 3: purchase orders, receiving, inventory, asset creation
 *
 *  - purchase_orders          from an awarded RFQ (or a direct purchase on an approved requisition),
 *                             approved through the same configurable approval engine
 *  - goods_receipts           GRNs and service confirmations; full, partial and rejected quantities
 *  - warehouses, inventory_items, stock_levels, stock_movements
 *                             stock is only ever changed by the server (receipts / adjustments)
 *  - assets (existing)        gains supplier / PO / GRN / warranty links; receipts of asset lines
 *                             create asset records automatically
 *  - procurement_categories   gains asset_category: which Assets category received items go to
 */
const AUTH = '@request.auth.id != ""';
const ALL = '@request.auth.role.procurement_scope = "all"';
const PO_SCOPE = `${ALL} || buyer = @request.auth.id || requester = @request.auth.id || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id || (@request.auth.role.procurement_scope = "department" && department = @request.auth.department)`;
const GRN_SCOPE = `${ALL} || received_by = @request.auth.id || purchase_order.buyer = @request.auth.id || purchase_order.requester = @request.auth.id || (@request.auth.role.procurement_scope = "department" && purchase_order.department = @request.auth.department)`;

function text(name) {
  return { name, type: "text", required: false, options: { min: null, max: null, pattern: "" } };
}
function num(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } };
}
function bool(name) {
  return { name, type: "bool", required: false, options: {} };
}
function date(name) {
  return { name, type: "date", required: false, options: { min: "", max: "" } };
}
function json(name) {
  return { name, type: "json", required: false, options: { maxSize: 2000000 } };
}
function select(name, values) {
  return { name, type: "select", required: false, options: { maxSelect: 1, values } };
}
function files(name, maxSelect) {
  return { name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } };
}
function rel(name, collectionId, maxSelect, cascadeDelete) {
  return {
    name, type: "relation", required: false,
    options: { collectionId, cascadeDelete: !!cascadeDelete, minSelect: null, maxSelect: maxSelect || 1, displayFields: null },
  };
}

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (name) => dao.findCollectionByNameOrId(name).id;
    const USERS = id("users");
    const DEPARTMENTS = id("departments");
    const BRANCHES = id("branches");
    const CATEGORIES = id("procurement_categories");
    const SUPPLIERS = id("suppliers");
    const create = (def) => {
      const c = new Collection({ type: "base", ...def });
      dao.saveCollection(c);
      return c.id;
    };
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };

    // Which Assets category received asset items belong to.
    addFields("procurement_categories", [rel("asset_category", id("assets_categories"))]);

    const PO = create({
      name: "purchase_orders",
      schema: [
        text("number"), text("title"), select("source", ["rfq", "direct"]), rel("requisition", id("purchase_requisitions")),
        rel("rfq", id("rfqs")), rel("quotation", id("quotations")), rel("supplier", SUPPLIERS), rel("buyer", USERS),
        rel("requester", USERS), rel("department", DEPARTMENTS), rel("branch", BRANCHES), rel("category", CATEGORIES),
        date("order_date"), date("expected_delivery_date"), text("currency"), text("payment_terms"), text("delivery_terms"),
        text("delivery_location"), text("cost_center"), text("project"), json("items"), num("subtotal"), num("discount_total"),
        num("tax_total"), num("delivery_cost"), num("other_charges"), num("grand_total"), num("received_value"),
        select("status", ["draft", "pending_approval", "approved", "returned", "rejected", "sent", "acknowledged", "partially_received", "fully_received", "completed", "cancelled", "closed"]),
        rel("approval", id("approval_requests")), text("pending_approvers"), text("approver_history"),
        date("submitted_at"), date("approved_at"), date("sent_at"), date("acknowledged_at"), date("closed_at"),
        text("cancel_reason"), text("justification"), text("notes"), text("terms_conditions"), files("attachments", 10),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_po_number ON purchase_orders (number) WHERE number != ''",
        "CREATE INDEX idx_po_status ON purchase_orders (status)",
      ],
      listRule: PO_SCOPE, viewRule: PO_SCOPE, createRule: null,
      updateRule: `${ALL} || buyer = @request.auth.id`, deleteRule: null,
    });

    const WAREHOUSES = create({
      name: "warehouses",
      schema: [text("name"), text("code"), text("location"), rel("branch", BRANCHES), rel("manager", USERS), bool("active")],
      indexes: ["CREATE UNIQUE INDEX idx_warehouse_code ON warehouses (code) WHERE code != ''"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const ITEMS = create({
      name: "inventory_items",
      schema: [
        text("code"), text("name"), text("description"), rel("category", CATEGORIES), text("unit"), bool("track_batch"),
        bool("track_serial"), bool("track_expiry"), num("reorder_level"), num("total_quantity"), num("avg_cost"), bool("active"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_inventory_item_code ON inventory_items (code) WHERE code != ''"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });

    create({
      name: "stock_levels",
      schema: [rel("item", ITEMS, 1, true), rel("warehouse", WAREHOUSES, 1, true), num("quantity"), num("avg_cost"), num("value")],
      indexes: ["CREATE UNIQUE INDEX idx_stock_level ON stock_levels (item, warehouse)"],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    const GRN = create({
      name: "goods_receipts",
      schema: [
        text("number"), select("receipt_type", ["goods", "service", "mixed"]), rel("purchase_order", PO), rel("supplier", SUPPLIERS),
        rel("received_by", USERS), date("receipt_date"), rel("warehouse", WAREHOUSES), text("delivery_note_number"),
        json("items"), num("accepted_value"), bool("has_rejections"), text("notes"), files("attachments", 10),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_grn_number ON goods_receipts (number) WHERE number != ''"],
      listRule: GRN_SCOPE, viewRule: GRN_SCOPE, createRule: null, updateRule: null, deleteRule: null,
    });

    create({
      name: "stock_movements",
      schema: [
        rel("item", ITEMS), rel("warehouse", WAREHOUSES),
        select("movement_type", ["receipt", "issue", "adjustment_in", "adjustment_out", "return_to_supplier"]),
        num("quantity"), num("unit_cost"), num("value"), num("balance_after"), text("batch"), text("serial_number"),
        date("expiry_date"), text("reference_type"), text("reference_id"), text("reference_number"), rel("goods_receipt", GRN),
        text("reason"), rel("created_by", USERS),
      ],
      indexes: ["CREATE INDEX idx_stock_movements_item ON stock_movements (item, warehouse)"],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    addFields("assets", [
      rel("supplier", SUPPLIERS), rel("purchase_order", PO), rel("goods_receipt", GRN), text("warranty"),
      rel("department", DEPARTMENTS), rel("location", WAREHOUSES),
    ]);
  },
  (db) => {
    const dao = new Dao(db);
    const drop = (name, fields) => {
      try {
        const c = dao.findCollectionByNameOrId(name);
        for (const f of fields) {
          const field = c.schema.getFieldByName(f);
          if (field) c.schema.removeField(field.id);
        }
        dao.saveCollection(c);
      } catch (_) {}
    };
    drop("assets", ["supplier", "purchase_order", "goods_receipt", "warranty", "department", "location"]);
    drop("procurement_categories", ["asset_category"]);
    for (const name of ["stock_movements", "goods_receipts", "stock_levels", "inventory_items", "warehouses", "purchase_orders"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
