/// <reference path="../../pb_data/types.d.ts" />
/**
 * Procurement reports. Every report returns { title, columns, rows, totals } computed on the server with the
 * same filters: from, to (dates), department, supplier, category, status. The web page renders any report
 * with one table component and exports it to Excel / PDF / print.
 */
const core = require("./core.js");

const d10 = (s) => String(s || "").slice(0, 10);
const money = (n) => core.money(n);

function names(dao, col, field) {
  const out = {};
  for (const r of dao.findRecordsByFilter(col, "id != ''", "", 20000, 0) || []) out[r.id] = r.getString(field || "name");
  return out;
}

function filterFor(f, dateField, map) {
  const parts = [];
  const p = {};
  if (f.from) {
    parts.push(`${dateField} >= {:from}`);
    p.from = `${f.from} 00:00:00.000Z`;
  }
  if (f.to) {
    parts.push(`${dateField} <= {:to}`);
    p.to = `${f.to} 23:59:59.999Z`;
  }
  for (const k of ["department", "supplier", "category", "status"]) {
    if (f[k] && map[k]) {
      parts.push(`${map[k]} = {:${k}}`);
      p[k] = f[k];
    }
  }
  return { filter: parts.length ? parts.join(" && ") : "id != ''", params: p };
}
function find(dao, col, f, dateField, map, sort) {
  const q = filterFor(f, dateField, map);
  return dao.findRecordsByFilter(col, q.filter, sort || `-${dateField}`, 20000, 0, q.params) || [];
}
const sum = (rows, k) => money(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));

const OPEN_PO = ["approved", "sent", "acknowledged", "partially_received"];
const SPEND_PO = ["approved", "sent", "acknowledged", "partially_received", "fully_received", "partially_invoiced", "fully_invoiced", "completed", "closed"];

const REPORTS = {
  requisitions: {
    title: "Purchase requisitions",
    run: (dao, f, n) => {
      const rows = find(dao, "purchase_requisitions", f, "created", { department: "department", category: "category", status: "status" }).map((r) => ({
        number: r.getString("number"), date: d10(r.getString("created")), title: r.getString("title"), department: n.dept[r.getString("department")], requester: n.users[r.getString("requester")],
        category: n.cat[r.getString("category")], priority: r.getString("priority"), total: r.getFloat("total"), status: r.getString("status"), link: `/dashboard/procurement/requisitions/${r.id}`,
      }));
      return { columns: [["number", "Number"], ["date", "Date", "date"], ["title", "Title"], ["department", "Department"], ["requester", "Requested by"], ["category", "Category"], ["priority", "Priority"], ["total", "Estimated total", "money"], ["status", "Status", "status"]], rows, totals: { total: sum(rows, "total") } };
    },
  },
  spend: {
    title: "Procurement spend by month",
    run: (dao, f) => {
      const by = {};
      for (const po of find(dao, "purchase_orders", f, "order_date", { department: "department", supplier: "supplier", category: "category" })) {
        if (SPEND_PO.indexOf(po.getString("status")) === -1) continue;
        const m = d10(po.getString("order_date")).slice(0, 7);
        const r = (by[m] = by[m] || { month: m, orders: 0, value: 0, received: 0, invoiced: 0, paid: 0 });
        r.orders++;
        r.value += po.getFloat("grand_total");
        r.received += po.getFloat("received_value");
        r.invoiced += po.getFloat("invoiced_value");
        r.paid += po.getFloat("paid_value");
      }
      const rows = Object.keys(by).sort().map((k) => ({ ...by[k], value: money(by[k].value), received: money(by[k].received), invoiced: money(by[k].invoiced), paid: money(by[k].paid) }));
      return { columns: [["month", "Month"], ["orders", "Orders", "number"], ["value", "Ordered", "money"], ["received", "Received", "money"], ["invoiced", "Billed", "money"], ["paid", "Paid", "money"]], rows, totals: { orders: rows.reduce((a, r) => a + r.orders, 0), value: sum(rows, "value"), received: sum(rows, "received"), invoiced: sum(rows, "invoiced"), paid: sum(rows, "paid") } };
    },
  },
  rfqs: {
    title: "Requests for quotation",
    run: (dao, f, n) => {
      const invites = {};
      for (const i of dao.findRecordsByFilter("rfq_suppliers", "id != ''", "", 50000, 0) || []) {
        const k = i.getString("rfq");
        invites[k] = invites[k] || { invited: 0, quoted: 0 };
        invites[k].invited++;
        if (["quoted", "late"].indexOf(i.getString("status")) !== -1) invites[k].quoted++;
      }
      const quotes = {};
      for (const q of dao.findRecordsByFilter("quotations", "status = 'accepted'", "", 50000, 0) || []) quotes[q.getString("rfq")] = q;
      const rows = find(dao, "rfqs", f, "created", { department: "department", status: "status" }).map((r) => {
        const w = quotes[r.id];
        return {
          number: r.getString("number"), date: d10(r.getString("created")), title: r.getString("title"), closing: d10(r.getString("closing_date")),
          invited: (invites[r.id] || {}).invited || 0, quoted: (invites[r.id] || {}).quoted || 0, status: r.getString("status"),
          awarded_to: w ? n.sup[w.getString("supplier")] : "", awarded_value: w ? w.getFloat("grand_total") : 0, link: `/dashboard/procurement/rfqs/${r.id}`,
        };
      });
      return { columns: [["number", "RFQ"], ["date", "Created", "date"], ["title", "Title"], ["closing", "Closing", "date"], ["invited", "Invited", "number"], ["quoted", "Quotes", "number"], ["awarded_to", "Awarded to"], ["awarded_value", "Awarded value", "money"], ["status", "Status", "status"]], rows, totals: { awarded_value: sum(rows, "awarded_value") } };
    },
  },
  quotations: {
    title: "Supplier quotations",
    run: (dao, f, n) => {
      const rfqs = names(dao, "rfqs", "number");
      const rows = find(dao, "quotations", f, "created", { supplier: "supplier" }).map((q) => ({
        rfq: rfqs[q.getString("rfq")], supplier: n.sup[q.getString("supplier")], reference: q.getString("supplier_reference"), date: d10(q.getString("quotation_date") || q.getString("created")),
        valid_until: d10(q.getString("validity_date")), total: q.getFloat("grand_total"), delivery_days: q.getFloat("delivery_days"), warranty: q.getString("warranty"),
        compliance: q.getString("technical_compliance"), status: q.getString("status"), link: `/dashboard/procurement/rfqs/${q.getString("rfq")}?tab=comparison`,
      }));
      return { columns: [["rfq", "RFQ"], ["supplier", "Supplier"], ["reference", "Supplier ref."], ["date", "Date", "date"], ["valid_until", "Valid until", "date"], ["total", "Total", "money"], ["delivery_days", "Delivery (days)", "number"], ["warranty", "Warranty"], ["compliance", "Technical"], ["status", "Status", "status"]], rows, totals: {} };
    },
  },
  purchase_orders: {
    title: "Purchase orders",
    run: (dao, f, n) => {
      const rows = find(dao, "purchase_orders", f, "order_date", { department: "department", supplier: "supplier", category: "category", status: "status" }).map((p) => ({
        number: p.getString("number"), date: d10(p.getString("order_date") || p.getString("created")), supplier: n.sup[p.getString("supplier")], department: n.dept[p.getString("department")],
        value: p.getFloat("grand_total"), received: p.getFloat("received_value"), invoiced: p.getFloat("invoiced_value"), paid: p.getFloat("paid_value"),
        expected: d10(p.getString("expected_delivery_date")), status: p.getString("status"), link: `/dashboard/procurement/purchase-orders/${p.id}`,
      }));
      return { columns: [["number", "PO"], ["date", "Order date", "date"], ["supplier", "Supplier"], ["department", "Department"], ["value", "Value", "money"], ["received", "Received", "money"], ["invoiced", "Billed", "money"], ["paid", "Paid", "money"], ["expected", "Expected", "date"], ["status", "Status", "status"]], rows, totals: { value: sum(rows, "value"), received: sum(rows, "received"), invoiced: sum(rows, "invoiced"), paid: sum(rows, "paid") } };
    },
  },
  goods_receipts: {
    title: "Goods received",
    run: (dao, f, n) => {
      const pos = {};
      for (const p of dao.findRecordsByFilter("purchase_orders", "id != ''", "", 20000, 0) || []) pos[p.id] = p;
      const wh = names(dao, "warehouses");
      const rows = find(dao, "goods_receipts", f, "receipt_date", { supplier: "supplier" }).filter((g) => !f.department || (pos[g.getString("purchase_order")] && pos[g.getString("purchase_order")].getString("department") === f.department)).map((g) => {
        const po = pos[g.getString("purchase_order")];
        const items = core.parseJson(g, "items", []);
        return {
          number: g.getString("number"), date: d10(g.getString("receipt_date")), po: po ? po.getString("number") : "", supplier: n.sup[g.getString("supplier")], warehouse: wh[g.getString("warehouse")] || "Service",
          received_by: n.users[g.getString("received_by")], lines: items.length, rejected: items.reduce((a, i) => a + (Number(i.rejected) || 0), 0), value: g.getFloat("accepted_value"),
          link: po ? `/dashboard/procurement/purchase-orders/${po.id}?tab=receipts` : "",
        };
      });
      return { columns: [["number", "GRN"], ["date", "Date", "date"], ["po", "PO"], ["supplier", "Supplier"], ["warehouse", "Warehouse"], ["received_by", "Received by"], ["lines", "Lines", "number"], ["rejected", "Rejected qty", "number"], ["value", "Accepted value", "money"]], rows, totals: { value: sum(rows, "value"), rejected: rows.reduce((a, r) => a + r.rejected, 0) } };
    },
  },
  returns: {
    title: "Purchase returns",
    run: (dao, f, n) => {
      const pos = names(dao, "purchase_orders", "number");
      const rows = find(dao, "purchase_returns", f, "created", { supplier: "supplier", status: "status" }).map((r) => ({
        number: r.getString("number"), date: d10(r.getString("created")), po: pos[r.getString("purchase_order")], supplier: n.sup[r.getString("supplier")], reason: r.getString("reason"),
        value: r.getFloat("total_value"), action: r.getString("supplier_action"), credit: r.getFloat("credit_amount"), status: r.getString("status"), link: `/dashboard/procurement/returns/${r.id}`,
      }));
      return { columns: [["number", "Return"], ["date", "Date", "date"], ["po", "PO"], ["supplier", "Supplier"], ["reason", "Reason"], ["value", "Value", "money"], ["action", "Supplier action"], ["credit", "Credit note", "money"], ["status", "Status", "status"]], rows, totals: { value: sum(rows, "value"), credit: sum(rows, "credit") } };
    },
  },
  supplier_performance: {
    title: "Supplier performance",
    run: (dao, f, n) => {
      const perf = require("./supplier.js").performance(dao, f.supplier ? [f.supplier] : null);
      const rows = perf.filter((p) => p.orders || p.invited).map((p) => ({ ...p, supplier_name: n.sup[p.supplier], link: `/dashboard/procurement/suppliers/${p.supplier}` })).sort((a, b) => (b.score || 0) - (a.score || 0));
      return { columns: [["supplier_name", "Supplier"], ["score", "Score", "pct"], ["on_time_pct", "On time", "pct"], ["quality_pct", "Accepted quality", "pct"], ["price_index", "Price index", "number"], ["response_pct", "RFQ response", "pct"], ["invoice_accuracy_pct", "Invoice accuracy", "pct"], ["orders", "Orders", "number"], ["spend", "Spend", "money"], ["outstanding", "Outstanding", "money"]], rows, totals: { spend: sum(rows, "spend"), outstanding: sum(rows, "outstanding") }, note: "Price index: 100 = average of the quotes received on the same RFQs; below 100 is cheaper." };
    },
  },
  contracts: {
    title: "Contracts",
    run: (dao, f, n) => {
      const cu = require("./contracts.js");
      const rows = find(dao, "contracts", f, "start_date", { department: "department", supplier: "supplier", status: "status" }).map((k) => {
        const u = cu.utilisation(dao, k.id, "");
        return {
          number: k.getString("number"), title: k.getString("title"), supplier: n.sup[k.getString("supplier")], start: d10(k.getString("start_date")), end: d10(k.getString("end_date")),
          value: k.getFloat("value"), used: u.used, remaining: money(k.getFloat("value") - u.used), used_pct: k.getFloat("value") ? Math.round((u.used / k.getFloat("value")) * 1000) / 10 : 0,
          status: k.getString("status"), link: `/dashboard/procurement/contracts/${k.id}`,
        };
      });
      return { columns: [["number", "Contract"], ["title", "Title"], ["supplier", "Supplier"], ["start", "Start", "date"], ["end", "End", "date"], ["value", "Value", "money"], ["used", "Used", "money"], ["remaining", "Remaining", "money"], ["used_pct", "Used", "pct"], ["status", "Status", "status"]], rows, totals: { value: sum(rows, "value"), used: sum(rows, "used"), remaining: sum(rows, "remaining") } };
    },
  },
  budget: {
    title: "Budget vs actual",
    run: (dao, f, n) => {
      const u = require("./budget.js").usage(dao, null, { department: f.department || "" });
      const rows = u.items.filter((i) => i.kind !== "revenue").map((i) => ({ department: i.department_name, budget: `${i.code} — ${i.name}`, funding: i.funding_code, amount: i.budget, committed: i.committed, invoiced: i.actual, remaining: i.available, used_pct: i.used_pct }));
      return { columns: [["department", "Department"], ["budget", "Budget line"], ["funding", "Funding"], ["amount", "Budget", "money"], ["committed", "Committed", "money"], ["invoiced", "Actual", "money"], ["remaining", "Available", "money"], ["used_pct", "Used", "pct"]], rows, totals: { amount: sum(rows, "amount"), committed: sum(rows, "committed"), invoiced: sum(rows, "invoiced"), remaining: sum(rows, "remaining") }, note: `${u.fiscal_year.name} — current approved budget lines.` };
    },
  },
  supplier_spend: { title: "Spend by supplier", run: (dao, f, n) => grouped(dao, f, n, "supplier", n.sup, "Supplier") },
  category_spend: { title: "Spend by category", run: (dao, f, n) => grouped(dao, f, n, "category", n.cat, "Category") },
  department_spend: { title: "Spend by department", run: (dao, f, n) => grouped(dao, f, n, "department", n.dept, "Department") },
  pending_approvals: {
    title: "Pending approvals",
    run: (dao, f, n) => {
      const now = Date.now();
      const rows = (dao.findRecordsByFilter("approval_requests", "status = 'pending'", "created", 5000, 0) || []).filter((a) => !f.department || a.getString("department") === f.department).map((a) => {
        const steps = core.parseJson(a, "steps", []);
        const lvl = a.getInt("current_level");
        return {
          number: a.getString("document_number"), type: a.getString("document_type").replace(/_/g, " "), title: a.getString("document_title"), amount: a.getFloat("amount"),
          step: steps[lvl] ? `${lvl + 1}/${steps.length} · ${steps[lvl].name}` : "", waiting_with: (a.getString("pending_approvers") || "").split(",").filter(Boolean).map((id) => n.users[id]).join(", "),
          since: d10(a.getString("created")), days: Math.floor((now - new Date(a.getString("created").replace(" ", "T")).getTime()) / 864e5),
        };
      });
      return { columns: [["number", "Document"], ["type", "Type"], ["title", "Title"], ["amount", "Amount", "money"], ["step", "Step"], ["waiting_with", "Waiting with"], ["since", "Submitted", "date"], ["days", "Days waiting", "number"]], rows, totals: { amount: sum(rows, "amount") } };
    },
  },
  outstanding_pos: {
    title: "Outstanding purchase orders",
    run: (dao, f, n) => {
      const rows = find(dao, "purchase_orders", f, "order_date", { department: "department", supplier: "supplier", category: "category" }).filter((p) => OPEN_PO.indexOf(p.getString("status")) !== -1).map((p) => ({
        number: p.getString("number"), supplier: n.sup[p.getString("supplier")], department: n.dept[p.getString("department")], date: d10(p.getString("order_date")), expected: d10(p.getString("expected_delivery_date")),
        value: p.getFloat("grand_total"), received: p.getFloat("received_value"), outstanding: money(p.getFloat("grand_total") - p.getFloat("received_value")), status: p.getString("status"), link: `/dashboard/procurement/purchase-orders/${p.id}`,
      }));
      return { columns: [["number", "PO"], ["supplier", "Supplier"], ["department", "Department"], ["date", "Order date", "date"], ["expected", "Expected", "date"], ["value", "Value", "money"], ["received", "Received", "money"], ["outstanding", "Outstanding", "money"], ["status", "Status", "status"]], rows, totals: { value: sum(rows, "value"), received: sum(rows, "received"), outstanding: sum(rows, "outstanding") } };
    },
  },
  overdue_deliveries: {
    title: "Overdue deliveries",
    run: (dao, f, n) => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = find(dao, "purchase_orders", f, "order_date", { department: "department", supplier: "supplier", category: "category" })
        .filter((p) => OPEN_PO.indexOf(p.getString("status")) !== -1 && p.getString("expected_delivery_date") && d10(p.getString("expected_delivery_date")) < today)
        .map((p) => ({
          number: p.getString("number"), supplier: n.sup[p.getString("supplier")], department: n.dept[p.getString("department")], expected: d10(p.getString("expected_delivery_date")),
          days_late: Math.floor((Date.now() - new Date(`${d10(p.getString("expected_delivery_date"))}T12:00:00Z`).getTime()) / 864e5), outstanding: money(p.getFloat("grand_total") - p.getFloat("received_value")),
          buyer: n.users[p.getString("buyer")], status: p.getString("status"), link: `/dashboard/procurement/purchase-orders/${p.id}`,
        }))
        .sort((a, b) => b.days_late - a.days_late);
      return { columns: [["number", "PO"], ["supplier", "Supplier"], ["department", "Department"], ["expected", "Expected", "date"], ["days_late", "Days late", "number"], ["outstanding", "Not yet received", "money"], ["buyer", "Buyer"], ["status", "Status", "status"]], rows, totals: { outstanding: sum(rows, "outstanding") } };
    },
  },
  invoice_matching: {
    title: "Invoice matching",
    run: (dao, f, n) => {
      const pos = names(dao, "purchase_orders", "number");
      const rows = find(dao, "supplier_invoices", f, "invoice_date", { department: "department", supplier: "supplier", status: "status" }).map((i) => {
        const m = core.parseJson(i, "match_result", {});
        return {
          number: i.getString("number"), reference: i.getString("supplier_invoice_number"), supplier: n.sup[i.getString("supplier")], po: pos[i.getString("purchase_order")], date: d10(i.getString("invoice_date")),
          total: i.getFloat("total"), match: i.getBool("exception_overridden") ? "exception (resolved)" : i.getString("match_status"), issues: (m.issues || []).concat(m.warnings || []).join(" · "),
          status: i.getString("status"), link: `/dashboard/finance/invoices/${i.id}`,
        };
      });
      return { columns: [["number", "Bill"], ["reference", "Supplier ref."], ["supplier", "Supplier"], ["po", "PO"], ["date", "Bill date", "date"], ["total", "Total", "money"], ["match", "Match", "status"], ["issues", "Differences"], ["status", "Status", "status"]], rows, totals: { total: sum(rows, "total") } };
    },
  },
  supplier_balances: {
    title: "Supplier balances",
    run: (dao, f, n) => {
      const today = new Date().toISOString().slice(0, 10);
      const by = {};
      const row = (id) => (by[id] = by[id] || { supplier: n.sup[id] || "—", open_orders: 0, on_order: 0, invoiced: 0, paid: 0, due: 0, overdue: 0, link: `/dashboard/procurement/suppliers/${id}` });
      for (const p of find(dao, "purchase_orders", f, "order_date", { department: "department", supplier: "supplier", category: "category" })) {
        if (OPEN_PO.concat(["fully_received", "partially_invoiced"]).indexOf(p.getString("status")) === -1) continue;
        const left = p.getFloat("grand_total") - p.getFloat("invoiced_value");
        if (left <= 0) continue;
        const r = row(p.getString("supplier"));
        r.open_orders++;
        r.on_order += left;
      }
      const invoices = dao.findRecordsByFilter("supplier_invoices", "status = 'approved' || status = 'partially_paid' || status = 'paid'", "", 20000, 0) || [];
      for (const i of invoices) {
        if (f.supplier && i.getString("supplier") !== f.supplier) continue;
        if (f.department && i.getString("department") !== f.department) continue;
        const r = row(i.getString("supplier"));
        const balance = i.getFloat("total") - i.getFloat("paid_amount");
        r.invoiced += i.getFloat("total");
        r.paid += i.getFloat("paid_amount");
        r.due += balance;
        if (balance > 0 && i.getString("due_date") && d10(i.getString("due_date")) < today) r.overdue += balance;
      }
      const rows = Object.values(by).map((r) => ({ ...r, on_order: money(r.on_order), invoiced: money(r.invoiced), paid: money(r.paid), due: money(r.due), overdue: money(r.overdue) })).sort((a, b) => b.due + b.on_order - (a.due + a.on_order));
      return {
        columns: [["supplier", "Supplier"], ["open_orders", "Open orders", "number"], ["on_order", "Ordered, not yet billed", "money"], ["invoiced", "Billed (approved)", "money"], ["paid", "Paid", "money"], ["due", "Balance due", "money"], ["overdue", "Overdue", "money"]],
        rows, totals: { open_orders: rows.reduce((a, r) => a + r.open_orders, 0), on_order: sum(rows, "on_order"), invoiced: sum(rows, "invoiced"), paid: sum(rows, "paid"), due: sum(rows, "due"), overdue: sum(rows, "overdue") },
        note: "Balance due = approved bills not yet paid. Ordered, not yet billed = open purchase orders (commitments).",
      };
    },
  },
  plan_execution: {
    title: "Procurement plan execution",
    run: (dao, f, n) => {
      const plans = dao.findRecordsByFilter("procurement_plans", "status = 'approved' || status = 'closed'", "-fiscal_year", 500, 0) || [];
      const rows = [];
      for (const plan of plans) {
        if (f.department && plan.getString("department") !== f.department) continue;
        const p = require("./planning.js").progress(dao, plan.id);
        const codes = {};
        for (const c of p.coverage || []) codes[c.id] = c.code;
        for (const l of dao.findRecordsByFilter("procurement_plan_lines", "plan = {:p}", "planned_month", 5000, 0, { p: plan.id }) || []) {
          const g = p.lines[l.id] || { requested: 0, ordered: 0, received: 0 };
          const planned = l.getFloat("estimated_total");
          rows.push({
            plan: plan.getString("number"), department: n.dept[plan.getString("department")], item: l.getString("description"), budget_line: codes[l.getString("budget_line")] || "",
            month: l.getInt("planned_month"), planned: money(planned), requested: money(g.requested), ordered: money(g.ordered), received: money(g.received),
            execution: planned ? Math.round((g.ordered / planned) * 1000) / 10 : 0, status: l.getString("status"), link: `/dashboard/procurement/plans/${plan.id}`,
          });
        }
      }
      return {
        columns: [["plan", "Plan"], ["department", "Department"], ["item", "Planned purchase"], ["budget_line", "Budget line"], ["month", "Month", "number"], ["planned", "Planned", "money"], ["requested", "Requested", "money"], ["ordered", "Ordered", "money"], ["received", "Received", "money"], ["execution", "Ordered vs plan", "pct"], ["status", "Status", "status"]],
        rows, totals: { planned: sum(rows, "planned"), requested: sum(rows, "requested"), ordered: sum(rows, "ordered"), received: sum(rows, "received") },
      };
    },
  },
  audit: {
    title: "Procurement audit trail",
    run: (dao, f) => {
      const cols = ["purchase_requisitions", "rfqs", "quotations", "purchase_orders", "goods_receipts", "supplier_invoices", "suppliers", "supplier_bank_changes", "contracts", "purchase_returns", "procurement_plans", "budgets", "approval_workflows"];
      const q = filterFor(f, "created", {});
      const rows = (dao.findRecordsByFilter("audit_logs", `(${q.filter}) && (${cols.map((c) => `collection_name = '${c}'`).join(" || ")})`, "-created", 5000, 0, q.params) || []).map((a) => ({
        date: a.getString("created").slice(0, 16), who: a.getString("actor_name"), action: a.getString("action").replace(/_/g, " "), document: a.getString("record_label"),
        type: a.getString("collection_name").replace(/_/g, " "), comment: a.getString("comment"), ip: a.getString("ip"),
      }));
      return { columns: [["date", "When"], ["who", "Who"], ["action", "Action"], ["type", "Document type"], ["document", "Document"], ["comment", "Comment"], ["ip", "IP address"]], rows, totals: {}, note: rows.length >= 5000 ? "Showing the latest 5,000 entries; narrow the dates." : "" };
    },
  },
};

function grouped(dao, f, n, field, labels, header) {
  const by = {};
  let total = 0;
  for (const po of find(dao, "purchase_orders", f, "order_date", { department: "department", supplier: "supplier", category: "category" })) {
    if (SPEND_PO.indexOf(po.getString("status")) === -1) continue;
    const k = po.getString(field) || "—";
    const r = (by[k] = by[k] || { key: k, name: labels[k] || "Not set", orders: 0, value: 0, received: 0, paid: 0 });
    r.orders++;
    r.value += po.getFloat("grand_total");
    r.received += po.getFloat("received_value");
    r.paid += po.getFloat("paid_value");
    total += po.getFloat("grand_total");
  }
  const rows = Object.values(by).map((r) => ({ ...r, value: money(r.value), received: money(r.received), paid: money(r.paid), share: total ? Math.round((r.value / total) * 1000) / 10 : 0 })).sort((a, b) => b.value - a.value);
  return { columns: [["name", header], ["orders", "Orders", "number"], ["value", "Ordered", "money"], ["share", "Share", "pct"], ["received", "Received", "money"], ["paid", "Paid", "money"]], rows, totals: { orders: rows.reduce((a, r) => a + r.orders, 0), value: sum(rows, "value"), received: sum(rows, "received"), paid: sum(rows, "paid") } };
}

function run(dao, actor, key, f) {
  const perms = core.permissionsOf(dao, actor);
  if (!perms.view_procurement_reports && perms.__scope !== "all") throw new ForbiddenError('You don\'t have permission to view procurement reports. Ask for "view_procurement_reports".');
  const def = REPORTS[key];
  if (!def) throw new NotFoundError(`Unknown report "${key}".`);
  const n = { dept: names(dao, "departments"), sup: names(dao, "suppliers"), cat: names(dao, "procurement_categories"), users: names(dao, "users") };
  const out = def.run(dao, f, n);
  return { key, title: def.title, filters: f, generated_at: new Date().toISOString(), columns: out.columns.map(([key, label, type]) => ({ key, label, type: type || "text" })), rows: out.rows, totals: out.totals, note: out.note || "" };
}

module.exports = { run, list: () => Object.keys(REPORTS).map((k) => ({ key: k, title: REPORTS[k].title })) };
