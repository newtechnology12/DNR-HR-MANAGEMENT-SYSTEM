/// <reference path="../pb_data/types.d.ts" />
/**
 * E-mail set-up and log (rules in lib/mail.js).
 *
 *   on start-up / settings saved     the app's mail server is applied to PocketBase's mailer
 *   POST /api/ims/mail/test          { to }  send a test e-mail now
 *   GET  /api/ims/mail/log           ?page=&status=&q=   messages sent, failed or skipped
 *   POST /api/ims/mail/:id/retry     send a failed or skipped message again
 */

onAfterBootstrap(() => {
  try {
    require(`${__hooks}/lib/mail.js`).applySettings($app.dao());
  } catch (e) {
    console.log("mail: could not apply the mail settings:", e);
  }
});

onRecordAfterUpdateRequest((e) => {
  require(`${__hooks}/lib/mail.js`).applySettings($app.dao());
}, "settings");

routerAdd("POST", "/api/ims/mail/test", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const mail = require(`${__hooks}/lib/mail.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin) core.requirePermission(dao, info.authRecord, "access_general_settings", "test the e-mail settings");
  const to = String((info.data || {}).to || (info.authRecord && info.authRecord.getString("email")) || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new BadRequestError("Enter a valid e-mail address to send the test to.");
  mail.applySettings(dao);
  const who = info.authRecord ? info.authRecord.getString("name") : "an administrator";
  const msg = mail.send(dao, {
    to, subject: "RALGA IMS — test e-mail",
    body: `This is a test sent by ${who} from Settings → E-mail.\n\nIf you can read it, approvals, reminders and other notifications will reach staff by e-mail.`,
    link: "/dashboard",
  });
  core.audit(dao, { actor: info.authRecord, action: "mail_test", collection: "settings", recordId: "", label: `Test e-mail to ${to}`, comment: `${msg.getString("status")}${msg.getString("error") ? `: ${msg.getString("error")}` : ""}`, meta: core.requestMeta(c) });
  return c.json(200, { status: msg.getString("status"), error: msg.getString("error"), id: msg.id });
}, $apis.requireAdminOrRecordAuth());

routerAdd("GET", "/api/ims/mail/log", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin && !core.can(dao, info.authRecord, "access_general_settings") && !core.can(dao, info.authRecord, "view_security_admin")) {
    throw new ForbiddenError("You don't have permission to see the e-mail log.");
  }
  const page = Math.max(parseInt(c.queryParam("page") || "1", 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(c.queryParam("perPage") || "25", 10) || 25, 1), 200);
  const parts = ["channel = 'email'"];
  const params = {};
  const status = c.queryParam("status");
  if (["sent", "failed", "skipped", "queued"].indexOf(status) !== -1) {
    parts.push("status = {:status}");
    params.status = status;
  }
  const q = String(c.queryParam("q") || "").trim();
  if (q) {
    parts.push("(to ~ {:q} || subject ~ {:q})");
    params.q = q;
  }
  const filter = parts.join(" && ");
  const total = (dao.findRecordsByFilter("outbound_messages", filter, "", 0, 0, params) || []).length;
  const rows = dao.findRecordsByFilter("outbound_messages", filter, "-created", perPage, (page - 1) * perPage, params) || [];
  const count = (s) => (dao.findRecordsByFilter("outbound_messages", `channel = 'email' && status = '${s}'`, "", 0, 0) || []).length;
  return c.json(200, {
    page, perPage, totalItems: total, totalPages: Math.max(Math.ceil(total / perPage), 1),
    counts: { sent: count("sent"), failed: count("failed"), skipped: count("skipped") },
    smtp_enabled: !!($app.settings().smtp && $app.settings().smtp.enabled),
    items: rows.map((m) => ({ id: m.id, to: m.getString("to"), subject: m.getString("subject"), status: m.getString("status"), error: m.getString("error"), link: m.getString("link"), created: m.getString("created"), sent_at: m.getString("sent_at") })),
  });
}, $apis.requireAdminOrRecordAuth());

routerAdd("POST", "/api/ims/mail/:id/retry", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const mail = require(`${__hooks}/lib/mail.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  if (!info.admin) core.requirePermission(dao, info.authRecord, "access_general_settings", "resend e-mails");
  let old;
  try {
    old = dao.findRecordById("outbound_messages", c.pathParam("id"));
  } catch (_) {
    throw new NotFoundError("Message not found.");
  }
  if (old.getString("status") === "sent") throw new BadRequestError("This message was already sent.");
  const msg = mail.send(dao, { to: old.getString("to"), subject: old.getString("subject"), body: old.getString("body"), link: old.getString("link"), userId: old.getString("user") });
  return c.json(200, { status: msg.getString("status"), error: msg.getString("error"), id: msg.id });
}, $apis.requireAdminOrRecordAuth());
