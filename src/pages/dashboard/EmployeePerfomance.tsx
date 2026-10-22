/**
 * Monthly performance evaluations of one employee, embedded in a card (My performance, classic portal):
 * the key figures, the score by period, and every evaluation; open one to see each criterion.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { Award, ExternalLink, Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tone } from "@/lib/procurement";
import { cn } from "@/utils";
import { Button, Column, DataTable, EmptyState, KpiBand, Modal, Person, fmtDate, sentence } from "@/components/ims";

// Scale used by the evaluation form: objectives max 60 + standards max 40 = 100.
const MAX = 100;
export function rating(score: number): { label: string; tone: Tone; bar: string } {
  const pct = (score / MAX) * 100;
  if (pct >= 85) return { label: "Excellent", tone: "success", bar: "bg-ims-success" };
  if (pct >= 70) return { label: "Very good", tone: "success", bar: "bg-ims-success" };
  if (pct >= 55) return { label: "Good", tone: "info", bar: "bg-ims-link" };
  if (pct >= 40) return { label: "Needs improvement", tone: "warning", bar: "bg-ims-priority-high" };
  return { label: "Poor", tone: "danger", bar: "bg-ims-danger" };
}
const CRITERION_DOT: Record<string, string> = { poor: "bg-ims-danger", "needs improvement": "bg-ims-priority-high", good: "bg-ims-link", "very good": "bg-ims-success", exellent: "bg-ims-success", excellent: "bg-ims-success" };
const period = (e: any) => {
  const m = Number(e.period_month);
  const d = new Date(Number(e.period_year) || new Date().getFullYear(), (m || 1) - 1, 1);
  return m ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : e.period_year || "—";
};
const sortKey = (e: any) => `${e.period_year}-${String(e.period_month).padStart(2, "0")}`;

/** Rating as a coloured dot + text (not a status, so not a pill). */
function RatingText({ label, dot }: { label: string; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ims-text">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}

export default function EmployeePerfomance({ employee, hideWhenEmpty = false }: { employee: any; hideWhenEmpty?: boolean }) {
  const navigate = useNavigate();
  const { canPerform } = useRoles();
  const [open, setOpen] = React.useState<any>(null);
  const q = useQuery(["employee-performance", employee?.id], () =>
    pocketbase.collection("perfomance_evaluations").getFullList({ filter: `employee = "${employee.id}"`, expand: "created_by" }).then((xs) => xs.sort((a, b) => sortKey(b).localeCompare(sortKey(a))))
  );
  const rows = (q.data || []) as any[];
  const latest = rows[0];
  const prev = rows[1];
  const avg = rows.length ? Math.round(rows.reduce((a, e) => a + (e.score || 0), 0) / rows.length) : 0;
  const delta = latest && prev ? (latest.score || 0) - (prev.score || 0) : 0;
  const trend = [...rows].reverse().slice(-12);

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-24 rounded-card" /><Skeleton className="h-40 rounded-card" /></div>;
  if (!rows.length && hideWhenEmpty) return null;

  const heading = (
    <div>
      <h2 className="text-t-section text-ims-text">Monthly evaluations</h2>
      <p className="mt-0.5 text-t-small text-ims-muted">Scored out of {MAX} by the supervisor; open one to see each criterion and the comments.</p>
    </div>
  );

  if (!rows.length)
    return (
      <div className="space-y-4">
        {heading}
        <EmptyState icon={Award} className="rounded-control border border-dashed border-ims-border" text="No evaluation yet. Evaluations by the supervisor appear here, with the score for each criterion and their comments." />
      </div>
    );

  const r = rating(latest.score || 0);
  const top = Math.max(MAX, ...trend.map((e) => e.score || 0));
  const columns: Column<any>[] = [
    { key: "period", header: "Period", nowrap: true, cell: (e) => <span className="font-semibold text-ims-text">{period(e)}</span> },
    { key: "score", header: `Score (of ${MAX})`, numeric: true, cell: (e) => <span className="font-semibold">{e.score ?? "—"}</span> },
    { key: "rating", header: "Rating", cell: (e) => { const rr = rating(e.score || 0); return <RatingText label={rr.label} dot={rr.bar} />; } },
    { key: "by", header: "Evaluated by", cell: (e) => <Person name={e.expand?.created_by?.name} /> },
    { key: "created", header: "Date", nowrap: true, align: "right", cell: (e) => fmtDate(e.created) },
  ];

  return (
    <div className="min-w-0 space-y-4">
      {heading}
      <KpiBand
        items={[
          { label: "Latest score", value: `${latest.score || 0} / ${MAX}`, sub: period(latest), onClick: () => setOpen(latest) },
          { label: "Rating", value: r.label },
          { label: "Average", value: avg, sub: `${rows.length} evaluation${rows.length === 1 ? "" : "s"}` },
          { label: "Change", value: prev ? `${delta >= 0 ? "+" : ""}${delta}` : "—", sub: prev ? `vs ${period(prev)}` : "First evaluation", tone: !prev || delta === 0 ? "default" : delta > 0 ? "success" : "danger" },
        ]}
      />

      <section className="rounded-control border border-ims-border px-4 py-4 sm:px-5" aria-labelledby="perf-trend">
        <h3 id="perf-trend" className="text-t-label text-ims-text">Score by period</h3>
        <div className="mt-3 flex h-32 items-end gap-[2px] border-b border-ims-divider" role="img" aria-label={`Scores: ${trend.map((e) => `${period(e)} ${e.score}`).join(", ")}`}>
          {trend.map((e) => {
            const last = e.id === latest.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setOpen(e)}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-t-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
                title={`${period(e)}: ${e.score} / ${MAX} · ${rating(e.score || 0).label}`}
                aria-label={`${period(e)}: ${e.score} out of ${MAX}, ${rating(e.score || 0).label}. Open the evaluation.`}
              >
                <span className={cn("text-t-hint font-semibold tabular-nums text-ims-text", !last && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>{e.score}</span>
                <span className={cn("w-full max-w-[36px] rounded-t-[4px]", last ? "bg-ims-primary" : "bg-ims-link/70 group-hover:bg-ims-link")} style={{ height: `${Math.max(4, ((e.score || 0) / top) * 100)}%` }} />
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex gap-[2px]" aria-hidden>
          {trend.map((e) => <span key={e.id} className="min-w-0 flex-1 truncate text-center text-t-hint text-ims-muted">{period(e).split(" ")[0].slice(0, 3)}</span>)}
        </div>
      </section>

      <div className="overflow-hidden rounded-control border border-ims-border">
        <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={(e) => setOpen(e)} minWidth={560} caption="Performance evaluations" />
      </div>

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        size="lg"
        title={open ? `Performance evaluation · ${period(open)}` : "Performance evaluation"}
        description={open ? `${employee?.name || employee?.names || ""} · evaluated by ${open.expand?.created_by?.name || "—"} on ${fmtDate(open.created)}` : undefined}
        footer={
          open && (
            <>
              <Button onClick={() => setOpen(null)}>Close</Button>
              <Button icon={Printer} onClick={() => window.print()}>Print</Button>
              {canPerform("view_employee_perfomances") && (
                <Button variant="primary" icon={ExternalLink} onClick={() => navigate(`/dashboard/hr/performance/${open.id}`)}>Open full evaluation</Button>
              )}
            </>
          )
        }
      >
        {open && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-control bg-ims-thead px-4 py-3">
              <p className="text-t-kpi tabular-nums text-ims-text">{open.score}<span className="text-t-body font-normal text-ims-muted"> / {MAX}</span></p>
              <RatingText label={rating(open.score || 0).label} dot={rating(open.score || 0).bar} />
            </div>
            {[
              ["Objectives (max 60)", open.period_assessment],
              ["Performance standards (max 40)", open.perfomance_standards],
            ].map(([title, items]: any) => (
              <section key={title}>
                <h3 className="mb-1.5 flex justify-between text-t-label text-ims-text">
                  {title}
                  <span className="tabular-nums">{(items || []).reduce((a: number, x: any) => a + (x.score || 0), 0)}</span>
                </h3>
                <ul className="divide-y divide-ims-divider rounded-control border border-ims-border">
                  {(items || []).map((x: any) => (
                    <li key={x.title} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                      <span className="min-w-0 text-t-body text-ims-text">
                        {x.title.trim()}
                        {x.comment && <span className="block text-t-small text-ims-muted">{x.comment}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-t-small">
                        {x.status && <RatingText label={sentence((x.status || "").replace("exellent", "excellent"))} dot={CRITERION_DOT[(x.status || "").toLowerCase()] || "bg-ims-priority-low"} />}
                        <span className="w-6 text-right text-t-body font-semibold tabular-nums">{x.score}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {open.comment && (
              <section>
                <h3 className="mb-1 text-t-label text-ims-text">Supervisor's comment</h3>
                <p className="rounded-control bg-ims-thead px-3.5 py-2.5 text-t-body text-ims-body">“{open.comment}”</p>
              </section>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
