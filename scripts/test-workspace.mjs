#!/usr/bin/env node
/**
 * Staff workspace API checks: work plans (periods, one plan per period, annual weights, activity dates,
 * visibility, supervisor = head of department and SG above heads, nobody approves or assesses their own
 * plan, locked after approval, progress, report with reasons for open activities, assessment, copy to the
 * next period) and attendance corrections (own only, past working days without a clock-in, HR approval adds
 * the days to the attendance log).
 *
 * Uses periods in the future and removes everything it created. Runs against `npm run seed:ralga`.
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
const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => iso(new Date(Date.now() + n * 864e5));
const noon = (d) => `${d} 12:00:00.000Z`;

const su = new PocketBase(PB_URL);
su.autoCancellation(false);
await su.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const hodUser = await su.collection("users").getFirstListItem('email = "hod@dnr-hr.rw"');
const staffUser = await su.collection("users").getFirstListItem('email = "employee@dnr-hr.rw"');
const dept = await su.collection("departments").getOne(staffUser.department);
assert(dept.head === hodUser.id, "demo data: the Staff demo user should report to the Head of Department demo user");
const staff = await login("employee@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw");
const hr = await login("hr@dnr-hr.rw");
const sg = await login("director@dnr-hr.rw");
const other = await login("accountant@dnr-hr.rw");
const sgUser = await su.collection("users").getFirstListItem('email = "director@dnr-hr.rw"');
const send = (pb, id, action, body = {}) => pb.send(`/api/ims/plans/${id}/${action}`, { method: "POST", body });

const created = { plans: [], corrections: [] };
const futureWeek = day(70);
let week;
let annual;

try {
  console.log("Work plans");
  await check("a weekly plan covers Monday to Friday and gets a number", async () => {
    week = await staff.collection("work_plans").create({
      staff: staffUser.id, plan_type: "weekly", period_start: noon(futureWeek), focus: "District councillors training preparation",
      items: [
        { title: "Confirm venues with the three districts", output: "Venues booked", days: ["mon", "tue"], priority: "high" },
        { title: "Print the training manuals", output: "60 manuals", days: ["wed"] },
        { title: "Send invitations to councillors", output: "Invitation letters sent", days: ["thu", "fri"] },
      ],
    });
    created.plans.push(week.id);
    const start = new Date(week.period_start.replace(" ", "T"));
    const end = new Date(week.period_end.replace(" ", "T"));
    assert(start.getUTCDay() === 1 && end.getUTCDay() === 5, `period ${week.period_start} – ${week.period_end}`);
    assert(/^WP-/.test(week.number) && week.status === "draft" && /^Week \d+/.test(week.period_label), `${week.number} ${week.status} ${week.period_label}`);
  });
  await check("one plan per person and period", async () => {
    await expectStatus(staff.collection("work_plans").create({ staff: staffUser.id, plan_type: "weekly", period_start: noon(futureWeek), items: [{ title: "Duplicate" }] }), 400, "already have");
  });
  await check("nobody creates plans for someone else", async () => {
    await expectStatus(other.collection("work_plans").create({ staff: staffUser.id, plan_type: "weekly", period_start: noon(day(77)), items: [{ title: "Not mine" }] }), [400, 403]);
  });
  await check("activity dates must fall inside the period", async () => {
    await expectStatus(staff.collection("work_plans").create({ staff: staffUser.id, plan_type: "monthly", period_start: noon(day(130)), items: [{ title: "Out of period", due: day(200) }] }), 400, "outside the period");
  });
  await check("an annual performance contract needs indicators, targets and weights adding up to 100%", async () => {
    const fyNext = new Date(Date.now() + 400 * 864e5);
    const base = { staff: staffUser.id, plan_type: "annual", period_start: noon(iso(fyNext)) };
    await expectStatus(staff.collection("work_plans").create({ ...base, items: [{ title: "Train councillors", indicator: "Councillors trained", target: "300", weight: 60 }, { title: "Publish guides", indicator: "Guides published", target: "4", weight: 30 }] }), 400, "100%");
    await expectStatus(staff.collection("work_plans").create({ ...base, items: [{ title: "Train councillors", weight: 100 }] }), 400, "indicator");
    annual = await staff.collection("work_plans").create({
      ...base,
      items: [
        { title: "Train councillors of 10 districts", indicator: "Councillors trained", baseline: "0", target: "300", weight: 60, verification: "Attendance lists, training reports", quarters: [1, 2, 3] },
        { title: "Publish practical guides for councillors", indicator: "Guides published", baseline: "1", target: "4", weight: 40, verification: "Published guides", quarters: [2, 4] },
      ],
    });
    created.plans.push(annual.id);
    assert(/^FY \d{4}\/\d{2}$/.test(annual.period_label), annual.period_label);
  });
  await check("plans are private: the owner, the head of department and HR see them; other staff do not", async () => {
    await expectStatus(other.collection("work_plans").getOne(week.id), 404);
    assert((await hod.collection("work_plans").getOne(week.id)).id === week.id, "head cannot see");
    assert((await hr.collection("work_plans").getOne(week.id)).id === week.id, "HR cannot see");
  });
  await check("submitted to the head of department, who is told", async () => {
    const r = await send(staff, week.id, "submit");
    assert(r.status === "submitted", r.status);
    const p = await su.collection("work_plans").getOne(week.id);
    assert(p.supervisor === hodUser.id, "supervisor is not the head of department");
    const n = await su.collection("notifications").getList(1, 1, { filter: `user = "${hodUser.id}" && link ~ "${week.id}"` });
    assert(n.totalItems > 0, "no notification");
  });
  await check("only the supervisor approves; the owner and other people cannot", async () => {
    await expectStatus(send(staff, week.id, "review", { decision: "approve" }), 403);
    await expectStatus(send(other, week.id, "review", { decision: "approve" }), [403, 404]);
    await expectStatus(send(hod, week.id, "review", { decision: "return" }), 400, "comment");
    const r = await send(hod, week.id, "review", { decision: "approve", comment: "Good plan." });
    assert(r.status === "approved", r.status);
  });
  await check("an approved plan is locked; only progress is recorded", async () => {
    await expectStatus(staff.collection("work_plans").update(week.id, { focus: "Changed" }), 400, "progress");
    const p = await su.collection("work_plans").getOne(week.id);
    const r = await send(staff, week.id, "progress", { items: [{ id: p.items[0].id, status: "done" }, { id: p.items[1].id, status: "in_progress", progress: 50 }] });
    assert(r.progress === 50, `progress ${r.progress}`);
  });
  await check("the report explains every activity that is not done", async () => {
    await expectStatus(send(staff, week.id, "report", { report_summary: "Short" }), 400, "20 characters");
    await expectStatus(send(staff, week.id, "report", { report_summary: "Venues confirmed in all three districts; manuals at the printer." }), 400, "not done");
    const p = await su.collection("work_plans").getOne(week.id);
    const r = await send(staff, week.id, "report", {
      report_summary: "Venues confirmed in all three districts; manuals at the printer.", challenges: "Printer delay", self_rating: 4,
      items: [{ id: p.items[1].id, achieved: "Manuals sent to the printer; delivery on Monday" }, { id: p.items[2].id, status: "postponed", achieved: "Waiting for the final dates from the districts" }],
    });
    assert(r.status === "reported", r.status);
  });
  await check("the supervisor assesses (rating and feedback); the owner cannot", async () => {
    await expectStatus(send(staff, week.id, "assess", { rating: 5, feedback: "Self assessed" }), 403);
    await expectStatus(send(hod, week.id, "assess", { feedback: "Good work" }), 400, "rating");
    const r = await send(hod, week.id, "assess", { rating: 4, feedback: "Good preparation; follow up the printer." });
    assert(r.status === "assessed", r.status);
  });
  await check("next week's plan starts from the activities still open", async () => {
    const r = await send(staff, week.id, "copy");
    created.plans.push(r.id);
    const p = await su.collection("work_plans").getOne(r.id);
    assert(p.status === "draft" && p.items.length === 2 && p.items.every((i) => i.status === "not_started"), `${p.status} ${p.items.length} items`);
    await expectStatus(send(staff, week.id, "copy"), 400, "already exists");
  });
  await check("a head of department's plan goes to the Secretary General", async () => {
    const p = await hod.collection("work_plans").create({ staff: hodUser.id, plan_type: "monthly", period_start: noon(day(160)), items: [{ title: "Review the department's quarterly results", due: "" }] });
    created.plans.push(p.id);
    await send(hod, p.id, "submit");
    const fresh = await su.collection("work_plans").getOne(p.id);
    assert(fresh.supervisor === sgUser.id, "not sent to the Secretary General");
    await send(sg, p.id, "review", { decision: "approve" });
  });

  console.log("Attendance corrections");
  const att = await su.collection("attendance").getFullList({ filter: `employee = "${staffUser.id}" && date >= "${day(-40)} 00:00:00.000Z"`, fields: "date" });
  const pend = await su.collection("attendance_corrections").getFullList({ filter: `employee = "${staffUser.id}" && status = "pending"`, fields: "dates" });
  const taken = new Set([...att.map((a) => a.date.slice(0, 10)), ...pend.flatMap((p) => p.dates)]);
  const missing = [];
  for (let i = 2; i < 40 && missing.length < 2; i++) {
    const d = day(-i);
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow > 0 && dow < 6 && !taken.has(d)) missing.push(d);
  }
  let corr;
  await check("a correction is for past working days without a clock-in", async () => {
    assert(missing.length === 2, "no free working day found for the test");
    await expectStatus(staff.collection("attendance_corrections").create({ employee: staffUser.id, dates: [day(3)], reason: "mission", explanation: "Mission to Musanze district" }), 400, "future");
    const sat = (() => { for (let i = 1; i < 9; i++) if (new Date(`${day(-i)}T12:00:00Z`).getUTCDay() === 6) return day(-i); return ""; })();
    await expectStatus(staff.collection("attendance_corrections").create({ employee: staffUser.id, dates: [sat], reason: "mission", explanation: "Mission to Musanze district" }), 400, "not a working day");
    await expectStatus(staff.collection("attendance_corrections").create({ employee: staffUser.id, dates: missing, reason: "mission", explanation: "short" }), 400, "explain");
    await expectStatus(other.collection("attendance_corrections").create({ employee: staffUser.id, dates: missing, reason: "mission", explanation: "Mission to Musanze district" }), [400, 403]);
    corr = await staff.collection("attendance_corrections").create({ employee: staffUser.id, dates: missing, reason: "mission", explanation: "Mission to Musanze district for the councillors' training" });
    created.corrections.push(corr.id);
    assert(corr.status === "pending" && corr.day_count === 2 && /^ATC-/.test(corr.number), `${corr.status} ${corr.day_count}`);
  });
  await check("only HR decides; staff cannot approve their own correction", async () => {
    await expectStatus(staff.send(`/api/ims/attendance-corrections/${corr.id}/review`, { method: "POST", body: { decision: "approve" } }), 403);
    await expectStatus(other.collection("attendance_corrections").getOne(corr.id), 404);
    await expectStatus(hr.send(`/api/ims/attendance-corrections/${corr.id}/review`, { method: "POST", body: { decision: "reject" } }), 400, "why");
  });
  await check("HR approval adds the days to the attendance log", async () => {
    const r = await hr.send(`/api/ims/attendance-corrections/${corr.id}/review`, { method: "POST", body: { decision: "approve", comment: "Mission order seen." } });
    assert(r.status === "approved" && r.added_days === 2, `${r.status} ${r.added_days}`);
    const rows = await su.collection("attendance").getFullList({ filter: `employee = "${staffUser.id}" && notes ~ "${corr.number}"` });
    assert(rows.length === 2 && rows.every((a) => a.type === "correction" && a.clockin_time && a.clockout_time), `${rows.length} attendance rows`);
    const mine = await staff.collection("attendance").getFullList({ filter: `notes ~ "${corr.number}"` });
    assert(mine.length === 2, "the staff member does not see the corrected days");
  });
} finally {
  for (const id of created.corrections) {
    const c = await su.collection("attendance_corrections").getOne(id).catch(() => null);
    if (c) for (const a of await su.collection("attendance").getFullList({ filter: `notes ~ "${c.number}"`, fields: "id" })) await su.collection("attendance").delete(a.id).catch(() => null);
    await su.collection("attendance_corrections").delete(id).catch(() => null);
  }
  for (const id of created.plans.reverse()) await su.collection("work_plans").delete(id).catch(() => null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
