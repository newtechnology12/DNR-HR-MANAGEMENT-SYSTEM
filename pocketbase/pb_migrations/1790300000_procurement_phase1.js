/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement — Phase 1 foundation
 *
 *  - roles.procurement_scope      record-level visibility for procurement docs (own | department | all)
 *  - departments.head             department head, used by the approval engine
 *  - audit_logs                   immutable audit trail (written only by server hooks)
 *  - notifications                in-app notifications (written only by server hooks)
 *  - number_sequences             configurable document numbering (PR-2026-000001, ...)
 *  - procurement_categories       purchase categories
 *  - units_of_measure             units for requisition / PO lines
 *  - approval_workflows           configurable approval rules (thresholds, departments, steps)
 *  - approval_requests            one approval run per submitted document
 *  - approval_actions             every approve / reject / return / delegate / escalate / comment
 *  - purchase_requisitions        purchase requisitions
 *
 * Also closes two privilege-escalation holes: users could change their own role, and any
 * logged-in user could edit roles. Fine-grained permission checks live in pb_hooks/security.pb.js.
 */
const AUTH = '@request.auth.id != ""';
// A procurement document is visible to its requester, its current/past approvers,
// and to roles whose procurement_scope covers it.
const DOC_SCOPE =
  'requester = @request.auth.id || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id || @request.auth.role.procurement_scope = "all" || (@request.auth.role.procurement_scope = "department" && department = @request.auth.department)';

function text(name, extra) {
  return { name, type: "text", required: false, options: { min: null, max: null, pattern: "" }, ...(extra || {}) };
}
function num(name, extra) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: false }, ...(extra || {}) };
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
    const BRANCHES = id("branches");

    // ---- existing collections
    const roles = dao.findCollectionByNameOrId("roles");
    if (!roles.schema.getFieldByName("procurement_scope")) {
      roles.schema.addField(new SchemaField(select("procurement_scope", ["own", "department", "all"])));
    }
    roles.createRule = AUTH; // permission checked in security.pb.js
    roles.updateRule = AUTH;
    roles.deleteRule = AUTH;
    dao.saveCollection(roles);

    const departments = dao.findCollectionByNameOrId("departments");
    if (!departments.schema.getFieldByName("head")) {
      departments.schema.addField(new SchemaField(rel("head", USERS)));
    }
    dao.saveCollection(departments);

    const users = dao.findCollectionByNameOrId("users");
    users.updateRule = AUTH; // who may change what is enforced in security.pb.js
    dao.saveCollection(users);

    const create = (def) => {
      const c = new Collection({ type: "base", ...def });
      dao.saveCollection(c);
      return c.id;
    };

    create({
      name: "audit_logs",
      schema: [
        rel("actor", USERS), text("actor_name"), text("action"), text("collection_name"), text("record_id"),
        text("record_label"), json("changes"), text("comment"), text("ip"), text("user_agent"),
      ],
      indexes: ["CREATE INDEX idx_audit_record ON audit_logs (collection_name, record_id)"],
      // Read through GET /api/dnr/audit only; nobody can write or edit through the API.
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });

    create({
      name: "notifications",
      schema: [rel("user", USERS, 1, true), text("title"), text("body"), text("link"), text("type"), bool("read"), date("read_at")],
      indexes: ["CREATE INDEX idx_notifications_user ON notifications (user, read)"],
      listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
      createRule: null, updateRule: "user = @request.auth.id", deleteRule: "user = @request.auth.id",
    });

    create({
      name: "number_sequences",
      schema: [
        text("key"), text("name"), text("prefix"), bool("include_year"), num("padding"),
        num("next_value"), num("current_year"), text("separator"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_number_sequences_key ON number_sequences (key)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });

    const CATEGORIES = create({
      name: "procurement_categories",
      schema: [text("name"), text("code"), text("description"), bool("is_asset"), bool("active")],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    create({
      name: "units_of_measure",
      schema: [text("name"), text("code"), bool("active")],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const WORKFLOWS = create({
      name: "approval_workflows",
      schema: [
        text("name"), text("description"), text("document_type"), bool("active"), num("priority"),
        num("min_amount"), num("max_amount"), rel("departments", DEPARTMENTS, 99), rel("categories", CATEGORIES, 99),
        rel("branches", BRANCHES, 99), bool("allow_self_approval"), json("steps"), rel("created_by", USERS),
      ],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const APPROVALS = create({
      name: "approval_requests",
      schema: [
        text("document_type"), text("document_id"), text("document_number"), text("document_title"),
        rel("workflow", WORKFLOWS), text("workflow_name"), json("steps"), num("current_level"),
        select("status", ["pending", "approved", "rejected", "returned", "cancelled"]), num("amount"), text("currency"),
        rel("department", DEPARTMENTS), rel("requester", USERS), text("pending_approvers"), text("approver_history"),
        date("completed_at"),
      ],
      indexes: ["CREATE INDEX idx_approval_doc ON approval_requests (document_type, document_id)"],
      listRule: DOC_SCOPE, viewRule: DOC_SCOPE, createRule: null, updateRule: null, deleteRule: null,
    });

    const ACTION_SCOPE =
      'approval.requester = @request.auth.id || approval.pending_approvers ~ @request.auth.id || approval.approver_history ~ @request.auth.id || @request.auth.role.procurement_scope = "all" || (@request.auth.role.procurement_scope = "department" && approval.department = @request.auth.department)';
    create({
      name: "approval_actions",
      schema: [
        rel("approval", APPROVALS, 1, true), text("document_type"), text("document_id"), num("level"), text("step_name"),
        rel("actor", USERS), text("action"), text("comment"), rel("target_user", USERS),
      ],
      indexes: ["CREATE INDEX idx_approval_actions_doc ON approval_actions (document_type, document_id)"],
      listRule: ACTION_SCOPE, viewRule: ACTION_SCOPE, createRule: null, updateRule: null, deleteRule: null,
    });

    create({
      name: "purchase_requisitions",
      schema: [
        text("number"), text("title"), rel("requester", USERS), rel("department", DEPARTMENTS), rel("branch", BRANCHES),
        select("request_type", ["goods", "services", "assets", "subscriptions", "maintenance", "consultancy", "construction", "other"]),
        rel("category", CATEGORIES), select("priority", ["low", "medium", "high", "urgent"]), date("required_date"),
        text("delivery_location"), text("cost_center"), text("project"), rel("action_plan", id("actionPlans")),
        text("preferred_supplier"), text("justification"), text("notes"), json("items"), text("currency"),
        num("subtotal"), num("tax_total"), num("total"),
        select("status", ["draft", "pending_approval", "approved", "rejected", "returned", "cancelled", "converted_to_rfq", "converted_to_po", "completed"]),
        rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"),
        date("submitted_at"), date("approved_at"), text("cancel_reason"), files("attachments", 10), rel("created_by", USERS),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_pr_number ON purchase_requisitions (number) WHERE number != ''",
        "CREATE INDEX idx_pr_status ON purchase_requisitions (status)",
      ],
      listRule: DOC_SCOPE,
      viewRule: DOC_SCOPE,
      createRule: AUTH,
      updateRule: 'requester = @request.auth.id || @request.auth.role.procurement_scope = "all"',
      deleteRule: 'requester = @request.auth.id && status = "draft"',
    });
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of [
      "purchase_requisitions", "approval_actions", "approval_requests", "approval_workflows",
      "units_of_measure", "procurement_categories", "number_sequences", "notifications", "audit_logs",
    ]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
