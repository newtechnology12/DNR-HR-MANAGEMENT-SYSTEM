/**
 * HR → Attendance corrections. Staff ask for days they could not clock in (mission, training, a meeting
 * outside the office, the clock-in failing); HR checks the evidence and approves, which records the days
 * in the attendance log as "correction", or rejects with a reason. Nobody approves their own request.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "react-query";
import { toast } from "sonner";
import { CalendarCheck, ExternalLink, Paperclip } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { showDay } from "@/lib/ims";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { displayName } from "@/components/enterprise/Attachments";
import { ChoiceCards } from "@/components/portal/kit";
import { CORRECTION_REASONS } from "@/components/workspace/CorrectionDialog";
import { Button, Details, DocNo, Field, Modal, ModalSection, Page, PageHeader, Person, Textarea, fmtDate } from "@/components/ims";
import getFileUrl from "@/utils/getFileUrl";

const STATUS = {
  pending: { label: "Pending approval", tone: "warning" as const, note: "With HR" },
  approved: { label: "Approved", tone: "success" as const },
  rejected: { label: "Rejected", tone: "danger" as const },
};

const daysText = (r: any) => ((r.dates || []) as string[]).map((d) => showDay(d)).join(", ");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function AttendanceCorrections() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = React.useState<any>(null);
  const [refresh, setRefresh] = React.useState(0);
  const view = params.get("view") || "pending";
  const views: RecordView[] = [
    { key: "pending", label: "Pending approval", filter: 'status = "pending"' },
    { key: "approved", label: "Approved", filter: 'status = "approved"' },
    { key: "rejected", label: "Rejected", filter: 'status = "rejected"' },
    { key: "all", label: "All requests" },
  ];
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Attendance corrections" }]}
        title="Attendance corrections"
        subtitle="Days staff were on duty without a clock-in. Approving records them in the attendance log."
      />
      <RecordTable<any>
        collection="attendance_corrections"
        expand="employee,employee.department,reviewed_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "pending" ? {} : { view: v })}
        searchFields={["number", "explanation", "employee.name"]}
        searchPlaceholder="Search number or staff member"
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
        rowActions={(r) => [{ label: r.status === "pending" ? "Review" : "Open", icon: CalendarCheck, onSelect: (row) => setOpen(row) }]}
        empty={{ icon: CalendarCheck, title: "No correction requests", text: view === "pending" ? "No correction request is waiting for HR. Staff ask from My attendance when a day is missing." : "No correction requests to show. Staff ask from My attendance when a day is missing." }}
        columns={[
          { key: "number", header: "Request", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
          {
            key: "employee", header: "Staff member", className: "max-w-[220px]", csv: (r) => r.expand?.employee?.name || "",
            cell: (r) => <Person name={r.expand?.employee?.name} detail={r.expand?.employee?.expand?.department?.name} />,
          },
          { key: "days", header: "Days", clamp: true, csv: daysText, cell: (r) => daysText(r), sub: (r) => plural((r.dates || []).length, "day") },
          { key: "reason", header: "Reason", sortField: "reason", csv: (r) => CORRECTION_REASONS[r.reason] || r.reason, cell: (r) => CORRECTION_REASONS[r.reason] || r.reason },
          {
            key: "evidence", header: "Evidence", csv: (r) => (r.attachments || []).length,
            cell: (r) => ((r.attachments || []).length ? <span className="inline-flex items-center gap-1 text-ims-body"><Paperclip size={14} aria-hidden /> {plural((r.attachments || []).length, "file")}</span> : <span className="text-ims-faint">None</span>),
          },
          { key: "asked", header: "Asked on", sortField: "created", nowrap: true, format: "date", csv: (r) => showDay(r.created), cell: (r) => fmtDate(r.created) },
          { key: "reviewer", header: "Reviewed by", exportOnly: true, csv: (r) => r.expand?.reviewed_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => STATUS[r.status as keyof typeof STATUS]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={STATUS} /> },
        ]}
      />
      {open && <ReviewDialog request={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setRefresh((n) => n + 1); }} />}
    </Page>
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
  const canDecide = pending && !own;

  async function submit() {
    if (!pending || own) return onClose();
    if (decision === "reject" && comment.trim().length < 5) return setError("Say why the request is rejected (at least 5 characters).");
    setBusy(true);
    try {
      const res: any = await pocketbase.send(`/api/ims/attendance-corrections/${r.id}/review`, { method: "POST", body: { decision, comment: comment.trim() } });
      toast.success(decision === "approve" ? `${r.number} approved · ${res?.added_days ?? ""} day(s) added to the attendance log` : `${r.number} rejected`);
      qc.invalidateQueries(["nav-counts"]);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const files = (r.attachments || []) as string[];
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      size="md"
      title={`${r.number} · ${r.expand?.employee?.name || ""}`}
      description={`${plural((r.dates || []).length, "day")} · asked on ${fmtDate(r.created)}`}
      footer={
        canDecide ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant={decision === "approve" ? "primary" : "danger"} onClick={submit} loading={busy}>
              {decision === "approve" ? "Approve and record the days" : "Reject the request"}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Close</Button>
        )
      }
    >
      <ModalSection title="Request">
        <Details
          items={[
            { label: "Days", value: daysText(r) },
            { label: "Reason", value: CORRECTION_REASONS[r.reason] || r.reason },
            { label: "Explanation", value: <span className="whitespace-pre-line">{r.explanation}</span>, wide: true },
            {
              label: "Evidence",
              wide: true,
              value: files.length ? (
                <span className="mt-1 flex flex-wrap gap-2">
                  {files.map((f) => (
                    <a key={f} href={getFileUrl({ file: f, collection: "attendance_corrections", record: r.id })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-ims-field px-2.5 py-1.5 text-t-small font-semibold text-ims-body hover:bg-ims-subtle">
                      <Paperclip size={13} aria-hidden /> {displayName(f)} <ExternalLink size={12} className="text-ims-faint" aria-hidden />
                    </a>
                  ))}
                </span>
              ) : (
                <span className="text-ims-muted">No document attached (mission order, invitation, attendance list…).</span>
              ),
            },
          ]}
        />
      </ModalSection>
      {pending && own && <p className="rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2 text-t-body text-ims-warning">This is your own request: another HR officer reviews it.</p>}
      {canDecide && (
        <ModalSection title="Decision">
          <ChoiceCards
            value={decision}
            onChange={(k) => { setDecision(k); setError(""); }}
            options={[
              { value: "approve", label: "Approve", description: "The days are recorded as worked (normal hours)." },
              { value: "reject", label: "Reject", description: "The staff member is told why." },
            ]}
          />
          <Field label={decision === "reject" ? "Reason for rejecting" : "Comment"} required={decision === "reject"} error={error} htmlFor="corr-comment" hint={decision === "reject" ? "The staff member sees this reason." : "Optional. The staff member sees it with the decision."}>
            <Textarea id="corr-comment" value={comment} maxLength={1000} onChange={(e) => { setComment(e.target.value); setError(""); }} placeholder={decision === "reject" ? "e.g. No mission order for 14 October; attach it and ask again." : ""} invalid={Boolean(error)} />
          </Field>
        </ModalSection>
      )}
      {!pending && (
        <ModalSection title="Decision">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-t-body text-ims-body">
            <StatusBadge status={r.status} map={STATUS} />
            <span>
              by {r.expand?.reviewed_by?.name || "HR"} on {fmtDate(r.reviewed_at)}
              {r.status === "approved" ? ` · ${plural(Number(r.added_days) || 0, "day")} added` : ""}
            </span>
          </div>
          {r.review_comment && <p className="whitespace-pre-line text-t-body text-ims-body">{r.review_comment}</p>}
        </ModalSection>
      )}
    </Modal>
  );
}
