import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Award, CheckCircle2, Hourglass, MessageSquareWarning } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { APPRAISAL_STATUS, CLAIM_STATUS, GRADE_TONE, appraisalApi } from "@/lib/hr";
import { RatingForm } from "@/pages/hr/performance/AppraisalPage";
import { Field, inputCls, showDate, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

export default function MyAppraisals() {
  const queryClient = useQueryClient();
  const q = useQuery(["my-appraisals"], () => pocketbase.send("/api/dnr/appraisals/mine", {}) as Promise<{ items: any[] }>);
  const refresh = () => queryClient.invalidateQueries(["my-appraisals"]);
  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  const items = q.data?.items || [];
  if (!items.length) return null;
  return (
    <div className="space-y-4">
      {items.map((it) => (it.shared ? <Result key={it.id} it={it} onChange={refresh} /> : <Pending key={it.id} it={it} onChange={refresh} />))}
    </div>
  );
}

function Pending({ it, onChange }: { it: any; onChange: () => void }) {
  const canSelf = it.template?.allow_self_assessment && it.cycle.status === "open";
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        <Hourglass size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-[14px] font-semibold text-slate-900">{it.cycle.name}</p>
          <p className="text-[13px] text-slate-600">
            Period {showDate(it.cycle.period_start)} – {showDate(it.cycle.period_end)}. Your evaluators are reviewing your performance{it.cycle.due_date ? ` (due ${showDate(it.cycle.due_date)})` : ""}. You will be notified when the results are shared.
          </p>
          {canSelf && <p className="mt-1 text-[13px] text-slate-600">{it.self?.status === "submitted" ? "You have submitted your self-assessment; you can still correct it." : "Start with your self-assessment below — it helps the discussion with your supervisor and does not count in the final score."}</p>}
        </div>
      </div>
      {canSelf && (
        <RatingForm self appraisal={{ id: it.id, template_snapshot: it.template, activity_score: 0 }} review={it.self} sections={it.template.sections || []} onSaved={onChange} />
      )}
    </section>
  );
}

function Result({ it, onChange }: { it: any; onChange: () => void }) {
  const [ack, setAck] = React.useState(false);
  const [claim, setClaim] = React.useState(false);
  const claims = useQuery(["my-claims", it.id], () => pocketbase.collection("appraisal_claims").getFullList({ filter: `appraisal = "${it.id}"`, sort: "created", expand: "responded_by" }));
  const scale = it.template?.rating_scale || [];
  const top = Math.max(1, ...scale.map((s: any) => s.value));
  const label = (v: number | null) => (v ? scale.reduce((best: any, s: any) => (Math.abs(s.value - v) < Math.abs(best.value - v) ? s : best), scale[0])?.label : "—");
  const aw = Number(it.template?.activity_weight) || 0;
  const d = it.activity_detail || {};
  const open = ["shared", "disputed"].includes(it.status);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-5">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-slate-500">{it.cycle.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Award size={20} className="text-primaryDark" />
            <span className="text-[34px] font-bold leading-none tabular-nums">{it.final_score}</span>
            <span className="text-[13px] text-slate-500">/ 100</span>
            {it.grade && <Badge tone={GRADE_TONE[it.grade]}>Grade {it.grade} · {it.grade_label}</Badge>}
          </div>
          <div className="mt-2"><StatusBadge status={it.status} map={APPRAISAL_STATUS} /></div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {it.status === "shared" && <Button className="h-10" onClick={() => setAck(true)}><CheckCircle2 size={15} /> Acknowledge</Button>}
            <Button variant="outline" className="h-10" onClick={() => setClaim(true)}><MessageSquareWarning size={15} /> Question or claim</Button>
          </div>
        )}
      </header>
      <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-3">
        {[
          ["Evaluators' score", it.evaluator_score, `${100 - aw}% of the final score`],
          ["Activity score", it.activity_score, `${aw}% · ${d.completed ?? 0}/${d.plans ?? 0} plans done, ${d.reports ?? 0} reports`],
          ["Your self-assessment", it.self_score || "—", "Not counted"],
        ].map(([k, v, s]) => (
          <div key={k as string} className="bg-white px-4 py-3"><p className="text-[11.5px] text-slate-500">{k}</p><p className="text-[18px] font-semibold tabular-nums">{v}</p><p className="text-[11.5px] text-slate-500">{s}</p></div>
        ))}
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        {it.manager_summary && <p className="rounded-lg bg-primary/5 px-3.5 py-2.5 text-[13.5px]"><span className="font-medium">Summary from your supervisor:</span> {it.manager_summary}</p>}
        {(it.template?.sections || []).map((sec: any) => (
          <div key={sec.id}>
            <div className="mb-1.5 flex items-baseline justify-between border-b border-slate-200 pb-1">
              <h3 className="text-[13.5px] font-semibold">{sec.title}</h3>
              <span className="text-[12px] text-slate-500">weight {sec.weight}% · score <span className="font-semibold text-slate-800">{it.section_scores?.[sec.id] ?? "—"}</span></span>
            </div>
            <ul className="divide-y divide-slate-100">
              {sec.criteria.map((c: any) => {
                const r = it.criteria?.[c.id] || {};
                return (
                  <li key={c.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-slate-800">{c.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-[12px] text-slate-500 sm:inline">{label(r.value)}</span>
                        <span className="flex gap-0.5" aria-label={`${r.value ?? "no"} out of ${top}`}>
                          {scale.map((s: any) => <span key={s.value} className={cn("h-2 w-5 rounded-sm", r.value && s.value <= Math.round(r.value) ? "bg-primary" : "bg-slate-200")} />)}
                        </span>
                        <span className="w-8 text-right text-[13px] font-semibold tabular-nums">{r.value ?? "—"}</span>
                      </span>
                    </div>
                    {(r.comments || []).map((cm: string, i: number) => <p key={i} className="mt-1 text-[12px] italic text-slate-500">“{cm}”</p>)}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {(it.comments || []).length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-[13px] font-semibold">Comments from your evaluators</h3>
            {it.comments.map((c: any, i: number) => <p key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]"><span className="font-medium">{c.evaluator}:</span> {c.comment}</p>)}
          </div>
        )}
        {it.employee_comment && <p className="text-[13px] text-slate-600"><span className="font-medium">Your comment:</span> {it.employee_comment}</p>}
        {(claims.data || []).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold">Your questions and claims</h3>
            {(claims.data || []).map((c: any) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{c.criterion || "General"}</span><StatusBadge status={c.status} map={CLAIM_STATUS} /></div>
                <p className="mt-1">{c.message}</p>
                {c.response && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2"><span className="font-medium">{c.expand?.responded_by?.name}:</span> {c.response}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
      <AckDialog open={ack} it={it} onClose={() => setAck(false)} onDone={() => { setAck(false); onChange(); }} />
      <ClaimDialog open={claim} it={it} onClose={() => setClaim(false)} onDone={() => { setClaim(false); onChange(); claims.refetch(); }} />
    </section>
  );
}

function AckDialog({ open, it, onClose, onDone }: { open: boolean; it: any; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = React.useState("");
  const run = useMutation(() => appraisalApi.action(it.id, "acknowledge", { comment }), {
    onSuccess: () => {
      toast.success("Thank you — your acknowledgement was recorded");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>Acknowledge your appraisal</DialogTitle><DialogDescription>You confirm you have read the results. You can add a comment for your supervisor and HR.</DialogDescription></DialogHeader>
        <Field label="Your comment"><textarea className={textareaCls} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional" /></Field>
        <DialogFooter className="flex-row gap-2"><Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>Cancel</Button><Button className="flex-1 sm:flex-none" disabled={run.isLoading} onClick={() => run.mutate()}>Acknowledge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClaimDialog({ open, it, onClose, onDone }: { open: boolean; it: any; onClose: () => void; onDone: () => void }) {
  const [criterion, setCriterion] = React.useState("");
  const [message, setMessage] = React.useState("");
  const run = useMutation(() => appraisalApi.action(it.id, "claim", { criterion, message }), {
    onSuccess: () => {
      toast.success("Sent to your evaluators and department head");
      setMessage("");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const criteria = (it.template?.sections || []).flatMap((s: any) => s.criteria.map((c: any) => c.title));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>Question or claim</DialogTitle><DialogDescription>Explain what you disagree with or want clarified. Your evaluators answer; if they accept, they correct the ratings and share the results again.</DialogDescription></DialogHeader>
        <Field label="About">
          <select className={inputCls} value={criterion} onChange={(e) => setCriterion(e.target.value)}>
            <option value="">The appraisal in general</option>
            {criteria.map((c: string) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Your message" required hint={`${message.trim().length}/15 characters minimum`}>
          <textarea className={textareaCls} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Give facts and examples, e.g. reports submitted, dates, results achieved" />
        </Field>
        <DialogFooter className="flex-row gap-2"><Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>Cancel</Button><Button className="flex-1 sm:flex-none" disabled={message.trim().length < 15 || run.isLoading} onClick={() => run.mutate()}>Send</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
