#!/usr/bin/env node
/**
 * RALGA IMS — Step 2 demo data: the FY budget with lines per department, donor project lines and revenue
 * lines, approved through the real workflow (Budget Officer → DAF → Secretary General), one approved
 * virement and one supplementary budget waiting for approval.
 *
 * Run after seed-ims.mjs (fiscal years, chart of accounts, funding sources, projects) and before
 * seed-procurement.mjs (requisitions and POs are charged to these lines). Re-running replaces the data.
 * Demo amounts are illustrative — RALGA's real budget is imported with the Excel template (Step 10).
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
const sessions = {};
async function as(email) {
  if (!sessions[email]) {
    const pb = new PocketBase(PB_URL);
    pb.autoCancellation(false);
    await pb.collection("users").authWithPassword(email, "password123");
    sessions[email] = pb;
  }
  return sessions[email];
}
const M = 1_000_000;

// Operating accounts budgeted for every department: [account, kind, base amount in RWF million]
const OPERATING = [
  ["5201", "expense", 6], ["5215", "expense", 4], ["5214", "expense", 4], ["5210", "expense", 8], ["5205", "expense", 3],
  ["5209", "expense", 10], ["5207", "expense", 5], ["5203", "expense", 2], ["1240", "capital", 12], ["1230", "capital", 4],
];
// Department weights (relative size) by department code.
const WEIGHT = { OSG: 1.4, FIN: 1.5, HRM: 0.9, PRC: 0.9, CBD: 1.6, RCS: 0.8, APR: 1.3, PME: 0.9, ICT: 1.8, COM: 1.0, IAU: 0.5, LEG: 0.5 };
// Lines only some departments hold: [dept code, account, kind, RWF million]
const SPECIAL = [
  ["FIN", "1220", "capital", 60], ["FIN", "1210", "capital", 45], ["FIN", "5206", "expense", 18], ["FIN", "5216", "expense", 24], ["FIN", "5213", "expense", 9],
  ["FIN", "5212", "expense", 3], ["FIN", "5211", "expense", 14], ["OSG", "5208", "expense", 20], ["ICT", "1260", "capital", 25], ["IAU", "5211", "expense", 2],
];
// Donor / project lines: [code suffix, dept code, account, funding code, project code, RWF million]
const PROJECT_LINES = [
  ["LED", "APR", "5304", "DP-LED", "LED-01", 180], ["LED", "APR", "5209", "DP-LED", "LED-01", 40], ["LED", "APR", "5210", "DP-LED", "LED-01", 20],
  ["CB", "CBD", "5301", "DP-CB", "CB-01", 120], ["CB", "CBD", "5209", "DP-CB", "CB-01", 45], ["CB", "CBD", "5215", "DP-CB", "CB-01", 15],
  ["RCS", "RCS", "5303", "MC", "RCS-01", 30], ["ICT", "ICT", "5214", "MC", "ICT-01", 20],
];
// Revenue: [dept code, account, funding code, project code, RWF million]
const REVENUE = [
  ["OSG", "4101", "MC", "", 980], ["APR", "4104", "DP-LED", "LED-01", 240], ["CBD", "4104", "DP-CB", "CB-01", 180], ["RCS", "4201", "MC", "", 60], ["CBD", "4202", "MC", "", 35],
];

/** Monthly amounts (July → June): workshops and programmes peak mid-year; capital in Q2/Q3; the rest flat. */
function phase(amount, account) {
  const shapes = {
    "5209": [4, 6, 9, 10, 10, 6, 6, 10, 11, 10, 10, 8], "5301": [3, 6, 10, 11, 10, 6, 7, 11, 11, 10, 9, 6], "5304": [3, 5, 8, 9, 10, 8, 8, 10, 10, 10, 10, 9],
    "1240": [0, 10, 20, 20, 15, 5, 5, 10, 10, 5, 0, 0], "1230": [0, 0, 25, 25, 20, 10, 10, 10, 0, 0, 0, 0], "1220": [0, 0, 0, 50, 50, 0, 0, 0, 0, 0, 0, 0],
    "1210": [0, 0, 0, 0, 20, 30, 30, 20, 0, 0, 0, 0],
  };
  const w = shapes[account] || Array(12).fill(1);
  const total = w.reduce((a, x) => a + x, 0);
  const out = w.map((x) => Math.floor((amount * x) / total));
  out[11] += amount - out.reduce((a, x) => a + x, 0);
  return out;
}
const round100k = (n) => Math.round(n / 100000) * 100000;

async function approveAll(approvalId) {
  for (let i = 0; i < 6; i++) {
    const a = await admin.collection("approval_requests").getOne(approvalId);
    if (a.status !== "pending") return a.status;
    const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    await (await as(who.email)).send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: i === 0 ? "Reviewed against the strategic plan and the procurement plan." : "Approved." } });
  }
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("📊 Budget: FY budget, lines, approvals, revisions");

  // Clean previous budget data (local demo only).
  for (const col of ["budget_ledger", "budget_overrides", "budget_revisions", "budget_lines", "budgets"]) {
    for (const r of await admin.collection(col).getFullList({ fields: "id" })) await admin.collection(col).delete(r.id).catch(() => null);
  }
  for (const t of ["budget", "budget_revision"]) {
    for (const a of await admin.collection("approval_requests").getFullList({ filter: `document_type = "${t}"`, fields: "id" })) await admin.collection("approval_requests").delete(a.id).catch(() => null);
    for (const w of await admin.collection("approval_workflows").getFullList({ filter: `document_type = "${t}"`, fields: "id" })) await admin.collection("approval_workflows").delete(w.id);
  }
  for (const key of ["budget", "budget_revision"]) {
    const seq = await admin.collection("number_sequences").getFirstListItem(`key="${key}"`).catch(() => null);
    if (seq) await admin.collection("number_sequences").update(seq.id, { next_value: 1 });
  }

  // Default flow (spec §4): Budget Officer → DAF → SG. Finance can change it under Approval workflows.
  const roles = Object.fromEntries((await admin.collection("roles").getFullList()).map((r) => [r.name, r.id]));
  const flow = (name, document_type, description) =>
    admin.collection("approval_workflows").create({
      name, document_type, description, active: true, priority: 10, min_amount: 0, max_amount: 0, allow_self_approval: false, overdue_hours: 72,
      departments: [], categories: [], branches: [], funding_sources: [],
      steps: [
        { name: "Director of Finance review", approver_type: "role", role: roles[ROLE.DAF] },
        { name: "Secretary General approval", approver_type: "role", role: roles[ROLE.SG] },
      ],
    });
  await flow("Budget approval", "budget", "Prepared by the Budget Officer, reviewed by the DAF, approved by the Secretary General.");
  await flow("Budget revision approval", "budget_revision", "Supplementary budgets, reductions, virements and re-phasing: DAF then Secretary General.");

  const settings = (await admin.collection("settings").getList(1, 1)).items[0];
  await admin.collection("settings").update(settings.id, { budget_control: "block", budget_amber_pct: 75, budget_red_pct: 90 });

  const fy = await admin.collection("fiscal_years").getFirstListItem("is_current = true");
  const depts = await admin.collection("departments").getFullList({ sort: "code" });
  const lines = [];
  for (const d of depts) {
    const w = WEIGHT[d.code] || 1;
    for (const [acc, kind, base] of OPERATING) {
      const amount = round100k(base * w * M);
      lines.push({ code: `${d.code}-${acc}-MC`, kind, gl_account: acc, department: d.code, funding_source: "MC", amount, phasing: phase(amount, acc) });
    }
  }
  for (const [code, acc, kind, mio] of SPECIAL) {
    const amount = mio * M;
    lines.push({ code: `${code}-${acc}-MC`, kind, gl_account: acc, department: code, funding_source: "MC", amount, phasing: phase(amount, acc) });
  }
  for (const [, dept, acc, fund, project, mio] of PROJECT_LINES) {
    const amount = mio * M;
    lines.push({ code: `${project}-${acc}`, kind: acc.startsWith("1") ? "capital" : "expense", gl_account: acc, department: dept, funding_source: fund, project, amount, phasing: phase(amount, acc) });
  }
  for (const [dept, acc, fund, project, mio] of REVENUE) {
    const amount = mio * M;
    lines.push({ code: `REV-${dept}-${acc}-${fund}`, kind: "revenue", gl_account: acc, department: dept, funding_source: fund, project, amount, phasing: phase(amount, acc) });
  }
  // Resolve department codes to ids for the API (accounts, funding sources and projects resolve by code).
  const deptId = Object.fromEntries(depts.map((d) => [d.code, d.id]));
  for (const l of lines) l.department = deptId[l.department];

  const officer = await as("budget@dnr-hr.rw");
  const budget = await officer.collection("budgets").create({
    name: `${fy.name} approved budget — General Secretariat`, fiscal_year: fy.id,
    description: "Annual budget of the General Secretariat: operating lines per department (member contributions) and donor-funded project lines.",
  });
  await officer.send(`/api/ims/budgets/${budget.id}/lines`, { method: "POST", body: { lines, replace: true } });
  const sub = await officer.send(`/api/ims/budgets/${budget.id}/submit`, { method: "POST" });
  await approveAll(sub.approval);
  const approved = await admin.collection("budgets").getOne(budget.id);
  console.log(`  ✓ ${approved.number}: ${approved.line_count} lines, RWF ${(approved.total / M).toFixed(0)}M spending budget — ${approved.status}`);

  // An approved virement: Finance moves telephone money to office supplies.
  const line = async (code) => admin.collection("budget_lines").getFirstListItem(`code = "${code}" && fiscal_year = "${fy.id}"`);
  const vir = await officer.collection("budget_revisions").create({
    type: "virement", fiscal_year: fy.id, title: "Virement: telephone savings to office supplies (Finance)",
    reason: "New flat-rate internet contract reduced telephone costs; stationery needs grew with the new finance staff.",
    lines: [{ budget_line: (await line("FIN-5203-MC")).id, change: -1000000 }, { budget_line: (await line("FIN-5201-MC")).id, change: 1000000 }],
  });
  const vs = await officer.send(`/api/ims/budget-revisions/${vir.id}/submit`, { method: "POST" });
  await approveAll(vs.approval);
  // A supplementary budget waiting for the DAF: more councillor trainings funded by the donor.
  const sup = await officer.collection("budget_revisions").create({
    type: "supplementary", fiscal_year: fy.id, title: "Supplementary: additional councillors' induction sessions (DP-CB)",
    reason: "The development partner confirmed additional funding for three more induction sessions in the Southern Province.",
    lines: [{ budget_line: (await line("CB-01-5209")).id, change: 15000000 }, { budget_line: (await line("CB-01-5215")).id, change: 3000000 }],
  });
  await officer.send(`/api/ims/budget-revisions/${sup.id}/submit`, { method: "POST" });
  console.log("  ✓ revisions: 1 virement approved, 1 supplementary budget waiting for the DAF; budget control set to block");
}

main().catch((e) => {
  console.error("❌ Budget seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
