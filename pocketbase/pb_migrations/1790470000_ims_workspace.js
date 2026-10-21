/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — staff workspace: individual work planning and attendance corrections.
 *
 *  - strategic_objectives   RALGA's strategic objectives (planning master data); every plan activity can say
 *                           which objective it serves
 *  - work_plans             a staff member's plan for a week, a month, a quarter or the fiscal year (annual
 *                           performance contract, Imihigo-style): activities / objectives with outputs,
 *                           indicators, baseline, target, weight, means of verification, link to the department
 *                           plan and the strategic objective. Draft → submitted to the supervisor → approved
 *                           (or returned) → progress → report at the end of the period → supervisor assessment.
 *  - attendance_corrections a staff member asks HR to correct days without a clock-in (mission, training,
 *                           meeting outside the office…); approved days are added to the attendance log
 *
 * Reads: the person, their supervisor / head of department and HR with an organisation-wide scope.
 */
const AUTH = '@request.auth.id != ""';
const HR_ALL = '(@request.auth.role.hr_scope = "all" || @request.auth.extra_roles.hr_scope ?= "all")';

function text(name, required) {
  return { name, type: "text", required: !!required, options: { min: null, max: null, pattern: "" } };
}
function int(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } };
}
function bool(name) {
  return { name, type: "bool", required: false, options: {} };
}
function date(name) {
  return { name, type: "date", required: false, options: { min: "", max: "" } };
}
function json(name) {
  return { name, type: "json", required: false, options: { maxSize: 2000000 } };
}
function select(name, values) {
  return { name, type: "select", required: false, options: { maxSelect: 1, values } };
}
function files(name, maxSelect) {
  return { name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } };
}
function rel(name, collectionId, maxSelect, cascadeDelete) {
  return {
    name, type: "relation", required: false,
    options: { collectionId, cascadeDelete: !!cascadeDelete, minSelect: null, maxSelect: maxSelect || 1, displayFields: null },
  };
}

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (name) => dao.findCollectionByNameOrId(name).id;
    const exists = (name) => {
      try {
        dao.findCollectionByNameOrId(name);
        return true;
      } catch (_) {
        return false;
      }
    };
    const create = (def) => {
      if (exists(def.name)) return id(def.name);
      const c = new Collection({ type: "base", ...def });
      dao.saveCollection(c);
      return c.id;
    };
    const USERS = id("users");
    const DEPARTMENTS = id("departments");

    create({
      name: "strategic_objectives",
      schema: [text("code", true), text("name", true), text("description"), int("sort"), bool("active"), rel("created_by", USERS)],
      indexes: ["CREATE UNIQUE INDEX idx_strategic_objective_code ON strategic_objectives (code)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });

    const PLAN_READ = `staff = @request.auth.id || supervisor = @request.auth.id || staff.department.head = @request.auth.id || ${HR_ALL}`;
    const PLANS = create({
      name: "work_plans",
      schema: [
        text("number"), rel("staff", USERS), rel("department", DEPARTMENTS), rel("supervisor", USERS),
        select("plan_type", ["weekly", "monthly", "quarterly", "annual"]), date("period_start"), date("period_end"), text("period_label"), int("fiscal_year"),
        text("title"), text("focus"), json("items"), int("progress"),
        select("status", ["draft", "submitted", "approved", "returned", "reported", "assessed"]),
        date("submitted_at"), date("approved_at"), rel("approved_by", USERS), text("review_comment"),
        text("report_summary"), text("challenges"), text("next_steps"), text("support_needed"), int("self_rating"), date("reported_at"),
        int("supervisor_rating"), text("supervisor_feedback"), date("assessed_at"), rel("assessed_by", USERS),
        files("attachments", 10), rel("created_by", USERS),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_work_plan_number ON work_plans (number) WHERE number != ''",
        "CREATE UNIQUE INDEX idx_work_plan_period ON work_plans (staff, plan_type, period_start)",
        "CREATE INDEX idx_work_plan_supervisor ON work_plans (supervisor, status)",
      ],
      listRule: PLAN_READ, viewRule: PLAN_READ,
      createRule: `${AUTH} && @request.data.staff = @request.auth.id`,
      updateRule: "staff = @request.auth.id",
      deleteRule: 'staff = @request.auth.id && status = "draft"',
    });
    const plans = dao.findCollectionByNameOrId("work_plans");
    if (!plans.schema.getFieldByName("parent")) {
      plans.schema.addField(new SchemaField(rel("parent", PLANS)));
      dao.saveCollection(plans);
    }

    const CORRECTION_READ = `employee = @request.auth.id || employee.department.head = @request.auth.id || ${HR_ALL} || ((@request.auth.role.hr_scope = "department" || @request.auth.extra_roles.hr_scope ?= "department") && employee.department = @request.auth.department)`;
    create({
      name: "attendance_corrections",
      schema: [
        text("number"), rel("employee", USERS), json("dates"), int("day_count"),
        select("reason", ["mission", "training", "meeting", "approved_absence", "forgot", "system", "other"]), text("explanation"), files("attachments", 5),
        select("status", ["pending", "approved", "rejected"]), rel("reviewed_by", USERS), date("reviewed_at"), text("review_comment"), int("added_days"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_attendance_correction_number ON attendance_corrections (number) WHERE number != ''", "CREATE INDEX idx_attendance_correction_employee ON attendance_corrections (employee, status)"],
      listRule: CORRECTION_READ, viewRule: CORRECTION_READ,
      createRule: `${AUTH} && @request.data.employee = @request.auth.id`,
      updateRule: null,
      deleteRule: 'employee = @request.auth.id && status = "pending"',
    });
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of ["attendance_corrections", "work_plans", "strategic_objectives"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  }
);
