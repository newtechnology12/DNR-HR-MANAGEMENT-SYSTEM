/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 6: payroll (M6) and the general ledger core it posts to.
 *
 *  - gl_journals / gl_journal_lines   the general ledger: balanced journals written by the server only (payroll
 *                                     now; vouchers, receipts, depreciation and manual journals in later steps).
 *                                     Lines carry account, department, funding source, project and budget line.
 *                                     Posted journals are never edited or deleted — they are reversed.
 *  - posting_accounts                 which GL account each automatic posting uses (Finance can change them)
 *  - staff_loans                      loans to staff repaid by monthly instalments through the payroll
 *  - salary_structures                + grade and the funding split of donor-funded staff
 *  - employees_payrolls               + department, grade, funding split and loan deductions (frozen on the slip)
 *  - payrolls                         + the GL journals, the budget posting, the account and date of payment
 *
 * Read access: journals with "view_journals" (checked by a hook); loans by the employee and HR (org-wide scope).
 */
const AUTH = '@request.auth.id != ""';
const HR_ALL = '(@request.auth.role.hr_scope = "all" || @request.auth.extra_roles.hr_scope ?= "all")';

const text = (name, required, max) => ({ name, type: "text", required: !!required, options: { min: null, max: max || null, pattern: "" } });
const int = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const files = (name, maxSelect) => ({ name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } });
const rel = (name, collectionId, cascadeDelete) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: !!cascadeDelete, minSelect: null, maxSelect: 1, displayFields: null } });

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (n) => dao.findCollectionByNameOrId(n).id;
    const has = (n) => {
      try {
        dao.findCollectionByNameOrId(n);
        return true;
      } catch (_) {
        return false;
      }
    };
    const USERS = id("users");
    const GL = id("gl_accounts");
    const DEPT = id("departments");
    const FUND = id("funding_sources");
    const PROJ = id("projects");
    const LINES = id("budget_lines");
    const FY = id("fiscal_years");
    const PERIODS = id("fiscal_periods");
    const CC = id("cost_centres");

    // ---- general ledger
    if (!has("gl_journals")) {
      dao.saveCollection(new Collection({
        type: "base", name: "gl_journals",
        schema: [
          text("number"), date("date"), rel("fiscal_year", FY), rel("period", PERIODS),
          select("journal_type", ["automatic", "manual", "recurring", "reversal", "opening"]),
          select("status", ["draft", "pending_approval", "returned", "posted", "reversed", "cancelled"]),
          text("source_type"), text("source_id"), text("source_number"), text("description", false, 500),
          int("total_debit"), int("total_credit"), int("line_count"),
          rel("created_by", USERS), rel("posted_by", USERS), date("posted_at"), text("reversal_reason"),
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_gl_journal_number ON gl_journals (number) WHERE number != ''",
          "CREATE INDEX idx_gl_journal_source ON gl_journals (source_type, source_id)",
          "CREATE INDEX idx_gl_journal_period ON gl_journals (fiscal_year, period, status)",
        ],
        listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
      }));
      const journals = dao.findCollectionByNameOrId("gl_journals");
      journals.schema.addField(new SchemaField(rel("reversal_of", journals.id)));
      journals.schema.addField(new SchemaField(rel("reversed_by", journals.id)));
      dao.saveCollection(journals);
    }
    if (!has("gl_journal_lines")) {
      dao.saveCollection(new Collection({
        type: "base", name: "gl_journal_lines",
        schema: [
          rel("journal", id("gl_journals"), true), int("line_no"), rel("account", GL), int("debit"), int("credit"), text("description", false, 300),
          rel("department", DEPT), rel("funding_source", FUND), rel("project", PROJ), rel("budget_line", LINES), rel("cost_centre", CC),
          date("date"), rel("fiscal_year", FY), rel("period", PERIODS), text("source_type"), text("status"),
        ],
        indexes: [
          "CREATE INDEX idx_gl_line_journal ON gl_journal_lines (journal)",
          "CREATE INDEX idx_gl_line_account ON gl_journal_lines (account, date)",
          "CREATE INDEX idx_gl_line_dims ON gl_journal_lines (fiscal_year, period, account)",
        ],
        listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
      }));
    }
    if (!has("posting_accounts")) {
      dao.saveCollection(new Collection({
        type: "base", name: "posting_accounts",
        schema: [text("key", true, 80), text("label", true, 160), text("module", false, 40), rel("account", GL), text("description", false, 400), int("sort")],
        indexes: ["CREATE UNIQUE INDEX idx_posting_account_key ON posting_accounts (key)"],
        listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
      }));
    }

    // ---- staff loans
    if (!has("staff_loans")) {
      dao.saveCollection(new Collection({
        type: "base", name: "staff_loans",
        schema: [
          text("number"), rel("employee", USERS), select("loan_type", ["staff_loan", "salary_advance", "emergency"]), text("purpose", false, 500),
          int("principal"), int("installment"), int("installments"), int("start_year"), int("start_month"), int("balance"), int("repaid"),
          select("status", ["pending_approval", "active", "repaid", "rejected", "cancelled"]), json("repayments"),
          rel("recorded_by", USERS), rel("decided_by", USERS), date("decided_at"), text("decision_comment", false, 1000), files("attachments", 5),
        ],
        indexes: ["CREATE UNIQUE INDEX idx_staff_loan_number ON staff_loans (number) WHERE number != ''", "CREATE INDEX idx_staff_loan_employee ON staff_loans (employee, status)"],
        listRule: `employee = @request.auth.id || ${HR_ALL}`,
        viewRule: `employee = @request.auth.id || ${HR_ALL}`,
        createRule: null, updateRule: null, deleteRule: null,
      }));
    }

    // ---- payroll fields
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };
    addFields("salary_structures", [text("grade", false, 30), json("funding_split")]);
    addFields("employees_payrolls", [rel("department", DEPT), text("grade", false, 30), json("funding_split"), int("loans"), json("loan_deductions")]);
    addFields("payrolls", [
      rel("gl_journal", id("gl_journals")), rel("payment_journal", id("gl_journals")), json("posting"), date("posted_at"),
      rel("payment_account", id("bank_accounts")), date("payment_date"), rel("cash_entry", id("cash_book_entries")),
    ]);
  },
  (db) => {
    const dao = new Dao(db);
    for (const n of ["staff_loans", "posting_accounts", "gl_journal_lines", "gl_journals"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  },
);
