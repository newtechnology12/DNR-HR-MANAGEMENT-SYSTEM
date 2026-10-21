#!/usr/bin/env node
/**
 * HR demo data: role rights for leave / payroll / appraisals, salary structures, 2026 leave plans,
 * the payroll approval workflow and payroll runs (through the API, by real users, so separation of
 * duties is exercised), and an appraisal cycle with reviews, shared results and claims.
 *
 * Run last (`npm run seed:ralga` / `npm run seed:demo` do it). Re-running replaces this data.
 */
import PocketBase from "pocketbase";
import { ROLE } from "./ims/roles.mjs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}).`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
let seed = 31;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const round = (n, step = 1000) => Math.round(n / step) * step;
const YEAR = new Date().getFullYear();

async function login(email) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, "password123");
  return pb;
}
async function wipe(name, filter = "") {
  const rows = await admin.collection(name).getFullList({ fields: "id", filter });
  for (const r of rows) await admin.collection(name).delete(r.id).catch(() => null);
}

// Leave, payroll and appraisal rights and HR visibility come from the IMS permission matrix
// (seed-demo.mjs / scripts/ims/roles.mjs).

// ------------------------------------------------------------------ salaries
const BANKS = ["Bank of Kigali", "I&M Bank Rwanda", "Equity Bank Rwanda", "BPR Bank Rwanda", "Access Bank Rwanda"];
/** Grade from the job title (illustrative scale: E executive, M management, P professional, S support). */
function gradeOf(title) {
  if (/^Secretary General/i.test(title)) return "E1";
  if (/Deputy Secretary General/i.test(title)) return "E2";
  if (/Director|Head of|Manager|Legal Advisor/i.test(title)) return "M1";
  if (/Chief|Specialist|Analyst|Coordinator|Advisor/i.test(title)) return "P2";
  if (/Officer|Accountant|Administrator/i.test(title)) return "P3";
  if (/Assistant/i.test(title)) return "S2";
  return "P4";
}

async function salaries(users) {
  await wipe("salary_structures");
  const titles = Object.fromEntries((await admin.collection("designations").getFullList({ fields: "id,name" })).map((d) => [d.id, d.name]));
  const fund = Object.fromEntries((await admin.collection("funding_sources").getFullList({ fields: "id,code" })).map((x) => [x.code, x.id]));
  const proj = Object.fromEntries((await admin.collection("projects").getFullList({ fields: "id,code" })).map((x) => [x.code, x.id]));
  // Donor-funded staff: part of the salary is charged to the programme (and its budget lines).
  const splitOf = (u) => {
    const title = titles[u.designation] || "";
    if (u.email === "employee@dnr-hr.rw") return [{ funding_source: fund.MC, project: "", percent: 70 }, { funding_source: fund["DP-CB"], project: proj["CB-01"], percent: 30 }];
    if (/^(david\.uwimana7|denise\.tuyishime\.17)@/.test(u.email)) return [{ funding_source: fund.MC, project: "", percent: 50 }, { funding_source: fund["DP-CB"], project: proj["CB-01"], percent: 50 }];
    if (/Local Economic Development/i.test(title)) return [{ funding_source: fund["DP-LED"], project: proj["LED-01"], percent: 100 }];
    return [];
  };
  let n = 0;
  let donor = 0;
  for (const u of users) {
    const total = Number(String(u.salary || "").replace(/[^0-9.]/g, "")) || int(350, 2500) * 1000;
    const casual = u.email.endsWith("@dnr-hr.rw") ? false : rand() < 0.06;
    const basic = round(total * (casual ? 1 : 0.7));
    const transport = casual ? 0 : round(total * 0.1);
    const housing = casual ? 0 : round(total * 0.15);
    const communication = casual ? 0 : Math.max(0, round(total - basic - transport - housing));
    await admin.collection("salary_structures").create({
      employee: u.id, employment_type: casual ? "casual" : u.employment_type === "contract" ? "contract" : u.employment_type === "internship" ? "internship" : "permanent",
      basic_salary: basic, transport_allowance: transport, housing_allowance: housing, communication_allowance: communication,
      other_allowances: rand() < 0.15 ? [{ name: "Responsibility allowance", amount: round(total * 0.05), taxable: true, pensionable: true }] : [],
      recurring_deductions: rand() < 0.12 ? [{ name: "Staff savings (SACCO)", amount: round(total * 0.03) }] : [],
      rssb_number: `${int(1000000, 9999999)}${pick(["A", "B", "C"])}`, tin: String(int(100000000, 199999999)), payment_method: "bank",
      bank_name: pick(BANKS), bank_account: `${int(1000, 4999)}${int(10000000, 99999999)}`, active: true,
      effective_from: `${YEAR}-01-01 12:00:00.000Z`, grade: gradeOf(titles[u.designation] || ""), funding_split: splitOf(u),
    });
    n++;
    if (splitOf(u).length) donor++;
  }
  console.log(`  ✓ salary structures: ${n} (grades from the job titles; ${donor} donor-funded staff with a funding split)`);
}

// ------------------------------------------------------------------ leave plans
async function leavePlans(hr) {
  await wipe("leave_plans");
  const b = await hr.send(`/api/dnr/leave/balances?year=${YEAR}`, {});
  const rows = b.items.map((r) => {
    const months = {};
    let left = Math.max(0, Math.floor(r.entitlement) - int(0, 3));
    // Typical pattern: a long break around August or December plus a few single weeks.
    const main = pick([8, 12, 12, 7]);
    const big = Math.min(left, int(8, 12));
    months[main] = big;
    left -= big;
    while (left > 0) {
      const m = int(1, 12);
      const d = Math.min(left, int(1, 5));
      months[m] = (months[m] || 0) + d;
      left -= d;
    }
    return { employee: r.employee.id, months };
  });
  for (let i = 0; i < rows.length; i += 50) await hr.send("/api/dnr/leave/plans", { method: "POST", body: { year: YEAR, rows: rows.slice(i, i + 50) } });
  const approveIds = b.items.filter(() => rand() < 0.6).map((r) => r.employee.id);
  await hr.send("/api/dnr/leave/plans/approve", { method: "POST", body: { year: YEAR, employees: approveIds } });
  console.log(`  ✓ leave plans ${YEAR}: ${rows.length} (${approveIds.length} approved)`);
}

// ------------------------------------------------------------------ payroll
async function payroll() {
  await wipe("employees_payrolls");
  await wipe("payrolls");
  await wipe("approval_requests", 'document_type = "payroll"');
  await wipe("approval_workflows", 'document_type = "payroll"');
  const role = async (n) => (await admin.collection("roles").getFirstListItem(`name="${n}"`)).id;
  await admin.collection("approval_workflows").create({
    name: "Monthly payroll approval", description: "Prepared by HR, reviewed by the Director of Finance and Administration, approved by the Secretary General. The preparer can never approve.",
    document_type: "payroll", active: true, priority: 10, min_amount: 0, max_amount: 0, allow_self_approval: false,
    steps: [
      { name: "Finance review", approver_type: "role", role: await role(ROLE.DAF) },
      { name: "Secretary General approval", approver_type: "role", role: await role(ROLE.SG) },
    ],
  });
  const hr = await login("hr@dnr-hr.rw");
  const finance = await login("finance@dnr-hr.rw");
  const director = await login("director@dnr-hr.rw");
  const cashier = await login("cashier@dnr-hr.rw"); // only the Cashier records payments
  const now = new Date();
  // Staff loans repaid through the payroll: HR records them, the DAF approves (from this month's payroll).
  const person = async (email) => admin.collection("users").getFirstListItem(`email = "${email}"`);
  const loans = [
    ["accountant@dnr-hr.rw", "staff_loan", "Motorcycle for field work", 1200000, 100000, true],
    ["cashier@dnr-hr.rw", "emergency", "Medical expenses (family)", 450000, 75000, true],
    ["jean.habimana.0@dnr-hr.rw", "staff_loan", "School fees", 2000000, 150000, false],
  ];
  let active = 0;
  for (const [email, loan_type, purpose, principal, installment, approve] of loans) {
    const u = await person(email).catch(() => null);
    if (!u) continue;
    const l = await hr.send("/api/ims/payroll-loans", { method: "POST", body: { employee: u.id, loan_type, purpose, principal, installment, start_year: now.getFullYear(), start_month: now.getMonth() + 1 } });
    if (approve) {
      await finance.send(`/api/ims/payroll-loans/${l.id}/decide`, { method: "POST", body: { decision: "approve", comment: "Within the staff loan policy." } });
      active++;
    }
  }
  console.log(`  ✓ staff loans: ${active} repaid through the payroll from this month, 1 waiting for the DAF`);
  const bank = await admin.collection("bank_accounts").getFirstListItem('code = "BK-OPS"');
  // Salaries leave the operating account on the last working day of the month.
  const payday = (y, m) => {
    const d = new Date(Date.UTC(y, m, 0, 12));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const periods = [-2, -1, 0].map((k) => {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const out = [];
  for (const [i, p] of periods.entries()) {
    const { id, number } = await hr.send("/api/dnr/payroll", { method: "POST", body: { ...p, notes: "Monthly salaries — Head Office and provincial desks" } });
    await hr.send(`/api/dnr/payroll/${id}/compute`, { method: "POST" });
    await hr.send(`/api/dnr/payroll/${id}/submit`, { method: "POST" });
    let rec = await admin.collection("payrolls").getOne(id);
    if (i < 2) {
      await finance.send(`/api/dnr/approvals/${rec.approval}/act`, { method: "POST", body: { action: "approve", comment: "Totals reconciled with the HR headcount and the RSSB declaration." } });
      await director.send(`/api/dnr/approvals/${rec.approval}/act`, { method: "POST", body: { action: "approve", comment: "Approved for payment." } });
      await cashier.send(`/api/dnr/payroll/${id}/paid`, { method: "POST", body: { account: bank.id, payment_date: payday(p.year, p.month), reference: `BK-TRF-${p.year}${String(p.month).padStart(2, "0")}-${int(1000, 9999)}` } });
    }
    rec = await admin.collection("payrolls").getOne(id);
    out.push(`${number} ${rec.status}`);
  }
  console.log(`  ✓ payroll: ${out.join(", ")}`);
}

// ------------------------------------------------------------------ appraisals
async function appraisals(users) {
  await wipe("appraisal_cycles");
  const hr = await login("hr@dnr-hr.rw");
  const tpl = await admin.collection("appraisal_templates").getFirstListItem('name = "Standard staff appraisal"');
  const cycle = await hr.collection("appraisal_cycles").create({
    name: `Q3 ${YEAR} performance review`, template: tpl.id, period_start: `${YEAR}-07-01 12:00:00.000Z`, period_end: `${YEAR}-09-30 12:00:00.000Z`,
    due_date: `${YEAR}-10-15 12:00:00.000Z`, status: "draft", notes: "Quarterly review linked to action plans and reports.",
  });
  const { created } = await hr.send(`/api/dnr/appraisals/cycles/${cycle.id}/launch`, { method: "POST" });
  const list = await admin.collection("appraisals").getFullList({ filter: `cycle = "${cycle.id}"`, expand: "employee" });
  const criteria = tpl.sections.flatMap((s) => s.criteria.map((c) => c.id));
  const sessions = {};
  const session = async (id) => {
    const u = users.find((x) => x.id === id);
    if (!u || !u.email.endsWith("@dnr-hr.rw")) return null;
    if (!sessions[id]) sessions[id] = await login(u.email).catch(() => null);
    return sessions[id];
  };
  const ratingsFor = (level) => Object.fromEntries(criteria.map((c) => [c, { value: Math.max(1, Math.min(5, level + pick([-1, 0, 0, 0, 1]))), comment: "" }]));
  const COMMENTS = ["Reliable and delivers good quality work.", "Good progress this quarter; keep improving on deadlines.", "Excellent contribution to the district trainings.", "Needs to report more regularly on activities.", "Strong team player, well appreciated by members."];
  let reviewed = 0, shared = 0, selfDone = 0;
  const demoEmployees = new Set(users.filter((u) => u.email.endsWith("@dnr-hr.rw")).map((u) => u.id));
  for (const a of list) {
    // Self-assessment by demo staff.
    if (demoEmployees.has(a.employee) && rand() < 0.7) {
      const me = await session(a.employee);
      if (me) {
        await me.send(`/api/dnr/appraisals/${a.id}/review`, { method: "POST", body: { ratings: ratingsFor(4), overall_comment: "I delivered my plan and supported the team.", submit: true } }).catch(() => null);
        selfDone++;
      }
    }
    if (rand() < 0.15) continue; // not yet evaluated
    const level = pick([2, 3, 3, 4, 4, 4, 5]);
    for (const ev of a.evaluators || []) {
      const s = await session(ev);
      if (!s) continue;
      await s.send(`/api/dnr/appraisals/${a.id}/review`, { method: "POST", body: { ratings: ratingsFor(level), overall_comment: pick(COMMENTS), submit: true } });
      reviewed++;
      break;
    }
    const fresh = await admin.collection("appraisals").getOne(a.id);
    if (fresh.evaluator_score > 0 && (rand() < 0.6 || a.expand?.employee?.email === "employee@dnr-hr.rw")) {
      const head = await session(fresh.evaluators[0]);
      if (head) {
        await head.send(`/api/dnr/appraisals/${a.id}/share`, { method: "POST", body: { summary: "Discussed with the employee during the quarterly meeting." } });
        shared++;
      }
    }
  }
  // Demo interactions: one acknowledgement, one claim.
  const sharedList = await admin.collection("appraisals").getFullList({ filter: `cycle = "${cycle.id}" && status = "shared"`, expand: "employee" });
  const demoShared = sharedList.filter((a) => a.expand?.employee?.email?.endsWith("@dnr-hr.rw") && a.expand.employee.email !== "employee@dnr-hr.rw");
  if (demoShared[0]) {
    const s = await session(demoShared[0].employee);
    await s.send(`/api/dnr/appraisals/${demoShared[0].id}/acknowledge`, { method: "POST", body: { comment: "Thank you for the feedback; I agree with the development points." } });
  }
  if (demoShared[1]) {
    const s = await session(demoShared[1].employee);
    await s.send(`/api/dnr/appraisals/${demoShared[1].id}/claim`, { method: "POST", body: { criterion: "Timeliness of delivery", message: "Two reports were late because the district data arrived late; I had informed my supervisor in advance (see my weekly reports)." } });
  }
  console.log(`  ✓ appraisals: cycle "${cycle.name}", ${created} staff, ${reviewed} reviews, ${selfDone} self-assessments, ${shared} shared, 1 acknowledged, 1 claim`);
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("👩‍💼 HR: leave, payroll, appraisals");

  const users = await admin.collection("users").getFullList({ filter: 'status = "Active"', sort: "created" });
  await salaries(users);
  const hr = await login("hr@dnr-hr.rw");
  await leavePlans(hr);
  await payroll();
  await appraisals(users);
}

main().catch((e) => {
  console.error("❌ HR seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
