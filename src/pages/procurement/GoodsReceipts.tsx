import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Truck } from "lucide-react";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Badge, PageHeader } from "@/components/enterprise/ui";
import { money } from "@/lib/procurement";

export default function GoodsReceipts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const views: RecordView[] = [
    { key: "all", label: "All receipts" },
    { key: "goods", label: "Goods received", filter: `receipt_type != "service"` },
    { key: "service", label: "Service confirmations", filter: `receipt_type = "service"` },
    { key: "rejected", label: "With rejected items", filter: `has_rejections = true` },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Receipt", sortField: "number", cell: (g) => <span className="whitespace-nowrap font-medium">{g.number}</span> },
    { key: "po", header: "Purchase order", cell: (g) => <div><p>{g.expand?.purchase_order?.number}</p><p className="max-w-[240px] truncate text-[12px] text-slate-500">{g.expand?.purchase_order?.title}</p></div>, csv: (g) => g.expand?.purchase_order?.number },
    { key: "supplier", header: "Supplier", cell: (g) => g.expand?.supplier?.name, csv: (g) => g.expand?.supplier?.name },
    { key: "date", header: "Date", sortField: "receipt_date", cell: (g) => <span className="whitespace-nowrap text-slate-600">{format(new Date(g.receipt_date), "d MMM yyyy")}</span>, csv: (g) => g.receipt_date?.slice(0, 10) },
    { key: "type", header: "Type", cell: (g) => <Badge tone={g.receipt_type === "service" ? "neutral" : "info"}>{g.receipt_type === "service" ? "Service" : g.receipt_type === "mixed" ? "Mixed" : "Goods"}</Badge>, csv: (g) => g.receipt_type },
    { key: "by", header: "Received by", cell: (g) => g.expand?.received_by?.name, csv: (g) => g.expand?.received_by?.name },
    { key: "value", header: "Accepted", sortField: "accepted_value", align: "right", cell: (g) => <span className="tabular-nums">{money(g.accepted_value)}{g.has_rejections && <Badge tone="danger" className="ml-1.5">Rejections</Badge>}</span>, csv: (g) => g.accepted_value },
  ];
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Goods & services received"
        description="Every delivery recorded against a purchase order, including partial and rejected quantities."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Receipts", link: "/dashboard/procurement/receipts" }]}
      />
      <RecordTable
        collection="goods_receipts"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "delivery_note_number", "purchase_order.number", "supplier.name"]}
        expand="purchase_order,supplier,received_by"
        defaultSort="-created"
        exportName="goods-receipts"
        onRowClick={(g) => navigate(`/dashboard/procurement/purchase-orders/${g.purchase_order}?tab=receipts`)}
        empty={{ icon: Truck, title: "No receipts yet", text: "Deliveries are recorded from an approved purchase order." }}
      />
    </div>
  );
}
