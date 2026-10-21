/// <reference path="../pb_data/types.d.ts" />
/**
 * Work plans, second step: work assigned by a manager and issues.
 *
 *  - plan_type "task": a piece of work with its own dates, assigned by a supervisor (deliverables, report, assessment)
 *  - origin: own (the staff member's plan) | assigned (set by a supervisor, e.g. the annual contract from the
 *    strategic plan, or a task) | cascaded (prepared from a higher-level plan); assigned_by and source say where from
 *  - issues: problems and risks raised on a plan (open / resolved), open_issues keeps the count
 *  - one plan per person, kind and period still applies, except to tasks
 *  - the person who assigned a plan can read it
 */
const HR_ALL = '(@request.auth.role.hr_scope = "all" || @request.auth.extra_roles.hr_scope ?= "all")';

migrate(
  (db) => {
    const dao = new Dao(db);
    const USERS = dao.findCollectionByNameOrId("users").id;
    const plans = dao.findCollectionByNameOrId("work_plans");

    const kind = plans.schema.getFieldByName("plan_type");
    const values = kind.options.values;
    if (values.indexOf("task") === -1) values.push("task");
    kind.options.values = values;

    const add = (f) => {
      if (!plans.schema.getFieldByName(f.name)) plans.schema.addField(new SchemaField(f));
    };
    add({ name: "origin", type: "select", required: false, options: { maxSelect: 1, values: ["own", "assigned", "cascaded"] } });
    add({ name: "assigned_by", type: "relation", required: false, options: { collectionId: USERS, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null } });
    add({ name: "source", type: "text", required: false, options: { min: null, max: 200, pattern: "" } });
    add({ name: "issues", type: "json", required: false, options: { maxSize: 200000 } });
    add({ name: "open_issues", type: "number", required: false, options: { min: null, max: null, noDecimal: true } });

    plans.indexes = Array.prototype.slice.call(plans.indexes || [])
      .filter((i) => i.indexOf("idx_work_plan_period") === -1)
      .concat(["CREATE UNIQUE INDEX idx_work_plan_period ON work_plans (staff, plan_type, period_start) WHERE plan_type != 'task'", "CREATE INDEX idx_work_plan_assigned ON work_plans (assigned_by)"]);

    const READ = `staff = @request.auth.id || supervisor = @request.auth.id || assigned_by = @request.auth.id || staff.department.head = @request.auth.id || ${HR_ALL}`;
    plans.listRule = READ;
    plans.viewRule = READ;
    dao.saveCollection(plans);

    for (const p of dao.findRecordsByFilter("work_plans", "origin = ''", "", 0, 0) || []) {
      p.set("origin", "own");
      p.set("open_issues", 0);
      dao.saveRecord(p);
    }
  },
  (db) => {
    const dao = new Dao(db);
    const plans = dao.findCollectionByNameOrId("work_plans");
    for (const n of ["origin", "assigned_by", "source", "issues", "open_issues"]) {
      const f = plans.schema.getFieldByName(n);
      if (f) plans.schema.removeField(f.id);
    }
    plans.indexes = Array.prototype.slice.call(plans.indexes || [])
      .filter((i) => i.indexOf("idx_work_plan_period") === -1 && i.indexOf("idx_work_plan_assigned") === -1)
      .concat(["CREATE UNIQUE INDEX idx_work_plan_period ON work_plans (staff, plan_type, period_start)"]);
    const READ = `staff = @request.auth.id || supervisor = @request.auth.id || staff.department.head = @request.auth.id || ${HR_ALL}`;
    plans.listRule = READ;
    plans.viewRule = READ;
    dao.saveCollection(plans);
  },
);
