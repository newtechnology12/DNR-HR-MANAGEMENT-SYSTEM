import * as React from "react";
import { useQuery } from "react-query";
import { Link, useNavigate } from "react-router-dom";
import { differenceInHours, format, formatDistanceToNowStrict, startOfMonth, startOfQuarter, startOfYear, subMonths } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Clock, FileSignature, Plus, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { CHART, ChartTooltip, HorizontalBars, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import {
  Card,
  CardHeader,
  Column,
  DataTable,
  Details,
  DocNo,
  EmptyState,
  FilterBar,
  FilterSelect,
  KpiBand,
  Num,
  Page,
  PageHeader,
  Pill,
  fmtDate,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
  overdue,
  sentence,
} from "@/components/ims";
import { DOC_STATUS, compactMoney, phase5Api } from "@/lib/procurement";

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

  const cycleLabel = stats?.avgCycle == null ? "—" : stats.avgCycle < 1 ? "Under 1 hour" : stats.avgCycle < 48 ? `${Math.round(stats.avgCycle)} hours` : `${(stats.avgCycle / 24).toFixed(1)} days`;
  const periodLabel = PERIODS.find((p) => p.key === period)?.label;
  const lookup = (list: any[] | undefined, id: string) => list?.find((x: any) => x.id === id)?.name || "…";
  const chips = [
    ...(filters.department ? [{ key: "department", label: `Department: ${lookup(lookups.data?.departments, filters.department)}`, onRemove: () => setFilters((f) => ({ ...f, department: "" })) }] : []),
    ...(filters.supplier ? [{ key: "supplier", label: `Supplier: ${lookup(lookups.data?.suppliers, filters.supplier)}`, onRemove: () => setFilters((f) => ({ ...f, supplier: "" })) }] : []),
  ];
  const canReports = canPerform("view_procurement_reports") || canPerform("view_procurement_dashboard");

  const approvedColumns: Column<any>[] = [
    { key: "number", header: "Number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    { key: "title", header: "Title", clamp: true, cell: (r) => r.title, sub: (r) => r.expand?.department?.name },
    { key: "total", header: "Total (RWF)", numeric: true, cell: (r) => <Num value={r.total} /> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} hideNote /> },
    { key: "approved_at", header: "Approved", nowrap: true, cell: (r) => fmtDate(r.approved_at) },
  ];
  const recentlyApproved = stats ? [...stats.approved].sort((a: any, b: any) => (b.approved_at || "").localeCompare(a.approved_at || "")).slice(0, 6) : [];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement" }]}
        title="Procurement overview"
        subtitle="Requisitions, sourcing and orders at a glance, for the records your role can see."
        primary={canPerform("create_purchase_requisition") ? { label: "New requisition", icon: Plus, to: "/dashboard/procurement/requisitions/new" } : undefined}
        secondary={canReports ? [{ label: "Reports", icon: BarChart3, to: "/dashboard/procurement/reports" }] : []}
      />

      <Card padded={false}>
        <FilterBar
          chips={chips}
          onClear={() => setFilters({ department: "", supplier: "" })}
          right={<span className="text-t-small text-ims-muted">The supplier filter applies to orders and deliveries.</span>}
        >
          <FilterSelect label="Period" all={false} value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} />
          <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilters((f) => ({ ...f, department: v }))} options={(lookups.data?.departments || []).map((x: any) => ({ value: x.id, label: x.name }))} />
          <FilterSelect label="Supplier" value={filters.supplier} onChange={(v) => setFilters((f) => ({ ...f, supplier: v }))} options={(lookups.data?.suppliers || []).map((x: any) => ({ value: x.id, label: x.name }))} className="[&_select]:w-[220px]" />
        </FilterBar>
      </Card>

      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Waiting for my approval", value: fmtNumber(stats?.awaitingMe.length), tone: stats?.awaitingMe.length ? "warning" : "default", sub: "Requisitions", to: "/dashboard/procurement/approvals" },
          { label: "In approval", value: fmtNumber(stats?.pending.length), sub: fmtMoneyShort(stats?.pending.reduce((a: number, r: any) => a + r.total, 0)), to: "/dashboard/procurement/requisitions?view=pending" },
          { label: "Approved", value: fmtMoneyShort(stats?.approvedValue), tone: "success", sub: `${plural(stats?.approved.length, "requisition")} · ${periodLabel?.toLowerCase()}`, to: "/dashboard/procurement/requisitions?view=approved" },
          { label: "RFQs to award", value: fmtNumber(stats?.rfqToAward.length), tone: stats?.rfqToAward.length ? "warning" : "default", sub: `${fmtNumber(stats?.rfqOpen.length)} still open`, to: "/dashboard/procurement/rfqs?view=evaluate" },
          { label: "Committed in orders", value: fmtMoneyShort(stats?.committed), sub: `${plural(stats?.poOpen.length, "open order")}`, to: "/dashboard/procurement/purchase-orders?view=open" },
          { label: "Late deliveries", value: fmtNumber(stats?.overdue.length), tone: stats?.overdue.length ? "danger" : "default", sub: "Past the expected date", to: "/dashboard/procurement/purchase-orders?view=overdue" },
        ]}
      />

      {(d?.alerts || []).length > 0 && (
        <Card>
          <CardHeader title="Contract alerts" subtitle="Expiry, renewal decisions, spend limits and missing documents." link={{ label: "All contracts", to: "/dashboard/procurement/contracts" }} />
          <ul className="divide-y divide-ims-divider">
            {(d!.alerts as any[]).slice(0, 8).map((a) => (
              <li key={a.contract + a.key}>
                <Link to={`/dashboard/procurement/contracts/${a.contract}`} className="flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left hover:bg-ims-hover">
                  {a.level === "danger" ? <AlertTriangle size={16} className="shrink-0 text-ims-danger" aria-hidden /> : <FileSignature size={16} className="shrink-0 text-ims-warning" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-body text-ims-text">{datesInText(a.text)}</span>
                    <span className="block truncate text-t-small text-ims-muted">{a.title}</span>
                  </span>
                  <span className={cn("shrink-0 text-t-small font-semibold", a.level === "danger" ? "text-ims-danger" : "text-ims-warning")}>{a.level === "danger" ? "Action needed" : "Check soon"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Requested value by month" subtitle="Submitted requisitions in the last 12 months, in RWF." />
          {q.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !stats?.trend.some((t) => t.approved + t.other > 0) ? (
            <EmptyState icon={ClipboardList} text="No requisitions were submitted in the last 12 months." />
          ) : (
            <div className="h-[260px]" role="img" aria-label="Stacked bars of approved and other requested value per month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={(v) => compactMoney(v, "").trim()} width={48} />
                  <Tooltip content={<ChartTooltip format={(v: number) => fmtMoney(v)} />} cursor={{ fill: CHART.grid }} />
                  <Bar isAnimationActive={false} dataKey="approved" name="Approved" stackId="a" fill={CHART.series1} />
                  <Bar isAnimationActive={false} dataKey="other" name="Pending and other" stackId="a" fill={CHART.series2} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="-mt-1 flex justify-end gap-4 text-t-small text-ims-muted">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.series1 }} />Approved</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.series2 }} />Pending and other</span>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Approval queue" subtitle="Oldest first. Long waits are marked." link={{ label: "All pending", to: "/dashboard/procurement/requisitions?view=pending" }} />
          {q.isLoading ? (
            <ListSkeleton rows={5} />
          ) : !d?.openApprovals.length ? (
            <EmptyState compact icon={CheckCircle2} text="Nothing is waiting for approval." />
          ) : (
            <ul className="max-h-[300px] divide-y divide-ims-divider overflow-y-auto">
              {(d.openApprovals as any[]).slice(0, 12).map((r) => {
                const hours = r.submitted_at ? differenceInHours(new Date(), new Date(r.submitted_at)) : 0;
                const mine = (r.pending_approvers || "").split(",").includes(d.me?.id);
                return (
                  <li key={r.id}>
                    <Link to={`/dashboard/procurement/requisitions/${r.id}`} className="flex w-full items-start gap-3 rounded-control px-2 py-2.5 text-left hover:bg-ims-hover">
                      <Clock size={16} className={cn("mt-0.5 shrink-0", hours > 72 ? "text-ims-danger" : hours > 24 ? "text-ims-warning" : "text-ims-faint")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-t-body font-semibold text-ims-text"><span className="whitespace-nowrap font-mono text-[13px]">{r.number}</span> · {r.title}</span>
                        <span className="block truncate text-t-small text-ims-muted">
                          {fmtMoney(r.total)} · <span className={cn(hours > 72 && "font-semibold text-ims-danger")}>{r.submitted_at ? formatDistanceToNowStrict(new Date(r.submitted_at)) : "—"}</span>
                          {mine ? <span className="font-semibold text-ims-warning"> · your decision</span> : ` · ${r.expand?.requester?.name || ""}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Approved value by department" subtitle={periodLabel} />
          {q.isLoading ? <Skeleton className="h-[220px] w-full" /> : !stats?.byDepartment.length ? (
            <EmptyState compact icon={Wallet} text="No requisitions were approved in this period." />
          ) : (
            <HorizontalBars data={stats.byDepartment} label="Approved value" format={(v) => compactMoney(v, "")} />
          )}
        </Card>
        <Card>
          <CardHeader title="Approved value by category" subtitle={periodLabel} />
          {q.isLoading ? <Skeleton className="h-[220px] w-full" /> : !stats?.byCategory.length ? (
            <EmptyState compact icon={Wallet} text="No requisitions were approved in this period." />
          ) : (
            <HorizontalBars data={stats.byCategory} label="Approved value" format={(v) => compactMoney(v, "")} labelWidth={150} />
          )}
        </Card>
        <Card>
          <CardHeader title="Requisitions by status" subtitle={periodLabel} />
          {q.isLoading ? <Skeleton className="h-[220px] w-full" /> : !stats?.statusCounts.length ? (
            <EmptyState compact icon={ClipboardList} text="No requisitions in this period." />
          ) : (
            <HorizontalBars data={stats.statusCounts} label="Requisitions" />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Performance" subtitle={`${periodLabel}. How fast and how well requests turn into orders.`} />
        {q.isLoading ? <ListSkeleton rows={2} /> : (
          <Details
            columns={3}
            items={[
              { label: "Requisitions raised", value: fmtNumber(stats?.total), hint: `${fmtNumber(stats?.drafts)} still in draft` },
              { label: "Time to approve", value: cycleLabel, hint: "From submission to approval, on average" },
              { label: "Approval rate", value: stats?.approvalRate == null ? "—" : `${stats.approvalRate}%`, hint: `${fmtNumber(stats?.rejected)} rejected · ${fmtNumber(stats?.returned)} returned` },
              { label: "Awarded from RFQs", value: fmtMoney(stats?.awardedValue), hint: `${plural(stats?.awardedCount, "RFQ")}${stats?.notLowest ? ` · ${stats.notLowest} not to the lowest bid` : ""}` },
              { label: "Savings against estimates", value: <span className={(stats?.savings ?? 0) < 0 ? "text-ims-danger" : undefined}>{fmtMoney(stats?.savings)}</span>, hint: stats?.savingsPct == null ? "Compared with the approved estimate" : `${stats.savingsPct}% below the approved estimate` },
              { label: "Received from suppliers", value: fmtMoney(stats?.receivedValue), hint: `${plural(stats?.poPending.length, "order")} waiting for approval · ${plural(d?.expiringDocs.length, "supplier document")} expiring` },
            ]}
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Needs attention" subtitle="Worked out from live records." />
        {q.isLoading ? <ListSkeleton rows={3} /> : (
          <ExceptionGroups groups={[
              {
                title: "Approvals waiting more than 3 days",
                rows: (d?.openApprovals as any[] || []).filter((r) => r.submitted_at && differenceInHours(new Date(), new Date(r.submitted_at)) > 72).map((r) => ({ id: r.id, label: `${r.number} · ${r.title}`, sub: `Waiting ${formatDistanceToNowStrict(new Date(r.submitted_at))}`, link: `/dashboard/procurement/requisitions/${r.id}` })),
              },
              {
                title: "RFQs past their closing date",
                rows: (stats?.rfqToAward || []).filter((x: any) => x.status === "sent").map((x: any) => ({ id: x.id, label: `${x.number} · ${x.title}`, sub: `Closed ${fmtDate(x.closing_date)}. Close it and evaluate the quotes.`, link: `/dashboard/procurement/rfqs/${x.id}` })),
              },
              {
                title: "Late deliveries",
                rows: (stats?.overdue || []).map((p: any) => ({ id: p.id, label: `${p.number} · ${p.expand?.supplier?.name || ""}`, sub: `Expected ${fmtDate(p.expected_delivery_date)} · ${overdue(p.expected_delivery_date) || "Overdue"}`, link: `/dashboard/procurement/purchase-orders/${p.id}` })),
              },
              {
                title: "Deliveries with rejected items",
                rows: (d?.rejectedReceipts as any[] || []).map((g) => ({ id: g.id, label: `${g.number} · ${g.expand?.supplier?.name || ""}`, sub: `On ${g.expand?.purchase_order?.number} · ${fmtDate(g.receipt_date)}`, link: `/dashboard/procurement/purchase-orders/${g.purchase_order}?tab=receipts` })),
              },
              {
                title: "Direct purchases without competition",
                rows: (stats?.direct || []).map((p: any) => ({ id: p.id, label: `${p.number} · ${p.title}`, sub: `${p.expand?.supplier?.name || ""} · ${fmtMoney(p.grand_total)}`, link: `/dashboard/procurement/purchase-orders/${p.id}` })),
              },
              {
                title: "Supplier documents expiring",
                rows: (d?.expiringDocs as any[] || []).map((x) => ({ id: x.id, label: x.expand?.supplier?.name, sub: `${sentence(x.document_type)} · ${new Date(x.expiry_date) < new Date() ? "expired" : "expires"} ${fmtDate(x.expiry_date)}`, link: `/dashboard/procurement/suppliers/${x.supplier}?tab=documents` })),
              },
            ]} />
        )}
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardHeader title="Recently approved" subtitle="Ready for sourcing: create an RFQ from the requisition." link={{ label: "All approved", to: "/dashboard/procurement/requisitions?view=approved" }} />
        </div>
        <DataTable
          columns={approvedColumns}
          rows={recentlyApproved}
          rowKey={(r) => r.id}
          loading={q.isLoading}
          onRowClick={(r) => navigate(`/dashboard/procurement/requisitions/${r.id}`)}
          minWidth={620}
          caption="Recently approved requisitions"
          empty={<EmptyState compact icon={CheckCircle2} text="No requisitions were approved in this period." />}
        />
      </Card>
    </Page>
  );
}

const plural = (n: number | undefined, word: string) => `${fmtNumber(n ?? 0)} ${word}${n === 1 ? "" : "s"}`;

/** Server alert text carries ISO dates ("ends on 2026-11-30"); show them as "30 Nov 2026". */
const datesInText = (text: string) => String(text || "").replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => fmtDate(d));

type ExceptionRow = { id: string; label: string; sub: string; link: string };

/** Only groups with items are shown; clear groups are summarised in one line. */
function ExceptionGroups({ groups }: { groups: { title: string; rows: ExceptionRow[] }[] }) {
  const open = groups.filter((g) => g.rows.length);
  const clear = groups.filter((g) => !g.rows.length);
  return (
    <div className="space-y-3">
      {!open.length && <p className="flex items-center gap-2 text-t-body text-ims-success"><CheckCircle2 size={16} aria-hidden /> Nothing needs attention right now.</p>}
      {open.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {open.map((group) => (
            <li key={group.title} className="rounded-control border border-ims-border p-3.5">
              <p className="mb-2 flex items-center justify-between gap-2 text-t-body font-bold text-ims-text">
                {group.title} <Pill tone="warning">{group.rows.length}</Pill>
              </p>
              <ul className="space-y-2">
                {group.rows.slice(0, 4).map((row) => (
                  <li key={row.id}>
                    <Link to={row.link} className="block rounded-sm text-t-small hover:underline">
                      <span className="block truncate text-t-body text-ims-text">{row.label}</span>
                      <span className="block truncate text-ims-muted">{row.sub}</span>
                    </Link>
                  </li>
                ))}
                {group.rows.length > 4 && <li className="text-t-small text-ims-muted">and {group.rows.length - 4} more</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {clear.length > 0 && <p className="text-t-small text-ims-muted">Nothing to report on: {clear.map((g) => (/^[A-Z]{2}/.test(g.title) ? g.title : g.title.charAt(0).toLowerCase() + g.title.slice(1))).join(" · ")}.</p>}
    </div>
  );
}
