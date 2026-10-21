#!/usr/bin/env node
/**
 * API checks for fixed assets (M7): who sees the register, server-only writes, capitalisation and its journal,
 * custodians and transfers (DAF approval), maintenance, monthly depreciation (order, separation of duties, GL),
 * disposals (Store → DAF → SG, gain or loss in the GL), counts (missing → lost, register = GL), staff equipment
 * requests, reports and the opening register. Runs against a local PocketBase seeded with `npm run seed:ralga`.
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
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
const stores = await login("stores@dnr-hr.rw");
const accountant = await login("accountant@dnr-hr.rw");
const finance = await login("finance@dnr-hr.rw");
const director = await login("director@dnr-hr.rw");
const hod = await login("hod@dnr-hr.rw");
const employee = await login("employee@dnr-hr.rw");
const auditor = await login("auditor@dnr-hr.rw");
const legal = await login("chantal.mukeshimana.34@dnr-hr.rw");
const dept = (code) => admin.collection("departments").getFirstListItem(`code = "${code}"`);
const LEG = await dept("LEG");
const CBD = await dept("CBD");
const PME = await dept("PME");
const ict = await admin.collection("assets_categories").getFirstListItem('code = "ICT"');
const laptopType = await admin.collection("assets_types").getFirstListItem(`category = "${ict.id}" && name = "Laptop"`);
const legalAdvisor = await admin.collection("users").getFirstListItem('email = "olivier.iradukunda.8@dnr-hr.rw"');
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const room = `Test room ${tag}`;
const gl = async (code) => (await admin.collection("gl_accounts").getFirstListItem(`code = "${code}"`)).id;

// everything the checks create goes at the end (journals, approvals, disposals, counts, requests, assets)
cleanup.push(async () => {
  const assets = await admin.collection("assets").getFullList({ filter: `name ~ "${tag}"` });
  const ids = assets.map((a) => a.id);
  const disposals = ids.length ? await admin.collection("asset_disposals").getFullList({ filter: ids.map((i) => `asset = "${i}"`).join(" || ") }) : [];
  const movements = ids.length ? await admin.collection("asset_movements").getFullList({ filter: ids.map((i) => `asset = "${i}"`).join(" || ") }) : [];
  const sources = ids.concat(disposals.map((d) => d.id));
  for (const s of sources) {
    for (const j of await admin.collection("gl_journals").getFullList({ filter: `source_id = "${s}"`, fields: "id" })) {
      for (const l of await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"`, fields: "id" })) await admin.collection("gl_journal_lines").delete(l.id);
      await admin.collection("gl_journals").delete(j.id);
    }
  }
  for (const d of disposals.concat(movements)) {
    for (const a of await admin.collection("approval_requests").getFullList({ filter: `document_id = "${d.id}"`, fields: "id" })) await admin.collection("approval_requests").delete(a.id);
  }
  for (const d of disposals) await admin.collection("asset_disposals").delete(d.id);
  for (const v of await admin.collection("asset_verifications").getFullList({ filter: `title ~ "${tag}"`, fields: "id" })) await admin.collection("asset_verifications").delete(v.id);
  for (const r of await admin.collection("assets_requests").getFullList({ filter: `notes ~ "${tag}"`, fields: "id" })) await admin.collection("assets_requests").delete(r.id);
  for (const a of assets) await admin.collection("assets").delete(a.id);
});

console.log("\nFixed assets");
await check("the register is for the asset roles: staff see what they hold, a department head sees the department", async () => {
  const me = employee.authStore.model;
  const mine = await employee.collection("assets").getFullList();
  assert(mine.length >= 1 && mine.every((a) => a.assigned_to === me.id), `staff saw ${mine.length} assets, not only theirs`);
  const head = await hod.collection("assets").getFullList();
  assert(head.length > mine.length && head.every((a) => a.department === CBD.id || a.assigned_to === hod.authStore.model.id), "the head saw assets of other departments");
  const all = await auditor.collection("assets").getFullList({ fields: "department" });
  assert(new Set(all.map((a) => a.department)).size >= 8, "the Internal Auditor should see the whole register");
  assert(!(await employee.collection("depreciation_runs").getList(1, 1)).items.length, "staff can read depreciation runs");
  assert(!(await employee.collection("asset_disposals").getList(1, 1)).items.length, "staff can read disposals");
});

await check("nobody writes the register directly; depreciation policy is the DAF's", async () => {
  const any = (await stores.collection("assets").getList(1, 1)).items[0];
  await expectStatus(stores.collection("assets").update(any.id, { cost: 1 }), 403);
  await expectStatus(stores.collection("assets").create({ name: "Direct write", code: `X-${tag}` }), 403);
  await expectStatus(stores.collection("assets_categories").update(ict.id, { useful_life_months: 24 }), 403);
  await expectStatus(finance.collection("assets_categories").update(ict.id, { method: "straight_line", useful_life_months: 0 }), 400, "useful life");
  await expectStatus(finance.collection("assets_categories").update(ict.id, { expense_account: await gl("1240") }), 400, "expense");
});

let laptop;
await check("registering an asset posts it (Dr cost / Cr assets received not invoiced); below the threshold it is an expense", async () => {
  await expectStatus(post(stores, "/api/ims/assets", { name: `Mouse ${tag}`, category: ict.id, department: LEG.id, cost: 25000 }), 400, "threshold");
  await expectStatus(post(employee, "/api/ims/assets", { name: `Laptop ${tag}`, category: ict.id, department: LEG.id, cost: 1800000 }), 403);
  const r = await post(stores, "/api/ims/assets", { name: `Test laptop ${tag}`, type: laptopType.id, category: ict.id, department: LEG.id, cost: 1800000, purchased_at: day(-5), assigned_to: legalAdvisor.id, location_name: room });
  laptop = await admin.collection("assets").getOne(r.id);
  const grni = await gl("2114");
  assert(laptop.capitalised && laptop.net_book_value === 1800000 && laptop.status === "in_use" && laptop.capitalisation_journal, "not capitalised");
  const lines = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${laptop.capitalisation_journal}"` });
  assert(lines.some((l) => l.account === ict.asset_account && l.debit === 1800000 && l.department === LEG.id), "the ICT equipment account is not debited for Legal Affairs");
  assert(lines.some((l) => l.account === grni && l.credit === 1800000), "assets received not invoiced (2114) is not credited");
  assert(lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0, "not balanced");
});

await check("a custodian works in the asset's department; moving it elsewhere is a transfer the DAF approves", async () => {
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/assign`, { custodian: employee.authStore.model.id }), 400, "transfer");
  await expectStatus(post(hod, `/api/ims/assets/${laptop.id}/transfer`, { to_department: CBD.id, reason: "We need it in Capacity Building." }), 403);
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/transfer`, { to_department: PME.id, reason: "short" }), 400, "10 characters");
  const t = await post(stores, `/api/ims/assets/${laptop.id}/transfer`, { to_department: PME.id, to_location: room, reason: "Planning needs it for the district survey data entry." });
  const m = await admin.collection("asset_movements").getOne(t.id);
  assert(m.status === "pending_approval" && m.approval, "the transfer is not waiting for approval");
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/transfer`, { to_department: CBD.id, reason: "A second transfer at the same time." }), 400, "already");
  await post(finance, `/api/dnr/approvals/${m.approval}/act`, { action: "approve", comment: "Agreed." });
  const a = await admin.collection("assets").getOne(laptop.id);
  assert(a.department === PME.id && !a.assigned_to && a.status === "in_stock", `after the transfer: ${a.department} ${a.assigned_to} ${a.status}`);
});

await check("status changes and maintenance are logged; maintenance is recorded once done", async () => {
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/status`, { status: "under_maintenance" }), 400, "why");
  await post(stores, `/api/ims/assets/${laptop.id}/status`, { status: "under_maintenance", reason: "Keyboard replacement under warranty." });
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/maintenance`, { date: day(3), kind: "repair", description: "Keyboard replaced" }), 400, "future");
  await post(stores, `/api/ims/assets/${laptop.id}/maintenance`, { date: day(0), kind: "repair", description: "Keyboard replaced under warranty", provider: "Dell partner", cost: 0 });
  const log = await stores.collection("asset_movements").getFullList({ filter: `asset = "${laptop.id}"` });
  assert(log.some((x) => x.kind === "status_change" && x.to_status === "under_maintenance"), "the status change is not logged");
  assert((await stores.collection("asset_maintenance").getFullList({ filter: `asset = "${laptop.id}"` })).length === 1, "no maintenance record");
  assert(!(await employee.collection("asset_maintenance").getFullList({ filter: `asset = "${laptop.id}"` })).length, "staff can read the maintenance log");
});

await check("depreciation: one run a month, in order; the Accountant calculates, the DAF approves; the journal equals the charge", async () => {
  const pending = await admin.collection("depreciation_runs").getFirstListItem('status = "pending_approval"');
  await expectStatus(post(accountant, "/api/ims/depreciation-runs", { year: pending.year, month: pending.month }), 400, "waiting for approval");
  const next = pending.month === 12 ? [pending.year + 1, 1] : [pending.year, pending.month + 1];
  await expectStatus(post(accountant, "/api/ims/depreciation-runs", { year: next[0], month: next[1] }), 400);
  await expectStatus(post(stores, "/api/ims/depreciation-runs", { year: pending.year, month: pending.month }), 403);
  await expectStatus(post(accountant, `/api/dnr/approvals/${pending.approval}/act`, { action: "approve" }), 403);
  await post(finance, `/api/dnr/approvals/${pending.approval}/act`, { action: "approve", comment: "Checked." });
  const run = await admin.collection("depreciation_runs").getOne(pending.id);
  assert(run.status === "approved" && run.journal, "not posted");
  const lines = await admin.collection("depreciation_lines").getFullList({ filter: `run = "${run.id}" && status = "posted"`, expand: "asset" });
  const charged = lines.reduce((t, l) => t + l.charge, 0);
  const jl = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${run.journal}"` });
  assert(jl.reduce((t, l) => t + l.debit, 0) === charged && jl.reduce((t, l) => t + l.credit, 0) === charged && run.total === charged, `journal ≠ charge (${charged})`);
  const key = `${run.year}-${String(run.month).padStart(2, "0")}`;
  assert(lines.every((l) => l.expand.asset.last_depreciated === key && l.expand.asset.accumulated_depreciation === l.accumulated_after), "assets not updated");
  await expectStatus(post(accountant, "/api/ims/depreciation-runs", { year: run.year, month: run.month }), 400, "already posted");
});

await check("disposal: the Store & Asset Officer prepares, the DAF then the SG approve; the GL removes the cost and records the gain", async () => {
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/dispose`, { method: "sale", proceeds: 2000000, reason: "Sold to a member of staff at valuation." }), 400, "buyer");
  await expectStatus(post(employee, `/api/ims/assets/${laptop.id}/dispose`, { method: "scrap", reason: "Old and slow, no longer needed." }), 403);
  const d = await post(stores, `/api/ims/assets/${laptop.id}/dispose`, { method: "sale", proceeds: 2000000, buyer: "Valuation sale to staff", disposal_date: day(0), reason: "Surplus after the department moved to desktops; sold at the valuation price." });
  await post(stores, `/api/ims/asset-disposals/${d.id}/submit`);
  let r = await admin.collection("asset_disposals").getOne(d.id);
  assert(r.status === "pending_approval", r.status);
  await post(finance, `/api/dnr/approvals/${r.approval}/act`, { action: "approve", comment: "Valuation checked." });
  assert((await admin.collection("asset_disposals").getOne(d.id)).status === "pending_approval", "should wait for the SG");
  await post(director, `/api/dnr/approvals/${r.approval}/act`, { action: "approve", comment: "Approved." });
  r = await admin.collection("asset_disposals").getOne(d.id);
  const a = await admin.collection("assets").getOne(laptop.id);
  assert(r.status === "approved" && r.journal && a.status === "disposed" && a.net_book_value === 0, "not disposed");
  const jl = await admin.collection("gl_journal_lines").getFullList({ filter: `journal = "${r.journal}"` });
  const proceeds = await gl("1111");
  assert(jl.some((l) => l.account === ict.asset_account && l.credit === 1800000), "cost not removed");
  assert(jl.some((l) => l.account === proceeds && l.debit === 2000000), "proceeds (1111) not recorded");
  assert(r.gain_loss === 2000000 - 1800000 && jl.some((l) => l.credit === r.gain_loss), `gain ${r.gain_loss}`);
  assert(jl.reduce((t, l) => t + l.debit - l.credit, 0) === 0, "not balanced");
  await expectStatus(post(stores, `/api/ims/assets/${laptop.id}/dispose`, { method: "scrap", reason: "Disposing of it twice should fail." }), 400, "already");
});

await check("asset counts: every asset is counted, missing ones become lost, and the register still agrees with the GL", async () => {
  const r = await post(stores, "/api/ims/assets", { name: `Test projector ${tag}`, category: ict.id, department: LEG.id, cost: 1500000, purchased_at: day(-2), location_name: room });
  await expectStatus(post(stores, "/api/ims/asset-verifications", { title: "Too", location: room }), 400, "title");
  const v = await post(stores, "/api/ims/asset-verifications", { title: `Spot check ${tag}`, as_of: day(0), department: LEG.id, location: room });
  const lines = await admin.collection("asset_verification_lines").getFullList({ filter: `verification = "${v.id}"` });
  assert(lines.length === 1 && lines[0].asset === r.id, `${lines.length} lines in the count`);
  await expectStatus(post(stores, `/api/ims/asset-verifications/${v.id}/complete`), 400, "not counted");
  await post(stores, `/api/ims/asset-verification-lines/${lines[0].id}`, { result: "missing", notes: "Not in the room." });
  const done = await post(stores, `/api/ims/asset-verifications/${v.id}/complete`);
  const ver = await admin.collection("asset_verifications").getOne(done.id);
  assert((await admin.collection("assets").getOne(r.id)).status === "lost" && ver.summary.missing === 1, "the missing asset is not lost");
  assert(ver.reconciliation.length && ver.reconciliation.every((x) => x.cost_difference === 0 && x.accumulated_difference === 0), `register ≠ GL: ${JSON.stringify(ver.reconciliation.filter((x) => x.cost_difference || x.accumulated_difference))}`);
});

await check("staff ask for equipment by type; only the Store & Asset Officer gives a specific asset", async () => {
  const spare = await post(stores, "/api/ims/assets", { name: `Spare laptop ${tag}`, type: laptopType.id, category: ict.id, department: LEG.id, cost: 1400000, purchased_at: day(-1), location_name: room });
  const me = legal.authStore.model;
  const req = await legal.collection("assets_requests").create({ requested_by: me.id, asset_type: laptopType.id, notes: `Need a laptop for court filings ${tag}`, status: "pending" });
  await expectStatus(legal.collection("assets_requests").create({ requested_by: employee.authStore.model.id, asset_type: laptopType.id, notes: `For someone else ${tag}`, status: "pending" }), 400);
  await expectStatus(post(legal, `/api/ims/asset-requests/${req.id}/decide`, { decision: "approve", asset: spare.id }), 403);
  await post(stores, `/api/ims/asset-requests/${req.id}/decide`, { decision: "approve", asset: spare.id, comment: "Collect it at the store." });
  assert((await admin.collection("assets_requests").getOne(req.id)).status === "approved", "request not approved");
  const held = await legal.collection("assets").getFullList({ filter: `id = "${spare.id}"` });
  assert(held.length === 1 && held[0].assigned_to === me.id, "the requester does not see the asset in their list");
});

await check("reports: the DAF and the auditors read them, staff do not", async () => {
  const reg = await finance.send(`/api/ims/asset-reports/asset_register?to=${day(0)}`, {});
  assert(reg.rows.length > 50 && reg.totals.cost > 0, "empty register report");
  const sched = await auditor.send(`/api/ims/asset-reports/asset_schedule?from=2026-07-01&to=${day(0)}`, {});
  const t = sched.totals;
  assert(t.closing_cost === t.opening_cost + t.additions - t.disposals && t.closing_acc === t.opening_acc + t.charge - t.disposal_acc, "the schedule does not add up");
  await expectStatus(employee.send("/api/ims/asset-reports/asset_register", {}), 403);
  await expectStatus(employee.send("/api/ims/assets/overview", {}), 403);
});

await check("the opening register is the DAF's; a single bad row loads nothing", async () => {
  const rows = [
    { name: `Opening desk ${tag}`, category: "FUR", department: "LEG", cost: 900000, purchased_at: "2024-01-10", accumulated: 300000 },
    { name: `Opening thing ${tag}`, category: "NOPE", department: "LEG", cost: 500000, purchased_at: "2024-01-10", accumulated: 0 },
  ];
  await expectStatus(post(stores, "/api/ims/assets/opening", { as_of: "2026-07-01", assets: rows }), 403);
  await expectStatus(post(finance, "/api/ims/assets/opening", { as_of: "2026-07-01", assets: rows }), 400, "row 2");
  assert(!(await admin.collection("assets").getFullList({ filter: `name ~ "Opening desk ${tag}"` })).length, "a row was loaded");
});

for (const fn of cleanup.reverse()) await fn().catch((e) => console.log("cleanup:", e.message));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
