/// <reference path="../../pb_data/types.d.ts" />
/**
 * Budgeting and budget control (IMS M2).
 *
 * Budget lines (account × department × funding source × project) are the control unit.
 * The budget ledger records, per line:
 *   commitment          approved purchase order (or its increase after an amendment)
 *   commitment_release  PO cancelled / closed short, or converted to actual by an approved invoice
 *   actual              approved supplier invoice (later: payment vouchers, payroll, journals)
 *   actual_reversal     approved invoice cancelled
 *
 *   available = revised budget − open commitments − actuals
 *
 * Budget control (settings.budget_control): "block" (default) refuses a requisition, PO or voucher that
 * exceeds the available balance unless a user holding override_budget recorded an override for that
 * document (reason required, flagged in reports). "warn" lets it through and alerts the Budget Officer.
 * All amounts are whole RWF.
 */
const core = require("./core.js");
const masterdata = require("./masterdata.js");

const r0 = (n) => Math.round(Number(n) || 0);
const fmt = (n) => core.formatMoney(n);
const OPEN_PO = ["approved", "sent", "acknowledged", "partially_received", "fully_received", "partially_invoiced", "fully_invoiced"];
const EDITABLE = ["draft", "returned"];
const KIND_TYPE = { expense: "expense", capital: "asset", revenue: "revenue" };

function settings(dao) {
  let s = null;
  try {
    s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0] || null;
  } catch (_) {}
  const n = (k, d) => (s && s.getInt(k) > 0 ? s.getInt(k) : d);
  return { control: (s && s.getString("budget_control")) || "block", amber: n("budget_amber_pct", 75), red: n("budget_red_pct", 90) };
}

function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}

function lineLabel(line) {
  return `${line.getString("code")}${line.getString("name") ? ` ${line.getString("name")}` : ""}`;
}

// ------------------------------------------------------------------ figures
/** Ledger sums per line and type: { lineId: { commitment, commitment_release, actual, actual_reversal } }. */
function ledgerSums(dao, where, params) {
  const rows = arrayOf(new DynamicModel({ l: "", t: "", s: 0 }));
  dao.db().newQuery(`SELECT budget_line AS l, type AS t, COALESCE(SUM(amount), 0) AS s FROM budget_ledger WHERE ${where} GROUP BY budget_line, type`).bind(params || {}).all(rows);
  const out = {};
  for (const r of rows) {
    out[r.l] = out[r.l] || { commitment: 0, commitment_release: 0, actual: 0, actual_reversal: 0 };
    out[r.l][r.t] = r0(r.s);
  }
  return out;
}

function figuresOf(line, sums, thresholds) {
  const s = sums || { commitment: 0, commitment_release: 0, actual: 0, actual_reversal: 0 };
  const budget = r0(line.getInt("revised_amount"));
  const committed = s.commitment - s.commitment_release;
  const actual = s.actual - s.actual_reversal;
  const used = committed + actual;
  const usedPct = budget > 0 ? Math.round((used / budget) * 1000) / 10 : used > 0 ? 100 : 0;
  const t = thresholds || { amber: 75, red: 90 };
  return {
    budget, committed, actual, available: budget - used, used_pct: usedPct,
    status: usedPct > t.red ? "red" : usedPct >= t.amber ? "amber" : "green",
  };
}

function lineFigures(dao, line) {
  const sums = ledgerSums(dao, "budget_line = {:l}", { l: line.id });
  return figuresOf(line, sums[line.id], settings(dao));
}

// ------------------------------------------------------------------ ledger
function post(dao, opts) {
  const amount = r0(opts.amount);
  if (!amount) return null;
  if (amount < 0) throw new BadRequestError("Ledger amounts are always positive; use the reversing type.");
  const line = opts.line;
  const when = opts.date || new Date().toISOString();
  const period = masterdata.periodFor(dao, when);
  const r = new Record(dao.findCollectionByNameOrId("budget_ledger"));
  r.set("budget_line", line.id);
  r.set("fiscal_year", line.getString("fiscal_year"));
  r.set("period", period ? period.id : "");
  r.set("date", when);
  r.set("type", opts.type);
  r.set("amount", amount);
  r.set("source_type", opts.source.type);
  r.set("source_id", opts.source.id);
  r.set("source_number", opts.source.number || "");
  r.set("description", String(opts.description || "").slice(0, 300));
  r.set("department", line.getString("department"));
  r.set("funding_source", line.getString("funding_source"));
  r.set("project", line.getString("project"));
  r.set("gl_account", line.getString("gl_account"));
  r.set("override", opts.override || "");
  r.set("created_by", opts.actor ? opts.actor.id : "");
  dao.saveRecord(r);
  return r;
}

// ------------------------------------------------------------------ control
function findOverride(dao, documentType, documentId, lineId, amount) {
  const rows = dao.findRecordsByFilter("budget_overrides", 'document_type = {:t} && document_id = {:d} && budget_line = {:l} && status != "cancelled"', "-created", 5, 0, { t: documentType, d: documentId, l: lineId }) || [];
  return rows.find((o) => o.getInt("amount_requested") >= amount) || null;
}

function budgetPeople(dao) {
  return (dao.findRecordsByFilter("users", 'status = "Active"', "", 2000, 0) || []).filter((u) => core.can(dao, u, "manage_budgets") || core.can(dao, u, "override_budget")).map((u) => u.id);
}

/**
 * Enforces budget control for `amount` on a line. `credit` = amount this document already holds
 * on the line (e.g. a PO's existing commitment when it is re-approved after an amendment).
 * Returns { checked, available, override, warning }; throws 400 when blocked.
 */
function assertAvailable(dao, opts) {
  const s = settings(dao);
  const line = opts.line;
  const amount = r0(opts.amount);
  if (s.control === "none" || amount <= 0) return { checked: false };
  if (line.getString("status") !== "active") throw new BadRequestError(`Budget line ${lineLabel(line)} is not active (its budget is not approved yet).`);
  const fig = lineFigures(dao, line);
  const available = fig.available + r0(opts.credit);
  if (amount <= available) return { checked: true, available, sufficient: true };
  const shortfall = amount - available;
  const ov = opts.documentId ? findOverride(dao, opts.documentType, opts.documentId, line.id, amount) : null;
  if (ov) {
    if (ov.getString("status") !== "used") {
      ov.set("status", "used");
      ov.set("used_at", new Date().toISOString());
      dao.saveRecord(ov);
    }
    core.audit(dao, { actor: opts.actor, action: "budget_override_used", collection: "budget_lines", recordId: line.id, label: `${opts.documentNumber} on ${line.getString("code")}`, comment: `Shortfall ${fmt(shortfall)} covered by override: ${ov.getString("reason")}`, meta: opts.meta });
    return { checked: true, available, sufficient: false, override: ov.id };
  }
  const message = `Insufficient budget on line ${lineLabel(line)}: ${opts.documentNumber || "this document"} needs ${fmt(amount)} but only ${fmt(Math.max(available, 0))} is available (shortfall ${fmt(shortfall)}).`;
  if (s.control === "warn") {
    core.audit(dao, { actor: opts.actor, action: "over_budget_warning", collection: "budget_lines", recordId: line.id, label: opts.documentNumber, comment: message, meta: opts.meta });
    core.notify(dao, budgetPeople(dao), { title: `Over budget: ${opts.documentNumber}`, body: message, link: "/dashboard/budget", type: "warning" });
    return { checked: true, available, sufficient: false, warning: message };
  }
  throw new ApiError(400, `${message} Revise the budget, or ask the Director of Finance to record a budget override with a reason.`, {
    budget_line: { code: "budget_insufficient", message: `available ${Math.max(available, 0)}; needed ${amount}` },
  });
}

/** Amount a document needs on its line. */
function documentAmount(type, doc) {
  if (type === "purchase_requisition") return r0(doc.getFloat("total"));
  if (type === "purchase_order") return r0(doc.getFloat("grand_total"));
  if (type === "payment_voucher") return r0(doc.getFloat("gross_amount"));
  return r0(doc.getFloat("total") || doc.getFloat("amount"));
}
const DOC_COLLECTION = { purchase_requisition: "purchase_requisitions", purchase_order: "purchase_orders", payment_voucher: "payment_vouchers", staff_expense: "prepayments" };

/** POST /api/ims/budget/overrides — the DAF lets one document exceed its line, with a reason. */
function grantOverride(dao, actor, input, meta) {
  core.requirePermission(dao, actor, "override_budget", "override budget control");
  const type = String(input.document_type || "");
  if (!DOC_COLLECTION[type]) throw new BadRequestError("Overrides apply to requisitions, purchase orders, payment vouchers and staff expenses.");
  const doc = load(dao, DOC_COLLECTION[type], String(input.document_id || ""), "Document");
  const reason = String(input.reason || "").trim();
  if (reason.length < 15) throw new BadRequestError("Explain why this spend may exceed the budget (at least 15 characters). The reason is reported to the Internal Auditor.");
  const owner = doc.getString("requester") || doc.getString("buyer") || doc.getString("prepared_by") || doc.getString("employee");
  if (owner === actor.id) throw new ForbiddenError("Segregation of duties: you cannot override the budget for your own document.");
  const lineId = doc.getString("budget_line");
  if (!lineId) throw new BadRequestError(`${doc.getString("number")} has no budget line.`);
  const line = load(dao, "budget_lines", lineId, "Budget line");
  const amount = documentAmount(type, doc) - (type === "purchase_order" ? r0(doc.getInt("committed_amount")) : 0);
  const fig = lineFigures(dao, line);
  if (amount <= fig.available) throw new BadRequestError(`${lineLabel(line)} has ${fmt(fig.available)} available, enough for ${doc.getString("number")}; no override is needed.`);
  for (const old of dao.findRecordsByFilter("budget_overrides", 'document_type = {:t} && document_id = {:d} && status = "active"', "", 20, 0, { t: type, d: doc.id }) || []) {
    old.set("status", "cancelled");
    dao.saveRecord(old);
  }
  const ov = new Record(dao.findCollectionByNameOrId("budget_overrides"));
  ov.set("document_type", type);
  ov.set("document_id", doc.id);
  ov.set("document_number", doc.getString("number"));
  ov.set("budget_line", line.id);
  ov.set("amount_requested", amount);
  ov.set("available", fig.available);
  ov.set("shortfall", amount - fig.available);
  ov.set("reason", reason);
  ov.set("approved_by", actor.id);
  ov.set("status", "active");
  dao.saveRecord(ov);
  doc.set("budget_override", ov.id);
  dao.saveRecord(doc);
  core.audit(dao, {
    actor, action: "budget_override_granted", collection: DOC_COLLECTION[type], recordId: doc.id, label: doc.getString("number"), comment: reason, meta,
    changes: { line: { old: null, new: line.getString("code") }, shortfall: { old: null, new: amount - fig.available } },
  });
  core.notify(dao, budgetPeople(dao).concat([owner]).filter((u) => u && u !== actor.id), {
    title: `Budget override: ${doc.getString("number")}`, body: `${fmt(amount - fig.available)} above ${line.getString("code")} — ${reason}`,
    link: "/dashboard/budget/reports?tab=overrides", type: "warning",
  });
  return ov;
}

// ------------------------------------------------------------------ documents using budget lines
/** Validates and fills budget_line / funding_source on a requisition, PO or voucher. */
function attachLine(dao, doc, opts) {
  const lineId = doc.getString("budget_line");
  if (!lineId) {
    doc.set("funding_source", "");
    return null;
  }
  const line = load(dao, "budget_lines", lineId, "Budget line");
  if (line.getString("status") !== "active") throw new BadRequestError(`Budget line ${lineLabel(line)} is not active.`);
  if (opts && opts.department && line.getString("department") && line.getString("department") !== opts.department && !opts.anyDepartment) {
    throw new BadRequestError(`Budget line ${line.getString("code")} belongs to another department. Choose a line of your department.`);
  }
  if (line.getString("kind") === "revenue") throw new BadRequestError(`${line.getString("code")} is a revenue line; spending needs an expense or capital line.`);
  doc.set("funding_source", line.getString("funding_source"));
  return line;
}

/** Requisition submitted: hard check against the available balance (no commitment yet). */
function checkRequisition(dao, req, actor, meta) {
  const lineId = req.getString("budget_line");
  if (!lineId) throw new BadRequestError(`${req.getString("number")} cannot be submitted: choose the budget line it will be charged to.`);
  const line = load(dao, "budget_lines", lineId, "Budget line");
  const res = assertAvailable(dao, { line, amount: documentAmount("purchase_requisition", req), documentType: "purchase_requisition", documentId: req.id, documentNumber: req.getString("number"), actor, meta });
  req.set("budget_check", { line: line.getString("code"), available: res.available, sufficient: res.sufficient !== false, override: res.override || "", warning: res.warning || "", checked_at: new Date().toISOString() });
  return res;
}

/** Commitment for an approved PO = total − part already turned into actuals by approved invoices. */
function commitPo(dao, po, actor, meta) {
  const lineId = po.getString("budget_line");
  if (!lineId) return;
  const line = load(dao, "budget_lines", lineId, "Budget line");
  const released = (dao.findRecordsByFilter("supplier_invoices", "purchase_order = {:p}", "", 500, 0, { p: po.id }) || []).reduce((a, i) => a + r0(i.getInt("commitment_released")), 0);
  const target = Math.max(r0(po.getFloat("grand_total")) - released, 0);
  const current = r0(po.getInt("committed_amount"));
  const delta = target - current;
  const source = { type: "purchase_order", id: po.id, number: po.getString("number") };
  if (delta > 0) {
    const res = assertAvailable(dao, { line, amount: delta, documentType: "purchase_order", documentId: po.id, documentNumber: po.getString("number"), actor, meta });
    post(dao, { line, type: "commitment", amount: delta, source, description: po.getString("title"), actor, override: res.override });
  } else if (delta < 0) {
    post(dao, { line, type: "commitment_release", amount: -delta, source, description: `Amendment of ${po.getString("number")}`, actor });
  }
  po.set("committed_amount", target);
  dao.saveRecord(po);
}

/** PO cancelled or closed: release what is still committed. */
function releasePo(dao, po, actor, why) {
  const open = r0(po.getInt("committed_amount"));
  if (!open || !po.getString("budget_line")) return;
  const line = load(dao, "budget_lines", po.getString("budget_line"), "Budget line");
  post(dao, { line, type: "commitment_release", amount: open, source: { type: "purchase_order", id: po.id, number: po.getString("number") }, description: why, actor });
  po.set("committed_amount", 0);
  dao.saveRecord(po);
}

/** Approved supplier invoice: the PO commitment becomes an actual. Any excess over the commitment is checked. */
function invoiceApproved(dao, inv, actor, meta) {
  const po = load(dao, "purchase_orders", inv.getString("purchase_order"), "Purchase order");
  const lineId = inv.getString("budget_line") || po.getString("budget_line");
  if (!lineId) return;
  const line = load(dao, "budget_lines", lineId, "Budget line");
  const total = r0(inv.getFloat("total"));
  const release = Math.min(r0(po.getInt("committed_amount")), total);
  const excess = total - release;
  const source = { type: "supplier_invoice", id: inv.id, number: inv.getString("number") };
  let override = "";
  if (excess > 0) {
    const res = assertAvailable(dao, { line, amount: excess, documentType: "purchase_order", documentId: po.id, documentNumber: `${inv.getString("number")} (above ${po.getString("number")})`, actor, meta });
    override = res.override || "";
  }
  post(dao, { line, type: "commitment_release", amount: release, source, description: `Converted to actual by ${inv.getString("number")}`, actor });
  post(dao, { line, type: "actual", amount: total, source, description: `Supplier invoice ${inv.getString("supplier_invoice_number")}`, actor, override, date: inv.getString("invoice_date") });
  inv.set("budget_line", line.id);
  inv.set("funding_source", line.getString("funding_source"));
  inv.set("actual_amount", total);
  inv.set("commitment_released", release);
  dao.saveRecord(inv);
  po.set("committed_amount", r0(po.getInt("committed_amount")) - release);
  dao.saveRecord(po);
}

/** Approved invoice cancelled: reverse the actual and restore the PO commitment. */
function invoiceReversed(dao, inv, actor) {
  const actual = r0(inv.getInt("actual_amount"));
  if (!actual || !inv.getString("budget_line")) return;
  const line = load(dao, "budget_lines", inv.getString("budget_line"), "Budget line");
  const source = { type: "supplier_invoice", id: inv.id, number: inv.getString("number") };
  post(dao, { line, type: "actual_reversal", amount: actual, source, description: `Cancelled ${inv.getString("number")}`, actor });
  const released = r0(inv.getInt("commitment_released"));
  try {
    const po = dao.findRecordById("purchase_orders", inv.getString("purchase_order"));
    if (released && OPEN_PO.indexOf(po.getString("status")) !== -1) {
      post(dao, { line, type: "commitment", amount: released, source, description: `Commitment restored after cancelling ${inv.getString("number")}`, actor });
      po.set("committed_amount", r0(po.getInt("committed_amount")) + released);
      dao.saveRecord(po);
    }
  } catch (_) {}
  inv.set("actual_amount", 0);
  inv.set("commitment_released", 0);
  dao.saveRecord(inv);
}

// ------------------------------------------------------------------ budget documents
function spread(amount, months) {
  const base = Math.floor(amount / months);
  const out = Array.from({ length: months }, () => base);
  out[months - 1] += amount - base * months;
  return out;
}

function assertEditable(dao, budget, auth) {
  if (EDITABLE.indexOf(budget.getString("status")) === -1) throw new BadRequestError(`${budget.getString("number")} is ${budget.getString("status").replace(/_/g, " ")}; its lines can no longer change. Use a budget revision.`);
  if (auth) core.requirePermission(dao, auth, "manage_budgets", "prepare budgets");
}

function recalcBudget(dao, budgetId) {
  const b = dao.findRecordById("budgets", budgetId);
  const lines = dao.findRecordsByFilter("budget_lines", "budget = {:b}", "", 5000, 0, { b: budgetId }) || [];
  b.set("total", lines.filter((l) => l.getString("kind") !== "revenue").reduce((a, l) => a + r0(l.getInt("original_amount")), 0));
  b.set("line_count", lines.length);
  dao.saveRecord(b);
}

const SYSTEM = ["number", "status", "total", "line_count", "prepared_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "cancel_reason"];

function budgetBeforeCreate(e) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission(dao, auth, "manage_budgets", "prepare budgets");
  const b = e.record;
  for (const f of SYSTEM) b.set(f, "");
  if (!b.getString("fiscal_year")) {
    try {
      b.set("fiscal_year", dao.findFirstRecordByFilter("fiscal_years", "is_current = true").id);
    } catch (_) {}
  }
  const fy = load(dao, "fiscal_years", b.getString("fiscal_year"), "Fiscal year");
  if (fy.getString("status") !== "open") throw new BadRequestError(`${fy.getString("name")} is ${fy.getString("status")}; budgets can only be prepared for an open fiscal year.`);
  if (!b.getString("name").trim()) b.set("name", `${fy.getString("name")} budget`);
  b.set("status", "draft");
  b.set("total", 0);
  b.set("line_count", 0);
  if (auth) b.set("prepared_by", auth.id);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "budget");
  });
  b.set("number", n);
}

function budgetBeforeUpdate(e) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  const before = e.record.originalCopy();
  assertEditable(dao, before, auth);
  for (const f of SYSTEM.concat(["fiscal_year"])) e.record.set(f, before.get(f));
  e.httpContext.set("dnrAudit", JSON.stringify(core.diff(before, e.record, ["name", "description", "department", "notes"])));
}

function budgetBeforeDelete(e) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  core.requirePermission(dao, auth, "manage_budgets", "delete budget drafts");
  if (e.record.getString("status") !== "draft" || e.record.getString("approval")) throw new BadRequestError("Only drafts that were never submitted can be deleted; cancel the budget instead.");
}

function normalizeLine(dao, l, budget) {
  const code = String(l.getString("code") || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-_/]{0,39}$/.test(code)) throw new BadRequestError("Budget line code: 1–40 letters, digits or . - _ /");
  l.set("code", code);
  const kind = l.getString("kind") || "expense";
  if (!KIND_TYPE[kind]) throw new BadRequestError("Line kind must be expense, capital or revenue.");
  l.set("kind", kind);
  const acc = load(dao, "gl_accounts", l.getString("gl_account"), "GL account");
  if (!acc.getBool("is_posting") || !acc.getBool("active")) throw new BadRequestError(`${acc.getString("code")} ${acc.getString("name")} is not an active posting account.`);
  if (acc.getString("type") !== KIND_TYPE[kind]) throw new BadRequestError(`A ${kind} line needs a ${KIND_TYPE[kind]} account; ${acc.getString("code")} is ${acc.getString("type").replace("_", " ")}.`);
  if (!l.getString("department")) throw new BadRequestError(`Line ${code}: choose the department.`);
  if (!l.getString("funding_source")) throw new BadRequestError(`Line ${code}: choose the funding source.`);
  if (l.getString("project")) {
    const p = load(dao, "projects", l.getString("project"), "Project");
    if (p.getString("funding_source") && p.getString("funding_source") !== l.getString("funding_source")) {
      throw new BadRequestError(`Line ${code}: project ${p.getString("code")} is funded by another source.`);
    }
  }
  const amount = r0(l.getFloat("original_amount"));
  if (amount < 0) throw new BadRequestError(`Line ${code}: the amount cannot be negative.`);
  l.set("original_amount", amount);
  l.set("revised_amount", amount);
  let phasing = core.parseJson(l, "phasing", []);
  if (!Array.isArray(phasing) || phasing.length !== 12 || phasing.every((x) => !Number(x))) phasing = spread(amount, 12);
  phasing = phasing.map(r0);
  if (phasing.some((x) => x < 0)) throw new BadRequestError(`Line ${code}: monthly amounts cannot be negative.`);
  const sum = phasing.reduce((a, x) => a + x, 0);
  if (sum !== amount) throw new BadRequestError(`Line ${code}: the 12 monthly amounts add up to ${fmt(sum)}, not the annual ${fmt(amount)}.`);
  l.set("phasing", phasing);
  l.set("fiscal_year", budget.getString("fiscal_year"));
  l.set("status", "draft");
  if (!l.getString("name")) l.set("name", acc.getString("name"));
}

function lineBeforeWrite(e, verb) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  const l = e.record;
  const budgetId = verb === "update" ? l.originalCopy().getString("budget") : l.getString("budget");
  const budget = load(dao, "budgets", budgetId, "Budget");
  assertEditable(dao, budget, auth);
  if (verb === "delete") return;
  l.set("budget", budget.id);
  normalizeLine(dao, l, budget);
}

function lineAfterWrite(e) {
  recalcBudget($app.dao(), e.record.getString("budget"));
}

/** Bulk lines (Excel import or the line editor): validates every row first, then writes. */
function saveLines(dao, budgetId, actor, rows, replace, meta) {
  const budget = load(dao, "budgets", budgetId, "Budget");
  assertEditable(dao, budget, actor);
  if (!Array.isArray(rows) || !rows.length) throw new BadRequestError("No lines to save.");
  if (rows.length > 2000) throw new BadRequestError("At most 2,000 lines per budget.");
  const col = dao.findCollectionByNameOrId("budget_lines");
  const lookup = (collection, value) => {
    const v = String(value || "").trim();
    if (!v) return "";
    try {
      return dao.findRecordById(collection, v).id;
    } catch (_) {}
    try {
      return dao.findFirstRecordByFilter(collection, "code = {:c}", { c: v.toUpperCase() }).id;
    } catch (_) {}
    try {
      return dao.findFirstRecordByFilter(collection, "name = {:c}", { c: v }).id;
    } catch (_) {}
    return "";
  };
  const errors = [];
  const records = [];
  const seen = {};
  rows.forEach((row, i) => {
    const l = new Record(col);
    l.set("code", row.code);
    l.set("name", row.name || "");
    l.set("kind", row.kind || "expense");
    l.set("gl_account", lookup("gl_accounts", row.gl_account));
    l.set("department", lookup("departments", row.department));
    l.set("funding_source", lookup("funding_sources", row.funding_source));
    l.set("project", lookup("projects", row.project));
    l.set("cost_centre", lookup("cost_centres", row.cost_centre));
    l.set("original_amount", row.amount !== undefined ? row.amount : row.original_amount);
    l.set("phasing", Array.isArray(row.phasing) ? row.phasing : []);
    l.set("notes", row.notes || "");
    try {
      if (!l.getString("gl_account")) throw new BadRequestError(`unknown GL account "${row.gl_account || ""}"`);
      normalizeLine(dao, l, budget);
      if (seen[l.getString("code")]) throw new BadRequestError(`duplicate code ${l.getString("code")}`);
      seen[l.getString("code")] = true;
      l.set("budget", budget.id);
      records.push(l);
    } catch (err) {
      errors.push(`Row ${i + 1}: ${String(err && err.message ? err.message : err).replace(/^.*?Error: /, "")}`);
    }
  });
  if (errors.length) throw new BadRequestError(`${errors.length} line(s) have problems — nothing was saved. ${errors.slice(0, 8).join(" · ")}${errors.length > 8 ? " …" : ""}`);
  if (replace) for (const old of dao.findRecordsByFilter("budget_lines", "budget = {:b}", "", 5000, 0, { b: budget.id }) || []) dao.deleteRecord(old);
  else {
    for (const l of records) {
      try {
        dao.findFirstRecordByFilter("budget_lines", "budget = {:b} && code = {:c}", { b: budget.id, c: l.getString("code") });
        throw new BadRequestError(`Line ${l.getString("code")} already exists in ${budget.getString("number")}.`);
      } catch (err) {
        if (String(err).indexOf("already exists") !== -1) throw err;
      }
    }
  }
  for (const l of records) dao.saveRecord(l);
  recalcBudget(dao, budget.id);
  core.audit(dao, { actor, action: replace ? "budget_lines_replaced" : "budget_lines_added", collection: "budgets", recordId: budget.id, label: budget.getString("number"), comment: `${records.length} line(s)`, meta });
  return records.length;
}

function submitBudget(dao, id, actor, meta) {
  const b = load(dao, "budgets", id, "Budget");
  assertEditable(dao, b, actor);
  const lines = dao.findRecordsByFilter("budget_lines", "budget = {:b}", "", 5000, 0, { b: b.id }) || [];
  if (!lines.length) throw new BadRequestError(`${b.getString("number")} has no lines yet.`);
  if (!(b.getInt("total") > 0)) throw new BadRequestError(`${b.getString("number")} has a total of 0.`);
  const clash = [];
  for (const l of lines) {
    const other = dao.findRecordsByFilter("budget_lines", 'fiscal_year = {:fy} && code = {:c} && status = "active"', "", 1, 0, { fy: b.getString("fiscal_year"), c: l.getString("code") }) || [];
    if (other.length) clash.push(l.getString("code"));
  }
  if (clash.length) throw new BadRequestError(`These line codes are already in an approved budget of the year: ${clash.slice(0, 10).join(", ")}. Use a budget revision to change them.`);
  return require("./approvals.js").start(dao, "budget", b, actor, meta);
}

function cancelBudget(dao, id, actor, reason, meta) {
  const b = load(dao, "budgets", id, "Budget");
  core.requirePermission(dao, actor, "manage_budgets", "cancel budgets");
  if (["draft", "returned", "pending_approval"].indexOf(b.getString("status")) === -1) throw new BadRequestError(`${b.getString("number")} is ${b.getString("status")} and cannot be cancelled.`);
  if (!String(reason || "").trim()) throw new BadRequestError("Give a reason for cancelling.");
  require("./approvals.js").cancel(dao, "budget", b, actor, String(reason).trim(), meta);
  return b;
}

function onBudgetApproved(dao, b, actor, meta) {
  const lines = dao.findRecordsByFilter("budget_lines", "budget = {:b}", "", 5000, 0, { b: b.id }) || [];
  for (const l of lines) {
    l.set("status", "active");
    l.set("revised_amount", l.getInt("original_amount"));
    dao.saveRecord(l);
  }
  core.audit(dao, { actor, action: "budget_activated", collection: "budgets", recordId: b.id, label: b.getString("number"), comment: `${lines.length} line(s) active for budget control`, meta });
}

// ------------------------------------------------------------------ revisions
const REV_SYSTEM = ["number", "status", "total_increase", "total_decrease", "net_change", "prepared_by", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "applied_at", "cancel_reason"];

function normalizeRevision(dao, rev) {
  const type = rev.getString("type");
  if (["supplementary", "reduction", "virement", "rephasing"].indexOf(type) === -1) throw new BadRequestError("Choose the revision type.");
  if (!rev.getString("fiscal_year")) {
    try {
      rev.set("fiscal_year", dao.findFirstRecordByFilter("fiscal_years", "is_current = true").id);
    } catch (_) {}
  }
  const raw = core.parseJson(rev, "lines", []);
  if (!Array.isArray(raw)) throw new BadRequestError("Lines must be a list.");
  let inc = 0, dec = 0;
  const seen = {};
  const lines = raw.map((x, i) => {
    const line = load(dao, "budget_lines", String((x && x.budget_line) || ""), `Budget line on row ${i + 1}`);
    if (line.getString("status") !== "active") throw new BadRequestError(`${line.getString("code")} is not an active line.`);
    if (line.getString("fiscal_year") !== rev.getString("fiscal_year")) throw new BadRequestError(`${line.getString("code")} belongs to another fiscal year.`);
    if (seen[line.id]) throw new BadRequestError(`${line.getString("code")} appears twice.`);
    seen[line.id] = true;
    const change = r0(x.change);
    if (change > 0) inc += change;
    else dec += -change;
    const out = { budget_line: line.id, code: line.getString("code"), name: line.getString("name"), current: r0(line.getInt("revised_amount")), change };
    if (type === "rephasing") {
      const ph = Array.isArray(x.phasing) ? x.phasing.map(r0) : [];
      if (ph.length !== 12 || ph.reduce((a, v) => a + v, 0) !== out.current) throw new BadRequestError(`${line.getString("code")}: the new monthly amounts must add up to the current budget ${fmt(out.current)}.`);
      out.phasing = ph;
    }
    return out;
  });
  if (type === "supplementary" && lines.some((l) => l.change <= 0)) throw new BadRequestError("A supplementary budget only increases lines.");
  if (type === "reduction" && lines.some((l) => l.change >= 0)) throw new BadRequestError("A reduction only decreases lines.");
  if (type === "virement") {
    if (inc !== dec) throw new BadRequestError(`A virement moves money between lines: increases (${fmt(inc)}) must equal decreases (${fmt(dec)}).`);
    if (!inc) throw new BadRequestError("A virement needs at least one line increased and one decreased.");
  }
  if (type === "rephasing" && lines.some((l) => l.change !== 0)) throw new BadRequestError("A re-phasing changes the months only, not the amounts.");
  rev.set("lines", lines);
  rev.set("total_increase", inc);
  rev.set("total_decrease", dec);
  rev.set("net_change", inc - dec);
}

function revisionBeforeCreate(e) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  if (auth) core.requirePermission(dao, auth, "manage_budgets", "prepare budget revisions");
  const r = e.record;
  for (const f of REV_SYSTEM) r.set(f, "");
  normalizeRevision(dao, r);
  r.set("status", "draft");
  if (auth) r.set("prepared_by", auth.id);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "budget_revision");
  });
  r.set("number", n);
}

function revisionBeforeUpdate(e) {
  const dao = $app.dao();
  const auth = e.httpContext.get("authRecord");
  const before = e.record.originalCopy();
  if (EDITABLE.indexOf(before.getString("status")) === -1) throw new BadRequestError(`${before.getString("number")} is ${before.getString("status").replace(/_/g, " ")} and can no longer be edited.`);
  if (auth) core.requirePermission(dao, auth, "manage_budgets", "edit budget revisions");
  for (const f of REV_SYSTEM.concat(["fiscal_year"])) e.record.set(f, before.get(f));
  normalizeRevision(dao, e.record);
}

/** Decreases may not go below what is already committed or spent on the line. */
function checkDecreases(dao, rev) {
  for (const x of core.parseJson(rev, "lines", [])) {
    if (x.change >= 0) continue;
    const line = load(dao, "budget_lines", x.budget_line, "Budget line");
    const fig = lineFigures(dao, line);
    if (-x.change > fig.available) throw new BadRequestError(`${line.getString("code")} can be reduced by at most ${fmt(Math.max(fig.available, 0))} (the rest is committed or spent).`);
  }
}

function submitRevision(dao, id, actor, meta) {
  const r = load(dao, "budget_revisions", id, "Budget revision");
  core.requirePermission(dao, actor, "manage_budgets", "submit budget revisions");
  if (EDITABLE.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is already ${r.getString("status").replace(/_/g, " ")}.`);
  if (!core.parseJson(r, "lines", []).length) throw new BadRequestError(`${r.getString("number")} has no lines.`);
  if (String(r.getString("reason") || "").trim().length < 10) throw new BadRequestError("Explain the reason for the revision (at least 10 characters).");
  checkDecreases(dao, r);
  return require("./approvals.js").start(dao, "budget_revision", r, actor, meta);
}

function cancelRevision(dao, id, actor, reason, meta) {
  const r = load(dao, "budget_revisions", id, "Budget revision");
  core.requirePermission(dao, actor, "manage_budgets", "cancel budget revisions");
  if (["draft", "returned", "pending_approval"].indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status")} and cannot be cancelled.`);
  if (!String(reason || "").trim()) throw new BadRequestError("Give a reason for cancelling.");
  require("./approvals.js").cancel(dao, "budget_revision", r, actor, String(reason).trim(), meta);
  return r;
}

/**
 * New monthly amounts after a revision: an increase is spread over the remaining months (from the
 * current month); a reduction is taken from the last months backwards, never below zero.
 */
function adjustPhasing(phasing, change, fromMonth) {
  const p = phasing.slice();
  if (change > 0) {
    const add = spread(change, 12 - fromMonth);
    for (let i = 0; i < add.length; i++) p[fromMonth + i] += add[i];
    return p;
  }
  let left = -change;
  for (let i = 11; i >= 0 && left > 0; i--) {
    const take = Math.min(p[i], left);
    p[i] -= take;
    left -= take;
  }
  return p;
}

function onRevisionApproved(dao, rev, actor, meta) {
  checkDecreases(dao, rev);
  const period = masterdata.periodFor(dao, new Date().toISOString());
  const fromMonth = period ? Math.max(period.getInt("number") - 1, 0) : 0;
  const changes = {};
  for (const x of core.parseJson(rev, "lines", [])) {
    const line = load(dao, "budget_lines", x.budget_line, "Budget line");
    const before = r0(line.getInt("revised_amount"));
    let phasing = core.parseJson(line, "phasing", spread(before, 12)).map(r0);
    if (x.phasing) phasing = x.phasing;
    else if (x.change) phasing = adjustPhasing(phasing, x.change, fromMonth);
    line.set("revised_amount", before + x.change);
    line.set("phasing", phasing);
    dao.saveRecord(line);
    changes[line.getString("code")] = { old: before, new: before + x.change };
  }
  rev.set("applied_at", new Date().toISOString());
  dao.saveRecord(rev);
  core.audit(dao, { actor, action: "budget_revision_applied", collection: "budget_revisions", recordId: rev.id, label: rev.getString("number"), changes, comment: rev.getString("reason"), meta });
}

// ------------------------------------------------------------------ reporting
function nameMap(dao, collection) {
  const out = {};
  for (const r of dao.findRecordsByFilter(collection, "id != ''", "", 5000, 0) || []) out[r.id] = { code: r.getString("code"), name: r.getString("name") };
  return out;
}

function currentFy(dao, fyId) {
  if (fyId) return load(dao, "fiscal_years", fyId, "Fiscal year");
  try {
    return dao.findFirstRecordByFilter("fiscal_years", "is_current = true");
  } catch (_) {
    throw new BadRequestError("No current fiscal year. Create one under Setup → Fiscal years.");
  }
}

/** Per line figures with names, filtered by the caller's scope. */
function usage(dao, auth, q) {
  const fy = currentFy(dao, q.fiscal_year);
  const s = settings(dao);
  const filters = ['fiscal_year = {:fy}', 'status != "draft"'];
  const params = { fy: fy.id };
  for (const k of ["department", "funding_source", "project", "kind", "gl_account"]) {
    if (q[k]) {
      filters.push(`${k} = {:${k}}`);
      params[k] = q[k];
    }
  }
  const scope = auth ? core.permissionsOf(dao, auth).__scope : "all";
  if (auth && scope !== "all" && !core.can(dao, auth, "manage_budgets")) {
    filters.push("department = {:mydept}");
    params.mydept = auth.getString("department");
  }
  const lines = dao.findRecordsByFilter("budget_lines", filters.join(" && "), "code", 5000, 0, params) || [];
  const sums = ledgerSums(dao, "fiscal_year = {:fy}", { fy: fy.id });
  const names = { gl_accounts: nameMap(dao, "gl_accounts"), departments: nameMap(dao, "departments"), funding_sources: nameMap(dao, "funding_sources"), projects: nameMap(dao, "projects") };
  const overrides = {};
  for (const o of dao.findRecordsByFilter("budget_overrides", 'status != "cancelled"', "", 5000, 0) || []) overrides[o.getString("budget_line")] = (overrides[o.getString("budget_line")] || 0) + 1;
  const items = lines.map((l) => {
    const f = figuresOf(l, sums[l.id], s);
    const acc = names.gl_accounts[l.getString("gl_account")] || {};
    return {
      id: l.id, code: l.getString("code"), name: l.getString("name"), kind: l.getString("kind"), status: l.getString("status"),
      account: `${acc.code || ""} ${acc.name || ""}`.trim(), gl_account: l.getString("gl_account"),
      department: l.getString("department"), department_name: (names.departments[l.getString("department")] || {}).name || "",
      funding_source: l.getString("funding_source"), funding_code: (names.funding_sources[l.getString("funding_source")] || {}).code || "",
      project: l.getString("project"), project_code: (names.projects[l.getString("project")] || {}).code || "",
      original: r0(l.getInt("original_amount")), phasing: core.parseJson(l, "phasing", []), overrides: overrides[l.id] || 0, ...f,
    };
  });
  const totals = items.filter((i) => i.kind !== "revenue").reduce((a, i) => ({ budget: a.budget + i.budget, committed: a.committed + i.committed, actual: a.actual + i.actual, available: a.available + i.available }), { budget: 0, committed: 0, actual: 0, available: 0 });
  totals.used_pct = totals.budget ? Math.round(((totals.committed + totals.actual) / totals.budget) * 1000) / 10 : 0;
  return { fiscal_year: { id: fy.id, name: fy.getString("name"), code: fy.getString("code") }, thresholds: { amber: s.amber, red: s.red }, control: s.control, scope, items, totals };
}

/**
 * Budget vs actual for a period range, grouped by line / department / funding source / project / account.
 * Budget for the range = sum of the phased months; actual and commitments from the ledger dated in the range.
 */
function bva(dao, auth, q) {
  const fy = currentFy(dao, q.fiscal_year);
  const periods = dao.findRecordsByFilter("fiscal_periods", "fiscal_year = {:fy}", "number", 12, 0, { fy: fy.id }) || [];
  const from = Math.min(Math.max(parseInt(q.from_period || "1", 10) || 1, 1), 12);
  const to = Math.min(Math.max(parseInt(q.to_period || "12", 10) || 12, from), 12);
  const start = periods[from - 1] ? periods[from - 1].getString("start_date") : fy.getString("start_date");
  const end = periods[to - 1] ? periods[to - 1].getString("end_date") : fy.getString("end_date");
  const base = usage(dao, auth, { ...q, fiscal_year: fy.id });
  const sums = ledgerSums(dao, "fiscal_year = {:fy} AND date >= {:a} AND date <= {:b}", { fy: fy.id, a: start, b: end });
  const groupBy = ["line", "department", "funding_source", "project", "account", "kind"].indexOf(q.group_by) !== -1 ? q.group_by : "line";
  const groups = {};
  // Spending lines by default; revenue lines only when asked for (kind=revenue) — never mixed in one group.
  const items = base.items.filter((i) => (q.kind ? i.kind === q.kind : i.kind !== "revenue"));
  for (const it of items) {
    const s = sums[it.id] || { commitment: 0, commitment_release: 0, actual: 0, actual_reversal: 0 };
    const phased = (it.phasing.length === 12 ? it.phasing : spread(it.budget, 12)).slice(from - 1, to).reduce((a, v) => a + r0(v), 0);
    // Revisions change the annual figure; scale the phased budget so the year still adds up.
    const phasedTotal = (it.phasing.length === 12 ? it.phasing : []).reduce((a, v) => a + r0(v), 0) || it.budget;
    const periodBudget = phasedTotal ? Math.round((phased * it.budget) / phasedTotal) : 0;
    const keyLabel =
      groupBy === "line" ? [it.id, `${it.code} — ${it.name}`]
      : groupBy === "department" ? [it.department, it.department_name || "—"]
      : groupBy === "funding_source" ? [it.funding_source, it.funding_code || "—"]
      : groupBy === "project" ? [it.project || "none", it.project_code || "No project"]
      : groupBy === "kind" ? [it.kind, it.kind]
      : [it.gl_account, it.account];
    const g = (groups[keyLabel[0]] = groups[keyLabel[0]] || { key: keyLabel[0], label: keyLabel[1], kind: it.kind, annual_budget: 0, budget: 0, actual: 0, committed: 0, overrides: 0 });
    g.annual_budget += it.budget;
    g.budget += periodBudget;
    g.actual += s.actual - s.actual_reversal;
    g.committed += s.commitment - s.commitment_release;
    g.overrides += it.overrides;
  }
  const rows = Object.values(groups).map((g) => ({ ...g, variance: g.budget - g.actual, variance_pct: g.budget ? Math.round(((g.budget - g.actual) / g.budget) * 1000) / 10 : 0, execution_pct: g.budget ? Math.round((g.actual / g.budget) * 1000) / 10 : 0 }));
  rows.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const totals = rows.reduce((a, r) => ({ annual_budget: a.annual_budget + r.annual_budget, budget: a.budget + r.budget, actual: a.actual + r.actual, committed: a.committed + r.committed }), { annual_budget: 0, budget: 0, actual: 0, committed: 0 });
  totals.variance = totals.budget - totals.actual;
  return {
    fiscal_year: base.fiscal_year, from_period: from, to_period: to,
    period_label: `${periods[from - 1] ? periods[from - 1].getString("name") : ""} – ${periods[to - 1] ? periods[to - 1].getString("name") : ""}`,
    group_by: groupBy, rows, totals,
  };
}

/** Department summary (used by procurement plans and the procurement report centre). */
function departmentSummary(dao, departmentId, fyId) {
  if (!departmentId) return null;
  let fy;
  try {
    fy = currentFy(dao, fyId);
  } catch (_) {
    return null;
  }
  const lines = dao.findRecordsByFilter("budget_lines", 'fiscal_year = {:fy} && department = {:d} && status = "active" && kind != "revenue"', "", 5000, 0, { fy: fy.id, d: departmentId }) || [];
  if (!lines.length) return null;
  const sums = ledgerSums(dao, "fiscal_year = {:fy} AND department = {:d}", { fy: fy.id, d: departmentId });
  const s = settings(dao);
  const out = { fiscal_year: fy.getString("name"), amount: 0, committed: 0, invoiced: 0, paid: 0, remaining: 0, lines: lines.length };
  for (const l of lines) {
    const f = figuresOf(l, sums[l.id], s);
    out.amount += f.budget;
    out.committed += f.committed;
    out.invoiced += f.actual;
    out.remaining += f.available;
  }
  return out;
}

function ledgerOf(dao, lineId) {
  return (dao.findRecordsByFilter("budget_ledger", "budget_line = {:l}", "-date,-created", 2000, 0, { l: lineId }) || []).map((r) => ({
    id: r.id, date: r.getString("date"), type: r.getString("type"), amount: r.getInt("amount"), source_type: r.getString("source_type"),
    source_id: r.getString("source_id"), source_number: r.getString("source_number"), description: r.getString("description"), override: r.getString("override"),
  }));
}

/** Strips amounts from budget records for people without budget access (they may still pick lines). */
function hideAmounts(dao, auth, record) {
  if (!auth || core.can(dao, auth, "view_budgets") || core.can(dao, auth, "manage_budgets")) return;
  for (const f of ["original_amount", "revised_amount", "total", "total_increase", "total_decrease", "net_change", "amount_requested", "available", "shortfall"]) if (record.collection().schema.getFieldByName(f)) record.set(f, 0);
  for (const f of ["phasing", "lines"]) if (record.collection().schema.getFieldByName(f)) record.set(f, []);
}

module.exports = {
  settings, lineFigures, ledgerSums, figuresOf, assertAvailable, post, grantOverride, attachLine, checkRequisition, commitPo, releasePo,
  invoiceApproved, invoiceReversed, budgetBeforeCreate, budgetBeforeUpdate, budgetBeforeDelete, lineBeforeWrite, lineAfterWrite, saveLines,
  submitBudget, cancelBudget, onBudgetApproved, revisionBeforeCreate, revisionBeforeUpdate, submitRevision, cancelRevision, onRevisionApproved,
  usage, bva, departmentSummary, ledgerOf, hideAmounts, spread,
};
