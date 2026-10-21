/// <reference path="../../pb_data/types.d.ts" />
/**
 * Permission matrix changes need two people (maker–checker): an administrator proposes changes,
 * and a different person holding "confirm_role_changes" (a second administrator or the DAF)
 * confirms them. Only then are the roles updated. Both steps are audited.
 *
 * Direct edits of roles.permitions / scopes through the API are refused for everyone except
 * PocketBase superusers (used by the installer and seed scripts).
 */
const core = require("./core.js");

const PERMISSION_NAME = /^[a-z][a-z0-9_]{1,80}$/;

function load(dao, id) {
  try {
    return dao.findRecordById("role_change_requests", id);
  } catch (_) {
    throw new NotFoundError("Permission change request not found.");
  }
}

function confirmers(dao, except) {
  return (dao.findRecordsByFilter("users", 'status = "Active"', "", 2000, 0) || [])
    .filter((u) => u.id !== except && core.can(dao, u, "confirm_role_changes"))
    .map((u) => u.id);
}

/**
 * input: { changes: [{ role, permission, access, title? }], scope_changes?: [{ role, field, value }], reason }
 */
function submit(dao, actor, input, meta) {
  core.requirePermission(dao, actor, "access_general_settings", "change the permission matrix");
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new BadRequestError("Explain why the permissions should change (at least 10 characters). The confirmer will read this.");
  const list = Array.isArray(input.changes) ? input.changes : [];
  const scopes = Array.isArray(input.scope_changes) ? input.scope_changes : [];
  if (list.length > 2000) throw new BadRequestError("Too many changes in one request.");

  const roles = {};
  const role = (id) => {
    if (!roles[id]) {
      try {
        roles[id] = dao.findRecordById("roles", id);
      } catch (_) {
        throw new BadRequestError("One of the roles does not exist any more. Reload the matrix.");
      }
    }
    return roles[id];
  };

  const changes = [];
  for (const c of list) {
    const r = role(String(c.role || ""));
    const name = String(c.permission || "");
    if (!PERMISSION_NAME.test(name)) throw new BadRequestError(`"${name}" is not a valid permission name.`);
    const to = c.access === true;
    const current = core.parseJson(r, "permitions", []).find((p) => p && p.name === name);
    const from = !!(current && current.access === true);
    if (from === to) continue;
    changes.push({ role: r.id, role_name: r.getString("name"), permission: name, title: String(c.title || (current && current.title) || name.replace(/_/g, " ")), from, to });
  }
  const meta_changes = [];
  for (const s of scopes) {
    const r = role(String(s.role || ""));
    const field = String(s.field || "");
    if (["procurement_scope", "hr_scope"].indexOf(field) === -1) throw new BadRequestError(`"${field}" cannot be changed here.`);
    const value = String(s.value || "");
    if (["own", "department", "all"].indexOf(value) === -1) throw new BadRequestError("Scope must be own, department or all.");
    if (r.getString(field) === value) continue;
    meta_changes.push({ role: r.id, role_name: r.getString("name"), field, from: r.getString(field), to: value });
  }
  if (!changes.length && !meta_changes.length) throw new BadRequestError("Nothing changed compared with the current matrix.");

  const roleNames = {};
  for (const c of changes.concat(meta_changes)) roleNames[c.role_name] = true;
  const req = new Record(dao.findCollectionByNameOrId("role_change_requests"));
  const single = Object.keys(roles).length === 1 ? Object.keys(roles)[0] : "";
  req.set("role", single);
  req.set("role_name", Object.keys(roleNames).join(", "));
  req.set("kind", "permissions");
  req.set("changes", changes);
  req.set("meta_changes", meta_changes);
  req.set("new_permissions", null);
  req.set("reason", reason);
  req.set("status", "pending");
  req.set("requested_by", actor.id);
  dao.saveRecord(req);

  const summary = `${changes.length} permission change(s)${meta_changes.length ? ` and ${meta_changes.length} scope change(s)` : ""} for ${req.getString("role_name")}`;
  core.audit(dao, { actor, action: "permission_change_requested", collection: "role_change_requests", recordId: req.id, label: summary, comment: reason, meta, changes: { changes: { old: null, new: changes.length }, scopes: { old: null, new: meta_changes.length } } });
  core.notify(dao, confirmers(dao, actor.id), {
    title: "Permission change waiting for your confirmation",
    body: `${actor.getString("name")} proposes ${summary}: ${reason}`,
    link: "/dashboard/admin/permissions?tab=requests", type: "approval",
  });
  return req;
}

function decide(dao, actor, id, decision, comment, meta) {
  core.requirePermission(dao, actor, "confirm_role_changes", "confirm permission changes");
  const req = load(dao, id);
  if (req.getString("status") !== "pending") throw new BadRequestError(`This request is already ${req.getString("status")}.`);
  if (req.getString("requested_by") === actor.id) {
    throw new ForbiddenError("Segregation of duties: a second administrator or the DAF must confirm permission changes you proposed.");
  }
  const note = String(comment || "").trim();
  if (decision !== "approve" && decision !== "reject") throw new BadRequestError('Decision must be "approve" or "reject".');
  if (decision === "reject" && !note) throw new BadRequestError("Give a reason for rejecting the change.");

  if (decision === "approve") {
    const byRole = {};
    for (const c of core.parseJson(req, "changes", [])) (byRole[c.role] = byRole[c.role] || { perms: [], scopes: [] }).perms.push(c);
    for (const c of core.parseJson(req, "meta_changes", [])) (byRole[c.role] = byRole[c.role] || { perms: [], scopes: [] }).scopes.push(c);
    for (const roleId of Object.keys(byRole)) {
      let role;
      try {
        role = dao.findRecordById("roles", roleId);
      } catch (_) {
        throw new BadRequestError("A role in this request was deleted. Reject it and submit a new one.");
      }
      const perms = core.parseJson(role, "permitions", []);
      const diff = {};
      for (const c of byRole[roleId].perms) {
        const p = perms.find((x) => x && x.name === c.permission);
        const current = !!(p && p.access === true);
        if (current !== c.from) {
          throw new BadRequestError(`"${c.permission}" on ${role.getString("name")} was changed after this request was made. Reject it and submit a fresh one.`);
        }
        if (p) p.access = c.to;
        else perms.push({ name: c.permission, title: c.title, access: c.to });
        diff[c.permission] = { old: c.from, new: c.to };
      }
      role.set("permitions", perms);
      for (const s of byRole[roleId].scopes) {
        if (role.getString(s.field) !== s.from) throw new BadRequestError(`The ${s.field.replace("_", " ")} of ${role.getString("name")} changed after this request was made.`);
        role.set(s.field, s.to);
        diff[s.field] = { old: s.from, new: s.to };
      }
      dao.saveRecord(role);
      core.audit(dao, {
        actor, action: "permissions_changed", collection: "roles", recordId: role.id, label: role.getString("name"), changes: diff, meta,
        comment: `Confirmed request by ${(() => { try { return dao.findRecordById("users", req.getString("requested_by")).getString("name"); } catch (_) { return "?"; } })()}: ${req.getString("reason")}`,
      });
    }
  }
  req.set("status", decision === "approve" ? "approved" : "rejected");
  req.set("decided_by", actor.id);
  req.set("decided_at", new Date().toISOString());
  req.set("decision_comment", note);
  dao.saveRecord(req);
  core.audit(dao, { actor, action: decision === "approve" ? "permission_change_confirmed" : "permission_change_rejected", collection: "role_change_requests", recordId: req.id, label: req.getString("role_name"), comment: note, meta });
  core.notify(dao, [req.getString("requested_by")], {
    title: decision === "approve" ? "Your permission change was confirmed" : "Your permission change was rejected",
    body: `${req.getString("role_name")}${note ? ` — ${note}` : ""}`,
    link: "/dashboard/admin/permissions?tab=requests", type: decision === "approve" ? "success" : "error",
  });
  return req;
}

function cancel(dao, actor, id, meta) {
  const req = load(dao, id);
  if (req.getString("requested_by") !== actor.id) throw new ForbiddenError("Only the person who proposed the change can withdraw it.");
  if (req.getString("status") !== "pending") throw new BadRequestError(`This request is already ${req.getString("status")}.`);
  req.set("status", "cancelled");
  req.set("decided_at", new Date().toISOString());
  dao.saveRecord(req);
  core.audit(dao, { actor, action: "permission_change_withdrawn", collection: "role_change_requests", recordId: req.id, label: req.getString("role_name"), meta });
  return req;
}

module.exports = { submit, decide, cancel };
