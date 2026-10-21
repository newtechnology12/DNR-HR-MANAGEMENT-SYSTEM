/**
 * Payables → Payment vouchers. The Accountant prepares, the DAF (and SG above the DAF limit) approve,
 * the Cashier executes. Views follow that flow: drafts, waiting for approval, to pay, paid.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileCheck2, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { VOUCHER_STATUS, VOUCHER_TYPES } from "@/lib/payables";
import { rwf, showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";

export default function Vouchers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const view = params.get("view") || (can("record_payments") && !can("manage_payment_vouchers") ? "to_pay" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
    { key: "to_pay", label: "To pay", filter: 'status = "approved"' },
    { key: "paid", label: "Paid", filter: 'status = "paid"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Payment vouchers"
        description="Every supplier payment and direct expense: prepared by the Accountant, approved by the DAF (and the Secretary General above the DAF limit), executed by the Cashier."
        breadcrumbs={[{ title: "Payables", link: "/dashboard/finance/invoices" }, { title: "Payment vouchers", link: "/dashboard/finance/vouchers" }]}
        actions={can("manage_payment_vouchers") && <Button onClick={() => navigate("/dashboard/finance/vouchers/new")}><Plus size={15} /> New payment voucher</Button>}
      />
      <RecordTable<any>
        collection="payment_vouchers"
        expand="supplier,prepared_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "payee_name", "description", "payment_reference"]}
        filters={[
          { field: "voucher_type", label: "Type", options: Object.entries(VOUCHER_TYPES).map(([value, t]) => ({ value, label: t.label })) },
          { field: "supplier", label: "Supplier", collection: "suppliers" },
          { field: "department", label: "Department", collection: "departments" },
        ]}
        dateField="created"
        defaultSort="-created"
        exportName="payment-vouchers"
        exportTitle="Payment vouchers"
        exportPermission={["export_invoices", "view_payment_vouchers", "manage_payment_vouchers"]}
        onRowClick={(r) => navigate(`/dashboard/finance/vouchers/${r.id}`)}
        empty={{ icon: FileCheck2, title: "No payment vouchers", text: "The Accountant prepares a voucher from approved supplier invoices or for a direct expense." }}
        columns={[
          { key: "number", header: "Voucher", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          {
            key: "payee", header: "Payee", sortField: "payee_name", csv: (r) => r.payee_name,
            cell: (r) => (
              <span className="block min-w-[180px]">
                <span className="block font-medium text-slate-900">{r.payee_name}</span>
                <span className="block truncate text-[12px] text-slate-500">{VOUCHER_TYPES[r.voucher_type]?.label} · {r.description}</span>
              </span>
            ),
          },
          { key: "gross", header: "Gross", sortField: "gross_amount", align: "right", format: "money", csv: (r) => r.gross_amount, cell: (r) => <span className="whitespace-nowrap tabular-nums">{rwf(r.gross_amount)}</span> },
          { key: "wht", header: "Tax withheld", sortField: "wht_amount", align: "right", format: "money", csv: (r) => r.wht_amount, cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{r.wht_amount ? rwf(r.wht_amount) : "—"}</span> },
          { key: "net", header: "Net to pay", sortField: "net_amount", align: "right", format: "money", csv: (r) => r.net_amount, cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.net_amount)}</span> },
          { key: "due", header: "Due", sortField: "due_date", format: "date", csv: (r) => showDay(r.due_date), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{r.due_date ? showDay(r.due_date) : "—"}</span> },
          { key: "by", header: "Prepared by", exportOnly: true, csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-600">{r.expand?.prepared_by?.name || "—"}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => VOUCHER_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={VOUCHER_STATUS} /> },
        ]}
      />
    </div>
  );
}
