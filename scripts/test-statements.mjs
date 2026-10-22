#!/usr/bin/env node
/**
 * API checks for the financial statements and management reporting (M9): who may read them; the financial position
 * balancing and agreeing with the trial balance; the financial performance equal to the trial balance's revenue and
 * expenses; the cash flow reconciling with the bank and cash books for the year and for part of it; the donor report
 * agreeing with the fund's ledger lines; the monthly trend adding up to the year; statutory payment vouchers (PAYE /
 * RSSB / withholding tax) paying liabilities only, never more than owed, without touching the budget. Uses its own
 * bank account for the statutory payment (removed at the end). Runs against a local server seeded with
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
const get = (pb, path) => pb.send(path, {});
const post = (pb, path, body) => pb.send(path, { method: "POST", body: body || {} });
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const daf = await login("finance@dnr-hr.rw");
const acc = await login("accountant@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const sg = await login("director@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const gl = Object.fromEntries((await admin.collection("gl_accounts").getFullList({ fields: "id,code" })).map((a) => [a.code, a.id]));
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const sum = (xs, f) => xs.reduce((t, x) => t + f(x), 0);

console.log("Who reads the statements");
await check("finance, management and the auditors read them; staff and heads of department do not", async () => {
  for (const pb of [employee, hod]) {
    await expectStatus(get(pb, "/api/ims/statements/financial-position"), 403);
    await expectStatus(get(pb, "/api/ims/statements/trend"), 403);
  }
  for (const pb of [daf, sg, auditor, cashier]) assert((await get(pb, "/api/ims/statements/financial-position")).sections.length === 3, "statement not returned");
});

console.log("Statements");
const tb = await get(daf, `/api/ims/ledger/trial-balance?to=${day(0)}`);
await check("financial position: assets = liabilities + net assets, and every section equals the trial balance", async () => {
  const p = await get(daf, `/api/ims/statements/financial-position?as_at=${day(0)}`);
  assert(p.balanced && p.totals.assets === p.totals.liabilities + p.totals.net_assets, `assets ${p.totals.assets} ≠ ${p.totals.liabilities} + ${p.totals.net_assets}`);
  const of = (type, sign) => sum(tb.rows.filter((r) => r.type === type), (r) => sign * r.closing);
  assert(p.totals.assets === of("asset", 1), `assets ${p.totals.assets} vs trial balance ${of("asset", 1)}`);
  assert(p.totals.liabilities === of("liability", -1), `liabilities ${p.totals.liabilities} vs trial balance ${of("liability", -1)}`);
  const surplus = p.sections[2].groups[0].lines.find((l) => !l.code).amount;
  const pl = sum(tb.rows.filter((r) => r.type === "revenue" || r.type === "expense"), (r) => -r.closing);
  assert(surplus === pl, `surplus for the year ${surplus} vs revenue less expenses ${pl}`);
});
await check("financial performance: revenue, expenses and surplus equal the trial balance; filters narrow it", async () => {
  const f = await get(daf, `/api/ims/statements/financial-performance?to=${day(0)}`);
  const revenue = sum(tb.rows.filter((r) => r.type === "revenue"), (r) => r.credit - r.debit);
  const expenses = sum(tb.rows.filter((r) => r.type === "expense"), (r) => r.debit - r.credit);
  assert(f.totals.revenue === revenue && f.totals.expenses === expenses && f.totals.surplus === revenue - expenses, `performance ${JSON.stringify(f.totals)} vs ${revenue} / ${expenses}`);
  const cbd = await admin.collection("departments").getFirstListItem('code = "CBD"');
  const d = await get(daf, `/api/ims/statements/financial-performance?to=${day(0)}&department=${cbd.id}`);
  assert(d.totals.expenses > 0 && d.totals.expenses < f.totals.expenses, "the department filter did not narrow the statement");
});
await check("cash flow: opening + net flow = closing = the bank and cash books, for the year and for part of it", async () => {
  const books = sum(await admin.collection("bank_accounts").getFullList({ fields: "book_balance" }), (a) => a.book_balance);
  const c = await get(daf, `/api/ims/statements/cash-flow?to=${day(0)}`);
  assert(c.reconciles && c.opening + c.net === c.closing && c.closing === books, `opening ${c.opening} + net ${c.net} = ${c.closing}; books ${books}`);
  assert(c.payments.every((l) => l.amount < 0) && c.receipts.every((l) => l.amount > 0), "a receipt or payment line has the wrong sign (tax withheld should reduce the supplier payment)");
  const part = await get(daf, `/api/ims/statements/cash-flow?from=${day(0).slice(0, 8)}01&to=${day(0)}`);
  assert(part.reconciles && part.closing === books, "the month to date does not reconcile");
});
await check("the monthly trend adds up to the year's performance and ends on the cash in the books", async () => {
  const t = await get(daf, `/api/ims/statements/trend?to=${day(0)}`);
  const f = await get(daf, `/api/ims/statements/financial-performance?to=${day(0)}`);
  assert(sum(t.months, (m) => m.revenue) === f.totals.revenue && sum(t.months, (m) => m.expenses) === f.totals.expenses, "months do not add up to the year");
  const books = sum(await admin.collection("bank_accounts").getFullList({ fields: "book_balance" }), (a) => a.book_balance);
  assert(t.months[t.months.length - 1].cash === books, `last month's cash ${t.months[t.months.length - 1].cash} vs books ${books}`);
});
await check("donor report: received and spent are the fund's ledger lines; the cash is its restricted account", async () => {
  const fund = await admin.collection("funding_sources").getFirstListItem('code = "DP-LED"');
  const r = await get(daf, `/api/ims/statements/donor?funding_source=${fund.id}&to=${day(0)}`);
  const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `funding_source = "${fund.id}" && (status = "posted" || status = "reversed") && date >= "${r.from} 00:00:00.000Z" && date <= "${r.to} 23:59:59.999Z"`, expand: "account", batch: 1000 });
  const received = sum(lines.filter((l) => l.expand.account.type === "revenue"), (l) => l.credit - l.debit);
  const spent = sum(lines.filter((l) => l.expand.account.type === "expense"), (l) => l.debit - l.credit);
  assert(r.received === received && r.spent === spent && r.closing === r.opening + received - spent, `donor ${r.received}/${r.spent} vs ledger ${received}/${spent}`);
  const bpr = await admin.collection("bank_accounts").getFirstListItem('code = "BPR-LED"');
  assert(r.cash === bpr.book_balance, `cash ${r.cash} vs BPR-LED ${bpr.book_balance}`);
  assert(r.lines.every((l) => l.kind !== "revenue"), "a revenue line is listed as spending");
  await expectStatus(get(daf, "/api/ims/statements/donor"), 400, "funding source");
});

console.log("Statutory payments");
// the payment goes out of the test's own bank account
const testGl = await admin.collection("gl_accounts").create({ code: `TS${tag}`, name: `Test statutory bank ${tag}`, type: "asset", is_posting: true, cash_flow_class: "cash", statement_section: "current_assets", active: true });
const bank = await daf.collection("bank_accounts").create({ code: `TS-${tag}`, name: `Test statutory bank ${tag}`, kind: "bank", bank_name: "Test Bank", account_number: "0000-2222", gl_account: testGl.id, opening_balance: 5000000, opening_date: noon(day(-3)), currency: "RWF" });
cleanup.push(async () => {
  const vs = await admin.collection("payment_vouchers").getFullList({ filter: `description ~ "${tag}"`, fields: "id" });
  for (const v of vs) {
    for (const col of ["approval_actions", "approval_requests"]) for (const a of await admin.collection(col).getFullList({ filter: `document_id = "${v.id}"`, fields: "id" })) await admin.collection(col).delete(a.id);
    for (const p of await admin.collection("payments").getFullList({ filter: `voucher = "${v.id}"`, fields: "id" })) await admin.collection("payments").delete(p.id);
  }
  const posted = await admin.collection("gl_journal_lines").getFullList({ filter: `account = "${testGl.id}"`, fields: "journal" });
  for (const jid of new Set(posted.map((l) => l.journal))) {
    for (const l of await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${jid}"`, fields: "id" })) await admin.collection("gl_journal_lines").delete(l.id);
    await admin.collection("gl_journals").delete(jid);
  }
  for (const v of vs) await admin.collection("payment_vouchers").delete(v.id);
  for (const e of await admin.collection("cash_book_entries").getFullList({ filter: `account = "${bank.id}"`, fields: "id" })) await admin.collection("cash_book_entries").delete(e.id);
  await admin.collection("bank_accounts").delete(bank.id);
  await admin.collection("gl_accounts").delete(testGl.id);
});
const owed = async () => Object.fromEntries((await get(acc, "/api/ims/vouchers/statutory-accounts")).items.map((x) => [x.code, x]));
// the demo pays PAYE and RSSB on time: when nothing is owed, a PAYE adjustment approved by the DAF creates the debt
let CODE = Object.values(await owed()).find((x) => x.available >= 30000)?.code;
if (!CODE) {
  const j = await post(acc, "/api/ims/journals", { date: day(0), description: `PAYE adjustment for the statutory test ${tag}`, lines: [{ account: gl["5101"], debit: 30000 }, { account: gl["2104"], credit: 30000 }] });
  await post(acc, `/api/ims/journals/${j.id}/submit`);
  const approval = (await admin.collection("gl_journals").getOne(j.id)).approval;
  await post(daf, `/api/dnr/approvals/${approval}/act`, { action: "approve", comment: "Test adjustment." });
  cleanup.push(async () => {
    for (const col of ["approval_actions", "approval_requests"]) for (const a of await admin.collection(col).getFullList({ filter: `document_id = "${j.id}"`, fields: "id" })) await admin.collection(col).delete(a.id);
    for (const l of await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"`, fields: "id" })) await admin.collection("gl_journal_lines").delete(l.id);
    await admin.collection("gl_journals").delete(j.id);
  });
  CODE = "2104";
}
await check("a statutory voucher pays liabilities only, and never more than is owed", async () => {
  const o = await owed();
  assert(o[CODE] && o[CODE].available > 0, "nothing owed to pay");
  const base = { voucher_type: "statutory", payee_name: "Rwanda Revenue Authority (RRA)", payee_bank: {}, description: `PAYE test ${tag}` };
  await expectStatus(acc.collection("payment_vouchers").create({ ...base, lines: [{ account: gl["5201"], amount: 1000 }] }), 400, "not paid with a statutory voucher");
  await expectStatus(acc.collection("payment_vouchers").create({ ...base, lines: [{ account: gl["2101"], amount: 1000 }] }), 400, "not paid with a statutory voucher");
  await expectStatus(acc.collection("payment_vouchers").create({ ...base, lines: [{ account: gl[CODE], amount: o[CODE].available + 1000 }] }), 400, "more than");
  // RRA's taxes and RSSB's contributions never share a voucher
  const other = o[CODE].authority === "RRA" ? "2105" : "2104";
  await expectStatus(acc.collection("payment_vouchers").create({ ...base, lines: [{ account: gl[CODE], amount: 1000 }, { account: gl[other], amount: 1000 }] }), 400, "one authority");
  const whtRate = await admin.collection("tax_rates").getFirstListItem('category = "withholding" && active = true');
  await expectStatus(acc.collection("payment_vouchers").create({ ...base, wht_code: whtRate.code, lines: [{ account: gl[CODE], amount: 1000 }] }), 400, "no withholding tax");
});
await check("paid: Dr the liability, Cr the bank; nothing reaches the budget; what is owed goes down", async () => {
  const before = (await owed())[CODE];
  const v = await acc.collection("payment_vouchers").create({ voucher_type: "statutory", payee_name: "Rwanda Revenue Authority (RRA)", payee_bank: { bank_name: "Bank of Kigali", bank_account_name: "RRA collection (test)", bank_account_number: "000-TEST" }, description: `PAYE test ${tag}`, lines: [{ account: gl[CODE], amount: 25000, period: "test" }] });
  assert(v.gross_amount === 25000 && v.net_amount === 25000 && !v.budget_line, `voucher ${v.gross_amount}/${v.net_amount}`);
  const held = (await owed())[CODE];
  assert(held.held === before.held + 25000, "the open voucher does not hold its amount");
  const s = await post(acc, `/api/ims/vouchers/${v.id}/submit`);
  for (let i = 0; i < 4; i++) {
    const a = await admin.collection("approval_requests").getOne(s.approval);
    if (a.status !== "pending") break;
    const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    await post(await login(who.email), `/api/dnr/approvals/${a.id}/act`, { action: "approve", comment: "Matches the declaration." });
  }
  await post(cashier, `/api/ims/vouchers/${v.id}/pay`, { method: "bank_transfer", account: bank.id, reference: `RRA-${tag}`, payment_date: noon(day(0)) });
  const paid = await admin.collection("payment_vouchers").getOne(v.id);
  assert(paid.status === "paid" && paid.journal, `status ${paid.status}`);
  const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${paid.journal}"` });
  assert(lines.length === 2 && lines.some((l) => l.account === gl[CODE] && l.debit === 25000) && lines.some((l) => l.account === testGl.id && l.credit === 25000), "journal lines");
  assert(!(await admin.collection("budget_ledger").getFullList({ filter: `source_id = "${v.id}"` })).length, "a statutory payment reached the budget");
  const after = (await owed())[CODE];
  assert(after.owed === before.owed - 25000 && after.held === before.held, `owed ${after.owed} (was ${before.owed})`);
});

for (const fn of cleanup.reverse()) await fn().catch((e) => console.log("cleanup:", e.message));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
