#!/usr/bin/env node
/**
 * RALGA IMS — Step 3 API checks: supplier bank details of an approved supplier change only through a
 * request verified by Finance (no direct edit, requester and administrators cannot approve, rejection needs
 * a reason, details applied only on approval); procurement plan lines are charged to budget lines of the
 * department (no revenue or foreign lines, no submission while unlinked or above the line); requisitions
 * raised from a planned purchase are charged to the planned line; supplier balance and plan reports.
 *
 * Runs against a local PocketBase seeded with `npm run seed:ralga`.
 */
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
async function expectStatus(promise, status, contains) {
  try {
    await promise;
  } catch (e) {
    const ok = Array.isArray(status) ? status.includes(e.status) : e.status === status;
    assert(ok, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    if (contains) assert(String(e.message).toLowerCase().includes(contains.toLowerCase()), `message "${e.message}" should mention "${contains}"`);
    return e;
  }
  throw new Error(`expected HTTP ${status}, but the request succeeded`);
}

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const proc = await login("procurement@dnr-hr.rw");
const daf = await login("finance@dnr-hr.rw");
const sysadmin = await login("admin@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const act = (pb, approvalId, action, comment = "") => pb.send(`/api/dnr/approvals/${approvalId}/act`, { method: "POST", body: { action, comment } });
const requestChange = (supplierId, extra = {}) =>
  proc.send(`/api/ims/suppliers/${supplierId}/bank-change`, {
    method: "POST",
    body: { bank_name: "I&M Bank Rwanda", bank_branch: "Kigali", bank_account_name: "Test Supplier Ltd", bank_account_number: `9${Date.now()}`.slice(0, 13), swift_code: "IMRWRWRW", reason: "Supplier changed bank; letter on file and confirmed by phone.", ...extra },
  });

console.log("Supplier bank details (SoD rule 6)");
const supplier = (await admin.collection("suppliers").getFullList({ filter: 'status = "active" && bank_change_pending = false', sort: "created" }))[2];
const original = Object.fromEntries(["bank_name", "bank_branch", "bank_account_name", "bank_account_number", "swift_code"].map((k) => [k, supplier[k]]));

await check("an approved supplier's bank details cannot be edited directly", async () => {
  await expectStatus(proc.collection("suppliers").update(supplier.id, { bank_account_number: "111222333" }), 400, "bank change request");
  const s = await admin.collection("suppliers").getOne(supplier.id);
  assert(s.bank_account_number === original.bank_account_number, "account number changed");
});
await check("other supplier fields stay editable", async () => {
  await proc.collection("suppliers").update(supplier.id, { notes: `Checked ${new Date().toISOString().slice(0, 10)}` });
});
let change;
await check("a bank change request goes to Finance; the verified details stay in place", async () => {
  change = await requestChange(supplier.id);
  assert(change.number.startsWith("BCH"), `number ${change.number}`);
  const s = await admin.collection("suppliers").getOne(supplier.id);
  assert(s.bank_change_pending === true, "pending flag not set");
  assert(s.bank_account_number === original.bank_account_number, "details changed before approval");
});
await check("only one open request per supplier", async () => {
  await expectStatus(requestChange(supplier.id), 400, "already open");
});
await check("the request can only be created through the API endpoint", async () => {
  await expectStatus(proc.collection("supplier_bank_changes").create({ supplier: supplier.id, status: "approved" }), [400, 403]);
});
const approvalOf = async (id) => (await admin.collection("supplier_bank_changes").getOne(id)).approval;
await check("the requester cannot approve their own request", async () => {
  await expectStatus(act(proc, await approvalOf(change.id), "approve"), [400, 403]);
});
await check("the System Administrator cannot approve it", async () => {
  await expectStatus(act(sysadmin, await approvalOf(change.id), "approve"), [400, 403]);
});
await check("rejecting needs a reason", async () => {
  await expectStatus(act(daf, await approvalOf(change.id), "reject", ""), 400);
});
await check("Finance approval applies the new details and records who verified them", async () => {
  await act(daf, await approvalOf(change.id), "approve", "Bank letter checked, supplier called back.");
  const s = await admin.collection("suppliers").getOne(supplier.id);
  const r = await admin.collection("supplier_bank_changes").getOne(change.id);
  assert(r.status === "approved" && r.applied_at, `status ${r.status}`);
  assert(s.bank_name === "I&M Bank Rwanda" && s.bank_account_number === r.new_details.bank_account_number, "details not applied");
  assert(s.bank_change_pending === false && s.bank_verified_at, "verification not recorded");
  const log = await admin.collection("audit_logs").getList(1, 1, { filter: `record_id = "${supplier.id}" && action = "bank_details_changed"`, sort: "-created" });
  assert(log.items.length === 1, "no audit entry");
});
await check("a rejected request leaves the verified details unchanged", async () => {
  const before = await admin.collection("suppliers").getOne(supplier.id);
  const c = await requestChange(supplier.id, { bank_account_number: "5550001112223" });
  await act(daf, await approvalOf(c.id), "reject", "Could not confirm with the supplier by phone.");
  const s = await admin.collection("suppliers").getOne(supplier.id);
  assert(s.bank_account_number === before.bank_account_number, "details changed");
  assert(s.bank_change_pending === false, "pending flag left on");
});
await check("the requester can cancel an open request", async () => {
  const c = await requestChange(supplier.id, { bank_account_number: "7770001112223" });
  await proc.send(`/api/ims/supplier-bank-changes/${c.id}/cancel`, { method: "POST", body: { reason: "Raised by mistake." } });
  const s = await admin.collection("suppliers").getOne(supplier.id);
  assert(s.bank_change_pending === false, "pending flag left on");
  assert((await admin.collection("supplier_bank_changes").getOne(c.id)).status === "cancelled", "not cancelled");
});
await check("staff cannot read bank change requests or supplier bank details", async () => {
  await expectStatus(employee.collection("supplier_bank_changes").getList(1, 1), 403);
  const list = await employee.collection("suppliers").getList(1, 50).catch(() => ({ items: [] }));
  assert(list.items.every((s) => !s.bank_account_number && !s.bank_name), "bank details visible to staff");
  const seen = await daf.collection("suppliers").getOne(supplier.id);
  assert(seen.bank_account_number, "Finance cannot see bank details");
});
// Leave the demo supplier as it was.
await admin.collection("suppliers").update(supplier.id, original);

console.log("Procurement plans and budget lines");
const procDept = await admin.collection("departments").getFirstListItem('name = "Procurement"');
const draftPlan = await admin.collection("procurement_plans").getFirstListItem(`department = "${procDept.id}" && status = "draft"`);
const fy = await admin.collection("fiscal_years").getFirstListItem("is_current = true");
const procLines = await admin.collection("budget_lines").getFullList({ filter: `department = "${procDept.id}" && status = "active" && kind != "revenue" && fiscal_year = "${fy.id}"`, sort: "revised_amount" });
const otherLine = await admin.collection("budget_lines").getFirstListItem(`department != "${procDept.id}" && status = "active" && kind = "expense" && fiscal_year = "${fy.id}"`);
const revenueLine = await admin.collection("budget_lines").getFirstListItem(`status = "active" && kind = "revenue" && fiscal_year = "${fy.id}"`);
const planLine = (extra) => proc.collection("procurement_plan_lines").create({ plan: draftPlan.id, description: "Test purchase", quantity: 1, unit: "Lot", estimated_unit_cost: 100000, planned_month: 9, ...extra });

await check("a planned purchase cannot use another department's budget line", async () => {
  await expectStatus(planLine({ budget_line: otherLine.id }), 400, "another department");
});
await check("a planned purchase cannot use a revenue line", async () => {
  await expectStatus(planLine({ budget_line: revenueLine.id }), 400, "revenue");
});
await check("a plan with an unlinked purchase cannot be submitted", async () => {
  const l = await planLine({});
  try {
    await expectStatus(proc.send(`/api/dnr/plans/${draftPlan.id}/submit`, { method: "POST" }), 400, "budget line");
  } finally {
    await proc.collection("procurement_plan_lines").delete(l.id);
  }
});
await check("a plan above a budget line cannot be submitted", async () => {
  const small = procLines[0];
  const l = await planLine({ budget_line: small.id, estimated_unit_cost: small.revised_amount + 1000000 });
  try {
    await expectStatus(proc.send(`/api/dnr/plans/${draftPlan.id}/submit`, { method: "POST" }), 400, "exceeds");
  } finally {
    await proc.collection("procurement_plan_lines").delete(l.id);
  }
  assert((await admin.collection("procurement_plans").getOne(draftPlan.id)).status === "draft", "plan left draft state");
});
await check("plan progress shows the coverage of each budget line", async () => {
  const approved = await admin.collection("procurement_plans").getFirstListItem('status = "approved"');
  const p = await proc.send(`/api/dnr/plans/${approved.id}/progress`, {});
  assert(Array.isArray(p.coverage) && p.coverage.length > 0, "no coverage");
  assert(p.coverage.every((c) => c.planned <= c.budget), "approved plan above a line");
});

console.log("Requisitions from planned purchases");
const me = await admin.collection("users").getFirstListItem('email = "employee@dnr-hr.rw"');
const cbPlan = await admin.collection("procurement_plans").getFirstListItem(`department = "${me.department}" && status = "approved"`);
const cbLine = await admin.collection("procurement_plan_lines").getFirstListItem(`plan = "${cbPlan.id}" && budget_line != ""`);
let req;
await check("a requisition raised from a planned purchase is charged to the planned budget line", async () => {
  req = await employee.collection("purchase_requisitions").create({
    title: "Test from plan", request_type: "goods", category: cbLine.category, required_date: new Date(Date.now() + 20 * 864e5).toISOString().replace("T", " "),
    plan_line: cbLine.id, justification: "Planned purchase for the councillors induction.", items: [{ description: "Item", quantity: 1, unit: "Each", unit_cost: 1000, tax_rate: 0 }],
  });
  assert(req.budget_line === cbLine.budget_line, `budget line ${req.budget_line} vs planned ${cbLine.budget_line}`);
  assert(req.funding_source, "funding source not set");
});
await check("it cannot be moved to a different budget line while linked to the plan", async () => {
  const other = await admin.collection("budget_lines").getFirstListItem(`department = "${me.department}" && status = "active" && kind = "expense" && id != "${cbLine.budget_line}"`);
  await expectStatus(employee.collection("purchase_requisitions").update(req.id, { budget_line: other.id }), 400, "planned on budget line");
});
if (req) await admin.collection("purchase_requisitions").delete(req.id).catch(() => null);

console.log("Reports");
await check("supplier balances: billed, paid, due and open orders per supplier", async () => {
  const r = await proc.send("/api/dnr/procurement/reports/supplier_balances", {});
  assert(r.rows.length > 0, "no rows");
  assert(Math.round(r.totals.due) === Math.round(r.rows.reduce((a, x) => a + x.due, 0)), "totals do not add up");
});
await check("procurement plan execution lists planned purchases with their budget line", async () => {
  const r = await proc.send("/api/dnr/procurement/reports/plan_execution", {});
  assert(r.rows.length > 0 && r.rows.every((x) => x.budget_line), "rows without budget line");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
