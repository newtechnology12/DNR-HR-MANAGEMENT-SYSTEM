/**
 * Settings → Branches: the organisation's offices, their manager and status, with Excel import and
 * export. Create and edit open the branch form; deleting asks first.
 */
import { useState } from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import { BranchFormModal } from "@/components/modals/BranchesFormModal";
import {
  Button,
  Card,
  Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  KpiBand,
  Pager,
  StatusPill,
  fmtDate,
  fmtNumber,
} from "@/components/ims";

type Sort = { id: string; desc: boolean };
type ColumnFilter = { id: string; value: string[] };

export default function Branches() {
  const [searchText, setsearchText] = useState("");

  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [sorting, setSorting] = useState<Sort[]>([
    {
      id: "created",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "branches",
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
          return e.value.map((p) => `${e.id}="${p}"`).join(" || ");
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("branches")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `manager`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                name: e.name,
                description: e.description,
                manager: e.expand?.manager?.name,
                status: e.status,
                location: e.location,
                created: e.created,
                updated: e.updated,
                original: e,
              };
            }),
            totalPages: e.totalPages,
            totalItems: e.totalItems,
          };
        });
    },
    enabled: true,
  });

  const statsQuery = useQuery({
    queryKey: ["branches-stats"],
    queryFn: async () => {
      const [total, active, inactive, employees] = await Promise.all([
        pocketbase.collection("branches").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("branches")
          .getList(1, 1, { filter: `status="active"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("branches")
          .getList(1, 1, { filter: `status="inactive"` })
          .then((e) => e.totalItems),
        pocketbase.collection("users").getList(1, 1, {}).then((e) => e.totalItems),
      ]);
      return { total, active, inactive, employees };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const [deleting, setDeleting] = useState<any>(null);

  const handleDelete = (e: any) => {
    return pocketbase
      .collection("branches")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        setDeleting(null);
        toast.success(`${e.name || "Branch"} deleted`);
      })
      .catch((err) => {
        toast.error(err.message);
        throw err;
      });
  };

  // The table's sort ("-name") and status filter map onto the query's sorting and column filters.
  const sort = sorting[0] ? `${sorting[0].desc ? "-" : ""}${sorting[0].id}` : "";
  const onSort = (s: string) => {
    setSorting([{ id: s.replace(/^-/, ""), desc: s.startsWith("-") }]);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };
  const status = columnFilters.find((f) => f.id === "status")?.value[0] || "";
  const setStatus = (v: string) => {
    setColumnFilters(v ? [{ id: "status", value: [v] }] : []);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };
  const items = recordsQuery.data?.items || [];
  const total = recordsQuery.data?.totalItems || 0;
  const filtered = Boolean(searchText || status);

  const columns: Column<any>[] = [
    { key: "name", header: "Name", sortField: "name", clamp: true, cell: (r) => <span className="font-semibold">{r.name}</span>, sub: (r) => r.description },
    { key: "manager", header: "Manager", cell: (r) => r.manager || <span className="text-ims-faint">—</span> },
    { key: "location", header: "Location", sortField: "location", clamp: true, cell: (r) => r.location || <span className="text-ims-faint">—</span> },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      cell: (r) => (r.status ? <StatusPill status={r.status === "active" ? "Active" : r.status === "inactive" ? "Inactive" : r.status} /> : <span className="text-ims-faint">—</span>),
    },
    { key: "created", header: "Created", sortField: "created", nowrap: true, cell: (r) => fmtDate(r.created) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiBand
        loading={statsLoading}
        items={[
          { label: "Branches", value: fmtNumber(statsQuery.data?.total), sub: "Across the organisation" },
          { label: "Active", value: fmtNumber(statsQuery.data?.active), tone: "success", onClick: () => setStatus("active") },
          { label: "Inactive", value: fmtNumber(statsQuery.data?.inactive), onClick: () => setStatus("inactive") },
          { label: "Employees", value: fmtNumber(statsQuery.data?.employees), sub: "In all branches" },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <FilterBar
          search={{
            value: searchText,
            onChange: (v) => {
              setsearchText(v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            },
            placeholder: "Search branch name",
          }}
          chips={status ? [{ key: "status", label: `Status: ${status === "active" ? "Active" : "Inactive"}`, onRemove: () => setStatus("") }] : []}
          onClear={() => setStatus("")}
          right={
            <>
            <TableTools
              importConfig={IMPORTS.branches}
              onImported={() => recordsQuery.refetch()}
              exportConfig={{
                title: "Offices", fileName: "offices", what: "branches",
                rows: async () => {
                  const [rows, users] = await Promise.all([
                    pocketbase.collection("branches").getFullList({ sort: "name" }),
                    pocketbase.collection("users").getFullList({ fields: "id,name" }),
                  ]);
                  const names = Object.fromEntries(users.map((u: any) => [u.id, u.name]));
                  return rows.map((r: any) => ({ ...r, manager_name: names[r.manager] || "" }));
                },
                columns: [
                  { header: "Office", value: (r: any) => r.name, width: 28 },
                  { header: "Location", value: (r: any) => r.location || "", width: 30 },
                  { header: "Manager", value: (r: any) => r.manager_name },
                  { header: "Status", value: (r: any) => r.status || "" },
                ],
              }}
            />
            <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>New branch</Button>
            </>
          }
        >
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          sort={sort}
          onSort={onSort}
          loading={recordsQuery.status === "loading"}
          fetching={recordsQuery.isFetching}
          error={recordsQuery.isError ? recordsQuery.error : undefined}
          onRetry={() => recordsQuery.refetch()}
          minWidth={760}
          caption="Branches"
          onRowClick={(r) => editRow.edit(r.original)}
          rowActions={() => [
            { label: "Edit", icon: Pencil, onSelect: (r) => editRow.edit(r.original) },
            { label: "Delete", icon: Trash2, danger: true, onSelect: (r) => setDeleting(r) },
          ]}
          empty={
            <EmptyState
              icon={Building2}
              text={filtered ? "No branch matches. Change the search or clear the filter." : "No branches yet. Add the first office with New branch."}
              action={!filtered ? <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>New branch</Button> : undefined}
            />
          }
          footer={
            total > 0 ? (
              <Pager
                page={pageIndex + 1}
                perPage={pageSize}
                total={total}
                onPage={(p) => setPagination((x) => ({ ...x, pageIndex: p - 1 }))}
                onPerPage={(n) => setPagination({ pageIndex: 0, pageSize: n })}
                sizes={[10, 30, 50]}
              />
            ) : null
          }
        />
      </Card>

      <BranchFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || "this branch"}?`}
        description="The branch is removed for good. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(deleting)}
      />
    </div>
  );
}
