#!/usr/bin/env node
/**
 * RALGA IMS — Step 5 demo data: bank and cash (run by `npm run seed:ralga`, after seed-volume.mjs).
 *
 *  - receipts: member contributions of districts and the City of Kigali, Government transfers, donor grant
 *    tranches, training and recruitment fees (Cashier records → DAF verifies → cash book)
 *  - transfers: petty cash replenishments, a reimbursement out of the restricted LED account
 *  - two petty cash expenses paid in cash (direct payment vouchers)
 *  - bank statements for the complete months of the fiscal year and the first half of this month, built from
 *    the cash book with the bank's own dates, monthly charges, interest and a duplicate charge the bank later
 *    reverses — imported through the same API as the Excel import, so automatic matching runs
 *  - bank charges and interest recorded from the statements; reconciliations approved for the past months,
 *    the last month waiting for the DAF; a cash count of the petty cash
 *  - left for the demo: this month's lines to match, a district contribution paid straight into the bank
 *    (record it as a receipt), the duplicate charge and its reversal, a receipt and a transfer waiting for
 *    the DAF, a draft receipt
 *
 * Everything goes THROUGH THE API as the real people (Cashier, Accountant, DAF). seed-ims.mjs clears earlier runs.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}). Set ALLOW_REMOTE_SEED=true to override.`);
  process.exit(1);
}
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(`${s}T12:00:00Z`) + n * 864e5));
const noon = (s) => `${s} 12:00:00.000Z`;
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);
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
    await (await as(who.email)).send(`/api/dnr/approvals/${a.id}/act`, { method: "POST", body: { action: "approve", comment: "Checked against the bank and the supporting documents." } });
  }
  return "pending";
}
const approvalOf = async (collection, id) => (await admin.collection(collection).getOne(id)).approval;

/** The default flows, when an install created the roles after the migration ran. */
async function ensureWorkflows() {
  const role = async (code) => (await admin.collection("roles").getFirstListItem(`code = "${code}"`)).id;
  const daf = await role("DAF");
  const sg = await role("SG");
  const flows = [
    ["cash_receipt", "Receipt verification", "Recorded by the Cashier; the Director of Finance checks it against the bank or the cash counted, then it is posted to the cash book.", [{ name: "Director of Finance verification", approver_type: "role", role: daf }]],
    ["bank_transfer", "Inter-account transfer approval", "Prepared by the Cashier; the Director of Finance approves; the Secretary General also approves above the DAF transfer limit.", [
      { name: "Director of Finance approval", approver_type: "role", role: daf },
      { name: "Secretary General approval (above the DAF limit)", approver_type: "role", role: sg, above_limit_of: daf, skip_if_already_approved: true },
    ]],
    ["bank_reconciliation", "Bank reconciliation approval", "Prepared by the Accountant; approved by the Director of Finance. Whoever prepared it cannot approve it.", [{ name: "Director of Finance approval", approver_type: "role", role: daf }]],
  ];
  for (const [document_type, name, description, steps] of flows) {
    const existing = await admin.collection("approval_workflows").getFirstListItem(`document_type = "${document_type}"`).catch(() => null);
    if (!existing) await admin.collection("approval_workflows").create({ name, description, document_type, active: true, priority: 10, min_amount: 0, max_amount: 0, allow_self_approval: false, overdue_hours: 48, steps });
  }
}

// What the bank prints for a cash book entry, and how many days later it reaches the statement.
function bankView(e) {
  const who = String(e.counterparty || "").toUpperCase().replace(/[^A-Z0-9 .&—-]/g, "").slice(0, 34);
  const h = hash(e.id);
  if (e.type === "receipt") return { lag: e.method === "cheque" ? 3 : 0, description: e.method === "cheque" ? `CHQ DEPOSIT ${who}` : `CR TRF ${who}`, reference: e.reference || e.source_number };
  if (e.type === "payment") return { lag: e.method === "cheque" ? 4 + (h % 5) : h % 2, description: `DR TRF ${who}`, reference: e.reference || e.source_number };
  if (e.type === "transfer_out") return { lag: 0, description: e.method === "cheque" ? `CHQ ${e.reference} ENCASHED` : `TRF TO ${who}`, reference: e.reference || e.source_number };
  if (e.type === "transfer_in") return { lag: 0, description: `CR TRF FROM ${who}`, reference: e.reference || e.source_number };
  return { lag: 0, description: e.description.toUpperCase(), reference: e.reference };
}

async function statementRows(account, from, to, extras) {
  const entries = await admin.collection("cash_book_entries").getFullList({ filter: `account = "${account.id}" && source_type != "statement_line"`, sort: "entry_date,created" });
  const rows = [];
  entries.forEach((e, i) => {
    const v = bankView(e);
    const date = addDays(e.entry_date.slice(0, 10), v.lag);
    if (date < from || date > to) return;
    rows.push({ date, description: v.description, reference: v.reference, amount_in: e.direction === "in" ? e.amount : 0, amount_out: e.direction === "out" ? e.amount : 0, order: i });
  });
  for (const x of extras) if (x.date >= from && x.date <= to) rows.push({ ...x, order: 1e6 + rows.length });
  return rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
}

async function importStatement(acc, account, from, to, opening, extras) {
  const rows = await statementRows(account, from, to, extras);
  let bal = opening;
  const withBalance = rows.map(({ order, ...r }) => {
    bal += r.amount_in - r.amount_out;
    return { ...r, balance: bal };
  });
  const r = await acc.send("/api/ims/treasury/statements/import", {
    method: "POST",
    body: {
      account: account.id, statement_from: from, statement_to: to, opening_balance: opening, closing_balance: bal, rows: withBalance,
      file_name: `${account.code.toLowerCase()}-statement-${from.slice(0, 7)}.xlsx`,
      mapping: { date: "Value date", description: "Narrative", reference: "Reference", amount_out: "Debit", amount_in: "Credit", balance: "Balance", date_format: "dmy", header_row: 7 },
    },
  });
  return { ...r, closing: bal };
}

/** Bank charges and interest on the statement are recorded in the cash book by the Accountant (matched at once). */
async function recordBankItems(acc, account, statementId, chargeLine) {
  const lines = await admin.collection("bank_statement_lines").getFullList({ filter: `statement = "${statementId}" && match_group = ""` });
  let n = 0;
  for (const l of lines) {
    const charge = /MAINTENANCE FEE|SMS BANKING|LEDGER FEE/.test(l.description);
    const interest = /CREDIT INTEREST/.test(l.description);
    if (!charge && !interest) continue;
    await acc.send(`/api/ims/treasury/statement-lines/${l.id}/record`, {
      method: "POST",
      body: { type: charge ? "bank_charge" : "interest", budget_line: charge && chargeLine ? chargeLine : "", description: charge ? `Bank charges: ${l.description.toLowerCase()}` : "Interest earned on the programme account" },
    });
    n++;
  }
  return n;
}

async function reconcile(acc, account, asOf, approve, notes) {
  const p = await acc.send(`/api/ims/treasury/reconciliation-preview?account=${account.id}&as_of=${asOf}`, {});
  const book = p.items.filter((i) => !i.follow_up && i.side === "book").map((i) => ({ kind: "entry", id: i.id }));
  if (book.length) await acc.send("/api/ims/treasury/follow-up", { method: "POST", body: { items: book, follow_up: "timing" } });
  for (const i of p.items.filter((x) => !x.follow_up && x.side === "bank")) {
    const dup = /DUPLICATE/.test(i.description);
    await acc.send("/api/ims/treasury/follow-up", {
      method: "POST",
      body: dup
        ? { items: [{ kind: "line", id: i.id }], follow_up: "correct", note: "Duplicate charge: the bank confirmed by e-mail that it will reverse it." }
        : { items: [{ kind: "line", id: i.id }], follow_up: "record", note: "Received directly in the bank: the Cashier records the receipt." },
    });
  }
  const rec = await acc.collection("bank_reconciliations").create({ account: account.id, as_of: noon(asOf), statement_balance: account.kind === "cash" ? p.book_balance : p.statement_balance_computed, notes });
  const s = await acc.send(`/api/ims/treasury/reconciliations/${rec.id}/submit`, { method: "POST" });
  if (approve) await approveAll(s.approval);
  return rec;
}

async function main() {
  await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🏦 Bank & cash: receipts, transfers, statements, reconciliations");
  await ensureWorkflows();
  const cashier = await as("cashier@dnr-hr.rw");
  const acc = await as("accountant@dnr-hr.rw");
  const A = Object.fromEntries((await admin.collection("bank_accounts").getFullList()).map((a) => [a.code, a]));
  if (!A["BK-OPS"] || !A["BPR-LED"] || !A["PC-HQ"]) throw new Error("Bank accounts missing — run seed-ims.mjs first.");
  const gl = Object.fromEntries((await admin.collection("gl_accounts").getFullList({ fields: "id,code" })).map((g) => [g.code, g.id]));
  const fund = Object.fromEntries((await admin.collection("funding_sources").getFullList({ fields: "id,code" })).map((f) => [f.code, f.id]));

  const today = iso(new Date());
  const start = A["BK-OPS"].opening_date.slice(0, 10);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const y = Number(start.slice(0, 4));
    const m = Number(start.slice(5, 7)) - 1 + i;
    const s = iso(new Date(Date.UTC(y, m, 1)));
    const e = iso(new Date(Date.UTC(y, m + 1, 0)));
    if (e >= today) break;
    months.push({ start: s, end: e });
  }
  const cur = { start: `${today.slice(0, 7)}-01`, end: addDays(today, -6) };
  const at = (m, dd) => {
    if (m === "cur") {
      const d = `${cur.start.slice(0, 8)}${pad(dd)}`;
      return d < today && d >= start ? d : null;
    }
    return months[m] ? `${months[m].start.slice(0, 8)}${pad(dd)}` : null;
  };
  if (!months.length) {
    console.log("  · the fiscal year has no complete month yet — bank and cash demo data skipped");
    return;
  }

  // ---------------------------------------------------------------- receipts
  const RECEIPTS = [
    ["BK-OPS", 0, 8, "member", "Gasabo District", 42000000, "bank_transfer", "GSB-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", 0, 15, "member", "Nyarugenge District", 38500000, "bank_transfer", "NYR-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", 0, 18, "government", "Ministry of Local Government (MINALOC)", 120000000, "bank_transfer", "MINALOC-TRF-Q1", "4102", "MC", "Government transfer — first quarter 2026/27"],
    ["BK-OPS", 0, 22, "member", "Kicukiro District", 36000000, "bank_transfer", "KCK-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", 1, 5, "member", "Huye District", 18000000, "bank_transfer", "HUY-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", 1, 12, "member", "Musanze District", 19500000, "bank_transfer", "MSZ-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BPR-LED", 1, 20, "donor", "Development partner — LED programme", 240000000, "bank_transfer", "GA-LED-T2", "4104", "DP-LED", "Second tranche of the LED grant (agreement GA-LED-2025-01)"],
    ["BK-OPS", 1, 26, "member", "Rubavu District", 21000000, "bank_transfer", "RBV-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", 2, 3, "donor", "Development partner — Capacity Building", 160000000, "bank_transfer", "GA-CB-T1", "4104", "DP-CB", "First tranche of the capacity-building grant (agreement GA-CB-2026-03)"],
    ["BK-OPS", 2, 9, "member", "Nyagatare District", 17250000, "bank_transfer", "NYG-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", 2, 16, "member", "Rwamagana District", 15800000, "cheque", "004417", "4101", "MC", "Annual member contribution 2026/27 (cheque)"],
    ["BK-OPS", 2, 23, "client", "Bugesera District", 4850000, "bank_transfer", "BGS-TRN-0923", "4202", "MC", "Councillors' induction training fees"],
    ["BK-OPS", 2, 29, "member", "City of Kigali", 60000000, "cheque", "005113", "4101", "MC", "Annual member contribution 2026/27 (cheque deposited on the last days of the month)"],
    ["PC-HQ", "cur", 2, "other", "Tender document sales (walk-in bidders)", 60000, "cash", "", "4204", "MC", "Sale of 6 tender documents, tender RALGA/2026/T-014"],
    ["BK-OPS", "cur", 6, "member", "Karongi District", 14600000, "bank_transfer", "KRG-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"],
    ["BK-OPS", "cur", 10, "government", "Ministry of Local Government (MINALOC)", 120000000, "bank_transfer", "MINALOC-TRF-Q2", "4102", "MC", "Government transfer — second quarter 2026/27"],
    ["BK-OPS", "cur", 13, "client", "Nyamasheke District", 6300000, "bank_transfer", "NYM-RCS-1013", "4201", "MC", "Recruitment services — district staff recruitment"],
  ];
  const receiptBody = ([code, m, dd, payer_type, payer_name, amount, method, reference, income, f, description]) => ({
    account: A[code].id, receipt_date: noon(at(m, dd)), payer_type, payer_name, amount, method, reference, income_account: gl[income], funding_source: fund[f] || "", description,
  });
  let posted = 0;
  for (const r of RECEIPTS) {
    if (!at(r[1], r[2])) continue;
    const doc = await cashier.collection("cash_receipts").create(receiptBody(r));
    const s = await cashier.send(`/api/ims/treasury/receipts/${doc.id}/submit`, { method: "POST" });
    await approveAll(s.approval);
    posted++;
  }

  // ---------------------------------------------------------------- transfers
  const TRANSFERS = [
    ["BK-OPS", "PC-HQ", 1, 1, 300000, "cheque", "100211", "Petty cash replenishment (cheque encashed by the Cashier)"],
    ["BPR-LED", "BK-OPS", 2, 12, 35000000, "bank_transfer", "BPR-TRF-0912", "Reimbursement of LED programme workshop costs paid from the operating account in August (vouchers on file)"],
    ["BK-OPS", "PC-HQ", 2, 28, 205000, "cheque", "100244", "Petty cash replenishment (cheque encashed by the Cashier)"],
  ];
  let moved = 0;
  for (const [from, to, m, dd, amount, method, reference, description] of TRANSFERS) {
    if (!at(m, dd)) continue;
    const t = await cashier.collection("bank_transfers").create({ from_account: A[from].id, to_account: A[to].id, transfer_date: noon(at(m, dd)), amount, method, reference, description });
    const s = await cashier.send(`/api/ims/treasury/transfers/${t.id}/submit`, { method: "POST" });
    await approveAll(s.approval);
    moved++;
  }

  // ---------------------------------------------------------------- petty cash expenses (direct vouchers paid in cash)
  const lineFor = async (glCode) => (await admin.collection("budget_lines").getFirstListItem(`code ~ "-${glCode}-" && status = "active" && funding_source.code = "MC"`).catch(() => null)) || admin.collection("budget_lines").getFirstListItem(`code ~ "FIN-5201" && status = "active"`);
  const CASH = [
    [1, 14, "5206", "Kigali Fuel Station Ltd", 85000, "Fuel for the mission vehicle — Musanze district visit (RAD 412 B)"],
    [2, 10, "5209", "Inzozi Catering Services", 120000, "Refreshments for the Executive Committee meeting"],
  ];
  let cashPaid = 0;
  for (const [m, dd, code, payee, amount, description] of CASH) {
    if (!at(m, dd)) continue;
    const line = await lineFor(code);
    const v = await acc.collection("payment_vouchers").create({ voucher_type: "direct", payee_name: payee, budget_line: line.id, gross_amount: amount, description, payee_bank: {}, notes: "Paid from petty cash against the supplier's receipt." });
    await acc.send(`/api/ims/vouchers/${v.id}/submit`, { method: "POST" });
    await approveAll(await approvalOf("payment_vouchers", v.id));
    await cashier.send(`/api/ims/vouchers/${v.id}/pay`, { method: "POST", body: { method: "cash", account: A["PC-HQ"].id, reference: `PC-${pad(m + 7)}-${dd}`, payment_date: noon(at(m, dd)) } });
    cashPaid++;
  }
  console.log(`  ✓ ${posted} receipts posted, ${moved} transfers, ${cashPaid} petty cash payments`);

  // ---------------------------------------------------------------- statements
  const chargeLine = (await admin.collection("budget_lines").getFirstListItem('code ~ "FIN-5212" && status = "active"').catch(() => null))?.id || "";
  const bankExtras = (code) => {
    const out = [];
    for (const mo of months) {
      const ym = mo.start.slice(0, 7).replace("-", "");
      if (code === "BK-OPS") {
        out.push({ date: mo.end, description: "ACCOUNT MAINTENANCE FEE", reference: `FEE-${ym}`, amount_in: 0, amount_out: 10000 });
        out.push({ date: mo.end, description: "SMS BANKING CHARGES", reference: `SMS-${ym}`, amount_in: 0, amount_out: 2500 });
      } else {
        out.push({ date: mo.end, description: "LEDGER FEE", reference: `LF-${ym}`, amount_in: 0, amount_out: 5000 });
      }
    }
    const last = months[months.length - 1];
    if (code === "BK-OPS") {
      out.push({ date: addDays(last.end, -1), description: "DR CHARGES — DUPLICATE OF FEE", reference: "CHG-DUP-01", amount_in: 0, amount_out: 25000 });
      out.push({ date: addDays(last.end, 2), description: "REVERSAL OF DUPLICATE CHARGE", reference: "CHG-DUP-01", amount_in: 25000, amount_out: 0 });
      out.push({ date: addDays(last.end, 8), description: "CR TRF KAYONZA DISTRICT CONTRIBUTION 2026/27", reference: "KYZ-CONTR-2627", amount_in: 13900000, amount_out: 0 });
    } else {
      out.push({ date: last.end, description: "CREDIT INTEREST", reference: `INT-${last.end.slice(0, 7)}`, amount_in: 95400, amount_out: 0 });
    }
    return out;
  };
  let imported = 0;
  let recorded = 0;
  const openingOf = {};
  for (const code of ["BK-OPS", "BPR-LED"]) {
    let opening = A[code].opening_balance;
    for (const mo of months) {
      const r = await importStatement(acc, A[code], mo.start, mo.end, opening, bankExtras(code));
      recorded += await recordBankItems(acc, A[code], r.id, code === "BK-OPS" ? chargeLine : "");
      opening = r.closing;
      imported++;
    }
    openingOf[code] = opening;
  }

  // ---------------------------------------------------------------- reconciliations
  let recs = 0;
  for (let i = 0; i < months.length; i++) {
    const last = i === months.length - 1;
    await reconcile(acc, A["BK-OPS"], months[i].end, !last, last ? "Prepared from the bank statement received on the 3rd working day; outstanding items reviewed." : "Monthly bank reconciliation.");
    recs++;
  }
  await reconcile(acc, A["BPR-LED"], months[months.length - 1].end, true, "Quarterly reconciliation of the LED programme account (low activity).");
  await reconcile(acc, A["PC-HQ"], months[months.length - 1].end, true, "Cash counted in the safe by the Accountant with the Cashier present; agrees with the cash book.");
  recs += 2;

  // This month so far: the bank statement to mid-month (to match in the demo).
  if (cur.end >= cur.start) {
    await importStatement(acc, A["BK-OPS"], cur.start, cur.end, openingOf["BK-OPS"], bankExtras("BK-OPS"));
    imported++;
  }

  // ---------------------------------------------------------------- work in progress
  const pendingReceipt = ["BK-OPS", "cur", 16, "member", "Gicumbi District", 16400000, "bank_transfer", "GCB-CONTR-2627", "4101", "MC", "Annual member contribution 2026/27"];
  if (at("cur", 16)) {
    const doc = await cashier.collection("cash_receipts").create(receiptBody(pendingReceipt));
    await cashier.send(`/api/ims/treasury/receipts/${doc.id}/submit`, { method: "POST" });
  }
  const draft = ["BK-OPS", "cur", 19, "member", "Ngoma District", 15000000, "cheque", "006021", "4101", "MC", "Annual member contribution 2026/27 (cheque to deposit)"];
  if (at("cur", 19)) await cashier.collection("cash_receipts").create(receiptBody(draft));
  if (at("cur", 20)) {
    const t = await cashier.collection("bank_transfers").create({ from_account: A["BK-OPS"].id, to_account: A["PC-HQ"].id, transfer_date: noon(at("cur", 20)), amount: 150000, method: "cheque", reference: "100259", description: "Petty cash replenishment" });
    await cashier.send(`/api/ims/treasury/transfers/${t.id}/submit`, { method: "POST" });
  }

  const accounts = await admin.collection("bank_accounts").getFullList({ sort: "code" });
  console.log(`  ✓ ${imported} bank statements imported (automatic matching), ${recorded} bank charges / interest recorded from them`);
  console.log(`  ✓ ${recs} reconciliations: past months approved, ${months[months.length - 1].end} for the operating account waiting for the DAF`);
  for (const a of accounts) console.log(`     ${a.code.padEnd(8)} book ${a.book_balance.toLocaleString("en-US").padStart(15)} · ${a.unmatched_bank} statement line(s) to match · reconciled to ${a.reconciled_to ? a.reconciled_to.slice(0, 10) : "—"}`);
}

main().catch((e) => {
  console.error("❌ Bank & cash seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
