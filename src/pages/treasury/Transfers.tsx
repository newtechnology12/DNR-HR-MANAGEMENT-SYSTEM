/**
 * Bank & cash → Transfers between RALGA's own accounts (petty cash replenishments, moves between banks,
 * reimbursements out of a programme account). Cashier prepares, DAF approves, then it is posted.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowRightLeft, ExternalLink, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, TREASURY_DOC_STATUS } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { Button, DocNo, Num, Page, PageHeader, fmtDate, statusText } from "@/components/ims";
import TransferDialog from "./TransferDialog";

export default function Transfers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const canPrepare = can("manage_treasury");
  const view = params.get("view") || (can("approve_treasury") && !canPrepare ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All transfers" },
    { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "posted", label: "Posted", filter: 'status = "approved"' },
  ];
  const openTransfer = (r: any) => navigate(`/dashboard/treasury/transfers/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Bank & cash", to: "/dashboard/treasury" }, { label: "Transfers" }]}
        title="Transfers"
        subtitle="Money moved between RALGA's own accounts: petty cash, bank to bank, programme reimbursements."
        primary={canPrepare ? { label: "New transfer", icon: Plus, onClick: () => setOpen(true) } : undefined}
      />
      <RecordTable<any>
        collection="bank_transfers"
        expand="from_account,to_account,prepared_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reference", "description"]}
        searchPlaceholder="Search number, reference or description"
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
        onRowClick={openTransfer}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: openTransfer }]}
        empty={{
          icon: ArrowRightLeft,
          title: "No transfers",
          text: view === "pending" ? "No transfer is waiting for approval." : "No transfers yet. The Cashier prepares a transfer; the DAF approves it.",
          action: canPrepare && view !== "pending" ? <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>New transfer</Button> : undefined,
        }}
        columns={[
          { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
          { key: "date", header: "Date", sortField: "transfer_date", nowrap: true, format: "date", csv: (r) => showDay(r.transfer_date), cell: (r) => fmtDate(r.transfer_date) },
          {
            key: "route", header: "From → to", className: "min-w-[220px]", csv: (r) => `${r.expand?.from_account?.code} → ${r.expand?.to_account?.code}`,
            cell: (r) => (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-ims-text">
                {r.expand?.from_account?.code} <ArrowRight size={13} className="text-ims-faint" aria-label="to" /> {r.expand?.to_account?.code}
              </span>
            ),
            sub: (r) => <span className="line-clamp-1">{r.description}</span>,
          },
          {
            key: "method", header: "Method", nowrap: true, csv: (r) => `${METHOD_LABELS[r.method] || r.method} ${r.reference}`,
            cell: (r) => METHOD_LABELS[r.method] || r.method,
            sub: (r) => (r.reference ? <span className="font-mono">{r.reference}</span> : null),
          },
          { key: "amount", header: "Amount (RWF)", sortField: "amount", align: "right", sum: "amount", format: "money", csv: (r) => r.amount, cell: (r) => <span className="font-semibold"><Num value={r.amount} /></span> },
          { key: "by", header: "Prepared by", exportOnly: true, csv: (r) => r.expand?.prepared_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(TREASURY_DOC_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={TREASURY_DOC_STATUS} /> },
        ]}
      />
      <TransferDialog open={open} onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); navigate(`/dashboard/treasury/transfers/${id}`); }} />
    </Page>
  );
}
