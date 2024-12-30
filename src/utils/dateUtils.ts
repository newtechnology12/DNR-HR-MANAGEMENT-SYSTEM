import { differenceInDays, format, parse } from "date-fns"

export const formatDate = (dateString: string): string => {
  const date = parse(dateString, "yyyy-MM-dd", new Date())
  return format(date, "LLL dd, yyyy")
}

export const calculateLeaveDuration = (startDate: string, endDate: string): number => {
  const start = parse(startDate, "yyyy-MM-dd", new Date())
  const end = parse(endDate, "yyyy-MM-dd", new Date())
  return differenceInDays(end, start) + 1
}

