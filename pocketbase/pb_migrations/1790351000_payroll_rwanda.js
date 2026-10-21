/// <reference path="../pb_data/types.d.ts" />
/**
 * Payroll (Rwanda) — every rate is data that HR/finance can change in Settings → Payroll & taxes:
 *
 *  - paye_bands                PAYE brackets (monthly), per employment type (regular / casual)
 *  - statutory_contributions   RSSB pension, maternity leave, occupational hazards, CBHI, medical (RAMA)…
 *                              employee and employer rates, calculation base, remitted to
 *  - salary_structures         basic salary, allowances, recurring deductions, bank and RSSB details per employee
 *  - payrolls                  run per period (and optionally branch): draft → computed → approval (multi-level,
 *                              preparer ≠ approver) → approved → paid; rates frozen in config_snapshot
 *  - employees_payrolls        one payslip per employee with the full statutory breakdown
 *
 * Defaults reflect the rates in force when this module was written (PAYE per Law N° 027/2022, RSSB pension
 * 6% + 6% from January 2025, maternity 0.3% + 0.3%, occupational hazards 2%, CBHI 0.5% of net). Finance must
 * verify them against current RRA / RSSB notices before running a live payroll.
 */
const HR_ALL = '@request.auth.role.hr_scope = "all"';

const text = (name) => ({ name, type: "text", required: false, options: { min: null, max: null, pattern: "" } });
const num = (name) => ({ name, type: "number", required: false, options: { min: null, max: null, noDecimal: false } });
const bool = (name) => ({ name, type: "bool", required: false, options: {} });
const date = (name) => ({ name, type: "date", required: false, options: { min: "", max: "" } });
const json = (name) => ({ name, type: "json", required: false, options: { maxSize: 5000000 } });
const select = (name, values) => ({ name, type: "select", required: false, options: { maxSelect: 1, values } });
const rel = (name, collectionId, max) => ({ name, type: "relation", required: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: max || 1, displayFields: null } });

const BANDS = [
  // [employment_type, min, max (0 = no upper limit), rate %]
  ["regular", 0, 60000, 0],
  ["regular", 60001, 100000, 10],
  ["regular", 100001, 200000, 20],
  ["regular", 200001, 0, 30],
  ["casual", 0, 60000, 0],
  ["casual", 60001, 0, 15],
];
const CONTRIBUTIONS = [
  // [code, name, employee %, employer %, base, remit_to, active, description]
  ["PENSION", "RSSB pension", 6, 6, "gross_excl_transport", "RSSB", true, "Pension scheme. Base: gross salary excluding transport allowance."],
  ["MATERNITY", "Maternity leave benefits", 0.3, 0.3, "gross_excl_transport", "RSSB", true, "Maternity leave insurance scheme."],
  ["OCC_HAZARD", "Occupational hazards", 0, 2, "gross_excl_transport", "RSSB", true, "Paid by the employer only."],
  ["CBHI", "Community-based health insurance (CBHI)", 0.5, 0, "net_before_cbhi", "RSSB", true, "0.5% of the employee's net salary."],
  ["MEDICAL", "Medical insurance (RAMA)", 7.5, 7.5, "basic", "RSSB", false, "Enable if staff are covered by RSSB medical insurance instead of a private insurer."],
];

migrate(
  (db) => {
    const dao = new Dao(db);
    const id = (n) => dao.findCollectionByNameOrId(n).id;
    const USERS = id("users");
    const configRules = { listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""', createRule: HR_ALL, updateRule: HR_ALL, deleteRule: HR_ALL };

    const bands = new Collection({
      type: "base", name: "paye_bands",
      schema: [select("employment_type", ["regular", "casual"]), num("min_amount"), num("max_amount"), num("rate"), date("effective_from"), bool("active"), text("notes")],
      ...configRules,
    });
    dao.saveCollection(bands);
    BANDS.forEach(([t, min, max, rate]) => {
      const r = new Record(bands);
      r.load({ employment_type: t, min_amount: min, max_amount: max, rate, effective_from: "2023-01-01 12:00:00.000Z", active: true, notes: "Law N° 027/2022 on income tax" });
      dao.saveRecord(r);
    });

    const contrib = new Collection({
      type: "base", name: "statutory_contributions",
      schema: [
        text("code"), text("name"), num("employee_rate"), num("employer_rate"),
        select("base", ["gross", "gross_excl_transport", "basic", "net_before_cbhi"]), num("cap_amount"), text("remit_to"), bool("active"), num("sort"), text("description"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_contrib_code ON statutory_contributions (code)"],
      ...configRules,
    });
    dao.saveCollection(contrib);
    CONTRIBUTIONS.forEach(([code, name, ee, er, base, remit, active, description], i) => {
      const r = new Record(contrib);
      r.load({ code, name, employee_rate: ee, employer_rate: er, base, cap_amount: 0, remit_to: remit, active, sort: i + 1, description });
      dao.saveRecord(r);
    });

    const settings = dao.findCollectionByNameOrId("settings");
    for (const f of [bool("payroll_pension_deductible"), text("payroll_bank_name"), text("payroll_employer_tin"), text("payroll_rssb_number")]) {
      if (!settings.schema.getFieldByName(f.name)) settings.schema.addField(new SchemaField(f));
    }
    dao.saveCollection(settings);

    dao.saveCollection(new Collection({
      type: "base", name: "salary_structures",
      schema: [
        rel("employee", USERS), select("employment_type", ["permanent", "contract", "casual", "internship"]), num("basic_salary"),
        num("transport_allowance"), num("housing_allowance"), num("communication_allowance"), json("other_allowances"), json("recurring_deductions"),
        text("rssb_number"), text("tin"), select("payment_method", ["bank", "mobile_money", "cash"]), text("bank_name"), text("bank_account"), text("momo_number"),
        bool("active"), date("effective_from"), text("notes"), rel("updated_by", USERS),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_salary_structure_employee ON salary_structures (employee)"],
      listRule: `employee = @request.auth.id || ${HR_ALL}`,
      viewRule: `employee = @request.auth.id || ${HR_ALL}`,
      createRule: HR_ALL, updateRule: HR_ALL, deleteRule: HR_ALL,
    }));

    const payrolls = dao.findCollectionByNameOrId("payrolls");
    for (const f of [
      text("number"), text("period_label"), select("status", ["draft", "computed", "pending_approval", "returned", "approved", "rejected", "paid", "cancelled"]),
      rel("prepared_by", USERS), rel("approval", id("approval_requests")), text("pending_approvers"), text("approver_history"),
      date("submitted_at"), date("approved_at"), date("paid_at"), rel("paid_by", USERS), text("payment_reference"), date("computed_at"),
      json("config_snapshot"), json("totals"), num("total_employer_cost"), num("headcount"), text("cancel_reason"), rel("department", id("departments")),
    ]) if (!payrolls.schema.getFieldByName(f.name)) payrolls.schema.addField(new SchemaField(f));
    payrolls.listRule = HR_ALL;
    payrolls.viewRule = `${HR_ALL} || pending_approvers ~ @request.auth.id || approver_history ~ @request.auth.id`;
    payrolls.createRule = null; // through /api/dnr/payroll
    payrolls.updateRule = null;
    payrolls.deleteRule = null;
    dao.saveCollection(payrolls);

    const slips = dao.findCollectionByNameOrId("employees_payrolls");
    for (const f of [
      text("employee_name"), text("department_name"), text("designation_name"), select("employment_type", ["permanent", "contract", "casual", "internship"]),
      num("basic"), num("transport"), num("housing"), num("communication"), num("other_allowances_total"), json("allowances"),
      num("gross"), num("pension_base"), num("taxable_income"), num("paye"),
      num("pension_ee"), num("pension_er"), num("maternity_ee"), num("maternity_er"), num("occ_hazard_er"), num("cbhi"), num("medical_ee"), num("medical_er"),
      json("contributions"), json("other_deductions"), num("advances"), num("total_deductions"), num("net"), num("employer_cost"),
      text("bank_name"), text("bank_account"), text("rssb_number"), text("tin"), text("payment_method"), json("paye_breakdown"), num("working_days"),
    ]) if (!slips.schema.getFieldByName(f.name)) slips.schema.addField(new SchemaField(f));
    const slipView = `${HR_ALL} || payroll.pending_approvers ~ @request.auth.id || payroll.approver_history ~ @request.auth.id || (employee = @request.auth.id && (payroll.status = "approved" || payroll.status = "paid"))`;
    slips.listRule = slipView;
    slips.viewRule = slipView;
    slips.createRule = null;
    slips.updateRule = null;
    slips.deleteRule = null;
    dao.saveCollection(slips);
  },
  (db) => {
    const dao = new Dao(db);
    for (const n of ["salary_structures", "statutory_contributions", "paye_bands"]) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(n));
      } catch (_) {}
    }
  }
);
