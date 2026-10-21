/// <reference path="../../pb_data/types.d.ts" />
/**
 * Shared server-side helpers: permissions, audit trail, notifications, numbering.
 *
 * PocketBase runs every hook handler in an isolated context, so handlers load this
 * module with `require(`${__hooks}/lib/core.js`)` instead of sharing top-level code.
 */

/** The person's main role followed by any extra roles (one person may hold several roles). */
function rolesOf(dao, authRecord) {
  if (!authRecord) return [];
  const ids = [authRecord.getString("role")].concat(authRecord.getStringSlice("extra_roles") || []);
  const out = [];
  const seen = {};
  for (const roleId of ids) {
    if (!roleId || seen[roleId]) continue;
    seen[roleId] = true;
    try {
      out.push(dao.findRecordById("roles", roleId));
    } catch (_) {}
  }
  return out;
}

/** Stable role codes (SYS_ADMIN, SG, DAF, …) held by the person. */
function roleCodes(dao, authRecord) {
  return rolesOf(dao, authRecord)
    .map((r) => r.getString("code"))
    .filter(Boolean);
}

function hasRole(dao, authRecord, code) {
  return roleCodes(dao, authRecord).indexOf(code) !== -1;
}

const SCOPE_RANK = { own: 0, department: 1, all: 2 };

/**
 * Permission names are the same strings stored in roles.permitions (catalogue: src/lib/permission-catalog.json).
 * A person's permissions are the union of all their roles; the widest visibility scope wins.
 */
function permissionsOf(dao, authRecord) {
  const out = {};
  let scope = "own";
  for (const role of rolesOf(dao, authRecord)) {
    for (const p of parseJson(role, "permitions", [])) {
      if (p && p.name && p.access === true) out[p.name] = true;
    }
    const s = role.getString("procurement_scope") || "own";
    if (SCOPE_RANK[s] > SCOPE_RANK[scope]) scope = s;
  }
  out.__scope = scope;
  return out;
}

function can(dao, authRecord, permission) {
  return !!permissionsOf(dao, authRecord)[permission];
}

/** Throws a 403 with a message that says exactly what is missing. */
function requirePermission(dao, authRecord, permission, what) {
  if (!authRecord) throw new UnauthorizedError("Please sign in again.");
  if (!can(dao, authRecord, permission)) {
    throw new ForbiddenError(
      `You don't have permission to ${what || "do this"}. Ask an administrator to grant "${permission}" to your role.`
    );
  }
}

function parseJson(record, key, fallback) {
  const raw = record.get(key);
  if (raw === null || raw === undefined) return fallback;
  try {
    const s = typeof raw === "string" ? raw : record.getString(key);
    if (!s || s === "null") return fallback;
    const v = JSON.parse(s);
    return v === null || v === undefined ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function requestMeta(c) {
  if (!c) return { ip: "", userAgent: "" };
  let ip = "";
  let userAgent = "";
  try {
    ip = c.realIP();
  } catch (_) {}
  try {
    userAgent = c.request().header.get("User-Agent") || "";
  } catch (_) {}
  return { ip, userAgent };
}

/** Field-level diff between the stored record and the incoming one. */
function diff(before, after, fields) {
  const changes = {};
  for (const f of fields || fieldNames(after)) {
    const a = before ? plainValue(before, f) : null;
    const b = plainValue(after, f);
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[f] = { old: a, new: b };
  }
  return changes;
}

function fieldNames(record) {
  return record
    .collection()
    .schema.fields()
    .map((f) => f.name);
}

/** Plain JS value for any field type (JSON fields come back from Go as raw bytes). */
function plainValue(record, f) {
  const field = record.collection().schema.getFieldByName(f);
  const type = field ? field.type : "";
  if (type === "json") return parseJson(record, f, null);
  if (type === "number") return record.getFloat(f);
  if (type === "bool") return record.getBool(f);
  if (type === "relation" || type === "select" || type === "file") {
    const multi = field.options && field.options.maxSelect > 1;
    return multi ? record.getStringSlice(f) : record.getString(f);
  }
  return record.getString(f);
}

/** Audit entries are written with the DAO directly, so no API rule can block or forge them. */
function audit(dao, entry) {
  const col = dao.findCollectionByNameOrId("audit_logs");
  const r = new Record(col);
  r.set("actor", entry.actor ? entry.actor.id : "");
  r.set("actor_name", entry.actor ? entry.actor.getString("name") || entry.actor.getString("email") : entry.actorName || "system");
  r.set("action", entry.action);
  r.set("collection_name", entry.collection || "");
  r.set("record_id", entry.recordId || "");
  r.set("record_label", entry.label || "");
  r.set("changes", entry.changes || {});
  r.set("comment", entry.comment || "");
  r.set("ip", (entry.meta && entry.meta.ip) || "");
  r.set("user_agent", ((entry.meta && entry.meta.userAgent) || "").slice(0, 300));
  dao.saveRecord(r);
}

/**
 * In-app notification for each user. Approval-type notifications are also e-mailed when SMTP is
 * configured; every e-mail / SMS attempt is logged in outbound_messages (SMS gateway can be plugged in).
 */
function notify(dao, userIds, n) {
  const col = dao.findCollectionByNameOrId("notifications");
  const seen = {};
  for (const uid of userIds || []) {
    if (!uid || seen[uid]) continue;
    seen[uid] = true;
    const r = new Record(col);
    r.set("user", uid);
    r.set("title", n.title);
    r.set("body", n.body || "");
    r.set("link", n.link || "");
    r.set("type", n.type || "info");
    r.set("read", false);
    dao.saveRecord(r);
    if (n.type === "approval" || n.email) {
      try {
        sendEmail(dao, uid, n);
      } catch (_) {}
    }
  }
}

function sendEmail(dao, userId, n) {
  let user;
  try {
    user = dao.findRecordById("users", userId);
  } catch (_) {
    return;
  }
  if (!user.getString("email")) return;
  // Template, delivery and the outbound_messages log live in lib/mail.js.
  require("./mail.js").send(dao, { to: user.getString("email"), subject: n.title, body: n.body || "", link: n.link || "", userId: user.id });
}

function escapeHtml(s) {
  return String(s).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}

const DEFAULT_SEQUENCES = {
  purchase_requisition: { name: "Purchase requisition", prefix: "PR" },
  rfq: { name: "Request for quotation", prefix: "RFQ" },
  quotation: { name: "Supplier quotation", prefix: "QUO" },
  purchase_order: { name: "Purchase order", prefix: "PO" },
  goods_receipt: { name: "Goods receipt", prefix: "GRN" },
  contract: { name: "Contract", prefix: "CON" },
  supplier: { name: "Supplier", prefix: "SUP", include_year: false },
  asset: { name: "Asset", prefix: "AST" },
  inventory_item: { name: "Inventory item", prefix: "ITM", include_year: false },
  invoice: { name: "Supplier invoice", prefix: "INV" },
  payment: { name: "Payment", prefix: "PAY" },
  purchase_return: { name: "Purchase return", prefix: "RET" },
  procurement_plan: { name: "Procurement plan", prefix: "PLN" },
  budget: { name: "Budget", prefix: "BUD" },
  budget_revision: { name: "Budget revision", prefix: "BRV" },
  payment_voucher: { name: "Payment voucher", prefix: "PV" },
  journal_entry: { name: "Journal entry", prefix: "JV" },
  receipt: { name: "Cash / bank receipt", prefix: "RCT" },
  bank_transfer: { name: "Inter-account transfer", prefix: "TRF" },
  bank_reconciliation: { name: "Bank reconciliation", prefix: "REC" },
  bank_statement: { name: "Bank statement import", prefix: "STM" },
  work_plan: { name: "Work plan", prefix: "WP" },
  attendance_correction: { name: "Attendance correction", prefix: "ATC" },
  staff_loan: { name: "Staff loan", prefix: "LN" },
  asset_transfer: { name: "Asset transfer", prefix: "ATR" },
  asset_disposal: { name: "Asset disposal", prefix: "DSP" },
  depreciation_run: { name: "Depreciation run", prefix: "DEP" },
  role_change: { name: "Permission change", prefix: "PCR" },
  supplier_bank_change: { name: "Supplier bank details change", prefix: "BCH" },
};

/**
 * Next document number for a sequence key, e.g. PR-2026-000001.
 * Must be called inside a transaction (txDao) so two requests never get the same number.
 */
function nextNumber(dao, key) {
  let seq;
  try {
    seq = dao.findFirstRecordByFilter("number_sequences", "key = {:key}", { key });
  } catch (_) {
    const d = DEFAULT_SEQUENCES[key] || { name: key, prefix: key.toUpperCase() };
    seq = new Record(dao.findCollectionByNameOrId("number_sequences"));
    seq.set("key", key);
    seq.set("name", d.name);
    seq.set("prefix", d.prefix);
    seq.set("include_year", d.include_year !== false);
    seq.set("padding", 6);
    seq.set("separator", "-");
    seq.set("next_value", 1);
    seq.set("current_year", new Date().getFullYear());
  }
  const year = new Date().getFullYear();
  const includeYear = seq.getBool("include_year");
  let value = seq.getInt("next_value") || 1;
  if (includeYear && seq.getInt("current_year") !== year) value = 1; // restart each fiscal year
  const sep = seq.getString("separator") || "-";
  const padding = seq.getInt("padding") || 6;
  const parts = [seq.getString("prefix")];
  if (includeYear) parts.push(String(year));
  parts.push(String(value).padStart(padding, "0"));
  seq.set("next_value", value + 1);
  seq.set("current_year", year);
  dao.saveRecord(seq);
  return parts.filter(Boolean).join(sep);
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatMoney(n, currency) {
  return `${currency || "RWF"} ${Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

module.exports = {
  rolesOf,
  roleCodes,
  hasRole,
  permissionsOf,
  can,
  requirePermission,
  parseJson,
  requestMeta,
  diff,
  plainValue,
  audit,
  notify,
  nextNumber,
  money,
  formatMoney,
};
