import { ChangeEvent, useEffect, useState } from "react";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import formatFilter from "@/utils/formatFilter";
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
  EmptyState,
  Field,
  FilterBar,
  FilterChip,
  FilterSelect,
  Input,
  KpiBand,
  Modal,
  Page,
  PageHeader,
  Pager,
  Select,
  Textarea,
  fmtDate,
  fmtNumber,
} from "@/components/ims";

type Row = { id: string; name: string; department?: string; created: string; original: any };

export default function Designations() {
  const [searchText, setsearchText] = useState("");
  const [search] = useDebounce(searchText, 300);

  const [department, setDepartment] = useState("");
  // Same shape as the old table facet, turned into a filter by formatFilter.
  const columnFilters = department ? [{ id: "department", value: [department] }] : [];

  const [sorting, setSorting] = useState([
    {
      id: "created",
      desc: true,
    },
  ]);
  const sort = sorting.map((p) => `${p.desc ? "-" : ""}${p.id}`)[0];

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  useEffect(() => setPageIndex(0), [search, department, sort, pageSize]);

  // Options of the department filter (the old facet loaded the same list).
  const departments = useQuery(["designation-filter-departments"], () => pocketbase.collection("departments").getFullList({ sort: "name" }), { staleTime: 5 * 60_000 });
  const departmentOptions = (departments.data || []).map((e: any) => ({ label: e.name, value: e.id }));
  // A designation stores its department id as text, so "department.name" cannot be searched or
  // expanded on the server: the search matches department names here and filters on their ids.
  const matchingDepartments = search ? departmentOptions.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())).map((o) => o.value) : [];
  const departmentName = (id?: string) => departmentOptions.find((o) => o.value === id)?.label;

  const recordsQuery = useQuery({
    queryKey: [
      "designations",
      {
        columnFilters,
        search,
        matchingDepartments,
        sort: sorting,
        pageIndex,
        pageSize,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = search ? `(name~"${search}"${matchingDepartments.map((id) => ` || department="${id}"`).join("")})` : "";

      const filters = formatFilter(columnFilters);

      const sorters = sorting.map((p) => `${p.desc ? "-" : "+"}${p.id}`).join(" && ");

      return pocketbase
        .collection("designations")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters].filter((e) => e).join(" && "),
            sort: sorters,
            expand: `department`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map(
              (e): Row => ({
                id: e.id,
                name: e.name,
                department: e.expand?.department?.name,
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
    queryKey: ["designations-stats"],
    queryFn: async () => {
      const [total, departmentsTotal, assigned, all] = await Promise.all([
        pocketbase.collection("designations").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("departments").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("users")
          .getList(1, 1, { filter: `designation != ""` })
          .then((e) => e.totalItems),
        pocketbase.collection("designations").getFullList({ fields: "department" }),
      ]);
      const departmentsCovered = new Set(all.map((e: any) => e.department).filter(Boolean)).size;
      return { total, departmentsTotal, assigned, departmentsCovered };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";

  const chips: FilterChip[] = department
    ? [{ key: "department", label: `Department: ${departmentOptions.find((o) => o.value === department)?.label || "selected"}`, onRemove: () => setDepartment("") }]
    : [];
  const filtered = Boolean(search || department);

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const [deleting, setDeleting] = useState<any>(null);

  const handleDelete = async () => {
    try {
      await pocketbase.collection("designations").delete(deleting.id);
      recordsQuery.refetch();
      toast.success(`${deleting.name} deleted`);
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Designation",
      sortField: "name",
      clamp: true,
      cell: (r) => <span className="font-semibold">{r.name}</span>,
      sub: (r) => r.original.description,
    },
    { key: "department", header: "Department", sortField: "department", clamp: true, cell: (r) => r.department || departmentName(r.original.department) || <span className="text-ims-faint">—</span> },
    { key: "created", header: "Created", sortField: "created", nowrap: true, cell: (r) => fmtDate(r.created) },
  ];

  const data = recordsQuery.data;
  const s = statsQuery.data;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Designations" }]}
        title="Designations"
        subtitle="Job titles, each belonging to a department."
        primary={{ label: "New designation", icon: Plus, onClick: () => newRecordModal.open() }}
      />

      <KpiBand
        loading={statsLoading}
        items={[
          { label: "Designations", value: fmtNumber(s?.total), sub: "Job titles defined" },
          { label: "Departments covered", value: fmtNumber(s?.departmentsCovered), sub: `Out of ${fmtNumber(s?.departmentsTotal ?? 0)} departments` },
          { label: "Employees assigned", value: fmtNumber(s?.assigned), sub: "With a designation set" },
        ]}
      />

      {/* "relative" keeps the table's hidden Actions header inside the card on phones. */}
      <Card padded={false} className="relative overflow-hidden">
        <FilterBar
          search={{ value: searchText, onChange: setsearchText, placeholder: "Search designation or department" }}
          chips={chips}
          onClear={() => setDepartment("")}
          right={
            <TableTools
              importConfig={IMPORTS.designations}
              onImported={() => recordsQuery.refetch()}
              exportConfig={{
                title: "Designations",
                fileName: "designations",
                what: "designations",
                permission: ["view_designations", "create_designations"],
                rows: async () => {
                  const [rows, deps] = await Promise.all([
                    pocketbase.collection("designations").getFullList({ sort: "name" }),
                    pocketbase.collection("departments").getFullList({ fields: "id,name" }),
                  ]);
                  const names = Object.fromEntries(deps.map((d: any) => [d.id, d.name]));
                  return rows.map((r: any) => ({ ...r, department_name: names[r.department] || "" }));
                },
                columns: [
                  { header: "Designation", value: (r: any) => r.name, width: 34 },
                  { header: "Department", value: (r: any) => r.department_name, width: 30 },
                  { header: "Description", value: (r: any) => r.description || "", width: 40 },
                ],
              }}
            />
          }
        >
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={departmentOptions} />
        </FilterBar>
        <DataTable
          caption="Designations"
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
              icon={Briefcase}
              text={filtered ? "Nothing matches these filters. Change the search or clear the filters." : "No designations yet. Add one with New designation."}
              action={!filtered ? <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>New designation</Button> : undefined}
            />
          }
          footer={
            data && data.totalItems > 0 ? (
              <Pager page={pageIndex + 1} perPage={pageSize} total={data.totalItems} onPage={(p) => setPageIndex(p - 1)} onPerPage={setPageSize} />
            ) : null
          }
        />
      </Card>

      <DesignationDialog
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
        title={`Delete ${deleting?.name || "this designation"}?`}
        description="The designation is removed for good. Employees who hold it keep their record but lose this designation. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
      />
    </Page>
  );
}

const EMPTY = { name: "", department: "", description: "" };

/** Create or edit a designation: name, department and description are all required. */
function DesignationDialog({ open, onClose, record, onComplete }: { open: boolean; onClose: () => void; record?: any; onComplete: () => void }) {
  const { user } = useAuth();
  const [v, setV] = useState({ ...EMPTY });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setV({ name: record?.name || "", description: record?.description || "", department: record?.department || "" });
      setTouched(false);
    }
  }, [open, record]);

  const departments = useQuery(
    ["designation-department-options"],
    () => pocketbase.collection("departments").getFullList({ sort: "name" }).then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id }))),
    { enabled: open, staleTime: 60_000 }
  );

  const errors = {
    name: !v.name.trim() ? "Enter the designation name." : null,
    department: !v.department ? "Choose the department this designation belongs to." : null,
    description: !v.description.trim() ? "Describe the designation in a few words." : null,
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function onSubmit() {
    setTouched(true);
    const first = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k]);
    if (first) {
      document.getElementById(`des-${first}`)?.focus();
      return;
    }
    const data = {
      ...v,
      name: v.name.trim(),
    };
    setBusy(true);
    try {
      if (!record) await pocketbase.collection("designations").create({ ...data, created_by: user.id });
      else await pocketbase.collection("designations").update(record.id, data);
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
      title={record ? `Edit ${record.name}` : "New designation"}
      description="A job title within one department."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="designation-form" loading={busy}>{record ? "Save changes" : "Create designation"}</Button>
        </>
      }
    >
      <form
        id="designation-form"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Designation name" required htmlFor="des-name" error={shown("name")}>
          <Input id="des-name" value={v.name} onChange={set("name")} placeholder="e.g. Senior Accountant" invalid={Boolean(shown("name"))} aria-describedby={shown("name") ? "des-name-error" : undefined} />
        </Field>
        <Field label="Department" required htmlFor="des-department" error={shown("department")}>
          <Select id="des-department" value={v.department} onChange={set("department")} invalid={Boolean(shown("department"))} aria-describedby={shown("department") ? "des-department-error" : undefined}>
            <option value="">{departments.isLoading ? "Loading departments…" : "Choose a department"}</option>
            {(departments.data || []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" required htmlFor="des-description" error={shown("description")} hint="What the role does, in one or two lines.">
          <Textarea id="des-description" className="min-h-[88px]" value={v.description} onChange={set("description")} invalid={Boolean(shown("description"))} aria-describedby={shown("description") ? "des-description-error" : "des-description-hint"} />
        </Field>
      </form>
    </Modal>
  );
}
