#!/usr/bin/env node
/**
 * RALGA demo data — staff expenses and salary advances (Bank & cash, Payables).
 *
 * Run after seed-treasury.mjs (the cash books, their reconciliations and the petty cash replenishments exist):
 *  - the old floats, their transactions, petty cash requests and expense requests of the previous system are removed
 *    (money now moves through the cash books, so the old balances would contradict the ledger)
 *  - expense categories with the account each one is charged to, and the approval workflow
 *    (head of department → Director of Finance)
 *  - requests from staff of several departments this month, at every stage: waiting for the head of department,
 *    waiting for the DAF, returned, rejected, approved and waiting for the Cashier, paid from petty cash or by mobile
 *    money, and a salary advance paid by bank transfer (deducted by the next payroll)
 *
 * Refuses to run against a non-local server unless ALLOW_REMOTE_SEED=1. Password of the demo accounts: password123.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "1") {
  console.error(`Refusing to seed ${PB_URL}: demo data goes to a local server only (set ALLOW_REMOTE_SEED=1 to override).`);
  process.exit(1);
}
const PASSWORD = "password123";
const admin = new PocketBase(PB_URL);
admin.autoCancellation(false);
await admin.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");

const sessions = {};
async function as(email) {
  if (sessions[email]) return sessions[email];
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection("users").authWithPassword(email, PASSWORD);
  return (sessions[email] = pb);
}
const post = (pb, path, body) => pb.send(path, { method: "POST", body: body || {} });
const all = (col, filter) => admin.collection(col).getFullList({ filter: filter || "", batch: 500 });
const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const addDays = (d, n) => iso(new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5));
const monthStart = `${today.slice(0, 7)}-01`;
// payments are dated this month: the cash books are reconciled up to the end of last month
const payDay = (n) => {
  const d = addDays(today, -n);
  return d < monthStart ? monthStart : d;
};
const spentOn = (n) => addDays(today, -n);

console.log("💳 Staff expenses and salary advances");

// ---------------------------------------------------------------- clean slate
const del = async (col, filter) => {
  for (const r of await all(col, filter)) await admin.collection(col).delete(r.id).catch(() => null);
};
// payments already in the cash books would leave their balances behind: the whole chain rebuilds them
if ((await admin.collection("cash_book_entries").getList(1, 1, { filter: 'source_type = "staff_expense"' })).totalItems) {
  console.error("Staff expenses were already paid from the cash books. Run the whole demo seed (npm run seed:ralga) to start again.");
  process.exit(1);
}
const old = await all("prepayments");
for (const r of old) {
  await del("approval_actions", `document_id = "${r.id}"`);
  await del("approval_requests", `document_id = "${r.id}"`);
}
for (const j of await all("gl_journals", 'source_type = "staff_expense"')) {
  await del("gl_journal_lines", `journal = "${j.id}"`);
  await admin.collection("gl_journals").delete(j.id).catch(() => null);
}
await del("budget_ledger", 'source_type = "staff_expense"');
await del("budget_overrides", 'document_type = "staff_expense"');
await del("prepayments");
await del("petty_cash_requests");
await del("accounts_transactions");
await del("accounts");
await del("expenses_categories");
console.log(`  ✓ old floats, petty cash requests and ${old.length} expense requests of the previous system removed`);

// ---------------------------------------------------------------- categories
const gl = async (code) => (await admin.collection("gl_accounts").getFirstListItem(`code = "${code}"`)).id;
const daf = await as("finance@dnr-hr.rw");
const CATEGORIES = [
  ["Local transport (taxi, moto, bus)", "claim", "5207", 50000, "Trips within Kigali or to a district for RALGA business, with the receipt or the trip details."],
  ["Mission accommodation and meals", "claim", "5207", 300000, "When no mission allowance was paid: hotel and meals on a mission, with the receipts."],
  ["Stationery and small office supplies", "claim", "5201", 100000, "Urgent small purchases; larger needs go through a purchase requisition."],
  ["Printing, copying and binding", "claim", "5215", 150000, "Printing for meetings, hearings and events."],
  ["Airtime and internet bundles", "claim", "5203", 30000, "Calls and data for field work, beyond the monthly communication allowance."],
  ["Meeting refreshments", "claim", "5209", 200000, "Water, tea breaks and lunches for meetings organised by RALGA, with the attendance list."],
  ["Small repairs", "claim", "5205", 150000, "Minor repairs that cannot wait for a work order."],
  ["Salary advance", "advance", "", 0, "Deducted in full from the next payslip; at most half of the last net pay; one at a time."],
];
const cat = {};
for (const [name, kind, code, max, description] of CATEGORIES) {
  const c = await daf.collection("expenses_categories").create({ name, kind, gl_account: code ? await gl(code) : "", max_amount: max, description, active: true });
  cat[name] = c.id;
}
console.log(`  ✓ ${CATEGORIES.length} categories, each charged to its expense account (advances to staff advances)`);

// ---------------------------------------------------------------- approval workflow
const roleId = async (code) => (await admin.collection("roles").getFirstListItem(`code = "${code}"`)).id;
const DAF_ROLE = await roleId("DAF");
const SG_ROLE = await roleId("SG");
await del("approval_workflows", 'document_type = "staff_expense"');
await admin.collection("approval_workflows").create({
  name: "Staff expenses and advances", document_type: "staff_expense", active: true, priority: 10, min_amount: 0, max_amount: 0, allow_self_approval: false,
  description: "Head of department, then the Director of Finance. Nobody approves their own request; when the DAF already approved as head of department, the Secretary General gives the second approval.",
  steps: [
    { name: "Head of Department", approver_type: "department_head", fallback_role: SG_ROLE },
    { name: "Director of Finance approval", approver_type: "role", role: DAF_ROLE, fallback_role: SG_ROLE, skip_if_already_approved: true },
  ],
  departments: [], categories: [], branches: [], funding_sources: [],
});
console.log("  ✓ workflow: head of department → Director of Finance");

// ---------------------------------------------------------------- requests
const userOf = async (email) => admin.collection("users").getFirstListItem(`email = "${email}"`);
const headOf = async (email) => {
  const u = await userOf(email);
  const d = await admin.collection("departments").getOne(u.department, { expand: "head" });
  return d.expand.head.email;
};
const act = async (email, request, action, comment) => {
  const r = await admin.collection("prepayments").getOne(request.id);
  return post(await as(email), `/api/dnr/approvals/${r.approval}/act`, { action, comment });
};
const lastNet = async (email) => {
  const u = await userOf(email);
  const slip = (await admin.collection("employees_payrolls").getList(1, 1, { filter: `employee = "${u.id}" && (payroll_status = "approved" || payroll_status = "paid")`, sort: "-period_year,-period_month" })).items[0];
  return slip ? Math.round(slip.net_sallary || 0) : 0;
};

const CASHIER = await as("cashier@dnr-hr.rw");
const bank = async (code) => (await admin.collection("bank_accounts").getFirstListItem(`code = "${code}"`)).id;
const PETTY = await bank("PC-HQ");
const OPS = await bank("BK-OPS");

// [who, category, amount, spent days ago, description, pay by, target, payment: [method, account, days ago, reference]]
const REQUESTS = [
  ["employee@dnr-hr.rw", "Local transport (taxi, moto, bus)", 12000, 8, "Moto taxis Kimihurura–Nyarugenge and back for the capacity assessment meeting at the City of Kigali", "mobile_money", "paid", ["mobile_money", OPS, 6, "MP-1016-A12345"]],
  ["david.uwimana7@dnr-hr.rw", "Meeting refreshments", 84000, 15, "Tea break and water for 28 participants at the training of district planners in Musanze", "cash", "paid", ["cash", PETTY, 13, "PCV-01"]],
  ["michel.umuhoza12@dnr-hr.rw", "Airtime and internet bundles", 15000, 21, "Internet bundle for the week of remote data collection with the districts", "mobile_money", "paid", ["mobile_money", OPS, 19, "MP-1003-B67890"]],
  ["patrick.mukeshimana.4@dnr-hr.rw", "Stationery and small office supplies", 38000, 9, "Flip charts, markers and name tags for the media engagement workshop", "cash", "paid", ["cash", PETTY, 7, "PCV-02"]],
  ["eric.tuyishime.2@dnr-hr.rw", "Airtime and internet bundles", 10000, 18, "Airtime for calls to districts during the financial system support week", "cash", "paid", ["cash", PETTY, 16, "PCV-03"]],
  ["paul.mugabo11@dnr-hr.rw", "Printing, copying and binding", 46500, 13, "Printing and binding 30 copies of the decentralisation policy brief for the Senate hearing", "mobile_money", "approved"],
  ["catherine.nkurunziza9@dnr-hr.rw", "Mission accommodation and meals", 165000, 10, "Two nights in Rubavu supervising the district recruitment examinations (accommodation and meals)", "mobile_money", "approved"],
  ["chantal.mukeshimana.34@dnr-hr.rw", "Local transport (taxi, moto, bus)", 24000, 6, "Taxis to the Supreme Court registry and back to file RALGA's submissions (two trips)", "mobile_money", "with_daf"],
  ["eric.tuyishime.2@dnr-hr.rw", "Small repairs", 55000, 4, "Replacement power adapter for a network switch and RJ45 connectors in the server room", "cash", "with_hod"],
  ["employee@dnr-hr.rw", "Printing, copying and binding", 18000, 3, "Attendance sheets and certificates for the capacity-building webinar", "cash", "with_hod"],
  ["paul.mugabo11@dnr-hr.rw", "Meeting refreshments", 120000, 5, "Lunch for the policy dialogue with district executive secretaries (25 people)", "mobile_money", "returned"],
  ["david.uwimana7@dnr-hr.rw", "Local transport (taxi, moto, bus)", 30000, 12, "Bus tickets Kigali–Huye and back for the training follow-up visit", "mobile_money", "rejected"],
  ["catherine.nkurunziza9@dnr-hr.rw", "Salary advance", 150000, 16, "Hospital bill for my child's surgery at King Faisal Hospital", "bank_transfer", "paid", ["bank_transfer", OPS, 14, "FT26-0045-RALGA"]],
  ["patrick.mukeshimana.4@dnr-hr.rw", "Salary advance", 100000, 2, "School fees for the third term", "mobile_money", "with_hod"],
];

const counts = {};
for (const [email, category, amount0, ago, description, payBy, target, payment] of REQUESTS) {
  const me = await as(email);
  const user = me.authStore.model;
  let amount = amount0;
  if (category === "Salary advance") {
    const net = await lastNet(email);
    if (net) amount = Math.min(amount, Math.floor(net / 2 / 1000) * 1000);
  }
  const r = await post(me, "/api/ims/staff-expenses", {
    category: cat[category], amount, date: spentOn(ago), description, pay_by: payBy,
    momoNumber: payBy === "mobile_money" ? (user.phone && /^(\+?250|0)?7[2389]\d{7}$/.test(String(user.phone).replace(/\s+/g, "")) ? user.phone : "0788" + String(100000 + (ago * 7919) % 900000)) : "",
    momoName: user.name,
  });
  const head = await headOf(email);
  if (target === "returned") {
    await act(head, r, "return", "Attach the restaurant's receipt and the attendance list, then send it again.");
  } else if (target === "rejected") {
    await act(head, r, "approve", "The trip took place.");
    await act("finance@dnr-hr.rw", r, "reject", "The trip was covered by the mission allowance already paid for this visit; it cannot be claimed twice.");
  } else if (target !== "with_hod") {
    await act(head, r, "approve", "Checked with the activity plan.");
    if (target !== "with_daf") await act("finance@dnr-hr.rw", r, "approve", "Within the budget line.");
  }
  if (target === "paid") {
    // paid today, after it was sent and approved (the cash books are reconciled up to last month)
    const [method, account, , reference] = payment;
    await post(CASHIER, `/api/ims/staff-expenses/${r.id}/pay`, { method, account, date: today, reference });
  }
  counts[target] = (counts[target] || 0) + 1;
}
const word = { paid: "paid", approved: "approved, waiting for the Cashier", with_daf: "with the DAF", with_hod: "with the head of department", returned: "returned", rejected: "rejected" };
console.log(`  ✓ ${REQUESTS.length} requests: ${Object.entries(counts).map(([k, n]) => `${n} ${word[k]}`).join(", ")}`);
const paid = await all("prepayments", 'status = "paid"');
console.log(`  ✓ paid RWF ${paid.reduce((t, r) => t + Math.round(r.amount), 0).toLocaleString("en")} from petty cash, mobile money and bank, each with its journal`);
