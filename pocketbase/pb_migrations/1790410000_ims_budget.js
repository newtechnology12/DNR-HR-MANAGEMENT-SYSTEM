/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 2: budgeting and budget control (M2)
 *
 *  - budgets               budget documents per fiscal year (prepared by the Budget Officer, approved
 *                          Budget Officer → DAF → SG). The previous department-level table is kept as
 *                          budgets_legacy (read-only history).
 *  - budget_lines          the control unit: account × department × funding source × project (× cost
 *                          centre), original and revised amount, monthly phasing
 *  - budget_revisions      supplementary / reduction / virement / re-phasing, approved like budgets
 *  - budget_ledger         commitments and actuals per line (server-written only):
 *                          available = revised budget − open commitments − actuals
 *  - budget_overrides      DAF override of an insufficient balance (reason required, flagged in reports)
 *  - requisitions, POs and supplier invoices carry their budget line and funding source
 *  - procurement categories get a default GL account (used to pick budget lines and, later, postings)
 *
 * Money is whole RWF (noDecimal).
 */
const AUTH = '@request.auth.id != ""';

function text(name, required) {
  return { name, type: "text", required: !!required, options: { min: null, max: null, pattern: "" } };
}
function int(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } };
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

const WORKFLOW_STATUS = ["draft", "pending_approval", "approved", "rejected", "returned", "cancelled", "closed"];

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (name) => dao.findCollectionByNameOrId(name).id;
    const exists = (name) => {
      try {
        dao.findCollectionByNameOrId(name);
        return true;
      } catch (_) {
        return false;
      }
    };
    const create = (def) => {
      if (exists(def.name)) return id(def.name);
      const c = new Collection({ type: "base", ...def });
      dao.saveCollection(c);
      return c.id;
    };
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };

    // The old department / calendar-year budgets become history.
    if (exists("budgets") && dao.findCollectionByNameOrId("budgets").schema.getFieldByName("amount")) {
      const old = dao.findCollectionByNameOrId("budgets");
      old.indexes = []; // index SQL names the table; the new "budgets" collection reuses that name
      dao.saveCollection(old);
      old.name = "budgets_legacy";
      old.createRule = null;
      old.updateRule = null;
      old.deleteRule = null;
      dao.saveCollection(old);
    }

    const USERS = id("users");
    const FY = id("fiscal_years");
    const PERIODS = id("fiscal_periods");
    const GL = id("gl_accounts");
    const DEPT = id("departments");
    const FUND = id("funding_sources");
    const PROJ = id("projects");
    const CC = id("cost_centres");
    const APPROVALS = id("approval_requests");

    const BUDGETS = create({
      name: "budgets",
      schema: [
        text("number"), text("name", true), rel("fiscal_year", FY), rel("department", DEPT), text("description"),
        select("status", WORKFLOW_STATUS), int("total"), int("line_count"), rel("prepared_by", USERS),
        rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"), date("submitted_at"), date("approved_at"),
        text("cancel_reason"), files("attachments", 10), text("notes"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_budget_number ON budgets (number) WHERE number != ''"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const LINES = create({
      name: "budget_lines",
      schema: [
        rel("budget", BUDGETS, 1, true), rel("fiscal_year", FY), text("code", true), text("name"),
        select("kind", ["expense", "capital", "revenue"]), rel("gl_account", GL), rel("department", DEPT), rel("funding_source", FUND),
        rel("project", PROJ), rel("cost_centre", CC), int("original_amount"), int("revised_amount"), json("phasing"),
        select("status", ["draft", "active", "closed"]), text("notes"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_budget_line_code ON budget_lines (budget, code)",
        "CREATE INDEX idx_budget_line_lookup ON budget_lines (fiscal_year, status, department)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    create({
      name: "budget_revisions",
      schema: [
        text("number"), rel("fiscal_year", FY), select("type", ["supplementary", "reduction", "virement", "rephasing"]), text("title", true),
        text("reason"), json("lines"), int("total_increase"), int("total_decrease"), int("net_change"), rel("department", DEPT),
        select("status", WORKFLOW_STATUS), rel("prepared_by", USERS), rel("approval", APPROVALS), text("pending_approvers"),
        text("approver_history"), date("submitted_at"), date("approved_at"), date("applied_at"), text("cancel_reason"), files("attachments", 10),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_budget_revision_number ON budget_revisions (number) WHERE number != ''"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const OVERRIDES = create({
      name: "budget_overrides",
      schema: [
        text("document_type"), text("document_id"), text("document_number"), rel("budget_line", LINES), int("amount_requested"),
        int("available"), int("shortfall"), text("reason"), rel("approved_by", USERS), select("status", ["active", "used", "cancelled"]), date("used_at"),
      ],
      indexes: ["CREATE INDEX idx_budget_override_doc ON budget_overrides (document_type, document_id)"],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    create({
      name: "budget_ledger",
      schema: [
        rel("budget_line", LINES), rel("fiscal_year", FY), rel("period", PERIODS), date("date"),
        select("type", ["commitment", "commitment_release", "actual", "actual_reversal"]), int("amount"),
        text("source_type"), text("source_id"), text("source_number"), text("description"),
        rel("department", DEPT), rel("funding_source", FUND), rel("project", PROJ), rel("gl_account", GL), rel("override", OVERRIDES), rel("created_by", USERS),
      ],
      indexes: [
        "CREATE INDEX idx_budget_ledger_line ON budget_ledger (budget_line, type)",
        "CREATE INDEX idx_budget_ledger_source ON budget_ledger (source_type, source_id)",
        "CREATE INDEX idx_budget_ledger_period ON budget_ledger (fiscal_year, period)",
      ],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });

    addFields("purchase_requisitions", [rel("budget_line", LINES), rel("funding_source", FUND), rel("budget_override", OVERRIDES), json("budget_check")]);
    addFields("purchase_orders", [rel("budget_line", LINES), rel("funding_source", FUND), int("committed_amount"), rel("budget_override", OVERRIDES)]);
    addFields("supplier_invoices", [rel("budget_line", LINES), rel("funding_source", FUND), int("actual_amount"), int("commitment_released")]);
    addFields("procurement_categories", [rel("expense_account", GL)]);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["budget_ledger", "budget_overrides", "budget_revisions", "budget_lines", "budgets"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
    try {
      const old = dao.findCollectionByNameOrId("budgets_legacy");
      old.name = "budgets";
      dao.saveCollection(old);
    } catch (_) {}
  }
);
