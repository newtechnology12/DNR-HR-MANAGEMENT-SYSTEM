/// <reference path="../pb_data/types.d.ts" />
/**
 * Performance evaluations are personal: the employee, their department head and HR can read them;
 * only managers (HR or the department head) write them, never about themselves.
 */
const HR_ALL = '@request.auth.role.hr_scope = "all"';
const scoped = (field) =>
  `${HR_ALL} || ${field} = @request.auth.id || ${field}.department.head = @request.auth.id || (@request.auth.role.hr_scope = "department" && ${field}.department = @request.auth.department)`;
const manager = `(${HR_ALL} || employee.department.head = @request.auth.id || (@request.auth.role.hr_scope = "department" && employee.department = @request.auth.department)) && employee != @request.auth.id`;

migrate(
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("perfomance_evaluations");
    c.listRule = scoped("employee");
    c.viewRule = scoped("employee");
    // Who may evaluate is governed by the "create_employee_perfomance" permission in the app; nobody rates themselves.
    c.createRule = `@request.auth.id != "" && @request.data.employee != @request.auth.id`;
    c.updateRule = manager;
    c.deleteRule = HR_ALL;
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("perfomance_evaluations");
    const AUTH = '@request.auth.id != ""';
    c.listRule = AUTH;
    c.viewRule = AUTH;
    c.createRule = AUTH;
    c.updateRule = AUTH;
    c.deleteRule = AUTH;
    dao.saveCollection(c);
  }
);
