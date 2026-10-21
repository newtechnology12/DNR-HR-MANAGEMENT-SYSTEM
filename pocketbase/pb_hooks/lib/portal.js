/// <reference path="../../pb_data/types.d.ts" />
/**
 * Employee portal rules: who may approve leave and expenses, report routing and discussion,
 * document protection, expense categories. Loaded from portal.pb.js.
 */
const core = require("./core.js");

/** Multi-relation values arrive as Go slices; copy into a plain JS array. */
function ids(record, key) {
  const out = [];
  let s;
  try {
    s = record.getStringSlice(key);
  } catch (_) {
    return out;
  }
  for (let i = 0; i < (s ? s.length : 0); i++) if (s[i]) out.push(String(s[i]));
  return out;
}

function hrScope(dao, auth) {
  if (!auth) return "all";
  try {
    return dao.findRecordById("roles", auth.getString("role")).getString("hr_scope") || "own";
  } catch (_) {
    return "own";
  }
}

function userOf(dao, id) {
  try {
    return id ? dao.findRecordById("users", id) : null;
  } catch (_) {
    return null;
  }
}

function headOf(dao, user) {
  if (!user || !user.getString("department")) return "";
  try {
    return dao.findRecordById("departments", user.getString("department")).getString("head");
  } catch (_) {
    return "";
  }
}

/** Can `auth` act as a manager for `employee` (HR with the right scope, or their department head)? */
function managesEmployee(dao, auth, employee) {
  if (!auth) return true;
  if (!employee) return false;
  const scope = hrScope(dao, auth);
  if (scope === "all") return true;
  if (headOf(dao, employee) === auth.id) return true;
  return scope === "department" && employee.getString("department") && employee.getString("department") === auth.getString("department");
}

function appUrl() {
  const s = $app.settings();
  return (s.meta.appUrl || "").replace(/\/$/, "");
}

/**
 * E-mail to the given users. Works once SMTP is enabled in PocketBase settings; until then the
 * in-app notification is the only channel and nothing fails.
 */
function mail(dao, userIds, subject, lines, link) {
  const s = $app.settings();
  if (!s.smtp.enabled) return;
  const seen = {};
  for (const uid of userIds || []) {
    if (!uid || seen[uid]) continue;
    seen[uid] = true;
    const u = userOf(dao, uid);
    const address = u && (u.getString("email") || u.getString("personal_email"));
    if (!address) continue;
    const esc = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;max-width:560px">` +
      `<p>Hello ${esc(u.getString("name"))},</p>` +
      lines.map((l) => `<p>${esc(l)}</p>`).join("") +
      (link ? `<p><a href="${appUrl()}${link}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in the HR system</a></p>` : "") +
      `<p style="color:#64748b;font-size:12px">This is an automatic message from ${esc(s.meta.appName)}.</p></div>`;
    try {
      $app.newMailClient().send(
        new MailerMessage({ from: { address: s.meta.senderAddress, name: s.meta.senderName }, to: [{ address }], subject, html })
      );
    } catch (err) {
      console.log("portal mail failed:", err);
    }
  }
}

// ------------------------------------------------------------------ approvals (leave, expense)
/**
 * Status changes are decisions: only a manager of the employee with the given permission may make
 * them, and never on their own request.
 */
function guardDecision(e, permission, what) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return; // superuser
  const dao = $app.dao();
  const before = e.record.originalCopy();
  const was = before.getString("status");
  const now = e.record.getString("status");
  const employee = userOf(dao, e.record.getString("employee"));
  if (was !== now) {
    if (e.record.getString("employee") === auth.id && now !== "cancelled") {
      throw new ForbiddenError(`You cannot ${now === "approved" ? "approve" : now === "rejected" ? "reject" : "change the status of"} your own ${what}. Another manager must decide.`);
    }
    if (!(now === "cancelled" && e.record.getString("employee") === auth.id)) {
      core.requirePermission(dao, auth, permission, `approve or reject ${what}s`);
      if (!managesEmployee(dao, auth, employee)) throw new ForbiddenError(`You can only decide on ${what}s of staff you manage.`);
    }
  } else if (e.record.getString("employee") === auth.id && was !== "pending") {
    throw new BadRequestError(`This ${what} is ${was} and can no longer be edited.`);
  }
  if (before.getString("employee") !== e.record.getString("employee") && !managesEmployee(dao, auth, employee)) {
    throw new ForbiddenError(`You can only file ${what}s for staff you manage.`);
  }
}

function leaveBeforeSave(e) {
  const r = e.record;
  const type = r.getString("type");
  let specify = type === "Other";
  try {
    specify = specify || $app.dao().findFirstRecordByFilter("leave_types", "name = {:n}", { n: type }).getBool("requires_specify");
  } catch (_) {}
  if (specify) {
    const other = r.getString("other_type").trim();
    if (other.length < 3) throw new BadRequestError("Specify the type of leave (at least 3 characters).");
    r.set("other_type", other.charAt(0).toUpperCase() + other.slice(1));
  } else {
    r.set("other_type", "");
  }
  const auth = e.httpContext.get("authRecord");
  if (auth && r.isNew()) {
    r.set("created_by", auth.id);
    r.set("status", "pending");
    r.set("approved_by", "");
    r.set("rejected_by", "");
  }
  require("./leave.js").validateLeave(e);
}

// ------------------------------------------------------------------ documents
function documentBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  if (auth) e.record.set("created_by", auth.id);
  if (!e.record.getString("attachment")) throw new BadRequestError("Attach the document file.");
  if (!e.record.getString("name").trim()) throw new BadRequestError("Give the document a name.");
}

// ------------------------------------------------------------------ action plans
function planBeforeSave(e) {
  const r = e.record;
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (r.isNew()) {
    if (auth) r.set("created_by", auth.id);
    if (!r.getString("staff_id") && auth) r.set("staff_id", auth.id);
  }
  if (!r.getString("scope")) r.set("scope", "personal");
  const staff = userOf(dao, r.getString("staff_id"));
  if (!r.getString("department_id") && staff) r.set("department_id", staff.getString("department"));
  if (!r.getString("title").trim()) throw new BadRequestError("Give the plan a title.");
  const start = r.getString("start_date");
  const end = r.getString("end_date");
  if (start && end && end < start) throw new BadRequestError("The end date must be on or after the start date.");
  if (r.getString("scope") === "department" && auth && r.isNew()) {
    const scope = hrScope(dao, auth);
    const dept = r.getString("department_id");
    let head = "";
    try {
      head = dao.findRecordById("departments", dept).getString("head");
    } catch (_) {}
    if (scope !== "all" && head !== auth.id && !(scope === "department" && auth.getString("department") === dept)) {
      throw new ForbiddenError("Only the department head or HR can record a department plan. Create a personal plan and link it to a department plan instead.");
    }
  }
  const parent = r.getString("parent_plan");
  if (parent) {
    if (parent === r.id) throw new BadRequestError("A plan cannot contribute to itself.");
    let p = null;
    try {
      p = dao.findRecordById("actionPlans", parent);
    } catch (_) {}
    if (!p) throw new BadRequestError("The department plan you linked no longer exists.");
    if (p.getString("scope") !== "department") throw new BadRequestError("Personal plans can only be linked to a department plan.");
  }
  const progress = Math.max(0, Math.min(100, r.getFloat("progress") || 0));
  r.set("progress", r.getString("status") === "completed" ? 100 : progress);
}

// ------------------------------------------------------------------ reports
function reportBeforeCreate(e) {
  const r = e.record;
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth && !r.getString("employee")) r.set("employee", auth.id);
  const employee = userOf(dao, r.getString("employee"));
  if (!employee) throw new BadRequestError("Choose the employee this report is for.");
  if (auth) r.set("created_by", auth.id);
  r.set("employeeName", employee.getString("name"));
  r.set("department_id", employee.getString("department"));
  try {
    r.set("department", dao.findRecordById("departments", employee.getString("department")).getString("name"));
  } catch (_) {}
  r.set("status", "submitted");
  r.set("reviewed_by", "");
  r.set("reviewed_at", "");
  if (!r.getString("tasksCompleted").trim()) throw new BadRequestError("Describe the work you completed.");
  let recipients = ids(r, "recipients").filter((x) => x && x !== employee.id);
  if (!recipients.length) {
    const head = headOf(dao, employee);
    if (head && head !== employee.id) recipients = [head];
  }
  if (!recipients.length) throw new BadRequestError("Choose who should read this report (your supervisor or department head).");
  r.set("recipients", recipients);
  const plan = r.getString("action_plan");
  if (plan) {
    try {
      r.set("plane", dao.findRecordById("actionPlans", plan).getString("title"));
    } catch (_) {
      throw new BadRequestError("The action plan you linked no longer exists.");
    }
  }
}

function reportLabel(r) {
  const type = r.getString("reportType") || "work";
  return r.getString("title") || `${type.charAt(0).toUpperCase() + type.slice(1)} report`;
}

function reportAfterCreate(e) {
  const r = e.record;
  const dao = $app.dao();
  const link = `/dashboard/employee-portal/reports/${r.id}`;
  const who = r.getString("employeeName");
  core.notify(dao, ids(r, "recipients"), { title: `New report from ${who}`, body: reportLabel(r), link, type: "info" });
  mail(dao, ids(r, "recipients"), `New report from ${who}: ${reportLabel(r)}`, [`${who} (${r.getString("department")}) submitted a report that you are asked to read.`, `Report: ${reportLabel(r)}`], link);
}

function reportBeforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const dao = $app.dao();
  const before = e.record.originalCopy();
  const r = e.record;
  const isOwner = r.getString("employee") === auth.id;
  const isReader = ids(before, "recipients").indexOf(auth.id) !== -1 || managesEmployee(dao, auth, userOf(dao, r.getString("employee")));
  for (const f of ["employee", "created_by", "department_id", "employeeName"]) {
    if (before.getString(f) !== r.getString(f)) throw new BadRequestError(`The ${f.replace(/_/g, " ")} of a report cannot be changed.`);
  }
  if (before.getString("status") !== r.getString("status")) {
    if (r.getString("status") === "reviewed") {
      if (!isReader || isOwner) throw new ForbiddenError("Only a reader of this report can mark it as reviewed.");
      r.set("reviewed_by", auth.id);
      r.set("reviewed_at", new Date().toISOString());
      e.httpContext.set("dnrReviewed", "1");
    } else if (!isReader && !isOwner) {
      throw new ForbiddenError("You cannot change the status of this report.");
    }
  }
  if (!isOwner) {
    for (const f of ["tasksCompleted", "challengesFaced", "nextSteps", "additionalComments", "title", "reportType", "reportDate", "dateHappened", "action_plan"]) {
      if (before.getString(f) !== r.getString(f)) throw new ForbiddenError("Only the author can edit the report content. Leave a comment instead.");
    }
  } else if (before.getString("status") === "reviewed") {
    throw new BadRequestError("This report has been reviewed and can no longer be edited.");
  }
}

function reportAfterUpdate(e) {
  const r = e.record;
  if (e.httpContext.get("dnrReviewed") !== "1") return;
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  const link = `/dashboard/employee-portal/reports/${r.id}`;
  const by = auth ? auth.getString("name") : "Your supervisor";
  core.notify(dao, [r.getString("employee")], { title: `${reportLabel(r)} reviewed`, body: `Reviewed by ${by}`, link, type: "success" });
  mail(dao, [r.getString("employee")], `Your report was reviewed: ${reportLabel(r)}`, [`${by} marked your report "${reportLabel(r)}" as reviewed.`], link);
}

function commentBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const dao = $app.dao();
  const c = e.record;
  c.set("author", auth.id);
  if (!c.getString("body").trim()) throw new BadRequestError("Write your comment.");
  let report;
  try {
    report = dao.findRecordById("employeeReports", c.getString("report"));
  } catch (_) {
    throw new NotFoundError("The report no longer exists.");
  }
  const isOwner = report.getString("employee") === auth.id;
  const isReader = ids(report, "recipients").indexOf(auth.id) !== -1 || managesEmployee(dao, auth, userOf(dao, report.getString("employee")));
  if (!isOwner && !isReader) throw new ForbiddenError("You cannot comment on this report.");
  const kind = c.getString("kind") || "comment";
  if (kind === "info_request" && isOwner) c.set("kind", "comment");
  if (isOwner && report.getString("status") === "info_requested") c.set("kind", "reply");
  if (!c.getString("kind")) c.set("kind", "comment");
}

function commentAfterCreate(e) {
  const dao = $app.dao();
  const c = e.record;
  const report = dao.findRecordById("employeeReports", c.getString("report"));
  const author = userOf(dao, c.getString("author"));
  const kind = c.getString("kind");
  if (kind === "info_request") report.set("status", "info_requested");
  if (kind === "reply") report.set("status", "submitted");
  if (kind !== "comment") dao.saveRecord(report);
  const others = [report.getString("employee")].concat(ids(report, "recipients")).filter((id) => id && id !== c.getString("author"));
  const name = author ? author.getString("name") : "Someone";
  const link = `/dashboard/employee-portal/reports/${report.id}`;
  const title = kind === "info_request" ? `${name} asked for more information` : kind === "reply" ? `${name} replied on a report` : `${name} commented on a report`;
  const excerpt = c.getString("body").slice(0, 160);
  core.notify(dao, others, { title, body: `${reportLabel(report)} — ${excerpt}`, link, type: kind === "info_request" ? "warning" : "info" });
  mail(dao, others, `${title}: ${reportLabel(report)}`, [`${title} on "${reportLabel(report)}":`, excerpt], link);
}

// ------------------------------------------------------------------ expense categories
function categoryBeforeCreate(e) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  const name = e.record.getString("name").trim().replace(/\s+/g, " ");
  if (name.length < 3) throw new BadRequestError("Enter a category name of at least 3 characters.");
  const all = dao.findRecordsByFilter("expenses_categories", "id != ''", "", 1000, 0) || [];
  const dup = all.find((x) => x.getString("name").trim().toLowerCase() === name.toLowerCase());
  if (dup) throw new BadRequestError(`The category "${dup.getString("name")}" already exists — choose it from the list.`);
  e.record.set("name", name.charAt(0).toUpperCase() + name.slice(1));
  if (auth) e.record.set("created_by", auth.id);
}

module.exports = {
  hrScope, managesEmployee, mail, guardDecision, leaveBeforeSave, documentBeforeCreate, planBeforeSave,
  reportBeforeCreate, reportAfterCreate, reportBeforeUpdate, reportAfterUpdate, commentBeforeCreate, commentAfterCreate,
  categoryBeforeCreate,
};
