// import DataTable from "@/components/DataTable";
// import { ColumnDef, PaginationState } from "@tanstack/react-table";
// import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
// import { Checkbox } from "@/components/ui/checkbox";
// import pocketbase from "@/lib/pocketbase";
// import cleanObject from "@/utils/cleanObject";
// import { useState } from "react";
// import { useQuery } from "react-query";
// import DataTableRowActions from "@/components/datatable/DataTableRowActions";
// import { addDays, differenceInSeconds } from "date-fns";
// import formatSeconds from "@/utils/formatSeconds";

// export default function EmployeeAttendances({ employeeId }) {
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
//       accessorKey: "date",
//       header: ({ column }) => (
//         <DataTableColumnHeader column={column} title="Date" />
//       ),
//       cell: ({ row }) => (
//         <div className="capitalize">{row.getValue("date")}</div>
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
//       cell: ({ row }) => <DataTableRowActions actions={[]} row={row} />,
//     },
//   ];

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
//       "employee-attendances",
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
//       const searchQ = searchText ? `name~"${searchText}"` : "";

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
//         .collection("attendance")
//         .getList(pageIndex + 1, pageSize, {
//           ...cleanObject({
//             filter: [searchQ, filters, `employee="${employeeId}"`]
//               .filter((e) => e)
//               .join("&&"),
//             sort: sorters,
//             expand: ``,
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
//                 type: e.type || "N.A",
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
//     enabled: Boolean(employeeId),
//   });

//   return (
//     <>
//       <DataTable
//         className="!border-none !p-0"
//         isFetching={recordsQuery.isFetching}
//         defaultColumnVisibility={{}}
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
//         facets={[
//           {
//             title: "Behaviour",
//             name: "behaviour",
//             options: [
//               { label: "Late", value: "late" },
//               { label: "Early", value: "early" },
//             ],
//           },
//           {
//             title: "Type",
//             name: "type",
//             options: [
//               { label: "auto", value: "auto" },
//               { label: "manual", value: "manual" },
//             ],
//           },
//           {
//             title: "Attendance Date",
//             type: "date",
//             name: "created",
//           },
//           {
//             title: "Employee",
//             loader: ({ search }) => {
//               console.log(search);
//               return pocketbase
//                 .collection("users")
//                 .getFullList(
//                   cleanObject({
//                     filter: search ? `name~"${search}"` : "",
//                   })
//                 )
//                 .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
//             },
//             name: "employee",
//             type: "async-options",
//           },
//         ]}
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
import { addDays, differenceInSeconds } from "date-fns";
import formatSeconds from "@/utils/formatSeconds";

export default function EmployeeAttendances({ employeeId }) {
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
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("date")}</div>
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
      accessorKey: "clockin_location", // Add location column",
      header: ({ column }) => ( 
        <DataTableColumnHeader column={column} title="Clock In Location" />
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
      accessorKey: "clockout_location", // Add location column",
      header: ({ column }) => ( 
        <DataTableColumnHeader column={column} title="Clock Out Location" />
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

    // {
    //   accessorKey: "lunch_break",
    //   header: ({ column }) => (
    //     <DataTableColumnHeader column={column} title="Lunch Break" />
    //   ),
    //   cell: ({ row }) => (
    //     <div className="capitalize">{row.getValue("lunch_break")}</div>
    //   ),
    //   filterFn: (__, _, value) => {
    //     return value;
    //   },
    //   enableSorting: true,
    //   enableHiding: true,
    // },
    // {
    //   accessorKey: "lunch_late",
    //    header: "Lunch Late",
    //   cell: ({ row }) => (
    //     <div className="capitalize">{row.getValue("lunch_late")}</div>
    //   ),
    //   filterFn: (__, _, value) => {
    //     return value;
    //   },
    //   enableSorting: true,
    //   enableHiding: true,
    // },

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
      cell: ({ row }) => <DataTableRowActions actions={[]} row={row} />,
    },
  ];

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

  const recordsQuery = useQuery({
    queryKey: [
      "employee-attendances",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        employeeId,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText ? `name~"${searchText}"` : "";

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
        .collection("attendance")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `employee="${employeeId}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: ``,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                date: new Date(e.date).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
                clockin_time: new Date(e.clockin_time).toLocaleTimeString(),
                clockout_time: e.clockout_time
                  ? new Date(e.clockout_time).toLocaleTimeString()
                  : "N.A",
                behaviour: e.behaviour,
                type: e.type || "N.A",
                total_hours:
                  formatSeconds(
                    differenceInSeconds(
                      new Date(e.clockout_time || new Date()),
                      new Date(e.clockin_time)
                    )
                  ) || "---",
                clockin_location: e.clockin_location || "is loading...",
                clockout_location: e.clockout_location || "is loading...",
                lunch_start_time: e.lunch_start_time
                  ? new Date(e.lunch_start_time).toLocaleTimeString()
                  : "N.A",
                lunch_end_time: e.lunch_end_time
                  ? new Date(e.lunch_end_time).toLocaleTimeString()
                  : "N.A",
                lunch_break:
                  formatSeconds(
                    differenceInSeconds(
                      new Date(e.lunch_end_time || new Date()),
                      new Date(e.lunch_start_time)
                    )
                  ) || "---",
                lunch_late: e.lunch_late || "N.A",
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
    enabled: Boolean(employeeId),
  });

  return (
    <>
      <DataTable
        className="!border-none !p-0"
        isFetching={recordsQuery.isFetching}
        defaultColumnVisibility={{}}
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
        ]}
      />
    </>
  );
}
