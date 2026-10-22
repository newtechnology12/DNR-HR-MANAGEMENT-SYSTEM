import React, { useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth.context";
import { Camera, LogIn, LogOut } from "lucide-react";
import { useQuery } from "react-query";
import { cn } from "@/utils/cn";
import { useStopwatch } from "react-timer-hook";
import { differenceInSeconds } from "date-fns";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Loader from "@/components/icons/Loader";
import Avatar from "@/components/shared/Avatar";
import BreadCrumb from "@/components/breadcrumb";

import EmployeeAttendances from "./EmployeeAttendances";
import EmployeeLeaves from "./EmployeeLeaves";
import EmployeeAssets from "./EmployeeAssets";
import EmployeeDocuments from "./EmployeeDocuments";
import EmployeePrePayments from "./EmployeePrePayments";
import EmployeePerfomance from "./EmployeePerfomance";
import useSettings from "@/hooks/useSettings";
import ReportsTab from "../portal/ReportsTab";
import ActionPlansTab from "../portal/ActionPlansTab";
import MyAppraisals from "../portal/MyAppraisals";
import MyPayslips from "../portal/MyPayslips";
import { useSearchParams } from "react-router-dom";

interface GeoLocation {
  latitude: number;
  longitude: number;
}

/**
 * Extracts a human-readable location name (establishment/street) from a
 * Google Maps geocoding response, falling back to the full formatted address.
 */
const formatLocationProfessionally = (
  geocodingResult: any
): { mainLocation: string; fullAddress?: string } => {
  const firstResult = geocodingResult?.results?.[0];
  if (!firstResult) {
    return { mainLocation: "Location unavailable" };
  }

  const addressComponents = firstResult.address_components || [];
  const formattedAddress = firstResult.formatted_address;

  const extractComponent = (types: string[]) =>
    addressComponents.find((c: any) => types.some((type) => c.types.includes(type)))
      ?.long_name;

  const mainLocation =
    extractComponent(["establishment", "point_of_interest"]) ||
    extractComponent(["premise", "subpremise"]) ||
    `${extractComponent(["route"]) || ""}, ${
      extractComponent(["sublocality", "locality"]) || ""
    }`.trim() ||
    extractComponent(["administrative_area_level_1"]) ||
    formattedAddress?.split(",")[0];

  return { mainLocation: mainLocation || "Location unavailable", fullAddress: formattedAddress };
};

/** Fetches the user's current coordinates via the browser Geolocation API. */
const getCurrentLocation = (): Promise<GeoLocation> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => reject(error)
    );
  });
};

/** Resolves coordinates to a readable location name via Google's Geocoding API. */
const getLocationDetails = async (latitude: number, longitude: number): Promise<string> => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return "Location unavailable";
  }

  try {
    const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=en`;
    const response = await fetch(geocodingUrl);
    if (!response.ok) return "Location unavailable";

    const data = await response.json();
    if (data.status !== "OK") return "Location unavailable";

    const { mainLocation, fullAddress } = formatLocationProfessionally(data);
    return mainLocation || fullAddress || "Location unavailable";
  } catch {
    return "Location unavailable";
  }
};

const timeStringToDate = (timeString: string, date: Date): Date | null => {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(":").map(Number);
  if (isNaN(hours)) return null;
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
};

const getDayOfWeek = (date: Date): string => {
  if (!date) return "";
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[date.getDay()];
};

const formatTimeToHHMMSS = (seconds: number): string => {
  if (isNaN(seconds)) return "00:00:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    Math.floor(remainingSeconds)
  ).padStart(2, "0")}`;
};

const format12HourTime = (time24?: string): string => {
  if (!time24) return "--:--";
  const [hours, minutes] = time24.split(":").map(Number);
  if (isNaN(hours)) return "--:--";
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};

const calculateTimeDifference = (time1?: string, time2?: string): string => {
  if (!time1 || !time2) return "--";
  const [h1, m1] = time1.split(":").map(Number);
  const [h2, m2] = time2.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return "--";
  const diffMinutes = Math.abs(h1 * 60 + m1 - (h2 * 60 + m2));
  return `${Math.floor(diffMinutes / 60)}hr ${diffMinutes % 60}min`;
};

/** Safely formats a date string, returning a fallback for empty/invalid values. */
const safeFormatDate = (value?: string, fallback = "Not set"): string => {
  if (!value) return fallback;
  const date = new Date(value);
  return isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
};

const CountDown = ({
  offset,
  lunchStartTime,
  lunchEndTime,
}: {
  offset: number;
  lunchStartTime?: string;
  lunchEndTime?: string;
}) => {
  const stopwatchOffset = new Date();
  stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);

  const { seconds, minutes, hours } = useStopwatch({
    autoStart: true,
    offsetTimestamp: stopwatchOffset,
  });

  const lunchBreakDuration =
    lunchStartTime && lunchEndTime
      ? differenceInSeconds(new Date(lunchEndTime), new Date(lunchStartTime))
      : 0;

  const totalSeconds = Math.max(0, hours * 3600 + minutes * 60 + seconds - lunchBreakDuration);
  const adjustedHours = Math.floor(totalSeconds / 3600);
  const adjustedMinutes = Math.floor((totalSeconds % 3600) / 60);
  const adjustedSeconds = Math.floor(totalSeconds % 60);

  return (
    <div className="flex items-center gap-1 tabular-nums">
      <span>{String(adjustedHours).padStart(2, "0")}</span>:
      <span>{String(adjustedMinutes).padStart(2, "0")}</span>:
      <span>{String(adjustedSeconds).padStart(2, "0")}</span>
    </div>
  );
};

const ProfileInformation = ({ employee }: { employee: any }) => {
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const { reloadUser } = useAuth();

  const handleProfileUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await pocketbase.collection("users").update(employee.id, { avatar: file });
      await reloadUser();
      toast.success("Profile photo updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile photo");
    } finally {
      setUploading(false);
    }
  };

  const nameParts = (employee?.names || "").split(" ");

  const fieldGroups = [
    {
      title: "Personal",
      fields: [
        { key: "First name", value: nameParts[0] || "N/A" },
        { key: "Last name", value: nameParts[1] || "N/A" },
        { key: "Gender", value: employee.gender || "N/A" },
        { key: "Birth date", value: safeFormatDate(employee.birth) },
        { key: "National ID", value: employee.national_id || "N/A" },
      ],
    },
    {
      title: "Contact",
      fields: [
        { key: "Email", value: employee.email || "N/A" },
        { key: "Phone", value: employee.phone || "N/A" },
        { key: "Country", value: employee?.country || "N/A" },
        { key: "Address", value: employee?.address || "N/A" },
      ],
    },
    {
      title: "Employment",
      fields: [
        { key: "Department", value: employee?.department || "N/A" },
        { key: "Designation", value: employee?.designation || "N/A" },
        {
          key: "Salary",
          value: employee?.salary
            ? new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF" }).format(
                employee.salary
              )
            : "N/A",
        },
        { key: "Joined at", value: safeFormatDate(employee?.joined_at) },
      ],
    },
  ];

  return (
    <div className="h-full">
      <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-5">
        <div className="group relative overflow-hidden rounded-full">
          <input
            type="file"
            className="hidden"
            ref={uploadRef}
            onChange={handleProfileUpdate}
            accept="image/*"
            disabled={uploading}
          />
          <div
            className={cn(
              "absolute z-30 flex h-full w-full items-center justify-center overflow-hidden bg-black/40 opacity-0 transition-opacity group-hover:opacity-100",
              uploading && "opacity-100"
            )}
          >
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white"
              aria-label="Change profile photo"
            >
              {uploading ? (
                <Loader className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Camera size={14} className="text-slate-600" />
              )}
            </button>
          </div>
          <Avatar className="h-14 w-14 border" path={employee.photo} name={employee.names || "U"} />
        </div>
        <div>
          <h4 className="text-base font-semibold capitalize text-slate-900">{employee.names}</h4>
          <p className="mt-0.5 text-xs font-medium capitalize text-primary">
            {employee?.designation || employee?.role?.name || "Employee"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {fieldGroups.map((group) => (
          <div key={group.title}>
            <h5 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </h5>
            <div className="space-y-3">
              {group.fields.map((field) => (
                <div key={field.key}>
                  <p className="text-[11px] font-medium text-slate-400">{field.key}</p>
                  <p className="truncate text-[13px] font-semibold capitalize text-slate-800">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const EmployeePortal = () => {
  const { user: employee } = useAuth();
  const [isOnLunchBreak, setIsOnLunchBreak] = useState(false);
  const [lunchBreakEnded, setLunchBreakEnded] = useState(false);
  const [loadingStates, setLoadingStates] = useState({
    clockin: false,
    clockout: false,
    lunchBreak: false,
  });
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") || "Attendance Log";
  const setActiveTab = (tab: string) => setParams(tab === "Attendance Log" ? {} : { tab }, { replace: true });
  const { settings } = useSettings();
  const employeeId = useMemo(() => employee?.id, [employee]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const fetchAttendance = async () => {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const data = await pocketbase.collection("attendance").getFullList({
      filter: `employee="${employeeId}" && created >= "${startOfDay.toISOString()}" && created <= "${endOfDay.toISOString()}"`,
    });

    return data[0];
  };

  const attendanceQuery = useQuery(["employee-attendance", employeeId], fetchAttendance, {
    enabled: Boolean(employeeId),
    staleTime: Infinity,
    keepPreviousData: true,
  });

  const canClockIn = () => {
    const now = new Date();
    const startTime = timeStringToDate(settings?.work_start_time, now);
    if (!startTime) return false;

    const earlyWindow = new Date(startTime);
    earlyWindow.setMinutes(startTime.getMinutes() - (settings?.early_clockin_mins || 0));
    return now >= earlyWindow;
  };

  const canTakeLunchBreak = () => {
    if (
      !attendanceQuery.data ||
      !attendanceQuery.data.clockin_time ||
      attendanceQuery.data.clockout_time
    ) {
      return false;
    }

    const now = new Date();
    const lunchStart = timeStringToDate(settings?.lunch_start_time || "12:00", now);
    const lunchEnd = timeStringToDate(settings?.lunch_end_time || "14:00", now);

    return Boolean(lunchStart && lunchEnd && now >= lunchStart && now <= lunchEnd);
  };

  const handleClockIn = async () => {
    if (!canClockIn()) {
      toast.error("Clock-in is not allowed at this time");
      return;
    }

    if (attendanceQuery.data?.clockin_time) {
      toast.error("You have already clocked in today");
      return;
    }

    setLoadingStates((prev) => ({ ...prev, clockin: true }));
    let locationName = "Location unavailable";

    try {
      const location = await getCurrentLocation();
      if (!location?.latitude || !location?.longitude) {
        throw new Error("Failed to retrieve user coordinates");
      }

      locationName = await getLocationDetails(location.latitude, location.longitude);

      const now = new Date();
      const startTime = timeStringToDate(settings?.work_start_time, now);
      const behaviour = startTime && now > startTime ? "late" : "early";

      await pocketbase.collection("attendance").create({
        employee: employeeId,
        clockin_time: now,
        type: "manual",
        behaviour,
        date: now,
        branch: employee.branch,
        clockin_location: locationName,
      });

      toast.success("Clock-in successful");
      await attendanceQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to clock in. Please try again.");
    } finally {
      setLoadingStates((prev) => ({ ...prev, clockin: false }));
    }
  };

  const handleClockOut = async () => {
    if (isOnLunchBreak) {
      toast.error("Please end lunch break before clocking out");
      return;
    }

    if (!attendanceQuery.data?.clockin_time) {
      toast.error("You must clock in before clocking out");
      return;
    }

    setLoadingStates((prev) => ({ ...prev, clockout: true }));

    try {
      const location = await getCurrentLocation();
      const locationName = await getLocationDetails(location.latitude, location.longitude);

      await pocketbase.collection("attendance").update(attendanceQuery.data.id, {
        clockout_time: new Date(),
        clockout_location: locationName,
      });

      toast.success("Clock-out successful");
      attendanceQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to clock out. Please try again.");
    } finally {
      setLoadingStates((prev) => ({ ...prev, clockout: false }));
    }
  };

  const handleLunchBreak = async () => {
    if (!canTakeLunchBreak() || !attendanceQuery.data?.clockin_time) {
      toast.error("Lunch break is not allowed at this time or you have not clocked in");
      return;
    }

    setLoadingStates((prev) => ({ ...prev, lunchBreak: true }));
    try {
      if (isOnLunchBreak) {
        const now = new Date();
        const lunchStartTime = new Date(attendanceQuery.data.lunch_start_time);

        if (now <= lunchStartTime) {
          toast.error("Lunch end time cannot be before or equal to lunch start time");
          return;
        }

        await pocketbase.collection("attendance").update(attendanceQuery.data.id, {
          lunch_end_time: now,
        });
        toast.success("Lunch break ended");
        setLunchBreakEnded(true);
      } else {
        await pocketbase.collection("attendance").update(attendanceQuery.data.id, {
          lunch_start_time: new Date(),
        });
        toast.success("Lunch break started");
      }
      setIsOnLunchBreak(!isOnLunchBreak);
      attendanceQuery.refetch();
    } catch (error: any) {
      toast.error(error?.response?.message || "Failed to update lunch break");
    } finally {
      setLoadingStates((prev) => ({ ...prev, lunchBreak: false }));
    }
  };

  const isLunchBreakDisabled =
    !attendanceQuery.data?.clockin_time ||
    Boolean(attendanceQuery.data?.clockout_time) ||
    lunchBreakEnded ||
    !canTakeLunchBreak();

  const isWorkingDay = settings?.working_days?.includes(getDayOfWeek(new Date()));

  const tabs = [
    "Attendance Log",
    "Documents",
    "Leaves",
    "Action Plans",
    "Reports",
    "Expense Request",
    "Payslips",
    "Performance",
    "Assets",
  ];

  if (!employee) {
    return null;
  }

  return (
    <div className="space-y-6 px-4 py-4 sm:px-6">
      <div className="flex flex-col items-start gap-1">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          {getGreeting()}, {employee.names}
        </h2>
        <BreadCrumb items={[{ title: "Employee Portal", link: "/dashboard" }]} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <div className="lg:col-span-2">
          {attendanceQuery.status === "loading" || attendanceQuery.isIdle ? (
            <Card className="h-full p-4">
              <div className="space-y-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-40" />
                <div className="flex justify-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2 w-20" />
                  </div>
                </div>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </Card>
          ) : (
            <Card className="flex h-full flex-col p-4">
              <div className="flex flex-col items-center border-b border-slate-100 pb-4">
                <h3 className="text-sm font-semibold text-slate-500">Today&apos;s Attendance</h3>
                <div className="my-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                  {attendanceQuery.data && !attendanceQuery.data.clockout_time ? (
                    <CountDown
                      offset={differenceInSeconds(
                        new Date(),
                        new Date(attendanceQuery.data.clockin_time)
                      )}
                      lunchStartTime={attendanceQuery.data.lunch_start_time}
                      lunchEndTime={attendanceQuery.data.lunch_end_time}
                    />
                  ) : attendanceQuery.data?.clockout_time ? (
                    formatTimeToHHMMSS(
                      differenceInSeconds(
                        new Date(attendanceQuery.data.clockout_time),
                        new Date(attendanceQuery.data.clockin_time)
                      )
                    )
                  ) : (
                    "00:00:00"
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                  })}
                </span>
              </div>

              <div className="flex-1 space-y-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-success/5">
                    <LogIn size={15} className="text-success" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {attendanceQuery.data
                        ? new Date(attendanceQuery.data.clockin_time).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : format12HourTime(settings?.work_start_time)}
                    </p>
                    <span className="truncate text-xs text-slate-500">
                      {attendanceQuery.data?.clockin_location || "Not clocked in yet"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-danger/5">
                    <LogOut size={15} className="text-danger" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {attendanceQuery.data?.clockout_time
                        ? new Date(attendanceQuery.data.clockout_time).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : format12HourTime(settings?.work_end_time)}
                    </p>
                    <span className="truncate text-xs text-slate-500">
                      {attendanceQuery.data?.clockout_location || "Not clocked out yet"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {!attendanceQuery.data ? (
                  <Button
                    disabled={!isWorkingDay || loadingStates.clockin}
                    className="w-full"
                    onClick={handleClockIn}
                  >
                    {loadingStates.clockin && <Loader className="h-4 w-4 animate-spin" />}
                    <LogIn size={16} />
                    Clock in
                  </Button>
                ) : (
                  <Button
                    disabled={Boolean(attendanceQuery.data?.clockout_time) || loadingStates.clockout}
                    className="w-full"
                    onClick={handleClockOut}
                  >
                    {loadingStates.clockout && <Loader className="h-4 w-4 animate-spin" />}
                    <LogOut size={16} />
                    Clock out
                  </Button>
                )}

                <Button
                  variant="outline"
                  disabled={isLunchBreakDisabled || loadingStates.lunchBreak}
                  className="w-full"
                  onClick={handleLunchBreak}
                >
                  {loadingStates.lunchBreak && <Loader className="h-4 w-4 animate-spin" />}
                  {isOnLunchBreak ? "End Lunch Break" : "Start Lunch Break"}
                </Button>

                <div className="pt-1 text-center text-xs text-slate-500">
                  <div>
                    Working hours: {calculateTimeDifference(settings?.work_start_time, settings?.work_end_time)}
                  </div>
                  {attendanceQuery.data?.behaviour && (
                    <div className="mt-1">
                      Status:{" "}
                      <span
                        className={cn("font-medium capitalize", {
                          "text-success": attendanceQuery.data.behaviour === "early",
                          "text-danger": attendanceQuery.data.behaviour === "late",
                        })}
                      >
                        {attendanceQuery.data.behaviour}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="lg:col-span-5">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileInformation employee={employee} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <div className="scrollbar-none flex overflow-x-auto border-b border-slate-100">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-5 py-3 text-sm font-medium transition-colors",
                activeTab === tab ? "text-primary" : "text-slate-500 hover:text-slate-900"
              )}
              onClick={() => setActiveTab(tab)}
            >
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 h-0.5 w-full bg-primary" />
              )}
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === "Attendance Log" && <EmployeeAttendances employeeId={employee.id} inset />}
          {activeTab === "Documents" && <EmployeeDocuments employeeId={employee.id} inset />}
          {activeTab === "Leaves" && <EmployeeLeaves employeeId={employee.id} inset />}
          {activeTab === "Reports" && <ReportsTab employeeId={employee.id} />}
          {activeTab === "Expense Request" && <EmployeePrePayments employeeId={employee.id} />}
          {activeTab === "Performance" && (
            <div className="space-y-5">
              <MyAppraisals />
              <EmployeePerfomance employee={employee} hideWhenEmpty />
            </div>
          )}
          {activeTab === "Payslips" && <MyPayslips employeeId={employee.id} />}
          {activeTab === "Assets" && <EmployeeAssets employeeId={employee.id} />}
          {activeTab === "Action Plans" && <ActionPlansTab employeeId={employee.id} />}
        </div>
      </Card>
    </div>
  );
};

export default EmployeePortal;
