import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Badge, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { OPEN_PO_STATUSES, PO_STATUS, errorMessage, money, purchasingApi } from "@/lib/procurement";
import { cn } from "@/utils";

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const me = pocketbase.authStore.model as any;
  const now = new Date().toISOString().replace("T", " ");
  const open = OPEN_PO_STATUSES.map((s) => `status = "${s}"`).join(" || ");

  const views: RecordView[] = [
    { key: "all", label: "All orders" },
    { key: "draft", label: "Drafts", filter: `status = "draft" || status = "returned"` },
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "awaiting", label: "Awaiting my approval", filter: `status = "pending_approval" && pending_approvers ~ "${me?.id}"` },
    { key: "open", label: "Awaiting delivery", filter: `(${open})` },
    { key: "overdue", label: "Overdue delivery", filter: `(${open}) && expected_delivery_date < "${now}"` },
    { key: "received", label: "Received", filter: `status = "fully_received" || status = "completed" || status = "closed"` },
    { key: "direct", label: "Direct purchases", filter: `source = "direct"` },
  ];

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "PO", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    {
      key: "title",
      header: "Order",
      sortField: "title",
      className: "max-w-[260px]",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{r.title}</p>
          <p className="truncate text-[12px] text-slate-500">
            {r.expand?.supplier?.name}
            {r.source === "direct" && <Badge tone="warning" className="ml-1.5">Direct</Badge>}
          </p>
        </div>
      ),
    },
    { key: "department", header: "Department", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.department?.name || "—"}</span>, csv: (r) => r.expand?.department?.name || "" },
    { key: "total", header: "Value", sortField: "grand_total", align: "right", cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{money(r.grand_total, r.currency)}</span>, csv: (r) => r.grand_total },
    {
      key: "received",
      header: "Received",
      align: "right",
      cell: (r) => {
        const pct = r.grand_total ? Math.min(100, Math.round((r.received_value / r.grand_total) * 100)) : 0;
        return (
          <div className="ml-auto w-24">
            <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} /></div>
            <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-500">{pct}%</p>
          </div>
        );
      },
      csv: (r) => r.received_value,
    },
    {
      key: "expected",
      header: "Expected",
      sortField: "expected_delivery_date",
      cell: (r) => {
        const late = OPEN_PO_STATUSES.includes(r.status) && r.expected_delivery_date && isPast(new Date(r.expected_delivery_date));
        return <span className={cn("whitespace-nowrap", late ? "font-medium text-red-600" : "text-slate-600")}>{r.expected_delivery_date ? format(new Date(r.expected_delivery_date), "d MMM yyyy") : "—"}{late && " · late"}</span>;
      },
      csv: (r) => r.expected_delivery_date?.slice(0, 10),
    },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={PO_STATUS} />, csv: (r) => PO_STATUS[r.status]?.label },
  ];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Purchase orders"
        description="Orders raised from awarded RFQs or approved direct purchases, and their delivery progress."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Purchase orders", link: "/dashboard/procurement/purchase-orders" }]}
      />
      <RecordTable
        collection="purchase_orders"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "supplier.name", "department.name", "requisition.number"]}
        expand="supplier,department"
        defaultSort="-created"
        exportName="purchase-orders"
        onRowClick={(r) => navigate(`/dashboard/procurement/purchase-orders/${r.id}`)}
        empty={{ icon: ShoppingCart, title: "No purchase orders found", text: "Purchase orders are created from an awarded RFQ, or as a justified direct purchase on an approved requisition." }}
      />
    </div>
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Direct purchase order · {requisition.number}</DialogTitle>
          <DialogDescription>Skips competitive quotations. Prices start from the requisition estimates and can be adjusted in the draft.</DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Direct purchases are flagged in reports and the audit trail. Use them only where your procurement policy allows (e.g. low value, single source, emergency).
        </p>
        <label className="block text-[12.5px] font-medium text-slate-700">Supplier <span className="text-red-600">*</span>
          <select className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px]" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">Select supplier…</option>
            {sorted.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code}){s.categories?.includes(requisition.category) ? " ★" : ""}</option>)}
          </select>
        </label>
        <label className="block text-[12.5px] font-medium text-slate-700">Justification <span className="text-red-600">*</span>
          <textarea className="mt-1 h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px]" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why is no competitive quotation needed?" />
          <span className="mt-1 block text-[11.5px] text-slate-500">{justification.trim().length}/20 characters minimum</span>
        </label>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!supplier || justification.trim().length < 20 || create.isLoading} onClick={() => create.mutate()}>{create.isLoading ? "Creating…" : "Create draft PO"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
