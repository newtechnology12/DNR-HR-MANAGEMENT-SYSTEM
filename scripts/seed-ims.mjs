#!/usr/bin/env node
/**
 * RALGA IMS — Step 1 master data (run last: `npm run seed:ralga`).
 *
 *  - IMS settings (fiscal year July–June, security policy, budget thresholds)
 *  - fiscal years FY 2025/26 (closed) and FY 2026/27 (current) with monthly periods
 *  - chart of accounts (accrual, IPSAS-style), funding sources, projects, cost centres
 *  - dated VAT / withholding tax rates — seeded for FINANCE TO CONFIRM against rra.gov.rw
 *  - a scheduled delegation and a pending permission-matrix change, so the new screens have data
 *
 * Master data is written THROUGH THE API as the Director of Finance (DAF), so the permission
 * guards and the audit trail are exercised exactly as in production. Safe to re-run.
 */
import PocketBase from "pocketbase";
import { ROLES, ROLE, DEMO_ACCOUNTS, DEMO_PASSWORD, permitionsFor } from "./ims/roles.mjs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}).`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
async function login(email) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, DEMO_PASSWORD);
  return pb;
}
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// ------------------------------------------------------------------ chart of accounts
// [code, name, type, posting, statement_section, cash_flow_class, extra]
const COA = [
  ["1", "Assets", "asset", false, "current_assets", "none"],
  ["11", "Current assets", "asset", false, "current_assets", "operating"],
  ["1101", "Bank — operating account (BK)", "asset", true, "current_assets", "cash"],
  ["1102", "Bank — donor project account (BPR)", "asset", true, "current_assets", "cash"],
  ["1103", "Petty cash — Head Office", "asset", true, "current_assets", "cash"],
  ["1110", "Member contributions receivable", "asset", true, "current_assets", "operating", { is_control: true }],
  ["1111", "Other receivables", "asset", true, "current_assets", "operating"],
  ["1120", "Staff advances", "asset", true, "current_assets", "operating"],
  ["1130", "Prepayments", "asset", true, "current_assets", "operating"],
  ["1140", "Inventory — stores", "asset", true, "current_assets", "operating"],
  ["1150", "VAT recoverable", "asset", true, "current_assets", "operating"],
  ["12", "Non-current assets", "asset", false, "non_current_assets", "investing"],
  ["1210", "Land and buildings", "asset", true, "non_current_assets", "investing"],
  ["1220", "Motor vehicles", "asset", true, "non_current_assets", "investing"],
  ["1230", "Furniture and fittings", "asset", true, "non_current_assets", "investing"],
  ["1240", "ICT equipment", "asset", true, "non_current_assets", "investing"],
  ["1250", "Office equipment", "asset", true, "non_current_assets", "investing"],
  ["1260", "Intangible assets — software", "asset", true, "non_current_assets", "investing"],
  ["1290", "Accumulated depreciation", "asset", false, "non_current_assets", "none", { normal_balance: "credit" }],
  ["1291", "Accumulated depreciation — buildings", "asset", true, "non_current_assets", "none", { normal_balance: "credit" }],
  ["1292", "Accumulated depreciation — motor vehicles", "asset", true, "non_current_assets", "none", { normal_balance: "credit" }],
  ["1293", "Accumulated depreciation — furniture and fittings", "asset", true, "non_current_assets", "none", { normal_balance: "credit" }],
  ["1294", "Accumulated depreciation — ICT equipment", "asset", true, "non_current_assets", "none", { normal_balance: "credit" }],
  ["1295", "Accumulated depreciation — office equipment", "asset", true, "non_current_assets", "none", { normal_balance: "credit" }],
  ["1296", "Accumulated amortisation — software", "asset", true, "non_current_assets", "none", { normal_balance: "credit" }],
  ["2", "Liabilities", "liability", false, "current_liabilities", "none"],
  ["21", "Current liabilities", "liability", false, "current_liabilities", "operating"],
  ["2101", "Accounts payable — suppliers", "liability", true, "current_liabilities", "operating", { is_control: true }],
  ["2102", "Accrued expenses", "liability", true, "current_liabilities", "operating"],
  ["2103", "Salaries payable", "liability", true, "current_liabilities", "operating"],
  ["2104", "PAYE payable (RRA)", "liability", true, "current_liabilities", "operating"],
  ["2105", "Pension contributions payable (RSSB)", "liability", true, "current_liabilities", "operating"],
  ["2106", "Maternity leave contributions payable (RSSB)", "liability", true, "current_liabilities", "operating"],
  ["2107", "CBHI contributions payable (RSSB)", "liability", true, "current_liabilities", "operating"],
  ["2108", "Withholding tax payable (RRA)", "liability", true, "current_liabilities", "operating"],
  ["2109", "VAT payable (RRA)", "liability", true, "current_liabilities", "operating"],
  ["2110", "Unspent donor funds (deferred revenue)", "liability", true, "current_liabilities", "operating"],
  ["2111", "Other payables", "liability", true, "current_liabilities", "operating"],
  ["2112", "Occupational hazards contributions payable (RSSB)", "liability", true, "current_liabilities", "operating"],
  ["22", "Non-current liabilities", "liability", false, "non_current_liabilities", "financing"],
  ["2201", "Deferred capital grants", "liability", true, "non_current_liabilities", "financing"],
  ["3", "Net assets", "net_assets", false, "net_assets", "none"],
  ["3101", "Accumulated surplus / (deficit)", "net_assets", true, "net_assets", "none"],
  ["3102", "General reserve", "net_assets", true, "net_assets", "none"],
  ["3103", "Revaluation reserve", "net_assets", true, "net_assets", "none"],
  ["4", "Revenue", "revenue", false, "revenue_non_exchange", "operating"],
  ["41", "Revenue from non-exchange transactions", "revenue", false, "revenue_non_exchange", "operating"],
  ["4101", "Member contributions — districts and City of Kigali", "revenue", true, "revenue_non_exchange", "operating"],
  ["4102", "Government of Rwanda transfers", "revenue", true, "revenue_non_exchange", "operating"],
  ["4103", "Donor grants — operational support", "revenue", true, "revenue_non_exchange", "operating"],
  ["4104", "Donor grants — projects", "revenue", true, "revenue_non_exchange", "operating"],
  ["42", "Revenue from exchange transactions", "revenue", false, "revenue_exchange", "operating"],
  ["4201", "Recruitment service fees", "revenue", true, "revenue_exchange", "operating"],
  ["4202", "Training and capacity-building fees", "revenue", true, "revenue_exchange", "operating"],
  ["4203", "Interest income", "revenue", true, "revenue_exchange", "operating"],
  ["4204", "Other income", "revenue", true, "revenue_exchange", "operating"],
  ["4205", "Gain on disposal of assets", "revenue", true, "revenue_exchange", "investing"],
  ["5", "Expenses", "expense", false, "expenses", "operating"],
  ["51", "Personnel costs", "expense", false, "expenses", "operating"],
  ["5101", "Basic salaries", "expense", true, "expenses", "operating"],
  ["5102", "Allowances (transport, housing, communication)", "expense", true, "expenses", "operating"],
  ["5103", "Employer pension contribution (RSSB)", "expense", true, "expenses", "operating"],
  ["5104", "Employer maternity leave contribution (RSSB)", "expense", true, "expenses", "operating"],
  ["5105", "Occupational hazards contribution (RSSB)", "expense", true, "expenses", "operating"],
  ["5106", "Staff medical insurance", "expense", true, "expenses", "operating"],
  ["5107", "Staff training and development", "expense", true, "expenses", "operating"],
  ["52", "Goods and services", "expense", false, "expenses", "operating"],
  ["5201", "Office supplies and stationery", "expense", true, "expenses", "operating"],
  ["5202", "Utilities (water and electricity)", "expense", true, "expenses", "operating"],
  ["5203", "Telephone and internet", "expense", true, "expenses", "operating"],
  ["5204", "Rent", "expense", true, "expenses", "operating"],
  ["5205", "Repairs and maintenance", "expense", true, "expenses", "operating"],
  ["5206", "Fuel and vehicle running costs", "expense", true, "expenses", "operating"],
  ["5207", "Travel — local missions", "expense", true, "expenses", "operating"],
  ["5208", "Travel — international", "expense", true, "expenses", "operating"],
  ["5209", "Workshops, meetings and events", "expense", true, "expenses", "operating"],
  ["5210", "Consultancy and professional fees", "expense", true, "expenses", "operating"],
  ["5211", "External audit fees", "expense", true, "expenses", "operating"],
  ["5212", "Bank charges", "expense", true, "expenses", "operating"],
  ["5213", "Insurance", "expense", true, "expenses", "operating"],
  ["5214", "Software licences and subscriptions", "expense", true, "expenses", "operating"],
  ["5215", "Communication, publicity and printing", "expense", true, "expenses", "operating"],
  ["5216", "Cleaning and security services", "expense", true, "expenses", "operating"],
  ["53", "Programme expenses", "expense", false, "expenses", "operating"],
  ["5301", "Capacity-building programmes", "expense", true, "expenses", "operating"],
  ["5302", "Advocacy, policy and research", "expense", true, "expenses", "operating"],
  ["5303", "Recruitment services delivery", "expense", true, "expenses", "operating"],
  ["5304", "Local economic development programme", "expense", true, "expenses", "operating"],
  ["54", "Depreciation and amortisation", "expense", false, "expenses", "none"],
  ["5401", "Depreciation — buildings", "expense", true, "expenses", "none"],
  ["5402", "Depreciation — motor vehicles", "expense", true, "expenses", "none"],
  ["5403", "Depreciation — furniture and fittings", "expense", true, "expenses", "none"],
  ["5404", "Depreciation — ICT equipment", "expense", true, "expenses", "none"],
  ["5405", "Depreciation — office equipment", "expense", true, "expenses", "none"],
  ["5406", "Amortisation — software", "expense", true, "expenses", "none"],
  ["55", "Other expenses", "expense", false, "expenses", "operating"],
  ["5501", "Loss on disposal of assets", "expense", true, "expenses", "investing"],
  ["5502", "Impairment of receivables", "expense", true, "expenses", "none"],
  ["5503", "Exchange losses", "expense", true, "expenses", "operating"],
];

const FUNDING = [
  { code: "MC", name: "Member contributions", type: "member_contributions", restricted: false, donor_name: "", description: "Annual contributions of the member districts and the City of Kigali. Unrestricted." },
  { code: "DP-LED", name: "Development partner — Local Economic Development programme", type: "donor", restricted: true, donor_name: "Development partner (illustrative)", agreement_reference: "GA-LED-2025-01", committed_amount: 480000000, description: "Restricted grant for district LED capacity. Report by funding source each quarter." },
  { code: "DP-CB", name: "Development partner — Capacity Building for Local Leaders", type: "donor", restricted: true, donor_name: "Development partner (illustrative)", agreement_reference: "GA-CB-2026-03", committed_amount: 320000000, description: "Restricted grant for councillors' and leaders' induction and training." },
];

const PROJECTS = [
  ["LED-01", "District LED capacity programme 2026/27", "DP-LED", /advocacy/i, 240000000],
  ["CB-01", "Councillors induction and leadership training 2026/27", "DP-CB", /capacity/i, 180000000],
  ["RCS-01", "Recruitment services to districts", "MC", /recruit/i, 45000000],
  ["ICT-01", "E-learning platform upgrade", "MC", /ict/i, 60000000],
];

// VAT and withholding: seeded from the vendor's understanding of Rwandan tax law. They are NOT
// confirmed — the DAF must check each against the current law on rra.gov.rw and press "Confirm".
const TAXES = [
  { code: "VAT_STANDARD", name: "VAT — standard rate", category: "vat", rate: 18, effective_from: "2012-01-01", gl: "2109", applies_to: "Taxable supplies of goods and services", legal_reference: "Rwanda VAT law (RRA) — confirm current law and article" },
  { code: "VAT_ZERO", name: "VAT — zero-rated", category: "vat", rate: 0, effective_from: "2012-01-01", gl: "2109", applies_to: "Exports and zero-rated supplies", legal_reference: "Rwanda VAT law (RRA) — confirm" },
  { code: "VAT_EXEMPT", name: "VAT — exempt", category: "vat", rate: 0, effective_from: "2012-01-01", gl: "", applies_to: "Exempt supplies (no input VAT recovery)", legal_reference: "Rwanda VAT law (RRA) — confirm" },
  { code: "WHT_PUBLIC_TENDER", name: "Withholding tax — public tenders (goods and services)", category: "withholding", rate: 3, effective_from: "2019-01-01", gl: "2108", applies_to: "Payments by public institutions for goods and services, unless the supplier is exempt (e.g. valid quitus fiscal / registered taxpayer rules)", legal_reference: "Rwanda income tax law (RRA) — confirm current article and exemptions" },
  { code: "WHT_SERVICES", name: "Withholding tax — service and professional fees", category: "withholding", rate: 15, effective_from: "2019-01-01", gl: "2108", applies_to: "Consultancy, professional and other service fees, royalties, rent where applicable", legal_reference: "Rwanda income tax law (RRA) — confirm current article and exemptions" },
];

async function upsert(client, collection, filter, data) {
  const existing = await admin.collection(collection).getFirstListItem(filter).catch(() => null);
  return existing ? client.collection(collection).update(existing.id, data) : client.collection(collection).create(data);
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🏦 RALGA IMS — foundation and master data");

  // Matrix once more, in case a module seed touched roles (only superusers may write roles directly).
  const roles = await admin.collection("roles").getFullList();
  for (const def of ROLES) {
    const r = roles.find((x) => x.code === def.code);
    if (r) await admin.collection("roles").update(r.id, { permitions: permitionsFor(def.code), procurement_scope: def.procurement_scope, hr_scope: def.hr_scope });
  }
  const roleId = Object.fromEntries(roles.map((r) => [r.code, r.id]));

  const settings = (await admin.collection("settings").getList(1, 1)).items[0];
  await admin.collection("settings").update(settings.id, {
    org_short_name: "RALGA", fiscal_year_start_month: 7, session_timeout_minutes: 30, password_min_length: 10,
    lockout_threshold: 5, lockout_minutes: 15, require_2fa: "none", approval_overdue_hours: 48, budget_amber_pct: 75, budget_red_pct: 90,
  });
  console.log("  ✓ settings: fiscal year July–June, 30-minute session timeout, lockout after 5 failed sign-ins");

  const daf = await login("finance@dnr-hr.rw");

  // Fiscal years — FY 2025/26 (closed) and FY 2026/27 (current).
  const now = new Date();
  const currentStart = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  for (const [start, current] of [[currentStart - 1, false], [currentStart, true]]) {
    const code = `${start}/${String(start + 1).slice(2)}`;
    let fy = await admin.collection("fiscal_years").getFirstListItem(`code = "${code}"`).catch(() => null);
    if (!fy) fy = await daf.send("/api/ims/fiscal-years", { method: "POST", body: { start_year: start, make_current: current } });
    if (current) await daf.send(`/api/ims/fiscal-years/${fy.id}/current`, { method: "POST" });
    else {
      await admin.collection("fiscal_years").update(fy.id, { status: "closed", is_current: false, notes: "Prior year — closed after the external audit (demo)." });
      for (const p of await admin.collection("fiscal_periods").getFullList({ filter: `fiscal_year = "${fy.id}"` })) await admin.collection("fiscal_periods").update(p.id, { status: "closed" });
    }
  }
  console.log(`  ✓ fiscal years: FY ${currentStart - 1}/${String(currentStart).slice(2)} (closed) and FY ${currentStart}/${String(currentStart + 1).slice(2)} (current, 12 open periods)`);

  // Chart of accounts — parents first.
  const byCode = {};
  for (const [code, name, type, is_posting, statement_section, cash_flow_class, extra = {}] of COA) {
    // Nearest header account: 1291 → 1290, 1101 → 11, 3101 → 3.
    const candidates = code.length === 4 ? [`${code.slice(0, 3)}0`, code.slice(0, 2), code[0]] : code.length === 2 ? [code[0]] : [];
    const parentCode = candidates.find((c) => c !== code && byCode[c] && !byCode[c].is_posting) || "";
    const data = { code, name, type, is_posting, statement_section, cash_flow_class, active: true, parent: parentCode ? byCode[parentCode].id : "", is_control: false, ...extra };
    byCode[code] = await upsert(daf, "gl_accounts", `code = "${code}"`, data);
  }
  console.log(`  ✓ chart of accounts: ${COA.length} accounts (${COA.filter((a) => a[3]).length} posting) — assets, liabilities, net assets, revenue, expenses`);

  for (const f of FUNDING) await upsert(daf, "funding_sources", `code = "${f.code}"`, { ...f, currency: "RWF", active: true, start_date: `${currentStart}-07-01 00:00:00.000Z`, end_date: f.type === "donor" ? `${currentStart + 2}-06-30 23:59:59.999Z` : "" });
  const funding = Object.fromEntries((await admin.collection("funding_sources").getFullList()).map((f) => [f.code, f]));
  const departments = await admin.collection("departments").getFullList();
  for (const [code, name, fund, deptRe, budget] of PROJECTS) {
    const dept = departments.find((d) => deptRe.test(d.name));
    await upsert(daf, "projects", `code = "${code}"`, {
      code, name, funding_source: funding[fund].id, department: dept?.id || "", manager: dept?.head || "", status: "active", budget_amount: budget,
      start_date: `${currentStart}-07-01 00:00:00.000Z`, end_date: `${currentStart + 1}-06-30 23:59:59.999Z`, description: `${name} — funded by ${funding[fund].name}.`,
    });
  }
  for (const d of departments) await upsert(daf, "cost_centres", `code = "${d.code}"`, { code: d.code, name: d.name, department: d.id, active: true, description: `Cost centre for ${d.name}` });
  console.log(`  ✓ ${FUNDING.length} funding sources (member contributions + 2 donor programmes), ${PROJECTS.length} projects, ${departments.length} cost centres`);

  for (const t of TAXES) {
    const { gl, effective_from, ...rest } = t;
    await upsert(daf, "tax_rates", `code = "${t.code}"`, {
      ...rest, effective_from: `${effective_from} 00:00:00.000Z`, effective_to: "", gl_account: gl ? byCode[gl].id : "", active: true,
      notes: "Seeded by the vendor for set-up. The Director of Finance must confirm this rate against the current law on rra.gov.rw before go-live.",
    });
  }
  for (const r of await admin.collection("paye_bands").getFullList()) await admin.collection("paye_bands").update(r.id, { confirmed_by_finance: false, legal_reference: r.legal_reference || "Rwanda income tax law — PAYE bands (confirm on rra.gov.rw)" });
  for (const r of await admin.collection("statutory_contributions").getFullList()) {
    await admin.collection("statutory_contributions").update(r.id, { confirmed_by_finance: false, effective_from: r.effective_from || `${currentStart - 1}-01-01 00:00:00.000Z`, legal_reference: r.legal_reference || "RSSB contribution rates (confirm on rssb.rw)" });
  }
  console.log(`  ✓ ${TAXES.length} dated VAT / withholding rates + PAYE bands and RSSB rates — all marked "to be confirmed by Finance"`);

  // A scheduled delegation: the DAF is on mission next month; the SG approves on her behalf.
  for (const d of await admin.collection("delegations").getFullList()) await admin.collection("delegations").delete(d.id).catch(() => null);
  const sg = await admin.collection("users").getFirstListItem(`email = "director@dnr-hr.rw"`);
  await daf.collection("delegations").create({ delegate: sg.id, start_date: day(20), end_date: day(27), reason: "Mission: district finance review in the Western Province", document_types: [] });

  // A pending permission change proposed by the System Administrator, waiting for the DAF.
  for (const r of await admin.collection("role_change_requests").getFullList({ filter: 'status = "pending"' })) await admin.collection("role_change_requests").update(r.id, { status: "cancelled" });
  const sysadmin = await login("admin@dnr-hr.rw");
  await sysadmin.send("/api/ims/roles/changes", {
    method: "POST",
    body: {
      reason: "The Accountant prepares month-end files for the external auditors and needs to export the general ledger.",
      changes: [{ role: roleId.ACCOUNTANT, permission: "export_ledger", access: true }],
    },
  });
  console.log("  ✓ demo: a scheduled DAF → SG delegation and one permission change waiting for confirmation");

  console.log("\n✅ IMS foundation ready. Demo logins (password for all: " + DEMO_PASSWORD + ")");
  for (const a of DEMO_ACCOUNTS) console.log(`   ${ROLE[a.code].padEnd(28)} ${a.email.padEnd(24)} ${a.name}`);
}

main().catch((e) => {
  console.error("❌ IMS seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
