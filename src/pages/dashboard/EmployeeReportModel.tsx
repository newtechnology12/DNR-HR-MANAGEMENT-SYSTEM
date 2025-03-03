import { useState } from "react";
import { useQuery } from "react-query";
import { Link } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { addDays } from "date-fns";

import DataTable from "@/components/DataTable";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import useConfirmModal from "@/hooks/useConfirmModal";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { EmployeeReportModal } from "@/components/modals/EmployeeReportModel";

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function EmployeeReports({ employeeId }) {
  // State for modals
  const [isTasksCompleteModalOpen, setIsTasksCompleteModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState("");

  const [isChallengesFacedModalOpen, setIsChallengesFacedModalOpen] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState("");

  const [isNextStepsModalOpen, setIsNextStepsModalOpen] = useState(false);
  const [selectedNextStep, setSelectedNextStep] = useState("");

  // Handlers for opening modals
  const handleTasksClick = (task) => {
    setSelectedTask(task);
    setIsTasksCompleteModalOpen(true);
  };

  const handleChallengesClick = (challenge) => {
    setSelectedChallenge(challenge);
    setIsChallengesFacedModalOpen(true);
  };

  const handleNextStepsClick = (nextStep) => {
    setSelectedNextStep(nextStep);
    setIsNextStepsModalOpen(true);
  };

  // Modal Components
  const TasksModal = () => (
    <Dialog open={isTasksCompleteModalOpen} onOpenChange={setIsTasksCompleteModalOpen}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Tasks Completed</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="whitespace-pre-wrap mb-4">{selectedTask}</div>
        </div>
        <DialogFooter>
          <Button variant="default" onClick={() => setIsTasksCompleteModalOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const ChallengesModal = () => (
    <Dialog open={isChallengesFacedModalOpen} onOpenChange={setIsChallengesFacedModalOpen}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Challenges Faced</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="whitespace-pre-wrap mb-4">{selectedChallenge}</div>
        </div>
        <DialogFooter>
          <Button variant="default" onClick={() => setIsChallengesFacedModalOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const NextStepsModal = () => (
    <Dialog open={isNextStepsModalOpen} onOpenChange={setIsNextStepsModalOpen}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Next Steps</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="whitespace-pre-wrap mb-4">{selectedNextStep}</div>
        </div>
        <DialogFooter>
          <Button variant="default" onClick={() => setIsNextStepsModalOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Column Definitions
  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
    {
      accessorKey: "employee",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => (
        <div className="w-[80px] flex items-center gap-2">
          <Link
            to={""}
            className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
          >
            {row.getValue("employee")}
          </Link>
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "department",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("department")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "reportType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Report Type" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("reportType")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "actionplan",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Your Plan" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("actionplan")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "reportDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Report Date" />,
      cell: ({ row }) => (
        <div className="capitalize">
          {new Date(row.getValue("reportDate")).toLocaleDateString("en-US", {
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
      accessorKey: "dateHappened",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date Happened" />,
      cell: ({ row }) => (
        <div className="capitalize">
          {new Date(row.getValue("dateHappened")).toLocaleDateString("en-US", {
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
      accessorKey: "tasksCompleted",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tasks Completed" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleTasksClick(row.getValue("tasksCompleted"))}
            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            View Tasks
          </Button>
        </div>
      ),
      filterFn: (__, _, value) => value,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "challengesFaced",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Challenges Faced" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleChallengesClick(row.getValue("challengesFaced"))}
            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            View Challenges
          </Button>
        </div>
      ),
      filterFn: (__, _, value) => value,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "nextSteps",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Next Steps" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleNextStepsClick(row.getValue("nextSteps"))}
            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
          >
            View Next Steps
          </Button>
        </div>
      ),
      filterFn: (__, _, value) => value,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created_by",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created By" />,
      cell: ({ row }) => <div className="capitalize">{row.getValue("created_by")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created At" />,
      cell: ({ row }) => (
        <div className="capitalize">
          {new Date(row.getValue("created")).toLocaleDateString("en-US", {
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
      id: "actions",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actions" />,
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              title: "Edit Report",
              onClick: (e) => editRow.edit(e.original),
            },
            {
              title: "Delete Report",
              onClick: (e) => confirmModal.open({ meta: e }),
            },
          ]}
          row={row}
        />
      ),
    },
  ];

  // Confirm Modal Logic
  const confirmModal = useConfirmModal();
  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("employeeReports")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Report deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  // Pagination and Query Logic
  const [searchText, setSearchText] = useState("");
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([{ id: "created", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const recordsQuery = useQuery({
    queryKey: [
      "employeeReports",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
        employeeId,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText
        ? `employee.name~"${searchText}" || reportType~"${searchText}"`
        : "";
      const filters = columnFilters
        .map((e) => {
          if (e.value["from"]) {
            if (e.value?.to) {
              return `created >= "${new Date(
                e.value?.from
              ).toISOString()}" && created <= "${new Date(
                e.value?.to
              ).toISOString()}"`;
            } else {
              return `created >= "${new Date(
                e.value?.from
              ).toISOString()}" && created <= "${new Date(
                addDays(new Date(e.value?.from), 1)
              ).toISOString()}"`;
            }
          } else {
            return e.value
              .map((p) => `${e.id}="${p.id || p.value || p}"`)
              .join(" || ");
          }
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("employeeReports")
        .getList(pagination.pageIndex + 1, pagination.pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `employee="${employeeId}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: `employee,created_by, departments`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e?.expand?.employee?.name,
                department: e?.department,
                created_by: e.expand?.created_by?.name,
                reportType: e.reportType,
                actionplan: e.actionplan,
                reportDate: e.reportDate,
                dateHappened: e.dateHappened,
                tasksCompleted: e.tasksCompleted,
                challengesFaced: e.challengesFaced,
                nextSteps: e.nextSteps,
                created: e.created,
                original: e,
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  const newRecordModal = useModalState();
  const editRow = useEditRow();

  return (
    <>
      <ConfirmModal
        title={"Are you sure you want to delete this report?"}
        description={`This action cannot be undone.`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
      <DataTable
        className="!border-none !p-0"
        isFetching={recordsQuery.isFetching}
        defaultColumnVisibility={{
          created_by: false,
        }}
        isLoading={recordsQuery.status === "loading"}
        data={recordsQuery?.data?.items || []}
        columns={columns}
        onSearch={(e) => {
          setSearchText(e);
        }}
        sorting={sorting}
        setSorting={setSorting}
        pageCount={recordsQuery?.data?.totalPages}
        setPagination={setPagination}
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        Action={() => {
          return (
            <Button
              onClick={() => {
                newRecordModal.open();
              }}
              size="sm"
              className="mr-2"
            >
              Create New Report
            </Button>
          );
        }}
        facets={[
          {
            title: "Report Type",
            name: "reportType",
            options: ["daily", "weekly", "monthly"].map((e) => ({
              label: capitalizeFirstLetter(e),
              value: e,
            })),
          },
        ]}
      />
      <EmployeeReportModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        employeeId={employeeId}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
      <TasksModal />
      <ChallengesModal />
      <NextStepsModal />
    </>
  );
}