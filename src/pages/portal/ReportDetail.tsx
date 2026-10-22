/**
 * One work report: what was done, challenges, next steps, attachments, and the discussion with its
 * readers (comments, requests for more information, replies). Readers mark it as reviewed.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, HelpCircle, MessageSquare, Paperclip, Pencil, Printer, Send } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { Initials } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { Attachments, FileDrop, toFormData, useMe } from "@/components/portal/kit";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DetailHeader,
  Details,
  EmptyState,
  MoreMenu,
  Page,
  Pill,
  Textarea,
  fmtDate,
  fmtDateTime,
  fmtWhen,
} from "@/components/ims";
import { REPORT_STATUS, reportTypeLabel } from "./shared";

const BACK = "/dashboard/my/plans?tab=reports";
const KIND: Record<string, { label: string; tone: "neutral" | "orange" | "info" }> = {
  comment: { label: "Comment", tone: "neutral" },
  info_request: { label: "Asked for information", tone: "orange" },
  reply: { label: "Reply", tone: "info" },
};

export default function ReportDetail() {
  const { reportId } = useParams();
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
        toast.success(kind === "info_request" ? "Question sent; the author has been notified" : "Comment posted");
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
      toast.success("Report marked as reviewed; the author has been notified");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={MessageSquare} text="This report is not available. It may have been removed, or you are not one of its readers." action={<ButtonLink to={BACK}>Back to reports</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { report: r, comments } = q.data;
  const isAuthor = me.data?.id === r.employee;
  const isReader = !isAuthor && Boolean(me.data);
  const title = r.title || `${reportTypeLabel(r.reportType)} report`;
  const status = r.status || "submitted";
  const files_ = [...(r.attachments || []), ...(r.fileUpload ? [r.fileUpload] : [])];
  const period = r.dateHappened && r.dateHappened.slice(0, 10) !== (r.reportDate || "").slice(0, 10) ? `${fmtDate(r.dateHappened).replace(/ \d{4}$/, "")} – ${fmtDate(r.reportDate)}` : fmtDate(r.reportDate);

  const section = (label: string, text?: string) =>
    text ? (
      <section>
        <h3 className="mb-1 text-t-label text-ims-muted">{label}</h3>
        <p className="whitespace-pre-line text-t-body leading-relaxed text-ims-text">{text}</p>
      </section>
    ) : null;

  return (
    <Page>
      <div className="print:hidden">
        <DetailHeader
          back={{ label: "Back to reports", to: BACK }}
          type={`${reportTypeLabel(r.reportType)} report`}
          status={REPORT_STATUS[status]?.label || status}
          statusNote={r.reviewed_at ? `Reviewed by ${r.expand?.reviewed_by?.name || "a reader"} on ${fmtDate(r.reviewed_at)}` : REPORT_STATUS[status]?.note}
          title={title}
          facts={[
            { label: "By", value: r.expand?.employee?.name || r.employeeName || "—" },
            r.department,
            { label: "Period", value: period },
          ]}
          actions={
            <>
              <MoreMenu items={[{ label: "Print or save as PDF", icon: Printer, onSelect: () => window.print() }]} />
              {isAuthor && status !== "reviewed" && <ButtonLink to={`/dashboard/employee-portal/reports/${r.id}/edit`} icon={Pencil}>Edit</ButtonLink>}
              {isReader && status !== "reviewed" && <Button variant="primary" icon={CheckCircle2} loading={review.isLoading} onClick={() => review.mutate()}>Mark as reviewed</Button>}
            </>
          }
        />
      </div>

      {status === "info_requested" && isAuthor && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange print:hidden">
          <HelpCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Your supervisor asked for more information. Reply in the discussion; your answer sends the report back for review.</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Report" subtitle={`Submitted ${fmtDateTime(r.created)}${r.updated !== r.created ? ` · updated ${fmtDateTime(r.updated)}` : ""}`} />
            <Details
              className="mb-5 border-b border-ims-divider pb-5"
              columns={2}
              items={[
                { label: "Sent to", value: (r.expand?.recipients || []).map((u: any) => u.name).join(", ") },
                ...(r.expand?.action_plan
                  ? [{ label: "Action plan", value: <Link to={`/dashboard/employee-portal/plans/${r.action_plan}`} className="font-semibold text-ims-link hover:underline">{r.expand.action_plan.title}</Link>, wide: true }]
                  : []),
              ]}
            />
            <div className="space-y-5">
              {section("Work completed and results", r.tasksCompleted)}
              {section("Challenges", r.challengesFaced)}
              {section("Next steps", r.nextSteps)}
              {section("Support needed / other comments", r.additionalComments)}
            </div>
          </Card>
          <Card>
            <CardHeader title="Attachments" subtitle="Evidence sent with the report." />
            <Attachments record={r} names={files_} empty="No attachments." />
          </Card>
        </div>

        <Card padded={false} className="self-start overflow-hidden print:hidden">
          <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
            <CardHeader title={`Discussion (${comments.length})`} subtitle="Comments and questions from the readers, and the author's replies." className="mb-3" />
          </div>
          <ol className="max-h-[60vh] space-y-4 overflow-y-auto px-[18px] pb-4 sm:px-5">
            {!comments.length && <li className="text-t-body text-ims-muted">No comments yet.{isReader ? " Leave feedback or ask for more information." : ""}</li>}
            {comments.map((c: any) => {
              const mine = c.author === me.data?.id;
              return (
                <li key={c.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                  <Initials name={c.expand?.author?.name} />
                  <div className={cn("min-w-0 max-w-[85%] rounded-control px-3.5 py-2.5", mine ? "bg-ims-info-bg" : c.kind === "info_request" ? "bg-ims-orange-bg" : "bg-ims-subtle")}>
                    <p className="flex flex-wrap items-center gap-1.5 text-t-small">
                      <span className="font-semibold text-ims-text">{c.expand?.author?.name}</span>
                      {c.kind !== "comment" && KIND[c.kind] && <Pill tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Pill>}
                      <span className="text-ims-muted" title={fmtDateTime(c.created)}>{fmtWhen(c.created)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-t-body leading-relaxed text-ims-text">{c.body}</p>
                    {(c.attachments || []).length > 0 && <div className="mt-2"><Attachments record={c} names={c.attachments} /></div>}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="border-t border-ims-divider px-[18px] py-4 sm:px-5">
            <label htmlFor="comment" className="mb-1.5 block text-t-label text-ims-text">{isAuthor && status === "info_requested" ? "Your answer" : "Write a comment"}</label>
            <Textarea id="comment" rows={3} className="min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder={isAuthor && status === "info_requested" ? "Answer the question and attach any evidence" : isAuthor ? "A note for your readers" : "Feedback for the author"} />
            {showFiles && <div className="mt-2"><FileDrop files={files} onChange={setFiles} max={5} label="Attach files to your comment" /></div>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!showFiles && <Button variant="ghost" size="sm" icon={Paperclip} onClick={() => setShowFiles(true)}>Attach files</Button>}
              <div className="ml-auto flex flex-wrap gap-2">
                {isReader && status !== "reviewed" && (
                  <Button icon={HelpCircle} disabled={!body.trim() || post.isLoading} onClick={() => post.mutate("info_request")}>Ask for information</Button>
                )}
                <Button variant={isReader && status !== "reviewed" ? "secondary" : "primary"} icon={Send} disabled={!body.trim()} loading={post.isLoading} onClick={() => post.mutate("comment")}>
                  {isAuthor && status === "info_requested" ? "Send reply" : "Comment"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
