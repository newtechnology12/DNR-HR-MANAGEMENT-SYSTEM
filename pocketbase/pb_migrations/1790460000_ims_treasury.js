/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 5: bank and cash management (M5)
 *
 *  - bank_accounts          RALGA's bank accounts and cash books: GL cash account, optional restricted funding
 *                           source (donor account), opening balance at go-live, custodian and limit for cash.
 *                           The balance fields are refreshed by the server from the cash book.
 *  - cash_book_entries      every movement of money in or out of an account (receipts, voucher payments,
 *                           transfers, bank charges / interest recorded from the statement). Written by the
 *                           server only; a posted entry is never edited — it is reversed.
 *  - cash_receipts          money received (member contributions, Government transfers, donor grants, fees):
 *                           recorded by the Cashier, approved by the DAF, then posted to the cash book
 *  - bank_transfers         between RALGA accounts (incl. cash withdrawals for the petty cash float):
 *                           Cashier → DAF (→ SG above the DAF limit), posted out of one account into the other
 *  - bank_statements, bank_statement_lines   imported from the bank's Excel / CSV file with a column mapping,
 *                           matched to the cash book automatically (amount, date, reference) or by hand
 *  - bank_reconciliations   as of a statement date: bank and book balances, reconciling items with follow-up,
 *                           difference; prepared by the Accountant, approved by the DAF (preparer ≠ approver)
 *  - payment_vouchers.paid_from / cash_entry, payments.bank_account: the account a voucher was paid from
 *  - settings.bank_match_days (automatic matching window), stale_cheque_days
 *  - default workflows for receipts, transfers and reconciliations when none exist
 *
 * Money is whole RWF (noDecimal).
 */
const AUTH = '@request.auth.id != ""';
const FOLLOW_UP = ["timing", "investigate", "record", "correct", "resolved"];
const MATCH = ["auto", "manual", "recorded"];
const DOC_STATUS = ["draft", "pending_approval", "approved", "returned", "rejected", "cancelled", "reversed"];

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
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };
    const USERS = id("users");
    const GL = id("gl_accounts");
    const FUNDING = id("funding_sources");
    const APPROVALS = id("approval_requests");

    // Reads are checked in hooks (view_treasury and related permissions); writes go through hooks or routes.
    const ACCOUNTS = create({
      name: "bank_accounts",
      schema: [
        text("code", true), text("name", true), select("kind", ["bank", "cash"]), text("bank_name"), text("branch"), text("account_number"),
        text("account_name"), text("swift_code"), text("currency"), rel("gl_account", GL), rel("funding_source", FUNDING),
        int("opening_balance"), date("opening_date"), rel("custodian", USERS), int("cash_limit"), bool("is_default"),
        select("status", ["active", "closed"]), text("signatories"), json("statement_mapping"), text("notes"), rel("created_by", USERS),
        // kept up to date by the server from the cash book and the statements
        int("book_balance"), date("last_entry_date"), int("statement_balance"), date("statement_date"), date("reconciled_to"),
        int("reconciled_balance"), int("unmatched_book"), int("unmatched_bank"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_bank_account_code ON bank_accounts (code)"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: null,
    });

    const RECS = create({
      name: "bank_reconciliations",
      schema: [
        text("number"), rel("account", ACCOUNTS), date("as_of"), rel("period", id("fiscal_periods")),
        int("statement_balance"), int("statement_balance_computed"), int("book_balance"),
        int("outstanding_receipts"), int("outstanding_payments"), int("unrecorded_receipts"), int("unrecorded_payments"),
        int("adjusted_bank_balance"), int("adjusted_book_balance"), int("difference"), int("item_count"), json("items"), json("warnings"),
        select("status", ["draft", "pending_approval", "approved", "returned", "rejected", "cancelled"]),
        rel("prepared_by", USERS), rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"),
        date("submitted_at"), date("approved_at"), text("notes"), text("cancel_reason"), files("attachments", 10),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_bank_rec_number ON bank_reconciliations (number) WHERE number != ''",
        "CREATE INDEX idx_bank_rec_account ON bank_reconciliations (account, as_of)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    const STATEMENTS = create({
      name: "bank_statements",
      schema: [
        text("number"), rel("account", ACCOUNTS), date("statement_from"), date("statement_to"), int("opening_balance"), int("closing_balance"),
        int("total_in"), int("total_out"), int("line_count"), int("matched_count"), text("file_name"), json("mapping"),
        select("status", ["imported", "reconciled"]), text("notes"), rel("imported_by", USERS), files("attachments", 5),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_bank_statement_number ON bank_statements (number) WHERE number != ''",
        "CREATE INDEX idx_bank_statement_account ON bank_statements (account, statement_from)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    const LINES = create({
      name: "bank_statement_lines",
      schema: [
        rel("statement", STATEMENTS, 1, true), rel("account", ACCOUNTS), int("line_no"), date("txn_date"), date("value_date"),
        text("description"), text("reference"), select("direction", ["in", "out"]), int("amount"), int("balance"), bool("has_balance"),
        text("match_group"), select("match_method", MATCH), date("matched_at"), rel("matched_by", USERS), rel("reconciliation", RECS),
        select("follow_up", FOLLOW_UP), text("follow_up_note"),
      ],
      indexes: [
        "CREATE INDEX idx_bank_line_account ON bank_statement_lines (account, txn_date)",
        "CREATE INDEX idx_bank_line_statement ON bank_statement_lines (statement, line_no)",
        "CREATE INDEX idx_bank_line_group ON bank_statement_lines (match_group)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });

    const ENTRIES = create({
      name: "cash_book_entries",
      schema: [
        rel("account", ACCOUNTS), date("entry_date"), select("direction", ["in", "out"]), int("amount"),
        select("type", ["receipt", "payment", "transfer_in", "transfer_out", "bank_charge", "interest", "other"]),
        select("method", ["bank_transfer", "cheque", "mobile_money", "cash", "direct_deposit", "direct_debit", "cash_withdrawal", "cash_deposit", "other"]),
        text("reference"), text("counterparty"), text("description"), text("source_type"), text("source_id"), text("source_number"),
        rel("gl_account", GL), rel("funding_source", FUNDING), rel("budget_line", id("budget_lines")), bool("reversed"),
        text("match_group"), select("match_method", MATCH), date("matched_at"), rel("matched_by", USERS), rel("reconciliation", RECS),
        select("follow_up", FOLLOW_UP), text("follow_up_note"), rel("created_by", USERS),
      ],
      indexes: [
        "CREATE INDEX idx_cash_entry_account ON cash_book_entries (account, entry_date)",
        "CREATE INDEX idx_cash_entry_source ON cash_book_entries (source_type, source_id)",
        "CREATE INDEX idx_cash_entry_group ON cash_book_entries (match_group)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
    });
    addFields("cash_book_entries", [rel("reversal_of", ENTRIES)]);

    create({
      name: "cash_receipts",
      schema: [
        text("number"), rel("account", ACCOUNTS), date("receipt_date"), select("payer_type", ["member", "government", "donor", "client", "staff", "other"]),
        text("payer_name"), int("amount"), select("method", ["bank_transfer", "cheque", "mobile_money", "cash", "direct_deposit"]), text("reference"),
        rel("income_account", GL), rel("funding_source", FUNDING), rel("project", id("projects")), text("description"),
        select("status", DOC_STATUS), rel("recorded_by", USERS), rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"),
        date("submitted_at"), date("approved_at"), rel("entry", ENTRIES), rel("statement_line", LINES), text("cancel_reason"),
        text("reversal_reason"), rel("reversed_by", USERS), date("reversed_at"), files("attachments", 10), text("notes"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_cash_receipt_number ON cash_receipts (number) WHERE number != ''",
        "CREATE INDEX idx_cash_receipt_account ON cash_receipts (account, receipt_date)",
      ],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    create({
      name: "bank_transfers",
      schema: [
        text("number"), rel("from_account", ACCOUNTS), rel("to_account", ACCOUNTS), int("amount"), date("transfer_date"),
        select("method", ["bank_transfer", "cheque", "cash_withdrawal", "cash_deposit"]), text("reference"), text("description"),
        select("status", DOC_STATUS), rel("prepared_by", USERS), rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"),
        date("submitted_at"), date("approved_at"), rel("out_entry", ENTRIES), rel("in_entry", ENTRIES), text("cancel_reason"),
        text("reversal_reason"), rel("reversed_by", USERS), date("reversed_at"), files("attachments", 10), text("notes"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_bank_transfer_number ON bank_transfers (number) WHERE number != ''"],
      listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
    });

    addFields("payment_vouchers", [rel("paid_from", ACCOUNTS), rel("cash_entry", ENTRIES)]);
    addFields("payments", [rel("bank_account", ACCOUNTS)]);
    addFields("settings", [int("bank_match_days"), int("stale_cheque_days")]);

    // Default flows (spec §2: receipts, transfers and reconciliations are approved by the DAF).
    let daf = null;
    let sg = null;
    try {
      daf = dao.findFirstRecordByFilter("roles", "code = 'DAF'");
      sg = dao.findFirstRecordByFilter("roles", "code = 'SG'");
    } catch (_) {}
    const flows = [
      ["cash_receipt", "Receipt verification", "Recorded by the Cashier; the Director of Finance checks it against the bank or the cash counted, then it is posted to the cash book.", [
        { name: "Director of Finance verification", approver_type: "role", role: daf && daf.id },
      ]],
      ["bank_transfer", "Inter-account transfer approval", "Prepared by the Cashier; the Director of Finance approves; the Secretary General also approves above the DAF transfer limit.", [
        { name: "Director of Finance approval", approver_type: "role", role: daf && daf.id },
        { name: "Secretary General approval (above the DAF limit)", approver_type: "role", role: sg && sg.id, above_limit_of: daf && daf.id, skip_if_already_approved: true },
      ]],
      ["bank_reconciliation", "Bank reconciliation approval", "Prepared by the Accountant; approved by the Director of Finance. Whoever prepared it cannot approve it.", [
        { name: "Director of Finance approval", approver_type: "role", role: daf && daf.id },
      ]],
    ];
    if (daf && sg) {
      for (const [type, name, description, steps] of flows) {
        if ((dao.findRecordsByFilter("approval_workflows", "document_type = {:t}", "", 1, 0, { t: type }) || []).length) continue;
        const wf = new Record(dao.findCollectionByNameOrId("approval_workflows"));
        wf.set("name", name);
        wf.set("description", description);
        wf.set("document_type", type);
        wf.set("active", true);
        wf.set("priority", 10);
        wf.set("min_amount", 0);
        wf.set("max_amount", 0);
        wf.set("allow_self_approval", false);
        wf.set("overdue_hours", 48);
        wf.set("steps", steps);
        dao.saveRecord(wf);
      }
    }
  },
  (db) => {
    const dao = new Dao(db);
    for (const [col, fields] of [["payment_vouchers", ["paid_from", "cash_entry"]], ["payments", ["bank_account"]], ["settings", ["bank_match_days", "stale_cheque_days"]]]) {
      try {
        const c = dao.findCollectionByNameOrId(col);
        for (const f of fields) {
          const field = c.schema.getFieldByName(f);
          if (field) c.schema.removeField(field.id);
        }
        dao.saveCollection(c);
      } catch (_) {}
    }
    for (const name of ["bank_transfers", "cash_receipts", "cash_book_entries", "bank_statement_lines", "bank_statements", "bank_reconciliations", "bank_accounts"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name));
      } catch (_) {}
    }
    for (const type of ["cash_receipt", "bank_transfer", "bank_reconciliation"]) {
      for (const wf of dao.findRecordsByFilter("approval_workflows", "document_type = {:t}", "", 10, 0, { t: type }) || []) dao.deleteRecord(wf);
    }
  }
);
