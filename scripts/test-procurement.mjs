#!/usr/bin/env node
/**
 * API-level checks for permissions, separation of duties and the approval engine.
 * Runs against a local PocketBase seeded with `npm run seed:demo`.
 *
 *   npm run test:api
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PASSWORD = "password123";
let adminClient;
const admin = () => adminClient;
let passed = 0;
let failed = 0;

async function login(email) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, PASSWORD, { expand: "role" });
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

adminClient = new PocketBase(PB_URL);
await adminClient.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const employee = await login("employee@dnr-hr.rw");
const hr = await login("hr@dnr-hr.rw");
const procurement = await login("procurement@dnr-hr.rw");
const me = employee.authStore.model;

console.log("\nAccess control");
await check("employee cannot promote themselves to another role", async () => {
  const roles = await employee.collection("roles").getFullList();
  const admin = roles.find((r) => r.code === "SYS_ADMIN");
  await expectStatus(employee.collection("users").update(me.id, { role: admin.id }), 403, "permission");
});
await check("employee cannot change their own salary", async () => {
  await expectStatus(employee.collection("users").update(me.id, { salary: "99999999" }), 403);
});
await check("employee can still update their own phone number", async () => {
  await employee.collection("users").update(me.id, { phone: me.phone });
});
await check("employee cannot edit another employee", async () => {
  const other = await employee.collection("users").getFirstListItem(`id != "${me.id}"`);
  await expectStatus(employee.collection("users").update(other.id, { phone: "+250780000000" }), 403);
});
await check("HR manager can edit another employee", async () => {
  const other = await hr.collection("users").getFirstListItem(`email = "employee@dnr-hr.rw"`);
  await hr.collection("users").update(other.id, { phone: other.phone });
});
await check("employee cannot modify role permissions", async () => {
  const role = await employee.collection("roles").getFirstListItem(`code = "STAFF"`);
  await expectStatus(employee.collection("roles").update(role.id, { description: "hacked" }), 403);
});
await check("employee cannot make themselves a department head (approval bypass)", async () => {
  await expectStatus(employee.collection("departments").update(me.department, { head: me.id }), 403);
});
await check("employee cannot create approval workflows", async () => {
  await expectStatus(employee.collection("approval_workflows").create({ name: "x", document_type: "purchase_requisition", steps: [] }), 403);
});
await check("audit log cannot be read directly through the collection API", async () => {
  await expectStatus(procurement.collection("audit_logs").getList(1, 1), 403);
});
await check("global audit log requires view_audit_logs", async () => {
  await expectStatus(employee.send("/api/dnr/audit", {}), 403, "view_audit_logs");
});

console.log("\nRequisitions");
let draft;
await check("server ignores client-supplied status, number and totals", async () => {
  draft = await employee.collection("purchase_requisitions").create({
    title: "API test requisition", request_type: "goods", status: "approved", number: "HACK-1", total: 1, subtotal: 1,
    items: [{ description: "Test item", quantity: 2, unit: "Each", unit_cost: 1000, tax_rate: 18 }],
  });
  assert(draft.status === "draft", `status should be draft, got ${draft.status}`);
  assert(/^PR-\d{4}-\d{6}$/.test(draft.number), `unexpected number ${draft.number}`);
  assert(draft.total === 2360, `total should be 2360 (2 × 1000 + 18% VAT), got ${draft.total}`);
  assert(draft.requester === me.id, "requester must be the logged-in user");
});
await check("submission lists exactly what is missing", async () => {
  await expectStatus(employee.send(`/api/dnr/requisitions/${draft.id}/submit`, { method: "POST" }), 400, "purchase category");
});
await check("employee only sees their own requisitions", async () => {
  const list = await employee.collection("purchase_requisitions").getFullList();
  assert(list.length > 0, "should see at least the test draft");
  assert(list.every((r) => r.requester === me.id), "saw someone else's requisition");
});
await check("procurement (organisation scope) sees all requisitions", async () => {
  const mine = await employee.collection("purchase_requisitions").getList(1, 1);
  const all = await procurement.collection("purchase_requisitions").getList(1, 1);
  assert(all.totalItems > mine.totalItems, `expected more than ${mine.totalItems}, got ${all.totalItems}`);
});
await check("a pending requisition cannot be edited", async () => {
  const pending = await procurement.collection("purchase_requisitions").getFirstListItem(`status = "pending_approval"`, { expand: "requester" });
  const owner = await login(pending.expand.requester.email);
  await expectStatus(owner.collection("purchase_requisitions").update(pending.id, { title: "changed" }), 400, "can no longer be edited");
});

console.log("\nApproval engine");
await check("requester cannot approve their own requisition", async () => {
  const pending = await procurement.collection("approval_requests").getFirstListItem(`status = "pending"`, { expand: "requester" });
  const owner = await login(pending.expand.requester.email);
  await expectStatus(owner.send(`/api/dnr/approvals/${pending.id}/act`, { method: "POST", body: { action: "approve" } }), 403);
});
await check("someone who is not the current approver cannot approve", async () => {
  const pending = await procurement.collection("approval_requests").getFirstListItem(`status = "pending" && pending_approvers !~ "${me.id}"`);
  await expectStatus(employee.send(`/api/dnr/approvals/${pending.id}/act`, { method: "POST", body: { action: "approve" } }), 403, "not waiting for your decision");
});
await check("rejecting requires a reason", async () => {
  const pending = await procurement.collection("approval_requests").getFirstListItem(`status = "pending"`, { expand: "requester" });
  const approverId = pending.pending_approvers.split(",")[0];
  const approverUser = await procurement.collection("users").getOne(approverId);
  const approver = await login(approverUser.email);
  await expectStatus(approver.send(`/api/dnr/approvals/${pending.id}/act`, { method: "POST", body: { action: "reject" } }), 400, "reason");
});
await check("approved requisitions have a complete action trail", async () => {
  const approved = await procurement.collection("approval_requests").getFirstListItem(`status = "approved"`);
  const actions = await procurement.collection("approval_actions").getFullList({ filter: `approval = "${approved.id}"` });
  const approvals = actions.filter((a) => a.action === "approve").length;
  assert(approvals === approved.steps.length, `expected ${approved.steps.length} approvals, found ${approvals}`);
  assert(actions.some((a) => a.action === "submit"), "missing submit action");
});
await check("record history is visible to someone allowed to view the record", async () => {
  const history = await employee.send(`/api/dnr/audit?collection=purchase_requisitions&record=${draft.id}`, {});
  assert(history.items.some((i) => i.action === "created"), "creation not audited");
});
await check("notifications are private to their recipient", async () => {
  const mine = await employee.collection("notifications").getFullList();
  assert(mine.every((n) => n.user === me.id), "saw someone else's notification");
});

console.log("\nSuppliers and sourcing");
await check("employee cannot add suppliers", async () => {
  await expectStatus(employee.collection("suppliers").create({ name: "Shady Supplies Ltd" }), 403, "manage_suppliers");
});
await check("duplicate suppliers are refused (same TIN — database constraint)", async () => {
  const existing = await procurement.collection("suppliers").getFirstListItem(`tin != ""`);
  const e = await expectStatus(procurement.collection("suppliers").create({ name: "Another name", tin: existing.tin }), 400);
  assert(e.response?.data?.tin?.code === "validation_not_unique", "expected a unique-TIN validation error");
});
await check("duplicate suppliers are refused (same name, different case)", async () => {
  const existing = await procurement.collection("suppliers").getFirstListItem(`status = "active"`);
  await expectStatus(procurement.collection("suppliers").create({ name: existing.name.toUpperCase() }), 400, "already exists");
});
await check("bank details of an approved supplier change only through an audited request", async () => {
  const s = await procurement.collection("suppliers").getFirstListItem(`status = "active"`);
  try {
    await procurement.collection("suppliers").update(s.id, { bank_account_number: `${s.bank_account_number}9` });
    throw new Error("direct bank detail change was accepted");
  } catch (e) {
    assert(e.status === 400, `expected 400, got ${e.status}: ${e.message}`);
  }
  // Requests and approvals are covered in test-procurement-links.mjs; the seeded request is audited here.
  const pending = await procurement.collection("supplier_bank_changes").getFirstListItem(`status = "pending_approval"`);
  const log = await procurement.send(`/api/dnr/audit?collection=suppliers&record=${pending.supplier}`, {});
  assert(log.items.some((i) => i.action === "bank_change_requested"), "no bank_change_requested audit entry");
});
await check("quotation totals are computed by the server", async () => {
  const q = await procurement.collection("quotations").getFirstListItem(`id != ""`);
  const lines = q.items.filter((i) => i.quoted).reduce((a, i) => a + i.total, 0);
  const expected = Math.round((lines + q.delivery_cost + q.other_charges) * 100) / 100;
  assert(Math.abs(q.grand_total - expected) < 0.05, `grand_total ${q.grand_total} ≠ ${expected}`);
});
await check("a quotation cannot be recorded for a supplier that was not invited", async () => {
  const rfq = await procurement.collection("rfqs").getFirstListItem(`status = "sent"`);
  const outsider = await procurement.collection("suppliers").getFirstListItem(rfq.suppliers.map((id) => `id != "${id}"`).join(" && ") + ` && status = "active"`);
  await expectStatus(procurement.collection("quotations").create({ rfq: rfq.id, supplier: outsider.id, items: [{ line: 1, unit_price: 1000 }] }), 400, "not invited");
});
await check("awarding requires a documented reason", async () => {
  const rfq = await procurement.collection("rfqs").getFirstListItem(`status = "closed" || status = "sent"`);
  const q = await procurement.collection("quotations").getFirstListItem(`rfq = "${rfq.id}"`);
  await expectStatus(procurement.send(`/api/dnr/rfqs/${rfq.id}/award`, { method: "POST", body: { quotation: q.id, reason: "cheap" } }), 400, "at least 15 characters");
});
await check("the requester cannot pick the winning supplier", async () => {
  const rfq = await procurement.collection("rfqs").getFirstListItem(`status = "closed" || status = "sent"`, { expand: "requester" });
  const owner = await login(rfq.expand.requester.email);
  await expectStatus(owner.send(`/api/dnr/rfqs/${rfq.id}/award`, { method: "POST", body: { quotation: "x", reason: "I prefer this supplier for my own reasons" } }), 403);
});
await check("awarding above the lowest price is flagged", async () => {
  const flagged = await procurement.collection("rfqs").getList(1, 1, { filter: `status = "awarded" && award_not_lowest = true` });
  assert(flagged.totalItems >= 1, "expected at least one flagged award in the seed data");
});
await check("employee cannot see other people's RFQs", async () => {
  const list = await employee.collection("rfqs").getFullList();
  assert(list.every((r) => r.requester === me.id), "saw an RFQ for someone else's requisition");
});

console.log("\nPurchase orders, receiving and inventory");
const stores = await login("stores@dnr-hr.rw");
await check("employee cannot create purchase orders", async () => {
  const rfq = await procurement.collection("rfqs").getFirstListItem(`status = "awarded"`);
  await expectStatus(employee.send(`/api/dnr/purchase-orders/from-rfq/${rfq.id}`, { method: "POST" }), 403, "manage_purchase_orders");
});
await check("the buyer is never an approver of their own PO", async () => {
  const po = await procurement.collection("purchase_orders").getFirstListItem(`status = "pending_approval"`);
  assert(!po.pending_approvers.split(",").includes(po.buyer), "buyer found among pending approvers");
});
await check("direct purchases need a written justification", async () => {
  const req = await procurement.collection("purchase_requisitions").getFirstListItem(`status = "approved"`).catch(() => null);
  const sup = await procurement.collection("suppliers").getFirstListItem(`status = "active"`);
  const target = req?.id || "nonexistent";
  await expectStatus(procurement.send(`/api/dnr/purchase-orders/direct/${target}`, { method: "POST", body: { supplier: sup.id, justification: "urgent" } }), req ? 400 : 404);
});
await check("recording deliveries requires receive_goods (procurement cannot receive)", async () => {
  const po = await procurement.collection("purchase_orders").getFirstListItem(`status = "partially_received"`);
  await expectStatus(procurement.send(`/api/dnr/purchase-orders/${po.id}/receive`, { method: "POST", body: { items: [] } }), 403, "receive_goods");
});
await check("more than the remaining quantity cannot be accepted", async () => {
  const po = await stores.collection("purchase_orders").getFirstListItem(`status = "partially_received"`);
  const line = po.items.find((l) => l.received_qty < l.quantity);
  const wh = await stores.collection("warehouses").getFirstListItem(`active = true`);
  await expectStatus(stores.send(`/api/dnr/purchase-orders/${po.id}/receive`, { method: "POST", body: { warehouse: wh.id, items: [{ line: line.line, received: line.quantity - line.received_qty + 100000 }] } }), 400, "remain on the order");
});
await check("rejected quantities need a reason", async () => {
  const po = await stores.collection("purchase_orders").getFirstListItem(`status = "partially_received"`);
  const line = po.items.find((l) => l.received_qty < l.quantity);
  const wh = await stores.collection("warehouses").getFirstListItem(`active = true`);
  await expectStatus(stores.send(`/api/dnr/purchase-orders/${po.id}/receive`, { method: "POST", body: { warehouse: wh.id, items: [{ line: line.line, received: 1, rejected: 1 }] } }), 400, "reason");
});
await check("approved purchase orders cannot be edited", async () => {
  const po = await procurement.collection("purchase_orders").getFirstListItem(`status != "draft" && status != "returned"`);
  await expectStatus(procurement.collection("purchase_orders").update(po.id, { delivery_location: "Somewhere else" }), 400, "can no longer be edited");
});
await check("received asset lines created serialised asset records linked to the PO", async () => {
  const po = await procurement.collection("purchase_orders").getFirstListItem(`status = "fully_received" || status = "completed"`);
  const assets = await admin().collection("assets").getFullList({ filter: `purchase_order = "${po.id}"` });
  const assetQty = po.items.filter((l) => l.line_type === "asset").reduce((a, l) => a + l.quantity, 0);
  assert(assets.length === assetQty, `expected ${assetQty} assets, found ${assets.length}`);
  assert(assets.every((a) => a.serial_number && a.goods_receipt && a.supplier), "asset missing serial / GRN / supplier link");
});
await check("stock cannot be issued below zero", async () => {
  const level = await stores.collection("stock_levels").getFirstListItem(`quantity > 0`);
  await expectStatus(stores.send(`/api/dnr/inventory/adjust`, { method: "POST", body: { item: level.item, warehouse: level.warehouse, type: "issue", quantity: level.quantity + 1, reason: "test" } }), 400, "not enough stock");
});
await check("stock ledger cannot be written directly", async () => {
  const level = await stores.collection("stock_levels").getFirstListItem(`quantity > 0`);
  await expectStatus(stores.collection("stock_movements").create({ item: level.item, warehouse: level.warehouse, quantity: 1000 }), 403);
});

console.log("\nFinance: invoices, three-way match, payments, budgets");
const accountant = await login("accountant@dnr-hr.rw");
const financeMgr = await login("finance@dnr-hr.rw");
const cashier = await login("cashier@dnr-hr.rw"); // only the Cashier executes payments (IMS matrix)
await check("employee cannot record supplier invoices", async () => {
  const po = await admin().collection("purchase_orders").getFirstListItem(`status = "partially_received"`);
  await expectStatus(employee.collection("supplier_invoices").create({ purchase_order: po.id, supplier_invoice_number: "X-1", items: [{ line: 1, quantity: 1, unit_price: 1 }] }), 403, "manage_invoices");
});
await check("three-way match flags an invoice priced above the PO", async () => {
  const inv = await accountant.collection("supplier_invoices").getFirstListItem(`match_status = "exception"`);
  assert(inv.match_result.issues.some((i) => /differs from PO price/.test(i)), "expected a price mismatch issue");
});
await check("an invoice with a match exception cannot be submitted for approval", async () => {
  const inv = await accountant.collection("supplier_invoices").getFirstListItem(`status = "exception"`);
  await expectStatus(accountant.send(`/api/dnr/invoices/${inv.id}/submit`, { method: "POST" }), 400, "unresolved");
});
await check("invoicing more than was received is flagged", async () => {
  const po = await admin().collection("purchase_orders").getFirstListItem(`status = "partially_received"`);
  const line = po.items.find((l) => l.received_qty > 0);
  const inv = await accountant.collection("supplier_invoices").create({ purchase_order: po.id, supplier_invoice_number: `TEST-${Date.now()}`, items: [{ line: line.line, quantity: line.quantity, unit_price: line.net / line.quantity, tax_rate: line.tax_rate }] });
  assert(inv.status === "exception" && inv.match_result.issues.some((i) => /exceeds received quantity/.test(i)), "expected a quantity exception");
  await accountant.send(`/api/dnr/invoices/${inv.id}/cancel`, { method: "POST", body: { reason: "API test cleanup" } });
});
await check("resolving an exception needs the resolve permission", async () => {
  const inv = await accountant.collection("supplier_invoices").getFirstListItem(`status = "exception"`);
  await expectStatus(accountant.send(`/api/dnr/invoices/${inv.id}/resolve`, { method: "POST", body: { reason: "Supplier agreed to issue a credit note for the difference" } }), 403, "resolve_invoice_exceptions");
});
await check("resolving an exception needs a written reason", async () => {
  const inv = await financeMgr.collection("supplier_invoices").getFirstListItem(`status = "exception"`);
  await expectStatus(financeMgr.send(`/api/dnr/invoices/${inv.id}/resolve`, { method: "POST", body: { reason: "ok" } }), 400, "at least 15 characters");
});
await check("unapproved invoices cannot be paid", async () => {
  const inv = await accountant.collection("supplier_invoices").getFirstListItem(`status = "exception"`);
  await expectStatus(cashier.send(`/api/dnr/invoices/${inv.id}/pay`, { method: "POST", body: { amount: 1 } }), 400, "must be approved");
});
await check("the finance manager (approver) has no payment permission", async () => {
  const inv = await financeMgr.collection("supplier_invoices").getFirstListItem(`status = "paid" || status = "approved"`);
  await expectStatus(financeMgr.send(`/api/dnr/invoices/${inv.id}/pay`, { method: "POST", body: { amount: 1 } }), 403, "record_payments");
});
await check("a fully paid, fully received order is completed", async () => {
  const paid = await admin().collection("supplier_invoices").getFirstListItem(`status = "paid"`, { expand: "purchase_order" });
  assert(paid.expand.purchase_order.status === "completed", `PO status is ${paid.expand.purchase_order.status}`);
});
await check("budget figures reconcile (remaining = budget − committed − invoiced)", async () => {
  const r = await financeMgr.send(`/api/dnr/budgets/usage?year=${new Date().getFullYear()}`, {});
  assert(r.items.length > 0, "no budgets");
  for (const b of r.items) assert(Math.abs(b.remaining - (b.amount - b.committed - b.invoiced)) < 1, `${b.name} does not reconcile`);
  assert(r.items.some((b) => b.committed > 0 || b.invoiced > 0), "no spend recorded against any budget");
});
await check("budgets are hidden from employees", async () => {
  await expectStatus(employee.send(`/api/dnr/budgets/usage`, {}), 403, "view_budgets");
});

await check("cleanup: delete the test draft", async () => {
  await employee.collection("purchase_requisitions").delete(draft.id);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
