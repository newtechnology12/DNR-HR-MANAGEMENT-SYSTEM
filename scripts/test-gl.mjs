#!/usr/bin/env node
/**
 * API checks for the general ledger and period close (M8): who reads the ledger, manual journals (posting accounts
 * only, balanced, Accountant prepares → DAF approves, documents), reversals, recurring journals, the trial balance and
 * account ledgers, every module reaching the ledger, the month-end checklist, closing in order and re-opening with
 * the Secretary General's approval, and the backfill. Runs against a local PocketBase seeded with `npm run seed:ralga`.
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
const act = (pb, approvalId, action = "approve", comment = "Checked.") => post(pb, `/api/dnr/approvals/${approvalId}/act`, { action, comment });
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const today = day(0);
const monthStart = `${today.slice(0, 7)}-01`;
const pdf = (name) => new File(["%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF"], name, { type: "application/pdf" });
const upload = (pb, id, files) => {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return pb.send(`/api/ims/attachments/gl_journals/${id}`, { method: "POST", body: fd });
};

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const acc = await login("accountant@dnr-hr.rw");
const daf = await login("finance@dnr-hr.rw");
const sg = await login("director@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const account = async (code) => (await admin.collection("gl_accounts").getFirstListItem(`code = "${code}"`)).id;
const SECURITY = await account("5216"); // security services (expense)
const ACCRUED = await account("2102"); // accrued expenses (liability, not a control account)
const BANK = await account("1101");
const AP = await account("2101");
const HEADER = await account("1");
const CBD = await admin.collection("departments").getFirstListItem('code = "CBD"');
const period = (code) => admin.collection("fiscal_periods").getFirstListItem(`code = "${code}"`);
const JUL = await period("2026-07");
const AUG = await period("2026-08");
const SEP = await period("2026-09");
const OCT = await period(today.slice(0, 7));
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const what = (s) => `${s} [test ${tag}]`;
const lines = (amount, extra = {}) => [
  { account: SECURITY, debit: amount, credit: 0, description: "Escort for the cash in transit", department: CBD.id, ...extra },
  { account: ACCRUED, debit: 0, credit: amount, description: "Accrued, invoice to come" },
];
const tbOf = (pb, from = monthStart, to = today) => pb.send(`/api/ims/ledger/trial-balance?from=${from}&to=${to}`, {});

// every journal, template and approval the checks create goes at the end
cleanup.push(async () => {
  const mine = await admin.collection("gl_journals").getFullList({ filter: `description ~ "${tag}"`, fields: "id" });
  const reversals = mine.length ? await admin.collection("gl_journals").getFullList({ filter: mine.map((j) => `reversal_of = "${j.id}"`).join(" || "), fields: "id" }) : [];
  // a reversal carries the tag in its description too: each journal once, reversals first
  for (const id of new Set([...reversals, ...mine].map((j) => j.id))) {
    for (const l of await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${id}"`, fields: "id" })) await admin.collection("gl_journal_lines").delete(l.id);
    for (const a of await admin.collection("approval_actions").getFullList({ filter: `document_id = "${id}"`, fields: "id" })) await admin.collection("approval_actions").delete(a.id);
    for (const a of await admin.collection("approval_requests").getFullList({ filter: `document_id = "${id}"`, fields: "id" })) await admin.collection("approval_requests").delete(a.id);
    await admin.collection("gl_journals").delete(id);
  }
  for (const t of await admin.collection("gl_recurring_journals").getFullList({ filter: `name ~ "${tag}"`, fields: "id" })) await admin.collection("gl_recurring_journals").delete(t.id);
  for (const j of [...reversals, ...mine]) for (const b of await admin.collection("budget_ledger").getFullList({ filter: `source_type = "journal_entry" && source_id = "${j.id}"`, fields: "id" })) await admin.collection("budget_ledger").delete(b.id);
});

console.log("Who reads the ledger");
await check("staff, heads of department and the Cashier do not read the general ledger", async () => {
  for (const pb of [employee, hod, cashier]) {
    await expectStatus(tbOf(pb), 403);
    await expectStatus(pb.send(`/api/ims/ledger/account/${SECURITY}`, {}), 403);
    await expectStatus(pb.send("/api/ims/ledger/periods", {}), 403);
  }
  await expectStatus(employee.collection("gl_journals").getList(1, 1), 403);
  assert((await employee.collection("gl_recurring_journals").getList(1, 1)).totalItems === 0, "staff see recurring journals");
  assert((await employee.collection("period_reopen_requests").getList(1, 1)).totalItems === 0, "staff see re-open requests");
});
await check("the auditor and the Secretary General read it; neither can prepare a journal", async () => {
  assert((await tbOf(auditor)).balanced, "auditor: trial balance");
  assert((await sg.send("/api/ims/ledger/periods", {})).periods.length >= 12, "SG: periods");
  await expectStatus(post(auditor, "/api/ims/journals", { date: today, description: what("Auditor journal"), lines: lines(1000) }), 403);
  await expectStatus(post(sg, "/api/ims/journals", { date: today, description: what("SG journal"), lines: lines(1000) }), 403);
  await expectStatus(post(daf, "/api/ims/journals", { date: today, description: what("DAF journal"), lines: lines(1000) }), 403);
});

console.log("Manual journals");
await check("a journal must balance and use posting accounts — never bank, cash or control accounts", async () => {
  const j = (l) => post(acc, "/api/ims/journals", { date: today, description: what("Refused journal"), lines: l });
  await expectStatus(j(lines(5000).slice(0, 1)), 400, "at least two lines");
  await expectStatus(j([{ account: SECURITY, debit: 5000 }, { account: ACCRUED, credit: 4000 }]), 400, "does not balance");
  await expectStatus(j([{ account: SECURITY, debit: 5000 }, { account: BANK, credit: 5000 }]), 400, "bank or cash");
  await expectStatus(j([{ account: SECURITY, debit: 5000 }, { account: AP, credit: 5000 }]), 400, "control account");
  await expectStatus(j([{ account: SECURITY, debit: 5000 }, { account: HEADER, credit: 5000 }]), 400, "not an active posting account");
  await expectStatus(j([{ account: SECURITY, debit: 5000, credit: 5000 }, { account: ACCRUED, credit: 0, debit: 0 }]), 400, "not both");
  await expectStatus(post(acc, "/api/ims/journals", { date: today, description: "x", lines: lines(5000) }), 400, "describe");
  assert(!(await admin.collection("gl_journals").getFullList({ filter: `description ~ "${tag}"` })).length, "a refused journal was saved");
});

let posted;
await check("the Accountant prepares, the DAF approves and posts; a draft is not in the ledger", async () => {
  const before = await tbOf(daf);
  const j = await post(acc, "/api/ims/journals", { date: today, description: what("Accrual of the October cash escort"), lines: lines(150000) });
  assert(j.status === "draft", `status ${j.status}`);
  const draftLines = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"` });
  assert(draftLines.length === 2 && draftLines.every((l) => l.status === "draft"), "draft lines");
  assert((await tbOf(daf)).totals.debit === before.totals.debit, "a draft reached the trial balance");
  const files = await upload(acc, j.id, [pdf("escort-contract.pdf")]);
  assert(files.files.length === 1, "document not attached");
  await expectStatus(upload(employee, j.id, [pdf("x.pdf")]), 403);
  await post(acc, `/api/ims/journals/${j.id}/submit`);
  const sent = await admin.collection("gl_journals").getOne(j.id);
  assert(sent.status === "pending_approval" && sent.approval, `status ${sent.status}`);
  await expectStatus(act(acc, sent.approval), 403);
  await expectStatus(act(auditor, sent.approval), 403);
  await act(daf, sent.approval);
  posted = await admin.collection("gl_journals").getOne(j.id);
  assert(posted.status === "posted" && posted.posted_by === daf.authStore.model.id, `status ${posted.status}`);
  const after = await tbOf(daf);
  assert(after.balanced && after.totals.debit === before.totals.debit + 150000, `trial balance moved by ${after.totals.debit - before.totals.debit}`);
  const log = await admin.collection("audit_logs").getList(1, 1, { filter: `record_id = "${j.id}" && action = "journal_posted"` });
  assert(log.totalItems === 1, "posting not audited");
});

await check("a posted journal is never edited, cancelled or stripped of its documents", async () => {
  assert(posted, "no posted journal");
  await expectStatus(post(acc, `/api/ims/journals/${posted.id}/update`, { date: today, description: what("Changed"), lines: lines(1) }), 400, "only drafts");
  await expectStatus(post(daf, `/api/ims/journals/${posted.id}/cancel`, { reason: "Changing my mind" }), 400, "reversed, not cancelled");
  await expectStatus(acc.collection("gl_journals").update(posted.id, { description: "edited" }), 403);
  await expectStatus(acc.collection("gl_journal_lines").create({ journal: posted.id, account: SECURITY, debit: 1 }), 403);
  await expectStatus(acc.send(`/api/ims/attachments/gl_journals/${posted.id}/${encodeURIComponent(posted.attachments[0])}`, { method: "DELETE" }), 400, "part of the record");
});

await check("a mistake is corrected by a reversal: by the DAF, explained, never dated before the journal", async () => {
  await expectStatus(post(acc, `/api/ims/journals/${posted.id}/reverse`, { reason: what("Posted twice by mistake") }), 403);
  await expectStatus(post(daf, `/api/ims/journals/${posted.id}/reverse`, { reason: "dup" }), 400, "explain");
  await expectStatus(post(daf, `/api/ims/journals/${posted.id}/reverse`, { reason: what("Posted twice by mistake"), date: day(-40) }), 400, "before the journal");
  const before = await tbOf(daf);
  const rev = await post(daf, `/api/ims/journals/${posted.id}/reverse`, { reason: what("Posted twice by mistake"), date: today });
  const original = await admin.collection("gl_journals").getOne(posted.id);
  const reversal = await admin.collection("gl_journals").getOne(rev.id);
  assert(original.status === "reversed" && original.reversed_by === rev.id, `original ${original.status}`);
  assert(reversal.status === "posted" && reversal.journal_type === "reversal" && reversal.reversal_of === posted.id, "reversal journal");
  const after = await tbOf(daf);
  assert(after.balanced && after.totals.debit === before.totals.debit + 150000, "the reversal is not in the trial balance");
  const led = await daf.send(`/api/ims/ledger/account/${SECURITY}?from=${today}&to=${today}`, {});
  const net = led.rows.filter((r) => r.journal === posted.id || r.journal === rev.id).reduce((t, r) => t + r.debit - r.credit, 0);
  assert(net === 0, `the journal and its reversal net to ${net}`);
  await expectStatus(post(daf, `/api/ims/journals/${posted.id}/reverse`, { reason: what("Again") }), 400, "only a posted journal");
});

await check("automatic journals are corrected from their document, not by hand", async () => {
  const auto = await admin.collection("gl_journals").getFirstListItem('status = "posted" && journal_type = "automatic" && source_type = "payroll"');
  await expectStatus(post(daf, `/api/ims/journals/${auto.id}/reverse`, { reason: what("Trying to reverse the payroll") }), 400, "correct it there");
  await expectStatus(post(acc, `/api/ims/journals/${auto.id}/update`, { date: today, description: what("Edit payroll"), lines: lines(1) }), 400);
});

await check("a posted reclassification moves the budget actual between lines; its reversal moves it back", async () => {
  const line = (code) => admin.collection("budget_lines").getFirstListItem(`code = "${code}"`);
  const to = await line("CBD-5209-MC");
  const from = await line("CBD-5207-MC");
  const usage = async () => Object.fromEntries((await daf.send(`/api/ims/budget/usage?department=${CBD.id}`, {})).items.map((i) => [i.code, i.actual]));
  const before = await usage();
  const j = await post(acc, "/api/ims/journals", { date: today, description: what("Workshop costs booked to travel by mistake"), lines: [{ account: to.gl_account, debit: 10000, department: CBD.id }, { account: from.gl_account, credit: 10000, department: CBD.id }] });
  await post(acc, `/api/ims/journals/${j.id}/submit`);
  await act(daf, (await admin.collection("gl_journals").getOne(j.id)).approval);
  const after = await usage();
  assert(after["CBD-5209-MC"] === before["CBD-5209-MC"] + 10000 && after["CBD-5207-MC"] === before["CBD-5207-MC"] - 10000, `actuals ${JSON.stringify([before["CBD-5209-MC"], after["CBD-5209-MC"], before["CBD-5207-MC"], after["CBD-5207-MC"]])}`);
  await post(daf, `/api/ims/journals/${j.id}/reverse`, { reason: what("Reclassified twice"), date: today });
  const back = await usage();
  assert(back["CBD-5209-MC"] === before["CBD-5209-MC"] && back["CBD-5207-MC"] === before["CBD-5207-MC"], "the reversal did not move the actuals back");
});

await check("returned journals go back to the Accountant; rejected ones never reach the ledger", async () => {
  const before = await tbOf(daf);
  const j = await post(acc, "/api/ims/journals", { date: today, description: what("Reclassification to be returned"), lines: lines(90000) });
  await post(acc, `/api/ims/journals/${j.id}/submit`);
  await act(daf, (await admin.collection("gl_journals").getOne(j.id)).approval, "return", "Attach the escort contract and use the CBD project.");
  let r = await admin.collection("gl_journals").getOne(j.id);
  assert(r.status === "returned", `status ${r.status}`);
  assert((await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"` })).every((l) => l.status === "draft"), "returned lines left in the ledger");
  await post(acc, `/api/ims/journals/${j.id}/update`, { date: today, description: what("Reclassification, corrected"), lines: lines(95000) });
  await post(acc, `/api/ims/journals/${j.id}/submit`);
  await act(daf, (await admin.collection("gl_journals").getOne(j.id)).approval, "reject", "Not needed: the supplier will invoice in November.");
  r = await admin.collection("gl_journals").getOne(j.id);
  assert(r.status === "rejected", `status ${r.status}`);
  assert((await tbOf(daf)).totals.debit === before.totals.debit, "a rejected journal reached the ledger");
});

await check("a journal cannot be sent into a closed month; a draft can be cancelled with a reason", async () => {
  const j = await post(acc, "/api/ims/journals", { date: "2026-08-20", description: what("Late August accrual"), lines: lines(40000) });
  await expectStatus(post(acc, `/api/ims/journals/${j.id}/submit`), 400, "closed");
  await expectStatus(post(acc, `/api/ims/journals/${j.id}/cancel`, { reason: "no" }), 400, "reason");
  await post(acc, `/api/ims/journals/${j.id}/cancel`, { reason: "Month closed: it goes into October instead." });
  const r = await admin.collection("gl_journals").getOne(j.id);
  assert(r.status === "cancelled" && r.cancel_reason, `status ${r.status}`);
});

console.log("Recurring journals");
await check("generating creates one journal per date that has come, sends it to the DAF, and never twice", async () => {
  await expectStatus(post(daf, "/api/ims/recurring-journals", { name: what("DAF template"), frequency: "monthly", day_of_month: 1, start_date: monthStart, lines: lines(1000) }), 403);
  await expectStatus(post(acc, "/api/ims/recurring-journals", { name: what("Unbalanced"), frequency: "monthly", day_of_month: 1, start_date: monthStart, lines: [{ account: SECURITY, debit: 10 }, { account: ACCRUED, credit: 9 }] }), 400, "does not balance");
  await expectStatus(post(acc, "/api/ims/recurring-journals", { name: what("Day 31"), frequency: "monthly", day_of_month: 31, start_date: monthStart, lines: lines(10) }), 400, "1 to 28");
  const t = await post(acc, "/api/ims/recurring-journals", { name: what("Monthly escort accrual"), frequency: "monthly", day_of_month: 1, start_date: monthStart, lines: lines(60000) });
  assert(t.next_date.slice(0, 10) === monthStart, `next date ${t.next_date}`);
  const g = await post(acc, `/api/ims/recurring-journals/${t.id}/generate`);
  assert(g.created.length === 1 && g.created[0].date === monthStart && !g.problems.length, JSON.stringify(g));
  const j = await admin.collection("gl_journals").getOne(g.created[0].id);
  assert(j.status === "pending_approval" && j.journal_type === "recurring" && j.recurring === t.id && j.total_debit === 60000, `journal ${j.status} ${j.journal_type}`);
  const again = await post(acc, `/api/ims/recurring-journals/${t.id}/generate`);
  assert(again.created.length === 0, "generated twice");
  const tpl = await admin.collection("gl_recurring_journals").getOne(t.id);
  assert(tpl.last_journal === j.id && tpl.next_date.slice(0, 10) > today, `next ${tpl.next_date}`);
  await post(acc, `/api/ims/journals/${j.id}/cancel`, { reason: "Test occurrence withdrawn." });
});

await check("an occurrence in a closed month is reported and leaves no draft behind", async () => {
  const t = await post(acc, "/api/ims/recurring-journals", { name: what("Template from August"), frequency: "monthly", day_of_month: 5, start_date: "2026-08-01", lines: lines(20000) });
  const g = await post(acc, `/api/ims/recurring-journals/${t.id}/generate`);
  assert(g.created.length === 0 && g.problems.length === 1 && /closed/i.test(g.problems[0]), JSON.stringify(g));
  const drafts = await admin.collection("gl_journals").getFullList({ filter: `recurring = "${t.id}"` });
  assert(drafts.length === 0, `${drafts.length} draft(s) left behind`);
  assert((await admin.collection("gl_recurring_journals").getOne(t.id)).next_date.slice(0, 10) === "2026-08-05", "the date moved on without a journal");
});

console.log("Trial balance and account ledgers");
await check("the trial balance balances — opening, movements and closing — and revenue and expenses start the year at nil", async () => {
  const tb = await tbOf(auditor, "2026-07-01", today);
  const t = tb.totals;
  assert(tb.balanced && t.opening_dr === t.opening_cr && t.debit === t.credit && t.closing_dr === t.closing_cr, JSON.stringify(t));
  assert(tb.fy_start === "2026-07-01" && tb.rows.length > 20, `fy ${tb.fy_start}, ${tb.rows.length} rows`);
  assert(tb.rows.filter((r) => r.type === "revenue" || r.type === "expense").every((r) => r.opening === 0), "a revenue or expense account opens the year with a balance");
  for (const r of tb.rows) assert(r.closing === r.opening + r.debit - r.credit, `${r.code} does not add up`);
  await expectStatus(tbOf(auditor, today, "2026-07-01"), 400, "after");
});

await check("each account ledger agrees with the trial balance, line by line", async () => {
  const tb = await tbOf(daf, "2026-07-01", today);
  for (const id of [BANK, AP, ACCRUED, SECURITY]) {
    const row = tb.rows.find((r) => r.account === id);
    const led = await daf.send(`/api/ims/ledger/account/${id}?from=2026-07-01&to=${today}`, {});
    assert(row && led.opening === row.opening && led.debit === row.debit && led.credit === row.credit && led.closing === row.closing, `${led.account.code}: ledger ${led.closing} vs trial balance ${row && row.closing}`);
    let bal = led.opening;
    for (const l of led.rows) {
      bal += l.debit - l.credit;
      assert(l.balance === bal, `${led.account.code}: running balance broken on ${l.number}`);
    }
  }
  const dept = await daf.send(`/api/ims/ledger/trial-balance?from=2026-07-01&to=${today}&department=${CBD.id}`, {});
  assert(dept.totals.debit > 0 && dept.totals.debit < tb.totals.debit, "the department filter did not narrow the trial balance");
});

await check("every document reaches the ledger: invoices, vouchers, receipts, transfers and the bank and cash books", async () => {
  const n = async (c, f) => (await admin.collection(c).getList(1, 1, { filter: f, fields: "id" })).totalItems;
  assert((await n("supplier_invoices", 'journal = "" && (status = "approved" || status = "partially_paid" || status = "paid")')) === 0, "an approved invoice is not posted");
  assert((await n("payment_vouchers", 'journal = "" && status = "paid"')) === 0, "a paid voucher is not posted");
  assert((await n("cash_book_entries", 'journal = ""')) === 0, "a cash book entry is not posted");
  const all = await admin.collection("gl_journal_lines").getFullList({ filter: 'status = "posted" || status = "reversed"', fields: "account,debit,credit", batch: 1000 });
  const known = new Set((await admin.collection("gl_accounts").getFullList({ fields: "id" })).map((a) => a.id));
  assert(all.every((l) => known.has(l.account)), `${all.filter((l) => !known.has(l.account)).length} posting(s) on an account that no longer exists`);
  const bal = {};
  for (const l of all) bal[l.account] = (bal[l.account] || 0) + l.debit - l.credit;
  for (const a of await admin.collection("bank_accounts").getFullList({ fields: "code,gl_account,book_balance" })) {
    assert(a.book_balance === (bal[a.gl_account] || 0), `${a.code}: cash book ${a.book_balance}, ledger ${bal[a.gl_account] || 0}`);
  }
  const open = await admin.collection("supplier_invoices").getFullList({ filter: 'status = "approved" || status = "partially_paid"', fields: "balance" });
  const ap = -(bal[AP] || 0);
  assert(ap === open.reduce((t, i) => t + Math.round(i.balance), 0), `accounts payable ${ap} ≠ open invoices`);
  assert(Object.values(bal).reduce((t, x) => t + x, 0) === 0, "the ledger does not net to nil");
});

await check("an account with postings is never deleted — not even by a superuser; it is made inactive", async () => {
  await expectStatus(admin.collection("gl_accounts").delete(SECURITY), 400, "has postings");
  await expectStatus(acc.collection("gl_accounts").delete(SECURITY), 403);
  assert((await admin.collection("gl_accounts").getOne(SECURITY)).id === SECURITY, "the account is gone");
});

console.log("Period close");
await check("a month is closed by the DAF only, after it ends, in order and once its checklist is clear", async () => {
  const sep = await daf.send(`/api/ims/ledger/periods/${SEP.id}`, {});
  assert(Array.isArray(sep.checklist) && sep.checklist.length >= 9, "no checklist");
  await expectStatus(post(acc, `/api/ims/ledger/periods/${SEP.id}/close`), 403);
  await expectStatus(post(sg, `/api/ims/ledger/periods/${SEP.id}/close`), 403);
  await expectStatus(post(daf, `/api/ims/ledger/periods/${OCT.id}/close`), 400, "not over");
  await expectStatus(post(daf, `/api/ims/ledger/periods/${JUL.id}/close`), 400, "already closed");
  if (sep.blocking) await expectStatus(post(daf, `/api/ims/ledger/periods/${SEP.id}/close`), 400, "cannot be closed yet");
  const oct = await daf.send(`/api/ims/ledger/periods/${OCT.id}`, {});
  const previous = oct.checklist.find((i) => i.key === "previous");
  assert(previous.state === "fail" && previous.blocking, "October does not wait for September");
  for (const p of [JUL, AUG]) {
    const closed = await daf.send(`/api/ims/ledger/periods/${p.id}`, {});
    assert(closed.status === "closed" && closed.close_checklist.every((i) => !i.blocking), `${closed.name} was closed with a blocking item`);
  }
});

await check("re-opening needs a reason, the latest closed month first, and the Secretary General's approval", async () => {
  const seeded = await admin.collection("period_reopen_requests").getFirstListItem(`period = "${AUG.id}" && status = "pending_approval"`);
  const requester = seeded.requested_by === daf.authStore.model.id ? daf : acc;
  await expectStatus(post(employee, `/api/ims/ledger/periods/${AUG.id}/reopen`, { reason: "I would like to change something in August." }), 403);
  await expectStatus(post(acc, `/api/ims/ledger/periods/${JUL.id}/reopen`, { reason: what("Correct a July accrual that was missed") }), 400, "latest");
  await expectStatus(post(acc, `/api/ims/ledger/periods/${SEP.id}/reopen`, { reason: what("September is still open anyway") }), 400, "open");
  await expectStatus(post(acc, `/api/ims/ledger/periods/${AUG.id}/reopen`, { reason: "too short" }), 400, "20 characters");
  await expectStatus(post(acc, `/api/ims/ledger/periods/${AUG.id}/reopen`, { reason: what("Second request for the same month") }), 400, "already asks");
  await expectStatus(act(acc, seeded.approval), 403);
  await expectStatus(act(daf, seeded.approval), 403);
  await act(sg, seeded.approval, "approve", "Agreed: reclassify, then close again.");
  const aug = await admin.collection("fiscal_periods").getOne(AUG.id);
  assert(aug.status === "open" && aug.reopened_by === sg.authStore.model.id, `August ${aug.status}`);
  const note = await admin.collection("notifications").getList(1, 1, { filter: `user = "${seeded.requested_by}" && title ~ "re-opened"`, sort: "-created" }).catch(() => ({ totalItems: 1 }));
  assert(note.totalItems >= 1, "the requester was not told");
  // back as it was: closed again by the DAF, with the request pending for the demo
  await post(daf, `/api/ims/ledger/periods/${AUG.id}/close`, { note: "Closed again after the test re-opening." });
  assert((await admin.collection("fiscal_periods").getOne(AUG.id)).status === "closed", "August not closed again");
  const again = await post(requester, `/api/ims/ledger/periods/${AUG.id}/reopen`, { reason: seeded.reason });
  assert(again.status === "pending_approval", `new request ${again.status}`);
  cleanup.push(async () => {
    for (const a of await admin.collection("approval_actions").getFullList({ filter: `document_id = "${seeded.id}"`, fields: "id" })) await admin.collection("approval_actions").delete(a.id);
    for (const a of await admin.collection("approval_requests").getFullList({ filter: `document_id = "${seeded.id}"`, fields: "id" })) await admin.collection("approval_requests").delete(a.id);
    await admin.collection("period_reopen_requests").delete(seeded.id);
    await admin.collection("fiscal_periods").update(AUG.id, { reopened_by: "", reopened_at: "", reopen_reason: "", close_note: AUG.close_note || "" });
  });
});

await check("a pending re-open request is withdrawn only by the person who asked or the DAF", async () => {
  const pending = await admin.collection("period_reopen_requests").getFirstListItem(`period = "${AUG.id}" && status = "pending_approval"`);
  const other = pending.requested_by === daf.authStore.model.id ? acc : null;
  if (other) await expectStatus(post(other, `/api/ims/period-reopen/${pending.id}/cancel`, { reason: "Not mine to withdraw" }), 403);
  await expectStatus(post(auditor, `/api/ims/period-reopen/${pending.id}/cancel`, { reason: "Auditor" }), 403);
});

console.log("Backfill");
await check("the backfill finds nothing left to post, and only the DAF runs it", async () => {
  await expectStatus(post(acc, "/api/ims/ledger/backfill"), 403);
  const r = await post(daf, "/api/ims/ledger/backfill");
  const posted = r.bank_openings + r.invoices + r.vouchers + r.cash_documents + r.reversals;
  assert(posted === 0 && !r.problems.length, `backfill posted ${JSON.stringify(r)}`);
});

for (const fn of cleanup.reverse()) await fn().catch((e) => console.log("cleanup:", e.message));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
