#!/usr/bin/env node
/**
 * Platform checks: e-mail (the app's mail settings drive the server's mailer; a test e-mail and real
 * notifications are delivered with the RALGA template and logged; failed ones can be retried; only
 * administrators manage it) using a throw-away SMTP server started here, and the payroll preview (the
 * whole month calculated with the rates in force, nothing saved, same totals as the rows).
 *
 * Runs against a local PocketBase seeded with `npm run seed:ralga`. Restores the mail settings at the end.
 */
import net from "node:net";
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
let passed = 0;
let failed = 0;
async function login(email) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, "password123");
  return pb;
}
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function expectStatus(promise, status) {
  try {
    await promise;
  } catch (e) {
    assert(e.status === status, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    return;
  }
  throw new Error(`expected HTTP ${status}, but the request succeeded`);
}

// Throw-away SMTP server: accepts everything and keeps the messages in memory.
const inbox = [];
const server = net.createServer((sock) => {
  let data = false, buf = "", mail = "";
  const say = (l) => sock.write(`${l}\r\n`);
  say("220 test ESMTP");
  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") { data = false; inbox.push(mail); mail = ""; say("250 OK"); } else mail += `${line}\r\n`;
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") sock.write("250-test\r\n250 8BITMIME\r\n");
      else if (cmd === "AUTH") say("235 OK");
      else if (cmd === "DATA") { data = true; say("354 go"); }
      else if (cmd === "QUIT") { say("221 bye"); sock.end(); }
      else say("250 OK");
    }
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const admin = await login("admin@dnr-hr.rw");
const su = new PocketBase(PB_URL);
su.autoCancellation(false);
await su.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const hr = await login("hr@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const settings = (await admin.collection("settings").getList(1, 1)).items[0];
const saved = { smtp_enabled: settings.smtp_enabled, smtp_host: settings.smtp_host, smtp_port: settings.smtp_port, smtp_encryption: settings.smtp_encryption, smtp_username: settings.smtp_username, smtp_from_email: settings.smtp_from_email, smtp_from_name: settings.smtp_from_name, app_url: settings.app_url };

console.log("E-mail");
try {
  await check("only administrators can send test e-mails or read the e-mail log", async () => {
    await expectStatus(employee.send("/api/ims/mail/test", { method: "POST", body: { to: "a@b.rw" } }), 403);
    await expectStatus(employee.send("/api/ims/mail/log", {}), 403);
  });
  await check("with sending switched off, e-mails are logged as not sent", async () => {
    await admin.collection("settings").update(settings.id, { smtp_enabled: false });
    const r = await admin.send("/api/ims/mail/test", { method: "POST", body: { to: "finance@dnr-hr.rw" } });
    assert(r.status === "skipped", `status ${r.status}`);
  });
  await check("the mail server saved in the app is used immediately (test e-mail delivered, RALGA template)", async () => {
    await admin.collection("settings").update(settings.id, { smtp_enabled: true, smtp_host: "127.0.0.1", smtp_port: String(port), smtp_encryption: "none", smtp_username: "", smtp_from_email: "noreply@ralga.gov.rw", smtp_from_name: "RALGA IMS", app_url: "http://localhost:5173" });
    const before = inbox.length;
    const r = await admin.send("/api/ims/mail/test", { method: "POST", body: { to: "finance@dnr-hr.rw" } });
    assert(r.status === "sent", `status ${r.status}: ${r.error}`);
    assert(inbox.length === before + 1, "nothing reached the mail server");
    const m = inbox[inbox.length - 1];
    assert(/To: finance@dnr-hr\.rw/.test(m) && /From: RALGA IMS <noreply@ralga\.gov\.rw>/.test(m), "wrong headers");
    assert(/Open in RALGA IMS/.test(m.replace(/=\r\n/g, "")), "template missing");
  });
  await check("approval notifications are e-mailed to the approver", async () => {
    const acc = await login("accountant@dnr-hr.rw");
    const line = await acc.collection("budget_lines").getFirstListItem('code ~ "FIN-5203" && status = "active"');
    const before = inbox.length;
    const v = await acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: "Test payee", budget_line: line.id, gross_amount: 1000, description: "E-mail notification test", payee_bank: { bank_name: "BK", bank_account_number: "1" } });
    await acc.send(`/api/ims/vouchers/${v.id}/submit`, { method: "POST" });
    assert(inbox.length > before, "no e-mail for the approver");
    assert(inbox.slice(before).some((m) => /Approval needed/.test(m) && /finance@dnr-hr\.rw/.test(m)), "approval e-mail not addressed to the DAF");
    await acc.send(`/api/ims/vouchers/${v.id}/cancel`, { method: "POST", body: { reason: "Test." } });
  });
  await check("a failed e-mail can be sent again from the log", async () => {
    await admin.collection("settings").update(settings.id, { smtp_port: "1" }); // nothing listens there
    const r = await admin.send("/api/ims/mail/test", { method: "POST", body: { to: "finance@dnr-hr.rw" } });
    assert(r.status === "failed" && r.error, `status ${r.status}`);
    await admin.collection("settings").update(settings.id, { smtp_port: String(port) });
    const again = await admin.send(`/api/ims/mail/${r.id}/retry`, { method: "POST" });
    assert(again.status === "sent", `retry ${again.status}: ${again.error}`);
    const log = await admin.send("/api/ims/mail/log?perPage=5", {});
    assert(log.items.length && typeof log.counts.sent === "number", "log not readable");
  });
} finally {
  await admin.collection("settings").update(settings.id, saved);
  server.close();
}

console.log("Supporting documents");
const pdf = (name) => {
  const body = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
  return new File([body], name, { type: "application/pdf" });
};
const upload = (pb, collection, id, files) => {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return pb.send(`/api/ims/attachments/${collection}/${id}`, { method: "POST", body: fd });
};
{
  const acc = await login("accountant@dnr-hr.rw");
  const approvedInv = await su.collection("supplier_invoices").getFirstListItem('status = "approved" || status = "paid" || status = "partially_paid"');
  await check("documents can be added to an approved invoice by Finance", async () => {
    const r = await upload(acc, "supplier_invoices", approvedInv.id, [pdf("supplier-invoice-scan.pdf"), pdf("delivery-note.pdf")]);
    assert(r.files.filter((f) => /supplier.invoice.scan|delivery.note/.test(f)).length >= 2, `files: ${r.files}`);
    const log = await su.collection("audit_logs").getList(1, 1, { filter: `record_id = "${approvedInv.id}" && action = "document_attached"` });
    assert(log.totalItems > 0, "upload not audited");
  });
  await check("documents of an approved invoice are part of the record (cannot be removed)", async () => {
    const inv = await su.collection("supplier_invoices").getOne(approvedInv.id);
    await expectStatus(acc.send(`/api/ims/attachments/supplier_invoices/${inv.id}/${encodeURIComponent(inv.attachments[0])}`, { method: "DELETE" }), 400);
  });
  await check("staff without a role on invoices cannot attach documents to them", async () => {
    await expectStatus(upload(employee, "supplier_invoices", approvedInv.id, [pdf("x.pdf")]), 403);
  });
  await check("only document types are accepted (no programs)", async () => {
    await expectStatus(upload(acc, "supplier_invoices", approvedInv.id, [new File(["MZ"], "setup.exe", { type: "application/octet-stream" })]), 400);
  });
  await check("a draft voucher's documents can be added and removed", async () => {
    const line = await acc.collection("budget_lines").getFirstListItem('code ~ "FIN-5203" && status = "active"');
    const v = await acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: "Test payee", budget_line: line.id, gross_amount: 1000, description: "Attachment test", payee_bank: { bank_name: "BK", bank_account_number: "1" } });
    try {
      const r = await upload(acc, "payment_vouchers", v.id, [pdf("quote.pdf")]);
      assert(r.files.length === 1, `files ${r.files}`);
      const del = await acc.send(`/api/ims/attachments/payment_vouchers/${v.id}/${encodeURIComponent(r.files[0])}`, { method: "DELETE" });
      assert(del.files.length === 0, "not removed");
    } finally {
      await acc.collection("payment_vouchers").delete(v.id).catch(() => null);
    }
  });
}

console.log("Payroll preview");
await check("the whole payroll of a month is previewed without saving anything", async () => {
  const count = (await hr.collection("payrolls").getList(1, 1)).totalItems;
  const now = new Date();
  const p = await hr.send("/api/dnr/payroll/preview-run", { method: "POST", body: { year: now.getFullYear() + 1, month: 1 } });
  assert(p.rows.length > 10, `only ${p.rows.length} payslips`);
  const sum = (k) => p.rows.reduce((a, r) => a + r[k], 0);
  for (const k of ["gross", "paye", "net", "employer_cost"]) assert(sum(k) === p.totals[k], `${k}: rows ${sum(k)} ≠ total ${p.totals[k]}`);
  assert(p.rows.every((r) => r.net === r.gross - r.total_deductions), "net ≠ gross − deductions");
  assert(p.rates.bands.regular.length > 0 && p.rates.contributions.length > 0, "rates not returned");
  assert((await hr.collection("payrolls").getList(1, 1)).totalItems === count, "the preview created a payroll");
});
await check("PAYE in the preview follows the bands in force (progressive)", async () => {
  const now = new Date();
  const p = await hr.send("/api/dnr/payroll/preview-run", { method: "POST", body: { year: now.getFullYear() + 1, month: 1 } });
  for (const r of p.rows.slice(0, 10)) {
    const fromBands = (r.paye_breakdown || []).reduce((a, b) => a + b.tax, 0);
    assert(Math.abs(fromBands - r.paye) <= 1, `${r.name}: PAYE ${r.paye} ≠ bands ${fromBands}`);
  }
});
await check("staff cannot preview payrolls", async () => {
  await expectStatus(employee.send("/api/dnr/payroll/preview-run", { method: "POST", body: { year: 2027, month: 1 } }), 403);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
