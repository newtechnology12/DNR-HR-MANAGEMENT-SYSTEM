// import DataTable from "@/components/DataTable";
// import { ColumnDef, PaginationState } from "@tanstack/react-table";
// import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
// import { Checkbox } from "@/components/ui/checkbox";
// import { Link } from "react-router-dom";
// import pocketbase from "@/lib/pocketbase";
// import cleanObject from "@/utils/cleanObject";
// import { useState } from "react";
// import { useQuery } from "react-query";
// import { Button } from "@/components/ui/button";
// import useModalState from "@/hooks/useModalState";
// import useEditRow from "@/hooks/use-edit-row";
// import DataTableRowActions from "@/components/datatable/DataTableRowActions";
// // import { LeaveFormModal } from "@/components/modals/LeaveFormModal";
// import useConfirmModal from "@/hooks/useConfirmModal";
// import { toast } from "sonner";
// import ConfirmModal from "@/components/modals/ConfirmModal";
// import { addDays } from "date-fns";
// import { LeavePlanFormModal } from "@/components/modals/LeavePlaneFormModel";
// function capitalizeFirstLetter(str) {
//   return str.charAt(0).toUpperCase() + str.slice(1);
// }

// export default function EmployeeLeavesplan({ employeeId }) {
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
//       accessorKey: "employee",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Employee" />
//       ),
//       cell: ({ row }) => (
//         <div className="w-[80px]- flex items-center gap-2">
//           <Link
//             to={""}
//             className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
//           >
//             {row.getValue("employee")}
//           </Link>
//         </div>
//       ),
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "start",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Start" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("start")}</div>
//       ),
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//         accessorKey: "end",
//         header: ({ column }) => (
//           <DataTableColumnHeader column={column} title="End" />
//         ),
//         cell: ({ row }) => (
//           <div className="capitalize">{row.getValue("end")}</div>
//         ),
//         enableSorting: true,
//         filterFn: (__, _, value) => {
//           return value;
//         },
//         enableHiding: true,
//       },
//       {
//         accessorKey: "Leaveduration",
//         header: ({ column }) => (
//           <DataTableColumnHeader column={column} title="Days" />
//         ),
//         cell: ({ row }) => (
//           <div className="capitalize">{row.getValue("Leaveduration")}</div>
//         ),
//         filterFn: (__, _, value) => {
//           return value;
//         },
//         enableSorting: true,
//         enableHiding: true,
//       },
//     {
//       accessorKey: "status",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Status" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("status")}</div>
//       ),
//       enableSorting: true,
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableHiding: true,
//     },
  
    
//     {
//       accessorKey: "approved_by",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Approved By" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("approved_by")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "rejected_by",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Rejected By" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("rejected_by")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "created_by",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Created by" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("created_by")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "type",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Type" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("type")}</div>
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
//         <div className="capitalize">{row.getValue("created")}</div>
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
//               disabled: row.original.status !== "pending",
//               title: "Edit leave",
//               onClick: (e) => {
//                 editRow.edit(e.original);
//               },
//             },
//             {
//               disabled: row.original.status !== "pending",
//               title: "Delete leave",
//               onClick: (e) => {
//                 confirmModal.open({ meta: e });
//               },
//             },
//           ]}
//           row={row}
//         />
//       ),
//     },
//   ];
//   const confirmModal = useConfirmModal();

//   const handleDelete = (e) => {
//     confirmModal.setIsLoading(true);
//     return pocketbase
//       .collection("LeavePlane")
//       .delete(e.id)
//       .then(() => {
//         recordsQuery.refetch();
//         confirmModal.close();
//         toast.success("LeavePlane deleted succesfully");
//       })
//       .catch((e) => {
//         confirmModal.setIsLoading(false);
//         toast.error(e.message);
//       });
//   };

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

//   const recordsQuery = useQuery({
//     queryKey: [
//       "LeavePlane",
//       {
//         columnFilters,
//         search: searchText,
//         sort: sorting,
//         pageIndex,
//         pageSize,
//         employeeId,
//       },
//     ],
//     keepPreviousData: true,
//     queryFn: () => {
//       const searchQ = searchText
//         ? `employee.name~"${searchText}" || type~"${searchText}"`
//         : "";
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
//         .collection("LeavePlane")
//         .getList(pageIndex + 1, pageSize, {
//           ...cleanObject({
//             filter: [searchQ, filters, `employee="${employeeId}"`]
//               .filter((e) => e)
//               .join("&&"),
//             sort: sorters,
//             expand: `employee,created_by`,
//           }),
//         })
//         .then((e) => {
//           return {
//             items: e?.items?.map((e) => {
//               return {
//                 id: e.id,
//                 employee: e?.expand?.employee?.name,
//                 created_by: e.expand?.created_by?.name,
//                 start: new Date(e.start).toLocaleDateString("en-US", {
//                   day: "2-digit",
//                   month: "long",
//                   year: "numeric",
//                 }),
//                 end: new Date(e.end).toLocaleDateString("en-US", {
//                   day: "2-digit",
//                   month: "long",
//                   year: "numeric",
//                 }),
//                 Leaveduration: e.Leaveduration,
//                 type: e.type,
//                 status: e.status,
//                 approved_by: e.approved_by || "---",
//                 rejected_by: e.rejected_by || "---",
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

//   return (
//     <>
//       <ConfirmModal
//         title={"Are you sure you want to delete?"}
//         description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
//         a! Nihil`}
//         meta={confirmModal.meta}
//         onConfirm={handleDelete}
//         isLoading={confirmModal.isLoading}
//         open={confirmModal.isOpen}
//         onClose={() => confirmModal.close()}
//       />
//       <DataTable
//         className="!border-none !p-0"
//         isFetching={recordsQuery.isFetching}
//         defaultColumnVisibility={{
//           created_by: false,
//           approved_by: false,
//           rejected_by: false,
//           updated: false,
//         }}
//         isLoading={recordsQuery.status === "loading"}
//         data={recordsQuery?.data?.items || []}
//         columns={columns}
//         onSearch={(e) => {
//           setsearchText(e);
//         }}
//         sorting={sorting}
//         setSorting={setSorting}
//         pageCount={recordsQuery?.data?.totalPages}
//         setPagination={setPagination}
//         pageIndex={pageIndex}
//         pageSize={pageSize}
//         setColumnFilters={setColumnFilters}
//         columnFilters={columnFilters}
//         Action={() => {
//           return (
//             <Button
//               onClick={() => {
//                 newRecordModal.open();
//               }}
//               size="sm"
//               className="mr-2"
//             >
//               Apply For Leave
//             </Button>
//           );
//         }}
//         facets={[
//           {
//             title: "Status",
//             name: "status",
//             options: [
//               { label: "Approved", value: "approved" },
//               { label: "Rejected", value: "rejected" },
//               { label: "Pending", value: "pending" },
//             ],
//           },
//           {
//             title: "Type",
//             name: "type",
//             options: [
//               "annual",
//               "maternity",
//               "paternity",
//               "sick",
//               "study",
//               "unpaid",
//               "0ther",
//             ].map((e) => ({ label: capitalizeFirstLetter(e), value: e })),
//           },
//         ]}
//       />
//       <LeavePlanFormModal
//         onComplete={() => {
//           recordsQuery.refetch();
//           newRecordModal.close();
//           editRow.close();
//         }}
//         employeeId={employeeId}
//         record={editRow.row}
//         setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
//         open={newRecordModal.isOpen || editRow.isOpen}
//       />
//     </>
//   );
// }
import React, { useState } from 'react';
import DataTable from "@/components/DataTable";
import { ColumnDef } from "@tanstack/react-table";
// import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import { LeavePlanFormModal } from "@/components/modals/LeavePlaneFormModel";
import { toast } from "sonner";

export default function EmployeeLeavesplan({ employeeId }) {
  const [refreshKey, setRefreshKey] = useState(0); // Refresh table data
  const newRecordModal = useModalState();
  const [editingRecord, setEditingRecord] = useState(null); // Track record being edited

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "employee",
      header: "Employee",
      cell: ({ row }) => row.getValue("employee"),
    },
    {
      accessorKey: "start",
      header: "Start Date",
      cell: ({ row }) => new Date(row.getValue("start")).toLocaleDateString(),
    },
    {
      accessorKey: "end",
      header: "End Date",
      cell: ({ row }) => new Date(row.getValue("end")).toLocaleDateString(),
    },
    {
      accessorKey: "Leaveduration",
      header: "Duration (Days)",
      cell: ({ row }) => row.getValue("Leaveduration"),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => row.getValue("type"),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => row.getValue("status"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditingRecord(row.original); // Set record to edit
              newRecordModal.open(); // Open modal
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDelete(row.original.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const handleDelete = async (id) => {
    try {
      await pocketbase.collection("LeavePlane").delete(id);
      setRefreshKey((prev) => prev + 1); // Refresh table
      toast.success("Leave plan deleted successfully");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleComplete = () => {
    setRefreshKey((prev) => prev + 1); // Refresh table
    newRecordModal.close(); // Close modal
    setEditingRecord(null); // Reset editing record
  };

  return (
    <div>
      <Button
        onClick={() => {
          setEditingRecord(null); // Ensure no record is being edited
          newRecordModal.open(); // Open modal
        }}
        size="sm"
        className="mb-4"
      >
        Apply For Leave
      </Button>
      <DataTable
        key={refreshKey} // Refresh table when key changes
        columns={columns}
        data={[]} // Replace with your data fetching logic
      />
      <LeavePlanFormModal
        open={newRecordModal.isOpen}
        setOpen={newRecordModal.setisOpen}
        record={editingRecord} // Pass record to edit (or null for new leave plans)
        onComplete={handleComplete}
        userId={employeeId}
      />
    </div>
  );
}