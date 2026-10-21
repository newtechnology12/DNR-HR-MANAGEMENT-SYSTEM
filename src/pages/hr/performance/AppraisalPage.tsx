import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ChevronDown, Lock, MessageSquareWarning, RefreshCw, Send, Share2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, EmptyState, StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { APPRAISAL_STATUS, CLAIM_STATUS, GRADE_TONE, Section, appraisalApi, gradeOf, scoreOf } from "@/lib/hr";
import { Field, showDate, textareaCls, useMe } from "@/components/portal/kit";
import { cn } from "@/utils";

const LOCKED = ["shared", "acknowledged", "finalized"];

export default function AppraisalPage() {
  const { appraisalId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const { canPerform } = useRoles();
  const [sharing, setSharing] = React.useState(false);

  const q = useQuery(["appraisal", appraisalId], async () => {
    const a: any = await pocketbase.collection("appraisals").getOne(appraisalId!, { expand: "employee,department,evaluators,cycle" });
    const [reviews, claims] = await Promise.all([
      pocketbase.collection("appraisal_reviews").getFullList({ filter: `appraisal = "${appraisalId}"`, sort: "created", expand: "evaluator" }),
      pocketbase.collection("appraisal_claims").getFullList({ filter: `appraisal = "${appraisalId}"`, sort: "created", expand: "author,responded_by" }),
    ]);
    return { a, reviews, claims };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["appraisal", appraisalId]);
    queryClient.invalidateQueries(["appraisals"]);
    queryClient.invalidateQueries(["my-reviews"]);
  };
  const act = useMutation(({ action, body }: { action: "finalize" | "refresh" | "share"; body?: any }) => appraisalApi.action(appraisalId!, action, body || {}), {
    onSuccess: (_, v) => {
      toast.success(v.action === "finalize" ? "Appraisal finalised" : v.action === "share" ? "Results shared — the employee has been notified" : "Activity score refreshed");
      setSharing(false);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading || me.isLoading) return <div className="mx-auto max-w-5xl space-y-3 p-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>;
  if (!q.data) return <div className="p-4"><EmptyState icon={Lock} title="Appraisal not available" text="Only the employee (after results are shared), their evaluators and HR can open it." /></div>;
  const { a, reviews, claims } = q.data;
  const tpl = a.template_snapshot || {};
  const sections: Section[] = tpl.sections || [];
  const isEmployee = me.data?.id === a.employee;
  const isEvaluator = (a.evaluators || []).includes(me.data?.id);
  const isManager = !isEmployee && (me.data?.hrScope !== "own" || canPerform("manage_appraisals") || a.expand?.department?.head === me.data?.id);
  const canRate = !isEmployee && (isEvaluator || isManager) && !LOCKED.includes(a.status);
  const mine = (reviews as any[]).find((r) => r.evaluator === me.data?.id);
  const others = (reviews as any[]).filter((r) => r.role !== "self" && r.status === "submitted");
  const self = (reviews as any[]).find((r) => r.role === "self");
  const aw = Number(tpl.activity_weight) || 0;
  const detail = a.activity_detail || {};

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-12 pt-3 sm:px-6 sm:pt-5">
      <button type="button" onClick={() => navigate("/dashboard/hr/performance")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 print:hidden"><ArrowLeft size={15} /> Appraisals</button>

      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wider text-slate-500">{a.expand?.cycle?.name}</p>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">{a.expand?.employee?.name}</h1>
            <p className="text-[13px] text-slate-600">{a.expand?.department?.name} · evaluators: {(a.expand?.evaluators || []).map((u: any) => u.name).join(", ") || "HR"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={a.status} map={APPRAISAL_STATUS} />{a.grade && <Badge tone={GRADE_TONE[a.grade]}>Grade {a.grade} · {a.grade_label}</Badge>}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[40px] font-bold leading-none tabular-nums text-slate-900">{a.final_score || "—"}</p>
              <p className="text-[12px] text-slate-500">final score / 100</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            ["Evaluators", a.evaluator_score || "—", `${100 - aw}% of the final score · ${others.length} review${others.length === 1 ? "" : "s"}`],
            ["Activity (system)", a.activity_score ?? "—", `${aw}% · ${detail.plans ?? 0} plans, ${detail.reports ?? 0} reports`],
            ["Self-assessment", a.self_score || "—", "For discussion, not counted"],
          ].map(([k, v, s]) => (
            <div key={k as string} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[11.5px] text-slate-500">{k}</p>
              <p className="text-[20px] font-semibold tabular-nums">{v}</p>
              <p className="text-[11.5px] text-slate-500">{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          {isManager && ["submitted", "in_progress", "disputed"].includes(a.status) && a.evaluator_score > 0 && <Button onClick={() => setSharing(true)}><Share2 size={15} /> Share results with employee</Button>}
          {canPerform("manage_appraisals") && ["shared", "acknowledged"].includes(a.status) && <Button variant="outline" onClick={() => act.mutate({ action: "finalize" })}><Lock size={15} /> Finalise</Button>}
          {isManager && !LOCKED.includes(a.status) && <Button variant="ghost" onClick={() => act.mutate({ action: "refresh" })}><RefreshCw size={15} /> Refresh activity score</Button>}
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[14px] font-semibold text-slate-900">Activity score — calculated by the system</h2>
        <p className="text-[12.5px] text-slate-500">From action plans and work reports between {showDate(a.expand?.cycle?.period_start)} and {showDate(a.expand?.cycle?.period_end)}.{detail.note ? ` ${detail.note}` : ""}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Plan completion", detail.completion, "50%", `${detail.completed ?? 0} of ${detail.plans ?? 0} plans completed`],
            ["Completed on time", detail.on_time, "25%", "Completed before the deadline"],
            ["Reporting", detail.reporting, "25%", `${detail.reports ?? 0} reports / ${detail.expected_reports ?? 0} expected`],
            ["Reports reviewed", detail.reports ? Math.round(((detail.reports_reviewed || 0) / detail.reports) * 100) : null, "info", `${detail.reports_reviewed ?? 0} reviewed by supervisors`],
          ].map(([k, v, w, s]) => (
            <div key={k as string} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="flex justify-between text-[11.5px] text-slate-500"><span>{k}</span><span>{w}</span></p>
              <p className="text-[17px] font-semibold tabular-nums">{v === null || v === undefined ? "n/a" : `${v}%`}</p>
              <p className="text-[11px] text-slate-500">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {canRate && <RatingForm key={mine?.id || "new"} appraisal={a} review={mine} sections={sections} onSaved={refresh} />}

      {(isManager || isEvaluator) && others.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-slate-900">Scores by section</h2>
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[640px] text-[13px]">
              <thead><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Section</th><th className="px-3 py-2 text-right">Weight</th>{[...others, ...(self ? [self] : [])].map((r: any) => <th key={r.id} className="px-3 py-2 text-right">{r.expand?.evaluator?.name}{r.role === "self" ? " (self)" : ""}</th>)}<th className="px-3 py-2 text-right">Average</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sections.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-medium">{s.title}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{s.weight}%</td>
                    {[...others, ...(self ? [self] : [])].map((r: any) => <td key={r.id} className={cn("px-3 py-2 text-right tabular-nums", r.role === "self" && "text-slate-500")}>{scoreOf([s], tpl.rating_scale || [], r.ratings || {}).bySection[s.id] ?? "—"}</td>)}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{a.section_scores?.[s.id] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2">
            {[...others, ...(self && self.status === "submitted" ? [self] : [])].filter((r: any) => r.overall_comment).map((r: any) => (
              <p key={r.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]"><span className="font-medium">{r.expand?.evaluator?.name}{r.role === "self" ? " (self)" : ""}:</span> “{r.overall_comment}”</p>
            ))}
          </div>
        </section>
      )}

      {(a.manager_summary || a.employee_comment) && (
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-2 sm:p-5">
          {a.manager_summary && <div><p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Summary shared with the employee</p><p className="mt-1 text-[13.5px]">{a.manager_summary}</p></div>}
          {a.employee_comment && <div><p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Employee's comment</p><p className="mt-1 text-[13.5px]">{a.employee_comment}</p></div>}
        </section>
      )}

      {(claims as any[]).length > 0 && <Claims claims={claims as any[]} canRespond={!isEmployee && (isEvaluator || isManager)} onDone={refresh} />}

      <ShareDialog open={sharing} onClose={() => setSharing(false)} busy={act.isLoading} onConfirm={(summary) => act.mutate({ action: "share", body: { summary } })} appraisal={a} />
    </div>
  );
}

export function RatingForm({ appraisal, review, sections, onSaved, self = false }: { appraisal: any; review: any; sections: Section[]; onSaved: () => void; self?: boolean }) {
  const tpl = appraisal.template_snapshot || {};
  const scale = tpl.rating_scale || [];
  const [ratings, setRatings] = React.useState<Record<string, { value: number; comment: string }>>(review?.ratings || {});
  const [comment, setComment] = React.useState(review?.overall_comment || "");
  const [openNotes, setOpenNotes] = React.useState<Record<string, boolean>>({});
  const live = scoreOf(sections, scale, ratings);
  const aw = Number(tpl.activity_weight) || 0;
  const projected = live.score === null ? null : Math.round((((100 - aw) * live.score + aw * (appraisal.activity_score || 0)) / 100) * 10) / 10;
  const grade = gradeOf(tpl.grade_bands || [], projected);
  const total = sections.reduce((n, s) => n + s.criteria.length, 0);
  const rated = sections.reduce((n, s) => n + s.criteria.filter((c) => ratings[c.id]?.value > 0).length, 0);
  const save = useMutation((submit: boolean) => appraisalApi.action(appraisal.id, "review", { ratings, overall_comment: comment, submit }), {
    onSuccess: (_, submit) => {
      toast.success(submit ? (self ? "Self-assessment submitted — your supervisor will see it" : "Evaluation submitted") : "Draft saved");
      onSaved();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <section className="rounded-xl border border-primary/30 bg-white shadow-card">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{self ? "Your self-assessment" : "Your evaluation"} {review?.status === "submitted" && <Badge tone="success" className="ml-1">Submitted</Badge>}</h2>
          <p className="text-[12.5px] text-slate-500">{rated} of {total} criteria rated · scale {scale.map((s: any) => s.value).join("–")}</p>
        </div>
        <div className={cn("flex items-center gap-3", self && "hidden")}>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">Your score → projected final</p>
            <p className="text-[18px] font-bold tabular-nums">{live.score ?? "—"} <span className="text-[13px] font-normal text-slate-500">→ {projected ?? "—"}</span></p>
          </div>
          {grade && <Badge tone={GRADE_TONE[grade.grade]}>{grade.grade} · {grade.label}</Badge>}
        </div>
      </header>
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          {scale.map((s: any) => <span key={s.value}><span className="font-semibold text-slate-900">{s.value}</span> {s.label}</span>)}
        </div>
        {sections.map((sec) => (
          <div key={sec.id}>
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
              <h3 className="text-[14px] font-semibold text-slate-900">{sec.title}</h3>
              <span className="text-[12px] text-slate-500">weight {sec.weight}% · score {live.bySection[sec.id] ?? "—"}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {sec.criteria.map((c) => {
                const r = ratings[c.id] || { value: 0, comment: "" };
                return (
                  <li key={c.id} className="py-2.5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-slate-900">{c.title}{Number(c.weight) !== 1 && <span className="ml-1 text-[11px] text-slate-500">×{c.weight}</span>}</p>
                        {c.description && <p className="text-[12px] text-slate-500">{c.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1" role="radiogroup" aria-label={c.title}>
                        {scale.map((s: any) => (
                          <button
                            key={s.value}
                            type="button"
                            role="radio"
                            aria-checked={r.value === s.value}
                            title={`${s.value} — ${s.label}`}
                            onClick={() => setRatings((x) => ({ ...x, [c.id]: { ...r, value: s.value } }))}
                            className={cn("h-10 w-10 rounded-lg border text-[14px] font-semibold transition-colors", r.value === s.value ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-600 hover:border-slate-400")}
                          >
                            {s.value}
                          </button>
                        ))}
                        <button type="button" onClick={() => setOpenNotes((x) => ({ ...x, [c.id]: !x[c.id] }))} className={cn("ml-1 rounded-md p-2 text-slate-400 hover:bg-slate-100", r.comment && "text-primaryDark")} aria-label="Add an example or comment"><ChevronDown size={16} /></button>
                      </div>
                    </div>
                    {r.value > 0 && <p className="mt-0.5 text-right text-[11.5px] text-slate-500 md:text-left">{scale.find((s: any) => s.value === r.value)?.label}</p>}
                    {(openNotes[c.id] || r.comment) && (
                      <textarea className={cn(textareaCls, "mt-2 min-h-[60px]")} rows={2} value={r.comment} placeholder="Example or evidence (optional)" onChange={(e) => setRatings((x) => ({ ...x, [c.id]: { ...r, comment: e.target.value } }))} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <Field label="Overall comment" hint="Strengths, areas to improve and agreed development actions.">
          <textarea className={textareaCls} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={save.isLoading} onClick={() => save.mutate(false)}>Save draft</Button>
          <Button disabled={save.isLoading || rated < total} onClick={() => save.mutate(true)} title={rated < total ? "Rate every criterion first" : ""}><Send size={15} /> Submit evaluation</Button>
        </div>
      </div>
    </section>
  );
}

function Claims({ claims, canRespond, onDone }: { claims: any[]; canRespond: boolean; onDone: () => void }) {
  const [answer, setAnswer] = React.useState<Record<string, { decision: string; response: string }>>({});
  const respond = useMutation((id: string) => appraisalApi.respond(id, answer[id]), {
    onSuccess: () => {
      toast.success("Answer sent to the employee");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-slate-900"><MessageSquareWarning size={16} className="text-amber-600" /> Claims and questions from the employee</h2>
      <ul className="space-y-3">
        {claims.map((c) => {
          const a = answer[c.id] || { decision: "answered", response: "" };
          return (
            <li key={c.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium">{c.criterion || "General"} <span className="font-normal text-slate-500">· {c.expand?.author?.name}, {showDate(c.created)}</span></p>
                <StatusBadge status={c.status} map={CLAIM_STATUS} />
              </div>
              <p className="mt-1 text-[13.5px] text-slate-800">{c.message}</p>
              {c.response && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[13px]"><span className="font-medium">{c.expand?.responded_by?.name}:</span> {c.response}</p>}
              {canRespond && c.status === "open" && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[["upheld", "Accept — I will correct the ratings"], ["rejected", "Do not accept"], ["answered", "Answer only"]].map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setAnswer((x) => ({ ...x, [c.id]: { ...a, decision: k } }))} className={cn("h-8 rounded-full border px-3 text-[12.5px]", a.decision === k ? "border-primary bg-primary/10 text-primaryDark" : "border-slate-200 text-slate-600")}>{l}</button>
                    ))}
                  </div>
                  <textarea className={textareaCls} rows={2} value={a.response} onChange={(e) => setAnswer((x) => ({ ...x, [c.id]: { ...a, response: e.target.value } }))} placeholder="Your answer to the employee" />
                  <div className="flex justify-end"><Button size="sm" disabled={a.response.trim().length < 10 || respond.isLoading} onClick={() => respond.mutate(c.id)}>Send answer</Button></div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShareDialog({ open, onClose, onConfirm, busy, appraisal }: { open: boolean; onClose: () => void; onConfirm: (s: string) => void; busy: boolean; appraisal: any }) {
  const [summary, setSummary] = React.useState(appraisal.manager_summary || "");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Share results with {appraisal.expand?.employee?.name}</DialogTitle>
          <DialogDescription>The employee sees the final score ({appraisal.final_score}), the grade, the scores per criterion and the evaluators' comments, and can acknowledge them or raise a claim.</DialogDescription>
        </DialogHeader>
        <Field label="Summary for the employee" hint="Key strengths, improvement areas, agreed objectives">
          <textarea className={textareaCls} rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => onConfirm(summary)}><CheckCircle2 size={15} /> Share results</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
