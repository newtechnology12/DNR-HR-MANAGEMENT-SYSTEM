import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { differenceInHours, format, formatDistanceToNowStrict, startOfMonth, startOfQuarter, startOfYear, subMonths } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Clock, FileSearch, FileSignature, Plus, ShoppingCart, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { CHART, ChartTooltip, EmptyState, HorizontalBars, ListSkeleton, MetricGroup, PageHeader, Panel, StatusBadge } from "@/components/enterprise/ui";
import { DOC_STATUS, compactMoney, money, phase5Api } from "@/lib/procurement";

const PERIODS = [
  { key: "month", label: "This month", from: () => startOfMonth(new Date()) },
  { key: "quarter", label: "This quarter", from: () => startOfQuarter(new Date()) },
  { key: "year", label: "This year", from: () => startOfYear(new Date()) },
  { key: "12m", label: "12 months", from: () => startOfMonth(subMonths(new Date(), 11)) },
];
const pbDate = (d: Date) => d.toISOString().replace("T", " ");

type Filters = { department: string; supplier: string };
const and = (base: string, extra: string[]) => [base, ...extra.filter(Boolean)].filter(Boolean).join(" && ");

async function fetchData(from: Date, fl: Filters) {
  const me = pocketbase.authStore.model as any;
  const dep = fl.department ? `department = "${fl.department}"` : "";
  const sup = fl.supplier ? `supplier = "${fl.supplier}"` : "";
  const fields = "id,number,title,status,total,currency,department,category,created,submitted_at,approved_at,pending_approvers,expand.department.name,expand.category.name";
  const [inPeriod, openApprovals, trendRows] = await Promise.all([
    pocketbase.collection("purchase_requisitions").getFullList({ filter: and(`created >= "${pbDate(from)}"`, [dep]), expand: "department,category", fields, batch: 500 }),
    pocketbase.collection("purchase_requisitions").getFullList({
      filter: and(`status = "pending_approval"`, [dep]),
      sort: "submitted_at",
      expand: "requester,department",
      fields: "id,number,title,total,currency,submitted_at,pending_approvers,expand.requester.name,expand.department.name",
    }),
    pocketbase.collection("purchase_requisitions").getFullList({
      filter: and(`created >= "${pbDate(startOfMonth(subMonths(new Date(), 11)))}" && status != "draft"`, [dep]),
      fields: "created,total,status",
      batch: 500,
    }),
  ]);
  const now = pbDate(new Date());
  const soon = pbDate(new Date(Date.now() + 30 * 864e5));
  const [rfqs, expiringDocs] = await Promise.all([
    pocketbase.collection("rfqs").getFullList({
      filter: `status != "cancelled"`,
      expand: "requisition,awarded_quotation",
      fields: "id,number,title,status,closing_date,awarded_at,award_not_lowest,expand.requisition.total,expand.awarded_quotation.grand_total",
    }).catch(() => []),
    pocketbase.collection("supplier_documents").getFullList({
      filter: `expiry_date != "" && expiry_date <= "${soon}"`,
      expand: "supplier",
      sort: "expiry_date",
      fields: "id,document_type,expiry_date,supplier,expand.supplier.name",
    }).catch(() => []),
  ]);
  const [pos, rejectedReceipts] = await Promise.all([
    pocketbase.collection("purchase_orders").getFullList({
      filter: and(`status != "cancelled" && status != "rejected"`, [dep, sup]),
      expand: "supplier",
      fields: "id,number,title,status,source,grand_total,received_value,expected_delivery_date,approved_at,created,currency,expand.supplier.name",
      batch: 500,
    }).catch(() => []),
    pocketbase.collection("goods_receipts").getFullList({
      filter: and(`has_rejections = true && receipt_date >= "${pbDate(from)}"`, [sup]),
      expand: "purchase_order,supplier",
      fields: "id,number,receipt_date,purchase_order,expand.purchase_order.number,expand.supplier.name",
    }).catch(() => []),
  ]);
  const alerts = await phase5Api.contractAlerts().then((r) => r.items).catch(() => []);
  return { inPeriod, openApprovals, trendRows, me, rfqs, expiringDocs, now, pos, rejectedReceipts, alerts };
}

export default function ProcurementDashboard() {
  const navigate = useNavigate();
  const { canPerform } = useRoles();
  const [period, setPeriod] = React.useState("year");
  const from = PERIODS.find((p) => p.key === period)!.from();

  const [filters, setFilters] = React.useState<Filters>({ department: "", supplier: "" });
  const lookups = useQuery(["procurement-dashboard-lookups"], async () => {
    const [departments, suppliers] = await Promise.all([
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }).catch(() => []),
      pocketbase.collection("suppliers").getFullList({ sort: "name", fields: "id,name", filter: `status = "active"` }).catch(() => []),
    ]);
    return { departments, suppliers };
  });
  const q = useQuery(["procurement-dashboard", period, filters], () => fetchData(from, filters), { keepPreviousData: true, refetchInterval: 60_000 });
  const d = q.data;

  const stats = React.useMemo(() => {
    if (!d) return null;
    const rows = d.inPeriod as any[];
    const submitted = rows.filter((r) => r.status !== "draft");
    const by = (s: string) => rows.filter((r) => r.status === s);
    const sum = (list: any[]) => list.reduce((a, r) => a + (r.total || 0), 0);
    const approved = by("approved");
    const decided = rows.filter((r) => ["approved", "rejected"].includes(r.status));
    const cycleHours = approved
      .filter((r) => r.submitted_at && r.approved_at)
      .map((r) => differenceInHours(new Date(r.approved_at), new Date(r.submitted_at)));
    const avgCycle = cycleHours.length ? cycleHours.reduce((a, b) => a + b, 0) / cycleHours.length : null;

    const group = (key: "department" | "category", list: any[]) => {
      const m = new Map<string, number>();
      for (const r of list) {
        const name = r.expand?.[key]?.name || "Unassigned";
        m.set(name, (m.get(name) || 0) + (r.total || 0));
      }
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    };
    const statusCounts = Object.entries(
      rows.reduce((acc: Record<string, number>, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
    )
      .map(([s, value]) => ({ name: DOC_STATUS[s]?.label || s, value: value as number }))
      .sort((a, b) => b.value - a.value);

    const months = Array.from({ length: 12 }, (_, i) => startOfMonth(subMonths(new Date(), 11 - i)));
    const trend = months.map((m) => {
      const key = format(m, "yyyy-MM");
      const list = (d.trendRows as any[]).filter((r) => r.created.slice(0, 7) === key);
      return {
        month: format(m, "MMM"),
        approved: list.filter((r) => ["approved", "converted_to_rfq", "converted_to_po", "completed"].includes(r.status)).reduce((a, r) => a + r.total, 0),
        other: list.filter((r) => !["approved", "converted_to_rfq", "converted_to_po", "completed"].includes(r.status)).reduce((a, r) => a + r.total, 0),
      };
    });

    return {
      total: rows.length,
      submittedValue: sum(submitted),
      pending: by("pending_approval"),
      approved,
      approvedValue: sum(approved),
      rejected: by("rejected").length,
      returned: by("returned").length,
      drafts: by("draft").length,
      approvalRate: decided.length ? Math.round((approved.length / decided.length) * 100) : null,
      avgCycle,
      byDepartment: group("department", approved),
      byCategory: group("category", approved),
      statusCounts,
      trend,
      awaitingMe: (d.openApprovals as any[]).filter((r) => (r.pending_approvers || "").split(",").includes(d.me?.id)),
      ...(() => {
        const rfqs = d.rfqs as any[];
        const awardedInPeriod = rfqs.filter((x) => x.status === "awarded" && x.awarded_at && new Date(x.awarded_at) >= from);
        const awardedValue = awardedInPeriod.reduce((a, x) => a + (x.expand?.awarded_quotation?.grand_total || 0), 0);
        const estimate = awardedInPeriod.reduce((a, x) => a + (x.expand?.requisition?.total || 0), 0);
        return {
          rfqOpen: rfqs.filter((x) => x.status === "sent" && x.closing_date > d.now),
          rfqToAward: rfqs.filter((x) => x.status === "closed" || (x.status === "sent" && x.closing_date <= d.now)),
          rfqDraft: rfqs.filter((x) => x.status === "draft"),
          awardedCount: awardedInPeriod.length,
          awardedValue,
          savings: estimate - awardedValue,
          savingsPct: estimate > 0 ? Math.round(((estimate - awardedValue) / estimate) * 1000) / 10 : null,
          notLowest: awardedInPeriod.filter((x) => x.award_not_lowest).length,
        };
      })(),
      ...(() => {
        const pos = d.pos as any[];
        const open = pos.filter((p) => ["approved", "sent", "acknowledged", "partially_received"].includes(p.status));
        return {
          poPending: pos.filter((p) => p.status === "pending_approval"),
          poOpen: open,
          committed: open.reduce((a, p) => a + Math.max(p.grand_total - (p.received_value || 0), 0), 0),
          overdue: open.filter((p) => p.expected_delivery_date && p.expected_delivery_date < d.now),
          receivedValue: pos.reduce((a, p) => a + (p.received_value || 0), 0),
          direct: pos.filter((p) => p.source === "direct" && new Date(p.created) >= from),
        };
      })(),
    };
  }, [d]);

  const cycleLabel = stats?.avgCycle == null ? "—" : stats.avgCycle < 1 ? "<1 h" : stats.avgCycle < 48 ? `${Math.round(stats.avgCycle)} h` : `${(stats.avgCycle / 24).toFixed(1)} days`;

  return (
    <div className="space-y-5 px-4 py-4 sm:px-6">
      <PageHeader
        title="Procurement overview"
        description="Purchase requisitions and approvals. Figures reflect the records your role can see."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }]}
        actions={
          <>
            <div role="radiogroup" aria-label="Reporting period" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-card">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={period === p.key}
                  onClick={() => setPeriod(p.key)}
                  className={cn("rounded px-3 py-1.5 text-[12.5px] font-medium", period === p.key ? "bg-ralga-navy text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {canPerform("create_purchase_requisition") && (
              <Button onClick={() => navigate("/dashboard/procurement/requisitions/new")}>
                <Plus size={15} /> New requisition
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-card">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Filter</span>
        <select aria-label="Department" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[13px]" value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}>
          <option value="">All departments</option>
          {(lookups.data?.departments || []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select aria-label="Supplier" className="h-8 max-w-[240px] rounded-md border border-slate-200 bg-white px-2 text-[13px]" value={filters.supplier} onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))}>
          <option value="">All suppliers</option>
          {(lookups.data?.suppliers || []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {(filters.department || filters.supplier) && (
          <button type="button" className="text-[12.5px] font-medium text-primary hover:underline" onClick={() => setFilters({ department: "", supplier: "" })}>Clear</button>
        )}
        <span className="ml-auto hidden text-[12px] text-slate-500 sm:inline">Supplier filter applies to orders and receipts</span>
        {(canPerform("view_procurement_reports") || canPerform("view_procurement_dashboard")) && (
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/procurement/reports")}><BarChart3 size={14} /> Reports</Button>
        )}
      </div>

      {(d?.alerts || []).length > 0 && (
        <Panel title="Contract alerts" subtitle="Expiry, renewal decisions, spend limits and missing documents" action={{ label: "All contracts", onClick: () => navigate("/dashboard/procurement/contracts") }}>
          <ul className="-mx-1 divide-y divide-slate-100">
            {(d!.alerts as any[]).slice(0, 8).map((a) => (
              <li key={a.contract + a.key}>
                <button type="button" onClick={() => navigate(`/dashboard/procurement/contracts/${a.contract}`)} className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-slate-50">
                  {a.level === "danger" ? <AlertTriangle size={15} className="shrink-0 text-red-600" /> : <FileSignature size={15} className="shrink-0 text-amber-600" />}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{a.text}</span>
                  <span className="hidden truncate text-[12px] text-slate-500 sm:block sm:max-w-[40%]">{a.title}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", a.level === "danger" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>{a.level === "danger" ? "Action needed" : "Attention"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <MetricGroup
          title="Requisitions"
          icon={ClipboardList}
          loading={q.isLoading}
          metrics={[
            { label: "Requests", value: stats?.total, sub: `${stats?.drafts ?? 0} drafts`, onClick: () => navigate("/dashboard/procurement/requisitions") },
            { label: "Waiting for me", value: stats?.awaitingMe.length, tone: stats?.awaitingMe.length ? "danger" : "default", sub: "Your decision", onClick: () => navigate("/dashboard/procurement/approvals") },
            { label: "In review", value: stats?.pending.length, tone: "warning", sub: compactMoney(stats?.pending.reduce((a: number, r: any) => a + r.total, 0)), onClick: () => navigate("/dashboard/procurement/requisitions?view=pending") },
            { label: "Approved", value: stats?.approved.length, tone: "success", sub: compactMoney(stats?.approvedValue), onClick: () => navigate("/dashboard/procurement/requisitions?view=approved") },
            { label: "Declined", value: (stats?.rejected ?? 0) + (stats?.returned ?? 0), sub: `${stats?.returned ?? 0} returned · ${stats?.approvalRate == null ? "—" : stats.approvalRate + "%"} approval`, onClick: () => navigate("/dashboard/procurement/requisitions?view=attention") },
            { label: "Cycle time", value: cycleLabel, sub: "Submit → approve" },
          ]}
        />
        <MetricGroup
          title="Sourcing"
          icon={FileSearch}
          columns={2}
          loading={q.isLoading}
          metrics={[
            { label: "Open RFQs", value: stats?.rfqOpen.length, sub: `${stats?.rfqDraft.length ?? 0} drafts not sent`, onClick: () => navigate("/dashboard/procurement/rfqs?view=open") },
            { label: "To award", value: stats?.rfqToAward.length, tone: stats?.rfqToAward.length ? "warning" : "default", sub: "Closed, awaiting decision", onClick: () => navigate("/dashboard/procurement/rfqs?view=evaluate") },
            { label: "Awarded", value: compactMoney(stats?.awardedValue), sub: `${stats?.awardedCount ?? 0} RFQs${stats?.notLowest ? ` · ${stats.notLowest} not lowest` : ""}`, onClick: () => navigate("/dashboard/procurement/rfqs?view=awarded") },
            { label: "Savings", value: compactMoney(stats?.savings), tone: (stats?.savings ?? 0) >= 0 ? "success" : "danger", sub: stats?.savingsPct == null ? "vs approved estimate" : `${stats.savingsPct}% below estimate` },
          ]}
        />
        <MetricGroup
          title="Orders & delivery"
          icon={ShoppingCart}
          columns={2}
          loading={q.isLoading}
          metrics={[
            { label: "POs to approve", value: stats?.poPending.length, tone: stats?.poPending.length ? "warning" : "default", sub: "Finance / director", onClick: () => navigate("/dashboard/procurement/purchase-orders?view=approval") },
            { label: "Committed", value: compactMoney(stats?.committed), sub: `${stats?.poOpen.length ?? 0} open orders`, onClick: () => navigate("/dashboard/procurement/purchase-orders?view=open") },
            { label: "Late deliveries", value: stats?.overdue.length, tone: stats?.overdue.length ? "danger" : "default", sub: "Past expected date", onClick: () => navigate("/dashboard/procurement/purchase-orders?view=overdue") },
            { label: "Received", value: compactMoney(stats?.receivedValue), tone: "success", sub: `${d?.expiringDocs.length ?? 0} supplier docs expiring`, onClick: () => navigate("/dashboard/procurement/receipts") },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Requested value by month" subtitle="Submitted requisitions, last 12 months (RWF)">
          {q.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !stats?.trend.some((t) => t.approved + t.other > 0) ? (
            <EmptyState icon={ClipboardList} text="No submitted requisitions in the last 12 months" />
          ) : (
            <div className="h-[260px]" role="img" aria-label="Stacked bars of approved and other requested value per month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART.axis }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART.axis }} tickFormatter={(v) => compactMoney(v, "").trim()} width={48} />
                  <Tooltip content={<ChartTooltip format={(v: number) => money(v)} />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar isAnimationActive={false} dataKey="approved" name="Approved" stackId="a" fill={CHART.series1} stroke="#fff" strokeWidth={1} />
                  <Bar isAnimationActive={false} dataKey="other" name="Pending / other" stackId="a" fill={CHART.series2} stroke="#fff" strokeWidth={1} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="-mt-1 flex justify-end gap-4 text-[12px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.series1 }} />Approved</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.series2 }} />Pending / other</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Approval queue" subtitle="Oldest first — delays are highlighted" action={{ label: "All pending", onClick: () => navigate("/dashboard/procurement/requisitions?view=pending") }}>
          {q.isLoading ? (
            <ListSkeleton rows={5} />
          ) : !d?.openApprovals.length ? (
            <EmptyState icon={CheckCircle2} text="Nothing is waiting for approval" />
          ) : (
            <ul className="-mx-1 max-h-[300px] divide-y divide-slate-100 overflow-y-auto">
              {(d.openApprovals as any[]).slice(0, 12).map((r) => {
                const hours = r.submitted_at ? differenceInHours(new Date(), new Date(r.submitted_at)) : 0;
                const mine = (r.pending_approvers || "").split(",").includes(d.me?.id);
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => navigate(`/dashboard/procurement/requisitions/${r.id}`)} className="flex w-full items-start gap-3 rounded-md px-1 py-2.5 text-left hover:bg-slate-50">
                      <Clock size={15} className={cn("mt-0.5 shrink-0", hours > 72 ? "text-red-500" : hours > 24 ? "text-amber-500" : "text-slate-400")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-800">
                          {r.number} · {r.title}
                        </p>
                        <p className="truncate text-[12px] text-slate-500">
                          {r.expand?.requester?.name} · {money(r.total, r.currency)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-[12px]", hours > 72 ? "font-medium text-red-600" : "text-slate-500")}>
                          {r.submitted_at ? formatDistanceToNowStrict(new Date(r.submitted_at)) : "—"}
                        </p>
                        {mine && <p className="text-[11px] font-semibold text-amber-700">Your turn</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Approved value by department" subtitle={PERIODS.find((p) => p.key === period)?.label}>
          {q.isLoading ? <Skeleton className="h-[220px] w-full" /> : !stats?.byDepartment.length ? (
            <EmptyState icon={Wallet} text="No approved requisitions in this period" />
          ) : (
            <HorizontalBars data={stats.byDepartment} label="Approved value" format={(v) => compactMoney(v, "")} />
          )}
        </Panel>
        <Panel title="Approved value by category" subtitle={PERIODS.find((p) => p.key === period)?.label}>
          {q.isLoading ? <Skeleton className="h-[220px] w-full" /> : !stats?.byCategory.length ? (
            <EmptyState icon={Wallet} text="No approved requisitions in this period" />
          ) : (
            <HorizontalBars data={stats.byCategory} label="Approved value" format={(v) => compactMoney(v, "")} labelWidth={150} />
          )}
        </Panel>
        <Panel title="Requisitions by status" subtitle={PERIODS.find((p) => p.key === period)?.label}>
          {q.isLoading ? <Skeleton className="h-[220px] w-full" /> : !stats?.statusCounts.length ? (
            <EmptyState icon={ClipboardList} text="No requisitions in this period" />
          ) : (
            <HorizontalBars data={stats.statusCounts} label="Requisitions" />
          )}
        </Panel>
      </div>

      <Panel title="Exceptions" subtitle="Items that need attention, calculated from live records">
        {q.isLoading ? <ListSkeleton rows={3} /> : (
          <ExceptionGroups groups={[
              {
                title: "Approval delays (> 3 days)",
                rows: (d?.openApprovals as any[] || []).filter((r) => r.submitted_at && differenceInHours(new Date(), new Date(r.submitted_at)) > 72).map((r) => ({ id: r.id, label: `${r.number} · ${r.title}`, sub: `waiting ${formatDistanceToNowStrict(new Date(r.submitted_at))}`, link: `/dashboard/procurement/requisitions/${r.id}` })),
              },
              {
                title: "RFQs past closing date",
                rows: (stats?.rfqToAward || []).filter((x: any) => x.status === "sent").map((x: any) => ({ id: x.id, label: `${x.number} · ${x.title}`, sub: `closed ${formatDistanceToNowStrict(new Date(x.closing_date))} ago — close & evaluate`, link: `/dashboard/procurement/rfqs/${x.id}` })),
              },
              {
                title: "Overdue deliveries",
                rows: (stats?.overdue || []).map((p: any) => ({ id: p.id, label: `${p.number} · ${p.expand?.supplier?.name || ""}`, sub: `expected ${format(new Date(p.expected_delivery_date), "d MMM")} · ${formatDistanceToNowStrict(new Date(p.expected_delivery_date))} late`, link: `/dashboard/procurement/purchase-orders/${p.id}` })),
              },
              {
                title: "Rejected deliveries",
                rows: (d?.rejectedReceipts as any[] || []).map((g) => ({ id: g.id, label: `${g.number} · ${g.expand?.supplier?.name || ""}`, sub: `on ${g.expand?.purchase_order?.number} · ${format(new Date(g.receipt_date), "d MMM")}`, link: `/dashboard/procurement/purchase-orders/${g.purchase_order}?tab=receipts` })),
              },
              {
                title: "Direct purchases (no competition)",
                rows: (stats?.direct || []).map((p: any) => ({ id: p.id, label: `${p.number} · ${p.title}`, sub: `${p.expand?.supplier?.name || ""} · ${compactMoney(p.grand_total)}`, link: `/dashboard/procurement/purchase-orders/${p.id}` })),
              },
              {
                title: "Supplier documents expiring",
                rows: (d?.expiringDocs as any[] || []).map((x) => ({ id: x.id, label: x.expand?.supplier?.name, sub: `${x.document_type.replace(/_/g, " ")} · ${new Date(x.expiry_date) < new Date() ? "expired" : "expires"} ${format(new Date(x.expiry_date), "d MMM")}`, link: `/dashboard/procurement/suppliers/${x.supplier}?tab=documents` })),
              },
            ]} />
        )}
      </Panel>

      <Panel title="Recently approved" subtitle="Ready for sourcing — create an RFQ from the requisition" action={{ label: "All approved", onClick: () => navigate("/dashboard/procurement/requisitions?view=approved") }}>
        {q.isLoading ? <ListSkeleton rows={3} /> : !stats?.approved.length ? (
          <EmptyState icon={CheckCircle2} text="No approved requisitions in this period" />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="dnr-grid w-full min-w-[560px] text-[13px]">
              <tbody className="divide-y divide-slate-100">
                {[...stats.approved].sort((a: any, b: any) => (b.approved_at || "").localeCompare(a.approved_at || "")).slice(0, 6).map((r: any) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/procurement/requisitions/${r.id}`)}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{r.number}</td>
                    <td className="max-w-[280px] truncate px-4 py-2.5 text-slate-700">{r.title}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{r.expand?.department?.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{money(r.total, r.currency)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} map={DOC_STATUS} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-500">{r.approved_at ? format(new Date(r.approved_at), "d MMM yyyy") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

type ExceptionRow = { id: string; label: string; sub: string; link: string };

/** Only groups with items are shown; clear groups are summarised in one line. */
function ExceptionGroups({ groups }: { groups: { title: string; rows: ExceptionRow[] }[] }) {
  const navigate = useNavigate();
  const open = groups.filter((g) => g.rows.length);
  const clear = groups.filter((g) => !g.rows.length);
  return (
    <div className="space-y-3">
      {!open.length && <p className="flex items-center gap-2 text-[13px] text-emerald-700"><CheckCircle2 size={15} /> Nothing needs attention right now.</p>}
      {open.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {open.map((group) => (
            <li key={group.title} className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
              <p className="mb-2 flex items-center justify-between text-[12.5px] font-semibold text-slate-700">
                {group.title} <span className="rounded-full bg-amber-100 px-2 text-[11px] text-amber-800">{group.rows.length}</span>
              </p>
              <ul className="space-y-1.5">
                {group.rows.slice(0, 4).map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => navigate(row.link)} className="w-full text-left text-[12.5px] hover:underline">
                      <span className="block truncate text-slate-800">{row.label}</span>
                      <span className="block truncate text-slate-500">{row.sub}</span>
                    </button>
                  </li>
                ))}
                {group.rows.length > 4 && <li className="text-[12px] text-slate-500">+{group.rows.length - 4} more</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {clear.length > 0 && <p className="text-[12px] text-slate-400">No issues: {clear.map((g) => g.title.toLowerCase()).join(" · ")}</p>}
    </div>
  );
}
