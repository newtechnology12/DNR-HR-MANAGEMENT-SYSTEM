#!/usr/bin/env node
/**
 * DNR HR Management System — local demo data seeder
 *
 * Makes a LOCAL PocketBase instance fully explorable:
 *   1. Takes a PocketBase backup first (restorable from Admin UI → Settings → Backups)
 *   2. Creates every collection the frontend uses that is missing, with proper relation fields
 *   3. Grants the Admin role every permission, and sensible subsets to the other roles
 *   4. Creates demo login accounts (see DEMO_ACCOUNTS below)
 *   5. Fills every module with realistic data (attendance, leaves, payroll, assets, finance, ...)
 *
 * Safe to re-run: demo records in the operational collections are wiped and regenerated,
 * existing users/departments/branches/designations are kept.
 *
 * Usage (PocketBase must be running):
 *   npm run seed:demo
 *   PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... npm run seed:demo
 */
import PocketBase from "pocketbase";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, ROLE, RETIRED_ROLES, DEMO_ACCOUNTS as IMS_ACCOUNTS, DEMO_PASSWORD as IMS_PASSWORD, permitionsFor, checkMatrix } from "./ims/roles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL);
if (!isLocal && !process.env.PB_ADMIN_PASSWORD) {
  console.error("Refusing to use default admin credentials against a non-local PocketBase. Set PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD.");
  process.exit(1);
}
if (!isLocal && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`PB_URL (${PB_URL}) is not local. This script wipes demo collections — set ALLOW_REMOTE_SEED=true if you really mean it.`);
  process.exit(1);
}
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "admin123456";

export const DEMO_PASSWORD = IMS_PASSWORD;
// One demo login per RALGA IMS role (scripts/ims/roles.mjs); placement is refined by seed-org-ralga.mjs.
const DEMO_ACCOUNTS = IMS_ACCOUNTS.map((a) => ({ email: a.email, name: a.name, role: ROLE[a.code], code: a.code, designation: a.designation, salary: a.salary }));

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// ------------------------------------------------------------------ helpers
let seed = 20260923;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[int(0, arr.length - 1)];
const chance = (p) => rand() < p;
const iso = (d) => new Date(d).toISOString().replace("T", " ");
const day = (offset, h = 0, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const money = (min, max, step = 1000) => Math.round(int(min, max) / step) * step;

async function pool(items, fn, size = 12) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

const AUTH = '@request.auth.id != ""';

// ------------------------------------------------------------------ schema
const f = {
  text: (name) => ({ name, type: "text", required: false, options: { min: null, max: null, pattern: "" } }),
  num: (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } }),
  bool: (name) => ({ name, type: "bool", required: false, options: {} }),
  date: (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } }),
  json: (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } }),
  file: (name, maxSelect = 1) => ({
    name, type: "file", required: false,
    options: { maxSelect, maxSize: 10485760, mimeTypes: [], thumbs: [], protected: false },
  }),
  rel: (name, target, maxSelect = 1) => ({
    name, type: "relation", required: false,
    options: { collection: target, cascadeDelete: false, minSelect: null, maxSelect, displayFields: null },
  }),
};
const { text, num, bool, date, json, file, rel } = f;
const audit = [rel("created_by", "users"), rel("approved_by", "users"), rel("rejected_by", "users"), text("rejected_reason")];

// Order matters: targets before the collections that reference them.
// `later` fields are added in a second pass to break relation cycles.
const COLLECTIONS = [
  { name: "expenses_categories", schema: [text("name"), text("description"), rel("created_by", "users")] },
  { name: "deductions", schema: [text("name"), num("percentage"), text("description"), rel("created_by", "users")] },
  {
    name: "accounts",
    schema: [text("name"), text("description"), text("feeType"), num("feesPercentage"), json("feeRanges"), num("currentBalance"), text("status"), rel("created_by", "users")],
  },
  {
    name: "accounts_transactions",
    schema: [num("amount"), date("date"), rel("account", "accounts"), text("transactionType"), text("notes"), num("feeAmount"), num("balanceAfter")],
    later: [rel("expense", "prepayments")],
  },
  {
    name: "prepayments",
    schema: [
      rel("employee", "users"), rel("expenseCategory", "expenses_categories"), rel("account", "accounts"),
      num("amount"), date("date"), text("description"), text("momoNumber"), text("momoName"), file("attachment"),
      text("status"), text("reason"), text("position"), date("deduction_date"), rel("requested_by", "users"),
      rel("account_transaction", "accounts_transactions"), ...audit,
    ],
    later: [rel("payroll", "employees_payrolls")],
  },
  {
    name: "petty_cash_requests",
    schema: [num("amount"), text("notes"), rel("account", "accounts"), rel("employee", "users"), rel("requested_by", "users"), text("status"), ...audit.slice(1)],
  },
  {
    name: "payrolls",
    schema: [
      num("total_gross"), num("total_net"), num("month"), num("year"), num("date"), text("period_cycle"), text("notes"),
      num("prepayments_covered"), rel("branch", "branches"), rel("prepayments", "prepayments", 999), rel("created_by", "users"),
    ],
    later: [rel("payslips", "employees_payrolls", 999)],
  },
  {
    name: "employees_payrolls",
    schema: [rel("employee", "users"), rel("payroll", "payrolls"), num("gross_salary"), num("net_sallary"), num("deductions_amount"), json("deductions"), rel("prepayments", "prepayments", 999)],
  },
  {
    name: "perfomance_evaluations",
    schema: [rel("employee", "users"), text("period_month"), text("period_year"), json("period_assessment"), json("perfomance_standards"), text("comment"), num("score"), rel("created_by", "users")],
  },
  { name: "assets_categories", schema: [text("name"), text("description"), rel("created_by", "users")] },
  { name: "assets_types", schema: [text("name"), text("description"), rel("category", "assets_categories"), rel("created_by", "users")] },
  {
    name: "assets",
    schema: [
      text("name"), text("code"), text("serial_number"), text("notes"), text("status"), num("cost"), date("purchased_at"), date("assigned_at"),
      rel("category", "assets_categories"), rel("type", "assets_types"), rel("assigned_to", "users"), rel("created_by", "users"),
    ],
  },
  { name: "assets_requests", schema: [text("notes"), rel("asset", "assets"), rel("requested_by", "users"), text("status"), ...audit.slice(1)] },
  {
    name: "assets_allocations",
    schema: [text("name"), text("code"), text("serial_number"), text("type"), text("status"), text("notes"), date("assigned_at"), rel("assigned_to", "users"), rel("created_by", "users")],
  },
  { name: "employee_documents", schema: [text("name"), text("type"), file("attachment"), rel("employee", "users"), rel("created_by", "users")] },
  {
    name: "leaves",
    recreateIfText: "employee",
    schema: [
      rel("employee", "users"), text("type"), text("status"), date("start"), date("end"), num("days"), num("Leaveduration"),
      text("reason"), text("contact_during_leave"), text("emergency_contact"), file("attachment"), ...audit,
    ],
  },
  {
    name: "LeavePlane",
    schema: [rel("employee", "users"), text("type"), text("status"), date("start"), date("end"), num("Leaveduration"), text("reason"), rel("created_by", "users")],
  },
  {
    name: "LeavePlaneReport",
    schema: [
      text("userId"), num("totalLeaveDays"), num("totalLeaveTaken"), num("openingBalance"), num("balance"),
      ...["april", "may", "june", "july", "august", "september", "october", "november", "december"].map(num),
    ],
  },
  {
    name: "attendance",
    recreateIfText: "employee",
    schema: [rel("employee", "users"), rel("branch", "branches"), text("type"), date("date"), date("clockin_time"), date("clockout_time"), text("behaviour"), text("notes")],
  },
  {
    name: "cars",
    schema: [text("carName"), text("carModel"), text("carType"), text("carColor"), num("carPrice"), text("carDescription"), bool("carStatus"), text("carowner"), text("carownerId"), text("plateNumber")],
  },
  {
    name: "CarRequests",
    recreateIfText: "employee",
    schema: [
      rel("employee", "users"), rel("users", "users"), rel("car", "cars"), text("fromLocation"), text("toLocation"), text("purpose"), text("position"),
      date("startTime"), date("endTime"), date("start"), date("end"), num("passengerCount"), bool("needsDriver"),
      num("starting_km"), num("ending_km"), num("totalKm"), num("expense_amount"), num("totalExpenses"), text("status"), text("reason"), ...audit,
    ],
  },
  { name: "serviceCategories", schema: [text("name"), text("description")] },
  { name: "clients", schema: [text("name"), text("email"), text("phone"), text("address"), text("industry"), text("contact_person")] },
  {
    name: "weeklyPlans",
    schema: [
      text("reference_number"), text("service_category"), text("client_name"), text("engagement_title"), text("engagement_status"),
      text("director"), text("partner"), text("manager"), text("team_leader"), date("engagement_contractual_deadline"), date("firm_deadline"),
      text("observations"), rel("department", "departments"), rel("branch", "branches"),
    ],
  },
  {
    name: "actionPlans",
    schema: [
      text("planType"), text("title"), text("task_description"), date("start_date"), date("end_date"), date("deadline"), text("priority"), text("status"),
      rel("department_id", "departments"), rel("staff_id", "users"), json("hoursPerDay"), file("files", 10), rel("created_by", "users"),
    ],
  },
  {
    name: "employeeReports",
    schema: [
      text("reportType"), text("employeeName"), text("department"), date("reportDate"), date("dateHappened"), text("tasksCompleted"),
      text("challengesFaced"), text("nextSteps"), text("additionalComments"), text("plane"), file("fileUpload"), rel("created_by", "users"),
    ],
  },
];

const SETTINGS_FIELDS = [
  text("payroll_period_cycle"), text("payroll_date"), text("clock_in_time"), text("clock_out_time"),
  text("lunch_start_time"), text("lunch_end_time"), text("lunch_break_start"), num("lunch_break_duration"),
  text("smtp_host"), num("smtp_port"), text("smtp_username"), text("smtp_password"), text("smtp_encryption"),
  text("smtp_from_email"), text("smtp_from_name"),
];

async function ensureSchema() {
  const existing = new Map((await pb.collections.getFullList()).map((c) => [c.name, c]));
  const idOf = (name) => {
    const c = existing.get(name);
    if (!c) throw new Error(`Relation target "${name}" not found`);
    return c.id;
  };
  const resolve = (field) =>
    field.type === "relation"
      ? { ...field, options: { ...field.options, collectionId: idOf(field.options.collection), collection: undefined } }
      : field;

  // Drop old demo collections whose relation fields were created as plain text (they can't be expanded).
  for (const def of [...COLLECTIONS].reverse()) {
    const c = existing.get(def.name);
    const field = def.recreateIfText && c?.schema.find((s) => s.name === def.recreateIfText);
    if (field && field.type === "text") {
      console.log(`  ↻ rebuilding ${def.name} (relation fields were stored as text)`);
      await pb.collections.delete(c.id);
      existing.delete(def.name);
    }
  }

  for (const def of COLLECTIONS) {
    const rules = { listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH };
    const c = existing.get(def.name);
    if (!c) {
      const created = await pb.collections.create({ name: def.name, type: "base", schema: def.schema.map(resolve), ...rules });
      existing.set(def.name, created);
      console.log(`  + created ${def.name}`);
    } else {
      const missing = def.schema.filter((s) => !c.schema.some((e) => e.name === s.name));
      if (missing.length) {
        // Keep existing API rules: later migrations tighten them (e.g. employee portal privacy).
        const updated = await pb.collections.update(c.id, { schema: [...c.schema, ...missing.map(resolve)] });
        existing.set(def.name, updated);
        console.log(`  ~ ${def.name}: added ${missing.map((m) => m.name).join(", ")}`);
      }
    }
  }
  for (const def of COLLECTIONS.filter((d) => d.later)) {
    const c = existing.get(def.name);
    const missing = def.later.filter((s) => !c.schema.some((e) => e.name === s.name));
    if (missing.length) {
      existing.set(def.name, await pb.collections.update(c.id, { schema: [...c.schema, ...missing.map(resolve)] }));
    }
  }
  const settings = existing.get("settings");
  const missingSettings = SETTINGS_FIELDS.filter((s) => !settings.schema.some((e) => e.name === s.name));
  if (missingSettings.length) {
    await pb.collections.update(settings.id, { schema: [...settings.schema, ...missingSettings] });
    console.log(`  ~ settings: added ${missingSettings.length} fields`);
  }
}

// ------------------------------------------------------------------ data
async function wipe(names) {
  for (const name of names) {
    const ids = await pb.collection(name).getFullList({ fields: "id" });
    await pool(ids, (r) => pb.collection(name).delete(r.id));
  }
}

/**
 * The 13 RALGA IMS roles (spec §1): legacy roles are renamed in place (so every existing relation and
 * workflow keeps working), missing ones are created, retired ones are emptied and removed, and the
 * seeded permission matrix (spec §2) is applied. Superuser writes bypass the maker–checker rule.
 */
async function seedRoles() {
  const problems = checkMatrix();
  if (problems.length) throw new Error(`Permission matrix is inconsistent:\n  ${problems.join("\n  ")}`);
  let roles = await pb.collection("roles").getFullList();
  for (const def of ROLES) {
    const existing =
      roles.find((r) => r.code === def.code) ||
      roles.find((r) => r.name === def.name) ||
      roles.find((r) => def.legacy.includes(r.name));
    const data = {
      name: def.name, code: def.code, description: def.description, sort_order: def.sort, is_system: true,
      procurement_scope: def.procurement_scope, hr_scope: def.hr_scope, permitions: permitionsFor(def.code),
    };
    if (existing) await pb.collection("roles").update(existing.id, data);
    else await pb.collection("roles").create(data);
  }
  roles = await pb.collection("roles").getFullList();
  const byCode = Object.fromEntries(roles.filter((r) => r.code).map((r) => [r.code, r]));
  // Retired roles: holders become Staff / Requester, then the role is removed.
  for (const r of roles.filter((x) => RETIRED_ROLES.includes(x.name) || (!x.code && !ROLES.some((d) => d.name === x.name)))) {
    const holders = await pb.collection("users").getFullList({ filter: `role = "${r.id}"`, fields: "id" });
    await pool(holders, (u) => pb.collection("users").update(u.id, { role: byCode.STAFF.id }));
    await pb.collection("roles").delete(r.id).catch(() => null);
  }
  roles = await pb.collection("roles").getFullList();
  console.log(`  ✓ ${roles.length} RALGA IMS roles with the seeded permission matrix`);
  return Object.fromEntries(roles.map((r) => [r.name, r.id]));
}

/** Default approval limits (whole RWF; Finance can change them under Settings → Approval limits). */
async function seedApprovalLimits(roleIds) {
  const LIMITS = [
    ["DAF", "purchase_requisition", 5000000], ["DAF", "purchase_order", 5000000], ["DAF", "payment_voucher", 5000000],
    ["DAF", "supplier_invoice", 20000000], ["DAF", "contract", 10000000],
    ["SG", "", 0],
  ];
  for (const [code, document_type, max] of LIMITS) {
    const role = roleIds[ROLE[code]];
    const existing = await pb.collection("approval_limits").getFirstListItem(`role = "${role}" && document_type = "${document_type}"`).catch(() => null);
    const data = { role, document_type, min_amount: 0, max_amount: max, active: true, notes: max ? "Above this amount the Secretary General also approves." : "No upper limit." };
    if (existing) await pb.collection("approval_limits").update(existing.id, data);
    else await pb.collection("approval_limits").create(data);
  }
  console.log(`  ✓ approval limits: DAF up to RWF 5M on requisitions, POs and vouchers (SG above)`);
}

const FIRST = ["Jean", "Aline", "Eric", "Diane", "Patrick", "Claudine", "Emmanuel", "Josiane", "Olivier", "Chantal", "Innocent", "Solange", "Fabrice", "Vestine", "Kevin", "Yvonne", "Samuel", "Denise", "Thierry", "Florence", "Didier", "Esperance", "Gilbert", "Beatha", "Moses"];
const LAST = ["Habimana", "Uwase", "Mugisha", "Ingabire", "Niyonzima", "Mukamana", "Nshimiyimana", "Uwimana", "Hakizimana", "Umutoni", "Bizimana", "Iradukunda", "Ndayisaba", "Mukeshimana", "Tuyishime"];

async function seedUsers(roleIds) {
  const [departments, designations, branches] = await Promise.all(
    ["departments", "designations", "branches"].map((c) => pb.collection(c).getFullList())
  );
  const byEmail = new Map((await pb.collection("users").getFullList()).map((u) => [u.email, u]));
  const hq = branches.find((b) => /kigali|head/i.test(b.name)) || branches[0];
  const designationNamed = (n) => designations.find((d) => d.name.toLowerCase() === n.toLowerCase()) || pick(designations);

  const base = (i, overrides) => ({
    emailVisibility: true,
    password: DEMO_PASSWORD,
    passwordConfirm: DEMO_PASSWORD,
    status: "Active",
    gender: i % 2 ? "Female" : "Male",
    nationality: "Rwandan",
    country: "Rwanda",
    address: pick(["Kigali, Gasabo", "Kigali, Kicukiro", "Kigali, Nyarugenge", "Musanze", "Huye", "Rubavu"]),
    phone: `+25078${int(1000000, 9999999)}`,
    national_id: `1${int(1970, 2000)}8${int(100000000, 999999999)}`,
    birth: iso(new Date(int(1975, 2000), int(0, 11), int(1, 28))),
    joined_at: iso(day(-int(60, 2500))),
    employment_type: pick(["permanent", "permanent", "permanent", "contract", "internship"]),
    bank_name: pick(["Bank of Kigali", "Equity Bank", "I&M Bank", "BPR Bank", "Ecobank"]),
    bank_account_number: `${int(10000000, 99999999)}${int(1000, 9999)}`,
    ...overrides,
  });

  // Demo login accounts — password is (re)set every run so the default login always works.
  for (const [i, acc] of DEMO_ACCOUNTS.entries()) {
    const data = base(i, {
      name: acc.name, names: acc.name, email: acc.email, role: roleIds[acc.role],
      designation: designationNamed(acc.designation).id, department: departments[i % departments.length].id,
      branch: hq.id, salary: String(acc.salary), username: `demo_${acc.email.split("@")[0].replace(/\W/g, "")}`,
    });
    const existing = byEmail.get(acc.email);
    if (existing) await pb.collection("users").update(existing.id, { role: data.role, password: DEMO_PASSWORD, passwordConfirm: DEMO_PASSWORD, status: "Active" });
    else await pb.collection("users").create(data);
  }

  // Extra employees so tables, charts and payroll look realistic.
  let created = 0;
  for (let i = 0; i < 38; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const email = `${first}.${last}.${i}@dnr-hr.rw`.toLowerCase();
    if (byEmail.has(email)) continue;
    const designation = pick(designations);
    await pb.collection("users").create(
      base(i, {
        name: `${first} ${last}`, names: `${first} ${last}`, email, username: `${first}${last}${i}`.toLowerCase(),
        role: roleIds[ROLE.STAFF],
        designation: designation.id,
        department: departments.find((d) => d.id === designation.department)?.id || pick(departments).id,
        branch: chance(0.6) ? hq.id : pick(branches).id,
        salary: String(money(350000, 2200000, 5000)),
        status: chance(0.93) ? "Active" : "Inactive",
      })
    );
    created++;
  }
  // Every seeded user should be able to log in with the demo password. One person per functional role:
  // demo accounts keep their role (+ Staff / Requester as an extra role, except the read-only roles);
  // everyone else is Staff / Requester (department heads get Head of Department in seed-org-ralga.mjs).
  const demoRole = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.email, a]));
  const NOT_STAFF = ["STAFF", "INTERNAL_AUDITOR", "MGMT_VIEWER"];
  const before = await pb.collection("users").getFullList();
  await pool(before.filter((u) => /@dnr-hr\.rw$/.test(u.email)), (u) => {
    const acc = demoRole[u.email];
    const data = { password: DEMO_PASSWORD, passwordConfirm: DEMO_PASSWORD, salary: u.salary || String(money(400000, 1500000, 5000)) };
    if (acc) Object.assign(data, { name: acc.name, names: acc.name, role: roleIds[acc.role], extra_roles: NOT_STAFF.includes(acc.code) ? [] : [roleIds[ROLE.STAFF]] });
    else Object.assign(data, { role: roleIds[ROLE.STAFF], extra_roles: [] });
    return pb.collection("users").update(u.id, data);
  });
  const all = await pb.collection("users").getFullList({ expand: "role" });
  console.log(`  ✓ users: ${created} new, ${all.length} total, ${DEMO_ACCOUNTS.length} demo logins (one per role)`);
  return { users: all, departments, branches, hq };
}

async function seedSettings() {
  const s = await pb.collection("settings").getList(1, 1);
  const data = {
    company_name: "DNR Partners CPA", company_email: "hr@dnrpartners.rw", company_phone: "+250 788 123 456",
    company_address: "KG 7 Ave, Kigali, Rwanda", work_start_time: "08:00", work_end_time: "17:00",
    clock_in_time: "08:00", clock_out_time: "17:00", lunch_start_time: "12:30", lunch_end_time: "13:30",
    lunch_break_start: "12:30", lunch_break_duration: 60, early_clockin_mins: 15, late_threshold_mins: 10,
    leaves_per_year: 18, working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    payroll_period_cycle: "monthly", payroll_date: "25", currency: "RWF", timezone: "Africa/Kigali",
    smtp_host: "smtp.example.com", smtp_port: 587, smtp_encryption: "tls", smtp_from_email: "no-reply@dnrpartners.rw", smtp_from_name: "DNR HR",
  };
  if (s.items[0]) await pb.collection("settings").update(s.items[0].id, data);
  else await pb.collection("settings").create(data);
}

async function seedAttendance(users) {
  const active = users.filter((u) => u.status === "Active");
  const rows = [];
  for (let offset = -45; offset <= 0; offset++) {
    const d = day(offset);
    if (isWeekend(d)) continue;
    for (const u of active) {
      if (chance(0.08)) continue; // absent
      const late = chance(0.18);
      const inAt = day(offset, late ? 8 : 7, late ? int(11, 59) : int(30, 59));
      const outAt = offset === 0 && chance(0.5) ? null : day(offset, int(16, 18), int(0, 59));
      rows.push({
        employee: u.id, branch: u.branch, type: chance(0.85) ? "biometric" : "manual",
        date: iso(day(offset)), clockin_time: iso(inAt), clockout_time: outAt ? iso(outAt) : "",
        behaviour: late ? "late" : "early", notes: late ? pick(["Traffic", "Client visit in the morning", "Medical appointment", ""]) : "",
      });
    }
  }
  await pool(rows, (r) => pb.collection("attendance").create(r), 16);
  console.log(`  ✓ attendance: ${rows.length}`);
}

const weekday = (d) => { const w = d.getDay(); return w === 6 ? new Date(d.getTime() + 2 * 864e5) : w === 0 ? new Date(d.getTime() + 864e5) : d; };
const LEAVE_TYPES = ["Annual Leave", "Annual Leave", "Annual Leave", "Sick Leave", "Sick Leave", "Maternity Leave", "Paternity Leave", "Study Leave", "Compassionate Leave", "Unpaid Leave"];
async function seedLeaves(users, approvers) {
  const rows = [];
  for (let i = 0; i < 70; i++) {
    const u = pick(users);
    const start = weekday(day(int(-120, 45)));
    const days = int(2, 12);
    const status = start > new Date() ? pick(["pending", "pending", "approved"]) : pick(["approved", "approved", "approved", "rejected", "pending"]);
    rows.push({
      employee: u.id, type: pick(LEAVE_TYPES), status, start: iso(start), end: iso(new Date(start.getTime() + days * 864e5)),
      days, Leaveduration: days, reason: pick(["Family event", "Medical treatment", "Annual vacation", "Exam preparation", "Wedding", "Rest and recovery", "Travel upcountry"]),
      contact_during_leave: u.phone, emergency_contact: `+25078${int(1000000, 9999999)}`, created_by: u.id,
      approved_by: status === "approved" ? pick(approvers).id : "", rejected_by: status === "rejected" ? pick(approvers).id : "",
      rejected_reason: status === "rejected" ? "Overlaps with audit season deadlines" : "",
    });
  }
  const plans = users.slice(0, 30).map((u) => {
    const start = weekday(day(int(10, 200)));
    const d = int(3, 15);
    return { employee: u.id, type: "Annual Leave", status: pick(["pending", "approved"]), start: iso(start), end: iso(new Date(start.getTime() + d * 864e5)), Leaveduration: d, reason: "Planned annual leave", created_by: u.id };
  });
  const months = ["april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const reports = users.map((u) => {
    const taken = Object.fromEntries(months.map((m) => [m, chance(0.25) ? int(1, 5) : 0]));
    const totalTaken = Object.values(taken).reduce((a, b) => a + b, 0);
    const opening = int(0, 5);
    return { userId: u.id, totalLeaveDays: 18, openingBalance: opening, totalLeaveTaken: totalTaken, balance: 18 + opening - totalTaken, ...taken };
  });
  await pool(rows, (r) => pb.collection("leaves").create(r));
  await pool(plans, (r) => pb.collection("LeavePlane").create(r));
  await pool(reports, (r) => pb.collection("LeavePlaneReport").create(r));
  console.log(`  ✓ leaves: ${rows.length}, leave plans: ${plans.length}, leave balances: ${reports.length}`);
}

async function seedFinance(users, approvers, hq) {
  const deductions = await pool(
    [
      { name: "RSSB Pension", percentage: 6, description: "Employee pension contribution (RSSB)" },
      { name: "Maternity Leave", percentage: 0.3, description: "Maternity leave scheme contribution" },
      { name: "CBHI", percentage: 0.5, description: "Community-based health insurance" },
      { name: "PAYE", percentage: 20, description: "Pay-as-you-earn income tax (flat demo rate)" },
    ],
    (d) => pb.collection("deductions").create({ ...d, created_by: approvers[0].id })
  );
  const categories = await pool(
    ["Transport", "Office Supplies", "Client Meals", "Communication", "Training", "Accommodation", "Printing", "Salary Advance"],
    (name) => pb.collection("expenses_categories").create({ name, description: `${name} expenses`, created_by: approvers[0].id })
  );
  const accounts = await pool(
    [
      { name: "Main Petty Cash", feeType: "NONE", currentBalance: 9000000 },
      { name: "MTN MoMo Account", feeType: "RANGE", currentBalance: 7000000, feeRanges: [{ min: 0, max: 100000, fee: 500 }, { min: 100001, max: 1000000, fee: 2500 }] },
      { name: "Airtel Money Account", feeType: "PERCENTAGE", feesPercentage: 1, currentBalance: 5000000 },
      { name: "Branch Cash Box", feeType: "NONE", currentBalance: 4000000 },
    ],
    (a) => pb.collection("accounts").create({ description: `${a.name} for daily operational expenses`, feesPercentage: 0, feeRanges: [], status: "active", created_by: approvers[0].id, ...a })
  );

  let prepayments = [];
  for (let i = 0; i < 80; i++) {
    const u = pick(users);
    const status = pick(["pending", "pending", "approved", "approved", "approved", "rejected"]);
    prepayments.push({
      employee: u.id, requested_by: u.id, created_by: u.id, expenseCategory: pick(categories).id, account: pick(accounts).id,
      amount: money(5000, 250000, 500), date: iso(day(-int(0, 75))), status, momoNumber: u.phone, momoName: u.name,
      description: pick(["Taxi to client site", "Printing audit files", "Airtime for client calls", "Lunch meeting with client", "Workshop registration", "Hotel in Musanze for field audit"]),
      deduction_date: iso(day(int(5, 40))),
      approved_by: status === "approved" ? pick(approvers).id : "", rejected_by: status === "rejected" ? pick(approvers).id : "",
      rejected_reason: status === "rejected" ? "Missing receipt" : "",
    });
  }
  prepayments = await pool(prepayments, (p) => pb.collection("prepayments").create(p));

  // Post approved expenses to their account ledger, like the approval flow does.
  const balances = Object.fromEntries(accounts.map((a) => [a.id, a.currentBalance]));
  for (const a of accounts) {
    await pb.collection("accounts_transactions").create({ account: a.id, amount: a.currentBalance, date: iso(day(-80)), transactionType: "refill", notes: "Opening float", feeAmount: 0, balanceAfter: a.currentBalance });
  }
  for (const p of prepayments.filter((p) => p.status === "approved").sort((a, b) => a.date.localeCompare(b.date))) {
    balances[p.account] -= p.amount;
    const t = await pb.collection("accounts_transactions").create({
      account: p.account, amount: p.amount, date: p.date, expense: p.id, transactionType: "expense", notes: p.description, feeAmount: 0, balanceAfter: balances[p.account],
    });
    await pb.collection("prepayments").update(p.id, { account_transaction: t.id });
  }
  await pool(accounts, (a) => pb.collection("accounts").update(a.id, { currentBalance: balances[a.id] }));

  const cashRequests = Array.from({ length: 30 }, () => {
    const u = pick(users);
    const status = pick(["pending", "pending", "approved", "rejected"]);
    return {
      amount: money(20000, 400000, 1000), account: pick(accounts).id, employee: u.id, requested_by: u.id, status,
      notes: pick(["Office supplies restock", "Fuel for field audit", "Team lunch - year end closing", "Courier fees", "Water and refreshments"]),
      approved_by: status === "approved" ? pick(approvers).id : "", rejected_by: status === "rejected" ? pick(approvers).id : "",
      rejected_reason: status === "rejected" ? "Budget exceeded for this month" : "",
    };
  });
  await pool(cashRequests, (r) => pb.collection("petty_cash_requests").create(r));

  // Payrolls for the last 3 completed months (HQ branch), mirroring NewPayroll.tsx's maths.
  const hqStaff = users.filter((u) => u.branch === hq.id && u.status === "Active");
  for (let back = 3; back >= 1; back--) {
    const period = new Date();
    period.setDate(1);
    period.setMonth(period.getMonth() - back);
    const payroll = await pb.collection("payrolls").create({
      month: period.getMonth() + 1, year: period.getFullYear(), date: 25, period_cycle: "monthly", branch: hq.id,
      notes: `Payroll for ${period.toLocaleString("en-US", { month: "long", year: "numeric" })}`, created_by: approvers[0].id,
      total_gross: 0, total_net: 0, prepayments_covered: 0,
    });
    const slips = await pool(hqStaff, (u) => {
      const gross = Number(u.salary) || 0;
      const deducts = deductions.map((d) => ({ name: d.name, amount: Math.round((gross * d.percentage) / 100) }));
      const deductionsAmount = deducts.reduce((a, d) => a + d.amount, 0);
      return pb.collection("employees_payrolls").create({
        employee: u.id, payroll: payroll.id, gross_salary: gross, deductions: deducts, deductions_amount: deductionsAmount, net_sallary: gross - deductionsAmount, prepayments: [],
      });
    });
    await pb.collection("payrolls").update(payroll.id, {
      payslips: slips.map((s) => s.id),
      total_gross: slips.reduce((a, s) => a + s.gross_salary, 0),
      total_net: slips.reduce((a, s) => a + s.net_sallary, 0),
    });
  }
  console.log(`  ✓ finance: ${prepayments.length} expenses, ${accounts.length} accounts, ${cashRequests.length} petty cash requests, 3 payrolls × ${hqStaff.length} payslips`);
}

// Same criteria and 0/3/6/9/12 scale as src/pages/dashboard/PerfomanceForm.tsx (objectives max 60, standards max 40).
const ASSESSMENT = ["Demonstrated Knowledge of duties & Quality of Work", "Timeliness of Delivery", "Impact of Achievement", "Overall Achievement of Goals/Objectives", "Going beyond the call of Duty"];
const STANDARDS = ["Interpersonal skills & ability to work in a team environment", "Attendance and Punctuality", "Communication Skills", "Contributing to company mission"];
const grade = (s) => (s <= 0 ? "poor" : s <= 3 ? "needs improvement" : s <= 6 ? "good" : s <= 9 ? "very good" : "exellent");
const SCALE = [6, 9, 9, 9, 12, 12, 6, 3];
async function seedPerformance(users, approvers) {
  const rows = [];
  for (const u of users.slice(0, 40)) {
    for (let back = 1; back <= 2; back++) {
      const period = new Date();
      period.setMonth(period.getMonth() - back);
      const assess = ASSESSMENT.map((title) => { const score = pick(SCALE); return { title, status: grade(score), score, comment: "" }; });
      const standards = STANDARDS.map((title) => { const score = Math.min(10, pick(SCALE)); return { title, status: grade(score), score, comment: "" }; });
      rows.push({
        employee: u.id, period_month: String(period.getMonth() + 1), period_year: String(period.getFullYear()),
        period_assessment: assess, perfomance_standards: standards, created_by: pick(approvers).id,
        score: [...assess, ...standards].reduce((a, e) => a + e.score, 0),
        comment: pick(["Consistently meets deadlines.", "Great client feedback this period.", "Needs to improve documentation quality.", "Strong team player.", "Should take more initiative on reviews."]),
      });
    }
  }
  await pool(rows, (r) => pb.collection("perfomance_evaluations").create(r));
  console.log(`  ✓ performance evaluations: ${rows.length}`);
}

const ASSET_CATALOG = {
  "IT Equipment": ["Laptop", "Desktop", "Monitor", "Printer", "Router"],
  Furniture: ["Office Desk", "Office Chair", "Filing Cabinet"],
  Vehicles: ["Sedan", "Pickup"],
  "Mobile Devices": ["Smartphone", "Tablet"],
  "Office Equipment": ["Projector", "Photocopier"],
};
const ASSET_MODELS = { Laptop: ["Dell Latitude 5440", "HP EliteBook 840", "Lenovo ThinkPad T14", "MacBook Air M2"], Desktop: ["HP ProDesk 400"], Monitor: ["Dell 24\" P2422H", "LG 27\" UltraFine"], Printer: ["HP LaserJet Pro M404"], Router: ["Cisco RV340"], "Office Desk": ["Executive desk"], "Office Chair": ["Ergonomic chair"], "Filing Cabinet": ["4-drawer cabinet"], Sedan: ["Toyota Corolla"], Pickup: ["Toyota Hilux"], Smartphone: ["Samsung Galaxy A54", "iPhone 13"], Tablet: ["iPad 10th gen"], Projector: ["Epson EB-X51"], Photocopier: ["Canon iR 2425"] };
async function seedAssets(users, approvers) {
  const admin = approvers[0].id;
  const types = [];
  for (const [catName, typeNames] of Object.entries(ASSET_CATALOG)) {
    const cat = await pb.collection("assets_categories").create({ name: catName, description: `${catName} owned by the firm`, created_by: admin });
    for (const t of typeNames) types.push({ ...(await pb.collection("assets_types").create({ name: t, description: `${t}s`, category: cat.id, created_by: admin })), cat });
  }
  const assets = await pool(Array.from({ length: 45 }, (_, i) => i), (i) => {
    const t = pick(types);
    const status = pick(["assigned", "assigned", "assigned", "in_stock", "in_stock", "maintenance", "in_transit", "lost"]);
    return pb.collection("assets").create({
      name: pick(ASSET_MODELS[t.name] || [t.name]), code: `DNR-${t.cat.name.slice(0, 2).toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
      serial_number: `SN${int(100000000, 999999999)}`, category: t.cat.id, type: t.id, status, cost: money(80000, 3500000, 5000),
      purchased_at: iso(day(-int(30, 1400))), assigned_to: status === "assigned" ? pick(users).id : "",
      assigned_at: status === "assigned" ? iso(day(-int(1, 300))) : "", notes: "", created_by: admin,
    });
  });
  const requests = Array.from({ length: 20 }, () => {
    const status = pick(["pending", "pending", "approved", "rejected"]);
    return {
      asset: pick(assets).id, requested_by: pick(users).id, status, notes: pick(["My laptop battery no longer holds charge", "Need a second monitor for review work", "Joining the field audit team", "Replacement for broken phone"]),
      approved_by: status === "approved" ? pick(approvers).id : "", rejected_by: status === "rejected" ? pick(approvers).id : "",
      rejected_reason: status === "rejected" ? "No stock available" : "",
    };
  });
  await pool(requests, (r) => pb.collection("assets_requests").create(r));
  const allocations = assets.filter((a) => a.status === "assigned").slice(0, 25);
  await pool(allocations, (a) =>
    pb.collection("assets_allocations").create({
      name: a.name, code: a.code, serial_number: a.serial_number, type: types.find((t) => t.id === a.type)?.name || "",
      status: pick(["assigned", "assigned", "returned", "damaged"]), assigned_to: a.assigned_to, assigned_at: a.assigned_at, notes: "", created_by: admin,
    })
  );
  console.log(`  ✓ assets: ${types.length} types, ${assets.length} assets, ${requests.length} requests, ${allocations.length} allocations`);
}

const PLACES = ["Kigali HQ", "Kigali Heights", "Musanze", "Huye", "Rubavu", "Nyagatare", "Rwamagana", "Muhanga", "Kigali Airport"];
async function seedFleet(users, approvers) {
  const cars = await pool(
    [["Toyota Land Cruiser", "Prado 2021", "SUV", "White"], ["Toyota Hilux", "2020", "Pickup", "Silver"], ["Nissan X-Trail", "2019", "SUV", "Black"], ["Toyota Corolla", "2022", "Sedan", "Grey"], ["Mitsubishi Pajero", "2018", "SUV", "White"], ["Hyundai H1", "2021", "Van", "White"]],
    ([carName, carModel, carType, carColor], i) =>
      pb.collection("cars").create({ carName, carModel, carType, carColor, carPrice: money(18e6, 65e6, 100000), carDescription: `${carName} company vehicle`, carStatus: i !== 4, carowner: "DNR Partners CPA", plateNumber: `RAD ${int(100, 999)} ${String.fromCharCode(65 + i)}` })
  );
  const rows = Array.from({ length: 35 }, () => {
    const u = pick(users);
    const start = day(int(-60, 14), int(7, 10));
    const end = new Date(start.getTime() + int(3, 30) * 36e5);
    const status = start > new Date() ? pick(["pending", "approved"]) : pick(["approved", "approved", "rejected", "pending"]);
    const km0 = int(20000, 140000);
    const km = status === "approved" ? int(15, 420) : 0;
    const fromLocation = "Kigali HQ";
    return {
      employee: u.id, users: u.id, car: pick(cars).id, fromLocation, toLocation: pick(PLACES.slice(1)), purpose: pick(["Client audit field work", "Tax filing at RRA", "Stock count", "Client meeting", "Training session", "Airport pickup"]),
      position: "", startTime: iso(start), endTime: iso(end), start: iso(start), end: iso(end), passengerCount: int(1, 5), needsDriver: chance(0.6),
      starting_km: status === "approved" ? km0 : 0, ending_km: status === "approved" ? km0 + km : 0, totalKm: km, expense_amount: km * 250, totalExpenses: km * 250,
      status, reason: "", created_by: u.id, approved_by: status === "approved" ? pick(approvers).id : "", rejected_by: status === "rejected" ? pick(approvers).id : "",
    };
  });
  await pool(rows, (r) => pb.collection("CarRequests").create(r));
  console.log(`  ✓ fleet: ${cars.length} cars, ${rows.length} car requests`);
}

const CLIENTS = ["Bank of Kigali", "MTN Rwanda", "Inyange Industries", "Bralirwa", "RwandAir", "Kigali Marriott", "Simba Supermarket", "Akagera Aviation", "Rwanda Mountain Tea", "SONARWA"];
async function seedPlans(users, departments, branches) {
  const cats = ["External Audit", "Tax Advisory", "Accounting & Bookkeeping", "Internal Audit", "Consulting"];
  await pool(cats, (name) => pb.collection("serviceCategories").create({ name, description: name }));
  await pool(CLIENTS, (name) => pb.collection("clients").create({ name, email: `finance@${name.toLowerCase().replace(/\W/g, "")}.rw`, phone: `+25078${int(1000000, 9999999)}`, address: "Kigali, Rwanda", industry: pick(["Banking", "Telecom", "Manufacturing", "Hospitality", "Retail", "Aviation", "Agriculture", "Insurance"]), contact_person: `${pick(FIRST)} ${pick(LAST)}` }));
  const person = () => pick(users).name;
  const weekly = Array.from({ length: 18 }, (_, i) => ({
    reference_number: `ENG-${new Date().getFullYear()}-${String(i + 1).padStart(3, "0")}`, service_category: pick(cats), client_name: pick(CLIENTS),
    engagement_title: pick(["FY statutory audit", "VAT compliance review", "Payroll audit", "Internal controls review", "Quarterly tax filing", "IFRS 16 advisory"]),
    engagement_status: pick(["Planning", "Fieldwork", "Review", "Reporting", "Completed"]), director: person(), partner: person(), manager: person(), team_leader: person(),
    engagement_contractual_deadline: iso(day(int(-10, 90))), firm_deadline: iso(day(int(-15, 80))), observations: pick(["On track", "Awaiting client documents", "Scope extended", "Draft report shared", ""]),
    department: pick(departments).id, branch: pick(branches).id,
  }));
  await pool(weekly, (r) => pb.collection("weeklyPlans").create(r));
  console.log(`  ✓ plans: ${weekly.length} engagements (action plans, reports and documents: scripts/seed-portal.mjs)`);
}

// ------------------------------------------------------------------ main
async function main() {
  console.log(`🌱 Seeding demo data into ${PB_URL}\n`);
  await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

  const backup = `before-demo-seed-${Date.now()}.zip`;
  let backedUp = false;
  for (let attempt = 1; attempt <= 3 && !backedUp; attempt++) {
    try {
      await pb.backups.create(backup);
      backedUp = true;
    } catch (e) {
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3000));
      else console.warn(`⚠️  Backup failed (${e?.message}). Continuing — this is local demo data. Back up manually from Admin UI → Settings → Backups if needed.`);
    }
  }
  if (backedUp) console.log(`💾 Backup created: ${backup} (restore from Admin UI → Settings → Backups)\n`);
  // Keep only the three most recent automatic pre-seed backups (each is ~60 MB).
  try {
    const old = (await pb.backups.getFullList()).filter((b) => b.key.startsWith("before-demo-seed-")).sort((a, b) => b.key.localeCompare(a.key)).slice(3);
    for (const b of old) await pb.backups.delete(b.key);
  } catch (_) {}

  console.log("📐 Schema");
  await ensureSchema();

  console.log("\n🧹 Clearing previous demo records");
  await wipe([
    "employees_payrolls", "payrolls", "accounts_transactions", "prepayments", "petty_cash_requests", "accounts", "deductions", "expenses_categories",
    "perfomance_evaluations", "assets_requests", "assets_allocations", "assets", "assets_types", "assets_categories",
    "attendance", "leaves", "LeavePlane", "LeavePlaneReport", "CarRequests", "cars", "weeklyPlans", "serviceCategories", "clients",
    "actionPlans", "employeeReports", "employee_documents",
  ]);

  console.log("\n👥 People");
  const roleIds = await seedRoles();
  await seedApprovalLimits(roleIds);
  const { users, departments, branches, hq } = await seedUsers(roleIds);
  await seedSettings();
  const approvers = users.filter((u) => [ROLE.HR_PAYROLL, ROLE.SG].includes(u.expand?.role?.name));

  console.log("\n📦 Modules");
  await seedAttendance(users);
  await seedLeaves(users, approvers);
  await seedFinance(users, approvers, hq);
  await seedPerformance(users, approvers);
  await seedAssets(users, approvers);
  await seedFleet(users, approvers);
  await seedPlans(users, departments, branches);

  console.log("\n✅ Done. Demo logins (password for all: " + DEMO_PASSWORD + ")");
  for (const a of DEMO_ACCOUNTS) console.log(`   ${a.role.padEnd(28)} ${a.email}`);
}

main().catch((e) => {
  console.error("\n❌ Seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
