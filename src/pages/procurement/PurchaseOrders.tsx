import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, PackageCheck, Printer, ShoppingCart } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { WithPeople } from "@/components/enterprise/WithCell";
import { Button, DocNo, Field, Modal, Num, Page, PageHeader, Person, Select, Textarea, fmtDate, overdue } from "@/components/ims";
import { OPEN_PO_STATUSES, PO_STATUS, errorMessage, purchasingApi } from "@/lib/procurement";
import { cn } from "@/utils";

const LIST = "/dashboard/procurement/purchase-orders";
const PRINTABLE = (status: string) => !["draft", "pending_approval", "returned", "rejected", "cancelled"].includes(status);

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const view = params.get("view") || "all";
  const me = pocketbase.authStore.model as any;
  const now = new Date().toISOString().replace("T", " ");
  const open = OPEN_PO_STATUSES.map((s) => `status = "${s}"`).join(" || ");
  const awaitingFilter = `status = "pending_approval" && pending_approvers ~ "${me?.id}"`;

  const awaiting = useQuery(["purchase-orders-awaiting", me?.id], () => pocketbase.collection("purchase_orders").getList(1, 1, { filter: awaitingFilter, fields: "id" }).then((r) => r.totalItems), {
    enabled: Boolean(me?.id),
  });

  // At most five tabs; drafts, approval stage and direct purchases are filters.
  const views: RecordView[] = [
    { key: "all", label: "All orders" },
    { key: "awaiting", label: "Awaiting my approval", filter: awaitingFilter },
    { key: "open", label: "Awaiting delivery", filter: `(${open})` },
    { key: "overdue", label: "Overdue delivery", filter: `(${open}) && expected_delivery_date < "${now}"` },
    { key: "received", label: "Received", filter: `status = "fully_received" || status = "completed" || status = "closed"` },
  ];

  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(PO_STATUS).map(([value, m]) => ({ value, label: m.note ? `${m.label} · ${m.note}` : m.label })) },
    { field: "source", label: "Source", options: [{ value: "rfq", label: "From an RFQ" }, { value: "direct", label: "Direct purchase" }] },
    { field: "department", label: "Department", collection: "departments" },
  ];

  /** Who must act now on the order. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.pending_approvers} />;
    if (r.status === "draft" || r.status === "returned") return <Person name="Procurement" detail="To finish and submit" />;
    if (r.status === "approved") return <Person name="Procurement" detail="To send to the supplier" />;
    if (["sent", "acknowledged", "partially_received"].includes(r.status)) return <Person name={r.expand?.supplier?.name || "Supplier"} detail="To deliver" />;
    if (["fully_received", "partially_invoiced", "fully_invoiced"].includes(r.status)) return <Person name="Finance" detail="To bill and pay" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => (r.source === "direct" ? "Direct purchase" : null) },
    { key: "title", header: "Order", sortField: "title", clamp: true, cell: (r) => r.title || "Untitled order", sub: (r) => r.expand?.supplier?.name, csv: (r) => r.title || "" },
    { key: "supplier", header: "Supplier", exportOnly: true, cell: (r) => r.expand?.supplier?.name || "—", csv: (r) => r.expand?.supplier?.name || "" },
    { key: "department", header: "Department", exportOnly: true, cell: (r) => r.expand?.department?.name || "—", csv: (r) => r.expand?.department?.name || "" },
    { key: "total", header: "Total (RWF)", sortField: "grand_total", align: "right", sum: "grand_total", format: "money", cell: (r) => <Num value={r.grand_total} />, sub: (r) => (r.currency && r.currency !== "RWF" ? r.currency : null), csv: (r) => r.grand_total },
    {
      key: "received",
      header: "Received",
      align: "right",
      cell: (r) => {
        const pct = r.grand_total ? Math.min(100, Math.round((r.received_value / r.grand_total) * 100)) : 0;
        return (
          <span className="ml-auto block w-20" aria-label={`${pct}% received`}>
            <span className="block h-1.5 rounded-pill bg-ims-subtle"><span className="block h-1.5 rounded-pill bg-ims-link" style={{ width: `${pct}%` }} /></span>
            <span className="mt-1 block text-t-small tabular-nums text-ims-muted">{pct}%</span>
          </span>
        );
      },
      csv: (r) => r.received_value,
    },
    {
      key: "expected",
      header: "Expected",
      sortField: "expected_delivery_date",
      nowrap: true,
      cell: (r) => {
        const late = OPEN_PO_STATUSES.includes(r.status) ? overdue(r.expected_delivery_date) : null;
        return <span className={cn(late && "font-semibold text-ims-danger")}>{fmtDate(r.expected_delivery_date)}</span>;
      },
      sub: (r) => (OPEN_PO_STATUSES.includes(r.status) ? <span className="text-ims-danger">{overdue(r.expected_delivery_date)}</span> : null),
      csv: (r) => r.expected_delivery_date?.slice(0, 10),
    },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={PO_STATUS} />, csv: (r) => PO_STATUS[r.status]?.label },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
  ];

  const openPo = (r: any) => navigate(`${LIST}/${r.id}`);
  const canReceive = canPerform("receive_goods");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Purchase orders" }]}
        title="Purchase orders"
        subtitle="Orders sent to suppliers from awarded RFQs or direct purchases, and their delivery."
      />
      <RecordTable
        collection="purchase_orders"
        columns={columns}
        views={views}
        activeView={view}
        viewCounts={{ awaiting: awaiting.data }}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "supplier.name", "department.name", "requisition.number"]}
        searchPlaceholder="Search number, order, supplier or requisition"
        filters={filters}
        dateField="order_date"
        dateLabel="Order date"
        expand="supplier,department"
        defaultSort="-created"
        exportName="purchase-orders"
        exportTitle="Purchase orders"
        onRowClick={openPo}
        rowActions={(r) => [
          { label: "Open", icon: ExternalLink, onSelect: openPo },
          ...(canReceive && OPEN_PO_STATUSES.includes(r.status) ? [{ label: "Receive delivery", icon: PackageCheck, onSelect: () => navigate(`${LIST}/${r.id}/receive`) }] : []),
          ...(PRINTABLE(r.status) ? [{ label: "Print", icon: Printer, onSelect: () => window.open(`/print/po/${r.id}`, "_blank", "noopener,noreferrer") }] : []),
        ]}
        empty={{
          icon: ShoppingCart,
          title: view === "awaiting" ? "Nothing is waiting for you." : "No purchase orders yet.",
          text:
            view === "awaiting"
              ? "No purchase order is waiting for your approval."
              : view === "overdue"
                ? "No delivery is overdue."
                : "Purchase orders are created from an awarded RFQ, or as a direct purchase on an approved requisition.",
        }}
      />
    </Page>
  );
}

/** Direct purchase on an approved requisition — needs a supplier and a written justification. */
export function DirectPoDialog({ open, onClose, requisition }: { open: boolean; onClose: () => void; requisition: any }) {
  const navigate = useNavigate();
  const [supplier, setSupplier] = React.useState("");
  const [justification, setJustification] = React.useState("");
  const suppliers = useQuery(["active-suppliers-simple"], () => pocketbase.collection("suppliers").getFullList({ filter: `status = "active"`, sort: "name", fields: "id,name,code,categories" }), { enabled: open });
  const create = useMutation(() => purchasingApi.direct(requisition.id, { supplier, justification }), {
    onSuccess: (po) => {
      toast.success(`${po.number} created as a draft`);
      onClose();
      navigate(`/dashboard/procurement/purchase-orders/${po.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const sorted = (suppliers.data || []).sort((a: any, b: any) => Number(b.categories?.includes(requisition.category)) - Number(a.categories?.includes(requisition.category)));
  const chars = justification.trim().length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          Direct purchase order for <span className="whitespace-nowrap">{requisition.number}</span>
        </>
      }
      description="No competitive quotations. Prices start from the requisition estimates and can be changed in the draft."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isLoading}>Cancel</Button>
          <Button variant="primary" disabled={!supplier || chars < 20} loading={create.isLoading} onClick={() => create.mutate()}>Create draft PO</Button>
        </>
      }
    >
      <p className="flex items-start gap-2 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2.5 text-t-small text-ims-warning">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
        Direct purchases are flagged in reports and the audit trail. Use them only where the procurement policy allows, for example low value, a single source or an emergency.
      </p>
      <Field label="Supplier" required htmlFor="direct-po-supplier" hint="Suppliers registered for this purchase category are listed first.">
        <Select id="direct-po-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="">Choose a supplier</option>
          {sorted.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code}){s.categories?.includes(requisition.category) ? " · supplies this category" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Justification" required htmlFor="direct-po-justification" hint={`Why no competitive quotation is needed. At least 20 characters (${chars} so far).`}>
        <Textarea id="direct-po-justification" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="For example: only authorised dealer in Rwanda for this equipment" />
      </Field>
    </Modal>
  );
}
