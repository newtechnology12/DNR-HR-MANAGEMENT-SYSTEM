import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as React from "react";
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils";
import { Calendar } from "@/components/ui/calendar";
import BreadCrumb from "@/components/breadcrumb";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import { Activity, LogOut, Split, Users } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import Employees from "@/components/Employees";
import useSettings from "@/hooks/useSettings";

// Helper function to format date to the start of the day
function formatDateToStartOfDay(inputDate: Date): string {
  const beginTime = new Date(inputDate);
  beginTime.setHours(0, 0, 0, 0);
  return beginTime.toISOString().replace("T", " ");
}

// Helper function to format date to the end of the day
function formatDateToEndOfDay(inputDate: Date): string {
  const stopTime = new Date(inputDate);
  stopTime.setHours(23, 59, 59, 999);
  return stopTime.toISOString().replace("T", " ");
}

export default function Dashboard() {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(formatDateToStartOfDay(new Date())),
    to: new Date(formatDateToEndOfDay(new Date())),
  });

  // Fetch analytics data
  const analyticsQuery = useQuery({
    queryKey: ["analytics", { date }],
    queryFn: async () => {
      const [employees, departments, leaves_requested, employees_on_leave] = await Promise.all([
        // Fetch total active employees
        pocketbase.collection("users").getList(1, 1, { filter: `status="Active"` }).then((e) => e.totalItems),

        // Fetch total departments (corrected logic)
        pocketbase.collection("departments").getFullList().then((e) => e.length), // Use `length` to count departments

        // Fetch total pending leave requests
        pocketbase.collection("leaves").getList(1, 1, { filter: `status="pending"` }).then((e) => e.totalItems),

        // Fetch total employees on leave today
        pocketbase.collection("leaves").getList(1, 1, {
          filter: `status="approved" && start >= "${formatDateToStartOfDay(new Date())}" && end <= "${formatDateToEndOfDay(new Date())}"`,
        }).then((e) => e.totalItems),
      ]);

      return { employees, departments, leaves_requested, employees_on_leave };
    },
    enabled: true,
  });

  const { settings } = useSettings();
  const isWorkingDay = settings?.working_days.includes(getDayOfWeek(new Date()));

  // Fetch attendance data
  const fetchAttendaceData = async () => {
    const all_employee = await pocketbase.collection("users").getList(1, 1, {
      filter: `status="active"`,
    });

    const today_attendance = await pocketbase.collection("attendance").getList(1, 1, {
      filter: `date >= "${formatDateToStartOfDay(new Date())}" && date <= "${formatDateToEndOfDay(new Date())}"`,
    });

    const absent = isWorkingDay ? all_employee.totalItems - today_attendance.totalItems : 0;
    const present = isWorkingDay ? today_attendance.totalItems : 0;

    return [
      { name: "Present", value: present, color: "#22c55e" },
      { name: "Absent", value: absent, color: "#d1d5db" },
    ];
  };

  const attendanceQuery = useQuery(["dashboard-attendance-analytics"], fetchAttendaceData, {
    keepPreviousData: true,
    retry: false,
    staleTime: Infinity,
  });

  return (
    <div className="flex-1 space-y-4 px-3 pt-0">
      <div className="flex @mb-0 items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-base font-semibold tracking-tight">Dashboard Overview</h2>
          <BreadCrumb items={[{ title: "Overview Analytics", link: "/dashboard" }]} />
        </div>
        <div className="flex items-center space-x-2">
          <CalendarDateRangePicker date={date} setDate={setDate} />
        </div>
      </div>

      <div className="grid-cols-9 h-full grid bg-slate-300- gap-x-2">
        <div className="grid h-full bg-red-500- !mt-0 col-span-7 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Total Employees", icon: <Users size={16} />, value: analyticsQuery.data?.employees, description: "All the employees available." },
            { title: "Total departments", icon: <Split size={16} />, value: analyticsQuery.data?.departments, description: "All departments available." },
            { title: "Total leave requests", icon: <LogOut size={16} />, value: analyticsQuery.data?.leaves_requested, description: "All leave requests available." },
            { title: "On leave employees", icon: <Activity size={16} />, value: analyticsQuery.data?.employees_on_leave, description: "All employees on leave." },
            { title: "Absent employees", icon: <Activity size={16} />, value: attendanceQuery.data?.find((e) => e.name === "Absent")?.value, description: "All absent employees." },
            { title: "Present employees", icon: <Activity size={16} />, value: attendanceQuery.data?.find((e) => e.name === "Present")?.value, description: "All present employees." },
          ].map((item, index) => (
            <Card key={index} className="rounded-[3px] shadow-none h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3">
                <CardTitle className="text-[14.5px] font-medium">{item.title}</CardTitle>
                {item.icon}
              </CardHeader>
              <CardContent className="p-3">
                <div className="text-xl font-semibold mb-3">
                  {item.value ?? (analyticsQuery.status === "loading" ? "---" : 0)}
                </div>
                <p className="text-sm text-slate-500 capitalize">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <AttendanceView
          className="row-span-2 h-full col-span-2"
          status={attendanceQuery.status}
          attendance={attendanceQuery.data || []}
        />
      </div>

      <div>
        <Employees />
      </div>
    </div>
  );
}

// Date Range Picker Component
function CalendarDateRangePicker({ className, date, setDate }: { className?: string; date: DateRange | undefined; setDate: (date: DateRange | undefined) => void }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn("w-fit justify-start hover:bg-white text-left font-normal", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto bg-white p-0" align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(e) => {
              if (e?.from) {
                setDate(e);
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Helper function to get the day of the week
function getDayOfWeek(date: Date): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[date.getDay()];
}

// Attendance View Component
function AttendanceView({ attendance, status, className }: { attendance: { name: string; value: number; color: string }[]; status: string; className?: string }) {
  const attendacesValues = attendance.reduce((a, b) => a + b.value, 0);
  const { settings, isLoading } = useSettings();
  const isWorkingDay = settings?.working_days.includes(getDayOfWeek(new Date()));

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="!pb-0">
        <CardTitle className="text-[14px]">Today Attendance</CardTitle>
      </CardHeader>
      <CardContent className="!pb-0 h-full">
        <div className="px-2 flex flex-col justify-between h-full py-2">
          {(status === "loading" || isLoading) && (
            <div className="w-full flex h-full justify-center items-center">
              <div className="h-[170px] animate-pulse flex items-center relative justify-center w-[170px] bg-slate-200 rounded-full">
                <div className="h-[130px] w-[130px] bg-white rounded-full"></div>
                <div className="w-[100px] right-0 bg-white h-[7px] absolute"></div>
              </div>
            </div>
          )}
          {status === "success" && attendacesValues && isWorkingDay ? (
            <div className="flex py-4- h-full flex-col items-center justify-center">
              <AttendanceChart data={attendance} />
            </div>
          ) : null}

          {status !== "loading" && !isLoading && !isWorkingDay && (
            <div className="w-full flex items-center justify-center h-full">
              <span className="text-[13px] font-medium text-slate-500">No attendance available</span>
            </div>
          )}

          {status === "success" && isWorkingDay && (
            <div className="h-full- pb-3- space-y-3 mt-0">
              {attendance.map((item, index) => (
                <div key={index} className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[13px] text-slate-600 capitalize font-medium">{item.name}</span>
                  </div>
                  <span className="text-[12.5px]">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Attendance Chart Component
function AttendanceChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <PieChart width={140} height={140}>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={50}
        outerRadius={70}
        fill="#8884d8"
        paddingAngle={3}
        dataKey="value"
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={data[index % data.length].color} />
        ))}
      </Pie>
    </PieChart>
  );
}