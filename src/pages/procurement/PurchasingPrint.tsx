import { useQuery } from "react-query";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { Button, fmtDate, fmtMoney, fmtNumber, sentence } from "@/components/ims";
import { money } from "@/lib/procurement";

/** Money in text: "RWF 1,250,000" (or the document's own currency). */
const amount = (n: number | undefined, currency?: string) => (!currency || currency === "RWF" ? fmtMoney(n) : money(n, currency));

function Sheet({ title, number, date, children }: { title: string; number: string; date?: string; children: React.ReactNode }) {
  const { settings } = useSettings();
  return (
    <div className="min-h-screen bg-ims-page py-6 print:bg-ims-card print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button variant="primary" icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <article className="mx-auto max-w-[210mm] rounded-card border border-ims-border bg-ims-card px-12 py-10 text-t-small leading-relaxed text-ims-text print:rounded-none print:border-0">
        <header className="flex items-start justify-between border-b-2 border-ims-text pb-4">
          <div>
            <img src="/dnr_log.png" alt="" className="mb-2 h-10" />
            <p className="font-semibold">{settings?.company_name || "DNR Partners CPA"}</p>
            <p className="text-ims-body">{settings?.company_address}</p>
            <p className="text-ims-body">{[settings?.company_phone, settings?.company_email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <h1 className="text-t-section text-ims-text">{title}</h1>
            <p className="mt-1 whitespace-nowrap font-mono text-t-body font-semibold">{number}</p>
            {date && <p className="text-ims-body">{date}</p>}
          </div>
        </header>
        {children}
      </article>
    </div>
  );
}

const th = "border border-ims-field px-2 py-1.5";
const td = "border border-ims-field px-2 py-1.5";
/** "Label   value" on one line; a long value wraps under itself, not under the label. */
function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <p className="flex">
      <span className="w-36 shrink-0 text-ims-muted">{k}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function PoPrint() {
  const { poId } = useParams();
  const q = useQuery(["po-print", poId], () => pocketbase.collection("purchase_orders").getOne(poId!, { expand: "supplier,buyer,department,requisition,approval" }));
  const po: any = q.data;
  if (q.isLoading) return <p className="p-8 text-t-body text-ims-muted">Preparing the document…</p>;
  if (!po) return <p className="p-8 text-t-body text-ims-danger">This purchase order is not available to you.</p>;
  const s = po.expand?.supplier || {};
  const currency = po.currency || "RWF";
  return (
    <Sheet title="Purchase order" number={po.number} date={`Order date ${fmtDate(po.order_date || po.created)}`}>
      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="text-t-small font-semibold text-ims-muted">Supplier</p>
          <p className="font-semibold">{s.name}</p>
          <p>{[s.address, s.district, s.country].filter(Boolean).join(", ")}</p>
          <p>{[s.email, s.phone].filter(Boolean).join(" · ")}</p>
          <p className="text-ims-body">{s.code}{s.tin ? ` · TIN ${s.tin}` : ""}</p>
        </div>
        <div className="space-y-1">
          {[
            ["Deliver to", po.delivery_location],
            ["Expected delivery", po.expected_delivery_date ? fmtDate(po.expected_delivery_date) : "—"],
            ["Payment terms", po.payment_terms],
            ["Delivery terms", po.delivery_terms],
            ["Requisition", po.expand?.requisition?.number],
          ].map(([k, v]) => (
            <Line key={k} k={k}>{v || "—"}</Line>
          ))}
        </div>
      </section>
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="bg-ims-thead text-left">
            <th className={th}>#</th>
            <th className={th}>Description</th>
            <th className={`${th} text-right`}>Quantity</th>
            <th className={th}>Unit</th>
            <th className={`${th} text-right`}>Unit price ({currency})</th>
            <th className={`${th} text-right`}>Discount (%)</th>
            <th className={`${th} text-right`}>VAT (%)</th>
            <th className={`${th} text-right`}>Total ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {(po.items || []).map((l: any) => (
            <tr key={l.line}>
              <td className={td}>{l.line}</td>
              <td className={td}>{l.description}{(l.brand || l.specification) && <span className="block text-ims-body">{[l.brand, l.specification].filter(Boolean).join(" · ")}</span>}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtNumber(l.quantity, true)}</td>
              <td className={td}>{l.unit}</td>
              <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{fmtNumber(l.unit_price)}</td>
              <td className={`${td} text-right tabular-nums`}>{l.discount_pct ? fmtNumber(l.discount_pct, true) : "—"}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtNumber(l.tax_rate, true)}</td>
              <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{fmtNumber(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="ml-auto mt-2 text-t-small">
        <tbody>
          {[["Subtotal", po.subtotal], ["Discount", po.discount_total ? -po.discount_total : 0], ["VAT", po.tax_total], ["Delivery and other charges", po.delivery_cost + po.other_charges]].map(([k, v]: any) => (
            <tr key={k}><td className="pr-6 text-ims-body">{k}</td><td className="whitespace-nowrap text-right tabular-nums">{amount(v, po.currency)}</td></tr>
          ))}
          <tr className="font-bold"><td className="pr-6 pt-1">Total</td><td className="whitespace-nowrap pt-1 text-right tabular-nums">{amount(po.grand_total, po.currency)}</td></tr>
        </tbody>
      </table>
      <p className="mt-5 text-t-hint text-ims-body"><span className="font-semibold">Terms: </span>{po.terms_conditions}</p>
      {po.notes && <p className="mt-1 text-t-hint text-ims-body"><span className="font-semibold">Notes: </span>{po.notes}</p>}
      <footer className="mt-10 grid grid-cols-3 gap-6 text-t-hint">
        <div><p className="border-t border-ims-faint pt-1">{po.expand?.buyer?.name}</p><p className="text-ims-body">Buyer</p></div>
        <div><p className="border-t border-ims-faint pt-1">Approved {po.approved_at ? fmtDate(po.approved_at) : ""}</p><p className="text-ims-body">{po.expand?.approval?.workflow_name}</p></div>
        <div><p className="border-t border-ims-faint pt-1">Supplier acceptance</p><p className="text-ims-body">Signature and stamp</p></div>
      </footer>
    </Sheet>
  );
}

export function GrnPrint() {
  const { grnId } = useParams();
  const q = useQuery(["grn-print", grnId], () => pocketbase.collection("goods_receipts").getOne(grnId!, { expand: "purchase_order,supplier,received_by,warehouse" }));
  const g: any = q.data;
  if (q.isLoading) return <p className="p-8 text-t-body text-ims-muted">Preparing the document…</p>;
  if (!g) return <p className="p-8 text-t-body text-ims-danger">This receipt is not available to you.</p>;
  return (
    <Sheet title={g.receipt_type === "service" ? "Service confirmation" : "Goods received note"} number={g.number} date={`Received ${fmtDate(g.receipt_date)}`}>
      <section className="mt-5 grid grid-cols-2 gap-6">
        <div className="space-y-1">
          <Line k="Supplier">{g.expand?.supplier?.name}</Line>
          <Line k="Purchase order"><span className="whitespace-nowrap">{g.expand?.purchase_order?.number}</span></Line>
          <Line k="Delivery note">{g.delivery_note_number || "—"}</Line>
        </div>
        <div className="space-y-1">
          <Line k="Warehouse">{g.expand?.warehouse?.name || "—"}</Line>
          <Line k="Received by">{g.expand?.received_by?.name}</Line>
          <Line k="Accepted value">{amount(g.accepted_value, g.expand?.purchase_order?.currency)}</Line>
        </div>
      </section>
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="bg-ims-thead text-left">
            <th className={th}>#</th>
            <th className={th}>Description</th>
            <th className={`${th} text-right`}>Ordered</th>
            <th className={`${th} text-right`}>Delivered</th>
            <th className={`${th} text-right`}>Rejected</th>
            <th className={`${th} text-right`}>Accepted</th>
            <th className={th}>Condition, batch and serial numbers</th>
          </tr>
        </thead>
        <tbody>
          {(g.items || []).map((i: any) => (
            <tr key={i.line}>
              <td className={td}>{i.line}</td>
              <td className={td}>{i.description}{i.rejected > 0 && <span className="block text-ims-danger">Rejected: {i.rejection_reason}</span>}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtNumber(i.ordered, true)}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtNumber(i.received, true)}</td>
              <td className={`${td} text-right tabular-nums`}>{i.rejected ? fmtNumber(i.rejected, true) : "—"}</td>
              <td className={`${td} text-right font-semibold tabular-nums`}>{fmtNumber(i.accepted, true)}</td>
              <td className={td}>{[sentence(i.condition), i.batch && `batch ${i.batch}`, i.expiry_date && `expires ${fmtDate(i.expiry_date)}`, i.serial_numbers?.length ? `S/N ${i.serial_numbers.join(", ")}` : ""].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.notes && <p className="mt-4"><span className="font-semibold">Notes: </span>{g.notes}</p>}
      <footer className="mt-12 grid grid-cols-2 gap-8 text-t-hint">
        <div><p className="border-t border-ims-faint pt-1">{g.expand?.received_by?.name}</p><p className="text-ims-body">Received and inspected by</p></div>
        <div><p className="border-t border-ims-faint pt-1">Supplier's representative</p><p className="text-ims-body">Name and signature</p></div>
      </footer>
    </Sheet>
  );
}
