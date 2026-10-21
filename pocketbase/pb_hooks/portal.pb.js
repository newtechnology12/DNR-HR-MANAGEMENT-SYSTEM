/// <reference path="../pb_data/types.d.ts" />
/**
 * Employee portal hooks. Rules live in lib/portal.js; record visibility is in the collection API
 * rules (migration 1790340000_employee_portal.js).
 */

// Leave: "Other" must be specified; decisions only by a manager of the employee, never on your own leave.
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/portal.js`).leaveBeforeSave(e), "leaves");
onRecordBeforeUpdateRequest((e) => {
  const portal = require(`${__hooks}/lib/portal.js`);
  portal.leaveBeforeSave(e);
  portal.guardDecision(e, "update_leave", "leave request");
}, "leaves");

// Expenses: same separation of duties.
onRecordBeforeCreateRequest((e) => {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  e.record.set("created_by", auth.id);
  e.record.set("status", "pending");
  e.record.set("approved_by", "");
  e.record.set("rejected_by", "");
  if (!(e.record.getFloat("amount") > 0)) throw new BadRequestError("Enter an amount greater than zero.");
}, "prepayments");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/portal.js`).guardDecision(e, "approve_or_reject_expense", "expense request"), "prepayments");

// Documents: staff can add, never delete. HR deletes only with the explicit permission.
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/portal.js`).documentBeforeCreate(e), "employee_documents");
onRecordBeforeDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission($app.dao(), auth, "delete_employee_documents", "delete employee documents");
}, "employee_documents");
onRecordAfterDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "deleted", collection: "employee_documents", recordId: e.record.id, label: e.record.getString("name"), meta: core.requestMeta(e.httpContext) });
}, "employee_documents");

// Action plans.
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/portal.js`).planBeforeSave(e), "actionPlans");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/portal.js`).planBeforeSave(e), "actionPlans");

// Reports: routed to readers, reviewed, discussed.
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/portal.js`).reportBeforeCreate(e), "employeeReports");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/portal.js`).reportAfterCreate(e), "employeeReports");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/portal.js`).reportBeforeUpdate(e), "employeeReports");
onRecordAfterUpdateRequest((e) => require(`${__hooks}/lib/portal.js`).reportAfterUpdate(e), "employeeReports");
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/portal.js`).commentBeforeCreate(e), "report_comments");
onRecordAfterCreateRequest((e) => require(`${__hooks}/lib/portal.js`).commentAfterCreate(e), "report_comments");

// Expense categories: no duplicates.
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/portal.js`).categoryBeforeCreate(e), "expenses_categories");
