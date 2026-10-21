import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, HelpCircle, MessageSquare, Pencil, Printer, Send } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, EmptyState, Initials, StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { Attachments, FileDrop, showDate, textareaCls, toFormData, useMe } from "@/components/portal/kit";
import { REPORT_STATUS, reportTypeLabel } from "./shared";

const KIND: Record<string, { label: string; tone: "neutral" | "violet" | "info" }> = {
  comment: { label: "Comment", tone: "neutral" },
  info_request: { label: "Asked for information", tone: "violet" },
  reply: { label: "Reply", tone: "info" },
};

export default function ReportDetail() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [showFiles, setShowFiles] = React.useState(false);

  const q = useQuery(["employee-report", reportId], async () => {
    const report: any = await pocketbase.collection("employeeReports").getOne(reportId!, { expand: "employee,recipients,action_plan,reviewed_by" });
    const comments = await pocketbase.collection("report_comments").getFullList({ filter: `report = "${reportId}"`, sort: "created", expand: "author" });
    return { report, comments };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["employee-report", reportId]);
    queryClient.invalidateQueries(["reports-mine"]);
    queryClient.invalidateQueries(["reports-to-review"]);
    queryClient.invalidateQueries(["notifications"]);
  };

  const post = useMutation(
    (kind: "comment" | "info_request") => pocketbase.collection("report_comments").create(toFormData({ report: reportId, author: me.data!.id, kind, body: body.trim() }, { attachments: files })),
    {
      onSuccess: (_, kind) => {
        toast.success(kind === "info_request" ? "Request sent — the author has been notified" : "Comment posted");
        setBody("");
        setFiles([]);
        setShowFiles(false);
        refresh();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const review = useMutation(() => pocketbase.collection("employeeReports").update(reportId!, { status: "reviewed" }), {
    onSuccess: () => {
      toast.success("Marked as reviewed — the author has been notified");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) return <div className="mx-auto max-w-4xl space-y-3 p-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>;
  if (!q.data) return <div className="p-4"><EmptyState icon={MessageSquare} title="Report not available" text="It may have been removed, or you are not one of its readers." /></div>;
  const { report: r, comments } = q.data;
  const isAuthor = me.data?.id === r.employee;
  const isReader = !isAuthor && Boolean(me.data);
  const title = r.title || `${reportTypeLabel(r.reportType)} report`;
  const status = r.status || "submitted";

  const section = (label: string, text?: string) =>
    text ? (
      <section>
        <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">{label}</h2>
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-800">{text}</p>
      </section>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-10 pt-3 sm:px-6 sm:pt-5">
      <button type="button" onClick={() => navigate("/dashboard/my/plans?tab=reports")} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 print:hidden">
        <ArrowLeft size={15} /> Reports
      </button>

      {status === "info_requested" && isAuthor && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-[13px] text-violet-900 print:hidden">
          <HelpCircle size={17} className="mt-0.5 shrink-0" />
          <span>Your supervisor asked for more information. Reply below — your answer sends the report back for review.</span>
        </div>
      )}

      <article className="rounded-xl border border-slate-200 bg-white shadow-card">
        <header className="border-b border-slate-100 p-4 sm:p-6">
          <p className="text-[12px] font-medium uppercase tracking-wider text-slate-500">{reportTypeLabel(r.reportType)} report</p>
          <h1 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[24px]">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={status} map={REPORT_STATUS} />
            {r.reviewed_at && <span className="text-[12px] text-slate-500">by {r.expand?.reviewed_by?.name} on {showDate(r.reviewed_at, "d MMM yyyy")}</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            {isReader && status !== "reviewed" && <Button className="h-10" disabled={review.isLoading} onClick={() => review.mutate()}><CheckCircle2 size={16} /> Mark as reviewed</Button>}
            {isAuthor && status !== "reviewed" && <Button variant="outline" className="h-10" onClick={() => navigate(`/dashboard/employee-portal/reports/${r.id}/edit`)}><Pencil size={15} /> Edit</Button>}
            <Button variant="ghost" className="h-10" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</Button>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {[
            ["Employee", r.expand?.employee?.name || r.employeeName],
            ["Department", r.department],
            ["Period", r.dateHappened && r.dateHappened.slice(0, 10) !== (r.reportDate || "").slice(0, 10) ? `${showDate(r.dateHappened, "d MMM")} – ${showDate(r.reportDate, "d MMM yyyy")}` : showDate(r.reportDate)],
            ["Sent to", (r.expand?.recipients || []).map((u: any) => u.name).join(", ")],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-3">
              <dt className="text-[11.5px] text-slate-500">{k}</dt>
              <dd className="text-[13.5px] font-medium text-slate-900">{v || "—"}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-6 p-4 sm:p-6">
          {r.expand?.action_plan && (
            <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px]">
              <span className="text-slate-500">Action plan: </span>
              <Link to={`/dashboard/employee-portal/plans/${r.action_plan}`} className="font-medium text-primaryDark hover:underline">{r.expand.action_plan.title}</Link>
            </p>
          )}
          {section("Work completed and results", r.tasksCompleted)}
          {section("Challenges", r.challengesFaced)}
          {section("Next steps", r.nextSteps)}
          {section("Support needed / other comments", r.additionalComments)}
          <section>
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Attachments</h2>
            <Attachments record={r} names={[...(r.attachments || []), ...(r.fileUpload ? [r.fileUpload] : [])]} empty="No attachments." />
          </section>
          <p className="text-[11.5px] text-slate-400">Submitted {showDate(r.created, "d MMM yyyy, HH:mm")}{r.updated !== r.created ? ` · updated ${showDate(r.updated, "d MMM yyyy, HH:mm")}` : ""}</p>
        </div>
      </article>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white shadow-card print:hidden">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
          <MessageSquare size={16} className="text-slate-400" />
          <h2 className="text-[14px] font-semibold text-slate-900">Discussion ({comments.length})</h2>
        </header>
        <ol className="space-y-4 px-4 py-4 sm:px-6">
          {!comments.length && <li className="text-[13px] text-slate-500">No comments yet.{isReader ? " Leave feedback or ask for more information." : ""}</li>}
          {comments.map((c: any) => {
            const mine = c.author === me.data?.id;
            return (
              <li key={c.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                <Initials name={c.expand?.author?.name} />
                <div className={cn("min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5", mine ? "bg-primary/5" : c.kind === "info_request" ? "bg-violet-50" : "bg-slate-50")}>
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <span className="font-semibold text-slate-900">{c.expand?.author?.name}</span>
                    {c.kind !== "comment" && <Badge tone={KIND[c.kind]?.tone}>{KIND[c.kind]?.label}</Badge>}
                    <span className="text-slate-400">{formatDistanceToNow(new Date(c.created.replace(" ", "T")), { addSuffix: true })}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-800">{c.body}</p>
                  {(c.attachments || []).length > 0 && <div className="mt-2"><Attachments record={c} names={c.attachments} /></div>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-slate-100 px-4 py-3 sm:px-6">
          <label htmlFor="comment" className="sr-only">Write a comment</label>
          <textarea id="comment" className={textareaCls} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={isAuthor && status === "info_requested" ? "Answer the question and attach any evidence…" : "Write a comment…"} />
          {showFiles && <div className="mt-2"><FileDrop files={files} onChange={setFiles} max={5} label="Attach files to your comment" /></div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!showFiles && <Button variant="ghost" size="sm" onClick={() => setShowFiles(true)}>Attach files</Button>}
            <div className="ml-auto flex flex-1 gap-2 sm:flex-none">
              {isReader && status !== "reviewed" && (
                <Button variant="outline" className="h-10 flex-1 sm:flex-none" disabled={!body.trim() || post.isLoading} onClick={() => post.mutate("info_request")}>
                  <HelpCircle size={15} /> Ask for information
                </Button>
              )}
              <Button className="h-10 flex-1 sm:flex-none" disabled={!body.trim() || post.isLoading} onClick={() => post.mutate("comment")}>
                <Send size={15} /> {isAuthor && status === "info_requested" ? "Send reply" : "Comment"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
