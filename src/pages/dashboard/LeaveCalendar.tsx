// import { Calendar, momentLocalizer } from "react-big-calendar"
// import moment from "moment"
// import { LeaveRequest } from "@/types/leave"

// // Import the CSS for react-big-calendar
// import "react-big-calendar/lib/css/react-big-calendar.css"

// // Set up the localizer for react-big-calendar
// const localizer = momentLocalizer(moment)

// interface LeaveCalendarProps {
//   leaveRequests: LeaveRequest[]
// }

// export function LeaveCalendar({ leaveRequests }: LeaveCalendarProps) {
//   const events = leaveRequests.map((request) => ({
//     title: `${request.employeeName} - ${request.status}`,
//     start: new Date(request.startDate),
//     end: new Date(request.endDate),
//     allDay: true,
//     resource: request,
//   }))

//   return (
//     <div className="h-[600px]">
//       <Calendar
//         localizer={localizer}
//         events={events}
//         startAccessor="start"
//         endAccessor="end"
//         style={{ height: "100%" }}
//       />
//     </div>
//   )
// }

