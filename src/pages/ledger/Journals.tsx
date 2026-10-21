/**
 * General ledger → Journal entries: every posting to the ledger. Automatic journals come from the modules (payroll,
 * invoices, payments, receipts, transfers, depreciation…); manual journals are prepared by the Accountant and
 * approved by the Director of Finance. Posted journals are never changed — a mistake is corrected by a reversal.
 */
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { BookOpen, Plus, Repeat, Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { pbQuote } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { JOURNAL_SOURCES, JOURNAL_TYPES, JOURNAL_WORD, sourceLink } from "@/lib/ledger";
import ExportMenu from "@/components/enterprise/ExportMenu";
import {
  Button, Card, Column, DataTable, DateRangeFilter, DocNo, EmptyState, FilterBar, FilterChip, FilterSelect, KpiBand, Num, Page, PageHeader, Pager, StatusPill, Tabs, TwoLine, fmtDate, fmtMoneyShort,
} from "@/components/ims";

const VIEWS: Record<string, { label: string; filter: string }> = {
  all: { label: "All journals", filter: "" },
  pending: { label: "Waiting for approval", filter: 'status = "pending_approval"' },
  drafts: { label: "Drafts", filter: 'status = "draft" || status = "returned"' },
  manual: { label: "Manual", filter: 'journal_type = "manual" || journal_type = "recurring"' },
  reversed: { label: "Reversed", filter: 'status = "reversed" || journal_type = "reversal"' },
};

const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

export default function Journals() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const view = VIEWS[params.get("view") || ""] ? (params.get("view") as string) : "all";
  const [search, setSearch] = React.useState("");
  const [q] = useDebounce(search, 300);
  const [source, setSource] = React.useState("");
  const [type, setType] = React.useState("");
  const [range, setRange] = React.useState<[string, string]>(["", ""]);
  const [sort, setSort] = React.useState("-date");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(15);

  const filter = React.useMemo(() => {
    const parts = [VIEWS[view].filter];
    if (q.trim()) parts.push(["number", "description", "source_number"].map((f) => `${f} ~ ${pbQuote(q.trim())}`).join(" || "));
    if (source) parts.push(`source_type = ${pbQuote(source)}`);
    if (type) parts.push(`journal_type = ${pbQuote(type)}`);
    if (range[0]) parts.push(`date >= ${pbQuote(`${range[0]} 00:00:00.000Z`)}`);
    if (range[1]) parts.push(`date <= ${pbQuote(`${range[1]} 23:59:59.999Z`)}`);
    return parts.filter(Boolean).map((p) => `(${p})`).join(" && ");
  }, [view, q, source, type, range]);
  React.useEffect(() => setPage(1), [filter, sort]);

  const list = useQuery(["journals", filter, sort, page, perPage], () => pocketbase.collection("gl_journals").getList(page, perPage, { filter, sort: `${sort},-number`, expand: "period,prepared_by,reversed_by" }), { keepPreviousData: true });
  const counts = useQuery(["journal-counts"], async () => {
    const n = async (f: string) => (await pocketbase.collection("gl_journals").getList(1, 1, { filter: f, fields: "id" })).totalItems;
    const month = await pocketbase.collection("gl_journals").getFullList({ filter: `status = "posted" && date >= "${monthStart()} 00:00:00.000Z"`, fields: "total_debit" });
    const due = await pocketbase.collection("gl_recurring_journals").getList(1, 1, { filter: `active = true && next_date <= "${new Date().toISOString().slice(0, 10)} 23:59:59.999Z"`, fields: "id" }).then((r) => r.totalItems).catch(() => 0);
    return { pending: await n(VIEWS.pending.filter), drafts: await n(VIEWS.drafts.filter), month: month.length, monthAmount: month.reduce((t: number, j: any) => t + j.total_debit, 0), due };
  });

  const chips: FilterChip[] = [
    source && { key: "source", label: `Source: ${JOURNAL_SOURCES[source] || source}`, onRemove: () => setSource("") },
    type && { key: "type", label: `Type: ${JOURNAL_TYPES[type] || type}`, onRemove: () => setType("") },
    (range[0] || range[1]) && { key: "range", label: `Date: ${range[0] ? fmtDate(range[0]) : "…"} – ${range[1] ? fmtDate(range[1]) : "…"}`, onRemove: () => setRange(["", ""]) },
  ].filter(Boolean) as FilterChip[];

  const doExport = async (format: ExportFormat) => {
    const rows: any[] = await pocketbase.collection("gl_journals").getFullList({ filter, sort: `${sort},-number`, expand: "prepared_by", batch: 500 });
    await exportReport({
      title: "Journal entries", subtitle: [VIEWS[view].label, ...chips.map((c) => c.label), q && `Search: “${q}”`].filter(Boolean).join(" · "), rows, format, what: "gl_journals", fileName: "journal-entries", orientation: "landscape", totals: ["Amount"],
      columns: [
        { header: "Journal", value: (j) => j.number, width: 16 }, { header: "Date", value: (j) => j.date, format: "date" }, { header: "Type", value: (j) => JOURNAL_TYPES[j.journal_type] || j.journal_type, width: 12 },
        { header: "Description", value: (j) => j.description, width: 44 }, { header: "Source", value: (j) => `${JOURNAL_SOURCES[j.source_type] || j.source_type || ""} ${j.source_number || ""}`.trim(), width: 24 },
        { header: "Lines", value: (j) => j.line_count, format: "number" }, { header: "Amount", value: (j) => j.total_debit, format: "money" }, { header: "Status", value: (j) => j.status, width: 12 },
      ],
    });
  };

  const columns: Column<any>[] = [
    { key: "number", header: "Journal", sortField: "number", nowrap: true, cell: (j) => <DocNo value={j.number} />, sub: (j) => JOURNAL_TYPES[j.journal_type] || j.journal_type },
    { key: "date", header: "Date", sortField: "date", nowrap: true, cell: (j) => fmtDate(j.date), sub: (j) => j.expand?.period?.name },
    {
      key: "description", header: "Description", sortField: "description", clamp: true, width: "38%",
      cell: (j) => (
        <TwoLine
          main={j.description}
          sub={
            <>
              {JOURNAL_SOURCES[j.source_type] || "—"}
              {j.source_number && j.source_type !== "manual" && (sourceLink(j.source_type, j.source_id)
                ? <> · <Link data-no-row-click className="font-mono text-ims-link hover:underline" to={sourceLink(j.source_type, j.source_id)}>{j.source_number}</Link></>
                : <> · <span className="font-mono">{j.source_number}</span></>)}
            </>
          }
        />
      ),
    },
    { key: "lines", header: "Lines", numeric: true, sortField: "line_count", cell: (j) => <Num value={j.line_count} /> },
    { key: "amount", header: "Amount (RWF)", numeric: true, nowrap: true, sortField: "total_debit", cell: (j) => <Num value={j.total_debit} /> },
    {
      key: "status", header: "Status", sortField: "status", nowrap: true,
      cell: (j) => <StatusPill status={j.status} map={JOURNAL_WORD} sub={j.status === "posted" ? "Posted" : j.status === "reversed" ? `Reversed${j.expand?.reversed_by ? ` by ${j.expand.reversed_by.number}` : ""}` : j.status === "pending_approval" ? "With the DAF" : undefined} />,
    },
  ];

  const tabs = Object.entries(VIEWS).map(([key, v]) => ({ key, label: v.label, count: key === "pending" ? counts.data?.pending : key === "drafts" ? counts.data?.drafts : undefined }));
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "General ledger", to: "/dashboard/finance/journals" }, { label: "Journal entries" }]}
        title="Journal entries"
        subtitle="Every posting to the general ledger, balanced and linked to the document that caused it. Posted journals are never changed; a mistake is corrected by a reversal."
        primary={can("manage_journals") ? { label: "New journal", icon: Plus, to: "/dashboard/finance/journals/new" } : undefined}
        secondary={[{ label: "Recurring journals", icon: Repeat, to: "/dashboard/finance/recurring-journals" }, { label: "Trial balance", icon: Scale, to: "/dashboard/finance/trial-balance" }]}
      />
      <KpiBand
        loading={counts.isLoading}
        items={[
          { label: "Waiting for approval", value: counts.data?.pending ?? 0, sub: "manual journals with the DAF", tone: counts.data?.pending ? "warning" : "default", onClick: () => setParams({ view: "pending" }) },
          { label: "Drafts", value: counts.data?.drafts ?? 0, sub: "prepared, not sent", onClick: () => setParams({ view: "drafts" }) },
          { label: "Posted this month", value: counts.data?.month ?? 0, sub: fmtMoneyShort(counts.data?.monthAmount || 0) },
          { label: "Recurring due", value: counts.data?.due ?? 0, sub: "templates to generate", tone: counts.data?.due ? "warning" : "default", to: "/dashboard/finance/recurring-journals" },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <Tabs inset active={view} onChange={(k) => setParams(k === "all" ? {} : { view: k })} tabs={tabs} />
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search number, description or document" }}
          chips={chips}
          onClear={() => { setSource(""); setType(""); setRange(["", ""]); }}
          right={<ExportMenu permission={["export_ledger", "view_journals"]} onExport={doExport} />}
        >
          <FilterSelect label="Source" value={source} onChange={setSource} options={Object.entries(JOURNAL_SOURCES).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Type" value={type} onChange={setType} options={Object.entries(JOURNAL_TYPES).map(([value, label]) => ({ value, label }))} />
          <DateRangeFilter label="Date" from={range[0]} to={range[1]} onChange={(a, b) => setRange([a, b])} />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={(list.data?.items || []) as any[]}
          rowKey={(j) => j.id}
          onRowClick={(j) => navigate(`/dashboard/finance/journals/${j.id}`)}
          sort={sort}
          onSort={setSort}
          loading={list.isLoading}
          fetching={list.isFetching && !list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          minWidth={980}
          empty={<EmptyState icon={BookOpen} text={view === "all" && !filter ? "No journal yet. The modules post automatically; manual journals are prepared with New journal." : "No journal matches these filters."} action={can("manage_journals") && view !== "all" ? undefined : can("manage_journals") ? <Button variant="primary" icon={Plus} onClick={() => navigate("/dashboard/finance/journals/new")}>New journal</Button> : undefined} />}
          footer={<Pager page={page} perPage={perPage} total={list.data?.totalItems || 0} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />}
        />
      </Card>
    </Page>
  );
}
