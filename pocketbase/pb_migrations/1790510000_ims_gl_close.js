/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 8: general ledger and period close (M8).
 *
 *  - gl_journals                + manual journals: preparer, approval (Accountant → DAF), attachments, recurring source;
 *                                 status "rejected"
 *  - gl_recurring_journals      templates (rent, insurance, subscriptions…) generated as journals when due
 *  - period_reopen_requests     re-opening a closed period: asked by Finance, approved by the Secretary General
 *  - fiscal_periods             + the close checklist kept when the period is closed
 *  - supplier_invoices, payment_vouchers, cash_book_entries, bank_accounts + the GL journal each one posted, so every
 *    operational transaction can be traced to the ledger (and posted once only)
 */
const ME = "@request.auth.id";
const or = (...parts) => parts.map((p) => `(${p})`).join(" || ");
const grant = (p) => `'%_access_:true,_name_:_${p}_,_title_%'`;
const perm = (p) => `@request.auth.role.permitions ~ ${grant(p)} || @request.auth.extra_roles.permitions ?~ ${grant(p)}`;
const anyPerm = (...ps) => or(...ps.map(perm));
const LEDGER = anyPerm("view_journals", "manage_journals", "approve_journals", "export_ledger");

const text = (name, required, max) => ({ name, type: "text", required: !!required, options: { min: null, max: max || null, pattern: "" } });
const int = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: true } });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 2000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const files = (name, maxSelect) => ({ name, type: "file", required: false, options: { maxSelect, maxSize: 20971520, mimeTypes: [], thumbs: [], protected: false } });
const rel = (name, collectionId) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null } });

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
    const addFields = (name, fields) => {
      const c = dao.findCollectionByNameOrId(name);
      for (const f of fields) if (!c.schema.getFieldByName(f.name)) c.schema.addField(new SchemaField(f));
      dao.saveCollection(c);
    };
    const USERS = id("users");
    const JOURNALS = id("gl_journals");
    const APPROVALS = id("approval_requests");

    if (!has("gl_recurring_journals")) {
      dao.saveCollection(new Collection({
        type: "base", name: "gl_recurring_journals",
        schema: [
          text("name", true, 160), text("description", false, 500), select("frequency", ["monthly", "quarterly", "yearly"]), int("day_of_month"),
          date("start_date"), date("end_date"), date("next_date"), json("lines"), bool("active"), int("total"),
          rel("last_journal", JOURNALS), date("last_generated"), rel("created_by", USERS),
        ],
        listRule: LEDGER, viewRule: LEDGER, createRule: null, updateRule: null, deleteRule: null,
      }));
    }

    // manual journals: preparer, approval, documents; generated from a recurring template
    addFields("gl_journals", [
      rel("prepared_by", USERS), rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"), date("submitted_at"), date("approved_at"),
      text("cancel_reason", false, 500), files("attachments", 10), rel("recurring", id("gl_recurring_journals")),
    ]);
    const journals = dao.findCollectionByNameOrId("gl_journals");
    const status = journals.schema.getFieldByName("status");
    journals.schema.addField(new SchemaField({ id: status.id, name: "status", type: "select", required: false, options: { maxSelect: 1, values: ["draft", "pending_approval", "returned", "posted", "reversed", "cancelled", "rejected"] } }));
    dao.saveCollection(journals);

    if (!has("period_reopen_requests")) {
      dao.saveCollection(new Collection({
        type: "base", name: "period_reopen_requests",
        schema: [
          text("number"), rel("period", id("fiscal_periods")), text("reason", true, 1000), rel("requested_by", USERS),
          select("status", ["pending_approval", "approved", "rejected", "returned", "cancelled"]), text("cancel_reason", false, 500),
          rel("approval", APPROVALS), text("pending_approvers"), text("approver_history"), date("submitted_at"), date("approved_at"),
        ],
        listRule: or(anyPerm("close_periods", "reopen_periods", "view_journals", "manage_journals"), `pending_approvers ~ ${ME}`),
        viewRule: or(anyPerm("close_periods", "reopen_periods", "view_journals", "manage_journals"), `pending_approvers ~ ${ME}`, `approver_history ~ ${ME}`),
        createRule: null, updateRule: null, deleteRule: null,
      }));
    }
    addFields("fiscal_periods", [json("close_checklist"), text("close_note", false, 1000)]);

    // the journal each operational document posted
    addFields("supplier_invoices", [rel("journal", JOURNALS)]);
    addFields("payment_vouchers", [rel("journal", JOURNALS)]);
    addFields("cash_book_entries", [rel("journal", JOURNALS)]);
    addFields("bank_accounts", [rel("opening_journal", JOURNALS)]);
  },
  (db) => {
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
    drop("supplier_invoices", ["journal"]);
    drop("payment_vouchers", ["journal"]);
    drop("cash_book_entries", ["journal"]);
    drop("bank_accounts", ["opening_journal"]);
    drop("fiscal_periods", ["close_checklist", "close_note"]);
    drop("gl_journals", ["prepared_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "cancel_reason", "attachments", "recurring"]);
    for (const n of ["period_reopen_requests", "gl_recurring_journals"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  }
);
