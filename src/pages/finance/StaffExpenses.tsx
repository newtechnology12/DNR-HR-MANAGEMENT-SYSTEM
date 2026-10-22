/**
 * Payables → Staff expenses & advances: reimbursements and salary advances asked for by staff. Heads of department
 * and the Director of Finance approve them; the Cashier pays them from a cash book (petty cash, mobile money, bank);
 * advances are then recovered by the payroll.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { Banknote, Eye, Plus, Receipt } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { pbQuote } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { EXPENSE_KIND, EXPENSE_STATUS, EXPENSE_WORD, PAY_BY } from "@/lib/expenses";
import ExportMenu from "@/components/enterprise/ExportMenu";
import ExpenseRequestDialog from "@/components/expenses/ExpenseRequestDialog";
import PayExpenseDialog from "@/components/expenses/PayExpenseDialog";
import {
  Card, Column, DataTable, DateRangeFilter, DocNo, EmptyState, FilterBar, FilterChip, FilterSelect, KpiBand, Num, Page, PageHeader, Pager, Person, StatusPill, Tabs, TwoLine, fmtDate, fmtMoneyShort,
} from "@/components/ims";

const sum = (rows: any[]) => rows.reduce((t, r) => t + Math.round(r.amount || 0), 0);

export default function StaffExpenses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const cashier = can("record_payments");
  const VIEWS: Record<string, { label: string; filter: string }> = {
    approve: { label: "Waiting for me", filter: `pending_approvers ~ ${pbQuote(user?.id || "-")}` },
    pay: { label: "To pay", filter: 'status = "approved"' },
    paid: { label: "Paid", filter: 'status = "paid" || status = "recovered"' },
    advances: { label: "Advances", filter: 'kind = "advance"' },
    all: { label: "All", filter: "" },
  };
  const [params, setParams] = useSearchParams();
  const fallback = cashier ? "pay" : "approve";
  const view = VIEWS[params.get("view") || ""] ? (params.get("view") as string) : fallback;
  const [search, setSearch] = React.useState("");
  const [q] = useDebounce(search, 300);
  const [kind, setKind] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [range, setRange] = React.useState<[string, string]>(["", ""]);
  const [sort, setSort] = React.useState("-created");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(15);
  const [asking, setAsking] = React.useState(false);
  const [paying, setPaying] = React.useState<any | null>(null);

  const filter = React.useMemo(() => {
    const parts = ['number != ""', VIEWS[view].filter];
    if (q.trim()) parts.push(["number", "description", "employee.name"].map((f) => `${f} ~ ${pbQuote(q.trim())}`).join(" || "));
    if (kind) parts.push(`kind = ${pbQuote(kind)}`);
    if (department) parts.push(`department = ${pbQuote(department)}`);
    if (status) parts.push(`status = ${pbQuote(status)}`);
    if (range[0]) parts.push(`date >= ${pbQuote(`${range[0]} 00:00:00.000Z`)}`);
    if (range[1]) parts.push(`date <= ${pbQuote(`${range[1]} 23:59:59.999Z`)}`);
    return parts.filter(Boolean).map((p) => `(${p})`).join(" && ");
  }, [view, q, kind, department, status, range]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => setPage(1), [filter, sort]);

  const list = useQuery(["staff-expenses", filter, sort, page, perPage], () => pocketbase.collection("prepayments").getList(page, perPage, { filter, sort: `${sort},-number`, expand: "employee,department,expenseCategory" }), { keepPreviousData: true });
  const kpis = useQuery(["staff-expense-kpis", user?.id], async () => {
    const rows = await pocketbase.collection("prepayments").getFullList({ filter: 'number != "" && (status = "pending_approval" || status = "approved" || status = "paid" || status = "recovered")', fields: "id,status,kind,amount,paid_at,pending_approvers", batch: 1000 });
    const month = new Date().toISOString().slice(0, 7);
    const waiting = rows.filter((r: any) => r.status === "pending_approval");
    const mineToApprove = waiting.filter((r: any) => String(r.pending_approvers || "").split(",").includes(user?.id));
    const toPay = rows.filter((r: any) => r.status === "approved");
    const paidMonth = rows.filter((r: any) => (r.status === "paid" || r.status === "recovered") && String(r.paid_at).slice(0, 7) === month);
    const outstanding = rows.filter((r: any) => r.kind === "advance" && r.status === "paid");
    return { waiting, mineToApprove, toPay, paidMonth, outstanding };
  });
  const departments = useQuery(["departments-list"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }), { staleTime: 300_000 });

  const chips: FilterChip[] = [
    kind && { key: "kind", label: `Type: ${EXPENSE_KIND[kind]}`, onRemove: () => setKind("") },
    department && { key: "department", label: `Department: ${(departments.data || []).find((d: any) => d.id === department)?.name || "…"}`, onRemove: () => setDepartment("") },
    status && { key: "status", label: `Status: ${EXPENSE_STATUS[status]?.note || EXPENSE_STATUS[status]?.label || status}`, onRemove: () => setStatus("") },
    (range[0] || range[1]) && { key: "range", label: `Date: ${range[0] ? fmtDate(range[0]) : "…"} – ${range[1] ? fmtDate(range[1]) : "…"}`, onRemove: () => setRange(["", ""]) },
  ].filter(Boolean) as FilterChip[];

  const doExport = async (format: ExportFormat) => {
    const rows: any[] = await pocketbase.collection("prepayments").getFullList({ filter, sort: `${sort},-number`, expand: "employee,department,expenseCategory,paid_from", batch: 500 });
    await exportReport({
      title: "Staff expenses and advances", subtitle: [VIEWS[view].label, ...chips.map((c) => c.label), q && `Search: “${q}”`].filter(Boolean).join(" · "), rows, format,
      what: "prepayments", fileName: "staff-expenses", orientation: "landscape", totals: ["Amount"],
      columns: [
        { header: "Request", value: (r) => r.number, width: 16 }, { header: "Type", value: (r) => EXPENSE_KIND[r.kind] || "", width: 14 },
        { header: "Staff", value: (r) => r.expand?.employee?.name || "", width: 22 }, { header: "Department", value: (r) => r.expand?.department?.name || "", width: 22 },
        { header: "Category", value: (r) => r.expand?.expenseCategory?.name || "", width: 24 }, { header: "Description", value: (r) => r.description, width: 40 },
        { header: "Date", value: (r) => r.date, format: "date" }, { header: "Amount", value: (r) => Math.round(r.amount), format: "money" },
        { header: "Status", value: (r) => (EXPENSE_STATUS[r.status] ? [EXPENSE_STATUS[r.status].label, EXPENSE_STATUS[r.status].note].filter(Boolean).join(" · ") : r.status), width: 18 },
        { header: "Paid", value: (r) => r.paid_at, format: "date" }, { header: "Paid from", value: (r) => (r.expand?.paid_from ? `${r.expand.paid_from.code} · ${PAY_BY[r.payment_method] || ""}` : ""), width: 18 },
      ],
    });
  };

  const columns: Column<any>[] = [
    { key: "number", header: "Request", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => EXPENSE_KIND[r.kind] },
    { key: "employee", header: "Staff", cell: (r) => <Person name={r.expand?.employee?.name} detail={r.expand?.department?.name} /> },
    { key: "description", header: "What for", clamp: true, width: "34%", cell: (r) => <TwoLine main={r.description} sub={r.expand?.expenseCategory?.name} /> },
    { key: "date", header: "Date", sortField: "date", nowrap: true, cell: (r) => fmtDate(r.date), sub: (r) => PAY_BY[r.pay_by] },
    { key: "amount", header: "Amount (RWF)", numeric: true, sortField: "amount", cell: (r) => <Num value={Math.round(r.amount)} /> },
    {
      key: "status", header: "Status", sortField: "status", nowrap: true,
      cell: (r) => <StatusPill status={r.status} map={EXPENSE_WORD} sub={r.status === "pending_approval" && String(r.pending_approvers || "").split(",").includes(user?.id) ? "Waiting for you" : r.status === "paid" && r.kind === "advance" ? "Paid · to recover" : EXPENSE_STATUS[r.status]?.note} />,
    },
  ];

  const k = kpis.data;
  const tabs = Object.entries(VIEWS).map(([key, v]) => ({ key, label: v.label, count: key === "approve" ? k?.mineToApprove.length : key === "pay" ? k?.toPay.length : undefined }));
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Payables" }, { label: "Staff expenses & advances" }]}
        title="Staff expenses & advances"
        subtitle="Reimbursements and salary advances asked for by staff. Heads of department and the Director of Finance approve; the Cashier pays from a cash book."
        primary={{ label: "Ask for money", icon: Plus, onClick: () => setAsking(true) }}
      />
      <KpiBand
        loading={kpis.isLoading}
        items={[
          { label: "Waiting for approval", value: k?.waiting.length ?? 0, sub: k ? `${fmtMoneyShort(sum(k.waiting))}${k.mineToApprove.length ? ` · ${k.mineToApprove.length} for you` : ""}` : undefined, tone: k?.mineToApprove.length ? "warning" : "default", onClick: () => setParams({ view: "approve" }) },
          { label: "To pay", value: k?.toPay.length ?? 0, sub: k ? fmtMoneyShort(sum(k.toPay)) : undefined, tone: k?.toPay.length ? "warning" : "default", onClick: () => setParams({ view: "pay" }) },
          { label: "Paid this month", value: k ? fmtMoneyShort(sum(k.paidMonth)) : "—", sub: k ? `${k.paidMonth.length} request${k.paidMonth.length === 1 ? "" : "s"}` : undefined },
          { label: "Advances to recover", value: k ? fmtMoneyShort(sum(k.outstanding)) : "—", sub: k ? `${k.outstanding.length} through the next payroll` : undefined, onClick: () => setParams({ view: "advances" }) },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <Tabs inset active={view} onChange={(key) => setParams({ view: key })} tabs={tabs} />
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search number, staff or description" }}
          chips={chips}
          onClear={() => { setKind(""); setDepartment(""); setStatus(""); setRange(["", ""]); }}
          right={<ExportMenu permission={["view_expenses", "view_expense_reports"]} onExport={doExport} />}
        >
          <FilterSelect label="Type" value={kind} onChange={setKind} options={Object.entries(EXPENSE_KIND).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={(departments.data || []).map((d: any) => ({ value: d.id, label: d.name }))} />
          {view === "all" && <FilterSelect label="Status" value={status} onChange={setStatus} options={Object.entries(EXPENSE_STATUS).filter(([s]) => s !== "draft").map(([value, v]) => ({ value, label: v.note ? `${v.label} · ${v.note}` : v.label }))} />}
          <DateRangeFilter label="Date" from={range[0]} to={range[1]} onChange={(a, b) => setRange([a, b])} />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={(list.data?.items || []) as any[]}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/dashboard/finance/staff-expenses/${r.id}`)}
          rowActions={(r) => [
            { label: "Open", icon: Eye, onSelect: () => navigate(`/dashboard/finance/staff-expenses/${r.id}`) },
            ...(cashier && r.status === "approved" && r.employee !== user?.id ? [{ label: "Pay", icon: Banknote, onSelect: () => setPaying(r) }] : []),
          ]}
          sort={sort}
          onSort={setSort}
          loading={list.isLoading}
          fetching={list.isFetching && !list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          minWidth={980}
          empty={<EmptyState icon={Receipt} text={view === "approve" ? "Nothing is waiting for your approval." : view === "pay" ? "Nothing approved is waiting to be paid." : "No request matches these filters."} />}
          footer={<Pager page={page} perPage={perPage} total={list.data?.totalItems || 0} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />}
        />
      </Card>
      <ExpenseRequestDialog open={asking} onClose={() => setAsking(false)} onSaved={() => { list.refetch(); kpis.refetch(); }} />
      {paying && <PayExpenseDialog request={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); list.refetch(); kpis.refetch(); }} />}
    </Page>
  );
}
