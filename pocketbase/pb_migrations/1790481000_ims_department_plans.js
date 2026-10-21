/// <reference path="../pb_data/types.d.ts" />
/**
 * Department plans as part of the planning cycle: the head of department sets the month's shared activities
 * (each with a target in a unit and a due date) and staff contribute to them from their own plans; the
 * department's achievement is the sum of the staff results.
 *
 *  - plan_type "department": one per department and month, prepared by the head, approved by the Secretary General
 *  - everyone in the department can read the department plan
 */
const HR_ALL = '(@request.auth.role.hr_scope = "all" || @request.auth.extra_roles.hr_scope ?= "all")';

migrate(
  (db) => {
    const dao = new Dao(db);
    const plans = dao.findCollectionByNameOrId("work_plans");
    const kind = plans.schema.getFieldByName("plan_type");
    const values = kind.options.values;
    if (values.indexOf("department") === -1) values.push("department");
    kind.options.values = values;
    plans.indexes = Array.prototype.slice.call(plans.indexes || [])
      .filter((i) => i.indexOf("idx_work_plan_department") === -1)
      .concat(["CREATE UNIQUE INDEX idx_work_plan_department ON work_plans (department, period_start) WHERE plan_type = 'department'"]);
    const READ = `staff = @request.auth.id || supervisor = @request.auth.id || assigned_by = @request.auth.id || staff.department.head = @request.auth.id || (plan_type = "department" && department = @request.auth.department) || ${HR_ALL}`;
    plans.listRule = READ;
    plans.viewRule = READ;
    dao.saveCollection(plans);
  },
  (db) => {
    const dao = new Dao(db);
    const plans = dao.findCollectionByNameOrId("work_plans");
    plans.indexes = Array.prototype.slice.call(plans.indexes || []).filter((i) => i.indexOf("idx_work_plan_department") === -1);
    const READ = `staff = @request.auth.id || supervisor = @request.auth.id || assigned_by = @request.auth.id || staff.department.head = @request.auth.id || ${HR_ALL}`;
    plans.listRule = READ;
    plans.viewRule = READ;
    dao.saveCollection(plans);
  },
);
