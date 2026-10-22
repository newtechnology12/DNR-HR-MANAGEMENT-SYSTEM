/// <reference path="../../pb_data/types.d.ts" />
/**
 * Payroll engine (Rwanda). All rates come from paye_bands / statutory_contributions / settings and are
 * frozen on the payroll (config_snapshot) when it is computed, so an approved payroll never changes.
 *
 * Per employee (whole RWF):
 *   gross            = basic + transport + housing + communication + other allowances (prorated for joiners)
 *   pension base     = gross − transport − non-pensionable allowances      ("gross_excl_transport")
 *   taxable income   = gross − non-taxable allowances (− employee pension if settings.payroll_pension_deductible)
 *   PAYE             = progressive bands for the employee's type (regular / casual)
 *   contributions    = rate × base for each active statutory contribution (employee and employer part);
 *                      CBHI-type contributions use the net before CBHI (gross − PAYE − other employee contributions)
 *   net              = gross − PAYE − employee contributions − recurring deductions − salary advances − loan instalments
 *   employer cost    = gross + employer contributions
 *
 * Each payslip keeps the employee's department, grade and funding split (donor-funded staff are charged to
 * their funding source and project). When the payroll is approved it is posted to the general ledger and to
 * the budget lines (by account, department, funding source and project); when the Cashier records the payment
 * the money leaves a bank account (cash book) and the net salaries payable are cleared in the GL.
 */
const core = require("./core.js");
/** 1234567 → "1,234,567" (the JS engine has no locale formatting). */
const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const r0 = (n) => Math.round(Number(n) || 0);
const pad = (n) => String(n).padStart(2, "0");

/** Rates in force on `at` (default today): PAYE bands and statutory contributions are dated tables. */
function config(dao, at) {
  const d = (at ? new Date(at) : new Date()).toISOString().replace("T", " ");
  const dated = "active = true && (effective_from = '' || effective_from <= {:d}) && (effective_to = '' || effective_to >= {:d})";
  const bands = { regular: [], casual: [] };
  let unconfirmed = 0;
  for (const b of dao.findRecordsByFilter("paye_bands", dated, "min_amount", 100, 0, { d }) || []) {
    if (!b.getBool("confirmed_by_finance")) unconfirmed++;
    (bands[b.getString("employment_type") || "regular"] = bands[b.getString("employment_type") || "regular"] || []).push({ min: b.getFloat("min_amount"), max: b.getFloat("max_amount"), rate: b.getFloat("rate") });
  }
  const contributions = (dao.findRecordsByFilter("statutory_contributions", dated, "sort", 100, 0, { d }) || []).map((c) => {
    if (!c.getBool("confirmed_by_finance")) unconfirmed++;
    return {
      code: c.getString("code"), name: c.getString("name"), ee: c.getFloat("employee_rate"), er: c.getFloat("employer_rate"),
      base: c.getString("base") || "gross", cap: c.getFloat("cap_amount"), remit_to: c.getString("remit_to"),
    };
  });
  let pensionDeductible = false;
  try {
    const s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
    if (s) pensionDeductible = s.getBool("payroll_pension_deductible");
  } catch (_) {}
  if (!bands.regular.length) throw new BadRequestError("No PAYE tax bands are in force on this date. Set them in Settings → Payroll & taxes.");
  return { bands, contributions, pensionDeductible, unconfirmed, at: d.slice(0, 10) };
}

/** Progressive PAYE with the calculation per band (shown on the payslip). */
function paye(taxable, bands) {
  let tax = 0;
  const lines = [];
  for (const b of bands) {
    const lower = b.min > 0 ? b.min - 1 : 0;
    const upper = b.max > 0 ? b.max : Infinity;
    const portion = Math.max(0, Math.min(taxable, upper) - lower);
    if (portion <= 0) continue;
    const t = (portion * b.rate) / 100;
    tax += t;
    lines.push({ from: lower, to: b.max > 0 ? b.max : null, rate: b.rate, amount: r0(portion), tax: r0(t) });
  }
  return { tax: r0(tax), lines };
}

function computeSlip(cfg, s, extra) {
  const f = extra.factor;
  const basic = r0(s.basic * f);
  const transport = r0(s.transport * f);
  const housing = r0(s.housing * f);
  const communication = r0(s.communication * f);
  const others = (s.others || []).map((a) => ({ name: a.name, amount: r0((Number(a.amount) || 0) * f), taxable: a.taxable !== false, pensionable: a.pensionable !== false }));
  const othersTotal = others.reduce((a, x) => a + x.amount, 0);
  const gross = basic + transport + housing + communication + othersTotal;
  const nonPensionable = others.filter((x) => !x.pensionable).reduce((a, x) => a + x.amount, 0);
  const nonTaxable = others.filter((x) => !x.taxable).reduce((a, x) => a + x.amount, 0);
  const bases = { gross, gross_excl_transport: gross - transport - nonPensionable, basic };

  const lines = [];
  const base = (c) => {
    const b = bases[c.base] !== undefined ? bases[c.base] : gross;
    return c.cap > 0 ? Math.min(b, c.cap) : b;
  };
  for (const c of cfg.contributions.filter((c) => c.base !== "net_before_cbhi")) {
    const b = base(c);
    lines.push({ code: c.code, name: c.name, base: b, ee_rate: c.ee, er_rate: c.er, ee: r0((b * c.ee) / 100), er: r0((b * c.er) / 100), remit_to: c.remit_to });
  }
  const pensionEe = lines.filter((l) => l.code === "PENSION").reduce((a, l) => a + l.ee, 0);
  const taxable = Math.max(0, gross - nonTaxable - (cfg.pensionDeductible ? pensionEe : 0));
  const tax = paye(taxable, cfg.bands[s.employment_type === "casual" ? "casual" : "regular"] || cfg.bands.regular);
  const eeSoFar = lines.reduce((a, l) => a + l.ee, 0);
  const netBeforeCbhi = gross - tax.tax - eeSoFar;
  for (const c of cfg.contributions.filter((c) => c.base === "net_before_cbhi")) {
    const b = Math.max(0, c.cap > 0 ? Math.min(netBeforeCbhi, c.cap) : netBeforeCbhi);
    lines.push({ code: c.code, name: c.name, base: b, ee_rate: c.ee, er_rate: c.er, ee: r0((b * c.ee) / 100), er: r0((b * c.er) / 100), remit_to: c.remit_to });
  }
  const pick = (code, k) => lines.filter((l) => l.code === code).reduce((a, l) => a + l[k], 0);
  const eeTotal = lines.reduce((a, l) => a + l.ee, 0);
  const erTotal = lines.reduce((a, l) => a + l.er, 0);
  const recurring = (s.deductions || []).map((d) => ({ name: d.name, amount: r0(d.amount) })).filter((d) => d.amount > 0);
  const recurringTotal = recurring.reduce((a, d) => a + d.amount, 0);
  const advances = r0(extra.advances);
  const loans = r0(extra.loans);
  const totalDeductions = tax.tax + eeTotal + recurringTotal + advances + loans;
  return {
    basic, transport, housing, communication, allowances: others, other_allowances_total: othersTotal, gross,
    pension_base: bases.gross_excl_transport, taxable_income: taxable, paye: tax.tax, paye_breakdown: tax.lines,
    pension_ee: pick("PENSION", "ee"), pension_er: pick("PENSION", "er"), maternity_ee: pick("MATERNITY", "ee"), maternity_er: pick("MATERNITY", "er"),
    occ_hazard_er: pick("OCC_HAZARD", "er"), cbhi: pick("CBHI", "ee"), medical_ee: pick("MEDICAL", "ee"), medical_er: pick("MEDICAL", "er"),
    contributions: lines, other_deductions: recurring, advances, loans, total_deductions: totalDeductions,
    net: gross - totalDeductions, employer_cost: gross + erTotal,
  };
}

function structureOf(dao, user) {
  let st = null;
  try {
    st = dao.findFirstRecordByFilter("salary_structures", "employee = {:e}", { e: user.id });
  } catch (_) {}
  if (st && !st.getBool("active")) return null;
  if (st) {
    return {
      record: st, basic: st.getFloat("basic_salary"), transport: st.getFloat("transport_allowance"), housing: st.getFloat("housing_allowance"),
      communication: st.getFloat("communication_allowance"), others: core.parseJson(st, "other_allowances", []), deductions: core.parseJson(st, "recurring_deductions", []),
      employment_type: st.getString("employment_type") || user.getString("employment_type") || "permanent",
      bank_name: st.getString("bank_name") || user.getString("bank_name"), bank_account: st.getString("bank_account") || user.getString("bank_account_number"),
      rssb_number: st.getString("rssb_number"), tin: st.getString("tin"), payment_method: st.getString("payment_method") || "bank",
      grade: st.getString("grade"), funding_split: core.parseJson(st, "funding_split", []) || [],
    };
  }
  const salary = Number(String(user.getString("salary")).replace(/[^0-9.]/g, "")) || 0;
  if (!salary) return null;
  // No structure yet: the whole salary is treated as basic.
  return { record: null, basic: salary, transport: 0, housing: 0, communication: 0, others: [], deductions: [], employment_type: user.getString("employment_type") || "permanent", bank_name: user.getString("bank_name"), bank_account: user.getString("bank_account_number"), rssb_number: "", tin: "", payment_method: "bank", grade: "", funding_split: [] };
}

// ------------------------------------------------------------------ actions
function load(dao, id) {
  try {
    return dao.findRecordById("payrolls", id);
  } catch (_) {
    throw new NotFoundError("Payroll not found.");
  }
}

function create(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "create_payroll", "prepare payrolls");
  const year = parseInt(input.year, 10);
  const month = parseInt(input.month, 10);
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) throw new BadRequestError("Choose the payroll month and year.");
  const branch = String(input.branch || "");
  const existing = dao.findRecordsByFilter("payrolls", "year = {:y} && month = {:m} && status != 'cancelled' && status != 'rejected'", "", 50, 0, { y: year, m: month }) || [];
  if (existing.some((p) => p.getString("branch") === branch || !p.getString("branch") || !branch)) {
    throw new BadRequestError(`A payroll for ${MONTHS[month - 1]} ${year}${branch ? " for this office" : ""} already exists (${existing[0].getString("number") || existing[0].id}). Open it instead of creating a duplicate.`);
  }
  let code = "";
  if (branch) {
    try {
      code = "-" + dao.findRecordById("branches", branch).getString("name").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    } catch (_) {
      throw new BadRequestError("Office not found.");
    }
  }
  const p = new Record(dao.findCollectionByNameOrId("payrolls"));
  p.set("number", `PRL-${year}-${pad(month)}${code}`);
  p.set("period_label", `${MONTHS[month - 1]} ${year}`);
  p.set("year", year);
  p.set("month", month);
  p.set("date", 25);
  p.set("period_cycle", "monthly");
  p.set("branch", branch);
  p.set("notes", String(input.notes || ""));
  p.set("status", "draft");
  p.set("prepared_by", auth.id);
  p.set("created_by", auth.id);
  dao.saveRecord(p);
  core.audit(dao, { actor: auth, action: "created", collection: "payrolls", recordId: p.id, label: p.getString("number"), meta });
  return p;
}

/** Every employee's payslip for a month (nothing is saved): used by the preview and by compute(). */
function calculate(dao, year, month, branch) {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const daysInMonth = monthEnd.getUTCDate();
  const cfg = config(dao, monthEnd.toISOString());
  let filter = 'status = "Active"';
  const params = {};
  if (branch) {
    filter += " && branch = {:b}";
    params.b = branch;
  }
  const users = dao.findRecordsByFilter("users", filter, "name", 5000, 0, params) || [];
  const depts = {};
  for (const d of dao.findRecordsByFilter("departments", "id != ''", "", 500, 0) || []) depts[d.id] = d.getString("name");
  const desigs = {};
  for (const d of dao.findRecordsByFilter("designations", "id != ''", "", 1000, 0) || []) desigs[d.id] = d.getString("name");
  // Salary advances paid out to staff (staff expenses) by the month end and not yet recovered. An advance already on
  // the payslip of another month's payroll (not cancelled or rejected) stays there: it is never deducted twice.
  const advances = {};
  const lastDay = monthEnd.toISOString().slice(0, 10);
  for (const x of dao.findRecordsByFilter("prepayments", "kind = 'advance' && status = 'paid' && recovered_in = ''", "paid_at", 10000, 0) || []) {
    const d = x.getString("paid_at");
    if (!d || d.slice(0, 10) > lastDay) continue;
    const held = dao.findRecordsByFilter("employees_payrolls", "prepayments ~ {:x} && (period_year != {:y} || period_month != {:m}) && payroll_status != 'cancelled' && payroll_status != 'rejected'", "", 1, 0, { x: x.id, y: year, m: month }) || [];
    if (held.length) continue;
    (advances[x.getString("employee")] = advances[x.getString("employee")] || []).push(x);
  }

  // Staff loans being repaid: the instalment (or what is left) from their first month.
  const loans = {};
  const ym = year * 12 + month;
  for (const l of dao.findRecordsByFilter("staff_loans", "status = 'active' && balance > 0", "", 0, 0) || []) {
    if (l.getInt("start_year") * 12 + l.getInt("start_month") > ym) continue;
    (loans[l.getString("employee")] = loans[l.getString("employee")] || []).push({ loan: l.id, number: l.getString("number"), amount: Math.min(l.getInt("installment"), l.getInt("balance")), balance: l.getInt("balance") });
  }

  const T = { gross: 0, paye: 0, pension_ee: 0, pension_er: 0, maternity_ee: 0, maternity_er: 0, occ_hazard_er: 0, cbhi: 0, medical_ee: 0, medical_er: 0, other_deductions: 0, advances: 0, loans: 0, net: 0, employer_cost: 0, basic: 0, allowances: 0, headcount: 0 };
  const skipped = [];
  const rows = [];
  for (const u of users) {
    const s = structureOf(dao, u);
    if (!s) {
      skipped.push({ id: u.id, name: u.getString("name"), reason: "No salary defined" });
      continue;
    }
    const joined = u.getString("joined_at") ? new Date(`${u.getString("joined_at").slice(0, 10)}T00:00:00Z`) : null;
    if (joined && joined > monthEnd) {
      skipped.push({ id: u.id, name: u.getString("name"), reason: "Joins after this period" });
      continue;
    }
    const factor = joined && joined > monthStart ? (daysInMonth - joined.getUTCDate() + 1) / daysInMonth : 1;
    const adv = advances[u.id] || [];
    const ln = loans[u.id] || [];
    const c = computeSlip(cfg, s, { factor, advances: adv.reduce((a, x) => a + x.getFloat("amount"), 0), loans: ln.reduce((a, x) => a + x.amount, 0) });
    rows.push({ u, s, c, adv, loans: ln, factor, working_days: Math.round(factor * daysInMonth), department: depts[u.getString("department")] || "", designation: desigs[u.getString("designation")] || "" });
    for (const k of ["gross", "paye", "pension_ee", "pension_er", "maternity_ee", "maternity_er", "occ_hazard_er", "cbhi", "medical_ee", "medical_er", "advances", "loans", "net", "employer_cost", "basic"]) T[k] += c[k];
    T.other_deductions += c.other_deductions.reduce((a, d) => a + d.amount, 0);
    T.allowances += c.gross - c.basic;
    T.headcount++;
  }
  T.rra = T.paye;
  T.rssb = T.pension_ee + T.pension_er + T.maternity_ee + T.maternity_er + T.occ_hazard_er + T.cbhi + T.medical_ee + T.medical_er;
  T.skipped = skipped;
  return { cfg, rows, T, skipped };
}

function compute(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "create_payroll", "compute payrolls");
  const p = load(dao, id);
  if (["draft", "computed", "returned"].indexOf(p.getString("status")) === -1) throw new BadRequestError(`${p.getString("number")} is ${p.getString("status").replace(/_/g, " ")} and can no longer be recalculated.`);
  const { cfg, rows, T } = calculate(dao, p.getInt("year"), p.getInt("month"), p.getString("branch"));

  for (const old of dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 5000, 0, { p: p.id }) || []) dao.deleteRecord(old);
  const col = dao.findCollectionByNameOrId("employees_payrolls");
  const fallback = [{ funding_source: defaultFunding(dao), project: "", percent: 100 }];
  for (const x of rows) {
    const { u, s, c, adv } = x;
    const r = new Record(col);
    r.load({
      employee: u.id, payroll: p.id, employee_name: u.getString("name"), department_name: x.department, designation_name: x.designation,
      period_label: p.getString("period_label"), period_year: p.getInt("year"), period_month: p.getInt("month"), payroll_number: p.getString("number"), payroll_status: "computed",
      employment_type: s.employment_type, bank_name: s.bank_name || "", bank_account: s.bank_account || "", rssb_number: s.rssb_number || "", tin: s.tin || "", payment_method: s.payment_method,
      working_days: x.working_days,
      ...c,
      gross_salary: c.gross, net_sallary: c.net, deductions_amount: c.total_deductions,
      deductions: c.contributions.filter((l) => l.ee > 0).map((l) => ({ name: l.name, amount: l.ee })).concat([{ name: "PAYE", amount: c.paye }]),
      prepayments: adv.map((a) => a.id),
      department: u.getString("department"), grade: s.grade || "", funding_split: s.funding_split && s.funding_split.length ? s.funding_split : fallback,
      loan_deductions: x.loans.map((l) => ({ loan: l.loan, number: l.number, amount: l.amount })),
    });
    dao.saveRecord(r);
  }

  p.set("totals", T);
  p.set("total_gross", T.gross);
  p.set("total_net", T.net);
  p.set("total_employer_cost", T.employer_cost);
  p.set("headcount", T.headcount);
  p.set("prepayments_covered", T.advances);
  p.set("config_snapshot", { bands: cfg.bands, contributions: cfg.contributions, pension_deductible: cfg.pensionDeductible, rates_on: cfg.at, unconfirmed_rates: cfg.unconfirmed, computed_by: auth.getString("name") });
  p.set("computed_at", new Date().toISOString());
  p.set("status", "computed");
  p.set("prepared_by", auth.id);
  dao.saveRecord(p);
  core.audit(dao, { actor: auth, action: "payroll_computed", collection: "payrolls", recordId: p.id, label: p.getString("number"), meta, changes: { total_gross: { old: null, new: T.gross }, total_net: { old: null, new: T.net }, headcount: { old: null, new: T.headcount } } });
  return p;
}

function submit(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "create_payroll", "submit payrolls");
  const p = load(dao, id);
  if (["computed", "returned"].indexOf(p.getString("status")) === -1) throw new BadRequestError(p.getString("status") === "draft" ? "Calculate the payroll before submitting it." : `${p.getString("number")} is ${p.getString("status").replace(/_/g, " ")}.`);
  if (!p.getInt("headcount")) throw new BadRequestError("The payroll has no payslips.");
  p.set("prepared_by", auth.id);
  dao.saveRecord(p);
  return require("./approvals.js").start(dao, "payroll", p, auth, meta);
}

function markPaid(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "mark_payroll_paid", "record payroll payment");
  const p = load(dao, id);
  if (p.getString("status") !== "approved") throw new BadRequestError("Only an approved payroll can be marked as paid.");
  if (p.getString("prepared_by") === auth.id) throw new ForbiddenError("Separation of duties: the person who prepared the payroll cannot record its payment.");
  const treasury = require("./treasury.js");
  const ledger = require("./ledger.js");
  const number = p.getString("number");
  const payDay = String(input.payment_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDay)) throw new BadRequestError("Give the date of the payment.");
  // the money leaves an unrestricted bank account: enough in it, on an open date
  const account = treasury.paymentAccount(dao, String(input.account || ""), "bank_transfer", p);
  treasury.assertDateOpen(dao, account, payDay, `the payment of ${number}`);
  const net = p.getInt("total_net");
  treasury.assertFunds(dao, account, net, payDay, number);
  const reference = String(input.reference || "").trim().slice(0, 120);
  const netAccount = ledger.accountFor(dao, "payroll.net_payable");
  const entry = treasury.postEntry(dao, {
    account, date: payDay, direction: "out", amount: net, type: "payment", method: "bank_transfer", reference,
    counterparty: `${p.getInt("headcount")} employees`, description: `Salaries ${p.getString("period_label")}`,
    source: { type: "payroll", id: p.id, number }, gl_account: netAccount.id, actor: auth,
  });
  const journal = ledger.post(dao, {
    date: payDay, source: { type: "payroll_payment", id: p.id, number }, description: `Payment of the ${p.getString("period_label")} salaries`, actor: auth, meta,
    what: `the payment of ${number}`,
    lines: [
      { account: netAccount.id, debit: net, description: `Net salaries ${p.getString("period_label")}` },
      { account: account.getString("gl_account"), credit: net, funding_source: account.getString("funding_source"), description: `${account.getString("code")} · ${reference || "salary transfer"}` },
    ],
  });
  p.set("status", "paid");
  p.set("paid_at", `${payDay} 12:00:00.000Z`);
  p.set("paid_by", auth.id);
  p.set("payment_reference", reference);
  p.set("payment_account", account.id);
  p.set("payment_date", `${payDay} 12:00:00.000Z`);
  p.set("cash_entry", entry.id);
  p.set("payment_journal", journal.id);
  entry.set("journal", journal.id);
  dao.saveRecord(entry);
  dao.saveRecord(p);
  const slips = dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 5000, 0, { p: p.id }) || [];
  let repaid = 0;
  for (const sl of slips) {
    // loan instalments recovered through this payroll
    for (const d of core.parseJson(sl, "loan_deductions", []) || []) {
      let loan;
      try {
        loan = dao.findRecordById("staff_loans", d.loan);
      } catch (_) {
        continue;
      }
      const amount = Math.min(r0(d.amount), loan.getInt("balance"));
      if (amount <= 0) continue;
      const history = core.parseJson(loan, "repayments", []) || [];
      history.push({ payroll: p.id, number, period: p.getString("period_label"), amount, date: payDay });
      loan.set("repayments", history);
      loan.set("balance", loan.getInt("balance") - amount);
      loan.set("repaid", loan.getInt("repaid") + amount);
      if (loan.getInt("balance") <= 0) loan.set("status", "repaid");
      dao.saveRecord(loan);
      repaid += amount;
    }
  }
  core.notify(dao, slips.map((x) => x.getString("employee")), { title: `Your payslip for ${p.getString("period_label")} is available`, body: "Salary paid.", link: "/dashboard/my/payslips", type: "success" });
  core.audit(dao, { actor: auth, action: "payroll_paid", collection: "payrolls", recordId: p.id, label: number, comment: `${account.getString("code")} · ${reference}${repaid ? ` · loans recovered ${repaid}` : ""}`, meta, changes: { status: { old: "approved", new: "paid" } } });
  return p;
}

function cancel(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "create_payroll", "cancel payrolls");
  const p = load(dao, id);
  const status = p.getString("status");
  if (["paid", "cancelled", "approved"].indexOf(status) !== -1) throw new BadRequestError(`${p.getString("number")} is ${status} and cannot be cancelled.`);
  const reason = String(input.reason || "").trim();
  if (!reason) throw new BadRequestError("Give a reason for cancelling the payroll.");
  if (status === "pending_approval") {
    require("./approvals.js").cancel(dao, "payroll", p, auth, reason, meta);
    return load(dao, id);
  }
  p.set("status", "cancelled");
  p.set("cancel_reason", reason);
  dao.saveRecord(p);
  core.audit(dao, { actor: auth, action: "cancelled", collection: "payrolls", recordId: p.id, label: p.getString("number"), comment: reason, meta });
  return p;
}

/** Whole payroll for a month, before it is created: every payslip line, totals and the rates used. */
function previewRun(dao, auth, input) {
  core.requirePermission(dao, auth, "create_payroll", "preview payrolls");
  const year = parseInt(input.year, 10);
  const month = parseInt(input.month, 10);
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) throw new BadRequestError("Choose the payroll month and year.");
  const branch = String(input.branch || "");
  const { cfg, rows, T, skipped } = calculate(dao, year, month, branch);
  const existing = (dao.findRecordsByFilter("payrolls", "year = {:y} && month = {:m} && status != 'cancelled' && status != 'rejected'", "", 50, 0, { y: year, m: month }) || [])
    .filter((p) => p.getString("branch") === branch || !p.getString("branch") || !branch)
    .map((p) => p.getString("number"));
  return {
    period: `${MONTHS[month - 1]} ${year}`, rates_on: cfg.at, existing,
    rates: { bands: cfg.bands, contributions: cfg.contributions, pension_deductible: cfg.pensionDeductible, unconfirmed: cfg.unconfirmed },
    totals: T, skipped,
    rows: rows.map(({ u, s, c, working_days, department, designation }) => ({
      employee: u.id, name: u.getString("name"), department, designation, employment_type: s.employment_type, working_days, has_structure: Boolean(s.record),
      basic: c.basic, allowances: c.gross - c.basic, gross: c.gross, taxable: c.taxable_income, paye: c.paye, pension_ee: c.pension_ee, maternity_ee: c.maternity_ee,
      cbhi: c.cbhi, medical_ee: c.medical_ee, other_deductions: c.other_deductions.reduce((a, d) => a + d.amount, 0), advances: c.advances, loans: c.loans,
      total_deductions: c.total_deductions, net: c.net, pension_er: c.pension_er, maternity_er: c.maternity_er, occ_hazard_er: c.occ_hazard_er,
      medical_er: c.medical_er, employer_cost: c.employer_cost, payment_method: s.payment_method, paye_breakdown: c.paye_breakdown,
    })),
  };
}

/** What-if calculation for one salary (used by the salary structure form). */
function preview(dao, input) {
  const cfg = config(dao);
  return computeSlip(cfg, {
    basic: Number(input.basic_salary) || 0, transport: Number(input.transport_allowance) || 0, housing: Number(input.housing_allowance) || 0,
    communication: Number(input.communication_allowance) || 0, others: input.other_allowances || [], deductions: input.recurring_deductions || [],
    employment_type: input.employment_type || "permanent",
  }, { factor: 1, advances: 0 });
}

/**
 * Staff read their payslips but not the payroll run, so each payslip keeps a copy of the run's status and
 * payment date; called after every save of a run.
 */
function syncSlips(dao, p) {
  const status = p.getString("status");
  const paid = p.getString("paid_at");
  const slips = dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 0, 0, { p: p.id }) || [];
  for (const slip of slips) {
    if (slip.getString("payroll_status") === status && slip.getString("paid_at") === paid) continue;
    slip.set("payroll_status", status);
    slip.set("paid_at", paid);
    dao.saveRecord(slip);
  }
}

// ------------------------------------------------------------------ funding
/** Member contributions (or the first unrestricted source): where staff without a split are charged. */
function defaultFunding(dao) {
  const f = (dao.findRecordsByFilter("funding_sources", "active = true && type = 'member_contributions'", "code", 1, 0) || [])[0]
    || (dao.findRecordsByFilter("funding_sources", "active = true && restricted = false", "code", 1, 0) || [])[0];
  return f ? f.id : "";
}

/** A salary's funding split: sources (and projects) with percentages adding up to 100. Empty = default source. */
function normalizeSplit(dao, raw) {
  const rows = (Array.isArray(raw) ? raw : [])
    .map((x) => ({ funding_source: String((x && x.funding_source) || ""), project: String((x && x.project) || ""), percent: Math.round((Number(x && x.percent) || 0) * 100) / 100 }))
    .filter((x) => x.funding_source || x.percent);
  if (!rows.length) return [];
  const seen = {};
  for (const r of rows) {
    if (!r.funding_source) throw new BadRequestError("Choose the funding source of each part of the salary.");
    if (!(r.percent > 0)) throw new BadRequestError("Each part of the funding split needs a percentage above 0.");
    let fs;
    try {
      fs = dao.findRecordById("funding_sources", r.funding_source);
    } catch (_) {
      throw new BadRequestError("Funding source not found.");
    }
    if (!fs.getBool("active")) throw new BadRequestError(`${fs.getString("name")} is not active.`);
    if (r.project) {
      let pr;
      try {
        pr = dao.findRecordById("projects", r.project);
      } catch (_) {
        throw new BadRequestError("Project not found.");
      }
      if (pr.getString("funding_source") && pr.getString("funding_source") !== fs.id) throw new BadRequestError(`${pr.getString("name")} is funded by another source than ${fs.getString("name")}.`);
    }
    const k = `${r.funding_source}|${r.project}`;
    if (seen[k]) throw new BadRequestError("The same funding source and project appear twice in the split.");
    seen[k] = true;
  }
  const total = Math.round(rows.reduce((t, r) => t + r.percent, 0) * 100) / 100;
  if (total !== 100) throw new BadRequestError(`The funding split adds up to ${total}%; it must add up to 100%.`);
  return rows;
}

/** Salary structure hook: validated funding split. */
function beforeSaveStructure(e) {
  const r = e.record;
  r.set("funding_split", normalizeSplit($app.dao(), core.parseJson(r, "funding_split", [])));
  r.set("grade", String(r.getString("grade") || "").trim().slice(0, 30));
}

// ------------------------------------------------------------------ posting
/** The budget line a payroll cost is charged to: same account, department, funding source and project (closest match). */
function budgetLineFor(dao, fyId, account, dept, fund, project) {
  const lines = dao.findRecordsByFilter("budget_lines", "fiscal_year = {:fy} && gl_account = {:a} && status = 'active'", "", 0, 0, { fy: fyId, a: account }) || [];
  const find = (d, f, pr) => lines.find((l) => l.getString("department") === d && l.getString("funding_source") === f && l.getString("project") === pr);
  return find(dept, fund, project) || find(dept, fund, "") || find("", fund, project) || find("", fund, "") || null;
}

/**
 * The approved payroll in the GL and the budget: salary costs by account, department, funding source and
 * project (debit), what is owed to staff, RRA and RSSB (credit), advances and loans recovered (credit).
 */
function onApproved(dao, p, actor, meta) {
  const slips = dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 0, 0, { p: p.id }) || [];
  if (!slips.length) return;
  const ledger = require("./ledger.js");
  const budget = require("./budget.js");
  const masterdata = require("./masterdata.js");
  const year = p.getInt("year");
  const month = p.getInt("month");
  const date = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const period = masterdata.requireOpenPeriod(dao, `${date} 12:00:00.000Z`, `the ${p.getString("period_label")} payroll`);
  const fyId = period.getString("fiscal_year");
  const acc = (k) => ledger.accountFor(dao, k).id;
  const A = {
    basic: acc("payroll.basic"), allowances: acc("payroll.allowances"), er_pension: acc("payroll.employer_pension"), er_maternity: acc("payroll.employer_maternity"),
    er_occ: acc("payroll.employer_occ_hazard"), er_medical: acc("payroll.employer_medical"), net: acc("payroll.net_payable"), paye: acc("payroll.paye_payable"),
    pension: acc("payroll.pension_payable"), maternity: acc("payroll.maternity_payable"), cbhi: acc("payroll.cbhi_payable"), occ: acc("payroll.occ_hazard_payable"),
    medical: acc("payroll.medical_payable"), advances: acc("payroll.advances"), loans: acc("payroll.loans"), other: acc("payroll.other_deductions"),
  };
  const fallback = defaultFunding(dao);
  const costs = {}; // account|dept|fund|project → amount
  const sum = { net: 0, paye: 0, pension: 0, maternity: 0, cbhi: 0, occ: 0, medical: 0, advances: 0, loans: 0, other: 0 };
  for (const sl of slips) {
    let split = core.parseJson(sl, "funding_split", []) || [];
    if (!split.length) split = [{ funding_source: fallback, project: "", percent: 100 }];
    const dept = sl.getString("department");
    const parts = [
      [A.basic, r0(sl.getFloat("basic"))], [A.allowances, r0(sl.getFloat("gross") - sl.getFloat("basic"))], [A.er_pension, r0(sl.getFloat("pension_er"))],
      [A.er_maternity, r0(sl.getFloat("maternity_er"))], [A.er_occ, r0(sl.getFloat("occ_hazard_er"))], [A.er_medical, r0(sl.getFloat("medical_er"))],
    ];
    for (const [account, amount] of parts) {
      if (!amount) continue;
      let left = amount;
      split.forEach((f, i) => {
        const share = i === split.length - 1 ? left : r0((amount * Number(f.percent)) / 100);
        left -= share;
        if (!share) return;
        const k = [account, dept, f.funding_source || fallback, f.project || ""].join("|");
        costs[k] = (costs[k] || 0) + share;
      });
    }
    sum.net += r0(sl.getFloat("net"));
    sum.paye += r0(sl.getFloat("paye"));
    sum.pension += r0(sl.getFloat("pension_ee") + sl.getFloat("pension_er"));
    sum.maternity += r0(sl.getFloat("maternity_ee") + sl.getFloat("maternity_er"));
    sum.cbhi += r0(sl.getFloat("cbhi"));
    sum.occ += r0(sl.getFloat("occ_hazard_er"));
    sum.medical += r0(sl.getFloat("medical_ee") + sl.getFloat("medical_er"));
    sum.advances += r0(sl.getFloat("advances"));
    sum.loans += r0(sl.getFloat("loans"));
    sum.other += (core.parseJson(sl, "other_deductions", []) || []).reduce((t, d) => t + r0(d.amount), 0);
  }
  const lines = [];
  const charged = [];
  const unbudgeted = [];
  for (const [k, amount] of Object.entries(costs)) {
    const [account, dept, fund, project] = k.split("|");
    const line = budgetLineFor(dao, fyId, account, dept, fund, project);
    lines.push({ account, debit: amount, department: dept, funding_source: fund, project, budget_line: line ? line.id : "", description: `Salaries ${p.getString("period_label")}` });
    if (line) charged.push({ line, amount });
    else unbudgeted.push({ account, department: dept, funding_source: fund, project, amount });
  }
  const credit = (account, amount, what) => amount && lines.push({ account, credit: amount, description: `${what} ${p.getString("period_label")}` });
  credit(A.net, sum.net, "Net salaries");
  credit(A.paye, sum.paye, "PAYE");
  credit(A.pension, sum.pension, "Pension contributions");
  credit(A.maternity, sum.maternity, "Maternity contributions");
  credit(A.cbhi, sum.cbhi, "CBHI contributions");
  credit(A.occ, sum.occ, "Occupational hazards contributions");
  credit(A.medical, sum.medical, "Medical insurance contributions");
  credit(A.advances, sum.advances, "Salary advances recovered");
  credit(A.loans, sum.loans, "Staff loan instalments");
  credit(A.other, sum.other, "Other deductions");
  const journal = ledger.post(dao, {
    date, source: { type: "payroll", id: p.id, number: p.getString("number") }, description: `Payroll ${p.getString("period_label")}`, actor, meta,
    what: `the ${p.getString("period_label")} payroll`, lines,
  });
  // the salary advances deducted on the payslips are recovered by this payroll (the journal credits staff advances)
  const recoveredAt = new Date().toISOString();
  for (const sl of slips) {
    for (const pid of sl.getStringSlice("prepayments") || []) {
      let x;
      try {
        x = dao.findRecordById("prepayments", pid);
      } catch (_) {
        continue;
      }
      if (x.getString("kind") !== "advance" || x.getString("status") !== "paid") continue;
      x.set("status", "recovered");
      x.set("recovered_in", p.id);
      x.set("recovered_at", recoveredAt);
      dao.saveRecord(x);
      core.audit(dao, { actor, action: "advance_recovered", collection: "prepayments", recordId: x.id, label: x.getString("number"), comment: `Deducted in the ${p.getString("period_label")} payroll`, meta });
    }
  }
  // budget actuals: payroll is never stopped by the budget, but overruns are shown
  const byLine = {};
  for (const c of charged) byLine[c.line.id] = { line: c.line, amount: (byLine[c.line.id] ? byLine[c.line.id].amount : 0) + c.amount };
  const cache = {};
  const rec = (col, id) => {
    if (!id) return null;
    const k = `${col}:${id}`;
    if (!(k in cache)) {
      try {
        cache[k] = dao.findRecordById(col, id);
      } catch (_) {
        cache[k] = null;
      }
    }
    return cache[k];
  };
  const str = (r, f) => (r ? r.getString(f) : "");
  const budgetRows = [];
  for (const { line, amount } of Object.values(byLine)) {
    budget.post(dao, { line, type: "actual", amount, source: { type: "payroll", id: p.id, number: p.getString("number") }, description: `Payroll ${p.getString("period_label")}`, actor, date: `${date} 12:00:00.000Z` });
    const fig = budget.lineFigures(dao, line);
    budgetRows.push({
      line: line.id, code: line.getString("code"), name: line.getString("name"), amount, available: r0(fig.available), over: r0(fig.available) < 0,
      account: str(rec("gl_accounts", line.getString("gl_account")), "code"), department: str(rec("departments", line.getString("department")), "name"),
      project: str(rec("projects", line.getString("project")), "code"), funding: str(rec("funding_sources", line.getString("funding_source")), "code"),
    });
  }
  const byAccount = {};
  for (const l of lines) {
    const a = byAccount[l.account] || (byAccount[l.account] = { account: l.account, debit: 0, credit: 0 });
    a.debit += r0(l.debit);
    a.credit += r0(l.credit);
  }
  const names = (col, ids) => {
    const out = {};
    for (const i of ids.filter(Boolean)) {
      try {
        const r = dao.findRecordById(col, i);
        out[i] = r.getString("code") ? `${r.getString("code")} ${r.getString("name")}` : r.getString("name");
      } catch (_) {}
    }
    return out;
  };
  const accNames = names("gl_accounts", unbudgeted.map((u) => u.account));
  const deptNames = names("departments", unbudgeted.map((u) => u.department));
  const fundNames = names("funding_sources", unbudgeted.map((u) => u.funding_source));
  const byFunding = {};
  for (const [k, amount] of Object.entries(costs)) byFunding[k.split("|")[2]] = (byFunding[k.split("|")[2]] || 0) + amount;
  const fundAll = names("funding_sources", Object.keys(byFunding));
  p.set("gl_journal", journal.id);
  p.set("posted_at", new Date().toISOString());
  p.set("posting", {
    journal: journal.getString("number"), date, total: journal.getInt("total_debit"),
    budget: budgetRows, unbudgeted: unbudgeted.map((u) => ({ ...u, account_name: accNames[u.account] || "", department_name: deptNames[u.department] || "", funding_name: fundNames[u.funding_source] || "" })),
    by_funding: Object.entries(byFunding).map(([id, amount]) => ({ funding_source: id, name: fundAll[id] || "", amount })),
    by_account: Object.values(byAccount).map((a) => ({ ...a, code: str(rec("gl_accounts", a.account), "code"), name: str(rec("gl_accounts", a.account), "name") })).sort((x, y) => x.code.localeCompare(y.code)),
    lines: journal.getInt("line_count"),
  });
  dao.saveRecord(p);
}

// ------------------------------------------------------------------ reconciliation
/** This payroll against the previous one: joiners, leavers, changes per employee and per component. */
function reconciliation(dao, auth, id) {
  core.requirePermission(dao, auth, "view_payroll_details", "see payroll details");
  const p = load(dao, id);
  const ym = p.getInt("year") * 12 + p.getInt("month");
  const prev = (dao.findRecordsByFilter("payrolls", "(status = 'approved' || status = 'paid') && id != {:id}", "-year,-month", 50, 0, { id: p.id }) || [])
    .filter((x) => x.getInt("year") * 12 + x.getInt("month") < ym && x.getString("branch") === p.getString("branch"))[0] || null;
  const slipsOf = (pid) => {
    const out = {};
    for (const sl of dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 0, 0, { p: pid }) || []) out[sl.getString("employee")] = sl;
    return out;
  };
  const cur = slipsOf(p.id);
  const old = prev ? slipsOf(prev.id) : {};
  const KEYS = [["basic", "Basic"], ["allowances", "Allowances"], ["gross", "Gross"], ["paye", "PAYE"], ["employee_contributions", "Employee contributions"], ["advances", "Advances"], ["loans", "Loan instalments"], ["other", "Other deductions"], ["net", "Net pay"], ["employer_contributions", "Employer contributions"], ["employer_cost", "Employer cost"]];
  const fig = (sl) => {
    if (!sl) return null;
    const g = (k) => r0(sl.getFloat(k));
    return {
      basic: g("basic"), allowances: g("gross") - g("basic"), gross: g("gross"), paye: g("paye"),
      employee_contributions: g("pension_ee") + g("maternity_ee") + g("cbhi") + g("medical_ee"), advances: g("advances"), loans: g("loans"),
      other: (core.parseJson(sl, "other_deductions", []) || []).reduce((t, d) => t + r0(d.amount), 0), net: g("net"),
      employer_contributions: g("pension_er") + g("maternity_er") + g("occ_hazard_er") + g("medical_er"), employer_cost: g("employer_cost"), working_days: sl.getInt("working_days"),
    };
  };
  const rows = [];
  for (const emp of Object.keys(Object.assign({}, old, cur))) {
    const a = fig(old[emp]);
    const b = fig(cur[emp]);
    const sl = cur[emp] || old[emp];
    const kind = !a ? "joiner" : !b ? "leaver" : KEYS.some(([k]) => a[k] !== b[k]) ? "changed" : "same";
    if (kind === "same") continue;
    const reasons = [];
    if (a && b) {
      if (a.basic !== b.basic) reasons.push(`basic ${num(a.basic)} → ${num(b.basic)}`);
      if (a.allowances !== b.allowances) reasons.push("allowances changed");
      if (a.working_days !== b.working_days) reasons.push(`${b.working_days} working days (was ${a.working_days})`);
      if (a.loans !== b.loans) reasons.push(b.loans ? (a.loans ? "loan instalment changed" : "loan repayment started") : "loan repaid");
      if (a.advances !== b.advances) reasons.push(b.advances ? "salary advance recovered" : "no advance this month");
      if (a.other !== b.other) reasons.push("other deductions changed");
      if (!reasons.length && a.paye !== b.paye) reasons.push("tax rates");
    }
    rows.push({
      employee: emp, name: sl.getString("employee_name"), department: sl.getString("department_name"), kind, reasons,
      previous: a, current: b, diff_gross: (b ? b.gross : 0) - (a ? a.gross : 0), diff_net: (b ? b.net : 0) - (a ? a.net : 0),
    });
  }
  rows.sort((x, y) => Math.abs(y.diff_gross) - Math.abs(x.diff_gross));
  const total = (map) => {
    const t = Object.fromEntries(KEYS.map(([k]) => [k, 0]));
    for (const sl of Object.values(map)) {
      const f2 = fig(sl);
      for (const [k] of KEYS) t[k] += f2[k];
    }
    return t;
  };
  const tp = total(old);
  const tc = total(cur);
  return {
    current: { id: p.id, number: p.getString("number"), period_label: p.getString("period_label"), headcount: Object.keys(cur).length },
    previous: prev ? { id: prev.id, number: prev.getString("number"), period_label: prev.getString("period_label"), headcount: Object.keys(old).length } : null,
    components: KEYS.map(([k, label]) => ({ key: k, label, previous: tp[k], current: tc[k], difference: tc[k] - tp[k] })),
    joiners: rows.filter((r) => r.kind === "joiner").length, leavers: rows.filter((r) => r.kind === "leaver").length, changed: rows.filter((r) => r.kind === "changed").length,
    rows,
  };
}

// ------------------------------------------------------------------ staff loans
const LOAN_TYPES = { staff_loan: "Staff loan", salary_advance: "Salary advance (several months)", emergency: "Emergency loan" };

function loadLoan(dao, id) {
  try {
    return dao.findRecordById("staff_loans", id);
  } catch (_) {
    throw new NotFoundError("Loan not found.");
  }
}

/** HR records a loan to be repaid through the payroll; Finance approves it (never the person who recorded it). */
function createLoan(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "create_payroll", "record staff loans");
  let employee;
  try {
    employee = dao.findRecordById("users", String(input.employee || ""));
  } catch (_) {
    throw new BadRequestError("Choose the employee.");
  }
  if (employee.getString("status") && employee.getString("status") !== "Active") throw new BadRequestError(`${employee.getString("name")} is not an active employee.`);
  if (employee.id === auth.id) throw new ForbiddenError("Your own loan is recorded by another HR officer.");
  const type = LOAN_TYPES[input.loan_type] ? String(input.loan_type) : "staff_loan";
  const principal = r0(input.principal);
  const installment = r0(input.installment);
  if (principal < 1000) throw new BadRequestError("Give the amount of the loan.");
  if (principal > 50000000) throw new BadRequestError("Loans above RWF 50,000,000 are not handled through the payroll.");
  if (installment < 1000 || installment > principal) throw new BadRequestError("The monthly instalment must be between RWF 1,000 and the amount of the loan.");
  const installments = Math.ceil(principal / installment);
  if (installments > 60) throw new BadRequestError(`At RWF ${num(installment)} a month the loan takes ${installments} months; the limit is 60. Raise the instalment.`);
  const sy = parseInt(input.start_year, 10);
  const sm = parseInt(input.start_month, 10);
  if (!(sy >= 2000 && sm >= 1 && sm <= 12)) throw new BadRequestError("Choose the first month of repayment.");
  const now = new Date();
  if (sy * 12 + sm < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) throw new BadRequestError("Repayment starts this month or later.");
  const purpose = String(input.purpose || "").trim().slice(0, 500);
  if (purpose.length < 5) throw new BadRequestError("Say what the loan is for.");
  // affordability: all instalments together at most half of the last net pay
  const last = (dao.findRecordsByFilter("employees_payrolls", "employee = {:e}", "-created", 1, 0, { e: employee.id }) || [])[0];
  const running = (dao.findRecordsByFilter("staff_loans", "employee = {:e} && (status = 'active' || status = 'pending_approval')", "", 0, 0, { e: employee.id }) || [])
    .reduce((t, l) => t + Math.min(l.getInt("installment"), l.getInt("balance") || l.getInt("principal")), 0);
  if (last) {
    const netBefore = r0(last.getFloat("net")) + r0(last.getFloat("loans"));
    if (running + installment > netBefore / 2) {
      throw new BadRequestError(`Instalments would reach RWF ${num(running + installment)} a month, more than half of ${employee.getString("name")}'s net pay (RWF ${num(netBefore)}). Lower the instalment or the amount.`);
    }
  }
  const r = new Record(dao.findCollectionByNameOrId("staff_loans"));
  r.set("number", core.nextNumber(dao, "staff_loan"));
  r.set("employee", employee.id);
  r.set("loan_type", type);
  r.set("purpose", purpose);
  r.set("principal", principal);
  r.set("installment", installment);
  r.set("installments", installments);
  r.set("start_year", sy);
  r.set("start_month", sm);
  r.set("balance", principal);
  r.set("repaid", 0);
  r.set("status", "pending_approval");
  r.set("repayments", []);
  r.set("recorded_by", auth.id);
  dao.saveRecord(r);
  const approvers = (dao.findRecordsByFilter("users", 'status = "Active"', "", 0, 0) || []).filter((u) => u.id !== auth.id && u.id !== employee.id && core.can(dao, u, "approve_payroll")).map((u) => u.id);
  core.notify(dao, approvers, { title: `Staff loan to approve: ${employee.getString("name")}`, body: `${r.getString("number")} · RWF ${num(principal)} over ${installments} months`, link: "/dashboard/hr/payroll/loans", type: "approval" });
  core.audit(dao, { actor: auth, action: "created", collection: "staff_loans", recordId: r.id, label: r.getString("number"), comment: `${employee.getString("name")} · ${principal}`, meta });
  return r;
}

function decideLoan(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "approve_payroll", "approve staff loans");
  const r = loadLoan(dao, id);
  if (r.getString("status") !== "pending_approval") throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}.`);
  if (r.getString("recorded_by") === auth.id) throw new ForbiddenError("Separation of duties: the person who recorded the loan cannot approve it.");
  if (r.getString("employee") === auth.id) throw new ForbiddenError("You cannot approve your own loan.");
  const decision = String(input.decision || "");
  const comment = String(input.comment || "").trim().slice(0, 1000);
  if (["approve", "reject"].indexOf(decision) === -1) throw new BadRequestError("Approve or reject the loan.");
  if (decision === "reject" && comment.length < 5) throw new BadRequestError("Say why the loan is rejected.");
  r.set("status", decision === "approve" ? "active" : "rejected");
  r.set("decided_by", auth.id);
  r.set("decided_at", new Date().toISOString());
  r.set("decision_comment", comment);
  dao.saveRecord(r);
  core.notify(dao, [r.getString("employee"), r.getString("recorded_by")], {
    title: decision === "approve" ? `Loan approved: ${r.getString("number")}` : `Loan rejected: ${r.getString("number")}`,
    body: decision === "approve" ? `RWF ${num(r.getInt("installment"))} a month from ${MONTHS[r.getInt("start_month") - 1]} ${r.getInt("start_year")}` : comment,
    link: "/dashboard/my/payslips", type: decision === "approve" ? "success" : "warning",
  });
  core.audit(dao, { actor: auth, action: decision === "approve" ? "approval_approve" : "approval_reject", collection: "staff_loans", recordId: r.id, label: r.getString("number"), comment, meta });
  return r;
}

function cancelLoan(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "create_payroll", "cancel staff loans");
  const r = loadLoan(dao, id);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason for cancelling the loan.");
  if (r.getString("status") === "active" && r.getInt("repaid") > 0) throw new BadRequestError(`${r.getString("number")} is being repaid; it cannot be cancelled.`);
  if (["pending_approval", "active"].indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}.`);
  r.set("status", "cancelled");
  r.set("decision_comment", reason);
  dao.saveRecord(r);
  core.audit(dao, { actor: auth, action: "cancelled", collection: "staff_loans", recordId: r.id, label: r.getString("number"), comment: reason, meta });
  return r;
}

// ------------------------------------------------------------------ salary payments (Cashier)
/** The Cashier pays salaries without seeing pay details: only the payroll totals and the transfers to make. */
function requirePayer(dao, auth) {
  if (!auth) throw new UnauthorizedError("Please sign in again.");
  if (!core.can(dao, auth, "mark_payroll_paid") && !core.can(dao, auth, "view_payroll_details")) {
    throw new ForbiddenError('You don\'t have permission to see salary payments. Ask for "mark_payroll_paid".');
  }
}

/** Approved payrolls waiting for payment and the last paid ones. */
function paymentQueue(dao, auth) {
  requirePayer(dao, auth);
  const name = (col, id, f) => {
    if (!id) return "";
    try {
      return dao.findRecordById(col, id).getString(f || "name");
    } catch (_) {
      return "";
    }
  };
  const rows = dao.findRecordsByFilter("payrolls", "status = 'approved' || status = 'paid'", "-year,-month", 24, 0) || [];
  return rows.map((p) => {
    let account = null;
    if (p.getString("payment_account")) {
      try {
        const a = dao.findRecordById("bank_accounts", p.getString("payment_account"));
        account = { id: a.id, code: a.getString("code"), name: a.getString("name") };
      } catch (_) {}
    }
    return {
      id: p.id, number: p.getString("number"), period_label: p.getString("period_label"), year: p.getInt("year"), month: p.getInt("month"),
      status: p.getString("status"), headcount: p.getInt("headcount"), total_net: p.getInt("total_net"),
      approved_at: p.getString("approved_at") || p.getString("posted_at"), paid_at: p.getString("paid_at"), payment_reference: p.getString("payment_reference"),
      payment_account: account, paid_by: name("users", p.getString("paid_by")), prepared_by: p.getString("prepared_by"), prepared_by_name: name("users", p.getString("prepared_by")),
    };
  });
}

/**
 * The transfers for one payroll: totals per bank for everyone who pays; the bank file itself (beneficiary,
 * account, net pay) only for those who may see payroll data (HR & Payroll, DAF, SG, Internal Auditor).
 */
function bankFile(dao, auth, id) {
  requirePayer(dao, auth);
  const p = load(dao, id);
  if (["approved", "paid"].indexOf(p.getString("status")) === -1) throw new BadRequestError(`${p.getString("number")} is not approved yet.`);
  const slips = dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "employee_name", 0, 0, { p: p.id }) || [];
  const banks = {};
  const other = { count: 0, total: 0 };
  for (const s of slips) {
    const net = r0(s.getFloat("net"));
    if ((s.getString("payment_method") || "bank") !== "bank") {
      other.count++;
      other.total += net;
      continue;
    }
    const k = s.getString("bank_name") || "No bank recorded";
    const b = banks[k] || (banks[k] = { bank: k, count: 0, total: 0 });
    b.count++;
    b.total += net;
  }
  const details = core.can(dao, auth, "view_payroll_details");
  return {
    id: p.id, number: p.getString("number"), period_label: p.getString("period_label"), total_net: p.getInt("total_net"), headcount: p.getInt("headcount"),
    banks: Object.values(banks).sort((a, b) => b.total - a.total), other,
    rows: details
      ? slips.map((s) => ({
        employee_name: s.getString("employee_name"), payment_method: s.getString("payment_method") || "bank",
        bank_name: s.getString("bank_name"), bank_account: s.getString("bank_account"), net: r0(s.getFloat("net")),
      }))
      : null,
  };
}

module.exports = {
  config, paye, computeSlip, calculate, create, compute, submit, markPaid, cancel, preview, previewRun, syncSlips, MONTHS,
  defaultFunding, normalizeSplit, beforeSaveStructure, onApproved, reconciliation, createLoan, decideLoan, cancelLoan,
  paymentQueue, bankFile,
};
