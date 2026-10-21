#!/usr/bin/env node
/**
 * RALGA IMS — Step 4 API checks: duplicate supplier invoices (same reference refused; same amount and
 * date needs a reason and stays an exception), payment vouchers (only approved invoices, no double
 * payment, withholding tax on the amount before VAT, budget control on direct expenses, preparer and
 * approvers cannot execute, bank details must not change after preparation), and payables reports.
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
    const ok = Array.isArray(status) ? status.includes(e.status) : e.status === status;
    assert(ok, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    if (contains) assert(String(e.message).toLowerCase().includes(contains.toLowerCase()), `message "${e.message}" should mention "${contains}"`);
    return e;
  }
  throw new Error(`expected HTTP ${status}, but the request succeeded`);
}

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const acc = await login("accountant@dnr-hr.rw");
const daf = await login("finance@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const sessions = {};
async function approveAll(approvalId) {
  for (let i = 0; i < 5; i++) {
    const a = await admin.collection("approval_requests").getOne(approvalId);
    if (a.status !== "pending") return a.status;
    const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    sessions[who.email] = sessions[who.email] || (await login(who.email));
    await sessions[who.email].send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Checked." } });
  }
  return "pending";
}
const voucherAction = (pb, id, action, body = {}) => pb.send(`/api/ims/vouchers/${id}/${action}`, { method: "POST", body });

console.log("Duplicate supplier invoices");
const base = await admin.collection("supplier_invoices").getFirstListItem(`status = "paid"`);
const sameItems = base.items.map((l) => ({ line: l.line, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }));
await check("the same supplier reference (ignoring case, spaces and dashes) is refused", async () => {
  const ref = base.supplier_invoice_number.toLowerCase().replace(/-/g, " ");
  await expectStatus(acc.collection("supplier_invoices").create({ purchase_order: base.purchase_order, supplier_invoice_number: ref, invoice_date: base.invoice_date, items: sameItems }), 400, "duplicate invoice");
});
await check("same supplier and amount within the window is refused without a reason", async () => {
  await expectStatus(acc.collection("supplier_invoices").create({ purchase_order: base.purchase_order, supplier_invoice_number: `X-${Date.now()}`, invoice_date: base.invoice_date, items: sameItems }), 400, "possible duplicate");
});
await check("recorded with a reason, it stays an exception until the DAF clears it", async () => {
  const inv = await acc.collection("supplier_invoices").create({
    purchase_order: base.purchase_order, supplier_invoice_number: `X-${Date.now()}`, invoice_date: base.invoice_date, items: sameItems,
    duplicate_override: "Second delivery billed separately; confirmed with the supplier by phone.",
  });
  try {
    assert(inv.status === "exception", `status ${inv.status}`);
    assert((inv.match_result.issues || []).some((i) => i.includes("Possible duplicate")), "no duplicate issue recorded");
    await expectStatus(acc.send(`/api/dnr/invoices/${inv.id}/submit`, { method: "POST" }), 400, "exception");
  } finally {
    await acc.send(`/api/dnr/invoices/${inv.id}/cancel`, { method: "POST", body: { reason: "Test invoice." } });
  }
});

console.log("Payment vouchers");
await check("staff cannot see payment vouchers", async () => {
  await expectStatus(employee.collection("payment_vouchers").getList(1, 1), 403);
});
// A payable invoice: the DAF clears the seeded price exception, then the invoice is approved.
const exc = (await admin.collection("supplier_invoices").getFullList({ filter: 'status = "exception"', sort: "created" }))[0];
await daf.send(`/api/dnr/invoices/${exc.id}/resolve`, { method: "POST", body: { reason: "Price increase accepted: supplier letter on file, within the contract terms." } });
await acc.send(`/api/dnr/invoices/${exc.id}/submit`, { method: "POST" });
await approveAll((await admin.collection("supplier_invoices").getOne(exc.id)).approval);
const payableInv = await admin.collection("supplier_invoices").getOne(exc.id);
let toPay;
let line;
await check("an approved invoice goes on a voucher with withholding tax on the amount before VAT", async () => {
  assert(payableInv.status === "approved", `invoice is ${payableInv.status}`);
  toPay = await acc.collection("payment_vouchers").create({ voucher_type: "invoice", supplier: payableInv.supplier, lines: [{ invoice: payableInv.id }], wht_code: "WHT_PUBLIC_TENDER" });
  line = toPay.lines[0];
  const expectedBase = Math.round((line.amount * payableInv.subtotal) / payableInv.total);
  assert(line.amount === Math.round(payableInv.balance), `amount ${line.amount} ≠ balance ${payableInv.balance}`);
  assert(toPay.wht_base === expectedBase, `base ${toPay.wht_base} ≠ ${expectedBase}`);
  assert(toPay.wht_amount === Math.round((expectedBase * toPay.wht_rate) / 100) && toPay.wht_rate > 0, `wht ${toPay.wht_amount} at ${toPay.wht_rate}%`);
  assert(toPay.net_amount === toPay.gross_amount - toPay.wht_amount, "net ≠ gross − tax");
});
await check("an invoice already on an open voucher cannot be paid twice", async () => {
  await expectStatus(acc.collection("payment_vouchers").create({ voucher_type: "invoice", supplier: payableInv.supplier, lines: [{ invoice: payableInv.id }] }), 400, "other vouchers");
});
await check("a voucher cannot pay more than the invoice balance", async () => {
  await expectStatus(acc.collection("payment_vouchers").update(toPay.id, { lines: [{ invoice: payableInv.id, amount: Math.round(payableInv.balance) + 1 }] }), 400, "more than");
});
await check("the preparer cannot approve the voucher; the DAF can", async () => {
  const sub = await voucherAction(acc, toPay.id, "submit");
  await expectStatus(acc.send(`/api/dnr/approvals/${sub.approval}/act`, { method: "POST", body: { action: "approve" } }), [400, 403]);
  assert((await approveAll(sub.approval)) === "approved", "voucher not approved");
});
await check("the voucher cannot be edited after approval", async () => {
  await expectStatus(acc.collection("payment_vouchers").update(toPay.id, { description: "changed" }), 400, "can no longer be edited");
});
await check("the DAF (approver) cannot execute the payment", async () => {
  await expectStatus(voucherAction(daf, toPay.id, "pay", { method: "bank_transfer", reference: "TRF-1" }), 403, "record_payments");
});
const cashierRole = await admin.collection("roles").getFirstListItem('code = "CASHIER"');
const accUser = await admin.collection("users").getFirstListItem('email = "accountant@dnr-hr.rw"');
await check("whoever prepared the voucher cannot execute it, even holding the Cashier role", async () => {
  await admin.collection("users").update(accUser.id, { extra_roles: [...(accUser.extra_roles || []), cashierRole.id] });
  try {
    const both = await login("accountant@dnr-hr.rw");
    await expectStatus(voucherAction(both, toPay.id, "pay", { method: "bank_transfer", reference: "TRF-1" }), 403, "you prepared");
  } finally {
    await admin.collection("users").update(accUser.id, { extra_roles: accUser.extra_roles || [] });
  }
});
await check("a bank transfer needs its reference", async () => {
  await expectStatus(voucherAction(cashier, toPay.id, "pay", { method: "bank_transfer", reference: "" }), 400, "reference");
});
await check("payment stops if the supplier's bank details changed after preparation", async () => {
  const s = await admin.collection("suppliers").getOne(toPay.supplier);
  await admin.collection("suppliers").update(s.id, { bank_account_number: `${s.bank_account_number}0` });
  try {
    await expectStatus(voucherAction(cashier, toPay.id, "pay", { method: "bank_transfer", reference: "TRF-1" }), 400, "bank details changed");
  } finally {
    await admin.collection("suppliers").update(s.id, { bank_account_number: s.bank_account_number });
  }
});
await check("the Cashier executes: invoice settled, tax withheld and net paid recorded", async () => {
  const before = await admin.collection("supplier_invoices").getOne(line.invoice);
  const r = await voucherAction(cashier, toPay.id, "pay", { method: "bank_transfer", reference: `TRF-${Date.now()}` });
  assert(r.status === "paid" && r.payments.length === 1, JSON.stringify(r));
  const inv = await admin.collection("supplier_invoices").getOne(line.invoice);
  assert(Math.round(inv.paid_amount - before.paid_amount) === line.amount, "invoice not settled by the gross amount");
  const p = await admin.collection("payments").getFirstListItem(`voucher = "${toPay.id}"`);
  assert(p.wht_amount === toPay.wht_amount && p.net_amount === toPay.net_amount, `payment wht ${p.wht_amount} net ${p.net_amount}`);
});
await check("a paid voucher cannot be paid or cancelled again", async () => {
  await expectStatus(voucherAction(cashier, toPay.id, "pay", { method: "cash" }), 400, "only approved vouchers");
  await expectStatus(voucherAction(acc, toPay.id, "cancel", { reason: "test" }), 400, "cannot be cancelled");
});

console.log("Direct expenses and budget control");
const fy = await admin.collection("fiscal_years").getFirstListItem("is_current = true");
const finLine = await admin.collection("budget_lines").getFirstListItem(`code ~ "FIN-5203" && status = "active" && fiscal_year = "${fy.id}"`);
const revenue = await admin.collection("budget_lines").getFirstListItem(`kind = "revenue" && status = "active" && fiscal_year = "${fy.id}"`);
await check("a direct expense cannot be charged to a revenue line", async () => {
  await expectStatus(acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: "Test payee", budget_line: revenue.id, gross_amount: 1000, description: "Test" }), 400, "revenue");
});
await check("a direct expense above the available budget is blocked at submission", async () => {
  const avail = await daf.send(`/api/ims/budget/available?line=${finLine.id}`, {});
  const v = await acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: "Test payee", budget_line: finLine.id, gross_amount: avail.available + 1000000, description: "Over budget test" });
  try {
    await expectStatus(voucherAction(acc, v.id, "submit"), 400, "insufficient budget");
  } finally {
    await acc.collection("payment_vouchers").delete(v.id);
  }
});
await check("an approved direct expense becomes an actual; cancelling reverses it", async () => {
  const v = await acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: "Rwanda Revenue Authority", budget_line: finLine.id, gross_amount: 100000, description: "Test fee", payee_bank: { bank_name: "BNR", bank_account_number: "1" } });
  const sub = await voucherAction(acc, v.id, "submit");
  assert((await approveAll(sub.approval)) === "approved", "not approved");
  let ledger = await daf.send(`/api/ims/budget/lines/${finLine.id}/ledger`, {});
  assert(ledger.entries.some((e) => e.source_id === v.id && e.type === "actual" && e.amount === 100000), "no actual posted");
  await voucherAction(daf, v.id, "cancel", { reason: "Paid by another voucher." });
  ledger = await daf.send(`/api/ims/budget/lines/${finLine.id}/ledger`, {});
  assert(ledger.entries.some((e) => e.source_id === v.id && e.type === "actual_reversal" && e.amount === 100000), "actual not reversed");
});

console.log("Reports");
await check("ageing ties out with the outstanding liabilities", async () => {
  const a = await acc.send("/api/ims/payables/reports/ageing", {});
  const o = await acc.send("/api/ims/payables/reports/outstanding", {});
  assert(Math.round(a.totals.total) === Math.round(o.totals.balance), `ageing ${a.totals.total} vs outstanding ${o.totals.balance}`);
});
await check("payment register: gross = tax withheld + net paid", async () => {
  const r = await acc.send("/api/ims/payables/reports/payment_register", {});
  assert(r.rows.length > 0, "no payments");
  assert(Math.round(r.totals.gross) === Math.round(r.totals.wht + r.totals.net), JSON.stringify(r.totals));
});
await check("withholding tax schedule lists the tax withheld on paid vouchers", async () => {
  const r = await acc.send("/api/ims/payables/reports/wht_schedule", {});
  const paid = await admin.collection("payment_vouchers").getFullList({ filter: 'status = "paid" && wht_amount > 0' });
  assert(Math.round(r.totals.wht) === paid.reduce((a, v) => a + v.wht_amount, 0), "schedule does not match the paid vouchers");
});
await check("staff cannot open payables reports", async () => {
  await expectStatus(employee.send("/api/ims/payables/reports/ageing", {}), 403);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
