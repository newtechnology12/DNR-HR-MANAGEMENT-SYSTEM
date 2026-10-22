/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — staff expenses and advances, paid from the cash books and posted to the general ledger.
 *
 *  - expenses_categories   + kind (claim = reimbursement of money spent, advance = salary advance), the GL account a
 *                            claim is charged to, active flag and an optional ceiling; written by Finance only
 *  - prepayments           staff requests go through the approval engine (head of department → DAF) and are paid by
 *                            the Cashier from a cash book: number, kind, department, GL account, budget line, approval
 *                            fields, payment (account, method, date, reference, cash book entry, journal), recovery of
 *                            advances through the payroll, documents. Written by the server only.
 *  - accounts, accounts_transactions, petty_cash_requests
 *                            the old floats and petty cash requests become read-only history: money moves through the
 *                            cash books (Bank & cash), so the cash book, the ledger and the budget always agree.
 */
const ME = "@request.auth.id";
const or = (...parts) => parts.map((p) => `(${p})`).join(" || ");
const grant = (p) => `'%_access_:true,_name_:_${p}_,_title_%'`;
const perm = (p) => `@request.auth.role.permitions ~ ${grant(p)} || @request.auth.extra_roles.permitions ?~ ${grant(p)}`;
const anyPerm = (...ps) => or(...ps.map(perm));
// Finance people who follow every request (the head of department sees their own department through the relation)
const EXPENSE_READERS = anyPerm("view_expenses", "view_employee_prepayments", "record_payments");
const FLOAT_READERS = anyPerm("view_petty_cash_accounts", "view_petty_cash_requests", "manage_bank_accounts");

const text = (name, max) => ({ name, type: "text", required: false, options: { min: null, max: max || null, pattern: "" } });
const int = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const files = (name, maxSelect) => ({ name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } });
const rel = (name, collectionId) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null } });

const CATEGORY_FIELDS = ["kind", "gl_account", "active", "max_amount"];
const REQUEST_FIELDS = [
  "number", "kind", "department", "gl_account", "budget_line", "funding_source", "pay_by",
  "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "cancel_reason", "budget_override", "actual_amount",
  "paid_from", "paid_at", "paid_by", "payment_method", "payment_reference", "entry", "journal", "recovered_in", "recovered_at", "attachments",
];

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (n) => dao.findCollectionByNameOrId(n).id;
    const addFields = (c, fields) => {
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
    };

    const cats = dao.findCollectionByNameOrId("expenses_categories");
    addFields(cats, [select("kind", ["claim", "advance"]), rel("gl_account", id("gl_accounts")), bool("active"), int("max_amount")]);
    const FINANCE_SETUP = anyPerm("manage_chart_of_accounts");
    cats.createRule = FINANCE_SETUP;
    cats.updateRule = FINANCE_SETUP;
    cats.deleteRule = FINANCE_SETUP;
    dao.saveCollection(cats);

    const req = dao.findCollectionByNameOrId("prepayments");
    addFields(req, [
      text("number", 40), select("kind", ["claim", "advance"]), rel("department", id("departments")), rel("gl_account", id("gl_accounts")),
      rel("budget_line", id("budget_lines")), rel("funding_source", id("funding_sources")), select("pay_by", ["cash", "mobile_money", "bank_transfer"]),
      rel("approval", id("approval_requests")), text("pending_approvers"), text("approver_history"), date("submitted_at"), date("approved_at"),
      text("cancel_reason", 500), text("budget_override", 40), int("actual_amount"),
      rel("paid_from", id("bank_accounts")), date("paid_at"), rel("paid_by", id("users")), select("payment_method", ["cash", "mobile_money", "bank_transfer"]),
      text("payment_reference", 120), rel("entry", id("cash_book_entries")), rel("journal", id("gl_journals")),
      rel("recovered_in", id("payrolls")), date("recovered_at"), files("attachments", 10),
    ]);
    const visible = or(`employee = ${ME}`, `requested_by = ${ME}`, `employee.department.head = ${ME}`, `pending_approvers ~ ${ME}`, `approver_history ~ ${ME}`, EXPENSE_READERS);
    req.listRule = visible;
    req.viewRule = visible;
    req.createRule = null;
    req.updateRule = null;
    req.deleteRule = null;
    dao.saveCollection(req);

    for (const name of ["accounts", "accounts_transactions"]) {
      const c = dao.findCollectionByNameOrId(name);
      c.listRule = FLOAT_READERS;
      c.viewRule = FLOAT_READERS;
      c.createRule = null;
      c.updateRule = null;
      c.deleteRule = null;
      dao.saveCollection(c);
    }
    const petty = dao.findCollectionByNameOrId("petty_cash_requests");
    petty.createRule = null;
    petty.updateRule = null;
    petty.deleteRule = null;
    dao.saveCollection(petty);
  },
  (db) => {
    // Fields go; the write rules stay closed (the old browser-side flows are not restored).
    const dao = new Dao(db);
    const drop = (name, fields) => {
      try {
        const c = dao.findCollectionByNameOrId(name);
        for (const f of fields) {
          const field = c.schema.getFieldByName(f);
          if (field) c.schema.removeField(field.id);
        }
        dao.saveCollection(c);
      } catch (_) {}
    };
    drop("expenses_categories", CATEGORY_FIELDS);
    drop("prepayments", REQUEST_FIELDS);
  }
);
