#!/usr/bin/env node
/**
 * API checks for the employee portal: record privacy, leave/expense separation of duties,
 * document protection, report routing and discussion, action plan rules.
 * Runs against a local PocketBase seeded with `npm run seed:ralga` (or seed:demo).
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
let passed = 0;
let failed = 0;
const cleanup = [];

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
    assert(e.status === status, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    if (contains) assert(String(e.message).toLowerCase().includes(contains.toLowerCase()), `message "${e.message}" should mention "${contains}"`);
    return e;
  }
  throw new Error(`expected HTTP ${status}, but the request succeeded`);
}
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().replace("T", " ");
// A Monday about a month ahead, so leave periods contain working days.
const monday = (() => {
  const d = new Date(Date.now() + 30 * 864e5);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d;
})();
const weekday = (k) => new Date(monday.getTime() + k * 864e5).toISOString().replace("T", " ");

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const employee = await login("employee@dnr-hr.rw");
const hr = await login("hr@dnr-hr.rw");
const me = employee.authStore.model;
const dept = await admin.collection("departments").getOne(me.department);
const headUser = await admin.collection("users").getOne(dept.head);
const head = await login(headUser.email);
const outsider = (await admin.collection("users").getFullList({ filter: `email ~ "@dnr-hr.rw" && department != "${me.department}" && role.hr_scope = "own"` }))[0];
const other = outsider ? await login(outsider.email) : null;

console.log("\nPrivacy");
await check("an employee only sees their own documents", async () => {
  const docs = await employee.collection("employee_documents").getFullList();
  assert(docs.length > 0, "expected the employee to have documents");
  assert(docs.every((d) => d.employee === me.id), "saw someone else's document");
});
await check("an employee only sees their own leave and expense requests", async () => {
  const leaves = await employee.collection("leaves").getFullList();
  const expenses = await employee.collection("prepayments").getFullList();
  assert([...leaves, ...expenses].every((x) => x.employee === me.id), "saw another employee's record");
});
await check("HR sees documents of the whole organisation", async () => {
  const docs = await hr.collection("employee_documents").getList(1, 200);
  assert(new Set(docs.items.map((d) => d.employee)).size > 5, "HR should see many employees' documents");
});
await check("the department head sees their staff's reports", async () => {
  const r = await head.collection("employeeReports").getFullList({ filter: `employee = "${me.id}"` });
  assert(r.length > 0, "head cannot see the employee's reports");
});
await check("staff of another department cannot see the employee's reports", async () => {
  assert(other, "no outsider account found");
  const r = await other.collection("employeeReports").getFullList({ filter: `employee = "${me.id}"` });
  assert(r.length === 0, "outsider can read the report");
});

console.log("\nDocuments");
let myDoc;
await check("staff can add a document", async () => {
  const fd = new FormData();
  fd.append("name", "Test certificate");
  fd.append("type", "certificate");
  fd.append("employee", me.id);
  fd.append("attachment", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "test.pdf");
  myDoc = await employee.collection("employee_documents").create(fd);
  cleanup.push(() => admin.collection("employee_documents").delete(myDoc.id));
  assert(myDoc.created_by === me.id, "created_by not set");
});
await check("staff cannot delete their own document", async () => {
  await expectStatus(employee.collection("employee_documents").delete(myDoc.id), 404);
});
await check("staff cannot add a document to someone else's file", async () => {
  const fd = new FormData();
  fd.append("name", "Forged");
  fd.append("employee", headUser.id);
  fd.append("attachment", new Blob(["x"], { type: "text/plain" }), "x.txt");
  await expectStatus(employee.collection("employee_documents").create(fd), 400);
});

console.log("\nLeave and expenses");
let leave;
await check('"Other" leave must say what kind of leave', async () => {
  await expectStatus(employee.collection("leaves").create({ employee: me.id, type: "Other", start: weekday(0), end: weekday(1), days: 2, reason: "Family matter" }), 400, "specify");
});
await check('"Other" leave is saved with its description', async () => {
  leave = await employee.collection("leaves").create({ employee: me.id, type: "Other", other_type: "civic duty — jury service", start: weekday(0), end: weekday(1), days: 2, reason: "Summoned by court", status: "approved" });
  cleanup.push(() => admin.collection("leaves").delete(leave.id));
  assert(leave.other_type === "Civic duty — jury service", `got "${leave.other_type}"`);
  assert(leave.status === "pending", "a new request must start as pending");
});
await check("an employee cannot approve their own leave", async () => {
  await expectStatus(employee.collection("leaves").update(leave.id, { status: "approved" }), 403, "own");
});
await check("HR can approve it", async () => {
  const r = await hr.collection("leaves").update(leave.id, { status: "approved", approved_by: hr.authStore.model.id });
  assert(r.status === "approved", "not approved");
});
await check("an approved leave can no longer be edited by the employee", async () => {
  await expectStatus(employee.collection("leaves").update(leave.id, { reason: "changed" }), 404);
});
await check("an employee cannot approve their own expense", async () => {
  const x = await employee.collection("prepayments").create({ employee: me.id, amount: 15000, description: "Taxi to district office", date: day(0) });
  cleanup.push(() => admin.collection("prepayments").delete(x.id));
  await expectStatus(employee.collection("prepayments").update(x.id, { status: "approved" }), 403, "own");
});
await check("expense categories cannot be duplicated", async () => {
  const c = await employee.collection("expenses_categories").create({ name: "Test category for portal" });
  cleanup.push(() => admin.collection("expenses_categories").delete(c.id));
  await expectStatus(employee.collection("expenses_categories").create({ name: "  test CATEGORY for portal " }), 400, "already exists");
});

console.log("\nAction plans");
await check("an employee cannot record a department plan", async () => {
  await expectStatus(employee.collection("actionPlans").create({ scope: "department", title: "Dept plan", staff_id: me.id, department_id: me.department }), 403, "department head");
});
await check("a personal plan links to a department plan and fills the department", async () => {
  const parent = await employee.collection("actionPlans").getFirstListItem(`scope = "department" && department_id = "${me.department}"`);
  const p = await employee.collection("actionPlans").create({ title: "Prepare slides", staff_id: me.id, parent_plan: parent.id, start_date: day(0), end_date: day(2) });
  cleanup.push(() => admin.collection("actionPlans").delete(p.id));
  assert(p.department_id === me.department && p.scope === "personal" && p.created_by === me.id, "defaults not applied");
});

console.log("\nReports");
let report;
await check("a report goes to the department head by default and notifies them", async () => {
  report = await employee.collection("employeeReports").create({ employee: me.id, reportType: "weekly", title: "Test report", tasksCompleted: "Did the work", reportDate: day(0), dateHappened: day(-1) });
  cleanup.push(() => admin.collection("employeeReports").delete(report.id));
  assert(report.recipients.includes(headUser.id), "head is not a recipient");
  assert(report.employeeName === me.name && report.department_id === me.department && report.status === "submitted", "report not filled from the employee");
  const n = await admin.collection("notifications").getFullList({ filter: `user = "${headUser.id}" && link ~ "${report.id}"` });
  assert(n.length === 1, "head was not notified");
});
await check("a request for information changes the status and the reply resets it", async () => {
  await head.collection("report_comments").create({ report: report.id, author: headUser.id, kind: "info_request", body: "Which districts?" });
  assert((await admin.collection("employeeReports").getOne(report.id)).status === "info_requested", "status not changed");
  await employee.collection("report_comments").create({ report: report.id, author: me.id, body: "Nyagatare and Rusizi." });
  assert((await admin.collection("employeeReports").getOne(report.id)).status === "submitted", "reply did not reset status");
});
await check("outsiders cannot comment on the report", async () => {
  await expectStatus(other.collection("report_comments").create({ report: report.id, author: outsider.id, body: "hi" }), 403);
});
await check("the author cannot mark their own report as reviewed", async () => {
  await expectStatus(employee.collection("employeeReports").update(report.id, { status: "reviewed" }), 403);
});
await check("the reader marks it reviewed and the author is notified", async () => {
  const r = await head.collection("employeeReports").update(report.id, { status: "reviewed" });
  assert(r.reviewed_by === headUser.id, "reviewed_by not set");
  const n = await admin.collection("notifications").getFullList({ filter: `user = "${me.id}" && link ~ "${report.id}" && title ~ "reviewed"` });
  assert(n.length === 1, "author was not notified");
});
await check("the reader cannot rewrite the report content", async () => {
  await expectStatus(head.collection("employeeReports").update(report.id, { tasksCompleted: "edited" }), 403);
});

for (const fn of cleanup.reverse()) await fn().catch(() => null);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
