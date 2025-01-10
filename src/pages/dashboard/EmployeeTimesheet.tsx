import { useEffect, useState } from "react";

export default function EmployeeTimesheet() {
  return (
    <div className="p-5">
      <EmployeeActivityForm />
      <EmployeeActivityList />
    </div>
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

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = datePresets.find((p) => p.label === e.target.value);
    if (preset) {
      setStartDate(preset.start);
      setEndDate(preset.end);
    }
  };

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">Your Activities</h3>
      <div className="mb-4 flex space-x-4">
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
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2">Date</th>
            <th className="border p-2">Task</th>
            <th className="border p-2">Hours</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredActivities.map((activity, index) => (
            <tr key={index} className="border">
              <td className="border p-2">{activity.date}</td>
              <td className="border p-2">{activity.task}</td>
              <td className="border p-2">{activity.hours}</td>
              <td className="border p-2">{activity.status}</td>
              <td className="border p-2">
                {activity.status === "pending" && (
                  <button
                    onClick={() => handleStatusChange(index)}
                    className="px-2 py-1 rounded bg-green-500 text-white"
                  >
                    Mark Complete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeActivityForm() {
  const [date, setDate] = useState("");
  const [task, setTask] = useState("");
  const [hours, setHours] = useState("");
  const [status, setStatus] = useState("pending");
  const [employee, setEmployee] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <form onSubmit={handleSubmit} className="mb-8 p-4 bg-gray-100 rounded-lg">
      <div className="mb-4">
        <label htmlFor="employee" className="block mb-2">
          Employee Name:
        </label>
        <input
          type="text"
          id="employee"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="date" className="block mb-2">
          Date:
        </label>
        <input
          type="date"
          id="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="task" className="block mb-2">
          Task:
        </label>
        <input
          type="text"
          id="task"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="hours" className="block mb-2">
          Hours:
        </label>
        <input
          type="number"
          id="hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          required
          min="0"
          step="0.5"
          className="w-full p-2 border rounded"
        />
      </div>
      <button
        type="submit"
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Log Activity
      </button>
    </form>
  );
}
