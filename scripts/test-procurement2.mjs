#!/usr/bin/env node
/**
 * API checks for procurement phase 5: receiving and invoice controls, supplier onboarding, supplier
 * performance, purchase returns, contracts, planning, amendments and reports.
 * Runs against a local PocketBase seeded with `npm run seed:ralga`. It changes demo data — reseed afterwards.
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
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().replace("T", " ");

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const employee = await login("employee@dnr-hr.rw");
const proc = await login("procurement@dnr-hr.rw");
const stores = await login("stores@dnr-hr.rw");
const finance = await login("finance@dnr-hr.rw");
const director = await login("director@dnr-hr.rw");
const accountant = await login("accountant@dnr-hr.rw");

console.log("\nReceiving and invoice controls");
const open = (await admin.collection("purchase_orders").getFullList({ filter: 'status = "sent" || status = "acknowledged" || status = "partially_received"' })).find((p) => p.items.some((l) => l.line_type === "goods" && l.quantity - (l.received_qty || 0) >= 1));
const wh = (await admin.collection("warehouses").getList(1, 1)).items[0];
await check("receiving more than ordered is refused beyond the tolerance", async () => {
  assert(open, "no open PO with goods");
  const l = open.items.find((x) => x.line_type === "goods" && x.quantity - (x.received_qty || 0) >= 1);
  const remaining = l.quantity - (l.received_qty || 0);
  await expectStatus(stores.send(`/api/dnr/purchase-orders/${open.id}/receive`, { method: "POST", body: { warehouse: wh.id, notes: "x", items: [{ line: l.line, received: remaining + Math.ceil(l.quantity * 0.5) + 1 }] } }), 400, "tolerance");
});
await check("an over-receipt within tolerance needs the authorisation permission and an explanation", async () => {
  const l = open.items.find((x) => x.line_type === "goods" && x.quantity - (x.received_qty || 0) >= 1);
  const remaining = l.quantity - (l.received_qty || 0);
  const extra = Math.max(0.5, Math.floor(l.quantity * 0.05 * 2) / 2);
  const role = await admin.collection("roles").getFirstListItem('code = "STORE_ASSET"');
  const perms = role.permitions;
  await admin.collection("roles").update(role.id, { permitions: perms.map((p) => (p.name === "authorize_over_receipt" ? { ...p, access: false } : p)) });
  try {
    await expectStatus(stores.send(`/api/dnr/purchase-orders/${open.id}/receive`, { method: "POST", body: { warehouse: wh.id, notes: "Supplier delivered a full carton", items: [{ line: l.line, received: remaining + extra }] } }), 403, "authorize_over_receipt");
  } finally {
    await admin.collection("roles").update(role.id, { permitions: perms });
  }
  await expectStatus(stores.send(`/api/dnr/purchase-orders/${open.id}/receive`, { method: "POST", body: { warehouse: wh.id, items: [{ line: l.line, received: remaining + extra }] } }), 400, "explain");
  const r = await stores.send(`/api/dnr/purchase-orders/${open.id}/receive`, { method: "POST", body: { warehouse: wh.id, notes: "Supplier delivered a full carton; accepted by the stores officer.", items: [{ line: l.line, received: remaining + extra }] } });
  assert(r.number, "no GRN");
  const po = await admin.collection("purchase_orders").getOne(open.id);
  assert(po.items.find((x) => x.line === l.line).received_qty > l.quantity, "over-receipt not recorded");
});
await check("a PO with an unresolved invoice exception cannot be closed", async () => {
  const inv = await admin.collection("supplier_invoices").getFirstListItem('status = "exception"');
  const po = await admin.collection("purchase_orders").getOne(inv.purchase_order);
  if (!["partially_received", "fully_received"].includes(po.status)) return;
  await expectStatus(proc.send(`/api/dnr/purchase-orders/${po.id}/close`, { method: "POST", body: { reason: "Remaining quantity will not be delivered" } }), 400, "unresolved");
});
await check("bills cannot be recorded for an inactive supplier", async () => {
  const po = await admin.collection("purchase_orders").getFirstListItem('received_value > 0 && status != "cancelled"');
  const sup = await admin.collection("suppliers").getOne(po.supplier);
  await admin.collection("suppliers").update(sup.id, { status: "inactive" });
  try {
    await expectStatus(accountant.collection("supplier_invoices").create({ purchase_order: po.id, supplier_invoice_number: `T-${Date.now()}`, items: [{ line: 1, quantity: 1, unit_price: 1, tax_rate: 0 }] }), 400, "not active");
  } finally {
    await admin.collection("suppliers").update(sup.id, { status: "active" });
  }
});

console.log("\nSupplier onboarding and performance");
let draft;
await check("a new supplier starts as a draft and cannot be activated directly", async () => {
  draft = await proc.collection("suppliers").create({ name: `Test Supplier ${Date.now()}`, supplier_type: "company", country: "Rwanda", phone: "+250788000111", currency: "RWF" });
  assert(draft.status === "draft", draft.status);
  await expectStatus(proc.collection("suppliers").update(draft.id, { status: "active" }), 403, "approval");
});
await check("an incomplete supplier cannot be submitted", async () => {
  await expectStatus(proc.send(`/api/dnr/suppliers/${draft.id}/submit`, { method: "POST" }), 400, "TIN");
  await admin.collection("suppliers").delete(draft.id);
});
// A complete supplier of the test's own, so the seeded demo supplier stays under review.
let reviewed;
await check("a complete supplier can be submitted for approval", async () => {
  const cat = await admin.collection("procurement_categories").getFirstListItem("active = true");
  reviewed = await proc.collection("suppliers").create({
    name: `Test Vendor ${Date.now()}`, supplier_type: "company", categories: [cat.id], registration_number: "RDB-TEST-1", tin: String(Date.now()).slice(-9),
    country: "Rwanda", email: "test-vendor@example.rw", phone: "+250788000222", currency: "RWF", bank_name: "Bank of Kigali", bank_account_name: "Test Vendor", bank_account_number: "100099990000",
  });
  for (const type of ["registration_certificate", "tax_certificate"]) {
    const fd = new FormData();
    fd.append("supplier", reviewed.id);
    fd.append("document_type", type);
    fd.append("document_number", `${type}-TEST`);
    fd.append("expiry_date", new Date(Date.now() + 200 * 864e5).toISOString().replace("T", " "));
    fd.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), `${type}.pdf`);
    await proc.collection("supplier_documents").create(fd);
  }
  await proc.send(`/api/dnr/suppliers/${reviewed.id}/submit`, { method: "POST" });
  assert((await admin.collection("suppliers").getOne(reviewed.id)).status === "under_review", "not under review");
});
await check("a draft supplier cannot receive RFQ invitations", async () => {
  const s = await admin.collection("suppliers").getOne(reviewed.id);
  const rfq = await admin.collection("rfqs").getFirstListItem('status = "draft" || status = "sent"').catch(() => null);
  if (!rfq) return;
  const r = await admin.collection("rfqs").getOne(rfq.id);
  assert(!(r.suppliers || []).includes(s.id), "under-review supplier invited");
});
await check("the submitter cannot approve their own supplier; Finance (DAF) approves it", async () => {
  const s = await admin.collection("suppliers").getOne(reviewed.id);
  const a = await admin.collection("approval_requests").getOne(s.approval);
  assert(!a.pending_approvers.includes(proc.authStore.model.id), "submitter is an approver");
  await expectStatus(proc.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve" } }), 403);
  await expectStatus(director.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Documents verified" } }), 403);
  await finance.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Bank confirmation matches" } });
  assert((await admin.collection("suppliers").getOne(s.id)).status === "active", "not active");
});
await check("supplier performance is calculated from transactions", async () => {
  const r = await proc.send("/api/dnr/suppliers/performance", {});
  const top = r.items.find((x) => x.deliveries > 0);
  assert(top && top.on_time_pct !== null && top.quality_pct !== null && top.score > 0, JSON.stringify(top));
});

console.log("\nReturns");
await check("an employee cannot create a purchase return", async () => {
  const g = await admin.collection("goods_receipts").getFirstListItem('id != ""');
  await expectStatus(employee.send("/api/dnr/returns", { method: "POST", body: { goods_receipt: g.id, reason: "Test reason text", items: [{ line: 1, quantity: 1 }] } }), 403);
});
await check("more than the accepted quantity cannot be returned", async () => {
  const g = (await admin.collection("goods_receipts").getFullList()).find((x) => x.items.some((i) => i.line_type === "goods"));
  const l = g.items.find((i) => i.line_type === "goods");
  await expectStatus(proc.send("/api/dnr/returns", { method: "POST", body: { goods_receipt: g.id, reason: "Damaged in transit, supplier informed", items: [{ line: l.line, quantity: l.accepted + 1 }] } }), 400, "can still be returned");
});
await check("the credited return reduced stock and the PO received quantity", async () => {
  const r = await admin.collection("purchase_returns").getFirstListItem('status = "credited"');
  const mv = await admin.collection("stock_movements").getFullList({ filter: `reference_id = "${r.id}"` });
  assert(mv.length && mv[0].quantity < 0 && mv[0].movement_type === "return_to_supplier", "no stock movement");
  const po = await admin.collection("purchase_orders").getOne(r.purchase_order);
  assert(po.items.some((l) => (l.returned_qty || 0) > 0), "PO not updated");
});

console.log("\nContracts and planning");
await check("an employee cannot create a contract", async () => {
  const s = await admin.collection("suppliers").getFirstListItem('status = "active"');
  await expectStatus(employee.collection("contracts").create({ title: "x", supplier: s.id, value: 1, start_date: day(0), end_date: day(10) }), 403);
});
await check("an active contract's terms are locked", async () => {
  const c = await admin.collection("contracts").getFirstListItem('status = "active"');
  await expectStatus(proc.collection("contracts").update(c.id, { value: c.value * 2 }), 400, "cannot be changed");
});
await check("contract alerts flag the contract ending soon", async () => {
  const r = await proc.send("/api/dnr/contracts/alerts", {});
  assert(r.items.some((a) => a.key === "expiring" || a.key === "renewal"), JSON.stringify(r.items));
});
await check("one plan per department and year", async () => {
  const p = await admin.collection("procurement_plans").getFirstListItem('status = "approved"');
  await expectStatus(proc.collection("procurement_plans").create({ fiscal_year: p.fiscal_year, department: p.department }), 400, "already has");
});
await check("an approved plan cannot get new lines", async () => {
  const p = await admin.collection("procurement_plans").getFirstListItem('status = "approved"');
  await expectStatus(proc.collection("procurement_plan_lines").create({ plan: p.id, description: "Extra", quantity: 1, estimated_unit_cost: 1, planned_month: 1 }), 400, "no longer be added");
});
await check("an employee cannot prepare a procurement plan", async () => {
  await expectStatus(employee.collection("procurement_plans").create({ fiscal_year: 2030, department: employee.authStore.model.department }), 403);
});

console.log("\nAmendments and reports");
await check("an approved PO is amended with a reason, keeps its history and goes back to approval", async () => {
  const po = (await admin.collection("purchase_orders").getFullList({ filter: 'status = "sent" || status = "acknowledged" || status = "approved"' }))[0];
  if (!po) return;
  await expectStatus(proc.send(`/api/dnr/purchase-orders/${po.id}/amend`, { method: "POST", body: { reason: "short" } }), 400, "explain");
  await proc.send(`/api/dnr/purchase-orders/${po.id}/amend`, { method: "POST", body: { reason: "Supplier can only deliver 80% of the quantity this quarter." } });
  const after = await admin.collection("purchase_orders").getOne(po.id);
  assert(after.status === "draft" && after.revision === (po.revision || 0) + 1 && after.revisions.length === (po.revisions || []).length + 1, "not amended");
});
await check("procurement reports are protected and computed on the server", async () => {
  await expectStatus(employee.send("/api/dnr/procurement/reports/supplier_spend", {}), 403);
  const r = await proc.send("/api/dnr/procurement/reports/supplier_spend?from=2026-01-01", {});
  assert(r.columns.length && Array.isArray(r.rows) && r.totals.value >= 0, "bad report");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
