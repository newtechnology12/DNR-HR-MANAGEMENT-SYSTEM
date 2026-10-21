/// <reference path="../pb_data/types.d.ts" />
/**
 * Server-side permission enforcement.
 *
 * The React app hides screens a role cannot use, but that is only cosmetic. These hooks make
 * the API itself refuse the request, so calling PocketBase directly cannot bypass a role.
 * PocketBase superusers (the Admin UI) are not affected.
 */

// ------------------------------------------------------------------ users
// Anyone may edit their own contact details. Changing someone else, or any HR-controlled field
// (role, salary, status, placement), needs "update_employee"; changing a role needs
// "access_general_settings" — so nobody can promote themselves.
onRecordBeforeUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const auth = e.httpContext.get("authRecord");
  if (!auth) return; // superuser
  const dao = $app.dao();
  const before = e.record.originalCopy();
  const HR_FIELDS = ["role", "extra_roles", "salary", "status", "department", "designation", "branch", "employment_type", "joined_at"];
  const changed = Object.keys(core.diff(before, e.record, HR_FIELDS));

  if (e.record.id !== auth.id) {
    core.requirePermission(dao, auth, "update_employee", "edit other employees");
  } else if (changed.length) {
    core.requirePermission(dao, auth, "update_employee", `change your own ${changed.join(", ")}`);
  }
  if (changed.indexOf("role") !== -1 || changed.indexOf("extra_roles") !== -1) {
    core.requirePermission(dao, auth, "access_general_settings", "change an employee's roles");
  }
  if (changed.length) {
    e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, e.record, HR_FIELDS)));
  }
}, "users");

onRecordAfterUpdateRequest((e) => {
  const raw = e.httpContext.get("dnrAudit");
  if (!raw) return;
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "updated", collection: "users", recordId: e.record.id,
    label: e.record.getString("name"), changes: JSON.parse(raw), meta: core.requestMeta(e.httpContext),
  });
}, "users");

onRecordBeforeCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const auth = e.httpContext.get("authRecord");
  if (!auth) return; // superuser, or public sign-up if ever enabled by the collection rule
  core.requirePermission($app.dao(), auth, "create_employee", "create employees");
  if (e.record.getString("role") || (e.record.getStringSlice("extra_roles") || []).length) {
    core.requirePermission($app.dao(), auth, "access_general_settings", "assign a role");
  }
}, "users");

// ------------------------------------------------------------------ settings-type collections
// Collections only certain roles may change (see lib/guards.js for the permission map).
const GUARDED = [
  "roles", "departments", "warehouses", "approval_workflows", "number_sequences", "procurement_categories", "units_of_measure",
  "gl_accounts", "cost_centres", "funding_sources", "projects", "tax_rates", "fiscal_years", "approval_limits",
];
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/guards.js`).guard(e, "create"), ...GUARDED);
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/guards.js`).guard(e, "update"), ...GUARDED);
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/guards.js`).guard(e, "delete"), ...GUARDED);
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/guards.js`).auditAfter(e, "created"), ...GUARDED);
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/guards.js`).auditAfter(e, "updated"), ...GUARDED);
onRecordAfterDeleteRequest((e) => require(`${__hooks}/lib/guards.js`).auditAfter(e, "deleted"), ...GUARDED);

// ------------------------------------------------------------------ notifications
// Users may only mark their own notifications as read.
onRecordBeforeUpdateRequest((e) => {
  const before = e.record.originalCopy();
  for (const f of ["user", "title", "body", "link", "type"]) e.record.set(f, before.get(f));
  e.record.set("read_at", e.record.getBool("read") ? new Date().toISOString() : "");
}, "notifications");

// ------------------------------------------------------------------ audit log API
// GET /api/dnr/audit?collection=purchase_requisitions&record=<id>
//   → history of one record, if the caller is allowed to view that record
// GET /api/dnr/audit            → global log, requires "view_audit_logs"
routerAdd(
  "GET",
  "/api/dnr/audit",
  (c) => {
    const core = require(`${__hooks}/lib/core.js`);
    const info = $apis.requestInfo(c);
    const auth = info.authRecord;
    const dao = $app.dao();
    const collection = c.queryParam("collection");
    const recordId = c.queryParam("record");
    const page = Math.max(parseInt(c.queryParam("page") || "1", 10), 1);
    const perPage = Math.min(Math.max(parseInt(c.queryParam("perPage") || "50", 10), 1), 1000);

    let filter = "";
    const params = {};
    if (collection && recordId) {
      let record;
      try {
        record = dao.findRecordById(collection, recordId);
      } catch (_) {
        throw new NotFoundError("Record not found.");
      }
      const rule = record.collection().viewRule;
      const canView = info.admin || core.can(dao, auth, "view_audit_logs") || (rule !== null && rule !== undefined && dao.canAccessRecord(record, info, rule));
      if (!canView) throw new ForbiddenError("You cannot view the history of this record.");
      filter = "collection_name = {:c} && record_id = {:r}";
      params.c = collection;
      params.r = recordId;
    } else {
      if (!info.admin) core.requirePermission(dao, auth, "view_audit_logs", "view the audit log");
      const q = (c.queryParam("q") || "").trim();
      const parts = [];
      if (collection) {
        parts.push("collection_name = {:c}");
        params.c = collection;
      }
      const actor = (c.queryParam("actor") || "").trim();
      if (actor) {
        parts.push("actor = {:actor}");
        params.actor = actor;
      }
      const action = (c.queryParam("action") || "").trim();
      if (action) {
        parts.push("action ~ {:action}");
        params.action = action;
      }
      const from = (c.queryParam("from") || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        parts.push("created >= {:from}");
        params.from = `${from} 00:00:00.000Z`;
      }
      const to = (c.queryParam("to") || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        parts.push("created <= {:to}");
        params.to = `${to} 23:59:59.999Z`;
      }
      if (q) {
        parts.push("(record_label ~ {:q} || actor_name ~ {:q} || action ~ {:q} || comment ~ {:q})");
        params.q = q;
      }
      filter = parts.join(" && ") || "id != ''";
    }

    const rows = dao.findRecordsByFilter("audit_logs", filter, "-created", perPage + 1, (page - 1) * perPage, params) || [];
    const items = rows.slice(0, perPage).map((r) => ({
      id: r.id,
      created: r.getString("created"),
      actor: r.getString("actor"),
      actor_name: r.getString("actor_name"),
      action: r.getString("action"),
      collection_name: r.getString("collection_name"),
      record_id: r.getString("record_id"),
      record_label: r.getString("record_label"),
      changes: core.parseJson(r, "changes", {}),
      comment: r.getString("comment"),
      ip: info.admin || core.can(dao, auth, "view_audit_logs") ? r.getString("ip") : "",
    }));
    return c.json(200, { page, perPage, hasMore: rows.length > perPage, items });
  },
  $apis.requireAdminOrRecordAuth()
);
