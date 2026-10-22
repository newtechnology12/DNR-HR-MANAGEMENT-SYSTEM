import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, CornerUpLeft, Lock, MessageSquare, MessageSquareWarning, RefreshCw, Send, Share2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { APPRAISAL_STATUS, CLAIM_STATUS, Section, appraisalApi, gradeOf, scoreOf } from "@/lib/hr";
import { Segmented, useMe } from "@/components/portal/kit";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  Field,
  KpiBand,
  Modal,
  Num,
  Page,
  Tabs,
  Textarea,
  TwoLine,
  fmtDate,
  fmtNumber,
} from "@/components/ims";
import { cn } from "@/utils";

const LOCKED = ["shared", "acknowledged", "finalized"];
const LIST = "/dashboard/hr/performance";

/** Grades are scores, not statuses: a coloured dot and the text ("C · Meets expectations"). */
export const GRADE_DOT: Record<string, string> = { A: "bg-ims-success", B: "bg-ims-success/55", C: "bg-ims-link", D: "bg-ims-priority-high", E: "bg-ims-danger" };

export function Grade({ grade, label, prefix, small }: { grade?: string | null; label?: string | null; prefix?: string; small?: boolean }) {
  if (!grade) return <span className="text-ims-faint">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-ims-text", small ? "text-t-small" : "text-t-body")}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", GRADE_DOT[grade] || "bg-ims-faint")} aria-hidden />
      <span className="font-semibold">{prefix ? `${prefix} ${grade}` : grade}</span>
      {label && <span className="text-ims-body">· {label}</span>}
    </span>
  );
}

type TabKey = "evaluate" | "scores" | "activity" | "claims";

export default function AppraisalPage() {
  const { appraisalId } = useParams();
  const queryClient = useQueryClient();
  const me = useMe();
  const { canPerform } = useRoles();
  const [sharing, setSharing] = React.useState(false);
  const [finalising, setFinalising] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey | null>(null);

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
      toast.success(v.action === "finalize" ? "Appraisal finalised and locked" : v.action === "share" ? "Results shared and the employee notified" : "Activity score refreshed");
      setSharing(false);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading || me.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Lock}
            text="This appraisal is not available. Only the employee (once the results are shared), the evaluators and HR can open it."
            action={<ButtonLink to={LIST}>Back to appraisals</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }
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

  const canShare = isManager && ["submitted", "in_progress", "disputed"].includes(a.status) && a.evaluator_score > 0;
  const canFinalise = canPerform("manage_appraisals") && ["shared", "acknowledged"].includes(a.status);
  const canRefresh = isManager && !LOCKED.includes(a.status);
  const canRespond = !isEmployee && (isEvaluator || isManager);
  const showSectionScores = (isManager || isEvaluator) && others.length > 0;
  const hasScores = showSectionScores || Boolean(a.manager_summary || a.employee_comment);
  const openClaims = (claims as any[]).filter((c) => c.status === "open").length;
  const evaluatorNames = (a.expand?.evaluators || []).map((u: any) => u.name).join(", ");

  const tabs = [
    ...(canRate ? [{ key: "evaluate", label: "Your evaluation" }] : []),
    ...(hasScores ? [{ key: "scores", label: "Scores" }] : []),
    { key: "activity", label: "Activity score" },
    ...((claims as any[]).length ? [{ key: "claims", label: "Claims", count: (claims as any[]).length }] : []),
  ];
  const fallback: TabKey = canRespond && openClaims ? "claims" : canRate ? "evaluate" : hasScores ? "scores" : "activity";
  const active: TabKey = tab && tabs.some((t) => t.key === tab) ? tab : fallback;

  const reviewers = [...others, ...(self ? [self] : [])];
  const sectionColumns: Column<Section>[] = [
    { key: "title", header: "Section", clamp: true, cell: (s) => <span className="font-semibold text-ims-text">{s.title}</span> },
    { key: "weight", header: "Weight (%)", numeric: true, cell: (s) => <span className="text-ims-muted">{fmtNumber(s.weight, true)}</span> },
    ...reviewers.map((r: any) => ({
      key: r.id,
      header: `${r.expand?.evaluator?.name || "Evaluator"}${r.role === "self" ? " (self)" : ""}`,
      numeric: true,
      cell: (s: Section) => {
        const v = scoreOf([s], tpl.rating_scale || [], r.ratings || {}).bySection[s.id];
        return <span className={cn(r.role === "self" && "text-ims-muted")}>{v ?? "—"}</span>;
      },
    })),
    { key: "average", header: "Average", numeric: true, cell: (s) => <span className="font-bold text-ims-text">{a.section_scores?.[s.id] ?? "—"}</span> },
  ];
  const comments = [...others, ...(self && self.status === "submitted" ? [self] : [])].filter((r: any) => r.overall_comment);

  const activityRows = [
    { key: "completion", label: "Plan completion", value: detail.completion, weight: "50%", basis: `${detail.completed ?? 0} of ${detail.plans ?? 0} plans completed` },
    { key: "on_time", label: "Completed on time", value: detail.on_time, weight: "25%", basis: "Completed before the deadline" },
    { key: "reporting", label: "Reporting", value: detail.reporting, weight: "25%", basis: `${detail.reports ?? 0} reports of ${detail.expected_reports ?? 0} expected` },
    { key: "reviewed", label: "Reports reviewed", value: detail.reports ? Math.round(((detail.reports_reviewed || 0) / detail.reports) * 100) : null, weight: "Not counted", basis: `${detail.reports_reviewed ?? 0} reviewed by supervisors` },
  ];
  const activityColumns: Column<(typeof activityRows)[number]>[] = [
    { key: "label", header: "Measure", cell: (r) => <span className="font-semibold text-ims-text">{r.label}</span>, sub: (r) => r.basis },
    { key: "weight", header: "Weight", align: "right", nowrap: true, width: "140px", cell: (r) => <span className="text-ims-muted">{r.weight}</span> },
    { key: "value", header: "Result (%)", numeric: true, width: "140px", cell: (r) => (r.value === null || r.value === undefined ? <span className="text-ims-faint">n/a</span> : <Num value={r.value} decimals />), total: a.activity_score ?? "—" },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to appraisals", to: LIST }}
        type={a.expand?.cycle?.name || "Appraisal"}
        status={APPRAISAL_STATUS[a.status]?.label || a.status}
        statusNote={APPRAISAL_STATUS[a.status]?.note}
        title={a.expand?.employee?.name || "Appraisal"}
        facts={[
          a.expand?.department?.name,
          { label: "Evaluated by", value: evaluatorNames || "HR" },
          a.grade ? <Grade key="grade" prefix="Grade" grade={a.grade} label={a.grade_label} /> : null,
          a.expand?.cycle?.due_date ? { label: "Due", value: fmtDate(a.expand.cycle.due_date) } : null,
        ]}
        actions={
          <>
            {canRefresh && (
              <Button icon={RefreshCw} loading={act.isLoading && act.variables?.action === "refresh"} onClick={() => act.mutate({ action: "refresh" })}>
                Refresh activity score
              </Button>
            )}
            {canShare ? (
              <Button variant="primary" icon={Share2} onClick={() => setSharing(true)}>Share results</Button>
            ) : canFinalise ? (
              <Button variant="primary" icon={Lock} onClick={() => setFinalising(true)}>Finalise</Button>
            ) : null}
          </>
        }
      />

      <KpiBand
        items={[
          { label: "Final score", value: a.final_score || "—", sub: "Out of 100" },
          { label: "Evaluators", value: a.evaluator_score || "—", sub: `${100 - aw}% of the final score · ${others.length} review${others.length === 1 ? "" : "s"}` },
          { label: "Activity (system)", value: a.activity_score ?? "—", sub: `${aw}% · ${detail.plans ?? 0} plans, ${detail.reports ?? 0} reports` },
          { label: "Self-assessment", value: a.self_score || "—", sub: "For discussion, not counted" },
        ]}
      />

      {a.status === "disputed" && canRespond && openClaims > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>The employee raised {openClaims === 1 ? "a claim" : `${openClaims} claims`} about the results. Answer {openClaims === 1 ? "it" : "them"} under Claims, and correct the ratings if you accept.</span>
        </p>
      )}

      <Tabs label="Appraisal sections" active={active} onChange={(k) => setTab(k as TabKey)} tabs={tabs} />

      {/* Kept mounted so ratings typed so far survive switching tabs. */}
      {canRate && (
        <div hidden={active !== "evaluate"}>
          <RatingForm key={mine?.id || "new"} appraisal={a} review={mine} sections={sections} onSaved={refresh} />
        </div>
      )}

      {active === "scores" && (
        <>
          {showSectionScores && (
            <Card padded={false}>
              <div className="px-[18px] pt-5 sm:px-5">
                <CardHeader title="Scores by section" subtitle="Out of 100 for each reviewer; the average makes up the evaluator score." />
              </div>
              <DataTable columns={sectionColumns} rows={sections} rowKey={(s) => s.id} minWidth={560} caption="Scores by section" empty={<EmptyState compact text="This template has no sections." />} />
            </Card>
          )}
          {showSectionScores && comments.length > 0 && (
            <Card>
              <CardHeader title="Comments" subtitle="Overall comments from the reviews." />
              <ul className="divide-y divide-ims-divider">
                {comments.map((r: any) => (
                  <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-t-small font-semibold text-ims-text">{r.expand?.evaluator?.name}{r.role === "self" ? " (self-assessment)" : ""}</p>
                    <p className="mt-0.5 whitespace-pre-line text-t-body text-ims-body">“{r.overall_comment}”</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(a.manager_summary || a.employee_comment) && (
            <Card>
              <CardHeader title="Discussion" />
              <Details
                items={[
                  ...(a.manager_summary ? [{ label: "Summary shared with the employee", value: <span className="whitespace-pre-line">{a.manager_summary}</span> }] : []),
                  ...(a.employee_comment ? [{ label: "Employee's comment", value: <span className="whitespace-pre-line">{a.employee_comment}</span> }] : []),
                ]}
              />
            </Card>
          )}
        </>
      )}

      {active === "activity" && (
        <Card padded={false}>
          <div className="px-[18px] pt-5 sm:px-5">
            <CardHeader
              title="Activity score"
              subtitle={`Calculated by the system from action plans and work reports between ${fmtDate(a.expand?.cycle?.period_start)} and ${fmtDate(a.expand?.cycle?.period_end)}.${detail.note ? ` ${detail.note}` : ""}`}
            />
          </div>
          <DataTable columns={activityColumns} rows={activityRows} rowKey={(r) => r.key} minWidth={520} totalLabel="Activity score" caption="Activity score" />
        </Card>
      )}

      {active === "claims" && (claims as any[]).length > 0 && <Claims claims={claims as any[]} canRespond={canRespond} onDone={refresh} />}

      <ShareDialog open={sharing} onClose={() => setSharing(false)} busy={act.isLoading} onConfirm={(summary) => act.mutate({ action: "share", body: { summary } })} appraisal={a} />
      <ConfirmDialog
        open={finalising}
        onClose={() => setFinalising(false)}
        title={`Finalise the appraisal of ${a.expand?.employee?.name || "this employee"}?`}
        description="The scores and grade are locked and can no longer be changed."
        confirmLabel="Finalise"
        onConfirm={() => act.mutateAsync({ action: "finalize" })}
      />
    </Page>
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
      toast.success(submit ? (self ? "Self-assessment submitted to your supervisor" : "Evaluation submitted") : "Draft saved");
      onSaved();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const commentId = `rating-comment-${appraisal.id}`;
  return (
    <section className="rounded-card border border-ims-border bg-ims-card" aria-label={self ? "Your self-assessment" : "Your evaluation"}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-card border-b border-ims-divider bg-ims-card/95 px-[18px] py-3 backdrop-blur sm:px-5">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-t-section text-ims-text">
            {self ? "Your self-assessment" : "Your evaluation"}
            {review?.status === "submitted" && (
              <span className="inline-flex items-center gap-1 text-t-small font-semibold text-ims-success">
                <CheckCircle2 size={14} aria-hidden /> Submitted
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-t-small text-ims-muted">{rated} of {total} criteria rated{scale.length ? ` · scale ${scale[0].value}–${scale[scale.length - 1].value}` : ""}</p>
        </div>
        {!self && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-t-small text-ims-muted">Your score → projected final</p>
              <p className="text-[18px] font-extrabold tabular-nums text-ims-text">
                {live.score ?? "—"} <span className="text-t-body font-normal text-ims-muted">→ {projected ?? "—"}</span>
              </p>
            </div>
            {grade && <Grade grade={grade.grade} label={grade.label} />}
          </div>
        )}
      </header>
      <div className="space-y-6 px-[18px] py-5 sm:px-5">
        <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-control bg-ims-subtle px-3 py-2 text-t-small text-ims-body">
          {scale.map((s: any) => (
            <span key={s.value}><span className="font-bold text-ims-text">{s.value}</span> {s.label}</span>
          ))}
        </p>
        {sections.map((sec) => (
          <div key={sec.id}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-ims-border pb-2">
              <h3 className="text-[15px] font-extrabold text-ims-text">{sec.title}</h3>
              <span className="text-t-small text-ims-muted">Weight {sec.weight}% · score {live.bySection[sec.id] ?? "—"}</span>
            </div>
            <ul className="divide-y divide-ims-divider">
              {sec.criteria.map((c) => {
                const r = ratings[c.id] || { value: 0, comment: "" };
                const notesOpen = Boolean(openNotes[c.id] || r.comment);
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-t-body font-semibold text-ims-text">
                          {c.title}
                          {Number(c.weight) !== 1 && <span className="ml-1.5 text-t-small font-normal text-ims-muted" title="Weight inside the section">×{c.weight}</span>}
                        </p>
                        {c.description && <p className="mt-0.5 text-t-small text-ims-muted">{c.description}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
                        <div className="flex items-center gap-1.5" role="radiogroup" aria-label={c.title}>
                          {scale.map((s: any) => (
                            <button
                              key={s.value}
                              type="button"
                              role="radio"
                              aria-checked={r.value === s.value}
                              aria-label={`${s.value} — ${s.label}`}
                              title={`${s.value} — ${s.label}`}
                              onClick={() => setRatings((x) => ({ ...x, [c.id]: { ...r, value: s.value } }))}
                              className={cn(
                                "h-10 w-10 rounded-control border text-t-body font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus focus-visible:ring-offset-1",
                                r.value === s.value ? "border-ims-primary bg-ims-primary text-white" : "border-ims-field bg-ims-card text-ims-body hover:bg-ims-subtle"
                              )}
                            >
                              {s.value}
                            </button>
                          ))}
                          <Button
                            variant="ghost"
                            size="icon"
                            icon={MessageSquare}
                            aria-label={`Add an example or comment for ${c.title}`}
                            aria-expanded={notesOpen}
                            title="Add an example or comment"
                            onClick={() => setOpenNotes((x) => ({ ...x, [c.id]: !x[c.id] }))}
                            className={cn(r.comment && "text-ims-link")}
                          />
                        </div>
                        {r.value > 0 && <p className="text-t-small text-ims-muted">{scale.find((s: any) => s.value === r.value)?.label}</p>}
                      </div>
                    </div>
                    {notesOpen && (
                      <Textarea
                        className="mt-2 min-h-[64px]"
                        rows={2}
                        value={r.comment}
                        aria-label={`Example or evidence for ${c.title}`}
                        placeholder="Example or evidence (optional)"
                        onChange={(e) => setRatings((x) => ({ ...x, [c.id]: { ...r, comment: e.target.value } }))}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <Field label="Overall comment" htmlFor={commentId} hint="Strengths, areas to improve and the development actions you agreed.">
          <Textarea id={commentId} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-3 border-t border-ims-divider pt-4 sm:flex-row sm:items-center sm:justify-end">
          {rated < total && <p className="text-t-small text-ims-muted sm:mr-auto">Rate every criterion to submit ({total - rated} left).</p>}
          <Button loading={save.isLoading && save.variables === false} disabled={save.isLoading} onClick={() => save.mutate(false)}>Save draft</Button>
          <Button variant="primary" icon={Send} loading={save.isLoading && save.variables === true} disabled={save.isLoading || rated < total} onClick={() => save.mutate(true)}>
            {self ? "Submit self-assessment" : "Submit evaluation"}
          </Button>
        </div>
      </div>
    </section>
  );
}

const DECISIONS: { value: string; label: string; hint: string }[] = [
  { value: "upheld", label: "Accept", hint: "Accept: I will correct the ratings" },
  { value: "rejected", label: "Do not accept", hint: "Do not accept the claim" },
  { value: "answered", label: "Answer only", hint: "Answer the question without changing the ratings" },
];

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
    <Card>
      <CardHeader title="Claims and questions" subtitle="Raised by the employee about the results." />
      <ul className="space-y-3">
        {claims.map((c) => {
          const a = answer[c.id] || { decision: "answered", response: "" };
          const replyId = `claim-reply-${c.id}`;
          return (
            <li key={c.id} className="rounded-control border border-ims-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="flex min-w-0 items-start gap-2 text-t-body">
                  <MessageSquareWarning size={16} className="mt-0.5 shrink-0 text-ims-orange" aria-hidden />
                  <TwoLine clamp={false} main={c.criterion || "General"} sub={`${c.expand?.author?.name || "Employee"} · ${fmtDate(c.created)}`} />
                </span>
                <StatusBadge status={c.status} map={CLAIM_STATUS} />
              </div>
              <p className="mt-2 whitespace-pre-line text-t-body text-ims-body">{c.message}</p>
              {c.response && (
                <p className="mt-3 rounded-control bg-ims-subtle px-3 py-2.5 text-t-body text-ims-body">
                  <span className="font-semibold text-ims-text">{c.expand?.responded_by?.name}:</span> {c.response}
                </p>
              )}
              {canRespond && c.status === "open" && (
                <div className="mt-4 space-y-3 border-t border-ims-divider pt-4">
                  <Field label="Decision">
                    <Segmented ariaLabel="Decision" value={a.decision} onChange={(k) => setAnswer((x) => ({ ...x, [c.id]: { ...a, decision: k } }))} options={DECISIONS} className="sm:max-w-md" />
                  </Field>
                  <Field label="Your answer to the employee" required htmlFor={replyId} hint={a.decision === "upheld" ? "Say what you will correct; then update your ratings under Your evaluation." : "At least 10 characters."}>
                    <Textarea id={replyId} rows={2} className="min-h-[72px]" value={a.response} onChange={(e) => setAnswer((x) => ({ ...x, [c.id]: { ...a, response: e.target.value } }))} />
                  </Field>
                  <div className="flex justify-end">
                    <Button variant="primary" icon={Send} disabled={a.response.trim().length < 10 || respond.isLoading} loading={respond.isLoading && respond.variables === c.id} onClick={() => respond.mutate(c.id)}>
                      Send answer
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ShareDialog({ open, onClose, onConfirm, busy, appraisal }: { open: boolean; onClose: () => void; onConfirm: (s: string) => void; busy: boolean; appraisal: any }) {
  const [summary, setSummary] = React.useState(appraisal.manager_summary || "");
  const name = appraisal.expand?.employee?.name || "the employee";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share results with ${name}?`}
      description={`${name} sees the final score (${appraisal.final_score}), the grade, the ratings and the evaluators' comments, and can acknowledge them or raise a claim.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => onConfirm(summary)}>Share results</Button>
        </>
      }
    >
      <Field label="Summary for the employee" htmlFor="share-summary" hint="Key strengths, areas to improve and the objectives you agreed.">
        <Textarea id="share-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
    </Modal>
  );
}
