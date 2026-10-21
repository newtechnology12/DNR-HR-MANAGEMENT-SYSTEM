/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 3: procurement linked to the budget, supplier bank-detail control (M3, SoD rule 6)
 *
 *  - supplier_bank_changes   new bank details for an approved supplier: requested by Procurement,
 *                            approved by Finance (engine type "supplier_bank_change"); the supplier keeps
 *                            its verified account until the change is approved. Server-written only.
 *  - suppliers               bank_change_pending, bank_verified_at / bank_verified_by
 *  - procurement_plan_lines  budget_line (each planned purchase is charged to a budget line)
 *  - a default "Supplier bank details change" workflow (DAF) when none exists
 */
const AUTH = '@request.auth.id != ""';

function text(name, required) {
  return { name, type: "text", required: !!required, options: { min: null, max: null, pattern: "" } };
}
function bool(name) {
  return { name, type: "bool", required: false, options: {} };
}
function date(name) {
  return { name, type: "date", required: false, options: { min: "", max: "" } };
}
function json(name) {
  return { name, type: "json", required: false, options: { maxSize: 200000 } };
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

    if (!exists("supplier_bank_changes")) {
      dao.saveCollection(new Collection({
        type: "base",
        name: "supplier_bank_changes",
        schema: [
          text("number"), rel("supplier", id("suppliers"), 1, true), text("supplier_name"), json("old_details"), json("new_details"), text("reason"),
          select("status", ["pending_approval", "approved", "rejected", "returned", "cancelled"]), rel("requested_by", USERS),
          rel("approval", id("approval_requests")), text("pending_approvers"), text("approver_history"),
          date("submitted_at"), date("approved_at"), date("applied_at"), text("cancel_reason"), files("attachments", 5),
        ],
        indexes: ["CREATE INDEX idx_bank_change_supplier ON supplier_bank_changes (supplier, status)"],
        listRule: AUTH, viewRule: AUTH, createRule: null, updateRule: null, deleteRule: null,
      }));
    }

    addFields("suppliers", [bool("bank_change_pending"), date("bank_verified_at"), rel("bank_verified_by", USERS)]);
    addFields("procurement_plan_lines", [rel("budget_line", id("budget_lines"))]);

    // Default flow so the control works without seeding; Finance can change it under Setup → Approval workflows.
    const flows = dao.findRecordsByFilter("approval_workflows", "document_type = 'supplier_bank_change'", "", 1, 0) || [];
    if (!flows.length) {
      let daf = null;
      try {
        daf = dao.findFirstRecordByFilter("roles", "code = 'DAF'");
      } catch (_) {}
      if (daf) {
        const wf = new Record(dao.findCollectionByNameOrId("approval_workflows"));
        wf.set("name", "Supplier bank details change");
        wf.set("description", "Procurement requests new bank details for an approved supplier; Finance verifies them (bank letter, call-back) before payments can go to the new account.");
        wf.set("document_type", "supplier_bank_change");
        wf.set("active", true);
        wf.set("priority", 10);
        wf.set("min_amount", 0);
        wf.set("max_amount", 0);
        wf.set("allow_self_approval", false);
        wf.set("overdue_hours", 48);
        wf.set("steps", [{ name: "Finance verification of the new bank details", approver_type: "role", role: daf.id }]);
        dao.saveRecord(wf);
      }
    }
  },
  (db) => {
    const dao = new Dao(db);
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("supplier_bank_changes"));
    } catch (_) {}
    for (const [col, fields] of [["suppliers", ["bank_change_pending", "bank_verified_at", "bank_verified_by"]], ["procurement_plan_lines", ["budget_line"]]]) {
      try {
        const c = dao.findCollectionByNameOrId(col);
        for (const f of fields) {
          const field = c.schema.getFieldByName(f);
          if (field) c.schema.removeField(field.id);
        }
        dao.saveCollection(c);
      } catch (_) {}
    }
  }
);
