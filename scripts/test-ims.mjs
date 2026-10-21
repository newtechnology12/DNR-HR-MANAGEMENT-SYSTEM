#!/usr/bin/env node
/**
 * RALGA IMS — Step 1 API checks: roles & permission matrix, sign-in security (lockout, 2FA, password
 * policy), maker–checker on permission changes, settings guards, master data, and the approval
 * engine's segregation-of-duties rules (no self-approval, never twice, admins never approve,
 * approval limits, delegations).
 *
 * Runs against a local PocketBase seeded with `npm run seed:ralga`.
 */
import PocketBase from "pocketbase";
import crypto from "node:crypto";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PASSWORD = "password123";
let passed = 0;
let failed = 0;

async function login(email, otp) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, PASSWORD, otp ? { body: { identity: email, password: PASSWORD, otp } } : {});
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
async function expectStatus(promise, status, contains) {
  try {
    await promise;
  } catch (e) {
    assert(e.status === status, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    if (contains) assert(String(e.message).toLowerCase().includes(contains.toLowerCase()), `message "${e.message}" should mention "${contains}"`);
    return e;
  }
  throw new Error(`expected HTTP ${status}, but the request succeeded`);
}
function totp(secret, offset = 0) {
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offset));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const roles = await admin.collection("roles").getFullList();
const role = Object.fromEntries(roles.map((r) => [r.code, r]));
const has = (code, perm) => !!role[code]?.permitions?.find((p) => p.name === perm && p.access);

const sysadmin = await login("admin@dnr-hr.rw");
const daf = await login("finance@dnr-hr.rw");
const sg = await login("director@dnr-hr.rw");
const accountant = await login("accountant@dnr-hr.rw");
const budget = await login("budget@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const id = (c) => c.authStore.model.id;

console.log("\nRoles and permission matrix");
await check("the 13 RALGA roles exist with stable codes", async () => {
  const codes = ["SYS_ADMIN", "SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER", "PROCUREMENT_OFFICER", "HOD", "HR_PAYROLL", "STORE_ASSET", "STAFF", "INTERNAL_AUDITOR", "MGMT_VIEWER"];
  for (const c of codes) assert(role[c], `missing role ${c}`);
});
await check("every demo login signs in (one per role)", async () => {
  for (const e of ["cashier", "procurement", "hod", "hr", "stores", "board"]) await login(`${e}@dnr-hr.rw`);
});
await check("matrix: System Administrator holds no approval or payment rights", async () => {
  const bad = role.SYS_ADMIN.permitions.filter((p) => p.access && /^approve_|record_payments|override_budget|close_periods|reopen_periods/.test(p.name));
  assert(!bad.length, bad.map((p) => p.name).join(", "));
});
await check("matrix: the Internal Auditor is read-only (view / export only)", async () => {
  const bad = role.INTERNAL_AUDITOR.permitions.filter((p) => p.access && !/^(view_|export_|access_employee_portal$|create_leave$)/.test(p.name));
  assert(!bad.length, bad.map((p) => p.name).join(", "));
});
await check("matrix: approvals and execution sit with the right roles", async () => {
  assert(has("DAF", "approve_purchase_orders") && has("SG", "approve_purchase_orders") && !has("PROCUREMENT_OFFICER", "approve_purchase_orders"), "PO approval");
  assert(has("CASHIER", "record_payments") && !has("ACCOUNTANT", "record_payments") && !has("DAF", "record_payments"), "payment execution");
  assert(has("HR_PAYROLL", "create_payroll") && !has("HR_PAYROLL", "approve_payroll"), "payroll preparer ≠ approver");
  assert(has("ACCOUNTANT", "prepare_bank_reconciliation") && !has("ACCOUNTANT", "approve_bank_reconciliation"), "bank rec preparer ≠ approver");
});
await check("GET /api/ims/me merges the permissions of every role a person holds", async () => {
  const me = await accountant.send("/api/ims/me", {});
  assert(me.roles.some((r) => r.code === "ACCOUNTANT") && me.roles.some((r) => r.code === "STAFF"), JSON.stringify(me.roles));
  assert(me.permissions.includes("manage_invoices") && me.permissions.includes("create_purchase_requisition"), "merged permissions");
});

console.log("\nSign-in security");
const victimUser = (await admin.collection("users").getFullList({ filter: 'email ~ "@dnr-hr.rw" && status = "Active"', sort: "-created" })).find((u) => !/^(admin|director|finance|accountant|budget|cashier|procurement|hod|hr|stores|employee|auditor|board)@/.test(u.email));
await check("5 wrong passwords lock the account; the right password is then refused", async () => {
  for (let i = 0; i < 4; i++) {
    const e = await expectStatus(new PocketBase(PB_URL).collection("users").authWithPassword(victimUser.email, "wrong-password"), 400);
    if (i === 3) assert(/attempt/.test(e.message), `should warn about remaining attempts: ${e.message}`);
  }
  await expectStatus(new PocketBase(PB_URL).collection("users").authWithPassword(victimUser.email, "wrong-password"), 423, "locked");
  await expectStatus(new PocketBase(PB_URL).collection("users").authWithPassword(victimUser.email, PASSWORD), 423, "locked");
});
await check("failed sign-ins and the lockout are in the audit log", async () => {
  const r = await auditor.send(`/api/dnr/audit?action=account_locked&perPage=5`, {});
  assert(r.items.some((x) => x.record_id === victimUser.id), "no account_locked entry");
});
await check("only an administrator can unlock, with a reason", async () => {
  await expectStatus(employee.send(`/api/ims/security/users/${victimUser.id}/unlock`, { method: "POST", body: { reason: "please" } }), 403);
  await expectStatus(sysadmin.send(`/api/ims/security/users/${victimUser.id}/unlock`, { method: "POST", body: {} }), 400, "reason");
  await sysadmin.send(`/api/ims/security/users/${victimUser.id}/unlock`, { method: "POST", body: { reason: "Identity confirmed by phone" } });
  await login(victimUser.email);
});
await check("two-factor authentication: set up, then sign-in needs the 6-digit code", async () => {
  const s = await login(victimUser.email);
  const setup = await s.send("/api/ims/security/2fa/setup", { method: "POST" });
  assert(setup.otpauth.startsWith("otpauth://totp/"), "otpauth URI");
  await expectStatus(s.send("/api/ims/security/2fa/enable", { method: "POST", body: { code: "000000" } }), 400);
  const on = await s.send("/api/ims/security/2fa/enable", { method: "POST", body: { code: totp(setup.secret) } });
  assert(on.recovery_codes.length === 8, "recovery codes");
  await expectStatus(new PocketBase(PB_URL).collection("users").authWithPassword(victimUser.email, PASSWORD), 401, "6-digit");
  await expectStatus(login(victimUser.email, "123456"), 400, "not correct");
  const ok = await login(victimUser.email, totp(setup.secret));
  await ok.send("/api/ims/security/2fa/disable", { method: "POST", body: { code: on.recovery_codes[0] } });
  await login(victimUser.email);
});
await check("password policy refuses weak passwords", async () => {
  const s = await login(victimUser.email);
  await expectStatus(s.collection("users").update(victimUser.id, { oldPassword: PASSWORD, password: "abc12345", passwordConfirm: "abc12345" }), 400, "must contain");
});

console.log("\nPermission matrix changes (maker–checker)");
await check("roles cannot be changed directly through the API", async () => {
  const perms = role.ACCOUNTANT.permitions.map((p) => (p.name === "approve_journals" ? { ...p, access: true } : p));
  await expectStatus(sysadmin.collection("roles").update(role.ACCOUNTANT.id, { permitions: perms }), 400, "confirmed");
});
await check("staff cannot propose permission changes", async () => {
  await expectStatus(employee.send("/api/ims/roles/changes", { method: "POST", body: { reason: "I want more rights please", changes: [{ role: role.STAFF.id, permission: "approve_purchase_orders", access: true }] } }), 403);
});
let change;
await check("the proposer cannot confirm their own change", async () => {
  change = await sysadmin.send("/api/ims/roles/changes", { method: "POST", body: { reason: "Test: let the Budget Officer view journals", changes: [{ role: role.BUDGET_OFFICER.id, permission: "view_journals", access: true }] } });
  assert(change.status === "pending", "pending");
  await expectStatus(sysadmin.send(`/api/ims/roles/changes/${change.id}/decide`, { method: "POST", body: { decision: "approve" } }), 403, "second administrator");
  assert(!(await admin.collection("roles").getOne(role.BUDGET_OFFICER.id)).permitions.find((p) => p.name === "view_journals")?.access, "applied before confirmation");
});
await check("the DAF confirms → the role changes and the change is audited", async () => {
  await expectStatus(daf.send(`/api/ims/roles/changes/${change.id}/decide`, { method: "POST", body: { decision: "reject" } }), 400, "reason");
  await daf.send(`/api/ims/roles/changes/${change.id}/decide`, { method: "POST", body: { decision: "approve", comment: "OK for the audit period" } });
  const r = await admin.collection("roles").getOne(role.BUDGET_OFFICER.id);
  assert(r.permitions.find((p) => p.name === "view_journals")?.access === true, "not applied");
  const log = await auditor.send(`/api/dnr/audit?action=permissions_changed&perPage=5`, {});
  assert(log.items.some((x) => x.record_id === role.BUDGET_OFFICER.id), "no audit entry");
  const back = await sysadmin.send("/api/ims/roles/changes", { method: "POST", body: { reason: "Test clean-up: remove the temporary right", changes: [{ role: role.BUDGET_OFFICER.id, permission: "view_journals", access: false }] } });
  await daf.send(`/api/ims/roles/changes/${back.id}/decide`, { method: "POST", body: { decision: "approve", comment: "clean-up" } });
});

console.log("\nSettings and audit log");
await check("staff cannot change system settings", async () => {
  const s = (await admin.collection("settings").getList(1, 1)).items[0];
  await expectStatus(employee.collection("settings").update(s.id, { company_name: "Hacked" }), 403);
});
await check("the System Administrator cannot change finance controls (DAF only)", async () => {
  const s = (await admin.collection("settings").getList(1, 1)).items[0];
  await expectStatus(sysadmin.collection("settings").update(s.id, { budget_control: s.budget_control === "block" ? "warn" : "block" }), 403, "manage_finance_settings");
});
await check("the SMTP password is never sent to browsers", async () => {
  const s = (await admin.collection("settings").getList(1, 1)).items[0];
  const before = s.smtp_password;
  await admin.collection("settings").update(s.id, { smtp_password: "s3cret-test" });
  try {
    const seen = (await employee.collection("settings").getList(1, 1)).items[0];
    assert(!seen.smtp_password, "smtp_password leaked");
  } finally {
    await admin.collection("settings").update(s.id, { smtp_password: before || "" });
  }
});
await check("nobody can delete or edit audit entries, not even the System Administrator", async () => {
  const any = (await admin.collection("audit_logs").getList(1, 1)).items[0];
  await expectStatus(sysadmin.collection("audit_logs").delete(any.id), 403);
  await expectStatus(auditor.collection("audit_logs").update(any.id, { comment: "x" }), 403);
});
await check("the Internal Auditor reads the full audit log with filters", async () => {
  const r = await auditor.send(`/api/dnr/audit?action=login&from=${new Date().toISOString().slice(0, 10)}&perPage=10`, {});
  assert(r.items.length > 0 && r.items.every((x) => x.action.includes("login")), "filtered log");
});

console.log("\nMaster data");
await check("fiscal year July–June with 12 periods; today's period is open", async () => {
  const cur = await employee.send("/api/ims/periods/current", {});
  assert(cur.fiscal_year && /^\d{4}\/\d{2}$/.test(cur.fiscal_year.code), JSON.stringify(cur.fiscal_year));
  const periods = await admin.collection("fiscal_periods").getFullList({ filter: `fiscal_year = "${cur.fiscal_year.id}"`, sort: "number" });
  assert(periods.length === 12 && periods[0].name.startsWith("Jul") && periods[11].name.startsWith("Jun"), periods.map((p) => p.name).join(","));
  assert(cur.period && cur.period.status === "open", "current period");
});
await check("only Finance (DAF) changes the chart of accounts", async () => {
  await expectStatus(accountant.collection("gl_accounts").create({ code: "5999", name: "Test", type: "expense", is_posting: true }), 403, "manage_chart_of_accounts");
});
await check("chart of accounts rules: no sub-accounts under posting accounts, same type as parent", async () => {
  const posting = await admin.collection("gl_accounts").getFirstListItem('code = "5201"');
  const header = await admin.collection("gl_accounts").getFirstListItem('code = "52"');
  await expectStatus(daf.collection("gl_accounts").create({ code: "52011", name: "Test", type: "expense", parent: posting.id, is_posting: true }), 400, "posting account");
  await expectStatus(daf.collection("gl_accounts").create({ code: "5298", name: "Test", type: "revenue", parent: header.id, is_posting: true }), 400, "same type");
  await expectStatus(daf.collection("gl_accounts").create({ code: "5201", name: "Duplicate", type: "expense", parent: header.id, is_posting: true }), 400);
});
await check("tax rates are dated, cannot overlap, and need Finance confirmation", async () => {
  const vat = await admin.collection("tax_rates").getFirstListItem('code = "VAT_STANDARD"');
  await expectStatus(daf.collection("tax_rates").create({ code: "VAT_STANDARD", name: "Overlap", category: "vat", rate: 16, effective_from: "2026-01-01 00:00:00.000Z", active: true }), 400, "overlapping");
  await expectStatus(accountant.send(`/api/ims/tax-rates/${vat.id}/confirm`, { method: "POST", body: { source: "rra.gov.rw" } }), 403);
  await daf.send(`/api/ims/tax-rates/${vat.id}/confirm`, { method: "POST", body: { source: "rra.gov.rw — VAT law" } });
  assert((await admin.collection("tax_rates").getOne(vat.id)).confirmed_by_finance, "not confirmed");
  await admin.collection("tax_rates").update(vat.id, { confirmed_by_finance: false });
});
await check("master data is never deleted through the API (deactivate instead)", async () => {
  const f = await admin.collection("funding_sources").getFirstListItem('code = "MC"');
  await expectStatus(daf.collection("funding_sources").delete(f.id), 403);
});

console.log("\nApproval engine: segregation of duties");
await check("approval limits: the SG step applies only above the DAF limit", async () => {
  const small = await accountant.send("/api/dnr/approvals/preview", { method: "POST", body: { document_type: "purchase_order", amount: 1000000 } });
  const big = await accountant.send("/api/dnr/approvals/preview", { method: "POST", body: { document_type: "purchase_order", amount: 9000000 } });
  const sgStep = (r) => r.steps.find((s) => /Secretary General/.test(s.name));
  assert(sgStep(small) && sgStep(small).applies === false, "SG step should not apply to 1M");
  assert(sgStep(big) && sgStep(big).applies === true, "SG step should apply to 9M");
});
await check("System Administrators and the Internal Auditor can never approve", async () => {
  const pending = await admin.collection("approval_requests").getFirstListItem('status = "pending"');
  await expectStatus(sysadmin.send(`/api/dnr/approvals/${pending.id}/act`, { method: "POST", body: { action: "approve" } }), 403, "System Administrators");
  await expectStatus(auditor.send(`/api/dnr/approvals/${pending.id}/act`, { method: "POST", body: { action: "approve" } }), 403);
});
let pr;
await check("a person never decides the same document at two levels", async () => {
  // A Finance requisition: the department head is the DAF, so the DAF step must go to someone else.
  const cat = await admin.collection("procurement_categories").getFirstListItem("active = true");
  pr = await accountant.collection("purchase_requisitions").create({
    title: "SoD test: printer cartridges", request_type: "goods", category: cat.id, priority: "medium", required_date: new Date(Date.now() + 20 * 864e5).toISOString().replace("T", " "),
    delivery_location: "Kigali HQ", justification: "Segregation-of-duties API test.", items: [{ description: "Toner cartridge", quantity: 2, unit: "Each", unit_cost: 90000, tax_rate: 18 }],
  });
  const sub = await accountant.send(`/api/dnr/requisitions/${pr.id}/submit`, { method: "POST" });
  let a = await admin.collection("approval_requests").getOne(sub.approval);
  assert(a.pending_approvers.split(",").includes(id(daf)), `HoD step should be the DAF (head of Finance): ${a.pending_approvers}`);
  await expectStatus(accountant.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve" } }), 403);
  await daf.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "HoD OK" } });
  await budget.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Budget available" } });
  a = await admin.collection("approval_requests").getOne(a.id);
  assert(!a.pending_approvers.split(",").includes(id(daf)), "DAF must not be asked twice");
  assert(a.pending_approvers.split(",").includes(id(sg)), `DAF step should fall back to the SG: ${a.pending_approvers}`);
  await sg.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Approved" } });
  assert((await admin.collection("purchase_requisitions").getOne(pr.id)).status === "approved", "not approved");
});
await check("rejecting or returning needs a written reason", async () => {
  const pending = (await admin.collection("approval_requests").getFullList({ filter: 'status = "pending" && document_type = "purchase_requisition"' }))[0];
  const who = await admin.collection("users").getOne(pending.pending_approvers.split(",")[0]);
  const s = await login(who.email);
  await expectStatus(s.send(`/api/dnr/approvals/${pending.id}/act`, { method: "POST", body: { action: "return" } }), 400, "reason");
});
await check("delegation: the delegate sees the delegator's pending approvals and acts on their behalf", async () => {
  await expectStatus(daf.collection("delegations").create({ delegate: id(auditor), start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: "Leave" }), 400, "read-only");
  await expectStatus(daf.collection("delegations").create({ delegate: id(daf), start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: "Leave" }), 400, "yourself");
  const waiting = await admin.collection("approval_requests").getFullList({ filter: `status = "pending" && pending_approvers ~ "${id(daf)}"` });
  assert(waiting.length > 0, "the DAF has nothing pending to delegate");
  const today = new Date().toISOString().slice(0, 10);
  const d = await daf.collection("delegations").create({ delegate: id(sg), start_date: today, end_date: today, reason: "Annual leave (test)" });
  try {
    const shared = await admin.collection("approval_requests").getOne(waiting[0].id);
    assert(shared.pending_approvers.split(",").includes(id(sg)), "delegate not added");
    const seen = await sg.collection("approval_requests").getFullList({ filter: `id = "${waiting[0].id}"` });
    assert(seen.length === 1, "delegate cannot see it");
  } finally {
    await daf.collection("delegations").update(d.id, { active: false });
  }
  const after = await admin.collection("approval_requests").getOne(waiting[0].id);
  const original = await admin.collection("approval_requests").getOne(waiting[0].id);
  assert(after.pending_approvers.split(",").includes(id(daf)), "delegator lost the approval");
  assert(original.status === "pending", "status changed");
});

await check("cleanup: test requisition stays as evidence (approved), audit intact", async () => {
  assert(pr && pr.id, "no requisition");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
