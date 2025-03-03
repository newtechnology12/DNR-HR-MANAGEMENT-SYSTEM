import { useState } from "react";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTable from "@/components/DataTable";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import pocketbase from "@/lib/pocketbase";
import { useQuery } from "react-query";
import { toast } from "sonner";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { ActionPlansModal } from "@/components/modals/ActionPlansModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { addDays, differenceInDays, isBefore, isAfter } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { file } from "googleapis/build/src/apis/file";
import { Input } from "@/components/ui/input";
import cleanObject from "@/utils/cleanObject";

function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function to calculate task status and progress
const calculateTaskStatus = (startDate: Date, endDate: Date, status: string) => {
    const today = new Date();
    const isCompleted = status === "completed";
    const isOverdue = isBefore(today, endDate) ? false : true;
    const isApproachingDeadline =
      differenceInDays(endDate, today) <= 1 && !isCompleted;
  
    let color = "green"; // On track
    if (isCompleted) color = "blue"; // Completed
    else if (isOverdue) color = "red"; // Overdue
    else if (isApproachingDeadline) color = "yellow"; // Approaching deadline
  
    const totalDays = differenceInDays(endDate, startDate);
    const daysPassed = differenceInDays(today, startDate);
    const progress = Math.min(Math.max((daysPassed / totalDays) * 100, 0), 100);
  
    return { color, progress };
  };
  
  export default function ActionPlans() {
    const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
    const [selectedDescription, setSelectedDescription] = useState("");
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [hoursInput, setHoursInput] = useState("");
  
    const handleDescriptionClick = (description: string) => {
      setSelectedDescription(description);
      setIsDescriptionModalOpen(true);
    };
  
    const handleCommentClick = (task: any) => {
      setSelectedTask(task);
      setIsCommentModalOpen(true);
    };

    const handleAddHours = async () => {
      if (!hoursInput || isNaN(Number(hoursInput))) {
        toast.error("Please enter a valid number of hours.");
        return;
      }
  
      const newHoursEntry = {
        date: new Date().toISOString().split("T")[0], // Today's date
        hours: Number(hoursInput),
      };
  
      try {
        const updatedHoursPerDay = [...(selectedTask.hoursPerDay || []), newHoursEntry];
        const totalHours = updatedHoursPerDay.reduce((sum, entry) => sum + entry.hours, 0);
  
        await pocketbase.collection("actionPlans").update(selectedTask.id, {
          hoursPerDay: updatedHoursPerDay,
          totalHours,
        });
  
        toast.success("Hours added successfully");
        setIsHoursModalOpen(false);
        setHoursInput("");
        recordsQuery.refetch();
      } catch (error) {
        toast.error("Failed to add hours");
      }
    };
  
    const DescriptionModal = () => (
      <Dialog open={isDescriptionModalOpen} onOpenChange={setIsDescriptionModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Description</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap">{selectedDescription}</div>
        </DialogContent>
      </Dialog>
    );
  
    const CommentModal = () => (
      <Dialog open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <textarea
              className="w-full p-2 border rounded"
              placeholder="Enter your comment..."
              value={selectedTask?.comment || ""}
              onChange={(e) =>
                setSelectedTask({ ...selectedTask, comment: e.target.value })
              }
            />
            <Button
              className="mt-4"
              onClick={async () => {
                try {
                  await pocketbase.collection("actionPlans").update(selectedTask.id, {
                    comment: selectedTask.comment,
                  });
                  toast.success("Comment added successfully");
                  setIsCommentModalOpen(false);
                  recordsQuery.refetch();
                } catch (error) {
                  toast.error("Failed to add comment");
                }
              }}
            >
              Save Comment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  
    const HoursModal = () => (
      <Dialog open={isHoursModalOpen} onOpenChange={setIsHoursModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Hours</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Input
              type="number"
              placeholder="Enter hours spent today"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
            />
            <Button className="mt-4" onClick={handleAddHours}>
              Add Hours
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    // {
    //   accessorKey: "id",
    //   header: ({ column }) => (
    //     <DataTableColumnHeader column={column} title="ID" />
    //   ),
    //   cell: ({ row }) => (
    //     <div className="capitalize">{row.getValue("id")}</div>
    //   ),
    //   enableSorting: true,
    //   enableHiding: false,
    // },
    {
      accessorKey: "staff_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Staff Name" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("staff_name")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
        accessorKey: "department",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Department" />
        ),
        cell: ({ row }) => (
          <div className="capitalize">{row.getValue("department")}</div>
        ),
        enableSorting: true,
        enableHiding: true,
      },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("title")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => (
        <Button
          variant="link"
          onClick={() => handleDescriptionClick(row.getValue("description"))}
          className="text-blue-500 hover:text-blue-700"
        >
          View Description
        </Button>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
        accessorKey: "planType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Plan Type" />
        ),
        cell: ({ row }) => (
          <div className="capitalize">{row.getValue("planType")}</div>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: "startDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Start Date" />
        ),
        cell: ({ row }) => (
          <div className="capitalize">
            {new Date(row.getValue("startDate")).toLocaleDateString("en-US", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: "endDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="End Date" />
        ),
        cell: ({ row }) => (
          <div className="capitalize">
            {new Date(row.getValue("endDate")).toLocaleDateString("en-US", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: "priority",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Priority" />
        ),
        cell: ({ row }) => (
          <div className="capitalize">{row.getValue("priority")}</div>
        ),
        enableSorting: true,
        enableHiding: true,
      },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const { color } = calculateTaskStatus(
          new Date(row.getValue("startDate")),
          new Date(row.getValue("endDate")),
          row.getValue("status")
        );
        return (
          <div
            className={`capitalize px-2 py-1 rounded text-white text-center`}
            style={{ backgroundColor: color }}
          >
            {row.getValue("status")}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "progress",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Progress" />
      ),
      cell: ({ row }) => {
        const { progress } = calculateTaskStatus(
          new Date(row.getValue("startDate")),
          new Date(row.getValue("endDate")),
          row.getValue("status")
        );
        return <Progress value={progress} className="h-2" />;
      },
      enableSorting: true,
      enableHiding: true,
    },
    
    {
        accessorKey: "totalHours",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total Hours" />
        ),
        cell: ({ row }) => (
          <div className="capitalize">{row.getValue("totalHours") || 0}</div>
        ),
        enableSorting: true,
        enableHiding: true,
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
                title: "Add Comment",
                onClick: (e) => handleCommentClick(e.original),
              },
              {
                title: "Edit Plan",
                onClick: (e) => {
                  editRow.edit(e.original);
                },
              },
              {
                title: "Delete Plan",
                onClick: (e) => {
                  confirmModal.open({ meta: e });
                },
              },
            ]}
            row={row}
          />
        ),
      },
    ];
  const confirmModal = useConfirmModal();
  const [searchText, setSearchText] = useState("");
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([{ id: "created", desc: true }]);
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Function to update the page size dynamically
const changePageSize = (newSize: number) => {
    setPagination((prev) => ({
        ...prev,
        pageSize: newSize > 50 ? Infinity : newSize, // If greater than 50, set to Infinity
    }));
};

  const recordsQuery = useQuery({
    queryKey: ["actionPlans", { columnFilters, searchText, sorting, pageIndex, pageSize }],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `title~"${searchText}" || description~"${searchText}"` : "";
      const filters = columnFilters
        .map((e) => {
          if (e.value["from"]) {
            return `created >= "${new Date(e.value?.from).toISOString()}" && created <= "${new Date(
              e.value?.to || addDays(new Date(e.value?.from), 1)
            ).toISOString()}"`;
          } else {
            return e.value.map((p) => `${e.id}="${p.id || p.value || p}"`).join(" || ");
          }
        })
        .join(" && ");

      const sorters = sorting.map((p) => `${p.desc ? "-" : "+"}${p.id}`).join(" && ");

      return pocketbase
        .collection("actionPlans")
        .getList(pageIndex + 1, pageSize, {
          filter: [searchQ, filters].filter((e) => e).join("&&"),
          sort: sorters,
          expand: `department_id,staff_id`,
        })
        .then((e) => {
          return {
            items: e.items.map((e) => ({
              id: e.id,
              staff_name: e.expand?.staff_id?.name,
              department:  e?.expand?.department_id?.name, 
              title: e.title,
              planType: e.planType,
              priority: e.priority,
              description: e.task_description,
              startDate: e.start_date,
              endDate: e.end_date,
              status: e.status,
              progress: e.progress,
              assignedTo: e.staff_id,
              comment: e.comment,
              hoursPerDay: e.hoursPerDay,
              totalHours: e.total_hours,
              files: e.file,
              original: e,
            })),
            totalPages: e.totalPages,
          };
        });
    },
  });

  const newRecordModal = useModalState();
  const editRow = useEditRow();

  const handleDelete = async (e: any) => {
    try {
      confirmModal.setIsLoading(true);
      await pocketbase.collection("actionPlans").delete(e.meta.id);
      recordsQuery.refetch();
      confirmModal.close();
      toast.success("Plan deleted successfully");
    } catch (error) {
      confirmModal.setIsLoading(false);
      toast.error("Error deleting plan");
    }
  };

  return (
    <>
      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={`This action cannot be undone.`}
        meta={confirmModal.meta}
        onConfirm={(e) => handleDelete(e)}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
      <DataTable
        className="!border-none !p-0"
        isFetching={recordsQuery.isFetching}
        isLoading={recordsQuery.status === "loading"}
        data={recordsQuery?.data?.items || []}
        columns={columns}
        onSearch={(e) => setSearchText(e)}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={recordsQuery?.data?.totalPages}
        setPagination={changePageSize}
        pageIndex={pageIndex}
        pageSize={pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        Action={() => (
          <Button onClick={() => newRecordModal.open()} size="sm" className="mr-2">
            Create New Plan
          </Button>
        )}
        facets={[
          {
            title: "Status",
            name: "status",
            options: ["not_started", "in_progress", "completed"].map((e) => ({
              label: capitalizeFirstLetter(e.replace("_", " ")),
              value: e,
            })),
          },
          { 
            title: "Priority",
            name: "priority",
            options: ["high", "medium", "low"].map((e) => ({
              label: capitalizeFirstLetter(e.replace("_", " ")),
              value: e,
            })),
          },
          {
            title: "Plan Type",
            name: "planType",
            options: ["internal", "external"].map((e) => ({
              label: capitalizeFirstLetter(e.replace("_", " ")),
              value: e,
            })),
          },
          {
            title: "Department",
            loader: ({ search }) =>
              pocketbase
                .collection("departments")
                .getFullList(cleanObject({ filter: search ? `name~"${search}"` : '' }))
                .then((e) => e.map((e) => ({ label: e.name, value: e.id }))),
            name: "department",
            type: "async-options",
          },
          {
            title: "Staff",
            loader: ({ search }) =>
              pocketbase
                .collection("users")
                .getFullList(cleanObject({ filter: search ? `name~"${search}"` : '' }))
                .then((e) => e.map((e) => ({ label: e.name, value: e.id }))),
            name: "assignedTo",
            type: "async-options",
          },

        ]}
      />
      <ActionPlansModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
      <DescriptionModal />
      <CommentModal />
      <HoursModal />
    </>
  );
}