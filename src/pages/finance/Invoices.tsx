import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isPast } from "date-fns";
import { Banknote, FileText, Plus, Search } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { INVOICE_STATUS, PAYMENT_METHODS, money, pbQuote } from "@/lib/procurement";
import { cn } from "@/utils";
import RecordInvoiceDialog from "./RecordInvoiceDialog";

const dateOf = (v?: string) => (v ? format(new Date(v), "d MMM yyyy") : "—");

export default function Invoices() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const now = new Date().toISOString().replace("T", " ");
  const [picking, setPicking] = React.useState(false);
  const [po, setPo] = React.useState<any>(null);

  const views: RecordView[] = [
    { key: "all", label: "All bills" },
    { key: "exception", label: "Match exceptions", filter: `status = "exception"` },
    { key: "draft", label: "To submit", filter: `status = "matched" || status = "returned"` },
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "mine", label: "Awaiting my approval", filter: `status = "pending_approval" && pending_approvers ~ "${me?.id}"` },
    { key: "topay", label: "To pay", filter: `status = "approved" || status = "partially_paid"` },
    { key: "overdue", label: "Overdue", filter: `(status = "approved" || status = "partially_paid") && due_date < "${now}"` },
    { key: "paid", label: "Paid", filter: `status = "paid"` },
  ];

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    { key: "vendor", header: "Vendor", className: "max-w-[240px]", cell: (r) => <div className="min-w-0"><p className="truncate">{r.expand?.supplier?.name}</p><p className="truncate text-[12px] text-slate-500">Ref. {r.supplier_invoice_number}</p></div>, csv: (r) => r.expand?.supplier?.name },
    { key: "ref", header: "Vendor reference", exportOnly: true, cell: (r) => r.supplier_invoice_number, csv: (r) => r.supplier_invoice_number },
    { key: "po", header: "Source", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.purchase_order?.number}</span>, csv: (r) => r.expand?.purchase_order?.number },
    { key: "department", header: "Department", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.department?.name || "—"}</span>, csv: (r) => r.expand?.department?.name || "" },
    { key: "date", header: "Bill date", sortField: "invoice_date", cell: (r) => <span className="whitespace-nowrap text-slate-600">{dateOf(r.invoice_date)}</span>, csv: (r) => r.invoice_date?.slice(0, 10) },
    {
      key: "due",
      header: "Due date",
      sortField: "due_date",
      cell: (r) => {
        const late = r.balance > 0 && ["approved", "partially_paid"].includes(r.status) && r.due_date && isPast(new Date(r.due_date));
        return <span className={cn("whitespace-nowrap", late ? "font-medium text-red-600" : "text-slate-600")}>{dateOf(r.due_date)}{late && " · late"}</span>;
      },
      csv: (r) => r.due_date?.slice(0, 10),
    },
    { key: "total", header: "Total", sortField: "total", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums">{money(r.total, r.currency)}</span>, csv: (r) => r.total },
    { key: "balance", header: "Amount due", sortField: "balance", align: "right", cell: (r) => <span className={cn("whitespace-nowrap font-medium tabular-nums", !r.balance && "text-slate-400")}>{money(r.balance, r.currency)}</span>, csv: (r) => r.balance },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={INVOICE_STATUS} />, csv: (r) => INVOICE_STATUS[r.status]?.label },
  ];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Vendor bills"
        description="Supplier invoices matched against purchase orders and goods received, approved, then paid."
        breadcrumbs={[{ title: "Accounts payable", link: "/dashboard/finance/invoices" }, { title: "Vendor bills", link: "/dashboard/finance/invoices" }]}
        actions={canPerform("manage_invoices") && <Button size="sm" onClick={() => setPicking(true)}><Plus size={14} /> New bill</Button>}
      />
      <RecordTable
        collection="supplier_invoices"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "supplier_invoice_number", "supplier.name", "purchase_order.number", "department.name"]}
        expand="supplier,purchase_order,department"
        defaultSort="-created"
        exportName="vendor-bills"
        onRowClick={(r) => navigate(`/dashboard/finance/invoices/${r.id}`)}
        empty={{ icon: FileText, title: "No vendor bills found", text: "Bills are recorded against a purchase order once goods or services have been received." }}
      />
      <PickPoDialog open={picking} onClose={() => setPicking(false)} onPick={(p) => { setPicking(false); setPo(p); }} />
      {po && <RecordInvoiceDialog po={po} open={Boolean(po)} onClose={() => setPo(null)} />}
    </div>
  );
}

/** Orders with goods received but not fully billed. */
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>New vendor bill</DialogTitle>
          <DialogDescription>Choose the purchase order the bill is for. Only orders with received, unbilled goods or services are listed.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search PO number, vendor or subject" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-slate-200">
          <table className="dnr-grid w-full text-[13px]">
            <thead className="sticky top-0"><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">PO</th><th className="px-3 py-2">Vendor</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Billed</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {q.isLoading && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>}
              {q.data && !q.data.items.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No order is waiting for a bill.</td></tr>}
              {q.data?.items.map((p: any) => (
                <tr key={p.id} className="cursor-pointer hover:bg-primary/5" onClick={() => onPick(p)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onPick(p)}>
                  <td className="px-3 py-2"><p className="font-medium">{p.number}</p><p className="truncate text-[12px] text-slate-500">{p.title}</p></td>
                  <td className="px-3 py-2">{p.expand?.supplier?.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(p.received_value, p.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(p.invoiced_value, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Payments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all";
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().replace("T", " ");
  const views: RecordView[] = [
    { key: "all", label: "All payments" },
    { key: "month", label: "This month", filter: `payment_date >= "${monthStart}"` },
    ...Object.entries(PAYMENT_METHODS).map(([k, l]) => ({ key: k, label: l, filter: `method = "${k}"` })),
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Payment", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    { key: "date", header: "Date", sortField: "payment_date", cell: (r) => <span className="whitespace-nowrap text-slate-600">{dateOf(r.payment_date)}</span>, csv: (r) => r.payment_date?.slice(0, 10) },
    { key: "vendor", header: "Vendor", cell: (r) => r.expand?.supplier?.name, csv: (r) => r.expand?.supplier?.name },
    { key: "voucher", header: "Voucher", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px]">{r.expand?.voucher?.number || "—"}</span>, csv: (r) => r.expand?.voucher?.number || "" },
    { key: "bill", header: "Bill", cell: (r) => <span className="whitespace-nowrap">{r.expand?.invoice?.number || "—"}</span>, csv: (r) => r.expand?.invoice?.number || "" },
    { key: "po", header: "Purchase order", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.purchase_order?.number}</span>, csv: (r) => r.expand?.purchase_order?.number },
    { key: "method", header: "Method", cell: (r) => PAYMENT_METHODS[r.method] || r.method, csv: (r) => PAYMENT_METHODS[r.method] || r.method },
    { key: "ref", header: "Reference", cell: (r) => <span className="text-slate-600">{r.reference || "—"}</span>, csv: (r) => r.reference },
    { key: "by", header: "Paid by", cell: (r) => r.expand?.paid_by?.name, csv: (r) => r.expand?.paid_by?.name },
    { key: "amount", header: "Settled", sortField: "amount", align: "right", format: "money", cell: (r) => <span className="whitespace-nowrap tabular-nums">{money(r.amount, r.currency)}</span>, csv: (r) => r.amount },
    { key: "wht", header: "Tax withheld", sortField: "wht_amount", align: "right", format: "money", cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{r.wht_amount ? money(r.wht_amount, r.currency) : "—"}</span>, csv: (r) => r.wht_amount || 0 },
    { key: "net", header: "Net paid", sortField: "net_amount", align: "right", format: "money", cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{money(r.voucher ? r.net_amount : r.amount, r.currency)}</span>, csv: (r) => (r.voucher ? r.net_amount : r.amount) },
  ];
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Payments"
        description="Every payment executed by the Cashier, with its voucher, the bill it settles, the tax withheld and the net paid."
        breadcrumbs={[{ title: "Accounts payable", link: "/dashboard/finance/invoices" }, { title: "Payments", link: "/dashboard/finance/payments" }]}
      />
      <RecordTable
        collection="payments"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reference", "supplier.name", "invoice.number", "purchase_order.number", "voucher.number"]}
        expand="supplier,invoice,purchase_order,paid_by,voucher"
        defaultSort="-payment_date"
        exportName="payments"
        onRowClick={(r) => navigate(r.voucher ? `/dashboard/finance/vouchers/${r.voucher}` : `/dashboard/finance/invoices/${r.invoice}?tab=payments`)}
        empty={{ icon: Banknote, title: "No payments found", text: "Payments are executed by the Cashier from approved payment vouchers." }}
      />
    </div>
  );
}
