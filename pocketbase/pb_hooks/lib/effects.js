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
  if (type === "supplier_invoice") {
    budget.invoiceApproved(dao, doc, actor, meta);
    return require("./glpost.js").invoice(dao, doc, actor, meta);
  }
  if (type === "journal_entry") return require("./gl.js").onJournalApproved(dao, doc, actor, meta);
  if (type === "period_reopen") return require("./gl.js").onReopenApproved(dao, doc, actor, meta);
  if (type === "supplier_bank_change") return require("./supplierbank.js").onApproved(dao, doc, actor, meta);
  if (type === "payment_voucher") return require("./vouchers.js").onApproved(dao, doc, actor, meta);
  if (type === "cash_receipt") return require("./treasury.js").onReceiptApproved(dao, doc, actor, meta);
  if (type === "bank_transfer") return require("./treasury.js").onTransferApproved(dao, doc, actor, meta);
  if (type === "bank_reconciliation") return require("./treasury.js").onRecApproved(dao, doc, actor, meta);
  if (type === "payroll") return require("./payroll.js").onApproved(dao, doc, actor, meta);
  if (type === "asset_transfer") return require("./assets.js").onTransferApproved(dao, doc, actor, meta);
  if (type === "asset_disposal") return require("./assets.js").onDisposalApproved(dao, doc, actor, meta);
  if (type === "depreciation_run") return require("./assets.js").onRunApproved(dao, doc, actor, meta);
}

/** Rejected or returned by an approver. */
function closed(dao, type, doc) {
  if (type === "supplier_bank_change") return require("./supplierbank.js").onClosed(dao, doc);
  if (type === "journal_entry") return require("./gl.js").onJournalClosed(dao, doc);
}

module.exports = { approved, closed };
