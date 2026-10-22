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
import { imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { ListSkeleton } from "@/components/enterprise/ui";
import { Button, Card, CardHeader, EmptyState, Page, PageHeader, Pill, StatusPill, fmtDate } from "@/components/ims";
import { cn } from "@/utils";

/** Fiscal year states in the glossary: an open year is in progress, a closed one is closed. */
const FY_STATUS: Record<string, { word: string; note?: string }> = {
  open: { word: "In progress", note: "Open for posting" },
  closed: { word: "Closed" },
  draft: { word: "Draft" },
  closing: { word: "In progress", note: "Year-end closing" },
};

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
  const nextLabel = `FY ${nextStart}/${String(nextStart + 1).slice(2)}`;

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
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: "Fiscal years" }]}
        title="Fiscal years and periods"
        subtitle="The fiscal year runs July–June. Transactions are posted only in open periods of an open year."
        primary={
          canManage
            ? { label: `Create ${nextLabel}`, icon: CalendarPlus, loading: busy === "create", onClick: () => run("create", () => imsApi.createFiscalYear(nextStart, false), `${nextLabel} created with 12 periods`) }
            : undefined
        }
      />

      {current.data?.period && (
        <p className="flex flex-wrap items-center gap-2.5 rounded-control bg-ims-success-bg px-3.5 py-2.5 text-t-body text-ims-success">
          <CalendarCheck2 size={17} className="shrink-0" aria-hidden />
          <span>
            Today falls in <strong>{current.data.period.name}</strong> of <strong>{current.data.fiscal_year?.name}</strong> —{" "}
            {current.data.period.status === "open" ? "the period is open for posting." : "the period is closed."}
          </span>
        </p>
      )}

      {q.isLoading ? (
        <Card><ListSkeleton rows={6} /></Card>
      ) : !years.length ? (
        <Card><EmptyState icon={CalendarClock} text="No fiscal year yet. Create the first fiscal year to start budgeting and posting." /></Card>
      ) : (
        years.map((fy) => {
          const periods = (q.data?.periods || []).filter((p: any) => p.fiscal_year === fy.id);
          const closed = periods.filter((p: any) => p.status === "closed").length;
          const st = FY_STATUS[fy.status];
          return (
            <Card key={fy.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {fy.name}
                    <StatusPill status={st?.word || fy.status} />
                    {fy.is_current && <Pill tone="info"><Star size={12} className="mr-1" aria-hidden /> Current year</Pill>}
                  </span>
                }
                subtitle={`${fmtDate(fy.start_date)} – ${fmtDate(fy.end_date)} · ${periods.length} periods, ${closed} closed${st?.note ? ` · ${st.note}` : ""}`}
                action={
                  canManage && !fy.is_current && fy.status !== "closed" ? (
                    <Button size="sm" icon={Star} loading={busy === fy.id} onClick={() => run(fy.id, () => imsApi.setCurrentFiscalYear(fy.id), `${fy.name} is now the current year`)}>
                      Make current
                    </Button>
                  ) : undefined
                }
              />
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label={`Periods of ${fy.name}`}>
                {periods.map((p: any) => {
                  const isNow = current.data?.period?.id === p.id;
                  const isClosed = p.status === "closed";
                  return (
                    <li key={p.id} className={cn("rounded-control border px-3 py-2.5", isNow ? "border-ims-link bg-ims-info-bg ring-1 ring-inset ring-ims-link" : "border-ims-border bg-ims-card")}>
                      <p className="flex items-center justify-between text-t-hint font-semibold text-ims-muted">
                        P{String(p.number).padStart(2, "0")}
                        {isClosed ? <Lock size={13} className="text-ims-faint" aria-label="Closed" /> : <CheckCircle2 size={13} className="text-ims-success" aria-label="Open" />}
                      </p>
                      <p className="mt-0.5 text-t-body font-semibold text-ims-text">{p.name}</p>
                      <p className={cn("text-t-hint", isClosed ? "text-ims-muted" : "text-ims-success")}>
                        {isClosed ? `Closed${p.expand?.closed_by ? ` by ${p.expand.closed_by.name}` : ""}` : isNow ? "Open · current" : "Open"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </Page>
  );
}
