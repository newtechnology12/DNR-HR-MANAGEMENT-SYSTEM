import { useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, Printer, Truck } from "lucide-react";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { DocNo, Num, Page, PageHeader, Person, fmtDate } from "@/components/ims";

const TYPE_LABEL: Record<string, string> = { goods: "Goods", service: "Service", mixed: "Goods and services" };

export default function GoodsReceipts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const views: RecordView[] = [
    { key: "all", label: "All receipts" },
    { key: "goods", label: "Goods", filter: `receipt_type != "service"` },
    { key: "service", label: "Services", filter: `receipt_type = "service"` },
    { key: "rejected", label: "With rejected items", filter: `has_rejections = true` },
  ];
  const columns: RecordColumn<any>[] = [
    {
      key: "number",
      header: "Receipt",
      sortField: "number",
      nowrap: true,
      cell: (g) => <DocNo value={g.number} />,
      sub: (g) => (g.delivery_note_number ? (/^dn/i.test(g.delivery_note_number) ? g.delivery_note_number : `DN ${g.delivery_note_number}`) : null),
    },
    {
      key: "po",
      header: "Purchase order",
      clamp: true,
      cell: (g) => <DocNo value={g.expand?.purchase_order?.number} />,
      sub: (g) => g.expand?.purchase_order?.title,
      csv: (g) => g.expand?.purchase_order?.number,
    },
    { key: "supplier", header: "Supplier", className: "max-w-[220px]", cell: (g) => g.expand?.supplier?.name || "—", csv: (g) => g.expand?.supplier?.name },
    { key: "date", header: "Date", sortField: "receipt_date", nowrap: true, cell: (g) => fmtDate(g.receipt_date), csv: (g) => g.receipt_date?.slice(0, 10) },
    {
      key: "type",
      header: "Type",
      exportOnly: true,
      cell: (g) => TYPE_LABEL[g.receipt_type] || "Goods",
      csv: (g) => TYPE_LABEL[g.receipt_type] || g.receipt_type,
    },
    { key: "by", header: "Received by", className: "max-w-[190px]", cell: (g) => <Person name={g.expand?.received_by?.name} />, csv: (g) => g.expand?.received_by?.name },
    { key: "value", header: "Accepted (RWF)", sortField: "accepted_value", align: "right", sum: "accepted_value", format: "money", cell: (g) => <Num value={g.accepted_value} />, sub: (g) => (g.has_rejections ? <span className="text-ims-danger">Items rejected</span> : null), csv: (g) => g.accepted_value },
  ];
  const openPo = (g: any) => navigate(`/dashboard/procurement/purchase-orders/${g.purchase_order}?tab=receipts`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Goods received" }]}
        title="Goods received"
        subtitle="Deliveries recorded against purchase orders, including partial and rejected quantities."
      />
      <RecordTable
        collection="goods_receipts"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "delivery_note_number", "purchase_order.number", "supplier.name"]}
        searchPlaceholder="Search receipt, delivery note, order or supplier"
        dateField="receipt_date"
        dateLabel="Received"
        expand="purchase_order,supplier,received_by"
        defaultSort="-created"
        exportName="goods-receipts"
        exportTitle="Goods received"
        onRowClick={openPo}
        rowActions={(g) => [
          { label: "Open purchase order", icon: ExternalLink, onSelect: openPo },
          { label: "Print receipt", icon: Printer, onSelect: () => window.open(`/print/grn/${g.id}`, "_blank", "noopener,noreferrer") },
        ]}
        empty={{ icon: Truck, title: "No receipts yet.", text: "No deliveries recorded yet. They are recorded from an approved purchase order." }}
      />
    </Page>
  );
}
