/// <reference path="../../pb_data/types.d.ts" />
/**
 * Staff expenses and salary advances. A member of staff asks to be reimbursed for money spent on RALGA's business
 * (claim) or for a salary advance; the head of department and the Director of Finance approve it (approval engine);
 * the Cashier pays it from a cash book — petty cash, mobile money or bank. Paying writes the cash book entry and the
 * journal (lib/glpost.staffExpense):
 *   claim    Dr the category's expense account (department, funding source, budget line) / Cr the cash account
 *   advance  Dr staff advances / Cr the cash account — the payroll then deducts it and credits staff advances
 * A claim is checked against its department's budget line when submitted and becomes an actual when approved.
 * Requests are written by the server only (rules on `prepayments` are closed); the old floats are history.
 */
const core = require("./core.js");

const r0 = (n) => Math.round(Number(n) || 0);
const day = (v) => String(v || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const fmt = (n) => core.formatMoney(n, "RWF");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const showDay = (d) => (d ? `${parseInt(d.slice(8, 10), 10)} ${MONTHS[parseInt(d.slice(5, 7), 10) - 1]} ${d.slice(0, 4)}` : "");

const OPEN = ["pending_approval", "returned"];
const METHODS = ["cash", "mobile_money", "bank_transfer"];
const MOMO = /^(\+?250|0)?7[2389]\d{7}$/;
const MAX_AMOUNT = 50000000;
const CLAIM_DAYS = 90; // receipts older than this are not reimbursed
const OUTSTANDING_ADVANCE = ["pending_approval", "returned", "approved", "paid"];

function find(dao, collection, id) {
  if (!id) return null;
  try {
    return dao.findRecordById(collection, String(id));
  } catch (_) {
    return null;
  }
}
function load(dao, collection, id, what) {
  const r = find(dao, collection, id);
  if (!r) throw new NotFoundError(`${what} not found.`);
  return r;
}
const nameOf = (dao, collection, id, field) => {
  const r = find(dao, collection, id);
  return r ? r.getString(field || "name") : "";
};
const kindLabel = (r) => (r.getString("kind") === "advance" ? "salary advance" : "expense claim");

function categoryOf(dao, id) {
  const c = load(dao, "expenses_categories", id, "Category");
  if (!c.getBool("active")) throw new BadRequestError(`${c.getString("name")} is no longer used; choose another category.`);
  return { c, kind: c.getString("kind") || (/advance/i.test(c.getString("name")) ? "advance" : "claim") };
}

/** Member contributions: what staff costs are paid from unless a budget line says otherwise. */
function defaultFunding(dao) {
  const mc = (dao.findRecordsByFilter("funding_sources", "code = 'MC'", "", 1, 0) || [])[0];
  return mc ? mc.id : "";
}

/** The active line of the department for the account and funding source in the fiscal year of `when`. */
function budgetLineFor(dao, department, account, funding, when) {
  const period = require("./masterdata.js").periodFor(dao, noon(when));
  if (!period) return null;
  const rows = dao.findRecordsByFilter(
    "budget_lines", "department = {:d} && gl_account = {:a} && funding_source = {:f} && fiscal_year = {:y} && status = 'active'", "project", 10, 0,
    { d: department, a: account, f: funding, y: period.getString("fiscal_year") }
  ) || [];
  return rows.find((l) => !l.getString("project")) || rows[0] || null;
}

function lastNetPay(dao, userId) {
  const slip = (dao.findRecordsByFilter("employees_payrolls", "employee = {:u} && (payroll_status = 'approved' || payroll_status = 'paid')", "-period_year,-period_month", 1, 0, { u: userId }) || [])[0];
  return slip ? r0(slip.getFloat("net_sallary")) : 0;
}

/** Checks and fills what the member of staff entered. */
function fill(dao, auth, r, input) {
  const { c, kind } = categoryOf(dao, String(input.category || input.expenseCategory || ""));
  const amount = r0(input.amount);
  if (!(amount > 0)) throw new BadRequestError("Enter the amount in RWF.");
  if (amount > MAX_AMOUNT) throw new BadRequestError(`At most ${fmt(MAX_AMOUNT)} can be asked for at once.`);
  const cap = c.getInt("max_amount");
  if (cap && amount > cap) throw new BadRequestError(`${c.getString("name")}: at most ${fmt(cap)} per request.`);
  const description = String(input.description || "").trim();
  if (description.length < 10) throw new BadRequestError(kind === "advance" ? "Explain why you need the advance (at least 10 characters)." : "Say what was bought or paid, where and why (at least 10 characters).");
  const today = todayStr();
  const d = day(input.date) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestError("Give the date of the expense.");
  if (d > today) throw new BadRequestError("The date cannot be in the future.");
  if (kind === "claim" && d < addDays(today, -CLAIM_DAYS)) throw new BadRequestError(`Expenses older than ${CLAIM_DAYS} days are not reimbursed (${showDay(d)}).`);
  const payBy = String(input.pay_by || "mobile_money");
  if (METHODS.indexOf(payBy) === -1) throw new BadRequestError("Choose how you want to be paid.");
  const phone = String(input.momoNumber || input.momo_number || "").replace(/\s+/g, "");
  if (payBy === "mobile_money" && !MOMO.test(phone)) throw new BadRequestError("Enter the MTN or Airtel mobile money number to pay (e.g. 078 123 4567).");
  const department = auth.getString("department");
  if (!department) throw new BadRequestError("Your profile has no department. Ask HR to complete it before asking for money.");

  r.set("expenseCategory", c.id);
  r.set("kind", kind);
  r.set("amount", amount);
  r.set("date", noon(d));
  r.set("description", description.slice(0, 1000));
  r.set("pay_by", payBy);
  r.set("momoNumber", payBy === "mobile_money" ? phone : "");
  r.set("momoName", payBy === "mobile_money" ? String(input.momoName || input.momo_name || auth.getString("name")).trim().slice(0, 120) : "");
  r.set("department", department);

  if (kind === "advance") {
    const open = (dao.findRecordsByFilter("prepayments", "employee = {:u} && kind = 'advance' && id != {:id}", "-created", 20, 0, { u: auth.id, id: r.id || "-" }) || [])
      .filter((x) => OUTSTANDING_ADVANCE.indexOf(x.getString("status")) !== -1);
    if (open.length) {
      const o = open[0];
      throw new BadRequestError(`You already have ${o.getString("number")} (${fmt(o.getFloat("amount"))}, ${o.getString("status").replace(/_/g, " ")}); a new advance can be asked for once it is recovered through the payroll.`);
    }
    const net = lastNetPay(dao, auth.id);
    if (net && amount > Math.floor(net / 2)) throw new BadRequestError(`An advance is at most half of your last net pay: ${fmt(Math.floor(net / 2))}.`);
    r.set("gl_account", require("./ledger.js").accountFor(dao, "payroll.advances").id);
    r.set("funding_source", "");
    r.set("budget_line", "");
    return { c, kind, line: null };
  }
  const account = c.getString("gl_account");
  if (!account) throw new BadRequestError(`${c.getString("name")} has no GL account yet; ask Finance to complete the category.`);
  const funding = defaultFunding(dao);
  const line = budgetLineFor(dao, department, account, funding, d);
  if (!line) {
    throw new BadRequestError(`There is no ${nameOf(dao, "gl_accounts", account, "code")} ${nameOf(dao, "gl_accounts", account)} line in the ${nameOf(dao, "departments", department)} budget for this fiscal year. Ask the Budget Officer, or choose another category.`);
  }
  r.set("gl_account", account);
  r.set("funding_source", line.getString("funding_source") || funding);
  r.set("budget_line", line.id);
  return { c, kind, line };
}

/** Sends the request to the head of department (budget checked first for a claim). */
function startApproval(dao, auth, r, line, meta) {
  if (line) {
    const res = require("./budget.js").assertAvailable(dao, { line, amount: r0(r.getFloat("amount")), documentType: "staff_expense", documentId: r.id, documentNumber: r.getString("number"), actor: auth, meta });
    r.set("budget_override", res.override || "");
    dao.saveRecord(r);
  }
  return require("./approvals.js").start(dao, "staff_expense", r, auth, meta);
}

/** POST /api/ims/staff-expenses — a member of staff asks for money for themselves. */
function create(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "create_expense", "ask for expense reimbursements or salary advances");
  const r = new Record(dao.findCollectionByNameOrId("prepayments"));
  const { line } = fill(dao, auth, r, input);
  r.set("number", core.nextNumber(dao, "staff_expense"));
  r.set("employee", auth.id);
  r.set("requested_by", auth.id);
  r.set("created_by", auth.id);
  r.set("status", "draft");
  dao.saveRecord(r);
  core.audit(dao, { actor: auth, action: "created", collection: "prepayments", recordId: r.id, label: r.getString("number"), comment: `${kindLabel(r)} · ${fmt(r.getFloat("amount"))} · ${r.getString("description")}`.slice(0, 300), meta });
  startApproval(dao, auth, r, line, meta);
  return r;
}

/** A returned request is corrected by the person who asked, then sent again. */
function update(dao, auth, id, input, meta) {
  const r = load(dao, "prepayments", id, "Request");
  if (r.getString("employee") !== auth.id) throw new ForbiddenError("Only the person who asked can change the request.");
  if (r.getString("status") !== "returned") throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}; only a returned request is changed.`);
  const before = { amount: r0(r.getFloat("amount")), category: r.getString("expenseCategory"), description: r.getString("description") };
  const { line } = fill(dao, auth, r, input);
  dao.saveRecord(r);
  core.audit(dao, {
    actor: auth, action: "updated", collection: "prepayments", recordId: r.id, label: r.getString("number"), meta,
    changes: { amount: { old: before.amount, new: r0(r.getFloat("amount")) }, expenseCategory: { old: before.category, new: r.getString("expenseCategory") }, description: { old: before.description, new: r.getString("description") } },
  });
  startApproval(dao, auth, r, line, meta);
  return r;
}

/** Withdrawn by the person who asked while it waits; cancelled by the DAF until it is paid. */
function cancel(dao, auth, id, input, meta) {
  const r = load(dao, "prepayments", id, "Request");
  const status = r.getString("status");
  const own = r.getString("employee") === auth.id;
  const finance = core.can(dao, auth, "approve_or_reject_expense") && core.can(dao, auth, "view_expenses");
  if (OPEN.indexOf(status) === -1 && status !== "approved") throw new BadRequestError(`${r.getString("number")} is ${status.replace(/_/g, " ")}; it can no longer be cancelled.`);
  if (status === "approved" ? !finance : !own && !finance) throw new ForbiddenError(status === "approved" ? "An approved request is cancelled by the Director of Finance." : "Only the person who asked, or the Director of Finance, can cancel this request.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason (at least 5 characters).");
  const actual = r0(r.getInt("actual_amount"));
  if (actual && r.getString("budget_line")) {
    const budget = require("./budget.js");
    const line = load(dao, "budget_lines", r.getString("budget_line"), "Budget line");
    budget.post(dao, { line, type: "actual_reversal", amount: actual, source: { type: "staff_expense", id: r.id, number: r.getString("number") }, description: `Cancelled ${r.getString("number")}`, actor: auth });
    r.set("actual_amount", 0);
  }
  require("./approvals.js").cancel(dao, "staff_expense", r, auth, reason.slice(0, 500), meta);
  if (!own) core.notify(dao, [r.getString("employee")], { title: `${r.getString("number")} cancelled`, body: reason, link: `/dashboard/my/expenses/${r.id}`, type: "warning" });
  return r;
}

/** Final approval: a claim becomes an actual on its budget line; the Cashiers are told it can be paid. */
function onApproved(dao, r, actor, meta) {
  const number = r.getString("number");
  const amount = r0(r.getFloat("amount"));
  if (r.getString("kind") !== "advance" && r.getString("budget_line")) {
    const budget = require("./budget.js");
    const line = load(dao, "budget_lines", r.getString("budget_line"), "Budget line");
    const res = budget.assertAvailable(dao, { line, amount, documentType: "staff_expense", documentId: r.id, documentNumber: number, actor, meta });
    budget.post(dao, { line, type: "actual", amount, source: { type: "staff_expense", id: r.id, number }, description: r.getString("description"), actor, override: res.override || "" });
    r.set("actual_amount", amount);
    dao.saveRecord(r);
  }
  const who = nameOf(dao, "users", r.getString("employee"));
  const cashiers = (dao.findRecordsByFilter("users", 'status = "Active"', "", 2000, 0) || []).filter((u) => core.can(dao, u, "record_payments") && u.id !== r.getString("employee"));
  core.notify(dao, cashiers.map((u) => u.id), {
    title: `Ready to pay: ${number}`, body: `${who} · ${kindLabel(r)} · ${fmt(amount)}${r.getString("pay_by") === "mobile_money" ? ` · mobile money ${r.getString("momoNumber")}` : ""}`,
    link: `/dashboard/finance/staff-expenses/${r.id}`, type: "approval",
  });
}

/** The Cashier pays an approved request from a cash book; the cash book and the ledger are written together. */
function pay(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "record_payments", "pay staff expenses");
  const r = load(dao, "prepayments", id, "Request");
  const number = r.getString("number");
  if (r.getString("status") !== "approved") throw new BadRequestError(`${number} is ${r.getString("status").replace(/_/g, " ")}; only an approved request is paid.`);
  if (r.getString("employee") === auth.id) throw new ForbiddenError("Segregation of duties: you cannot pay your own request.");
  const method = String(input.method || r.getString("pay_by") || "cash");
  if (METHODS.indexOf(method) === -1) throw new BadRequestError("Choose how it is paid: cash, mobile money or bank transfer.");
  const reference = String(input.reference || "").trim().slice(0, 120);
  if (method !== "cash" && reference.length < 3) throw new BadRequestError(method === "mobile_money" ? "Enter the mobile money transaction ID." : "Enter the bank transfer reference.");
  const treasury = require("./treasury.js");
  const account = treasury.paymentAccount(dao, String(input.account || ""), method, r);
  const d = day(input.date) || todayStr();
  treasury.assertDateOpen(dao, account, d, `the payment of ${number}`);
  const amount = r0(r.getFloat("amount"));
  treasury.assertFunds(dao, account, amount, d, `the payment of ${number}`);
  const who = nameOf(dao, "users", r.getString("employee"));
  const entry = treasury.postEntry(dao, {
    account, date: d, direction: "out", amount, type: "payment", method, reference: reference || number, counterparty: who,
    description: `${number} — ${kindLabel(r)}: ${r.getString("description")}`, source: { type: "staff_expense", id: r.id, number },
    // no budget line on the entry (that marks charges recorded from a statement): the claim's actual was booked on approval
    gl_account: r.getString("gl_account"), funding_source: r.getString("funding_source"), actor: auth,
  });
  r.set("payment_method", method);
  r.set("payment_reference", reference);
  r.set("paid_from", account.id);
  r.set("paid_at", noon(d));
  r.set("paid_by", auth.id);
  r.set("entry", entry.id);
  require("./glpost.js").staffExpense(dao, r, account, entry, auth, meta);
  r.set("status", "paid");
  dao.saveRecord(r);
  core.audit(dao, {
    actor: auth, action: "paid", collection: "prepayments", recordId: r.id, label: number, meta,
    comment: `${fmt(amount)} from ${account.getString("code")} by ${method.replace(/_/g, " ")}${reference ? ` (${reference})` : ""}`,
    changes: { status: { old: "approved", new: "paid" } },
  });
  core.notify(dao, [r.getString("employee")], {
    title: `${number} paid`, body: `${fmt(amount)} ${method === "cash" ? "in cash — collect it from the Cashier" : method === "mobile_money" ? `by mobile money to ${r.getString("momoNumber")}` : "by bank transfer"}${r.getString("kind") === "advance" ? ". It will be deducted from your next payslip." : "."}`,
    link: `/dashboard/my/expenses/${r.id}`, type: "success",
  });
  return r;
}

/** Expense categories (Finance): a claim category is charged to an active expense account; an advance category
 * posts to staff advances. New categories are active unless said otherwise. */
function checkCategory(e, isNew) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return; // superuser: demo seeds and data repairs
  core.requirePermission($app.dao(), auth, "manage_chart_of_accounts", "set up expense categories");
  const r = e.record;
  if (isNew) {
    const data = $apis.requestInfo(e.httpContext).data || {};
    if (data.active === undefined) r.set("active", true);
  }
  const kind = r.getString("kind") || (/advance/i.test(r.getString("name")) ? "advance" : "claim");
  r.set("kind", kind);
  if (kind === "claim") {
    const a = find($app.dao(), "gl_accounts", r.getString("gl_account"));
    if (!a) throw new BadRequestError("Choose the expense account the category is charged to.");
    if (a.getString("type") !== "expense" || !a.getBool("is_posting") || !a.getBool("active")) {
      throw new BadRequestError(`${a.getString("code")} ${a.getString("name")} is not an active expense posting account.`);
    }
  } else {
    r.set("gl_account", "");
  }
  if (r.getInt("max_amount") < 0) throw new BadRequestError("The ceiling cannot be negative.");
}

module.exports = { create, update, cancel, onApproved, pay, budgetLineFor, defaultFunding, checkCategory };
