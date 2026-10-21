import DataTable from "@/components/DataTable";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useRef, useState } from "react";
import { useQuery } from "react-query";
import BreadCrumb from "@/components/breadcrumb";
import { PlusCircle, Printer } from "react-feather";
import { Button } from "@/components/ui/button";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useEditRow from "@/hooks/use-edit-row";
import useConfirmModal from "@/hooks/useConfirmModal";
import StatCard from "@/components/StatCard";
import { AlertTriangle, Package, PackageCheck } from "lucide-react";
import useModalState from "@/hooks/useModalState";
import { toast } from "sonner";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import { AssetsFormModal } from "@/components/modals/AssetsFormModal";
import Barcode from "react-barcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import html2canvas from "html2canvas";
import formatFilter from "@/utils/formatFilter";

export default function Assets() {
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
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="capitalize truncate">{row.getValue("name")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "assigned_to",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Assigned to" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("assigned_to")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("category")}</div>
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
        <div className="capitalize truncate">{row.getValue("type")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "serial_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Serial Number" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("serial_number")}</div>
      ),
      filterFn: (__, _, value) => {
        return value;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Code" />
      ),
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue("code")}</div>
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
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        if (!status) return <span className="text-slate-400">---</span>;
        const tone =
          status === "returned" || status === "in_stock"
            ? "success"
            : status === "lost" || status === "damaged"
            ? "danger"
            : status === "in_transit"
            ? "warning"
            : "info";
        return (
          <Badge variant={tone} className="capitalize">
            {status.replace(/[-_]/g, " ")}
          </Badge>
        );
      },
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
              title: "Edit asset",
              onClick: (e) => {
                editRow.edit(e.original);
              },
            },
            {
              title: "delete asset",
              onClick: (e) => {
                confirmModal.open({ meta: e });
              },
            },
            // barcode
            {
              title: "Show barcode",
              onClick: (e) => {
                setrecordToShowBarcode(e.original);
              },
            },
          ]}
          row={row}
        />
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
      "assets",
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
        ? `name~"${searchText}" || serial_number~"${searchText}" || code~"${searchText}" || type~"${searchText}" || status~"${searchText}" || category.name~"${searchText}"`
        : "";
      const filters = formatFilter(columnFilters);

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("assets")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `assigned_to,category,type`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                name: e.name,
                type: e.expand?.type?.name,
                serial_number: e.serial_number || "N.A",
                code: e.code,
                status: e.status,
                category: e.expand?.category?.name,
                assigned_to: e?.expand?.assigned_to?.name,
                created: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                updated: new Date(e.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
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

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("assets")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Asset deleted successfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();
  const newRecordModal = useModalState();

  const [recordToShowBarcode, setrecordToShowBarcode] = useState(undefined);

  const statsQuery = useQuery({
    queryKey: ["assets-stats"],
    queryFn: async () => {
      const [total, inUse, inStock, lostOrDamaged] = await Promise.all([
        pocketbase.collection("assets").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("assets")
          .getList(1, 1, { filter: `status="in-use" || status="assigned"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("assets")
          .getList(1, 1, { filter: `status="in_stock"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("assets")
          .getList(1, 1, { filter: `status="lost" || status="damaged"` })
          .then((e) => e.totalItems),
      ]);
      return { total, inUse, inStock, lostOrDamaged };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      {" "}
      <div className="px-4">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Assets"
            icon={Package}
            tone="default"
            loading={statsLoading}
            value={statsQuery.data?.total}
            description="All company assets"
          />
          <StatCard
            title="In Use"
            icon={PackageCheck}
            tone="info"
            loading={statsLoading}
            value={statsQuery.data?.inUse}
            description="Assigned to employees"
          />
          <StatCard
            title="In Stock"
            icon={Package}
            tone="success"
            loading={statsLoading}
            value={statsQuery.data?.inStock}
            description="Available in inventory"
          />
          <StatCard
            title="Lost / Damaged"
            icon={AlertTriangle}
            tone="danger"
            loading={statsLoading}
            value={statsQuery.data?.lostOrDamaged}
            description="Needs attention"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">All Assets</h2>
            <BreadCrumb items={[{ title: "Assets", link: "/dashboard" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TableTools
              importConfig={IMPORTS.assets}
              onImported={() => recordsQuery.refetch()}
              exportConfig={{
                title: "Equipment register", fileName: "equipment-register", what: "assets", orientation: "landscape", permission: ["view_assets", "export_assets"],
                rows: () => pocketbase.collection("assets").getFullList({ sort: "code", expand: "category,type,assigned_to,department,supplier" }),
                totals: ["Cost (RWF)"],
                columns: [
                  { header: "Tag", value: (r: any) => r.code || "" },
                  { header: "Name", value: (r: any) => r.name, width: 30 },
                  { header: "Category", value: (r: any) => r.expand?.category?.name || "" },
                  { header: "Type", value: (r: any) => r.expand?.type?.name || "" },
                  { header: "Serial number", value: (r: any) => r.serial_number || "" },
                  { header: "Status", value: (r: any) => String(r.status || "").replace(/[_-]/g, " ") },
                  { header: "Custodian", value: (r: any) => r.expand?.assigned_to?.name || "" },
                  { header: "Department", value: (r: any) => r.expand?.department?.name || "" },
                  { header: "Supplier", value: (r: any) => r.expand?.supplier?.name || "" },
                  { header: "Purchase date", value: (r: any) => r.purchased_at || "", format: "date" },
                  { header: "Cost (RWF)", value: (r: any) => Number(r.cost) || 0, format: "money" },
                ],
              }}
            />
            <Button
              onClick={() => {
                newRecordModal.open();
              }}
              size="sm"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Create new Asset.</span>
            </Button>
          </div>
        </div>
        <DataTable
          // className="!border-none !p-0"
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
              title: "Type",
              loader: ({ search }) => {
                return pocketbase
                  .collection("assets_types")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "type",
              type: "async-options",
            },
            {
              title: "Category",
              loader: ({ search }) => {
                return pocketbase
                  .collection("assets_categories")
                  .getFullList(
                    cleanObject({
                      filter: search ? `name~"${search}"` : "",
                    })
                  )
                  .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
              },
              name: "category",
              type: "async-options",
            },
            {
              title: "Status",
              name: "status",
              options: [
                { value: "in-use", label: "In use" },
                { value: "assigned", label: "assigned" },
                { value: "returned", label: "returned" },
                { value: "lost", label: "lost" },
                {
                  value: "damaged",
                  label: "damaged",
                },
                {
                  value: "in_stock",
                  label: "in stock",
                },
                {
                  value: "in_transit",
                  label: "in transit",
                },
                {
                  value: "maintenance",
                  label: "maintenance",
                },
              ],
            },
            {
              title: "Assigned to",
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
              name: "assigned_to",
              type: "async-options",
            },
          ]}
        />
      </div>
      <AssetsFormModal
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
        title={"Are you sure you want to delete?"}
        description={"This action cannot be undone. This will permanently delete the selected record."}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
      <BarcodeModal
        open={recordToShowBarcode}
        setOpen={setrecordToShowBarcode}
        code={recordToShowBarcode?.code}
        name={recordToShowBarcode?.name}
      />
    </>
  );
}

function BarcodeModal({ open, setOpen, code, name }) {
  const wrapper_ref = useRef();

  const onClick = (e) => {
    const opt = {
      scale: 4,
    };
    const elem = wrapper_ref.current;
    html2canvas(elem, opt).then((canvas: any) => {
      const iframe: any = document.createElement("iframe");
      iframe.name = "printf";
      iframe.id = "printf";
      iframe.height = 0;
      iframe.width = 0;
      document.body.appendChild(iframe);

      const imgUrl = canvas.toDataURL({
        format: "jpeg",
        quality: "1.0",
      });

      const style = `
            height:100vh;
            width:100vw;
            position:absolute;
            left:0:
            top:0;
        `;

      const url = `<img style="${style}" src="${imgUrl}"/>`;
      var newWin = window.frames["printf"];
      newWin.document.write(`<body onload="window.print()">${url}</body>`);
      newWin.document.close();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {name} barcode
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Here is the barcode for {name}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="w-full py-2 flex items-center justify-center bg-slate-300-">
          <div ref={wrapper_ref}>
            <Barcode value={code} />
          </div>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-slate-600"
              size="sm"
              variant="outline"
            >
              Close
            </Button>
            <Button
              onClick={onClick}
              type="submit"
              className="w-full"
              size="sm"
            >
              <Printer className="mr-2 h-4 w-4 text-white" />
              Print Bar code
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
