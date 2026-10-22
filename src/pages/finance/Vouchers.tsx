/**
 * Payables → Payment vouchers. The Accountant prepares, the DAF (and SG above the DAF limit) approve,
 * the Cashier executes. Tabs follow that flow: drafts, awaiting my approval, in approval, to pay.
 */
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, FileCheck2, Pencil, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { VOUCHER_STATUS, VOUCHER_TYPES } from "@/lib/payables";
import { StatusBadge } from "@/components/enterprise/ui";
import { WithPeople } from "@/components/enterprise/WithCell";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Button, DocNo, Num, Page, PageHeader, Person, TwoLine, fmtDate, overdue, statusText } from "@/components/ims";

const LIST = "/dashboard/finance/vouchers";

/** Count of one view for its tab. */
function useCount(key: string, filter: string, enabled = true) {
  return useQuery(["voucher-view-count", key, filter], () => pocketbase.collection("payment_vouchers").getList(1, 1, { filter, fields: "id" }).then((r) => r.totalItems), { enabled });
}

export default function Vouchers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const me = pocketbase.authStore.model as any;
  const view = params.get("view") || (can("record_payments") && !can("manage_payment_vouchers") ? "to_pay" : "all");
  const mineFilter = `status = "pending_approval" && pending_approvers ~ "${me?.id}"`;
  // At most five tabs; paid, rejected and cancelled vouchers are found with the status filter.
  const views: RecordView[] = [
    { key: "all", label: "All vouchers" },
    { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
    { key: "mine", label: "Awaiting my approval", filter: mineFilter },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "to_pay", label: "To pay", filter: 'status = "approved"' },
  ];
  const mine = useCount("mine", mineFilter, Boolean(me?.id));
  const toPay = useCount("to_pay", views[4].filter!);
  const counts = { mine: mine.data, to_pay: toPay.data };

  /** Who must act now. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.pending_approvers} />;
    if (r.status === "draft" || r.status === "returned") return <Person name={r.expand?.prepared_by?.name} detail="To submit for approval" />;
    if (r.status === "approved") return <Person name="Cashier" detail="To pay" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Voucher", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => VOUCHER_TYPES[r.voucher_type]?.label },
    { key: "payee", header: "Payee", sortField: "payee_name", className: "min-w-[200px] max-w-[300px]", csv: (r) => r.payee_name, cell: (r) => <TwoLine main={r.payee_name || "—"} sub={r.description} /> },
    { key: "type", header: "Type", exportOnly: true, cell: (r) => VOUCHER_TYPES[r.voucher_type]?.label || "", csv: (r) => VOUCHER_TYPES[r.voucher_type]?.label || "" },
    { key: "description", header: "What is paid", exportOnly: true, cell: (r) => r.description || "", csv: (r) => r.description || "" },
    { key: "gross", header: "Gross (RWF)", sortField: "gross_amount", align: "right", sum: "gross_amount", format: "money", csv: (r) => r.gross_amount, cell: (r) => <Num value={r.gross_amount} /> },
    { key: "wht", header: "Tax withheld (RWF)", sortField: "wht_amount", exportOnly: true, align: "right", sum: "wht_amount", format: "money", csv: (r) => r.wht_amount, cell: (r) => (r.wht_amount ? <Num value={r.wht_amount} /> : <span className="text-ims-faint">—</span>) },
    { key: "net", header: "Net to pay (RWF)", sortField: "net_amount", align: "right", sum: "net_amount", format: "money", csv: (r) => r.net_amount, cell: (r) => <span className="font-semibold"><Num value={r.net_amount} /></span> },
    {
      key: "due",
      header: "Pay by",
      sortField: "due_date",
      nowrap: true,
      format: "date",
      csv: (r) => (r.due_date ? String(r.due_date).slice(0, 10) : ""),
      cell: (r) => fmtDate(r.due_date),
      sub: (r) => {
        const late = r.status === "approved" ? overdue(r.due_date) : null;
        return late ? <span className="font-semibold text-ims-danger">{late}</span> : null;
      },
    },
    { key: "by", header: "Prepared by", exportOnly: true, csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => r.expand?.prepared_by?.name || "—" },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(VOUCHER_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={VOUCHER_STATUS} /> },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
  ];

  const canCreate = can("manage_payment_vouchers");
  const open = (r: any) => navigate(`${LIST}/${r.id}`);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Payables", to: "/dashboard/finance/invoices" }, { label: "Payment vouchers" }]}
        title="Payment vouchers"
        subtitle="Supplier payments and direct expenses: prepared by the Accountant, approved by the DAF, paid by the Cashier."
        primary={canCreate ? { label: "New payment voucher", icon: Plus, to: `${LIST}/new` } : undefined}
      />
      <RecordTable<any>
        collection="payment_vouchers"
        expand="supplier,prepared_by"
        views={views}
        activeView={view}
        viewCounts={counts}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "payee_name", "description", "payment_reference"]}
        searchPlaceholder="Search number, payee or reference"
        filters={[
          { field: "status", label: "Status", options: Object.entries(VOUCHER_STATUS).map(([value, m]) => ({ value, label: statusText(m, value) })) },
          { field: "voucher_type", label: "Type", options: Object.entries(VOUCHER_TYPES).map(([value, t]) => ({ value, label: t.label })) },
          { field: "supplier", label: "Supplier", collection: "suppliers" },
          { field: "department", label: "Department", collection: "departments" },
        ]}
        dateField="created"
        dateLabel="Prepared"
        defaultSort="-created"
        exportName="payment-vouchers"
        exportTitle="Payment vouchers"
        exportPermission={["export_invoices", "view_payment_vouchers", "manage_payment_vouchers"]}
        onRowClick={open}
        rowActions={(r) => [
          { label: "Open", icon: ExternalLink, onSelect: open },
          ...(canCreate && ["draft", "returned"].includes(r.status) ? [{ label: "Edit", icon: Pencil, onSelect: () => navigate(`${LIST}/${r.id}/edit`) }] : []),
        ]}
        empty={{
          icon: FileCheck2,
          title: "No payment vouchers yet.",
          text: view === "mine" ? "Nothing is waiting for your approval." : view === "to_pay" ? "No approved voucher is waiting to be paid." : "The Accountant prepares a voucher from approved supplier invoices or for a direct expense.",
          action: canCreate && view === "all" ? <Button variant="primary" icon={Plus} onClick={() => navigate(`${LIST}/new`)}>New payment voucher</Button> : undefined,
        }}
        columns={columns}
      />
    </Page>
  );
}
