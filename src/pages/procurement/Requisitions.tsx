import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ClipboardList, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Badge, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { DOC_STATUS, PRIORITY, money } from "@/lib/procurement";

export default function Requisitions({ defaultView = "all" }: { defaultView?: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const view = params.get("view") || defaultView;

  const views: RecordView[] = [
    { key: "all", label: "All I can see" },
    { key: "awaiting", label: "Awaiting my approval", filter: `status = "pending_approval" && pending_approvers ~ "${me?.id}"` },
    { key: "mine", label: "My requests", filter: `requester = "${me?.id}"` },
    { key: "department", label: "My department", filter: `department = "${me?.department}"` },
    { key: "pending", label: "In approval", filter: `status = "pending_approval"` },
    { key: "approved", label: "Approved", filter: `status = "approved"` },
    { key: "attention", label: "Returned / rejected", filter: `status = "returned" || status = "rejected"` },
    { key: "high", label: "High value (> 5M)", filter: `total > 5000000` },
  ];

  const columns: RecordColumn<any>[] = [
    {
      key: "number",
      header: "Number",
      sortField: "number",
      cell: (r) => <span className="whitespace-nowrap font-medium text-slate-900">{r.number}</span>,
    },
    {
      key: "title",
      header: "Title",
      sortField: "title",
      className: "max-w-[260px]",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{r.title || <span className="text-slate-400">Untitled draft</span>}</p>
          <p className="truncate text-[12px] text-slate-500">{r.expand?.category?.name || "—"}</p>
        </div>
      ),
    },
    {
      key: "requester",
      header: "Requester",
      cell: (r) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap">{r.expand?.requester?.name || "—"}</p>
          <p className="truncate text-[12px] text-slate-500">{r.expand?.department?.name || "—"}</p>
        </div>
      ),
      csv: (r) => r.expand?.requester?.name || "",
    },
    {
      key: "department",
      header: "Department",
      exportOnly: true,
      cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.department?.name || "—"}</span>,
      csv: (r) => r.expand?.department?.name || "",
    },
    {
      key: "total",
      header: "Total",
      sortField: "total",
      align: "right",
      cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{money(r.total, r.currency)}</span>,
      csv: (r) => r.total,
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} />,
      csv: (r) => DOC_STATUS[r.status]?.label || r.status,
    },
    {
      key: "priority",
      header: "Priority",
      sortField: "priority",
      cell: (r) => (r.priority ? <Badge tone={PRIORITY[r.priority]?.tone}>{PRIORITY[r.priority]?.label}</Badge> : "—"),
    },
    {
      key: "required_date",
      header: "Required by",
      sortField: "required_date",
      cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.required_date ? format(new Date(r.required_date), "d MMM yyyy") : "—"}</span>,
      csv: (r) => (r.required_date ? r.required_date.slice(0, 10) : ""),
    },
    {
      key: "created",
      header: "Created",
      sortField: "created",
      exportOnly: true,
      cell: (r) => <span className="whitespace-nowrap text-slate-500">{format(new Date(r.created), "d MMM yyyy")}</span>,
      csv: (r) => r.created.slice(0, 10),
    },
  ];

  const canCreate = canPerform("create_purchase_requisition");

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title={view === "awaiting" ? "Pending approvals" : "Purchase requisitions"}
        description={
          view === "awaiting"
            ? "Requisitions waiting for your decision."
            : "Requests to buy goods and services. You see what your role's procurement scope allows."
        }
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Requisitions", link: "/dashboard/procurement/requisitions" }]}
        actions={
          canCreate && (
            <Button onClick={() => navigate("/dashboard/procurement/requisitions/new")}>
              <Plus size={15} /> New requisition
            </Button>
          )
        }
      />
      <RecordTable
        collection="purchase_requisitions"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "requester.name", "department.name", "category.name"]}
        expand="requester,department,category"
        defaultSort="-created"
        exportName="purchase-requisitions"
        onRowClick={(r) => navigate(`/dashboard/procurement/requisitions/${r.id}`)}
        empty={{
          icon: ClipboardList,
          title: view === "awaiting" ? "Nothing waiting for you" : "No purchase requisitions found",
          text: view === "awaiting" ? "You're all caught up." : "Try another view, or create a new purchase requisition.",
          action: canCreate && view !== "awaiting" && (
            <Button size="sm" onClick={() => navigate("/dashboard/procurement/requisitions/new")}>
              <Plus size={14} /> Create purchase requisition
            </Button>
          ),
        }}
      />
    </div>
  );
}
