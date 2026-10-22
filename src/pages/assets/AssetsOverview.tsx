/**
 * Fixed assets → Overview: the register in figures (cost, depreciation, net book value by category), what is
 * waiting (assets to capitalise, transfers, disposals, the month's depreciation), services due and the last count.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardCheck, List, Plus, Wrench } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { ASSET_STATUS, assetsApi } from "@/lib/assets";
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonLink, Card, CardHeader, EmptyState, ErrorState, KpiBand, Page, PageHeader, Pill, fmtDate, fmtMoney, fmtMoneyShort, fmtNumber, overdue } from "@/components/ims";
import { AssetCardDialog } from "@/components/assets/AssetDialogs";
import { cn } from "@/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

export default function AssetsOverview() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [registering, setRegistering] = React.useState(false);
  const q = useQuery(["assets-overview"], assetsApi.overview);
  const o = q.data;
  const manage = can("manage_fixed_assets");

  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Fixed assets" }]}
      title="Fixed assets"
      subtitle="The asset register in figures, and what is waiting for someone."
      primary={manage ? { label: "Register an asset", icon: Plus, onClick: () => setRegistering(true) } : undefined}
      secondary={[{ label: "Asset register", icon: List, to: "/dashboard/assets/register" }]}
    />
  );

  if (q.isLoading) {
    return (
      <Page>
        {header}
        <KpiBand loading items={[{ label: "Assets in the register", value: null }, { label: "Cost", value: null }, { label: "Accumulated depreciation", value: null }, { label: "Net book value", value: null }]} />
        <Skeleton className="h-72 w-full rounded-card" />
      </Page>
    );
  }
  if (!o) {
    return (
      <Page>
        {header}
        <Card>
          <ErrorState text="The overview could not be loaded." detail={(q.error as any)?.message} onRetry={() => q.refetch()} />
        </Card>
      </Page>
    );
  }

  const nbv = o.totals.cost - o.totals.accumulated;
  const maxCost = Math.max(1, ...o.by_category.map((c) => c.cost));
  const states = ["in_use", "in_stock", "under_maintenance", "damaged", "lost"].filter((k) => o.status[k]);
  const waiting = [
    o.to_capitalise > 0 && { label: `${plural(o.to_capitalise, "asset")} received, waiting for the asset card`, link: "/dashboard/assets/register?view=to_capitalise", tone: "warning" },
    o.transfers_waiting > 0 && { label: `${plural(o.transfers_waiting, "transfer")} waiting for the DAF`, link: "/dashboard/assets/transfers?view=pending", tone: "warning" },
    o.disposals_waiting > 0 && { label: `${plural(o.disposals_waiting, "disposal")} pending approval`, link: "/dashboard/assets/disposals?view=pending", tone: "warning" },
    o.disposals_draft > 0 && { label: `${plural(o.disposals_draft, "disposal")} being prepared`, link: "/dashboard/assets/disposals?view=draft", tone: "neutral" },
    o.depreciation.open && {
      label: `Depreciation of ${o.depreciation.open.period}: ${o.depreciation.open.status === "pending_approval" ? "waiting for the DAF" : "calculated, not submitted"} (${fmtMoney(o.depreciation.open.total)})`,
      link: `/dashboard/assets/depreciation/${o.depreciation.open.id}`,
      tone: "warning",
    },
    !o.depreciation.open && o.depreciation.next && { label: `Depreciation of ${o.depreciation.next} not calculated yet`, link: "/dashboard/assets/depreciation", tone: "neutral" },
  ].filter(Boolean) as { label: string; link: string; tone: string }[];
  const last = o.last_count;

  return (
    <Page>
      {header}

      <KpiBand
        items={[
          {
            label: "Assets in the register",
            value: fmtNumber(o.totals.count),
            sub: [...states.slice(0, 2).map((k) => `${fmtNumber(o.status[k])} ${(ASSET_STATUS[k].note || k).toLowerCase()}`), ...(states.length > 2 ? [`${fmtNumber(states.slice(2).reduce((t, k) => t + o.status[k], 0))} other`] : [])].join(" · ") || undefined,
            to: "/dashboard/assets/register",
          },
          { label: "Cost", value: fmtMoneyShort(o.totals.cost), sub: "Historical cost" },
          { label: "Accumulated depreciation", value: fmtMoneyShort(o.totals.accumulated), sub: o.depreciation.last_posted ? `Posted to ${o.depreciation.last_posted.period}` : "Nothing posted yet", to: "/dashboard/assets/depreciation" },
          { label: "Net book value", value: fmtMoneyShort(nbv), sub: `${o.totals.cost ? Math.round((nbv / o.totals.cost) * 100) : 0}% of cost`, tone: "success" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
        <Card>
          <CardHeader title="By category" subtitle="Cost split into depreciation charged so far and the net book value remaining." link={{ label: "Categories", to: "/dashboard/assets/categories" }} />
          {!o.by_category.length ? (
            <EmptyState compact icon={Boxes} text="No asset in the register yet." />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-4 text-t-small text-ims-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ims-primary" aria-hidden /> Net book value</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ims-faint/50" aria-hidden /> Depreciated</span>
              </div>
              <ul className="space-y-3.5">
                {o.by_category.map((c) => {
                  const value = c.cost - c.accumulated;
                  return (
                    <li key={c.category}>
                      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-t-body">
                        <Link to={`/dashboard/assets/register?category=${c.category}`} className="font-semibold text-ims-text hover:text-ims-link hover:underline">
                          {c.name} <span className="font-normal text-ims-muted">· {plural(c.count, "asset")}</span>
                        </Link>
                        <span className="tabular-nums text-t-small text-ims-muted">
                          Net book value <b className="font-semibold text-ims-text">{fmtMoneyShort(value)}</b> of {fmtMoneyShort(c.cost)}
                        </span>
                      </div>
                      <div
                        className="flex h-3 overflow-hidden rounded-[4px] bg-ims-subtle"
                        style={{ width: `${Math.max(6, (c.cost / maxCost) * 100)}%` }}
                        title={`${c.name}: net book value ${fmtMoney(value)}, depreciated ${fmtMoney(c.accumulated)}`}
                        role="img"
                        aria-label={`${c.name}: net book value ${fmtMoney(value)} of ${fmtMoney(c.cost)}`}
                      >
                        <div className="h-full bg-ims-primary" style={{ width: `${c.cost ? (value / c.cost) * 100 : 0}%` }} />
                        <div className="h-full border-l-2 border-ims-card bg-ims-faint/50" style={{ width: `${c.cost ? (c.accumulated / c.cost) * 100 : 0}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

          <Card>
            <CardHeader title="Services due" subtitle="Next service within 30 days or overdue." />
            {o.maintenance_due.length ? (
              <ul className="-mx-2 divide-y divide-ims-divider">
                {o.maintenance_due.map((m) => (
                  <li key={m.asset}>
                    <Link to={`/dashboard/assets/register/${m.asset}`} className="flex items-start gap-3 rounded-control px-2 py-2.5 hover:bg-ims-hover">
                      <Wrench size={16} className={cn("mt-0.5 shrink-0", m.overdue ? "text-ims-danger" : "text-ims-faint")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-t-body font-semibold text-ims-text">{m.name}</span>
                        <span className="block text-t-small text-ims-muted"><span className="whitespace-nowrap font-mono">{m.code}</span> · due {fmtDate(m.next_due)}</span>
                      </span>
                      <Pill tone={m.overdue ? "danger" : "warning"} className="shrink-0">{m.overdue ? overdue(m.next_due) || "Overdue" : "Due soon"}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={Wrench} text="No service due in the next 30 days." />
            )}
          </Card>
        </div>

        <div className="order-first min-w-0 space-y-4 xl:order-none">
          <Card>
            <CardHeader title="Waiting" subtitle="Work to finish in the register." />
            {waiting.length ? (
              <ul className="-mx-2 divide-y divide-ims-divider">
                {waiting.map((w) => (
                  <li key={w.label}>
                    <Link to={w.link} className="flex items-center gap-3 rounded-control px-2 py-2.5 text-t-body text-ims-text hover:bg-ims-hover">
                      {w.tone === "warning" ? <AlertTriangle size={16} className="shrink-0 text-ims-warning" aria-hidden /> : <ArrowRight size={16} className="shrink-0 text-ims-faint" aria-hidden />}
                      <span className="min-w-0 flex-1">{w.label}</span>
                      <ArrowRight size={15} className="shrink-0 text-ims-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={CheckCircle2} text="Nothing is waiting." />
            )}
          </Card>

          <Card>
            <CardHeader title="Last count" link={{ label: "All counts", to: "/dashboard/assets/counts" }} />
            {last ? (
              <Link to={`/dashboard/assets/counts/${last.id}`} className="-mx-2 flex items-start gap-3 rounded-control px-2 py-2 hover:bg-ims-hover">
                <ClipboardCheck size={16} className="mt-0.5 shrink-0 text-ims-faint" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-t-body font-semibold text-ims-text">{last.title}</span>
                  <span className="mt-0.5 block text-t-small text-ims-muted">
                    {fmtDate(last.as_of)} · {plural(last.summary.total || 0, "asset")}: {fmtNumber((last.summary.found || 0) + (last.summary.found_elsewhere || 0))} found,{" "}
                    <span className={cn(last.summary.missing && "font-semibold text-ims-danger")}>{fmtNumber(last.summary.missing || 0)} missing</span>, {fmtNumber(last.summary.damaged || 0)} damaged
                  </span>
                </span>
              </Link>
            ) : (
              <EmptyState compact icon={ClipboardCheck} text="No count yet." action={manage ? <ButtonLink to="/dashboard/assets/counts">Start a count</ButtonLink> : undefined} />
            )}
          </Card>
        </div>
      </div>

      {registering && <AssetCardDialog onClose={() => setRegistering(false)} onSaved={(id) => { setRegistering(false); navigate(`/dashboard/assets/register/${id}`); }} />}
    </Page>
  );
}
