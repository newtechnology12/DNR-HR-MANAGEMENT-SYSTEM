/// <reference path="../pb_data/types.d.ts" />
/**
 * Staff see their own records; wider access comes from the role (scope or permission), as for
 * leave and expenses. Covers the collections that were still open to every signed-in user:
 * attendance, petty cash, equipment and vehicle requests, cash accounts and their transactions,
 * and the legacy leave-plan / report tables. Also closes public sign-up on `users`.
 *
 * Permission checks read the role's `permitions` JSON, stored with sorted keys as
 * {"access":true,"name":"…","title":"…"} (privacy.pb.js keeps every entry in that shape and
 * scripts/test-privacy.mjs checks it). Sensitive employee fields are hidden by
 * pb_hooks/privacy.pb.js (rules cannot hide fields).
 */
const ME = "@request.auth.id";
const AUTH = '@request.auth.id != ""';
const or = (...parts) => parts.map((p) => `(${p})`).join(" || ");
// LIKE pattern for one granted entry. Each "_" stands for a double quote (a quote inside a rule
// string breaks the rule once @request.auth is resolved), and the "%" stops PocketBase escaping "_".
const grant = (p) => `'%_access_:true,_name_:_${p}_,_title_%'`;
const perm = (p) => `@request.auth.role.permitions ~ ${grant(p)} || @request.auth.extra_roles.permitions ?~ ${grant(p)}`;
const anyPerm = (...ps) => or(...ps.map(perm));
const HR_ALL = '@request.auth.role.hr_scope = "all" || @request.auth.extra_roles.hr_scope ?= "all"';
const hrDept = (f) =>
  `(@request.auth.role.hr_scope = "department" || @request.auth.extra_roles.hr_scope ?= "department") && @request.auth.department != "" && ${f}.department = @request.auth.department`;
const head = (f) => `${f}.department.head = ${ME}`;
/** The employee, their department head, and HR with the matching scope. */
const personal = (f) => or(`${f} = ${ME}`, HR_ALL, hrDept(f), head(f));

const FINANCE_READ = anyPerm("view_petty_cash_accounts", "view_petty_cash_requests", "approve_or_reject_request", "approve_or_reject_expense", "manage_bank_accounts");
const FINANCE_WRITE = anyPerm("update_petty_cash_account", "refill_accounts", "approve_or_reject_request", "approve_or_reject_expense", "manage_bank_accounts");

const RULES = {
  attendance: {
    list: personal("employee"),
    view: personal("employee"),
    // Staff clock themselves in (the hook stamps the server time); HR records anyone.
    create: or(`@request.data.employee = ${ME}`, anyPerm("create_attendance")),
    update: or(`employee = ${ME}`, anyPerm("update_attendance")),
    delete: anyPerm("update_attendance"),
  },
  petty_cash_requests: {
    list: or(`requested_by = ${ME}`, `employee = ${ME}`, head("requested_by"), anyPerm("view_petty_cash_requests", "approve_or_reject_request")),
    view: or(`requested_by = ${ME}`, `employee = ${ME}`, head("requested_by"), anyPerm("view_petty_cash_requests", "approve_or_reject_request")),
    create: or(`@request.data.requested_by = ${ME}`, anyPerm("view_petty_cash_requests")),
    update: or(`requested_by = ${ME} && status = "pending"`, anyPerm("view_petty_cash_requests", "approve_or_reject_request")),
    delete: or(`requested_by = ${ME} && status = "pending"`, anyPerm("approve_or_reject_request")),
  },
  assets_requests: {
    list: or(`requested_by = ${ME}`, head("requested_by"), anyPerm("view_all_assets_requests", "reject_or_approve_assets_requests")),
    view: or(`requested_by = ${ME}`, head("requested_by"), anyPerm("view_all_assets_requests", "reject_or_approve_assets_requests")),
    create: or(`@request.data.requested_by = ${ME}`, anyPerm("reject_or_approve_assets_requests")),
    update: or(`requested_by = ${ME} && status = "pending"`, anyPerm("reject_or_approve_assets_requests")),
    delete: or(`requested_by = ${ME} && status = "pending"`, anyPerm("reject_or_approve_assets_requests")),
  },
  CarRequests: {
    list: or(`employee = ${ME}`, `created_by = ${ME}`, `users.id ?= ${ME}`, head("employee"), anyPerm("view_petty_cash_requests", "approve_or_reject_request")),
    view: or(`employee = ${ME}`, `created_by = ${ME}`, `users.id ?= ${ME}`, head("employee"), anyPerm("view_petty_cash_requests", "approve_or_reject_request")),
    create: or(`@request.data.employee = ${ME}`, anyPerm("view_petty_cash_requests")),
    update: or(`(employee = ${ME} || created_by = ${ME}) && status = "pending"`, anyPerm("view_petty_cash_requests", "approve_or_reject_request")),
    delete: or(`(employee = ${ME} || created_by = ${ME}) && status = "pending"`, anyPerm("approve_or_reject_request")),
  },
  accounts: {
    list: FINANCE_READ,
    view: FINANCE_READ,
    create: anyPerm("create_petty_cash_account", "manage_bank_accounts"),
    update: FINANCE_WRITE,
    delete: anyPerm("update_petty_cash_account", "manage_bank_accounts"),
  },
  accounts_transactions: {
    list: FINANCE_READ,
    view: FINANCE_READ,
    create: FINANCE_WRITE,
    update: anyPerm("update_petty_cash_account", "manage_bank_accounts"),
    delete: anyPerm("update_petty_cash_account", "manage_bank_accounts"),
  },
  // Legacy tables (no screen uses them any more) keep the same "own or HR" boundary.
  LeavePlane: {
    list: or(personal("employee"), `created_by = ${ME}`),
    view: or(personal("employee"), `created_by = ${ME}`),
    create: AUTH,
    update: or(`created_by = ${ME} && status = "pending"`, HR_ALL),
    delete: or(`created_by = ${ME} && status = "pending"`, HR_ALL),
  },
  LeavePlaneReport: { list: or(`userId = ${ME}`, HR_ALL), view: or(`userId = ${ME}`, HR_ALL), create: HR_ALL, update: HR_ALL, delete: HR_ALL },
  reports: { list: or(`staffId = ${ME}`, HR_ALL), view: or(`staffId = ${ME}`, HR_ALL), create: AUTH, update: or(`staffId = ${ME}`, HR_ALL), delete: or(`staffId = ${ME}`, HR_ALL) },
};

migrate(
  (db) => {
    const dao = new Dao(db);
    for (const [name, r] of Object.entries(RULES)) {
      const c = dao.findCollectionByNameOrId(name);
      c.listRule = r.list;
      c.viewRule = r.view;
      c.createRule = r.create;
      c.updateRule = r.update;
      c.deleteRule = r.delete;
      dao.saveCollection(c);
    }
    // Accounts are created by HR (create_employee, checked in security.pb.js), never by sign-up.
    const users = dao.findCollectionByNameOrId("users");
    users.createRule = AUTH;
    dao.saveCollection(users);
  },
  (db) => {
    const dao = new Dao(db);
    for (const name of Object.keys(RULES)) {
      const c = dao.findCollectionByNameOrId(name);
      c.listRule = AUTH;
      c.viewRule = AUTH;
      c.createRule = AUTH;
      c.updateRule = AUTH;
      c.deleteRule = AUTH;
      dao.saveCollection(c);
    }
    const users = dao.findCollectionByNameOrId("users");
    users.createRule = "";
    dao.saveCollection(users);
  }
);
