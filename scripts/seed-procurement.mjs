#!/usr/bin/env node
/**
 * Procurement demo data (run after seed-demo.mjs; `npm run seed:demo` runs both).
 *
 * Configuration (roles, department heads, categories, units, numbering, approval workflows)
 * is written as admin. Requisitions are then created, submitted and approved THROUGH THE
 * REAL API while logged in as each requester / approver — so the approval engine, separation
 * of duties, numbering and audit trail are exercised exactly as in production.
 */
import PocketBase from "pocketbase";
import { ROLE, DEMO_ACCOUNTS } from "./ims/roles.mjs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}). Set ALLOW_REMOTE_SEED=true to override.`);
  process.exit(1);
}
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "admin123456";
const DEMO_PASSWORD = "password123";

const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
const pick = (arr) => arr[int(0, arr.length - 1)];
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().replace("T", " ");
};

const sessions = new Map();
async function as(email) {
  if (!sessions.has(email)) {
    const c = new PocketBase(PB_URL);
    c.autoCancellation(false);
    await c.collection("users").authWithPassword(email, DEMO_PASSWORD);
    sessions.set(email, c);
  }
  return sessions.get(email);
}

// ------------------------------------------------------------------ roles
// Roles and the permission matrix are owned by seed-demo.mjs (scripts/ims/roles.mjs); this seed only
// looks them up by name.
async function setupRoles() {
  const roles = await admin.collection("roles").getFullList();
  for (const name of Object.values(ROLE)) if (!roles.some((r) => r.name === name)) throw new Error(`Role "${name}" is missing — run seed-demo.mjs first.`);
  return Object.fromEntries(roles.map((r) => [r.name, r.id]));
}

// ------------------------------------------------------------------ people
async function setupPeople(roleIds) {
  const departments = await admin.collection("departments").getFullList();
  // One department head per department when none is set yet (seed-org-ralga.mjs sets the real heads).
  const all = (await admin.collection("users").getFullList({ expand: "role", filter: `status="Active"` })).filter((u) =>
    /@dnr-hr\.rw$/.test(u.email)
  );
  const exclude = new Set(DEMO_ACCOUNTS.map((a) => a.email));
  for (const d of departments) {
    const members = all.filter((u) => u.department === d.id && !exclude.has(u.email));
    const head = members.find((u) => u.expand?.role?.name === ROLE.HOD) || members[0];
    if (head && !d.head) {
      await admin.collection("departments").update(d.id, { head: head.id });
      if (head.expand?.role?.name === ROLE.STAFF) await admin.collection("users").update(head.id, { role: roleIds[ROLE.HOD], extra_roles: [roleIds[ROLE.STAFF]] });
    }
  }
  console.log(`  ✓ people: department heads checked`);
  const refreshed = (await admin.collection("users").getFullList({ expand: "role,department", filter: `status="Active"` })).filter((u) =>
    /@dnr-hr\.rw$/.test(u.email)
  );
  return { users: refreshed, departments: await admin.collection("departments").getFullList() };
}


// ------------------------------------------------------------------ reference data
// [name, code, is_asset, default GL account] — the account picks the budget line and, later, the posting.
const CATEGORIES = [
  ["IT Equipment", "ITE", true, "1240"], ["Office Furniture", "FUR", true, "1230"], ["Vehicles & Transport", "VEH", true, "1220"],
  ["Office Supplies", "SUP", false, "5201"], ["Printing & Stationery", "PRN", false, "5215"], ["Software & Subscriptions", "SWS", false, "5214"],
  ["Professional Services", "PRO", false, "5210"], ["Maintenance & Repairs", "MNT", false, "5205"], ["Construction & Renovation", "CON", false, "1210"],
  ["Training & Events", "TRN", false, "5209"],
];
const UNITS = [
  ["Each", "EA"], ["Box", "BOX"], ["Pack", "PK"], ["Ream", "RM"], ["Litre", "L"], ["Kilogram", "KG"],
  ["Hour", "HR"], ["Day", "DAY"], ["Month", "MO"], ["Year", "YR"], ["Lot", "LOT"], ["Service", "SVC"],
];
const SEQUENCES = [
  ["purchase_requisition", "Purchase requisition", "PR", true], ["rfq", "Request for quotation", "RFQ", true],
  ["quotation", "Supplier quotation", "QUO", true], ["purchase_order", "Purchase order", "PO", true],
  ["goods_receipt", "Goods receipt", "GRN", true], ["contract", "Contract", "CON", true], ["supplier", "Supplier", "SUP", false],
];

async function upsert(collection, filter, data) {
  const existing = await admin.collection(collection).getFirstListItem(filter).catch(() => null);
  return existing ? admin.collection(collection).update(existing.id, data) : admin.collection(collection).create(data);
}

async function setupReference(roleIds) {
  const cats = {};
  const glId = Object.fromEntries((await admin.collection("gl_accounts").getFullList({ fields: "id,code" })).map((a) => [a.code, a.id]));
  for (const [name, code, is_asset, account] of CATEGORIES) {
    cats[name] = await upsert("procurement_categories", `code="${code}"`, { name, code, is_asset, active: true, description: `${name} purchases`, expense_account: glId[account] || "" });
  }
  for (const [name, code] of UNITS) await upsert("units_of_measure", `code="${code}"`, { name, code, active: true });
  for (const [key, name, prefix, include_year] of [...SEQUENCES, ["asset", "Asset", "AST", true], ["inventory_item", "Inventory item", "ITM", false]]) {
    await upsert("number_sequences", `key="${key}"`, {
      key, name, prefix, include_year, padding: 6, separator: "-", next_value: 1, current_year: new Date().getFullYear(),
    });
  }

  // Default flows from the IMS spec §4 (Finance can change them under Settings → Approval workflows).
  // "SG (above limit)" applies only above the DAF approval limit for the document type (approval_limits).
  const sgAboveLimit = { name: "Secretary General approval (above DAF limit)", approver_type: "role", role: roleIds[ROLE.SG], above_limit_of: roleIds[ROLE.DAF], skip_if_already_approved: true };
  const flows = [
    {
      name: "Purchase requisition approval", document_type: "purchase_requisition",
      description: "Requester → Head of Department → Budget Officer (budget check) → DAF → Secretary General above the DAF limit.",
      steps: [
        { name: "Head of Department", approver_type: "department_head", fallback_role: roleIds[ROLE.SG] },
        { name: "Budget check", approver_type: "role", role: roleIds[ROLE.BUDGET_OFFICER] },
        { name: "Director of Finance approval", approver_type: "role", role: roleIds[ROLE.DAF], fallback_role: roleIds[ROLE.SG] },
        sgAboveLimit,
      ],
    },
    {
      name: "Purchase order approval", document_type: "purchase_order",
      description: "Procurement Officer → DAF → Secretary General above the DAF limit. The buyer who raised the PO can never approve it.",
      steps: [{ name: "Director of Finance approval", approver_type: "role", role: roleIds[ROLE.DAF], fallback_role: roleIds[ROLE.SG] }, sgAboveLimit],
    },
  ];
  for (const t of ["purchase_requisition", "purchase_order"]) {
    for (const w of await admin.collection("approval_workflows").getFullList({ filter: `document_type="${t}"` })) {
      if (!flows.some((f) => f.name === w.name)) await admin.collection("approval_workflows").delete(w.id).catch(() => admin.collection("approval_workflows").update(w.id, { active: false }));
    }
  }
  for (const w of flows) {
    await upsert("approval_workflows", `name="${w.name}" && document_type="${w.document_type}"`, {
      ...w, active: true, priority: 10, min_amount: 0, max_amount: 0, departments: [], categories: [], branches: [], funding_sources: [], allow_self_approval: false, overdue_hours: 48,
    });
  }
  console.log(`  ✓ reference: ${CATEGORIES.length} categories, ${UNITS.length} units, ${SEQUENCES.length} number sequences, requisition and PO approval flows`);
  return cats;
}

// ------------------------------------------------------------------ requisitions
const SCENARIOS = [
  ["Laptops for new audit associates", "assets", "IT Equipment", [["Dell Latitude 5440 laptop, 16GB RAM, 512GB SSD", 4, "EA", 1150000, 18]]],
  ["Printer toner restock Q4", "goods", "Printing & Stationery", [["HP 26A toner cartridge", 12, "EA", 95000, 18], ["A4 paper 80gsm", 40, "RM", 5200, 18]]],
  ["Microsoft 365 annual renewal", "subscriptions", "Software & Subscriptions", [["Microsoft 365 Business Standard licence", 45, "YR", 150000, 18]]],
  ["Ergonomic chairs for finance team", "assets", "Office Furniture", [["Ergonomic office chair with lumbar support", 8, "EA", 185000, 18]]],
  ["Generator servicing", "maintenance", "Maintenance & Repairs", [["60kVA generator full service", 1, "SVC", 450000, 18], ["Replacement filters kit", 1, "LOT", 120000, 18]]],
  ["External legal review of client contracts", "consultancy", "Professional Services", [["Legal advisory", 24, "HR", 85000, 0]]],
  ["Office renovation - 2nd floor", "construction", "Construction & Renovation", [["Partitioning and ceiling works", 1, "LOT", 18500000, 18], ["Electrical rewiring", 1, "LOT", 6200000, 18]]],
  ["Staff training: IFRS 17 workshop", "services", "Training & Events", [["IFRS 17 two-day workshop (per participant)", 12, "EA", 280000, 0]]],
  ["Stationery for field audits", "goods", "Office Supplies", [["Box files", 30, "EA", 4500, 18], ["Pens (box of 50)", 6, "BOX", 12000, 18], ["Staplers", 10, "EA", 8500, 18]]],
  ["Pool vehicle for field audits", "assets", "Vehicles & Transport", [["Toyota Hilux double cabin 2.4 GD-6", 1, "EA", 42000000, 18]]],
  ["Network switch upgrade", "assets", "IT Equipment", [["Cisco CBS350 48-port switch", 2, "EA", 2100000, 18], ["Installation and configuration", 1, "SVC", 600000, 18]]],
  ["Projector for board room", "assets", "IT Equipment", [["Epson EB-X51 projector", 1, "EA", 780000, 18], ["Ceiling mount", 1, "EA", 95000, 18]]],
  ["Tax software subscription", "subscriptions", "Software & Subscriptions", [["Tax compliance software annual licence", 1, "YR", 3400000, 18]]],
  ["Air conditioning repair - server room", "maintenance", "Maintenance & Repairs", [["AC compressor replacement", 1, "SVC", 1350000, 18]]],
  ["Team building retreat", "services", "Training & Events", [["Venue and catering (per person)", 40, "EA", 65000, 18]]],
  ["Filing cabinets for archives", "assets", "Office Furniture", [["4-drawer steel filing cabinet", 6, "EA", 240000, 18]]],
  ["Drinking water supply", "goods", "Office Supplies", [["18.9L water bottles", 80, "EA", 3500, 0]]],
  ["Cybersecurity penetration test", "consultancy", "Professional Services", [["External penetration test and report", 1, "SVC", 7800000, 18]]],
];
// outcome: [status to reach, level at which it stops]
const OUTCOMES = [
  "approved", "approved", "approved", "approved", "pending0", "pending0", "pending1", "pending2",
  "rejected", "returned", "draft", "draft", "cancelled", "approved", "pending0", "approved", "pending1", "approved",
];

const isShortfall = (e) => /insufficient budget/i.test(e?.response?.message || e?.message || "");

/** Budget control is a hard stop: when a document exceeds its line, the DAF records an override and it is resubmitted. */
async function submitWithBudget(client, path, docType, docId, reason) {
  try {
    return await client.send(path, { method: "POST" });
  } catch (e) {
    if (!isShortfall(e)) throw e;
    const daf = await as("finance@dnr-hr.rw");
    await daf.send("/api/ims/budget/overrides", { method: "POST", body: { document_type: docType, document_id: docId, reason } });
    return client.send(path, { method: "POST" });
  }
}

/** Budget line for a requester's department and the category's GL account (member contributions). */
function lineFor(lines, departmentCode, account) {
  return lines.find((l) => l.code === `${departmentCode}-${account}-MC`) || lines.find((l) => l.code === `${departmentCode}-5201-MC`) || null;
}

async function act(approvalId, email, action, comment) {
  const c = await as(email);
  return c.send(`/api/dnr/approvals/${approvalId}/act`, { method: "POST", body: { action, comment } });
}

async function seedRequisitions(users, cats, units) {
  // Clear previous demo procurement records (dev only — audit_logs are never deletable through the API).
  for (const col of ["approval_actions", "approval_requests", "purchase_requisitions", "notifications"]) {
    const rows = await admin.collection(col).getFullList({ fields: "id" });
    for (const r of rows) await admin.collection(col).delete(r.id);
  }
  const audit = await admin.collection("audit_logs").getFullList({ fields: "id", filter: `collection_name="purchase_requisitions"` });
  for (const r of audit) await admin.collection("audit_logs").delete(r.id);
  const seq = await admin.collection("number_sequences").getFirstListItem(`key="purchase_requisition"`);
  await admin.collection("number_sequences").update(seq.id, { next_value: 1 });

  const requesters = users.filter((u) => !DEMO_ACCOUNTS.some((a) => a.email === u.email));
  const unitByCode = Object.fromEntries(units.map((u) => [u.code, u.name]));
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const tally = {};

  const fy = await admin.collection("fiscal_years").getFirstListItem("is_current = true");
  const budgetLines = await admin.collection("budget_lines").getFullList({ filter: `fiscal_year = "${fy.id}" && status = "active"`, fields: "id,code" });
  const accountOf = Object.fromEntries(CATEGORIES.map((c) => [c[0], c[3]]));
  for (const [i, [title, request_type, category, lines]] of SCENARIOS.entries()) {
    const requester = i === 0 ? users.find((u) => u.email === "employee@dnr-hr.rw") : pick(requesters);
    const client = await as(requester.email);
    const budgetLine = lineFor(budgetLines, requester.expand?.department?.code, accountOf[category]);
    const doc = await client.collection("purchase_requisitions").create({
      budget_line: budgetLine?.id || "",
      title, request_type, category: cats[category].id, priority: pick(["low", "medium", "medium", "high", "urgent"]),
      required_date: inDays(int(7, 60)), delivery_location: pick(["Kigali HQ, KG 7 Ave", "Musanze branch", "Huye branch"]),
      cost_center: requester.expand?.department?.code || requester.expand?.department?.name || "",
      justification: `Needed for ${requester.expand?.department?.name || "department"} operations: ${title.toLowerCase()}.`,
      items: lines.map(([description, quantity, unit, unit_cost, tax_rate]) => ({ description, quantity, unit: unitByCode[unit] || unit, unit_cost, tax_rate })),
    });
    const outcome = OUTCOMES[i % OUTCOMES.length];
    tally[outcome] = (tally[outcome] || 0) + 1;
    if (outcome === "draft") continue;

    const submitted = await submitWithBudget(client, `/api/dnr/requisitions/${doc.id}/submit`, "purchase_requisition", doc.id, "Priority need confirmed by the Secretary General; to be covered by a virement at mid-year review.");
    if (outcome === "cancelled") {
      await client.send(`/api/dnr/requisitions/${doc.id}/cancel`, { method: "POST", body: { reason: "Budget reallocated to a higher priority project." } });
      continue;
    }
    const stopAt = outcome.startsWith("pending") ? Number(outcome.slice(-1)) : Infinity;
    for (let level = 0; level < 6; level++) {
      const approval = await admin.collection("approval_requests").getOne(submitted.approval);
      if (approval.status !== "pending") break;
      const approverEmail = byId[approval.pending_approvers.split(",")[0]]?.email;
      if (!approverEmail) throw new Error(`No demo login for approver of ${doc.number}`);
      if (level >= stopAt) break;
      const last = level === approval.steps.length - 1;
      if (outcome === "rejected" && (last || level === 1)) {
        await act(approval.id, approverEmail, "reject", "Price is above market rates for this specification. Please re-scope.");
        break;
      }
      if (outcome === "returned" && level === 0) {
        await act(approval.id, approverEmail, "return", "Please attach at least two indicative quotes and confirm the quantity.");
        break;
      }
      if (level === 0 && rand() < 0.3) await act(approval.id, approverEmail, "comment", "Reviewed — within departmental plan.");
      await act(approval.id, approverEmail, "approve", pick(["", "Approved.", "OK, proceed.", "Approved within budget."]));
    }
  }
  console.log(`  ✓ requisitions: ${SCENARIOS.length} created through the API (${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(", ")})`);
}

// ------------------------------------------------------------------ suppliers & sourcing
const SUPPLIERS = [
  ["Kigali Office Solutions Ltd", ["Office Supplies", "Printing & Stationery", "Office Furniture"], "company"],
  ["Rwanda Tech Distributors", ["IT Equipment", "Software & Subscriptions"], "company"],
  ["Great Lakes Computers", ["IT Equipment"], "company"],
  ["Inzozi IT Services", ["IT Equipment", "Software & Subscriptions", "Maintenance & Repairs"], "company"],
  ["Umucyo Furniture Workshop", ["Office Furniture"], "company"],
  ["Nyabugogo Hardware & Construction", ["Construction & Renovation", "Maintenance & Repairs"], "company"],
  ["Akagera Motors", ["Vehicles & Transport", "Maintenance & Repairs"], "company"],
  ["Toyota Rwanda", ["Vehicles & Transport"], "company"],
  ["Imena Consulting Partners", ["Professional Services", "Training & Events"], "company"],
  ["Kigali Legal Associates", ["Professional Services"], "company"],
  ["Heza Events & Catering", ["Training & Events"], "company"],
  ["Ubumwe Print House", ["Printing & Stationery", "Office Supplies"], "company"],
  ["CyberShield Africa", ["Professional Services", "Software & Subscriptions"], "company"],
  ["Jean Bosco Habyarimana (electrician)", ["Maintenance & Repairs"], "individual"],
];

async function wipeSourcing() {
  for (const col of ["quotations", "rfq_suppliers", "rfqs", "supplier_evaluations", "supplier_documents", "supplier_contacts", "suppliers"]) {
    if (col === "rfqs") {
      const rows = await admin.collection("rfqs").getFullList({ fields: "id" });
      for (const r of rows) await admin.collection("rfqs").update(r.id, { awarded_quotation: "" }).catch(() => null);
    }
    const rows = await admin.collection(col).getFullList({ fields: "id" });
    for (const r of rows) await admin.collection(col).delete(r.id);
  }
  const auditRows = await admin.collection("audit_logs").getFullList({ fields: "id", filter: `collection_name="suppliers" || collection_name="rfqs"` });
  for (const r of auditRows) await admin.collection("audit_logs").delete(r.id);
  for (const key of ["rfq", "quotation", "supplier"]) {
    const seq = await admin.collection("number_sequences").getFirstListItem(`key="${key}"`);
    await admin.collection("number_sequences").update(seq.id, { next_value: 1 });
  }
}

async function seedSourcing(cats) {
  const pm = await as("procurement@dnr-hr.rw");
  const suppliers = [];
  for (const [i, [name, catNames, supplier_type]] of SUPPLIERS.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14);
    const created = await pm.collection("suppliers").create({
      name, supplier_type, categories: catNames.map((c) => cats[c].id),
      registration_number: `RDB-${int(100000, 999999)}`, tin: String(100000000 + i * 7919 + int(1, 999)),
      vat_number: supplier_type === "company" ? `VAT${int(100000, 999999)}` : "",
      country: "Rwanda", province: pick(["Kigali City", "Kigali City", "Northern", "Southern", "Eastern", "Western"]),
      district: pick(["Gasabo", "Kicukiro", "Nyarugenge", "Musanze", "Huye"]), address: `KN ${int(1, 99)} St, Kigali`,
      email: `sales@${slug}.rw`, phone: `+25078${int(1000000, 9999999)}`, website: supplier_type === "company" ? `https://${slug}.rw` : "",
      payment_terms: pick(["30 days", "30 days", "15 days", "50% advance, 50% on delivery"]), currency: "RWF",
      bank_name: pick(["Bank of Kigali", "Equity Bank", "I&M Bank", "BPR Bank"]), bank_branch: "Kigali main",
      bank_account_name: name, bank_account_number: `${int(10000000, 99999999)}${int(10, 99)}`,
    });
    // Existing vendors migrated from the paper register are activated by the administrator; new ones go through onboarding approval.
    const s = await admin.collection("suppliers").update(created.id, { status: i === 13 ? "inactive" : "active", approved_at: new Date().toISOString().replace("T", " ") });
    suppliers.push({ ...s, catNames });
    await pm.collection("supplier_contacts").create({ supplier: s.id, name: `${pick(["Eric", "Grace", "Patrick", "Diane", "Olivier"])} ${pick(["Mugisha", "Uwase", "Habimana", "Ingabire"])}`, position: "Sales manager", email: `sales@${slug}.rw`, phone: s.phone, is_primary: true });
    // Tax clearance: some valid, some expiring within 30 days, one expired — to exercise expiry alerts.
    const expiryOffset = i % 5 === 0 ? int(5, 25) : i === 3 ? -12 : int(60, 300);
    await pm.collection("supplier_documents").create({ supplier: s.id, document_type: "tax_certificate", document_number: `RRA-TC-${int(10000, 99999)}`, issue_date: inDays(expiryOffset - 365), expiry_date: inDays(expiryOffset) });
    await pm.collection("supplier_documents").create({ supplier: s.id, document_type: "registration_certificate", document_number: s.registration_number, issue_date: inDays(-int(400, 2000)) });
    if (i < 9) {
      const sc = () => int(3, 5);
      await pm.collection("supplier_evaluations").create({ supplier: s.id, period: `${new Date().getFullYear()} Q${Math.max(1, Math.ceil((new Date().getMonth() + 1) / 3) - 1)}`, quality: sc(), delivery: int(2, 5), price: sc(), compliance: sc(), responsiveness: int(2, 5), contract_compliance: sc(), comments: pick(["Reliable, good after-sales support.", "Occasional delivery delays.", "Competitive pricing.", "Documents always complete."]) });
    }
  }

  // RFQs from approved requisitions (skip the ones only one supplier can serve).
  const approved = await admin.collection("purchase_requisitions").getFullList({ filter: `status="approved"`, expand: "category", sort: "number" });
  const plan = ["award", "award_not_lowest", "open", "award", "closed", "award"];
  let made = 0;
  for (const req of approved) {
    const eligible = suppliers.filter((s) => s.status === "active" && s.categories.includes(req.category));
    if (eligible.length < 2 || made >= plan.length) continue;
    const mode = plan[made++];
    const invited = eligible.slice(0, 3).map((s) => s.id);
    const rfq = await pm.send(`/api/dnr/requisitions/${req.id}/create-rfq`, { method: "POST", body: { suppliers: invited, closing_date: inDays(10) } });
    if (mode === "draft") continue;
    await pm.send(`/api/dnr/rfqs/${rfq.id}/send`, { method: "POST" });
    const full = await pm.collection("rfqs").getOne(rfq.id);
    const quotes = [];
    for (const [k, sid] of invited.entries()) {
      if (mode === "open" && k === 2) break; // one supplier has not answered yet
      const factor = [0.92, 1.0, 1.08][k] * (0.95 + rand() * 0.1);
      const est = Object.fromEntries((req.items || []).map((it) => [it.line, it.unit_cost]));
      const q = await pm.collection("quotations").create({
        rfq: rfq.id, supplier: sid, supplier_reference: `Q-${int(1000, 9999)}`, validity_date: inDays(45),
        items: full.items.map((it) => ({ line: it.line, unit_price: Math.round((est[it.line] || 100000) * factor / 100) * 100, discount_pct: k === 1 ? 5 : 0, tax_rate: 18 })),
        delivery_cost: [0, 25000, 15000][k], delivery_days: [14, 7, 10][k], payment_terms: ["30 days", "30 days", "50% advance"][k],
        warranty: ["12 months", "24 months", "12 months"][k], technical_compliance: k === 2 && mode === "award" ? "partial" : "compliant",
        scores: { price: [9, 8, 7][k], quality: [7, 9, 7][k], delivery: [6, 9, 8][k], warranty: [6, 9, 6][k], payment: [8, 8, 5][k], compliance: [9, 9, 6][k] },
      });
      quotes.push(q);
    }
    if (mode === "open") continue;
    await pm.send(`/api/dnr/rfqs/${rfq.id}/close`, { method: "POST" });
    if (mode === "closed") continue;
    const sorted = [...quotes].sort((a, b) => a.grand_total - b.grand_total);
    const winner = mode === "award_not_lowest" ? sorted[1] : sorted[0];
    const reason = mode === "award_not_lowest"
      ? "Selected the second-lowest offer: 24-month warranty and 7-day delivery outweigh the small price difference; full technical compliance."
      : "Lowest evaluated price with full technical compliance and acceptable delivery time.";
    await pm.send(`/api/dnr/rfqs/${rfq.id}/award`, { method: "POST", body: { quotation: winner.id, reason } });
  }
  console.log(`  ✓ sourcing: ${suppliers.length} suppliers (contacts, documents, evaluations), ${made} RFQs with quotations`);
}

// ------------------------------------------------------------------ purchase orders, receiving, inventory
async function wipeFinance() {
  // Budget effects of the purchasing documents that are about to be regenerated.
  for (const r of await admin.collection("budget_ledger").getFullList({ fields: "id", filter: 'source_type = "purchase_order" || source_type = "supplier_invoice" || source_type = "payment_voucher"' })) await admin.collection("budget_ledger").delete(r.id);
  for (const r of await admin.collection("budget_overrides").getFullList({ fields: "id", filter: 'document_type = "purchase_requisition" || document_type = "purchase_order" || document_type = "payment_voucher"' })) await admin.collection("budget_overrides").delete(r.id);
  for (const a of await admin.collection("approval_requests").getFullList({ fields: "id", filter: 'document_type = "payment_voucher"' })) await admin.collection("approval_requests").delete(a.id).catch(() => null);
  for (const col of ["payments", "payment_vouchers", "supplier_invoices"]) {
    const rows = await admin.collection(col).getFullList({ fields: "id" });
    for (const r of rows) await admin.collection(col).delete(r.id);
  }
  for (const key of ["invoice", "payment", "payment_voucher"]) {
    const seq = await admin.collection("number_sequences").getFirstListItem(`key="${key}"`).catch(() => null);
    if (seq) await admin.collection("number_sequences").update(seq.id, { next_value: 1 });
  }
  const audit = await admin.collection("audit_logs").getFullList({ fields: "id", filter: `collection_name="supplier_invoices" || collection_name="payment_vouchers"` });
  for (const r of audit) await admin.collection("audit_logs").delete(r.id);
}

// Supplier invoices matched against POs (three-way match), their approval, and payment vouchers
// (Accountant prepares → DAF / SG approve → Cashier executes).
async function seedFinance() {
  const acc = await as("accountant@dnr-hr.rw");
  const cashier = await as("cashier@dnr-hr.rw"); // only the Cashier executes payments
  const roleId = async (n) => (await admin.collection("roles").getFirstListItem(`name="${n}"`)).id;
  for (const w of await admin.collection("approval_workflows").getFullList({ filter: `document_type="supplier_invoice"` })) {
    if (w.name !== "Supplier invoice approval") await admin.collection("approval_workflows").delete(w.id).catch(() => null);
  }
  await upsert("approval_workflows", `name="Supplier invoice approval" && document_type="supplier_invoice"`, {
    name: "Supplier invoice approval", document_type: "supplier_invoice", active: true, priority: 10, min_amount: 0, max_amount: 0,
    description: "After the three-way match: DAF, then the Secretary General above the DAF limit. The person who recorded the invoice cannot approve it.",
    departments: [], categories: [], branches: [], funding_sources: [], allow_self_approval: false, overdue_hours: 48,
    steps: [
      { name: "Director of Finance approval", approver_type: "role", role: await roleId(ROLE.DAF) },
      { name: "Secretary General approval (above DAF limit)", approver_type: "role", role: await roleId(ROLE.SG), above_limit_of: await roleId(ROLE.DAF), skip_if_already_approved: true },
    ],
  });
  for (const w of await admin.collection("approval_workflows").getFullList({ filter: `document_type="payment_voucher"` })) {
    if (w.name !== "Payment voucher approval") await admin.collection("approval_workflows").delete(w.id).catch(() => null);
  }
  await upsert("approval_workflows", `name="Payment voucher approval" && document_type="payment_voucher"`, {
    name: "Payment voucher approval", document_type: "payment_voucher", active: true, priority: 10, min_amount: 0, max_amount: 0,
    description: "Prepared by the Accountant; the DAF approves; the Secretary General also approves above the DAF voucher limit. The Cashier then executes the payment.",
    departments: [], categories: [], branches: [], funding_sources: [], allow_self_approval: false, overdue_hours: 48,
    steps: [
      { name: "Director of Finance approval", approver_type: "role", role: await roleId(ROLE.DAF) },
      { name: "Secretary General approval (above the DAF limit)", approver_type: "role", role: await roleId(ROLE.SG), above_limit_of: await roleId(ROLE.DAF), skip_if_already_approved: true },
    ],
  });
  const voucherFor = async (inv, whtCode) => {
    const v = await acc.collection("payment_vouchers").create({ voucher_type: "invoice", supplier: inv.supplier, lines: [{ invoice: inv.id }], wht_code: whtCode, notes: "Supporting documents: invoice, goods received note, purchase order." });
    const sub = await acc.send(`/api/ims/vouchers/${v.id}/submit`, { method: "POST" });
    await approveAll(sub.approval);
    return v;
  };
  const received = await admin.collection("purchase_orders").getFullList({ filter: `status="fully_received" || status="partially_received"`, sort: "number" });
  let invoices = 0, paid = 0, exceptions = 0, toPay = 0;
  for (const [i, po] of received.entries()) {
    const lines = po.items.filter((l) => l.received_qty > 0).map((l) => ({
      line: l.line, quantity: l.received_qty,
      // second order: the supplier invoiced one line 8% above the PO price → three-way match exception
      unit_price: i === 1 && l.line === 1 ? Math.round((l.net / l.quantity) * 1.08) : Math.round((l.net / l.quantity) * 100) / 100,
      tax_rate: l.tax_rate,
    }));
    if (!lines.length) continue;
    const inv = await acc.collection("supplier_invoices").create({
      purchase_order: po.id, supplier_invoice_number: `FAC-${po.number.slice(-4)}-${100 + i}`, invoice_date: inDays(-int(1, 6)), due_date: inDays(int(10, 30)), items: lines,
      notes: "Received by email, original filed in finance.",
    });
    invoices++;
    if (inv.status === "exception") { exceptions++; continue; }
    const sub = await acc.send(`/api/dnr/invoices/${inv.id}/submit`, { method: "POST" });
    await approveAll(sub.id ? (await admin.collection("supplier_invoices").getOne(inv.id)).approval : sub.approval);
    const fresh = await admin.collection("supplier_invoices").getOne(inv.id);
    if (fresh.status !== "approved") continue;
    // Public institutions withhold tax on goods and services (rate from Setup → Tax & statutory rates).
    const v = await voucherFor(fresh, "WHT_PUBLIC_TENDER");
    if (po.status === "fully_received") {
      await cashier.send(`/api/ims/vouchers/${v.id}/pay`, { method: "POST", body: { method: "bank_transfer", reference: `BK-TRF-${int(100000, 999999)}`, payment_date: inDays(0) } });
      paid++;
    } else toPay++;
  }
  // A service paid without a purchase order to a registered supplier: approved, waiting for the Cashier.
  const repairs = await admin.collection("budget_lines").getFirstListItem('code ~ "FIN-5205" && status = "active"').catch(() => null);
  const servicer = (await admin.collection("suppliers").getFullList({ filter: 'status = "active" && bank_account_number != "" && bank_change_pending = false', sort: "created" }))[3];
  if (repairs && servicer) {
    const v = await acc.collection("payment_vouchers").create({
      voucher_type: "direct", supplier: servicer.id, budget_line: repairs.id, gross_amount: 850000, wht_code: "WHT_PUBLIC_TENDER",
      description: "Generator servicing and repair — Head Office, October 2026", notes: "Job card JC-2026-114 signed by the Store & Asset Officer.",
    });
    const sub = await acc.send(`/api/ims/vouchers/${v.id}/submit`, { method: "POST" });
    await approveAll(sub.approval);
    toPay++;
  }
  // A direct expense without a purchase order (utility bill), waiting for the DAF.
  const fin = await admin.collection("budget_lines").getFirstListItem('code ~ "FIN-5203" && status = "active"').catch(() => null);
  if (fin) {
    const direct = await acc.collection("payment_vouchers").create({
      voucher_type: "direct", payee_name: "MTN Rwanda", budget_line: fin.id, gross_amount: 450000, wht_code: "",
      description: "Internet and telephone — Head Office, October 2026", payee_bank: { bank_name: "Bank of Kigali", bank_account_name: "MTN Rwandacell PLC", bank_account_number: "000400012345" },
      notes: "Monthly bill, account 7700112.",
    });
    await acc.send(`/api/ims/vouchers/${direct.id}/submit`, { method: "POST" });
  }
  console.log(`  ✓ finance: ${invoices} invoices (${exceptions} match exception), vouchers: ${paid} paid, ${toPay} approved to pay, 1 direct expense waiting for approval`);
}

async function wipePurchasing() {
  const procured = await admin.collection("assets").getFullList({ fields: "id", filter: `purchase_order != ""` });
  for (const r of procured) await admin.collection("assets").delete(r.id);
  for (const col of ["stock_movements", "stock_levels", "goods_receipts", "purchase_orders", "inventory_items", "warehouses"]) {
    const rows = await admin.collection(col).getFullList({ fields: "id" });
    for (const r of rows) await admin.collection(col).delete(r.id);
  }
  for (const key of ["purchase_order", "goods_receipt", "asset", "inventory_item"]) {
    const seq = await admin.collection("number_sequences").getFirstListItem(`key="${key}"`).catch(() => null);
    if (seq) await admin.collection("number_sequences").update(seq.id, { next_value: 1 });
  }
  const audit = await admin.collection("audit_logs").getFullList({ fields: "id", filter: `collection_name="purchase_orders" || collection_name="inventory_items"` });
  for (const r of audit) await admin.collection("audit_logs").delete(r.id);
}

async function approveAll(approvalId) {
  for (let i = 0; i < 5; i++) {
    const a = await admin.collection("approval_requests").getOne(approvalId);
    if (a.status !== "pending") return a.status;
    const approver = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    await (await as(approver.email)).send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Budget available." } });
  }
}

async function seedPurchasing() {
  const pm = await as("procurement@dnr-hr.rw");
  const stores = await as("stores@dnr-hr.rw");
  const storesUser = await admin.collection("users").getFirstListItem(`email="stores@dnr-hr.rw"`);
  const hq = await admin.collection("branches").getFullList().then((b) => b.find((x) => /kigali|head/i.test(x.name)) || b[0]);
  const main = await stores.collection("warehouses").create({ name: "Main store — Kigali HQ", code: "WH-KGL", location: "Ground floor, KG 7 Ave", branch: hq.id, manager: storesUser.id, active: true });
  await stores.collection("warehouses").create({ name: "Musanze branch store", code: "WH-MSZ", location: "Musanze branch", active: true, manager: storesUser.id });

  const awarded = await admin.collection("rfqs").getFullList({ filter: `status="awarded"`, sort: "number" });
  const pos = [];
  for (const rfq of awarded) {
    const po = await pm.send(`/api/dnr/purchase-orders/from-rfq/${rfq.id}`, { method: "POST" });
    pos.push(po);
  }
  // Scenario per PO: 0 → fully received, 1 → partial with a rejection, 2 → sent & acknowledged, 3 → pending approval
  for (const [i, po] of pos.entries()) {
    const sub = await submitWithBudget(pm, `/api/dnr/purchase-orders/${po.id}/submit`, "purchase_order", po.id, "Order above the line after quotations; shortfall to be covered by the supplementary budget.");
    if (i === 3) continue;
    await approveAll(sub.approval);
    await pm.send(`/api/dnr/purchase-orders/${po.id}/send`, { method: "POST" });
    await pm.send(`/api/dnr/purchase-orders/${po.id}/acknowledge`, { method: "POST" });
    if (i === 2) continue;
    const full = await admin.collection("purchase_orders").getOne(po.id);
    const items = full.items.map((l) => {
      if (i === 0) {
        return { line: l.line, received: l.quantity, rejected: 0, condition: "good", batch: l.line_type === "goods" ? `B${new Date().getFullYear()}-${l.line}` : "",
          serial_numbers: l.line_type === "asset" ? Array.from({ length: l.quantity }, (_, k) => `SN-${full.number.slice(-4)}-${l.line}${String(k + 1).padStart(3, "0")}`) : [] };
      }
      const half = Math.max(1, Math.floor(l.quantity / 2));
      return { line: l.line, received: half + 1 <= l.quantity ? half + 1 : half, rejected: half + 1 <= l.quantity ? 1 : 0, rejection_reason: "Damaged packaging on delivery", condition: "good" };
    });
    await stores.send(`/api/dnr/purchase-orders/${po.id}/receive`, { method: "POST", body: { warehouse: main.id, delivery_note_number: `DN-${Math.floor(rand() * 90000 + 10000)}`, items } });
  }
  // A direct purchase on a remaining approved requisition (small value, justified).
  const approved = await admin.collection("purchase_requisitions").getFullList({ filter: `status="approved"`, sort: "total" });
  let directCount = 0;
  if (approved[0]) {
    const sup = await admin.collection("suppliers").getFirstListItem(`status="active"`);
    await pm.send(`/api/dnr/purchase-orders/direct/${approved[0].id}`, { method: "POST", body: { supplier: sup.id, justification: "Single local distributor holds stock; value is below the competitive quotation threshold." } });
    directCount = 1;
  }
  const assets = await admin.collection("assets").getList(1, 1, { filter: `purchase_order != ""` });
  const items = await admin.collection("inventory_items").getList(1, 1);
  console.log(`  ✓ purchasing: ${pos.length} POs from RFQs + ${directCount} direct PO, 2 warehouses, ${items.totalItems} stock items, ${assets.totalItems} assets created from receipts`);
}

async function main() {
  console.log(`🛒 Seeding procurement demo data into ${PB_URL}`);
  await admin.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  const roleIds = await setupRoles();
  const { users } = await setupPeople(roleIds);
  const cats = await setupReference(roleIds);
  const units = await admin.collection("units_of_measure").getFullList();
  await wipeFinance(); // invoices reference POs
  await wipePurchasing(); // POs reference RFQs and requisitions
  await wipeSourcing(); // RFQs reference requisitions, so clear them before regenerating requisitions
  await seedRequisitions(users, cats, units);
  await seedSourcing(cats);
  await seedPurchasing();
  await seedFinance();
  console.log("✅ Procurement demo ready.");
}

main().catch((e) => {
  console.error("\n❌ Procurement seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
