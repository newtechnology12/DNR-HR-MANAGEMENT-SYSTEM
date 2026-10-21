/**
 * Audit log viewer (Internal Auditor, SG, DAF, System Administrator). Server-written, read-only for
 * everyone. Filters: person, action, record type, period, free text. Export (Excel / PDF / CSV)
 * needs export_audit_logs — and the export itself is logged.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { AuditEntry, imsApi } from "@/lib/ims";
import { exportReport } from "@/lib/exporter";
import { Button, Card, Column, DataTable, DateRangeFilter, EmptyState, FilterBar, FilterSelect, Page, PageHeader, Tabs, fmtDate, fmtDateTime, sentence, toDate } from "@/components/ims";

const COLLECTIONS: { value: string; label: string }[] = [
  { value: "", label: "All record types" },
  { value: "users", label: "Users & sign-in" },
  { value: "roles", label: "Roles & permissions" },
  { value: "role_change_requests", label: "Permission change requests" },
  { value: "settings", label: "System settings" },
  { value: "delegations", label: "Delegations" },
  { value: "approval_workflows", label: "Approval workflows" },
  { value: "approval_limits", label: "Approval limits" },
  { value: "gl_accounts", label: "Chart of accounts" },
  { value: "funding_sources", label: "Funding sources" },
  { value: "projects", label: "Projects" },
  { value: "cost_centres", label: "Cost centres" },
  { value: "fiscal_years", label: "Fiscal years" },
  { value: "tax_rates", label: "Tax rates" },
  { value: "budgets", label: "Budgets" },
  { value: "purchase_requisitions", label: "Purchase requisitions" },
  { value: "purchase_orders", label: "Purchase orders" },
  { value: "suppliers", label: "Suppliers" },
  { value: "supplier_invoices", label: "Supplier invoices" },
  { value: "payrolls", label: "Payroll" },
  { value: "contracts", label: "Contracts" },
  { value: "number_sequences", label: "Numbering" },
];
const ACTIONS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "login", label: "Sign-ins (successful / failed)" },
  { value: "account_locked", label: "Account lockouts" },
  { value: "permission", label: "Permission changes" },
  { value: "approval_", label: "Approval decisions" },
  { value: "approval_reject", label: "Rejections" },
  { value: "approval_return", label: "Returns for correction" },
  { value: "over_budget", label: "Budget warnings & overrides" },
  { value: "exported", label: "Data exports" },
  { value: "created", label: "Records created" },
  { value: "updated", label: "Records changed" },
  { value: "cancelled", label: "Cancellations" },
  { value: "delegation", label: "Delegations" },
  { value: "2fa", label: "Two-factor authentication" },
];
/** Quick views as tabs (at most five); everything else is in the Action filter. */
const PRESETS: { key: string; label: string; action: string }[] = [
  { key: "all", label: "All entries", action: "" },
  { key: "failed", label: "Failed sign-ins", action: "login_failed" },
  { key: "permissions", label: "Permission changes", action: "permission" },
  { key: "rejected", label: "Rejected and returned", action: "approval_re" },
  { key: "budget", label: "Budget overrides", action: "over_budget" },
];

const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v);
};
const toneDot = (a: string) =>
  /fail|lock|reject|delete|cancel|blocked/.test(a) ? "bg-ims-danger" : /approve|confirmed|login$/.test(a) ? "bg-ims-success" : /return|escalat|delegat|warning|override/.test(a) ? "bg-ims-orange" : /permission|2fa|password/.test(a) ? "bg-ims-priority-high" : "bg-ims-faint";
const actionLabel = (a: string) => sentence(a.replace(/^approval_/, "approval: "));

export default function AuditLog() {
  const [search, setSearch] = React.useState("");
  const [q] = useDebounce(search, 350);
  const [collection, setCollection] = React.useState("");
  const [action, setAction] = React.useState("");
  const [actor, setActor] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [q, collection, action, actor, from, to]);

  const params = { q, collection, action, actor, from, to };
  const data = useQuery(["audit-log", params, page], () => imsApi.audit({ ...params, page, perPage: 30 }), { keepPreviousData: true });
  const people = useQuery(["audit-people"], () => pocketbase.collection("users").getFullList({ sort: "name", fields: "id,name" }), { staleTime: 5 * 60_000 });

  const describe = () =>
    [
      collection && COLLECTIONS.find((c) => c.value === collection)?.label,
      action && (ACTIONS.find((a) => a.value === action)?.label || PRESETS.find((p) => p.action === action)?.label || action),
      actor && `Person: ${people.data?.find((p: any) => p.id === actor)?.name || actor}`,
      (from || to) && `Period: ${from ? fmtDate(from) : "…"} to ${to ? fmtDate(to) : "…"}`,
      q && `Search: “${q}”`,
    ].filter(Boolean).join(" · ");

  async function doExport(formatType: "xlsx" | "pdf" | "csv") {
    const rows: AuditEntry[] = [];
    for (let p = 1; p <= 20; p++) {
      const r = await imsApi.audit({ ...params, page: p, perPage: 1000 });
      rows.push(...r.items);
      if (!r.hasMore) break;
    }
    await exportReport({
      title: "Audit log",
      subtitle: describe() || "All entries",
      rows,
      format: formatType,
      orientation: "landscape",
      what: "audit_logs",
      columns: [
        { header: "When", value: (e) => e.created, format: "datetime", width: 18 },
        { header: "Who", value: (e) => e.actor_name || "System", width: 22 },
        { header: "Action", value: (e) => e.action.replace(/_/g, " "), width: 22 },
        { header: "Record type", value: (e) => COLLECTIONS.find((c) => c.value === e.collection_name)?.label || e.collection_name },
        { header: "Record", value: (e) => e.record_label || e.record_id, width: 28 },
        { header: "Changes", value: (e) => Object.entries(e.changes || {}).map(([k, v]: any) => `${k}: ${fmt(v.old)} → ${fmt(v.new)}`).join("; "), width: 48 },
        { header: "Comment", value: (e) => e.comment || "", width: 36 },
        { header: "IP", value: (e) => e.ip || "" },
      ],
    });
  }

  const preset = PRESETS.find((p) => p.action === action)?.key || (action ? "" : "all");
  const personName = people.data?.find((p: any) => p.id === actor)?.name;
  const chips = [
    ...(actor ? [{ key: "actor", label: `Person: ${personName || "…"}`, onRemove: () => setActor("") }] : []),
    ...(action && !PRESETS.some((p) => p.action === action) ? [{ key: "action", label: `Action: ${ACTIONS.find((a) => a.value === action)?.label || action}`, onRemove: () => setAction("") }] : []),
    ...(collection ? [{ key: "collection", label: `Record type: ${COLLECTIONS.find((c) => c.value === collection)?.label}`, onRemove: () => setCollection("") }] : []),
    ...(from || to ? [{ key: "dates", label: `Dates: ${from ? fmtDate(from) : "…"} to ${to ? fmtDate(to) : "…"}`, onRemove: () => { setFrom(""); setTo(""); } }] : []),
  ];

  const columns: Column<AuditEntry>[] = [
    {
      key: "created",
      header: "When",
      nowrap: true,
      cell: (e) => {
        const d = toDate(e.created);
        return <span className="text-ims-body" title={d ? format(d, "d MMM yyyy, HH:mm:ss") : undefined}>{fmtDateTime(e.created)}</span>;
      },
    },
    { key: "who", header: "Who", nowrap: true, className: "font-semibold", cell: (e) => e.actor_name || "System" },
    { key: "action", header: "Action", nowrap: true, cell: (e) => <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${toneDot(e.action)}`} aria-hidden />{actionLabel(e.action)}</span> },
    {
      key: "record",
      header: "Record",
      className: "min-w-[200px]",
      cell: (e) => e.record_label || e.record_id || "—",
      sub: (e) => COLLECTIONS.find((c) => c.value === e.collection_name)?.label || e.collection_name,
    },
    {
      key: "changes",
      header: "Changes",
      className: "max-w-[380px] text-t-small text-ims-body",
      cell: (e) => (
        <>
          {Object.keys(e.changes || {}).length === 0 ? (
            !e.comment && <span className="text-ims-faint">—</span>
          ) : (
            <ul className="space-y-0.5">
              {Object.entries(e.changes).slice(0, 5).map(([k, v]: any) => (
                <li key={k} className="truncate"><span className="font-semibold text-ims-text">{k.replace(/_/g, " ")}</span>: {fmt(v.old)} → {fmt(v.new)}</li>
              ))}
            </ul>
          )}
          {e.comment && <p className="mt-1 text-ims-muted">“{e.comment}”</p>}
        </>
      ),
    },
    { key: "ip", header: "IP address", nowrap: true, cell: (e) => <span className="font-mono text-t-small text-ims-muted">{e.ip || "—"}</span> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Audit log" }]}
        title="Audit log"
        subtitle="Who did what, when and from where. No one, not even an administrator, can change or delete an entry."
        actions={<ExportMenu onExport={doExport} permission="export_audit_logs" disabled={!data.data?.items.length} />}
      />
      <Card padded={false}>
        <Tabs
          inset
          label="Quick views"
          tabs={PRESETS.map((p) => ({ key: p.key, label: p.label }))}
          active={preset}
          onChange={(k) => {
            setAction(PRESETS.find((p) => p.key === k)?.action || "");
            setCollection("");
          }}
        />
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search person, document or comment" }}
          chips={chips}
          onClear={() => { setSearch(""); setCollection(""); setAction(""); setActor(""); setFrom(""); setTo(""); }}
        >
          <FilterSelect label="Person" value={actor} onChange={setActor} options={(people.data || []).map((p: any) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="Action" value={PRESETS.some((p) => p.action === action) ? "" : action} onChange={setAction} options={ACTIONS.filter((a) => a.value)} />
          <FilterSelect label="Record type" value={collection} onChange={setCollection} options={COLLECTIONS.filter((c) => c.value)} />
          <DateRangeFilter label="Dates" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </FilterBar>
        <div className="border-t border-ims-divider">
          <DataTable
            columns={columns}
            rows={data.data?.items || []}
            rowKey={(e) => e.id}
            loading={data.isLoading}
            error={data.error}
            onRetry={() => data.refetch()}
            fetching={data.isFetching}
            minWidth={960}
            caption="Audit log"
            empty={<EmptyState icon={ShieldCheck} text="No entries match. Try another filter or period." />}
            footer={
              <div className="flex items-center justify-end gap-2 border-t border-ims-divider px-4 py-3 text-t-small text-ims-muted">
                <Button size="icon-sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" />
                <span className="px-1">Page {page}</span>
                <Button size="icon-sm" icon={ChevronRight} disabled={!data.data?.hasMore} onClick={() => setPage((p) => p + 1)} aria-label="Next page" />
              </div>
            }
          />
        </div>
      </Card>
    </Page>
  );
}
