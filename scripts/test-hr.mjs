#!/usr/bin/env node
/**
 * API checks for leave (Rwanda entitlement, holidays, plans), payroll (PAYE/RSSB, multi-level approval,
 * separation of duties, payslip privacy) and appraisals (evaluators, scoring, share, claims).
 * Runs against a local PocketBase seeded with `npm run seed:ralga`.
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
const Y = new Date().getFullYear();

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const employee = await login("employee@dnr-hr.rw");
const hr = await login("hr@dnr-hr.rw");
const finance = await login("finance@dnr-hr.rw");
const director = await login("director@dnr-hr.rw");
const accountant = await login("accountant@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const me = employee.authStore.model;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const testGl = await admin.collection("gl_accounts").create({ code: `TP${tag}`, name: `Test payroll bank ${tag}`, type: "asset", is_posting: true, cash_flow_class: "cash", statement_section: "current_assets", active: true });
const payBank = await finance.collection("bank_accounts").create({ code: `TP-${tag}`, name: "Test payroll account", kind: "bank", bank_name: "Test Bank", account_number: "4321-0000-71", gl_account: testGl.id, opening_balance: 300000000, opening_date: `${day(-30)} 12:00:00.000Z`, currency: "RWF" });
cleanup.push(async () => {
  for (const e of await admin.collection("cash_book_entries").getFullList({ filter: `account = "${payBank.id}"`, fields: "id" })) await admin.collection("cash_book_entries").delete(e.id);
  await admin.collection("bank_accounts").delete(payBank.id);
  await admin.collection("gl_accounts").delete(testGl.id);
});
let loan;

console.log("\nLeave");
await check("an employee sees only their own leave balance", async () => {
  const b = await employee.send(`/api/dnr/leave/balances?year=${Y}`, {});
  assert(b.items.length === 1 && b.items[0].employee.id === me.id, `got ${b.items.length} rows`);
});
await check("entitlement = 1.5 days × months + 1 day per 3 years + carry-over + adjustment", async () => {
  const b = (await hr.send(`/api/dnr/leave/balances?year=${Y}`, {})).items;
  const r = b.find((x) => x.months_of_service === 12 && x.years_of_service >= 3) || b[0];
  const expected = 1.5 * r.months_of_service + Math.floor(r.years_of_service / 3) + r.carried_over + r.adjustment;
  assert(Math.abs(r.entitlement - expected) < 0.01, `entitlement ${r.entitlement} ≠ ${expected}`);
  assert(r.seniority_days === Math.floor(r.years_of_service / 3), "seniority wrong");
});
await check("working days exclude weekends and public holidays", async () => {
  const c = await employee.send(`/api/dnr/leave/count?start=${Y}-12-21&end=${Y}-12-31&type=Annual%20Leave`, {});
  const weekdays = [...Array(11)].map((_, i) => new Date(Date.UTC(Y, 11, 21 + i))).filter((d) => d.getUTCDay() % 6 !== 0);
  const hol = weekdays.filter((d) => [25, 26].includes(d.getUTCDate())).length;
  assert(c.days === weekdays.length - hol, `got ${c.days}, expected ${weekdays.length - hol}`);
});
await check("annual leave beyond the balance is refused", async () => {
  await expectStatus(employee.collection("leaves").create({ employee: me.id, type: "Annual Leave", start: `${Y}-10-01 12:00:00.000Z`, end: `${Y}-12-31 12:00:00.000Z`, reason: "Long holiday" }), 400, "not enough annual leave");
});
await check("maternity leave is refused for a male employee", async () => {
  const male = (await admin.collection("users").getFullList({ filter: 'email ~ "@dnr-hr.rw" && gender = "Male"' }))[0];
  const s = await login(male.email);
  await expectStatus(s.collection("leaves").create({ employee: male.id, type: "Maternity Leave", start: `${Y + 1}-02-02 12:00:00.000Z`, end: `${Y + 1}-02-10 12:00:00.000Z`, reason: "Test" }), 400, "female");
});
await check("sick leave over 2 days needs a medical document", async () => {
  await expectStatus(employee.collection("leaves").create({ employee: me.id, type: "Sick Leave", start: `${Y + 1}-03-02 12:00:00.000Z`, end: `${Y + 1}-03-06 12:00:00.000Z`, reason: "Malaria" }), 400, "supporting document");
});
await check("the server counts the days (the client value is ignored)", async () => {
  const l = await employee.collection("leaves").create({ employee: me.id, type: "Compassionate Leave", start: `${Y + 1}-01-05 12:00:00.000Z`, end: `${Y + 1}-01-07 12:00:00.000Z`, days: 99, reason: "Family funeral" });
  cleanup.push(() => admin.collection("leaves").delete(l.id));
  assert(l.days === 3, `days = ${l.days}`);
});
let plansBefore;
await check("an employee cannot plan leave for a colleague", async () => {
  const other = (await admin.collection("users").getFullList({ filter: `email ~ "@dnr-hr.rw" && id != "${me.id}"` }))[0];
  const r = await employee.send("/api/dnr/leave/plans", { method: "POST", body: { year: Y + 1, rows: [{ employee: other.id, months: { 1: 2 } }] } });
  assert(r.saved === 0 && r.errors.length === 1, "saved someone else's plan");
});
await check("an employee plans their own leave; HR approves; the approved plan is locked for the employee", async () => {
  const r = await employee.send("/api/dnr/leave/plans", { method: "POST", body: { year: Y + 1, rows: [{ employee: me.id, months: { 8: 10, 12: 5 } }] } });
  assert(r.saved === 1, JSON.stringify(r.errors));
  plansBefore = await admin.collection("leave_plans").getFirstListItem(`employee = "${me.id}" && year = ${Y + 1}`);
  cleanup.push(() => admin.collection("leave_plans").delete(plansBefore.id));
  assert(plansBefore.status === "draft", "not draft");
  const a = await hr.send("/api/dnr/leave/plans/approve", { method: "POST", body: { year: Y + 1, employees: [me.id] } });
  assert(a.approved === 1, "not approved");
  const again = await employee.send("/api/dnr/leave/plans", { method: "POST", body: { year: Y + 1, rows: [{ employee: me.id, months: { 8: 12 } }] } });
  assert(again.saved === 0, "employee changed an approved plan");
});
await check("only HR changes the leave policy", async () => {
  const t = await admin.collection("leave_types").getFirstListItem('name = "Annual Leave"');
  await expectStatus(employee.collection("leave_types").update(t.id, { days_per_year: 40 }), 404);
});

console.log("\nPayroll");
await check("PAYE and RSSB follow the configured Rwanda rates", async () => {
  const p = await hr.send("/api/dnr/payroll/preview", { method: "POST", body: { basic_salary: 1000000, transport_allowance: 100000 } });
  assert(p.gross === 1100000 && p.paye === 294000, `gross ${p.gross}, PAYE ${p.paye}`);
  assert(p.pension_ee === 60000 && p.pension_er === 60000 && p.maternity_ee === 3000 && p.occ_hazard_er === 20000, "RSSB wrong");
  assert(p.cbhi === 3715 && p.net === 739285, `CBHI ${p.cbhi}, net ${p.net}`);
});
await check("employees cannot see payrolls or other people's payslips", async () => {
  const runs = await employee.collection("payrolls").getFullList();
  assert(runs.length === 0, "employee sees payrolls");
  const slips = await employee.collection("employees_payrolls").getFullList();
  assert(slips.length > 0 && slips.every((s) => s.employee === me.id), "wrong payslips visible");
});
await check("employees cannot prepare a payroll", async () => {
  await expectStatus(employee.send("/api/dnr/payroll", { method: "POST", body: { year: Y + 1, month: 1 } }), 403, "create_payroll");
});
await check("staff loans: HR records, Finance approves (never the recorder), staff see only their own", async () => {
  await expectStatus(hr.send("/api/ims/payroll-loans", { method: "POST", body: { employee: me.id, purpose: "Laptop purchase", principal: 900000, installment: 10000, start_year: Y, start_month: new Date().getMonth() + 1 } }), 400, "60");
  await expectStatus(employee.send("/api/ims/payroll-loans", { method: "POST", body: { employee: me.id, purpose: "Laptop purchase", principal: 900000, installment: 150000, start_year: Y, start_month: new Date().getMonth() + 1 } }), 403);
  loan = await hr.send("/api/ims/payroll-loans", { method: "POST", body: { employee: me.id, loan_type: "staff_loan", purpose: "Laptop purchase", principal: 900000, installment: 150000, start_year: Y, start_month: new Date().getMonth() + 1 } });
  cleanup.push(async () => admin.collection("staff_loans").delete(loan.id));
  assert(loan.status === "pending_approval" && /^LN-/.test(loan.number), `${loan.status} ${loan.number}`);
  await expectStatus(hr.send(`/api/ims/payroll-loans/${loan.id}/decide`, { method: "POST", body: { decision: "approve" } }), 403);
  await expectStatus(finance.send(`/api/ims/payroll-loans/${loan.id}/decide`, { method: "POST", body: { decision: "reject" } }), 400, "why");
  const r = await finance.send(`/api/ims/payroll-loans/${loan.id}/decide`, { method: "POST", body: { decision: "approve", comment: "Policy limits respected." } });
  assert(r.status === "active", r.status);
  assert((await employee.collection("staff_loans").getOne(loan.id)).balance === 900000, "the employee does not see the loan");
  await expectStatus(accountant.collection("staff_loans").getOne(loan.id), 404);
});
let run;
await check("HR prepares and calculates a payroll; totals match the payslips", async () => {
  run = await hr.send("/api/dnr/payroll", { method: "POST", body: { year: Y + 1, month: 1, notes: "test" } });
  cleanup.push(async () => {
    const p = await admin.collection("payrolls").getOne(run.id);
    // instalments this payroll recovered on the seeded loans are put back
    for (const l of await admin.collection("staff_loans").getFullList({ filter: `repayments ~ "${run.id}"` })) {
      const back = (l.repayments || []).filter((x) => x.payroll === run.id).reduce((a, x) => a + x.amount, 0);
      await admin.collection("staff_loans").update(l.id, { repayments: (l.repayments || []).filter((x) => x.payroll !== run.id), balance: l.balance + back, repaid: l.repaid - back, status: l.status === "repaid" ? "active" : l.status });
    }
    for (const b of await admin.collection("budget_ledger").getFullList({ filter: `source_id = "${run.id}"`, fields: "id" })) await admin.collection("budget_ledger").delete(b.id);
    for (const j of await admin.collection("gl_journals").getFullList({ filter: `source_id = "${run.id}"`, fields: "id" })) {
      for (const l of await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"`, fields: "id" })) await admin.collection("gl_journal_lines").delete(l.id);
      await admin.collection("gl_journals").delete(j.id);
    }
    for (const s of await admin.collection("employees_payrolls").getFullList({ filter: `payroll = "${run.id}"` })) await admin.collection("employees_payrolls").delete(s.id);
    if (p.approval) await admin.collection("approval_requests").delete(p.approval).catch(() => null);
    await admin.collection("payrolls").delete(run.id);
  });
  await hr.send(`/api/dnr/payroll/${run.id}/compute`, { method: "POST" });
  const p = await admin.collection("payrolls").getOne(run.id);
  const slips = await admin.collection("employees_payrolls").getFullList({ filter: `payroll = "${run.id}"` });
  assert(p.status === "computed" && slips.length === p.headcount && slips.length > 20, `status ${p.status}, ${slips.length} slips`);
  assert(Math.abs(slips.reduce((a, s) => a + s.net, 0) - p.total_net) < 1, "net total mismatch");
  assert(slips.every((s) => s.net === s.gross - s.total_deductions), "net ≠ gross − deductions");
});
await check("a second payroll for the same month is refused", async () => {
  await expectStatus(hr.send("/api/dnr/payroll", { method: "POST", body: { year: Y + 1, month: 1 } }), 400, "already exists");
});
await check("the preparer cannot approve; finance then the Secretary General approve", async () => {
  await hr.send(`/api/dnr/payroll/${run.id}/submit`, { method: "POST" });
  let p = await admin.collection("payrolls").getOne(run.id);
  assert(p.status === "pending_approval", p.status);
  assert(!p.pending_approvers.includes(hr.authStore.model.id), "preparer is an approver");
  await expectStatus(hr.send(`/api/dnr/approvals/${p.approval}/act`, { method: "POST", body: { action: "approve" } }), 403);
  await finance.send(`/api/dnr/approvals/${p.approval}/act`, { method: "POST", body: { action: "approve", comment: "ok" } });
  p = await admin.collection("payrolls").getOne(run.id);
  assert(p.status === "pending_approval", "should wait for step 2");
  await director.send(`/api/dnr/approvals/${p.approval}/act`, { method: "POST", body: { action: "approve", comment: "ok" } });
  p = await admin.collection("payrolls").getOne(run.id);
  assert(p.status === "approved", p.status);
});
await check("the loan instalment is deducted from the payslip", async () => {
  const slip = await admin.collection("employees_payrolls").getFirstListItem(`payroll = "${run.id}" && employee = "${me.id}"`);
  assert(slip.loans === 150000 && (slip.loan_deductions || [])[0]?.loan === loan.id, `loans ${slip.loans}`);
  assert(slip.net === slip.gross - slip.total_deductions, "net ≠ gross − deductions");
});
await check("approval posts the payroll to the GL (balanced) and to the budget lines by department and funding source", async () => {
  const p = await admin.collection("payrolls").getOne(run.id);
  assert(p.gl_journal, "no GL journal");
  const j = await admin.collection("gl_journals").getOne(p.gl_journal);
  const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"` });
  const debit = lines.reduce((a, l) => a + l.debit, 0);
  const credit = lines.reduce((a, l) => a + l.credit, 0);
  assert(j.status === "posted" && debit === credit && debit === p.total_employer_cost, `debit ${debit} credit ${credit} employer cost ${p.total_employer_cost}`);
  const budgeted = (p.posting.budget || []).reduce((a, b) => a + b.amount, 0) + (p.posting.unbudgeted || []).reduce((a, b) => a + b.amount, 0);
  assert(budgeted === p.total_employer_cost, `budget ${budgeted} ≠ ${p.total_employer_cost}`);
  const ledger = await admin.collection("budget_ledger").getFullList({ filter: `source_id = "${run.id}" && type = "actual"` });
  assert(ledger.reduce((a, l) => a + l.amount, 0) === (p.posting.budget || []).reduce((a, b) => a + b.amount, 0), "budget ledger ≠ posting summary");
  const cb = await admin.collection("funding_sources").getFirstListItem('code = "DP-CB"');
  assert(lines.some((l) => l.funding_source === cb.id && l.debit > 0 && l.project), "donor-funded salaries are not charged to the donor programme");
  assert(!lines.some((l) => l.description && /Mukamana|Uwimana/.test(l.description)), "journal lines must not name employees");
});
await check("the general ledger is for finance: staff cannot read journals", async () => {
  const p = await admin.collection("payrolls").getOne(run.id);
  await expectStatus(employee.collection("gl_journals").getOne(p.gl_journal), 403);
  assert((await accountant.collection("gl_journals").getOne(p.gl_journal)).id === p.gl_journal, "the accountant cannot read the journal");
});
await check("salary payments: the Cashier sees the approved payroll and the totals per bank (not who is paid what); HR has the bank file; staff see nothing", async () => {
  const queue = await cashier.send("/api/ims/salary-payments", {});
  const mine = queue.items.find((x) => x.id === run.id);
  assert(mine && mine.status === "approved" && mine.total_net > 0, "the approved payroll is not in the Cashier's list");
  assert(!("total_gross" in mine) && !("totals" in mine), "the Cashier's list must not carry pay details");
  const t = await cashier.send(`/api/ims/salary-payments/${run.id}/transfers`, {});
  assert(t.rows === null, "payroll data (who is paid what) is only for HR, the DAF, the SG and the auditors — not the Cashier");
  assert(t.banks.reduce((a, b) => a + b.total, 0) + t.other.total === mine.total_net && t.banks.reduce((a, b) => a + b.count, 0) + t.other.count === mine.headcount, "bank totals ≠ net pay");
  const file = await hr.send(`/api/ims/salary-payments/${run.id}/transfers`, {});
  assert(file.rows.length === mine.headcount && file.rows.reduce((a, r) => a + r.net, 0) === mine.total_net, `bank file ${file.rows.length} / ${file.rows.reduce((a, r) => a + r.net, 0)} vs ${mine.headcount} / ${mine.total_net}`);
  assert(!file.rows.some((r) => "paye" in r || "gross" in r || "basic" in r), "the bank file must carry only what the bank needs");
  await expectStatus(employee.send("/api/ims/salary-payments", {}), 403);
  await expectStatus(employee.send(`/api/ims/salary-payments/${run.id}/transfers`, {}), 403);
  const p = await admin.collection("payrolls").getOne(run.id);
  assert((p.posting.by_account || []).reduce((a, x) => a + x.debit, 0) === p.total_employer_cost, "journal by account ≠ employer cost");
  assert((p.posting.budget || []).every((b) => b.account && b.department !== undefined), "budget rows lack their dimensions");
});
await check("the preparer cannot record the payment; the cashier pays from a bank account and the GL clears the salaries payable", async () => {
  await expectStatus(hr.send(`/api/dnr/payroll/${run.id}/paid`, { method: "POST", body: {} }), 403);
  await cashier.send(`/api/dnr/payroll/${run.id}/paid`, { method: "POST", body: { reference: "TEST", account: payBank.id, payment_date: day(0) } });
  const p = await admin.collection("payrolls").getOne(run.id);
  assert(p.status === "paid" && p.payment_account === payBank.id && p.cash_entry && p.payment_journal, "not paid from the account");
  const entry = await admin.collection("cash_book_entries").getOne(p.cash_entry);
  assert(entry.direction === "out" && entry.amount === p.total_net, `cash ${entry.amount}`);
  const pj = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${p.payment_journal}"` });
  assert(pj.some((l) => l.account === testGl.id && l.credit === p.total_net), "the bank is not credited");
  const l = await admin.collection("staff_loans").getOne(loan.id);
  assert(l.balance === 750000 && l.repaid === 150000 && (l.repayments || []).length === 1, `loan balance ${l.balance}`);
});
await check("the payroll is reconciled with the previous month", async () => {
  const r = await hr.send(`/api/dnr/payroll/${run.id}/reconciliation`, {});
  assert(r.previous && r.components.length > 5 && r.components.find((c) => c.key === "gross"), "no comparison");
  const mine = r.rows.find((x) => x.employee === me.id);
  assert(mine && mine.reasons.some((t) => /loan/.test(t)), "the new loan deduction is not explained");
  await expectStatus(employee.send(`/api/dnr/payroll/${run.id}/reconciliation`, {}), 403);
});
await check("each payslip carries its period and the run's status, so staff see them without reading the run", async () => {
  const mine = await employee.collection("employees_payrolls").getFullList({ filter: `payroll = "${run.id}"` });
  assert(mine.length === 1, `${mine.length} own payslips in the run`);
  const s = mine[0];
  assert(s.period_label === `January ${Y + 1}` && s.period_year === Y + 1 && s.period_month === 1, `period ${s.period_label}`);
  assert(s.payroll_status === "paid" && s.paid_at && s.payroll_number === run.number, `status ${s.payroll_status} / ${s.payroll_number}`);
  await expectStatus(employee.collection("payrolls").getOne(run.id), 404);
});
await check("only authorised users change tax settings", async () => {
  const b = await admin.collection("paye_bands").getFirstListItem("rate = 30");
  await expectStatus(employee.collection("paye_bands").update(b.id, { rate: 1 }), 404);
});

console.log("\nAppraisals");
let cycle;
let mine;
await check("HR launches a cycle; each employee gets an appraisal with their department head as evaluator", async () => {
  const tpl = await admin.collection("appraisal_templates").getFirstListItem('name = "Standard staff appraisal"');
  cycle = await hr.collection("appraisal_cycles").create({ name: "TEST cycle", template: tpl.id, period_start: `${Y}-07-01 12:00:00.000Z`, period_end: `${Y}-09-30 12:00:00.000Z`, departments: [me.department], status: "draft" });
  cleanup.push(() => admin.collection("appraisal_cycles").delete(cycle.id));
  const r = await hr.send(`/api/dnr/appraisals/cycles/${cycle.id}/launch`, { method: "POST" });
  assert(r.created > 0, "nothing created");
  mine = await admin.collection("appraisals").getFirstListItem(`cycle = "${cycle.id}" && employee = "${me.id}"`);
  const dept = await admin.collection("departments").getOne(me.department);
  assert(mine.evaluators.includes(dept.head), "head is not an evaluator");
});
await check("the employee cannot see scores before they are shared", async () => {
  const list = await employee.collection("appraisals").getFullList({ filter: `cycle = "${cycle.id}"` });
  assert(list.length === 0, "appraisal visible");
  const m = (await employee.send("/api/dnr/appraisals/mine", {})).items.find((x) => x.id === mine.id);
  assert(m && !m.shared && m.final_score === undefined, "scores leaked");
});
const tpl = await admin.collection("appraisal_templates").getFirstListItem('name = "Standard staff appraisal"');
const all4 = Object.fromEntries(tpl.sections.flatMap((s) => s.criteria.map((c) => [c.id, { value: 4 }])));
await check("self-assessment is saved as self and not counted", async () => {
  await employee.send(`/api/dnr/appraisals/${mine.id}/review`, { method: "POST", body: { ratings: Object.fromEntries(Object.keys(all4).map((k) => [k, { value: 5 }])), submit: true } });
  const a = await admin.collection("appraisals").getOne(mine.id);
  assert(a.self_score === 100 && !a.final_score, `self ${a.self_score}, final ${a.final_score}`);
});
await check("someone outside the department cannot evaluate", async () => {
  const outsider = (await admin.collection("users").getFullList({ filter: `email ~ "@dnr-hr.rw" && department != "${me.department}"`, expand: "role" })).find((u) => u.expand?.role?.hr_scope === "own");
  const s = await login(outsider.email);
  await expectStatus(s.send(`/api/dnr/appraisals/${mine.id}/review`, { method: "POST", body: { ratings: all4, submit: true } }), 403);
});
let head;
await check("the head's ratings give the weighted score, blended with the activity score, and a grade", async () => {
  const dept = await admin.collection("departments").getOne(me.department);
  const headUser = await admin.collection("users").getOne(dept.head);
  head = await login(headUser.email);
  await expectStatus(head.send(`/api/dnr/appraisals/${mine.id}/review`, { method: "POST", body: { ratings: { quality: { value: 4 } }, submit: true } }), 400, "rate every criterion");
  await head.send(`/api/dnr/appraisals/${mine.id}/review`, { method: "POST", body: { ratings: all4, overall_comment: "Good quarter.", submit: true } });
  const a = await admin.collection("appraisals").getOne(mine.id);
  const expected = Math.round(((100 - tpl.activity_weight) * 80 + tpl.activity_weight * a.activity_score) / 100 * 10) / 10;
  assert(a.evaluator_score === 80, `evaluator ${a.evaluator_score}`);
  assert(Math.abs(a.final_score - expected) < 0.11, `final ${a.final_score} ≠ ${expected}`);
  assert(a.grade, "no grade");
});
await check("claims only after results are shared; then the employee sees results, claims, gets an answer and acknowledges", async () => {
  await expectStatus(employee.send(`/api/dnr/appraisals/${mine.id}/claim`, { method: "POST", body: { message: "I disagree with the timeliness rating." } }), 400);
  await head.send(`/api/dnr/appraisals/${mine.id}/share`, { method: "POST", body: { summary: "Keep it up." } });
  const m = (await employee.send("/api/dnr/appraisals/mine", {})).items.find((x) => x.id === mine.id);
  assert(m.shared && m.final_score > 0 && m.criteria.quality.value === 4, "results not visible");
  await employee.send(`/api/dnr/appraisals/${mine.id}/claim`, { method: "POST", body: { criterion: "Timeliness of delivery", message: "Two delays were caused by late data from districts." } });
  assert((await admin.collection("appraisals").getOne(mine.id)).status === "disputed", "not disputed");
  const claim = (await admin.collection("appraisal_claims").getFullList({ filter: `appraisal = "${mine.id}"` }))[0];
  await expectStatus(employee.send(`/api/dnr/appraisals/claims/${claim.id}/respond`, { method: "POST", body: { decision: "upheld", response: "I agree with myself" } }), 403);
  await head.send(`/api/dnr/appraisals/claims/${claim.id}/respond`, { method: "POST", body: { decision: "rejected", response: "The delays were not reported in advance." } });
  assert((await admin.collection("appraisals").getOne(mine.id)).status === "shared", "not back to shared");
  await employee.send(`/api/dnr/appraisals/${mine.id}/acknowledge`, { method: "POST", body: { comment: "Noted." } });
  assert((await admin.collection("appraisals").getOne(mine.id)).status === "acknowledged", "not acknowledged");
});

for (const fn of cleanup.reverse()) await fn().catch((e) => console.log("cleanup:", e.message));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
