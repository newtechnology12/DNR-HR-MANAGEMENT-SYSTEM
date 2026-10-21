/// <reference path="../../pb_data/types.d.ts" />
/**
 * Supplier onboarding (draft → under review → active / rejected, through the approval engine) and
 * supplier performance calculated from real transactions — nobody types these numbers, so they cannot
 * be manipulated; manual evaluations stay in supplier_evaluations (append-only, audited).
 */
const core = require("./core.js");

const ONBOARDING = ["draft", "under_review", "rejected"];

function load(dao, id) {
  try {
    return dao.findRecordById("suppliers", id);
  } catch (_) {
    throw new NotFoundError("Supplier not found.");
  }
}

/** What must be on file before a supplier can be reviewed. */
function readiness(dao, s) {
  const missing = [];
  if (!s.getString("tin") && s.getString("supplier_type") !== "individual") missing.push("TIN");
  if (!s.getString("email") && !s.getString("phone")) missing.push("an email or phone number");
  if (!s.getString("bank_account_number") || !s.getString("bank_name")) missing.push("bank name and account number");
  if (!(s.getStringSlice("categories") || []).length) missing.push("at least one category");
  const docs = dao.findRecordsByFilter("supplier_documents", "supplier = {:s}", "", 50, 0, { s: s.id }) || [];
  const types = docs.map((d) => d.getString("document_type"));
  if (s.getString("supplier_type") === "company" && types.indexOf("registration_certificate") === -1) missing.push("a registration certificate (RDB)");
  if (types.indexOf("tax_certificate") === -1 && s.getString("supplier_type") !== "individual") missing.push("a tax clearance certificate (RRA)");
  return missing;
}

function submit(dao, id, actor, meta) {
  core.requirePermission(dao, actor, "manage_suppliers", "submit suppliers for approval");
  const s = load(dao, id);
  if (["draft", "rejected"].indexOf(s.getString("status")) === -1) throw new BadRequestError(`${s.getString("name")} is ${s.getString("status").replace(/_/g, " ")}.`);
  const missing = readiness(dao, s);
  if (missing.length) throw new BadRequestError(`Complete the supplier file before submitting: ${missing.join(", ")}.`);
  s.set("submitted_by", actor.id);
  s.set("review_comment", "");
  dao.saveRecord(s);
  return require("./approvals.js").start(dao, "supplier", s, actor, meta);
}

/** Request hook: status changes only through the approval workflow. */
function guardStatus(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const dao = $app.dao();
  const before = e.record.originalCopy();
  const was = before.getString("status");
  const now = e.record.getString("status");
  if (was === "under_review") throw new BadRequestError(`${before.getString("name")} is under review and cannot be edited until the review is finished.`);
  if (was === now) return;
  if (ONBOARDING.indexOf(was) !== -1) {
    throw new ForbiddenError(`A new supplier becomes active only through approval. Use “Submit for approval”.`);
  }
  if (now === "active" && (was === "inactive" || was === "blacklisted")) {
    core.requirePermission(dao, auth, "approve_suppliers", "reactivate suppliers");
    if (e.record.getString("created_by") === auth.id && !core.can(dao, auth, "access_general_settings")) {
      throw new ForbiddenError("You registered this supplier; another approver must reactivate it.");
    }
  }
  if (ONBOARDING.indexOf(now) !== -1) throw new BadRequestError("An approved supplier cannot go back to onboarding. Set it inactive instead.");
}

// ------------------------------------------------------------------ performance
const round1 = (n) => (n === null || n === undefined || isNaN(n) ? null : Math.round(n * 10) / 10);

function performance(dao, supplierIds) {
  const want = {};
  (supplierIds || []).forEach((x) => (want[x] = true));
  const all = !supplierIds;
  const out = {};
  const row = (id) => (out[id] = out[id] || { supplier: id, orders: 0, spend: 0, deliveries: 0, on_time: 0, received_qty: 0, rejected_qty: 0, invited: 0, quoted: 0, response_days: [], awarded: 0, price_index: [], invoices: 0, exceptions: 0, outstanding: 0, last_order: "", active_contracts: 0 });

  const pos = dao.findRecordsByFilter("purchase_orders", "status != 'draft' && status != 'cancelled' && status != 'rejected'", "", 20000, 0) || [];
  const poById = {};
  for (const po of pos) {
    const s = po.getString("supplier");
    if (!all && !want[s]) continue;
    poById[po.id] = po;
    const r = row(s);
    r.orders++;
    r.spend += po.getFloat("grand_total");
    if (po.getString("order_date") > r.last_order) r.last_order = po.getString("order_date");
  }
  for (const g of dao.findRecordsByFilter("goods_receipts", "id != ''", "", 50000, 0) || []) {
    const po = poById[g.getString("purchase_order")];
    if (!po) continue;
    const r = row(po.getString("supplier"));
    r.deliveries++;
    const expected = po.getString("expected_delivery_date");
    if (!expected || g.getString("receipt_date").slice(0, 10) <= expected.slice(0, 10)) r.on_time++;
    for (const it of core.parseJson(g, "items", [])) {
      r.received_qty += Number(it.received) || 0;
      r.rejected_qty += Number(it.rejected) || 0;
    }
  }
  const quotesByRfq = {};
  for (const q of dao.findRecordsByFilter("quotations", "id != ''", "", 50000, 0) || []) (quotesByRfq[q.getString("rfq")] = quotesByRfq[q.getString("rfq")] || []).push(q);
  for (const inv of dao.findRecordsByFilter("rfq_suppliers", "id != ''", "", 50000, 0) || []) {
    const s = inv.getString("supplier");
    if (!all && !want[s]) continue;
    const r = row(s);
    r.invited++;
    if (["quoted", "late"].indexOf(inv.getString("status")) !== -1) {
      r.quoted++;
      if (inv.getString("sent_at") && inv.getString("responded_at")) {
        r.response_days.push((new Date(inv.getString("responded_at").replace(" ", "T")) - new Date(inv.getString("sent_at").replace(" ", "T"))) / 864e5);
      }
    }
  }
  // Price competitiveness: this supplier's quote vs the average quote on the same RFQ (100 = average; lower is cheaper).
  for (const rfqId in quotesByRfq) {
    const qs = quotesByRfq[rfqId].filter((q) => q.getFloat("grand_total") > 0);
    if (qs.length < 2) continue;
    const avg = qs.reduce((a, q) => a + q.getFloat("grand_total"), 0) / qs.length;
    for (const q of qs) {
      const s = q.getString("supplier");
      if (!all && !want[s]) continue;
      row(s).price_index.push((q.getFloat("grand_total") / avg) * 100);
      if (q.getString("status") === "accepted") row(s).awarded++;
    }
  }
  for (const inv of dao.findRecordsByFilter("supplier_invoices", "status != 'cancelled'", "", 50000, 0) || []) {
    const s = inv.getString("supplier");
    if (!all && !want[s]) continue;
    const r = row(s);
    r.invoices++;
    if (inv.getString("match_status") === "exception") r.exceptions++;
    if (["approved", "partially_paid", "pending_approval", "matched", "exception", "received"].indexOf(inv.getString("status")) !== -1) r.outstanding += inv.getFloat("balance");
  }
  for (const c of dao.findRecordsByFilter("contracts", "status = 'active'", "", 5000, 0) || []) {
    const s = c.getString("supplier");
    if (!all && !want[s]) continue;
    row(s).active_contracts++;
  }

  const result = [];
  for (const id in out) {
    const r = out[id];
    const onTime = r.deliveries ? (r.on_time / r.deliveries) * 100 : null;
    const quality = r.received_qty ? (1 - r.rejected_qty / r.received_qty) * 100 : null;
    const response = r.invited ? (r.quoted / r.invited) * 100 : null;
    const priceIndex = r.price_index.length ? r.price_index.reduce((a, b) => a + b, 0) / r.price_index.length : null;
    const invoiceAccuracy = r.invoices ? (1 - r.exceptions / r.invoices) * 100 : null;
    const price = priceIndex === null ? null : Math.max(0, Math.min(100, 100 - (priceIndex - 100) * 2));
    // Weighted score over the dimensions that have data.
    const parts = [[onTime, 30], [quality, 30], [price, 20], [response, 10], [invoiceAccuracy, 10]].filter(([v]) => v !== null);
    const w = parts.reduce((a, [, x]) => a + x, 0);
    result.push({
      supplier: id, orders: r.orders, spend: core.money(r.spend), last_order: r.last_order, deliveries: r.deliveries,
      on_time_pct: round1(onTime), quality_pct: round1(quality), rejection_pct: r.received_qty ? round1((r.rejected_qty / r.received_qty) * 100) : null,
      response_pct: round1(response), avg_response_days: r.response_days.length ? round1(r.response_days.reduce((a, b) => a + b, 0) / r.response_days.length) : null,
      price_index: round1(priceIndex), awarded: r.awarded, invited: r.invited, invoice_accuracy_pct: round1(invoiceAccuracy),
      outstanding: core.money(r.outstanding), active_contracts: r.active_contracts,
      score: w ? round1(parts.reduce((a, [v, x]) => a + v * x, 0) / w) : null,
    });
  }
  return result;
}

module.exports = { readiness, submit, guardStatus, performance };
