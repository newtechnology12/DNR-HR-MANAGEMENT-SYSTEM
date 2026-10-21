/// <reference path="../../pb_data/types.d.ts" />
/**
 * Sourcing rules: suppliers (no duplicates, audited bank details), RFQs created only from
 * approved requisitions, quotations with server-computed totals, and awards that require a
 * documented reason and respect separation of duties.
 */
const core = require("./core.js");

const BANK_FIELDS = ["bank_name", "bank_branch", "bank_account_name", "bank_account_number", "swift_code"];
const DEFAULT_WEIGHTS = { price: 40, quality: 20, delivery: 15, warranty: 10, payment: 5, compliance: 10 };

/** Parses PocketBase ("2026-10-03 00:00:00.000Z") and ISO dates; the JS engine rejects the space form. */
function toDate(v) {
  const d = new Date(String(v || "").trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function auth(e) {
  return e.httpContext.get("authRecord");
}

function need(e, permission, what) {
  const a = auth(e);
  if (!a) return; // superuser
  core.requirePermission($app.dao(), a, permission, what);
}

function restore(record, fields) {
  const before = record.originalCopy();
  for (const f of fields) record.set(f, before.get(f));
}

// ------------------------------------------------------------------ suppliers
function assertNoDuplicateSupplier(dao, r) {
  const tin = r.getString("tin").trim();
  const name = r.getString("name").trim();
  if (!name) throw new BadRequestError("Supplier name is required.");
  // "~" is a case-insensitive LIKE; exact name equality is then checked here.
  const candidates = dao.findRecordsByFilter(
    "suppliers",
    "id != {:id} && (name ~ {:name}" + (tin ? " || tin = {:tin}" : "") + ")",
    "", 50, 0, { id: r.id || "", name, tin }
  ) || [];
  const existing = candidates.filter(
    (s) => (tin && s.getString("tin") === tin) || s.getString("name").trim().toLowerCase() === name.toLowerCase()
  );
  if (existing.length) {
    const s = existing[0];
    const why = tin && s.getString("tin") === tin ? `TIN ${tin}` : `the name “${name}”`;
    throw new BadRequestError(`A supplier with ${why} already exists: ${s.getString("name")} (${s.getString("code")}). Update that record instead of creating a duplicate.`);
  }
}

function supplierBeforeCreate(e) {
  need(e, "manage_suppliers", "add suppliers");
  const dao = $app.dao();
  const r = e.record;
  assertNoDuplicateSupplier(dao, r);
  r.set("rating", 0);
  r.set("evaluations_count", 0);
  // New suppliers go through onboarding approval; only superusers (imports, seeds) create them active.
  if (auth(e)) r.set("status", "draft");
  else if (!r.getString("status")) r.set("status", "active");
  if (!r.getString("currency")) r.set("currency", "RWF");
  if (auth(e)) r.set("created_by", auth(e).id);
  let code = "";
  dao.runInTransaction((tx) => {
    code = core.nextNumber(tx, "supplier");
  });
  r.set("code", code);
}

function supplierBeforeUpdate(e) {
  need(e, "manage_suppliers", "edit suppliers");
  require("./supplier.js").guardStatus(e);
  restore(e.record, ["code", "rating", "evaluations_count", "created_by"]);
  assertNoDuplicateSupplier($app.dao(), e.record);
  const changes = core.diff(e.record.originalCopy(), e.record);
  delete changes.updated;
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function supplierAfterUpdate(e) {
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (!Object.keys(changes).length) return;
  const dao = $app.dao();
  const bank = {};
  const other = {};
  for (const k in changes) (BANK_FIELDS.indexOf(k) !== -1 ? bank : other)[k] = changes[k];
  const base = { actor: auth(e), collection: "suppliers", recordId: e.record.id, label: `${e.record.getString("code")} ${e.record.getString("name")}`, meta: core.requestMeta(e.httpContext) };
  if (Object.keys(other).length) core.audit(dao, { ...base, action: "updated", changes: other });
  if (Object.keys(bank).length) {
    // Bank detail changes are a classic fraud vector: separate audit entry + alert to supplier managers.
    core.audit(dao, { ...base, action: "bank_details_changed", changes: bank });
    const managers = (dao.findRecordsByFilter("users", 'status = "Active"', "", 500, 0) || []).filter(
      (u) => u.id !== (auth(e) && auth(e).id) && core.can(dao, u, "manage_suppliers")
    );
    core.notify(dao, managers.map((u) => u.id), {
      title: `Bank details changed: ${e.record.getString("name")}`,
      body: `${auth(e) ? auth(e).getString("name") : "An administrator"} changed ${Object.keys(bank).join(", ").replace(/_/g, " ")}. Verify before paying this supplier.`,
      link: `/dashboard/procurement/suppliers/${e.record.id}`,
      type: "warning",
    });
  }
}

function supplierBeforeDelete(e) {
  need(e, "manage_suppliers", "delete suppliers");
  const dao = $app.dao();
  const used = dao.findRecordsByFilter("rfq_suppliers", "supplier = {:s}", "", 1, 0, { s: e.record.id });
  if (used && used.length) {
    throw new BadRequestError(`${e.record.getString("name")} has sourcing history and cannot be deleted. Set its status to inactive or blacklisted instead.`);
  }
}

function childGuard(e, what) {
  need(e, "manage_suppliers", what);
  if (e.record.collection().name === "supplier_documents" && auth(e)) {
    if (e.record.isNew()) e.record.set("uploaded_by", auth(e).id);
  }
}

function evaluationBeforeCreate(e) {
  need(e, "evaluate_suppliers", "evaluate suppliers");
  const r = e.record;
  const keys = ["quality", "delivery", "price", "compliance", "responsiveness", "contract_compliance"];
  let sum = 0;
  for (const k of keys) {
    const v = r.getFloat(k);
    if (!(v >= 1 && v <= 5)) throw new BadRequestError(`Score “${k.replace(/_/g, " ")}” must be between 1 and 5.`);
    sum += v;
  }
  r.set("overall", Math.round((sum / keys.length) * 100) / 100);
  if (auth(e)) r.set("evaluator", auth(e).id);
}

function evaluationAfterCreate(e) {
  const dao = $app.dao();
  const supplierId = e.record.getString("supplier");
  const all = dao.findRecordsByFilter("supplier_evaluations", "supplier = {:s}", "", 1000, 0, { s: supplierId }) || [];
  const avg = all.reduce((a, r) => a + r.getFloat("overall"), 0) / (all.length || 1);
  const s = dao.findRecordById("suppliers", supplierId);
  s.set("rating", Math.round(avg * 100) / 100);
  s.set("evaluations_count", all.length);
  dao.saveRecord(s);
  core.audit(dao, {
    actor: auth(e), action: "evaluated", collection: "suppliers", recordId: supplierId, label: s.getString("name"),
    changes: { rating: { old: null, new: s.getFloat("rating") } }, comment: e.record.getString("comments"), meta: core.requestMeta(e.httpContext),
  });
}

// ------------------------------------------------------------------ RFQs
function createFromRequisition(dao, requisitionId, actor, input, meta) {
  let req;
  try {
    req = dao.findRecordById("purchase_requisitions", requisitionId);
  } catch (_) {
    throw new NotFoundError("Purchase requisition not found.");
  }
  if (req.getString("status") !== "approved") {
    throw new BadRequestError(`${req.getString("number")} is ${req.getString("status").replace(/_/g, " ")}. Only fully approved requisitions can be sourced.`);
  }
  const items = core.parseJson(req, "items", []).map((it, i) => ({
    line: i + 1, description: it.description, specification: it.specification || "", quantity: it.quantity, unit: it.unit,
  }));
  const closing = toDate(input.closing_date) || new Date(Date.now() + 7 * 864e5);
  if (closing <= new Date()) throw new BadRequestError("The closing date must be in the future.");
  const rfq = new Record(dao.findCollectionByNameOrId("rfqs"));
  rfq.set("number", core.nextNumber(dao, "rfq"));
  rfq.set("title", req.getString("title"));
  rfq.set("requisition", req.id);
  rfq.set("requester", req.getString("requester"));
  rfq.set("department", req.getString("department"));
  rfq.set("buyer", actor.id);
  rfq.set("status", "draft");
  rfq.set("closing_date", closing.toISOString());
  rfq.set("currency", req.getString("currency") || "RWF");
  rfq.set("delivery_location", req.getString("delivery_location"));
  rfq.set("payment_terms", "30 days after delivery and invoice");
  rfq.set("delivery_terms", "Delivered to the address above (DAP)");
  rfq.set("required_documents", "RRA tax clearance certificate; RDB registration certificate; RSSB clearance");
  rfq.set("items", items);
  rfq.set("evaluation_weights", DEFAULT_WEIGHTS);
  // Suggest active suppliers that serve the requisition's category.
  const suggested = req.getString("category")
    ? (dao.findRecordsByFilter("suppliers", 'status = "active" && categories ~ {:c}', "-rating", 5, 0, { c: req.getString("category") }) || []).map((s) => s.id)
    : [];
  rfq.set("suppliers", Array.isArray(input.suppliers) && input.suppliers.length ? input.suppliers : suggested);
  dao.saveRecord(rfq);

  req.set("status", "converted_to_rfq");
  dao.saveRecord(req);

  core.audit(dao, { actor, action: "rfq_created", collection: "purchase_requisitions", recordId: req.id, label: req.getString("number"), meta, changes: { status: { old: "approved", new: "converted_to_rfq" }, rfq: { old: null, new: rfq.getString("number") } } });
  core.audit(dao, { actor, action: "created", collection: "rfqs", recordId: rfq.id, label: rfq.getString("number"), meta, changes: { requisition: { old: null, new: req.getString("number") } } });
  core.notify(dao, [req.getString("requester")], {
    title: `${req.getString("number")} is being sourced`, body: `Procurement created ${rfq.getString("number")}.`,
    link: `/dashboard/procurement/requisitions/${req.id}`, type: "info",
  });
  return rfq;
}

function rfqBeforeUpdate(e) {
  need(e, "manage_rfqs", "edit RFQs");
  const r = e.record;
  const before = r.originalCopy();
  const status = before.getString("status");
  if (["awarded", "cancelled"].indexOf(status) !== -1) throw new BadRequestError(`${before.getString("number")} is ${status} and can no longer be edited.`);
  restore(r, ["number", "requisition", "requester", "department", "status", "issue_date", "award_reason", "award_not_lowest", "awarded_at", "awarded_by", "awarded_quotation", "cancel_reason"]);
  if (status !== "draft") {
    // Once sent, only the closing date (extension), notes and attachments may change — suppliers already have the RFQ.
    const keep = ["title", "currency", "delivery_location", "payment_terms", "delivery_terms", "required_documents", "items", "suppliers", "evaluation_weights", "buyer"];
    const w = core.parseJson(r, "evaluation_weights", null);
    restore(r, keep);
    if (w) r.set("evaluation_weights", validWeights(w));
  } else {
    r.set("evaluation_weights", validWeights(core.parseJson(r, "evaluation_weights", DEFAULT_WEIGHTS)));
    const dao = $app.dao();
    for (const sid of r.getStringSlice("suppliers")) {
      const s = dao.findRecordById("suppliers", sid);
      if (s.getString("status") !== "active") throw new BadRequestError(`${s.getString("name")} is ${s.getString("status")} and cannot be invited.`);
    }
  }
  const changes = core.diff(before, r);
  delete changes.updated;
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function validWeights(w) {
  const out = {};
  let total = 0;
  for (const k in DEFAULT_WEIGHTS) {
    const v = Math.max(0, Number(w && w[k]) || 0);
    out[k] = v;
    total += v;
  }
  if (Math.round(total) !== 100) throw new BadRequestError(`Evaluation weights must add up to 100% (currently ${Math.round(total)}%).`);
  return out;
}

function loadRfq(dao, id) {
  try {
    return dao.findRecordById("rfqs", id);
  } catch (_) {
    throw new NotFoundError("RFQ not found.");
  }
}

function send(dao, id, actor, meta) {
  const rfq = loadRfq(dao, id);
  const number = rfq.getString("number");
  if (rfq.getString("status") !== "draft") throw new BadRequestError(`${number} has already been sent.`);
  const suppliers = rfq.getStringSlice("suppliers");
  if (!suppliers.length) throw new BadRequestError(`Invite at least one supplier before sending ${number}.`);
  if (!core.parseJson(rfq, "items", []).length) throw new BadRequestError(`${number} has no items.`);
  const closing = (toDate(rfq.getString("closing_date")) || new Date(0));
  if (!(closing > new Date())) throw new BadRequestError(`The closing date of ${number} must be in the future.`);
  const col = dao.findCollectionByNameOrId("rfq_suppliers");
  const now = new Date().toISOString();
  for (const sid of suppliers) {
    const s = dao.findRecordById("suppliers", sid);
    if (s.getString("status") !== "active") throw new BadRequestError(`${s.getString("name")} is ${s.getString("status")} and cannot receive RFQs.`);
    const inv = new Record(col);
    inv.set("rfq", rfq.id);
    inv.set("supplier", sid);
    inv.set("status", "sent");
    inv.set("sent_at", now);
    dao.saveRecord(inv);
  }
  rfq.set("status", "sent");
  rfq.set("issue_date", now);
  dao.saveRecord(rfq);
  core.audit(dao, { actor, action: "sent", collection: "rfqs", recordId: rfq.id, label: number, meta, changes: { status: { old: "draft", new: "sent" }, suppliers: { old: null, new: suppliers.length } } });
  return rfq;
}

function close(dao, id, actor, meta) {
  const rfq = loadRfq(dao, id);
  if (rfq.getString("status") !== "sent") throw new BadRequestError(`${rfq.getString("number")} is not open for quotations.`);
  rfq.set("status", "closed");
  dao.saveRecord(rfq);
  core.audit(dao, { actor, action: "closed", collection: "rfqs", recordId: rfq.id, label: rfq.getString("number"), meta, changes: { status: { old: "sent", new: "closed" } } });
  return rfq;
}

function cancel(dao, id, actor, reason, meta) {
  if (!reason) throw new BadRequestError("Please give a reason for cancelling the RFQ.");
  const rfq = loadRfq(dao, id);
  const old = rfq.getString("status");
  if (["awarded", "cancelled"].indexOf(old) !== -1) throw new BadRequestError(`${rfq.getString("number")} is already ${old}.`);
  rfq.set("status", "cancelled");
  rfq.set("cancel_reason", reason);
  dao.saveRecord(rfq);
  // The requisition goes back to "approved" so it can be sourced again.
  try {
    const req = dao.findRecordById("purchase_requisitions", rfq.getString("requisition"));
    if (req.getString("status") === "converted_to_rfq") {
      req.set("status", "approved");
      dao.saveRecord(req);
    }
  } catch (_) {}
  core.audit(dao, { actor, action: "cancelled", collection: "rfqs", recordId: rfq.id, label: rfq.getString("number"), comment: reason, meta, changes: { status: { old, new: "cancelled" } } });
  return rfq;
}

function award(dao, id, actor, quotationId, reason, meta) {
  const rfq = loadRfq(dao, id);
  const number = rfq.getString("number");
  if (["sent", "closed"].indexOf(rfq.getString("status")) === -1) throw new BadRequestError(`${number} is ${rfq.getString("status")} and cannot be awarded.`);
  if (actor.id === rfq.getString("requester")) throw new ForbiddenError("Separation of duties: the requester of the purchase cannot select the supplier.");
  if (!reason || reason.trim().length < 15) throw new BadRequestError("Document why this supplier was selected (at least 15 characters). The reason is kept in the audit trail.");
  const quotes = dao.findRecordsByFilter("quotations", "rfq = {:r}", "grand_total", 100, 0, { r: rfq.id }) || [];
  const chosen = quotes.find((q) => q.id === quotationId);
  if (!chosen) throw new BadRequestError("Choose one of the quotations received for this RFQ.");
  if (chosen.getString("technical_compliance") === "non_compliant") {
    throw new BadRequestError(`${chosen.getString("number")} is marked technically non-compliant and cannot be awarded.`);
  }
  const lowest = quotes.reduce((m, q) => Math.min(m, q.getFloat("grand_total")), Infinity);
  const notLowest = chosen.getFloat("grand_total") > lowest;
  for (const q of quotes) {
    q.set("status", q.id === chosen.id ? "accepted" : "rejected");
    dao.saveRecord(q);
  }
  rfq.set("status", "awarded");
  rfq.set("awarded_quotation", chosen.id);
  rfq.set("award_reason", reason.trim());
  rfq.set("award_not_lowest", notLowest);
  rfq.set("awarded_at", new Date().toISOString());
  rfq.set("awarded_by", actor.id);
  dao.saveRecord(rfq);
  const supplier = dao.findRecordById("suppliers", chosen.getString("supplier"));
  core.audit(dao, {
    actor, action: "awarded", collection: "rfqs", recordId: rfq.id, label: number, comment: reason.trim(), meta,
    changes: {
      status: { old: "open", new: "awarded" },
      supplier: { old: null, new: supplier.getString("name") },
      amount: { old: null, new: chosen.getFloat("grand_total") },
      lowest_price: { old: null, new: lowest },
      not_lowest_price: { old: null, new: notLowest },
    },
  });
  core.notify(dao, [rfq.getString("requester"), rfq.getString("buyer")].filter((x) => x !== actor.id), {
    title: `${number} awarded to ${supplier.getString("name")}`,
    body: `${core.formatMoney(chosen.getFloat("grand_total"), chosen.getString("currency"))}${notLowest ? " — not the lowest price; see the documented reason." : ""}`,
    link: `/dashboard/procurement/rfqs/${rfq.id}`, type: "success",
  });
  return rfq;
}

function inviteBeforeUpdate(e) {
  need(e, "manage_rfqs", "update supplier responses");
  restore(e.record, ["rfq", "supplier", "sent_at"]);
  const s = e.record.getString("status");
  if (["viewed", "declined"].indexOf(s) === -1 && s !== e.record.originalCopy().getString("status")) {
    throw new BadRequestError("A supplier invitation can only be marked as viewed or declined here; quotations are recorded separately.");
  }
  if (s === "declined") e.record.set("responded_at", new Date().toISOString());
}

// ------------------------------------------------------------------ quotations
function computeQuote(dao, q, rfq) {
  const rfqItems = core.parseJson(rfq, "items", []);
  const raw = core.parseJson(q, "items", []);
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  const items = rfqItems.map((ri) => {
    const it = raw.find((x) => Number(x.line) === Number(ri.line)) || {};
    const quoted = it.unit_price !== null && it.unit_price !== undefined && it.unit_price !== "";
    const price = Number(it.unit_price) || 0;
    const discPct = Math.min(Math.max(Number(it.discount_pct) || 0, 0), 100);
    const taxRate = Math.min(Math.max(Number(it.tax_rate) || 0, 0), 100);
    if (quoted && price < 0) throw new BadRequestError(`Line ${ri.line}: unit price cannot be negative.`);
    const gross = core.money(ri.quantity * price);
    const disc = core.money((gross * discPct) / 100);
    const t = core.money(((gross - disc) * taxRate) / 100);
    if (quoted) {
      subtotal += gross;
      discount += disc;
      tax += t;
    }
    return {
      line: ri.line, description: ri.description, quantity: ri.quantity, unit: ri.unit, quoted,
      unit_price: quoted ? price : null, discount_pct: discPct, tax_rate: taxRate,
      net: quoted ? core.money(gross - disc) : 0, tax: quoted ? t : 0, total: quoted ? core.money(gross - disc + t) : 0,
      brand: String(it.brand || ""),
    };
  });
  if (!items.some((i) => i.quoted)) throw new BadRequestError("Enter a unit price for at least one line.");
  const delivery = Math.max(q.getFloat("delivery_cost"), 0);
  const other = Math.max(q.getFloat("other_charges"), 0);
  q.set("items", items);
  q.set("subtotal", core.money(subtotal));
  q.set("discount_total", core.money(discount));
  q.set("tax_total", core.money(tax));
  q.set("grand_total", core.money(subtotal - discount + tax + delivery + other));
  const weights = core.parseJson(rfq, "evaluation_weights", DEFAULT_WEIGHTS);
  const scores = core.parseJson(q, "scores", null);
  if (scores) {
    let total = 0;
    for (const k in weights) {
      const s = Math.min(Math.max(Number(scores[k]) || 0, 0), 10);
      total += (weights[k] * s) / 10;
    }
    q.set("total_score", Math.round(total * 10) / 10);
  }
}

function quotationBeforeCreate(e) {
  need(e, "manage_rfqs", "record supplier quotations");
  const dao = $app.dao();
  const q = e.record;
  const rfq = loadRfq(dao, q.getString("rfq"));
  const number = rfq.getString("number");
  if (["sent", "closed"].indexOf(rfq.getString("status")) === -1) throw new BadRequestError(`${number} is ${rfq.getString("status")}; quotations can only be recorded after it is sent.`);
  const sid = q.getString("supplier");
  if (rfq.getStringSlice("suppliers").indexOf(sid) === -1) throw new BadRequestError("This supplier was not invited to the RFQ.");
  const dup = dao.findRecordsByFilter("quotations", "rfq = {:r} && supplier = {:s}", "", 1, 0, { r: rfq.id, s: sid });
  if (dup && dup.length) throw new BadRequestError(`A quotation from this supplier is already recorded (${dup[0].getString("number")}). Edit it instead.`);
  q.set("status", "received");
  q.set("received_late", new Date() > (toDate(rfq.getString("closing_date")) || new Date(0)));
  if (!q.getString("currency")) q.set("currency", rfq.getString("currency") || "RWF");
  if (!q.getString("quotation_date")) q.set("quotation_date", new Date().toISOString());
  if (auth(e)) q.set("created_by", auth(e).id);
  computeQuote(dao, q, rfq);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "quotation");
  });
  q.set("number", n);
}

function quotationAfterCreate(e) {
  const dao = $app.dao();
  const q = e.record;
  try {
    const inv = dao.findFirstRecordByFilter("rfq_suppliers", "rfq = {:r} && supplier = {:s}", { r: q.getString("rfq"), s: q.getString("supplier") });
    inv.set("status", q.getBool("received_late") ? "late" : "quoted");
    inv.set("responded_at", new Date().toISOString());
    dao.saveRecord(inv);
  } catch (_) {}
  core.audit(dao, {
    actor: auth(e), action: "quotation_recorded", collection: "rfqs", recordId: q.getString("rfq"), label: q.getString("number"),
    changes: { grand_total: { old: null, new: q.getFloat("grand_total") }, late: { old: null, new: q.getBool("received_late") } },
    meta: core.requestMeta(e.httpContext),
  });
}

function quotationBeforeUpdate(e) {
  need(e, "manage_rfqs", "edit quotations");
  const dao = $app.dao();
  const q = e.record;
  const before = q.originalCopy();
  restore(q, ["number", "rfq", "supplier", "status", "received_late", "created_by", "currency"]);
  const rfq = loadRfq(dao, q.getString("rfq"));
  if (["awarded", "cancelled"].indexOf(rfq.getString("status")) !== -1) throw new BadRequestError(`${rfq.getString("number")} is ${rfq.getString("status")}; its quotations are locked.`);
  computeQuote(dao, q, rfq);
  const changes = core.diff(before, q, ["items", "grand_total", "delivery_cost", "other_charges", "delivery_days", "payment_terms", "warranty", "technical_compliance", "scores", "total_score", "validity_date"]);
  if (changes.items) changes.items = { old: "…", new: "prices changed" };
  e.httpContext.set("dnrAudit", JSON.stringify(changes));
}

function quotationAfterUpdate(e) {
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (!Object.keys(changes).length) return;
  core.audit($app.dao(), {
    actor: auth(e), action: changes.scores ? "quotation_evaluated" : "quotation_updated", collection: "rfqs", recordId: e.record.getString("rfq"),
    label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext),
  });
}

module.exports = {
  DEFAULT_WEIGHTS,
  supplierBeforeCreate, supplierBeforeUpdate, supplierAfterUpdate, supplierBeforeDelete, childGuard,
  evaluationBeforeCreate, evaluationAfterCreate,
  createFromRequisition, rfqBeforeUpdate, send, close, cancel, award, inviteBeforeUpdate,
  quotationBeforeCreate, quotationAfterCreate, quotationBeforeUpdate, quotationAfterUpdate,
};
