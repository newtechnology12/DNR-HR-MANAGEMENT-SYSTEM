/// <reference path="../pb_data/types.d.ts" />
/**
 * Leave policy (Rwanda) — configurable, not hard-coded:
 *
 *  - leave_types        entitlement, day basis (working / calendar), paid, attachment rules, eligibility,
 *                       whether it is deducted from annual leave. Defaults follow Law N° 66/2018 regulating
 *                       labour in Rwanda — HR must confirm them against the current law and internal policy.
 *  - public_holidays    excluded when counting working days (movable feasts must be confirmed each year)
 *  - settings           annual accrual per month, seniority bonus, carry-over, negative balance
 *  - leave_plans        annual leave plan per employee and year (days planned per month), carry-over,
 *                       adjustments, approval
 */
const AUTH = '@request.auth.id != ""';
const HR_ALL = '@request.auth.role.hr_scope = "all"';
const scoped = (f) =>
  `${HR_ALL} || ${f} = @request.auth.id || ${f}.department.head = @request.auth.id || (@request.auth.role.hr_scope = "department" && ${f}.department = @request.auth.department)`;

const text = (name) => ({ name, type: "text", required: false, options: { min: null, max: null, pattern: "" } });
const num = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const rel = (name, collectionId) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null } });

// [name, code, category, days, basis, paid, attachment, attachAfter, deductsAnnual, gender, maxPerRequest, specify, sort, reference, description]
const TYPES = [
  ["Annual Leave", "ANNUAL", "annual", 18, "working", true, false, 0, true, "any", 0, false, 1, "Law 66/2018, art. 52", "1.5 working days per month of service, plus 1 day for every 3 years of service with the employer."],
  ["Sick Leave", "SICK", "sick", 0, "working", true, true, 2, false, "any", 0, false, 2, "Law 66/2018", "Medical certificate required beyond 2 days."],
  ["Maternity Leave", "MATERNITY", "maternity", 84, "calendar", true, true, 0, false, "female", 84, false, 3, "Law 66/2018, art. 60", "12 weeks (84 calendar days); maternity benefits paid through RSSB."],
  ["Paternity Leave", "PATERNITY", "paternity", 7, "working", true, true, 0, false, "male", 7, false, 4, "Law 66/2018", "Following the birth of the employee's child."],
  ["Compassionate Leave", "CIRCUMSTANTIAL", "circumstantial", 0, "working", true, false, 0, false, "any", 7, false, 5, "Ministerial order on circumstantial leave", "Circumstantial leave (marriage, death of a family member, …) — days per event as set by the ministerial order and internal policy."],
  ["Study Leave", "STUDY", "study", 0, "working", false, true, 0, false, "any", 0, false, 6, "Internal policy", "Examinations or approved training."],
  ["Unpaid Leave", "UNPAID", "unpaid", 0, "working", false, false, 0, false, "any", 0, false, 7, "Internal policy", "Time off without pay, subject to approval."],
  ["Other", "OTHER", "other", 0, "working", true, false, 0, false, "any", 0, true, 8, "", "Any other leave — the employee specifies the type."],
];

// Fixed-date holidays recur every year; movable ones are entered per year and must be confirmed.
const HOLIDAYS = [
  ["2026-01-01", "New Year's Day", true, true],
  ["2026-01-02", "Day after New Year's Day", true, true],
  ["2026-02-01", "National Heroes' Day", true, true],
  ["2026-03-20", "Eid al-Fitr (estimated)", false, false],
  ["2026-04-03", "Good Friday", false, true],
  ["2026-04-06", "Easter Monday", false, true],
  ["2026-04-07", "Genocide against the Tutsi Memorial Day", true, true],
  ["2026-05-01", "Labour Day", true, true],
  ["2026-05-27", "Eid al-Adha (estimated)", false, false],
  ["2026-07-01", "Independence Day", true, true],
  ["2026-07-04", "Liberation Day", true, true],
  ["2026-08-07", "Umuganura Day (first Friday of August)", false, true],
  ["2026-08-15", "Assumption Day", true, true],
  ["2026-12-25", "Christmas Day", true, true],
  ["2026-12-26", "Boxing Day", true, true],
];

migrate(
  (db) => {
    const dao = new Dao(db);
    const USERS = dao.findCollectionByNameOrId("users").id;
    const policyRules = { listRule: AUTH, viewRule: AUTH, createRule: HR_ALL, updateRule: HR_ALL, deleteRule: HR_ALL };

    const types = new Collection({
      type: "base",
      name: "leave_types",
      schema: [
        text("name"), text("code"), select("category", ["annual", "sick", "maternity", "paternity", "circumstantial", "study", "unpaid", "other"]),
        num("days_per_year"), select("day_basis", ["working", "calendar"]), bool("paid"), bool("requires_attachment"), num("attachment_after_days"),
        bool("deducts_annual"), select("eligible_gender", ["any", "female", "male"]), num("max_per_request"), bool("requires_specify"),
        bool("active"), num("sort"), text("legal_reference"), text("description"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_leave_types_name ON leave_types (name)"],
      ...policyRules,
    });
    dao.saveCollection(types);
    for (const t of TYPES) {
      const r = new Record(types);
      const [name, code, category, days, basis, paid, attach, after, deducts, gender, max, specify, sort, reference, description] = t;
      r.load({ name, code, category, days_per_year: days, day_basis: basis, paid, requires_attachment: attach, attachment_after_days: after, deducts_annual: deducts, eligible_gender: gender, max_per_request: max, requires_specify: specify, active: true, sort, legal_reference: reference, description });
      dao.saveRecord(r);
    }

    const holidays = new Collection({
      type: "base",
      name: "public_holidays",
      schema: [date("date"), text("name"), bool("recurring"), bool("confirmed"), text("notes")],
      indexes: ["CREATE UNIQUE INDEX idx_public_holidays_date ON public_holidays (date)"],
      ...policyRules,
    });
    dao.saveCollection(holidays);
    for (const [d, name, recurring, confirmed] of HOLIDAYS) {
      const r = new Record(holidays);
      r.load({ date: `${d} 12:00:00.000Z`, name, recurring, confirmed, notes: confirmed ? "" : "Date depends on the moon sighting — confirm when the government announces it." });
      dao.saveRecord(r);
    }

    const settings = dao.findCollectionByNameOrId("settings");
    for (const f of [num("leave_accrual_per_month"), num("leave_seniority_every_years"), num("leave_seniority_extra_days"), num("leave_seniority_max_days"), bool("leave_allow_negative"), num("leave_plan_start_month")]) {
      if (!settings.schema.getFieldByName(f.name)) settings.schema.addField(new SchemaField(f));
    }
    dao.saveCollection(settings);
    for (const s of dao.findRecordsByFilter("settings", "id != ''", "", 10, 0) || []) {
      if (!s.getFloat("leave_accrual_per_month")) s.set("leave_accrual_per_month", 1.5);
      if (!s.getFloat("leave_seniority_every_years")) s.set("leave_seniority_every_years", 3);
      if (!s.getFloat("leave_seniority_extra_days")) s.set("leave_seniority_extra_days", 1);
      if (!s.getFloat("leave_plan_start_month")) s.set("leave_plan_start_month", 1);
      if (!s.getFloat("leaves_per_year")) s.set("leaves_per_year", 18);
      if (!s.getFloat("max_carryover_leaves")) s.set("max_carryover_leaves", 5);
      dao.saveRecord(s);
    }

    const plans = new Collection({
      type: "base",
      name: "leave_plans",
      schema: [
        rel("employee", USERS), num("year"), json("months"), num("carried_over"), bool("carry_manual"), num("adjustment"), text("adjustment_reason"),
        select("status", ["draft", "approved"]), rel("approved_by", USERS), date("approved_at"), text("notes"), rel("updated_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_leave_plans_emp_year ON leave_plans (employee, year)"],
      listRule: scoped("employee"),
      viewRule: scoped("employee"),
      createRule: null, // through /api/dnr/leave/plans
      updateRule: null,
      deleteRule: HR_ALL,
    });
    dao.saveCollection(plans);
  },
  (db) => {
    const dao = new Dao(db);
    for (const n of ["leave_plans", "public_holidays", "leave_types"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  }
);
