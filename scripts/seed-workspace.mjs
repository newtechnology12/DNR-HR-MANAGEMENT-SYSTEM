#!/usr/bin/env node
/**
 * Staff workspace demo data (run by `npm run seed:ralga`): RALGA strategic objectives, and work plans along
 * the public-sector planning cycle for the Capacity Building department.
 *
 *  - the Staff demo user (Aline): annual performance contract for the fiscal year (approved), the current
 *    quarter's outputs, this month's activities, last week's plan reported and assessed, this week's plan in
 *    progress — each one linked to the plan above it
 *  - colleagues of the same department: weekly plans waiting for the head of department, a report to assess
 *  - the head of department's own annual contract waiting for the Secretary General
 *  - one attendance correction waiting for HR
 *
 * Everything goes through the API as the real people.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}). Set ALLOW_REMOTE_SEED=true to override.`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
const sessions = new Map();
async function as(email) {
  if (!sessions.has(email)) {
    const c = new PocketBase(PB_URL);
    c.autoCancellation(false);
    await c.collection("users").authWithPassword(email, "password123");
    sessions.set(email, c);
  }
  return sessions.get(email);
}
const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => iso(new Date(Date.now() + n * 864e5));
const noon = (d) => `${d} 12:00:00.000Z`;
const addDays = (d, n) => iso(new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5));
const send = (pb, id, action, body = {}) => pb.send(`/api/ims/plans/${id}/${action}`, { method: "POST", body });

const OBJECTIVES = [
  ["SO1", "Advocacy and representation of local governments", "Represent the interests of districts and the City of Kigali in national policy and law-making."],
  ["SO2", "Capacity building of local leaders and staff", "Induction and continuous training of councillors, executive committees and local government staff."],
  ["SO3", "Knowledge management, research and innovation", "Research, guides and the sharing of good practices among local governments."],
  ["SO4", "Partnerships, networking and resource mobilisation", "Cooperation with development partners, peer associations and the private sector."],
  ["SO5", "Institutional development and services to members", "A well-run secretariat, financial sustainability and services that members value."],
];

async function create(pb, staffId, type, start, focus, items, parent) {
  return pb.collection("work_plans").create({ staff: staffId, plan_type: type, period_start: noon(start), focus, items, parent: parent || "" });
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🗂️  Staff workspace: strategic objectives, work plans, attendance corrections");

  for (const col of ["attendance_corrections", "work_plans"]) {
    for (const r of await admin.collection(col).getFullList({ fields: "id" })) await admin.collection(col).delete(r.id).catch(() => null);
  }
  for (const r of await admin.collection("attendance").getFullList({ fields: "id", filter: 'type = "correction"' })) await admin.collection("attendance").delete(r.id).catch(() => null);
  for (const key of ["work_plan", "attendance_correction"]) {
    const seq = await admin.collection("number_sequences").getFirstListItem(`key = "${key}"`).catch(() => null);
    if (seq) await admin.collection("number_sequences").update(seq.id, { next_value: 1 });
  }
  const daf = await as("finance@dnr-hr.rw");
  const so = {};
  for (const [code, name, description] of OBJECTIVES) {
    const ex = await admin.collection("strategic_objectives").getFirstListItem(`code = "${code}"`).catch(() => null);
    const data = { code, name, description: `${description} (Illustrative — align with RALGA's Strategic Plan.)`, sort: Number(code.slice(2)), active: true };
    so[code] = ex ? await daf.collection("strategic_objectives").update(ex.id, data) : await daf.collection("strategic_objectives").create(data);
  }

  const staffUser = await admin.collection("users").getFirstListItem('email = "employee@dnr-hr.rw"');
  const hodUser = await admin.collection("users").getFirstListItem('email = "hod@dnr-hr.rw"');
  const aline = await as("employee@dnr-hr.rw");
  const solange = await as("hod@dnr-hr.rw");
  const deptPlans = await admin.collection("actionPlans").getFullList({ filter: `scope = "department" && department_id = "${staffUser.department}"`, sort: "start_date" });
  const dp = (i) => deptPlans[i % Math.max(deptPlans.length, 1)]?.id || "";
  const period = async (type, date) => aline.send(`/api/ims/plans/period?type=${type}&date=${date}`, {});
  const today = day(0);

  // Annual performance contract (Imihigo-style).
  const fy = await period("annual", today);
  const annual = await create(aline, staffUser.id, "annual", fy.start, "Strengthen the leadership skills of newly elected councillors and district staff.", [
    { title: "Train newly elected councillors on their roles and responsibilities", output: "Induction training delivered in 10 districts", indicator: "Councillors trained", baseline: "0", target: "300", weight: 35, verification: "Attendance lists, training reports, evaluation forms", quarters: [1, 2, 3], objective: so.SO2.id, department_plan: dp(0) },
    { title: "Publish practical guides for district councils", output: "Guides on budgeting, oversight and citizen participation", indicator: "Guides published and distributed", baseline: "1", target: "4", weight: 25, verification: "Published guides, distribution lists", quarters: [2, 4], objective: so.SO3.id },
    { title: "Run peer-learning exchanges between districts", output: "Exchange visits on local economic development", indicator: "Exchange visits held", baseline: "2", target: "6", weight: 20, verification: "Mission reports, photos", quarters: [2, 3, 4], objective: so.SO2.id },
    { title: "Measure the effect of the training on council work", output: "Post-training assessment", indicator: "Councils assessed after training", baseline: "0", target: "10", weight: 20, verification: "Assessment report presented to management", quarters: [4], objective: so.SO5.id },
  ]);
  await send(aline, annual.id, "submit");
  await send(solange, annual.id, "review", { decision: "approve", comment: "Agreed. Targets are realistic; keep the evaluation forms for the mid-year review." });
  const a = await admin.collection("work_plans").getOne(annual.id);
  await send(aline, annual.id, "progress", { items: [{ id: a.items[0].id, status: "in_progress", progress: 45 }, { id: a.items[1].id, status: "in_progress", progress: 25 }, { id: a.items[2].id, status: "in_progress", progress: 30 }] });

  // This quarter's outputs.
  const q = await period("quarterly", today);
  const quarter = await create(aline, staffUser.id, "quarterly", q.start, "Second wave of councillors' induction and the first two guides.", [
    { title: "Induction training for councillors of 4 districts", indicator: "Councillors trained", baseline: "120", target: "240", verification: "Attendance lists", objective: so.SO2.id, department_plan: dp(0), cost: 18500000 },
    { title: "Guide on district budgeting drafted and validated", indicator: "Guide validated by management", baseline: "Draft outline", target: "Validated guide", verification: "Validation minutes", objective: so.SO3.id },
    { title: "Two peer-learning exchange visits", indicator: "Exchange visits held", baseline: "0", target: "2", verification: "Mission reports", objective: so.SO2.id, cost: 6200000 },
  ], annual.id);
  await send(aline, quarter.id, "submit");
  await send(solange, quarter.id, "review", { decision: "approve", comment: "Approved." });
  const qq = await admin.collection("work_plans").getOne(quarter.id);
  await send(aline, quarter.id, "progress", { items: [{ id: qq.items[0].id, status: "in_progress", progress: 50 }, { id: qq.items[1].id, status: "in_progress", progress: 30 }] });

  // This month's activities.
  const m = await period("monthly", today);
  const month = await create(aline, staffUser.id, "monthly", m.start, "Prepare and deliver the Gicumbi and Rulindo induction sessions.", [
    { title: "Finalise the induction training programme", output: "Programme validated by the head of department", due: addDays(m.start, 6), priority: "high", objective: so.SO2.id, department_plan: dp(0) },
    { title: "Deliver induction training in Gicumbi district", output: "60 councillors trained", due: addDays(m.start, 13), priority: "high", objective: so.SO2.id, cost: 4600000 },
    { title: "Deliver induction training in Rulindo district", output: "55 councillors trained", due: addDays(m.start, 22), priority: "high", objective: so.SO2.id, cost: 4300000 },
    { title: "Draft chapter 2 of the budgeting guide", output: "Draft chapter shared for comments", due: addDays(m.start, 27), objective: so.SO3.id },
    { title: "Monthly activity report to the head of department", output: "Report submitted", due: m.end, priority: "medium", objective: so.SO5.id },
  ], quarter.id);
  await send(aline, month.id, "submit");
  await send(solange, month.id, "review", { decision: "approve", comment: "Approved. Coordinate transport with the logistics unit early." });
  const mm = await admin.collection("work_plans").getOne(month.id);
  await send(aline, month.id, "progress", { items: [{ id: mm.items[0].id, status: "done" }, { id: mm.items[1].id, status: "done" }, { id: mm.items[2].id, status: "in_progress", progress: 40 }] });

  // Last week: reported and assessed.
  const lw = await period("weekly", addDays(today, -7));
  const last = await create(aline, staffUser.id, "weekly", lw.start, "Gicumbi induction training.", [
    { title: "Travel to Gicumbi and set up the training room", days: ["mon"], priority: "high" },
    { title: "Facilitate the two-day induction training", days: ["tue", "wed"], priority: "high", output: "60 councillors trained" },
    { title: "Collect evaluation forms and attendance lists", days: ["wed"] },
    { title: "Write the mission report", days: ["thu", "fri"], output: "Mission report" },
  ], month.id);
  await send(aline, last.id, "submit");
  await send(solange, last.id, "review", { decision: "approve", comment: "OK." });
  const ll = await admin.collection("work_plans").getOne(last.id);
  await send(aline, last.id, "report", {
    report_summary: "The Gicumbi induction took place as planned: 58 of the 60 councillors attended both days. Evaluation forms show 87% satisfaction. The mission report is written and filed.",
    challenges: "Two councillors were on official mission and will join the Rulindo session.", next_steps: "Prepare the Rulindo session; update the training manual with the participants' comments.", self_rating: 4,
    items: ll.items.map((i) => ({ id: i.id, status: "done" })),
  });
  await send(solange, last.id, "assess", { rating: 4, feedback: "Well organised session with good attendance. Share the evaluation summary with the team on Monday." });

  // This week: approved, in progress.
  const tw = await period("weekly", today);
  const week = await create(aline, staffUser.id, "weekly", tw.start, "Rulindo preparation and the budgeting guide.", [
    { title: "Confirm the venue and the participants' list with Rulindo district", days: ["mon", "tue"], priority: "high", department_plan: dp(0) },
    { title: "Print the training manuals and the evaluation forms", days: ["tue"], output: "60 manuals" },
    { title: "Draft chapter 2 of the budgeting guide", days: ["wed", "thu"], output: "Draft chapter" },
    { title: "Weekly team meeting and report", days: ["fri"], output: "Weekly report" },
  ], month.id);
  await send(aline, week.id, "submit");
  await send(solange, week.id, "review", { decision: "approve", comment: "Approved." });
  const ww = await admin.collection("work_plans").getOne(week.id);
  await send(aline, week.id, "progress", { items: [{ id: ww.items[0].id, status: "done" }, { id: ww.items[1].id, status: "done" }, { id: ww.items[2].id, status: "in_progress", progress: 30 }] });

  // Colleagues: plans waiting for the head of department.
  const team = (await admin.collection("users").getFullList({ filter: `department = "${staffUser.department}" && id != "${staffUser.id}" && id != "${hodUser.id}" && status = "Active"`, sort: "name" })).slice(0, 3);
  let waiting = 0;
  for (const [i, u] of team.entries()) {
    const c = await as(u.email).catch(() => null);
    if (!c) continue;
    const p = await create(c, u.id, "weekly", tw.start, i === 0 ? "Training logistics for Rulindo." : "Follow-up of the capacity building programme.", [
      { title: i === 0 ? "Book transport for the facilitators" : "Update the training database with the Gicumbi participants", days: ["mon", "tue"], priority: "high" },
      { title: i === 0 ? "Prepare the per diem list for approval" : "Call the districts on the next sessions", days: ["wed"] },
      { title: "Weekly report", days: ["fri"] },
    ]);
    await send(c, p.id, "submit");
    waiting++;
    if (i === 0) {
      const lp = await create(c, u.id, "weekly", lw.start, "Gicumbi training logistics.", [{ title: "Transport and accommodation for the facilitators", days: ["mon"], priority: "high" }, { title: "Per diem payments list", days: ["thu"] }]);
      await send(c, lp.id, "submit");
      await send(solange, lp.id, "review", { decision: "approve" });
      const lpp = await admin.collection("work_plans").getOne(lp.id);
      await send(c, lp.id, "report", { report_summary: "Transport and accommodation were ready on time; the per diem list was sent to Finance on Thursday.", self_rating: 4, items: lpp.items.map((x) => ({ id: x.id, status: "done" })) });
    }
  }

  // The head of department's own annual contract, waiting for the Secretary General.
  const hodAnnual = await create(solange, hodUser.id, "annual", fy.start, "Lead the capacity building programme for local leaders.", [
    { title: "Deliver the induction programme for all newly elected councillors", indicator: "Districts covered", baseline: "0", target: "30", weight: 50, verification: "Training reports", objective: so.SO2.id },
    { title: "Mobilise partner funding for the capacity building programme", indicator: "Partner funding secured (RWF)", baseline: "320M", target: "450M", weight: 30, verification: "Signed agreements", objective: so.SO4.id },
    { title: "Introduce a training evaluation framework", indicator: "Framework adopted", baseline: "None", target: "Adopted by management", weight: 20, verification: "Management meeting minutes", objective: so.SO5.id },
  ]);
  await send(solange, hodAnnual.id, "submit");

  // An attendance correction waiting for HR.
  const att = await admin.collection("attendance").getFullList({ filter: `employee = "${staffUser.id}" && date >= "${day(-30)} 00:00:00.000Z"`, fields: "date" });
  const have = new Set(att.map((r) => r.date.slice(0, 10)));
  const free = [];
  for (let i = 3; i < 30 && free.length < 3; i++) {
    const d = day(-i);
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow > 0 && dow < 6 && !have.has(d)) free.push(d);
  }
  if (free.length) {
    await aline.collection("attendance_corrections").create({ employee: staffUser.id, dates: free.slice(0, 2), reason: "mission", explanation: "Mission to Gicumbi district for the councillors' induction training (mission order signed by the head of department)." });
  }

  console.log(`  ✓ ${OBJECTIVES.length} strategic objectives; staff plans: annual contract, quarter, month, last week (assessed), this week (in progress)`);
  console.log(`  ✓ ${waiting} colleagues' weekly plans waiting for the head of department, 1 report to assess, the head's contract waiting for the SG, 1 attendance correction for HR`);
}

main().catch((e) => {
  console.error("❌ Workspace seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
