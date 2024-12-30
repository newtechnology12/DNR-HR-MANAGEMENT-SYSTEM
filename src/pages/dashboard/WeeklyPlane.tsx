"use client"

import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "react-query"
import { addDays, format } from "date-fns"
import { z } from "zod"
import { PlusCircle } from 'lucide-react'
import DataTable from "@/components/DataTable"
import { ColumnDef, PaginationState } from "@tanstack/react-table"
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader"
import DataTableRowActions from "@/components/datatable/DataTableRowActions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from 'sonner'
import pocketbase from "@/lib/pocketbase"
import cleanObject from "@/utils/cleanObject"
import useModalState from "@/hooks/useModalState"
import useEditRow from "@/hooks/use-edit-row"
import { weeklyPlanSchema } from "@/utils/weeklyPlanUtils"
import { useAuth } from "@/context/auth.context"
import WeeklyPlanFormModal from "@/components/modals/WeeklyPlaneFormModel"

const statuses = [
  { label: "Initiation (0-10%)", value: "initiation" },
  { label: "In progress (11-30%)", value: "in_progress_11_30" },
  { label: "In progress (31-50%)", value: "in_progress_31_50" },
  { label: "In progress (51-70%)", value: "in_progress_51_70" },
  { label: "In progress (71-90%)", value: "in_progress_71_90" },
  { label: "Finalization- Review Process", value: "finalization_review" },
  { label: "Finalization- Draft Submitted to Client", value: "finalization_draft" },
  { label: "Finalization- Client Signature Process", value: "finalization_signature" },
  { label: "Signed and Archive in process", value: "signed_archive_process" },
  { label: "Signed and archived", value: "signed_archived" },
]

export type WeeklyPlan = z.infer<typeof weeklyPlanSchema> & {
  id: string;
  taskReports?: {
    id: string;
    description: string;
    report: string;
  }[];
};

export default function WeeklyPlans({ ...otherProps }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null)

  const columns: ColumnDef<WeeklyPlan>[] = [
    {
      id: "reference_number",
      header: "Reference Number",
      accessorKey: "reference_number",
    },
    {
      id: "service_category",
      header: "Service Category",
      accessorKey: "service_category",
    },
    {
      id: "client_name",
      header: "Client Name",
      accessorKey: "client_name",
    },
    {
      id: "engagement_title",
      header: "Engagement Title",
      accessorKey: "engagement_title",
    },
    {
      id: "engagement_status",
      header: "Status",
      accessorKey: "engagement_status",
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actions" />
      ),
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              title: "View Weekly Plan",
              onClick: () => setSelectedPlan(row.original),
            },
            {
              title: "Update Weekly Plan",
              onClick: () => editRow.edit(row.original),
            },
            {
              title: "Add Task Report",
              onClick: () => openAddReportDialog(row.original.id),
            },
          ]}
          row={row}
        />
      ),
    },
  ]

  const [searchText, setSearchText] = useState("")
  const [columnFilters, setColumnFilters] = useState<any>([
    { id: "engagement_status", value: ["initiation"] },
  ])
  const [sorting, setSorting] = useState<any>([
    { id: "created", desc: true },
  ])
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const weeklyPlansQuery = useQuery({
    queryKey: [
      "weeklyPlans",
      { search: searchText, filter: columnFilters, sort: sorting, pageIndex, pageSize },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `reference_number~"${searchText}"` : ""
      const filters = columnFilters.map((e) => {
        if (e.value["from"]) {
          if (e.value?.to) {
            return `created >= "${new Date(e.value?.from).toISOString()}" && created <= "${new Date(e.value?.to).toISOString()}"`
          } else {
            return `created >= "${new Date(e.value?.from).toISOString()}" && created <= "${new Date(addDays(new Date(e.value?.from), 1)).toISOString()}"`
          }
        } else {
          return e.value.map((p) => `${e.id}="${p.id || p.value || p}"`).join(" || ")
        }
      })

      const sorters = sorting.map((p) => `${p.desc ? "-" : "+"}${p.id}`).join(" && ")

      return pocketbase
        .collection("weeklyPlans")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            expand: "department,role,branch,taskReports",
            sort: sorters,
          }),
        })
        .then((e) => ({
          items: e?.items?.map((item) => ({
            id: item.id,
            reference_number: item.reference_number,
            service_category: item.service_category,
            client_name: item.client_name,
            engagement_title: item.engagement_title,
            engagement_contractual_deadline: item.engagement_contractual_deadline,
            firm_deadline: item.firm_deadline,
            key_tasks: item.key_tasks,
            partner: item.partner,
            director: item.director,
            manager: item.manager,
            team_leader: item.team_leader,
            team_members: item.team_members,
            monday: item.monday,
            tuesday: item.tuesday,
            wednesday: item.wednesday,
            thursday: item.thursday,
            friday: item.friday,
            engagement_status: item.engagement_status,
            observations: item.observations,
            taskReports: item.expand?.taskReports || [],
            original: item,
          })),
          totalPages: e.totalPages,
        }))
    },
    enabled: true,
  })

  const addTaskReportMutation = useMutation(
    async ({ planId, file, description }: { planId: string, file: File, description: string }) => {
      const formData = new FormData()
      formData.append("report", file)
      formData.append("description", description)
      formData.append("weeklyPlan", planId)
      return pocketbase.collection("taskReports").create(formData)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries("weeklyPlans")
        toast.success("Task Report Added", {
          description: "Your task report has been successfully added.",
        })
      },
      onError: (error) => {
        console.error("Error adding task report:", error)
        toast.error("Error", {
          description: "Failed to add task report. Please try again.",
        })
      },
    }
  )

  const newWeeklyPlanModal = useModalState()
  const editRow = useEditRow()
  const [isAddReportDialogOpen, setIsAddReportDialogOpen] = useState(false)
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)

  const openAddReportDialog = (planId: string) => {
    setCurrentPlanId(planId)
    setIsAddReportDialogOpen(true)
  }

  const handleAddTaskReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const file = formData.get("report") as File
    const description = formData.get("description") as string
    if (currentPlanId) {
      await addTaskReportMutation.mutateAsync({ planId: currentPlanId, file, description })
      setIsAddReportDialogOpen(false)
    }
  }

  return (
    <>
      <DataTable
        isFetching={weeklyPlansQuery.isFetching}
        defaultColumnVisibility={{}}
        isLoading={weeklyPlansQuery.status === "loading"}
        data={weeklyPlansQuery?.data?.items || []}
        columns={columns}
        onSearch={(e) => setSearchText(e)}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={weeklyPlansQuery?.data?.totalPages}
        setPagination={setPagination}
        pageIndex={pageIndex}
        pageSize={pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        facets={[
          { title: "Engagement Status", options: statuses, name: "engagement_status" },
          {
            title: "Service Category",
            loader: ({ search }) => {
              return pocketbase
                .collection("serviceCategories")
                .getFullList(
                  cleanObject({
                    filter: search ? `name~"${search}"` : "",
                  })
                )
                .then((e) => e.map((item) => ({ label: item.name, value: item.id })))
            },
            name: "service_category",
            type: "async-options",
          },
          {
            title: "Client Name",
            loader: ({ search }) => {
              return pocketbase
                .collection("clients")
                .getFullList(
                  cleanObject({
                    filter: search ? `name~"${search}"` : "",
                  })
                )
                .then((e) => e.map((item) => ({ label: item.name, value: item.id })))
            },
            name: "client_name",
            type: "async-options",
          },
        ]}
        Action={() => (
          <Button onClick={() => newWeeklyPlanModal.open()} size="sm" className="mr-3">
            <PlusCircle size={16} className="mr-2" />
            <span>Create New Weekly Plan</span>
          </Button>
        )}
        {...otherProps}
      />

      <WeeklyPlanFormModal
        onComplete={() => {
          weeklyPlansQuery.refetch()
          newWeeklyPlanModal.close()
          editRow.close()
        }}
        plan={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newWeeklyPlanModal.setisOpen}
        open={newWeeklyPlanModal.isOpen || editRow.isOpen}
        onOpenChange={newWeeklyPlanModal.setisOpen}
      />

      <Dialog open={isAddReportDialogOpen} onOpenChange={setIsAddReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task Report</DialogTitle>
            <DialogDescription>
              Upload a task report and add a description for this weekly plan.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTaskReport} className="space-y-4">
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
                {selectedPlan.taskReports && selectedPlan.taskReports.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedPlan.taskReports.map((report, index) => (
                      <li key={report.id} className="border p-2 rounded">
                        <p><strong>Report {index + 1}:</strong> {report.description}</p>
                        <a href={pocketbase.files.getUrl(report, report.report)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          View Report
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No task reports available.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}