import { useState, useEffect } from "react";
import { ClipboardList } from "lucide-react";
import { Card, Column, DataTable, DateRangeFilter, EmptyState, FilterBar, FilterSelect, KpiBand, Num, Page, PageHeader, StatusPill, fmtDate, fmtNumber } from "@/components/ims";

export function getDatePresets() {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(today);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  return [
    {
      label: "Current Week",
      start: formatDate(startOfWeek),
      end: formatDate(endOfWeek),
    },
    {
      label: "Current Month",
      start: formatDate(startOfMonth),
      end: formatDate(endOfMonth),
    },
    {
      label: "Last 7 Days",
      start: formatDate(new Date(today.setDate(today.getDate() - 7))),
      end: formatDate(new Date()),
    },
    {
      label: "Last 30 Days",
      start: formatDate(new Date(today.setDate(today.getDate() - 30))),
      end: formatDate(new Date()),
    },
  ];
}
interface Activity {
  date: string;
  task: string;
  hours: number;
  status: string;
  employee: string;
}

/** Timesheet tasks are "pending" until marked complete. */
const ACTIVITY_WORDS = { pending: "In progress", completed: "Completed" } as const;
/** "Current Week" → "This week" on screen. */
const presetLabel = (label: string) => ({ "Current Week": "This week", "Current Month": "This month", "Last 7 Days": "Last 7 days", "Last 30 Days": "Last 30 days" }[label] || label);

export default function TimesheetReport() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [preset, setPreset] = useState("Current Week");
  const datePresets = getDatePresets();

  useEffect(() => {
    const storedActivities = JSON.parse(
      localStorage.getItem("activities") || "[]"
    );
    setActivities(storedActivities);

    // Set default filter to current week
    const currentWeek = datePresets[0];
    setStartDate(currentWeek.start);
    setEndDate(currentWeek.end);
  }, []);

  useEffect(() => {
    let filtered = activities;

    if (employeeFilter) {
      filtered = filtered.filter((activity) =>
        activity.employee.toLowerCase().includes(employeeFilter.toLowerCase())
      );
    }

    if (startDate) {
      filtered = filtered.filter((activity) => activity.date >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((activity) => activity.date <= endDate);
    }

    setFilteredActivities(filtered);
  }, [employeeFilter, startDate, endDate, activities]);

  const totalHours = filteredActivities.reduce(
    (sum, activity) => sum + activity.hours,
    0
  );
  const completedTasks = filteredActivities.filter(
    (activity) => activity.status === "completed"
  ).length;
  const pendingTasks = filteredActivities.filter(
    (activity) => activity.status === "pending"
  ).length;

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const preset = datePresets.find((p) => p.label === value);
    if (preset) {
      setStartDate(preset.start);
      setEndDate(preset.end);
    }
  };

  const people = new Set(filteredActivities.map((a) => a.employee.trim().toLowerCase())).size;
  const columns: Column<Activity>[] = [
    { key: "employee", header: "Employee", className: "font-semibold", cell: (a) => a.employee },
    { key: "date", header: "Date", nowrap: true, cell: (a) => fmtDate(a.date) },
    { key: "task", header: "Task", clamp: true, cell: (a) => a.task },
    { key: "hours", header: "Hours", numeric: true, width: "110px", cell: (a) => <Num value={a.hours} decimals />, total: <Num value={totalHours} decimals /> },
    { key: "status", header: "Status", width: "150px", cell: (a) => <StatusPill status={ACTIVITY_WORDS[a.status as keyof typeof ACTIVITY_WORDS] || a.status} /> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Timesheet report" }]}
        title="Timesheet report"
        subtitle="Hours logged by staff and the state of their tasks over a period."
      />
      <KpiBand
        items={[
          { label: "Hours logged", value: fmtNumber(totalHours, true) },
          { label: "Activities", value: fmtNumber(filteredActivities.length), sub: `${people} ${people === 1 ? "person" : "people"}` },
          { label: "Completed tasks", value: fmtNumber(completedTasks), tone: "success" },
          { label: "Tasks in progress", value: fmtNumber(pendingTasks), tone: pendingTasks ? "warning" : "default" },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <FilterBar search={{ value: employeeFilter, onChange: setEmployeeFilter, placeholder: "Search employee" }}>
          <FilterSelect
            label="Period"
            all={false}
            value={preset}
            onChange={handlePresetChange}
            options={[...datePresets.map((p) => ({ value: p.label, label: presetLabel(p.label) })), { value: "custom", label: "Custom dates" }]}
          />
          <DateRangeFilter
            label="Dates"
            from={startDate}
            to={endDate}
            onChange={(from, to) => {
              setPreset("custom");
              setStartDate(from);
              setEndDate(to);
            }}
          />
        </FilterBar>
        <DataTable
          caption="Detailed activity report"
          columns={columns}
          rows={filteredActivities}
          rowKey={(a, i) => `${a.employee}-${a.date}-${a.task}-${i}`}
          minWidth={720}
          empty={<EmptyState icon={ClipboardList} text="No activity logged for this period." />}
        />
      </Card>
    </Page>
  );
}
