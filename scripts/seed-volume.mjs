#!/usr/bin/env node
/**
 * More realistic activity for the demo (run after the other seeds; `npm run seed:ralga` runs it last).
 *
 * For one purchase per department, the whole chain is run THROUGH THE REAL API as the real people:
 * staff requisition → Head of Department / Budget Officer / DAF approval → direct purchase order by
 * Procurement → DAF approval → delivery received by the Store officer → supplier invoice recorded by
 * the Accountant (dated over the last four months) → approval → payment voucher with withholding tax →
 * Cashier payment. Each purchase stops at a different point, so every list, report and dashboard shows
 * work in progress: invoices overdue by 1–30, 31–60, 61–90 and 90+ days, vouchers waiting for the DAF or
 * the Cashier, and paid ones.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}). Set ALLOW_REMOTE_SEED=true to override.`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);

let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
const day = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.toISOString().slice(0, 10)} 10:00:00.000Z`;
};
const sessions = new Map();
async function as(email) {
  if (!sessions.has(email)) {
    const c = new PocketBase(PB_URL);
    c.autoCancellation(false);
    await c.collection("users").authWithPassword(email, "password123");
    sessions.set(email, c);
  }
  return sessions.get(email);
}
async function approveAll(approvalId) {
  for (let i = 0; i < 6; i++) {
    const a = await admin.collection("approval_requests").getOne(approvalId);
    if (a.status !== "pending") return a.status;
    const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    await (await as(who.email)).send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Checked and approved." } });
  }
  return "pending";
}
const isShortfall = (e) => /insufficient budget/i.test(e?.response?.message || e?.message || "");
async function withBudget(client, path, docType, docId) {
  try {
    return await client.send(path, { method: "POST" });
  } catch (e) {
    if (!isShortfall(e)) throw e;
    const daf = await as("finance@dnr-hr.rw");
    await daf.send("/api/ims/budget/overrides", { method: "POST", body: { document_type: docType, document_id: docId, reason: "Priority activity of the work plan; the line will be topped up by the next budget revision." } });
    return client.send(path, { method: "POST" });
  }
}

// [department, title, category, request type, lines, invoice days ago (inside the current fiscal year), where it
//  stops, withholding tax, payment terms in days (default 30)]
const SCENARIOS = [
  ["FIN", "Toner cartridges for the Finance unit", "SUP", "goods", [["HP 26A toner cartridge", 6, "Each", 87000, 18]], 108, "approved_unpaid", "WHT_PUBLIC_TENDER", 7],
  ["HRM", "Recruitment adverts in the national newspapers", "PRN", "services", [["Job advert, half page, 2 editions", 2, "Each", 420000, 18]], 104, "paid", "WHT_PUBLIC_TENDER"],
  ["CBD", "Venue and catering — LED training in Musanze", "TRN", "services", [["Conference hall, 2 days", 2, "Days", 650000, 18], ["Lunch and breaks, 45 participants × 2 days", 90, "Each", 9000, 18]], 97, "approved_unpaid", "WHT_PUBLIC_TENDER"],
  ["OSG", "Repair of meeting room chairs", "MNT", "maintenance", [["Repair and reupholstery of chairs", 8, "Each", 45000, 18]], 90, "paid", "WHT_PUBLIC_TENDER"],
  ["COM", "Printing of the annual report 2025/26", "PRN", "services", [["Annual report, 60 pages, full colour", 300, "Copy", 6500, 18]], 74, "approved_unpaid", "WHT_PUBLIC_TENDER"],
  ["ICT", "Microsoft 365 licences renewal", "SWS", "subscriptions", [["Microsoft 365 Business Standard, 12 months", 10, "Each", 168000, 18]], 63, "paid", "WHT_PUBLIC_TENDER"],
  ["APR", "Translation of the decentralisation policy brief", "PRO", "consultancy", [["Translation EN/FR/RW, per page", 40, "Page", 15000, 18]], 51, "to_pay", "WHT_SERVICES"],
  ["PME", "Field data collection — district performance survey", "PRO", "consultancy", [["Enumerator days", 50, "Days", 25000, 0]], 44, "pending_voucher", "WHT_SERVICES"],
  ["LEG", "Law reports subscription 2026/27", "SWS", "subscriptions", [["Rwanda Law Reports, annual subscription", 1, "Year", 380000, 18]], 36, "approved_unpaid", "WHT_PUBLIC_TENDER"],
  ["RCS", "Stationery for recruitment examinations", "SUP", "goods", [["A4 paper 80 g (ream)", 40, "Ream", 5200, 18], ["Ballpoint pens (box of 50)", 6, "Box", 9500, 18]], 27, "paid", "WHT_PUBLIC_TENDER"],
  ["IAU", "Audit data analysis software licence", "SWS", "subscriptions", [["IDEA data analysis, 1 user, 12 months", 1, "Year", 1450000, 18]], 15, "approved_unpaid", "WHT_PUBLIC_TENDER"],
  ["PRC", "Tender notices for framework agreements", "PRN", "services", [["Tender notice, national newspapers", 2, "Each", 310000, 18]], 6, "invoice_recorded", "WHT_PUBLIC_TENDER"],
];

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("📈 Demo activity across departments (requisition → order → delivery → invoice → payment)");
  const fy = await admin.collection("fiscal_years").getFirstListItem("is_current = true");
  const depts = Object.fromEntries((await admin.collection("departments").getFullList()).map((d) => [d.code, d]));
  const cats = Object.fromEntries((await admin.collection("procurement_categories").getFullList({ expand: "expense_account" })).map((c) => [c.code, c]));
  const units = Object.fromEntries((await admin.collection("units_of_measure").getFullList()).map((u) => [u.name.toLowerCase(), u.name]));
  const suppliers = await admin.collection("suppliers").getFullList({ filter: 'status = "active" && bank_change_pending = false && bank_account_number != ""', sort: "created" });
  const warehouse = (await admin.collection("warehouses").getFullList({ sort: "created" }))[0];
  const pm = await as("procurement@dnr-hr.rw");
  const stores = await as("stores@dnr-hr.rw");
  const acc = await as("accountant@dnr-hr.rw");
  const cashier = await as("cashier@dnr-hr.rw");
  const tally = { paid: 0, to_pay: 0, pending_voucher: 0, approved_unpaid: 0, invoice_recorded: 0, failed: 0 };

  for (const [i, [code, title, catCode, requestType, lines, daysAgo, stop, wht, terms = 30]] of SCENARIOS.entries()) {
    try {
      const dept = depts[code];
      const cat = cats[catCode];
      if (!dept || !cat) throw new Error(`department ${code} or category ${catCode} missing`);
      // Requester: a member of the department with the Staff role who can sign in.
      const members = await admin.collection("users").getFullList({ filter: `department = "${dept.id}" && status = "Active"`, expand: "role", sort: "created" });
      let requester = null;
      // Anyone who may raise requisitions: Staff first, then other roles (never the auditor, viewer or administrator).
      const NO_REQ = ["INTERNAL_AUDITOR", "MGMT_VIEWER", "SYS_ADMIN"];
      const others = members.filter((x) => x.id !== dept.head && !NO_REQ.includes(x.expand?.role?.code));
      for (const m of others.filter((x) => x.expand?.role?.code === "STAFF").concat(others)) {
        try {
          await as(m.email);
          requester = m;
          break;
        } catch (_) {}
      }
      if (!requester) throw new Error(`no requester can sign in for ${code}`);
      const accCode = cat.expand?.expense_account?.code || "5201";
      const line = await admin.collection("budget_lines").getFirstListItem(`fiscal_year = "${fy.id}" && status = "active" && (code = "${code}-${accCode}-MC" || code = "${code}-5201-MC")`, { sort: "-code" });
      const client = await as(requester.email);
      const req = await client.collection("purchase_requisitions").create({
        title, request_type: requestType, category: cat.id, priority: ["medium", "high", "medium", "urgent"][i % 4], budget_line: line.id,
        required_date: day(int(10, 40)), delivery_location: "RALGA Head Office, Kigali", justification: `${title}: planned activity of the ${dept.name} work plan for FY ${fy.name}.`,
        items: lines.map(([description, quantity, unit, unit_cost, tax_rate]) => ({ description, quantity, unit: units[String(unit).toLowerCase()] || unit, unit_cost, tax_rate })),
      });
      await withBudget(client, `/api/dnr/requisitions/${req.id}/submit`, "purchase_requisition", req.id);
      const submitted = await admin.collection("purchase_requisitions").getOne(req.id);
      if ((await approveAll(submitted.approval)) !== "approved") throw new Error(`${req.number} not approved`);

      // Direct purchase order to a supplier of that category (otherwise any approved supplier).
      const supplier = suppliers.find((s) => (s.categories || []).includes(cat.id)) || suppliers[i % suppliers.length];
      const po = await pm.send(`/api/dnr/purchase-orders/direct/${req.id}`, { method: "POST", body: { supplier: supplier.id, justification: "Value below the threshold for competitive quotations; supplier holds the framework price list." } });
      const sub = await withBudget(pm, `/api/dnr/purchase-orders/${po.id}/submit`, "purchase_order", po.id);
      if ((await approveAll(sub.approval || (await admin.collection("purchase_orders").getOne(po.id)).approval)) !== "approved") throw new Error(`${po.number} not approved`);
      await pm.send(`/api/dnr/purchase-orders/${po.id}/send`, { method: "POST" });
      await pm.send(`/api/dnr/purchase-orders/${po.id}/acknowledge`, { method: "POST" });
      const full = await admin.collection("purchase_orders").getOne(po.id);
      await stores.send(`/api/dnr/purchase-orders/${po.id}/receive`, {
        method: "POST",
        body: { warehouse: warehouse.id, delivery_note_number: `DN-${int(10000, 99999)}`, items: full.items.map((l) => ({ line: l.line, received: l.quantity, rejected: 0, condition: "good", batch: "" })) },
      });

      // Supplier invoice, dated in the past (payment terms 30 days).
      const received = await admin.collection("purchase_orders").getOne(po.id);
      const inv = await acc.collection("supplier_invoices").create({
        purchase_order: po.id, supplier_invoice_number: `FV-${supplier.code.slice(-3)}-${2600 + i * 7}`, invoice_date: day(-daysAgo), due_date: day(-daysAgo + terms),
        items: received.items.map((l) => ({ line: l.line, quantity: l.received_qty || l.quantity, unit_price: Math.round((l.net / l.quantity) * 100) / 100, tax_rate: l.tax_rate })),
        notes: "Original received by e-mail and filed in Finance.",
      });
      if (stop === "invoice_recorded") {
        tally.invoice_recorded++;
        continue;
      }
      await acc.send(`/api/dnr/invoices/${inv.id}/submit`, { method: "POST" });
      if ((await approveAll((await admin.collection("supplier_invoices").getOne(inv.id)).approval)) !== "approved") throw new Error(`${inv.number} not approved`);
      if (stop === "approved_unpaid") {
        tally.approved_unpaid++;
        continue;
      }

      // Payment voucher with withholding tax.
      const v = await acc.collection("payment_vouchers").create({ voucher_type: "invoice", supplier: supplier.id, lines: [{ invoice: inv.id }], wht_code: wht, notes: "Invoice, delivery note and purchase order attached in the system." });
      const vs = await acc.send(`/api/ims/vouchers/${v.id}/submit`, { method: "POST" });
      if (stop === "pending_voucher") {
        tally.pending_voucher++;
        continue;
      }
      if ((await approveAll(vs.approval)) !== "approved") throw new Error(`${v.number} not approved`);
      if (stop === "to_pay") {
        tally.to_pay++;
        continue;
      }
      await cashier.send(`/api/ims/vouchers/${v.id}/pay`, { method: "POST", body: { method: "bank_transfer", reference: `BK-TRF-${int(100000, 999999)}`, payment_date: day(-Math.max(daysAgo - int(12, 26), 1)) } });
      tally.paid++;
    } catch (e) {
      tally.failed++;
      console.log(`  ! ${code} ${title}: ${e?.response?.message || e.message}`);
    }
  }
  console.log(`  ✓ ${SCENARIOS.length - tally.failed} purchases: ${tally.paid} paid, ${tally.to_pay} waiting for the Cashier, ${tally.pending_voucher} voucher waiting for the DAF, ${tally.approved_unpaid} invoices approved and unpaid, ${tally.invoice_recorded} invoice to submit${tally.failed ? ` — ${tally.failed} failed` : ""}`);
}

main().catch((e) => {
  console.error("\n❌ Demo activity seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
