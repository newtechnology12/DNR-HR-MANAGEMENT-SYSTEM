export type LeaveStatus = "pending" | "approved" | "rejected"

export interface LeaveRequest {
  id: string
  employeeName: string
  startDate: string
  endDate: string
  reason: string
  status: LeaveStatus
}

export interface LeaveFormData {
  startDate: string
  endDate: string
  reason: string
}

