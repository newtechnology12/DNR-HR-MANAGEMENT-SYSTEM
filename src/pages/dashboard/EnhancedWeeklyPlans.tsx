"use client"

import React, { useState } from "react"
import { useQuery } from "react-query"
import { addDays, format } from "date-fns"
import { PlusCircle, FileText, Eye } from 'lucide-react'
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"

import { weeklyPlanSchema } from "@/utils/weeklyPlanUtils"
import pocketbase from "@/lib/pocketbase"
import { useAuth } from "@/context/auth.context"

export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>

export default function EnhancedWeeklyPlans() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null)

  const weeklyPlansQuery = useQuery<WeeklyPlan[]>({
    queryKey: ["weeklyPlans"],
    queryFn: () =>
      pocketbase.collection("weeklyPlans").getFullList<WeeklyPlan>({
        sort: "-created",
      }),
  })

  const handleAddTaskReport = async (planId: string, report: File, description: string) => {
    try {
      const formData = new FormData()
      formData.append("report", report)
      formData.append("description", description)
      await pocketbase.collection("taskReports").create(formData, {
        weeklyPlan: planId,
      })
      toast({
        title: "Task Report Added",
        description: "Your task report has been successfully added.",
      })
    } catch (error) {
      console.error("Error adding task report:", error)
      toast({
        title: "Error",
        description: "Failed to add task report. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Weekly Plans</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference Number</TableHead>
              <TableHead>Client Name</TableHead>
              <TableHead>Engagement Title</TableHead>
              <TableHead>Firm Deadline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeklyPlansQuery.data?.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>{plan.reference_number}</TableCell>
                <TableCell>{plan.client_name}</TableCell>
                <TableCell>{plan.engagement_title}</TableCell>
                <TableCell>{format(new Date(plan.firm_deadline), "MMM dd, yyyy")}</TableCell>
                <TableCell>{plan.engagement_status}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <FileText className="w-4 h-4 mr-2" />
                          Add Report
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Task Report</DialogTitle>
                          <DialogDescription>
                            Upload a task report and add a description for this weekly plan.
                          </DialogDescription>
                        </DialogHeader>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            const formData = new FormData(e.currentTarget)
                            const file = formData.get("report") as File
                            const description = formData.get("description") as string
                            handleAddTaskReport(plan.id, file, description)
                          }}
                          className="space-y-4"
                        >
                          <div>
                            <Label htmlFor="report">Task Report</Label>
                            <Input id="report" name="report" type="file" required />
                          </div>
                          <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" name="description" required />
                          </div>
                          <Button type="submit">Upload Report</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {selectedPlan && (
        <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{selectedPlan.engagement_title}</DialogTitle>
              <DialogDescription>
                Weekly Plan Details and Task Reports
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Plan Details</h3>
                <p><strong>Reference Number:</strong> {selectedPlan.reference_number}</p>
                <p><strong>Client Name:</strong> {selectedPlan.client_name}</p>
                <p><strong>Service Category:</strong> {selectedPlan.service_category}</p>
                <p><strong>Firm Deadline:</strong> {format(new Date(selectedPlan.firm_deadline), "MMM dd, yyyy")}</p>
                <p><strong>Status:</strong> {selectedPlan.engagement_status}</p>
                <p><strong>Key Tasks:</strong> {selectedPlan.key_tasks}</p>
                <p><strong>Observations:</strong> {selectedPlan.observations}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Task Reports</h3>
                {/* Placeholder for task reports list */}
                <p>Task reports will be displayed here.</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

