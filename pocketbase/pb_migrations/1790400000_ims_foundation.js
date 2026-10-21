/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA Integrated Management System — Step 1: foundation
 *
 *  Security & administration
 *   - roles               stable `code` (SYS_ADMIN, SG, DAF, …) so rules never depend on display names
 *   - users               extra_roles (one person may hold several roles) and preferred language
 *   - user_security       2FA secret, failed logins, lockout — no API access at all (server only)
 *   - role_change_requests permission-matrix changes wait for a second administrator / the DAF
 *   - outbound_messages   e-mail / SMS log (SMS gateway can be plugged in later)
 *
 *  Approval engine
 *   - delegations         an approver on leave hands approvals to a named person for a date range
 *   - approval_limits     per role and document type; drives "SG (above limit)" steps
 *   - approval_workflows  + funding-source condition and overdue escalation hours
 *   - approval_requests   + when the current step started, who already decided, escalations
 *   - approval_actions    + on whose behalf a delegate acted
 *
 *  Master data (M1)
 *   - fiscal_years / fiscal_periods   July–June by default, periods open/closed
 *   - gl_accounts         hierarchical chart of accounts, posting / non-posting
 *   - funding_sources, projects, cost_centres
 *   - tax_rates           dated VAT / withholding rates (PAYE and RSSB stay in paye_bands /
 *                         statutory_contributions, which gain effective dates here)
 *
 * Money is stored as whole RWF (noDecimal) in every new collection.
 */
const AUTH = '@request.auth.id != ""';
const OVERSIGHT = ["SYS_ADMIN", "SG", "DAF", "INTERNAL_AUDITOR"]
  .map((c) => `@request.auth.role.code = "${c}" || @request.auth.extra_roles.code ?= "${c}"`)
  .join(" || ");

function text(name, required) {
  return { name, type: "text", required: !!required, options: { min: null, max: null, pattern: "" } };
}
function num(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } };
}
function int(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } };
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
function select(name, values, maxSelect) {
  return { name, type: "select", required: false, options: { maxSelect: maxSelect || 1, values } };
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
    const ROLES = id("roles");
    const DEPARTMENTS = id("departments");
    const create = (def) => {
      let existing = null;
      try {
        existing = dao.findCollectionByNameOrId(def.name);
      } catch (_) {}
      if (existing) return existing.id;
      const c = new Collection({ type: "base", ...def });
      dao.saveCollection(c);
      return c.id;
    };
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };

    // ---------------------------------------------------------------- roles & users
    addFields("roles", [text("code"), int("sort_order"), bool("is_system")]);
    addFields("users", [rel("extra_roles", ROLES, 20), select("language", ["en", "rw", "fr"])]);

    create({
      name: "user_security",
      schema: [
        rel("user", USERS, 1, true), text("totp_secret"), text("totp_pending_secret"), bool("totp_enabled"), date("totp_enabled_at"),
        json("recovery_codes"), int("failed_logins"), date("last_failed_at"), date("locked_until"),
        date("last_login_at"), text("last_login_ip"), date("password_changed_at"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_user_security_user ON user_security (user)"],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });

    create({
      name: "role_change_requests",
      schema: [
        rel("role", ROLES), text("role_name"), text("kind"), json("changes"), json("new_permissions"), json("meta_changes"), text("reason"),
        select("status", ["pending", "approved", "rejected", "cancelled"]), rel("requested_by", USERS), rel("decided_by", USERS),
        date("decided_at"), text("decision_comment"),
      ],
      indexes: ["CREATE INDEX idx_role_change_status ON role_change_requests (status)"],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    create({
      name: "outbound_messages",
      schema: [
        select("channel", ["email", "sms"]), text("to"), text("subject"), text("body"), select("status", ["queued", "sent", "failed", "skipped"]),
        text("error"), rel("user", USERS), text("link"), date("sent_at"),
      ],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });

    // ---------------------------------------------------------------- master data
    const FY = create({
      name: "fiscal_years",
      schema: [
        text("name", true), text("code", true), date("start_date"), date("end_date"), select("status", ["draft", "open", "closed"]),
        bool("is_current"), rel("closed_by", USERS), date("closed_at"), text("notes"), rel("created_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_fiscal_year_code ON fiscal_years (code)"],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: AUTH, deleteRule: null,
    });
    create({
      name: "fiscal_periods",
      schema: [
        rel("fiscal_year", FY, 1, true), int("number"), text("name"), text("code"), date("start_date"), date("end_date"),
        select("status", ["open", "closed"]), rel("closed_by", USERS), date("closed_at"), rel("reopened_by", USERS), date("reopened_at"),
        text("reopen_reason"), json("checklist"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_fiscal_period ON fiscal_periods (fiscal_year, number)",
        "CREATE INDEX idx_fiscal_period_dates ON fiscal_periods (start_date, end_date)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    const GL = create({
      name: "gl_accounts",
      schema: [
        text("code", true), text("name", true), select("type", ["asset", "liability", "net_assets", "revenue", "expense"]),
        text("parent"), bool("is_posting"), select("normal_balance", ["debit", "credit"]), int("level"),
        select("statement_section", [
          "current_assets", "non_current_assets", "current_liabilities", "non_current_liabilities", "net_assets",
          "revenue_exchange", "revenue_non_exchange", "expenses",
        ]),
        select("cash_flow_class", ["cash", "operating", "investing", "financing", "none"]),
        bool("is_control"), bool("active"), text("description"), rel("created_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_gl_account_code ON gl_accounts (code)", "CREATE INDEX idx_gl_account_parent ON gl_accounts (parent)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });
    // Self relation is added after the collection exists.
    {
      const c = dao.findCollectionByNameOrId("gl_accounts");
      c.schema.removeField(c.schema.getFieldByName("parent").id);
      c.schema.addField(new SchemaField(rel("parent", GL)));
      dao.saveCollection(c);
    }

    const FUNDING = create({
      name: "funding_sources",
      schema: [
        text("code", true), text("name", true),
        select("type", ["member_contributions", "government", "donor", "own_revenue", "other"]),
        text("donor_name"), text("agreement_reference"), bool("restricted"), text("currency"), date("start_date"), date("end_date"),
        int("committed_amount"), bool("active"), text("contact"), text("description"), rel("created_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_funding_code ON funding_sources (code)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });
    create({
      name: "projects",
      schema: [
        text("code", true), text("name", true), rel("funding_source", FUNDING), rel("department", DEPARTMENTS), rel("manager", USERS),
        date("start_date"), date("end_date"), select("status", ["planned", "active", "closed"]), int("budget_amount"),
        text("description"), rel("created_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_project_code ON projects (code)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });
    create({
      name: "cost_centres",
      schema: [text("code", true), text("name", true), rel("department", DEPARTMENTS), bool("active"), text("description"), rel("created_by", USERS)],
      indexes: ["CREATE UNIQUE INDEX idx_cost_centre_code ON cost_centres (code)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });

    create({
      name: "tax_rates",
      schema: [
        text("code", true), text("name", true), select("category", ["vat", "withholding", "excise", "other"]), num("rate"),
        date("effective_from"), date("effective_to"), rel("gl_account", GL), text("applies_to"), text("legal_reference"),
        bool("confirmed_by_finance"), rel("confirmed_by", USERS), date("confirmed_at"), bool("active"), text("notes"), rel("created_by", USERS),
      ],
      indexes: ["CREATE INDEX idx_tax_rate_code ON tax_rates (code, effective_from)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });
    addFields("paye_bands", [date("effective_to"), bool("confirmed_by_finance"), text("legal_reference")]);
    addFields("statutory_contributions", [date("effective_from"), date("effective_to"), bool("confirmed_by_finance"), text("legal_reference")]);

    // ---------------------------------------------------------------- approval engine
    create({
      name: "delegations",
      schema: [
        rel("delegator", USERS), rel("delegate", USERS), date("start_date"), date("end_date"), json("document_types"),
        text("reason"), bool("active"), rel("created_by", USERS), rel("cancelled_by", USERS), date("cancelled_at"),
      ],
      indexes: ["CREATE INDEX idx_delegation_lookup ON delegations (delegator, active)"],
      listRule: `delegator = @request.auth.id || delegate = @request.auth.id || ${OVERSIGHT}`,
      viewRule: `delegator = @request.auth.id || delegate = @request.auth.id || ${OVERSIGHT}`,
      createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });
    create({
      name: "approval_limits",
      schema: [rel("role", ROLES), text("document_type"), int("min_amount"), int("max_amount"), bool("active"), text("notes"), rel("created_by", USERS)],
      indexes: ["CREATE INDEX idx_approval_limit ON approval_limits (role, document_type)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });
    addFields("approval_workflows", [rel("funding_sources", FUNDING, 50), int("overdue_hours")]);
    addFields("approval_requests", [date("level_started_at"), text("decided_by"), json("escalations"), rel("funding_source", FUNDING)]);
    addFields("approval_actions", [rel("on_behalf_of", USERS)]);

    // ---------------------------------------------------------------- settings
    addFields("settings", [
      text("org_short_name"), int("fiscal_year_start_month"), int("session_timeout_minutes"), int("password_min_length"),
      int("lockout_threshold"), int("lockout_minutes"), select("require_2fa", ["none", "finance", "all"]), int("approval_overdue_hours"),
      int("budget_amber_pct"), int("budget_red_pct"), bool("notify_sms_enabled"),
    ]);

    // Automated daily backups at 02:00, keep two weeks (Admin UI → Settings → Backups to change).
    try {
      const settings = $app.settings();
      if (!settings.backups.cron) {
        settings.backups.cron = "0 2 * * *";
        settings.backups.cronMaxKeep = 14;
        dao.saveSettings(settings);
      }
    } catch (_) {}
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of [
      "approval_limits", "delegations", "tax_rates", "cost_centres", "projects", "funding_sources", "gl_accounts",
      "fiscal_periods", "fiscal_years", "outbound_messages", "role_change_requests", "user_security",
    ]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
