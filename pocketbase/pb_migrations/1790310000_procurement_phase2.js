/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement — Phase 2: suppliers and sourcing
 *
 *  - suppliers, supplier_contacts, supplier_documents, supplier_evaluations
 *  - rfqs (created from approved requisitions), rfq_suppliers (per-supplier invitation tracking)
 *  - quotations (entered per invited supplier; totals computed on the server)
 *
 * Supplier categories reuse procurement_categories — no second category list.
 * Write permissions are enforced in pb_hooks/sourcing.pb.js.
 */
const AUTH = '@request.auth.id != ""';
const PROCUREMENT = '@request.auth.role.procurement_scope = "all"';
// RFQs and quotations are visible to organisation-wide procurement roles, the buyer, and the
// original requester / their department (depending on the role's scope).
const RFQ_SCOPE = `${PROCUREMENT} || buyer = @request.auth.id || requester = @request.auth.id || (@request.auth.role.procurement_scope = "department" && department = @request.auth.department)`;

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
function email(name) {
  return { name, type: "email", required: false, options: { exceptDomains: null, onlyDomains: null } };
}
function select(name, values) {
  return { name, type: "select", required: false, options: { maxSelect: 1, values } };
}
function files(name, maxSelect) {
  return {
    name, type: "file", required: false,
    options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false },
  };
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
    const CATEGORIES = id("procurement_categories");
    const REQUISITIONS = id("purchase_requisitions");

    const create = (def) => {
      const c = new Collection({ type: "base", ...def });
      dao.saveCollection(c);
      return c.id;
    };

    const SUPPLIERS = create({
      name: "suppliers",
      schema: [
        text("code"), text("name"), select("supplier_type", ["company", "individual", "government", "ngo", "other"]),
        rel("categories", CATEGORIES, 50), text("registration_number"), text("tin"), text("vat_number"),
        text("country"), text("province"), text("district"), text("address"), email("email"), text("phone"), text("website"),
        text("payment_terms"), text("currency"), text("bank_name"), text("bank_branch"), text("bank_account_name"),
        text("bank_account_number"), text("swift_code"), select("status", ["active", "inactive", "blacklisted"]),
        num("rating"), num("evaluations_count"), text("notes"), rel("created_by", USERS),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_supplier_code ON suppliers (code) WHERE code != ''",
        "CREATE UNIQUE INDEX idx_supplier_tin ON suppliers (tin) WHERE tin != ''",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    create({
      name: "supplier_contacts",
      schema: [rel("supplier", SUPPLIERS, 1, true), text("name"), text("position"), email("email"), text("phone"), bool("is_primary")],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    create({
      name: "supplier_documents",
      schema: [
        rel("supplier", SUPPLIERS, 1, true),
        select("document_type", ["registration_certificate", "tax_certificate", "vat_certificate", "bank_confirmation", "contract", "insurance", "compliance", "other"]),
        text("document_number"), date("issue_date"), date("expiry_date"), files("file", 1), text("notes"), rel("uploaded_by", USERS),
      ],
      indexes: ["CREATE INDEX idx_supplier_documents_expiry ON supplier_documents (expiry_date)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    create({
      name: "supplier_evaluations",
      schema: [
        rel("supplier", SUPPLIERS, 1, true), text("period"), num("quality"), num("delivery"), num("price"),
        num("compliance"), num("responsiveness"), num("contract_compliance"), num("overall"), text("comments"),
        rel("evaluator", USERS),
      ],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: null, deleteRule: null,
    });

    const RFQS = create({
      name: "rfqs",
      schema: [
        text("number"), text("title"), rel("requisition", REQUISITIONS), rel("requester", USERS), rel("department", DEPARTMENTS),
        rel("buyer", USERS), select("status", ["draft", "sent", "closed", "awarded", "cancelled"]), date("issue_date"),
        date("closing_date"), text("currency"), text("delivery_location"), text("payment_terms"), text("delivery_terms"),
        text("required_documents"), json("items"), text("notes"), rel("suppliers", SUPPLIERS, 50), json("evaluation_weights"),
        text("award_reason"), bool("award_not_lowest"), date("awarded_at"), rel("awarded_by", USERS), text("cancel_reason"),
        files("attachments", 10),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_rfq_number ON rfqs (number) WHERE number != ''"],
      listRule: RFQ_SCOPE, viewRule: RFQ_SCOPE, createRule: null, updateRule: PROCUREMENT + " || buyer = @request.auth.id", deleteRule: null,
    });

    const INVITE_SCOPE = `${PROCUREMENT} || rfq.buyer = @request.auth.id || rfq.requester = @request.auth.id`;
    create({
      name: "rfq_suppliers",
      schema: [
        rel("rfq", RFQS, 1, true), rel("supplier", SUPPLIERS), select("status", ["invited", "sent", "viewed", "quoted", "declined", "late"]),
        date("sent_at"), date("responded_at"), text("notes"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_rfq_supplier ON rfq_suppliers (rfq, supplier)"],
      listRule: INVITE_SCOPE, viewRule: INVITE_SCOPE, createRule: null, updateRule: PROCUREMENT + " || rfq.buyer = @request.auth.id", deleteRule: null,
    });

    const RFQ_ITEM_SCOPE = `${PROCUREMENT} || rfq.buyer = @request.auth.id || rfq.requester = @request.auth.id || (@request.auth.role.procurement_scope = "department" && rfq.department = @request.auth.department)`;
    const QUOTES = create({
      name: "quotations",
      schema: [
        text("number"), rel("rfq", RFQS), rel("supplier", SUPPLIERS), text("supplier_reference"), date("quotation_date"),
        date("validity_date"), text("currency"), json("items"), num("subtotal"), num("discount_total"), num("tax_total"),
        num("delivery_cost"), num("other_charges"), num("grand_total"), num("delivery_days"), text("payment_terms"),
        text("warranty"), select("technical_compliance", ["compliant", "partial", "non_compliant"]), text("notes"),
        files("attachments", 10), select("status", ["received", "accepted", "rejected"]), bool("received_late"),
        json("scores"), num("total_score"), rel("created_by", USERS),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_quotation_number ON quotations (number) WHERE number != ''",
        "CREATE UNIQUE INDEX idx_quotation_rfq_supplier ON quotations (rfq, supplier)",
      ],
      listRule: RFQ_ITEM_SCOPE, viewRule: RFQ_ITEM_SCOPE, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });

    // RFQ ↔ awarded quotation (added after quotations exists).
    const rfqs = dao.findCollectionByNameOrId("rfqs");
    rfqs.schema.addField(new SchemaField(rel("awarded_quotation", QUOTES)));
    dao.saveCollection(rfqs);
  },
  (db) => {
    const dao = new Dao(db);
    try {
      const rfqs = dao.findCollectionByNameOrId("rfqs");
      rfqs.schema.removeField(rfqs.schema.getFieldByName("awarded_quotation").id);
      dao.saveCollection(rfqs);
    } catch (_) {}
    for (const name of ["quotations", "rfq_suppliers", "rfqs", "supplier_evaluations", "supplier_documents", "supplier_contacts", "suppliers"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
