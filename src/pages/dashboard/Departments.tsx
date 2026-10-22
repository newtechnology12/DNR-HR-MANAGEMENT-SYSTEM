import { useEffect, useState } from "react";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useAuth } from "@/context/auth.context";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import {
  Button,
  Card,
  Column,
  ConfirmDialog,
  DataTable,
  DocNo,
  EmptyState,
  Field,
  FilterBar,
  Input,
  KpiBand,
  Modal,
  Page,
  PageHeader,
  Pager,
  Person,
  Select,
  fmtDate,
  fmtNumber,
} from "@/components/ims";

type Row = { id: string; name: string; manager?: string; created: string; original: any };

export default function Departments() {
  const [searchText, setsearchText] = useState("");
  const [search] = useDebounce(searchText, 300);

  // The old table offered a status facet; departments have no status field, so no filters remain.
  const columnFilters: { id: string; value: string[] }[] = [];
  const [sorting, setSorting] = useState([
    {
      id: "created",
      desc: true,
    },
  ]);
  const sort = sorting.map((p) => `${p.desc ? "-" : ""}${p.id}`)[0];

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  useEffect(() => setPageIndex(0), [search, sort, pageSize]);

  const recordsQuery = useQuery({
    queryKey: [
      "departments",
      {
        columnFilters,
        search,
        sort: sorting,
        pageIndex,
        pageSize,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = search ? `name~"${search}"` : "";
      const filters = columnFilters
        .map((e) => {
          return e.value.map((p) => `${e.id}="${p}"`).join(" || ");
        })
        .join(" && ");

      const sorters = sorting.map((p) => `${p.desc ? "-" : "+"}${p.id}`).join(" && ");

      return pocketbase
        .collection("departments")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join("&&"),
            sort: sorters,
            expand: `departments,created_by,head`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map(
              (e): Row => ({
                id: e.id,
                name: e.name,
                manager: e.expand?.head?.name,
                created: e.created,
                original: e,
              })
            ),
            totalPages: e.totalPages,
            totalItems: e.totalItems,
          };
        });
    },
    enabled: true,
  });

  const statsQuery = useQuery({
    queryKey: ["departments-stats"],
    queryFn: async () => {
      const [total, employees, designations, withManager] = await Promise.all([
        pocketbase.collection("departments").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("users").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("designations").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("departments")
          .getList(1, 1, { filter: `head != ""` })
          .then((e) => e.totalItems),
      ]);
      return { total, employees, designations, withManager };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const [deleting, setDeleting] = useState<any>(null);

  const handleDelete = async () => {
    try {
      await pocketbase.collection("departments").delete(deleting.id);
      recordsQuery.refetch();
      toast.success(`${deleting.name} deleted`);
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", nowrap: true, cell: (r) => <DocNo value={r.original.code} /> },
    {
      key: "name",
      header: "Department",
      sortField: "name",
      clamp: true,
      cell: (r) => <span className="font-semibold">{r.name}</span>,
      sub: (r) => r.original.description,
    },
    { key: "manager", header: "Head of department", className: "max-w-[240px]", cell: (r) => (r.manager ? <Person name={r.manager} /> : <span className="text-ims-faint">Not assigned</span>) },
    { key: "created", header: "Created", sortField: "created", nowrap: true, cell: (r) => fmtDate(r.created) },
  ];

  const data = recordsQuery.data;
  const s = statsQuery.data;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Departments" }]}
        title="Departments"
        subtitle="Organisational units, each with the head who approves its requests."
        primary={{ label: "New department", icon: Plus, onClick: () => newRecordModal.open() }}
      />

      <KpiBand
        loading={statsLoading}
        items={[
          { label: "Departments", value: fmtNumber(s?.total) },
          { label: "Employees", value: fmtNumber(s?.employees), sub: "Across all departments" },
          { label: "Designations", value: fmtNumber(s?.designations), sub: "Job titles defined" },
          { label: "With a head", value: fmtNumber(s?.withManager), sub: "Head of department assigned" },
        ]}
      />

      {/* "relative" keeps the table's hidden Actions header inside the card on phones. */}
      <Card padded={false} className="relative overflow-hidden">
        <FilterBar
          search={{ value: searchText, onChange: setsearchText, placeholder: "Search department name" }}
          right={
            <TableTools
              importConfig={IMPORTS.departments}
              onImported={() => recordsQuery.refetch()}
              exportConfig={{
                title: "Departments",
                fileName: "departments",
                what: "departments",
                permission: ["view_departments", "create_department"],
                rows: () => pocketbase.collection("departments").getFullList({ sort: "name", expand: "head" }),
                columns: [
                  { header: "Name", value: (r: any) => r.name, width: 34 },
                  { header: "Code", value: (r: any) => r.code || "" },
                  { header: "Head of department", value: (r: any) => r.expand?.head?.name || "" },
                  { header: "Description", value: (r: any) => r.description || "", width: 40 },
                ],
              }}
            />
          }
        />
        <DataTable
          caption="Departments"
          columns={columns}
          rows={data?.items || []}
          rowKey={(r) => r.id}
          onRowClick={(r) => editRow.edit(r.original)}
          rowActions={() => [
            { label: "Edit", icon: Pencil, onSelect: (r) => editRow.edit(r.original) },
            { label: "Delete", icon: Trash2, danger: true, onSelect: (r) => setDeleting(r.original) },
          ]}
          sort={sort}
          onSort={(v) => setSorting([{ id: v.replace(/^-/, ""), desc: v.startsWith("-") }])}
          loading={recordsQuery.status === "loading"}
          fetching={recordsQuery.isFetching}
          error={recordsQuery.isError ? recordsQuery.error : undefined}
          onRetry={() => recordsQuery.refetch()}
          empty={
            <EmptyState
              icon={Building2}
              text={search ? "No department matches this search. Change the search." : "No departments yet. Add one with New department."}
              action={!search ? <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>New department</Button> : undefined}
            />
          }
          footer={
            data && data.totalItems > 0 ? (
              <Pager page={pageIndex + 1} perPage={pageSize} total={data.totalItems} onPage={(p) => setPageIndex(p - 1)} onPerPage={setPageSize} />
            ) : null
          }
        />
      </Card>

      <DepartmentDialog
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        onClose={() => (editRow.isOpen ? editRow.close() : newRecordModal.close())}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || "this department"}?`}
        description="The department is removed for good. Employees in it keep their record but lose this department. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
      />
    </Page>
  );
}

/** Create or edit a department: its name and the head who approves "Department head" workflow steps. */
function DepartmentDialog({ open, onClose, record, onComplete }: { open: boolean; onClose: () => void; record?: any; onComplete: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  // Stored in "head"; used as the approver for "Department head" workflow steps.
  const [manager, setManager] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(record?.name || "");
      setManager(record?.head || "");
      setTouched(false);
    }
  }, [open, record]);

  const people = useQuery(
    ["department-head-options"],
    () => pocketbase.collection("users").getFullList({ filter: `status="Active"`, sort: "name" }).then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id }))),
    { enabled: open, staleTime: 60_000 }
  );
  const options = [...(people.data || [])];
  // A current head who is no longer active still shows as chosen.
  if (record?.head && !options.some((o) => o.value === record.head)) options.unshift({ label: record.expand?.head?.name || "Current head", value: record.head });

  const nameError = touched && !name.trim() ? "Enter the department name." : null;
  const managerError = touched && !manager ? "Choose the head of the department." : null;

  async function onSubmit() {
    setTouched(true);
    if (!name.trim() || !manager) {
      document.getElementById(!name.trim() ? "dep-name" : "dep-head")?.focus();
      return;
    }
    const data = {
      name: name.trim(),
      head: manager,
    };
    setBusy(true);
    try {
      if (!record) await pocketbase.collection("departments").create({ ...data, created_by: user.id });
      else await pocketbase.collection("departments").update(record.id, data);
      onComplete();
      toast.success(record ? `${data.name} updated` : `${data.name} created`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title={record ? `Edit ${record.name}` : "New department"}
      description="The head approves the department's requests."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="department-form" loading={busy}>{record ? "Save changes" : "Create department"}</Button>
        </>
      }
    >
      <form
        id="department-form"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Department name" required htmlFor="dep-name" error={nameError}>
          <Input id="dep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance and Administration" invalid={Boolean(nameError)} aria-describedby={nameError ? "dep-name-error" : undefined} />
        </Field>
        <Field label="Head of department" required htmlFor="dep-head" error={managerError} hint="Approves the department's requests in the workflow.">
          <Select id="dep-head" value={manager} onChange={(e) => setManager(e.target.value)} invalid={Boolean(managerError)} aria-describedby={managerError ? "dep-head-error" : "dep-head-hint"}>
            <option value="">{people.isLoading ? "Loading people…" : "Choose a person"}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
