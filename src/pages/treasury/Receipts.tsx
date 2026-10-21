/**
 * Bank & cash → Receipts: money received (member contributions, Government transfers, donor grants, fees).
 * The Cashier records, the DAF verifies, the receipt is posted to the cash book.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PiggyBank, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, PAYER_TYPES, TREASURY_DOC_STATUS } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { IMPORTS } from "@/lib/importConfigs";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import ReceiptDialog from "./ReceiptDialog";

export default function Receipts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const view = params.get("view") || (can("approve_treasury") && !can("manage_treasury") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Waiting for the DAF", filter: 'status = "pending_approval"' },
    { key: "posted", label: "Posted", filter: 'status = "approved"' },
    { key: "closed", label: "Reversed / cancelled", filter: 'status = "reversed" || status = "cancelled" || status = "rejected"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Receipts"
        description="Money received by RALGA: member contributions, Government transfers, donor grants, fees. The Cashier records each receipt; the DAF verifies it before it reaches the cash book."
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Receipts", link: "/dashboard/treasury/receipts" }]}
        actions={can("manage_treasury") && <Button onClick={() => setOpen(true)}><Plus size={15} /> Record a receipt</Button>}
      />
      <RecordTable<any>
        collection="cash_receipts"
        expand="account,income_account,recorded_by,funding_source"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "payer_name", "reference", "description"]}
        filters={[
          { field: "account", label: "Account", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}` },
          { field: "payer_type", label: "Payer", options: Object.entries(PAYER_TYPES).map(([value, label]) => ({ value, label })) },
          { field: "funding_source", label: "Funding source", collection: "funding_sources" },
          { field: "method", label: "Method", options: ["bank_transfer", "cheque", "mobile_money", "direct_deposit", "cash"].map((value) => ({ value, label: METHOD_LABELS[value] })) },
        ]}
        dateField="receipt_date"
        dateLabel="Received"
        defaultSort="-receipt_date"
        refreshKey={refresh}
        exportName="receipts"
        exportTitle="Receipts"
        exportPermission={["export_treasury", "manage_treasury", "approve_treasury"]}
        importConfig={can("manage_treasury") ? IMPORTS.receipts : undefined}
        onRowClick={(r) => navigate(`/dashboard/treasury/receipts/${r.id}`)}
        empty={{ icon: PiggyBank, title: "No receipts", text: "The Cashier records money received; the DAF verifies it." }}
        columns={[
          { key: "number", header: "Receipt", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "date", header: "Received", sortField: "receipt_date", format: "date", csv: (r) => showDay(r.receipt_date), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.receipt_date)}</span> },
          {
            key: "payer", header: "Received from", sortField: "payer_name", csv: (r) => r.payer_name,
            cell: (r) => (
              <span className="block min-w-[180px]">
                <span className="block font-medium text-slate-900">{r.payer_name}</span>
                <span className="block truncate text-[12px] text-slate-500">{r.expand?.income_account ? `${r.expand.income_account.code} ${r.expand.income_account.name}` : PAYER_TYPES[r.payer_type]}</span>
              </span>
            ),
          },
          { key: "account", header: "Into", csv: (r) => r.expand?.account?.code || "", cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-700">{r.expand?.account?.code}</span> },
          { key: "method", header: "Method / reference", csv: (r) => `${METHOD_LABELS[r.method] || r.method} ${r.reference}`, cell: (r) => <span className="block max-w-[200px] truncate text-[12.5px] text-slate-600">{METHOD_LABELS[r.method] || r.method}{r.reference ? ` · ${r.reference}` : ""}</span> },
          { key: "fund", header: "Funding source", exportOnly: true, csv: (r) => r.expand?.funding_source?.name || "", cell: () => null },
          { key: "amount", header: "Amount", sortField: "amount", align: "right", format: "money", csv: (r) => r.amount, cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.amount)}</span> },
          { key: "by", header: "Recorded by", exportOnly: true, csv: (r) => r.expand?.recorded_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => TREASURY_DOC_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={TREASURY_DOC_STATUS} /> },
        ]}
      />
      <ReceiptDialog open={open} onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); setRefresh((n) => n + 1); navigate(`/dashboard/treasury/receipts/${id}`); }} />
    </div>
  );
}
