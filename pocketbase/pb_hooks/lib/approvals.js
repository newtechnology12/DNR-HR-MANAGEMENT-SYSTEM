/// <reference path="../../pb_data/types.d.ts" />
/**
 * Configurable approval engine.
 *
 * Workflows (approval_workflows) are data, not code: an administrator defines conditions
 * (document type, amount range, departments, categories, branches) and an ordered list of
 * steps. Each step names who approves:
 *   { name, approver_type: "role" | "user" | "department_head", role, user, same_department, fallback_role }
 * fallback_role is used when nobody else is eligible — e.g. the department head is the requester.
 *
 * Every transition runs on the server inside a transaction and is recorded in
 * approval_actions + audit_logs. Separation of duties: a requester can never approve
 * their own document unless the workflow explicitly sets allow_self_approval.
 *
 * Segregation of duties enforced for every document (RALGA IMS §3):
 *   - nobody approves a document they created or submitted (requester)
 *   - nobody decides the same document at two levels (decided_by); a later step whose only
 *     approvers already decided falls back to fallback_role, or is skipped when the step sets
 *     skip_if_already_approved (e.g. "SG (above limit)" when the SG already approved)
 *   - holders of the System Administrator role are never approvers
 *   - delegations: an approver on leave hands their approvals to a named person for a date range;
 *     the delegate acts "on behalf of" the delegator, which is shown on every approval
 *
 * Step conditions (all optional): min_amount / max_amount, above_limit_of (a role whose
 * approval_limits for this document type must be exceeded), departments, funding_sources.
 */
const core = require("./core.js");

/**
 * Approval engine documents are all financial: System Administrators never approve them, and the
 * Internal Auditor and Management Viewers are read-only. None of them can be an approver or delegate.
 */
const NON_APPROVER_ROLES = ["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER"];

const DOCS = {
  purchase_requisition: {
    collection: "purchase_requisitions",
    approvePermission: "approve_purchase_requisitions",
    label: "purchase requisition",
    link: (id) => `/dashboard/procurement/requisitions/${id}`,
    status: {
      pending: "pending_approval",
      approved: "approved",
      rejected: "rejected",
      returned: "returned",
      cancelled: "cancelled",
    },
    context: (doc) => ({
      amount: doc.getFloat("total"),
      currency: doc.getString("currency") || "RWF",
      department: doc.getString("department"),
      category: doc.getString("category"),
      branch: doc.getString("branch"),
      requester: doc.getString("requester"),
      number: doc.getString("number"),
      title: doc.getString("title"),
    }),
  },
  purchase_order: {
    collection: "purchase_orders",
    approvePermission: "approve_purchase_orders",
    label: "purchase order",
    link: (id) => `/dashboard/procurement/purchase-orders/${id}`,
    status: {
      pending: "pending_approval",
      approved: "approved",
      rejected: "rejected",
      returned: "returned",
      cancelled: "cancelled",
    },
    // The buyer who raised the PO is the "requester" for separation of duties: buyer ≠ approver.
    context: (doc) => ({
      amount: doc.getFloat("grand_total"),
      currency: doc.getString("currency") || "RWF",
      department: doc.getString("department"),
      category: doc.getString("category"),
      branch: doc.getString("branch"),
      requester: doc.getString("buyer"),
      number: doc.getString("number"),
      title: doc.getString("title"),
    }),
  },
  supplier_invoice: {
    collection: "supplier_invoices",
    approvePermission: "approve_invoices",
    label: "supplier invoice",
    link: (id) => `/dashboard/finance/invoices/${id}`,
    status: {
      pending: "pending_approval",
      approved: "approved",
      rejected: "rejected",
      returned: "returned",
      cancelled: "cancelled",
    },
    // Whoever recorded the invoice cannot approve it.
    context: (doc) => ({
      amount: doc.getFloat("total"),
      currency: doc.getString("currency") || "RWF",
      department: doc.getString("department"),
      category: "",
      branch: "",
      requester: doc.getString("recorded_by"),
      number: doc.getString("number"),
      title: `Supplier invoice ${doc.getString("supplier_invoice_number")}`,
    }),
  },
  supplier: {
    collection: "suppliers",
    approvePermission: "approve_suppliers",
    label: "supplier registration",
    link: (id) => `/dashboard/procurement/suppliers/${id}`,
    status: { pending: "under_review", approved: "active", rejected: "rejected", returned: "draft", cancelled: "draft" },
    // Whoever submitted the supplier cannot approve its registration.
    context: (doc) => ({
      amount: 0, currency: "RWF", department: "", category: "", branch: "",
      requester: doc.getString("submitted_by"), number: doc.getString("code"), title: `Supplier registration: ${doc.getString("name")}`,
    }),
  },
  purchase_return: {
    collection: "purchase_returns",
    approvePermission: "approve_purchase_returns",
    label: "purchase return",
    link: (id) => `/dashboard/procurement/returns/${id}`,
    status: { pending: "pending_approval", approved: "approved", rejected: "rejected", returned: "returned_for_changes", cancelled: "cancelled" },
    context: (doc) => {
      let department = "";
      try {
        department = $app.dao().findRecordById("purchase_orders", doc.getString("purchase_order")).getString("department");
      } catch (_) {}
      return {
        amount: doc.getFloat("total_value"), currency: "RWF", department, category: "", branch: "",
        requester: doc.getString("requested_by"), number: doc.getString("number"), title: `Return to supplier ${doc.getString("number")}`,
      };
    },
  },
  contract: {
    collection: "contracts",
    approvePermission: "approve_contracts",
    label: "contract",
    link: (id) => `/dashboard/procurement/contracts/${id}`,
    status: { pending: "pending_approval", approved: "active", rejected: "rejected", returned: "returned", cancelled: "cancelled" },
    context: (doc) => ({
      amount: doc.getFloat("value"), currency: doc.getString("currency") || "RWF", department: doc.getString("department"), category: "", branch: "",
      requester: doc.getString("created_by"), number: doc.getString("number"), title: doc.getString("title"),
    }),
  },
  procurement_plan: {
    collection: "procurement_plans",
    approvePermission: "approve_procurement_plans",
    label: "procurement plan",
    link: (id) => `/dashboard/procurement/plans/${id}`,
    status: { pending: "pending_approval", approved: "approved", rejected: "rejected", returned: "returned", cancelled: "cancelled" },
    context: (doc) => ({
      amount: doc.getFloat("total_estimated"), currency: "RWF", department: doc.getString("department"), category: "", branch: "",
      requester: doc.getString("created_by"), number: doc.getString("number"), title: doc.getString("name"),
    }),
  },
  payroll: {
    collection: "payrolls",
    approvePermission: "approve_payroll",
    label: "payroll",
    link: (id) => `/dashboard/hr/payroll/${id}`,
    status: {
      pending: "pending_approval",
      approved: "approved",
      rejected: "rejected",
      returned: "returned",
      cancelled: "cancelled",
    },
    // Whoever prepared (computed and submitted) the payroll cannot approve it.
    context: (doc) => ({
      amount: doc.getFloat("total_gross"),
      currency: "RWF",
      department: doc.getString("department"),
      category: "",
      branch: doc.getString("branch"),
      requester: doc.getString("prepared_by"),
      number: doc.getString("number"),
      title: `Payroll ${doc.getString("period_label")} — ${doc.getInt("headcount")} employees`,
    }),
  },
};

function docDef(type) {
  const d = DOCS[type];
  if (!d) throw new BadRequestError(`Unknown document type "${type}".`);
  return d;
}

const ids = (s) => (s || "").split(",").filter(Boolean);
const joinIds = (arr) => {
  const seen = {};
  return arr.filter((x) => x && !seen[x] && (seen[x] = true)).join(",");
};
const nowPb = () => new Date().toISOString().replace("T", " ");

function userNames(dao, list) {
  return list
    .map((id) => {
      try {
        const u = dao.findRecordById("users", id);
        return u.getString("name") || u.getString("email");
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function nameOf(dao, collection, id, field) {
  if (!id) return "";
  try {
    return dao.findRecordById(collection, id).getString(field || "name");
  } catch (_) {
    return "";
  }
}

/** Document context plus the funding source, which every IMS document may carry. */
function contextOf(def, doc) {
  const ctx = def.context(doc);
  if (ctx.funding_source === undefined) ctx.funding_source = doc.getString("funding_source");
  return ctx;
}

/** The most specific active workflow whose conditions match the document. */
function pickWorkflow(dao, type, ctx) {
  const all = dao.findRecordsByFilter("approval_workflows", "active = true && document_type = {:t}", "-priority", 200, 0, { t: type });
  const matches = (all || []).filter((wf) => {
    const min = wf.getFloat("min_amount") || 0;
    const max = wf.getFloat("max_amount") || 0;
    if (ctx.amount < min) return false;
    if (max > 0 && ctx.amount > max) return false;
    const depts = wf.getStringSlice("departments");
    if (depts.length && depts.indexOf(ctx.department) === -1) return false;
    const cats = wf.getStringSlice("categories");
    if (cats.length && cats.indexOf(ctx.category) === -1) return false;
    const branches = wf.getStringSlice("branches");
    if (branches.length && branches.indexOf(ctx.branch) === -1) return false;
    const funding = wf.getStringSlice("funding_sources");
    if (funding.length && funding.indexOf(ctx.funding_source) === -1) return false;
    return true;
  });
  const specificity = (wf) =>
    (wf.getStringSlice("departments").length ? 1 : 0) +
    (wf.getStringSlice("categories").length ? 1 : 0) +
    (wf.getStringSlice("branches").length ? 1 : 0) +
    (wf.getStringSlice("funding_sources").length ? 1 : 0);
  matches.sort(
    (a, b) =>
      b.getInt("priority") - a.getInt("priority") ||
      specificity(b) - specificity(a) ||
      b.getFloat("min_amount") - a.getFloat("min_amount")
  );
  return matches[0] || null;
}

/** Highest amount a role may approve for a document type: a number, Infinity (no maximum) or null (no limit set). */
function limitOf(dao, roleId, type) {
  const rows = dao.findRecordsByFilter("approval_limits", "active = true && role = {:r} && (document_type = {:t} || document_type = '')", "", 20, 0, { r: roleId, t: type }) || [];
  const row = rows.find((r) => r.getString("document_type") === type) || rows[0];
  if (!row) return null;
  const max = row.getInt("max_amount");
  return max > 0 ? max : Infinity;
}

/** Whether a workflow step applies to this document. Steps without conditions always apply. */
function stepApplies(dao, type, step, ctx) {
  if (Number(step.min_amount) > 0 && ctx.amount < Number(step.min_amount)) return false;
  if (Number(step.max_amount) > 0 && ctx.amount > Number(step.max_amount)) return false;
  if (step.departments && step.departments.length && step.departments.indexOf(ctx.department) === -1) return false;
  if (step.funding_sources && step.funding_sources.length && step.funding_sources.indexOf(ctx.funding_source) === -1) return false;
  if (step.above_limit_of) {
    const limit = limitOf(dao, step.above_limit_of, type);
    if (limit !== null && (limit === Infinity || ctx.amount <= limit)) return false;
  }
  return true;
}

function describeCondition(dao, step, type) {
  const parts = [];
  if (Number(step.min_amount) > 0) parts.push(`from ${core.formatMoney(step.min_amount)}`);
  if (Number(step.max_amount) > 0) parts.push(`up to ${core.formatMoney(step.max_amount)}`);
  if (step.above_limit_of) {
    const limit = limitOf(dao, step.above_limit_of, type);
    const role = nameOf(dao, "roles", step.above_limit_of);
    parts.push(limit === null ? `above the ${role} limit (no limit set — always applies)` : limit === Infinity ? `above the ${role} limit (unlimited — never applies)` : `above the ${role} limit of ${core.formatMoney(limit)}`);
  }
  if (step.departments && step.departments.length) parts.push(`for ${step.departments.map((d) => nameOf(dao, "departments", d)).join(", ")}`);
  if (step.funding_sources && step.funding_sources.length) parts.push(`funded by ${step.funding_sources.map((d) => nameOf(dao, "funding_sources", d)).join(", ")}`);
  return parts.join(", ");
}

/** Holders of the System Administrator, Internal Auditor or Management Viewer roles never approve. */
function isNonApprover(dao, userId, cache) {
  if (cache && cache[userId] !== undefined) return cache[userId];
  let out = false;
  try {
    const codes = core.roleCodes(dao, dao.findRecordById("users", userId));
    out = codes.some((c) => NON_APPROVER_ROLES.indexOf(c) !== -1);
  } catch (_) {}
  if (cache) cache[userId] = out;
  return out;
}

/** The person's roles must hold the document type's approve permission (permission matrix). */
function holdsApprovePermission(dao, userId, type, cache) {
  const perm = type && DOCS[type] ? DOCS[type].approvePermission : "";
  if (!perm) return true;
  const key = `${userId}:${perm}`;
  if (cache && cache[key] !== undefined) return cache[key];
  let out = false;
  try {
    out = core.can(dao, dao.findRecordById("users", userId), perm);
  } catch (_) {}
  if (cache) cache[key] = out;
  return out;
}

function activeUsersWithRole(dao, roleId, dept) {
  let filter = '(role = {:role} || extra_roles ~ {:role}) && status = "Active"';
  if (dept !== undefined) filter += " && department = {:dept}";
  return (dao.findRecordsByFilter("users", filter, "", 500, 0, { role: roleId, dept: dept || "" }) || []).map((u) => u.id);
}

/**
 * People who may decide a step in their own capacity (before delegations): they match the step,
 * hold the approve permission for the document type, are not the requester, have not already
 * decided the document, and hold no read-only / administrator role.
 */
function eligible(dao, step, ctx, allowSelf, exclude, type) {
  const cache = {};
  const ok = (id) =>
    (allowSelf || id !== ctx.requester) &&
    (exclude || []).indexOf(id) === -1 &&
    !isNonApprover(dao, id, cache) &&
    holdsApprovePermission(dao, id, type, cache);
  let found = [];
  if (step.approver_type === "user" && step.user) {
    try {
      const u = dao.findRecordById("users", step.user);
      if (u.getString("status") === "Active") found = [u.id];
    } catch (_) {}
  } else if (step.approver_type === "department_head") {
    if (ctx.department) {
      try {
        const head = dao.findRecordById("departments", ctx.department).getString("head");
        if (head) found = [head];
      } catch (_) {}
    }
  } else if (step.approver_type === "role" && step.role) {
    found = activeUsersWithRole(dao, step.role, step.same_department ? ctx.department || "" : undefined);
  }
  found = found.filter(ok);
  if (!found.length && step.fallback_role) found = activeUsersWithRole(dao, step.fallback_role).filter(ok);
  return found;
}

/** Active date-range delegations of a person for a document type. */
function activeDelegations(dao, userId, type) {
  const now = nowPb();
  const rows = dao.findRecordsByFilter("delegations", "active = true && delegator = {:u} && start_date <= {:now} && end_date >= {:now}", "", 20, 0, { u: userId, now }) || [];
  return rows.filter((d) => {
    const types = core.parseJson(d, "document_types", []);
    return !types.length || types.indexOf(type) !== -1;
  });
}

function delegatesFor(dao, approvers, type, ctx, allowSelf, exclude) {
  const out = [];
  const cache = {};
  for (const a of approvers) {
    for (const d of activeDelegations(dao, a, type)) {
      const del = d.getString("delegate");
      if (!del || (!allowSelf && del === ctx.requester) || (exclude || []).indexOf(del) !== -1 || isNonApprover(dao, del, cache)) continue;
      out.push(del);
    }
  }
  return out;
}

/**
 * Everyone who may decide a step: eligible approvers plus their active delegates.
 * opts.exclude = people who already decided this document (never twice); opts.type = document type.
 */
function resolveApprovers(dao, step, ctx, allowSelf, opts) {
  const o = opts || {};
  const own = eligible(dao, step, ctx, allowSelf, o.exclude, o.type);
  return ids(joinIds(own.concat(o.type ? delegatesFor(dao, own, o.type, ctx, allowSelf, o.exclude) : [])));
}

function describeStep(dao, step) {
  let rule;
  if (step.approver_type === "user") rule = nameOf(dao, "users", step.user) || "a specific user";
  else if (step.approver_type === "department_head") rule = "the department head";
  else rule = `role "${nameOf(dao, "roles", step.role) || "?"}"${step.same_department ? " in the same department" : ""}`;
  if (step.fallback_role) rule += `, otherwise role "${nameOf(dao, "roles", step.fallback_role) || "?"}"`;
  return rule;
}

function recordAction(dao, approval, actor, action, extra) {
  const r = new Record(dao.findCollectionByNameOrId("approval_actions"));
  r.set("approval", approval.id);
  r.set("document_type", approval.getString("document_type"));
  r.set("document_id", approval.getString("document_id"));
  r.set("level", extra && extra.level !== undefined ? extra.level : approval.getInt("current_level"));
  r.set("step_name", (extra && extra.stepName) || "");
  r.set("actor", actor ? actor.id : "");
  r.set("action", action);
  r.set("comment", (extra && extra.comment) || "");
  r.set("target_user", (extra && extra.target) || "");
  r.set("on_behalf_of", (extra && extra.onBehalfOf) || "");
  dao.saveRecord(r);
}

function workflowAllowsSelf(dao, approval) {
  try {
    return dao.findRecordById("approval_workflows", approval.getString("workflow")).getBool("allow_self_approval");
  } catch (_) {
    return false;
  }
}

/** Preview which workflow, steps and approvers a document would get — used by forms and settings. */
function preview(dao, type, ctx) {
  if (ctx.funding_source === undefined) ctx.funding_source = "";
  const wf = pickWorkflow(dao, type, ctx);
  if (!wf) return { workflow: null, steps: [] };
  const steps = core.parseJson(wf, "steps", []);
  const allowSelf = wf.getBool("allow_self_approval");
  return {
    workflow: { id: wf.id, name: wf.getString("name") },
    steps: steps.map((s) => {
      const applies = stepApplies(dao, type, s, ctx);
      return {
        name: s.name,
        rule: describeStep(dao, s),
        condition: describeCondition(dao, s, type),
        applies,
        approvers: applies ? userNames(dao, resolveApprovers(dao, s, ctx, allowSelf, { type })) : [],
      };
    }),
  };
}

/** Submit a document for approval. `dao` must be a transaction DAO. */
function start(dao, type, doc, actor, meta) {
  const def = docDef(type);
  const ctx = contextOf(def, doc);
  const wf = pickWorkflow(dao, type, ctx);
  if (!wf) {
    throw new BadRequestError(
      `No approval workflow matches this ${def.label} (${core.formatMoney(ctx.amount, ctx.currency)}${
        ctx.department ? `, ${nameOf(dao, "departments", ctx.department)}` : ""
      }). Ask an administrator to add one under Settings → Approval workflows.`
    );
  }
  const configured = core.parseJson(wf, "steps", []);
  if (!configured.length) throw new BadRequestError(`Approval workflow "${wf.getString("name")}" has no steps configured.`);
  const steps = configured.filter((s) => stepApplies(dao, type, s, ctx));
  if (!steps.length) throw new BadRequestError(`None of the steps of workflow "${wf.getString("name")}" apply to ${ctx.number}. Check the step conditions.`);
  const allowSelf = wf.getBool("allow_self_approval");
  steps.forEach((s, i) => {
    if (!resolveApprovers(dao, s, ctx, allowSelf, { type }).length) {
      throw new BadRequestError(
        `Step ${i + 1} "${s.name}" of workflow "${wf.getString("name")}" has no eligible approver (${describeStep(
          dao,
          s
        )}). The requester cannot approve their own request and System Administrators never approve financial documents. Ask an administrator to fix the workflow or assign someone.`
      );
    }
  });

  const approval = new Record(dao.findCollectionByNameOrId("approval_requests"));
  const first = resolveApprovers(dao, steps[0], ctx, allowSelf, { type });
  approval.set("document_type", type);
  approval.set("document_id", doc.id);
  approval.set("document_number", ctx.number);
  approval.set("document_title", ctx.title);
  approval.set("workflow", wf.id);
  approval.set("workflow_name", wf.getString("name"));
  approval.set("steps", steps.map((s) => ({ ...s, rule: describeStep(dao, s), condition: describeCondition(dao, s, type) })));
  approval.set("current_level", 0);
  approval.set("level_started_at", new Date().toISOString());
  approval.set("status", "pending");
  approval.set("amount", ctx.amount);
  approval.set("currency", ctx.currency);
  approval.set("department", ctx.department);
  approval.set("funding_source", ctx.funding_source || "");
  approval.set("requester", ctx.requester);
  approval.set("pending_approvers", joinIds(first));
  approval.set("approver_history", "");
  approval.set("decided_by", "");
  approval.set("escalations", []);
  dao.saveRecord(approval);

  recordAction(dao, approval, actor, "submit", { stepName: "Submitted" });

  doc.set("status", def.status.pending);
  doc.set("approval", approval.id);
  doc.set("pending_approvers", joinIds(first));
  doc.set("submitted_at", new Date().toISOString());
  dao.saveRecord(doc);

  core.notify(dao, first, {
    title: `Approval needed: ${ctx.number}`,
    body: `${ctx.title} · ${core.formatMoney(ctx.amount, ctx.currency)} — step "${steps[0].name}"`,
    link: def.link(doc.id),
    type: "approval",
  });
  core.audit(dao, {
    actor, action: "submitted", collection: def.collection, recordId: doc.id, label: ctx.number, meta,
    changes: { status: { old: "draft", new: def.status.pending }, workflow: { old: null, new: wf.getString("name") } },
  });
  return approval;
}

const ACTIONS = ["approve", "reject", "return", "delegate", "escalate", "comment"];
const DECISIONS = ["approve", "reject", "return"];

/** Whom a delegate is acting for: the pending approver whose active delegation names the actor. */
function onBehalfOf(dao, actorId, pending, type, own) {
  if (own.indexOf(actorId) !== -1) return "";
  for (const p of pending) {
    if (p === actorId) continue;
    if (activeDelegations(dao, p, type).some((d) => d.getString("delegate") === actorId)) return p;
  }
  return "";
}

/** Apply an approver action. `dao` must be a transaction DAO. */
function act(dao, approvalId, actor, input, meta) {
  const action = input.action;
  if (ACTIONS.indexOf(action) === -1) throw new BadRequestError(`Unknown action "${action}".`);
  const comment = (input.comment || "").trim();

  let approval;
  try {
    approval = dao.findRecordById("approval_requests", approvalId);
  } catch (_) {
    throw new NotFoundError("Approval request not found.");
  }
  const type = approval.getString("document_type");
  const def = docDef(type);
  const doc = dao.findRecordById(def.collection, approval.getString("document_id"));
  const number = approval.getString("document_number");

  if (approval.getString("status") !== "pending") {
    throw new BadRequestError(`${number} is already ${approval.getString("status")}; no further approval actions are possible.`);
  }
  const pending = ids(approval.getString("pending_approvers"));
  const decided = ids(approval.getString("decided_by"));
  const requester = approval.getString("requester");
  const wfAllowSelf = workflowAllowsSelf(dao, approval);

  if (action !== "comment" && isNonApprover(dao, actor.id)) {
    throw new ForbiddenError("Segregation of duties: System Administrators cannot approve or reject financial documents.");
  }
  // Comments are open to everyone involved; decisions only to the current approvers.
  if (action !== "comment" && pending.indexOf(actor.id) === -1) {
    throw new ForbiddenError(
      `${number} is not waiting for your decision. It is currently with: ${userNames(dao, pending).join(", ") || "nobody"}.`
    );
  }
  if (action !== "comment" && actor.id === requester && !wfAllowSelf) {
    throw new ForbiddenError("Separation of duties: you cannot approve or reject your own request.");
  }
  if (DECISIONS.indexOf(action) !== -1 && decided.indexOf(actor.id) !== -1) {
    throw new ForbiddenError(`Segregation of duties: you already decided ${number} at an earlier step. A different person must decide this step.`);
  }
  if ((action === "reject" || action === "return") && !comment) {
    throw new BadRequestError(`Please give a reason when you ${action === "reject" ? "reject" : "send back"} ${number}.`);
  }

  const steps = core.parseJson(approval, "steps", []);
  const level = approval.getInt("current_level");
  const step = steps[level] || { name: `Level ${level + 1}` };
  const ctx = contextOf(def, doc);
  const history = ids(approval.getString("approver_history"));
  const link = def.link(doc.id);
  let target = "";

  if (action === "delegate" || action === "escalate") {
    target = input.user || "";
    if (!target) throw new BadRequestError(`Choose who to ${action} ${number} to.`);
    if (target === requester && !wfAllowSelf) throw new BadRequestError("You cannot hand an approval to the person who requested it.");
    if (target === actor.id) throw new BadRequestError(`You cannot ${action} to yourself.`);
    if (decided.indexOf(target) !== -1) throw new BadRequestError("That person already decided this document at an earlier step.");
    let targetUser;
    try {
      targetUser = dao.findRecordById("users", target);
    } catch (_) {
      throw new BadRequestError("The selected user does not exist.");
    }
    if (targetUser.getString("status") !== "Active") throw new BadRequestError("The selected user is not an active employee.");
    if (isNonApprover(dao, target)) throw new BadRequestError("System Administrators cannot approve financial documents.");
  }

  const own = DECISIONS.indexOf(action) !== -1 ? eligible(dao, step, ctx, wfAllowSelf, decided, type) : [actor.id];
  const behalf = DECISIONS.indexOf(action) !== -1 ? onBehalfOf(dao, actor.id, pending, type, own) : "";
  recordAction(dao, approval, actor, action, { stepName: step.name, comment, target, onBehalfOf: behalf });
  history.push(actor.id);
  if (DECISIONS.indexOf(action) !== -1) decided.push(actor.id);
  let docStatusChange = null;

  if (action === "approve") {
    let nextLevel = level + 1;
    let next = [];
    while (nextLevel < steps.length) {
      next = resolveApprovers(dao, steps[nextLevel], ctx, wfAllowSelf, { exclude: decided, type });
      if (next.length) break;
      if (steps[nextLevel].skip_if_already_approved) {
        recordAction(dao, approval, null, "skip", {
          level: nextLevel, stepName: steps[nextLevel].name,
          comment: "Skipped: everyone who may decide this step already approved the document at an earlier step.",
        });
        nextLevel++;
        continue;
      }
      throw new BadRequestError(
        `Cannot move ${number} to step "${steps[nextLevel].name}": no eligible approver (${describeStep(dao, steps[nextLevel])}). People who already decided this document cannot decide it again.`
      );
    }
    if (nextLevel < steps.length) {
      approval.set("current_level", nextLevel);
      approval.set("level_started_at", new Date().toISOString());
      approval.set("pending_approvers", joinIds(next));
      core.notify(dao, next, {
        title: `Approval needed: ${number}`,
        body: `${ctx.title} · ${core.formatMoney(ctx.amount, ctx.currency)} — step "${steps[nextLevel].name}"`,
        link, type: "approval",
      });
      core.notify(dao, [requester], {
        title: `${number}: step "${step.name}" approved`,
        body: `Now waiting for "${steps[nextLevel].name}".`, link, type: "info",
      });
    } else {
      approval.set("status", "approved");
      approval.set("pending_approvers", "");
      approval.set("completed_at", new Date().toISOString());
      docStatusChange = def.status.approved;
      doc.set("approved_at", new Date().toISOString());
      core.notify(dao, [requester], { title: `${number} approved`, body: ctx.title, link, type: "success" });
    }
  } else if (action === "reject" || action === "return") {
    approval.set("status", action === "reject" ? "rejected" : "returned");
    approval.set("pending_approvers", "");
    approval.set("completed_at", new Date().toISOString());
    docStatusChange = action === "reject" ? def.status.rejected : def.status.returned;
    core.notify(dao, [requester], {
      title: action === "reject" ? `${number} rejected` : `${number} sent back for correction`,
      body: comment, link, type: action === "reject" ? "error" : "warning",
    });
  } else if (action === "delegate") {
    approval.set("pending_approvers", joinIds(pending.filter((id) => id !== actor.id).concat([target])));
    history.push(target);
    core.notify(dao, [target], {
      title: `Approval delegated to you: ${number}`,
      body: `${actor.getString("name")} delegated step "${step.name}"${comment ? `: ${comment}` : ""}`, link, type: "approval",
    });
  } else if (action === "escalate") {
    approval.set("pending_approvers", joinIds(pending.concat([target])));
    history.push(target);
    core.notify(dao, [target], {
      title: `Approval escalated to you: ${number}`,
      body: `${actor.getString("name")} escalated step "${step.name}"${comment ? `: ${comment}` : ""}`, link, type: "approval",
    });
  } else if (action === "comment") {
    const others = [requester].concat(pending).filter((id) => id !== actor.id);
    core.notify(dao, others, { title: `New comment on ${number}`, body: comment, link, type: "info" });
  }

  approval.set("approver_history", joinIds(history));
  approval.set("decided_by", joinIds(decided));
  dao.saveRecord(approval);

  const oldStatus = doc.getString("status");
  doc.set("pending_approvers", approval.getString("pending_approvers"));
  doc.set("approver_history", approval.getString("approver_history"));
  if (docStatusChange) doc.set("status", docStatusChange);
  dao.saveRecord(doc);

  core.audit(dao, {
    actor, action: `approval_${action}`, collection: def.collection, recordId: doc.id, label: number, meta,
    comment: behalf ? `${comment ? `${comment} ` : ""}(on behalf of ${nameOf(dao, "users", behalf)})` : comment,
    changes: docStatusChange ? { status: { old: oldStatus, new: docStatusChange } } : {},
  });
  return approval;
}

/** Cancel a document's running approval (called when the requester cancels). */
function cancel(dao, type, doc, actor, reason, meta) {
  const def = docDef(type);
  const approvalId = doc.getString("approval");
  if (approvalId) {
    try {
      const approval = dao.findRecordById("approval_requests", approvalId);
      if (approval.getString("status") === "pending") {
        const pending = ids(approval.getString("pending_approvers"));
        approval.set("status", "cancelled");
        approval.set("pending_approvers", "");
        approval.set("completed_at", new Date().toISOString());
        dao.saveRecord(approval);
        recordAction(dao, approval, actor, "cancel", { stepName: "Cancelled", comment: reason });
        core.notify(dao, pending, {
          title: `${doc.getString("number")} was cancelled`, body: reason, link: def.link(doc.id), type: "info",
        });
      }
    } catch (_) {}
  }
  const old = doc.getString("status");
  doc.set("status", def.status.cancelled);
  doc.set("pending_approvers", "");
  doc.set("cancel_reason", reason);
  dao.saveRecord(doc);
  core.audit(dao, {
    actor, action: "cancelled", collection: def.collection, recordId: doc.id, label: doc.getString("number"), comment: reason, meta,
    changes: { status: { old, new: def.status.cancelled } },
  });
}

/** Writes the new pending list to the approval and its document. */
function setPending(dao, approval, list) {
  approval.set("pending_approvers", joinIds(list));
  dao.saveRecord(approval);
  try {
    const doc = dao.findRecordById(docDef(approval.getString("document_type")).collection, approval.getString("document_id"));
    doc.set("pending_approvers", approval.getString("pending_approvers"));
    dao.saveRecord(doc);
  } catch (_) {}
}

/** A new delegation: the delegate may act on everything currently waiting for the delegator. */
function applyDelegation(dao, delegation) {
  const delegator = delegation.getString("delegator");
  const delegate = delegation.getString("delegate");
  const types = core.parseJson(delegation, "document_types", []);
  const rows = dao.findRecordsByFilter("approval_requests", 'status = "pending" && pending_approvers ~ {:u}', "", 1000, 0, { u: delegator }) || [];
  let n = 0;
  for (const a of rows) {
    const type = a.getString("document_type");
    if (types.length && types.indexOf(type) === -1) continue;
    const pending = ids(a.getString("pending_approvers"));
    if (pending.indexOf(delegator) === -1 || pending.indexOf(delegate) !== -1) continue;
    if (a.getString("requester") === delegate || ids(a.getString("decided_by")).indexOf(delegate) !== -1 || isNonApprover(dao, delegate)) continue;
    setPending(dao, a, pending.concat([delegate]));
    n++;
    let link = "";
    try {
      link = docDef(type).link(a.getString("document_id"));
    } catch (_) {}
    core.notify(dao, [delegate], {
      title: `Approval delegated to you: ${a.getString("document_number")}`,
      body: `On behalf of ${nameOf(dao, "users", delegator)} until ${String(delegation.getString("end_date")).slice(0, 10)}.`,
      link, type: "approval",
    });
  }
  return n;
}

/** A delegation ended: the delegate loses approvals they only had through it. */
function removeDelegation(dao, delegation) {
  const delegator = delegation.getString("delegator");
  const delegate = delegation.getString("delegate");
  const rows = dao.findRecordsByFilter("approval_requests", 'status = "pending" && pending_approvers ~ {:u}', "", 1000, 0, { u: delegate }) || [];
  for (const a of rows) {
    const pending = ids(a.getString("pending_approvers"));
    if (pending.indexOf(delegator) === -1) continue;
    let def;
    try {
      def = docDef(a.getString("document_type"));
    } catch (_) {
      continue;
    }
    const steps = core.parseJson(a, "steps", []);
    const step = steps[a.getInt("current_level")];
    if (!step) continue;
    let ctx;
    try {
      ctx = contextOf(def, dao.findRecordById(def.collection, a.getString("document_id")));
    } catch (_) {
      continue;
    }
    if (eligible(dao, step, ctx, workflowAllowsSelf(dao, a), ids(a.getString("decided_by")), a.getString("document_type")).indexOf(delegate) !== -1) continue;
    setPending(dao, a, pending.filter((p) => p !== delegate));
  }
}

/**
 * Hourly: approvals waiting longer than the workflow's overdue_hours (or settings.approval_overdue_hours,
 * default 48) are escalated once per step to the next level — next step's approvers, else the step's
 * fallback role, else the Secretary General — and the current approvers get a reminder.
 */
function escalateOverdue(dao) {
  let defaultHours = 48;
  try {
    const s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
    if (s && s.getInt("approval_overdue_hours") > 0) defaultHours = s.getInt("approval_overdue_hours");
  } catch (_) {}
  const rows = dao.findRecordsByFilter("approval_requests", 'status = "pending"', "", 2000, 0) || [];
  let escalated = 0;
  for (const a of rows) {
    let hours = defaultHours;
    try {
      const wf = dao.findRecordById("approval_workflows", a.getString("workflow"));
      if (wf.getInt("overdue_hours") > 0) hours = wf.getInt("overdue_hours");
    } catch (_) {}
    const startedRaw = a.getString("level_started_at") || a.getString("created");
    const started = new Date(String(startedRaw).replace(" ", "T"));
    if (isNaN(started.getTime()) || Date.now() - started.getTime() < hours * 3600 * 1000) continue;
    const level = a.getInt("current_level");
    const escalations = core.parseJson(a, "escalations", []);
    if (escalations.some((x) => x.level === level)) continue;

    const type = a.getString("document_type");
    let def, doc;
    try {
      def = docDef(type);
      doc = dao.findRecordById(def.collection, a.getString("document_id"));
    } catch (_) {
      continue;
    }
    const ctx = contextOf(def, doc);
    const steps = core.parseJson(a, "steps", []);
    const decided = ids(a.getString("decided_by"));
    const pending = ids(a.getString("pending_approvers"));
    const allowSelf = workflowAllowsSelf(dao, a);
    let targets = [];
    if (level + 1 < steps.length) targets = resolveApprovers(dao, steps[level + 1], ctx, allowSelf, { exclude: decided, type });
    if (!targets.length && steps[level] && steps[level].fallback_role) targets = eligible(dao, { approver_type: "role", role: steps[level].fallback_role }, ctx, allowSelf, decided, type);
    if (!targets.length) {
      try {
        const sg = dao.findFirstRecordByFilter("roles", 'code = "SG"');
        targets = eligible(dao, { approver_type: "role", role: sg.id }, ctx, allowSelf, decided, type);
      } catch (_) {}
    }
    targets = targets.filter((t) => pending.indexOf(t) === -1);
    escalations.push({ level, at: new Date().toISOString(), hours, to: targets });
    a.set("escalations", escalations);
    const number = a.getString("document_number");
    const link = def.link(doc.id);
    recordAction(dao, a, null, "escalate", {
      level, stepName: (steps[level] || {}).name || "",
      comment: `Overdue: waiting more than ${hours} hours. ${targets.length ? `Escalated automatically to ${userNames(dao, targets).join(", ")}.` : "Nobody to escalate to — reminder sent."}`,
    });
    setPending(dao, a, pending.concat(targets));
    core.notify(dao, targets, { title: `Overdue approval escalated to you: ${number}`, body: `${a.getString("document_title")} has waited more than ${hours} hours.`, link, type: "approval" });
    core.notify(dao, pending, { title: `Reminder: ${number} is overdue`, body: `It has waited more than ${hours} hours for your decision.`, link, type: "warning" });
    core.audit(dao, { actorName: "system", action: "approval_escalated", collection: def.collection, recordId: doc.id, label: number, comment: `Overdue more than ${hours} hours` });
    escalated++;
  }
  return escalated;
}

module.exports = {
  DOCS, NON_APPROVER_ROLES, pickWorkflow, resolveApprovers, eligible, stepApplies, limitOf, preview, start, act, cancel,
  applyDelegation, removeDelegation, escalateOverdue, activeDelegations,
};
