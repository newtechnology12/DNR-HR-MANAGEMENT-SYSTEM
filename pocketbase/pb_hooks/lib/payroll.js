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
 *   net              = gross − PAYE − employee contributions − recurring deductions − salary advances
 *   employer cost    = gross + employer contributions
 */
const core = require("./core.js");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const r0 = (n) => Math.round(Number(n) || 0);
const pad = (n) => String(n).padStart(2, "0");

function config(dao) {
  const bands = { regular: [], casual: [] };
  for (const b of dao.findRecordsByFilter("paye_bands", "active = true", "min_amount", 100, 0) || []) {
    (bands[b.getString("employment_type") || "regular"] = bands[b.getString("employment_type") || "regular"] || []).push({ min: b.getFloat("min_amount"), max: b.getFloat("max_amount"), rate: b.getFloat("rate") });
  }
  const contributions = (dao.findRecordsByFilter("statutory_contributions", "active = true", "sort", 100, 0) || []).map((c) => ({
    code: c.getString("code"), name: c.getString("name"), ee: c.getFloat("employee_rate"), er: c.getFloat("employer_rate"),
    base: c.getString("base") || "gross", cap: c.getFloat("cap_amount"), remit_to: c.getString("remit_to"),
  }));
  let pensionDeductible = false;
  try {
    const s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
    if (s) pensionDeductible = s.getBool("payroll_pension_deductible");
  } catch (_) {}
  if (!bands.regular.length) throw new BadRequestError("No PAYE tax bands are configured. Set them in Settings → Payroll & taxes.");
  return { bands, contributions, pensionDeductible };
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
  const totalDeductions = tax.tax + eeTotal + recurringTotal + advances;
  return {
    basic, transport, housing, communication, allowances: others, other_allowances_total: othersTotal, gross,
    pension_base: bases.gross_excl_transport, taxable_income: taxable, paye: tax.tax, paye_breakdown: tax.lines,
    pension_ee: pick("PENSION", "ee"), pension_er: pick("PENSION", "er"), maternity_ee: pick("MATERNITY", "ee"), maternity_er: pick("MATERNITY", "er"),
    occ_hazard_er: pick("OCC_HAZARD", "er"), cbhi: pick("CBHI", "ee"), medical_ee: pick("MEDICAL", "ee"), medical_er: pick("MEDICAL", "er"),
    contributions: lines, other_deductions: recurring, advances, total_deductions: totalDeductions,
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
    };
  }
  const salary = Number(String(user.getString("salary")).replace(/[^0-9.]/g, "")) || 0;
  if (!salary) return null;
  // No structure yet: the whole salary is treated as basic.
  return { record: null, basic: salary, transport: 0, housing: 0, communication: 0, others: [], deductions: [], employment_type: user.getString("employment_type") || "permanent", bank_name: user.getString("bank_name"), bank_account: user.getString("bank_account_number"), rssb_number: "", tin: "", payment_method: "bank" };
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

function compute(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "create_payroll", "compute payrolls");
  const p = load(dao, id);
  if (["draft", "computed", "returned"].indexOf(p.getString("status")) === -1) throw new BadRequestError(`${p.getString("number")} is ${p.getString("status").replace(/_/g, " ")} and can no longer be recalculated.`);
  const cfg = config(dao);
  const year = p.getInt("year");
  const month = p.getInt("month");
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const daysInMonth = monthEnd.getUTCDate();

  for (const old of dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 5000, 0, { p: p.id }) || []) dao.deleteRecord(old);

  let filter = 'status = "Active"';
  const params = {};
  if (p.getString("branch")) {
    filter += " && branch = {:b}";
    params.b = p.getString("branch");
  }
  const users = dao.findRecordsByFilter("users", filter, "name", 5000, 0, params) || [];
  const depts = {};
  for (const d of dao.findRecordsByFilter("departments", "id != ''", "", 500, 0) || []) depts[d.id] = d.getString("name");
  const desigs = {};
  for (const d of dao.findRecordsByFilter("designations", "id != ''", "", 1000, 0) || []) desigs[d.id] = d.getString("name");
  // Approved salary advances not yet recovered.
  const advanceCats = {};
  for (const c of dao.findRecordsByFilter("expenses_categories", "id != ''", "", 500, 0) || []) if (/advance/i.test(c.getString("name"))) advanceCats[c.id] = true;
  const advances = {};
  for (const x of dao.findRecordsByFilter("prepayments", "status = 'approved' && payroll = ''", "", 10000, 0) || []) {
    if (!advanceCats[x.getString("expenseCategory")]) continue;
    const d = x.getString("date") || x.getString("created");
    if (d && d.slice(0, 10) > monthEnd.toISOString().slice(0, 10)) continue;
    (advances[x.getString("employee")] = advances[x.getString("employee")] || []).push(x);
  }

  const col = dao.findCollectionByNameOrId("employees_payrolls");
  const T = { gross: 0, paye: 0, pension_ee: 0, pension_er: 0, maternity_ee: 0, maternity_er: 0, occ_hazard_er: 0, cbhi: 0, medical_ee: 0, medical_er: 0, other_deductions: 0, advances: 0, net: 0, employer_cost: 0, basic: 0, allowances: 0, headcount: 0 };
  const skipped = [];
  const slipIds = [];
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
    const c = computeSlip(cfg, s, { factor, advances: adv.reduce((a, x) => a + x.getFloat("amount"), 0) });
    const r = new Record(col);
    r.load({
      employee: u.id, payroll: p.id, employee_name: u.getString("name"), department_name: depts[u.getString("department")] || "", designation_name: desigs[u.getString("designation")] || "",
      employment_type: s.employment_type, bank_name: s.bank_name || "", bank_account: s.bank_account || "", rssb_number: s.rssb_number || "", tin: s.tin || "", payment_method: s.payment_method,
      working_days: Math.round(factor * daysInMonth),
      ...c,
      gross_salary: c.gross, net_sallary: c.net, deductions_amount: c.total_deductions,
      deductions: c.contributions.filter((l) => l.ee > 0).map((l) => ({ name: l.name, amount: l.ee })).concat([{ name: "PAYE", amount: c.paye }]),
      prepayments: adv.map((x) => x.id),
    });
    dao.saveRecord(r);
    slipIds.push(r.id);
    for (const k of ["gross", "paye", "pension_ee", "pension_er", "maternity_ee", "maternity_er", "occ_hazard_er", "cbhi", "medical_ee", "medical_er", "advances", "net", "employer_cost", "basic"]) T[k] += c[k];
    T.other_deductions += c.other_deductions.reduce((a, d) => a + d.amount, 0);
    T.allowances += c.gross - c.basic;
    T.headcount++;
  }
  T.rra = T.paye;
  T.rssb = T.pension_ee + T.pension_er + T.maternity_ee + T.maternity_er + T.occ_hazard_er + T.cbhi + T.medical_ee + T.medical_er;
  T.skipped = skipped;

  p.set("totals", T);
  p.set("total_gross", T.gross);
  p.set("total_net", T.net);
  p.set("total_employer_cost", T.employer_cost);
  p.set("headcount", T.headcount);
  p.set("prepayments_covered", T.advances);
  p.set("config_snapshot", { bands: cfg.bands, contributions: cfg.contributions, pension_deductible: cfg.pensionDeductible, computed_by: auth.getString("name") });
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
  p.set("status", "paid");
  p.set("paid_at", new Date().toISOString());
  p.set("paid_by", auth.id);
  p.set("payment_reference", String(input.reference || ""));
  dao.saveRecord(p);
  const slips = dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 5000, 0, { p: p.id }) || [];
  for (const s of slips) {
    for (const pid of s.getStringSlice("prepayments") || []) {
      try {
        const x = dao.findRecordById("prepayments", pid);
        x.set("payroll", p.id);
        dao.saveRecord(x);
      } catch (_) {}
    }
  }
  core.notify(dao, slips.map((s) => s.getString("employee")), { title: `Your payslip for ${p.getString("period_label")} is available`, body: "Salary paid.", link: "/dashboard/employee-portal?tab=Payslips", type: "success" });
  core.audit(dao, { actor: auth, action: "payroll_paid", collection: "payrolls", recordId: p.id, label: p.getString("number"), comment: p.getString("payment_reference"), meta, changes: { status: { old: "approved", new: "paid" } } });
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

/** What-if calculation for one salary (used by the salary structure form). */
function preview(dao, input) {
  const cfg = config(dao);
  return computeSlip(cfg, {
    basic: Number(input.basic_salary) || 0, transport: Number(input.transport_allowance) || 0, housing: Number(input.housing_allowance) || 0,
    communication: Number(input.communication_allowance) || 0, others: input.other_allowances || [], deductions: input.recurring_deductions || [],
    employment_type: input.employment_type || "permanent",
  }, { factor: 1, advances: 0 });
}

module.exports = { config, paye, computeSlip, create, compute, submit, markPaid, cancel, preview, MONTHS };
