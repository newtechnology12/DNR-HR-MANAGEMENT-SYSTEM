#!/usr/bin/env node
/**
 * Procurement phase 5 demo data, created through the API by real users (so approvals, separation of
 * duties and stock rules are exercised): rights, settings, approval workflows for suppliers, returns,
 * contracts and plans; a supplier in onboarding; contracts (one expiring); department procurement plans;
 * a purchase return that is approved, dispatched and credited.
 *
 * Run after seed-procurement.mjs. Re-running replaces this data.
 */
import PocketBase from "pocketbase";
import { ROLE } from "./ims/roles.mjs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}).`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
const Y = new Date().getFullYear();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().replace("T", " ");
async function login(email) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, "password123");
  return pb;
}
function pdf(title) {
  const body = `BT /F1 16 Tf 60 780 Td (${title}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${body.length} >>\nstream\n${body}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n";
  const off = [];
  objs.forEach((o, i) => {
    off.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("📦 Procurement: onboarding, contracts, plans, returns, reports");
  // Rights come from the IMS permission matrix (seed-demo.mjs / scripts/ims/roles.mjs).
  const settings = (await admin.collection("settings").getList(1, 1)).items[0];
  const wh = (await admin.collection("warehouses").getList(1, 1)).items[0];
  await admin.collection("settings").update(settings.id, { receipt_over_tolerance_pct: 5, invoice_qty_tolerance_pct: 0, default_tax_rate: 18, contract_alert_days: 60, default_payment_terms: "30 days after receipt of a valid invoice", default_delivery_terms: "Delivered to RALGA Head Office, Kigali (DAP)", default_warehouse: wh?.id || "" });

  // Clean previous phase 5 data.
  for (const col of ["purchase_returns", "procurement_plan_lines", "procurement_plans"]) for (const r of await admin.collection(col).getFullList({ fields: "id" })) await admin.collection(col).delete(r.id).catch(() => null);
  for (const r of await admin.collection("contracts").getFullList({ fields: "id" })) await admin.collection("contracts").delete(r.id).catch(() => null);
  for (const s of await admin.collection("suppliers").getFullList({ filter: 'status = "draft" || status = "under_review" || status = "rejected"', fields: "id" })) await admin.collection("suppliers").delete(s.id).catch(() => null);
  for (const t of ["supplier", "purchase_return", "contract", "procurement_plan"]) {
    for (const a of await admin.collection("approval_requests").getFullList({ filter: `document_type = "${t}"`, fields: "id" })) await admin.collection("approval_requests").delete(a.id).catch(() => null);
    for (const w of await admin.collection("approval_workflows").getFullList({ filter: `document_type = "${t}"`, fields: "id" })) await admin.collection("approval_workflows").delete(w.id);
  }

  const role = async (n) => (await admin.collection("roles").getFirstListItem(`name="${n}"`)).id;
  const PM = await role(ROLE.PROCUREMENT_OFFICER);
  const FM = await role(ROLE.DAF);
  const DIR = await role(ROLE.SG);
  const wf = (name, document_type, steps, min = 0, max = 0, description = "") => admin.collection("approval_workflows").create({ name, description, document_type, active: true, priority: 10, min_amount: min, max_amount: max, allow_self_approval: false, overdue_hours: 48, steps });
  // Suppliers registered by Procurement are approved by Finance before they can be used (IMS §3 rule 6).
  await wf("Supplier onboarding", "supplier", [
    { name: "Finance check (bank details, tax clearance)", approver_type: "role", role: FM },
  ], 0, 0, "Procurement registers and submits; Finance checks bank details and tax clearance before the supplier can receive RFQs or orders. Changes to bank details need this approval again.");
  await wf("Purchase return approval", "purchase_return", [{ name: "Procurement approval", approver_type: "role", role: PM, fallback_role: FM }]);
  await wf("Contract approval", "contract", [
    { name: "Finance and legal review", approver_type: "role", role: FM },
    { name: "Secretary General approval (above DAF limit)", approver_type: "role", role: DIR, above_limit_of: FM, skip_if_already_approved: true },
  ], 0, 0, "DAF review; the Secretary General also approves above the DAF contract limit.");
  await wf("Annual procurement plan approval", "procurement_plan", [
    { name: "Director of Finance review", approver_type: "role", role: FM },
    { name: "Secretary General approval", approver_type: "role", role: DIR },
  ]);

  const proc = await login("procurement@dnr-hr.rw");
  const finance = await login("finance@dnr-hr.rw");
  const director = await login("director@dnr-hr.rw");
  const hr = await login("hr@dnr-hr.rw");
  const stores = await login("stores@dnr-hr.rw");
  const accountant = await login("accountant@dnr-hr.rw");
  const approveAll = async (collection, id) => {
    for (let i = 0; i < 4; i++) {
      const doc = await admin.collection(collection).getOne(id);
      if (!doc.approval) return;
      const a = await admin.collection("approval_requests").getOne(doc.approval);
      if (a.status !== "pending") return;
      const who = a.pending_approvers.split(",").filter(Boolean);
      const users = await admin.collection("users").getFullList({ filter: who.map((w) => `id = "${w}"`).join(" || ") });
      const u = users.find((x) => x.email.endsWith("@dnr-hr.rw"));
      if (!u) return;
      const s = await login(u.email);
      await s.send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Checked and approved." } });
    }
  };

  // Supplier onboarding: one under review, one incomplete draft.
  const cats = await admin.collection("procurement_categories").getFullList();
  const newSup = await proc.collection("suppliers").create({
    name: "Kigali Digital Solutions Ltd", supplier_type: "company", categories: [cats[0].id], registration_number: "RDB-104238671", tin: "109876543", country: "Rwanda", district: "Gasabo",
    address: "KG 9 Ave, Kigali Heights", email: "sales@kigalidigital.rw", phone: "+250788401122", payment_terms: "30 days", currency: "RWF", bank_name: "Bank of Kigali", bank_account_name: "Kigali Digital Solutions Ltd", bank_account_number: "100012345678",
  });
  for (const [type, num] of [["registration_certificate", "RDB-104238671"], ["tax_certificate", "RRA-TCC-2026-8812"]]) {
    const fd = new FormData();
    fd.append("supplier", newSup.id);
    fd.append("document_type", type);
    fd.append("document_number", num);
    fd.append("issue_date", day(-60));
    fd.append("expiry_date", day(300));
    fd.append("file", pdf(`${type} ${num}`), `${type}.pdf`);
    await proc.collection("supplier_documents").create(fd);
  }
  await proc.send(`/api/dnr/suppliers/${newSup.id}/submit`, { method: "POST" });
  await proc.collection("suppliers").create({ name: "Nyamirambo Printing Cooperative", supplier_type: "company", country: "Rwanda", phone: "+250788555010", currency: "RWF" });

  // Contracts.
  const pos = await admin.collection("purchase_orders").getFullList({ filter: 'status != "cancelled" && status != "draft"', sort: "created", expand: "supplier" });
  const active = await admin.collection("suppliers").getFullList({ filter: 'status = "active"', sort: "created" });
  const poSup = pos[0]?.supplier || active[0].id;
  const mk = async (data) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    if (data.__doc) fd.append("documents", pdf(`Signed contract ${data.title}`), "signed-contract.pdf");
    fd.delete("__doc");
    return proc.collection("contracts").create(fd);
  };
  const c1 = await mk({ title: "Framework agreement — ICT equipment and accessories", supplier: poSup, contract_type: "framework", start_date: day(-120), end_date: day(245), renewal_date: day(185), value: 60000000, currency: "RWF", payment_terms: "30 days after delivery", scope: "Laptops, desktops, printers and accessories for the General Secretariat and provincial desks, at the unit prices of the attached schedule.", items: [{ description: "Laptop, 16GB RAM, 512GB SSD", unit: "Each", unit_price: 1121400 }, { description: "Laser printer A4", unit: "Each", unit_price: 450000 }], __doc: true });
  await proc.send(`/api/dnr/contracts/${c1.id}/submit`, { method: "POST" });
  await approveAll("contracts", c1.id);
  const c2 = await mk({ title: "Maintenance of servers and network equipment", supplier: active[2]?.id || poSup, contract_type: "service", start_date: day(-320), end_date: day(40), renewal_date: day(20), value: 8400000, currency: "RWF", payment_terms: "Monthly, in arrears", scope: "Preventive and corrective maintenance, 8x5 support, 4-hour response time.", __doc: true });
  await proc.send(`/api/dnr/contracts/${c2.id}/submit`, { method: "POST" });
  await approveAll("contracts", c2.id);
  const c3 = await mk({ title: "Cleaning services — Head Office", supplier: active[3]?.id || poSup, contract_type: "service", start_date: day(10), end_date: day(375), value: 14400000, currency: "RWF", payment_terms: "Monthly" });

  // Procurement plans.
  const depts = Object.fromEntries((await admin.collection("departments").getFullList()).map((d) => [d.name, d.id]));
  const catBy = (re) => (cats.find((c) => re.test(c.name)) || cats[0]).id;
  const PLANS = [
    // Plans are consolidated by the Procurement Officer (the only role allowed to prepare them) per department.
    [proc, "ICT and Digital Services", [["Laptops for new staff", 12, "Each", 1150000, 2, "high", "rfq", /it|ict|computer/i], ["E-learning platform hosting renewal", 1, "Year", 9600000, 7, "high", "direct", /service|software|ict/i], ["Network switches (48 ports)", 3, "Each", 2100000, 4, "medium", "rfq", /it|ict/i], ["UPS for server room", 2, "Each", 3200000, 5, "medium", "rfq", /it|ict/i]], true],
    [proc, "Capacity Building", [["Training venue and catering — councillors induction (3 sessions)", 3, "Session", 6500000, 3, "urgent", "open_tender", /service|event|train/i], ["Printing of training manuals", 1500, "Copy", 4500, 2, "high", "rfq", /print|stationer/i], ["Facilitators — local economic development", 4, "Days", 350000, 6, "medium", "rfq", /consult|service/i]], true],
    [proc, "Procurement", [["Office stationery (annual)", 1, "Lot", 7800000, 1, "medium", "framework", /stationer|office/i], ["Toner cartridges", 60, "Each", 87000, 4, "medium", "framework", /stationer|office|it/i]], false],
  ];
  for (const [who, dept, lines, approve] of PLANS) {
    const plan = await who.collection("procurement_plans").create({ fiscal_year: Y + 1, department: depts[dept], notes: `Prepared from the ${Y + 1} action plan of the department.` });
    for (const [i, [description, quantity, unit, cost, month, priority, method, cre]] of lines.entries()) {
      await who.collection("procurement_plan_lines").create({ plan: plan.id, description, quantity, unit, estimated_unit_cost: cost, planned_month: month, priority, method, category: catBy(cre), sort: i + 1 });
    }
    if (approve) {
      await who.send(`/api/dnr/plans/${plan.id}/submit`, { method: "POST" });
      await approveAll("procurement_plans", plan.id);
    }
  }

  // Purchase return from a goods receipt with stock.
  const grns = await admin.collection("goods_receipts").getFullList({ sort: "created" });
  const grn = grns.find((g) => (g.items || []).some((i) => i.line_type === "goods" && i.accepted >= 2));
  if (grn) {
    const line = grn.items.find((i) => i.line_type === "goods" && i.accepted >= 2);
    const r = await proc.send("/api/dnr/returns", { method: "POST", body: { goods_receipt: grn.id, reason: "Two cartridges leak toner and do not print; the supplier agreed to issue a credit note.", supplier_action: "credit_note", items: [{ line: line.line, quantity: 2, condition: "defective" }] } });
    await proc.send(`/api/dnr/returns/${r.id}/submit`, { method: "POST" });
    await approveAll("purchase_returns", r.id);
    await stores.send(`/api/dnr/returns/${r.id}/dispatch`, { method: "POST", body: { notes: "Collected by the supplier's driver, delivery note DN-RT-0042." } });
    const rr = await admin.collection("purchase_returns").getOne(r.id);
    await accountant.send(`/api/dnr/returns/${r.id}/credit`, { method: "POST", body: { credit_note_number: "CN-2026-0117", credit_amount: rr.total_value } });
  }

  const count = async (c, f = "") => (await admin.collection(c).getList(1, 1, { filter: f })).totalItems;
  console.log(`  ✓ workflows, rights and settings · suppliers under review: ${await count("suppliers", 'status = "under_review"')} · contracts: ${await count("contracts")} (${await count("contracts", 'status = "active"')} active) · plans: ${await count("procurement_plans")} (${await count("procurement_plans", 'status = "approved"')} approved) · returns: ${await count("purchase_returns")}`);
}

main().catch((e) => {
  console.error("❌ Procurement phase 5 seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
