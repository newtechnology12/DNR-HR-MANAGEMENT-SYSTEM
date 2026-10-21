import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { ClipboardList, ExternalLink, Pencil, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { WithPeople } from "@/components/enterprise/WithCell";
import { Button, DocNo, Num, Page, PageHeader, Person, Priority, fmtDate } from "@/components/ims";
import { DOC_STATUS, PRIORITY } from "@/lib/procurement";

const HIGH_VALUE = 5_000_000;

export default function Requisitions({ defaultView = "all" }: { defaultView?: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const view = params.get("view") || defaultView;
  const awaitingFilter = `status = "pending_approval" && pending_approvers ~ "${me?.id}"`;

  const awaiting = useQuery(["requisitions-awaiting", me?.id], () => pocketbase.collection("purchase_requisitions").getList(1, 1, { filter: awaitingFilter, fields: "id" }).then((r) => r.totalItems), {
    enabled: Boolean(me?.id),
  });

  // At most five tabs; status, value and dates are filters.
  const views: RecordView[] = [
    { key: "all", label: "All requisitions" },
    { key: "awaiting", label: "Awaiting my approval", filter: awaitingFilter },
    { key: "mine", label: "My requisitions", filter: `requester = "${me?.id}"` },
    { key: "department", label: "My department", filter: `department = "${me?.department}"` },
  ];

  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(DOC_STATUS).filter(([k]) => k !== "pending").map(([value, m]) => ({ value, label: m.note ? `${m.label} · ${m.note}` : m.label })) },
    { field: "department", label: "Department", collection: "departments" },
    { field: "priority", label: "Priority", options: Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label })) },
    { field: "value", label: "Value", options: [{ value: "high", label: "Above RWF 5,000,000" }, { value: "low", label: "RWF 5,000,000 or less" }], filterFor: (v) => (v === "high" ? `total > ${HIGH_VALUE}` : `total <= ${HIGH_VALUE}`) },
  ];

  /** Who must act now: the approvers while it is in approval, the requester when it is back with them. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval" || r.status === "pending") return <WithPeople ids={r.pending_approvers} />;
    if (r.status === "returned" || r.status === "draft") return <Person name={r.expand?.requester?.name} detail="Requester" />;
    if (r.status === "approved") return <Person name="Procurement" detail="To source and order" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => (r.priority ? <Priority value={r.priority} small /> : null) },
    {
      key: "title",
      header: "Title",
      sortField: "title",
      clamp: true,
      cell: (r) => r.title || "Untitled draft",
      sub: (r) => r.expand?.category?.name,
      csv: (r) => r.title || "",
    },
    {
      key: "requester",
      header: "Requester",
      className: "max-w-[190px]",
      cell: (r) => <Person name={r.expand?.requester?.name} detail={r.expand?.department?.name} />,
      csv: (r) => r.expand?.requester?.name || "",
    },
    { key: "department", header: "Department", exportOnly: true, cell: (r) => r.expand?.department?.name || "—", csv: (r) => r.expand?.department?.name || "" },
    { key: "total", header: "Total (RWF)", sortField: "total", align: "right", sum: "total", format: "money", cell: (r) => <Num value={r.total} />, csv: (r) => r.total },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} />, csv: (r) => DOC_STATUS[r.status]?.label || r.status },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
    { key: "priority", header: "Priority", exportOnly: true, sortField: "priority", cell: (r) => <Priority value={r.priority} />, csv: (r) => PRIORITY[r.priority]?.label || "" },
    { key: "required_date", header: "Needed by", sortField: "required_date", nowrap: true, cell: (r) => fmtDate(r.required_date), csv: (r) => (r.required_date ? r.required_date.slice(0, 10) : "") },
    { key: "created", header: "Requested", sortField: "created", exportOnly: true, cell: (r) => fmtDate(r.created), csv: (r) => r.created.slice(0, 10) },
  ];

  const canCreate = canPerform("create_purchase_requisition");
  const open = (r: any) => navigate(`/dashboard/procurement/requisitions/${r.id}`);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Purchase requisitions" }]}
        title="Purchase requisitions"
        subtitle="Requests to buy goods and services, from draft to purchase order."
        primary={canCreate ? { label: "New requisition", icon: Plus, to: "/dashboard/procurement/requisitions/new" } : undefined}
      />
      <RecordTable
        collection="purchase_requisitions"
        columns={columns}
        views={views}
        activeView={view}
        viewCounts={{ awaiting: awaiting.data }}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "requester.name", "department.name", "category.name"]}
        searchPlaceholder="Search number, title or requester"
        filters={filters}
        dateField="created"
        dateLabel="Requested"
        expand="requester,department,category"
        defaultSort="-created"
        exportName="purchase-requisitions"
        exportTitle="Purchase requisitions"
        onRowClick={open}
        rowActions={(r) => [
          { label: "Open", icon: ExternalLink, onSelect: open },
          ...((r.status === "draft" || r.status === "returned") && r.requester === me?.id
            ? [{ label: "Edit", icon: Pencil, onSelect: () => navigate(`/dashboard/procurement/requisitions/${r.id}/edit`) }]
            : []),
        ]}
        empty={{
          icon: ClipboardList,
          title: view === "awaiting" ? "Nothing is waiting for you." : "No requisitions yet.",
          text: view === "awaiting" ? "Nothing is waiting for your approval." : canCreate ? "No requisitions yet. Create one with New requisition." : "No requisitions to show.",
          action: canCreate && view !== "awaiting" ? <Button variant="primary" icon={Plus} onClick={() => navigate("/dashboard/procurement/requisitions/new")}>New requisition</Button> : undefined,
        }}
      />
    </Page>
  );
}
