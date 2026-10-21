/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement — Phase 4: finance integration
 *
 *  - budgets              per fiscal year and department (optionally per category); committed / invoiced /
 *                         paid / remaining are computed live from purchase orders, invoices and payments
 *  - supplier_invoices    recorded against a PO, three-way matched (PO ↔ receipts ↔ invoice) on the server,
 *                         exceptions must be resolved before approval, approved via the approval engine
 *  - payments             against approved invoices; receiver ≠ payer and invoice approver ≠ payer
 *  - settings             budget_control (none | warn | block) and invoice price tolerance
 *  - purchase_orders      gains invoiced / paid totals and invoicing statuses
 */
const AUTH = '@request.auth.id != ""';
const ALL = '@request.auth.role.procurement_scope = "all"';
const INVOICE_SCOPE = `${ALL} || recorded_by = @request.auth.id || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id || purchase_order.buyer = @request.auth.id || (@request.auth.role.procurement_scope = "department" && department = @request.auth.department)`;

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

    create({
      name: "budgets",
      schema: [
        text("name"), num("fiscal_year"), rel("department", DEPARTMENTS), rel("category", id("procurement_categories")),
        text("cost_center"), text("project"), num("amount"), text("currency"), select("status", ["active", "closed"]),
        text("notes"), rel("created_by", USERS),
      ],
      indexes: ["CREATE INDEX idx_budgets_lookup ON budgets (fiscal_year, department)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const INVOICES = create({
      name: "supplier_invoices",
      schema: [
        text("number"), text("supplier_invoice_number"), rel("supplier", id("suppliers")), rel("purchase_order", id("purchase_orders")),
        rel("department", DEPARTMENTS), date("invoice_date"), date("due_date"), text("currency"), json("items"),
        num("subtotal"), num("tax_total"), num("total"), num("paid_amount"), num("balance"),
        select("status", ["received", "exception", "matched", "pending_approval", "approved", "returned", "rejected", "partially_paid", "paid", "cancelled"]),
        select("match_status", ["matched", "exception"]), json("match_result"), bool("exception_overridden"),
        text("exception_resolution"), rel("resolved_by", USERS), date("resolved_at"),
        rel("approval", id("approval_requests")), text("pending_approvers"), text("approver_history"),
        date("submitted_at"), date("approved_at"), text("cancel_reason"), text("notes"), files("attachments", 10),
        rel("recorded_by", USERS),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_invoice_number ON supplier_invoices (number) WHERE number != ''",
        "CREATE UNIQUE INDEX idx_invoice_supplier_ref ON supplier_invoices (supplier, supplier_invoice_number) WHERE supplier_invoice_number != ''",
      ],
      listRule: INVOICE_SCOPE, viewRule: INVOICE_SCOPE, createRule: AUTH, updateRule: `${ALL} || recorded_by = @request.auth.id`, deleteRule: null,
    });

    create({
      name: "payments",
      schema: [
        text("number"), rel("invoice", INVOICES), rel("supplier", id("suppliers")), rel("purchase_order", id("purchase_orders")),
        num("amount"), text("currency"), date("payment_date"), select("method", ["bank_transfer", "cheque", "mobile_money", "cash"]),
        text("reference"), text("notes"), rel("paid_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_payment_number ON payments (number) WHERE number != ''"],
      listRule: `${ALL} || invoice.recorded_by = @request.auth.id || paid_by = @request.auth.id`,
      viewRule: `${ALL} || invoice.recorded_by = @request.auth.id || paid_by = @request.auth.id`,
      createRule: null, updateRule: null, deleteRule: null,
    });

    addFields("settings", [select("budget_control", ["none", "warn", "block"]), num("invoice_price_tolerance_pct"), num("invoice_total_tolerance_pct")]);

    addFields("purchase_orders", [num("invoiced_value"), num("paid_value")]);
    const po = dao.findCollectionByNameOrId("purchase_orders");
    const statusField = po.schema.getFieldByName("status");
    const values = statusField.options.values;
    for (const v of ["partially_invoiced", "fully_invoiced"]) if (values.indexOf(v) === -1) values.push(v);
    statusField.options.values = values;
    dao.saveCollection(po);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["payments", "supplier_invoices", "budgets"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
