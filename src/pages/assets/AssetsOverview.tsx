/**
 * Fixed assets → Overview: the register in figures (cost, depreciation, net book value by category), what is
 * waiting (assets to capitalise, transfers, disposals, the month's depreciation), services due and the last count.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { AlertTriangle, ArrowRight, Boxes, ClipboardCheck, Plus, Wrench } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { ASSET_STATUS, assetsApi, money } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { Stat } from "@/components/treasury/TreasuryKit";
import { AssetCardDialog } from "@/components/assets/AssetDialogs";
import { cn } from "@/utils";

const compact = (n: number) => (Math.abs(n) >= 1e6 ? `RWF ${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M` : `RWF ${money(n)}`);

export default function AssetsOverview() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [registering, setRegistering] = React.useState(false);
  const q = useQuery(["assets-overview"], assetsApi.overview);
  const o = q.data;
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!o) return <div className="p-6"><EmptyState icon={Boxes} title="Fixed assets" text="The overview could not be loaded." /></div>;
  const nbv = o.totals.cost - o.totals.accumulated;
  const maxCost = Math.max(1, ...o.by_category.map((c) => c.cost));
  const waiting = [
    o.to_capitalise > 0 && { label: `${o.to_capitalise} asset${o.to_capitalise === 1 ? "" : "s"} received, waiting for the asset card`, link: "/dashboard/assets/register?view=to_capitalise", tone: "warning" },
    o.transfers_waiting > 0 && { label: `${o.transfers_waiting} transfer${o.transfers_waiting === 1 ? "" : "s"} waiting for the DAF`, link: "/dashboard/assets/transfers?view=pending", tone: "warning" },
    o.disposals_waiting > 0 && { label: `${o.disposals_waiting} disposal${o.disposals_waiting === 1 ? "" : "s"} waiting for approval`, link: "/dashboard/assets/disposals?view=pending", tone: "warning" },
    o.disposals_draft > 0 && { label: `${o.disposals_draft} disposal${o.disposals_draft === 1 ? "" : "s"} being prepared`, link: "/dashboard/assets/disposals?view=draft", tone: "neutral" },
    o.depreciation.open && { label: `Depreciation ${o.depreciation.open.period}: ${o.depreciation.open.status === "pending_approval" ? "waiting for the DAF" : "calculated, not sent"} (RWF ${money(o.depreciation.open.total)})`, link: `/dashboard/assets/depreciation/${o.depreciation.open.id}`, tone: "warning" },
    !o.depreciation.open && o.depreciation.next && { label: `Depreciation of ${o.depreciation.next} not calculated yet`, link: "/dashboard/assets/depreciation", tone: "neutral" },
  ].filter(Boolean) as { label: string; link: string; tone: string }[];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Fixed assets"
        description="The asset register in figures: cost, depreciation and net book value by category, and what is waiting for someone."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/dashboard/assets/register")}>Asset register</Button>
            {can("manage_fixed_assets") && <Button onClick={() => setRegistering(true)}><Plus size={15} /> Register an asset</Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Assets in the register" value={o.totals.count} sub={["in_use", "in_stock", "under_maintenance", "damaged", "lost"].filter((k) => o.status[k]).map((k) => `${o.status[k]} ${ASSET_STATUS[k].label.toLowerCase()}`).slice(0, 3).join(" · ")} />
        <Stat label="Cost" value={compact(o.totals.cost)} sub="historical cost" />
        <Stat label="Accumulated depreciation" value={compact(o.totals.accumulated)} sub={o.depreciation.last_posted ? `posted to ${o.depreciation.last_posted.period}` : "nothing posted yet"} />
        <Stat label="Net book value" value={compact(nbv)} sub={`${o.totals.cost ? Math.round((nbv / o.totals.cost) * 100) : 0}% of cost`} tone="success" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="By category" subtitle="Cost split into depreciation charged so far and the net book value remaining.">
          <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Net book value</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Depreciated</span>
          </div>
          <ul className="space-y-3">
            {o.by_category.map((c) => {
              const value = c.cost - c.accumulated;
              return (
                <li key={c.category}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                    <Link to={`/dashboard/assets/register?category=${c.category}`} className="font-medium text-slate-800 hover:text-primaryDark hover:underline">{c.name} <span className="font-normal text-slate-500">· {c.count}</span></Link>
                    <span className="tabular-nums text-slate-600">NBV <b className="text-slate-900">{compact(value)}</b> of {compact(c.cost)}</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-[4px] bg-slate-100" style={{ width: `${Math.max(6, (c.cost / maxCost) * 100)}%` }} title={`${c.name}: net book value RWF ${money(value)}, depreciated RWF ${money(c.accumulated)}`}>
                    <div className="h-full bg-primary" style={{ width: `${c.cost ? (value / c.cost) * 100 : 0}%` }} />
                    <div className="h-full border-l-2 border-white bg-slate-300" style={{ width: `${c.cost ? (c.accumulated / c.cost) * 100 : 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <div className="space-y-4">
          <Panel title="Waiting">
            {waiting.length ? (
              <ul className="divide-y divide-slate-100">
                {waiting.map((w) => (
                  <li key={w.label}>
                    <Link to={w.link} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:text-primaryDark">
                      <span className="flex items-center gap-2">{w.tone === "warning" ? <AlertTriangle size={14} className="shrink-0 text-amber-600" /> : <ArrowRight size={14} className="shrink-0 text-slate-400" />}{w.label}</span>
                      <ArrowRight size={14} className="shrink-0 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-slate-500">Nothing is waiting.</p>}
          </Panel>
          <Panel title="Services due" subtitle="Next service within 30 days or overdue">
            {o.maintenance_due.length ? (
              <ul className="divide-y divide-slate-100">
                {o.maintenance_due.map((m) => (
                  <li key={m.asset} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <Link to={`/dashboard/assets/register/${m.asset}`} className="flex min-w-0 items-center gap-2 hover:text-primaryDark"><Wrench size={14} className="shrink-0 text-slate-400" /><span className="truncate"><span className="font-mono text-[12px]">{m.code}</span> {m.name}</span></Link>
                    <Badge tone={m.overdue ? "danger" : "warning"}>{m.overdue ? "overdue" : "due"} {showDay(m.next_due)}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-slate-500">No service due in the next 30 days.</p>}
          </Panel>
          <Panel title="Last count">
            {o.last_count ? (
              <Link to={`/dashboard/assets/counts/${o.last_count.id}`} className="block rounded-md hover:bg-slate-50">
                <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800"><ClipboardCheck size={15} className="text-slate-400" /> {o.last_count.title}</p>
                <p className="mt-1 text-[12.5px] text-slate-600">{showDay(o.last_count.as_of)} · {o.last_count.summary.total} assets: {o.last_count.summary.found + (o.last_count.summary.found_elsewhere || 0)} found, <span className={cn(o.last_count.summary.missing ? "font-semibold text-red-700" : "")}>{o.last_count.summary.missing} missing</span>, {o.last_count.summary.damaged} damaged</p>
              </Link>
            ) : <p className="text-[13px] text-slate-500">No count yet.</p>}
          </Panel>
        </div>
      </div>
      {registering && <AssetCardDialog onClose={() => setRegistering(false)} onSaved={(id) => { setRegistering(false); navigate(`/dashboard/assets/register/${id}`); }} />}
    </div>
  );
}
