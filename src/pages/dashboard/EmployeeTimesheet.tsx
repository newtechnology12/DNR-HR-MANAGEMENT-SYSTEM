import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Plus } from "lucide-react";
import { Button, Card, CardHeader, Column, DataTable, DatePicker, DateRangeFilter, EmptyState, Field, FilterSelect, Input, Num, Page, PageHeader, StatusPill, fmtDate } from "@/components/ims";

/** Timesheet tasks are "pending" until marked complete. */
const ACTIVITY_WORDS = { pending: "In progress", completed: "Completed" } as const;

export default function EmployeeTimesheet() {
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Employee timesheet" }]}
        title="Employee timesheet"
        subtitle="Log the tasks worked on and the hours spent on each."
      />
      <EmployeeActivityForm />
      <EmployeeActivityList />
    </Page>
  );
}

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

/** "Current Week" → "This week" (sentence case on screen; the stored preset labels stay as they are). */
const presetLabel = (label: string) => ({ "Current Week": "This week", "Current Month": "This month", "Last 7 Days": "Last 7 days", "Last 30 Days": "Last 30 days" }[label] || label);

interface Activity {
  date: string;
  task: string;
  hours: number;
  status: string;
  employee: string;
}

function EmployeeActivityList() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
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

    if (startDate) {
      filtered = filtered.filter((activity) => activity.date >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((activity) => activity.date <= endDate);
    }

    setFilteredActivities(filtered);
  }, [startDate, endDate, activities]);

  const handleStatusChange = (index: number) => {
    const updatedActivities = [...activities];
    if (updatedActivities[index].status === "pending") {
      updatedActivities[index].status = "completed";
      setActivities(updatedActivities);
      localStorage.setItem("activities", JSON.stringify(updatedActivities));
    }
  };

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const preset = datePresets.find((p) => p.label === value);
    if (preset) {
      setStartDate(preset.start);
      setEndDate(preset.end);
    }
  };

  const totalHours = filteredActivities.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
  const columns: Column<Activity>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (a) => fmtDate(a.date) },
    { key: "task", header: "Task", clamp: true, cell: (a) => a.task, sub: (a) => a.employee },
    { key: "hours", header: "Hours", numeric: true, width: "110px", cell: (a) => <Num value={a.hours} decimals />, total: <Num value={totalHours} decimals /> },
    { key: "status", header: "Status", width: "150px", cell: (a) => <StatusPill status={ACTIVITY_WORDS[a.status as keyof typeof ACTIVITY_WORDS] || a.status} /> },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title="Your activities" subtitle="Saved in this browser" className="mb-0" />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 sm:px-5">
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
      </div>
      <DataTable
        caption="Your activities"
        columns={columns}
        rows={filteredActivities}
        rowKey={(a, i) => `${a.date}-${a.task}-${i}`}
        minWidth={640}
        rowActions={(a) => (a.status === "pending" ? [{ label: "Mark complete", icon: CheckCircle2, onSelect: (row) => handleStatusChange(activities.indexOf(row)) }] : [])}
        empty={<EmptyState icon={ClipboardList} text="No activity logged for this period. Log one with the form above." />}
      />
    </Card>
  );
}

function EmployeeActivityForm() {
  const [date, setDate] = useState("");
  const [task, setTask] = useState("");
  const [hours, setHours] = useState("");
  const [status, setStatus] = useState("pending");
  const [employee, setEmployee] = useState("");
  const [dateError, setDateError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setDateError("Choose the date of the activity.");
      return;
    }
    const activity = { date, task, hours: parseFloat(hours), status, employee };

    const activities = JSON.parse(localStorage.getItem("activities") || "[]");
    activities.push(activity);
    localStorage.setItem("activities", JSON.stringify(activities));

    setDate("");
    setTask("");
    setHours("");
    setStatus("pending");
    setEmployee("");

    window.location.reload();
  };

  return (
    <Card>
      <CardHeader title="Log an activity" subtitle="Fields marked * are required." />
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Employee name" required htmlFor="employee">
          <Input type="text" id="employee" value={employee} onChange={(e) => setEmployee(e.target.value)} required />
        </Field>
        <Field label="Date" required htmlFor="date" error={dateError}>
          <DatePicker
            id="date"
            value={date}
            invalid={Boolean(dateError)}
            onChange={(v) => {
              setDate(v);
              setDateError("");
            }}
          />
        </Field>
        <Field label="Task" required htmlFor="task" className="sm:col-span-2 lg:col-span-1">
          <Input type="text" id="task" value={task} onChange={(e) => setTask(e.target.value)} required />
        </Field>
        <Field label="Hours" required htmlFor="hours" hint="Half hours allowed, e.g. 1.5">
          <Input type="number" id="hours" value={hours} onChange={(e) => setHours(e.target.value)} required min="0" step="0.5" inputMode="decimal" />
        </Field>
        <div className="flex justify-end sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="primary" icon={Plus}>
            Log activity
          </Button>
        </div>
      </form>
    </Card>
  );
}
