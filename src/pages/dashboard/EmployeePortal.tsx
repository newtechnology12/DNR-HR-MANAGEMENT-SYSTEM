// import { useAuth } from "@/context/auth.context";
// import { Camera, Clock } from "react-feather";
// import { useQuery } from "react-query";
// import { useState, useMemo, useRef } from "react";
// import { cn } from "@/utils/cn";
// import { useStopwatch } from "react-timer-hook";
// import pocketbase from "@/lib/pocketbase";
// import { Skeleton } from "@/components/ui/skeleton";
// import Loader from "@/components/icons/Loader";
// import Avatar from "@/components/shared/Avatar";
// import BreadCrumb from "@/components/breadcrumb";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import EmployeeAttendances from "./EmployeeAttendances";
// import EmployeeLeaves from "./EmployeeLeaves";
// // import EmployeePayslips from "./EmployeePayslips";
// import EmployeeAssets from "./EmployeeAssets";
// import EmployeeDocuments from "./EmployeeDocuments";
// import useSettings from "@/hooks/useSettings";
// import { differenceInSeconds } from "date-fns";
// import { toast } from "sonner";
// import { Button } from "@/components/ui/button";
// import { LogIn, LogOut } from "lucide-react";
// import LeavesTakenVsRemaining from "@/components/LeavesTakenVsRemaining";
// import EmployeePrePayments from "./EmployeePrePayments";
// import EmployeePerfomance from "./EmployeePerfomance";
// import EmployeeReports from "./EmployeeReportModel";
// import EmployeeTrainings from "./employeeTrainings";

// function timeStringToDate(timeString, date) {
//   var parts = timeString.split(":");
//   var hours = parseInt(parts[0], 10);
//   var minutes = parseInt(parts[1], 10);

//   var currentDate = new Date(date);
//   currentDate.setHours(hours);
//   currentDate.setMinutes(minutes);
//   currentDate.setSeconds(0);
//   currentDate.setMilliseconds(0);

//   return currentDate;
// }

// function getDayOfWeek(date) {
//   var days = [
//     "sunday",
//     "monday",
//     "tuesday",
//     "wednesday",
//     "thursday",
//     "friday",
//     "saturday",
//   ];
//   var dayOfWeek = date.getDay();
//   var dayName = days[dayOfWeek];
//   return dayName;
// }

// function secondsToHHMMSS(seconds) {
//   const hours = Math.floor(seconds / 3600);
//   const minutes = Math.floor((seconds % 3600) / 60);
//   const remainingSeconds = seconds % 60;

//   const formattedTime = `${String(hours).padStart(2, "0")}:${String(
//     minutes
//   ).padStart(2, "0")}:${String(remainingSeconds.toFixed(0)).padStart(2, "0")}`;

//   return formattedTime;
// }

// function renderNumberWithLeadingZero(number) {
//   if (number < 10) {
//     return "0" + number;
//   } else {
//     return String(number);
//   }
// }

// export default function EmployeePortal() {
//   const { user: employee } = useAuth();

//   const getGreetings = () => {
//     const date = new Date();
//     const hours = date.getHours();
//     if (hours < 12) {
//       return "Good Morning";
//     } else if (hours < 18) {
//       return "Good Afternoon";
//     } else {
//       return "Good Evening";
//     }
//   };

//   const employeeId = useMemo(() => employee?.id, [employee]);

//   const { user }: any = useAuth();

//   async function fetchAttendance() {
//     const date = new Date();
//     let beginTime: any = new Date(date);
//     beginTime.setHours(0, 0, 0, 0);
//     beginTime = beginTime.toISOString().replace("T", " ");

//     let stopTime: any = new Date(date);
//     stopTime.setHours(23, 59, 59, 999);
//     stopTime = stopTime.toISOString().replace("T", " ");

//     const dateQ = `created >= "${beginTime}" && created < "${stopTime}"`;

//     const data = await pocketbase.collection("attendance").getFullList({
//       filter: `employee="${employeeId}" && ${dateQ}`,
//     });

//     return data[0];
//   }

//   const attendanceQuery = useQuery(
//     ["employee-attendance", employeeId],
//     fetchAttendance,
//     {
//       keepPreviousData: true,
//       retry: false,
//       staleTime: Infinity,
//       enabled: Boolean(employeeId),
//     }
//   );

//   const getOffest = (clockin_time) => {
//     console.log(clockin_time);
//     const now = new Date();
//     return (now.getTime() - new Date(clockin_time).getTime()) / 1000;
//   };

//   const [activeTab, setactiveTab] = useState("Attendance Log");

//   const { settings } = useSettings();

//   function formatTime(time24) {
//     if (!time24) return undefined;
//     var time = time24.split(":");
//     var hours = parseInt(time[0], 10);
//     var minutes = parseInt(time[1], 10);
//     var ampm = hours >= 12 ? "PM" : "AM";
//     hours = hours % 12;
//     hours = hours ? hours : 12; // Handle midnight (0 hours)
//     var formattedTime =
//       hours + ":" + (minutes < 10 ? "0" + minutes : minutes) + " " + ampm;
//     return formattedTime;
//   }

//   function timeDifference(time1, time2) {
//     if (!time1 || !time2) return undefined;
//     // Parse time strings to get hours and minutes
//     var [hours1, minutes1] = time1.split(":").map(Number);
//     var [hours2, minutes2] = time2.split(":").map(Number);

//     // Convert times to minutes
//     var totalMinutes1 = hours1 * 60 + minutes1;
//     var totalMinutes2 = hours2 * 60 + minutes2;

//     // Calculate the absolute difference in minutes
//     var differenceInMinutes = Math.abs(totalMinutes1 - totalMinutes2);

//     // Convert the difference back to hours and minutes
//     var hoursDifference = Math.floor(differenceInMinutes / 60);
//     var minutesDifference = differenceInMinutes % 60;

//     // Return the difference as an object
//     return `${hoursDifference} hr ${minutesDifference} mins`;
//   }

//   const [loadingClockin, setloadingClockin] = useState(false);
//   const [loadingClockOut, setloadingClockOut] = useState(false);

//   const handleClockin = async () => {
//     try {
//       setloadingClockin(true);

//       const currentDate = new Date();

//       // Get current date
//       var start_time_date = timeStringToDate(
//         settings.work_start_time,
//         currentDate
//       );
//       var clockin_time_date = new Date();

//       start_time_date.setMinutes(
//         start_time_date.getMinutes() + (settings?.early_clockin_mins || 0)
//       );

//       const behaviour = clockin_time_date > start_time_date ? "late" : "early";

//       return pocketbase
//         .collection("attendance")
//         .create({
//           employee: employeeId,
//           clockin_time: new Date(),
//           type: "manual",
//           behaviour,
//           date: new Date(),
//           branch: employee.branch,
//         })
//         .then(() => {
//           toast.success("Clock in success");
//           setloadingClockin(false);
//           attendanceQuery.refetch();
//         })
//         .catch((e) => {
//           console.log(e);
//           setloadingClockin(false);
//           toast.error(e?.response?.data?.message || e.message);
//         });
//     } catch (error) {
//       setloadingClockin(false);
//       toast.error(
//         error?.response?.data?.message ||
//           error?.message ||
//           " Failed to get user address"
//       );
//     }
//   };

//   const handleClockOut = async () => {
//     setloadingClockOut(true);
//     try {
//       setloadingClockOut(true);
//       await pocketbase
//         .collection("attendance")
//         .update(attendanceQuery?.data?.id, {
//           clockout_time: new Date(),
//         });
//       attendanceQuery.refetch();
//       toast.success("Clock out success");
//       setloadingClockOut(false);
//     } catch (error) {
//       setloadingClockOut(false);
//       toast.error(error?.response?.data?.message || error?.message);
//     }
//   };

//   const isWorkingDay = settings?.working_days.includes(
//     getDayOfWeek(new Date())
//   );

//   return (
//     <div className="px-3">
//       <div className="flex items-start justify-between space-y-2">
//         <div className="flex items-start gap-2 flex-col">
//           <h2 className="text-lg font-semibold tracking-tight">
//             {getGreetings()}, {user.names}
//           </h2>
//           <BreadCrumb
//             items={[{ title: "Employee Portal", link: "/dashboard" }]}
//           />
//         </div>
//       </div>
//       <div className="grid mt-2 grid-cols-7 gap-2">
//         <div className="col-span-2">
//           {(attendanceQuery.status === "loading" || attendanceQuery.isIdle) && (
//             <div className="bg-white px-3 flex-col space-y-4 pt-5 pb-2 border  w-full h-full flex items-center justify-center border-slate-200 rounded-[4px]">
//               <div>
//                 <Skeleton className={"w-[150px] h-3"} />
//               </div>
//               <div>
//                 <Skeleton className={"w-[120px] h-7"} />
//               </div>
//               <div className="mb-8">
//                 <Skeleton className={"w-[190px] h-3"} />
//               </div>
//               <div className="flex  items-center gap-4 w-full justify-center">
//                 <div className="flex items-center gap-2">
//                   <div>
//                     <Skeleton className="w-[40px] h-[40px] rounded-full" />
//                   </div>
//                   <div className="flex flex-col  gap-3">
//                     <Skeleton className="w-[100px] h-3" />
//                     <Skeleton className="w-[100px] h-2" />
//                   </div>
//                 </div>
//                 <div className="flex items-center gap-2">
//                   <div>
//                     <Skeleton className="w-[40px] h-[40px] rounded-full" />
//                   </div>
//                   <div className="flex flex-col  gap-3">
//                     <Skeleton className="w-[100px] h-3" />
//                     <Skeleton className="w-[100px] h-2" />
//                   </div>
//                 </div>
//               </div>
//               <div className="mb-8 w-full max-w-[310px]">
//                 <Skeleton className={"w-full h-8"} />
//               </div>
//               <div className="mb-8 w-full max-w-[310px] flex justify-start">
//                 <Skeleton className={"w-[150px] h-3"} />
//               </div>
//             </div>
//           )}

//           {attendanceQuery.status === "success" && (
//             <div className="bg-white relative h-full px-3 pt-6 pb-6 border border-slate-200 rounded-md">
//               <div className="flex flex-col justify-center items-center">
//                 <p className="capitalize  text-base font-semibold">
//                   Today attendance
//                 </p>
//                 <h4 className="text-2xl text-slate-800 my-3 font-semibold">
//                   {attendanceQuery.data &&
//                   !attendanceQuery.data.clockout_time ? (
//                     <CountDown
//                       offset={getOffest(attendanceQuery?.data?.clockin_time)}
//                     />
//                   ) : attendanceQuery?.data?.clockout_time ? (
//                     secondsToHHMMSS(
//                       differenceInSeconds(
//                         attendanceQuery?.data?.clockout_time,
//                         attendanceQuery?.data?.clockin_time
//                       )
//                     )
//                   ) : (
//                     "00:00:00"
//                   )}
//                 </h4>
//                 <span className="text-[13px] text-slate-500 font-medium-">
//                   {new Date().toLocaleDateString("en-US", {
//                     weekday: "short",
//                     year: "numeric",
//                     month: "short",
//                     day: "numeric",
//                     minute: "numeric",
//                     hour: "numeric",
//                   })}
//                 </span>
//               </div>
//               <div className="flex justify-center my-5 items-center gap-2">
//                 <div className="flex items-center gap-3">
//                   <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
//                     <Clock size={16} className="text-slate-600" />
//                   </div>
//                   <div>
//                     <p className="text-[13px] font-semibold text-slate-700">
//                       {attendanceQuery.data
//                         ? new Date(
//                             attendanceQuery.data.clockin_time
//                           ).toLocaleTimeString("en-US", {
//                             hour: "2-digit",
//                             minute: "2-digit",
//                             hour12: true,
//                           })
//                         : formatTime(settings?.work_start_time) || "00:00"}
//                     </p>
//                     <span className="text-[12.5px] capitalize  font-medium text-slate-500">
//                       Clock in
//                     </span>
//                   </div>
//                 </div>
//                 <div className="px-3">
//                   <svg
//                     viewBox="0 0 24 24"
//                     id="right-left-arrow"
//                     height={20}
//                     width={20}
//                     data-name="Flat Line"
//                     xmlns="http://www.w3.org/2000/svg"
//                     className="text-slate-600 fill-current stroke-current"
//                   >
//                     <g id="SVGRepo_bgCarrier" strokeWidth={0} />
//                     <g
//                       id="SVGRepo_tracerCarrier"
//                       strokeLinecap="round"
//                       strokeLinejoin="round"
//                     />
//                     <g id="SVGRepo_iconCarrier">
//                       <polyline
//                         id="primary"
//                         points="7 13 4 16 7 19"
//                         style={{
//                           strokeLinecap: "round",
//                           strokeLinejoin: "round",
//                           strokeWidth: 2,
//                         }}
//                       />
//                       <path
//                         id="primary-2"
//                         data-name="primary"
//                         d="M20,16H4M4,8H20"
//                         style={{
//                           strokeLinecap: "round",
//                           strokeLinejoin: "round",
//                           strokeWidth: 2,
//                         }}
//                       />
//                       <polyline
//                         id="primary-3"
//                         data-name="primary"
//                         points="17 11 20 8 17 5"
//                         style={{
//                           strokeLinecap: "round",
//                           strokeLinejoin: "round",
//                           strokeWidth: 2,
//                         }}
//                       />
//                     </g>
//                   </svg>
//                 </div>
//                 <div className="flex items-center gap-3">
//                   <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
//                     <Clock className="text-slate-600" size={16} />
//                   </div>
//                   <div>
//                     <h4 className="text-[13px] font-semibold text-slate-700">
//                       {attendanceQuery.data
//                         ? attendanceQuery.data.clockout_time
//                           ? new Date(
//                               attendanceQuery.data.clockout_time
//                             ).toLocaleTimeString("en-US", {
//                               hour: "2-digit",
//                               minute: "2-digit",
//                               hour12: true,
//                             })
//                           : "---"
//                         : formatTime(settings?.work_end_time) || "00:00"}
//                     </h4>
//                     <span className="text-[12.5px] capitalize  font-medium text-slate-500">
//                       clock out
//                     </span>
//                   </div>
//                 </div>
//               </div>
//               <div></div>
//               <div className="flex flex-col items-center  gap-2 px-7 my-2">
//                 <Button
//                   disabled={
//                     attendanceQuery.data?.clockout_time ||
//                     !isWorkingDay ||
//                     loadingClockin ||
//                     loadingClockOut
//                   }
//                   className="w-full"
//                   onClick={() => {
//                     if (attendanceQuery.data) {
//                       handleClockOut();
//                     } else {
//                       handleClockin();
//                     }
//                   }}
//                 >
//                   {(loadingClockin || loadingClockOut) && (
//                     <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
//                   )}
//                   {attendanceQuery.data ? "Clock out" : "  Clock in"}
//                   {attendanceQuery.data ? (
//                     <LogOut size={16} className="ml-2" />
//                   ) : (
//                     <LogIn size={16} className="ml-2" />
//                   )}
//                 </Button>
//                 <div className="flex font-medium- text-slate-500 text-[13px] items-center gap-2">
//                   <span>Total working hours:</span>
//                   <span className="text-red-500">
//                     {timeDifference(
//                       settings?.work_end_time,
//                       settings?.work_start_time
//                     )}
//                   </span>
//                 </div>
//                 {attendanceQuery?.data && (
//                   <div className="flex font-medium text-slate-500 text-[13px] items-center gap-2">
//                     <span>Behaviour:</span>
//                     <span className="text-primary capitalize">
//                       {attendanceQuery.data.behaviour}
//                     </span>
//                   </div>
//                 )}
//               </div>
//             </div>
//           )}
//         </div>

//         <div className="col-span-5">
//           <Card className="h-full !shadow-none">
//             <CardHeader className="pt-2">
//               <CardTitle className="text-[15px]">Profile Information</CardTitle>
//             </CardHeader>
//             <CardContent className="h-full">
//               <ProfileInformation employee={employee} />
//             </CardContent>
//           </Card>
//         </div>
//       </div>

//       <div className="mt-3">
//         <Card>
//           <div className="flex px-2 gap-2 w-full border-b items-center justify-start">
//             {[
//               "Attendance Log",
//               "Documents",
//               "Leaves",
//               "Action Plan",
//               "Reports",
//               "Training",
//               // "Payslips",
//               "Expense Request",
//               "Perfomance",
//               "Assets",
//             ].map((e, i) => (
//               <a
//                 key={i}
//                 className={cn(
//                   "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
//                   { "text-primary ": activeTab === e }
//                 )}
//                 onClick={() => setactiveTab(e)}
//               >
//                 {activeTab === e && (
//                   <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
//                 )}
//                 <span className=""> {e}</span>
//               </a>
//             ))}
//           </div>
//           <div>
//             {activeTab === "Attendance Log" && (
//               <EmployeeAttendances employeeId={user.id} />
//             )}
//             {activeTab === "Leaves" && <EmployeeLeaves employeeId={user.id} />}
//             {/* {activeTab === "Payslips" && (
//               <EmployeePayslips employeeId={user.id} />
//             )} */}
//             {activeTab === "Documents" && (
//               <EmployeeDocuments employeeId={user.id} />
//             )}
//             {activeTab === "Expense Request" && (
//               <EmployeePrePayments employeeId={user.id} />
//             )}
//             {activeTab === "Reports" && (
//               <EmployeeReports employeeId={user.id} />
//             )}
//             {
//               activeTab === "Training" && (
//               <EmployeeTrainings employeeId={user.id} />
              
//             )}
//             {activeTab === "Perfomance" && (
//               <EmployeePerfomance employee={user} />
//             )}{" "}
//             {activeTab === "Assets" && <EmployeeAssets employeeId={user?.id} />}
//           </div>
//         </Card>
//       </div>
//     </div>
//   );
// }

// function Reports({ employee }) {
//   return (
//     <div className="">
//       <div className="px-3 py-[6px] max-w-xs border m-4">
//         <span className="text-[13.5px] font-semibold capitalize">
//           Leaves taken vs remaining
//         </span>
//         <div className="p-2">
//           <LeavesTakenVsRemaining employee={employee} />
//         </div>
//       </div>
//     </div>
//   );
// }

// function ProfileInformation({ employee }) {
//   const [uploading, setuploading] = useState(false);

//   const uploadRef = useRef<any>();
//   const { relaodUser } = useAuth();

//   const updateProfile = async (e: any) => {
//     const file = e.target.files[0];
//     setuploading(true);
//     try {
//       await pocketbase.collection("users").update(employee.id, {
//         avatar: file,
//       });
//       setuploading(false);
//       relaodUser();
//     } catch (error) {
//       setuploading(false);
//       toast.error(error.message);
//     }
//   };

//   return (
//     <div className="h-full">
//       <div className="flex mt-1 gap-3 mb-1 items-center">
//         <div className="relative group overflow-hidden rounded-full">
//           <input
//             disabled={uploading}
//             type="file"
//             className="hidden"
//             ref={uploadRef}
//             onChange={updateProfile}
//           />
//           <div
//             className={cn(
//               "absolute z-30 group-hover:opacity-100 transition-all overflow-hidden flex items-center justify-center h-full w-full bg-black bg-opacity-30",
//               {
//                 "opacity-0": !uploading,
//                 "opacity-100": uploading,
//               }
//             )}
//           >
//             <a
//               onClick={() => {
//                 uploadRef.current.click();
//               }}
//               className="h-7 w-7 cursor-pointer flex items-center justify-center bg-white rounded-full"
//             >
//               {uploading ? (
//                 <Loader className="mr-2- h-4 w-4 text-primary animate-spin" />
//               ) : (
//                 <Camera size={14} className="text-slate-600" />
//               )}
//             </a>
//           </div>
//           <Avatar
//             className="!h-10 !w-10 border"
//             path={employee.photo}
//             name={employee.names || "G"}
//           />
//         </div>
//         <div>
//           <div className="flex items-center gap-2">
//             <h4 className="text-[12.5px] capitalize font-semibold text-slate-700">
//               {employee.names}
//             </h4>
//           </div>
//           <p className="text-[12.5px] capitalize mt-1 font-medium text-slate-500">
//             {employee?.role?.name}
//           </p>
//         </div>
//       </div>
//       <div className="grid px-[6px] gap-6 my-2 pt-3 grid-cols-3">
//         {[
//           { key: "First name", value: employee?.names.split(" ")[0] },
//           { key: "Last name", value: employee?.names.split(" ")[1] },
//           { key: "Email", value: employee.email },
//           { key: "Gender", value: employee.gender },
//           {
//             key: "Birth",
//             value: new Date(employee.birth).toLocaleDateString("en-US", {
//               month: "long",
//               day: "2-digit",
//               year: "numeric",
//             }),
//           },
//           { key: "National Id", value: employee.national_id },
//           { key: "Phone", value: employee.phone },
//           { key: "Country", value: employee?.country },
//           {
//             key: "Address",
//             value: employee?.address,
//           },
//           {
//             key: "Salary",
//             value: Number(employee?.salary).toLocaleString("en-US", {
//               style: "currency",
//               currency: "RWF",
//             }),
//           },
//           {
//             key: "Department",
//             value: employee?.department || "N.A",
//           },
//           {
//             key: "Designation",
//             value: employee?.designation || "N.A",
//           },
//           {
//             key: "Joined at",
//             value:
//               new Date(employee?.joined_at).toLocaleDateString("en-US", {
//                 month: "long",
//                 day: "2-digit",
//                 year: "numeric",
//               }) || "N.A",
//           },
//         ].map((e, i) => {
//           return (
//             <div className="flex  items-center gap-4" key={i}>
//               <span className="text-[12.5px] font-medium- capitalize text-slate-500">
//                 {e.key}:
//               </span>
//               <span className="text-[12.5px] truncate font-semibold capitalize text-slate-700">
//                 {e.value}
//               </span>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function CountDown({ offset }) {
//   const stopwatchOffset = new Date();
//   stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);
//   const { seconds, minutes, hours } = useStopwatch({
//     autoStart: true,
//     offsetTimestamp: stopwatchOffset,
//   });
//   return (
//     <>
//       <span>{renderNumberWithLeadingZero(hours)}</span>:
//       <span>{renderNumberWithLeadingZero(minutes)}</span>:
//       <span>{renderNumberWithLeadingZero(seconds)}</span>
//     </>
//   );
// }



//FROM HERE 

// import { useAuth } from "@/context/auth.context";
// import { Camera, Clock } from "react-feather";
// import { useQuery } from "react-query";
// import { useState, useMemo, useRef } from "react";
// import { cn } from "@/utils/cn";
// import { useStopwatch } from "react-timer-hook";
// import pocketbase from "@/lib/pocketbase";
// import { Skeleton } from "@/components/ui/skeleton";
// import Loader from "@/components/icons/Loader";
// import Avatar from "@/components/shared/Avatar";
// import BreadCrumb from "@/components/breadcrumb";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import EmployeeAttendances from "./EmployeeAttendances";
// import EmployeeLeaves from "./EmployeeLeaves";
// import EmployeeAssets from "./EmployeeAssets";
// import EmployeeDocuments from "./EmployeeDocuments";
// import useSettings from "@/hooks/useSettings";
// import { differenceInSeconds } from "date-fns";
// import { toast } from "sonner";
// import { Button } from "@/components/ui/button";
// import { LogIn, LogOut } from "lucide-react";
// import LeavesTakenVsRemaining from "@/components/LeavesTakenVsRemaining";
// import EmployeePrePayments from "./EmployeePrePayments";
// import EmployeePerfomance from "./EmployeePerfomance";
// import EmployeeReports from "./EmployeeReportModel";
// import EmployeeTrainings from "./employeeTrainings";

// // Helper function to convert time string to date
// function timeStringToDate(timeString, date) {
//   const parts = timeString.split(":");
//   const hours = parseInt(parts[0], 10);
//   const minutes = parseInt(parts[1], 10);

//   const currentDate = new Date(date);
//   currentDate.setHours(hours);
//   currentDate.setMinutes(minutes);
//   currentDate.setSeconds(0);
//   currentDate.setMilliseconds(0);

//   return currentDate;
// }

// // Helper function to get the day of the week
// function getDayOfWeek(date) {
//   const days = [
//     "sunday",
//     "monday",
//     "tuesday",
//     "wednesday",
//     "thursday",
//     "friday",
//     "saturday",
//   ];
//   const dayOfWeek = date.getDay();
//   return days[dayOfWeek];
// }

// // Helper function to convert seconds to HH:MM:SS format
// function secondsToHHMMSS(seconds) {
//   const hours = Math.floor(seconds / 3600);
//   const minutes = Math.floor((seconds % 3600) / 60);
//   const remainingSeconds = seconds % 60;

//   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
//     remainingSeconds.toFixed(0)
//   ).padStart(2, "0")}`;
// }

// // // Helper function to render numbers with leading zero
// // function renderNumberWithLeadingZero(number) {
// //   return number < 10 ? `0${number}` : String(number);
// // }

// export default function EmployeePortal() {
//   const { user: employee } = useAuth();

//   // State for managing lunch break
//   const [isOnLunchBreak, setIsOnLunchBreak] = useState(false);
//   const [loadingLunchBreak, setLoadingLunchBreak] = useState(false);

//   // State for loading states
//   const [loadingClockin, setloadingClockin] = useState(false);
//   const [loadingClockOut, setloadingClockOut] = useState(false);

//   // State for active tab
//   const [activeTab, setactiveTab] = useState("Attendance Log");

//   const { settings } = useSettings();

//   // Get greetings based on time of day
//   const getGreetings = () => {
//     const date = new Date();
//     const hours = date.getHours();
//     if (hours < 12) {
//       return "Good Morning";
//     } else if (hours < 18) {
//       return "Good Afternoon";
//     } else {
//       return "Good Evening";
//     }
//   };

//   const employeeId = useMemo(() => employee?.id, [employee]);

//   // Fetch attendance data for the current day
//   async function fetchAttendance() {
//     const date = new Date();
//     let beginTime: any = new Date(date);
//     beginTime.setHours(0, 0, 0, 0);
//     beginTime = beginTime.toISOString().replace("T", " ");

//     let stopTime: any = new Date(date);
//     stopTime.setHours(23, 59, 59, 999);
//     stopTime = stopTime.toISOString().replace("T", " ");

//     const dateQ = `created >= "${beginTime}" && created < "${stopTime}"`;

//     const data = await pocketbase.collection("attendance").getFullList({
//       filter: `employee="${employeeId}" && ${dateQ}`,
//     });

//     return data[0];
//   }

//   const attendanceQuery = useQuery(
//     ["employee-attendance", employeeId],
//     fetchAttendance,
//     {
//       keepPreviousData: true,
//       retry: false,
//       staleTime: Infinity,
//       enabled: Boolean(employeeId),
//     }
//   );

//   // Calculate time offset for stopwatch
//   const getOffest = (clockin_time) => {
//     const now = new Date();
//     return (now.getTime() - new Date(clockin_time).getTime()) / 1000;
//   };

//   // Format 24-hour time to 12-hour format
//   function formatTime(time24) {
//     if (!time24) return undefined;
//     const time = time24.split(":");
//     let hours = parseInt(time[0], 10);
//     const minutes = parseInt(time[1], 10);
//     const ampm = hours >= 12 ? "PM" : "AM";
//     hours = hours % 12;
//     hours = hours ? hours : 12; // Handle midnight (0 hours)
//     return `${hours}:${minutes < 10 ? "0" + minutes : minutes} ${ampm}`;
//   }

//   // Calculate time difference between two times
//   function timeDifference(time1, time2) {
//     if (!time1 || !time2) return undefined;
//     const [hours1, minutes1] = time1.split(":").map(Number);
//     const [hours2, minutes2] = time2.split(":").map(Number);
//     const totalMinutes1 = hours1 * 60 + minutes1;
//     const totalMinutes2 = hours2 * 60 + minutes2;
//     const differenceInMinutes = Math.abs(totalMinutes1 - totalMinutes2);
//     const hoursDifference = Math.floor(differenceInMinutes / 60);
//     const minutesDifference = differenceInMinutes % 60;
//     return `${hoursDifference} hr ${minutesDifference} mins`;
//   }

//   // Handle clock-in
//   const handleClockin = async () => {
//     try {
//       setloadingClockin(true);
//       const currentDate = new Date();
//       const start_time_date = timeStringToDate(settings.work_start_time, currentDate);
//       const clockin_time_date = new Date();

//       start_time_date.setMinutes(
//         start_time_date.getMinutes() + (settings?.early_clockin_mins || 0)
//       );

//       const behaviour = clockin_time_date > start_time_date ? "late" : "early";

//       await pocketbase.collection("attendance").create({
//         employee: employeeId,
//         clockin_time: new Date(),
//         type: "manual",
//         behaviour,
//         date: new Date(),
//         branch: employee.branch,
//       });

//       toast.success("Clock in success");
//       setloadingClockin(false);
//       attendanceQuery.refetch();
//     } catch (error) {
//       setloadingClockin(false);
//       toast.error(error?.response?.data?.message || error?.message || "Failed to clock in");
//     }
//   };

//   // Handle clock-out
//   const handleClockOut = async () => {
//     setloadingClockOut(true);
//     try {
//       await pocketbase.collection("attendance").update(attendanceQuery?.data?.id, {
//         clockout_time: new Date(),
//       });
//       toast.success("Clock out success");
//       attendanceQuery.refetch();
//     } catch (error) {
//       toast.error(error?.response?.data?.message || error?.message);
//     } finally {
//       setloadingClockOut(false);
//     }
//   };

//   // Handle lunch break
//   const handleLunchBreak = async () => {
//     setLoadingLunchBreak(true);
//     try {
//       if (isOnLunchBreak) {
//         await pocketbase.collection("attendance").update(attendanceQuery?.data?.id, {
//           lunch_end_time: new Date(),
//         });
//         toast.success("Lunch break ended");
//       } else {
//         await pocketbase.collection("attendance").update(attendanceQuery?.data?.id, {
//           lunch_start_time: new Date(),
//         });
//         toast.success("Lunch break started");
//       }
//       setIsOnLunchBreak(!isOnLunchBreak);
//       attendanceQuery.refetch();
//     } catch (error) {
//       toast.error(error?.response?.data?.message || error?.message);
//     } finally {
//       setLoadingLunchBreak(false);
//     }
//   };

//   // Check if today is a working day
//   const isWorkingDay = settings?.working_days.includes(getDayOfWeek(new Date()));

//   return (
//     <div className="px-3">
//       <div className="flex items-start justify-between space-y-2">
//         <div className="flex items-start gap-2 flex-col">
//           <h2 className="text-lg font-semibold tracking-tight">
//             {getGreetings()}, {employee.names}
//           </h2>
//           <BreadCrumb items={[{ title: "Employee Portal", link: "/dashboard" }]} />
//         </div>
//       </div>
//       <div className="grid mt-2 grid-cols-7 gap-2">
//         <div className="col-span-2">
//           {(attendanceQuery.status === "loading" || attendanceQuery.isIdle) && (
//             <div className="bg-white px-3 flex-col space-y-4 pt-5 pb-2 border w-full h-full flex items-center justify-center border-slate-200 rounded-[4px]">
//               <Skeleton className="w-[150px] h-3" />
//               <Skeleton className="w-[120px] h-7" />
//               <Skeleton className="w-[190px] h-3" />
//               <div className="flex items-center gap-4 w-full justify-center">
//                 <div className="flex items-center gap-2">
//                   <Skeleton className="w-[40px] h-[40px] rounded-full" />
//                   <div className="flex flex-col gap-3">
//                     <Skeleton className="w-[100px] h-3" />
//                     <Skeleton className="w-[100px] h-2" />
//                   </div>
//                 </div>
//                 <div className="flex items-center gap-2">
//                   <Skeleton className="w-[40px] h-[40px] rounded-full" />
//                   <div className="flex flex-col gap-3">
//                     <Skeleton className="w-[100px] h-3" />
//                     <Skeleton className="w-[100px] h-2" />
//                   </div>
//                 </div>
//               </div>
//               <Skeleton className="w-full h-8 max-w-[310px]" />
//               <Skeleton className="w-[150px] h-3" />
//             </div>
//           )}

//           {attendanceQuery.status === "success" && (
//             <div className="bg-white relative h-full px-3 pt-6 pb-6 border border-slate-200 rounded-md">
//               <div className="flex flex-col justify-center items-center">
//                 <p className="capitalize text-base font-semibold">Today attendance</p>
//                 <h4 className="text-2xl text-slate-800 my-3 font-semibold">
//                   {attendanceQuery.data && !attendanceQuery.data.clockout_time ? (
//                     <CountDown
//                       offset={getOffest(attendanceQuery?.data?.clockin_time)}
//                       lunchStartTime={attendanceQuery?.data?.lunch_start_time}
//                       lunchEndTime={attendanceQuery?.data?.lunch_end_time}
//                     />
//                   ) : attendanceQuery?.data?.clockout_time ? (
//                     secondsToHHMMSS(
//                       differenceInSeconds(
//                         attendanceQuery?.data?.clockout_time,
//                         attendanceQuery?.data?.clockin_time
//                       )
//                     )
//                   ) : (
//                     "00:00:00"
//                   )}
//                 </h4>
//                 <span className="text-[13px] text-slate-500 font-medium-">
//                   {new Date().toLocaleDateString("en-US", {
//                     weekday: "short",
//                     year: "numeric",
//                     month: "short",
//                     day: "numeric",
//                     minute: "numeric",
//                     hour: "numeric",
//                   })}
//                 </span>
//               </div>
//               <div className="flex justify-center my-5 items-center gap-2">
//                 <div className="flex items-center gap-3">
//                   <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
//                     <Clock size={16} className="text-slate-600" />
//                   </div>
//                   <div>
//                     <p className="text-[13px] font-semibold text-slate-700">
//                       {attendanceQuery.data
//                         ? new Date(attendanceQuery.data.clockin_time).toLocaleTimeString("en-US", {
//                             hour: "2-digit",
//                             minute: "2-digit",
//                             hour12: true,
//                           })
//                         : formatTime(settings?.work_start_time) || "00:00"}
//                     </p>
//                     <span className="text-[12.5px] capitalize font-medium text-slate-500">
//                       Clock in
//                     </span>
//                   </div>
//                 </div>
//                 <div className="px-3">
//                   <svg
//                     viewBox="0 0 24 24"
//                     id="right-left-arrow"
//                     height={20}
//                     width={20}
//                     data-name="Flat Line"
//                     xmlns="http://www.w3.org/2000/svg"
//                     className="text-slate-600 fill-current stroke-current"
//                   >
//                     <g id="SVGRepo_bgCarrier" strokeWidth={0} />
//                     <g
//                       id="SVGRepo_tracerCarrier"
//                       strokeLinecap="round"
//                       strokeLinejoin="round"
//                     />
//                     <g id="SVGRepo_iconCarrier">
//                       <polyline
//                         id="primary"
//                         points="7 13 4 16 7 19"
//                         style={{
//                           strokeLinecap: "round",
//                           strokeLinejoin: "round",
//                           strokeWidth: 2,
//                         }}
//                       />
//                       <path
//                         id="primary-2"
//                         data-name="primary"
//                         d="M20,16H4M4,8H20"
//                         style={{
//                           strokeLinecap: "round",
//                           strokeLinejoin: "round",
//                           strokeWidth: 2,
//                         }}
//                       />
//                       <polyline
//                         id="primary-3"
//                         data-name="primary"
//                         points="17 11 20 8 17 5"
//                         style={{
//                           strokeLinecap: "round",
//                           strokeLinejoin: "round",
//                           strokeWidth: 2,
//                         }}
//                       />
//                     </g>
//                   </svg>
//                 </div>
//                 <div className="flex items-center gap-3">
//                   <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
//                     <Clock className="text-slate-600" size={16} />
//                   </div>
//                   <div>
//                     <h4 className="text-[13px] font-semibold text-slate-700">
//                       {attendanceQuery.data
//                         ? attendanceQuery.data.clockout_time
//                           ? new Date(attendanceQuery.data.clockout_time).toLocaleTimeString("en-US", {
//                               hour: "2-digit",
//                               minute: "2-digit",
//                               hour12: true,
//                             })
//                           : "---"
//                         : formatTime(settings?.work_end_time) || "00:00"}
//                     </h4>
//                     <span className="text-[12.5px] capitalize font-medium text-slate-500">
//                       Clock out
//                     </span>
//                   </div>
//                 </div>
//               </div>
//               <div className="flex flex-col items-center gap-2 px-7 my-2">
//                 <Button
//                   disabled={
//                     attendanceQuery.data?.clockout_time ||
//                     !isWorkingDay ||
//                     loadingClockin ||
//                     loadingClockOut
//                   }
//                   className="w-full"
//                   onClick={handleClockin}
//                 >
//                   {(loadingClockin || loadingClockOut) && (
//                     <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
//                   )}
//                   {attendanceQuery.data ? "Clock out" : "Clock in"}
//                   {attendanceQuery.data ? (
//                     <LogOut size={16} className="ml-2" />
//                   ) : (
//                     <LogIn size={16} className="ml-2" />
//                   )}
//                 </Button>
//                 <Button
//                   disabled={
//                     !attendanceQuery.data ||
//                     attendanceQuery.data?.clockout_time ||
//                     !isWorkingDay ||
//                     loadingLunchBreak
//                   }
//                   className="w-full"
//                   onClick={handleLunchBreak}
//                 >
//                   {loadingLunchBreak && (
//                     <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
//                   )}
//                   {isOnLunchBreak ? "End Lunch Break" : "Start Lunch Break"}
//                 </Button>
//                 <div className="flex font-medium- text-slate-500 text-[13px] items-center gap-2">
//                   <span>Total working hours:</span>
//                   <span className="text-red-500">
//                     {timeDifference(settings?.work_end_time, settings?.work_start_time)}
//                   </span>
//                 </div>
//                 {attendanceQuery?.data && (
//                   <div className="flex font-medium text-slate-500 text-[13px] items-center gap-2">
//                     <span>Behaviour:</span>
//                     <span className="text-primary capitalize">
//                       {attendanceQuery.data.behaviour}
//                     </span>
//                   </div>
//                 )}
//               </div>
//             </div>
//           )}
//         </div>

//         <div className="col-span-5">
//           <Card className="h-full !shadow-none">
//             <CardHeader className="pt-2">
//               <CardTitle className="text-[15px]">Profile Information</CardTitle>
//             </CardHeader>
//             <CardContent className="h-full">
//               <ProfileInformation employee={employee} />
//             </CardContent>
//           </Card>
//         </div>
//       </div>

//       <div className="mt-3">
//         <Card>
//           <div className="flex px-2 gap-2 w-full border-b items-center justify-start">
//             {[
//               "Attendance Log",
//               "Documents",
//               "Leaves",
//               "Action Plan",
//               "Reports",
//               "Training",
//               "Expense Request",
//               "Perfomance",
//               "Assets",
//             ].map((e, i) => (
//               <a
//                 key={i}
//                 className={cn(
//                   "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3 font-medium",
//                   { "text-primary ": activeTab === e }
//                 )}
//                 onClick={() => setactiveTab(e)}
//               >
//                 {activeTab === e && (
//                   <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
//                 )}
//                 <span>{e}</span>
//               </a>
//             ))}
//           </div>
//           <div>
//             {activeTab === "Attendance Log" && (
//               <EmployeeAttendances employeeId={employee.id} />
//             )}
//             {activeTab === "Leaves" && <EmployeeLeaves employeeId={employee.id} />}
//             {activeTab === "Documents" && (
//               <EmployeeDocuments employeeId={employee.id} />
//             )}
//             {activeTab === "Expense Request" && (
//               <EmployeePrePayments employeeId={employee.id} />
//             )}
//             {activeTab === "Reports" && (
//               <EmployeeReports employeeId={employee.id} />
//             )}
//             {activeTab === "Training" && (
//               <EmployeeTrainings employeeId={employee.id} />
//             )}
//             {activeTab === "Perfomance" && (
//               <EmployeePerfomance employee={employee} />
//             )}
//             {activeTab === "Assets" && <EmployeeAssets employeeId={employee.id} />}
//           </div>
//         </Card>
//       </div>
//     </div>
//   );
// }

// // Helper function to convert seconds to HH:MM:SS format
// // function secondsToHHMMSS(seconds) {
// //   const hours = Math.floor(seconds / 3600);
// //   const minutes = Math.floor((seconds % 3600) / 60);
// //   const remainingSeconds = seconds % 60;

// //   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
// //     remainingSeconds.toFixed(0)
// //   ).padStart(2, "0")}`;
// // }

// // Helper function to render numbers with leading zero
// function renderNumberWithLeadingZero(number) {
//   return number < 10 ? `0${number}` : String(number);
// }

// // CountDown component to display the stopwatch
// function CountDown({ offset, lunchStartTime, lunchEndTime }) {
//   const stopwatchOffset = new Date();
//   stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);

//   const { seconds, minutes, hours } = useStopwatch({
//     autoStart: true,
//     offsetTimestamp: stopwatchOffset,
//   });

//   // Calculate lunch break duration in seconds
//   const lunchBreakDuration =
//     lunchStartTime && lunchEndTime
//       ? differenceInSeconds(new Date(lunchEndTime), new Date(lunchStartTime))
//       : 0;

//   // Adjust total seconds by subtracting lunch break duration
//   const totalSeconds = hours * 3600 + minutes * 60 + seconds - lunchBreakDuration;

//   const adjustedHours = Math.floor(totalSeconds / 3600);
//   const adjustedMinutes = Math.floor((totalSeconds % 3600) / 60);
//   const adjustedSeconds = totalSeconds % 60;

//   return (
//     <>
//       <span>{renderNumberWithLeadingZero(adjustedHours)}</span>:
//       <span>{renderNumberWithLeadingZero(adjustedMinutes)}</span>:
//       <span>{renderNumberWithLeadingZero(adjustedSeconds)}</span>
//     </>
//   );
// }

// // ProfileInformation component to display employee details
// function ProfileInformation({ employee }) {
//   const [uploading, setUploading] = useState(false);
//   const uploadRef = useRef<any>();
//   const { reloadUser } = useAuth();

//   const updateProfile = async (e: any) => {
//     const file = e.target.files[0];
//     setUploading(true);
//     try {
//       await pocketbase.collection("users").update(employee.id, {
//         avatar: file,
//       });
//       setUploading(false);
//       reloadUser();
//     } catch (error) {
//       setUploading(false);
//       toast.error(error.message);
//     }
//   };

//   return (
//     <div className="h-full">
//       <div className="flex mt-1 gap-3 mb-1 items-center">
//         <div className="relative group overflow-hidden rounded-full">
//           <input
//             disabled={uploading}
//             type="file"
//             className="hidden"
//             ref={uploadRef}
//             onChange={updateProfile}
//           />
//           <div
//             className={cn(
//               "absolute z-30 group-hover:opacity-100 transition-all overflow-hidden flex items-center justify-center h-full w-full bg-black bg-opacity-30",
//               {
//                 "opacity-0": !uploading,
//                 "opacity-100": uploading,
//               }
//             )}
//           >
//             <a
//               onClick={() => uploadRef.current.click()}
//               className="h-7 w-7 cursor-pointer flex items-center justify-center bg-white rounded-full"
//             >
//               {uploading ? (
//                 <Loader className="h-4 w-4 text-primary animate-spin" />
//               ) : (
//                 <Camera size={14} className="text-slate-600" />
//               )}
//             </a>
//           </div>
//           <Avatar
//             className="!h-10 !w-10 border"
//             path={employee.photo}
//             name={employee.names || "G"}
//           />
//         </div>
//         <div>
//           <div className="flex items-center gap-2">
//             <h4 className="text-[12.5px] capitalize font-semibold text-slate-700">
//               {employee.names}
//             </h4>
//           </div>
//           <p className="text-[12.5px] capitalize mt-1 font-medium text-slate-500">
//             {employee?.role?.name}
//           </p>
//         </div>
//       </div>
//       <div className="grid px-[6px] gap-6 my-2 pt-3 grid-cols-3">
//         {[
//           { key: "First name", value: employee?.names.split(" ")[0] },
//           { key: "Last name", value: employee?.names.split(" ")[1] },
//           { key: "Email", value: employee.email },
//           { key: "Gender", value: employee.gender },
//           {
//             key: "Birth",
//             value: new Date(employee.birth).toLocaleDateString("en-US", {
//               month: "long",
//               day: "2-digit",
//               year: "numeric",
//             }),
//           },
//           { key: "National Id", value: employee.national_id },
//           { key: "Phone", value: employee.phone },
//           { key: "Country", value: employee?.country },
//           { key: "Address", value: employee?.address },
//           {
//             key: "Salary",
//             value: Number(employee?.salary).toLocaleString("en-US", {
//               style: "currency",
//               currency: "RWF",
//             }),
//           },
//           { key: "Department", value: employee?.department || "N.A" },
//           { key: "Designation", value: employee?.designation || "N.A" },
//           {
//             key: "Joined at",
//             value:
//               new Date(employee?.joined_at).toLocaleDateString("en-US", {
//                 month: "long",
//                 day: "2-digit",
//                 year: "numeric",
//               }) || "N.A",
//           },
//         ].map((e, i) => (
//           <div className="flex items-center gap-4" key={i}>
//             <span className="text-[12.5px] font-medium- capitalize text-slate-500">
//               {e.key}:
//             </span>
//             <span className="text-[12.5px] truncate font-semibold capitalize text-slate-700">
//               {e.value}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/context/auth.context";
import { Camera, Clock, LogIn, LogOut } from "lucide-react";
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
// import EmployeeReports from "./EmployeeReportModel";
// import EmployeeTrainings from "./employeeTrainings";
import useSettings from "@/hooks/useSettings";
import EmployeeReports from "./EmployeeReportModel";
import ActionPlanss from "./ActionPlansparUser";

interface Location {
  latitude: number;
  longitude: number;
}

interface FormattedLocation {
  mainLocation: string;
  fullAddress?: string;
}

/**
 * Formats the geocoding result into a structured location object.
 */
const formatLocationProfessionally = (geocodingResult: any): FormattedLocation => {
  if (!geocodingResult?.results?.[0]) {
    return { mainLocation: "Location unavailable" };
  }

  const addressComponents = geocodingResult.results[0].address_components;
  const formattedAddress = geocodingResult.results[0].formatted_address;

  const extractComponent = (types: string[]) =>
    addressComponents.find((c: any) => types.some((type) => c.types.includes(type)))?.long_name;

  const mainLocation =
    extractComponent(["establishment", "point_of_interest"]) ||
    extractComponent(["premise", "subpremise"]) ||
    `${extractComponent(["route"]) || ""}, ${extractComponent(["sublocality", "locality"]) || ""}`.trim() ||
    extractComponent(["administrative_area_level_1"]) ||
    formattedAddress.split(",")[0];

  return {
    mainLocation,
    fullAddress: formattedAddress,
  };
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
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(Math.floor(remainingSeconds)).padStart(2, "0")}`;
};

const format12HourTime = (time24: string): string => {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":").map(Number);
  if (isNaN(hours)) return "";
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};

const calculateTimeDifference = (time1: string, time2: string): string => {
  if (!time1 || !time2) return "";
  const [h1, m1] = time1.split(":").map(Number);
  const [h2, m2] = time2.split(":").map(Number);
  if (isNaN(h1)) return "";
  const diffMinutes = Math.abs((h1 * 60 + m1) - (h2 * 60 + m2));
  return `${Math.floor(diffMinutes / 60)}hr ${diffMinutes % 60}min`;
};

const CountDown = ({ offset, lunchStartTime, lunchEndTime }: { offset: number; lunchStartTime: string; lunchEndTime: string }) => {
  const stopwatchOffset = new Date();
  stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);

  const { seconds, minutes, hours } = useStopwatch({
    autoStart: true,
    offsetTimestamp: stopwatchOffset,
  });

  const lunchBreakDuration = lunchStartTime && lunchEndTime
    ? differenceInSeconds(new Date(lunchEndTime), new Date(lunchStartTime))
    : 0;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds - lunchBreakDuration;
  const adjustedHours = Math.floor(totalSeconds / 3600);
  const adjustedMinutes = Math.floor((totalSeconds % 3600) / 60);
  const adjustedSeconds = Math.floor(totalSeconds % 60);

  return (
    <div className="flex items-center gap-1">
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

  const profileFields = [
    { key: "First name", value: employee?.names.split(" ")[0] },
    { key: "Last name", value: employee?.names.split(" ")[1] },
    { key: "Email", value: employee.email },
    { key: "Gender", value: employee.gender },
    { key: "Birth", value: new Date(employee.birth).toLocaleDateString() },
    { key: "National Id", value: employee.national_id },
    { key: "Phone", value: employee.phone },
    { key: "Country", value: employee?.country },
    { key: "Address", value: employee?.address },
    { key: "Salary", value: new Intl.NumberFormat('en-RW', { 
      style: 'currency', 
      currency: 'RWF' 
    }).format(employee?.salary) },
    { key: "Department", value: employee?.department || "N/A" },
    { key: "Designation", value: employee?.designation || "N/A" },
    { key: "Joined at", value: new Date(employee?.joined_at).toLocaleDateString() }
  ];

  return (
    <div className="h-full">
      <div className="flex mt-1 gap-3 mb-1 items-center">
        <div className="relative group overflow-hidden rounded-full">
          <input
            type="file"
            className="hidden"
            ref={uploadRef}
            onChange={handleProfileUpdate}
            accept="image/*"
            disabled={uploading}
          />
          <div className={cn(
            "absolute z-30 group-hover:opacity-100 transition-all overflow-hidden flex items-center justify-center h-full w-full bg-black bg-opacity-30",
            { "opacity-0": !uploading, "opacity-100": uploading }
          )}>
            <button
              onClick={() => uploadRef.current?.click()}
              className="h-7 w-7 cursor-pointer flex items-center justify-center bg-white rounded-full"
            >
              {uploading ? (
                <Loader className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Camera size={14} className="text-slate-600" />
              )}
            </button>
          </div>
          <Avatar
            className="h-10 w-10 border"
            path={employee.photo}
            name={employee.names || "U"}
          />
        </div>
        <div>
          <h4 className="text-sm capitalize font-semibold text-slate-700">
            {employee.names}
          </h4>
          <p className="text-xs capitalize mt-1 font-medium text-slate-500">
            {employee?.role?.name}
          </p>
        </div>
      </div>

      <div className="grid px-2 gap-6 my-2 pt-3 grid-cols-3">
        {profileFields.map((field, index) => (
          <div key={index} className="flex items-center gap-4">
            <span className="text-xs font-medium capitalize text-slate-500">
              {field.key}:
            </span>
            <span className="text-xs truncate font-semibold capitalize text-slate-700">
              {field.value}
            </span>
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
    lunchBreak: false
  });
  const [activeTab, setActiveTab] = useState("Attendance Log");
  const { settings } = useSettings();
  const employeeId = useMemo(() => employee?.id, [employee]);

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(0, 0, 0, 0); // Set to midnight
    nextDay.setDate(now.getDate() + 1); // Move to the next day
  
    // Calculate the time difference in milliseconds until the next day
    const timeUntilNextDay = nextDay.getTime() - now.getTime();
    console.log(`Time until next day: ${timeUntilNextDay}ms`);
  
    // Set a timeout to reset `lunchBreakEnded` at midnight
    const timeout = setTimeout(() => {
      console.log("Resetting lunchBreakEnded at midnight");
      setLunchBreakEnded(false);
    }, timeUntilNextDay);
  
    // Clear the timeout when the component unmounts or when dependencies change
    return () => {
      console.log("Clearing timeout");
      clearTimeout(timeout);
    };
  }, []);

/**
 * Fetches the user's current location using the browser's Geolocation API.
 */
const getCurrentLocation = (): Promise<Location> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation is not supported by your browser"));
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      (error) => {
        console.error("Error getting location:", error);
        reject(error);
      }
    );
  });
};
/**
 * Fetches the location name using the Google Maps Geocoding API.
 */
const getLocationDetails = async (latitude: number, longitude: number): Promise<string> => {
  const NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="AIzaSyDmgrmJuvPpY95DES70wZfBFJMh4E-6xcc"
  const apiKey = NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  console.log("Google Maps API Key:", apiKey); // Debugging
  if (!apiKey) {
    console.error("Google Maps API key is missing");
    return "Location unavailable (API key missing)";
  }

  try {
    const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=en`;
    const response = await fetch(geocodingUrl);
    console.log("Geocoding API Request:", geocodingUrl); // Debugging

    // Check if the response was successful
    if (!response.ok) {
      console.error(`Geocoding API error: ${response.statusText}`);
      return "Location unavailable";
    }

    const data = await response.json();
    console.log("Geocoding API Response:", data); // Debugging

    if (data.status !== "OK") {
      console.error(`Geocoding API error: ${data.status}`);
      return "Location unavailable";
    }

    // Assuming the formatLocationProfessionally function formats the data correctly
    const { mainLocation, fullAddress } = formatLocationProfessionally(data);

    return mainLocation || fullAddress || "Location unavailable";
  } catch (error) {
    console.error("Error fetching location:", error);
    return "Location unavailable";
  }
};

/**
 * Example function to format the location professionally from the API response.
 * This is just a placeholder; you'll need to implement this function based on your needs.
 */
const formatLocationProfessionally = (data: any): { mainLocation: string, fullAddress: string } => {
  // Example logic: extracting the first formatted address from the API response
  const formattedAddress = data.results[0]?.formatted_address || "";
  return { mainLocation: formattedAddress, fullAddress: formattedAddress };
};



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

  const attendanceQuery = useQuery(
    ["employee-attendance", employeeId],
    fetchAttendance,
    {
      enabled: Boolean(employeeId),
      staleTime: Infinity,
      keepPreviousData: true,
    }
  );

  const canClockIn = () => {
    const now = new Date();
    const startTime = timeStringToDate(settings.work_start_time, now);
    if (!startTime) return false;
  
    const earlyWindow = new Date(startTime);
    earlyWindow.setMinutes(startTime.getMinutes() - (settings?.early_clockin_mins || 0));
    return now >= earlyWindow;
  };

  const canTakeLunchBreak = () => {
    if (!attendanceQuery.data || !attendanceQuery.data.clockin_time || attendanceQuery.data.clockout_time) {
      console.log("Lunch break not allowed: No attendance data, no clock-in, or already clocked out");
      return false;
    }
  
    const now = new Date();
    const lunchStart = timeStringToDate(settings.lunch_start_time || "12:00", now);
    const lunchEnd = timeStringToDate(settings.lunch_end_time || "14:00", now);
  
    const canTakeBreak = lunchStart && lunchEnd && now >= lunchStart && now <= lunchEnd;
    console.log(`Lunch break allowed: ${canTakeBreak}`);
    return canTakeBreak;
  };
  const handleClockIn = async () => {
    if (!canClockIn()) {
      toast.error("Clock-in is not allowed at this time");
      return;
    }
  
    // Prevent multiple clock-ins in a single day
    if (attendanceQuery.data?.clockin_time) {
      toast.error("You have already clocked in today");
      return;
    }
  
    setLoadingStates((prev) => ({ ...prev, clockin: true }));
    let locationName = "Location unavailable";
  
    try {
      console.log("Fetching current location...");
      const location = await getCurrentLocation();
  
      if (!location || !location.latitude || !location.longitude) {
        throw new Error("Failed to retrieve user coordinates");
      }
  
      console.log("Fetching location details for:", location);
      locationName = await getLocationDetails(location.latitude, location.longitude);
      console.log("Resolved Location Name:", locationName);
  
      // If location fetching failed, retry once
      if (!locationName || locationName === "Location unavailable") {
        console.warn("Failed to resolve real location name, retrying...");
        locationName = await getLocationDetails(location.latitude, location.longitude);
      }
  
      console.log("Resolved Location Name:", locationName);
  
      const now = new Date();
      const startTime = timeStringToDate(settings.work_start_time, now);
      const behaviour = now > startTime ? "late" : "early";
  
      console.log("Saving clock-in data to database...");
      const response = await pocketbase.collection("attendance").create({
        employee: employeeId,
        clockin_time: now,
        type: "manual",
        behaviour,
        date: now,
        branch: employee.branch,
        clockin_location: locationName, // ✅ This ensures real location name is saved
      });
  
      console.log("Clock-in saved:", response);
      toast.success("Clock-in successful");
  
      await attendanceQuery.refetch(); // Ensure UI updates
    } catch (error) {
      console.error("Clock-in error:", error);
      toast.error("Failed to clock in. Please try again.");
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
    let locationName = "Location unavailable";
  
    try {
      const location = await getCurrentLocation();
      locationName = await getLocationDetails(location.latitude, location.longitude);
  
      await pocketbase.collection("attendance").update(attendanceQuery.data.id, {
        clockout_time: new Date(),
        clockout_location: locationName,
      });
  
      toast.success("Clock-out successful");
      attendanceQuery.refetch();
    } catch (error) {
      console.error("Clock-out error:", error);
      toast.error("Failed to clock out. Please try again.");
    } finally {
      setLoadingStates((prev) => ({ ...prev, clockout: false }));
    }
  };
  const handleLunchBreak = async () => {
    if (!canTakeLunchBreak() || !attendanceQuery.data?.clockin_time) {
      toast.error("Lunch break is not allowed at this time or you have not clocked in");
      return;
    }
  
    setLoadingStates(prev => ({ ...prev, lunchBreak: true }));
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
    } catch (error) {
      toast.error(error?.response?.message || "Failed to update lunch break");
    } finally {
      setLoadingStates(prev => ({ ...prev, lunchBreak: false }));
    }
  };

  const isLunchBreakDisabled =
  !attendanceQuery.data?.clockin_time || // User has not clocked in
  Boolean(attendanceQuery.data?.clockout_time) || // User has already clocked out
  lunchBreakEnded || // Lunch break has ended for the day
  !canTakeLunchBreak(); // Lunch break is not allowed at this time

// Reset lunchBreakEnded at the start of a new day
useEffect(() => {
const now = new Date();
const nextDay = new Date(now);
nextDay.setHours(0, 0, 0, 0);
nextDay.setDate(now.getDate() + 1);
const timeout = setTimeout(() => {
  setLunchBreakEnded(false);
}, nextDay.getTime() - now.getTime());

return () => clearTimeout(timeout);
}, []);

  const isWorkingDay = settings?.working_days?.includes(getDayOfWeek(new Date()));

  const tabs = [
    "Attendance Log",
    "Documents",
    "Leaves",
    "Action Plans",
    "Reports",
    // "Training",
    "Expense Request",
    "Performance",
    "Assets"
  ];

  return (
    <div className="px-3">
      <div className="flex items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            {getGreeting()}, {employee.names}
          </h2>
          <BreadCrumb items={[{ title: "Employee Portal", link: "/dashboard" }]} />
        </div>
      </div>

      <div className="grid mt-2 grid-cols-7 gap-2">
        <div className="col-span-2">
          {(attendanceQuery.status === "loading" || attendanceQuery.isIdle) ? (
            <Card className="p-4">
              <div className="space-y-4">
                <Skeleton className="w-32 h-3" />
                <Skeleton className="w-24 h-6" />
                <Skeleton className="w-40 h-3" />
                <div className="flex justify-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2"><Skeleton className="w-24 h-3" />
                    <Skeleton className="w-20 h-2" />
                  </div>
                </div>
                <Skeleton className="w-full h-8" />
                <Skeleton className="w-32 h-3" />
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex flex-col items-center">
                <h3 className="font-semibold text-base">Today's Attendance</h3>
                <div className="text-2xl font-semibold my-3">
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
                <span className="text-sm text-slate-500">
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

              <div className="flex items-center gap-3">
  <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
    <Clock size={16} className="text-slate-600" />
  </div>
  <div>
    <p className="text-sm font-semibold">
      {attendanceQuery.data
        ? new Date(attendanceQuery.data.clockin_time).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        : format12HourTime(settings?.work_start_time)}
    </p>
    <span className="text-xs text-slate-500">
      {attendanceQuery.data?.clockin_location || "Location not available"}
    </span>
  </div>
</div>

<div className="flex items-center gap-3">
  <div className="border border-slate-200 h-10 w-10 flex items-center justify-center rounded-full">
    <Clock size={16} className="text-slate-600" />
  </div>
  <div>
    <p className="text-sm font-semibold">
      {attendanceQuery.data?.clockout_time
        ? new Date(attendanceQuery.data.clockout_time).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        : format12HourTime(settings?.work_end_time)}
    </p>
    <span className="text-xs text-slate-500">
      {attendanceQuery.data?.clockout_location || "Location not available"}
    </span>
  </div>
</div>
              <div className="space-y-2">
                {!attendanceQuery.data ? (
                  <Button
                    disabled={!isWorkingDay || loadingStates.clockin}
                    className="w-full"
                    onClick={handleClockIn}
                  >
                    {loadingStates.clockin && (
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Clock in
                    <LogIn size={16} className="ml-2" />
                  </Button>
                ) : (
                  <Button
                    disabled={Boolean(attendanceQuery.data?.clockout_time) || loadingStates.clockout}
                    className="w-full"
                    onClick={handleClockOut}
                  >
                    {loadingStates.clockout && (
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Clock out
                    <LogOut size={16} className="ml-2" />
                  </Button>
                )}

                <Button
                  disabled={isLunchBreakDisabled || loadingStates.lunchBreak}
                  className="w-full"
                  onClick={handleLunchBreak}
                >
                  {loadingStates.lunchBreak && (
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isOnLunchBreak ? "End Lunch Break" : "Start Lunch Break"}
                </Button>

                <div className="text-center text-sm text-slate-500">
                  <div>Working hours: {calculateTimeDifference(settings?.work_start_time, settings?.work_end_time)}</div>
                  {attendanceQuery.data && (
                    <div className="mt-1">
                      Status:{" "}
                      <span className={cn("capitalize", {
                        "text-green-500": attendanceQuery.data.behaviour === "early",
                        "text-red-500": attendanceQuery.data.behaviour === "late"
                      })}>
                        {attendanceQuery.data.behaviour}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="col-span-5">
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

      <Card className="mt-4">
        <div className="flex border-b">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={cn(
                "px-6 py-3 text-sm font-medium relative",
                activeTab === tab
                  ? "text-primary"
                  : "text-slate-700 hover:text-slate-900"
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
          {activeTab === "Attendance Log" && <EmployeeAttendances employeeId={employee.id} />}
          {activeTab === "Documents" && <EmployeeDocuments employeeId={employee.id} />}
          {activeTab === "Leaves" && <EmployeeLeaves employeeId={employee.id} />}
          {activeTab === "Reports" && <EmployeeReports employeeId={employee.id} />}
          {/* {activeTab === "Training" && <EmployeeTrainings employeeId={employee.id} />} */}
          {activeTab === "Expense Request" && <EmployeePrePayments employeeId={employee.id} />}
          {activeTab === "Performance" && <EmployeePerfomance employee={employee} />}
          {activeTab === "Assets" && <EmployeeAssets employeeId={employee.id} />}
          {activeTab === "Action Plans" && <ActionPlanss employeeId={employee.id} />}
        </div>
      </Card>
    </div>
  );
};
export default EmployeePortal;
