"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Settings, MessageCircle, Clock, Plus } from 'lucide-react'

interface TimeEntry {
  id: string
  project: string
  task: string
  time: { [key: string]: string }
  status?: string
  statusColor?: string
}

export default function Component() {
  const [currentWeek] = useState(generateWeekDays())
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([
    {
      id: "A",
      project: "AGR - S00076 - Sales Order",
      task: "Furniture Delivery",
      time: { Mon: "2:00", Thu: "2:00" },
      status: "+87:00",
      statusColor: "text-green-500",
    },
    {
      id: "B",
      project: "After-Sales Services",
      task: "S00076 - Customer Care (Prepaid Hours)",
      time: { Mon: "0:30" },
      status: "+01:30",
      statusColor: "text-green-500",
    },
    {
      id: "C",
      project: "Research & Development",
      task: "Product improvements",
      time: { Mon: "2:45" },
      status: "+16:30",
      statusColor: "text-green-500",
    },
  ])

  function generateWeekDays() {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]
    const today = new Date()
    const week = []
    
    for (let i = 0; i < 6; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - today.getDay() + i)
      week.push({
        day: days[i],
        date: date.getDate(),
        month: date.toLocaleString('default', { month: 'short' }),
      })
    }
    
    return week
  }

  function handleTimeChange(entryId: string, day: string, value: string) {
    setTimeEntries((prevEntries) =>
      prevEntries.map((entry) =>
        entry.id === entryId
          ? { ...entry, time: { ...entry.time, [day]: value } }
          : entry
      )
    )
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto p-4">
      <div className="flex items-center space-x-8 mb-6">
        <h1 className="text-2xl font-semibold">Timesheets</h1>
        <nav className="flex space-x-4">
          <Button variant="ghost">Timesheets</Button>
          <Button variant="ghost">To Validate</Button>
          <Button variant="ghost">Reporting</Button>
          <Button variant="ghost">Configuration</Button>
        </nav>
        <div className="ml-auto flex items-center space-x-4">
          <Badge variant="secondary" className="gap-1">
            <MessageCircle className="h-4 w-4" />
            <span>7</span>
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-4 w-4" />
            <span>31</span>
          </Badge>
        </div>
      </div>

      <div className="flex items-center space-x-4 mb-6">
        <h2 className="text-lg font-medium flex items-center gap-2">
          My Timesheets
          <Settings className="h-4 w-4" />
        </h2>
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-8" />
        </div>
      </div>

      <div className="mb-6">
        <Button className="gap-2" variant="default">
          START
          <kbd className="px-2 py-1 text-xs bg-primary-foreground rounded">Enter</kbd>
        </Button>
        <div className="text-sm text-muted-foreground mt-1">
          Press Shift + [A] to add 15 min
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">ID</TableHead>
            <TableHead className="w-[300px]">Project & Task</TableHead>
            {currentWeek.map((day) => (
              <TableHead key={day.day} className="text-center">
                {day.day},<br />
                {day.month} {day.date}
              </TableHead>
            ))}
            <TableHead className="text-center">Hours</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {timeEntries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{entry.id}</TableCell>
              <TableCell>
                <div className="grid gap-1">
                  <div className="font-medium flex items-center gap-2">
                    {entry.project}
                    {entry.status && (
                      <span className={entry.statusColor}>{entry.status}</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">{entry.task}</div>
                </div>
              </TableCell>
              {currentWeek.map((day) => (
                <TableCell key={day.day} className="text-center">
                  <Input
                    type="text"
                    value={entry.time[day.day] || "0:00"}
                    onChange={(e) => handleTimeChange(entry.id, day.day, e.target.value)}
                    className="text-center"
                  />
                </TableCell>
              ))}
              <TableCell className="text-center font-medium">
                {Object.values(entry.time).reduce((acc, time) => {
                  const [hours, minutes] = time.split(":").map(Number)
                  return acc + hours + minutes / 60
                }, 0).toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Button variant="ghost" className="mt-4 text-primary gap-2">
        <Plus className="h-4 w-4" />
        Add a line
      </Button>
    </div>
  )
}