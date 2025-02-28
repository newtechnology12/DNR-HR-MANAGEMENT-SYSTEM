// import DataTable from "@/components/DataTable";
// import { ColumnDef, PaginationState } from "@tanstack/react-table";
// import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
// import { Checkbox } from "@/components/ui/checkbox";
// import pocketbase from "@/lib/pocketbase";
// import cleanObject from "@/utils/cleanObject";
// import { useState } from "react";
// import { useQuery } from "react-query";
// import DataTableRowActions from "@/components/datatable/DataTableRowActions";
// import { useAuth } from "@/context/auth.context";
// import { addDays, differenceInSeconds } from "date-fns";
// import formatSeconds from "@/utils/formatSeconds";
// import BreadCrumb from "@/components/breadcrumb";
// import { Button } from "@/components/ui/button";
// import { PlusCircle } from "react-feather";
// import { AttendanceFormModal } from "@/components/modals/AttendanceFormModal";
// import useModalState from "@/hooks/useModalState";
// import useEditRow from "@/hooks/use-edit-row";
// import ConfirmModal from "@/components/modals/ConfirmModal";
// import useConfirmModal from "@/hooks/useConfirmModal";
// import { toast } from "sonner";
// import { BulkAttendanceModal } from "@/components/modals/BulkAttendanceModal";

// export default function AttendaceLogs() {
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
//         <div className="capitalize">{row.getValue("employee")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "date",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Date" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">{row.getValue("date")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "clockin_time",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Clock In" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("clockin_time")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "clockout_time",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Clock Out" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("clockout_time")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "behaviour",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Behaviour" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("behaviour")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "branch",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Branch" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize truncate">{row.getValue("branch")}</div>
//       ),
//       filterFn: (__, _, value) => {
//         return value;
//       },
//       enableSorting: true,
//       enableHiding: true,
//     },
//     {
//       accessorKey: "total_hours",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Total Hours" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("total_hours")}</div>
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
//               title: "Edit Attendance",
//               onClick: (e) => {
//                 editRow.edit(e.original);
//               },
//             },
//             {
//               title: "delete Attendance",
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

//   const [searchText, setsearchText] = useState("");

//   const [columnFilters, setColumnFilters] = useState<any>([
//     {
//       id: "created",
//       value: {
//         from: new Date().toLocaleDateString(),
//       },
//     },
//   ]);
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
//       "attendance",
//       {
//         columnFilters,
//         search: searchText,
//         sort: sorting,
//         pageIndex,
//         pageSize,
//       },
//     ],
//     keepPreviousData: true,
//     queryFn: () => {
//       const searchQ = searchText ? `name~"${searchText}"` : "";

//       const filters = columnFilters
//         .map((e) => {
//           console.log(e);
//           if (e.value["from"]) {
//             if (e.value?.to) {
//               return `${e.id} >= "${new Date(
//                 e.value?.from
//               ).toISOString()}" && ${e.id} <= "${new Date(
//                 e.value?.to
//               ).toISOString()}"`;
//             } else {
//               return `${e.id} >= "${new Date(
//                 e.value?.from
//               ).toISOString()}" && ${e.id} <= "${new Date(
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
//         .collection("attendance")
//         .getList(pageIndex + 1, pageSize, {
//           ...cleanObject({
//             filter: [searchQ, filters].filter((e) => e).join("&&"),
//             sort: sorters,
//             expand: `employee,branch`,
//           }),
//         })
//         .then((e) => {
//           return {
//             items: e?.items?.map((e) => {
//               return {
//                 id: e.id,
//                 date: new Date(e.date).toLocaleDateString("en-US", {
//                   day: "2-digit",
//                   month: "long",
//                   year: "numeric",
//                 }),
//                 clockin_time: new Date(e.clockin_time).toLocaleTimeString(),
//                 clockout_time: e.clockout_time
//                   ? new Date(e.clockout_time).toLocaleTimeString()
//                   : "N.A",
//                 behaviour: e.behaviour,
//                 employee: e?.expand?.employee?.name,
//                 branch: e.expand?.branch?.name || "N.A",
//                 type: e.type,
//                 total_hours:
//                   formatSeconds(
//                     differenceInSeconds(
//                       new Date(e.clockout_time || new Date()),
//                       new Date(e.clockin_time)
//                     )
//                   ) || "---",
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

//   const bulkImportModal = useModalState();

//   const editRow = useEditRow();

//   const confirmModal = useConfirmModal();

//   const handleDelete = (e) => {
//     confirmModal.setIsLoading(true);
//     return pocketbase
//       .collection("attendance")
//       .delete(e.id)
//       .then(() => {
//         recordsQuery.refetch();
//         confirmModal.close();
//         toast.success("Attendance deleted succesfully");
//       })
//       .catch((e) => {
//         confirmModal.setIsLoading(false);
//         toast.error(e.message);
//       });
//   };

//   return (
//     <>
//       <div className="px-4">
//         <div className="flex items-start justify-between space-y-2">
//           <div className="flex items-start gap-2 flex-col">
//             <h2 className="text-[17px] font-semibold tracking-tight">
//               Employee Attendance Logs
//             </h2>
//             <BreadCrumb
//               items={[{ title: "Attendance logs", link: "/dashboard" }]}
//             />
//           </div>
//           <div className="space-x-2">
//             <Button
//               onClick={() => {
//                 bulkImportModal.open();
//               }}
//               size="sm"
//               className="hover:bg-white"
//               variant="outline"
//             >
//               <PlusCircle size={16} className="mr-2" />
//               <span>Bulk upload</span>
//             </Button>
//             <Button
//               onClick={() => {
//                 newRecordModal.open();
//               }}
//               size="sm"
//             >
//               <PlusCircle size={16} className="mr-2" />
//               <span>Mark Attendance.</span>
//             </Button>
//           </div>
//         </div>
//         <DataTable
//           isFetching={recordsQuery.isFetching}
//           defaultColumnVisibility={{ type: false }}
//           isLoading={recordsQuery.status === "loading"}
//           data={recordsQuery?.data?.items || []}
//           columns={columns}
//           onSearch={(e) => {
//             setsearchText(e);
//           }}
//           sorting={sorting}
//           setSorting={setSorting}
//           pageCount={recordsQuery?.data?.totalPages}
//           setPagination={setPagination}
//           pageIndex={pageIndex}
//           pageSize={pageSize}
//           setColumnFilters={setColumnFilters}
//           columnFilters={columnFilters}
//           facets={[
//             {
//               title: "Behaviour",
//               name: "behaviour",
//               options: [
//                 { label: "Late", value: "late" },
//                 { label: "Early", value: "early" },
//               ],
//             },
//             {
//               title: "Type",
//               name: "type",
//               options: [
//                 { label: "auto", value: "auto" },
//                 { label: "manual", value: "manual" },
//               ],
//             },
//             {
//               title: "Attendance Date",
//               type: "date",
//               name: "created",
//             },
//             {
//               title: "Employee",
//               loader: ({ search }) => {
//                 console.log(search);
//                 return pocketbase
//                   .collection("users")
//                   .getFullList(
//                     cleanObject({
//                       filter: search ? `name~"${search}"` : "",
//                     })
//                   )
//                   .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
//               },
//               name: "employee",
//               type: "async-options",
//             },
//             {
//               title: "Branch",
//               loader: ({ search }) => {
//                 console.log(search);
//                 return pocketbase
//                   .collection("branches")
//                   .getFullList(
//                     cleanObject({
//                       filter: search ? `name~"${search}"` : "",
//                     })
//                   )
//                   .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
//               },
//               name: "branch",
//               type: "async-options",
//             },
//           ]}
//         />
//       </div>
//       <AttendanceFormModal
//         onComplete={() => {
//           recordsQuery.refetch();
//           newRecordModal.close();
//           editRow.close();
//         }}
//         record={editRow.row}
//         setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
//         open={newRecordModal.isOpen || editRow.isOpen}
//       />{" "}
//       <BulkAttendanceModal
//         onComplete={() => {
//           recordsQuery.refetch();
//           bulkImportModal.close();
//         }}
//         record={editRow.row}
//         setOpen={bulkImportModal.setisOpen}
//         open={bulkImportModal.isOpen}
//       />
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
//     </>
//   );
// }

import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { useAuth } from "@/context/auth.context";
import { addDays, differenceInSeconds } from "date-fns";
import formatSeconds from "@/utils/formatSeconds";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "react-feather";
import { AttendanceFormModal } from "@/components/modals/AttendanceFormModal";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { BulkAttendanceModal } from "@/components/modals/BulkAttendanceModal";

export default function AttendaceLogs() {
  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          // @ts-ignore
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
        <div className="capitalize">{row.getValue("employee")}</div>
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
        <div className="capitalize">{row.getValue("department")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true, // enable column hiding
    },
    {
      accessorKey: "branch",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Branch" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("branch")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("date")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clockin_time",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Clock In" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("clockin_time")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clockout_time",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Clock Out" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("clockout_time")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clockin_location",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Clockin Location" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("clockin_location")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "behaviour",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Behaviour" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("behaviour")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    
    {
      accessorKey: "total_hours",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total Hours" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("total_hours")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "lunch_start_time",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Lunch Start Time" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("lunch_start_time")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "lunch_end_time",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Lunch End Time" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("lunch_end_time")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "clockout_location",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Clockout Location" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("clockout_location")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("type")}</div>
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
        <div className="capitalize">{row.getValue("created")}</div>
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
              title: "Edit Attendance",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "delete Attendance",
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

  const [searchText, setsearchText] = useState("");

  const [columnFilters, setColumnFilters] = useState<any>([
    {
      id: "created",
      value: {
        from: new Date().toLocaleDateString(),
      },
    },
  ]);
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
      "attendance",
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
      const searchQ = searchText ? `name~"${searchText}"` : "";

      const filters = columnFilters
        .map((e) => {
          console.log(e);
          if (e.value["from"]) {
            if (e.value?.to) {
              return `${e.id} >= "${new Date(
                e.value?.from
              ).toISOString()}" && ${e.id} <= "${new Date(
                e.value?.to
              ).toISOString()}"`;
            } else {
              return `${e.id} >= "${new Date(
                e.value?.from
              ).toISOString()}" && ${e.id} <= "${new Date(
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
        .collection("attendance")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `employee.branch,employee.department`, // Correctly expand the relations
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                department: e?.expand?.employee?.expand?.department?.name || "N.A", // Access department name
                date: new Date(e.date).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                clockin_location: e.clockin_location,
                lunch_start_time: e.lunch_start_time,
                lunch_end_time: e.lunch_end_time,
                clockout_location: e.clockout_location,
                clockin_time: new Date(e.clockin_time).toLocaleTimeString(),
                clockout_time: e.clockout_time
                  ? new Date(e.clockout_time).toLocaleTimeString()
                  : "N.A",
                behaviour: e.behaviour,
                employee: e?.expand?.employee?.name,
                branch: e?.expand?.employee?.expand?.branch?.name || "N.A", // Access branch name
                type: e.type,
                total_hours:
                  formatSeconds(
                    differenceInSeconds(
                      new Date(e.clockout_time || new Date()),
                      new Date(e.clockin_time)
                    )
                  ) || "---",
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

  const bulkImportModal = useModalState();

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("attendance")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Attendance deleted succesfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  return (
    <>
      <div className="px-4">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-[17px] font-semibold tracking-tight">
              Employee Attendance Logs
            </h2>
            <BreadCrumb
              items={[{ title: "Attendance logs", link: "/dashboard" }]}
            />
          </div>
          <div className="space-x-2">
            <Button
              onClick={() => {
                bulkImportModal.open();
              }}
              size="sm"
              className="hover:bg-white"
              variant="outline"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Bulk upload</span>
            </Button>
            <Button
              onClick={() => {
                newRecordModal.open();
              }}
              size="sm"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Mark Attendance.</span>
            </Button>
          </div>
        </div>
        <DataTable
          isFetching={recordsQuery.isFetching}
          defaultColumnVisibility={{ type: false }}
          isLoading={recordsQuery.status === "loading"}
          data={recordsQuery?.data?.items || []}
          columns={columns}
          onSearch={(e) => {
            setsearchText(e);
          }}
          sorting={sorting}
          setSorting={setSorting}
          pageCount={recordsQuery?.data?.totalPages}
          setPagination={setPagination}
          pageIndex={pageIndex}
          pageSize={pageSize}
          setColumnFilters={setColumnFilters}
          columnFilters={columnFilters}
          facets={[
            {
              title: "Behaviour",
              name: "behaviour",
              options: [
                { label: "Late", value: "late" },
                { label: "Early", value: "early" },
              ],
            },
            {
              title: "Type",
              name: "type",
              options: [
                { label: "auto", value: "auto" },
                { label: "manual", value: "manual" },
              ],
            },
            {
              title: "Attendance Date",
              type: "date",
              name: "created",
            },
            {
              title: "Employee",
              loader: ({ search }) => {
                console.log(search);
                return pocketbase
                  .collection("users")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "employee",
              type: "async-options",
            },
            {
              title: "Branch",
              loader: ({ search }) => {
                console.log(search);
                return pocketbase
                  .collection("branches")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "branch",
              type: "async-options",
            },
          ]}
        />
      </div>
      <AttendanceFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />{" "}
      <BulkAttendanceModal
        onComplete={() => {
          recordsQuery.refetch();
          bulkImportModal.close();
        }}
        record={editRow.row}
        setOpen={bulkImportModal.setisOpen}
        open={bulkImportModal.isOpen}
      />
      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
        a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
