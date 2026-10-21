/**
 * Bank & cash → Transfers between RALGA's own accounts (petty cash replenishments, moves between banks,
 * reimbursements out of a programme account). Cashier prepares, DAF approves, then it is posted.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowRightLeft, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, TREASURY_DOC_STATUS } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import TransferDialog from "./TransferDialog";

export default function Transfers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const view = params.get("view") || (can("approve_treasury") && !can("manage_treasury") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
    { key: "posted", label: "Posted", filter: 'status = "approved"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Transfers"
        description="Money moved between RALGA's own accounts: petty cash replenishments, transfers between banks, reimbursements from programme accounts."
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Transfers", link: "/dashboard/treasury/transfers" }]}
        actions={can("manage_treasury") && <Button onClick={() => setOpen(true)}><Plus size={15} /> New transfer</Button>}
      />
      <RecordTable<any>
        collection="bank_transfers"
        expand="from_account,to_account,prepared_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reference", "description"]}
        filters={[
          { field: "from_account", label: "From", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}` },
          { field: "to_account", label: "To", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}` },
        ]}
        dateField="transfer_date"
        dateLabel="Date"
        defaultSort="-transfer_date"
        exportName="transfers"
        exportTitle="Transfers between accounts"
        exportPermission={["export_treasury", "manage_treasury", "approve_treasury"]}
        onRowClick={(r) => navigate(`/dashboard/treasury/transfers/${r.id}`)}
        empty={{ icon: ArrowRightLeft, title: "No transfers", text: "The Cashier prepares a transfer; the DAF approves it." }}
        columns={[
          { key: "number", header: "Transfer", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "date", header: "Date", sortField: "transfer_date", format: "date", csv: (r) => showDay(r.transfer_date), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.transfer_date)}</span> },
          {
            key: "route", header: "From → to", csv: (r) => `${r.expand?.from_account?.code} → ${r.expand?.to_account?.code}`,
            cell: (r) => (
              <span className="block min-w-[200px]">
                <span className="flex items-center gap-1.5 font-medium text-slate-900">{r.expand?.from_account?.code} <ArrowRight size={13} className="text-slate-400" /> {r.expand?.to_account?.code}</span>
                <span className="block max-w-[320px] truncate text-[12px] text-slate-500">{r.description}</span>
              </span>
            ),
          },
          { key: "method", header: "Method / reference", csv: (r) => `${METHOD_LABELS[r.method] || r.method} ${r.reference}`, cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{METHOD_LABELS[r.method] || r.method}{r.reference ? ` · ${r.reference}` : ""}</span> },
          { key: "amount", header: "Amount", sortField: "amount", align: "right", format: "money", csv: (r) => r.amount, cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.amount)}</span> },
          { key: "by", header: "Prepared by", exportOnly: true, csv: (r) => r.expand?.prepared_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => TREASURY_DOC_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={TREASURY_DOC_STATUS} /> },
        ]}
      />
      <TransferDialog open={open} onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); navigate(`/dashboard/treasury/transfers/${id}`); }} />
    </div>
  );
}
