#!/usr/bin/env node
/**
 * Staff workspace demo data (run by `npm run seed:ralga`): RALGA strategic objectives, department plans and
 * individual work plans along the public-sector planning cycle — all through the API as the real people.
 *
 *  - department plans (Capacity Building this month and next, Finance and Administration this month): the
 *    head sets the shared activities with targets, the Secretary General approves, staff contribute from
 *    their monthly plans and the department's achievement adds up their results
 *  - the Staff demo user (Aline): annual contract assigned from the strategic plan, the quarter cascaded from
 *    it, her own month linked to department activities, last week reported and assessed, this week in
 *    progress, and a task assigned by the Secretary General; open issues on several plans
 *  - Capacity Building colleagues: plans waiting for the head of department, a report to assess
 *  - every other demo login: annual contract, quarter, month, last week (assessed) and this week, with a
 *    mix of on-track, at-risk and off-track results
 *  - one attendance correction waiting for HR
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
const within = (p, n) => {
  const d = addDays(p.start, n);
  return d > p.end ? p.end : d;
};

const OBJECTIVES = [
  ["SO1", "Advocacy and representation of local governments", "Represent the interests of districts and the City of Kigali in national policy and law-making."],
  ["SO2", "Capacity building of local leaders and staff", "Induction and continuous training of councillors, executive committees and local government staff."],
  ["SO3", "Knowledge management, research and innovation", "Research, guides and the sharing of good practices among local governments."],
  ["SO4", "Partnerships, networking and resource mobilisation", "Cooperation with development partners, peer associations and the private sector."],
  ["SO5", "Institutional development and services to members", "A well-run secretariat, financial sustainability and services that members value."],
];

let so = {};
const obj = (title, indicator, unit, baseline, target, weight, quarters, soCode, verification, output, q) => ({ title, indicator, unit, baseline: String(baseline), target: String(target), weight, quarters, objective: so[soCode].id, verification, output, q: q === undefined ? undefined : String(q) });
const act = (title, o) => ({ title, output: o.output, indicator: o.indicator, unit: o.unit, target: String(o.target), weight: o.weight, due: o.due, objective: so[o.so].id, verification: o.evidence, cost: o.cost || 0, priority: o.priority || "medium", department_plan: o.dp || "", department_activity: o.da || "" });
const wk = (title, days, output, priority) => ({ title, days, output: output || "", priority: priority || "medium" });

async function plan(pb, staffId, type, start, focus, items, parent) {
  return pb.collection("work_plans").create({ staff: staffId, plan_type: type, period_start: noon(start), focus, items, parent: parent || "" });
}
async function approve(owner, sup, id, comment) {
  const r = await send(owner, id, "submit");
  if (sup && r.status === "submitted") await send(sup, id, "review", { decision: "approve", comment: comment || "Approved." });
}
/** Progress per item position: { status, progress, actual }. */
async function progress(owner, id, updates) {
  const p = await admin.collection("work_plans").getOne(id);
  const items = p.items.map((it, k) => (updates[k] ? { id: it.id, ...updates[k] } : null)).filter(Boolean);
  if (items.length) await send(owner, id, "progress", { items });
}
/** Weights adding up to 100% (a cascaded quarter may hold only some of the year's objectives). */
function balance(items) {
  const total = items.reduce((s, i) => s + (Number(i.weight) || 0), 0) || items.length;
  let left = 100;
  return items.map((i, k) => {
    const w = k === items.length - 1 ? left : Math.round(((Number(i.weight) || 1) * 100) / total);
    left -= w;
    return { ...i, weight: w };
  });
}
const issue = (pb, id, title, severity, detail) => send(pb, id, "issues", { action: "add", title, severity, detail: detail || "" });
async function supervisorOf(pb) {
  const c = await pb.send("/api/ims/plans/context", {});
  if (!c.supervisor) return null;
  const u = await admin.collection("users").getOne(c.supervisor.id);
  return as(u.email);
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🗂️  Staff workspace: strategic objectives, department plans, work plans, attendance corrections");

  for (const col of ["attendance_corrections", "work_plans"]) {
    // department plans last: staff plans link to them
    const rows = await admin.collection(col).getFullList({ fields: "id,plan_type", sort: col === "work_plans" ? "-plan_type" : "" });
    for (const r of rows.filter((x) => x.plan_type !== "department")) await admin.collection(col).delete(r.id).catch(() => null);
    for (const r of rows.filter((x) => x.plan_type === "department")) await admin.collection(col).delete(r.id).catch(() => null);
  }
  for (const r of await admin.collection("attendance").getFullList({ fields: "id", filter: 'type = "correction"' })) await admin.collection("attendance").delete(r.id).catch(() => null);
  for (const key of ["work_plan", "attendance_correction"]) {
    const seq = await admin.collection("number_sequences").getFirstListItem(`key = "${key}"`).catch(() => null);
    if (seq) await admin.collection("number_sequences").update(seq.id, { next_value: 1 });
  }
  const daf = await as("finance@dnr-hr.rw");
  so = {};
  for (const [code, name, description] of OBJECTIVES) {
    const ex = await admin.collection("strategic_objectives").getFirstListItem(`code = "${code}"`).catch(() => null);
    const data = { code, name, description: `${description} (Illustrative — align with RALGA's Strategic Plan.)`, sort: Number(code.slice(2)), active: true };
    so[code] = ex ? await daf.collection("strategic_objectives").update(ex.id, data) : await daf.collection("strategic_objectives").create(data);
  }

  const user = async (email) => admin.collection("users").getFirstListItem(`email = "${email}"`);
  const staffUser = await user("employee@dnr-hr.rw");
  const hodUser = await user("hod@dnr-hr.rw");
  const aline = await as("employee@dnr-hr.rw");
  const solange = await as("hod@dnr-hr.rw");
  const sg = await as("director@dnr-hr.rw");
  const period = async (type, date) => aline.send(`/api/ims/plans/period?type=${type}&date=${date}`, {});
  const today = day(0);
  const fy = await period("annual", today);
  const q = await period("quarterly", today);
  const m = await period("monthly", today);
  const nm = await period("monthly", addDays(m.end, 1));
  const lw = await period("weekly", addDays(today, -7));
  const tw = await period("weekly", today);
  let plans = 0;
  let deptPlans = 0;

  // ---------------------------------------------------------------- department plans
  async function departmentPlan(head, headId, p, focus, activities) {
    const r = await plan(head, headId, "department", p.start, focus, activities.map((a) => act(a.title, { ...a, due: a.due || p.end })));
    await approve(head, sg, r.id, "Approved. Share it with the team.");
    deptPlans++;
    const full = await admin.collection("work_plans").getOne(r.id);
    return { id: r.id, da: Object.fromEntries(full.items.map((i) => [i.code, i.id])) };
  }
  const cbOct = await departmentPlan(solange, hodUser.id, m, "District PFM training and the budgeting guide", [
    { title: "District PFM training (Rulindo, Gakenke)", output: "District finance staff trained on PFM", indicator: "Finance staff trained", unit: "People", target: 40, weight: 40, so: "SO2", evidence: "Attendance list", cost: 2400000 },
    { title: "Local government budgeting guide", output: "Chapters drafted and reviewed", indicator: "Chapters drafted", unit: "Chapters", target: 3, weight: 25, so: "SO3", evidence: "Report" },
    { title: "District planning support visits", output: "Districts supported on their plans", indicator: "Districts visited", unit: "Districts", target: 6, weight: 20, so: "SO2", evidence: "Field visit report", cost: 900000 },
    { title: "Monthly directorate report", output: "Report to the Secretary General", indicator: "Report submitted", unit: "Reports", target: 1, weight: 15, so: "SO5", evidence: "Report" },
  ]);
  const cbNov = await departmentPlan(solange, hodUser.id, nm, "Gakenke training and budgeting guide chapters", [
    { title: "District PFM training (Gakenke)", output: "District finance staff trained on PFM", indicator: "Finance staff trained", unit: "People", target: 24, weight: 40, so: "SO2", evidence: "Attendance list", cost: 1800000 },
    { title: "Local government budgeting guide", output: "Chapters drafted and reviewed", indicator: "Chapters drafted", unit: "Chapters", target: 2, weight: 25, so: "SO3", evidence: "Report" },
    { title: "District planning support visits", output: "Districts supported on their plans", indicator: "Districts visited", unit: "Districts", target: 6, weight: 20, so: "SO2", evidence: "Field visit report", cost: 900000 },
    { title: "Monthly directorate report", output: "Report to the Secretary General", indicator: "Report submitted", unit: "Reports", target: 1, weight: 15, so: "SO5", evidence: "Report" },
  ]);
  const claudine = daf;
  const fin = await departmentPlan(claudine, (await user("finance@dnr-hr.rw")).id, m, "Monthly close, payments and Q1 budget execution", [
    { title: "Bank reconciliations of the month", output: "All accounts reconciled", indicator: "Accounts reconciled", unit: "Accounts", target: 3, weight: 40, so: "SO5", evidence: "Report", due: within(m, 14) },
    { title: "Supplier payments processed within 30 days", output: "Approved vouchers paid", indicator: "Payments made", unit: "Payments", target: 40, weight: 35, so: "SO5", evidence: "Financial report" },
    { title: "Q1 budget execution report", output: "Report to management", indicator: "Report completed", unit: "Percent (%)", target: 100, weight: 25, so: "SO5", evidence: "Financial report" },
  ]);

  // ---------------------------------------------------------------- Aline: the plans in the design
  // Annual contract assigned by the head of department from the strategic plan.
  const annual = await solange.send("/api/ims/plans/assign", {
    method: "POST",
    body: {
      staff: staffUser.id, plan_type: "annual", date: fy.start, focus: "Strengthen the leadership skills of newly elected councillors and district staff.",
      source: "RALGA Strategic Plan 2024–2029 · Capacity Building Directorate", instructions: "Agreed in the October planning meeting. Keep the evaluation forms for the mid-year review.",
      items: [
        obj("Train newly elected councillors on their roles and responsibilities", "Councillors trained", "People", 0, 300, 35, [1, 2, 3], "SO2", "Attendance list", "Induction training delivered in 10 districts"),
        obj("Publish practical guides for district councils", "Guides published and distributed", "Documents", 1, 4, 25, [2, 4], "SO3", "Publication", "Guides on budgeting, oversight and citizen participation"),
        obj("Run peer-learning exchanges between districts", "Exchange visits held", "Visits", 2, 6, 20, [2, 3, 4], "SO2", "Field visit report", "Exchange visits on local economic development"),
        obj("Measure the effect of the training on council work", "Councils assessed after training", "Districts", 0, 10, 20, [4], "SO5", "Report", "Post-training assessment"),
      ],
    },
  });
  plans++;
  await progress(aline, annual.id, [{ status: "in_progress", actual: 135 }, { status: "in_progress", progress: 25 }, { status: "in_progress", progress: 30 }]);
  await issue(aline, annual.id, "District budget data for three districts not received yet", "medium", "Nyabihu, Ngororero and Rutsiro have not shared their budget execution data; the guide's examples depend on it.");
  await issue(aline, annual.id, "Training venue costs above the budget line", "high", "Hotel quotes for the Q3 sessions are 18% above the budget line; the DAF is looking at a virement.");

  // The quarter, cascaded from the contract, completed and approved.
  const quarter = await send(aline, annual.id, "cascade", { date: today, focus: "Q2 outputs — PFM training and budgeting guide" });
  {
    const d = await admin.collection("work_plans").getOne(quarter.id);
    const qt = { 0: ["120", 45], 1: ["1", 30], 2: ["2", 25] };
    await aline.collection("work_plans").update(quarter.id, { items: balance(d.items.map((i, k) => ({ ...i, target: (qt[k] || [i.target])[0], weight: (qt[k] || [0, i.weight])[1], cost: k === 0 ? 18500000 : k === 2 ? 6200000 : 0 }))) });
  }
  await approve(aline, solange, quarter.id, "Approved.");
  plans++;
  await progress(aline, quarter.id, [{ status: "in_progress", actual: 48 }, { status: "in_progress", progress: 20 }, { status: "in_progress", progress: 15 }]);
  await issue(aline, quarter.id, "Printing of the budgeting guide delayed by the supplier", "medium");

  // Her own month, linked to the department activities.
  const month = await plan(aline, staffUser.id, "monthly", m.start, `${m.label} activities`, [
    act("Train Rulindo district finance staff", { output: "Finance staff trained on PFM", indicator: "Number of finance staff trained", unit: "People", target: 16, weight: 40, due: within(m, 22), so: "SO2", evidence: "Attendance list", cost: 350000, priority: "high", dp: cbOct.id, da: cbOct.da["DA-01"] }),
    act("Draft chapter 2 of the budgeting guide", { output: "Draft chapter shared for comments", indicator: "Chapter drafted", unit: "Chapters", target: 1, weight: 30, due: within(m, 29), so: "SO3", evidence: "Report", dp: cbOct.id, da: cbOct.da["DA-02"] }),
    act("Monthly activity report to the head of department", { output: "Report submitted", indicator: "Report submitted", unit: "Reports", target: 1, weight: 30, due: m.end, so: "SO5", evidence: "Report" }),
  ], quarter.id);
  await approve(aline, solange, month.id, "Approved. Coordinate transport with the logistics unit early.");
  plans++;
  await progress(aline, month.id, [{ status: "in_progress", actual: 8 }, { status: "done", actual: 1 }, { status: "in_progress", progress: 20 }]);
  await issue(aline, month.id, "Rulindo district postponed the finance staff session by one week", "high", "The district council meeting moved to the training dates; the session is now planned for the last week of the month.");

  // Last week: reported and assessed.
  const last = await plan(aline, staffUser.id, "weekly", lw.start, "Rulindo training logistics", [
    wk("Book the training venue and transport for Rulindo", ["mon"], "Venue and transport booked", "high"),
    wk("Prepare the participants' list with the district", ["tue", "wed"], "List of 16 finance staff"),
    wk("Print the evaluation forms and attendance lists", ["wed"], "Forms printed"),
    wk("Write the weekly report", ["fri"], "Weekly report"),
  ], month.id);
  await approve(aline, solange, last.id, "OK.");
  plans++;
  {
    const ll = await admin.collection("work_plans").getOne(last.id);
    await send(aline, last.id, "report", {
      report_summary: "All logistics for the Rulindo session are ready: venue and transport booked, the list of 16 finance staff agreed with the district, forms printed. The weekly report was shared on Friday.",
      challenges: "The district changed two participants at the last minute.", next_steps: "Confirm the final list on Monday; print the training manuals.", self_rating: 4,
      items: ll.items.map((i) => ({ id: i.id, status: "done" })),
    });
  }
  await send(solange, last.id, "assess", { rating: 4, feedback: "Well organised. Share the participants' list with Finance for the per diems." });

  // This week, in progress.
  const week = await plan(aline, staffUser.id, "weekly", tw.start, "Rulindo preparation and the budgeting guide", [
    wk("Confirm the venue and the participants' list with Rulindo district", ["mon", "tue"], "Final list confirmed", "high"),
    wk("Print the training manuals and the evaluation forms", ["tue"], "60 manuals"),
    wk("Draft chapter 2 of the budgeting guide", ["wed", "thu"], "Draft chapter"),
    wk("Weekly team meeting and report", ["fri"], "Weekly report"),
  ], month.id);
  await approve(aline, solange, week.id, "Approved.");
  plans++;
  await progress(aline, week.id, [{ status: "done" }, { status: "done" }, { status: "in_progress", progress: 28 }]);
  await issue(aline, week.id, "Venue not confirmed by Rulindo district", "medium");

  // A task from the Secretary General.
  const nextMonday = addDays(tw.start, 7);
  await sg.send("/api/ims/plans/assign", {
    method: "POST",
    body: {
      staff: staffUser.id, plan_type: "task", start: nextMonday, end: addDays(nextMonday, 11), title: "Support Gakenke district budget hearings",
      instructions: "Coordinate with the district planner; send me the hearing report by the last day.",
      items: [
        { title: "Agree the agenda and the participants' list with Gakenke district", output: "Agenda agreed", due: addDays(nextMonday, 2), priority: "high" },
        { title: "Facilitate the budget hearings", output: "Hearings held in 3 sectors", indicator: "Sectors covered", unit: "Sessions", target: "3", due: addDays(nextMonday, 9) },
        { title: "Hearing report with recommendations", output: "Report to the Secretary General", due: addDays(nextMonday, 11) },
      ],
    },
  });
  plans++;

  // ---------------------------------------------------------------- Capacity Building colleagues
  const colleagues = { david: await user("david.uwimana7@dnr-hr.rw"), denise: await user("denise.tuyishime.17@dnr-hr.rw") };
  const david = await as(colleagues.david.email);
  const denise = await as(colleagues.denise.email);
  const dMonth = await plan(david, colleagues.david.id, "monthly", m.start, "Gakenke training and district visits", [
    act("Train Gakenke district finance staff", { output: "Finance staff trained", indicator: "Finance staff trained", unit: "People", target: 12, weight: 45, due: within(m, 27), so: "SO2", evidence: "Attendance list", cost: 300000, dp: cbOct.id, da: cbOct.da["DA-01"] }),
    act("Planning support visits to Northern Province districts", { output: "Districts supported", indicator: "Districts visited", unit: "Districts", target: 4, weight: 35, due: within(m, 28), so: "SO2", evidence: "Field visit report", cost: 450000, dp: cbOct.id, da: cbOct.da["DA-03"] }),
    act("Prepare the directorate's monthly report", { output: "Report for the Secretary General", indicator: "Report submitted", unit: "Reports", target: 1, weight: 20, due: m.end, so: "SO5", evidence: "Report", dp: cbOct.id, da: cbOct.da["DA-04"] }),
  ]);
  await approve(david, solange, dMonth.id);
  await progress(david, dMonth.id, [{ status: "in_progress", actual: 5 }, { status: "in_progress", actual: 3 }]);
  const nMonth = await plan(denise, colleagues.denise.id, "monthly", m.start, "Rulindo training and the guide's review", [
    act("Co-facilitate the Rulindo finance staff training", { output: "Finance staff trained", indicator: "Finance staff trained", unit: "People", target: 12, weight: 40, due: within(m, 22), so: "SO2", evidence: "Attendance list", dp: cbOct.id, da: cbOct.da["DA-01"] }),
    act("Draft chapter 3 of the budgeting guide", { output: "Draft chapter", indicator: "Chapter drafted", unit: "Chapters", target: 1, weight: 35, due: within(m, 29), so: "SO3", evidence: "Report", dp: cbOct.id, da: cbOct.da["DA-02"] }),
    act("Planning support visits to Rulindo and Burera", { output: "Districts supported", indicator: "Districts visited", unit: "Districts", target: 2, weight: 25, due: within(m, 20), so: "SO2", evidence: "Field visit report", dp: cbOct.id, da: cbOct.da["DA-03"] }),
  ]);
  await approve(denise, solange, nMonth.id);
  await progress(denise, nMonth.id, [{ status: "in_progress", actual: 3 }, { status: "in_progress", progress: 0 }, { status: "in_progress", actual: 1 }]);
  plans += 2;
  // next month: one plan approved, one waiting for the head
  const dNov = await plan(david, colleagues.david.id, "monthly", nm.start, "Gakenke training", [
    act("Train Gakenke district finance staff (second group)", { output: "Finance staff trained", indicator: "Finance staff trained", unit: "People", target: 12, weight: 60, due: within(nm, 18), so: "SO2", evidence: "Attendance list", dp: cbNov.id, da: cbNov.da["DA-01"] }),
    act("Planning support visits to Western Province districts", { output: "Districts supported", indicator: "Districts visited", unit: "Districts", target: 3, weight: 40, due: within(nm, 25), so: "SO2", evidence: "Field visit report", dp: cbNov.id, da: cbNov.da["DA-03"] }),
  ]);
  await approve(david, solange, dNov.id);
  const nNov = await plan(denise, colleagues.denise.id, "monthly", nm.start, "District visits and the directorate report", [
    act("Planning support visits to Southern Province districts", { output: "Districts supported", indicator: "Districts visited", unit: "Districts", target: 3, weight: 70, due: within(nm, 26), so: "SO2", evidence: "Field visit report", dp: cbNov.id, da: cbNov.da["DA-03"] }),
    act("Prepare the directorate's monthly report", { output: "Report for the Secretary General", indicator: "Report submitted", unit: "Reports", target: 1, weight: 30, due: nm.end, so: "SO5", evidence: "Report", dp: cbNov.id, da: cbNov.da["DA-04"] }),
  ]);
  await send(denise, nNov.id, "submit");
  plans += 2;
  // this week: waiting for the head; last week: one report to assess
  for (const [c, u, focus, items] of [
    [david, colleagues.david, "Training logistics for Gakenke", [wk("Book transport for the facilitators", ["mon", "tue"], "", "high"), wk("Prepare the per diem list for approval", ["wed"]), wk("Weekly report", ["fri"], "Weekly report")]],
    [denise, colleagues.denise, "Follow-up of the capacity building programme", [wk("Update the training database with the Rulindo participants", ["mon", "tue"], "", "high"), wk("Call the districts on the next sessions", ["wed"]), wk("Weekly report", ["fri"], "Weekly report")]],
  ]) {
    const p = await plan(c, u.id, "weekly", tw.start, focus, items);
    await send(c, p.id, "submit");
    plans++;
  }
  const dLast = await plan(david, colleagues.david.id, "weekly", lw.start, "Gicumbi training logistics", [wk("Transport and accommodation for the facilitators", ["mon"], "", "high"), wk("Per diem payments list", ["thu"])]);
  await approve(david, solange, dLast.id);
  {
    const lp = await admin.collection("work_plans").getOne(dLast.id);
    await send(david, dLast.id, "report", { report_summary: "Transport and accommodation were ready on time; the per diem list was sent to Finance on Thursday.", self_rating: 4, items: lp.items.map((x) => ({ id: x.id, status: "done" })) });
  }
  plans++;

  // The head of department: her month and week approved by the SG, her annual contract waiting for the SG.
  const sMonth = await plan(solange, hodUser.id, "monthly", m.start, "Directorate coordination and partner funding", [
    act("Coordinate the PFM training in Rulindo and Gakenke", { output: "Both sessions delivered", indicator: "Sessions delivered", unit: "Sessions", target: 2, weight: 40, due: within(m, 28), so: "SO2", evidence: "Report" }),
    act("Partner meeting on the capacity building programme", { output: "Funding proposal discussed", indicator: "Meetings held", unit: "Meetings", target: 1, weight: 35, due: within(m, 15), so: "SO4", evidence: "Minutes" }),
    act("Review the budgeting guide chapters", { output: "Comments returned to the authors", indicator: "Chapters reviewed", unit: "Chapters", target: 2, weight: 25, due: m.end, so: "SO3", evidence: "Report" }),
  ]);
  await approve(solange, sg, sMonth.id);
  await progress(solange, sMonth.id, [{ status: "in_progress", progress: 50 }, { status: "done" }, { status: "in_progress", progress: 25 }]);
  const sWeek = await plan(solange, hodUser.id, "weekly", tw.start, "Team plans and the partner proposal", [wk("Approve the team's weekly plans", ["mon"], "Plans approved", "high"), wk("Finalise the partner funding proposal", ["tue", "wed"], "Proposal sent"), wk("Directorate meeting", ["thu"], "Minutes")]);
  await approve(solange, sg, sWeek.id);
  await progress(solange, sWeek.id, [{ status: "done" }, { status: "in_progress", progress: 50 }]);
  const sAnnual = await plan(solange, hodUser.id, "annual", fy.start, "Lead the capacity building programme for local leaders", [
    obj("Deliver the induction programme for all newly elected councillors", "Districts covered", "Districts", 0, 30, 40, [1, 2, 3], "SO2", "Report", "Induction in every district"),
    obj("Mobilise partner funding for the capacity building programme", "Partner funding secured", "RWF", 320000000, 450000000, 35, [2, 3, 4], "SO4", "Signed document", "Signed agreements"),
    obj("Introduce a training evaluation framework", "Framework adopted", "Documents", 0, 1, 25, [3, 4], "SO5", "Minutes", "Framework adopted by management"),
  ]);
  await send(solange, sAnnual.id, "submit");
  plans += 3;

  // ---------------------------------------------------------------- every other demo login
  const PROFILES = [
    { email: "finance@dnr-hr.rw", focus: "Sound financial management and a clean audit", objectives: [
      obj("Close the FY 2025/26 accounts and obtain the audit opinion", "Audited financial statements", "Reports", 0, 1, 40, [1, 2], "SO5", "Report", "Unqualified audit opinion", 1),
      obj("Keep budget execution within the approved budget", "Budget execution rate", "Percent (%)", 88, 95, 35, [1, 2, 3, 4], "SO5", "Financial report", "Quarterly execution reports", 95),
      obj("Pay suppliers within 30 days", "Invoices paid within 30 days", "Percent (%)", 70, 90, 25, [1, 2, 3, 4], "SO5", "Financial report", "Payment register", 85),
    ], annual: [{ status: "in_progress", progress: 45 }, { status: "in_progress", progress: 30 }, { status: "in_progress", progress: 20 }], quarter: [{ status: "in_progress", progress: 40 }, { status: "in_progress", progress: 25 }, { status: "in_progress", progress: 20 }],
      month: () => [
        act("Approve the bank reconciliations", { output: "Reconciliations approved", indicator: "Reconciliations approved", unit: "Accounts", target: 3, weight: 40, due: within(m, 15), so: "SO5", evidence: "Report" }),
        act("Present the Q1 budget execution report to management", { output: "Report presented", indicator: "Report presented", unit: "Reports", target: 1, weight: 35, due: within(m, 25), so: "SO5", evidence: "Minutes" }),
        act("Prepare the virement for the training venue costs", { output: "Virement approved", indicator: "Virement processed", unit: "Documents", target: 1, weight: 25, due: m.end, so: "SO5", evidence: "Signed document" }),
      ], monthProgress: [{ status: "done" }, { status: "in_progress", progress: 60 }, { status: "in_progress", progress: 20 }],
      week: [wk("Approve this week's payment vouchers", ["mon", "wed"], "Vouchers approved", "high"), wk("Budget committee meeting", ["tue"], "Minutes"), wk("Review the September reconciliations", ["thu"], "Reconciliations approved")] },
    { email: "accountant@dnr-hr.rw", focus: "Timely, accurate accounting records", objectives: [
      obj("Reconcile every bank account by the 10th of the month", "Accounts reconciled by the 10th", "Percent (%)", 80, 100, 40, [1, 2, 3, 4], "SO5", "Report", "Monthly reconciliations", 100),
      obj("Prepare the annual financial statements", "Financial statements prepared", "Reports", 0, 1, 35, [1, 2], "SO5", "Financial report", "Draft statements for audit", 1),
      obj("Close the audit recommendations on accounting", "Recommendations closed", "Number", 0, 6, 25, [2, 3, 4], "SO5", "Report", "Recommendations implemented", 2),
    ], annual: [{ status: "in_progress", progress: 35 }, { status: "in_progress", progress: 40 }, { status: "in_progress", progress: 10 }], quarter: [{ status: "in_progress", progress: 30 }, { status: "in_progress", progress: 35 }, { status: "in_progress", actual: 1 }],
      month: () => [
        act("Reconcile the operating, restricted and petty cash accounts", { output: "Reconciliation statements", indicator: "Accounts reconciled", unit: "Accounts", target: 3, weight: 45, due: within(m, 10), so: "SO5", evidence: "Report", dp: fin.id, da: fin.da["DA-01"] }),
        act("Record the month's supplier invoices", { output: "Invoices recorded", indicator: "Invoices recorded", unit: "Documents", target: 35, weight: 30, due: within(m, 28), so: "SO5", evidence: "Financial report" }),
        act("Monthly closing journal entries", { output: "Month closed", indicator: "Closing entries posted", unit: "Percent (%)", target: 100, weight: 25, due: m.end, so: "SO5", evidence: "Financial report" }),
      ], monthProgress: [{ status: "in_progress", actual: 2 }, { status: "in_progress", actual: 28 }, { status: "in_progress", progress: 60 }],
      week: [wk("Post the bank statement lines", ["mon"], "", "high"), wk("Reconcile the restricted donor account", ["tue", "wed"], "Reconciliation statement"), wk("Prepare the vouchers for approval", ["thu", "fri"], "Vouchers ready")] },
    { email: "budget@dnr-hr.rw", focus: "Budget preparation and control", objectives: [
      obj("Prepare the FY 2027/28 budget", "Budget submitted to the board", "Documents", 0, 1, 40, [2, 3, 4], "SO5", "Signed document", "Board-approved budget", 1),
      obj("Publish the monthly budget execution reports", "Reports published", "Reports", 0, 12, 35, [1, 2, 3, 4], "SO5", "Financial report", "Monthly reports", 3),
      obj("Check every requisition against the budget within 2 days", "Requisitions checked within 2 days", "Percent (%)", 75, 95, 25, [1, 2, 3, 4], "SO5", "Report", "Budget control log", 90),
    ], annual: [{ status: "in_progress", progress: 15 }, { status: "in_progress", actual: 3 }, { status: "in_progress", progress: 30 }], quarter: [{ status: "in_progress", progress: 10 }, { status: "in_progress", actual: 1 }, { status: "in_progress", progress: 20 }],
      month: () => [
        act("Q1 budget execution report", { output: "Report for management", indicator: "Report completed", unit: "Percent (%)", target: 100, weight: 45, due: within(m, 20), so: "SO5", evidence: "Financial report", dp: fin.id, da: fin.da["DA-03"] }),
        act("Budget calendar for FY 2027/28", { output: "Calendar circulated", indicator: "Calendar approved", unit: "Documents", target: 1, weight: 30, due: within(m, 25), so: "SO5", evidence: "Minutes" }),
        act("Check the month's requisitions against the budget", { output: "Requisitions checked", indicator: "Requisitions checked", unit: "Number", target: 25, weight: 25, due: m.end, so: "SO5", evidence: "Report" }),
      ], monthProgress: [{ status: "in_progress", progress: 60 }, { status: "in_progress", progress: 20 }, { status: "in_progress", actual: 12 }],
      week: [wk("Draft the Q1 execution report", ["mon", "tue"], "Draft report", "high"), wk("Budget checks on new requisitions", ["wed"], "Checks done"), wk("Prepare the budget calendar", ["thu", "fri"], "Draft calendar")], lastOpen: true },
    { email: "cashier@dnr-hr.rw", focus: "Reliable payments and cash management", objectives: [
      obj("Pay approved vouchers within 5 days", "Vouchers paid within 5 days", "Percent (%)", 80, 95, 40, [1, 2, 3, 4], "SO5", "Financial report", "Payment register", 95),
      obj("Count and reconcile petty cash every month", "Petty cash counts", "Reports", 0, 12, 30, [1, 2, 3, 4], "SO5", "Signed document", "Cash count sheets", 3),
      obj("Close the cash book every day", "Days closed on time", "Percent (%)", 90, 100, 30, [1, 2, 3, 4], "SO5", "Report", "Daily cash book", 100),
    ], annual: [{ status: "in_progress", progress: 30 }, { status: "in_progress", actual: 3 }, { status: "in_progress", progress: 28 }], quarter: [{ status: "in_progress", progress: 20 }, { status: "in_progress", actual: 1 }, { status: "in_progress", progress: 15 }],
      month: () => [
        act("Pay the approved supplier vouchers", { output: "Suppliers paid", indicator: "Payments made", unit: "Payments", target: 40, weight: 50, due: m.end, so: "SO5", evidence: "Financial report", dp: fin.id, da: fin.da["DA-02"] }),
        act("Petty cash count and replenishment", { output: "Count sheet signed", indicator: "Counts done", unit: "Reports", target: 1, weight: 25, due: within(m, 25), so: "SO5", evidence: "Signed document" }),
        act("Daily cash book closing", { output: "Cash book closed", indicator: "Days closed", unit: "Days", target: 22, weight: 25, due: m.end, so: "SO5", evidence: "Report" }),
      ], monthProgress: [{ status: "in_progress", actual: 26 }, { status: "not_started" }, { status: "in_progress", actual: 7 }],
      week: [wk("Pay the vouchers approved on Friday", ["mon"], "Payments made", "high"), wk("Bank deposit of the receipts", ["tue"], "Deposit slip"), wk("Petty cash replenishment request", ["thu"], "Request sent")] },
    { email: "stores@dnr-hr.rw", focus: "Stores, logistics and fixed assets", objectives: [
      obj("Run the quarterly stock counts", "Stock counts done", "Reports", 0, 4, 40, [1, 2, 3, 4], "SO5", "Signed document", "Count sheets", 1),
      obj("Tag and record every fixed asset", "Assets tagged and recorded", "Number", 310, 450, 35, [1, 2, 3, 4], "SO5", "Report", "Updated asset register", 360),
      obj("Deliver requested items within 3 days", "Requests served within 3 days", "Percent (%)", 75, 90, 25, [1, 2, 3, 4], "SO5", "Report", "Issue register", 85),
    ], annual: [{ status: "in_progress", actual: 1 }, { status: "in_progress", progress: 30 }, { status: "in_progress", progress: 40 }], quarter: [{ status: "in_progress", progress: 0 }, { status: "in_progress", progress: 30 }, { status: "in_progress", progress: 40 }],
      month: () => [
        act("Tag the new ICT equipment", { output: "Equipment tagged", indicator: "Items tagged", unit: "Number", target: 40, weight: 40, due: within(m, 20), so: "SO5", evidence: "Report" }),
        act("Issue the stationery requests", { output: "Requests served", indicator: "Requests served", unit: "Number", target: 30, weight: 35, due: m.end, so: "SO5", evidence: "Report" }),
        act("Prepare the Q2 stock count", { output: "Count plan", indicator: "Plan ready", unit: "Documents", target: 1, weight: 25, due: m.end, so: "SO5", evidence: "Report" }),
      ], monthProgress: [{ status: "in_progress", actual: 30 }, { status: "in_progress", actual: 20 }, { status: "in_progress", progress: 40 }],
      week: [wk("Tag the laptops received last week", ["mon", "tue"], "Laptops tagged", "high"), wk("Deliver the stationery orders", ["wed"], "Orders delivered"), wk("Update the asset register", ["thu", "fri"], "Register updated")] },
    { email: "hr@dnr-hr.rw", focus: "People management and staff development", objectives: [
      obj("Run the annual performance appraisal cycle", "Staff appraised", "Percent (%)", 60, 100, 40, [1, 2, 3, 4], "SO5", "Report", "Appraisal reports", 30),
      obj("Fill the approved vacancies", "Vacancies filled", "People", 0, 8, 35, [1, 2, 3, 4], "SO5", "Signed document", "Signed contracts", 2),
      obj("Deliver the staff training plan", "Training sessions held", "Sessions", 0, 12, 25, [1, 2, 3, 4], "SO2", "Attendance list", "Training reports", 3),
    ], annual: [{ status: "in_progress", progress: 35 }, { status: "in_progress", actual: 3 }, { status: "in_progress", actual: 2 }], quarter: [{ status: "in_progress", progress: 40 }, { status: "in_progress", actual: 1 }, { status: "in_progress", actual: 1 }],
      month: () => [
        act("Q3 appraisal reviews with the heads of department", { output: "Reviews completed", indicator: "Reviews completed", unit: "People", target: 64, weight: 40, due: within(m, 27), so: "SO5", evidence: "Report" }),
        act("Recruitment of two programme officers", { output: "Candidates selected", indicator: "Candidates selected", unit: "People", target: 2, weight: 35, due: m.end, so: "SO5", evidence: "Minutes" }),
        act("October payroll and leave records", { output: "Payroll ready for approval", indicator: "Payroll prepared", unit: "Percent (%)", target: 100, weight: 25, due: within(m, 24), so: "SO5", evidence: "Financial report" }),
      ], monthProgress: [{ status: "in_progress", actual: 41 }, { status: "in_progress", progress: 50 }, { status: "in_progress", progress: 90 }],
      week: [wk("Interview the shortlisted candidates", ["mon", "tue"], "Interview reports", "high"), wk("Follow up the appraisal reviews", ["wed"], "Reviews done"), wk("Prepare the October payroll", ["thu", "fri"], "Payroll draft")] },
    { email: "procurement@dnr-hr.rw", focus: "Value for money in procurement", objectives: [
      obj("Execute the annual procurement plan", "Plan executed", "Percent (%)", 0, 90, 40, [1, 2, 3, 4], "SO5", "Report", "Procurement plan execution report", 40),
      obj("Award tenders within 60 days", "Tenders awarded within 60 days", "Percent (%)", 65, 85, 35, [1, 2, 3, 4], "SO5", "Report", "Tender register", 80),
      obj("Evaluate supplier performance", "Supplier evaluations", "Number", 0, 20, 25, [2, 3, 4], "SO5", "Report", "Evaluation forms", 6),
    ], annual: [{ status: "in_progress", progress: 25 }, { status: "in_progress", progress: 35 }, { status: "in_progress", actual: 4 }], quarter: [{ status: "in_progress", progress: 30 }, { status: "in_progress", progress: 30 }, { status: "in_progress", actual: 2 }],
      month: () => [
        act("Launch the tender for the training venues", { output: "Tender published", indicator: "Tenders launched", unit: "Documents", target: 1, weight: 40, due: within(m, 14), so: "SO5", evidence: "Publication" }),
        act("Evaluate the laptop bids", { output: "Evaluation report", indicator: "Evaluations completed", unit: "Reports", target: 1, weight: 35, due: within(m, 25), so: "SO5", evidence: "Report" }),
        act("Supplier performance reviews", { output: "Reviews done", indicator: "Suppliers reviewed", unit: "Number", target: 5, weight: 25, due: m.end, so: "SO5", evidence: "Report" }),
      ], monthProgress: [{ status: "done" }, { status: "in_progress", progress: 50 }, { status: "in_progress", actual: 2 }],
      week: [wk("Opening of the laptop bids", ["mon"], "Bid opening minutes", "high"), wk("Evaluation committee meetings", ["tue", "wed"], "Draft evaluation report"), wk("Contract for the cleaning services", ["thu"], "Contract signed")] },
    { email: "admin@dnr-hr.rw", focus: "Reliable systems and the IMS roll-out", objectives: [
      obj("Keep the core systems available", "System availability", "Percent (%)", 97, 99.5, 40, [1, 2, 3, 4], "SO5", "Report", "Monitoring reports", 99.5),
      obj("Test the back-ups every month", "Back-up restore tests", "Reports", 0, 12, 30, [1, 2, 3, 4], "SO5", "Report", "Restore test reports", 3),
      obj("Roll out the IMS to every department", "Departments using the IMS", "Number", 2, 12, 30, [1, 2, 3], "SO5", "Report", "Go-live reports", 8),
    ], annual: [{ status: "in_progress", progress: 30 }, { status: "in_progress", actual: 3 }, { status: "in_progress", actual: 6 }], quarter: [{ status: "in_progress", progress: 30 }, { status: "in_progress", actual: 1 }, { status: "in_progress", actual: 4 }],
      month: () => [
        act("IMS training for the Procurement and HR teams", { output: "Teams trained", indicator: "People trained", unit: "People", target: 9, weight: 40, due: within(m, 22), so: "SO5", evidence: "Attendance list" }),
        act("October back-up restore test", { output: "Restore test report", indicator: "Restore tests", unit: "Reports", target: 1, weight: 30, due: within(m, 28), so: "SO5", evidence: "Report" }),
        act("Patch the servers", { output: "Servers patched", indicator: "Servers patched", unit: "Number", target: 6, weight: 30, due: m.end, so: "SO5", evidence: "Report" }),
      ], monthProgress: [{ status: "in_progress", actual: 7 }, { status: "done" }, { status: "in_progress", actual: 4 }],
      week: [wk("IMS training session for Procurement", ["mon", "tue"], "Session held", "high"), wk("Back-up restore test", ["wed"], "Test report"), wk("Server patching window", ["thu"], "Patching done")] },
    { email: "auditor@dnr-hr.rw", focus: "Independent assurance on risk and control", objectives: [
      obj("Deliver the annual audit plan", "Audits completed", "Number", 0, 8, 45, [1, 2, 3, 4], "SO5", "Report", "Audit reports", 2),
      obj("Follow up the audit recommendations", "Recommendations implemented", "Percent (%)", 55, 80, 30, [1, 2, 3, 4], "SO5", "Report", "Follow-up reports", 65),
      obj("Report to the audit committee", "Committee reports", "Reports", 0, 4, 25, [1, 2, 3, 4], "SO5", "Minutes", "Committee papers", 1),
    ], annual: [{ status: "in_progress", actual: 2 }, { status: "in_progress", progress: 35 }, { status: "in_progress", actual: 1 }], quarter: [{ status: "in_progress", progress: 40 }, { status: "in_progress", progress: 30 }, { status: "in_progress", progress: 0 }],
      month: () => [
        act("Audit of the payment vouchers (Q1)", { output: "Audit report", indicator: "Fieldwork completed", unit: "Percent (%)", target: 100, weight: 50, due: within(m, 27), so: "SO5", evidence: "Report" }),
        act("Follow up the procurement recommendations", { output: "Follow-up note", indicator: "Recommendations reviewed", unit: "Number", target: 8, weight: 30, due: m.end, so: "SO5", evidence: "Report" }),
        act("Audit committee paper", { output: "Paper submitted", indicator: "Paper submitted", unit: "Documents", target: 1, weight: 20, due: m.end, so: "SO5", evidence: "Minutes" }),
      ], monthProgress: [{ status: "in_progress", progress: 45 }, { status: "in_progress", actual: 3 }, { status: "not_started" }],
      week: [wk("Voucher sample testing", ["mon", "tue", "wed"], "Testing sheets", "high"), wk("Interview the cashier", ["thu"], "Interview notes"), wk("Weekly audit status note", ["fri"], "Status note")] },
    { email: "director@dnr-hr.rw", focus: "Deliver RALGA's strategic plan for the year", objectives: [
      obj("Implement the strategic plan's annual targets", "Annual targets achieved", "Percent (%)", 0, 85, 40, [1, 2, 3, 4], "SO5", "Report", "Annual report", 30),
      obj("Strengthen members' engagement", "General assemblies held", "Meetings", 0, 2, 30, [2, 4], "SO1", "Minutes", "Assembly resolutions", 1),
      obj("Mobilise resources for the programmes", "Funding secured", "RWF", 0, 1200000000, 30, [1, 2, 3, 4], "SO4", "Signed document", "Signed agreements", 300000000),
    ], annual: [{ status: "in_progress", progress: 32 }, { status: "in_progress", progress: 25 }, { status: "in_progress", actual: 380000000 }], quarter: [{ status: "in_progress", progress: 30 }, { status: "in_progress", progress: 10 }, { status: "in_progress", actual: 90000000 }],
      month: () => [
        act("Executive committee meeting", { output: "Resolutions adopted", indicator: "Meetings held", unit: "Meetings", target: 1, weight: 35, due: within(m, 16), so: "SO1", evidence: "Minutes" }),
        act("Partner round-table on local government finance", { output: "Commitments recorded", indicator: "Partners attending", unit: "Number", target: 8, weight: 35, due: within(m, 28), so: "SO4", evidence: "Report" }),
        act("Review the directorates' monthly reports", { output: "Feedback to directors", indicator: "Reports reviewed", unit: "Reports", target: 11, weight: 30, due: m.end, so: "SO5", evidence: "Report" }),
      ], monthProgress: [{ status: "done" }, { status: "in_progress", actual: 3 }, { status: "in_progress", actual: 2 }],
      week: [wk("Approve the department plans", ["mon"], "Plans approved", "high"), wk("Meeting with the Ministry of Local Government", ["tue"], "Meeting notes"), wk("Prepare the partner round-table", ["wed", "thu"], "Agenda and invitations")] },
  ];

  const ratings = [5, 4, 3, 4, 4, 3, 5, 4, 3, 4];
  for (const [k, prof] of PROFILES.entries()) {
    const u = await user(prof.email);
    const c = await as(prof.email);
    const sup = await supervisorOf(c);
    const a = await plan(c, u.id, "annual", fy.start, prof.focus, prof.objectives.map(({ q: _q, ...o }) => o));
    await approve(c, sup, a.id, "Agreed.");
    await progress(c, a.id, prof.annual);
    const cq = await send(c, a.id, "cascade", { date: today, focus: `${q.label.split(" · ")[0]} outputs` });
    {
      const d = await admin.collection("work_plans").getOne(cq.id);
      const byTitle = Object.fromEntries(prof.objectives.map((o) => [o.title, o]));
      await c.collection("work_plans").update(cq.id, { items: balance(d.items.map((i) => ({ ...i, target: byTitle[i.title]?.q || i.target }))) });
    }
    await approve(c, sup, cq.id);
    await progress(c, cq.id, prof.quarter);
    const mo = await plan(c, u.id, "monthly", m.start, `${m.label} activities`, prof.month(), cq.id);
    await approve(c, sup, mo.id);
    await progress(c, mo.id, prof.monthProgress);
    const lwp = await plan(c, u.id, "weekly", lw.start, "Last week's priorities", prof.week.map((w) => ({ ...w })), mo.id);
    await approve(c, sup, lwp.id);
    if (sup) {
      const ll = await admin.collection("work_plans").getOne(lwp.id);
      await send(c, lwp.id, "report", {
        report_summary: "The week's activities were completed as planned; the outputs are filed in the shared folder and the follow-up items are in this week's plan.",
        self_rating: 4, items: ll.items.map((i) => ({ id: i.id, status: "done" })),
      });
      if (!prof.lastOpen) await send(sup, lwp.id, "assess", { rating: ratings[k % ratings.length], feedback: "Good week — the outputs are clear and on time." });
    } else {
      await progress(c, lwp.id, prof.week.map(() => ({ status: "done" })));
    }
    const twp = await plan(c, u.id, "weekly", tw.start, "This week's priorities", prof.week.map((w) => ({ ...w })), mo.id);
    await approve(c, sup, twp.id);
    await progress(c, twp.id, [{ status: "done" }, { status: "in_progress", progress: 40 + (k % 3) * 15 }]);
    plans += 5;
  }

  // ---------------------------------------------------------------- an attendance correction waiting for HR
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

  console.log(`  ✓ ${OBJECTIVES.length} strategic objectives; ${deptPlans} department plans (Capacity Building ${m.label} and ${nm.label}, Finance and Administration ${m.label}) approved by the SG`);
  console.log(`  ✓ ${plans} staff plans: Aline's contract (assigned), quarter (cascaded), month linked to department activities, two weeks and a task from the SG; plans for every demo login`);
  console.log("  ✓ waiting: 4 for the head of Capacity Building, the head's contract for the SG; issues on Aline's plans; 1 attendance correction for HR");
}

main().catch((e) => {
  console.error("❌ Workspace seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
