/**
 * Bank & cash → Receipts: money received (member contributions, Government transfers, donor grants, fees).
 * The Cashier records, the DAF verifies, the receipt is posted to the cash book.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, PiggyBank, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, PAYER_TYPES, TREASURY_DOC_STATUS } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { IMPORTS } from "@/lib/importConfigs";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { Button, DocNo, Num, Page, PageHeader, fmtDate, statusText } from "@/components/ims";
import ReceiptDialog from "./ReceiptDialog";

export default function Receipts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const canRecord = can("manage_treasury");
  const view = params.get("view") || (can("approve_treasury") && !canRecord ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All receipts" },
    { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "posted", label: "Posted", filter: 'status = "approved"' },
    { key: "closed", label: "Reversed or cancelled", filter: 'status = "reversed" || status = "cancelled" || status = "rejected"' },
  ];
  const openReceipt = (r: any) => navigate(`/dashboard/treasury/receipts/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Bank & cash", to: "/dashboard/treasury" }, { label: "Receipts" }]}
        title="Receipts"
        subtitle="Money received by RALGA, recorded by the Cashier and verified by the DAF before it reaches the cash book."
        primary={canRecord ? { label: "Record a receipt", icon: Plus, onClick: () => setOpen(true) } : undefined}
      />
      <RecordTable<any>
        collection="cash_receipts"
        expand="account,income_account,recorded_by,funding_source"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "payer_name", "reference", "description"]}
        searchPlaceholder="Search number, payer or reference"
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
        importConfig={canRecord ? IMPORTS.receipts : undefined}
        onRowClick={openReceipt}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: openReceipt }]}
        empty={{
          icon: PiggyBank,
          title: "No receipts",
          text: view === "pending" ? "No receipt is waiting for the DAF." : "No receipts yet. The Cashier records money received; the DAF verifies it.",
          action: canRecord && view !== "pending" ? <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Record a receipt</Button> : undefined,
        }}
        columns={[
          { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
          { key: "date", header: "Received", sortField: "receipt_date", nowrap: true, format: "date", csv: (r) => showDay(r.receipt_date), cell: (r) => fmtDate(r.receipt_date) },
          {
            key: "payer", header: "Received from", sortField: "payer_name", clamp: true, csv: (r) => r.payer_name,
            cell: (r) => <span className="font-semibold text-ims-text">{r.payer_name}</span>,
            sub: (r) => (r.expand?.income_account ? `${r.expand.income_account.code} ${r.expand.income_account.name}` : PAYER_TYPES[r.payer_type]),
          },
          { key: "account", header: "Into", nowrap: true, csv: (r) => r.expand?.account?.code || "", cell: (r) => r.expand?.account?.code || "—", sub: (r) => r.expand?.account?.name },
          {
            key: "method", header: "Method", nowrap: true, csv: (r) => `${METHOD_LABELS[r.method] || r.method} ${r.reference}`,
            cell: (r) => METHOD_LABELS[r.method] || r.method,
            sub: (r) => (r.reference ? <span className="font-mono">{r.reference}</span> : null),
          },
          { key: "fund", header: "Funding source", exportOnly: true, csv: (r) => r.expand?.funding_source?.name || "", cell: () => null },
          { key: "amount", header: "Amount (RWF)", sortField: "amount", align: "right", sum: "amount", format: "money", csv: (r) => r.amount, cell: (r) => <span className="font-semibold"><Num value={r.amount} /></span> },
          { key: "by", header: "Recorded by", exportOnly: true, csv: (r) => r.expand?.recorded_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(TREASURY_DOC_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={TREASURY_DOC_STATUS} /> },
        ]}
      />
      <ReceiptDialog open={open} onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); setRefresh((n) => n + 1); navigate(`/dashboard/treasury/receipts/${id}`); }} />
    </Page>
  );
}
