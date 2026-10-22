/**
 * HR → Leave requests. Every request with its line manager, from "Pending approval" to the decision.
 * The decision (approve / reject with a reason) is guarded on the server: only a manager of the employee,
 * never on their own leave.
 */
import { useState } from "react";
import { useQuery } from "react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarRange, CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { LEAVE_TYPES, LeaveFormModal, leaveTypeLabel } from "@/components/modals/LeaveFormModal";
import { Button, ConfirmDialog, Field, KpiBand, Modal, Num, Page, PageHeader, Person, Textarea, fmtDate, toDate } from "@/components/ims";
import type { Tone } from "@/lib/procurement";

/** Stored leave statuses → the status glossary. */
const LEAVE_STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  pending: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/** "14 Jul – 17 Jul 2026" (one year), "28 Dec 2026 – 4 Jan 2027" otherwise. */
function leavePeriod(start?: string, end?: string) {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return fmtDate(start || end);
  if (a.getFullYear() === b.getFullYear()) return `${fmtDate(a).replace(/ \d{4}$/, "")} – ${fmtDate(b)}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

const daysOf = (r: any) => Number(r?.Leaveduration ?? r?.days) || 0;
const nameOf = (r: any) => r?.expand?.employee?.name || "this employee";

export default function Leaves() {
  const [leaveToApprove, setleaveToApprove] = useState<any>(null);
  const [leaveToReject, setleaveToReject] = useState<any>(null);
  const [toDelete, setToDelete] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [refresh, setRefresh] = useState(0);
  const refetch = () => setRefresh((n) => n + 1);

  const statsQuery = useQuery({
    queryKey: ["leaves-stats", refresh],
    queryFn: async () => {
      const [total, pending, approved, rejected] = await Promise.all([
        pocketbase.collection("leaves").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("leaves")
          .getList(1, 1, { filter: `status="pending"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("leaves")
          .getList(1, 1, { filter: `status="approved"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("leaves")
          .getList(1, 1, { filter: `status="rejected"` })
          .then((e) => e.totalItems),
      ]);
      return { total, pending, approved, rejected };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const newRecordModal = useModalState();
  const editRow = useEditRow();

  const handleDelete = (e: any) =>
    pocketbase
      .collection("leaves")
      .delete(e.id)
      .then(() => {
        refetch();
        toast.success(`Leave request of ${nameOf(e)} deleted`);
      })
      .catch((err) => {
        toast.error(err.message);
        throw err;
      });

  const views: RecordView[] = [
    { key: "pending", label: "Pending approval", filter: `status="pending"` },
    { key: "approved", label: "Approved", filter: `status="approved"` },
    { key: "rejected", label: "Rejected", filter: `status="rejected"` },
    { key: "all", label: "All requests" },
  ];

  const filters: RecordFilter[] = [
    { field: "type", label: "Type", options: LEAVE_TYPES.map((t) => ({ value: t.value, label: t.value })) },
    { field: "employee.department", label: "Department", collection: "departments" },
    { field: "employee", label: "Employee", collection: "users" },
  ];

  /** Who must act now: the employee's line manager while the request is pending. */
  const withCell = (r: any) => {
    if (r.status !== "pending") return <span className="text-ims-faint">—</span>;
    const dept = r.expand?.employee?.expand?.department;
    const head = dept?.expand?.head;
    if (head && head.id !== r.employee) return <Person name={head.name} detail="Line manager" />;
    return <Person name="HR" detail={dept?.name ? `${dept.name} has no other head` : "No line manager set"} />;
  };

  const columns: RecordColumn<any>[] = [
    {
      key: "employee",
      header: "Employee",
      className: "max-w-[200px]",
      cell: (r) => (
        <Link to={`/dashboard/hr/employees/${r.employee}`} className="block min-w-0 decoration-ims-link hover:underline">
          <Person name={r.expand?.employee?.name} detail={r.expand?.employee?.expand?.department?.name} />
        </Link>
      ),
      csv: (r) => r.expand?.employee?.name || "",
    },
    { key: "department", header: "Department", exportOnly: true, cell: () => null, csv: (r) => r.expand?.employee?.expand?.department?.name || "" },
    { key: "type", header: "Type", sortField: "type", clamp: true, width: "190px", cell: (r) => leaveTypeLabel(r), sub: (r) => r.reason, csv: (r) => leaveTypeLabel(r) },
    { key: "start", header: "Period", sortField: "start", nowrap: true, cell: (r) => leavePeriod(r.start, r.end), csv: (r) => fmtDate(r.start) },
    { key: "end", header: "Last day", exportOnly: true, cell: () => null, csv: (r) => fmtDate(r.end) },
    { key: "days", header: "Days", sortField: "Leaveduration", align: "right", width: "84px", sum: "Leaveduration", format: "number", cell: (r) => <Num value={daysOf(r)} decimals />, csv: (r) => daysOf(r) },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={LEAVE_STATUS} />, csv: (r) => LEAVE_STATUS[r.status]?.label || r.status },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
    {
      key: "decided",
      header: "Decided by",
      exportOnly: true,
      cell: () => null,
      csv: (r) => r.expand?.approved_by?.name || r.expand?.rejected_by?.name || "",
    },
    { key: "reason", header: "Reason", exportOnly: true, cell: () => null, csv: (r) => r.reason || "" },
    {
      key: "created",
      header: "Requested",
      sortField: "created",
      nowrap: true,
      cell: (r) => fmtDate(r.created),
      sub: (r) => (r.created_by && r.created_by !== r.employee && r.expand?.created_by?.name ? `by ${r.expand.created_by.name}` : null),
      csv: (r) => fmtDate(r.created),
    },
  ];

  const kpis = [
    { label: "All requests", value: statsQuery.data?.total, onClick: () => setActiveTab("all") },
    { label: "Pending approval", value: statsQuery.data?.pending, tone: statsQuery.data?.pending ? ("warning" as const) : undefined, onClick: () => setActiveTab("pending") },
    { label: "Approved", value: statsQuery.data?.approved, onClick: () => setActiveTab("approved") },
    { label: "Rejected", value: statsQuery.data?.rejected, onClick: () => setActiveTab("rejected") },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Leave requests" }]}
        title="Leave requests"
        subtitle="Staff leave requests and the line manager's decision on each."
        primary={{ label: "Request leave", icon: Plus, onClick: () => newRecordModal.open() }}
      />
      <KpiBand items={kpis} loading={statsLoading} />
      <RecordTable<any>
        collection="leaves"
        columns={columns}
        views={views}
        activeView={activeTab}
        onViewChange={setActiveTab}
        searchFields={["employee.name", "type", "other_type", "reason"]}
        searchPlaceholder="Search employee, type or reason"
        filters={filters}
        dateField="start"
        dateLabel="Starts"
        expand="employee,employee.department,employee.department.head,created_by,approved_by,rejected_by"
        defaultSort="-created"
        refreshKey={refresh}
        exportName="leave-requests"
        exportTitle="Leave requests"
        exportPermission={["view_leaves", "access_employee_portal"]}
        onRowClick={(r) => editRow.edit(r)}
        rowActions={(r) => [
          { label: "Edit leave", icon: Pencil, onSelect: (row) => editRow.edit(row) },
          ...(r.status === "approved" || r.status === "rejected"
            ? []
            : [
                { label: "Approve leave", icon: CheckCircle2, onSelect: (row: any) => setleaveToApprove(row) },
                { label: "Reject leave", icon: XCircle, onSelect: (row: any) => setleaveToReject(row) },
              ]),
          { label: "Delete leave", icon: Trash2, danger: true, onSelect: (row) => setToDelete(row) },
        ]}
        empty={{
          icon: CalendarRange,
          title: "No leave requests",
          text: activeTab === "pending" ? "No leave request is waiting for a decision." : "No leave requests to show.",
          action: <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>Request leave</Button>,
        }}
      />

      <LeaveFormModal
        onComplete={() => {
          refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        danger
        title="Delete this leave request?"
        description={toDelete ? `${nameOf(toDelete)} · ${leaveTypeLabel(toDelete)} · ${leavePeriod(toDelete.start, toDelete.end)}. This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={() => handleDelete(toDelete)}
      />
      <ApproveOrRejectModal
        leave={leaveToApprove || leaveToReject}
        type={leaveToApprove ? "approve" : leaveToReject ? "reject" : null}
        open={!!leaveToApprove || !!leaveToReject}
        setOpen={(e) => {
          if (!e) {
            setleaveToApprove(null);
            setleaveToReject(null);
          }
        }}
        onCompleted={() => {
          refetch();
        }}
      />
    </Page>
  );
}

function ApproveOrRejectModal({ type, open, setOpen, leave, onCompleted }: { type: "approve" | "reject" | null; open: boolean; setOpen: (o: boolean) => void; leave: any; onCompleted: () => void }) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const approve = type === "approve";
  const missing = reason.length < 1;

  const close = () => {
    setOpen(false);
    setReason("");
    setTried(false);
  };

  const onSubmit = () => {
    setTried(true);
    if (missing) return;
    setBusy(true);
    return pocketbase
      .collection("leaves")
      .update(leave.id, {
        status: approve ? "approved" : "rejected",
        [approve ? "approved_by" : "rejected_by"]: user?.id,
        [approve ? "approved_at" : "rejected_at"]: new Date(),
        [approve ? "approved_reason" : "rejected_reason"]: reason,
      })
      .then(() => {
        close();
        toast.success(`Leave of ${nameOf(leave)} ${approve ? "approved" : "rejected"}`);
        onCompleted();
      })
      .catch((e) => {
        toast.error(e.message);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      size="sm"
      title={approve ? `Approve the leave of ${nameOf(leave)}?` : `Reject the leave of ${nameOf(leave)}?`}
      description={leave ? `${leaveTypeLabel(leave)} · ${daysOf(leave)} day${daysOf(leave) === 1 ? "" : "s"} · ${leavePeriod(leave.start, leave.end)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant={approve ? "primary" : "danger"} onClick={onSubmit} loading={busy}>{approve ? "Approve" : "Reject"}</Button>
        </>
      }
    >
      <Field label="Reason" required htmlFor="leave-decision-reason" error={tried && missing ? `Enter the reason for ${approve ? "approving" : "rejecting"} the leave.` : null} hint={approve ? "Shown to the employee with the decision." : "Say what the employee can change, e.g. other dates."}>
        <Textarea id="leave-decision-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter the reason" invalid={tried && missing} />
      </Field>
    </Modal>
  );
}
