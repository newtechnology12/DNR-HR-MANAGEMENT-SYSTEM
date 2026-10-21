/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 7: fixed assets and depreciation (M7).
 *
 *  - assets_categories        + code, depreciation method, useful life, rate, residual %, capitalisation threshold and
 *                               the GL accounts (cost, accumulated depreciation, depreciation expense)
 *  - assets                   + the fixed asset register: description, location, funding source, project, invoice,
 *                               depreciation start, residual value, accumulated depreciation, net book value, condition,
 *                               capitalisation (journal) and disposal. Written by the server only (lib/assets.js).
 *  - asset_movements          transfers between departments (approved), custodian / location changes, status changes
 *  - asset_maintenance        maintenance log
 *  - asset_disposals          disposals approved Store & Asset Officer → DAF → SG, posted to the GL
 *  - depreciation_runs        monthly run: the Accountant calculates, the DAF approves, posted to the GL
 *  - depreciation_lines       one line per asset per run (depreciation history)
 *  - asset_verifications      periodic counts (found / missing / damaged) and reconciliation with the GL
 *  - asset_verification_lines
 *
 * Read access: the asset register permissions, a department head for their department, a custodian for what they hold.
 */
const ME = "@request.auth.id";
const AUTH = '@request.auth.id != ""';
const or = (...parts) => parts.map((p) => `(${p})`).join(" || ");
// LIKE pattern for one granted entry ("_" stands for a double quote; see 1790430000_ims_privacy.js).
const grant = (p) => `'%_access_:true,_name_:_${p}_,_title_%'`;
const perm = (p) => `@request.auth.role.permitions ~ ${grant(p)} || @request.auth.extra_roles.permitions ?~ ${grant(p)}`;
const anyPerm = (...ps) => or(...ps.map(perm));
const DEPT_SCOPE = '(@request.auth.role.hr_scope = "department" || @request.auth.extra_roles.hr_scope ?= "department") && @request.auth.department != ""';
const REGISTER = anyPerm(
  "view_fixed_assets", "manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation",
  "view_asset_reports", "export_assets", "view_assets"
);
const FINANCE = anyPerm("manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation", "view_fixed_assets", "export_assets");

const text = (name, required, max) => ({ name, type: "text", required: !!required, options: { min: null, max: max || null, pattern: "" } });
const int = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } });
const num = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const files = (name, maxSelect) => ({ name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } });
const rel = (name, collectionId, cascadeDelete) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: !!cascadeDelete, minSelect: null, maxSelect: 1, displayFields: null } });

const ENGINE = (APPROVALS) => [rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"), date("submitted_at"), date("approved_at")];

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (n) => dao.findCollectionByNameOrId(n).id;
    const has = (n) => {
      try {
        dao.findCollectionByNameOrId(n);
        return true;
      } catch (_) {
        return false;
      }
    };
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };
    const USERS = id("users");
    const GL = id("gl_accounts");
    const DEPT = id("departments");
    const FUND = id("funding_sources");
    const PROJ = id("projects");
    const PERIODS = id("fiscal_periods");
    const FY = id("fiscal_years");
    const APPROVALS = id("approval_requests");
    const SUPPLIERS = id("suppliers");
    const INVOICES = id("supplier_invoices");
    const JOURNALS = id("gl_journals");
    const CATS = id("assets_categories");
    const ASSETS = id("assets");

    // ---- categories: depreciation policy and GL accounts (changed by the DAF)
    addFields("assets_categories", [
      text("code", false, 20), select("method", ["straight_line", "reducing_balance", "none"]), int("useful_life_months"), num("rate"),
      num("residual_percent"), int("capitalisation_threshold"), rel("asset_account", GL), rel("accumulated_account", GL), rel("expense_account", GL),
      bool("active"), int("sort"),
    ]);
    const cats = dao.findCollectionByNameOrId("assets_categories");
    cats.listRule = AUTH;
    cats.viewRule = AUTH;
    cats.createRule = AUTH; // the masterdata guard requires approve_fixed_assets
    cats.updateRule = AUTH;
    cats.deleteRule = null;
    dao.saveCollection(cats);

    // ---- the register
    addFields("assets", [
      text("description", false, 1000), text("location_name", false, 160), rel("funding_source", FUND), rel("project", PROJ), rel("invoice", INVOICES),
      date("depreciation_start"), int("residual_value"), int("useful_life_months"), select("method", ["straight_line", "reducing_balance", "none"]),
      int("opening_accumulated"), int("accumulated_depreciation"), int("net_book_value"), text("last_depreciated", false, 7),
      bool("capitalised"), date("capitalised_at"), rel("capitalised_by", USERS), rel("capitalisation_journal", JOURNALS),
      select("acquisition_type", ["purchase", "donation", "opening_balance", "transfer_in"]),
      select("condition", ["new", "good", "fair", "poor", "damaged"]), date("disposed_at"), date("last_verified"), text("last_verification_result", false, 30),
    ]);
    const assets = dao.findCollectionByNameOrId("assets");
    const ASSET_READ = or(`assigned_to = ${ME}`, `${DEPT_SCOPE} && department = @request.auth.department`, REGISTER);
    assets.listRule = ASSET_READ;
    assets.viewRule = ASSET_READ;
    assets.createRule = null;
    assets.updateRule = null;
    assets.deleteRule = null;
    dao.saveCollection(assets);

    // ---- equipment requests: staff ask for a type of equipment; the Store & Asset Officer gives a specific asset
    addFields("assets_requests", [rel("asset_type", id("assets_types")), date("decided_at"), text("decision_comment", false, 500)]);

    // ---- movements, maintenance
    if (!has("asset_movements")) {
      dao.saveCollection(new Collection({
        type: "base", name: "asset_movements",
        schema: [
          text("number"), rel("asset", ASSETS, true), select("kind", ["transfer", "assignment", "status_change", "verification"]),
          rel("from_department", DEPT), rel("to_department", DEPT), rel("from_custodian", USERS), rel("to_custodian", USERS),
          text("from_location", false, 160), text("to_location", false, 160), text("from_status", false, 30), text("to_status", false, 30),
          text("reason", false, 1000), date("effective_date"), select("status", ["draft", "pending_approval", "returned", "approved", "rejected", "cancelled"]),
          rel("requested_by", USERS), text("decision_comment", false, 1000), text("cancel_reason", false, 500), files("attachments", 5), ...ENGINE(APPROVALS),
        ],
        indexes: ["CREATE INDEX idx_asset_movements_asset ON asset_movements (asset, created)"],
        listRule: or(`requested_by = ${ME}`, `${DEPT_SCOPE} && (from_department = @request.auth.department || to_department = @request.auth.department)`, FINANCE, `pending_approvers ~ ${ME}`),
        viewRule: or(`requested_by = ${ME}`, `${DEPT_SCOPE} && (from_department = @request.auth.department || to_department = @request.auth.department)`, FINANCE, `pending_approvers ~ ${ME}`, `approver_history ~ ${ME}`),
        createRule: null, updateRule: null, deleteRule: null,
      }));
    }
    if (!has("asset_maintenance")) {
      dao.saveCollection(new Collection({
        type: "base", name: "asset_maintenance",
        schema: [
          rel("asset", ASSETS, true), date("date"), select("kind", ["service", "repair", "inspection", "upgrade", "insurance", "other"]), text("description", true, 1000),
          rel("supplier", SUPPLIERS), text("provider", false, 160), int("cost"), int("downtime_days"), date("next_due"), rel("recorded_by", USERS), files("attachments", 5),
        ],
        indexes: ["CREATE INDEX idx_asset_maintenance_asset ON asset_maintenance (asset, date)"],
        listRule: FINANCE, viewRule: FINANCE, createRule: null, updateRule: null, deleteRule: null,
      }));
    }

    // ---- disposals
    if (!has("asset_disposals")) {
      dao.saveCollection(new Collection({
        type: "base", name: "asset_disposals",
        schema: [
          text("number"), rel("asset", ASSETS), select("method", ["sale", "auction", "donation", "scrap", "write_off", "theft_loss", "transfer_out"]),
          text("reason", true, 1000), date("disposal_date"), int("proceeds"), text("buyer", false, 200), int("cost"), int("accumulated"), int("net_book_value"),
          int("gain_loss"), select("status", ["draft", "pending_approval", "returned", "approved", "rejected", "cancelled"]), rel("prepared_by", USERS),
          rel("journal", JOURNALS), text("cancel_reason", false, 500), files("attachments", 10), ...ENGINE(APPROVALS),
        ],
        indexes: ["CREATE UNIQUE INDEX idx_asset_disposal_number ON asset_disposals (number) WHERE number != ''", "CREATE INDEX idx_asset_disposal_asset ON asset_disposals (asset, status)"],
        listRule: or(FINANCE, `pending_approvers ~ ${ME}`, `approver_history ~ ${ME}`), viewRule: or(FINANCE, `pending_approvers ~ ${ME}`, `approver_history ~ ${ME}`),
        createRule: null, updateRule: null, deleteRule: null,
      }));
      addFields("assets", [rel("disposal", id("asset_disposals"))]);
    }

    // ---- depreciation
    if (!has("depreciation_runs")) {
      dao.saveCollection(new Collection({
        type: "base", name: "depreciation_runs",
        schema: [
          text("number"), int("year"), int("month"), text("period_label"), rel("period", PERIODS), rel("fiscal_year", FY),
          select("status", ["draft", "pending_approval", "returned", "approved", "rejected", "cancelled"]), int("total"), int("asset_count"), json("by_category"),
          rel("prepared_by", USERS), date("computed_at"), rel("journal", JOURNALS), date("posted_at"), text("notes", false, 1000), text("cancel_reason", false, 500),
          ...ENGINE(APPROVALS),
        ],
        indexes: ["CREATE INDEX idx_depreciation_run_month ON depreciation_runs (year, month, status)"],
        listRule: or(FINANCE, `pending_approvers ~ ${ME}`), viewRule: or(FINANCE, `pending_approvers ~ ${ME}`, `approver_history ~ ${ME}`),
        createRule: null, updateRule: null, deleteRule: null,
      }));
    }
    if (!has("depreciation_lines")) {
      dao.saveCollection(new Collection({
        type: "base", name: "depreciation_lines",
        schema: [
          rel("run", id("depreciation_runs"), true), rel("asset", ASSETS), rel("category", CATS), rel("department", DEPT), rel("funding_source", FUND), rel("project", PROJ),
          text("method"), int("cost"), int("residual_value"), int("accumulated_before"), int("charge"), int("accumulated_after"), int("net_book_value"),
          int("year"), int("month"), text("status"),
        ],
        indexes: ["CREATE INDEX idx_depreciation_lines_run ON depreciation_lines (run)", "CREATE INDEX idx_depreciation_lines_asset ON depreciation_lines (asset, year, month)"],
        listRule: FINANCE, viewRule: FINANCE, createRule: null, updateRule: null, deleteRule: null,
      }));
    }

    // ---- verification
    if (!has("asset_verifications")) {
      dao.saveCollection(new Collection({
        type: "base", name: "asset_verifications",
        schema: [
          text("number"), text("title", true, 200), date("as_of"), rel("department", DEPT), text("location", false, 160),
          select("status", ["open", "completed", "cancelled"]), rel("started_by", USERS), rel("completed_by", USERS), date("completed_at"),
          json("summary"), json("reconciliation"), text("notes", false, 2000), files("attachments", 10),
        ],
        listRule: FINANCE, viewRule: FINANCE, createRule: null, updateRule: null, deleteRule: null,
      }));
    }
    if (!has("asset_verification_lines")) {
      dao.saveCollection(new Collection({
        type: "base", name: "asset_verification_lines",
        schema: [
          rel("verification", id("asset_verifications"), true), rel("asset", ASSETS), text("expected_location", false, 160), rel("expected_custodian", USERS),
          rel("expected_department", DEPT), select("result", ["pending", "found", "missing", "damaged", "found_elsewhere"]),
          select("condition", ["new", "good", "fair", "poor", "damaged"]), text("found_location", false, 160), text("notes", false, 500),
          rel("checked_by", USERS), date("checked_at"),
        ],
        indexes: ["CREATE INDEX idx_asset_verification_lines ON asset_verification_lines (verification, result)"],
        listRule: FINANCE, viewRule: FINANCE, createRule: null, updateRule: null, deleteRule: null,
      }));
    }
  },
  (db) => {
    const dao = new Dao(db);
    for (const n of ["asset_verification_lines", "asset_verifications", "depreciation_lines", "depreciation_runs", "asset_disposals", "asset_maintenance", "asset_movements"]) {
      try {
        if (n === "asset_disposals") {
          const a = dao.findCollectionByNameOrId("assets");
          const f = a.schema.getFieldByName("disposal");
          if (f) {
            a.schema.removeField(f.id);
            dao.saveCollection(a);
          }
        }
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  }
);
