/// <reference path="../pb_data/types.d.ts" />
/**
 * Performance appraisal system (configurable for small, medium and large organisations and NGOs):
 *
 *  - appraisal_templates  rating scale, weighted sections and criteria, grade bands, weight of the
 *                         system "activity score" (from action plans and reports) — all editable
 *  - appraisal_cycles     an appraisal period (e.g. "Annual 2026"), template, departments, deadlines
 *  - appraisals           one per employee per cycle: evaluator / activity / final score, grade, status
 *  - appraisal_reviews    each evaluator's ratings (department head, designated evaluators, self)
 *  - appraisal_claims     employee questions or disputes about their marks, and the answers
 */
const HR_ALL = '@request.auth.role.hr_scope = "all"';
const scoped = (f) =>
  `${HR_ALL} || ${f}.department.head = @request.auth.id || (@request.auth.role.hr_scope = "department" && ${f}.department = @request.auth.department)`;

const text = (name) => ({ name, type: "text", required: false, options: { min: null, max: null, pattern: "" } });
const num = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const file = (name, max) => ({ name, type: "file", required: false, options: { maxSelect: max, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } });
const rel = (name, collectionId, max, cascade) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: !!cascade, minSelect: null, maxSelect: max || 1, displayFields: null } });

const SCALE = [
  { value: 1, label: "Unsatisfactory", description: "Does not meet the requirements of the role" },
  { value: 2, label: "Needs improvement", description: "Meets some requirements; improvement required" },
  { value: 3, label: "Meets expectations", description: "Fully meets the requirements of the role" },
  { value: 4, label: "Exceeds expectations", description: "Regularly goes beyond the requirements" },
  { value: 5, label: "Outstanding", description: "Exceptional performance, a model for others" },
];
const SECTIONS = [
  {
    id: "objectives", title: "Achievement of objectives", weight: 40, criteria: [
      { id: "quality", title: "Quality of work", description: "Accuracy, thoroughness and reliability of outputs", weight: 1 },
      { id: "productivity", title: "Productivity", description: "Volume of work delivered against agreed targets", weight: 1 },
      { id: "timeliness", title: "Timeliness of delivery", description: "Meets deadlines and plans work ahead", weight: 1 },
      { id: "targets", title: "Achievement of agreed targets", description: "Results of the action plan and performance contract (Imihigo)", weight: 1 },
    ],
  },
  {
    id: "competencies", title: "Core competencies", weight: 30, criteria: [
      { id: "knowledge", title: "Job knowledge and technical skills", description: "", weight: 1 },
      { id: "problem", title: "Problem solving and judgement", description: "", weight: 1 },
      { id: "communication", title: "Communication", description: "Written and oral, with colleagues and members/partners", weight: 1 },
      { id: "teamwork", title: "Teamwork and collaboration", description: "", weight: 1 },
      { id: "initiative", title: "Initiative and innovation", description: "", weight: 1 },
    ],
  },
  {
    id: "values", title: "Values and conduct", weight: 20, criteria: [
      { id: "integrity", title: "Integrity", description: "Honesty, confidentiality, no conflict of interest", weight: 1 },
      { id: "accountability", title: "Accountability", description: "Takes ownership of results and resources", weight: 1 },
      { id: "service", title: "Service to members and partners", description: "", weight: 1 },
      { id: "attendance", title: "Attendance and punctuality", description: "", weight: 1 },
    ],
  },
  {
    id: "development", title: "Learning and development", weight: 10, criteria: [
      { id: "learning", title: "Learning and self-development", description: "", weight: 1 },
      { id: "adaptability", title: "Adaptability to change", description: "", weight: 1 },
    ],
  },
];
const GRADES = [
  { min: 90, grade: "A", label: "Outstanding" },
  { min: 80, grade: "B", label: "Exceeds expectations" },
  { min: 65, grade: "C", label: "Meets expectations" },
  { min: 50, grade: "D", label: "Needs improvement" },
  { min: 0, grade: "E", label: "Unsatisfactory" },
];

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (n) => dao.findCollectionByNameOrId(n).id;
    const USERS = id("users");
    const DEPTS = id("departments");

    const templates = new Collection({
      type: "base", name: "appraisal_templates",
      schema: [
        text("name"), text("description"), json("rating_scale"), json("sections"), json("grade_bands"), num("activity_weight"),
        num("self_weight"), bool("allow_self_assessment"), bool("active"), rel("departments", DEPTS, 50), rel("created_by", USERS),
      ],
      listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""', createRule: HR_ALL, updateRule: HR_ALL, deleteRule: HR_ALL,
    });
    dao.saveCollection(templates);
    const t = new Record(templates);
    t.load({
      name: "Standard staff appraisal", description: "Default template: weighted objectives, competencies, values and development, with the system activity score from action plans and reports.",
      rating_scale: SCALE, sections: SECTIONS, grade_bands: GRADES, activity_weight: 20, self_weight: 0, allow_self_assessment: true, active: true,
    });
    dao.saveRecord(t);

    const cycles = new Collection({
      type: "base", name: "appraisal_cycles",
      schema: [
        text("name"), rel("template", templates.id), date("period_start"), date("period_end"), date("due_date"), select("status", ["draft", "open", "closed"]),
        rel("departments", DEPTS, 50), text("notes"), rel("created_by", USERS), date("launched_at"),
      ],
      listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""', createRule: HR_ALL, updateRule: HR_ALL, deleteRule: HR_ALL,
    });
    dao.saveCollection(cycles);

    const visibleToEmployee = '(employee = @request.auth.id && (status = "shared" || status = "acknowledged" || status = "disputed" || status = "finalized"))';
    const appraisals = new Collection({
      type: "base", name: "appraisals",
      schema: [
        rel("cycle", cycles.id, 1, true), rel("employee", USERS), rel("department", DEPTS), rel("evaluators", USERS, 20),
        select("status", ["not_started", "in_progress", "submitted", "shared", "acknowledged", "disputed", "finalized"]),
        num("evaluator_score"), num("self_score"), num("activity_score"), json("activity_detail"), num("final_score"), text("grade"), text("grade_label"),
        json("section_scores"), json("template_snapshot"), text("manager_summary"), text("employee_comment"),
        date("shared_at"), date("acknowledged_at"), date("finalized_at"), rel("finalized_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_appraisal_cycle_employee ON appraisals (cycle, employee)"],
      listRule: `${visibleToEmployee} || evaluators.id ?= @request.auth.id || ${scoped("employee")}`,
      viewRule: `${visibleToEmployee} || evaluators.id ?= @request.auth.id || ${scoped("employee")}`,
      createRule: null, updateRule: null, deleteRule: HR_ALL,
    });
    dao.saveCollection(appraisals);

    const reviews = new Collection({
      type: "base", name: "appraisal_reviews",
      schema: [
        rel("appraisal", appraisals.id, 1, true), rel("evaluator", USERS), select("role", ["manager", "evaluator", "self"]), json("ratings"),
        text("overall_comment"), num("score"), select("status", ["draft", "submitted"]), date("submitted_at"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_review_appraisal_evaluator ON appraisal_reviews (appraisal, evaluator)"],
      listRule: `evaluator = @request.auth.id || ${scoped("appraisal.employee")} || (appraisal.employee = @request.auth.id && status = "submitted" && (appraisal.status = "shared" || appraisal.status = "acknowledged" || appraisal.status = "disputed" || appraisal.status = "finalized"))`,
      viewRule: `evaluator = @request.auth.id || ${scoped("appraisal.employee")} || (appraisal.employee = @request.auth.id && status = "submitted" && (appraisal.status = "shared" || appraisal.status = "acknowledged" || appraisal.status = "disputed" || appraisal.status = "finalized"))`,
      createRule: null, updateRule: null, deleteRule: null,
    });
    dao.saveCollection(reviews);

    const claims = new Collection({
      type: "base", name: "appraisal_claims",
      schema: [
        rel("appraisal", appraisals.id, 1, true), rel("author", USERS), text("criterion"), text("message"), file("attachments", 5),
        select("status", ["open", "upheld", "rejected", "answered"]), text("response"), rel("responded_by", USERS), date("responded_at"),
      ],
      listRule: `author = @request.auth.id || appraisal.employee = @request.auth.id || appraisal.evaluators.id ?= @request.auth.id || ${scoped("appraisal.employee")}`,
      viewRule: `author = @request.auth.id || appraisal.employee = @request.auth.id || appraisal.evaluators.id ?= @request.auth.id || ${scoped("appraisal.employee")}`,
      createRule: null, updateRule: null, deleteRule: null,
    });
    dao.saveCollection(claims);
  },
  (db) => {
    const dao = new Dao(db);
    for (const n of ["appraisal_claims", "appraisal_reviews", "appraisals", "appraisal_cycles", "appraisal_templates"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  }
);
