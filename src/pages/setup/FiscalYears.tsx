/**
 * Setup → Fiscal years and periods (July–June by default). Finance creates the next year (twelve
 * monthly periods are generated) and marks the current one. Period close / re-open lives in the
 * general ledger (period close checklist).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { CalendarCheck2, CalendarClock, CalendarPlus, CheckCircle2, Lock, Star } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { imsApi, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { cn } from "@/utils";

export default function FiscalYears() {
  const { can } = usePermissions();
  const canManage = can("manage_fiscal_years");
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState<string | null>(null);
  const q = useQuery(["fiscal-years"], async () => {
    const [years, periods] = await Promise.all([
      pocketbase.collection("fiscal_years").getFullList({ sort: "-start_date" }),
      pocketbase.collection("fiscal_periods").getFullList({ sort: "number", batch: 500, expand: "closed_by" }),
    ]);
    return { years, periods };
  });
  const current = useQuery(["current-period"], () => imsApi.currentPeriod());

  const years: any[] = q.data?.years || [];
  const latest = years[0];
  const nextStart = latest ? new Date(String(latest.start_date).replace(" ", "T")).getUTCFullYear() + 1 : new Date().getFullYear();

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      queryClient.invalidateQueries(["fiscal-years"]);
      queryClient.invalidateQueries(["current-period"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Fiscal years & periods"
        description="The fiscal year runs July–June. Transactions can only be posted in open periods of an open year."
        breadcrumbs={[{ title: "Setup", link: "#" }, { title: "Fiscal years", link: "/dashboard/setup/fiscal-years" }]}
        actions={
          canManage && (
            <Button onClick={() => run("create", () => imsApi.createFiscalYear(nextStart, false), `FY ${nextStart}/${String(nextStart + 1).slice(2)} created with 12 periods`)} disabled={busy === "create"}>
              <CalendarPlus size={15} /> Create FY {nextStart}/{String(nextStart + 1).slice(2)}
            </Button>
          )
        }
      />

      {current.data?.period && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-[13px] text-emerald-900">
          <CalendarCheck2 size={18} className="text-emerald-700" />
          <span>
            Today falls in <strong>{current.data.period.name}</strong> of <strong>{current.data.fiscal_year?.name}</strong> —{" "}
            {current.data.period.status === "open" ? "the period is open for posting." : "the period is closed."}
          </span>
        </div>
      )}

      {q.isLoading ? (
        <Panel><ListSkeleton rows={6} /></Panel>
      ) : !years.length ? (
        <Panel><EmptyState icon={CalendarClock} title="No fiscal year yet" text="Create the first fiscal year to start budgeting and posting." /></Panel>
      ) : (
        years.map((fy) => {
          const periods = (q.data?.periods || []).filter((p: any) => p.fiscal_year === fy.id);
          const closed = periods.filter((p: any) => p.status === "closed").length;
          return (
            <Panel
              key={fy.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {fy.name}
                  {fy.is_current && <Badge tone="success"><Star size={11} className="mr-1" /> Current year</Badge>}
                  <Badge tone={fy.status === "open" ? "info" : fy.status === "closed" ? "neutral" : "warning"}>{fy.status}</Badge>
                </span>
              }
              subtitle={`${showDay(fy.start_date)} – ${showDay(fy.end_date)} · ${periods.length} periods, ${closed} closed`}
              action={
                canManage && !fy.is_current && fy.status !== "closed" ? (
                  <Button size="sm" variant="outline" disabled={busy === fy.id} onClick={() => run(fy.id, () => imsApi.setCurrentFiscalYear(fy.id), `${fy.name} is now the current year`)}>
                    <Star size={13} /> Make current
                  </Button>
                ) : undefined
              }
            >
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {periods.map((p: any) => {
                  const isNow = current.data?.period?.id === p.id;
                  return (
                    <li key={p.id} className={cn("rounded-lg border px-3 py-2.5", isNow ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 bg-white")}>
                      <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        P{String(p.number).padStart(2, "0")}
                        {p.status === "closed" ? <Lock size={12} className="text-slate-400" /> : <CheckCircle2 size={12} className="text-emerald-600" />}
                      </p>
                      <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900">{p.name}</p>
                      <p className={cn("text-[11.5px]", p.status === "closed" ? "text-slate-500" : "text-emerald-700")}>
                        {p.status === "closed" ? `Closed${p.expand?.closed_by ? ` by ${p.expand.closed_by.name}` : ""}` : isNow ? "Open · current" : "Open"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })
      )}
    </div>
  );
}
