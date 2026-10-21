/**
 * HR → Attendance corrections. Staff ask for days they could not clock in (mission, training, a meeting
 * outside the office, the clock-in failing); HR checks the evidence and approves, which records the days
 * in the attendance log as "correction", or rejects with a reason. Nobody approves their own request.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "react-query";
import { toast } from "sonner";
import { CalendarCheck, Check, ExternalLink, Paperclip, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { showDay } from "@/lib/ims";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { displayName } from "@/components/enterprise/Attachments";
import { Field, FormBlock, FormDialog, textareaCls } from "@/components/portal/kit";
import { CORRECTION_REASONS } from "@/components/workspace/CorrectionDialog";
import getFileUrl from "@/utils/getFileUrl";
import { cn } from "@/utils";

const STATUS = {
  pending: { label: "Waiting for HR", tone: "warning" as const },
  approved: { label: "Approved", tone: "success" as const },
  rejected: { label: "Rejected", tone: "danger" as const },
};

const daysText = (r: any) => ((r.dates || []) as string[]).map((d) => showDay(d)).join(", ");

export default function AttendanceCorrections() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = React.useState<any>(null);
  const [refresh, setRefresh] = React.useState(0);
  const view = params.get("view") || "pending";
  const views: RecordView[] = [
    { key: "pending", label: "Waiting for HR", filter: 'status = "pending"' },
    { key: "approved", label: "Approved", filter: 'status = "approved"' },
    { key: "rejected", label: "Rejected", filter: 'status = "rejected"' },
    { key: "all", label: "All" },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Attendance corrections"
        description="Days staff could not clock in — mission, training, meetings outside the office, a failed clock-in. Approving records the days in the attendance log."
        breadcrumbs={[{ title: "Attendance", link: "/dashboard/attendance/attendance-logs" }, { title: "Corrections", link: "/dashboard/hr/attendance-corrections" }]}
      />
      <RecordTable<any>
        collection="attendance_corrections"
        expand="employee,employee.department,reviewed_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "pending" ? {} : { view: v })}
        searchFields={["number", "explanation", "employee.name"]}
        filters={[
          { field: "reason", label: "Reason", options: Object.entries(CORRECTION_REASONS).map(([value, label]) => ({ value, label })) },
          { field: "employee.department", label: "Department", collection: "departments" },
        ]}
        dateField="created"
        dateLabel="Asked on"
        defaultSort="-created"
        refreshKey={refresh}
        exportName="attendance-corrections"
        exportTitle="Attendance correction requests"
        exportPermission={["update_attendance", "export_reports"]}
        onRowClick={(r) => setOpen(r)}
        empty={{ icon: CalendarCheck, title: "No correction requests", text: "Staff ask from My attendance when a day is missing." }}
        columns={[
          { key: "number", header: "Request", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          {
            key: "employee", header: "Staff member", csv: (r) => r.expand?.employee?.name || "",
            cell: (r) => (
              <span className="block min-w-[160px]">
                <span className="block font-medium text-slate-900">{r.expand?.employee?.name}</span>
                <span className="block text-[12px] text-slate-500">{r.expand?.employee?.expand?.department?.name || ""}</span>
              </span>
            ),
          },
          { key: "days", header: "Days", csv: daysText, cell: (r) => <span className="block max-w-[260px] text-[12.5px] text-slate-700">{daysText(r)}</span> },
          { key: "reason", header: "Reason", sortField: "reason", csv: (r) => CORRECTION_REASONS[r.reason] || r.reason, cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-700">{CORRECTION_REASONS[r.reason] || r.reason}</span> },
          { key: "evidence", header: "Evidence", csv: (r) => (r.attachments || []).length, cell: (r) => ((r.attachments || []).length ? <span className="inline-flex items-center gap-1 text-[12.5px] text-slate-600"><Paperclip size={13} /> {(r.attachments || []).length}</span> : <span className="text-slate-400">—</span>) },
          { key: "asked", header: "Asked on", sortField: "created", format: "date", csv: (r) => showDay(r.created), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.created)}</span> },
          { key: "reviewer", header: "Reviewed by", exportOnly: true, csv: (r) => r.expand?.reviewed_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => STATUS[r.status as keyof typeof STATUS]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={STATUS} /> },
        ]}
      />
      {open && <ReviewDialog request={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setRefresh((n) => n + 1); }} />}
    </div>
  );
}

function ReviewDialog({ request: r, onClose, onDone }: { request: any; onClose: () => void; onDone: () => void }) {
  const { user }: any = useAuth();
  const qc = useQueryClient();
  const [decision, setDecision] = React.useState<"approve" | "reject">("approve");
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const pending = r.status === "pending";
  const own = r.employee === user?.id;

  async function submit() {
    if (!pending || own) return onClose();
    if (decision === "reject" && comment.trim().length < 5) return setError("Say why the request is rejected.");
    setBusy(true);
    try {
      const res: any = await pocketbase.send(`/api/ims/attendance-corrections/${r.id}/review`, { method: "POST", body: { decision, comment: comment.trim() } });
      toast.success(decision === "approve" ? `${r.number} approved — ${res?.added_days ?? ""} day(s) added to the attendance log` : `${r.number} rejected`);
      qc.invalidateQueries(["nav-counts"]);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      icon={CalendarCheck}
      title={`${r.number} · ${r.expand?.employee?.name || ""}`}
      description={`${(r.dates || []).length} day(s) · asked on ${showDay(r.created)}`}
      submitLabel={!pending || own ? "Close" : decision === "approve" ? "Approve and record the days" : "Reject the request"}
      busy={busy}
      onSubmit={submit}
    >
      <FormBlock icon={CalendarCheck} title="Request">
        <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
          <div><dt className="text-[12px] font-semibold text-slate-500">Days</dt><dd className="mt-0.5 font-medium text-slate-900">{daysText(r)}</dd></div>
          <div><dt className="text-[12px] font-semibold text-slate-500">Reason</dt><dd className="mt-0.5 font-medium text-slate-900">{CORRECTION_REASONS[r.reason] || r.reason}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[12px] font-semibold text-slate-500">Explanation</dt><dd className="mt-0.5 whitespace-pre-line text-slate-800">{r.explanation}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-[12px] font-semibold text-slate-500">Evidence</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {(r.attachments || []).length ? (r.attachments as string[]).map((f) => (
                <a key={f} href={getFileUrl({ file: f, collection: "attendance_corrections", record: r.id })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50">
                  <Paperclip size={13} /> {displayName(f)} <ExternalLink size={12} className="text-slate-400" />
                </a>
              )) : <span className="text-[12.5px] text-slate-500">No document attached (mission order, invitation, attendance list…).</span>}
            </dd>
          </div>
        </dl>
      </FormBlock>
      {pending && own && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">This is your own request: another HR officer reviews it.</p>}
      {pending && !own && (
        <FormBlock icon={Check} title="Decision">
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {([["approve", "Approve", "The days are recorded as worked (normal hours).", Check], ["reject", "Reject", "The staff member is told why.", X]] as const).map(([k, l, d, Icon]) => (
              <button key={k} type="button" role="radio" aria-checked={decision === k} onClick={() => { setDecision(k); setError(""); }}
                className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left", decision === k ? (k === "approve" ? "border-emerald-500 bg-emerald-50" : "border-red-400 bg-red-50") : "border-slate-200 hover:bg-slate-50")}>
                <Icon size={16} className={cn("mt-0.5", k === "approve" ? "text-emerald-700" : "text-red-600")} />
                <span><span className="block text-[13.5px] font-semibold text-slate-900">{l}</span><span className="block text-[12.5px] text-slate-500">{d}</span></span>
              </button>
            ))}
          </div>
          <Field label={decision === "reject" ? "Reason for rejecting" : "Comment"} required={decision === "reject"} error={error} htmlFor="corr-comment">
            <textarea id="corr-comment" className={textareaCls} value={comment} maxLength={1000} onChange={(e) => { setComment(e.target.value); setError(""); }} placeholder={decision === "reject" ? "e.g. No mission order for 14 October; please attach it and ask again." : "Optional"} />
          </Field>
        </FormBlock>
      )}
      {!pending && (
        <FormBlock icon={Check} title="Decision">
          <p className="text-[13.5px] text-slate-800"><StatusBadge status={r.status} map={STATUS} /> by {r.expand?.reviewed_by?.name || "HR"} on {showDay(r.reviewed_at)}{r.status === "approved" ? ` · ${r.added_days || 0} day(s) added` : ""}</p>
          {r.review_comment && <p className="mt-2 whitespace-pre-line text-[13.5px] text-slate-700">{r.review_comment}</p>}
        </FormBlock>
      )}
    </FormDialog>
  );
}
