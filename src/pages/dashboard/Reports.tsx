import {
  ColumnDef,
  PaginationState,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import { toast } from "sonner";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { addDays } from "date-fns";
// import { EmployeeReportModal } from "@/components/modals/EmployeeReportModel";
import { Download, FileText, SheetIcon, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";
// import { exportToExcel, exportToPdf } from "@/utils/exportUtils";
import DataTable from "@/components/DataTable";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import useConfirmModal from "@/hooks/useConfirmModal";
// import { exportToExcel, exportToPdf } from "@/utils/exportUtils";
import { useQuery } from "react-query";
import { EmployeeReportModal } from "@/components/modals/EmployeeReportModel";
import { exportToExcel, exportToPdf } from "@/utils/exportUtils";

function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function EmployeeReports() {
  // Fetch departments
  const { data: departments } = useQuery("departments", () =>
    pocketbase.collection("departments").getFullList()
  );

  // Fetch users
  const { data: users } = useQuery("users", () =>
    pocketbase.collection("users").getFullList()
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
    {
      accessorKey: "employee",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employee" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
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
      accessorKey: "reportType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Report Type" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("reportType")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "actionplan",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Plan Title" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("actionplan")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "reportDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Report Date" />
      ),
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
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date Happened" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">
          {new Date(row.getValue("dateHappened")).toLocaleDateString("en-US", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      ),
    },
    {
      accessorKey: "tasksCompleted",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tasks Completed" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("tasksCompleted")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "challengesFaced",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Challenges Faced" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("challengesFaced")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "nextSteps",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Next Steps" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("nextSteps")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "reportFile",
      header: "Report File",
      cell: ({ row }) => {
        const fileUrl = row.getValue("reportFile") as string; // Type assertion
    
        // If no file URL, show a placeholder
        if (!fileUrl) {
          return <div className="text-slate-400">No file</div>;
        }
    
        // Check if the file is a Google Doc or Google Sheet
        const isGoogleDoc = fileUrl.includes("docs.google.com/document");
        const isGoogleSheet = fileUrl.includes("docs.google.com/spreadsheets");
    
        // Function to handle opening the file
        const handleOpenFile = () => {
          // Test if the URL is valid
          fetch(fileUrl, { method: "HEAD" })
            .then((response) => {
              if (response.ok) {
                window.open(fileUrl, "_blank"); // Open the file in a new tab
              } else {
                toast.error("File not found or inaccessible.");
              }
            })
            .catch((error) => {
              console.error("Failed to open file:", error);
              toast.error("Failed to open file. Please check the URL.");
            });
        };
    
        // Function to handle downloading the file
        const handleDownloadFile = () => {
          fetch(fileUrl)
            .then((response) => {
              if (!response.ok) {
                throw new Error("File not found or inaccessible.");
              }
              return response.blob(); // Convert the response to a Blob
            })
            .then((blob) => {
              // Extract the file name from the URL or generate one
              const fileName = fileUrl.split("/").pop() || `report_${row.id}.${blob.type.split("/")[1]}`;
              saveAs(blob, fileName); // Use file-saver to download the file
            })
            .catch((error) => {
              console.error("Failed to download file:", error);
              toast.error("Failed to download file. Please check the URL.");
            });
        };
    
        return (
          <div className="flex items-center gap-2">
            {/* View File Button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleOpenFile}
            >
              {isGoogleDoc ? (
                <FileText className="h-4 w-4 mr-2" />
              ) : isGoogleSheet ? (
                <SheetIcon className="h-4 w-4 mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              {isGoogleDoc ? "Open Doc" : isGoogleSheet ? "Open Sheet" : "View File"}
            </Button>
    
            {/* Download File Button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDownloadFile}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created By" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("created_by")}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created At" />
      ),
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
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actions" />
      ),
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              title: "Edit Report",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "Delete Report",
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

  const [searchText, setSearchText] = useState("");
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([
    {
      id: "created",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "employeeReports",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
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
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `employee,created_by,department`,
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
                reportFile: e.reportFile,
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

  const handleExport = (format: "pdf" | "excel") => {
    const data = recordsQuery.data?.items || [];
    if (format === "pdf") {
      exportToPdf(data, columns, "Employee_Reports");
    } else {
      exportToExcel(data, columns, "Employee_Reports");
    }
  };

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
        pageIndex={pageIndex}
        pageSize={pageSize}
        setColumnFilters={setColumnFilters}
        columnFilters={columnFilters}
        Action={() => {
          return (
            <div className="flex gap-2">
              <Button
                onClick={() => handleExport("excel")}
                size="sm"
                variant="outline"
              >
                Export to Excel
              </Button>
              <Button
                onClick={() => handleExport("pdf")}
                size="sm"
                variant="outline"
              >
                Export to PDF
              </Button>
              <Button
                onClick={() => {
                  newRecordModal.open();
                }}
                size="sm"
              >
                Create New Report
              </Button>
            </div>
          );
        }}
        facets={[
          {
            title: "Report Type",
            name: "reportType", // Must match the accessorKey in your columns
            options: ["daily", "weekly", "monthly"].map((e) => ({
              label: capitalizeFirstLetter(e),
              value: e,
            })),
          },
          {
            title: "Department",
            name: "department", // Must match the accessorKey in your columns
            options: departments?.map((e) => ({
              label: e.name,
              value: e.id,
            })) || [],
          },
          {
            title: "By Plan",
            name: "actionplan", // Must match the accessorKey in your columns
            options: users?.map((e) => ({
              label: e.name,
              value: e.id,
            })) || [],
          },
          {
            title: "Report Date",
            name: "reportDate", // Must match the accessorKey in your columns
            options: [
              {
                label: "Today",
                value: {
                  from: new Date(),
                  to: new Date(),
                },
              },
              {
                label: "Last 7 Days",
                value: {
                  from: new Date(new Date().setDate(new Date().getDate() - 7)),
                  to: new Date(),
                },
              },
              {
                label: "Last 30 Days",
                value: {
                  from: new Date(new Date().setDate(new Date().getDate() - 30)),
                  to: new Date(),
                },
              },
            ],
          },
        ]}
      />
      <EmployeeReportModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
    </>
  );
}