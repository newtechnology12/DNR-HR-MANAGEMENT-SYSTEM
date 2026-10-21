/// <reference path="../pb_data/types.d.ts" />
/**
 * Payslips carry their own period and payroll status. Staff may read their own payslips but not the
 * payroll run itself (organisation totals, approvers), so the period label, run number and status are
 * copied onto each payslip when it is computed and kept in step when the run is approved or paid.
 */
migrate(
  (db) => {
    const dao = new Dao(db);
    const slips = dao.findCollectionByNameOrId("employees_payrolls");
    const add = (f) => {
      if (!slips.schema.getFieldByName(f.name)) slips.schema.addField(new SchemaField(f));
    };
    add({ name: "period_label", type: "text", required: false, options: { min: null, max: null, pattern: "" } });
    add({ name: "period_year", type: "number", required: false, options: { min: null, max: null, noDecimal: true } });
    add({ name: "period_month", type: "number", required: false, options: { min: null, max: null, noDecimal: true } });
    add({ name: "payroll_number", type: "text", required: false, options: { min: null, max: null, pattern: "" } });
    add({ name: "payroll_status", type: "text", required: false, options: { min: null, max: null, pattern: "" } });
    add({ name: "paid_at", type: "date", required: false, options: { min: "", max: "" } });
    dao.saveCollection(slips);

    for (const p of dao.findRecordsByFilter("payrolls", "id != ''", "", 0, 0) || []) {
      for (const s of dao.findRecordsByFilter("employees_payrolls", "payroll = {:p}", "", 0, 0, { p: p.id }) || []) {
        s.set("period_label", p.getString("period_label"));
        s.set("period_year", p.getInt("year"));
        s.set("period_month", p.getInt("month"));
        s.set("payroll_number", p.getString("number"));
        s.set("payroll_status", p.getString("status"));
        s.set("paid_at", p.getString("paid_at"));
        dao.saveRecord(s);
      }
    }
  },
  (db) => {
    const dao = new Dao(db);
    const slips = dao.findCollectionByNameOrId("employees_payrolls");
    for (const n of ["period_label", "period_year", "period_month", "payroll_number", "payroll_status", "paid_at"]) {
      const f = slips.schema.getFieldByName(n);
      if (f) slips.schema.removeField(f.id);
    }
    dao.saveCollection(slips);
  },
);
