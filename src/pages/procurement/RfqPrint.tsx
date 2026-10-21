import { useQuery } from "react-query";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";

/** Supplier-specific RFQ document, formatted for A4 printing or "Save as PDF". */
export default function RfqPrint() {
  const { rfqId, supplierId } = useParams();
  const { settings } = useSettings();
  const q = useQuery(["rfq-print", rfqId, supplierId], async () => {
    const [rfq, supplier] = await Promise.all([
      pocketbase.collection("rfqs").getOne(rfqId!, { expand: "buyer,department" }),
      pocketbase.collection("suppliers").getOne(supplierId!),
    ]);
    return { rfq, supplier };
  });
  if (q.isLoading) return <p className="p-8 text-[13px] text-slate-500">Preparing document…</p>;
  if (!q.data) return <p className="p-8 text-[13px] text-red-600">This RFQ is not available to you.</p>;
  const { rfq, supplier }: any = q.data;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
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
            <h1 className="text-[20px] font-bold tracking-tight">REQUEST FOR QUOTATION</h1>
            <p className="mt-1 text-[14px] font-semibold">{rfq.number}</p>
            <p className="text-slate-600">Issued {rfq.issue_date ? format(new Date(rfq.issue_date), "d MMMM yyyy") : format(new Date(), "d MMMM yyyy")}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">To</p>
            <p className="font-semibold">{supplier.name}</p>
            <p>{[supplier.address, supplier.district, supplier.country].filter(Boolean).join(", ")}</p>
            <p>{supplier.email} · {supplier.phone}</p>
            <p className="text-slate-600">Supplier code {supplier.code}{supplier.tin ? ` · TIN ${supplier.tin}` : ""}</p>
          </div>
          <div className="rounded border border-slate-300 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quotation deadline</p>
            <p className="text-[15px] font-bold">{format(new Date(rfq.closing_date), "EEEE d MMMM yyyy, HH:mm")}</p>
            <p className="mt-1 text-slate-600">Quote reference {rfq.number} in all correspondence.</p>
          </div>
        </section>

        <p className="mt-5">Dear Sir/Madam,</p>
        <p className="mt-1">We invite you to submit your best quotation for the goods/services listed below, subject to the terms that follow.</p>

        <h2 className="mt-5 text-[13px] font-semibold">Subject: {rfq.title}</h2>
        <table className="mt-2 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="border border-slate-300 px-2 py-1.5">#</th>
              <th className="border border-slate-300 px-2 py-1.5">Description / specification</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Quantity</th>
              <th className="border border-slate-300 px-2 py-1.5">Unit</th>
              <th className="w-28 border border-slate-300 px-2 py-1.5 text-right">Unit price</th>
              <th className="w-28 border border-slate-300 px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(rfq.items || []).map((it: any) => (
              <tr key={it.line}>
                <td className="border border-slate-300 px-2 py-1.5 align-top">{it.line}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.description}{it.specification && <span className="block text-slate-600">{it.specification}</span>}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right align-top">{it.quantity}</td>
                <td className="border border-slate-300 px-2 py-1.5 align-top">{it.unit}</td>
                <td className="border border-slate-300 px-2 py-1.5" />
                <td className="border border-slate-300 px-2 py-1.5" />
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            ["Currency", rfq.currency],
            ["Delivery location", rfq.delivery_location],
            ["Delivery terms", rfq.delivery_terms],
            ["Payment terms", rfq.payment_terms],
            ["Required documents", rfq.required_documents],
            ["Quotation validity", "At least 30 days from the deadline"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
              <p>{v || "—"}</p>
            </div>
          ))}
        </section>
        {rfq.notes && <p className="mt-4"><span className="font-semibold">Notes: </span>{rfq.notes}</p>}

        <p className="mt-5">Please state delivery time, warranty and any discounts. Quotations must be signed and stamped. Late quotations may not be considered. {settings?.company_name || "The company"} is not bound to accept the lowest or any quotation.</p>

        <footer className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <p className="border-t border-slate-400 pt-1">{rfq.expand?.buyer?.name}</p>
            <p className="text-slate-600">Procurement · {rfq.expand?.buyer?.email}</p>
          </div>
          <div>
            <p className="border-t border-slate-400 pt-1">Supplier signature and stamp</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
