import { useAuth } from "@/context/auth.context";
import { Camera, Clock } from "react-feather";
import { useQuery } from "react-query";
import { useState, useMemo, useRef } from "react";
import { cn } from "@/utils/cn";
import { useStopwatch } from "react-timer-hook";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/icons/Loader";
import Avatar from "@/components/shared/Avatar";
import BreadCrumb from "@/components/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmployeeAttendances from "./EmployeeAttendances";
import EmployeeLeaves from "./EmployeeLeaves";
import EmployeePayslips from "./EmployeePayslips";
import EmployeeAssets from "./EmployeeAssets";
import EmployeeDocuments from "./EmployeeDocuments";
import useSettings from "@/hooks/useSettings";
import { differenceInSeconds } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";
import LeavesTakenVsRemaining from "@/components/LeavesTakenVsRemaining";
import EmployeePrePayments from "./EmployeePrePayments";
import EmployeePerfomance from "./EmployeePerfomance";
import EmployeeLeavesplan from "./EmployeeLeavesPlane";
import { LeavePlanFormModal } from "@/components/modals/LeavePlaneFormModel";
import ExcelStyleLeavePlan from "./CountInventorySession";


function timeStringToDate(timeString, date) {
  var parts = timeString.split(":");
  var hours = parseInt(parts[0], 10);
  var minutes = parseInt(parts[1], 10);

  var currentDate = new Date(date);
  currentDate.setHours(hours);
  currentDate.setMinutes(minutes);
  currentDate.setSeconds(0);
  currentDate.setMilliseconds(0);

  return currentDate;
}

function getDayOfWeek(date) {
  var days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  var dayOfWeek = date.getDay();
  var dayName = days[dayOfWeek];
  return dayName;
}

function secondsToHHMMSS(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const formattedTime = `${String(hours).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}:${String(remainingSeconds.toFixed(0)).padStart(2, "0")}`;

  return formattedTime;
}

function renderNumberWithLeadingZero(number) {
  if (number < 10) {
    return "0" + number;
  } else {
    return String(number);
  }
}

export default function EmployeePortal() {
  const { user: employee } = useAuth();

  const getGreetings = () => {
    const date = new Date();
    const hours = date.getHours();
    if (hours < 12) {
      return "Good Morning";
    } else if (hours < 18) {
      return "Good Afternoon";
    } else {
      return "Good Evening";
    }
  };

  const employeeId = useMemo(() => employee?.id, [employee]);

  const { user }: any = useAuth();

  async function fetchAttendance() {
    const date = new Date();
    let beginTime: any = new Date(date);
    beginTime.setHours(0, 0, 0, 0);
    beginTime = beginTime.toISOString().replace("T", " ");

    let stopTime: any = new Date(date);
    stopTime.setHours(23, 59, 59, 999);
    stopTime = stopTime.toISOString().replace("T", " ");

    const dateQ = `created >= "${beginTime}" && created < "${stopTime}"`;

    const data = await pocketbase.collection("attendance").getFullList({
      filter: `employee="${employeeId}" && ${dateQ}`,
    });

    return data[0];
  }

  const attendanceQuery = useQuery(
    ["employee-attendance", employeeId],
    fetchAttendance,
    {
      keepPreviousData: true,
      retry: false,
      staleTime: Infinity,
      enabled: Boolean(employeeId),
    }
  );

  const getOffest = (clockin_time) => {
    console.log(clockin_time);
    const now = new Date();
    return (now.getTime() - new Date(clockin_time).getTime()) / 1000;
  };

  const [activeTab, setactiveTab] = useState("Attendance Log");

  const { settings } = useSettings();

  function formatTime(time24) {
    if (!time24) return undefined;
    var time = time24.split(":");
    var hours = parseInt(time[0], 10);
    var minutes = parseInt(time[1], 10);
    var ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // Handle midnight (0 hours)
    var formattedTime =
      hours + ":" + (minutes < 10 ? "0" + minutes : minutes) + " " + ampm;
    return formattedTime;
  }

  function timeDifference(time1, time2) {
    if (!time1 || !time2) return undefined;
    // Parse time strings to get hours and minutes
    var [hours1, minutes1] = time1.split(":").map(Number);
    var [hours2, minutes2] = time2.split(":").map(Number);

    // Convert times to minutes
    var totalMinutes1 = hours1 * 60 + minutes1;
    var totalMinutes2 = hours2 * 60 + minutes2;

    // Calculate the absolute difference in minutes
    var differenceInMinutes = Math.abs(totalMinutes1 - totalMinutes2);

    // Convert the difference back to hours and minutes
    var hoursDifference = Math.floor(differenceInMinutes / 60);
    var minutesDifference = differenceInMinutes % 60;

    // Return the difference as an object
    return `${hoursDifference} hr ${minutesDifference} mins`;
  }

  const [loadingClockin, setloadingClockin] = useState(false);
  const [loadingClockOut, setloadingClockOut] = useState(false);

  const handleClockin = async () => {
    try {
      setloadingClockin(true);

      const currentDate = new Date();

      // Get current date
      var start_time_date = timeStringToDate(
        settings.work_start_time,
        currentDate
      );
      var clockin_time_date = new Date();

      start_time_date.setMinutes(
        start_time_date.getMinutes() + (settings?.early_clockin_mins || 0)
      );

      const behaviour = clockin_time_date > start_time_date ? "late" : "early";

      return pocketbase
        .collection("attendance")
        .create({
          employee: employeeId,
          clockin_time: new Date(),
          type: "manual",
          behaviour,
          date: new Date(), 
          branch: employee.branch,
        })
        .then(() => {
          toast.success("Clock in success");
          setloadingClockin(false);
          attendanceQuery.refetch();
        })
        .catch((e) => {
          console.log(e);
          setloadingClockin(false);
          toast.error(e?.response?.data?.message || e.message);
        });
    } catch (error) {
      setloadingClockin(false);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          " Failed to get user address"
      );
    }
  };

  const handleClockOut = async () => {
    setloadingClockOut(true);
    try {
      setloadingClockOut(true);
      await pocketbase
        .collection("attendance")
        .update(attendanceQuery?.data?.id, {
          clockout_time: new Date(),
        });
      attendanceQuery.refetch();
      toast.success("Clock out success");
      setloadingClockOut(false);
    } catch (error) {
      setloadingClockOut(false);
      toast.error(error?.response?.data?.message || error?.message);
    }
  };

  const isWorkingDay = settings?.working_days.includes(
    getDayOfWeek(new Date())
  );

  return (
    <div className="px-3">
      <div className="flex items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            {getGreetings()}, {user.names}
          </h2>
          <BreadCrumb
            items={[{ title: "Employee Portal", link: "/dashboard" }]}
          />
        </div>
      </div>
      <div className="grid mt-2 grid-cols-7 gap-2">
        <div className="col-span-2">
          {(attendanceQuery.status === "loading" || attendanceQuery.isIdle) && (
            <div className="bg-white px-3 flex-col space-y-4 pt-5 pb-2 border  w-full h-full flex items-center justify-center border-slate-200 rounded-[4px]">
              <div>
                <Skeleton className={"w-[150px] h-3"} />
              </div>
              <div>
                <Skeleton className={"w-[120px] h-7"} />
              </div>
              <div className="mb-8">
                <Skeleton className={"w-[190px] h-3"} />
              </div>
              <div className="flex  items-center gap-4 w-full justify-center">
                <div className="flex items-center gap-2">
                  <div>
                    <Skeleton className="w-[40px] h-[40px] rounded-full" />
                  </div>
                  <div className="flex flex-col  gap-3">
                    <Skeleton className="w-[100px] h-3" />
                    <Skeleton className="w-[100px] h-2" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <Skeleton className="w-[40px] h-[40px] rounded-full" />
                  </div>
                  <div className="flex flex-col  gap-3">
                    <Skeleton className="w-[100px] h-3" />
                    <Skeleton className="w-[100px] h-2" />
                  </div>
                </div>
              </div>
              <div className="mb-8 w-full max-w-[310px]">
                <Skeleton className={"w-full h-8"} />
              </div>
              <div className="mb-8 w-full max-w-[310px] flex justify-start">
                <Skeleton className={"w-[150px] h-3"} />
              </div>
            </div>
          )}

          {attendanceQuery.status === "success" && (
            <div className="bg-white relative h-full px-3 pt-6 pb-6 border border-slate-200 rounded-md">
              <div className="flex flex-col justify-center items-center">
                <p className="capitalize  text-base font-semibold">
                  Today attendance
                </p>
                <h4 className="text-2xl text-slate-800 my-3 font-semibold">
                  {attendanceQuery.data &&
                  !attendanceQuery.data.clockout_time ? (
                    <CountDown
                      offset={getOffest(attendanceQuery?.data?.clockin_time)}
                    />
                  ) : attendanceQuery?.data?.clockout_time ? (
                    secondsToHHMMSS(
                      differenceInSeconds(
                        attendanceQuery?.data?.clockout_time,
                        attendanceQuery?.data?.clockin_time
                      )
                    )
                  ) : (
                    "00:00:00"
                  )}
                </h4>
                <span className="text-[13px] text-slate-500 font-medium-">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    minute: "numeric",
                    hour: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-center my-5 items-center gap-2">
                <div className="flex items-center gap-3">
                  <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
                    <Clock size={16} className="text-slate-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-700">
                      {attendanceQuery.data
                        ? new Date(
                            attendanceQuery.data.clockin_time
                          ).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : formatTime(settings?.work_start_time) || "00:00"}
                    </p>
                    <span className="text-[12.5px] capitalize  font-medium text-slate-500">
                      Clock in
                    </span>
                  </div>
                </div>
                <div className="px-3">
                  <svg
                    viewBox="0 0 24 24"
                    id="right-left-arrow"
                    height={20}
                    width={20}
                    data-name="Flat Line"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-slate-600 fill-current stroke-current"
                  >
                    <g id="SVGRepo_bgCarrier" strokeWidth={0} />
                    <g
                      id="SVGRepo_tracerCarrier"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <g id="SVGRepo_iconCarrier">
                      <polyline
                        id="primary"
                        points="7 13 4 16 7 19"
                        style={{
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          strokeWidth: 2,
                        }}
                      />
                      <path
                        id="primary-2"
                        data-name="primary"
                        d="M20,16H4M4,8H20"
                        style={{
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          strokeWidth: 2,
                        }}
                      />
                      <polyline
                        id="primary-3"
                        data-name="primary"
                        points="17 11 20 8 17 5"
                        style={{
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          strokeWidth: 2,
                        }}
                      />
                    </g>
                  </svg>
                </div>
                <div className="flex items-center gap-3">
                  <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
                    <Clock className="text-slate-600" size={16} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-slate-700">
                      {attendanceQuery.data
                        ? attendanceQuery.data.clockout_time
                          ? new Date(
                              attendanceQuery.data.clockout_time
                            ).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })
                          : "---"
                        : formatTime(settings?.work_end_time) || "00:00"}
                    </h4>
                    <span className="text-[12.5px] capitalize  font-medium text-slate-500">
                      clock out
                    </span>
                  </div>
                </div>
              </div>
              <div></div>
              <div className="flex flex-col items-center  gap-2 px-7 my-2">
                <Button
                  disabled={
                    attendanceQuery.data?.clockout_time ||
                    !isWorkingDay ||
                    loadingClockin ||
                    loadingClockOut
                  }
                  className="w-full"
                  onClick={() => {
                    if (attendanceQuery.data) {
                      handleClockOut();
                    } else {
                      handleClockin();
                    }
                  }}
                >
                  {(loadingClockin || loadingClockOut) && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {attendanceQuery.data ? "Clock out" : "  Clock in"}
                  {attendanceQuery.data ? (
                    <LogOut size={16} className="ml-2" />
                  ) : (
                    <LogIn size={16} className="ml-2" />
                  )}
                </Button>
                <div className="flex font-medium- text-slate-500 text-[13px] items-center gap-2">
                  <span>Total working hours:</span>
                  <span className="text-red-500">
                    {timeDifference(
                      settings?.work_end_time,
                      settings?.work_start_time
                    )}
                  </span>
                </div>
                {attendanceQuery?.data && (
                  <div className="flex font-medium text-slate-500 text-[13px] items-center gap-2">
                    <span>Behaviour:</span>
                    <span className="text-primary capitalize">
                      {attendanceQuery.data.behaviour}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="col-span-5">
          <Card className="h-full !shadow-none">
            <CardHeader className="pt-2">
              <CardTitle className="text-[15px]">Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="h-full">
              <ProfileInformation employee={employee} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-3">
        <Card>
          <div className="flex px-2 gap-2 w-full border-b items-center justify-start">
            {[
              "Attendance Log",
              "Documents",
              "leavePlan",
              "Leaves",
              // "Payslips",
              "Expense Request",
              "Car Request",
              "Perfomance",
              "Assets",
            ].map((e, i) => (
              <a
                key={i}
                className={cn(
                  "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
                  { "text-primary ": activeTab === e }
                )}
                onClick={() => setactiveTab(e)}
              >
                {activeTab === e && (
                  <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                )}
                <span className=""> {e}</span>
              </a>
            ))}
          </div>
          <div>
            {activeTab === "Attendance Log" && (
              <EmployeeAttendances employeeId={user.id} />
            )}

            {activeTab === "leavePlane" && 
            <ExcelStyleLeavePlan employeeId={user.id} />}
            
            {activeTab === "Leaves" && 
            <EmployeeLeaves employeeId={user.id} />}

            {activeTab === "Payslips" && (
              <EmployeePayslips employeeId={user.id} />
            )}
            {activeTab === "Documents" && (
              <EmployeeDocuments employeeId={user.id} />
            )}
            {activeTab === "Expense Request" && (
              <EmployeePrePayments employeeId={user.id} />
            )}
            {/* {activeTab === "Car Request" && (
              <CarRequestForm employeeId={user.id} />
            )} */}
            {activeTab === "Perfomance" && (
              <EmployeePerfomance employee={user} />
            )}{" "}
            {activeTab === "Assets" && <EmployeeAssets employeeId={user?.id} />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Reports({ employee }) {
  return (
    <div className="">
      <div className="px-3 py-[6px] max-w-xs border m-4">
        <span className="text-[13.5px] font-semibold capitalize">
          Leaves taken vs remaining
        </span>
        <div className="p-2">
          <LeavesTakenVsRemaining employee={employee} />
        </div>
      </div>
    </div>
  );
}

function ProfileInformation({ employee }) {
  const [uploading, setuploading] = useState(false);

  const uploadRef = useRef<any>();
  const { relaodUser } = useAuth();

  const updateProfile = async (e: any) => {
    const file = e.target.files[0];
    setuploading(true);
    try {
      await pocketbase.collection("users").update(employee.id, {
        avatar: file,
      });
      setuploading(false);
      relaodUser();
    } catch (error) {
      setuploading(false);
      toast.error(error.message);
    }
  };

  return (
    <div className="h-full">
      <div className="flex mt-1 gap-3 mb-1 items-center">
        <div className="relative group overflow-hidden rounded-full">
          <input
            disabled={uploading}
            type="file"
            className="hidden"
            ref={uploadRef}
            onChange={updateProfile}
          />
          <div
            className={cn(
              "absolute z-30 group-hover:opacity-100 transition-all overflow-hidden flex items-center justify-center h-full w-full bg-black bg-opacity-30",
              {
                "opacity-0": !uploading,
                "opacity-100": uploading,
              }
            )}
          >
            <a
              onClick={() => {
                uploadRef.current.click();
              }}
              className="h-7 w-7 cursor-pointer flex items-center justify-center bg-white rounded-full"
            >
              {uploading ? (
                <Loader className="mr-2- h-4 w-4 text-primary animate-spin" />
              ) : (
                <Camera size={14} className="text-slate-600" />
              )}
            </a>
          </div>
          <Avatar
            className="!h-10 !w-10 border"
            path={employee.photo}
            name={employee.names || "G"}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-[12.5px] capitalize font-semibold text-slate-700">
              {employee.names}
            </h4>
          </div>
          <p className="text-[12.5px] capitalize mt-1 font-medium text-slate-500">
            {employee?.role?.name}
          </p>
        </div>
      </div>
      <div className="grid px-[6px] gap-6 my-2 pt-3 grid-cols-3">
        {[
          { key: "First name", value: employee?.names.split(" ")[0] },
          { key: "Last name", value: employee?.names.split(" ")[1] },
          { key: "Email", value: employee.email },
          { key: "Gender", value: employee.gender },
          {
            key: "Birth",
            value: new Date(employee.birth).toLocaleDateString("en-US", {
              month: "long",
              day: "2-digit",
              year: "numeric",
            }),
          },
          { key: "National Id", value: employee.national_id },
          { key: "Phone", value: employee.phone },
          { key: "Country", value: employee?.country },
          {
            key: "Address",
            value: employee?.address,
          },
          {
            key: "Salary",
            value: Number(employee?.salary).toLocaleString("en-US", {
              style: "currency",
              currency: "RWF",
            }),
          },
          {
            key: "Department",
            value: employee?.department || "N.A",
          },
          {
            key: "Designation",
            value: employee?.designation || "N.A",
          },
          {
            key: "Joined at",
            value:
              new Date(employee?.joined_at).toLocaleDateString("en-US", {
                month: "long",
                day: "2-digit",
                year: "numeric",
              }) || "N.A",
          },
        ].map((e, i) => {
          return (
            <div className="flex  items-center gap-4" key={i}>
              <span className="text-[12.5px] font-medium- capitalize text-slate-500">
                {e.key}:
              </span>
              <span className="text-[12.5px] truncate font-semibold capitalize text-slate-700">
                {e.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountDown({ offset }) {
  const stopwatchOffset = new Date();
  stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);
  const { seconds, minutes, hours } = useStopwatch({
    autoStart: true,
    offsetTimestamp: stopwatchOffset,
  });
  return (
    <>
      <span>{renderNumberWithLeadingZero(hours)}</span>:
      <span>{renderNumberWithLeadingZero(minutes)}</span>:
      <span>{renderNumberWithLeadingZero(seconds)}</span>
    </>
  );
}
