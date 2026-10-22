import { useEffect, useState } from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "use-debounce";
import { z } from "zod";
import { ExternalLink, FileSpreadsheet, Pencil, Plus, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import formatFilter from "@/utils/formatFilter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { exportReport } from "@/lib/exporter";
import Avatar from "@/components/shared/Avatar";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import { EmployeeFormModal } from "@/components/modals/EmployeeFormModal";
import {
  Button,
  Card,
  Column,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterSelect,
  KpiBand,
  PageHeader,
  Pager,
  StatusPill,
  Tabs,
  fmtDate,
  fmtNumber,
} from "@/components/ims";

export const orderSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  department: z.string(),
});

export type Order = z.infer<typeof orderSchema>;

type Row = {
  id: string;
  name: string;
  avatar: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  status: string;
  joined_at: string;
  original: any;
};

const TABS = [
  { key: "Active", label: "Active employees" },
  { key: "Inactive", label: "Inactive employees" },
];

/** Small round photo, initials when there is none. */
export function EmployeePhoto({ record, name, className }: { record?: any; name?: string; className?: string }) {
  return (
    <Avatar
      className={className || "h-8 w-8"}
      textClass="bg-ims-subtle text-t-hint font-bold text-ims-body"
      path={record?.avatar ? pocketbase.files.getUrl(record, record.avatar) : ""}
      name={(name || "").trim() || "?"}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function Employees(_props: Record<string, unknown> = {}) {
  const navigate = useNavigate();

  const [searchText, setsearchText] = useState("");
  const [search] = useDebounce(searchText, 300);
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  // Same shape as the old table facets: [{ id, value: [ids] }], turned into a filter by formatFilter.
  const columnFilters = [
    ...(role ? [{ id: "role", value: [role] }] : []),
    ...(department ? [{ id: "department", value: [department] }] : []),
  ];

  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([{ id: "created", desc: true }]);
  const sort = sorting.map((p) => `${p.desc ? "-" : ""}${p.id}`)[0];

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(15);

  const [activeTab, setactiveTab] = useState("Active");

  useEffect(() => setPageIndex(0), [search, role, department, activeTab, pageSize, sort]);

  const employeesQuery = useQuery({
    queryKey: [
      "employees",
      {
        search,
        filter: columnFilters,
        sort: sorting,
        pageIndex,
        pageSize,
        activeTab,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = search ? `name~"${search}" || department.name~"${search}" ` : "";

      const filters = formatFilter(columnFilters);

      const sorters = sorting.map((p) => `${p.desc ? "-" : "+"}${p.id}`).join(" && ");

      return pocketbase
        .collection("users")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `status="${activeTab}"`].filter((e) => e).join("&&"),
            expand: "department,role",
            sort: sorters,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map(
              (e): Row => ({
                id: e.id,
                name: e.name,
                avatar: e.avatar,
                role: e.expand?.role?.name || "",
                email: e.email || "",
                phone: e.phone,
                department: e.expand?.department?.name || "",
                status: e.status,
                joined_at: e.joined_at,
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

  const newEmployeeModal = useModalState();

  const editRow = useEditRow();

  const statsQuery = useQuery({
    queryKey: ["employees-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [total, active, inactive, departments, newHires] = await Promise.all([
        pocketbase.collection("users").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("users").getList(1, 1, { filter: `status="Active"` }).then((e) => e.totalItems),
        pocketbase.collection("users").getList(1, 1, { filter: `status="Inactive"` }).then((e) => e.totalItems),
        pocketbase.collection("departments").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase.collection("users").getList(1, 1, { filter: `joined_at >= "${startOfMonth}"` }).then((e) => e.totalItems),
      ]);

      return { total, active, inactive, departments, newHires };
    },
    enabled: true,
  });

  // Options of the role and department filters (the old facets loaded the same lists).
  const roles = useQuery(["employee-filter-roles"], () => pocketbase.collection("roles").getFullList({ sort: "name" }), { staleTime: 5 * 60_000 });
  const departments = useQuery(["employee-filter-departments"], () => pocketbase.collection("departments").getFullList({ sort: "name" }), { staleTime: 5 * 60_000 });
  const roleOptions = (roles.data || []).map((e: any) => ({ label: e.name, value: e.id }));
  const departmentOptions = (departments.data || []).map((e: any) => ({ label: e.name, value: e.id }));

  const chips: FilterChip[] = [
    ...(role ? [{ key: "role", label: `Role: ${roleOptions.find((o) => o.value === role)?.label || "selected"}`, onRemove: () => setRole("") }] : []),
    ...(department ? [{ key: "department", label: `Department: ${departmentOptions.find((o) => o.value === department)?.label || "selected"}`, onRemove: () => setDepartment("") }] : []),
  ];
  const filtered = Boolean(search || chips.length);

  const openProfile = (r: Row) => navigate(`/dashboard/hr/employees/${r.id}`);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Employee",
      sortField: "name",
      className: "max-w-[300px]",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <EmployeePhoto record={r.original} name={r.name} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ims-text">{r.name || "—"}</span>
            {r.email && <span className="block truncate text-t-small text-ims-muted">{r.email}</span>}
          </span>
        </span>
      ),
    },
    { key: "department", header: "Department", clamp: true, cell: (r) => r.department || <span className="text-ims-faint">—</span> },
    { key: "role", header: "Role", cell: (r) => r.role || <span className="text-ims-faint">—</span> },
    { key: "phone", header: "Phone", sortField: "phone", nowrap: true, cell: (r) => <span className="tabular-nums">{r.phone || "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
    { key: "joined_at", header: "Joined", sortField: "joined_at", nowrap: true, cell: (r) => fmtDate(r.joined_at) },
  ];

  const data = employeesQuery.data;
  const s = statsQuery.data;
  const statsLoading = statsQuery.status === "loading";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Employees" }]}
        title="Employees"
        subtitle="Staff records, with each person's department, role and contact details."
        primary={{ label: "New employee", icon: Plus, onClick: () => newEmployeeModal.open() }}
        secondary={[{ label: "Import from Excel", icon: FileSpreadsheet, onClick: () => navigate("/dashboard/hr/employees/import") }]}
      />

      <KpiBand
        loading={statsLoading}
        items={[
          { label: "All employees", value: fmtNumber(s?.total), sub: "On record" },
          { label: "Active", value: fmtNumber(s?.active), onClick: () => setactiveTab("Active") },
          { label: "Inactive", value: fmtNumber(s?.inactive), onClick: () => setactiveTab("Inactive") },
          { label: "Departments", value: fmtNumber(s?.departments) },
          { label: "New hires", value: fmtNumber(s?.newHires), sub: "Joined this month" },
        ]}
      />

      {/* "relative" keeps the table's hidden Actions header inside the card on phones. */}
      <Card padded={false} className="relative overflow-hidden">
        <Tabs inset label="Employee status" active={activeTab} onChange={setactiveTab} tabs={TABS} />
        <FilterBar
          search={{ value: searchText, onChange: setsearchText, placeholder: "Search name or department" }}
          chips={chips}
          onClear={() => {
            setRole("");
            setDepartment("");
          }}
          right={
            <ExportMenu
              permission={["view_employees", "export_reports"]}
              onExport={async (format) => {
                const rows = await pocketbase.collection("users").getFullList({ sort: "name", expand: "role,department,designation,branch" });
                await exportReport({
                  title: "Staff list",
                  fileName: "staff-list",
                  what: "users",
                  format,
                  rows,
                  orientation: "landscape",
                  columns: [
                    { header: "Name", value: (r: any) => r.name || r.names, width: 26 },
                    { header: "E-mail", value: (r: any) => r.email || "", width: 26 },
                    { header: "Phone", value: (r: any) => r.phone || "" },
                    { header: "Department", value: (r: any) => r.expand?.department?.name || "", width: 24 },
                    { header: "Designation", value: (r: any) => r.expand?.designation?.name || "", width: 24 },
                    { header: "Office", value: (r: any) => r.expand?.branch?.name || "" },
                    { header: "Role", value: (r: any) => r.expand?.role?.name || "" },
                    { header: "Status", value: (r: any) => r.status || "" },
                    { header: "Joined", value: (r: any) => r.joined_at || "", format: "date" },
                  ],
                });
              }}
            />
          }
        >
          <FilterSelect label="Role" value={role} onChange={setRole} options={roleOptions} />
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={departmentOptions} />
        </FilterBar>
        <DataTable
          caption={TABS.find((t) => t.key === activeTab)?.label}
          columns={columns}
          rows={data?.items || []}
          rowKey={(r) => r.id}
          onRowClick={openProfile}
          rowActions={() => [
            { label: "Open profile", icon: ExternalLink, onSelect: openProfile },
            { label: "Edit", icon: Pencil, onSelect: (r) => editRow.edit(r.original) },
          ]}
          sort={sort}
          onSort={(v) => setSorting([{ id: v.replace(/^-/, ""), desc: v.startsWith("-") }])}
          loading={employeesQuery.status === "loading"}
          fetching={employeesQuery.isFetching}
          error={employeesQuery.isError ? employeesQuery.error : undefined}
          onRetry={() => employeesQuery.refetch()}
          empty={
            <EmptyState
              icon={Users}
              text={
                filtered
                  ? "Nothing matches these filters. Change the search or clear the filters."
                  : activeTab === "Active"
                    ? "No active employees yet. Add one with New employee."
                    : "No inactive employees."
              }
              action={
                !filtered && activeTab === "Active" ? (
                  <Button variant="primary" icon={Plus} onClick={() => newEmployeeModal.open()}>New employee</Button>
                ) : undefined
              }
            />
          }
          footer={
            data && data.totalItems > 0 ? (
              <Pager page={pageIndex + 1} perPage={pageSize} total={data.totalItems} onPage={(p) => setPageIndex(p - 1)} onPerPage={setPageSize} />
            ) : null
          }
        />
      </Card>

      <EmployeeFormModal
        onComplete={() => {
          employeesQuery.refetch();
          newEmployeeModal.close();
          editRow.close();
        }}
        employee={editRow.row}
        employeeToUpdate={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newEmployeeModal.setisOpen}
        open={newEmployeeModal.isOpen || editRow.isOpen}
      />
    </>
  );
}
