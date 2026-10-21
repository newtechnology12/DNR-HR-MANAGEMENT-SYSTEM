/// <reference path="../../pb_data/types.d.ts" />
/**
 * Annual procurement plans per department: draft (lines editable) → approval (engine, "procurement_plan")
 * → approved (requisitions are raised against plan lines) → closed.
 * Progress (requested / ordered / received per line) is computed live from requisitions and purchase orders.
 * Every planned purchase is charged to a budget line of the department (IMS M3): the plan cannot be
 * submitted while a line has none, or while it plans more on a budget line than the line holds.
 */
const core = require("./core.js");

function load(dao, id) {
  try {
    return dao.findRecordById("procurement_plans", id);
  } catch (_) {
    throw new NotFoundError("Procurement plan not found.");
  }
}
const EDITABLE = ["draft", "returned", "rejected"];

function planBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  if (auth) core.requirePermission(dao, auth, "manage_procurement_plan", "create procurement plans");
  const r = e.record;
  const year = r.getInt("fiscal_year");
  if (!(year >= 2000 && year <= 2100)) throw new BadRequestError("Choose the fiscal year.");
  if (!r.getString("department")) throw new BadRequestError("Choose the department.");
  const dup = dao.findRecordsByFilter("procurement_plans", "fiscal_year = {:y} && department = {:d} && status != 'cancelled' && status != 'rejected'", "", 1, 0, { y: year, d: r.getString("department") }) || [];
  if (dup.length) throw new BadRequestError(`This department already has a plan for FY ${year}/${String(year + 1).slice(2)} (${dup[0].getString("number")}). Add lines to it instead.`);
  if (!r.getString("name").trim()) {
    let dept = "";
    try {
      dept = dao.findRecordById("departments", r.getString("department")).getString("name");
    } catch (_) {}
    r.set("name", `${dept} procurement plan FY ${year}/${String(year + 1).slice(2)}`);
  }
  r.set("status", "draft");
  r.set("total_estimated", 0);
  r.set("lines_count", 0);
  if (auth) r.set("created_by", auth.id);
  let n = "";
  dao.runInTransaction((tx) => {
    n = core.nextNumber(tx, "procurement_plan");
  });
  r.set("number", n);
}

function planBeforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const before = e.record.originalCopy();
  for (const f of ["number", "status", "approval", "pending_approvers", "approver_history", "submitted_at", "approved_at", "total_estimated", "lines_count", "created_by", "fiscal_year", "department"]) e.record.set(f, before.get(f));
  if (EDITABLE.indexOf(before.getString("status")) === -1 && before.getString("name") !== e.record.getString("name")) throw new BadRequestError("An approved plan cannot be renamed.");
}

function recount(dao, planId) {
  const plan = load(dao, planId);
  const lines = dao.findRecordsByFilter("procurement_plan_lines", "plan = {:p} && status != 'cancelled'", "", 5000, 0, { p: planId }) || [];
  plan.set("total_estimated", core.money(lines.reduce((a, l) => a + l.getFloat("estimated_total"), 0)));
  plan.set("lines_count", lines.length);
  dao.saveRecord(plan);
}

function lineBeforeSave(e) {
  const auth = e.httpContext.get("authRecord");
  const dao = $app.dao();
  const r = e.record;
  const plan = load(dao, r.getString("plan"));
  if (auth) {
    core.requirePermission(dao, auth, "manage_procurement_plan", "edit procurement plans");
    const editable = EDITABLE.indexOf(plan.getString("status")) !== -1;
    if (!editable) {
      // After approval only the status of a line may change (e.g. cancelled), never the amounts.
      if (r.isNew()) throw new BadRequestError(`${plan.getString("number")} is ${plan.getString("status")}; lines can no longer be added. Amend through a new plan revision or ask for the plan to be returned.`);
      const before = r.originalCopy();
      for (const f of ["description", "quantity", "estimated_unit_cost", "category", "planned_month", "budget", "budget_line"]) {
        if (before.getString(f) !== r.getString(f)) throw new BadRequestError(`${plan.getString("number")} is approved; planned quantities and costs are locked.`);
      }
    }
  }
  if (!r.getString("description").trim()) throw new BadRequestError("Describe what will be purchased.");
  if (!(r.getFloat("quantity") > 0)) throw new BadRequestError("Enter the quantity.");
  if (!(r.getFloat("estimated_unit_cost") >= 0)) throw new BadRequestError("Enter the estimated unit cost.");
  const m = r.getInt("planned_month");
  if (!(m >= 1 && m <= 12)) throw new BadRequestError("Choose the planned month.");
  r.set("estimated_total", core.money(r.getFloat("quantity") * r.getFloat("estimated_unit_cost")));
  if (r.getString("budget_line")) checkBudgetLine(dao, plan, r.getString("budget_line"));
  if (!r.getString("status")) r.set("status", "planned");
  if (!r.getString("priority")) r.set("priority", "medium");
  if (!r.getString("method")) r.set("method", "rfq");
}

/** The budget line must be an active spending line of the plan's department and fiscal year. */
function checkBudgetLine(dao, plan, lineId) {
  let line;
  try {
    line = dao.findRecordById("budget_lines", lineId);
  } catch (_) {
    throw new BadRequestError("The budget line no longer exists.");
  }
  if (line.getString("status") !== "active") throw new BadRequestError(`Budget line ${line.getString("code")} is not active (its budget is not approved yet).`);
  if (line.getString("kind") === "revenue") throw new BadRequestError(`${line.getString("code")} is a revenue line; plan purchases on expense or capital lines.`);
  if (line.getString("department") !== plan.getString("department")) throw new BadRequestError(`Budget line ${line.getString("code")} belongs to another department.`);
  let fy = null;
  try {
    fy = dao.findRecordById("fiscal_years", line.getString("fiscal_year"));
  } catch (_) {}
  if (fy && parseInt(fy.getString("start_date").slice(0, 4), 10) !== plan.getInt("fiscal_year")) {
    throw new BadRequestError(`Budget line ${line.getString("code")} is in ${fy.getString("name")}, not in the plan year ${plan.getInt("fiscal_year")}.`);
  }
  return line;
}

/** Planned totals per budget line, against what each line holds. */
function budgetCoverage(dao, planId) {
  const lines = dao.findRecordsByFilter("procurement_plan_lines", "plan = {:p} && status != 'cancelled'", "", 5000, 0, { p: planId }) || [];
  const by = {};
  for (const l of lines) {
    const id = l.getString("budget_line");
    if (!id) continue;
    by[id] = (by[id] || 0) + l.getFloat("estimated_total");
  }
  const budget = require("./budget.js");
  return Object.keys(by).map((id) => {
    const line = dao.findRecordById("budget_lines", id);
    const f = budget.lineFigures(dao, line);
    return { id, code: line.getString("code"), name: line.getString("name"), budget: f.budget, available: f.available, planned: core.money(by[id]), over: core.money(Math.max(by[id] - f.budget, 0)) };
  });
}

function lineBeforeDelete(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const dao = $app.dao();
  core.requirePermission(dao, auth, "manage_procurement_plan", "edit procurement plans");
  const plan = load(dao, e.record.getString("plan"));
  if (EDITABLE.indexOf(plan.getString("status")) === -1) throw new BadRequestError("Lines of an approved plan cannot be deleted; cancel the line instead.");
}

function action(dao, actor, id, act, input, meta) {
  const plan = load(dao, id);
  const status = plan.getString("status");
  core.requirePermission(dao, actor, "manage_procurement_plan", `${act} procurement plans`);
  if (act === "submit") {
    if (EDITABLE.indexOf(status) === -1) throw new BadRequestError(`${plan.getString("number")} is ${status}.`);
    recount(dao, id);
    const fresh = load(dao, id);
    if (!fresh.getInt("lines_count")) throw new BadRequestError("Add at least one planned purchase before submitting.");
    const missing = (dao.findRecordsByFilter("procurement_plan_lines", "plan = {:p} && status != 'cancelled' && budget_line = ''", "", 50, 0, { p: id }) || []).map((l) => l.getString("description"));
    if (missing.length) throw new BadRequestError(`Choose the budget line for every planned purchase: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " …" : ""}.`);
    const over = budgetCoverage(dao, id).filter((c) => c.over > 0);
    if (over.length) {
      throw new BadRequestError(
        `The plan exceeds its budget lines: ${over.map((c) => `${c.code} plans ${core.formatMoney(c.planned, "RWF")} against ${core.formatMoney(c.budget, "RWF")}`).join("; ")}. Reduce the plan or ask the Budget Officer for a revision.`
      );
    }
    return require("./approvals.js").start(dao, "procurement_plan", fresh, actor, meta);
  }
  if (act === "close") {
    if (status !== "approved") throw new BadRequestError("Only an approved plan can be closed.");
    plan.set("status", "closed");
    dao.saveRecord(plan);
    core.audit(dao, { actor, action: "closed", collection: "procurement_plans", recordId: plan.id, label: plan.getString("number"), meta, comment: String(input.reason || "") });
    return plan;
  }
  throw new NotFoundError(`Unknown plan action "${act}".`);
}

/** Per line: requested (requisitions), ordered (POs), received; plus budget for the department and year. */
function progress(dao, planId) {
  const plan = load(dao, planId);
  const lines = dao.findRecordsByFilter("procurement_plan_lines", "plan = {:p}", "sort,planned_month", 5000, 0, { p: planId }) || [];
  const out = {};
  for (const l of lines) out[l.id] = { requested: 0, ordered: 0, received: 0, requisitions: [] };
  const reqs = dao.findRecordsByFilter("purchase_requisitions", "plan_line.plan = {:p} && status != 'cancelled' && status != 'rejected' && status != 'draft'", "", 5000, 0, { p: planId }) || [];
  const reqLine = {};
  for (const r of reqs) {
    const lid = r.getString("plan_line");
    if (!out[lid]) continue;
    out[lid].requested += r.getFloat("total");
    out[lid].requisitions.push({ id: r.id, number: r.getString("number"), status: r.getString("status"), total: r.getFloat("total") });
    reqLine[r.id] = lid;
  }
  if (reqs.length) {
    for (const po of dao.findRecordsByFilter("purchase_orders", "status != 'cancelled' && status != 'rejected' && status != 'draft'", "", 20000, 0) || []) {
      const lid = reqLine[po.getString("requisition")];
      if (!lid) continue;
      out[lid].ordered += po.getFloat("grand_total");
      out[lid].received += po.getFloat("received_value");
    }
  }
  let budget = null;
  try {
    const s = require("./budget.js").departmentSummary(dao, plan.getString("department"));
    if (s) budget = { id: "", name: `${s.fiscal_year} budget — ${s.lines} line(s)`, ...s };
  } catch (_) {}
  let coverage = [];
  try {
    coverage = budgetCoverage(dao, planId);
  } catch (_) {}
  return { lines: out, budget, coverage };
}

/** Requisition hook: a plan line must belong to an approved plan of the same department. */
function checkRequisition(dao, req) {
  const lid = req.getString("plan_line");
  if (!lid) return;
  let line;
  try {
    line = dao.findRecordById("procurement_plan_lines", lid);
  } catch (_) {
    throw new BadRequestError("The planned purchase you linked no longer exists.");
  }
  const plan = load(dao, line.getString("plan"));
  if (plan.getString("status") !== "approved") throw new BadRequestError(`${plan.getString("number")} is not approved; requisitions can only be raised against an approved plan.`);
  if (line.getString("status") === "cancelled") throw new BadRequestError("This planned purchase was cancelled.");
  if (plan.getString("department") !== req.getString("department")) throw new BadRequestError("The planned purchase belongs to another department's plan.");
  // The requisition is charged to the budget line the purchase was planned on.
  const planned = line.getString("budget_line");
  if (!planned) return;
  if (!req.getString("budget_line")) {
    req.set("budget_line", planned);
    require("./budget.js").attachLine(dao, req, null);
  } else if (req.getString("budget_line") !== planned) {
    let code = "";
    try {
      code = dao.findRecordById("budget_lines", planned).getString("code");
    } catch (_) {}
    throw new BadRequestError(`This purchase was planned on budget line ${code}; charge the requisition to the same line or unlink the planned purchase.`);
  }
}

module.exports = { planBeforeCreate, planBeforeUpdate, recount, lineBeforeSave, lineBeforeDelete, action, progress, checkRequisition, budgetCoverage };
