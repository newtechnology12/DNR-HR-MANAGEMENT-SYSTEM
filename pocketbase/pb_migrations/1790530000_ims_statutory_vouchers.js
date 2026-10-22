/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — Step 9: payment vouchers can also pay statutory liabilities (PAYE, withholding tax and VAT to RRA;
 * pension, maternity, CBHI, occupational hazards and medical contributions to RSSB; other deductions): voucher type
 * "statutory", whose lines name the liability accounts paid. No budget charge — the cost was charged when the payroll
 * or the invoice was posted.
 */
migrate(
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("payment_vouchers");
    const f = c.schema.getFieldByName("voucher_type");
    c.schema.addField(new SchemaField({ id: f.id, name: "voucher_type", type: "select", required: false, options: { maxSelect: 1, values: ["invoice", "direct", "statutory"] } }));
    dao.saveCollection(c);
  },
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("payment_vouchers");
    const f = c.schema.getFieldByName("voucher_type");
    c.schema.addField(new SchemaField({ id: f.id, name: "voucher_type", type: "select", required: false, options: { maxSelect: 1, values: ["invoice", "direct"] } }));
    dao.saveCollection(c);
  }
);
