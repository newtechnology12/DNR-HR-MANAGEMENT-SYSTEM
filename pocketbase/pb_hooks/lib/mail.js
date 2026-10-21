/// <reference path="../../pb_data/types.d.ts" />
/**
 * E-mail: the mail server configured in the app (Settings → E-mail) is applied to PocketBase's mailer at
 * start-up and whenever it changes; every message (notification, test, retry) uses the RALGA template and
 * is logged in outbound_messages with its status (sent / failed / skipped) for the E-mail log.
 */

const ORG = "Rwanda Association of Local Government Authorities";

function settingsRecord(dao) {
  try {
    return (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0] || null;
  } catch (_) {
    return null;
  }
}

/** Copies the app's mail settings to PocketBase's mailer (and the sender / public URL). */
function applySettings(dao) {
  const r = settingsRecord(dao);
  if (!r) return false;
  const s = $app.settings();
  const host = r.getString("smtp_host").trim();
  const enc = r.getString("smtp_encryption").toLowerCase();
  s.smtp.enabled = Boolean(host) && r.getBool("smtp_enabled");
  s.smtp.host = host;
  s.smtp.port = parseInt(r.getString("smtp_port"), 10) || (enc === "ssl" || enc === "tls" ? 465 : 587);
  // No username = internal relay without login (PocketBase logs in whenever a password is set).
  s.smtp.username = r.getString("smtp_username").trim();
  s.smtp.password = s.smtp.username ? r.getString("smtp_password") : "";
  s.smtp.tls = enc === "ssl" || enc === "tls";
  s.smtp.authMethod = "PLAIN";
  if (r.getString("smtp_from_email").trim()) s.meta.senderAddress = r.getString("smtp_from_email").trim();
  if (r.getString("smtp_from_name").trim()) s.meta.senderName = r.getString("smtp_from_name").trim();
  if (r.getString("app_url").trim()) s.meta.appUrl = r.getString("app_url").trim().replace(/\/$/, "");
  dao.saveSettings(s);
  return s.smtp.enabled;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** RALGA e-mail layout: header, title, message, optional button, footer. Inline styles only. */
function template(title, body, link) {
  const appUrl = String($app.settings().meta.appUrl || "").replace(/\/$/, "");
  const href = link ? (/^https?:\/\//.test(link) ? link : `${appUrl}${link}`) : "";
  const paragraphs = String(body || "").split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#003F82;padding:18px 24px"><span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.5px">RALGA</span><span style="color:#9ccfff;font-size:13px;margin-left:10px">Integrated Management System</span></td></tr>
<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="4" style="background:#00A1DE;font-size:0;line-height:0">&nbsp;</td><td height="4" style="background:#FAD201;font-size:0;line-height:0">&nbsp;</td><td height="4" style="background:#20603D;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 14px;font-size:18px;color:#001B3D">${escapeHtml(title)}</h1>
${paragraphs}
${href ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#003F82;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px">Open in RALGA IMS</a></p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${ORG} · This message was sent automatically by RALGA IMS; do not reply to it.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Sends one message (or records why it was not sent) and returns the outbound_messages record. */
function send(dao, opts) {
  const msg = new Record(dao.findCollectionByNameOrId("outbound_messages"));
  msg.set("channel", "email");
  msg.set("to", opts.to);
  msg.set("subject", opts.subject);
  msg.set("body", opts.body || "");
  msg.set("user", opts.userId || "");
  msg.set("link", opts.link || "");
  const s = $app.settings();
  if (!s.smtp || !s.smtp.enabled) {
    msg.set("status", "skipped");
    msg.set("error", "E-mail is not set up: add the mail server under Settings → E-mail.");
    dao.saveRecord(msg);
    return msg;
  }
  try {
    $app.newMailClient().send(
      new MailerMessage({
        from: { address: s.meta.senderAddress, name: s.meta.senderName || "RALGA IMS" },
        to: [{ address: opts.to }],
        subject: opts.subject,
        html: template(opts.subject, opts.body, opts.link),
        text: `${opts.body || ""}${opts.link ? `\n\n${String(s.meta.appUrl || "").replace(/\/$/, "")}${opts.link}` : ""}`,
      })
    );
    msg.set("status", "sent");
    msg.set("sent_at", new Date().toISOString());
    msg.set("error", "");
  } catch (e) {
    msg.set("status", "failed");
    msg.set("error", String(e).replace(/^Error: /, "").slice(0, 500));
  }
  dao.saveRecord(msg);
  return msg;
}

module.exports = { applySettings, template, send, settingsRecord };
