import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Banknote, ExternalLink, FileText, Plus, ShoppingCart } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { WithPeople } from "@/components/enterprise/WithCell";
import {
  Button,
  Column,
  DataTable,
  DocNo,
  EmptyState,
  Modal,
  Num,
  Page,
  PageHeader,
  Person,
  SearchBox,
  TwoLine,
  fmtDate,
  overdue,
  statusText,
} from "@/components/ims";
import { INVOICE_STATUS, PAYMENT_METHODS, pbQuote } from "@/lib/procurement";
import RecordInvoiceDialog from "./RecordInvoiceDialog";

const LIST = "/dashboard/finance/invoices";
const PAYABLES = { label: "Payables", to: LIST };
const OPEN = ["approved", "partially_paid"];

/** Count of one view for its tab. */
function useCount(key: string, filter: string, enabled = true) {
  return useQuery(["invoice-view-count", key, filter], () => pocketbase.collection("supplier_invoices").getList(1, 1, { filter, fields: "id" }).then((r) => r.totalItems), { enabled });
}

export default function Invoices() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const now = new Date().toISOString().replace("T", " ");
  const [picking, setPicking] = React.useState(false);
  const [po, setPo] = React.useState<any>(null);

  // At most five tabs (the work queues); stage, due date and department are filters.
  const mineFilter = `status = "pending_approval" && pending_approvers ~ "${me?.id}"`;
  const views: RecordView[] = [
    { key: "all", label: "All invoices" },
    { key: "draft", label: "To submit", filter: `status = "matched" || status = "returned"` },
    { key: "mine", label: "Awaiting my approval", filter: mineFilter },
    { key: "exception", label: "Match exceptions", filter: `status = "exception"` },
    { key: "topay", label: "To pay", filter: `status = "approved" || status = "partially_paid"` },
  ];
  const toSubmit = useCount("draft", views[1].filter!);
  const mine = useCount("mine", mineFilter, Boolean(me?.id));
  const exceptions = useCount("exception", views[3].filter!);

  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(INVOICE_STATUS).map(([value, m]) => ({ value, label: statusText(m, value) })) },
    { field: "department", label: "Department", collection: "departments" },
    {
      field: "due",
      label: "Due",
      options: [{ value: "overdue", label: "Overdue" }],
      filterFor: () => `(status = "approved" || status = "partially_paid") && due_date < "${now}"`,
    },
  ];

  /** Who must act now. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.pending_approvers} />;
    if (r.status === "exception") return <Person name="Director of Finance" detail="To resolve the match exception" />;
    if (["received", "matched", "returned"].includes(r.status)) return <Person name="Accountant" detail="To submit for approval" />;
    if (OPEN.includes(r.status)) return <Person name="Accountant" detail="To pay through a voucher" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => (r.expand?.purchase_order?.number ? <span className="whitespace-nowrap">{r.expand.purchase_order.number}</span> : null) },
    { key: "supplier", header: "Supplier", className: "min-w-[200px] max-w-[280px]", cell: (r) => <TwoLine main={r.expand?.supplier?.name || "—"} sub={[r.supplier_invoice_number && `Ref. ${r.supplier_invoice_number}`, r.expand?.department?.name].filter(Boolean).join(" · ") || undefined} />, csv: (r) => r.expand?.supplier?.name || "" },
    { key: "ref", header: "Supplier reference", exportOnly: true, cell: (r) => r.supplier_invoice_number, csv: (r) => r.supplier_invoice_number || "" },
    { key: "po", header: "Purchase order", exportOnly: true, cell: (r) => r.expand?.purchase_order?.number || "—", csv: (r) => r.expand?.purchase_order?.number || "" },
    { key: "department", header: "Department", exportOnly: true, cell: (r) => r.expand?.department?.name || "—", csv: (r) => r.expand?.department?.name || "" },
    { key: "date", header: "Invoice date", sortField: "invoice_date", exportOnly: true, cell: (r) => fmtDate(r.invoice_date), csv: (r) => r.invoice_date?.slice(0, 10) || "" },
    {
      key: "due",
      header: "Due",
      sortField: "due_date",
      nowrap: true,
      cell: (r) => fmtDate(r.due_date),
      sub: (r) => {
        const late = r.balance > 0 && OPEN.includes(r.status) ? overdue(r.due_date) : null;
        return late ? <span className="font-semibold text-ims-danger">{late}</span> : null;
      },
      csv: (r) => r.due_date?.slice(0, 10) || "",
    },
    { key: "total", header: "Total (RWF)", sortField: "total", align: "right", sum: "total", format: "money", cell: (r) => <Num value={r.total} />, sub: (r) => (r.currency && r.currency !== "RWF" ? r.currency : null), csv: (r) => r.total },
    { key: "balance", header: "Amount due (RWF)", sortField: "balance", align: "right", sum: "balance", format: "money", cell: (r) => (r.balance ? <Num value={r.balance} /> : <span className="text-ims-faint">0</span>), csv: (r) => r.balance },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={INVOICE_STATUS} />, csv: (r) => statusText(INVOICE_STATUS[r.status], r.status) },
    { key: "with", header: "With", className: "max-w-[190px]", cell: withCell },
  ];

  const canRecord = canPerform("manage_invoices");
  const open = (r: any) => navigate(`${LIST}/${r.id}`);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[PAYABLES, { label: "Supplier invoices" }]}
        title="Supplier invoices"
        subtitle="Supplier invoices matched against the purchase order and the goods received, then approved and paid."
        primary={canRecord ? { label: "Record invoice", icon: Plus, onClick: () => setPicking(true) } : undefined}
      />
      <RecordTable
        collection="supplier_invoices"
        columns={columns}
        views={views}
        activeView={view}
        viewCounts={{ draft: toSubmit.data, mine: mine.data, exception: exceptions.data }}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "supplier_invoice_number", "supplier.name", "purchase_order.number", "department.name"]}
        searchPlaceholder="Search number, supplier or reference"
        filters={filters}
        dateField="invoice_date"
        dateLabel="Invoice date"
        expand="supplier,purchase_order,department"
        defaultSort="-created"
        exportName="supplier-invoices"
        exportTitle="Supplier invoices"
        onRowClick={open}
        rowActions={(r) => [
          { label: "Open", icon: ExternalLink, onSelect: open },
          ...(r.purchase_order ? [{ label: "Open purchase order", icon: ShoppingCart, onSelect: () => navigate(`/dashboard/procurement/purchase-orders/${r.purchase_order}`) }] : []),
          ...(canPerform("manage_payment_vouchers") && OPEN.includes(r.status)
            ? [{ label: "Prepare payment voucher", icon: Banknote, onSelect: () => navigate(`/dashboard/finance/vouchers/new?supplier=${r.supplier}&invoice=${r.id}`) }]
            : []),
        ]}
        empty={{
          icon: FileText,
          title: "No supplier invoices yet.",
          text: view === "mine" ? "Nothing is waiting for your approval." : "Invoices are recorded against a purchase order once goods or services have been received.",
          action: canRecord && view === "all" ? <Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>Record invoice</Button> : undefined,
        }}
      />
      <PickPoDialog open={picking} onClose={() => setPicking(false)} onPick={(p) => { setPicking(false); setPo(p); }} />
      {po && <RecordInvoiceDialog po={po} open={Boolean(po)} onClose={() => setPo(null)} />}
    </Page>
  );
}

/** Orders with goods received but not fully invoiced. */
function PickPoDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (po: any) => void }) {
  const [term, setTerm] = React.useState("");
  const q = useQuery(
    ["billable-pos", term],
    () =>
      pocketbase.collection("purchase_orders").getList(1, 30, {
        filter: `received_value > 0 && invoiced_value < received_value && status != "cancelled"${term.trim() ? ` && (number ~ ${pbQuote(term.trim())} || supplier.name ~ ${pbQuote(term.trim())} || title ~ ${pbQuote(term.trim())})` : ""}`,
        sort: "-order_date",
        expand: "supplier",
      }),
    { enabled: open, keepPreviousData: true }
  );
  const columns: Column<any>[] = [
    { key: "number", header: "Purchase order", clamp: true, cell: (p) => <DocNo value={p.number} />, sub: (p) => p.title },
    { key: "supplier", header: "Supplier", clamp: true, cell: (p) => p.expand?.supplier?.name || "—" },
    { key: "received", header: "Received (RWF)", numeric: true, cell: (p) => <Num value={p.received_value} />, sub: (p) => (p.currency && p.currency !== "RWF" ? p.currency : null) },
    { key: "invoiced", header: "Invoiced (RWF)", numeric: true, cell: (p) => <Num value={p.invoiced_value} /> },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Record a supplier invoice"
      description="Choose the purchase order the invoice is for. Only orders with goods or services received and not yet invoiced are listed."
      footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}
    >
      <SearchBox value={term} onChange={setTerm} placeholder="Search order number, supplier or title" className="sm:w-full" label="Search purchase orders" />
      <div className="overflow-hidden rounded-control border border-ims-border">
        <DataTable
          columns={columns}
          rows={q.data?.items || []}
          rowKey={(p) => p.id}
          onRowClick={onPick}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          fetching={q.isFetching}
          minWidth={600}
          caption="Purchase orders waiting for an invoice"
          empty={<EmptyState compact icon={ShoppingCart} text={term.trim() ? "No order matches this search." : "No order is waiting for an invoice."} />}
        />
      </div>
    </Modal>
  );
}

export function Payments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().replace("T", " ");
  // Older links (?view=cash…) open the list; the method is now a filter.
  const views: RecordView[] = [
    { key: "all", label: "All payments" },
    { key: "month", label: "This month", filter: `payment_date >= "${monthStart}"` },
  ];
  const filters: RecordFilter[] = [
    { field: "method", label: "Method", options: Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label })) },
    { field: "supplier", label: "Supplier", collection: "suppliers" },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Payment", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => fmtDate(r.payment_date) },
    { key: "date", header: "Date", sortField: "payment_date", exportOnly: true, cell: (r) => fmtDate(r.payment_date), csv: (r) => r.payment_date?.slice(0, 10) || "" },
    { key: "supplier", header: "Payee", className: "min-w-[180px] max-w-[260px]", cell: (r) => <TwoLine main={r.expand?.supplier?.name || r.expand?.voucher?.payee_name || "—"} />, csv: (r) => r.expand?.supplier?.name || r.expand?.voucher?.payee_name || "" },
    { key: "voucher", header: "Voucher", nowrap: true, cell: (r) => <DocNo value={r.expand?.voucher?.number} />, sub: (r) => r.expand?.invoice?.number, csv: (r) => r.expand?.voucher?.number || "" },
    { key: "invoice", header: "Invoice", exportOnly: true, cell: (r) => r.expand?.invoice?.number || "—", csv: (r) => r.expand?.invoice?.number || "" },
    { key: "po", header: "Purchase order", exportOnly: true, cell: (r) => r.expand?.purchase_order?.number || "—", csv: (r) => r.expand?.purchase_order?.number || "" },
    { key: "method", header: "Method", cell: (r) => PAYMENT_METHODS[r.method] || r.method || "—", sub: (r) => r.reference, csv: (r) => PAYMENT_METHODS[r.method] || r.method || "" },
    { key: "ref", header: "Reference", exportOnly: true, cell: (r) => r.reference || "—", csv: (r) => r.reference || "" },
    { key: "by", header: "Paid by", exportOnly: true, cell: (r) => r.expand?.paid_by?.name || "—", csv: (r) => r.expand?.paid_by?.name || "" },
    { key: "amount", header: "Settled (RWF)", sortField: "amount", align: "right", sum: "amount", format: "money", cell: (r) => <Num value={r.amount} />, csv: (r) => r.amount },
    { key: "wht", header: "Tax withheld (RWF)", sortField: "wht_amount", align: "right", sum: "wht_amount", format: "money", cell: (r) => (r.wht_amount ? <Num value={r.wht_amount} /> : <span className="text-ims-faint">—</span>), csv: (r) => r.wht_amount || 0 },
    { key: "net", header: "Net paid (RWF)", sortField: "net_amount", align: "right", sum: "net_amount", format: "money", cell: (r) => <span className="font-semibold"><Num value={r.voucher ? r.net_amount : r.amount} /></span>, csv: (r) => (r.voucher ? r.net_amount : r.amount) },
  ];
  return (
    <Page>
      <PageHeader
        breadcrumbs={[PAYABLES, { label: "Payments" }]}
        title="Payments"
        subtitle="Every payment made by the Cashier, with its voucher, the invoice it settles, the tax withheld and the net paid."
      />
      <RecordTable
        collection="payments"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reference", "supplier.name", "invoice.number", "purchase_order.number", "voucher.number"]}
        searchPlaceholder="Search number, reference or supplier"
        filters={filters}
        dateField="payment_date"
        dateLabel="Paid"
        expand="supplier,invoice,purchase_order,paid_by,voucher"
        defaultSort="-payment_date"
        exportName="payments"
        exportTitle="Payments"
        onRowClick={(r) => navigate(r.voucher ? `/dashboard/finance/vouchers/${r.voucher}` : `${LIST}/${r.invoice}?tab=payments`)}
        rowActions={(r) => [
          ...(r.voucher ? [{ label: "Open voucher", icon: ExternalLink, onSelect: () => navigate(`/dashboard/finance/vouchers/${r.voucher}`) }] : []),
          ...(r.invoice ? [{ label: "Open invoice", icon: FileText, onSelect: () => navigate(`${LIST}/${r.invoice}?tab=payments`) }] : []),
        ]}
        empty={{ icon: Banknote, title: "No payments yet.", text: "Payments are made by the Cashier from approved payment vouchers." }}
      />
    </Page>
  );
}
