import { LeaveRequest, LeaveStatus } from "@/types/leave"
import { formatDate, calculateLeaveDuration } from  "@/utils/dateUtils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner";

interface HRDashboardProps {
  leaveRequests: LeaveRequest[]
  onUpdateStatus: (id: string, status: LeaveStatus) => void
}

export function HRDashboard({ leaveRequests, onUpdateStatus }: HRDashboardProps) {


  const handleStatusUpdate = (id: string, status: LeaveStatus) => {
    onUpdateStatus(id, status)
    toast(
 "The leave request status has been updated successfully.",
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Leave Requests Dashboard</h2>
      <Table>
        <TableCaption>A list of all leave requests.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaveRequests.map((request: LeaveRequest) => (
            <TableRow key={request.id}>
              <TableCell>{request.employeeName}</TableCell>
              <TableCell>{formatDate(request.startDate)}</TableCell>
              <TableCell>{formatDate(request.endDate)}</TableCell>
              <TableCell>{calculateLeaveDuration(request.startDate, request.endDate)} days</TableCell>
              <TableCell>{request.reason}</TableCell>
              <TableCell>{request.status}</TableCell>
              <TableCell>
                {request.status === "pending" && (
                  <div className="space-x-2">
                    <Button
                      onClick={() => handleStatusUpdate(request.id, "approved")}
                      variant="outline"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleStatusUpdate(request.id, "rejected")}
                      variant="outline"
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

