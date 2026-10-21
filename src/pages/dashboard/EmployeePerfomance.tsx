import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { Award, ExternalLink, Printer, TrendingDown, TrendingUp } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/enterprise/ui";
import type { Tone } from "@/lib/procurement";
import { cn } from "@/utils";
import { showDate } from "@/components/portal/kit";

// Scale used by the evaluation form: objectives max 60 + standards max 40 = 100.
const MAX = 100;
export function rating(score: number): { label: string; tone: Tone; bar: string } {
  const pct = (score / MAX) * 100;
  if (pct >= 85) return { label: "Excellent", tone: "success", bar: "bg-emerald-500" };
  if (pct >= 70) return { label: "Very good", tone: "success", bar: "bg-emerald-400" };
  if (pct >= 55) return { label: "Good", tone: "info", bar: "bg-sky-500" };
  if (pct >= 40) return { label: "Needs improvement", tone: "warning", bar: "bg-amber-500" };
  return { label: "Poor", tone: "danger", bar: "bg-red-500" };
}
const CRITERION: Record<string, Tone> = { poor: "danger", "needs improvement": "warning", good: "info", "very good": "success", exellent: "success", excellent: "success" };
const period = (e: any) => {
  const m = Number(e.period_month);
  const d = new Date(Number(e.period_year) || new Date().getFullYear(), (m || 1) - 1, 1);
  return m ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : e.period_year || "—";
};
const sortKey = (e: any) => `${e.period_year}-${String(e.period_month).padStart(2, "0")}`;

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

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  if (!rows.length && hideWhenEmpty) return null;
  if (!rows.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
        <Award size={26} className="text-slate-400" />
        <p className="text-[14px] font-medium text-slate-800">No evaluation yet</p>
        <p className="max-w-sm text-[12.5px] text-slate-500">Performance evaluations done by your supervisor will appear here, with the score for each criterion and their comments.</p>
      </div>
    );

  const r = rating(latest.score || 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <button type="button" onClick={() => setOpen(latest)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-card hover:border-slate-300">
          <p className="text-[12px] font-medium uppercase tracking-wider text-slate-500">Latest evaluation · {period(latest)}</p>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-[40px] font-semibold leading-none tabular-nums text-slate-900">{latest.score || 0}</p>
            <p className="pb-1 text-[14px] text-slate-500">/ {MAX}</p>
            <Badge tone={r.tone} className="mb-1.5">{r.label}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", r.bar)} style={{ width: `${Math.min(100, latest.score || 0)}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-600">
            <span>Average: <span className="font-semibold tabular-nums text-slate-900">{avg}</span></span>
            {prev && (
              <span className={cn("flex items-center gap-1", delta >= 0 ? "text-emerald-700" : "text-red-600")}>
                {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {delta >= 0 ? "+" : ""}{delta} vs {period(prev)}
              </span>
            )}
            <span>{rows.length} evaluation{rows.length === 1 ? "" : "s"}</span>
          </div>
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <p className="text-[12px] font-medium uppercase tracking-wider text-slate-500">Score by period</p>
          <div className="mt-3 flex h-32 items-end gap-2" role="img" aria-label={`Scores: ${trend.map((e) => `${period(e)} ${e.score}`).join(", ")}`}>
            {trend.map((e) => {
              const rr = rating(e.score || 0);
              return (
                <button key={e.id} type="button" onClick={() => setOpen(e)} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${period(e)}: ${e.score}/${MAX} — ${rr.label}`}>
                  <span className="text-[11px] font-medium tabular-nums text-slate-700">{e.score}</span>
                  <span className={cn("w-full max-w-[40px] rounded-t-[4px] opacity-90 group-hover:opacity-100", rr.bar)} style={{ height: `${Math.max(4, Math.min(100, e.score || 0))}%` }} />
                  <span className="w-full truncate text-center text-[10.5px] text-slate-500">{period(e).split(" ")[0].slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="dnr-grid w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">Period</th>
              <th className="w-56 px-3 py-2.5">Score</th>
              <th className="px-3 py-2.5">Rating</th>
              <th className="px-3 py-2.5">Evaluated by</th>
              <th className="px-3 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => {
              const rr = rating(e.score || 0);
              return (
                <tr key={e.id} onClick={() => setOpen(e)} className="cursor-pointer hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{period(e)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", rr.bar)} style={{ width: `${Math.min(100, e.score || 0)}%` }} /></div>
                      <span className="w-12 text-right tabular-nums">{e.score}/{MAX}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Badge tone={rr.tone}>{rr.label}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{e.expand?.created_by?.name || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{showDate(e.created)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="flex max-h-[100dvh] w-full max-w-2xl flex-col gap-0 bg-white p-0 sm:max-h-[92vh] sm:rounded-xl">
          {open && (
            <>
              <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-6">
                <DialogTitle>Performance evaluation — {period(open)}</DialogTitle>
                <DialogDescription>{employee?.name || employee?.names} · evaluated by {open.expand?.created_by?.name || "—"} on {showDate(open.created)}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3.5 py-3">
                  <p className="text-[28px] font-semibold leading-none tabular-nums">{open.score}<span className="text-[14px] font-normal text-slate-500"> / {MAX}</span></p>
                  <Badge tone={rating(open.score || 0).tone}>{rating(open.score || 0).label}</Badge>
                </div>
                {[
                  ["Objectives (max 60)", open.period_assessment],
                  ["Performance standards (max 40)", open.perfomance_standards],
                ].map(([title, items]: any) => (
                  <section key={title}>
                    <h3 className="mb-1.5 flex justify-between text-[13px] font-semibold text-slate-900">
                      {title}
                      <span className="tabular-nums">{(items || []).reduce((a: number, x: any) => a + (x.score || 0), 0)}</span>
                    </h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {(items || []).map((x: any) => (
                        <li key={x.title} className="flex items-start justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 text-[13px] text-slate-800">
                            {x.title.trim()}
                            {x.comment && <span className="block text-[12px] text-slate-500">{x.comment}</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge tone={CRITERION[(x.status || "").toLowerCase()] || "neutral"} className="capitalize">{(x.status || "").replace("exellent", "excellent")}</Badge>
                            <span className="w-6 text-right text-[13px] font-medium tabular-nums">{x.score}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {open.comment && (
                  <section>
                    <h3 className="mb-1 text-[13px] font-semibold text-slate-900">Supervisor's comment</h3>
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13.5px] text-slate-700">“{open.comment}”</p>
                  </section>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-10" onClick={() => window.print()}><Printer size={15} /> Print</Button>
                  {canPerform("view_employee_perfomances") && (
                    <Button variant="ghost" className="h-10" onClick={() => navigate(`/dashboard/hr/performance/${open.id}`)}><ExternalLink size={15} /> Open full evaluation</Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
