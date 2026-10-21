#!/usr/bin/env node
/**
 * Presentation organisation: reshapes the local demo data into a General Secretariat structure
 * for RALGA (Rwanda Association of Local Government Authorities).
 *
 * IMPORTANT: RALGA does not publish its internal organigram. This structure is ILLUSTRATIVE — built
 * from RALGA's public mandate (General Assembly, Executive Committee, Control Committee, Conflict
 * Resolution Committee, General Secretariat led by the Secretary General; services: recruitment,
 * capacity building, advocacy on decentralisation, local-government finance, local economic
 * development and social welfare). Confirm the real structure with RALGA before go-live.
 *
 * Run after seed-demo.mjs and before seed-procurement.mjs (`npm run seed:ralga` does all three).
 */
import PocketBase from "pocketbase";
import { ROLE, DEMO_ACCOUNTS } from "./ims/roles.mjs";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}).`);
  process.exit(1);
}
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// name, code, designations (first one is the head of the department)
const STRUCTURE = [
  ["Office of the Secretary General", "OSG", "Coordinates the General Secretariat and reports to the Executive Committee", ["Secretary General", "Deputy Secretary General", "Executive Assistant", "Executive Committee Member"]],
  ["Finance and Administration", "FIN", "Budget, accounting, treasury, logistics and general administration", ["Director of Finance and Administration", "Chief Accountant", "Accountant", "Budget Officer", "Cashier / Treasury Officer", "Logistics and Stores Officer", "Administrative Assistant"]],
  ["Human Resources", "HRM", "Staff administration, payroll, performance and welfare", ["Human Resources Manager", "Human Resources Officer"]],
  ["Procurement", "PRC", "Procurement planning, sourcing, contracts and supplier management", ["Procurement Manager", "Procurement Officer"]],
  ["Capacity Building", "CBD", "Training and capacity development for districts, sectors and elected leaders", ["Head of Capacity Building", "Capacity Building Specialist", "Training Coordinator"]],
  ["Recruitment Services", "RCS", "Recruitment services provided to local government entities", ["Head of Recruitment Services", "Recruitment Specialist"]],
  ["Advocacy, Policy and Research", "APR", "Advocacy on decentralisation, local government finance, local economic development and social welfare", ["Director of Advocacy and Policy", "Decentralisation Policy Analyst", "Local Government Finance Specialist", "Local Economic Development Specialist", "Social Welfare Specialist"]],
  ["Planning, Monitoring and Evaluation", "PME", "Strategic planning, M&E and reporting", ["Planning, Monitoring and Evaluation Manager", "Monitoring and Evaluation Officer"]],
  ["ICT and Digital Services", "ICT", "ICT infrastructure, information systems and the e-learning platform", ["ICT Manager", "Systems Administrator", "E-learning Platform Officer"]],
  ["Communication and Public Relations", "COM", "Communication, events and member relations", ["Communication Manager", "Communication Officer"]],
  ["Internal Audit", "IAU", "Independent assurance to the Control Committee", ["Internal Auditor"]],
  ["Legal Affairs", "LEG", "Legal advice, contracts review and compliance", ["Legal Advisor"]],
];

// Demo login accounts (one per IMS role) → department / designation that matches their role.
const PLACEMENT = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.email, [a.dept, a.designation]]));
// Read-only and administrator roles never become approving department heads.
const NEVER_HEAD = new Set(DEMO_ACCOUNTS.filter((a) => ["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER"].includes(a.code)).map((a) => a.email));

let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

async function main() {
  await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🏛  Shaping demo organisation: RALGA General Secretariat (illustrative)");

  // Departments: reuse existing records (keeps every relation valid), create the rest.
  const existing = await pb.collection("departments").getFullList({ sort: "created" });
  const depts = {};
  for (const [i, [name, code, description]] of STRUCTURE.entries()) {
    const data = { name, code, description };
    depts[name] = existing[i] ? await pb.collection("departments").update(existing[i].id, data) : await pb.collection("departments").create(data);
  }
  const extraDepts = existing.slice(STRUCTURE.length);

  // Designations: same approach.
  const existingDes = await pb.collection("designations").getFullList({ sort: "created" });
  const designations = {};
  let d = 0;
  for (const [deptName, , , titles] of STRUCTURE) {
    for (const title of titles) {
      const data = { name: title, department: depts[deptName].id, description: `${title} — ${deptName}` };
      designations[title] = existingDes[d] ? await pb.collection("designations").update(existingDes[d].id, data) : await pb.collection("designations").create(data);
      d++;
    }
  }
  const extraDes = existingDes.slice(d);

  // Branches: head office plus provincial coordination desks.
  const branchNames = ["Head Office - Kigali", "Northern Province coordination", "Southern Province coordination", "Eastern Province coordination", "Western Province coordination"];
  const existingBr = await pb.collection("branches").getFullList({ sort: "created" });
  const branches = [];
  for (const [i, name] of branchNames.entries()) {
    const data = { name, location: i === 0 ? "Kigali, Rwanda" : name.replace(" coordination", ""), status: "active", description: i === 0 ? "General Secretariat" : "Liaison with districts in the province" };
    branches.push(existingBr[i] ? await pb.collection("branches").update(existingBr[i].id, data) : await pb.collection("branches").create(data));
  }

  // People: demo accounts get fixed placements; everyone else is spread across departments.
  const users = await pb.collection("users").getFullList({ sort: "created" });
  const staffPlan = [];
  const RESERVED = new Set(DEMO_ACCOUNTS.map((a) => a.designation)); // titles that belong to one demo login
  for (const [deptName, , , titles] of STRUCTURE) for (const t of titles.slice(1)) if (!RESERVED.has(t)) staffPlan.push([deptName, t]);
  let k = 0;
  for (const u of users) {
    let [deptName, title] = PLACEMENT[u.email] || staffPlan[k++ % staffPlan.length];
    await pb.collection("users").update(u.id, {
      department: depts[deptName].id,
      designation: designations[title].id,
      branch: PLACEMENT[u.email] || rand() < 0.8 ? branches[0].id : branches[1 + Math.floor(rand() * 4)].id,
    });
  }

  // Department heads (approvers for "Department head" steps) — first designation of each department.
  const refreshed = await pb.collection("users").getFullList({ expand: "role" });
  const heads = new Set();
  for (const [deptName, , , titles] of STRUCTURE) {
    // Only demo accounts (known password) become heads, so the demo approval flows can run end to end.
    const inDept = refreshed.filter((u) => u.department === depts[deptName].id && u.status === "Active" && /@dnr-hr\.rw$/.test(u.email) && !NEVER_HEAD.has(u.email));
    let head = inDept.find((u) => u.designation === designations[titles[0]].id);
    if (!head) {
      head = inDept.find((u) => !PLACEMENT[u.email]) || inDept[0];
      if (head && !PLACEMENT[head.email]) await pb.collection("users").update(head.id, { designation: designations[titles[0]].id });
    }
    await pb.collection("departments").update(depts[deptName].id, { head: head ? head.id : "" });
    if (head) heads.add(head.id);
  }

  // Heads hold Head of Department (as main role when they are otherwise Staff, else as an extra role,
  // e.g. the DAF heads Finance); nobody else does. One person, several roles (IMS §1).
  const roleId = Object.fromEntries((await pb.collection("roles").getFullList()).map((r) => [r.name, r.id]));
  const HOD = roleId[ROLE.HOD];
  const STAFF = roleId[ROLE.STAFF];
  for (const u of refreshed) {
    let role = u.role;
    let extra = (u.extra_roles || []).filter((x) => x !== HOD);
    if (heads.has(u.id)) {
      if (role === STAFF) {
        role = HOD;
        if (!extra.includes(STAFF)) extra.push(STAFF);
      } else if (role !== HOD) extra.push(HOD);
    } else if (role === HOD) {
      role = STAFF;
    }
    if (role !== u.role || extra.join() !== (u.extra_roles || []).join()) await pb.collection("users").update(u.id, { role, extra_roles: extra });
  }

  // Remove leftovers from the previous demo structure once nothing points at them.
  for (const x of extraDes) await pb.collection("designations").delete(x.id).catch(() => null);
  for (const x of extraDepts) await pb.collection("departments").delete(x.id).catch(() => null);

  const settings = await pb.collection("settings").getList(1, 1);
  const s = {
    company_name: "RALGA — Rwanda Association of Local Government Authorities",
    company_address: "General Secretariat, Kigali, Rwanda",
    company_phone: "",
    company_email: "",
    currency: "RWF",
    timezone: "Africa/Kigali",
    budget_control: "warn",
    invoice_price_tolerance_pct: 2,
    invoice_total_tolerance_pct: 0,
  };
  if (settings.items[0]) await pb.collection("settings").update(settings.items[0].id, s);
  else await pb.collection("settings").create(s);

  console.log(`  ✓ ${STRUCTURE.length} departments, ${d} designations, ${branches.length} offices, ${users.length} staff placed, department heads assigned`);
}

main().catch((e) => {
  console.error("❌ Organisation seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
