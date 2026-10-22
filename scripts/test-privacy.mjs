#!/usr/bin/env node
/**
 * RALGA IMS — who sees whose data. Staff see their own attendance, petty cash, equipment and
 * vehicle requests; department heads add their department; HR, finance, stores and audit see what
 * their role's scope or permissions allow. Employees' personal files (salary, IDs, bank, family,
 * health) are hidden from colleagues, including through expand and filters, and nobody decides
 * on their own request.
 *
 * Runs against a local PocketBase seeded with `npm run seed:ralga`. Records it creates are removed.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PASSWORD = "password123";
let passed = 0;
let failed = 0;

async function login(email) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, PASSWORD);
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
/** The request must be refused (403 forbidden, or 400/404 when PocketBase hides the record). */
async function refused(promise, contains) {
  try {
    await promise;
  } catch (e) {
    assert([400, 403, 404].includes(e.status), `expected a refusal, got HTTP ${e.status}: ${e.message}`);
    if (contains) assert(String(e.message).toLowerCase().includes(contains.toLowerCase()), `message "${e.message}" should mention "${contains}"`);
    return e;
  }
  throw new Error("expected the request to be refused, but it succeeded");
}
const all = (pb, col, opts = {}) => pb.collection(col).getFullList({ batch: 500, ...opts });
const id = (pb) => pb.authStore.model.id;

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");

const staff = await login("employee@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw");
const hr = await login("hr@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const daf = await login("finance@dnr-hr.rw");
const stores = await login("stores@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const created = []; // [collection, id] removed at the end

console.log("\nRole permissions as the API rules read them");
await check("every permission entry is stored as {access, name, title}", async () => {
  const roles = await all(admin, "roles");
  const odd = roles.flatMap((r) => (r.permitions || []).filter((p) => Object.keys(p).join() !== "access,name,title").map((p) => `${r.code}:${p.name}`));
  assert(!odd.length, `entries in another shape: ${odd.slice(0, 5).join(", ")}`);
});
await check("each role's stored permissions match the pattern the rules search for", async () => {
  const roles = await all(admin, "roles");
  const used = [
    "view_petty_cash_requests", "approve_or_reject_request", "view_all_assets_requests", "reject_or_approve_assets_requests",
    "create_attendance", "update_attendance", "view_petty_cash_accounts", "approve_or_reject_expense", "manage_bank_accounts",
    "update_petty_cash_account", "refill_accounts", "create_petty_cash_account", "view_employee_profile",
  ];
  for (const p of used) {
    const expected = roles.filter((r) => (r.permitions || []).some((x) => x.name === p && x.access === true)).map((r) => r.id).sort();
    const matched = (await all(admin, "roles", { filter: `permitions ~ '%_access_:true,_name_:_${p}_,_title_%'`, fields: "id" })).map((r) => r.id).sort();
    assert(JSON.stringify(expected) === JSON.stringify(matched), `${p}: rule pattern matches ${matched.length} roles, matrix says ${expected.length}`);
  }
});

console.log("\nStaff see only their own records");
for (const [col, owner] of [
  ["attendance", (r) => r.employee],
  ["petty_cash_requests", (r) => r.requested_by || r.employee],
  ["assets_requests", (r) => r.requested_by],
]) {
  await check(`${col}: staff list holds only their own records`, async () => {
    const mine = await all(staff, col);
    const total = (await admin.collection(col).getList(1, 1)).totalItems;
    assert(mine.every((r) => owner(r) === id(staff)), `staff can see someone else's ${col}`);
    assert(total === 0 || mine.length < total, `staff sees all ${total} ${col}`);
  });
}
await check("CarRequests: staff only see trips they asked for or travel on", async () => {
  const mine = await all(staff, "CarRequests");
  assert(mine.every((r) => r.employee === id(staff) || r.created_by === id(staff) || (r.users || []).includes(id(staff))), "staff can see another employee's vehicle request");
});
await check("cash accounts and transactions are hidden from staff", async () => {
  assert((await all(staff, "accounts")).length === 0, "staff can list cash accounts");
  assert((await all(staff, "accounts_transactions")).length === 0, "staff can list account transactions");
  const any = (await admin.collection("accounts").getList(1, 1)).items[0];
  if (any) await refused(staff.collection("accounts").getOne(any.id));
});

console.log("\nPersonal files");
const people = await all(admin, "users", { fields: "id,salary,national_id,bank_account_number,department" });
const other = people.find((u) => u.id !== id(staff) && (u.salary || u.national_id));
await check("seed has another employee with a salary or ID to protect", async () => assert(other, "no employee with a salary or national ID in the seed"));
await check("staff see colleagues' names but not their salary, ID or bank account", async () => {
  const u = await staff.collection("users").getOne(other.id);
  assert(u.name, "directory name missing");
  assert(!u.salary && !u.national_id && !u.bank_account_number, `personal file visible: ${JSON.stringify({ s: u.salary, n: u.national_id })}`);
});
await check("…not even through expand (department head on departments)", async () => {
  const deps = await staff.collection("departments").getFullList({ expand: "head", filter: 'head != ""' });
  const heads = deps.map((d) => d.expand?.head).filter((h) => h && h.id !== id(staff));
  assert(heads.length, "no department with a head to test");
  assert(heads.every((h) => !h.salary && !h.national_id), "salary or ID leaked through expand");
  assert(heads.every((h) => h.name), "expand lost the directory name");
});
await check("…and HR still gets the full file through expand", async () => {
  const deps = await hr.collection("departments").getFullList({ expand: "head", filter: 'head != ""' });
  const withPay = deps.map((d) => d.expand?.head).filter((h) => h && h.id !== id(hr));
  const truth = Object.fromEntries(people.map((u) => [u.id, u.salary]));
  assert(withPay.every((h) => h.salary === truth[h.id]), "HR sees a blanked salary through expand");
});
await check("staff still see their own personal file", async () => {
  const me = await admin.collection("users").getOne(id(staff));
  const seen = await staff.collection("users").getOne(id(staff));
  assert(seen.salary === me.salary && seen.national_id === me.national_id, "own file was blanked");
});
await check("filtering or sorting people by salary is refused for staff", async () => {
  await refused(staff.collection("users").getList(1, 1, { filter: "salary != ''" }), "salary");
  await refused(staff.collection("users").getList(1, 1, { sort: "-salary" }), "salary");
  await refused(staff.collection("leaves").getList(1, 1, { filter: "employee.national_id ~ '1'" }), "national id");
  await refused(staff.collection("departments").getList(1, 1, { filter: "head.salary > 0" }), "salary");
});
await check("…while ordinary searches keep working", async () => {
  await staff.collection("users").getList(1, 5, { filter: "name ~ 'a'", sort: "name" });
  await staff.collection("users").getList(1, 5, { filter: "name ~ 'salary'" }); // the word inside a value is fine
});
await check("HR sees colleagues' personal files and can filter by salary", async () => {
  const u = await hr.collection("users").getOne(other.id);
  assert(u.salary === other.salary && u.national_id === other.national_id, "HR cannot see the personal file");
  await hr.collection("users").getList(1, 1, { filter: "salary != ''" });
});
await check("nobody can sign up without an account", async () => {
  const anon = new PocketBase(PB_URL);
  await refused(anon.collection("users").create({ email: `signup-${Date.now()}@example.com`, password: "Password!2345", passwordConfirm: "Password!2345", name: "Sign Up" }));
});

console.log("\nWider roles see what their role allows");
await check("department head sees their department's attendance, not other departments'", async () => {
  const head = await admin.collection("users").getOne(id(hod));
  const rows = await all(hod, "attendance", { expand: "employee" });
  assert(rows.every((r) => r.employee === id(hod) || r.expand?.employee?.department === head.department), "HoD sees another department's attendance");
  const total = (await admin.collection("attendance").getList(1, 1)).totalItems;
  assert(rows.length < total, "HoD sees all attendance");
});
await check("HR sees all attendance", async () => {
  const total = (await admin.collection("attendance").getList(1, 1)).totalItems;
  assert((await hr.collection("attendance").getList(1, 1)).totalItems === total, "HR does not see every attendance record");
});
await check("cashier and auditor see all petty cash; cashier sees the cash accounts", async () => {
  const total = (await admin.collection("petty_cash_requests").getList(1, 1)).totalItems;
  assert((await cashier.collection("petty_cash_requests").getList(1, 1)).totalItems === total, "cashier misses petty cash requests");
  assert((await auditor.collection("petty_cash_requests").getList(1, 1)).totalItems === total, "auditor misses petty cash requests");
  assert((await all(cashier, "accounts")).length === (await admin.collection("accounts").getList(1, 1)).totalItems, "cashier misses accounts");
});
await check("store & asset officer sees every equipment request", async () => {
  const total = (await admin.collection("assets_requests").getList(1, 1)).totalItems;
  assert((await stores.collection("assets_requests").getList(1, 1)).totalItems === total, "stores misses equipment requests");
});

console.log("\nNobody decides on their own request");
await check("petty cash requests are closed: money is asked for as a staff expense, decided through the approvals", async () => {
  await refused(staff.collection("petty_cash_requests").create({ amount: 1000, notes: "privacy test", requested_by: id(staff) }));
  await refused(daf.collection("petty_cash_requests").create({ amount: 1000, notes: "privacy test (DAF)", requested_by: id(daf) }));
  const any = (await admin.collection("petty_cash_requests").getList(1, 1)).items[0];
  if (any) await refused(daf.collection("petty_cash_requests").update(any.id, { status: "approved" }), "approve");
});
await check("staff cannot raise an expense in a colleague's name or decide one directly", async () => {
  await refused(staff.collection("prepayments").create({ employee: other.id, amount: 1000, description: "privacy test", status: "approved" }));
  const mine = (await staff.collection("prepayments").getList(1, 1)).items[0];
  if (mine) await refused(staff.collection("prepayments").update(mine.id, { status: "approved" }));
});
await check("equipment request: only the store officer decides, never the requester", async () => {
  const r = await staff.collection("assets_requests").create({ notes: "privacy test", requested_by: id(staff), status: "approved" });
  created.push(["assets_requests", r.id]);
  assert(r.status === "pending", `created as ${r.status}`);
  await refused(staff.collection("assets_requests").update(r.id, { status: "approved" }), "approve");
  await stores.collection("assets_requests").update(r.id, { status: "rejected", rejected_reason: "test" });
});

console.log("\nSelf clock-in");
await check("clock-in uses the server time and cannot be edited afterwards", async () => {
  const r = await staff.collection("attendance").create({ employee: id(staff), clockin_time: "2020-01-01 06:00:00.000Z", date: "2020-01-01 06:00:00.000Z", behaviour: "early", type: "manual" });
  created.push(["attendance", r.id]);
  assert(Math.abs(new Date(r.clockin_time.replace(" ", "T")) - Date.now()) < 5 * 60_000, `clock-in kept the client time ${r.clockin_time}`);
  await refused(staff.collection("attendance").update(r.id, { behaviour: "early", clockin_time: "2020-01-01 06:00:00.000Z" }), "only hr");
  const out = await staff.collection("attendance").update(r.id, { clockout_time: "2020-01-01 18:00:00.000Z" });
  assert(Math.abs(new Date(out.clockout_time.replace(" ", "T")) - Date.now()) < 5 * 60_000, "clock-out kept the client time");
  await refused(staff.collection("attendance").update(r.id, { clockout_time: "" }), "already clocked out");
});
await check("staff cannot clock in for a colleague", async () => {
  await refused(staff.collection("attendance").create({ employee: other.id, clockin_time: new Date().toISOString(), type: "manual" }));
});

console.log("\nExpand");
await check("expand paths that are not relations are ignored (as PocketBase does), and related staff stay scrubbed", async () => {
  // Older pages ask for e.g. departments?expand=departments,created_by,head ("created_by" is text there).
  const r = await hr.collection("departments").getList(1, 50, { expand: "departments,created_by,head" });
  assert(r.items.length > 0 && r.items.some((d) => d.expand?.head), "head not expanded");
  const s = await staff.collection("departments").getList(1, 50, { expand: "head,bogus" });
  assert(s.items.some((d) => d.expand?.head), "head not expanded for staff");
  assert(s.items.every((d) => !d.expand?.head?.salary && !d.expand?.head?.national_id), "personal fields of a head visible to staff");
});

for (const [col, rid] of created) await admin.collection(col).delete(rid).catch(() => null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
