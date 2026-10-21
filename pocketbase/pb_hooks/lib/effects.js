/// <reference path="../../pb_data/types.d.ts" />
/**
 * What happens when the approval engine finally approves a document. Runs inside the approval's
 * transaction: if an effect fails (e.g. a PO commitment exceeds the budget without an override),
 * the approval itself is rolled back and the approver sees why.
 */
function approved(dao, type, doc, actor, meta) {
  const budget = require("./budget.js");
  if (type === "budget") return budget.onBudgetApproved(dao, doc, actor, meta);
  if (type === "budget_revision") return budget.onRevisionApproved(dao, doc, actor, meta);
  if (type === "purchase_order") return budget.commitPo(dao, doc, actor, meta);
  if (type === "supplier_invoice") return budget.invoiceApproved(dao, doc, actor, meta);
  if (type === "supplier_bank_change") return require("./supplierbank.js").onApproved(dao, doc, actor, meta);
}

/** Rejected or returned by an approver. */
function closed(dao, type, doc) {
  if (type === "supplier_bank_change") return require("./supplierbank.js").onClosed(dao, doc);
}

module.exports = { approved, closed };
