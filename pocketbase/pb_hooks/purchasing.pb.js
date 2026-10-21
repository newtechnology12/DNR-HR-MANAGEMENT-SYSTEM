/// <reference path="../pb_data/types.d.ts" />
/**
 * Purchase order, receiving and inventory API. Rules live in lib/purchasing.js.
 */

onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/purchasing.js`).beforeUpdate(e), "purchase_orders");
onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (!Object.keys(changes).length) return;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "updated", collection: "purchase_orders", recordId: e.record.id,
    label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext),
  });
}, "purchase_orders");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/purchasing.js`).itemBeforeCreate(e), "inventory_items");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/purchasing.js`).itemBeforeUpdate(e), "inventory_items");

// POST /api/dnr/purchase-orders/from-rfq/:rfqId
routerAdd("POST", "/api/dnr/purchase-orders/from-rfq/:rfqId", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const purchasing = require(`${__hooks}/lib/purchasing.js`);
  const auth = $apis.requestInfo(c).authRecord;
  core.requirePermission($app.dao(), auth, "manage_purchase_orders", "create purchase orders");
  let out;
  $app.dao().runInTransaction((tx) => {
    const po = purchasing.fromRfq(tx, c.pathParam("rfqId"), auth, core.requestMeta(c));
    out = { id: po.id, number: po.getString("number") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// POST /api/dnr/purchase-orders/direct/:requisitionId   { supplier, justification }
routerAdd("POST", "/api/dnr/purchase-orders/direct/:requisitionId", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const purchasing = require(`${__hooks}/lib/purchasing.js`);
  const info = $apis.requestInfo(c);
  core.requirePermission($app.dao(), info.authRecord, "manage_purchase_orders", "create purchase orders");
  let out;
  $app.dao().runInTransaction((tx) => {
    const po = purchasing.direct(tx, c.pathParam("requisitionId"), info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: po.id, number: po.getString("number") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// POST /api/dnr/purchase-orders/:id/{submit|send|acknowledge|close|cancel|receive}
routerAdd("POST", "/api/dnr/purchase-orders/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const purchasing = require(`${__hooks}/lib/purchasing.js`);
  const approvals = require(`${__hooks}/lib/approvals.js`);
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  const action = c.pathParam("action");
  const dao = $app.dao();
  const meta = core.requestMeta(c);
  if (action === "receive") core.requirePermission(dao, auth, "receive_goods", "record deliveries");
  else core.requirePermission(dao, auth, "manage_purchase_orders", `${action} purchase orders`);
  let out;
  dao.runInTransaction((tx) => {
    if (action === "submit") {
      let po;
      try {
        po = tx.findRecordById("purchase_orders", c.pathParam("id"));
      } catch (_) {
        throw new NotFoundError("Purchase order not found.");
      }
      if (po.getString("buyer") !== auth.id) throw new ForbiddenError(`Only the buyer who raised ${po.getString("number")} can submit it.`);
      if (["draft", "returned"].indexOf(po.getString("status")) === -1) throw new BadRequestError(`${po.getString("number")} is already ${po.getString("status").replace(/_/g, " ")}.`);
      if (!(po.getFloat("grand_total") > 0)) throw new BadRequestError(`${po.getString("number")} has no value.`);
      if (!po.getString("expected_delivery_date")) throw new BadRequestError("Set an expected delivery date before submitting.");
      const finance = require(`${__hooks}/lib/finance.js`);
      const budget = finance.checkBudget(tx, { department: po.getString("department"), category: po.getString("category"), amount: po.getFloat("grand_total"), date: po.getString("order_date"), label: po.getString("number"), excludePoId: po.id });
      require(`${__hooks}/lib/contracts.js`).checkPo(tx, po);
      const approval = approvals.start(tx, "purchase_order", po, auth, meta);
      if (po.getString("contract")) require(`${__hooks}/lib/contracts.js`).sync(tx, po.getString("contract"));
      finance.warnOverBudget(tx, auth, budget, "purchase_orders", po.id, po.getString("number"), meta);
      out = { id: po.id, status: po.getString("status"), approval: approval.id };
    } else if (action === "receive") {
      const r = purchasing.receive(tx, c.pathParam("id"), auth, info.data || {}, meta);
      out = { id: r.grn.id, number: r.grn.getString("number"), assets: r.assets };
    } else {
      const po = purchasing.transition(tx, c.pathParam("id"), auth, action, info.data || {}, meta);
      out = { id: po.id, status: po.getString("status") };
    }
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// POST /api/dnr/inventory/adjust   { item, warehouse, type: issue|adjustment|return_to_supplier, quantity, reason, reference }
routerAdd("POST", "/api/dnr/inventory/adjust", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const purchasing = require(`${__hooks}/lib/purchasing.js`);
  const info = $apis.requestInfo(c);
  core.requirePermission($app.dao(), info.authRecord, "manage_inventory", "adjust stock");
  let out;
  $app.dao().runInTransaction((tx) => {
    const item = purchasing.adjust(tx, info.authRecord, info.data || {}, core.requestMeta(c));
    out = { id: item.id, total_quantity: item.getFloat("total_quantity") };
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());
