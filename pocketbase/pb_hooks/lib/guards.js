/// <reference path="../../pb_data/types.d.ts" />
/**
 * Write guards for configuration collections: which permission is needed to change them.
 * Reading stays governed by each collection's API rules.
 */
const core = require("./core.js");
const masterdata = require("./masterdata.js");

const RULES = Object.assign(
  {
    roles: ["access_general_settings", "manage roles and permissions"],
    departments: ["create_department", "manage departments and department heads"],
    approval_workflows: ["manage_approval_workflows", "manage approval workflows"],
    number_sequences: ["manage_procurement_settings", "change document numbering"],
    procurement_categories: ["manage_procurement_settings", "manage procurement categories"],
    units_of_measure: ["manage_procurement_settings", "manage units of measure"],
    warehouses: ["manage_inventory", "manage warehouses"],
  },
  masterdata.WRITE_PERMISSION
);

function guard(e, verb) {
  const auth = e.httpContext.get("authRecord");
  const name = e.record.collection().name;
  if (auth) {
    const rule = RULES[name];
    core.requirePermission($app.dao(), auth, rule[0], rule[1]);
  }
  // an account with postings stays in the chart for good (superusers included): it is made inactive instead
  const posted = verb === "delete" && name === "gl_accounts" ? $app.dao().findRecordsByFilter("gl_journal_lines", "account = {:a}", "", 1, 0, { a: e.record.id }) || [] : [];
  if (posted.length) {
    throw new BadRequestError(`${e.record.getString("code")} ${e.record.getString("name")} has postings in the general ledger, so it cannot be deleted. Make it inactive instead.`);
  }
  if (verb !== "delete" && masterdata.WRITE_PERMISSION[name]) masterdata.validate(e);
  if (auth && verb === "create" && e.record.collection().schema.getFieldByName("created_by") && !e.record.getString("created_by")) {
    e.record.set("created_by", auth.id);
  }
  if (verb === "update") {
    e.httpContext.set("dnrAudit", JSON.stringify(core.diff(e.record.originalCopy(), e.record)));
  }
}

function auditAfter(e, action) {
  const raw = e.httpContext.get("dnrAudit");
  const r = e.record;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"),
    action,
    collection: r.collection().name,
    recordId: r.id,
    label: [r.getString("code"), r.getString("name") || r.getString("key")].filter(Boolean).join(" "),
    changes: raw ? JSON.parse(raw) : action === "created" ? core.diff(null, r) : {},
    meta: core.requestMeta(e.httpContext),
  });
}

// ------------------------------------------------------------------ settings (one shared record)
// Each group of fields belongs to the team that owns it; anything not listed is general settings.
const SETTINGS_GROUPS = [
  [/^(leave_|leaves_per_year$|max_carryover_leaves$)/, "manage_leave_policy", "change the leave policy"],
  [/^payroll_/, "manage_payroll_settings", "change payroll settings"],
  [/^(budget_control$|budget_amber_pct$|budget_red_pct$|invoice_|duplicate_invoice_)/, "manage_finance_settings", "change finance controls"],
  [/^(receipt_over_tolerance_pct$|default_tax_rate$|default_payment_terms$|default_delivery_terms$|default_warehouse$|contract_alert_days$|notify_overdue_deliveries$|notify_email_approvals$)/, "manage_procurement_settings", "change procurement settings"],
  [/^(password_|lockout_|session_timeout_minutes$|require_2fa$)/, "manage_security_settings", "change the security policy"],
];
const SECRET_FIELDS = ["smtp_password"];

function settingsGuard(e) {
  const auth = e.httpContext.get("authRecord");
  const before = e.record.originalCopy();
  // The SMTP password is never sent to browsers; an empty value from a form means "unchanged".
  for (const f of SECRET_FIELDS) if (!e.record.getString(f)) e.record.set(f, before.getString(f));
  const changes = core.diff(before, e.record);
  if (auth) {
    const dao = $app.dao();
    for (const field of Object.keys(changes)) {
      const group = SETTINGS_GROUPS.find((g) => g[0].test(field));
      if (group) core.requirePermission(dao, auth, group[1], group[2]);
      else core.requirePermission(dao, auth, "access_general_settings", `change "${field.replace(/_/g, " ")}"`);
    }
  }
  for (const f of SECRET_FIELDS) if (changes[f]) changes[f] = { old: "••••", new: "•••• (changed)" };
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function settingsAudit(e) {
  const raw = e.httpContext.get("dnrAudit");
  const changes = raw ? JSON.parse(raw) : {};
  if (!Object.keys(changes).length) return;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "updated", collection: "settings", recordId: e.record.id,
    label: "System settings", changes, meta: core.requestMeta(e.httpContext),
  });
}

function hideSecrets(record) {
  for (const f of SECRET_FIELDS) if (record && record.getString(f)) record.set(f, "");
}

module.exports = { RULES, guard, auditAfter, settingsGuard, settingsAudit, hideSecrets, SECRET_FIELDS };
