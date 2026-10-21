/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement — Phase 5: controls, supplier onboarding, returns, contracts, planning, amendments.
 *
 *  - settings                 over-receipt and invoice quantity tolerance, procurement defaults, contract alerts
 *  - supplier_invoices        match_status "partial" (differences within tolerance)
 *  - suppliers                onboarding: draft → under review (approval engine) → active / rejected
 *  - purchase_orders          controlled amendments (revision history), link to a contract
 *  - purchase_returns (new)   return of accepted goods: approval → dispatch (stock out) → credit note
 *  - contracts (new)          value, utilisation by purchase orders, renewal / expiry alerts, approval
 *  - procurement_plans (new)  annual plan per department, approved through the engine
 *  - procurement_plan_lines   planned purchases; requisitions are raised against them
 *  - purchase_requisitions    plan_line
 */
const AUTH = '@request.auth.id != ""';
const ALL = '@request.auth.role.procurement_scope = "all"';
const DEPT = '@request.auth.role.procurement_scope = "department"';

const text = (name) => ({ name, type: "text", required: false, options: { min: null, max: null, pattern: "" } });
const num = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const files = (name, max) => ({ name, type: "file", required: false, options: { maxSelect: max, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } });
const rel = (name, collectionId, max, cascade) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: !!cascade, minSelect: null, maxSelect: max || 1, displayFields: null } });
const approvalFields = (APPROVALS) => [rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"), date("submitted_at"), date("approved_at")];

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (n) => dao.findCollectionByNameOrId(n).id;
    const USERS = id("users");
    const DEPTS = id("departments");
    const APPROVALS = id("approval_requests");
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
      return c;
    };
    const extendSelect = (name, field, values) => {
      const c = dao.findCollectionByNameOrId(name);
      const f = c.schema.getFieldByName(field);
      const v = f.options.values;
      for (const x of values) if (v.indexOf(x) === -1) v.push(x);
      f.options.values = v;
      dao.saveCollection(c);
    };

    // ------------------------------------------------------------- settings
    addFields("settings", [
      num("receipt_over_tolerance_pct"), num("invoice_qty_tolerance_pct"), num("default_tax_rate"), text("default_payment_terms"),
      text("default_delivery_terms"), rel("default_warehouse", id("warehouses")), num("contract_alert_days"),
      bool("notify_email_approvals"), bool("notify_overdue_deliveries"),
    ]);
    for (const s of dao.findRecordsByFilter("settings", "id != ''", "", 10, 0) || []) {
      if (!s.getFloat("contract_alert_days")) s.set("contract_alert_days", 60);
      if (!s.getFloat("default_tax_rate")) s.set("default_tax_rate", 18);
      if (!s.getString("default_payment_terms")) s.set("default_payment_terms", "30 days after receipt of a valid invoice");
      if (!s.getFloat("receipt_over_tolerance_pct")) s.set("receipt_over_tolerance_pct", 5);
      s.set("notify_overdue_deliveries", true);
      dao.saveRecord(s);
    }

    // ------------------------------------------------------------- invoices, suppliers, POs
    extendSelect("supplier_invoices", "match_status", ["partial"]);
    extendSelect("suppliers", "status", ["draft", "under_review", "rejected"]);
    addFields("suppliers", [...approvalFields(APPROVALS), rel("submitted_by", USERS), text("review_comment")]);
    const PO = id("purchase_orders");

    // ------------------------------------------------------------- contracts
    const contractScope = `${ALL} || responsible = @request.auth.id || created_by = @request.auth.id || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id || (${DEPT} && department = @request.auth.department)`;
    const contracts = new Collection({
      type: "base", name: "contracts",
      schema: [
        text("number"), text("title"), rel("supplier", id("suppliers")), select("contract_type", ["framework", "fixed_price", "service", "supply", "lease", "consultancy", "other"]),
        rel("department", DEPTS), rel("responsible", USERS), date("start_date"), date("end_date"), date("renewal_date"), bool("auto_renew"),
        num("value"), text("currency"), text("payment_terms"), text("scope"), json("items"), num("utilized_value"), num("remaining_value"),
        select("status", ["draft", "pending_approval", "returned", "rejected", "active", "expired", "terminated", "cancelled"]),
        ...approvalFields(APPROVALS), text("termination_reason"), files("documents", 20), text("notes"), rel("created_by", USERS), json("alerts_sent"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_contract_number ON contracts (number) WHERE number != ''", "CREATE INDEX idx_contract_supplier ON contracts (supplier, status)"],
      listRule: contractScope, viewRule: contractScope, createRule: AUTH, updateRule: `${ALL} || created_by = @request.auth.id || responsible = @request.auth.id`, deleteRule: null,
    });
    dao.saveCollection(contracts);
    addFields("purchase_orders", [num("revision"), json("revisions"), text("amend_reason"), rel("contract", contracts.id)]);

    // ------------------------------------------------------------- returns
    const returnScope = `${ALL} || requested_by = @request.auth.id || purchase_order.buyer = @request.auth.id || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id || (${DEPT} && purchase_order.department = @request.auth.department)`;
    dao.saveCollection(new Collection({
      type: "base", name: "purchase_returns",
      schema: [
        text("number"), rel("purchase_order", PO), rel("goods_receipt", id("goods_receipts")), rel("supplier", id("suppliers")), rel("warehouse", id("warehouses")),
        json("items"), num("total_value"), text("reason"), select("supplier_action", ["credit_note", "replacement", "refund"]),
        select("status", ["draft", "pending_approval", "returned_for_changes", "rejected", "approved", "dispatched", "credited", "cancelled"]),
        ...approvalFields(APPROVALS), rel("requested_by", USERS), date("dispatched_at"), rel("dispatched_by", USERS),
        text("credit_note_number"), num("credit_amount"), date("credited_at"), text("notes"), files("attachments", 10), text("cancel_reason"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_return_number ON purchase_returns (number) WHERE number != ''"],
      listRule: returnScope, viewRule: returnScope, createRule: null, updateRule: null, deleteRule: null,
    }));
    // The approval engine expects document status "returned" for "sent back"; a return uses its own word.

    // ------------------------------------------------------------- planning
    const planScope = `${ALL} || created_by = @request.auth.id || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id || department = @request.auth.department`;
    const plans = new Collection({
      type: "base", name: "procurement_plans",
      schema: [
        text("number"), text("name"), num("fiscal_year"), rel("department", DEPTS), select("status", ["draft", "pending_approval", "returned", "rejected", "approved", "closed", "cancelled"]),
        num("total_estimated"), num("lines_count"), ...approvalFields(APPROVALS), text("notes"), rel("created_by", USERS),
      ],
      indexes: ["CREATE INDEX idx_plan_year_dept ON procurement_plans (fiscal_year, department)"],
      listRule: planScope, viewRule: planScope, createRule: AUTH, updateRule: `${ALL} || created_by = @request.auth.id`, deleteRule: `created_by = @request.auth.id && status = "draft"`,
    });
    dao.saveCollection(plans);
    const lineScope = `${ALL} || plan.created_by = @request.auth.id || plan.department = @request.auth.department || plan.pending_approvers ~ @request.auth.id || plan.approver_history ~ @request.auth.id`;
    const lines = new Collection({
      type: "base", name: "procurement_plan_lines",
      schema: [
        rel("plan", plans.id, 1, true), text("description"), rel("category", id("procurement_categories")), num("quantity"), text("unit"), num("estimated_unit_cost"),
        num("estimated_total"), num("planned_month"), select("priority", ["low", "medium", "high", "urgent"]), select("method", ["rfq", "direct", "open_tender", "framework"]),
        rel("budget", id("budgets")), text("project"), text("cost_center"), select("status", ["planned", "in_progress", "completed", "cancelled"]), num("committed_value"), num("sort"), text("notes"),
      ],
      indexes: ["CREATE INDEX idx_plan_lines_plan ON procurement_plan_lines (plan)"],
      listRule: lineScope, viewRule: lineScope, createRule: AUTH, updateRule: `${ALL} || plan.created_by = @request.auth.id`, deleteRule: `${ALL} || plan.created_by = @request.auth.id`,
    });
    dao.saveCollection(lines);
    addFields("purchase_requisitions", [rel("plan_line", lines.id)]);

    // ------------------------------------------------------------- indexes for reports
    const addIndex = (name, sql) => {
      const c = dao.findCollectionByNameOrId(name);
      const idx = c.indexes || [];
      if (!idx.some((x) => x.indexOf(sql.split(" ON ")[0].split(" ").pop()) !== -1)) idx.push(sql);
      c.indexes = idx;
      dao.saveCollection(c);
    };
    addIndex("purchase_orders", "CREATE INDEX idx_po_supplier_status ON purchase_orders (supplier, status)");
    addIndex("goods_receipts", "CREATE INDEX idx_grn_date ON goods_receipts (receipt_date)");
    addIndex("supplier_invoices", "CREATE INDEX idx_invoice_supplier_status ON supplier_invoices (supplier, status)");
  },
  (db) => {
    const dao = new Dao(db);
    for (const n of ["procurement_plan_lines", "procurement_plans", "purchase_returns", "contracts"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  }
);
