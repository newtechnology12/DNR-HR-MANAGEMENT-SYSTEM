// import DataTable from "@/components/DataTable";
// import { ColumnDef, PaginationState } from "@tanstack/react-table";
// import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
// import { Checkbox } from "@/components/ui/checkbox";
// import { PlusCircle } from "lucide-react";
// import pocketbase from "@/lib/pocketbase";
// import cleanObject from "@/utils/cleanObject";
// import { useState } from "react";
// import { useQuery } from "react-query";
// import BreadCrumb from "@/components/breadcrumb";
// import { Button } from "@/components/ui/button";
// import useModalState from "@/hooks/useModalState";
// import useEditRow from "@/hooks/use-edit-row";
// import DataTableRowActions from "@/components/datatable/DataTableRowActions";
// import ConfirmModal from "@/components/modals/ConfirmModal";
// import useConfirmModal from "@/hooks/useConfirmModal";
// import { toast } from "sonner";
// import { PrepaymentFormModal } from "@/components/modals/PrepaymentFormModal";
// import { addDays } from "date-fns";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { zodResolver } from "@hookform/resolvers/zod";
// import { z } from "zod";
// import { useAuth } from "@/context/auth.context";
// import AppFormTextArea from "@/components/forms/AppFormTextArea";
// import Loader from "@/components/icons/Loader";
// import { useForm } from "react-hook-form";
// import { Form } from "@/components/ui/form";
// import getFileUrl from "@/utils/getFileUrl";
// import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
// import { cn } from "@/utils";
// import { useRoles } from "@/context/roles.context";
// import jsPDF from "jspdf";
// import "jspdf-autotable";
// import * as XLSX from "xlsx";

// export default function Prepayments() {
//   const { canPerform } = useRoles();
//   const columns: ColumnDef<any>[] = [
//     {
//       id: "select",
//       header: ({ table }) => (
//         <Checkbox
//           // @ts-ignore
//           checked={
//             table.getIsAllPageRowsSelected() ||
//             (table.getIsSomePageRowsSelected() && "indeterminate")
//           }
//           onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
//           aria-label="Select all"
//           className="translate-y-[2px]"
//         />
//       ),
//       cell: ({ row }) => (
//         <Checkbox
//           checked={row.getIsSelected()}
//           onCheckedChange={(value) => row.toggleSelected(!!value)}
//           aria-label="Select row"
//           className="translate-y-[2px]"
//         />
//       ),
//       enableSorting: false,
//       enableHiding: false,
//     },
//     {
//       accessorKey: "created_by",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Requested by" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {row.getValue("created_by") || "---"}
//         </div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "department",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Department" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">{row.getValue("department")}</div>
//       ),
//       enableSorting: false,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "category",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Category" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {row.getValue("category") || "N.A"}
//         </div>
//       ),
//       enableSorting: false,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "account",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Account" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {row.getValue("account") || "N.A"}
//         </div>
//       ),
//       enableSorting: false,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "amount",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Amount" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">
//           {Number(row.getValue("amount")).toLocaleString()} FRW
//         </div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "momoNumber",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Momo" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("momoNumber")}</div>
//       ),
//       enableSorting: false,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "momoName",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Momo Name" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("momoName")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "status",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Status" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("status")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "attachment",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Attachment" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">
//           <a
//             className="underline truncate text-blue-500"
//             href={getFileUrl({
//               file: row.getValue("attachment"),
//               collection: "prepayments",
//               record: row?.original?.original,
//             })}
//           >
//             View Attachement
//           </a>
//         </div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "created",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Created at" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">{row.getValue("created")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       id: "actions",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Actions" />
//       ),
//       cell: ({ row }) => (
//         <DataTableRowActions
//           actions={[
//             {
//               title: "Approve expense",
//               onClick: (e) => {
//                 setloanToApprove(e.original);
//               },
//               disabled:
//                 row.original.status === "approved" ||
//                 row.original.status === "rejected" ||
//                 !canPerform("approve_or_reject_expense"),
//             },
//             {
//               title: "Reject expense",
//               onClick: (e) => {
//                 setloanToReject(e.original);
//               },
//               disabled:
//                 row.original.status === "approved" ||
//                 row.original.status === "rejected" ||
//                 !canPerform("approve_or_reject_expense"),
//             },
//           ]}
//           row={row}
//         />
//       ),
//     },
//   ];

//   const [loanToApprove, setloanToApprove] = useState(null);
//   const [loanToReject, setloanToReject] = useState(null);
//   const [searchText, setsearchText] = useState("");
//   const [columnFilters, setColumnFilters] = useState([]);
//   const [sorting, setSorting] = useState([
//     {
//       id: "created",
//       desc: true,
//     },
//   ]);
//   const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
//     pageIndex: 0,
//     pageSize: 10,
//   });
//   const [activeTab, setactiveTab] = useState("pending");

//   const recordsQuery = useQuery({
//     queryKey: [
//       "prepayments",
//       {
//         columnFilters,
//         search: searchText,
//         sort: sorting,
//         pageIndex,
//         pageSize,
//         activeTab,
//       },
//     ],
//     keepPreviousData: true,
//     queryFn: () => {
//       const searchQ = searchText ? `employee.name~"${searchText}"` : "";
//       const filters = columnFilters
//         .map((e) => {
//           if (e.value["from"]) {
//             if (e.value?.to) {
//               return `created >= "${new Date(
//                 e.value?.from
//               ).toISOString()}" && created <= "${new Date(
//                 e.value?.to
//               ).toISOString()}"`;
//             } else {
//               return `created >= "${new Date(
//                 e.value?.from
//               ).toISOString()}" && created <= "${new Date(
//                 addDays(new Date(e.value?.from), 1)
//               ).toISOString()}"`;
//             }
//           } else {
//             return e.value
//               .map((p) => `${e.id}="${p.id || p.value || p}"`)
//               .join(" || ");
//           }
//         })
//         .join(" && ");

//       const sorters = sorting
//         .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
//         .join(" && ");

//       return pocketbase
//         .collection("prepayments")
//         .getList(pageIndex + 1, pageSize, {
//           ...cleanObject({
//             filter: [searchQ, filters, `status="${activeTab}"`]
//               .filter((e) => e)
//               .join("&&"),
//             sort: sorters,
//             expand: `employee,created_by,transactions,employee.designation,expenseCategory,account`,
//           }),
//         })
//         .then((e) => {
//           return {
//             items: e?.items?.map((e) => {
//               return {
//                 id: e.id,
//                 employee: e.expand?.employee?.name,
//                 position: e.position,
//                 category: e?.expand?.expenseCategory?.name,
//                 account: e?.expand?.account?.name,
//                 attachment: e.attachment,
//                 momoNumber: e.momoNumber,
//                 momoName: e.momoName,
//                 amount: e.amount,
//                 status: e.status,
//                 created_by: e.expand?.created_by?.name,
//                 depatment: e.expand?.employee?.expand?.departments?.name,
//                 deduction_date: new Date(e.deduction_date).toLocaleDateString(
//                   "en-US",
//                   {
//                     day: "2-digit",
//                     month: "long",
//                     year: "numeric",
//                   }
//                 ),
//                 created: new Date(e.created).toLocaleDateString("en-US", {
//                   day: "2-digit",
//                   month: "long",
//                   year: "numeric",
//                 }),
//                 updated: new Date(e.created).toLocaleDateString("en-US", {
//                   day: "2-digit",
//                   month: "long",
//                   year: "numeric",
//                 }),
//                 original: e,
//               };
//             }),
//             totalPages: e.totalPages,
//           };
//         });
//     },
//     enabled: true,
//   });

//   const newRecordModal = useModalState();
//   const editRow = useEditRow();
//   const confirmModal = useConfirmModal();

//   const handleDelete = (e) => {
//     confirmModal.setIsLoading(true);
//     return pocketbase
//       .collection("prepayments")
//       .delete(e.id)
//       .then(() => {
//         recordsQuery.refetch();
//         confirmModal.close();
//         toast.success("credit deleted succesfully");
//       })
//       .catch((e) => {
//         confirmModal.setIsLoading(false);
//         toast.error(e.message);
//       });
//   };

//   // Sort data by date and employee name
//   const sortedData = recordsQuery?.data?.items?.sort((a, b) => {
//     const dateA = new Date(a.created);
//     const dateB = new Date(b.created);
//     if (dateA === dateB) {
//       return a.created_by.localeCompare(b.created_by);
//     }
//     return dateA - dateB;
//   });

//   // Generate PDF
//   const generatePDF = (data) => {
//     const doc = new jsPDF();
//     const tableColumn = [
//       "Requested by",
//       "Department",
//       "Category",
//       "Account",
//       "Amount",
//       "Momo",
//       "Momo Name",
//       "Status",
//       "Attachment",
//       "Created at",
//     ];
//     const tableRows = [];

//     data.forEach((item) => {
//       const rowData = [
//         item.created_by,
//         item.department,
//         item.category,
//         item.account,
//         item.amount,
//         item.momoNumber,
//         item.momoName,
//         item.status,
//         item.attachment,
//         item.created,
//       ];
//       tableRows.push(rowData);
//     });

//     doc.autoTable(tableColumn, tableRows, { startY: 20 });
//     doc.text("Prepayment Report", 14, 15);
//     doc.save("prepayment_report.pdf");
//   };

//   // Generate Excel
//   const generateExcel = (data) => {
//     const ws = XLSX.utils.json_to_sheet(data);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Prepayments");
//     XLSX.writeFile(wb, "prepayment_report.xlsx");
//   };

//   return (
//     <div className="min-h-screen bg-gray-50">
//       <div className="max-w-[1400px] mx-auto p-6">
//         {/* Header Section */}
//         <div className="mb-6">
//           <div className="flex justify-between items-center">
//             <div>
//               <h1 className="text-2xl font-bold text-gray-900">Staff Expense Request</h1>
//               <p className="text-sm text-gray-600 mt-1">Manage and track expense requests</p>
//             </div>
//             <Button className="bg-primary hover:bg-primary/90" onClick={() => newRecordModal.open()}>
//               <PlusCircle size={16} className="mr-2" />
//               New Expense Request
//             </Button>
//           </div>
//         </div>

//         {/* Control Panel */}
//         <div className="bg-white rounded-lg shadow-sm mb-6">
//           <div className="p-4 border-b">
//             <div className="flex gap-4">
//               <Button 
//                 variant="outline"
//                 onClick={() => generatePDF(sortedData)}
//                 className="flex items-center gap-2"
//               >
//                 <FileText size={16} />
//                 Export PDF
//               </Button>
//               <Button 
//                 variant="outline"
//                 onClick={() => generateExcel(sortedData)}
//                 className="flex items-center gap-2"
//               >
//                 <Download size={16} />
//                 Export Excel
//               </Button>
//             </div>
//           </div>

//           {/* Status Tabs */}
//           <ScrollArea className="w-full whitespace-nowrap border-b">
//             <div className="flex p-2">
//               {[
//                 { title: "Pending Expenses", name: "pending", color: "text-yellow-600" },
//                 { title: "Approved Expenses", name: "approved", color: "text-green-600" },
//                 { title: "Rejected Expenses", name: "rejected", color: "text-red-600" }
//               ].map((tab) => (
//                 <button
//                   key={tab.name}
//                   onClick={() => setactiveTab(tab.name)}
//                   className={`
//                     px-6 py-3 relative font-medium text-sm transition-colors
//                     ${activeTab === tab.name 
//                       ? `${tab.color} border-b-2 border-current` 
//                       : 'text-gray-500 hover:text-gray-700'
//                     }
//                   `}
//                 >
//                   {tab.title}
//                 </button>
//               ))}
//             </div>
//           </ScrollArea>
//         </div>

//         {/* Data Table */}
//         <div className="bg-white rounded-lg shadow-sm">
//           <DataTable
//             isFetching={recordsQuery.isFetching}
//             defaultColumnVisibility={{}}
//             isLoading={recordsQuery.status === "loading"}
//             data={recordsQuery?.data?.items || []}
//             columns={columns}
//             onSearch={(e) => setsearchText(e)}
//             sorting={sorting}
//             setSorting={setSorting}
//             pageCount={recordsQuery?.data?.totalPages}
//             setPagination={setPagination}
//             pageIndex={pageIndex}
//             pageSize={pageSize}
//             setColumnFilters={setColumnFilters}
//             columnFilters={columnFilters}
//             className="border-none"
//           />
//         </div>
//       </div>

//       {/* Modals remain the same */}
//       <PrepaymentFormModal
//         onComplete={() => {
//           recordsQuery.refetch();
//           newRecordModal.close();
//           editRow.close();
//         }}
//         record={editRow.row}
//         setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
//         open={newRecordModal.isOpen || editRow.isOpen}
//       />
      
//       <ConfirmModal
//         title="Are you sure you want to delete?"
//         description="This action cannot be undone."
//         meta={confirmModal.meta}
//         onConfirm={handleDelete}
//         isLoading={confirmModal.isLoading}
//         open={confirmModal.isOpen}
//         onClose={() => confirmModal.close()}
//       />
      
//       <ApproveOrRejectModal
//         loan={loanToApprove || loanToReject}
//         type={loanToApprove ? "approve" : loanToReject ? "reject" : null}
//         open={!!loanToApprove || !!loanToReject}
//         setOpen={(e) => {
//           if (!e) {
//             setloanToApprove(null);
//             setloanToReject(null);
//           }
//         }}
//         onCompleted={() => {
//           recordsQuery.refetch();
//         }}
//       />
//     </div>
//   );
// }

import React, { useState } from 'react';
import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, FileText, Download } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { PrepaymentFormModal } from "@/components/modals/PrepaymentFormModal";
import { addDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/auth.context";
import AppFormTextArea from "@/components/forms/AppFormTextArea";
import Loader from "@/components/icons/Loader";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import getFileUrl from "@/utils/getFileUrl";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/utils";
import { useRoles } from "@/context/roles.context";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from "xlsx";

export default function Prepayments() {
  const { canPerform } = useRoles();

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
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Requested by" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("created_by") || "---"}
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "department",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("department")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("category") || "N.A"}
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "account",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Account" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {row.getValue("account") || "N.A"}
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">
          {Number(row.getValue("amount")).toLocaleString()} FRW
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "momoNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Momo" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("momoNumber")}</div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: "momoName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Momo Name" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("momoName")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("status")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "attachment",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Attachment" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">
          <a
            className="underline truncate text-blue-500"
            href={getFileUrl({
              file: row.getValue("attachment"),
              collection: "prepayments",
              record: row?.original?.original,
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Attachment
          </a>
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created at" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("created")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
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
              title: "Approve expense",
              onClick: (e) => {
                setloanToApprove(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected" ||
                !canPerform("approve_or_reject_expense"),
            },
            {
              title: "Reject expense",
              onClick: (e) => {
                setloanToReject(e.original);
              },
              disabled:
                row.original.status === "approved" ||
                row.original.status === "rejected" ||
                !canPerform("approve_or_reject_expense"),
            },
          ]}
          row={row}
        />
      ),
    },
  ];

  const [loanToApprove, setloanToApprove] = useState(null);
  const [loanToReject, setloanToReject] = useState(null);
  const [searchText, setsearchText] = useState("");
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
  const [activeTab, setactiveTab] = useState("pending");

  const recordsQuery = useQuery({
    queryKey: [
      "prepayments",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        activeTab,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `employee.name~"${searchText}"` : "";
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
        .collection("prepayments")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: `employee,created_by,transactions,employee.designation,departments, expenseCategory,account`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e.expand?.employee?.name,
                position: e.position,
                category: e?.expand?.expenseCategory?.name,
                account: e?.expand?.account?.name,
                attachment: e.attachment,
                momoNumber: e.momoNumber,
                momoName: e.momoName,
                amount: e.amount,
                status: e.status,
                created_by: e.expand?.created_by?.name,
                department: e.expand?.employee?.department,
                deduction_date: new Date(e.deduction_date).toLocaleDateString(
                  "en-US",
                  {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  }
                ),
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                updated: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
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
  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("prepayments")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Expense deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  // Generate PDF
  const generatePDF = (data) => {
    const doc = new jsPDF();
    
    // Add title to the PDF
    doc.setFontSize(16);
    doc.text("Prepayment Report", 14, 15);
    
    // Define the columns
    const tableColumn = [
      "Requested by",
      "Department",
      "Category",
      "Account",
      "Amount",
      "Momo",
      "Momo Name",
      "Status",
      "Created at",
    ];

    // Prepare the rows
    const tableRows = data.map(item => [
      item.created_by || "---",
      item.department || "---",
      item.category || "---",
      item.account || "---",
      `${Number(item.amount).toLocaleString()} FRW`,
      item.momoNumber || "---",
      item.momoName || "---",
      item.status || "---",
      item.created || "---",
    ]);

    // Generate the table
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 25,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });

    // Save the PDF
    doc.save("prepayment_report.pdf");
  };

  // Generate Excel
  const generateExcel = (data) => {
    const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
      'Requested by': item.created_by || "---",
      'Department': item.department || "---",
      'Category': item.category || "---",
      'Account': item.account || "---",
      'Amount': `${Number(item.amount).toLocaleString()} FRW`,
      'Momo': item.momoNumber || "---",
      'Momo Name': item.momoName || "---",
      'Status': item.status || "---",
      'Created at': item.created || "---",
    })));
    // Continue from the generateExcel function
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Prepayments");
    XLSX.writeFile(workbook, "prepayment_report.xlsx");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Staff Expense Request</h1>
              <BreadCrumb
                items={[
                  {
                    title: `Staff Expense Request`,
                    link: `/prepayments`,
                  },
                ]}
              />
            </div>
            <Button 
              className="bg-primary hover:bg-primary/90" 
              onClick={() => newRecordModal.open()}
            >
              <PlusCircle size={16} className="mr-2" />
              New Expense Request
            </Button>
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="p-4 border-b">
            <div className="flex gap-4">
              <Button 
                variant="outline"
                onClick={() => generatePDF(recordsQuery?.data?.items || [])}
                className="flex items-center gap-2"
              >
                <FileText size={16} />
                Export PDF
              </Button>
              <Button 
                variant="outline"
                onClick={() => generateExcel(recordsQuery?.data?.items || [])}
                className="flex items-center gap-2"
              >
                <Download size={16} />
                Export Excel
              </Button>
            </div>
          </div>

          {/* Status Tabs */}
          <ScrollArea className="w-full whitespace-nowrap border-b">
            <div className="flex p-2">
              {[
                { title: "Pending Expenses", name: "pending", color: "text-yellow-600" },
                { title: "Approved Expenses", name: "approved", color: "text-green-600" },
                { title: "Rejected Expenses", name: "rejected", color: "text-red-600" }
              ].map((tab) => (
                <button
                  key={tab.name}
                  onClick={() => setactiveTab(tab.name)}
                  className={`
                    px-6 py-3 relative font-medium text-sm transition-colors
                    ${activeTab === tab.name 
                      ? `${tab.color} border-b-2 border-current` 
                      : 'text-gray-500 hover:text-gray-700'
                    }
                  `}
                >
                  {tab.title}
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm">
          <DataTable
            isFetching={recordsQuery.isFetching}
            defaultColumnVisibility={{}}
            isLoading={recordsQuery.status === "loading"}
            data={recordsQuery?.data?.items || []}
            columns={columns}
            onSearch={(e) => setsearchText(e)}
            sorting={sorting}
            setSorting={setSorting}
            pageCount={recordsQuery?.data?.totalPages}
            setPagination={setPagination}
            pageIndex={pageIndex}
            pageSize={pageSize}
            setColumnFilters={setColumnFilters}
            columnFilters={columnFilters}
            className="border-none"
            facets={[
              {
                title: "Requested by",
                loader: ({ search }) => {
                  return pocketbase
                    .collection("users")
                    .getFullList(
                      cleanObject({
                        filter: search ? `name~"${search}"` : "",
                      })
                    )
                    .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
                },
                name: "created_by",
                type: "async-options",
              },
            ]}
          />
        </div>
      </div>

      {/* Modals */}
      <PrepaymentFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
      
      <ConfirmModal
        title="Are you sure you want to delete?"
        description="This action cannot be undone."
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
      
      <ApproveOrRejectModal
        loan={loanToApprove || loanToReject}
        type={loanToApprove ? "approve" : loanToReject ? "reject" : null}
        open={!!loanToApprove || !!loanToReject}
        setOpen={(e) => {
          if (!e) {
            setloanToApprove(null);
            setloanToReject(null);
          }
        }}
        onCompleted={() => {
          recordsQuery.refetch();
        }}
      />
    </div>
  );
}

// Form Schema for Approve/Reject Modal
const formSchema = z.object({
  reason: z.string().min(1, { message: "Please enter a reason" }),
});

// Approve/Reject Modal Component
function ApproveOrRejectModal({
  type,
  open,
  setOpen,
  loan: expense,
  onCompleted,
}) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
    },
  });

  const { user } = useAuth();

  const onSubmit = async (values) => {
    try {
      await pocketbase.collection("prepayments").update(expense.id, {
        status: type === "approve" ? "approved" : "rejected",
        [type === "approve" ? "approved_by" : "rejected_by"]: user?.id,
        [type === "approve" ? "approved_at" : "rejected_at"]: new Date(),
        [type === "approve" ? "approved_reason" : "rejected_reason"]:
          values.reason,
      });

      if (type === "approve") {
        const account = await pocketbase
          .collection("accounts")
          .getOne(expense.account);

        const transaction = await pocketbase
          .collection("accounts_transactions")
          .create({
            amount: expense.amount,
            date: expense.date || expense.created || new Date().toLocaleString(),
            account: expense.account,
            expense: expense.id,
            transactionType: "expense",
            notes: expense.notes,
            balanceAfter: account.currentBalance - expense.amount,
          });

        await pocketbase.collection("accounts").update(account.id, {
          currentBalance: account?.currentBalance - expense?.amount,
        });

        await pocketbase.collection("prepayments").update(expense?.id, {
          account_transaction: transaction?.id,
        });
      }

      setOpen(false);
      toast.success(
        `Expense ${type === "approve" ? "approved" : "rejected"} successfully`
      );
      onCompleted();
      form.reset();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-1 font-semibold py-2">
              {type === "approve" ? "Approve expense" : "Reject expense"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {type === "approve" ? "approve" : "reject"} this expense.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <AppFormTextArea
                form={form}
                label="Enter a reason"
                placeholder="Enter reason"
                name="reason"
              />
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="submit"
                  disabled={form.formState.disabled || form.formState.isSubmitting}
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {type === "approve" ? "Approve expense" : "Reject expense"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

