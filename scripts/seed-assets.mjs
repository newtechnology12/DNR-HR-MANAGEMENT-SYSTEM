#!/usr/bin/env node
/**
 * RALGA IMS — Step 7 demo data: fixed assets and depreciation (run by `npm run seed:ralga`, after seed-treasury.mjs).
 *
 *  - asset categories with their depreciation policy and GL accounts (set by the DAF); procurement categories point to them
 *  - the opening register at go-live (1 July 2026): vehicles, building fit-out, solar, generator, ICT, furniture,
 *    with the accumulated depreciation at that date — one opening journal
 *  - the laptops received on a GRN capitalised by the Store & Asset Officer (one left to complete)
 *  - custodian changes, a transfer approved and one waiting for the DAF, maintenance with services due
 *  - depreciation for July, August and September posted (Accountant → DAF); October waiting for the DAF
 *  - the pool car sold at auction (Store → DAF → SG, posted with its gain); obsolete desktops waiting for the SG;
 *    a damaged tablet's write-off in draft
 *  - the first-quarter count (one projector missing, one tablet damaged, an air conditioner found elsewhere)
 *  - staff equipment requests (by type of equipment)
 *
 * Everything goes THROUGH THE API as the real people (Store & Asset Officer, Accountant, DAF, SG, staff).
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}). Set ALLOW_REMOTE_SEED=true to override.`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);

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
const post = async (email, path, body) => (await as(email)).send(path, { method: "POST", body });
async function approveAll(approvalId, comment) {
  for (let i = 0; i < 6; i++) {
    const a = await admin.collection("approval_requests").getOne(approvalId);
    if (a.status !== "pending") return a.status;
    const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
    await post(who.email, `/api/dnr/approvals/${a.id}/act`, { action: "approve", comment });
  }
  return "pending";
}
async function approveOnce(approvalId, comment) {
  const a = await admin.collection("approval_requests").getOne(approvalId);
  const who = await admin.collection("users").getOne(a.pending_approvers.split(",")[0]);
  await post(who.email, `/api/dnr/approvals/${a.id}/act`, { action: "approve", comment });
}
async function wipe(collection, filter = "") {
  const rows = await admin.collection(collection).getFullList({ filter, fields: "id", batch: 500 });
  for (const r of rows) await admin.collection(collection).delete(r.id);
  return rows.length;
}

// ------------------------------------------------------------------ categories
// [code, name, method, life (months), residual %, threshold, cost, accumulated, expense, types]
const CATEGORIES = [
  ["ICT", "ICT equipment", "straight_line", 48, 0, 300000, "1240", "1294", "5404", ["Laptop", "Desktop computer", "Server", "Network equipment", "Printer", "Projector", "Tablet", "Video conferencing", "UPS"]],
  ["OFE", "Office equipment", "straight_line", 60, 0, 300000, "1250", "1295", "5405", ["Photocopier", "Generator", "Air conditioner", "Safe"]],
  ["FUR", "Furniture and fittings", "straight_line", 96, 0, 150000, "1230", "1293", "5403", ["Desk and chair set", "Workstations", "Boardroom set", "Training room set", "Cabinets"]],
  ["VEH", "Motor vehicles", "straight_line", 60, 10, 1000000, "1220", "1292", "5402", ["Four-wheel drive", "Pick-up", "Saloon car", "Motorcycle"]],
  ["BLD", "Buildings and improvements", "straight_line", 240, 0, 5000000, "1210", "1291", "5401", ["Office fit-out", "Solar installation"]],
];
// procurement category → asset category
const PROCUREMENT = { ITE: "ICT", FUR: "FUR", VEH: "VEH", CON: "BLD" };

// ------------------------------------------------------------------ the opening register (go-live 1 July 2026)
// [category, type, name, serial, purchased, cost, department, location, custodian email, funding, project, condition]
const HQ = "HQ Kigali, KG 7 Ave";
const REGISTER = [
  ["VEH", "Four-wheel drive", "Toyota Land Cruiser Prado TX 2.8 (RAD 412 F)", "JTEBH3FJ10K231457", "2021-08-16", 78500000, "OSG", "HQ parking", "director@dnr-hr.rw", "MC", "", "good"],
  ["VEH", "Pick-up", "Toyota Hilux double cabin 2.4 GD-6 (RAE 118 K)", "AHTKB8CD402917745", "2022-11-03", 52800000, "CBD", "HQ parking", "hod@dnr-hr.rw", "DP-CB", "CB-01", "good"],
  ["VEH", "Saloon car", "Toyota Corolla 1.8 pool car (RAC 905 B)", "JTDBR32E720118846", "2019-02-11", 28600000, "FIN", "HQ parking", "", "MC", "", "fair"],
  ["VEH", "Motorcycle", "Yamaha AG100 motorcycle (RAB 233 M)", "9C6KE1240K0011734", "2020-06-20", 3250000, "APR", "HQ parking", "paul.mugabo11@dnr-hr.rw", "MC", "", "fair"],
  ["VEH", "Motorcycle", "Yamaha AG100 motorcycle (RAB 234 M)", "9C6KE1240K0011735", "2020-06-20", 3250000, "PME", "HQ parking", "moses.ingabire.24@dnr-hr.rw", "MC", "", "fair"],
  ["BLD", "Office fit-out", "Head office fit-out: partitions, wiring and floors 2–3", "", "2021-05-28", 86400000, "FIN", HQ, "", "MC", "", "good"],
  ["BLD", "Solar installation", "Solar PV system 30 kWp with lithium batteries", "SPV-30-2023-118", "2023-09-12", 18900000, "FIN", "HQ roof", "", "MC", "", "new"],
  ["OFE", "Generator", "Cummins C60D5 generator 60 kVA", "C21K004177", "2020-03-10", 24500000, "FIN", "HQ generator room", "", "MC", "", "good"],
  ["OFE", "Photocopier", "Canon imageRUNNER ADVANCE DX C5840i", "3DW01845", "2021-10-05", 9800000, "FIN", "HQ 1st floor, print room", "sandrine.uwase2@dnr-hr.rw", "MC", "", "good"],
  ["OFE", "Photocopier", "Canon imageRUNNER ADVANCE DX C3826i", "2PX09917", "2023-02-20", 6450000, "COM", "HQ 2nd floor, communication office", "claudine.mukamana.5@dnr-hr.rw", "MC", "", "good"],
  ["OFE", "Air conditioner", "Daikin split air conditioner 24,000 BTU — server room", "DK24-22-0411", "2022-05-16", 1480000, "ICT", "HQ server room", "", "MC", "", "good"],
  ["OFE", "Air conditioner", "Daikin split air conditioner 24,000 BTU — boardroom", "DK24-22-0412", "2022-05-16", 1480000, "OSG", "HQ 3rd floor, boardroom", "", "MC", "", "good"],
  ["OFE", "Air conditioner", "Daikin split air conditioner 24,000 BTU — SG office", "DK24-22-0413", "2022-05-16", 1480000, "OSG", "HQ 3rd floor, SG office", "", "MC", "", "good"],
  ["OFE", "Air conditioner", "Daikin split air conditioner 24,000 BTU — training room", "DK24-22-0414", "2022-05-16", 1480000, "CBD", "HQ ground floor, training room", "", "MC", "", "good"],
  ["OFE", "Safe", "Chubb fireproof safe (cash office)", "CHB-FS-7731", "2019-07-01", 2350000, "FIN", "HQ 1st floor, cash office", "cashier@dnr-hr.rw", "MC", "", "good"],
  ["ICT", "Server", "Dell PowerEdge R450 server", "DL-R450-7HX2Q3", "2023-04-18", 14600000, "ICT", "HQ server room", "aline.uwimana.1@dnr-hr.rw", "MC", "", "good"],
  ["ICT", "Network equipment", "Fortinet FortiGate 100F firewall", "FG100FTK23001874", "2023-04-18", 6850000, "ICT", "HQ server room", "eric.tuyishime.2@dnr-hr.rw", "MC", "", "good"],
  ["ICT", "Network equipment", "Cisco Catalyst 9200 48-port switch (1st floor)", "FOC2236X1QK", "2022-09-07", 3900000, "ICT", "HQ 1st floor, network cabinet", "", "MC", "", "good"],
  ["ICT", "Network equipment", "Cisco Catalyst 9200 48-port switch (3rd floor)", "FOC2236X1QM", "2022-09-07", 3900000, "ICT", "HQ 3rd floor, network cabinet", "", "MC", "", "good"],
  ["ICT", "UPS", "APC Smart-UPS SRT 10 kVA", "AS2304110278", "2023-04-18", 2850000, "ICT", "HQ server room", "", "MC", "", "good"],
  ["ICT", "Video conferencing", "Poly Studio X50 video conferencing kit", "8L23B4F21C", "2024-02-14", 4250000, "OSG", "HQ 3rd floor, boardroom", "valerie.kwizera0@dnr-hr.rw", "MC", "", "new"],
  ["ICT", "Projector", "Epson EB-L630U laser projector — training room", "X5HG2200417", "2022-08-22", 1850000, "CBD", "HQ ground floor, training room", "employee@dnr-hr.rw", "MC", "", "good"],
  ["ICT", "Projector", "Epson EB-L630U laser projector — boardroom", "X5HG2200418", "2022-08-22", 1850000, "OSG", "HQ 3rd floor, boardroom", "", "MC", "", "good"],
  ["ICT", "Projector", "Epson EB-L630U laser projector — policy meeting room", "X5HG2200419", "2022-08-22", 1850000, "APR", "HQ 2nd floor, meeting room", "", "MC", "", "good"],
  ["ICT", "Printer", "HP LaserJet Enterprise MFP M528 — finance", "PHBLR29011", "2022-01-17", 2250000, "FIN", "HQ 1st floor, finance office", "", "MC", "", "good"],
  ["ICT", "Printer", "HP LaserJet Enterprise MFP M528 — human resources", "PHBLR29012", "2022-01-17", 2250000, "HRM", "HQ 1st floor, HR office", "", "MC", "", "good"],
  ["ICT", "Printer", "HP LaserJet Enterprise MFP M528 — procurement", "PHBLR29013", "2022-01-17", 2250000, "PRC", "HQ 1st floor, procurement office", "", "MC", "", "fair"],
  ["ICT", "Desktop computer", "Dell OptiPlex 7010 desktop — testing room 1", "7010-CN0F2K1", "2019-08-12", 980000, "RCS", "HQ ground floor, testing room", "", "MC", "", "poor"],
  ["ICT", "Desktop computer", "Dell OptiPlex 7010 desktop — testing room 2", "7010-CN0F2K2", "2019-08-12", 980000, "RCS", "HQ ground floor, testing room", "", "MC", "", "poor"],
  ["ICT", "Desktop computer", "Dell OptiPlex 7010 desktop — testing room 3", "7010-CN0F2K3", "2019-08-12", 980000, "RCS", "HQ ground floor, testing room", "", "MC", "", "fair"],
  ["ICT", "Tablet", "Samsung Galaxy Tab S9 — field data collection 1", "R52W40AB1PL", "2024-03-04", 720000, "CBD", "HQ 2nd floor, capacity building", "david.uwimana7@dnr-hr.rw", "DP-CB", "CB-01", "good"],
  ["ICT", "Tablet", "Samsung Galaxy Tab S9 — field data collection 2", "R52W40AB1PM", "2024-03-04", 720000, "CBD", "HQ 2nd floor, capacity building", "denise.tuyishime.17@dnr-hr.rw", "DP-CB", "CB-01", "good"],
  ["ICT", "Tablet", "Samsung Galaxy Tab S9 — field data collection 3", "R52W40AB1PN", "2024-03-04", 720000, "CBD", "HQ ground floor, store", "", "DP-CB", "CB-01", "good", "in_stock"],
  ["ICT", "Tablet", "Samsung Galaxy Tab S9 — field data collection 4", "R52W40AB1PP", "2024-03-04", 720000, "CBD", "HQ ground floor, store", "", "DP-CB", "CB-01", "good", "in_stock"],
  // laptops: [custodian, department, purchased, model, cost, funding, project]
  ...[
    ["finance@dnr-hr.rw", "FIN", "2023-03-15", "Dell Latitude 7440", 1650000],
    ["accountant@dnr-hr.rw", "FIN", "2022-06-09", "Dell Latitude 5430", 1250000],
    ["budget@dnr-hr.rw", "FIN", "2024-01-22", "Dell Latitude 5440", 1320000],
    ["cashier@dnr-hr.rw", "FIN", "2023-03-15", "Dell Latitude 5440", 1290000],
    ["stores@dnr-hr.rw", "FIN", "2025-02-10", "HP EliteBook 840 G10", 1480000],
    ["hr@dnr-hr.rw", "HRM", "2022-06-09", "Dell Latitude 5430", 1250000],
    ["procurement@dnr-hr.rw", "PRC", "2023-03-15", "Dell Latitude 5440", 1290000],
    ["aline.uwimana.1@dnr-hr.rw", "ICT", "2024-01-22", "Dell Precision 3581", 2150000],
    ["eric.tuyishime.2@dnr-hr.rw", "ICT", "2024-01-22", "Dell Latitude 7440", 1650000],
    ["director@dnr-hr.rw", "OSG", "2025-02-10", "HP EliteBook 1040 G11", 2350000],
    ["valerie.kwizera0@dnr-hr.rw", "OSG", "2022-06-09", "Dell Latitude 5430", 1250000],
    ["hod@dnr-hr.rw", "CBD", "2023-09-04", "HP EliteBook 840 G10", 1480000, "DP-CB", "CB-01"],
    ["employee@dnr-hr.rw", "CBD", "2023-09-04", "HP EliteBook 840 G10", 1480000, "DP-CB", "CB-01"],
    ["david.uwimana7@dnr-hr.rw", "CBD", "2023-09-04", "HP EliteBook 840 G10", 1480000, "DP-CB", "CB-01"],
    ["marie.nsengiyumva10@dnr-hr.rw", "APR", "2022-06-09", "Dell Latitude 7430", 1590000],
    ["michel.umuhoza12@dnr-hr.rw", "APR", "2024-05-13", "Dell Latitude 5440", 1320000, "DP-LED", "LED-01"],
    ["auditor@dnr-hr.rw", "IAU", "2024-01-22", "Dell Latitude 5440", 1320000],
    ["emmanuel.ndayisaba.6@dnr-hr.rw", "IAU", "2022-06-09", "Dell Latitude 7430", 1590000],
    ["diane.nshimiyimana.3@dnr-hr.rw", "COM", "2023-03-15", "Apple MacBook Pro 14 (M2 Pro)", 2480000],
    ["olivier.iradukunda.8@dnr-hr.rw", "LEG", "2022-06-09", "Dell Latitude 5430", 1250000],
    ["alexandre.nshimiyimana14@dnr-hr.rw", "PME", "2025-02-10", "HP EliteBook 840 G10", 1480000],
    ["claire.kwizera8@dnr-hr.rw", "RCS", "2023-03-15", "Dell Latitude 5440", 1290000],
  ].map(([email, dept, bought, model, cost, fund, project], i) => ["ICT", "Laptop", `${model} laptop`, `LT${bought.replace(/-/g, "").slice(2)}${String(i + 11).padStart(3, "0")}`, bought, cost, dept, `HQ — ${dept === "OSG" ? "3rd" : dept === "FIN" || dept === "HRM" || dept === "PRC" ? "1st" : "2nd"} floor`, email, fund || "MC", project || "", "good"]),
  ["FUR", "Boardroom set", "Boardroom table with 16 chairs", "", "2019-04-23", 7850000, "OSG", "HQ 3rd floor, boardroom", "", "MC", "", "good"],
  ["FUR", "Desk and chair set", "Executive desk, chair and side cabinet — SG office", "", "2021-06-14", 1650000, "OSG", "HQ 3rd floor, SG office", "director@dnr-hr.rw", "MC", "", "good"],
  ["FUR", "Desk and chair set", "Executive desk, chair and side cabinet — DSG office", "", "2021-06-14", 1650000, "OSG", "HQ 3rd floor, DSG office", "chantal.ingabire.9@dnr-hr.rw", "MC", "", "good"],
  ["FUR", "Desk and chair set", "Executive desk, chair and side cabinet — DAF office", "", "2021-06-14", 1650000, "FIN", "HQ 1st floor, DAF office", "finance@dnr-hr.rw", "MC", "", "good"],
  ["FUR", "Desk and chair set", "Executive desk, chair and side cabinet — Head of Internal Audit", "", "2021-06-14", 1650000, "IAU", "HQ 2nd floor, internal audit", "emmanuel.ndayisaba.6@dnr-hr.rw", "MC", "", "good"],
  ["FUR", "Workstations", "Open-plan workstations with chairs (8) — finance", "", "2021-06-14", 4960000, "FIN", "HQ 1st floor, finance office", "", "MC", "", "good"],
  ["FUR", "Workstations", "Open-plan workstations with chairs (6) — advocacy and policy", "", "2021-06-14", 3720000, "APR", "HQ 2nd floor, advocacy and policy", "", "MC", "", "good"],
  ["FUR", "Workstations", "Open-plan workstations with chairs (6) — capacity building", "", "2021-06-14", 3720000, "CBD", "HQ 2nd floor, capacity building", "", "MC", "", "good"],
  ["FUR", "Training room set", "Training room tables with 40 chairs", "", "2022-08-22", 5400000, "CBD", "HQ ground floor, training room", "", "MC", "", "good"],
  ["FUR", "Cabinets", "Steel filing cabinets (10) — registry", "", "2020-01-20", 2150000, "FIN", "HQ ground floor, registry", "", "MC", "", "fair"],
];

const GO_LIVE = "2026-07-01";
const mIndex = (y, m) => y * 12 + (m - 1);
const mOf = (d) => mIndex(Number(d.slice(0, 4)), Number(d.slice(5, 7)));
/** Straight-line depreciation charged up to the month before go-live, exactly as the server charges it. */
function accumulatedAtGoLive(purchased, cost, life, residualPct) {
  const residual = Math.round((cost * residualPct) / 100);
  const start = mOf(purchased) + 1;
  const months = Math.max(0, mOf(GO_LIVE) - start);
  if (months >= life) return cost - residual;
  return months * Math.round((cost - residual) / life);
}

async function ensureWorkflows() {
  const role = async (code) => (await admin.collection("roles").getFirstListItem(`code = "${code}"`)).id;
  const daf = await role("DAF");
  const sg = await role("SG");
  const flows = [
    ["asset_transfer", "Asset transfer approval", "Requested by the Store & Asset Officer or the head of the department holding the asset; approved by the Director of Finance.", [{ name: "Director of Finance approval", approver_type: "role", role: daf }]],
    ["asset_disposal", "Asset disposal approval", "Prepared by the Store & Asset Officer with the disposal committee's minutes; reviewed by the Director of Finance and approved by the Secretary General.", [
      { name: "Director of Finance review", approver_type: "role", role: daf },
      { name: "Secretary General approval", approver_type: "role", role: sg },
    ]],
    ["depreciation_run", "Monthly depreciation approval", "Calculated by the Accountant; approved by the Director of Finance, then posted to the general ledger. Whoever calculated it cannot approve it.", [{ name: "Director of Finance approval", approver_type: "role", role: daf }]],
  ];
  for (const [document_type, name, description, steps] of flows) {
    await wipe("approval_workflows", `document_type = "${document_type}"`);
    await admin.collection("approval_workflows").create({ name, description, document_type, active: true, priority: 10, min_amount: 0, max_amount: 0, allow_self_approval: false, overdue_hours: 72, steps });
  }
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🏷️  Fixed assets: register, depreciation, transfers, disposals, counts");

  // ---- clear earlier runs (the GL lines of asset journals go with their journals)
  for (const c of ["asset_verification_lines", "asset_verifications", "depreciation_lines", "depreciation_runs", "asset_disposals", "asset_maintenance", "asset_movements"]) await wipe(c);
  for (const t of ["asset_transfer", "asset_disposal", "depreciation_run"]) {
    for (const a of await admin.collection("approval_requests").getFullList({ filter: `document_type = "${t}"`, fields: "id" })) {
      await wipe("approval_actions", `approval = "${a.id}"`).catch(() => 0);
      await admin.collection("approval_requests").delete(a.id);
    }
  }
  for (const j of await admin.collection("gl_journals").getFullList({ filter: 'source_type = "asset" || source_type = "asset_opening" || source_type = "asset_disposal" || source_type = "depreciation_run"', fields: "id" })) {
    await wipe("gl_journal_lines", `journal = "${j.id}"`);
    await admin.collection("gl_journals").delete(j.id);
  }
  await wipe("assets_requests");
  await wipe("assets_allocations").catch(() => 0);
  await wipe("assets", 'purchase_order = ""');
  for (const key of ["asset_transfer", "asset_disposal", "depreciation_run", "asset_verification"]) {
    const s = await admin.collection("number_sequences").getFirstListItem(`key = "${key}"`).catch(() => null);
    if (s) await admin.collection("number_sequences").update(s.id, { next_value: 1 });
  }
  await ensureWorkflows();

  // ---- categories (the DAF sets the depreciation policy) and types
  const gl = Object.fromEntries((await admin.collection("gl_accounts").getFullList({ fields: "id,code" })).map((a) => [a.code, a.id]));
  const daf = await as("finance@dnr-hr.rw");
  const cats = {};
  const types = {};
  const old = await admin.collection("assets_categories").getFullList();
  for (const [i, [code, name, method, life, residual, threshold, cost, acc, exp, typeNames]] of CATEGORIES.entries()) {
    const data = { code, name, method, useful_life_months: life, rate: 0, residual_percent: residual, capitalisation_threshold: threshold, asset_account: gl[cost], accumulated_account: gl[acc], expense_account: gl[exp], active: true, sort: i + 1, description: `${name} — straight line over ${life / 12} years${residual ? `, ${residual}% residual value` : ""}` };
    const existing = old.find((c) => c.code === code);
    cats[code] = existing ? await daf.collection("assets_categories").update(existing.id, data) : await daf.collection("assets_categories").create(data);
    for (const t of typeNames) {
      const ex = await admin.collection("assets_types").getFirstListItem(`category = "${cats[code].id}" && name = "${t}"`).catch(() => null);
      types[`${code}|${t}`] = ex || (await admin.collection("assets_types").create({ name: t, description: `${t} (${name})`, category: cats[code].id }));
    }
  }
  // procurement categories point to the register categories; legacy demo categories go
  for (const [pcode, ccode] of Object.entries(PROCUREMENT)) {
    const p = await admin.collection("procurement_categories").getFirstListItem(`code = "${pcode}"`).catch(() => null);
    if (p) await admin.collection("procurement_categories").update(p.id, { asset_category: cats[ccode].id, is_asset: true });
  }
  const received = await admin.collection("assets").getFullList({ filter: 'purchase_order != ""' });
  // (a re-run starts these again from "received")
  for (const a of received) await admin.collection("assets").update(a.id, { category: cats.ICT.id, type: types["ICT|Laptop"].id, capitalised: false, capitalisation_journal: "", accumulated_depreciation: 0, net_book_value: 0, last_depreciated: "", assigned_to: "", status: "in_stock" });
  const keep = new Set(Object.values(cats).map((c) => c.id));
  for (const c of await admin.collection("assets_categories").getFullList()) {
    if (keep.has(c.id)) continue;
    await wipe("assets_types", `category = "${c.id}"`);
    await admin.collection("assets_categories").delete(c.id);
  }
  console.log(`  ✓ categories: ${CATEGORIES.map((c) => `${c[1]} (${c[3] / 12} yrs)`).join(", ")} — with their GL accounts`);

  // ---- the opening register
  const life = Object.fromEntries(CATEGORIES.map((c) => [c[0], [c[3], c[4]]]));
  const seq = {};
  const rows = REGISTER.map(([cat, type, name, serial, purchased, cost, dept, loc, custodian, fund, project, condition, status]) => {
    seq[cat] = (seq[cat] || 0) + 1;
    return {
      code: `RALGA/${cat}/${String(seq[cat]).padStart(3, "0")}`, name, serial_number: serial, category: cat, department: dept, location_name: loc, custodian,
      funding_source: fund, project, cost, purchased_at: purchased, accumulated: accumulatedAtGoLive(purchased, cost, life[cat][0], life[cat][1]), condition, status: status || "in_use",
      type,
    };
  });
  const open = await post("finance@dnr-hr.rw", "/api/ims/assets/opening", { as_of: GO_LIVE, assets: rows });
  const byCode = Object.fromEntries((await admin.collection("assets").getFullList({ filter: 'code ~ "RALGA/"' })).map((a) => [a.code, a]));
  for (const r of rows) await admin.collection("assets").update(byCode[r.code].id, { type: types[`${r.category}|${r.type}`].id });
  console.log(`  ✓ opening register at ${GO_LIVE}: ${open.count} assets, cost RWF ${open.cost.toLocaleString("en-US")}, accumulated depreciation RWF ${open.accumulated.toLocaleString("en-US")} (journal ${open.journal})`);
  const find = (needle) => Object.values(byCode).find((a) => a.name.includes(needle));

  // ---- the laptops received on GRN: three capitalised, one left for the Store & Asset Officer
  received.sort((a, b) => a.code.localeCompare(b.code));
  const iau = await admin.collection("departments").getFirstListItem('code = "IAU"');
  for (const [i, a] of received.entries()) {
    if (i === received.length - 1) break;
    await post("stores@dnr-hr.rw", `/api/ims/assets/${a.id}/capitalise`, {
      category: cats.ICT.id, type: types["ICT|Laptop"].id, department: iau.id, location_name: "HQ 2nd floor, internal audit", condition: "new",
      description: "Received for the new audit associates", acquisition_type: "purchase",
    });
  }
  console.log(`  ✓ received on GRN: ${received.length - 1} laptops capitalised (Dr ICT equipment / Cr assets received not invoiced), ${received.length ? 1 : 0} waiting for its asset card`);

  // ---- July and August depreciation (Accountant → DAF)
  const runMonth = async (y, m, submit, approve) => {
    const r = await post("accountant@dnr-hr.rw", "/api/ims/depreciation-runs", { year: y, month: m });
    if (submit) await post("accountant@dnr-hr.rw", `/api/ims/depreciation-runs/${r.id}/submit`, {});
    if (approve) await approveAll((await admin.collection("depreciation_runs").getOne(r.id)).approval, "Checked against the asset schedule; posted.");
    return admin.collection("depreciation_runs").getOne(r.id);
  };
  const jul = await runMonth(2026, 7, true, true);
  const aug = await runMonth(2026, 8, true, true);

  // ---- custodian changes, status, transfers
  const rcsLaptop = byCode[rows.find((r) => r.custodian === "claire.kwizera8@dnr-hr.rw").code];
  const thierry = await admin.collection("users").getFirstListItem('email = "thierry.nshimiyimana.18@dnr-hr.rw"');
  if (rcsLaptop) {
    await post("stores@dnr-hr.rw", `/api/ims/assets/${rcsLaptop.id}/assign`, { custodian: "", location_name: "HQ ground floor, store", reason: "Returned by the Head of Recruitment Services, who received a new laptop from the project." });
    await post("stores@dnr-hr.rw", `/api/ims/assets/${rcsLaptop.id}/assign`, { custodian: thierry.id, location_name: "HQ ground floor, recruitment", reason: "Given to the Recruitment Specialist for the online testing sessions." });
  }
  const copier = find("C3826i");
  await post("stores@dnr-hr.rw", `/api/ims/assets/${copier.id}/status`, { status: "under_maintenance", reason: "Fuser unit failed; Canon technician replacing it under the service contract." });
  const pme = await admin.collection("departments").getFirstListItem('code = "PME"');
  const projector = find("policy meeting room");
  const tr = await post("stores@dnr-hr.rw", `/api/ims/assets/${projector.id}/transfer`, { to_department: pme.id, to_location: "HQ 2nd floor, planning office", reason: "The Planning, Monitoring and Evaluation team runs the quarterly district reviews and needs a projector; Advocacy and Policy uses the boardroom." });
  await approveAll((await admin.collection("asset_movements").getOne(tr.id)).approval, "Agreed; update the room inventory list.");
  const tablet3 = find("field data collection 3");
  await post("hod@dnr-hr.rw", `/api/ims/assets/${tablet3.id}/transfer`, { to_department: pme.id, reason: "Planning and Evaluation needs a tablet for the district performance survey; Capacity Building has three in use." });
  console.log("  ✓ movements: a laptop returned and reissued, a photocopier under maintenance, a projector transferred to Planning (approved), a tablet transfer waiting for the DAF");

  // ---- maintenance (services due soon for the demo)
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const prado = find("Land Cruiser");
  const hilux = find("Hilux");
  const generator = find("Cummins");
  const c5840 = find("C5840i");
  const ac = find("BTU — server room");
  const server = find("PowerEdge");
  for (const [asset, date, kind, description, provider, cost, downtime, next] of [
    [prado, day(-95), "service", "60,000 km service: oil, filters, brake pads, wheel alignment", "Toyota Rwanda", 485000, 1, day(-3)],
    [hilux, day(-68), "service", "40,000 km service and new front tyres", "Toyota Rwanda", 612000, 1, day(22)],
    [generator, day(-49), "service", "Annual service: oil, filters, coolant, load test", "Engen Power Solutions", 650000, 0, day(130)],
    [c5840, day(-57), "repair", "Drum unit and transfer belt replaced", "Canon Rwanda (service contract)", 375000, 2, ""],
    [ac, day(-82), "inspection", "Quarterly cleaning and gas pressure check of the four units", "CoolTech Ltd", 180000, 0, day(10)],
    [server, day(-33), "upgrade", "Memory upgraded to 128 GB; firmware updated", "ICT team", 0, 0, ""],
  ]) {
    await post("stores@dnr-hr.rw", `/api/ims/assets/${asset.id}/maintenance`, { date, kind, description, provider, cost, downtime_days: downtime, next_due: next });
  }
  console.log("  ✓ maintenance: 6 records (vehicle services, generator, photocopier repair, air conditioning, server); 1 service overdue, 2 due within 30 days");

  // ---- the pool car sold at auction in September (Store → DAF → SG), then September depreciation
  const corolla = find("Corolla");
  const sale = await post("stores@dnr-hr.rw", `/api/ims/assets/${corolla.id}/dispose`, {
    method: "auction", disposal_date: "2026-09-11", proceeds: 9800000, buyer: "Mutoni Transport Ltd (public auction of 11 September 2026)",
    reason: "Seven years old, repair costs rising; the disposal committee recommended a public auction (minutes of 28 August 2026).",
  });
  await post("stores@dnr-hr.rw", `/api/ims/asset-disposals/${sale.id}/submit`, {});
  await approveAll((await admin.collection("asset_disposals").getOne(sale.id)).approval, "Auction proceeds confirmed with the bank receipt.");
  const sep = await runMonth(2026, 9, true, true);

  // ---- the first-quarter count (30 September)
  const count = await post("stores@dnr-hr.rw", "/api/ims/asset-verifications", { title: "First-quarter count FY 2026/27 — head office", as_of: "2026-09-30", notes: "Counted floor by floor with the asset tags; Internal Audit observed." });
  const lines = await admin.collection("asset_verification_lines").getFullList({ filter: `verification = "${count.id}"`, expand: "asset" });
  const tablet4 = find("field data collection 4");
  const trainingProjector = find("laser projector — training room");
  const boardroomAc = find("BTU — boardroom");
  for (const l of lines) {
    let body = { result: "found", condition: l.expand?.asset?.condition || "good" };
    if (l.asset === tablet4.id) body = { result: "damaged", notes: "Screen cracked after a fall during the Nyagatare training." };
    else if (l.asset === trainingProjector.id) body = { result: "missing", notes: "Not in the training room; last used for the September induction. Reported to Administration." };
    else if (l.asset === boardroomAc.id) body = { result: "found_elsewhere", found_location: "HQ 3rd floor, DSG office", notes: "Moved when the boardroom was refurbished." };
    await post("stores@dnr-hr.rw", `/api/ims/asset-verification-lines/${l.id}`, body);
  }
  await post("stores@dnr-hr.rw", `/api/ims/asset-verifications/${count.id}/complete`, {});
  console.log(`  ✓ count ${count.number}: ${lines.length} assets — 1 missing (training room projector), 1 damaged (tablet), 1 found elsewhere`);

  // ---- disposals waiting: obsolete desktop (waiting for the SG), damaged tablet write-off (draft)
  const desktop = find("testing room 1");
  const scrap = await post("stores@dnr-hr.rw", `/api/ims/assets/${desktop.id}/dispose`, { method: "scrap", disposal_date: day(0), reason: "Seven years old and fully depreciated; cannot run the online testing software. To be collected by an e-waste recycler (Enviroserve Rwanda)." });
  await post("stores@dnr-hr.rw", `/api/ims/asset-disposals/${scrap.id}/submit`, {});
  await approveOnce((await admin.collection("asset_disposals").getOne(scrap.id)).approval, "Fully depreciated; agree to scrap through the certified recycler.");
  await post("stores@dnr-hr.rw", `/api/ims/assets/${tablet4.id}/dispose`, { method: "write_off", disposal_date: day(0), reason: "Screen damaged beyond economic repair (quotation RWF 410,000 against a book value lower than that); write off and keep for spare parts." });
  console.log("  ✓ disposals: pool car sold at auction (posted, with its gain), an obsolete desktop waiting for the SG, a tablet write-off in draft");

  // ---- October depreciation waiting for the DAF
  const oct = await runMonth(2026, 10, true, false);
  console.log(`  ✓ depreciation: ${jul.period_label} RWF ${jul.total.toLocaleString("en-US")}, ${aug.period_label} RWF ${aug.total.toLocaleString("en-US")}, ${sep.period_label} RWF ${sep.total.toLocaleString("en-US")} posted; ${oct.period_label} RWF ${oct.total.toLocaleString("en-US")} waiting for the DAF`);

  // ---- staff ask for equipment by type; the Store & Asset Officer answers
  const user = async (email) => admin.collection("users").getFirstListItem(`email = "${email}"`);
  const request = async (email, type, notes) => (await as(email)).collection("assets_requests").create({ requested_by: (await user(email)).id, asset_type: types[type].id, notes, status: "pending" });
  const josiane = await request("josiane.tuyishime.32@dnr-hr.rw", "ICT|Laptop", "Joined Internal Audit in October; I need a laptop for the audit fieldwork.");
  const inStore = (await admin.collection("assets").getFullList({ filter: `purchase_order != "" && capitalised = true && assigned_to = ""`, sort: "code" }))[0];
  if (inStore) await post("stores@dnr-hr.rw", `/api/ims/asset-requests/${josiane.id}/decide`, { decision: "approve", asset: inStore.id, location_name: "HQ 2nd floor, internal audit", comment: "New laptop from the October delivery." });
  const proj = await request("patrick.hakizimana.29@dnr-hr.rw", "ICT|Projector", "For the media briefings in the communication office.");
  await post("stores@dnr-hr.rw", `/api/ims/asset-requests/${proj.id}/decide`, { decision: "reject", comment: "Use the boardroom projector; book the room through the Executive Assistant." });
  await request("employee@dnr-hr.rw", "ICT|Laptop", "My laptop battery no longer holds a charge; I need a replacement for the training season.");
  await request("jean.habimana.0@dnr-hr.rw", "ICT|Tablet", "Data collection for the district performance survey in November.");
  console.log("  ✓ equipment requests: 1 given (laptop), 1 declined, 2 waiting for the Store & Asset Officer");
  console.log("✅ Fixed assets ready.");
}

main().catch((e) => {
  console.error("❌ seed-assets failed:", e?.response?.message || e?.message || e, e?.response?.data ? JSON.stringify(e.response.data) : "");
  process.exit(1);
});
