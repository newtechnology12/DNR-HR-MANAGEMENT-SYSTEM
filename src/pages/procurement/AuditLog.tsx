/**
 * Audit log viewer (Internal Auditor, SG, DAF, System Administrator). Server-written, read-only for
 * everyone. Filters: person, action, record type, period, free text. Export (Excel / PDF / CSV)
 * needs export_audit_logs — and the export itself is logged.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, EmptyState, PageHeader } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { AuditEntry, imsApi } from "@/lib/ims";
import { exportReport } from "@/lib/exporter";
import { cn } from "@/utils";

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
const PRESETS: { label: string; action: string; collection?: string }[] = [
  { label: "Failed sign-ins", action: "login_failed" },
  { label: "Permission changes", action: "permission" },
  { label: "Rejected & returned", action: "approval_re" },
  { label: "Budget overrides", action: "over_budget" },
  { label: "Exports", action: "exported" },
];

const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v);
};
const tone = (a: string) =>
  /fail|lock|reject|delete|cancel|blocked/.test(a) ? "danger" : /approve|confirmed|login$/.test(a) ? "success" : /return|escalat|delegat|warning|override/.test(a) ? "violet" : /permission|2fa|password/.test(a) ? "warning" : "neutral";

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
  const anyFilter = Boolean(q || collection || action || actor || from || to);

  const describe = () =>
    [
      collection && COLLECTIONS.find((c) => c.value === collection)?.label,
      action && (ACTIONS.find((a) => a.value === action)?.label || action),
      actor && `Person: ${people.data?.find((p: any) => p.id === actor)?.name || actor}`,
      (from || to) && `Period: ${from || "…"} – ${to || "…"}`,
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

  const sel = "h-9 rounded-md border bg-white px-2.5 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Audit log"
        description="Who did what, when and from where. Written by the server; nobody — not even an administrator — can edit or delete entries."
        breadcrumbs={[{ title: "Administration", link: "#" }, { title: "Audit log", link: "#" }]}
        actions={<ExportMenu onExport={doExport} permission="export_audit_logs" disabled={!data.data?.items.length} />}
      />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => { setAction(action === p.action ? "" : p.action); setCollection(p.collection || ""); }} aria-pressed={action === p.action} className={cn("h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium", action === p.action ? "border-ralga-navy bg-ralga-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <label className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person, document, comment…" aria-label="Search audit log" className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Person" className={cn(sel, actor ? "border-primary/60" : "border-slate-200")}>
            <option value="">Everyone</option>
            {(people.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" className={cn(sel, action ? "border-primary/60" : "border-slate-200")}>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Record type" className={cn(sel, collection ? "border-primary/60" : "border-slate-200")}>
            {COLLECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <span className="flex items-center gap-1 text-[12.5px] text-slate-500">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={cn(sel, "border-slate-200")} />
            <span>–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" className={cn(sel, "border-slate-200")} />
          </span>
          {anyFilter && (
            <button type="button" onClick={() => { setSearch(""); setCollection(""); setAction(""); setActor(""); setFrom(""); setTo(""); }} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100">
              <X size={13} /> Clear
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="dnr-grid w-full min-w-[900px] text-[13px]">
            <thead>
              <tr>
                <th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Changes</th><th>IP address</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {data.isLoading && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={6}><Skeleton className="h-5 w-full" /></td></tr>)}
              {data.data?.items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-slate-600">{format(new Date(e.created.replace(" ", "T")), "d MMM yyyy, HH:mm:ss")}</td>
                  <td className="whitespace-nowrap font-medium text-slate-800">{e.actor_name || "System"}</td>
                  <td><Badge tone={tone(e.action) as any}>{e.action.replace(/^approval_/, "approval: ").replace(/_/g, " ")}</Badge></td>
                  <td>
                    <p className="text-slate-800">{e.record_label || e.record_id || "—"}</p>
                    <p className="text-[12px] text-slate-500">{COLLECTIONS.find((c) => c.value === e.collection_name)?.label || e.collection_name}</p>
                  </td>
                  <td className="max-w-[380px] text-[12px] text-slate-600">
                    {Object.keys(e.changes || {}).length === 0 ? (
                      !e.comment && <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {Object.entries(e.changes).slice(0, 5).map(([k, v]: any) => (
                          <li key={k} className="truncate"><span className="font-medium text-slate-700">{k.replace(/_/g, " ")}</span>: {fmt(v.old)} → {fmt(v.new)}</li>
                        ))}
                      </ul>
                    )}
                    {e.comment && <p className="mt-1 italic text-slate-500">“{e.comment}”</p>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-[12px] text-slate-500">{e.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.isError && <EmptyState icon={ShieldCheck} title="Audit log unavailable" text={(data.error as any)?.message || "You may not have access."} />}
          {data.data && !data.data.items.length && <EmptyState icon={ShieldCheck} title="No audit entries" text="Try a different filter or period." />}
        </div>
        <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-4 py-2.5 text-[12.5px] text-slate-500">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={15} /></Button>
          <span className="px-2">Page {page}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!data.data?.hasMore} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={15} /></Button>
        </div>
      </div>
    </div>
  );
}
