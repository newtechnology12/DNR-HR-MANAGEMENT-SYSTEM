/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 4: supplier invoices and payment vouchers (M4)
 *
 *  - payment_vouchers   prepared by the Accountant for approved supplier invoices (one supplier) or for a
 *                       direct expense on a budget line; withholding tax from the dated tax table; approved
 *                       Accountant → DAF → SG (above the DAF limit); executed by the Cashier. Whoever
 *                       prepared or approved a voucher cannot execute it.
 *  - payments           every payment now comes from a voucher (voucher, withholding tax, net paid)
 *  - supplier_invoices  duplicate check (same supplier and number, or same supplier, amount and date
 *                       within N days) with a recorded override reason
 *  - settings           duplicate_invoice_days
 *  - a default "Payment voucher approval" workflow when none exists
 *
 * Money is whole RWF (noDecimal).
 */
const AUTH = '@request.auth.id != ""';

function text(name, required) {
  return { name, type: "text", required: !!required, options: { min: null, max: null, pattern: "" } };
}
function int(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } };
}
function num(name) {
  return { name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } };
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
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };
    const USERS = id("users");

    if (!exists("payment_vouchers")) {
      dao.saveCollection(new Collection({
        type: "base",
        name: "payment_vouchers",
        schema: [
          text("number"), select("voucher_type", ["invoice", "direct"]), rel("supplier", id("suppliers")), text("payee_name"), json("payee_bank"),
          text("description"), json("lines"), rel("department", id("departments")), rel("budget_line", id("budget_lines")), rel("funding_source", id("funding_sources")),
          rel("expense_account", id("gl_accounts")), int("gross_amount"), int("wht_base"), text("wht_code"), num("wht_rate"), int("wht_amount"), int("net_amount"),
          text("currency"), select("status", ["draft", "pending_approval", "approved", "returned", "rejected", "cancelled", "paid"]),
          rel("prepared_by", USERS), rel("approval", id("approval_requests")), text("pending_approvers"), text("approver_history"),
          date("submitted_at"), date("approved_at"), date("due_date"), select("payment_method", ["bank_transfer", "cheque", "mobile_money", "cash"]),
          date("payment_date"), text("payment_reference"), rel("paid_by", USERS), date("paid_at"), text("cancel_reason"),
          rel("budget_override", id("budget_overrides")), int("actual_amount"), files("attachments", 10), text("notes"),
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_voucher_number ON payment_vouchers (number) WHERE number != ''",
          "CREATE INDEX idx_voucher_supplier ON payment_vouchers (supplier, status)",
        ],
        // Visibility is checked in hooks (view_payment_vouchers and related roles).
        listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
      }));
    }

    addFields("payments", [rel("voucher", id("payment_vouchers")), int("wht_amount"), int("net_amount")]);
    addFields("supplier_invoices", [json("duplicate_check"), text("duplicate_override"), rel("duplicate_override_by", USERS)]);
    addFields("settings", [int("duplicate_invoice_days")]);

    // Default flow (spec §4): Accountant prepares → DAF → SG above the DAF voucher limit.
    const flows = dao.findRecordsByFilter("approval_workflows", "document_type = 'payment_voucher'", "", 1, 0) || [];
    if (!flows.length) {
      let daf = null;
      let sg = null;
      try {
        daf = dao.findFirstRecordByFilter("roles", "code = 'DAF'");
        sg = dao.findFirstRecordByFilter("roles", "code = 'SG'");
      } catch (_) {}
      if (daf && sg) {
        const wf = new Record(dao.findCollectionByNameOrId("approval_workflows"));
        wf.set("name", "Payment voucher approval");
        wf.set("description", "Prepared by the Accountant; the DAF approves; the Secretary General also approves above the DAF payment voucher limit. The Cashier then executes the payment.");
        wf.set("document_type", "payment_voucher");
        wf.set("active", true);
        wf.set("priority", 10);
        wf.set("min_amount", 0);
        wf.set("max_amount", 0);
        wf.set("allow_self_approval", false);
        wf.set("overdue_hours", 48);
        wf.set("steps", [
          { name: "Director of Finance approval", approver_type: "role", role: daf.id },
          { name: "Secretary General approval (above the DAF limit)", approver_type: "role", role: sg.id, above_limit_of: daf.id, skip_if_already_approved: true },
        ]);
        dao.saveRecord(wf);
      }
    }
  },
  (db) => {
    const dao = new Dao(db);
    for (const [col, fields] of [["payments", ["voucher", "wht_amount", "net_amount"]], ["supplier_invoices", ["duplicate_check", "duplicate_override", "duplicate_override_by"]], ["settings", ["duplicate_invoice_days"]]]) {
      try {
        const c = dao.findCollectionByNameOrId(col);
        for (const f of fields) {
          const field = c.schema.getFieldByName(f);
          if (field) c.schema.removeField(field.id);
        }
        dao.saveCollection(c);
      } catch (_) {}
    }
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("payment_vouchers"));
    } catch (_) {}
  }
);
