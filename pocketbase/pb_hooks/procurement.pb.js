/// <reference path="../pb_data/types.d.ts" />
/**
 * Procurement API: purchase requisition lifecycle and approval actions.
 * Business rules live in lib/requisitions.js and lib/approvals.js.
 */

// ------------------------------------------------------------------ purchase_requisitions CRUD
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/requisitions.js`).beforeCreate(e), "purchase_requisitions");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/requisitions.js`).beforeUpdate(e), "purchase_requisitions");

onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "created", collection: "purchase_requisitions", recordId: e.record.id,
    label: e.record.getString("number"), meta: core.requestMeta(e.httpContext),
    changes: { status: { old: null, new: "draft" }, total: { old: null, new: e.record.getFloat("total") } },
  });
}, "purchase_requisitions");

onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const raw = e.httpContext.get("dnrAudit");
  const changes = raw ? JSON.parse(raw) : {};
  if (!Object.keys(changes).length) return;
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "updated", collection: "purchase_requisitions", recordId: e.record.id,
    label: e.record.getString("number"), changes, meta: core.requestMeta(e.httpContext),
  });
}, "purchase_requisitions");

onRecordAfterDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  core.audit($app.dao(), {
    actor: e.httpContext.get("authRecord"), action: "deleted", collection: "purchase_requisitions", recordId: e.record.id,
    label: e.record.getString("number"), meta: core.requestMeta(e.httpContext),
  });
}, "purchase_requisitions");

// ------------------------------------------------------------------ lifecycle endpoints
// POST /api/dnr/requisitions/:id/submit
routerAdd(
  "POST",
  "/api/dnr/requisitions/:id/submit",
  (c) => {
    const core = require(`${__hooks}/lib/core.js`);
    const approvals = require(`${__hooks}/lib/approvals.js`);
    const reqs = require(`${__hooks}/lib/requisitions.js`);
    const auth = $apis.requestInfo(c).authRecord;
    const meta = core.requestMeta(c);
    let result;
    $app.dao().runInTransaction((tx) => {
      let doc;
      try {
        doc = tx.findRecordById("purchase_requisitions", c.pathParam("id"));
      } catch (_) {
        throw new NotFoundError("Purchase requisition not found.");
      }
      if (doc.getString("requester") !== auth.id) {
        throw new ForbiddenError(`Only the requester can submit ${doc.getString("number")}.`);
      }
      if (reqs.EDITABLE_STATUSES.indexOf(doc.getString("status")) === -1) {
        throw new BadRequestError(`${doc.getString("number")} is already ${doc.getString("status").replace(/_/g, " ")}.`);
      }
      reqs.assertReadyToSubmit(doc);
      // Budget control: hard stop when the line's available balance is insufficient (unless overridden).
      require(`${__hooks}/lib/budget.js`).checkRequisition(tx, doc, auth, meta);
      const approval = approvals.start(tx, "purchase_requisition", doc, auth, meta);
      result = { id: doc.id, number: doc.getString("number"), status: doc.getString("status"), approval: approval.id };
    });
    return c.json(200, result);
  },
  $apis.requireRecordAuth()
);

// POST /api/dnr/requisitions/:id/cancel   { reason }
routerAdd(
  "POST",
  "/api/dnr/requisitions/:id/cancel",
  (c) => {
    const core = require(`${__hooks}/lib/core.js`);
    const approvals = require(`${__hooks}/lib/approvals.js`);
    const info = $apis.requestInfo(c);
    const auth = info.authRecord;
    const reason = String((info.data && info.data.reason) || "").trim();
    if (!reason) throw new BadRequestError("Please give a reason for cancelling.");
    let result;
    $app.dao().runInTransaction((tx) => {
      let doc;
      try {
        doc = tx.findRecordById("purchase_requisitions", c.pathParam("id"));
      } catch (_) {
        throw new NotFoundError("Purchase requisition not found.");
      }
      const isOwner = doc.getString("requester") === auth.id;
      if (!isOwner && core.permissionsOf(tx, auth).__scope !== "all") {
        throw new ForbiddenError(`Only the requester or a procurement administrator can cancel ${doc.getString("number")}.`);
      }
      if (["draft", "pending_approval", "returned", "approved"].indexOf(doc.getString("status")) === -1) {
        throw new BadRequestError(`${doc.getString("number")} is ${doc.getString("status").replace(/_/g, " ")} and cannot be cancelled.`);
      }
      approvals.cancel(tx, "purchase_requisition", doc, auth, reason, core.requestMeta(c));
      result = { id: doc.id, status: doc.getString("status") };
    });
    return c.json(200, result);
  },
  $apis.requireRecordAuth()
);

// POST /api/dnr/approvals/:id/act   { action: approve|reject|return|delegate|escalate|comment, comment, user }
routerAdd(
  "POST",
  "/api/dnr/approvals/:id/act",
  (c) => {
    const core = require(`${__hooks}/lib/core.js`);
    const approvals = require(`${__hooks}/lib/approvals.js`);
    const info = $apis.requestInfo(c);
    const input = info.data || {};
    let result;
    $app.dao().runInTransaction((tx) => {
      const approval = approvals.act(tx, c.pathParam("id"), info.authRecord, {
        action: String(input.action || ""),
        comment: String(input.comment || ""),
        user: String(input.user || ""),
      }, core.requestMeta(c));
      result = {
        id: approval.id,
        status: approval.getString("status"),
        current_level: approval.getInt("current_level"),
      };
    });
    return c.json(200, result);
  },
  $apis.requireRecordAuth()
);

// POST /api/dnr/approvals/preview   { document_type, amount, department, category, branch }
// Shows which workflow and which people would approve — used by the requisition form and settings.
routerAdd(
  "POST",
  "/api/dnr/approvals/preview",
  (c) => {
    const approvals = require(`${__hooks}/lib/approvals.js`);
    const info = $apis.requestInfo(c);
    const d = info.data || {};
    const auth = info.authRecord;
    const result = approvals.preview($app.dao(), String(d.document_type || "purchase_requisition"), {
      amount: Number(d.amount) || 0,
      department: String(d.department || (auth && auth.getString("department")) || ""),
      category: String(d.category || ""),
      funding_source: String(d.funding_source || ""),
      branch: String(d.branch || (auth && auth.getString("branch")) || ""),
      requester: String(d.requester || (auth && auth.id) || ""),
    });
    return c.json(200, result);
  },
  $apis.requireAdminOrRecordAuth()
);
