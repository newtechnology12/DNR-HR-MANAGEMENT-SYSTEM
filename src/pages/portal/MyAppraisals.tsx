/**
 * The signed-in person's appraisals, embedded in a card (My performance, classic portal): open cycles with
 * the self-assessment form, and shared results with the scores, ratings, comments, acknowledgement and claims.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { CheckCircle2, Hourglass, MessageSquareWarning } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { APPRAISAL_STATUS, CLAIM_STATUS, appraisalApi } from "@/lib/hr";
import { RatingForm } from "@/pages/hr/performance/AppraisalPage";
import { Button, Field, KpiBand, Modal, Select, Textarea, fmtDate } from "@/components/ims";
import { cn } from "@/utils";

export default function MyAppraisals() {
  const queryClient = useQueryClient();
  const q = useQuery(["my-appraisals"], () => pocketbase.send("/api/dnr/appraisals/mine", {}) as Promise<{ items: any[] }>);
  const refresh = () => queryClient.invalidateQueries(["my-appraisals"]);
  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-card" />;
  const items = q.data?.items || [];
  if (!items.length) return null;
  return (
    <div className="min-w-0 divide-y divide-ims-divider">
      {items.map((it) => (
        <div key={it.id} className="py-5 first:pt-0 last:pb-0">
          {it.shared ? <Result it={it} onChange={refresh} /> : <Pending it={it} onChange={refresh} />}
        </div>
      ))}
    </div>
  );
}

function Pending({ it, onChange }: { it: any; onChange: () => void }) {
  const canSelf = it.template?.allow_self_assessment && it.cycle.status === "open";
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ims-warning-bg text-ims-warning" aria-hidden><Hourglass size={17} /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-t-section text-ims-text">{it.cycle.name}</h2>
            {it.status && <StatusBadge status={it.status} map={APPRAISAL_STATUS} />}
          </div>
          <p className="mt-1 text-t-body text-ims-body">
            Period {fmtDate(it.cycle.period_start)} – {fmtDate(it.cycle.period_end)}. Your evaluators are reviewing your performance{it.cycle.due_date ? ` (due ${fmtDate(it.cycle.due_date)})` : ""}. You are notified when the results are shared.
          </p>
          {canSelf && (
            <p className="mt-1 text-t-body text-ims-muted">
              {it.self?.status === "submitted" ? "You have submitted your self-assessment; you can still correct it." : "Start with your self-assessment below: it helps the discussion with your supervisor and does not count in the final score."}
            </p>
          )}
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
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-t-section text-ims-text">{it.cycle.name}</h2>
          <div className="mt-1.5"><StatusBadge status={it.status} map={APPRAISAL_STATUS} /></div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button icon={MessageSquareWarning} onClick={() => setClaim(true)}>Question or claim</Button>
            {it.status === "shared" && <Button variant="primary" icon={CheckCircle2} onClick={() => setAck(true)}>Acknowledge</Button>}
          </div>
        )}
      </header>

      <KpiBand
        items={[
          { label: "Final score", value: `${it.final_score ?? "—"} / 100`, sub: it.grade ? `Grade ${it.grade} · ${it.grade_label}` : undefined },
          { label: "Evaluators' score", value: it.evaluator_score ?? "—", sub: `${100 - aw}% of the final score` },
          { label: "Activity score", value: it.activity_score ?? "—", sub: `${aw}% · ${d.completed ?? 0}/${d.plans ?? 0} plans done, ${d.reports ?? 0} reports` },
          { label: "Your self-assessment", value: it.self_score || "—", sub: "Not counted" },
        ]}
      />

      {it.manager_summary && (
        <p className="rounded-control bg-ims-info-bg px-4 py-3 text-t-body text-ims-text">
          <span className="font-semibold">Summary from your supervisor:</span> {it.manager_summary}
        </p>
      )}

      {(it.template?.sections || []).map((sec: any) => (
        <div key={sec.id}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-ims-border pb-1.5">
            <h3 className="text-t-label text-ims-text">{sec.title}</h3>
            <span className="text-t-small text-ims-muted">Weight {sec.weight}% · score <span className="font-semibold text-ims-text">{it.section_scores?.[sec.id] ?? "—"}</span></span>
          </div>
          <ul className="divide-y divide-ims-divider">
            {sec.criteria.map((c: any) => {
              const r = it.criteria?.[c.id] || {};
              return (
                <li key={c.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-t-body text-ims-text">{c.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-t-small text-ims-muted sm:inline">{label(r.value)}</span>
                      <span className="flex gap-0.5" role="img" aria-label={`${r.value ?? "No"} out of ${top}`}>
                        {scale.map((s: any) => <span key={s.value} className={cn("h-2 w-5 rounded-sm", r.value && s.value <= Math.round(r.value) ? "bg-ims-primary" : "bg-ims-divider")} />)}
                      </span>
                      <span className="w-8 text-right text-t-body font-semibold tabular-nums">{r.value ?? "—"}</span>
                    </span>
                  </div>
                  {(r.comments || []).map((cm: string, i: number) => <p key={i} className="mt-1 text-t-small italic text-ims-muted">“{cm}”</p>)}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {(it.comments || []).length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-t-label text-ims-text">Comments from your evaluators</h3>
          {it.comments.map((c: any, i: number) => (
            <p key={i} className="rounded-control bg-ims-thead px-3.5 py-2.5 text-t-body text-ims-body"><span className="font-semibold text-ims-text">{c.evaluator}:</span> {c.comment}</p>
          ))}
        </div>
      )}
      {it.employee_comment && <p className="text-t-body text-ims-body"><span className="font-semibold text-ims-text">Your comment:</span> {it.employee_comment}</p>}
      {(claims.data || []).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-t-label text-ims-text">Your questions and claims</h3>
          {(claims.data || []).map((c: any) => (
            <div key={c.id} className="rounded-control border border-ims-border px-4 py-3 text-t-body">
              <div className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold text-ims-text">{c.criterion || "General"}</span><StatusBadge status={c.status} map={CLAIM_STATUS} /></div>
              <p className="mt-1 text-ims-body">{c.message}</p>
              {c.response && <p className="mt-2 rounded-control bg-ims-thead px-3 py-2 text-ims-body"><span className="font-semibold text-ims-text">{c.expand?.responded_by?.name}:</span> {c.response}</p>}
            </div>
          ))}
        </div>
      )}
      <AckDialog open={ack} it={it} onClose={() => setAck(false)} onDone={() => { setAck(false); onChange(); }} />
      <ClaimDialog open={claim} it={it} onClose={() => setClaim(false)} onDone={() => { setClaim(false); onChange(); claims.refetch(); }} />
    </section>
  );
}

function AckDialog({ open, it, onClose, onDone }: { open: boolean; it: any; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = React.useState("");
  const run = useMutation(() => appraisalApi.action(it.id, "acknowledge", { comment }), {
    onSuccess: () => {
      toast.success(`Acknowledgement of ${it.cycle?.name || "the appraisal"} recorded`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Acknowledge your appraisal?"
      description="You confirm you have read the results. You can add a comment for your supervisor and HR."
      footer={
        <>
          <Button onClick={onClose} disabled={run.isLoading}>Cancel</Button>
          <Button variant="primary" loading={run.isLoading} onClick={() => run.mutate()}>Acknowledge</Button>
        </>
      }
    >
      <Field label="Your comment" htmlFor={`ack-${it.id}`} hint="Optional.">
        <Textarea id={`ack-${it.id}`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}

function ClaimDialog({ open, it, onClose, onDone }: { open: boolean; it: any; onClose: () => void; onDone: () => void }) {
  const [criterion, setCriterion] = React.useState("");
  const [message, setMessage] = React.useState("");
  const run = useMutation(() => appraisalApi.action(it.id, "claim", { criterion, message }), {
    onSuccess: () => {
      toast.success("Sent to your evaluators and head of department");
      setMessage("");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const criteria = (it.template?.sections || []).flatMap((s: any) => s.criteria.map((c: any) => c.title));
  const length = message.trim().length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Question or claim"
      description="Explain what you disagree with or want clarified. Your evaluators answer; if they accept, they correct the ratings and share the results again."
      footer={
        <>
          <Button onClick={onClose} disabled={run.isLoading}>Cancel</Button>
          <Button variant="primary" disabled={length < 15} loading={run.isLoading} onClick={() => run.mutate()}>Send</Button>
        </>
      }
    >
      <Field label="About" htmlFor={`claim-about-${it.id}`}>
        <Select id={`claim-about-${it.id}`} value={criterion} onChange={(e) => setCriterion(e.target.value)}>
          <option value="">The appraisal in general</option>
          {criteria.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Your message" required htmlFor={`claim-message-${it.id}`} hint={`${length}/15 characters minimum`}>
        <Textarea id={`claim-message-${it.id}`} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Give facts and examples, for example reports submitted, dates, results achieved" />
      </Field>
    </Modal>
  );
}
