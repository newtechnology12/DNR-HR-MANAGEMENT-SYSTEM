import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
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
import useModalState from "@/hooks/useModalState";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import AppFormSelect from "@/components/forms/AppFormSelect";
import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
import Loader from "@/components/icons/Loader";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "react-feather";
import StatCard from "@/components/StatCard";
import { Banknote, FileStack, TrendingUp, Wallet } from "lucide-react";

const formatYearAndMonth = (month, year) => {
  return (
    {
      1: "January",
      2: "February",
      3: "March",
      4: "April",
      5: "May",
      6: "June",
      7: "July",
      8: "August",
      9: "September",
      10: "October",
      11: "November",
      12: "December",
    }[month] +
    "-" +
    year
  );
};

export default function Payroll() {
  const navigate = useNavigate();
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
      accessorKey: "period",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
      cell: ({ row }) => (
        <div className="truncate">{row.getValue("period")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "branch",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Branch" />
      ),
      cell: ({ row }) => (
        <div className="truncate">{row.getValue("branch")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "total_gross",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total gross" />
      ),
      cell: ({ row }) => (
        <div>
          {Number(row.getValue("total_gross") || 0).toLocaleString()} FRW
        </div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "total_net",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total net" />
      ),
      cell: ({ row }) => (
        <div>{Number(row.getValue("total_net") || 0).toLocaleString()} FRW</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "employees",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Employees" />
      ),
      cell: ({ row }) => <div>{row.getValue("employees")}</div>,
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "created_by",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created by" />
      ),
      cell: ({ row }) => <div>{row.getValue("created_by")}</div>,
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
        <Button
          size={"sm"}
          onClick={() => {
            navigate(`/dashboard/hr/payroll/${row.original.id}`);
          }}
          className="text-blue-500"
          variant="link"
        >
          View Details
        </Button>
      ),
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
      "payrolls",
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
        ? `month~"${searchText}" || branch.name~"${searchText}"`
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
        .collection("payrolls")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `created_by,branch`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                total_gross: e.total_gross,
                total_net: e.total_net,
                period_cycle: e.period_cycle,
                period: formatYearAndMonth(e.month, e.year),
                employees: e?.payslips?.length || 0,
                created_by: e.expand?.created_by?.name,
                credits_covered: e?.credits_covered || 0,
                branch: e.expand?.branch?.name,
                date: new Date(e.created).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
                created: new Date(e.created).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
              };
            }),
            totalPages: e.totalPages,
          };
        });
    },
    enabled: true,
  });

  const statsQuery = useQuery({
    queryKey: ["payroll-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString();

      const [total, thisMonth, all] = await Promise.all([
        pocketbase.collection("payrolls").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("payrolls")
          .getList(1, 1, { filter: `created >= "${startOfMonth}"` })
          .then((e) => e.totalItems),
        pocketbase.collection("payrolls").getFullList({ fields: "total_gross,total_net" }),
      ]);

      const totalGross = all.reduce((acc, e: any) => acc + (Number(e.total_gross) || 0), 0);
      const totalNet = all.reduce((acc, e: any) => acc + (Number(e.total_net) || 0), 0);

      return { total, thisMonth, totalGross, totalNet };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const newRecordModal = useModalState();

  return (
    <>
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Payrolls"
            icon={FileStack}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All payroll runs"
          />
          <StatCard
            title="This Month"
            icon={TrendingUp}
            tone="info"
            loading={statsLoading}
            value={statsQuery.data?.thisMonth}
            description="Payrolls created this month"
          />
          <StatCard
            title="Total Gross"
            icon={Banknote}
            tone="warning"
            loading={statsLoading}
            value={statsQuery.data?.totalGross?.toLocaleString() + " FRW"}
            description="Sum of all gross payroll"
          />
          <StatCard
            title="Total Net"
            icon={Wallet}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.totalNet?.toLocaleString() + " FRW"}
            description="Sum of all net payroll"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Employees Payroll
            </h2>
            <BreadCrumb
              items={[{ title: "Payroll", link: "/dashboard" }]}
            />
          </div>
          <Button
            onClick={() => {
              newRecordModal.open();
            }}
            size="sm"
          >
            <PlusCircle size={16} />
            <span>Create Payroll</span>
          </Button>
        </div>
        <DataTable
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
              title: "Date",
              type: "date",
              name: "created",
            },
          ]}
        />
      </div>
      <PayrollFormModal
        onComplete={() => {
          newRecordModal.close();
        }}
        setOpen={newRecordModal.setisOpen}
        open={newRecordModal.isOpen}
      />
    </>
  );
}

const formSchema = z.object({
  period_year: z.string().min(1, "Period year is required"),
  period_month: z.string().min(1, "Period month is required"),
  branch: z.string().min(1, "Branch is required"),
});

export function PayrollFormModal({ open, setOpen }: any) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      period_year: new Date().getFullYear().toString(),
      period_month: (new Date().getMonth() + 1).toString(),
      branch: "",
    },
  });

  const navigate = useNavigate();

  const [error, seterror] = useState(undefined);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    seterror(undefined);
    const data = {
      ...values,
    };

    const existing_payroll = await pocketbase
      .collection("payrolls")
      .getFullList({
        filter: `month="${values.period_month}" && year="${values.period_year}" && branch="${values.branch}"`,
      });

    if (existing_payroll[0]?.id) return seterror("Payroll already exists");

    navigate(`/dashboard/hr/payroll/create`, { state: data });
    setOpen(false);
  }

  function branchesLoader({ search }) {
    return pocketbase
      .collection("branches")
      .getFullList({
        filter: search ? `name~"${search}"` : "",
      })
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-[15px] px-1 font-semibold py-2">
              Create a new payroll
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to create a new payroll.
            </span>
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert
            variant="destructive"
            className="!mt-4 h-fit p-2 my-3"
          >
            <AlertCircle className="h-4 -mt-[6px] w-4" />
            <AlertTitle className=" ml-2 !text-left">
              <span className="text-[13.8px] font-medium leading-5">
                {error}
              </span>
            </AlertTitle>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-1 gap-2">
              <div className="grid gap-2 grid-cols-2">
                <AppFormSelect
                  form={form}
                  label={"Choose period year"}
                  placeholder={"Choose period year"}
                  name={"period_year"}
                  options={[
                    "2021",
                    "2022",
                    "2023",
                    "2024",
                    "2025",
                    "2026",
                    "2027",
                    "2028",
                    "2029",
                    "2030",
                  ].map((e) => ({ label: e, value: e }))}
                />
                <AppFormSelect
                  form={form}
                  label={"Choose period month"}
                  placeholder={"Choose period month"}
                  name={"period_month"}
                  options={[
                    { label: "January", value: "1" },
                    { label: "February", value: "2" },
                    { label: "March", value: "3" },
                    { label: "April", value: "4" },
                    { label: "May", value: "5" },
                    { label: "June", value: "6" },
                    { label: "July", value: "7" },
                    { label: "August", value: "8" },
                    { label: "September", value: "9" },
                    { label: "October", value: "10" },
                    { label: "November", value: "11" },
                    { label: "December", value: "12" },
                  ]}
                />
              </div>
              <AppFormAsyncSelect
                form={form}
                label={"Choose branch"}
                placeholder={"Choose branch"}
                name={"branch"}
                loader={branchesLoader}
              />
            </div>
            <DialogFooter>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button
                  type="button"
                  onClick={() => form.reset()}
                  className="w-full text-slate-600"
                  size="sm"
                  variant="outline"
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  disabled={
                    form.formState.disabled || form.formState.isSubmitting
                  }
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  Create Payroll
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
