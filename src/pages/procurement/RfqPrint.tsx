import { useQuery } from "react-query";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { Button, fmtDate, fmtDateTime, fmtNumber } from "@/components/ims";

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
  if (q.isLoading) return <p className="p-8 text-t-body text-ims-muted">Preparing the document…</p>;
  if (!q.data) return <p className="p-8 text-t-body text-ims-danger">This RFQ is not available to you.</p>;
  const { rfq, supplier }: any = q.data;
  const currency = rfq.currency || "RWF";

  return (
    <div className="min-h-screen bg-ims-page py-6 print:bg-ims-card print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
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
            <h1 className="text-t-section text-ims-text">Request for quotation</h1>
            <p className="mt-1 whitespace-nowrap font-mono text-t-body font-semibold">{rfq.number}</p>
            <p className="text-ims-body">Issued {fmtDate(rfq.issue_date || new Date())}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-t-small font-semibold text-ims-muted">To</p>
            <p className="font-semibold">{supplier.name}</p>
            <p>{[supplier.address, supplier.district, supplier.country].filter(Boolean).join(", ")}</p>
            <p>{[supplier.email, supplier.phone].filter(Boolean).join(" · ")}</p>
            <p className="text-ims-body">Supplier code {supplier.code}{supplier.tin ? ` · TIN ${supplier.tin}` : ""}</p>
          </div>
          <div className="rounded-control border border-ims-field p-3">
            <p className="text-t-small font-semibold text-ims-muted">Quotation deadline</p>
            <p className="text-t-body font-bold">{fmtDateTime(rfq.closing_date)}</p>
            <p className="mt-1 text-ims-body">Quote the reference <span className="whitespace-nowrap font-mono">{rfq.number}</span> in all correspondence.</p>
          </div>
        </section>

        <p className="mt-5">Dear Sir or Madam,</p>
        <p className="mt-1">We invite you to submit your best quotation for the goods or services listed below, subject to the terms that follow.</p>

        <h2 className="mt-5 text-t-body font-semibold">Subject: {rfq.title}</h2>
        <table className="mt-2 w-full border-collapse text-t-small">
          <thead>
            <tr className="bg-ims-thead text-left">
              <th className="border border-ims-field px-2 py-1.5">#</th>
              <th className="border border-ims-field px-2 py-1.5">Description and specification</th>
              <th className="border border-ims-field px-2 py-1.5 text-right">Quantity</th>
              <th className="border border-ims-field px-2 py-1.5">Unit</th>
              <th className="w-32 whitespace-nowrap border border-ims-field px-2 py-1.5 text-right">Unit price ({currency})</th>
              <th className="w-32 whitespace-nowrap border border-ims-field px-2 py-1.5 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {(rfq.items || []).map((it: any) => (
              <tr key={it.line}>
                <td className="border border-ims-field px-2 py-1.5 align-top">{it.line}</td>
                <td className="border border-ims-field px-2 py-1.5">{it.description}{it.specification && <span className="block text-ims-body">{it.specification}</span>}</td>
                <td className="border border-ims-field px-2 py-1.5 text-right align-top tabular-nums">{fmtNumber(it.quantity, true)}</td>
                <td className="border border-ims-field px-2 py-1.5 align-top">{it.unit}</td>
                <td className="border border-ims-field px-2 py-1.5" />
                <td className="border border-ims-field px-2 py-1.5" />
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
              <p className="text-t-small font-semibold text-ims-muted">{k}</p>
              <p>{v || "—"}</p>
            </div>
          ))}
        </section>
        {rfq.notes && <p className="mt-4"><span className="font-semibold">Notes: </span>{rfq.notes}</p>}

        <p className="mt-5">State the delivery time, the warranty and any discounts. Quotations must be signed and stamped. Late quotations may not be considered. {settings?.company_name || "The company"} is not bound to accept the lowest or any quotation.</p>

        <footer className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <p className="border-t border-ims-faint pt-1">{rfq.expand?.buyer?.name}</p>
            <p className="text-ims-body">Procurement · {rfq.expand?.buyer?.email}</p>
          </div>
          <div>
            <p className="border-t border-ims-faint pt-1">Supplier signature and stamp</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
