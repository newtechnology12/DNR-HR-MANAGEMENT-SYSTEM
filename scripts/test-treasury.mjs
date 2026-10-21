#!/usr/bin/env node
/**
 * RALGA IMS — Step 5 API checks: bank and cash accounts (DAF only, a GL cash account each), receipts and
 * transfers (Cashier → DAF → cash book; dates, kinds of account and enough money), voucher payments from a
 * chosen account (cash from a cash book, restricted donor money only for its own funding, no overdraft),
 * statement import (totals and running balance checked, no overlaps, automatic matching), matching by hand,
 * bank charges recorded from the statement, reconciliation (must balance, every item followed up, prepared
 * by the Accountant and approved by the DAF, then locked), reversal, reports and access.
 *
 * Works on its own test accounts and removes everything it created. Runs against a local PocketBase seeded
 * with `npm run seed:ralga`.
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
const daf = await login("finance@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const acc = await login("accountant@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const act = async (client, approvalId, action = "approve", comment = "Checked.") => client.send(`/api/dnr/approvals/${approvalId}/act`, { method: "POST", body: { action, comment } });
const approvalOf = async (collection, id) => (await su.collection(collection).getOne(id)).approval;

const tag = Date.now().toString(36).slice(-5).toUpperCase();
const created = { gl: [], accounts: [], vouchers: [] };
const gl = Object.fromEntries((await su.collection("gl_accounts").getFullList({ fields: "id,code" })).map((g) => [g.code, g.id]));
const cashierUser = await su.collection("users").getFirstListItem('email = "cashier@dnr-hr.rw"');
const opening = day(-30);
let T1;
let T2;
let receipt;

try {
  console.log("Accounts");
  for (const n of [1, 2]) {
    const g = await su.collection("gl_accounts").create({ code: `T${n}${tag}`, name: `Test cash account ${n} ${tag}`, type: "asset", is_posting: true, cash_flow_class: "cash", statement_section: "current_assets", active: true });
    created.gl.push(g.id);
  }
  const bankBody = { code: `TB-${tag}`, name: "Test bank account", kind: "bank", bank_name: "Test Bank", account_number: "1234-5678-90", gl_account: created.gl[0], opening_balance: 10000000, opening_date: noon(opening), currency: "RWF" };

  await check("only the DAF sets up bank accounts; staff cannot see them", async () => {
    await expectStatus(cashier.collection("bank_accounts").create(bankBody), 403, "manage_bank_accounts");
    await expectStatus(employee.collection("bank_accounts").getList(1, 1), 403);
    const seen = await auditor.collection("bank_accounts").getList(1, 1);
    assert(seen.totalItems > 0, "the Internal Auditor should see the accounts");
  });
  await check("a bank account needs its own posting cash account in the chart of accounts", async () => {
    await expectStatus(daf.collection("bank_accounts").create({ ...bankBody, gl_account: gl["4101"] }), 400, "cash account");
    await expectStatus(daf.collection("bank_accounts").create({ ...bankBody, gl_account: gl["1101"] }), 400, "already the cash account");
  });
  await check("accounts start from their opening balance", async () => {
    T1 = await daf.collection("bank_accounts").create(bankBody);
    created.accounts.push(T1.id);
    T2 = await daf.collection("bank_accounts").create({ code: `TC-${tag}`, name: "Test cash book", kind: "cash", gl_account: created.gl[1], opening_balance: 200000, opening_date: noon(opening), custodian: cashierUser.id, cash_limit: 500000 });
    created.accounts.push(T2.id);
    assert(T1.book_balance === 10000000 && T2.book_balance === 200000, `balances ${T1.book_balance} / ${T2.book_balance}`);
  });

  console.log("Receipts and transfers");
  const receiptBody = { account: "", receipt_date: noon(day(-10)), payer_type: "member", payer_name: `Test District ${tag}`, amount: 2500000, method: "bank_transfer", reference: `RCPT-${tag}`, income_account: gl["4101"], description: "Member contribution (test)" };
  await check("the Cashier records a receipt; the DAF verifies it; it is posted to the cash book", async () => {
    receipt = await cashier.collection("cash_receipts").create({ ...receiptBody, account: T1.id });
    assert(/^RCT-/.test(receipt.number) && receipt.status === "draft", `${receipt.number} ${receipt.status}`);
    const s = await cashier.send(`/api/ims/treasury/receipts/${receipt.id}/submit`, { method: "POST" });
    await expectStatus(act(cashier, s.approval), 403);
    await act(daf, s.approval);
    const r = await su.collection("cash_receipts").getOne(receipt.id);
    assert(r.status === "approved" && r.entry, `status ${r.status}`);
    const a = await su.collection("bank_accounts").getOne(T1.id);
    assert(a.book_balance === 12500000, `book ${a.book_balance}`);
  });
  await check("the Accountant cannot record receipts; posted receipts cannot be edited", async () => {
    await expectStatus(acc.collection("cash_receipts").create({ ...receiptBody, account: T1.id }), 403, "manage_treasury");
    await expectStatus(cashier.collection("cash_receipts").update(receipt.id, { amount: 1 }), 400, "can no longer be edited");
  });
  await check("receipts: no future dates, nothing before the opening balance, cash only into a cash book", async () => {
    await expectStatus(cashier.collection("cash_receipts").create({ ...receiptBody, account: T1.id, receipt_date: noon(day(2)) }), 400, "future");
    const early = await cashier.collection("cash_receipts").create({ ...receiptBody, account: T1.id, receipt_date: noon(day(-40)) });
    await expectStatus(cashier.send(`/api/ims/treasury/receipts/${early.id}/submit`, { method: "POST" }), 400, "opening balance");
    await cashier.collection("cash_receipts").delete(early.id);
    await expectStatus(cashier.collection("cash_receipts").create({ ...receiptBody, account: T1.id, method: "cash" }), 400, "cash book");
  });
  await check("a transfer needs two different accounts and enough money", async () => {
    await expectStatus(cashier.collection("bank_transfers").create({ from_account: T1.id, to_account: T1.id, amount: 1000, transfer_date: noon(day(-8)) }), 400, "two different accounts");
    const big = await cashier.collection("bank_transfers").create({ from_account: T2.id, to_account: T1.id, amount: 900000, transfer_date: noon(day(-8)), method: "cash_deposit" });
    await expectStatus(cashier.send(`/api/ims/treasury/transfers/${big.id}/submit`, { method: "POST" }), 400, "not enough money");
    await cashier.collection("bank_transfers").delete(big.id);
  });
  await check("an approved transfer moves the money out of one account into the other", async () => {
    const t = await cashier.collection("bank_transfers").create({ from_account: T1.id, to_account: T2.id, amount: 300000, transfer_date: noon(day(-8)), method: "cheque", reference: `CHQ${tag}`, description: "Petty cash replenishment (test)" });
    const s = await cashier.send(`/api/ims/treasury/transfers/${t.id}/submit`, { method: "POST" });
    await act(daf, s.approval);
    const [a1, a2] = await Promise.all([su.collection("bank_accounts").getOne(T1.id), su.collection("bank_accounts").getOne(T2.id)]);
    assert(a1.book_balance === 12200000 && a2.book_balance === 500000, `balances ${a1.book_balance} / ${a2.book_balance}`);
  });

  console.log("Paying vouchers from an account");
  const line = await acc.collection("budget_lines").getFirstListItem('code ~ "FIN-5203" && status = "active"');
  const approvedVoucher = async (amount) => {
    const v = await acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: `Test payee ${tag}`, budget_line: line.id, gross_amount: amount, description: "Treasury test payment", payee_bank: { bank_name: "BK", bank_account_number: "100200300" } });
    created.vouchers.push(v.id);
    await acc.send(`/api/ims/vouchers/${v.id}/submit`, { method: "POST" });
    for (let i = 0; i < 3; i++) {
      const a = await su.collection("approval_requests").getOne(await approvalOf("payment_vouchers", v.id));
      if (a.status !== "pending") break;
      const who = await su.collection("users").getOne(a.pending_approvers.split(",")[0]);
      await act(await login(who.email), a.id);
    }
    return v;
  };
  let paid;
  await check("cash is paid from a cash book, transfers from a bank account; restricted donor money only for its own funding", async () => {
    paid = await approvedVoucher(50000);
    await expectStatus(cashier.send(`/api/ims/vouchers/${paid.id}/pay`, { method: "POST", body: { method: "cash", account: T1.id } }), 400, "cash book");
    const restricted = await su.collection("bank_accounts").getFirstListItem('code = "BPR-LED"');
    await expectStatus(cashier.send(`/api/ims/vouchers/${paid.id}/pay`, { method: "POST", body: { method: "bank_transfer", reference: `PAY-${tag}`, account: restricted.id } }), 400, "restricted");
  });
  await check("the payment leaves the chosen account: one cash book entry for the net amount", async () => {
    await cashier.send(`/api/ims/vouchers/${paid.id}/pay`, { method: "POST", body: { method: "bank_transfer", reference: `PAY-${tag}`, account: T1.id, payment_date: noon(day(-5)) } });
    const v = await su.collection("payment_vouchers").getOne(paid.id);
    assert(v.status === "paid" && v.paid_from === T1.id && v.cash_entry, `voucher ${v.status} from ${v.paid_from}`);
    const e = await su.collection("cash_book_entries").getOne(v.cash_entry);
    assert(e.direction === "out" && e.amount === v.net_amount && e.type === "payment", `entry ${e.direction} ${e.amount}`);
    const a = await su.collection("bank_accounts").getOne(T1.id);
    assert(a.book_balance === 12200000 - v.net_amount, `book ${a.book_balance}`);
  });
  await check("a payment that would overdraw the account is refused", async () => {
    const big = await approvedVoucher(800000);
    await expectStatus(cashier.send(`/api/ims/vouchers/${big.id}/pay`, { method: "POST", body: { method: "cash", account: T2.id } }), 400, "not enough money");
    await acc.send(`/api/ims/vouchers/${big.id}/cancel`, { method: "POST", body: { reason: "Treasury test." } });
  });

  console.log("Statements and matching");
  const net = (await su.collection("payment_vouchers").getOne(paid.id)).net_amount;
  const rows = [
    { date: day(-10), description: `CR TRF TEST DISTRICT ${tag}`, reference: `RCPT-${tag}`, amount_in: 2500000, amount_out: 0 },
    { date: day(-8), description: `CHQ CHQ${tag} ENCASHED`, reference: `CHQ${tag}`, amount_in: 0, amount_out: 300000 },
    { date: day(-4), description: `DR TRF TEST PAYEE ${tag}`, reference: `PAY-${tag}`, amount_in: 0, amount_out: net },
    { date: day(-3), description: "ACCOUNT MAINTENANCE FEE", reference: `FEE-${tag}`, amount_in: 0, amount_out: 5000 },
    { date: day(-2), description: "CR TRF UNKNOWN PAYER", reference: `UNK-${tag}`, amount_in: 777000, amount_out: 0 },
  ];
  const closing = 10000000 + 2500000 - 300000 - net - 5000 + 777000;
  const stmt = (extra) => ({ account: T1.id, statement_from: opening, statement_to: day(-1), opening_balance: 10000000, rows, file_name: "test.csv", ...extra });
  let imported;
  await check("a statement whose lines do not add up to its closing balance is refused", async () => {
    await expectStatus(acc.send("/api/ims/treasury/statements/import", { method: "POST", body: stmt({ closing_balance: closing + 1 }) }), 400, "closing balance");
  });
  await check("a running balance column is checked line by line", async () => {
    let b = 10000000;
    const withBal = rows.map((r, i) => ({ ...r, balance: (b += r.amount_in - r.amount_out) + (i === 2 ? 100 : 0) }));
    await expectStatus(acc.send("/api/ims/treasury/statements/import", { method: "POST", body: stmt({ rows: withBal }) }), 400, "does not follow");
  });
  await check("only the Accountant imports statements", async () => {
    await expectStatus(cashier.send("/api/ims/treasury/statements/import", { method: "POST", body: stmt({ closing_balance: closing }) }), 403);
  });
  await check("an imported statement is matched to the cash book automatically (amount, date, reference)", async () => {
    imported = await acc.send("/api/ims/treasury/statements/import", { method: "POST", body: stmt({ closing_balance: closing }) });
    assert(imported.lines === 5 && imported.matched === 3, `matched ${imported.matched} of ${imported.lines}`);
    const s = await su.collection("bank_statements").getOne(imported.id);
    assert(s.closing_balance === closing && s.opening_balance === 10000000, `closing ${s.closing_balance}`);
  });
  await check("overlapping statements are refused", async () => {
    await expectStatus(acc.send("/api/ims/treasury/statements/import", { method: "POST", body: stmt({ closing_balance: closing }) }), 400, "already covers");
  });
  const lineOf = async (ref) => su.collection("bank_statement_lines").getFirstListItem(`statement = "${imported.id}" && reference = "${ref}"`);
  await check("a match can be undone; matching by hand needs equal amounts on one account", async () => {
    const r = await lineOf(`RCPT-${tag}`);
    await acc.send("/api/ims/treasury/unmatch", { method: "POST", body: { group: r.match_group } });
    const entry = await su.collection("cash_book_entries").getFirstListItem(`account = "${T1.id}" && type = "receipt"`);
    assert(!entry.match_group, "entry still matched");
    const unknown = await lineOf(`UNK-${tag}`);
    await expectStatus(acc.send("/api/ims/treasury/match", { method: "POST", body: { account: T1.id, lines: [unknown.id], entries: [entry.id] } }), 400, "don't agree");
    const cashIn = await su.collection("cash_book_entries").getFirstListItem(`account = "${T2.id}" && type = "transfer_in"`);
    await expectStatus(acc.send("/api/ims/treasury/match", { method: "POST", body: { account: T1.id, lines: [r.id], entries: [cashIn.id] } }), 400, "same account");
    const fee = await lineOf(`FEE-${tag}`);
    await expectStatus(acc.send("/api/ims/treasury/match", { method: "POST", body: { account: T1.id, lines: [fee.id, unknown.id], entries: [] } }), 400, "cancel each other");
    await expectStatus(cashier.send("/api/ims/treasury/match", { method: "POST", body: { account: T1.id, lines: [r.id], entries: [entry.id] } }), 403);
    const m = await acc.send("/api/ims/treasury/match", { method: "POST", body: { account: T1.id, lines: [r.id], entries: [entry.id] } });
    assert(m.group, "no match group");
  });
  await check("bank charges are recorded from the statement line and matched to it", async () => {
    const fee = await lineOf(`FEE-${tag}`);
    await acc.send(`/api/ims/treasury/statement-lines/${fee.id}/record`, { method: "POST", body: { type: "bank_charge" } });
    const l = await su.collection("bank_statement_lines").getOne(fee.id);
    assert(l.match_group && l.match_method === "recorded", "line not matched");
    const e = await su.collection("cash_book_entries").getFirstListItem(`match_group = "${l.match_group}"`);
    assert(e.type === "bank_charge" && e.amount === 5000 && e.gl_account === gl["5212"], `entry ${e.type} ${e.amount}`);
  });

  console.log("Reconciliation");
  let rec;
  await check("the DAF cannot prepare a reconciliation (preparer ≠ approver)", async () => {
    await expectStatus(daf.collection("bank_reconciliations").create({ account: T1.id, as_of: noon(day(-1)), statement_balance: closing }), 403);
  });
  await check("a reconciliation that does not balance cannot be submitted", async () => {
    rec = await acc.collection("bank_reconciliations").create({ account: T1.id, as_of: noon(day(-1)), statement_balance: closing + 1000 });
    assert(rec.difference === 1000, `difference ${rec.difference}`);
    await expectStatus(acc.send(`/api/ims/treasury/reconciliations/${rec.id}/submit`, { method: "POST" }), 400, "does not balance");
  });
  await check("every reconciling item needs a follow-up before submission", async () => {
    rec = await acc.collection("bank_reconciliations").update(rec.id, { statement_balance: closing });
    assert(rec.difference === 0 && rec.item_count === 1 && rec.unrecorded_receipts === 777000, `difference ${rec.difference}, ${rec.item_count} items`);
    await expectStatus(acc.send(`/api/ims/treasury/reconciliations/${rec.id}/submit`, { method: "POST" }), 400, "follow-up");
    const unknown = await lineOf(`UNK-${tag}`);
    await expectStatus(acc.send("/api/ims/treasury/follow-up", { method: "POST", body: { items: [{ kind: "line", id: unknown.id }], follow_up: "investigate" } }), 400, "note");
    await acc.send("/api/ims/treasury/follow-up", { method: "POST", body: { items: [{ kind: "line", id: unknown.id }], follow_up: "record", note: "Cashier to identify the payer and record the receipt." } });
  });
  await check("the reconciliation statement ties out (adjusted bank = adjusted cash book)", async () => {
    const p = await acc.send(`/api/ims/treasury/reconciliation-preview?account=${T1.id}&as_of=${day(-1)}&statement_balance=${closing}`, {});
    assert(p.adjusted_bank_balance === p.adjusted_book_balance && p.difference === 0, `adjusted ${p.adjusted_bank_balance} vs ${p.adjusted_book_balance}`);
    assert(p.book_balance + p.unrecorded_receipts - p.unrecorded_payments === p.statement_balance + p.outstanding_receipts - p.outstanding_payments, "formula");
  });
  await check("the Accountant submits; only the DAF approves", async () => {
    const s = await acc.send(`/api/ims/treasury/reconciliations/${rec.id}/submit`, { method: "POST" });
    await expectStatus(act(acc, s.approval), 403);
    await expectStatus(act(cashier, s.approval), 403);
    await act(daf, s.approval);
    const r = await su.collection("bank_reconciliations").getOne(rec.id);
    assert(r.status === "approved", r.status);
    const a = await su.collection("bank_accounts").getOne(T1.id);
    assert(a.reconciled_to.slice(0, 10) === day(-1), `reconciled to ${a.reconciled_to}`);
  });
  await check("after approval its matches are locked and nothing can be dated in the reconciled period", async () => {
    const r = await lineOf(`RCPT-${tag}`);
    assert(r.reconciliation === rec.id, "line not locked");
    await expectStatus(acc.send("/api/ims/treasury/unmatch", { method: "POST", body: { group: r.match_group } }), 400, "cannot be undone");
    const late = await cashier.collection("cash_receipts").create({ account: T1.id, receipt_date: noon(day(-2)), payer_type: "other", payer_name: "Late payer", amount: 1000, method: "bank_transfer", income_account: gl["4204"] });
    await expectStatus(cashier.send(`/api/ims/treasury/receipts/${late.id}/submit`, { method: "POST" }), 400, "reconciled up to");
    await cashier.collection("cash_receipts").delete(late.id);
    await expectStatus(acc.send("/api/ims/treasury/statements/import", { method: "POST", body: { ...stmt({ statement_from: day(-2), statement_to: day(-1), rows: [rows[4]], closing_balance: undefined }) } }), 400);
  });

  console.log("Reversal, reports and access");
  await check("a posted receipt not yet on the statement is reversed by the DAF (not the Cashier)", async () => {
    const r2 = await cashier.collection("cash_receipts").create({ ...receiptBody, account: T1.id, receipt_date: noon(day(0)), amount: 120000, reference: `R2-${tag}` });
    const s = await cashier.send(`/api/ims/treasury/receipts/${r2.id}/submit`, { method: "POST" });
    await act(daf, s.approval);
    const before = (await su.collection("bank_accounts").getOne(T1.id)).book_balance;
    await expectStatus(cashier.send(`/api/ims/treasury/receipts/${r2.id}/reverse`, { method: "POST", body: { reason: "Payer's bank recalled the transfer." } }), 403);
    await expectStatus(daf.send(`/api/ims/treasury/receipts/${r2.id}/reverse`, { method: "POST", body: { reason: "short" } }), 400, "at least 10");
    await daf.send(`/api/ims/treasury/receipts/${r2.id}/reverse`, { method: "POST", body: { reason: "Payer's bank recalled the transfer." } });
    const after = await su.collection("bank_accounts").getOne(T1.id);
    const r = await su.collection("cash_receipts").getOne(r2.id);
    assert(r.status === "reversed" && after.book_balance === before - 120000, `status ${r.status}, ${before} → ${after.book_balance}`);
  });
  await check("cash book report: opening + movements = closing balance of the account", async () => {
    const rep = await acc.send(`/api/ims/treasury/reports/cash_book?account=${T1.id}&from=${opening}&to=${day(0)}`, {});
    const a = await su.collection("bank_accounts").getOne(T1.id);
    const last = rep.rows[rep.rows.length - 1];
    assert(last.balance === a.book_balance, `report ${last.balance} ≠ account ${a.book_balance}`);
    assert(rep.rows[0].balance + rep.totals.money_in - rep.totals.money_out === a.book_balance, "totals do not tie");
  });
  await check("cash position and transaction summary tie to the accounts", async () => {
    const pos = await daf.send(`/api/ims/treasury/reports/cash_position?account=${T1.id}`, {});
    const a = await su.collection("bank_accounts").getOne(T1.id);
    assert(pos.rows.length === 1 && pos.rows[0].book === a.book_balance, `position ${pos.rows[0]?.book}`);
    const sum = await daf.send(`/api/ims/treasury/reports/transaction_summary?account=${T1.id}&from=${opening}&to=${day(0)}`, {});
    const r = sum.rows[0];
    assert(r.opening + r.receipts + r.transfers_in - r.payments - r.transfers_out + r.other === r.closing && r.closing === a.book_balance, `summary ${JSON.stringify(r)}`);
  });
  await check("staff cannot see the cash book, statements or treasury reports", async () => {
    await expectStatus(employee.collection("cash_book_entries").getList(1, 1), 403);
    await expectStatus(employee.collection("bank_statement_lines").getList(1, 1), 403);
    await expectStatus(employee.send("/api/ims/treasury/reports/cash_position", {}), 403);
    await expectStatus(employee.send("/api/ims/treasury/position", {}), 403);
  });
  await check("the cash position overview lists the accounts with their balances", async () => {
    const p = await auditor.send("/api/ims/treasury/position", {});
    const t = p.accounts.find((x) => x.id === T1.id);
    assert(t && typeof p.totals.total === "number" && p.months.length > 0, "overview incomplete");
  });
} finally {
  // Remove everything this run created (superuser), including the budget actuals of the test vouchers.
  const del = async (col, filter) => {
    for (const r of await su.collection(col).getFullList({ filter, fields: "id" })) await su.collection(col).delete(r.id).catch(() => null);
  };
  for (const id of created.vouchers) {
    await del("budget_ledger", `source_id = "${id}"`);
    await del("payments", `voucher = "${id}"`);
    await del("approval_requests", `document_id = "${id}"`);
    await su.collection("payment_vouchers").delete(id).catch(() => null);
  }
  for (const id of created.accounts) {
    for (const col of ["cash_receipts", "bank_reconciliations"]) {
      for (const r of await su.collection(col).getFullList({ filter: `account = "${id}"`, fields: "id" })) {
        await del("approval_requests", `document_id = "${r.id}"`);
        await su.collection(col).delete(r.id).catch(() => null);
      }
    }
    for (const r of await su.collection("bank_transfers").getFullList({ filter: `from_account = "${id}" || to_account = "${id}"`, fields: "id" })) {
      await del("approval_requests", `document_id = "${r.id}"`);
      await su.collection("bank_transfers").delete(r.id).catch(() => null);
    }
    await del("bank_statements", `account = "${id}"`);
    await del("cash_book_entries", `account = "${id}"`);
    await su.collection("bank_accounts").delete(id).catch(() => null);
  }
  // journals on the test accounts (opening balances, receipts, transfers, payments, statement charges) go before the
  // accounts, which keep their postings otherwise
  for (const id of created.gl) {
    const posted = await su.collection("gl_journal_lines").getFullList({ filter: `account = "${id}"`, fields: "journal" });
    for (const jid of new Set(posted.map((l) => l.journal))) {
      for (const l of await su.collection("gl_journal_lines").getFullList({ filter: `journal = "${jid}"`, fields: "id" })) await su.collection("gl_journal_lines").delete(l.id);
      await su.collection("gl_journals").delete(jid).catch((e) => console.log("cleanup:", e.message));
    }
  }
  for (const id of created.gl) await su.collection("gl_accounts").delete(id).catch((e) => console.log("cleanup:", e.message));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
