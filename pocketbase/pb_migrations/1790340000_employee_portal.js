/// <reference path="../pb_data/types.d.ts" />
/**
 * Employee portal: privacy rules and richer records.
 *
 *  - roles.hr_scope             own | department | all — whose HR records a role can see
 *                               (department heads always see their own department's staff)
 *  - employee_documents         staff see only their own; nobody but HR (with a permission) deletes
 *  - leaves                     "Other" leave type is specified in other_type
 *  - actionPlans                personal or department plans; a personal plan can contribute to a
 *                               recorded department plan (parent_plan); progress and expected output
 *  - employeeReports            real links to the employee, department, action plan and the people who
 *                               must read the report; review status; several attachments
 *  - report_comments (new)      discussion on a report: comments, requests for information, replies
 *  - expenses_categories        one name per category (checked in hooks), created_by kept
 */
const AUTH = '@request.auth.id != ""';
const HR_ALL = '@request.auth.role.hr_scope = "all"';
const HR_MANAGER = '(@request.auth.role.hr_scope = "all" || @request.auth.role.hr_scope = "department")';

/** Rule: the record belongs to the signed-in user, their department (as head/HR), or HR can see all. */
const scoped = (field) =>
  `${HR_ALL} || ${field} = @request.auth.id || ${field}.department.head = @request.auth.id || (@request.auth.role.hr_scope = "department" && ${field}.department = @request.auth.department)`;

function text(name) {
  return { name, type: "text", required: false, options: { min: null, max: null, pattern: "" } };
}
function num(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } };
}
function date(name) {
  return { name, type: "date", required: false, options: { min: "", max: "" } };
}
function select(name, values) {
  return { name, type: "select", required: false, options: { maxSelect: 1, values } };
}
function files(name, maxSelect) {
  return { name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: ["200x200"], protected: false } };
}
function rel(name, collectionId, maxSelect) {
  return {
    name, type: "relation", required: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: maxSelect || 1, displayFields: null },
  };
}

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (name) => dao.findCollectionByNameOrId(name).id;
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
      return c;
    };
    const setRules = (name, rules) => {
      const c = dao.findCollectionByNameOrId(name);
      c.listRule = rules.list;
      c.viewRule = rules.view === undefined ? rules.list : rules.view;
      c.createRule = rules.create;
      c.updateRule = rules.update;
      c.deleteRule = rules.delete;
      dao.saveCollection(c);
    };
    const USERS = id("users");

    // ---------------------------------------------------------------- roles
    addFields("roles", [select("hr_scope", ["own", "department", "all"])]);
    // Initial visibility from the permissions each role already has.
    const byName = { Admin: "all", "HR Manager": "all", Accountant: "all", Director: "all", "Department Head": "department" };
    for (const r of dao.findRecordsByFilter("roles", "id != ''", "", 500, 0) || []) {
      if (r.getString("hr_scope")) continue;
      r.set("hr_scope", byName[r.getString("name")] || "own");
      dao.saveRecord(r);
    }

    // ---------------------------------------------------------------- documents
    const docs = addFields("employee_documents", [text("description"), text("document_number"), date("issue_date"), date("expiry_date")]);
    const att = docs.schema.getFieldByName("attachment");
    if (att) {
      att.options.maxSize = 20971520;
      att.options.thumbs = ["200x200"];
      dao.saveCollection(docs);
    }
    setRules("employee_documents", {
      list: scoped("employee"),
      create: `${AUTH} && (@request.data.employee = @request.auth.id || ${HR_MANAGER})`,
      update: HR_ALL,
      delete: HR_ALL, // plus the "delete_employee_documents" permission (hook)
    });

    // ---------------------------------------------------------------- leaves
    addFields("leaves", [text("other_type")]);
    setRules("leaves", {
      list: scoped("employee"),
      create: `${AUTH} && (@request.data.employee = @request.auth.id || ${HR_MANAGER})`,
      update: `(employee = @request.auth.id && status = "pending") || ${HR_ALL} || employee.department.head = @request.auth.id || (@request.auth.role.hr_scope = "department" && employee.department = @request.auth.department)`,
      delete: `(employee = @request.auth.id && status = "pending") || ${HR_ALL}`,
    });

    // ---------------------------------------------------------------- expenses
    setRules("prepayments", {
      list: scoped("employee"),
      create: `${AUTH} && (@request.data.employee = @request.auth.id || ${HR_MANAGER})`,
      update: `(employee = @request.auth.id && status = "pending") || ${scoped("employee")}`,
      delete: `(employee = @request.auth.id && status = "pending") || ${HR_ALL}`,
    });
    addFields("expenses_categories", []);
    setRules("expenses_categories", { list: AUTH, create: AUTH, update: HR_ALL, delete: HR_ALL });

    // ---------------------------------------------------------------- action plans
    const PLANS = id("actionPlans");
    addFields("actionPlans", [
      select("scope", ["personal", "department"]),
      rel("parent_plan", PLANS),
      num("progress"),
      text("expected_output"),
      text("completion_note"),
    ]);
    const planView = `${scoped("staff_id")} || created_by = @request.auth.id || department_id.head = @request.auth.id || (scope = "department" && department_id = @request.auth.department)`;
    setRules("actionPlans", {
      list: planView,
      create: `${AUTH} && (@request.data.staff_id = @request.auth.id || ${HR_MANAGER})`,
      update: `staff_id = @request.auth.id || created_by = @request.auth.id || ${HR_ALL} || department_id.head = @request.auth.id`,
      delete: `created_by = @request.auth.id || ${HR_ALL}`,
    });

    // ---------------------------------------------------------------- reports
    addFields("employeeReports", [
      text("title"),
      rel("employee", USERS),
      rel("department_id", id("departments")),
      rel("action_plan", PLANS),
      rel("recipients", USERS, 20),
      select("status", ["submitted", "reviewed", "info_requested"]),
      rel("reviewed_by", USERS),
      date("reviewed_at"),
      files("attachments", 10),
    ]);
    const reportView = `${scoped("employee")} || created_by = @request.auth.id || recipients.id ?= @request.auth.id`;
    setRules("employeeReports", {
      list: reportView,
      create: `${AUTH} && (@request.data.employee = @request.auth.id || ${HR_ALL})`,
      update: `employee = @request.auth.id || recipients.id ?= @request.auth.id || ${HR_ALL} || employee.department.head = @request.auth.id`,
      delete: HR_ALL,
    });

    const REPORTS = id("employeeReports");
    const comments = new Collection({
      type: "base",
      name: "report_comments",
      schema: [
        rel("report", REPORTS),
        rel("author", USERS),
        select("kind", ["comment", "info_request", "reply"]),
        text("body"),
        files("attachments", 5),
      ],
      indexes: ["CREATE INDEX idx_report_comments_report ON report_comments (report)"],
      listRule: `author = @request.auth.id || report.employee = @request.auth.id || report.recipients.id ?= @request.auth.id || report.employee.department.head = @request.auth.id || ${HR_ALL}`,
      viewRule: `author = @request.auth.id || report.employee = @request.auth.id || report.recipients.id ?= @request.auth.id || report.employee.department.head = @request.auth.id || ${HR_ALL}`,
      createRule: `${AUTH} && @request.data.author = @request.auth.id`,
      updateRule: null,
      deleteRule: null,
    });
    comments.schema.getFieldByName("report").options.cascadeDelete = true;
    dao.saveCollection(comments);
  },
  (db) => {
    const dao = new Dao(db);
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("report_comments"));
    } catch (_) {}
  }
);
