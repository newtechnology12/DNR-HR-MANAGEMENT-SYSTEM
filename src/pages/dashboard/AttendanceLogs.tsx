/**
 * Attendance → Attendance logs. Every clock-in and clock-out of the staff, today by default, with
 * today's figures on top. HR marks attendance by hand or uploads a file from the clock-in device.
 */
import { useState } from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { differenceInSeconds, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { Clock, Pencil, Plus, Trash2, Upload } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import formatSeconds from "@/utils/formatSeconds";
import { AttendanceFormModal } from "@/components/modals/AttendanceFormModal";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import { BulkAttendanceModal } from "@/components/modals/BulkAttendanceModal";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { ConfirmDialog, KpiBand, Page, PageHeader, Person, fmtDate, sentence, toDate } from "@/components/ims";
import { cn } from "@/utils";

/** PocketBase stores dates as "2026-10-21 22:00:00.000Z"; filters compare them as text. */
const pbTime = (d: Date) => d.toISOString().replace("T", " ");
const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const dayEnd = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const time = (v?: string) => {
  const d = toDate(v);
  return d ? format(d, "HH:mm") : null;
};

/** Arrival: "On time" or "Late" with a dot (an attribute of the day, not a workflow status). */
function Arrival({ value }: { value?: string }) {
  if (!value) return <span className="text-ims-faint">—</span>;
  const late = value === "late";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", late ? "bg-ims-priority-high" : "bg-ims-success")} aria-hidden />
      <span className={late ? "font-semibold text-ims-text" : "text-ims-body"}>{late ? "Late" : value === "early" ? "On time" : sentence(value)}</span>
    </span>
  );
}

/** Hours between clock-in and clock-out; while the day is open, the time so far. */
function hoursOf(r: any) {
  const inAt = toDate(r.clockin_time);
  if (!inAt) return { main: null, sub: null };
  const outAt = toDate(r.clockout_time);
  if (!outAt && (!isSameDay(inAt, new Date()) || inAt > new Date())) return { main: null, sub: "No clock-out" };
  const text = formatSeconds(differenceInSeconds(outAt || new Date(), inAt)) || null;
  return { main: text, sub: outAt ? null : "So far" };
}

export default function AttendaceLogs() {
  const [view, setView] = useState("today");
  const [refresh, setRefresh] = useState(0);
  const [toDelete, setToDelete] = useState<any>(null);

  const statsQuery = useQuery({
    queryKey: ["attendance-stats", refresh],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const todayFilter = `date >= "${pbTime(startOfDay)}" && date <= "${pbTime(endOfDay)}"`;

      const [totalEmployees, presentToday, lateToday] = await Promise.all([
        pocketbase
          .collection("users")
          .getList(1, 1, { filter: `status="Active"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("attendance")
          .getList(1, 1, { filter: todayFilter })
          .then((e) => e.totalItems),
        pocketbase
          .collection("attendance")
          .getList(1, 1, { filter: `${todayFilter} && behaviour="late"` })
          .then((e) => e.totalItems),
      ]);

      return {
        totalEmployees,
        presentToday,
        lateToday,
        absentToday: Math.max(totalEmployees - presentToday, 0),
      };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const newRecordModal = useModalState();
  const bulkImportModal = useModalState();
  const editRow = useEditRow();

  const handleDelete = (e: any) =>
    pocketbase
      .collection("attendance")
      .delete(e.id)
      .then(() => {
        setRefresh((n) => n + 1);
        toast.success(`Attendance of ${e.expand?.employee?.name || "the employee"} on ${fmtDate(e.date)} deleted`);
      })
      .catch((err) => {
        toast.error(err.message);
        throw err;
      });

  const now = new Date();
  const range = (from: Date) => `date >= "${pbTime(dayStart(from))}" && date <= "${pbTime(dayEnd(now))}"`;
  const views: RecordView[] = [
    { key: "today", label: "Today", filter: range(now) },
    { key: "week", label: "This week", filter: range(startOfWeek(now, { weekStartsOn: 1 })) },
    { key: "month", label: "This month", filter: range(startOfMonth(now)) },
    { key: "all", label: "All records" },
  ];

  const filters: RecordFilter[] = [
    { field: "behaviour", label: "Arrival", options: [{ value: "late", label: "Late" }, { value: "early", label: "On time" }] },
    { field: "type", label: "Recorded by", options: [{ value: "biometric", label: "Biometric" }, { value: "manual", label: "Manual" }, { value: "correction", label: "Correction" }] },
    { field: "employee.department", label: "Department", collection: "departments" },
    { field: "employee.branch", label: "Branch", collection: "branches" },
  ];

  const columns: RecordColumn<any>[] = [
    {
      key: "employee",
      header: "Employee",
      className: "max-w-[240px]",
      cell: (r) => <Person name={r.expand?.employee?.name} detail={r.expand?.employee?.expand?.department?.name} />,
      csv: (r) => r.expand?.employee?.name || "",
    },
    { key: "department", header: "Department", exportOnly: true, cell: () => null, csv: (r) => r.expand?.employee?.expand?.department?.name || "" },
    { key: "branch", header: "Branch", cell: (r) => r.expand?.employee?.expand?.branch?.name || <span className="text-ims-faint">—</span>, csv: (r) => r.expand?.employee?.expand?.branch?.name || "" },
    { key: "date", header: "Date", sortField: "date", nowrap: true, format: "date", cell: (r) => fmtDate(r.date), csv: (r) => fmtDate(r.date) },
    { key: "clockin_time", header: "Clock in", sortField: "clockin_time", nowrap: true, cell: (r) => time(r.clockin_time) || <span className="text-ims-faint">—</span>, sub: (r) => (r.type ? sentence(r.type) : null), csv: (r) => time(r.clockin_time) || "" },
    { key: "clockout_time", header: "Clock out", sortField: "clockout_time", nowrap: true, cell: (r) => time(r.clockout_time) || <span className="text-ims-faint">—</span>, csv: (r) => time(r.clockout_time) || "" },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      cell: (r) => hoursOf(r).main || <span className="text-ims-faint">—</span>,
      sub: (r) => hoursOf(r).sub,
      csv: (r) => hoursOf(r).main || "",
    },
    { key: "behaviour", header: "Arrival", sortField: "behaviour", cell: (r) => <Arrival value={r.behaviour} />, csv: (r) => (r.behaviour === "late" ? "Late" : r.behaviour === "early" ? "On time" : r.behaviour || "") },
    { key: "type", header: "Recorded by", exportOnly: true, cell: () => null, csv: (r) => sentence(r.type) },
    { key: "notes", header: "Notes", exportOnly: true, cell: () => null, csv: (r) => r.notes || "" },
  ];

  const s = statsQuery.data;
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Attendance logs" }]}
        title="Attendance logs"
        subtitle="Every clock-in and clock-out of the staff, with today's attendance."
        primary={{ label: "Mark attendance", icon: Plus, onClick: () => newRecordModal.open() }}
        secondary={[{ label: "Bulk upload", icon: Upload, onClick: () => bulkImportModal.open() }]}
      />
      <KpiBand
        loading={statsLoading}
        items={[
          { label: "Present today", value: s?.presentToday, sub: "Clocked in today", onClick: () => setView("today") },
          { label: "Absent today", value: s?.absentToday, sub: "Active staff not clocked in", tone: s?.absentToday ? "danger" : undefined },
          { label: "Late today", value: s?.lateToday, sub: "Clocked in after the start time", tone: s?.lateToday ? "warning" : undefined },
          { label: "Active employees", value: s?.totalEmployees, sub: "Expected at work" },
        ]}
      />
      <RecordTable<any>
        collection="attendance"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={setView}
        searchFields={["employee.name", "notes"]}
        searchPlaceholder="Search employee or notes"
        filters={filters}
        dateField="date"
        dateLabel="Date"
        expand="employee.branch,employee.department"
        defaultSort="-created"
        refreshKey={refresh}
        exportName="attendance"
        exportTitle="Attendance"
        exportPermission={["view_attendance_logs", "access_employee_portal"]}
        onRowClick={(r) => editRow.edit(r)}
        rowActions={() => [
          { label: "Edit attendance", icon: Pencil, onSelect: (row) => editRow.edit(row) },
          { label: "Delete attendance", icon: Trash2, danger: true, onSelect: (row) => setToDelete(row) },
        ]}
        empty={{
          icon: Clock,
          title: "No attendance",
          text: view === "today" ? "Nobody has clocked in today yet." : "No attendance recorded for this period.",
        }}
      />
      <AttendanceFormModal
        onComplete={() => {
          setRefresh((n) => n + 1);
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
      <BulkAttendanceModal
        onComplete={() => {
          setRefresh((n) => n + 1);
          bulkImportModal.close();
        }}
        record={editRow.row}
        setOpen={bulkImportModal.setisOpen}
        open={bulkImportModal.isOpen}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        danger
        title="Delete this attendance record?"
        description={toDelete ? `${toDelete.expand?.employee?.name || "Employee"} · ${fmtDate(toDelete.date)}. This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={() => handleDelete(toDelete)}
      />
    </Page>
  );
}
