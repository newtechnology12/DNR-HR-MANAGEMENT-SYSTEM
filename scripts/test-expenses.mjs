#!/usr/bin/env node
/**
 * API checks for staff expenses and salary advances: requests written by the server only and for oneself, the
 * checks on amounts, dates and categories, head of department → DAF approval with nobody approving their own, the
 * budget actual, payment by the Cashier from a cash book (dates, funds, kind of account) with the cash book entry and
 * the journal, advances (one at a time, at most half the net pay, Dr staff advances, picked up by the payroll only
 * once paid), returned / withdrawn / cancelled requests, who sees what, the old floats closed, categories for Finance.
 * Uses its own cash book and bank account (removed at the end). Runs against a local server seeded with
 * `npm run seed:ralga`.
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
const post = (pb, path, body) => pb.send(path, { method: "POST", body: body || {} });
const act = async (pb, id, action = "approve", comment = "Checked.") => post(pb, `/api/dnr/approvals/${(await admin.collection("prepayments").getOne(id)).approval}/act`, { action, comment });
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const employee = await login("employee@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw"); // head of Capacity Building, the employee's department
const otherHead = await login("marie.nsengiyumva10@dnr-hr.rw"); // head of Advocacy, Policy and Research
const colleague = await login("paul.mugabo11@dnr-hr.rw"); // staff of another department
const daf = await login("finance@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const hr = await login("hr@dnr-hr.rw");
const me = employee.authStore.model;
const category = (name) => admin.collection("expenses_categories").getFirstListItem(`name = "${name}"`);
const TRANSPORT = await category("Local transport (taxi, moto, bus)");
const ADVANCE = await category("Salary advance");
const account = async (code) => (await admin.collection("gl_accounts").getFirstListItem(`code = "${code}"`)).id;
const ADVANCES_GL = await account("1120");
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const what = (s) => `${s} [test ${tag}]`;
const ask = (pb, body) => post(pb, "/api/ims/staff-expenses", { category: TRANSPORT.id, amount: 8000, date: day(-2), description: what("Moto taxi to the City of Kigali for the district meeting"), pay_by: "cash", ...body });

// everything the checks create goes at the end: requests, approvals, budget entries, journals, cash entries, accounts
const created = { gl: [], accounts: [] };
cleanup.push(async () => {
  const mine = await admin.collection("prepayments").getFullList({ filter: `description ~ "${tag}"`, fields: "id" });
  for (const r of mine) {
    for (const col of ["approval_actions", "approval_requests"]) for (const a of await admin.collection(col).getFullList({ filter: `document_id = "${r.id}"`, fields: "id" })) await admin.collection(col).delete(a.id);
    for (const b of await admin.collection("budget_ledger").getFullList({ filter: `source_type = "staff_expense" && source_id = "${r.id}"`, fields: "id" })) await admin.collection("budget_ledger").delete(b.id);
    for (const o of await admin.collection("budget_overrides").getFullList({ filter: `document_id = "${r.id}"`, fields: "id" })) await admin.collection("budget_overrides").delete(o.id);
  }
  for (const id of created.gl) {
    const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `account = "${id}"`, fields: "journal" });
    for (const jid of new Set(lines.map((l) => l.journal))) {
      for (const l of await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${jid}"`, fields: "id" })) await admin.collection("gl_journal_lines").delete(l.id);
      await admin.collection("gl_journals").delete(jid);
    }
  }
  for (const r of mine) await admin.collection("prepayments").delete(r.id);
  for (const id of created.accounts) {
    for (const e of await admin.collection("cash_book_entries").getFullList({ filter: `account = "${id}"`, fields: "id" })) await admin.collection("cash_book_entries").delete(e.id);
    await admin.collection("bank_accounts").delete(id);
  }
  for (const id of created.gl) await admin.collection("gl_accounts").delete(id);
  for (const c of await admin.collection("expenses_categories").getFullList({ filter: `name ~ "${tag}"`, fields: "id" })) await admin.collection("expenses_categories").delete(c.id);
});

// a cash book with little money and a bank account, both the test's own
const cashierUser = cashier.authStore.model;
for (const n of ["X", "Y"]) {
  const g = await admin.collection("gl_accounts").create({ code: `T${n}${tag}`, name: `Test ${n === "X" ? "petty cash" : "bank"} ${tag}`, type: "asset", is_posting: true, cash_flow_class: "cash", statement_section: "current_assets", active: true });
  created.gl.push(g.id);
}
const CASH = await daf.collection("bank_accounts").create({ code: `TX-${tag}`, name: `Test petty cash ${tag}`, kind: "cash", gl_account: created.gl[0], opening_balance: 20000, opening_date: noon(day(-5)), custodian: cashierUser.id, cash_limit: 1000000 });
created.accounts.push(CASH.id);
const BANK = await daf.collection("bank_accounts").create({ code: `TY-${tag}`, name: `Test bank ${tag}`, kind: "bank", bank_name: "Test Bank", account_number: "0000-1111", gl_account: created.gl[1], opening_balance: 5000000, opening_date: noon(day(-5)), currency: "RWF" });
created.accounts.push(BANK.id);

try {
  console.log("Requests");
  let claim;
  await check("staff ask for themselves only, through the server", async () => {
    claim = await ask(employee, { employee: colleague.authStore.model.id });
    const r = await admin.collection("prepayments").getOne(claim.id);
    assert(r.status === "pending_approval" && /^EXP-/.test(r.number), `status ${r.status} ${r.number}`);
    assert(r.employee === me.id && r.department === me.department && r.kind === "claim", "not filed for the person who asked");
    assert(r.gl_account === TRANSPORT.gl_account && r.budget_line, "no account or budget line");
    await expectStatus(employee.collection("prepayments").create({ employee: me.id, amount: 1000, description: "direct", status: "approved" }), 403);
    await expectStatus(employee.collection("prepayments").update(claim.id, { status: "approved" }), 403);
    await expectStatus(auditor.send("/api/ims/staff-expenses", { method: "POST", body: { category: TRANSPORT.id, amount: 1000 } }), 403);
  });
  await check("amounts, dates, receipts and ceilings are checked", async () => {
    await expectStatus(ask(employee, { amount: 0 }), 400, "amount");
    await expectStatus(ask(employee, { amount: TRANSPORT.max_amount + 1000 }), 400, "at most");
    await expectStatus(ask(employee, { date: day(3) }), 400, "future");
    await expectStatus(ask(employee, { date: day(-120) }), 400, "not reimbursed");
    await expectStatus(ask(employee, { description: "taxi" }), 400, "10 characters");
    await expectStatus(ask(employee, { pay_by: "mobile_money", momoNumber: "12345" }), 400, "mobile money number");
  });

  console.log("Approval");
  await check("the head of department, then the DAF; nobody approves their own or another department's", async () => {
    await expectStatus(act(employee, claim.id), 403);
    await expectStatus(act(otherHead, claim.id), 403);
    await expectStatus(act(cashier, claim.id), 403);
    await act(hod, claim.id);
    let r = await admin.collection("prepayments").getOne(claim.id);
    assert(r.status === "pending_approval" && r.pending_approvers.includes(daf.authStore.model.id), "not with the DAF after the head of department");
    await act(daf, claim.id);
    r = await admin.collection("prepayments").getOne(claim.id);
    assert(r.status === "approved" && r.actual_amount === 8000, `status ${r.status}, actual ${r.actual_amount}`);
    const actual = await admin.collection("budget_ledger").getFullList({ filter: `source_type = "staff_expense" && source_id = "${claim.id}" && type = "actual"` });
    assert(actual.length === 1 && actual[0].amount === 8000 && actual[0].budget_line === r.budget_line, "the budget actual is missing");
  });

  console.log("Payment");
  await check("only the Cashier pays — never their own — from an account of the right kind, dated after its opening", async () => {
    await expectStatus(post(daf, `/api/ims/staff-expenses/${claim.id}/pay`, { account: CASH.id, method: "cash" }), 403);
    await expectStatus(post(hod, `/api/ims/staff-expenses/${claim.id}/pay`, { account: CASH.id, method: "cash" }), 403);
    await expectStatus(post(cashier, `/api/ims/staff-expenses/${claim.id}/pay`, { account: BANK.id, method: "cash" }), 400, "cash book");
    await expectStatus(post(cashier, `/api/ims/staff-expenses/${claim.id}/pay`, { account: BANK.id, method: "mobile_money" }), 400, "transaction id");
    await expectStatus(post(cashier, `/api/ims/staff-expenses/${claim.id}/pay`, { account: CASH.id, method: "cash", date: day(-10) }), 400, "opening balance");
  });
  await check("paying writes the cash book entry and the journal together; the cash book equals the ledger", async () => {
    const r0 = await post(cashier, `/api/ims/staff-expenses/${claim.id}/pay`, { account: CASH.id, method: "cash", date: day(0), reference: `PCV-${tag}` });
    assert(r0.status === "paid", `status ${r0.status}`);
    const r = await admin.collection("prepayments").getOne(claim.id, { expand: "entry,journal" });
    assert(r.paid_from === CASH.id && r.paid_by === cashierUser.id && r.expand.entry.amount === 8000 && r.expand.entry.direction === "out", "cash book entry");
    const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${r.journal}"` });
    const dr = lines.find((l) => l.debit === 8000);
    const cr = lines.find((l) => l.credit === 8000);
    assert(lines.length === 2 && dr.account === TRANSPORT.gl_account && dr.department === me.department && dr.budget_line === r.budget_line && cr.account === created.gl[0], "journal lines");
    const book = (await admin.collection("bank_accounts").getOne(CASH.id)).book_balance;
    const gl = (await admin.collection("gl_journal_lines").getFullList({ filter: `account = "${created.gl[0]}" && (status = "posted" || status = "reversed")` })).reduce((t, l) => t + l.debit - l.credit, 0);
    assert(book === 12000 && gl === 12000, `cash book ${book}, ledger ${gl}`);
    await expectStatus(post(cashier, `/api/ims/staff-expenses/${claim.id}/pay`, { account: CASH.id, method: "cash" }), 400, "only an approved");
    const note = await admin.collection("notifications").getList(1, 1, { filter: `user = "${me.id}" && title ~ "${r.number}" && title ~ "paid"` });
    assert(note.totalItems === 1, "the member of staff was not told");
  });
  await check("money must be there; an approved request the DAF cancels goes back to the budget", async () => {
    const big = await ask(employee, { amount: 30000, description: what("Taxis for three trips to the districts for the assessment") });
    await act(hod, big.id);
    await act(daf, big.id);
    await expectStatus(post(cashier, `/api/ims/staff-expenses/${big.id}/pay`, { account: CASH.id, method: "cash", date: day(0) }), 400, "not enough money");
    await expectStatus(post(employee, `/api/ims/staff-expenses/${big.id}/cancel`, { reason: "No longer needed" }), 403);
    await post(daf, `/api/ims/staff-expenses/${big.id}/cancel`, { reason: "Paid from the mission allowance instead" });
    const r = await admin.collection("prepayments").getOne(big.id);
    assert(r.status === "cancelled" && r.actual_amount === 0, `status ${r.status}`);
    const net = (await admin.collection("budget_ledger").getFullList({ filter: `source_type = "staff_expense" && source_id = "${big.id}"` })).reduce((t, b) => t + (b.type === "actual" ? b.amount : b.type === "actual_reversal" ? -b.amount : 0), 0);
    assert(net === 0, `the budget still holds ${net}`);
  });

  console.log("Returned and withdrawn");
  await check("a returned request is corrected by the person who asked, then withdrawn", async () => {
    const r1 = await ask(employee, { amount: 9000, description: what("Bus Kigali to Muhanga for the follow-up visit") });
    await act(hod, r1.id, "return", "Attach the ticket.");
    assert((await admin.collection("prepayments").getOne(r1.id)).status === "returned", "not returned");
    await expectStatus(post(colleague, `/api/ims/staff-expenses/${r1.id}/update`, { category: TRANSPORT.id, amount: 9000, date: day(-1), description: what("Changed by a colleague"), pay_by: "cash" }), 403);
    await post(employee, `/api/ims/staff-expenses/${r1.id}/update`, { category: TRANSPORT.id, amount: 9500, date: day(-1), description: what("Bus Kigali to Muhanga and back for the follow-up visit"), pay_by: "cash" });
    let r = await admin.collection("prepayments").getOne(r1.id);
    assert(r.status === "pending_approval" && r.amount === 9500, `status ${r.status}`);
    await expectStatus(post(colleague, `/api/ims/staff-expenses/${r1.id}/cancel`, { reason: "Not mine" }), 403);
    await post(employee, `/api/ims/staff-expenses/${r1.id}/cancel`, { reason: "I will claim it with the mission report" });
    r = await admin.collection("prepayments").getOne(r1.id);
    assert(r.status === "cancelled" && !r.pending_approvers, `status ${r.status}`);
  });

  console.log("Salary advances");
  let advance;
  await check("an advance: at most half of the last net pay, and one at a time", async () => {
    const slip = (await admin.collection("employees_payrolls").getList(1, 1, { filter: `employee = "${me.id}" && (payroll_status = "approved" || payroll_status = "paid")`, sort: "-period_year,-period_month" })).items[0];
    if (slip && slip.net_sallary > 0) await expectStatus(ask(employee, { category: ADVANCE.id, amount: Math.floor(slip.net_sallary / 2) + 1000, description: what("Medical bill for a family member") }), 400, "half of your last net pay");
    advance = await ask(employee, { category: ADVANCE.id, amount: 20000, pay_by: "bank_transfer", description: what("Medical bill for a family member") });
    const r = await admin.collection("prepayments").getOne(advance.id);
    assert(r.kind === "advance" && r.gl_account === ADVANCES_GL && !r.budget_line, "an advance is not a budget expense");
    await expectStatus(ask(employee, { category: ADVANCE.id, amount: 10000, pay_by: "bank_transfer", description: what("Second advance") }), 400, "already have");
  });
  await check("a paid advance is Dr staff advances, carries no name, and only then reaches the payroll", async () => {
    const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    const preview = async () => (await post(hr, "/api/dnr/payroll/preview-run", { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 })).rows.find((x) => x.employee === me.id);
    await act(hod, advance.id);
    await act(daf, advance.id);
    const before = await preview();
    assert(!before || before.advances === 0, `an approved, unpaid advance is already deducted (${before && before.advances})`);
    await post(cashier, `/api/ims/staff-expenses/${advance.id}/pay`, { account: BANK.id, method: "bank_transfer", date: day(0), reference: `FT-${tag}` });
    const r = await admin.collection("prepayments").getOne(advance.id, { expand: "journal" });
    const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${r.journal}"` });
    const dr = lines.find((l) => l.debit === 20000);
    assert(dr && dr.account === ADVANCES_GL && !dr.description.includes(me.name) && !r.expand.journal.description.includes(me.name), "advance journal");
    const after = await preview();
    assert(after && after.advances === 20000, `the payroll does not deduct the paid advance (${after && after.advances})`);
  });

  console.log("Who sees what");
  await check("staff see their own, a head their department, the Cashier and Finance everything", async () => {
    const own = await employee.collection("prepayments").getFullList();
    assert(own.length && own.every((r) => r.employee === me.id), "staff see someone else's request");
    await expectStatus(colleague.collection("prepayments").getOne(claim.id), 404);
    const head = await hod.collection("prepayments").getFullList({ expand: "employee" });
    assert(head.every((r) => r.expand?.employee?.department === me.department || String(r.approver_history || "").includes(hod.authStore.model.id) || r.employee === hod.authStore.model.id), "a head sees another department's requests");
    const total = (await admin.collection("prepayments").getList(1, 1)).totalItems;
    assert((await cashier.collection("prepayments").getList(1, 1)).totalItems === total, "the Cashier misses requests");
    assert((await auditor.collection("prepayments").getList(1, 1)).totalItems === total, "the auditor misses requests");
  });

  console.log("Old floats and categories");
  await check("the old floats and petty cash requests are history: nobody writes them", async () => {
    await expectStatus(daf.collection("accounts").create({ name: "New float", currentBalance: 100000 }), 403);
    await expectStatus(cashier.collection("accounts_transactions").create({ amount: 1000, transactionType: "refill" }), 403);
    await expectStatus(employee.collection("petty_cash_requests").create({ amount: 1000, notes: "test", requested_by: me.id }), 403);
    await expectStatus(daf.collection("petty_cash_requests").create({ amount: 1000, notes: "test", requested_by: daf.authStore.model.id }), 403);
  });
  await check("categories are Finance's: a claim category is charged to an active expense account", async () => {
    // refused by the create rule, which PocketBase checks before any hook (400 "Failed to create record")
    await expectStatus(employee.collection("expenses_categories").create({ name: what("Staff category"), kind: "claim", gl_account: TRANSPORT.gl_account }), 400);
    await expectStatus(daf.collection("expenses_categories").create({ name: what("No account"), kind: "claim" }), 400, "expense account");
    await expectStatus(daf.collection("expenses_categories").create({ name: what("Bank account"), kind: "claim", gl_account: await account("1101") }), 400, "not an active expense");
    const c = await daf.collection("expenses_categories").create({ name: what("Courier and postage"), kind: "claim", gl_account: await account("5201"), max_amount: 20000 });
    assert(c.active === true && c.kind === "claim", "new category not active");
  });
} finally {
  for (const fn of cleanup.reverse()) await fn().catch((e) => console.log("cleanup:", e.message));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
