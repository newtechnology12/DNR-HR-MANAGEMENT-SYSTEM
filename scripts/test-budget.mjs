#!/usr/bin/env node
/**
 * RALGA IMS — Step 2 API checks: budget preparation and approval, budget lines validation, budget control
 * (hard stop, override by the DAF with a reason), commitment accounting (PO approval commits, cancellation
 * releases, invoices convert to actuals), revisions (virement rules, reductions limited to the available
 * balance), scoping (heads of department see their department; staff see no amounts) and reports.
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
    assert(e.status === status, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    if (contains) assert(String(e.message).toLowerCase().includes(contains.toLowerCase()), `message "${e.message}" should mention "${contains}"`);
    return e;
  }
  throw new Error(`expected HTTP ${status}, but the request succeeded`);
}

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const officer = await login("budget@dnr-hr.rw");
const daf = await login("finance@dnr-hr.rw");
const accountant = await login("accountant@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw");
const procurement = await login("procurement@dnr-hr.rw");
const sessions = {};
async function approveAll(approvalId) {
  for (let i = 0; i < 6; i++) {
    const a = await admin.collection("approval_requests").getOne(approvalId);
    if (a.status !== "pending") return a.status;
    const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    sessions[who.email] = sessions[who.email] || (await login(who.email));
    await sessions[who.email].send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "API test" } });
  }
  return (await admin.collection("approval_requests").getOne(approvalId)).status;
}
const figures = async (lineId) => (await daf.send(`/api/ims/budget/lines/${lineId}/ledger`, {})).figures;

const fy = await admin.collection("fiscal_years").getFirstListItem("is_current = true");
const fin = await admin.collection("departments").getFirstListItem('code = "FIN"');
const tag = String(Date.now()).slice(-6);
const CODE = `TST${tag}-5201`;

console.log("\nBudget preparation and approval");
let budget;
await check("staff cannot prepare budgets", async () => {
  await expectStatus(employee.collection("budgets").create({ name: "x", fiscal_year: fy.id }), 403, "manage_budgets");
});
await check("lines are validated: account type, phasing total, duplicates", async () => {
  budget = await officer.collection("budgets").create({ name: `API test budget ${tag}`, fiscal_year: fy.id });
  const base = { gl_account: "5201", department: fin.id, funding_source: "MC", amount: 1000000 };
  await expectStatus(officer.send(`/api/ims/budgets/${budget.id}/lines`, { method: "POST", body: { lines: [{ ...base, code: CODE, kind: "capital" }] } }), 400, "capital line needs a asset account");
  await expectStatus(officer.send(`/api/ims/budgets/${budget.id}/lines`, { method: "POST", body: { lines: [{ ...base, code: CODE, phasing: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }] } }), 400, "add up to");
  await expectStatus(officer.send(`/api/ims/budgets/${budget.id}/lines`, { method: "POST", body: { lines: [{ ...base, code: CODE }, { ...base, code: CODE }] } }), 400, "duplicate");
  await officer.send(`/api/ims/budgets/${budget.id}/lines`, { method: "POST", body: { lines: [{ ...base, code: CODE }, { ...base, code: `TST${tag}-5215`, gl_account: "5215", amount: 600000 }] } });
  const b = await admin.collection("budgets").getOne(budget.id);
  assert(b.total === 1600000 && b.line_count === 2, `total ${b.total}, lines ${b.line_count}`);
});
await check("the preparer cannot approve; DAF then SG approve → lines become active", async () => {
  const sub = await officer.send(`/api/ims/budgets/${budget.id}/submit`, { method: "POST" });
  await expectStatus(officer.send(`/api/dnr/approvals/${sub.approval}/act`, { method: "POST", body: { action: "approve" } }), 403);
  assert((await approveAll(sub.approval)) === "approved", "budget not approved");
  const lines = await admin.collection("budget_lines").getFullList({ filter: `budget = "${budget.id}"` });
  assert(lines.every((l) => l.status === "active" && l.revised_amount === l.original_amount), "lines not active");
});
await check("an approved budget cannot be edited (revisions only)", async () => {
  const line = await admin.collection("budget_lines").getFirstListItem(`code = "${CODE}"`);
  await expectStatus(officer.collection("budget_lines").update(line.id, { original_amount: 5000000 }), 400, "revision");
});

console.log("\nBudget control");
let line, pr;
await check("a requisition above the available balance is blocked (hard stop)", async () => {
  line = await admin.collection("budget_lines").getFirstListItem(`code = "${CODE}"`);
  const cat = await admin.collection("procurement_categories").getFirstListItem('code = "SUP"');
  pr = await accountant.collection("purchase_requisitions").create({
    budget_line: line.id, title: "API test: stationery above budget", request_type: "goods", category: cat.id, priority: "medium",
    required_date: new Date(Date.now() + 20 * 864e5).toISOString().replace("T", " "), delivery_location: "Kigali HQ", justification: "Budget control API test.",
    items: [{ description: "Paper", quantity: 300, unit: "Ream", unit_cost: 5000, tax_rate: 0 }],
  });
  await expectStatus(accountant.send(`/api/dnr/requisitions/${pr.id}/submit`, { method: "POST" }), 400, "insufficient budget");
});
await check("only override_budget holders can override, with a reason; not for their own documents", async () => {
  await expectStatus(accountant.send("/api/ims/budget/overrides", { method: "POST", body: { document_type: "purchase_requisition", document_id: pr.id, reason: "Need it urgently please" } }), 403, "override_budget");
  await expectStatus(daf.send("/api/ims/budget/overrides", { method: "POST", body: { document_type: "purchase_requisition", document_id: pr.id, reason: "ok" } }), 400, "15 characters");
  await daf.send("/api/ims/budget/overrides", { method: "POST", body: { document_type: "purchase_requisition", document_id: pr.id, reason: "Exam period stationery; covered by the mid-year virement." } });
  const sub = await accountant.send(`/api/dnr/requisitions/${pr.id}/submit`, { method: "POST" });
  assert(sub.status === "pending_approval", sub.status);
  const ov = await admin.collection("budget_overrides").getFirstListItem(`document_id = "${pr.id}"`);
  assert(ov.status === "used" && ov.shortfall === 500000, `override ${ov.status} shortfall ${ov.shortfall}`);
});
await check("revenue lines cannot be charged with spending", async () => {
  const rev = await admin.collection("budget_lines").getFirstListItem('kind = "revenue" && status = "active"');
  await expectStatus(accountant.collection("purchase_requisitions").create({ budget_line: rev.id, title: "x", request_type: "goods", items: [{ description: "x", quantity: 1, unit: "Each", unit_cost: 1, tax_rate: 0 }] }), 400);
});
await check("a line of another department cannot be used", async () => {
  const other = await admin.collection("budget_lines").getFirstListItem(`department != "${fin.id}" && kind = "expense" && status = "active"`);
  await expectStatus(employee.collection("purchase_requisitions").create({ budget_line: other.id, title: "x", request_type: "goods", items: [{ description: "x", quantity: 1, unit: "Each", unit_cost: 1, tax_rate: 0 }] }), 400, "another department");
});

console.log("\nCommitment accounting");
let po;
await check("an approved purchase order commits the budget; cancelling it releases the commitment", async () => {
  const cat = await admin.collection("procurement_categories").getFirstListItem('code = "PRN"');
  const small = await accountant.collection("purchase_requisitions").create({
    budget_line: (await admin.collection("budget_lines").getFirstListItem(`code = "TST${tag}-5215"`)).id, title: "API test: printing", request_type: "goods", category: cat.id, priority: "medium",
    required_date: new Date(Date.now() + 20 * 864e5).toISOString().replace("T", " "), delivery_location: "Kigali HQ", justification: "Commitment API test.",
    items: [{ description: "Printed forms", quantity: 100, unit: "Each", unit_cost: 2000, tax_rate: 0 }],
  });
  const s = await accountant.send(`/api/dnr/requisitions/${small.id}/submit`, { method: "POST" });
  assert((await approveAll(s.approval)) === "approved", "requisition not approved");
  const lineId = small.budget_line;
  const before = await figures(lineId);
  const sup = await admin.collection("suppliers").getFirstListItem('status = "active"');
  po = await procurement.send(`/api/dnr/purchase-orders/direct/${small.id}`, { method: "POST", body: { supplier: sup.id, justification: "Single supplier holds the approved form template." } });
  const ps = await procurement.send(`/api/dnr/purchase-orders/${po.id}/submit`, { method: "POST" });
  assert((await approveAll(ps.approval)) === "approved", "PO not approved");
  const mid = await figures(lineId);
  assert(mid.committed === before.committed + 200000 && mid.available === before.available - 200000, `committed ${before.committed} → ${mid.committed}`);
  await procurement.send(`/api/dnr/purchase-orders/${po.id}/cancel`, { method: "POST", body: { reason: "API test: order no longer needed" } });
  const after = await figures(lineId);
  assert(after.committed === before.committed && after.available === before.available, `after cancel committed ${after.committed}`);
});
await check("actuals reconcile: approved invoices, direct-expense vouchers, bank charges, payrolls and staff expenses", async () => {
  const invoices = await admin.collection("supplier_invoices").getFullList({ filter: "actual_amount > 0" });
  const vouchers = await admin.collection("payment_vouchers").getFullList({ filter: "actual_amount > 0" });
  assert(invoices.length > 0, "no approved invoice in the demo data");
  const u = await daf.send("/api/ims/budget/usage", {});
  const actual = u.items.reduce((a, i) => a + i.actual, 0);
  // Bank charges recorded from bank statements are charged to their budget line too (Step 5).
  const charges = await admin.collection("cash_book_entries").getFullList({ filter: "budget_line != ''" });
  // Approved payrolls are charged to the personnel lines (Step 6).
  const payrolls = await admin.collection("payrolls").getFullList({ filter: "gl_journal != ''" });
  const payroll = payrolls.reduce((a, p) => a + ((p.posting && p.posting.budget) || []).reduce((t, l) => t + l.amount, 0), 0);
  assert(payrolls.length > 0 && payroll > 0, "no posted payroll in the demo data");
  // Approved staff expense claims are charged to the requester's department line.
  const claims = await admin.collection("prepayments").getFullList({ filter: "actual_amount > 0" });
  // Posted manual journals move actuals between lines (accruals, reclassifications) and back when reversed.
  const moved = (await admin.collection("budget_ledger").getFullList({ filter: 'source_type = "journal_entry"' })).reduce((t, b) => t + (b.type === "actual" ? b.amount : b.type === "actual_reversal" ? -b.amount : 0), 0);
  const expected = invoices.reduce((a, i) => a + i.actual_amount, 0) + vouchers.reduce((a, v) => a + v.actual_amount, 0) + charges.reduce((a, e) => a + (e.direction === "out" ? e.amount : -e.amount), 0) + payroll + claims.reduce((a, c) => a + c.actual_amount, 0) + moved;
  assert(actual === expected, `ledger actual ${actual} ≠ invoices + vouchers + bank charges + payrolls + staff expenses ${expected}`);
  for (const i of u.items) assert(i.available === i.budget - i.committed - i.actual, `${i.code} does not reconcile`);
});

console.log("\nRevisions");
await check("a virement must move as much as it takes (net zero)", async () => {
  const other = await admin.collection("budget_lines").getFirstListItem(`code = "TST${tag}-5215"`);
  await expectStatus(officer.collection("budget_revisions").create({ type: "virement", fiscal_year: fy.id, title: "x", reason: "Testing the virement rule", lines: [{ budget_line: line.id, change: -100000 }, { budget_line: other.id, change: 50000 }] }), 400, "must equal");
});
await check("a line cannot be reduced below what is committed or spent", async () => {
  const r = await officer.collection("budget_revisions").create({ type: "reduction", fiscal_year: fy.id, title: "API test reduction", reason: "Testing the reduction limit", lines: [{ budget_line: line.id, change: -1100000 }] });
  await expectStatus(officer.send(`/api/ims/budget-revisions/${r.id}/submit`, { method: "POST" }), 400, "at most");
  await officer.send(`/api/ims/budget-revisions/${r.id}/cancel`, { method: "POST", body: { reason: "API test clean-up" } });
});
await check("an approved supplementary budget raises the line and keeps the phasing consistent", async () => {
  const r = await officer.collection("budget_revisions").create({ type: "supplementary", fiscal_year: fy.id, title: "API test supplementary", reason: "Additional stationery approved by the board", lines: [{ budget_line: line.id, change: 600000 }] });
  const s = await officer.send(`/api/ims/budget-revisions/${r.id}/submit`, { method: "POST" });
  assert((await approveAll(s.approval)) === "approved", "revision not approved");
  const l = await admin.collection("budget_lines").getOne(line.id);
  assert(l.revised_amount === 1600000, `revised ${l.revised_amount}`);
  assert(l.phasing.reduce((a, v) => a + v, 0) === 1600000, "phasing does not add up");
});

console.log("\nScope and reports");
await check("heads of department see only their department's lines", async () => {
  const u = await hod.send("/api/ims/budget/usage", {});
  const me = await admin.collection("users").getFirstListItem('email = "hod@dnr-hr.rw"');
  assert(u.items.length > 0 && u.items.every((i) => i.department === me.department), "lines outside the department");
});
await check("staff cannot see budget figures (usage 403, amounts hidden on lines)", async () => {
  await expectStatus(employee.send("/api/ims/budget/usage", {}), 403, "view_budgets");
  const l = await employee.collection("budget_lines").getFirstListItem(`code = "${CODE}"`);
  assert(l.revised_amount === 0 && l.original_amount === 0, "amounts visible to staff");
});
await check("the budget ledger cannot be read or written directly", async () => {
  await expectStatus(daf.collection("budget_ledger").getList(1, 1), 403);
  await expectStatus(daf.collection("budget_ledger").create({ budget_line: line.id, type: "actual", amount: 1 }), 403);
});
await check("budget vs actual ties out with the utilisation figures", async () => {
  const b = await daf.send("/api/ims/budget/bva?group_by=department&from_period=1&to_period=12", {});
  const u = await daf.send("/api/ims/budget/usage", {});
  const spend = u.items.filter((i) => i.kind !== "revenue");
  assert(b.totals.actual === spend.reduce((a, i) => a + i.actual, 0), `bva actual ${b.totals.actual}`);
  assert(b.totals.annual_budget === spend.reduce((a, i) => a + i.budget, 0), "bva budget");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
