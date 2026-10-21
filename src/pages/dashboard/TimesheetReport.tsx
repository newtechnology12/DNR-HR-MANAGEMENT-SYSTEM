import { useState, useEffect } from "react";
import BreadCrumb from "@/components/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export default function TimesheetReport() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = datePresets.find((p) => p.label === e.target.value);
    if (preset) {
      setStartDate(preset.start);
      setEndDate(preset.end);
    }
  };

  return (
    <div className="space-y-6 px-4 py-4 sm:px-6">
      <div className="flex flex-col items-start gap-1">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Timesheet Report
        </h2>
        <BreadCrumb items={[{ title: "Timesheet Report", link: "/dashboard" }]} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div>
            <label htmlFor="employeeFilter" className="mb-1.5 block text-[13px] font-medium text-slate-600">
              Employee
            </label>
            <input
              type="text"
              id="employeeFilter"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="rounded-input border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Filter by employee"
            />
          </div>
          <div>
            <label htmlFor="datePreset" className="mb-1.5 block text-[13px] font-medium text-slate-600">
              Date Preset
            </label>
            <select
              id="datePreset"
              onChange={handlePresetChange}
              className="rounded-input border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              defaultValue="Current Week"
            >
              {datePresets.map((preset) => (
                <option key={preset.label} value={preset.label}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="startDate" className="mb-1.5 block text-[13px] font-medium text-slate-600">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-input border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="mb-1.5 block text-[13px] font-medium text-slate-600">
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-input border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13.5px] font-medium text-slate-600">
              Total Hours Logged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13.5px] font-medium text-slate-600">
              Completed Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{completedTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13.5px] font-medium text-slate-600">
              Pending Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warning">{pendingTasks}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detailed Activity Report</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                    No activity logged for this period.
                  </TableCell>
                </TableRow>
              ) : (
                filteredActivities.map((activity, index) => (
                  <TableRow key={index}>
                    <TableCell className="capitalize">{activity.employee}</TableCell>
                    <TableCell>{activity.date}</TableCell>
                    <TableCell>{activity.task}</TableCell>
                    <TableCell>{activity.hours}</TableCell>
                    <TableCell>
                      <Badge
                        variant={activity.status === "completed" ? "success" : "warning"}
                        className="capitalize"
                      >
                        {activity.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
