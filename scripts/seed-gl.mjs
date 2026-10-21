#!/usr/bin/env node
/**
 * RALGA IMS — Step 8 demo data: general ledger and period close (last step of `npm run seed:ralga`).
 *
 *  - the approval flows for manual journals (Accountant → DAF) and for re-opening a closed month (SG)
 *  - backfill: anything recorded before the posting rules is posted (nothing, on a fresh seed)
 *  - manual journals: an accrual and a reclassification posted, a duplicate posted then reversed, a cost allocation
 *    waiting for the DAF, a draft
 *  - recurring journals (rent of the Huye regional office, external audit fees) generated for July to September and
 *    posted
 *  - July and August 2026 closed by the DAF with their checklist; a request to re-open August waiting for the SG;
 *    September still open (its bank reconciliation is waiting for the DAF)
 *
 * Everything goes THROUGH THE API as the real people (Accountant, DAF, SG).
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
const post = async (email, path, body) => (await as(email)).send(path, { method: "POST", body: body || {} });
async function wipe(collection, filter = "") {
  const rows = await admin.collection(collection).getFullList({ filter, fields: "id", batch: 500 });
  for (const r of rows) await admin.collection(collection).delete(r.id);
  return rows.length;
}
const fmt = (n) => Math.round(n).toLocaleString("en-US");

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("📒 General ledger: manual and recurring journals, period close");
  const role = async (code) => (await admin.collection("roles").getFirstListItem(`code = "${code}"`)).id;
  for (const [document_type, name, description, steps] of [
    ["journal_entry", "Journal approval", "Prepared by the Accountant; approved and posted by the Director of Finance. Whoever prepared the journal cannot approve it.", [{ name: "Director of Finance approval", approver_type: "role", role: await role("DAF") }]],
    ["period_reopen", "Re-opening a closed month", "Asked by Finance with the reason; only the Secretary General re-opens a closed month.", [{ name: "Secretary General approval", approver_type: "role", role: await role("SG") }]],
  ]) {
    await wipe("approval_workflows", `document_type = "${document_type}"`);
    await admin.collection("approval_workflows").create({ name, description, document_type, active: true, priority: 10, min_amount: 0, max_amount: 0, allow_self_approval: false, overdue_hours: 48, steps });
  }
  // an earlier run's manual journals and templates (seed-ims.mjs already cleared the ledger itself)
  await wipe("gl_recurring_journals");
  for (const a of await admin.collection("approval_requests").getFullList({ fields: "id", filter: 'document_type = "journal_entry"' })) await admin.collection("approval_requests").delete(a.id);

  const backfill = await post("finance@dnr-hr.rw", "/api/ims/ledger/backfill");
  const posted = backfill.bank_openings + backfill.invoices + backfill.vouchers + backfill.cash_documents + backfill.reversals;
  console.log(`  ✓ backfill: ${posted ? `${posted} earlier document${posted === 1 ? "" : "s"} posted` : "everything was already in the ledger"}${backfill.problems.length ? ` · ${backfill.problems.length} not posted: ${backfill.problems.slice(0, 3).join("; ")}` : ""}`);

  const gl = Object.fromEntries((await admin.collection("gl_accounts").getFullList({ fields: "id,code" })).map((a) => [a.code, a.id]));
  const dept = Object.fromEntries((await admin.collection("departments").getFullList({ fields: "id,code" })).map((d) => [d.code, d.id]));
  const fund = Object.fromEntries((await admin.collection("funding_sources").getFullList({ fields: "id,code" })).map((f) => [f.code, f.id]));
  const proj = Object.fromEntries((await admin.collection("projects").getFullList({ fields: "id,code" })).map((p) => [p.code, p.id]));
  const line = (code, side, amount, description, d, f, p) => ({ account: gl[code], [side]: amount, description, department: d ? dept[d] : "", funding_source: f ? fund[f] : "", project: p ? proj[p] : "" });
  const journal = async (date, description, lines) => post("accountant@dnr-hr.rw", "/api/ims/journals", { date, description, lines });
  const approve = async (id, comment) => {
    const j = await admin.collection("gl_journals").getOne(id);
    await post("finance@dnr-hr.rw", `/api/dnr/approvals/${j.approval}/act`, { action: "approve", comment });
  };
  const submitAndPost = async (j, comment) => {
    await post("accountant@dnr-hr.rw", `/api/ims/journals/${j.id}/submit`);
    await approve(j.id, comment);
    return admin.collection("gl_journals").getOne(j.id);
  };

  // ---- recurring journals, generated for the past months and posted
  const rent = await post("accountant@dnr-hr.rw", "/api/ims/recurring-journals", {
    name: "Rent of the Huye regional office", description: "Accrued monthly; paid each quarter by payment voucher (lease of 1 July 2026).", frequency: "monthly", day_of_month: 28, start_date: "2026-07-28",
    lines: [line("5204", "debit", 1200000, "Rent — Huye regional office", "OSG", "MC"), line("2102", "credit", 1200000, "Rent accrued — Huye regional office", "OSG", "MC")],
  });
  const audit = await post("accountant@dnr-hr.rw", "/api/ims/recurring-journals", {
    name: "External audit fees (accrual)", description: "One twelfth of the FY 2026/27 audit engagement (RWF 12,000,000), accrued each month.", frequency: "monthly", day_of_month: 28, start_date: "2026-07-28", end_date: "2027-06-30",
    lines: [line("5211", "debit", 1000000, "External audit fees — monthly accrual", "FIN", "MC"), line("2102", "credit", 1000000, "Audit fees accrued", "FIN", "MC")],
  });
  const generated = await post("accountant@dnr-hr.rw", "/api/ims/recurring-journals/generate");
  for (const g of generated.created) await approve(g.id, "Recurring accrual checked against the lease and the engagement letter.");
  console.log(`  ✓ recurring journals: 2 templates; ${generated.created.length} journals generated (July–September) and posted${generated.problems.length ? ` · ${generated.problems.join("; ")}` : ""}`);

  // ---- manual journals
  const accrual = await submitAndPost(await journal("2026-09-30", "Accrual of September 2026 electricity and water (REG and WASAC bills received in October)", [
    line("5202", "debit", 1860000, "Electricity and water — September 2026", "FIN", "MC"), line("2102", "credit", 1860000, "Utilities accrued — September 2026", "FIN", "MC"),
  ]), "Bills seen; amounts agree.");
  const reclass = await submitAndPost(await journal("2026-10-10", "Reclassification: Nyagatare workshop venue charged to the Capacity Building programme (CB-01)", [
    line("5209", "debit", 2450000, "Nyagatare workshop venue — CB-01", "CBD", "DP-CB", "CB-01"), line("5209", "credit", 2450000, "Nyagatare workshop venue moved to CB-01", "CBD", "MC"),
  ]), "Agreed with the programme budget (activity 2.3 of CB-01).");
  const duplicate = await submitAndPost(await journal("2026-10-12", "Accrual of the October cleaning and security services contract", [
    line("5216", "debit", 950000, "Cleaning and security — October 2026", "FIN", "MC"), line("2102", "credit", 950000, "Cleaning and security accrued", "FIN", "MC"),
  ]), "Contract checked.");
  const twice = await submitAndPost(await journal("2026-10-12", "Accrual of the October cleaning and security services contract", [
    line("5216", "debit", 950000, "Cleaning and security — October 2026", "FIN", "MC"), line("2102", "credit", 950000, "Cleaning and security accrued", "FIN", "MC"),
  ]), "Contract checked.");
  const reversed = await post("finance@dnr-hr.rw", `/api/ims/journals/${twice.id}/reverse`, { reason: `Posted twice — duplicate of ${duplicate.number}.`, date: "2026-10-14" });
  const pending = await journal("2026-10-20", "Allocation of shared ICT licences to the Local Economic Development programme (October share)", [
    line("5214", "debit", 640000, "LED programme share of Microsoft 365 and Zoom — October", "APR", "DP-LED", "LED-01"), line("5214", "credit", 640000, "Shared ICT licences reallocated to LED-01", "ICT", "MC"),
  ]);
  await post("accountant@dnr-hr.rw", `/api/ims/journals/${pending.id}/submit`);
  const draft = await journal("2026-10-21", "Accrual of fuel used in October not yet invoiced (field missions)", [
    line("5206", "debit", 480000, "Fuel — October field missions", "OSG", "MC"), line("2102", "credit", 480000, "Fuel accrued — October", "OSG", "MC"),
  ]);
  console.log(`  ✓ manual journals: ${accrual.number} accrual and ${reclass.number} reclassification posted; ${twice.number} posted twice by mistake and reversed by ${reversed.number}; ${pending.number} waiting for the DAF; ${draft.number} draft`);

  // ---- close July and August; ask to re-open August
  const periods = await admin.collection("fiscal_periods").getFullList({ sort: "start_date", filter: 'status = "open"' });
  const closed = [];
  for (const p of periods) {
    if (!["2026-07", "2026-08"].includes(p.start_date.slice(0, 7))) continue;
    await post("finance@dnr-hr.rw", `/api/ims/ledger/periods/${p.id}/close`, { note: p.start_date.slice(0, 7) === "2026-07" ? "First month after go-live. Opening balances agreed to the audited statements of 30 June 2026." : "All reconciliations approved; payroll and depreciation posted." });
    closed.push(p.name);
  }
  const august = periods.find((p) => p.start_date.slice(0, 7) === "2026-08");
  const reopen = august ? await post("finance@dnr-hr.rw", `/api/ims/ledger/periods/${august.id}/reopen`, { reason: "A bank charge of 12 August for the cash-in-transit escort was recorded as a bank charge (5212) instead of security services (5216); re-open August to reclassify it, then close again." }) : null;
  const tb = await (await as("accountant@dnr-hr.rw")).send(`/api/ims/ledger/trial-balance?from=2026-07-01&to=${new Date().toISOString().slice(0, 10)}`, {});
  console.log(`  ✓ periods: ${closed.join(", ")} closed by the DAF${reopen ? `; ${reopen.number} asks the SG to re-open August` : ""}; September open (its bank reconciliation waits for the DAF)`);
  console.log(`  ✓ trial balance FY to date: ${tb.rows.length} accounts, debits RWF ${fmt(tb.totals.debit)} = credits RWF ${fmt(tb.totals.credit)} — ${tb.balanced ? "balanced" : "NOT BALANCED"}`);
  console.log("✅ General ledger ready.");
}

main().catch((e) => {
  console.error("❌ seed-gl failed:", e?.response?.message || e?.message || e, e?.response?.data ? JSON.stringify(e.response.data) : "");
  process.exit(1);
});
