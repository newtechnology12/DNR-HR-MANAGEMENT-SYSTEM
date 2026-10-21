#!/usr/bin/env node
/**
 * Employee portal demo data: department and personal action plans, work reports routed to
 * department heads (with review discussions), and staff documents with real PDF files.
 *
 * Run after the organisation is in place (`npm run seed:demo` / `npm run seed:ralga` do this last).
 * Re-running replaces the previous portal demo records.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PB_URL) && process.env.ALLOW_REMOTE_SEED !== "true") {
  console.error(`Refusing to seed non-local PocketBase (${PB_URL}).`);
  process.exit(1);
}
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

let seed = 23;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const day = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const iso = (d) => d.toISOString().replace("T", " ");
const ymd = (d) => d.toISOString().slice(0, 10);

async function pool(items, fn, size = 8) {
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

/** A small valid one-page PDF with the given lines of text. */
function pdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const content = ["BT", "/F1 18 Tf", "60 780 Td", `(${esc(lines[0])}) Tj`, "/F1 11 Tf", ...lines.slice(1).flatMap((l) => ["0 -22 Td", `(${esc(l)}) Tj`]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}

// Department work programmes (illustrative, based on the association's public mandate).
const DEPT_PLANS = {
  "Office of the Secretary General": ["Prepare Executive Committee meeting (Q4)", "Annual General Assembly preparation"],
  "Finance and Administration": ["Close Q3 accounts and prepare financial statements", "Update fixed asset register"],
  "Human Resources": ["Annual staff performance appraisal cycle", "Staff training needs assessment"],
  Procurement: ["Q4 procurement plan execution", "Supplier performance review"],
  "Capacity Building": ["Induction training for newly elected district councillors", "E-learning course on local government finance"],
  "Recruitment Services": ["District staff recruitment exams — Eastern Province", "Update recruitment exam question bank"],
  "Advocacy, Policy and Research": ["Policy brief on fiscal decentralisation", "Survey on local economic development priorities"],
  "Planning, Monitoring and Evaluation": ["Mid-year strategic plan review", "Quarterly M&E report to development partners"],
  "ICT and Digital Services": ["E-learning platform upgrade", "Staff cyber-security awareness campaign"],
  "Communication and Public Relations": ["Local governance week media campaign", "Quarterly member newsletter"],
  "Internal Audit": ["Audit of procurement processes (FY)", "Follow-up of prior audit recommendations"],
  "Legal Affairs": ["Review of partnership agreements", "Update internal regulations on delegation of authority"],
};
const PERSONAL = [
  ["Draft concept note", "Concept note shared with department head"],
  ["Collect data from districts", "Data from 30 districts consolidated in one sheet"],
  ["Prepare training materials", "Slides and handouts ready for printing"],
  ["Organise logistics for the workshop", "Venue, transport and per diem list confirmed"],
  ["Write progress report", "Report submitted on time"],
  ["Review and validate documents", "Reviewed documents with comments returned"],
];
const TASKS = [
  "Held a coordination meeting with the district focal points and agreed on the data collection timeline.",
  "Completed the first draft of the training module and shared it with the team for review.",
  "Visited two districts to verify the information submitted and documented the findings.",
  "Consolidated inputs from all units into one document and corrected the inconsistencies.",
  "Prepared the logistics plan and budget estimate for the upcoming activity.",
];
const CHALLENGES = ["Some districts sent their data late.", "Limited internet connectivity during field visits.", "Two key stakeholders were unavailable this week.", ""];
const NEXT = ["Finalise the draft and submit it for approval.", "Follow up with the districts that have not responded.", "Share the final version with partners.", "Start the field phase next week."];
const DOC_TYPES = [
  ["National ID", "national_id"],
  ["Employment contract", "contract"],
  ["Curriculum vitae", "cv"],
  ["Academic certificate", "certificate"],
];

async function main() {
  await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL || "admin@dnr-hr.rw", process.env.PB_ADMIN_PASSWORD || "admin123456");
  console.log("🧑‍💼 Employee portal demo data");

  for (const name of ["report_comments", "employeeReports", "actionPlans", "employee_documents"]) {
    const rows = await pb.collection(name).getFullList({ fields: "id" });
    await pool(rows, (r) => pb.collection(name).delete(r.id).catch(() => null));
  }

  const [users, departments] = await Promise.all([
    pb.collection("users").getFullList({ filter: 'status = "Active"', sort: "created" }),
    pb.collection("departments").getFullList(),
  ]);
  const deptById = Object.fromEntries(departments.map((d) => [d.id, d]));
  const director = users.find((u) => u.email === "director@dnr-hr.rw") || users[0];
  const readerFor = (u) => {
    const head = deptById[u.department]?.head;
    return head && head !== u.id ? head : director.id !== u.id ? director.id : users.find((x) => x.id !== u.id).id;
  };

  // Department plans, recorded by the head of each department.
  const deptPlans = [];
  for (const d of departments) {
    if (!d.head) continue;
    for (const title of DEPT_PLANS[d.name] || [`${d.name} quarterly work plan`]) {
      const start = day(int(-25, -5));
      deptPlans.push({
        scope: "department", planType: "monthly", title, task_description: `${title}. Coordinated by the ${d.name} department; staff link their personal plans to it.`,
        expected_output: pick(["Report approved by management", "Activity delivered to all targeted districts", "Document validated and published"]),
        start_date: iso(start), end_date: iso(day(int(20, 60))), deadline: iso(day(int(25, 70))), priority: pick(["high", "medium"]),
        status: "in_progress", progress: int(15, 70), department_id: d.id, staff_id: d.head, created_by: d.head, hoursPerDay: [],
      });
    }
  }
  const createdDept = await pool(deptPlans, (p) => pb.collection("actionPlans").create(p));

  // Personal plans linked to their department plan.
  const staff = users.filter((u) => u.department);
  const personal = [];
  for (const u of staff) {
    const parents = createdDept.filter((p) => p.department_id === u.department);
    const n = u.email.endsWith("@dnr-hr.rw") ? 3 : int(0, 2);
    for (let i = 0; i < n; i++) {
      const [title, output] = pick(PERSONAL);
      const start = day(int(-15, 6));
      const status = start > day(0) ? "not_started" : pick(["in_progress", "in_progress", "completed"]);
      const hours = status === "not_started" ? [] : Array.from({ length: int(1, 3) }, (_, k) => {
        const d = new Date(start.getTime() + k * 864e5);
        const h = int(2, 6);
        return { date: ymd(d), startTime: "08:30", endTime: `${String(8 + h).padStart(2, "0")}:30`, hours: h };
      });
      const parent = parents.length ? pick(parents) : null;
      personal.push({
        scope: "personal", parent_plan: parent?.id || "", planType: pick(["daily", "weekly", "weekly", "monthly"]),
        title: parent ? `${title} — ${parent.title.split(" (")[0].toLowerCase()}` : title,
        task_description: `${title} as my contribution${parent ? ` to "${parent.title}"` : ""}.`, expected_output: output,
        start_date: iso(start), end_date: iso(new Date(start.getTime() + int(1, 10) * 864e5)), deadline: iso(new Date(start.getTime() + int(3, 14) * 864e5)),
        priority: pick(["high", "medium", "medium", "low"]), status, progress: status === "completed" ? 100 : status === "in_progress" ? int(20, 80) : 0,
        department_id: u.department, staff_id: u.id, created_by: u.id, hoursPerDay: hours,
        completion_note: status === "completed" ? "Done and shared with the department head." : "",
      });
    }
  }
  const createdPersonal = await pool(personal, (p) => pb.collection("actionPlans").create(p));

  // Reports on personal plans, sent to the department head (or the Secretary General for heads).
  const reportRows = [];
  for (const u of staff) {
    const mine = createdPersonal.filter((p) => p.staff_id === u.id && p.status !== "not_started");
    const n = u.email.endsWith("@dnr-hr.rw") ? 3 : int(0, 1);
    for (let i = 0; i < Math.min(n, Math.max(mine.length, 1)); i++) {
      const plan = mine[i] || null;
      const d = day(-int(0, 20));
      const type = pick(["daily", "weekly", "weekly", "monthly"]);
      reportRows.push({
        u, data: {
          title: plan ? `Progress on: ${plan.title}` : `${type[0].toUpperCase() + type.slice(1)} activity report`, reportType: type, employee: u.id,
          action_plan: plan?.id || "", recipients: [readerFor(u)], created_by: u.id, reportDate: iso(d), dateHappened: iso(day(-int(1, 25))),
          tasksCompleted: pick(TASKS), challengesFaced: pick(CHALLENGES), nextSteps: pick(NEXT), additionalComments: "",
        },
      });
    }
  }
  const reports = await pool(reportRows, async ({ u, data }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
      else fd.append(k, v);
    }
    if (rand() < 0.4) fd.append("attachments", pdf([data.title, `Prepared by ${u.name}`, `Date: ${data.reportDate.slice(0, 10)}`, data.tasksCompleted.slice(0, 90)]), "supporting-evidence.pdf");
    return pb.collection("employeeReports").create(fd);
  });

  // Review discussions: some reviewed, some with a request for more information and a reply.
  let comments = 0;
  for (const r of reports) {
    const x = rand();
    const reader = r.recipients[0];
    if (x < 0.35) {
      await pb.collection("report_comments").create({ report: r.id, author: reader, kind: "comment", body: "Good progress, thank you. Keep the district focal points informed." });
      await pb.collection("employeeReports").update(r.id, { status: "reviewed", reviewed_by: reader, reviewed_at: iso(day(0)) });
      comments++;
    } else if (x < 0.6) {
      await pb.collection("report_comments").create({ report: r.id, author: reader, kind: "info_request", body: "Please share the list of districts that have not yet responded and the reason for the delay." });
      comments++;
      if (rand() < 0.5) {
        await pb.collection("report_comments").create({ report: r.id, author: r.employee, kind: "reply", body: "Nyagatare and Rusizi are still pending; their planning officers were on mission. They promised to send by Friday." });
        comments++;
      }
    }
  }

  // Documents with real PDF files.
  const docStaff = [...users.filter((u) => u.email.endsWith("@dnr-hr.rw")), ...staff.filter((u) => !u.email.endsWith("@dnr-hr.rw")).slice(0, 15)];
  const docRows = docStaff.flatMap((u) => DOC_TYPES.slice(0, u.email.endsWith("@dnr-hr.rw") ? 4 : 2).map(([name, type]) => ({ u, name, type })));
  await pool(docRows, ({ u, name, type }) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("type", type);
    fd.append("employee", u.id);
    fd.append("created_by", u.id);
    if (type === "national_id") {
      fd.append("document_number", `1 19${int(70, 99)} 8 ${int(1000000, 9999999)} 0 ${int(10, 99)}`);
      fd.append("issue_date", iso(day(-int(800, 3000))));
    }
    if (type === "contract") {
      fd.append("issue_date", iso(day(-int(100, 900))));
      fd.append("expiry_date", iso(day(int(-10, 700))));
      fd.append("description", "Signed employment contract");
    }
    fd.append("attachment", pdf([name, u.name, `Document type: ${name}`, "Demo document generated for presentation purposes."]), `${type}-${u.name.toLowerCase().replace(/\W+/g, "-")}.pdf`);
    return pb.collection("employee_documents").create(fd);
  });

  console.log(`  ✓ ${createdDept.length} department plans, ${createdPersonal.length} personal plans, ${reports.length} reports (${comments} review comments), ${docRows.length} documents`);
}

main().catch((e) => {
  console.error("❌ Portal seeding failed:", e?.response ? JSON.stringify(e.response, null, 2) : e);
  process.exit(1);
});
