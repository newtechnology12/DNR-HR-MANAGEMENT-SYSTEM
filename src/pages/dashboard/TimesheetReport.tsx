import { useState, useEffect } from "react";
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
    <div className="p-6">
      <div className="mb-4 flex space-x-4">
        <div>
          <label htmlFor="employeeFilter" className="block mb-1">
            Employee:
          </label>
          <input
            type="text"
            id="employeeFilter"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="border rounded p-1"
            placeholder="Filter by employee"
          />
        </div>
        <div>
          <label htmlFor="datePreset" className="block mb-1">
            Date Preset:
          </label>
          <select
            id="datePreset"
            onChange={handlePresetChange}
            className="border rounded p-1"
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
          <label htmlFor="startDate" className="block mb-1">
            Start Date:
          </label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded p-1"
          />
        </div>
        <div>
          <label htmlFor="endDate" className="block mb-1">
            End Date:
          </label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded p-1"
          />
        </div>
      </div>
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="bg-blue-100 p-4 rounded">
          <h3 className="text-lg font-bold mb-2">Total Hours Logged</h3>
          <p className="text-2xl">{totalHours.toFixed(1)}</p>
        </div>
        <div className="bg-green-100 p-4 rounded">
          <h3 className="text-lg font-bold mb-2">Completed Tasks</h3>
          <p className="text-2xl">{completedTasks}</p>
        </div>
        <div className="bg-yellow-100 p-4 rounded">
          <h3 className="text-lg font-bold mb-2">Pending Tasks</h3>
          <p className="text-2xl">{pendingTasks}</p>
        </div>
      </div>
      <h3 className="text-xl font-bold mb-4">Detailed Activity Report</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2">Employee</th>
            <th className="border p-2">Date</th>
            <th className="border p-2">Task</th>
            <th className="border p-2">Hours</th>
            <th className="border p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredActivities.map((activity, index) => (
            <tr key={index} className="border">
              <td className="border p-2">{activity.employee}</td>
              <td className="border p-2">{activity.date}</td>
              <td className="border p-2">{activity.task}</td>
              <td className="border p-2">{activity.hours}</td>
              <td className="border p-2">{activity.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
