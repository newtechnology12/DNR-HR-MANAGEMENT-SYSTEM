import { useQuery } from "react-query";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/procurement";

function Sheet({ title, number, date, children }: { title: string; number: string; date?: string; children: React.ReactNode }) {
  const { settings } = useSettings();
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button onClick={() => window.print()}><Printer size={15} /> Print / save as PDF</Button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-12 py-10 text-[12.5px] leading-relaxed text-slate-900 shadow-card print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <img src="/dnr_log.png" alt="" className="mb-2 h-10" />
            <p className="font-semibold">{settings?.company_name || "DNR Partners CPA"}</p>
            <p className="text-slate-600">{settings?.company_address}</p>
            <p className="text-slate-600">{settings?.company_phone} · {settings?.company_email}</p>
          </div>
          <div className="text-right">
            <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-[14px] font-semibold">{number}</p>
            {date && <p className="text-slate-600">{date}</p>}
          </div>
        </header>
        {children}
      </article>
    </div>
  );
}

const th = "border border-slate-300 px-2 py-1.5";
const td = "border border-slate-300 px-2 py-1.5";

export function PoPrint() {
  const { poId } = useParams();
  const q = useQuery(["po-print", poId], () => pocketbase.collection("purchase_orders").getOne(poId!, { expand: "supplier,buyer,department,requisition,approval" }));
  const po: any = q.data;
  if (q.isLoading) return <p className="p-8 text-[13px] text-slate-500">Preparing document…</p>;
  if (!po) return <p className="p-8 text-[13px] text-red-600">This purchase order is not available to you.</p>;
  const s = po.expand?.supplier || {};
  return (
    <Sheet title="PURCHASE ORDER" number={po.number} date={`Order date ${format(new Date(po.order_date || po.created), "d MMMM yyyy")}`}>
      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Supplier</p>
          <p className="font-semibold">{s.name}</p>
          <p>{[s.address, s.district, s.country].filter(Boolean).join(", ")}</p>
          <p>{s.email} · {s.phone}</p>
          <p className="text-slate-600">{s.code}{s.tin ? ` · TIN ${s.tin}` : ""}</p>
        </div>
        <div className="space-y-1">
          {[
            ["Deliver to", po.delivery_location],
            ["Expected delivery", po.expected_delivery_date ? format(new Date(po.expected_delivery_date), "d MMMM yyyy") : "—"],
            ["Payment terms", po.payment_terms],
            ["Delivery terms", po.delivery_terms],
            ["Requisition", po.expand?.requisition?.number],
          ].map(([k, v]) => (
            <p key={k}><span className="inline-block w-36 text-slate-500">{k}</span>{v || "—"}</p>
          ))}
        </div>
      </section>
      <table className="mt-5 w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left"><th className={th}>#</th><th className={th}>Description</th><th className={`${th} text-right`}>Qty</th><th className={th}>Unit</th><th className={`${th} text-right`}>Unit price</th><th className={`${th} text-right`}>Disc.</th><th className={`${th} text-right`}>VAT</th><th className={`${th} text-right`}>Total</th></tr></thead>
        <tbody>
          {(po.items || []).map((l: any) => (
            <tr key={l.line}>
              <td className={td}>{l.line}</td>
              <td className={td}>{l.description}{(l.brand || l.specification) && <span className="block text-slate-600">{[l.brand, l.specification].filter(Boolean).join(" · ")}</span>}</td>
              <td className={`${td} text-right`}>{l.quantity}</td>
              <td className={td}>{l.unit}</td>
              <td className={`${td} text-right`}>{Math.round(l.unit_price).toLocaleString()}</td>
              <td className={`${td} text-right`}>{l.discount_pct ? `${l.discount_pct}%` : "—"}</td>
              <td className={`${td} text-right`}>{l.tax_rate}%</td>
              <td className={`${td} text-right`}>{Math.round(l.total).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="ml-auto mt-2 text-[12.5px]">
        <tbody>
          {[["Subtotal", po.subtotal], ["Discount", -po.discount_total], ["VAT", po.tax_total], ["Delivery & other charges", po.delivery_cost + po.other_charges]].map(([k, v]: any) => (
            <tr key={k}><td className="pr-6 text-slate-600">{k}</td><td className="text-right tabular-nums">{money(v, po.currency)}</td></tr>
          ))}
          <tr className="font-bold"><td className="pr-6 pt-1">TOTAL</td><td className="pt-1 text-right tabular-nums">{money(po.grand_total, po.currency)}</td></tr>
        </tbody>
      </table>
      <p className="mt-5 text-[12px] text-slate-700"><span className="font-semibold">Terms: </span>{po.terms_conditions}</p>
      {po.notes && <p className="mt-1 text-[12px] text-slate-700"><span className="font-semibold">Notes: </span>{po.notes}</p>}
      <footer className="mt-10 grid grid-cols-3 gap-6 text-[12px]">
        <div><p className="border-t border-slate-400 pt-1">{po.expand?.buyer?.name}</p><p className="text-slate-600">Buyer</p></div>
        <div><p className="border-t border-slate-400 pt-1">Approved {po.approved_at ? format(new Date(po.approved_at), "d MMM yyyy") : ""}</p><p className="text-slate-600">{po.expand?.approval?.workflow_name}</p></div>
        <div><p className="border-t border-slate-400 pt-1">Supplier acceptance</p><p className="text-slate-600">Signature and stamp</p></div>
      </footer>
    </Sheet>
  );
}

export function GrnPrint() {
  const { grnId } = useParams();
  const q = useQuery(["grn-print", grnId], () => pocketbase.collection("goods_receipts").getOne(grnId!, { expand: "purchase_order,supplier,received_by,warehouse" }));
  const g: any = q.data;
  if (q.isLoading) return <p className="p-8 text-[13px] text-slate-500">Preparing document…</p>;
  if (!g) return <p className="p-8 text-[13px] text-red-600">This receipt is not available to you.</p>;
  return (
    <Sheet title={g.receipt_type === "service" ? "SERVICE CONFIRMATION" : "GOODS RECEIVED NOTE"} number={g.number} date={format(new Date(g.receipt_date), "d MMMM yyyy")}>
      <section className="mt-5 grid grid-cols-2 gap-6">
        <div className="space-y-1">
          <p><span className="inline-block w-36 text-slate-500">Supplier</span>{g.expand?.supplier?.name}</p>
          <p><span className="inline-block w-36 text-slate-500">Purchase order</span>{g.expand?.purchase_order?.number}</p>
          <p><span className="inline-block w-36 text-slate-500">Delivery note</span>{g.delivery_note_number || "—"}</p>
        </div>
        <div className="space-y-1">
          <p><span className="inline-block w-36 text-slate-500">Warehouse</span>{g.expand?.warehouse?.name || "—"}</p>
          <p><span className="inline-block w-36 text-slate-500">Received by</span>{g.expand?.received_by?.name}</p>
          <p><span className="inline-block w-36 text-slate-500">Accepted value</span>{money(g.accepted_value, g.expand?.purchase_order?.currency)}</p>
        </div>
      </section>
      <table className="mt-5 w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left"><th className={th}>#</th><th className={th}>Description</th><th className={`${th} text-right`}>Ordered</th><th className={`${th} text-right`}>Delivered</th><th className={`${th} text-right`}>Rejected</th><th className={`${th} text-right`}>Accepted</th><th className={th}>Condition / batch / serials</th></tr></thead>
        <tbody>
          {(g.items || []).map((i: any) => (
            <tr key={i.line}>
              <td className={td}>{i.line}</td>
              <td className={td}>{i.description}{i.rejected > 0 && <span className="block text-red-700">Rejected: {i.rejection_reason}</span>}</td>
              <td className={`${td} text-right`}>{i.ordered}</td>
              <td className={`${td} text-right`}>{i.received}</td>
              <td className={`${td} text-right`}>{i.rejected || "—"}</td>
              <td className={`${td} text-right font-semibold`}>{i.accepted}</td>
              <td className={td}>{[i.condition?.replace(/_/g, " "), i.batch && `batch ${i.batch}`, i.expiry_date && `exp. ${i.expiry_date}`, i.serial_numbers?.length ? `S/N ${i.serial_numbers.join(", ")}` : ""].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.notes && <p className="mt-4"><span className="font-semibold">Notes: </span>{g.notes}</p>}
      <footer className="mt-12 grid grid-cols-2 gap-8 text-[12px]">
        <div><p className="border-t border-slate-400 pt-1">{g.expand?.received_by?.name}</p><p className="text-slate-600">Received and inspected by</p></div>
        <div><p className="border-t border-slate-400 pt-1">Supplier's representative</p><p className="text-slate-600">Name and signature</p></div>
      </footer>
    </Sheet>
  );
}
