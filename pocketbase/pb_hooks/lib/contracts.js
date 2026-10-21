/// <reference path="../../pb_data/types.d.ts" />
/**
 * Procurement contracts: draft → approval (engine, "contract") → active → expired / terminated.
 * Utilisation = value of purchase orders raised against the contract (approved or later).
 * A PO cannot exceed the remaining contract value, fall outside the contract period, or use another supplier.
 */
const core = require("./core.js");

const COUNTING = ["pending_approval", "approved", "sent", "acknowledged", "partially_received", "fully_received", "partially_invoiced", "fully_invoiced", "completed", "closed"];
const TERMS = ["supplier", "value", "start_date", "end_date", "contract_type", "currency", "payment_terms", "items", "scope", "department"];

function load(dao, id) {
  try {
    return dao.findRecordById("contracts", id);
  } catch (_) {
    throw new NotFoundError("Contract not found.");
  }
}
const day = (s) => String(s || "").slice(0, 10);

function utilisation(dao, contractId, excludePoId) {
  let used = 0;
  let orders = 0;
  for (const po of dao.findRecordsByFilter("purchase_orders", "contract = {:c}", "", 5000, 0, { c: contractId }) || []) {
    if (po.id === excludePoId || COUNTING.indexOf(po.getString("status")) === -1) continue;
    used += po.getFloat("grand_total");
    orders++;
  }
  return { used: core.money(used), orders };
}

function sync(dao, contractId) {
  if (!contractId) return;
  const c = load(dao, contractId);
  const u = utilisation(dao, c.id, "");
  c.set("utilized_value", u.used);
  c.set("remaining_value", core.money(c.getFloat("value") - u.used));
  dao.saveRecord(c);
}

// ------------------------------------------------------------------ request hooks
function beforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_contracts", "create contracts");
  const r = e.record;
  validate(dao, r);
  r.set("status", "draft");
  r.set("utilized_value", 0);
  r.set("remaining_value", r.getFloat("value"));
  if (!r.getString("currency")) r.set("currency", "RWF");
  if (auth) {
    r.set("created_by", auth.id);
    if (!r.getString("responsible")) r.set("responsible", auth.id);
  }
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "contract");
  });
  r.set("number", n);
}

function validate(dao, r) {
  if (!r.getString("title").trim()) throw new BadRequestError("Give the contract a title.");
  let s;
  try {
    s = dao.findRecordById("suppliers", r.getString("supplier"));
  } catch (_) {
    throw new BadRequestError("Choose the supplier.");
  }
  if (["blacklisted", "rejected"].indexOf(s.getString("status")) !== -1) throw new BadRequestError(`${s.getString("name")} is ${s.getString("status")}; no contract can be made with this supplier.`);
  if (!(r.getFloat("value") > 0)) throw new BadRequestError("Enter the contract value.");
  if (!r.getString("start_date") || !r.getString("end_date")) throw new BadRequestError("Enter the start and end dates.");
  if (day(r.getString("end_date")) < day(r.getString("start_date"))) throw new BadRequestError("The end date must be after the start date.");
  if (r.getString("renewal_date") && day(r.getString("renewal_date")) > day(r.getString("end_date"))) throw new BadRequestError("The renewal decision date must be on or before the end date.");
}

function beforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const dao = $app.dao();
  const r = e.record;
  const before = r.originalCopy();
  const status = before.getString("status");
  for (const f of ["number", "status", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "utilized_value", "remaining_value", "created_by", "alerts_sent"]) r.set(f, before.get(f));
  const draft = ["draft", "returned", "rejected"].indexOf(status) !== -1;
  if (!draft) {
    // Signed contracts: only documents, notes and the responsible person may change; terms need a new contract/addendum.
    for (const f of TERMS.concat(["title", "renewal_date", "auto_renew"])) {
      if (before.getString(f) !== r.getString(f)) throw new BadRequestError(`${before.getString("number")} is ${status}; its terms cannot be changed. Record an addendum as a new contract.`);
    }
  } else {
    core.requirePermission(dao, auth, "manage_contracts", "edit contracts");
    validate(dao, r);
    r.set("remaining_value", r.getFloat("value"));
  }
  const changes = core.diff(before, r, ["title", "value", "start_date", "end_date", "renewal_date", "responsible", "notes", "payment_terms"]);
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function afterSave(e, created) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  const changes = created ? { value: { old: null, new: e.record.getFloat("value") } } : JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (!created && !Object.keys(changes).length) return;
  core.audit(dao, { actor: auth, action: created ? "created" : "updated", collection: "contracts", recordId: e.record.id, label: e.record.getString("number"), meta: core.requestMeta(e.httpContext), changes });
}

// ------------------------------------------------------------------ actions
function action(dao, actor, id, act, input, meta) {
  const c = load(dao, id);
  const status = c.getString("status");
  core.requirePermission(dao, actor, "manage_contracts", `${act} contracts`);
  if (act === "submit") {
    if (["draft", "returned"].indexOf(status) === -1) throw new BadRequestError(`${c.getString("number")} is ${status}.`);
    return require("./approvals.js").start(dao, "contract", c, actor, meta);
  }
  const reason = String(input.reason || "").trim();
  if (act === "terminate") {
    if (status !== "active") throw new BadRequestError("Only an active contract can be terminated.");
    if (reason.length < 10) throw new BadRequestError("Explain why the contract is terminated (at least 10 characters).");
    c.set("status", "terminated");
    c.set("termination_reason", reason);
    dao.saveRecord(c);
    core.audit(dao, { actor, action: "contract_terminated", collection: "contracts", recordId: c.id, label: c.getString("number"), comment: reason, meta, changes: { status: { old: "active", new: "terminated" } } });
    return c;
  }
  if (act === "cancel") {
    if (["draft", "returned", "rejected", "pending_approval"].indexOf(status) === -1) throw new BadRequestError(`${c.getString("number")} is ${status} and cannot be cancelled.`);
    if (!reason) throw new BadRequestError("Give a reason.");
    require("./approvals.js").cancel(dao, "contract", c, actor, reason, meta);
    return load(dao, id);
  }
  throw new NotFoundError(`Unknown contract action "${act}".`);
}

/** Called when a PO is submitted: the contract must fit. */
function checkPo(dao, po) {
  const cid = po.getString("contract");
  if (!cid) return;
  const c = load(dao, cid);
  const n = c.getString("number");
  if (c.getString("status") !== "active") throw new BadRequestError(`Contract ${n} is ${c.getString("status")}; orders can only be placed on an active contract.`);
  if (c.getString("supplier") !== po.getString("supplier")) throw new BadRequestError(`Contract ${n} is with another supplier.`);
  const od = day(po.getString("order_date") || new Date().toISOString());
  if (od < day(c.getString("start_date")) || od > day(c.getString("end_date"))) throw new BadRequestError(`The order date is outside the period of contract ${n} (${day(c.getString("start_date"))} – ${day(c.getString("end_date"))}).`);
  const u = utilisation(dao, cid, po.id);
  const remaining = core.money(c.getFloat("value") - u.used);
  if (po.getFloat("grand_total") > remaining + 0.01) throw new BadRequestError(`${po.getString("number")} (${core.formatMoney(po.getFloat("grand_total"))}) exceeds the remaining value of contract ${n} (${core.formatMoney(remaining)}).`);
}

/** Expiry, renewal, spending and missing-document alerts (daily job and on demand). */
function alerts(dao, notify) {
  let alertDays = 60;
  try {
    const s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
    if (s && s.getFloat("contract_alert_days")) alertDays = s.getFloat("contract_alert_days");
  } catch (_) {}
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + alertDays * 864e5).toISOString().slice(0, 10);
  const out = [];
  const managers = (dao.findRecordsByFilter("users", "status = 'Active'", "", 1000, 0) || []).filter((u) => core.can(dao, u, "manage_contracts")).map((u) => u.id);
  for (const c of dao.findRecordsByFilter("contracts", "status = 'active'", "end_date", 5000, 0) || []) {
    const n = c.getString("number");
    const sent = core.parseJson(c, "alerts_sent", {});
    const list = [];
    if (day(c.getString("end_date")) < today) {
      c.set("status", "expired");
      list.push({ key: "expired", level: "danger", text: `${n} expired on ${day(c.getString("end_date"))}` });
    } else if (day(c.getString("end_date")) <= soon) list.push({ key: "expiring", level: "warning", text: `${n} ends on ${day(c.getString("end_date"))}` });
    if (c.getString("renewal_date") && day(c.getString("renewal_date")) <= soon && day(c.getString("renewal_date")) >= today) list.push({ key: "renewal", level: "warning", text: `Decide on renewal of ${n} by ${day(c.getString("renewal_date"))}` });
    const u = utilisation(dao, c.id, "");
    const pct = c.getFloat("value") ? (u.used / c.getFloat("value")) * 100 : 0;
    if (pct >= 90) list.push({ key: "spend90", level: pct >= 100 ? "danger" : "warning", text: `${n} is ${Math.round(pct)}% used` });
    if (!(c.getStringSlice("documents") || []).length) list.push({ key: "nodocs", level: "warning", text: `${n} has no signed contract document attached` });
    for (const a of list) out.push({ contract: c.id, number: n, title: c.getString("title"), ...a });
    if (notify) {
      let changed = c.getString("status") === "expired";
      for (const a of list) {
        if (sent[a.key]) continue;
        sent[a.key] = today;
        changed = true;
        core.notify(dao, [c.getString("responsible")].concat(managers), { title: a.text, body: c.getString("title"), link: `/dashboard/procurement/contracts/${c.id}`, type: a.level === "danger" ? "error" : "warning" });
      }
      if (changed) {
        c.set("alerts_sent", sent);
        dao.saveRecord(c);
      }
    }
  }
  return out;
}

module.exports = { beforeCreate, beforeUpdate, afterSave, action, checkPo, sync, alerts, utilisation };
