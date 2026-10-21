/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — foundation: sign-in security, rate limiting, permission matrix (maker–checker),
 * master data, delegations, health and overdue-approval escalation.
 * Business rules live in lib/security.js, lib/rolechanges.js, lib/masterdata.js and lib/approvals.js.
 */

// ------------------------------------------------------------------ rate limiting
// Sign-in: 30 attempts per minute per IP address. API: 1,200 requests per minute per IP.
// Calls from the server itself (loopback: seed scripts, tests) are exempt. PocketBase 0.21 takes the
// client IP from proxy headers, so production should ALSO rate-limit at the reverse proxy (README);
// account lockout after failed sign-ins is the main defence against password guessing.
routerUse((next) => (c) => {
  const path = c.request().url.path || "";
  let ip = "";
  try {
    ip = c.realIP();
  } catch (_) {}
  const isAuth = path.indexOf("/auth-with-password") !== -1 || path.indexOf("/request-password-reset") !== -1 || path.indexOf("/confirm-password-reset") !== -1;
  const loopback = ip === "127.0.0.1" || ip === "::1";
  if (loopback || path.indexOf("/api/") !== 0) return next(c);
  const limit = isAuth ? 30 : 1200;
  const key = `ims_rl:${isAuth ? "auth" : "api"}:${ip}`;
  const minute = Math.floor(Date.now() / 60000);
  const store = $app.store();
  const cur = store.get(key);
  let count = 1;
  if (cur && cur.minute === minute) count = cur.count + 1;
  store.set(key, { minute, count });
  if (count > limit) {
    throw new ApiError(429, isAuth ? "Too many sign-in attempts from your network. Wait a minute and try again." : "Too many requests. Slow down and try again in a minute.", {});
  }
  return next(c);
});

// ------------------------------------------------------------------ 2FA enrolment enforcement
// When Security settings require 2FA for someone who has not enrolled yet, every API call except
// the 2FA set-up endpoints, auth refresh and "who am I" is refused until they enrol.
routerUse((next) => (c) => {
  const auth = c.get("authRecord");
  if (!auth || auth.collection().name !== "users") return next(c);
  const path = c.request().url.path || "";
  if (path.indexOf("/api/ims/security/2fa") === 0 || path.indexOf("/api/ims/me") === 0 || path.indexOf("/auth-refresh") !== -1 || path.indexOf("/api/") !== 0) return next(c);
  const security = require(`${__hooks}/lib/security.js`);
  const dao = $app.dao();
  if (security.policy(dao).require2fa === "none") return next(c);
  if (!security.twoFactorRequired(dao, auth)) return next(c);
  const sec = security.securityOf(dao, auth.id, false);
  if (sec && sec.getBool("totp_enabled")) return next(c);
  throw new ApiError(403, "Two-factor authentication is required for your role. Set it up under Account settings → Security before continuing.", { code: { code: "2fa_enrollment_required", message: "2FA enrolment required" } });
});

// ------------------------------------------------------------------ sign-in: lockout, 2FA, audit
onRecordBeforeAuthWithPasswordRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const security = require(`${__hooks}/lib/security.js`);
  const dao = $app.dao();
  const meta = core.requestMeta(e.httpContext);
  const user = e.record;
  if (!user) {
    core.audit(dao, { actorName: String(e.identity || "").slice(0, 120), action: "login_failed", collection: "users", label: String(e.identity || "").slice(0, 120), comment: "Unknown account", meta });
    return; // PocketBase answers "Failed to authenticate."
  }
  const p = security.policy(dao);
  const sec = security.securityOf(dao, user.id, true);
  const locked = security.lockedUntil(sec);
  if (locked) {
    core.audit(dao, { actor: user, action: "login_blocked", collection: "users", recordId: user.id, label: user.getString("email"), comment: "Account locked", meta });
    const mins = Math.max(1, Math.ceil((locked.getTime() - Date.now()) / 60000));
    throw new ApiError(423, `This account is locked after too many failed sign-in attempts. Try again in ${mins} minute${mins > 1 ? "s" : ""} or ask a System Administrator to unlock it.`, { code: { code: "account_locked", message: "locked" } });
  }

  const fail = (comment, message, code) => {
    const n = sec.getInt("failed_logins") + 1;
    sec.set("failed_logins", n);
    sec.set("last_failed_at", new Date().toISOString());
    let lockedNow = false;
    if (n >= p.lockoutThreshold) {
      sec.set("locked_until", new Date(Date.now() + p.lockoutMinutes * 60000).toISOString());
      sec.set("failed_logins", 0);
      lockedNow = true;
    }
    dao.saveRecord(sec);
    core.audit(dao, { actor: user, action: lockedNow ? "account_locked" : "login_failed", collection: "users", recordId: user.id, label: user.getString("email"), comment, meta });
    if (lockedNow) throw new ApiError(423, `Too many failed attempts. The account is locked for ${p.lockoutMinutes} minutes.`, { code: { code: "account_locked", message: "locked" } });
    const left = p.lockoutThreshold - n;
    throw new ApiError(400, `${message}${left <= 2 ? ` ${left} attempt${left === 1 ? "" : "s"} left before the account is locked.` : ""}`, { code: { code, message } });
  };

  if (!user.validatePassword(e.password)) fail("Wrong password", "Invalid e-mail or password.", "invalid_credentials");
  if (user.getString("status") && user.getString("status") !== "Active") {
    core.audit(dao, { actor: user, action: "login_blocked", collection: "users", recordId: user.id, label: user.getString("email"), comment: `Account status: ${user.getString("status")}`, meta });
    throw new ApiError(403, "This account is not active. Contact Human Resources.", { code: { code: "inactive", message: "inactive" } });
  }
  if (sec.getBool("totp_enabled")) {
    let otp = "";
    try {
      otp = String(($apis.requestInfo(e.httpContext).data || {}).otp || "").trim();
    } catch (_) {}
    if (!otp) throw new ApiError(401, "Enter the 6-digit code from your authenticator app.", { code: { code: "otp_required", message: "otp required" } });
    if (!security.verifySecondFactor(dao, sec, otp)) fail("Wrong 2FA code", "The verification code is not correct.", "invalid_otp");
  }
  sec.set("failed_logins", 0);
  sec.set("locked_until", "");
  sec.set("last_login_at", new Date().toISOString());
  sec.set("last_login_ip", meta.ip || "");
  dao.saveRecord(sec);
  core.audit(dao, { actor: user, action: "login", collection: "users", recordId: user.id, label: user.getString("email"), comment: sec.getBool("totp_enabled") ? "Signed in with password + 2FA" : "Signed in with password", meta });
}, "users");

// ------------------------------------------------------------------ password policy
onRecordBeforeCreateRequest((e) => {
  if (!e.httpContext.get("authRecord")) return; // superusers / installer
  const pw = require(`${__hooks}/lib/security.js`).passwordFromRequest(e);
  if (pw) require(`${__hooks}/lib/security.js`).checkPassword($app.dao(), pw, e.record);
}, "users");
onRecordBeforeUpdateRequest((e) => {
  if (!e.httpContext.get("authRecord")) return;
  const pw = require(`${__hooks}/lib/security.js`).passwordFromRequest(e);
  if (pw) require(`${__hooks}/lib/security.js`).checkPassword($app.dao(), pw, e.record);
}, "users");
onRecordAfterUpdateRequest((e) => {
  if (!require(`${__hooks}/lib/security.js`).passwordFromRequest(e)) return;
  const security = require(`${__hooks}/lib/security.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const dao = $app.dao();
  const sec = security.securityOf(dao, e.record.id, true);
  sec.set("password_changed_at", new Date().toISOString());
  dao.saveRecord(sec);
  core.audit(dao, { actor: e.httpContext.get("authRecord"), action: "password_changed", collection: "users", recordId: e.record.id, label: e.record.getString("email"), meta: core.requestMeta(e.httpContext) });
}, "users");
onRecordBeforeConfirmPasswordResetRequest((e) => {
  const pw = require(`${__hooks}/lib/security.js`).passwordFromRequest(e);
  if (pw) require(`${__hooks}/lib/security.js`).checkPassword($app.dao(), pw, e.record);
}, "users");

// ------------------------------------------------------------------ roles: matrix changes need confirmation
onRecordBeforeCreateRequest((e) => {
  if (!e.httpContext.get("authRecord")) return;
  // New roles start without permissions; grants go through a confirmed change request.
  const perms = require(`${__hooks}/lib/core.js`).parseJson(e.record, "permitions", []);
  e.record.set("permitions", perms.map((p) => ({ name: p.name, title: p.title, access: false })));
  e.record.set("procurement_scope", "own");
  e.record.set("hr_scope", "own");
  e.record.set("is_system", false);
}, "roles");
onRecordBeforeUpdateRequest((e) => {
  if (!e.httpContext.get("authRecord")) return;
  const core = require(`${__hooks}/lib/core.js`);
  const before = e.record.originalCopy();
  const changed = Object.keys(core.diff(before, e.record, ["permitions", "procurement_scope", "hr_scope", "code", "is_system"]));
  if (changed.length) {
    throw new BadRequestError("Permission changes must be confirmed by a second administrator or the DAF. Use Administration → Permission matrix to propose them.");
  }
}, "roles");
onRecordBeforeDeleteRequest((e) => {
  if (!e.httpContext.get("authRecord")) return;
  if (e.record.getBool("is_system") || e.record.getString("code")) throw new BadRequestError("Built-in RALGA roles cannot be deleted.");
  try {
    $app.dao().findFirstRecordByFilter("users", "role = {:r} || extra_roles ~ {:r}", { r: e.record.id });
    throw new BadRequestError("People still hold this role. Move them to another role first.");
  } catch (err) {
    if (String(err).indexOf("People still hold") !== -1) throw err;
  }
}, "roles");

// ------------------------------------------------------------------ audit trail is immutable
// Nobody can write, change or delete audit entries through the API. The single exception is a
// PocketBase superuser on the server itself (loopback), used only to reset a demo database.
onRecordBeforeCreateRequest(() => {
  throw new ForbiddenError("The audit log is written by the system only.");
}, "audit_logs", "approval_actions");
onRecordBeforeUpdateRequest(() => {
  throw new ForbiddenError("The audit log is read-only for everyone.");
}, "audit_logs", "approval_actions");
onRecordBeforeDeleteRequest((e) => {
  let ip = "";
  try {
    ip = e.httpContext.realIP();
  } catch (_) {}
  const superuserOnServer = !e.httpContext.get("authRecord") && e.httpContext.get("admin") && (ip === "127.0.0.1" || ip === "::1");
  if (!superuserOnServer) throw new ForbiddenError("The audit log is read-only for everyone.");
}, "audit_logs", "approval_actions");

// ------------------------------------------------------------------ settings
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/guards.js`).settingsGuard(e), "settings");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/guards.js`).settingsAudit(e), "settings");
onRecordBeforeCreateRequest((e) => {
  const auth = e.httpContext.get("authRecord");
  if (auth) require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "access_general_settings", "create system settings");
}, "settings");
onRecordBeforeDeleteRequest((e) => {
  if (e.httpContext.get("authRecord")) throw new ForbiddenError("System settings cannot be deleted.");
}, "settings");
onRecordViewRequest((e) => {
  if (e.httpContext.get("authRecord")) require(`${__hooks}/lib/guards.js`).hideSecrets(e.record);
}, "settings");
onRecordsListRequest((e) => {
  if (!e.httpContext.get("authRecord")) return;
  const guards = require(`${__hooks}/lib/guards.js`);
  for (const r of e.records || []) guards.hideSecrets(r);
}, "settings");

// ------------------------------------------------------------------ delegations
onRecordBeforeCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  const r = e.record;
  if (auth) {
    if (!r.getString("delegator")) r.set("delegator", auth.id);
    if (r.getString("delegator") !== auth.id) core.requirePermission(dao, auth, "manage_delegations", "set up delegations for someone else");
    r.set("created_by", auth.id);
  }
  if (!r.getString("delegate")) throw new BadRequestError("Choose the person who will approve on your behalf.");
  if (r.getString("delegate") === r.getString("delegator")) throw new BadRequestError("You cannot delegate to yourself.");
  let delegate;
  try {
    delegate = dao.findRecordById("users", r.getString("delegate"));
  } catch (_) {
    throw new BadRequestError("The selected person does not exist.");
  }
  if (delegate.getString("status") !== "Active") throw new BadRequestError(`${delegate.getString("name")} is not an active employee.`);
  const blocked = core.roleCodes(dao, delegate).filter((c) => ["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER"].indexOf(c) !== -1);
  if (blocked.length) throw new BadRequestError(`${delegate.getString("name")} holds a read-only or administrator role and can never approve, so they cannot be a delegate.`);
  const day = (v, end) => {
    const s = String(v || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestError("Give the first and last day of the delegation.");
    return `${s} ${end ? "23:59:59.999" : "00:00:00.000"}Z`;
  };
  r.set("start_date", day(r.getString("start_date"), false));
  r.set("end_date", day(r.getString("end_date"), true));
  if (r.getString("end_date") < r.getString("start_date")) throw new BadRequestError("The last day must be on or after the first day.");
  const days = (new Date(r.getString("end_date").replace(" ", "T")) - new Date(r.getString("start_date").replace(" ", "T"))) / 864e5;
  if (days > 92) throw new BadRequestError("A delegation can last at most three months.");
  if (String(r.getString("reason") || "").trim().length < 3) throw new BadRequestError("Give the reason (for example: annual leave, mission).");
  r.set("active", true);
}, "delegations");
onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const approvals = require(`${__hooks}/lib/approvals.js`);
  const dao = $app.dao();
  const r = e.record;
  const now = new Date().toISOString().replace("T", " ");
  const moved = r.getString("start_date") <= now ? approvals.applyDelegation(dao, r) : 0;
  const name = (id) => { try { return dao.findRecordById("users", id).getString("name"); } catch (_) { return "?"; } };
  core.audit(dao, {
    actor: e.httpContext.get("authRecord"), action: "delegation_created", collection: "delegations", recordId: r.id,
    label: `${name(r.getString("delegator"))} → ${name(r.getString("delegate"))}`, meta: core.requestMeta(e.httpContext),
    comment: `${r.getString("start_date").slice(0, 10)} to ${r.getString("end_date").slice(0, 10)} · ${r.getString("reason")}${moved ? ` · ${moved} pending approval(s) shared` : ""}`,
  });
  core.notify(dao, [r.getString("delegate")], {
    title: `${name(r.getString("delegator"))} delegated their approvals to you`,
    body: `From ${r.getString("start_date").slice(0, 10)} to ${r.getString("end_date").slice(0, 10)}: ${r.getString("reason")}`,
    link: "/dashboard/approvals", type: "info",
  });
}, "delegations");
// The only change allowed is ending a delegation early.
onRecordBeforeUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const auth = e.httpContext.get("authRecord");
  const before = e.record.originalCopy();
  if (auth && before.getString("delegator") !== auth.id) core.requirePermission($app.dao(), auth, "manage_delegations", "end someone else's delegation");
  const wantsEnd = before.getBool("active") && !e.record.getBool("active");
  for (const f of ["delegator", "delegate", "start_date", "end_date", "document_types", "reason"]) e.record.set(f, before.get(f));
  if (!wantsEnd) {
    e.record.set("active", before.getBool("active"));
    throw new BadRequestError("A delegation cannot be edited. End it and create a new one.");
  }
  if (auth) e.record.set("cancelled_by", auth.id);
  e.record.set("cancelled_at", new Date().toISOString());
}, "delegations");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  require(`${__hooks}/lib/approvals.js`).removeDelegation($app.dao(), e.record);
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "delegation_ended", collection: "delegations", recordId: e.record.id, label: e.record.id, meta: core.requestMeta(e.httpContext) });
}, "delegations");

// ------------------------------------------------------------------ who am I
// GET /api/ims/me → merged permissions of all the person's roles, role codes and security state.
routerAdd("GET", "/api/ims/me", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const security = require(`${__hooks}/lib/security.js`);
  const dao = $app.dao();
  const auth = $apis.requestInfo(c).authRecord;
  const perms = core.permissionsOf(dao, auth);
  const sec = security.securityOf(dao, auth.id, false);
  const p = security.policy(dao);
  const required = security.twoFactorRequired(dao, auth);
  return c.json(200, {
    id: auth.id,
    roles: core.rolesOf(dao, auth).map((r) => ({ id: r.id, name: r.getString("name"), code: r.getString("code") })),
    permissions: Object.keys(perms).filter((k) => k !== "__scope"),
    scope: perms.__scope,
    security: {
      totp_enabled: !!(sec && sec.getBool("totp_enabled")),
      two_factor_required: required,
      must_enroll_2fa: required && !(sec && sec.getBool("totp_enabled")),
      last_login_at: sec ? sec.getString("last_login_at") : "",
      recovery_codes_left: sec ? core.parseJson(sec, "recovery_codes", []).length : 0,
    },
    session_timeout_minutes: p.sessionTimeoutMinutes,
    password_min_length: p.minLength,
  });
}, $apis.requireRecordAuth("users"));

// ------------------------------------------------------------------ 2FA self-service
routerAdd("POST", "/api/ims/security/2fa/setup", (c) => {
  const security = require(`${__hooks}/lib/security.js`);
  const dao = $app.dao();
  const auth = $apis.requestInfo(c).authRecord;
  const sec = security.securityOf(dao, auth.id, true);
  if (sec.getBool("totp_enabled")) throw new BadRequestError("Two-factor authentication is already on. Turn it off first to set up a new device.");
  const secret = security.newSecret();
  sec.set("totp_pending_secret", secret);
  dao.saveRecord(sec);
  const issuer = "RALGA IMS";
  const label = encodeURIComponent(`${issuer}:${auth.getString("email")}`);
  return c.json(200, { secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` });
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/security/2fa/enable", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const security = require(`${__hooks}/lib/security.js`);
  const dao = $app.dao();
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  const sec = security.securityOf(dao, auth.id, true);
  const pending = sec.getString("totp_pending_secret");
  if (!pending) throw new BadRequestError("Start the set-up again: no pending authenticator secret.");
  if (!security.verifyTotp(pending, (info.data || {}).code)) throw new BadRequestError("That code is not correct. Check the time on your phone and try the newest code.");
  const codes = security.newRecoveryCodes();
  sec.set("totp_secret", pending);
  sec.set("totp_pending_secret", "");
  sec.set("totp_enabled", true);
  sec.set("totp_enabled_at", new Date().toISOString());
  sec.set("recovery_codes", codes.map(security.hashCode));
  dao.saveRecord(sec);
  core.audit(dao, { actor: auth, action: "2fa_enabled", collection: "users", recordId: auth.id, label: auth.getString("email"), meta: core.requestMeta(c) });
  return c.json(200, { enabled: true, recovery_codes: codes });
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/security/2fa/disable", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const security = require(`${__hooks}/lib/security.js`);
  const dao = $app.dao();
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  const sec = security.securityOf(dao, auth.id, false);
  if (!sec || !sec.getBool("totp_enabled")) throw new BadRequestError("Two-factor authentication is not on.");
  if (security.twoFactorRequired(dao, auth)) throw new BadRequestError("Your role must use two-factor authentication; it cannot be turned off.");
  if (!security.verifySecondFactor(dao, sec, (info.data || {}).code)) throw new BadRequestError("Enter a current code from your authenticator app (or a recovery code) to turn 2FA off.");
  sec.set("totp_enabled", false);
  sec.set("totp_secret", "");
  sec.set("recovery_codes", []);
  dao.saveRecord(sec);
  core.audit(dao, { actor: auth, action: "2fa_disabled", collection: "users", recordId: auth.id, label: auth.getString("email"), meta: core.requestMeta(c) });
  return c.json(200, { enabled: false });
}, $apis.requireRecordAuth("users"));

// ------------------------------------------------------------------ account administration
// GET /api/ims/security/users → sign-in status of every account (System Administrator).
routerAdd("GET", "/api/ims/security/users", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const security = require(`${__hooks}/lib/security.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  // Read-only oversight (SG, DAF, Internal Auditor hold view_security_admin); actions stay with administrators.
  if (!info.admin && !core.can(dao, info.authRecord, "view_security_admin")) core.requirePermission(dao, info.authRecord, "access_general_settings", "view account security");
  const secs = {};
  for (const s of dao.findRecordsByFilter("user_security", "id != ''", "", 5000, 0) || []) secs[s.getString("user")] = s;
  const users = dao.findRecordsByFilter("users", "id != ''", "name", 5000, 0) || [];
  return c.json(200, {
    items: users.map((u) => {
      const s = secs[u.id];
      const locked = security.lockedUntil(s);
      return {
        id: u.id, name: u.getString("name"), email: u.getString("email"), status: u.getString("status"),
        roles: core.rolesOf(dao, u).map((r) => r.getString("name")),
        totp_enabled: !!(s && s.getBool("totp_enabled")), locked_until: locked ? locked.toISOString() : "",
        failed_logins: s ? s.getInt("failed_logins") : 0, last_login_at: s ? s.getString("last_login_at") : "", last_login_ip: s ? s.getString("last_login_ip") : "",
      };
    }),
  });
}, $apis.requireAdminOrRecordAuth());

// POST /api/ims/security/users/:id/{unlock|reset-2fa}
routerAdd("POST", "/api/ims/security/users/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const security = require(`${__hooks}/lib/security.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin) core.requirePermission(dao, info.authRecord, "access_general_settings", "unlock accounts or reset 2FA");
  const action = c.pathParam("action");
  let user;
  try {
    user = dao.findRecordById("users", c.pathParam("id"));
  } catch (_) {
    throw new NotFoundError("Account not found.");
  }
  const reason = String((info.data || {}).reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason (it is kept in the audit log).");
  const sec = security.securityOf(dao, user.id, true);
  if (action === "unlock") {
    sec.set("locked_until", "");
    sec.set("failed_logins", 0);
  } else if (action === "reset-2fa") {
    if (info.authRecord && info.authRecord.id === user.id) throw new BadRequestError("Another administrator must reset your own 2FA.");
    sec.set("totp_enabled", false);
    sec.set("totp_secret", "");
    sec.set("totp_pending_secret", "");
    sec.set("recovery_codes", []);
  } else {
    throw new NotFoundError("Unknown action.");
  }
  dao.saveRecord(sec);
  core.audit(dao, { actor: info.authRecord, actorName: info.admin ? "superuser" : "", action: action === "unlock" ? "account_unlocked" : "2fa_reset", collection: "users", recordId: user.id, label: user.getString("email"), comment: reason, meta: core.requestMeta(c) });
  return c.json(200, { ok: true });
}, $apis.requireAdminOrRecordAuth());

// ------------------------------------------------------------------ permission matrix (maker–checker)
// POST /api/ims/roles/changes        { changes: [{role, permission, access}], scope_changes, reason }
// POST /api/ims/roles/changes/:id/decide  { decision: approve|reject, comment }
// POST /api/ims/roles/changes/:id/cancel
routerAdd("POST", "/api/ims/roles/changes", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const rc = require(`${__hooks}/lib/rolechanges.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    const r = rc.submit(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: r.id, status: r.getString("status"), changes: core.parseJson(r, "changes", []).length };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));
routerAdd("POST", "/api/ims/roles/changes/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const rc = require(`${__hooks}/lib/rolechanges.js`);
  const info = $apis.requestInfo(c);
  const d = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    const action = c.pathParam("action");
    const r = action === "cancel" ? rc.cancel(tx, info.authRecord, c.pathParam("id"), core.requestMeta(c)) : action === "decide" ? rc.decide(tx, info.authRecord, c.pathParam("id"), String(d.decision || ""), d.comment, core.requestMeta(c)) : null;
    if (!r) throw new NotFoundError("Unknown action.");
    out = { id: r.id, status: r.getString("status") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

// ------------------------------------------------------------------ fiscal years
// POST /api/ims/fiscal-years { start_year, make_current } → year + 12 monthly periods
routerAdd("POST", "/api/ims/fiscal-years", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const md = require(`${__hooks}/lib/masterdata.js`);
  const info = $apis.requestInfo(c);
  if (!info.admin) core.requirePermission($app.dao(), info.authRecord, "manage_fiscal_years", "create fiscal years");
  const d = info.data || {};
  let out;
  $app.dao().runInTransaction((tx) => {
    const fy = md.createFiscalYear(tx, d.start_year, info.authRecord, { makeCurrent: !!d.make_current, meta: core.requestMeta(c) });
    out = { id: fy.id, code: fy.getString("code"), name: fy.getString("name") };
  });
  return c.json(200, out);
}, $apis.requireAdminOrRecordAuth());

routerAdd("POST", "/api/ims/fiscal-years/:id/current", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const md = require(`${__hooks}/lib/masterdata.js`);
  const info = $apis.requestInfo(c);
  if (!info.admin) core.requirePermission($app.dao(), info.authRecord, "manage_fiscal_years", "change the current fiscal year");
  let out;
  $app.dao().runInTransaction((tx) => {
    const fy = md.setCurrent(tx, c.pathParam("id"));
    core.audit(tx, { actor: info.authRecord, action: "fiscal_year_current", collection: "fiscal_years", recordId: fy.id, label: fy.getString("name"), meta: core.requestMeta(c) });
    out = { id: fy.id };
  });
  return c.json(200, out);
}, $apis.requireAdminOrRecordAuth());

// GET /api/ims/periods/current → the fiscal year and period containing today
routerAdd("GET", "/api/ims/periods/current", (c) => {
  const md = require(`${__hooks}/lib/masterdata.js`);
  const dao = $app.dao();
  const p = md.periodFor(dao, new Date().toISOString());
  let fy = null;
  try {
    fy = dao.findFirstRecordByFilter("fiscal_years", "is_current = true");
  } catch (_) {}
  return c.json(200, {
    period: p ? { id: p.id, name: p.getString("name"), code: p.getString("code"), status: p.getString("status"), fiscal_year: p.getString("fiscal_year") } : null,
    fiscal_year: fy ? { id: fy.id, name: fy.getString("name"), code: fy.getString("code"), start_date: fy.getString("start_date"), end_date: fy.getString("end_date"), status: fy.getString("status") } : null,
  });
}, $apis.requireAdminOrRecordAuth());

// ------------------------------------------------------------------ tax rates
// POST /api/ims/tax-rates/:id/confirm → Finance confirms a seeded / changed rate against the official source
routerAdd("POST", "/api/ims/tax-rates/:id/confirm", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  core.requirePermission(dao, info.authRecord, "confirm_tax_rates", "confirm tax rates");
  const collection = String((info.data || {}).collection || "tax_rates");
  if (["tax_rates", "paye_bands", "statutory_contributions"].indexOf(collection) === -1) throw new BadRequestError("Unknown rate table.");
  let r;
  try {
    r = dao.findRecordById(collection, c.pathParam("id"));
  } catch (_) {
    throw new NotFoundError("Rate not found.");
  }
  r.set("confirmed_by_finance", true);
  if (collection === "tax_rates") {
    r.set("confirmed_by", info.authRecord.id);
    r.set("confirmed_at", new Date().toISOString());
  }
  dao.saveRecord(r);
  core.audit(dao, { actor: info.authRecord, action: "rate_confirmed", collection, recordId: r.id, label: r.getString("code") || r.getString("name") || `${r.getFloat("rate")}%`, comment: String((info.data || {}).source || ""), meta: core.requestMeta(c) });
  return c.json(200, { ok: true });
}, $apis.requireRecordAuth("users"));

// ------------------------------------------------------------------ exports are audited
// POST /api/ims/audit/export { what, format, rows, filters } — every Excel / PDF / CSV export is logged.
routerAdd("POST", "/api/ims/audit/export", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const d = info.data || {};
  const format = String(d.format || "").toLowerCase();
  if (["xlsx", "pdf", "csv", "json"].indexOf(format) === -1) throw new BadRequestError("Unknown export format.");
  core.audit($app.dao(), {
    actor: info.authRecord, action: "exported", collection: String(d.what || "").slice(0, 80),
    label: `${format.toUpperCase()} · ${parseInt(d.rows, 10) || 0} rows`, comment: String(d.filters || "").slice(0, 500), meta: core.requestMeta(c),
  });
  return c.json(200, { ok: true });
}, $apis.requireRecordAuth("users"));

// ------------------------------------------------------------------ health & monitoring
// GET /api/ims/health → database check, versions, backup schedule (details need view_system_health)
routerAdd("GET", "/api/ims/health", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  const started = Date.now();
  let dbOk = true;
  try {
    dao.db().newQuery("SELECT 1").execute();
  } catch (_) {
    dbOk = false;
  }
  const out = { status: dbOk ? "ok" : "degraded", time: new Date().toISOString(), db_ms: Date.now() - started };
  if (info.admin || (info.authRecord && core.can(dao, info.authRecord, "view_system_health"))) {
    const count = (name, filter) => {
      try {
        return (dao.findRecordsByFilter(name, filter || "id != ''", "", 100000, 0) || []).length;
      } catch (_) {
        return null;
      }
    };
    const s = $app.settings();
    out.details = {
      users_active: count("users", 'status = "Active"'),
      pending_approvals: count("approval_requests", 'status = "pending"'),
      emails_failed_7d: count("outbound_messages", `status = "failed" && created >= "${new Date(Date.now() - 7 * 864e5).toISOString().replace("T", " ")}"`),
      backups: { cron: s.backups.cron || "", keep: s.backups.cronMaxKeep, s3: !!(s.backups.s3 && s.backups.s3.enabled) },
      smtp_enabled: !!(s.smtp && s.smtp.enabled),
      locked_accounts: count("user_security", `locked_until > "${new Date().toISOString().replace("T", " ")}"`),
    };
  }
  return c.json(dbOk ? 200 : 503, out);
});

// ------------------------------------------------------------------ scheduled jobs
// Hourly: escalate overdue approvals; end expired delegations.
cronAdd("ims-approvals-overdue", "15 * * * *", () => {
  const approvals = require(`${__hooks}/lib/approvals.js`);
  const dao = $app.dao();
  try {
    const n = approvals.escalateOverdue(dao);
    if (n) console.log(`[ims] escalated ${n} overdue approval(s)`);
  } catch (e) {
    console.log(`[ims] overdue escalation failed: ${e}`);
  }
  const now = new Date().toISOString().replace("T", " ");
  for (const d of dao.findRecordsByFilter("delegations", "active = true && end_date < {:now}", "", 500, 0, { now }) || []) {
    d.set("active", false);
    dao.saveRecord(d);
    try {
      approvals.removeDelegation(dao, d);
    } catch (_) {}
  }
});
