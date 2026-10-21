import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Award, Ban, FileSearch, Lock, Pencil, Plus, Printer, Send, ShoppingCart, Trophy } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { Badge, EmptyState, Initials, KeyValues, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/enterprise/ui";
import {
  COMPLIANCE,
  EVALUATION_CRITERIA,
  INVITE_STATUS,
  QUOTE_STATUS,
  RFQ_STATUS,
  errorMessage,
  money,
  procurementApi,
  purchasingApi,
  sourcingApi,
} from "@/lib/procurement";
import { Rating } from "./Suppliers";

const inputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50";
const TABS = ["overview", "quotations", "comparison", "activity"] as const;

export default function RfqDetail() {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as (typeof TABS)[number]) || "overview";
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_rfqs");
  const [editing, setEditing] = React.useState(false);
  const [quoteFor, setQuoteFor] = React.useState<{ supplier: any; quote?: any } | null>(null);
  const [confirm, setConfirm] = React.useState<"send" | "close" | "cancel" | null>(null);

  const q = useQuery(["rfq", rfqId], async () => {
    const [rfq, invites, quotes, pos] = await Promise.all([
      pocketbase.collection("rfqs").getOne(rfqId!, { expand: "requisition,department,buyer,requester,suppliers,awarded_quotation.supplier,awarded_by" }),
      pocketbase.collection("rfq_suppliers").getFullList({ filter: `rfq = "${rfqId}"`, expand: "supplier" }),
      pocketbase.collection("quotations").getFullList({ filter: `rfq = "${rfqId}"`, sort: "grand_total", expand: "supplier" }),
      pocketbase.collection("purchase_orders").getFullList({ filter: `rfq = "${rfqId}" && status != "cancelled"`, fields: "id,number,status" }).catch(() => []),
    ]);
    return { rfq, invites, quotes, pos };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["rfq", rfqId]);
    queryClient.invalidateQueries(["audit", "rfqs", rfqId]);
    queryClient.invalidateQueries(["record-table"]);
  };

  const r: any = q.data?.rfq;
  if (q.isLoading) {
    return (
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!r) {
    return <div className="px-4 py-4 sm:px-6"><Panel><EmptyState icon={FileSearch} title="RFQ not available" text="It may be outside what your role can see." /></Panel></div>;
  }

  const open = r.status === "sent";
  const closingPassed = r.closing_date && isPast(new Date(r.closing_date));
  const suppliers: any[] = r.expand?.suppliers || [];
  const invites = q.data!.invites;
  const quotes = q.data!.quotes;
  const winner = r.expand?.awarded_quotation;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "RFQs", link: "/dashboard/procurement/rfqs" }, { title: r.number, link: "#" }]}
        title={<span className="flex flex-wrap items-center gap-2">{r.number} <StatusBadge status={r.status} map={RFQ_STATUS} /></span>}
        description={r.title}
        actions={
          canManage && (
            <>
              {r.status === "draft" && (
                <>
                  <Button size="sm" onClick={() => setConfirm("send")}><Send size={14} /> Send to {suppliers.length} supplier(s)</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>
                </>
              )}
              {open && <Button size="sm" variant="outline" onClick={() => setConfirm("close")}><Lock size={14} /> Close quotations</Button>}
              {open && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Extend closing date</Button>}
              {["draft", "sent", "closed"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setConfirm("cancel")}><Ban size={14} /> Cancel RFQ</Button>}
            </>
          )
        }
      />

      {winner && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Trophy size={15} /> Awarded to {winner.expand?.supplier?.name} — {money(winner.grand_total, winner.currency)}
            {r.award_not_lowest && <Badge tone="warning">Not the lowest price</Badge>}
          </p>
          <p className="mt-1">Reason: “{r.award_reason}”</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-emerald-800">By {r.expand?.awarded_by?.name} on {format(new Date(r.awarded_at), "d MMM yyyy, HH:mm")}.</p>
            {q.data!.pos.length ? (
              <Link className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-900 underline" to={`/dashboard/procurement/purchase-orders/${q.data!.pos[0].id}`}><ShoppingCart size={14} /> {q.data!.pos[0].number}</Link>
            ) : (
              canPerform("manage_purchase_orders") && <CreatePoButton rfqId={r.id} />
            )}
          </div>
        </div>
      )}
      {open && closingPassed && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <AlertTriangle size={15} /> The closing date has passed. Close the RFQ to start evaluation; quotations recorded now are marked late.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Requisition", <Link key="l" className="text-primaryDark hover:underline" to={`/dashboard/procurement/requisitions/${r.requisition}`}>{r.expand?.requisition?.number}</Link>],
          ["Closing date", r.closing_date ? format(new Date(r.closing_date), "d MMM yyyy") : "—"],
          ["Quotations", `${quotes.length} of ${suppliers.length}`],
          ["Lowest offer", quotes.length ? money(Math.min(...quotes.map((x: any) => x.grand_total)), r.currency) : "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
            <div className="mt-1 truncate text-[15px] font-semibold tabular-nums text-slate-900">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParams(t === "overview" ? {} : { tab: t })}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium capitalize", tab === t ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t === "comparison" ? "Compare & award" : t === "activity" ? "Activity & audit" : t}
            {t === "quotations" && <span className="ml-1.5 text-slate-400">{quotes.length}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Panel title="Items requested" subtitle="Suppliers see descriptions and quantities, never internal estimates" bodyClassName="px-0">
              <table className="dnr-grid w-full text-[13px]">
                <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-4 py-2">#</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Quantity</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(r.items || []).map((it: any) => (
                    <tr key={it.line}><td className="px-4 py-2.5 text-slate-500">{it.line}</td><td className="px-4 py-2.5"><p>{it.description}</p>{it.specification && <p className="text-[12px] text-slate-500">{it.specification}</p>}</td><td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{it.quantity} {it.unit}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Invited suppliers" subtitle={r.status === "draft" ? "Edit the RFQ to change who is invited" : "Track each supplier's response"} bodyClassName="px-0">
              {!suppliers.length ? (
                <EmptyState icon={FileSearch} text="No suppliers invited yet." action={canManage && r.status === "draft" && <Button size="sm" onClick={() => setEditing(true)}><Plus size={14} /> Invite suppliers</Button>} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[640px] text-[13px]">
                    <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-4 py-2">Supplier</th><th className="px-4 py-2">Rating</th><th className="px-4 py-2">Response</th><th className="px-4 py-2">Quotation</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {suppliers.map((s) => {
                        const inv = invites.find((i: any) => i.supplier === s.id);
                        const quote = quotes.find((x: any) => x.supplier === s.id);
                        return (
                          <tr key={s.id}>
                            <td className="px-4 py-2.5"><Link className="font-medium text-slate-800 hover:underline" to={`/dashboard/procurement/suppliers/${s.id}`}>{s.name}</Link><p className="text-[12px] text-slate-500">{s.code} · {s.email}</p></td>
                            <td className="px-4 py-2.5"><Rating value={s.rating} count={s.evaluations_count} /></td>
                            <td className="px-4 py-2.5">{inv ? <StatusBadge status={inv.status} map={INVITE_STATUS} /> : <Badge>Not sent</Badge>}</td>
                            <td className="px-4 py-2.5 tabular-nums">{quote ? money(quote.grand_total, quote.currency) : "—"}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-end gap-1">
                                <a href={`/print/rfq/${r.id}/${s.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-slate-600 hover:bg-slate-100" title="Supplier-specific RFQ document"><Printer size={14} /> Print</a>
                                {canManage && ["sent", "closed"].includes(r.status) && (
                                  <Button size="sm" variant={quote ? "ghost" : "outline"} onClick={() => setQuoteFor({ supplier: s, quote })}>{quote ? "Edit quote" : "Record quote"}</Button>
                                )}
                                {canManage && inv && open && ["sent"].includes(inv.status) && <InviteStatusButton invite={inv} onDone={refresh} />}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
          <Panel title="Terms">
            <KeyValues
              columns={1}
              items={[
                { label: "Buyer", value: r.expand?.buyer?.name },
                { label: "Department", value: r.expand?.department?.name },
                { label: "Issued", value: r.issue_date ? format(new Date(r.issue_date), "d MMM yyyy") : "Not sent yet" },
                { label: "Currency", value: r.currency },
                { label: "Delivery location", value: r.delivery_location },
                { label: "Delivery terms", value: r.delivery_terms },
                { label: "Payment terms", value: r.payment_terms },
                { label: "Required documents", value: r.required_documents },
                { label: "Notes", value: r.notes },
                { label: "Cancellation reason", value: r.cancel_reason },
              ].filter((i) => i.value !== "" || i.label !== "Cancellation reason")}
            />
          </Panel>
        </div>
      )}

      {tab === "quotations" && (
        <Panel title="Quotations received" bodyClassName="px-0">
          {!quotes.length ? (
            <EmptyState icon={FileSearch} text={r.status === "draft" ? "Send the RFQ first." : "No quotations recorded yet."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="dnr-grid w-full min-w-[760px] text-[13px]">
                <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-4 py-2">Quotation</th><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Grand total</th><th className="px-4 py-2">Delivery</th><th className="px-4 py-2">Compliance</th><th className="px-4 py-2 text-right">Score</th><th className="px-4 py-2">Status</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {quotes.map((x: any) => (
                    <tr key={x.id}>
                      <td className="px-4 py-2.5"><p className="font-medium">{x.number}</p><p className="text-[12px] text-slate-500">Ref {x.supplier_reference || "—"}{x.received_late && <Badge tone="warning" className="ml-1.5">Late</Badge>}</p></td>
                      <td className="px-4 py-2.5">{x.expand?.supplier?.name}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(x.grand_total, x.currency)}</td>
                      <td className="px-4 py-2.5">{x.delivery_days ? `${x.delivery_days} days` : "—"}</td>
                      <td className="px-4 py-2.5">{x.technical_compliance ? <StatusBadge status={x.technical_compliance} map={COMPLIANCE} /> : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{x.total_score ? `${x.total_score}/100` : "—"}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={x.status} map={QUOTE_STATUS} /></td>
                      <td className="px-4 py-2.5 text-right">
                        {x.attachments?.map((f: string) => <a key={f} className="mr-2 text-[12px] text-primaryDark hover:underline" href={pocketbase.files.getUrl(x, f)} target="_blank" rel="noreferrer">file</a>)}
                        {canManage && ["sent", "closed"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setQuoteFor({ supplier: x.expand?.supplier, quote: x })}>Edit</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "comparison" && <Comparison rfq={r} quotes={quotes} onChanged={refresh} canScore={canManage} canAward={canPerform("award_rfqs")} />}
      {tab === "activity" && <RfqActivity rfqId={r.id} />}

      {editing && <RfqEditDialog rfq={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {quoteFor && <QuotationDialog rfq={r} supplier={quoteFor.supplier} quote={quoteFor.quote} onClose={() => setQuoteFor(null)} onSaved={() => { setQuoteFor(null); refresh(); }} />}
      <ConfirmAction kind={confirm} rfq={r} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); refresh(); if (confirm === "cancel") navigate("/dashboard/procurement/rfqs"); }} />
    </div>
  );
}

function InviteStatusButton({ invite, onDone }: { invite: any; onDone: () => void }) {
  const set = useMutation((status: string) => pocketbase.collection("rfq_suppliers").update(invite.id, { status }), {
    onSuccess: () => { toast.success("Response updated"); onDone(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  return (
    <select aria-label="Mark supplier response" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px]" value="" onChange={(e) => e.target.value && set.mutate(e.target.value)}>
      <option value="">Mark as…</option>
      <option value="viewed">Viewed</option>
      <option value="declined">Declined</option>
    </select>
  );
}

function ConfirmAction({ kind, rfq, onClose, onDone }: { kind: "send" | "close" | "cancel" | null; rfq: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [kind]);
  const run = useMutation(() => sourcingApi.rfqAction(rfq.id, kind!, kind === "cancel" ? { reason } : {}), {
    onSuccess: () => { toast.success(kind === "send" ? `${rfq.number} sent` : kind === "close" ? `${rfq.number} closed for evaluation` : `${rfq.number} cancelled`); onDone(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const copy = {
    send: { title: `Send ${rfq.number}?`, text: `Supplier-specific RFQs will be issued to ${rfq.suppliers?.length || 0} supplier(s). Items and suppliers are locked afterwards; you can still extend the closing date.${(rfq.suppliers?.length || 0) < 3 ? " Note: fewer than 3 suppliers are invited — check your procurement policy." : ""}` },
    close: { title: `Close ${rfq.number}?`, text: "No further on-time quotations are expected. You can then compare offers and award." },
    cancel: { title: `Cancel ${rfq.number}?`, text: "The requisition returns to “Approved” so it can be sourced again." },
  } as const;
  const c = kind ? copy[kind] : null;
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>{c?.title}</DialogTitle><DialogDescription>{c?.text}</DialogDescription></DialogHeader>
        {kind === "cancel" && (
          <label className="block text-[12.5px] font-medium text-slate-700">Reason <span className="text-red-600">*</span>
            <textarea className={cn(inputCls, "mt-1 h-20 py-2")} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant={kind === "cancel" ? "danger" : "default"} disabled={run.isLoading || (kind === "cancel" && !reason.trim())} onClick={() => run.mutate()}>{run.isLoading ? "Working…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RfqEditDialog({ rfq, onClose, onSaved }: { rfq: any; onClose: () => void; onSaved: () => void }) {
  const draft = rfq.status === "draft";
  const [v, setV] = React.useState({
    title: rfq.title, closing_date: rfq.closing_date?.slice(0, 10) || "", delivery_location: rfq.delivery_location || "",
    payment_terms: rfq.payment_terms || "", delivery_terms: rfq.delivery_terms || "", required_documents: rfq.required_documents || "",
    notes: rfq.notes || "", suppliers: (rfq.suppliers || []) as string[], evaluation_weights: rfq.evaluation_weights || {},
  });
  const [search, setSearch] = React.useState("");
  const sup = useQuery(["active-suppliers"], () => pocketbase.collection("suppliers").getFullList({ filter: `status = "active"`, sort: "-rating,name", expand: "categories" }), { enabled: draft });
  const reqCategory = rfq.expand?.requisition?.category;
  const weightTotal = EVALUATION_CRITERIA.reduce((a, c) => a + (Number(v.evaluation_weights[c.key]) || 0), 0);
  const save = useMutation(
    () => pocketbase.collection("rfqs").update(rfq.id, { ...v, closing_date: v.closing_date ? `${v.closing_date} 17:00:00.000Z` : "" }),
    { onSuccess: () => { toast.success("RFQ updated"); onSaved(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const list = (sup.data || []).filter((s: any) => `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white">
        <DialogHeader><DialogTitle>{draft ? `Edit ${rfq.number}` : `Extend closing date · ${rfq.number}`}</DialogTitle><DialogDescription>{draft ? "Everything can change until the RFQ is sent." : "Suppliers already have this RFQ; only the closing date and notes can change."}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {draft && <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Title<input className={cn(inputCls, "mt-1")} value={v.title} onChange={set("title")} /></label>}
          <label className="block text-[12.5px] font-medium text-slate-700">Closing date<input type="date" className={cn(inputCls, "mt-1")} value={v.closing_date} onChange={set("closing_date")} /></label>
          {draft && <label className="block text-[12.5px] font-medium text-slate-700">Delivery location<input className={cn(inputCls, "mt-1")} value={v.delivery_location} onChange={set("delivery_location")} /></label>}
          {draft && <label className="block text-[12.5px] font-medium text-slate-700">Payment terms<input className={cn(inputCls, "mt-1")} value={v.payment_terms} onChange={set("payment_terms")} /></label>}
          {draft && <label className="block text-[12.5px] font-medium text-slate-700">Delivery terms<input className={cn(inputCls, "mt-1")} value={v.delivery_terms} onChange={set("delivery_terms")} /></label>}
          {draft && <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Required documents<input className={cn(inputCls, "mt-1")} value={v.required_documents} onChange={set("required_documents")} /></label>}
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Notes<textarea className={cn(inputCls, "mt-1 h-16 py-2")} value={v.notes} onChange={set("notes")} /></label>
        </div>
        {draft && (
          <>
            <div>
              <p className="mb-1 text-[13px] font-semibold text-slate-900">Invite suppliers ({v.suppliers.length})</p>
              <input className={cn(inputCls, "mb-2")} placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                {list.map((s: any) => {
                  const on = v.suppliers.includes(s.id);
                  const match = s.categories?.includes(reqCategory);
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-slate-50">
                        <input type="checkbox" checked={on} onChange={() => setV((x) => ({ ...x, suppliers: on ? x.suppliers.filter((id) => id !== s.id) : [...x.suppliers, s.id] }))} />
                        <span className="min-w-0 flex-1"><span className="font-medium">{s.name}</span> {match && <Badge tone="info" className="ml-1">Serves this category</Badge>}<span className="block truncate text-[12px] text-slate-500">{(s.expand?.categories || []).map((c: any) => c.name).join(", ")}</span></span>
                        <Rating value={s.rating} count={s.evaluations_count} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[13px] font-semibold text-slate-900">Evaluation weights <span className={cn("font-normal", weightTotal === 100 ? "text-slate-500" : "text-red-600")}>({weightTotal}% of 100%)</span></p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {EVALUATION_CRITERIA.map((c) => (
                  <label key={c.key} className="block text-[12px] text-slate-600">{c.label}
                    <input type="number" min={0} max={100} className={cn(inputCls, "mt-0.5")} value={v.evaluation_weights[c.key] ?? 0} onChange={(e) => setV((x) => ({ ...x, evaluation_weights: { ...x.evaluation_weights, [c.key]: Number(e.target.value) } }))} />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isLoading || (draft && weightTotal !== 100)} onClick={() => save.mutate()}>{save.isLoading ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuotationDialog({ rfq, supplier, quote, onClose, onSaved }: { rfq: any; supplier: any; quote?: any; onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = React.useState<any[]>(() =>
    (rfq.items || []).map((it: any) => {
      const q = quote?.items?.find((x: any) => x.line === it.line);
      return { line: it.line, description: it.description, quantity: it.quantity, unit: it.unit, unit_price: q?.unit_price ?? "", discount_pct: q?.discount_pct ?? 0, tax_rate: q?.tax_rate ?? 18, brand: q?.brand || "" };
    })
  );
  const [v, setV] = React.useState({
    supplier_reference: quote?.supplier_reference || "", quotation_date: quote?.quotation_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    validity_date: quote?.validity_date?.slice(0, 10) || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    delivery_cost: quote?.delivery_cost ?? 0, other_charges: quote?.other_charges ?? 0, delivery_days: quote?.delivery_days ?? "",
    payment_terms: quote?.payment_terms || supplier?.payment_terms || "", warranty: quote?.warranty || "", technical_compliance: quote?.technical_compliance || "compliant", notes: quote?.notes || "",
  });
  const [files, setFiles] = React.useState<File[]>([]);
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const setLine = (i: number, k: string, val: string) => setLines((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: val } : x)));

  let subtotal = 0, discount = 0, tax = 0;
  for (const l of lines) {
    if (l.unit_price === "" || l.unit_price === null) continue;
    const gross = l.quantity * Number(l.unit_price);
    const d = (gross * (Number(l.discount_pct) || 0)) / 100;
    subtotal += gross; discount += d; tax += ((gross - d) * (Number(l.tax_rate) || 0)) / 100;
  }
  const grand = subtotal - discount + tax + (Number(v.delivery_cost) || 0) + (Number(v.other_charges) || 0);

  const save = useMutation(
    () => {
      const body = new FormData();
      if (!quote) { body.append("rfq", rfq.id); body.append("supplier", supplier.id); }
      body.append("items", JSON.stringify(lines.map((l) => ({ line: l.line, unit_price: l.unit_price === "" ? null : Number(l.unit_price), discount_pct: Number(l.discount_pct) || 0, tax_rate: Number(l.tax_rate) || 0, brand: l.brand }))));
      Object.entries(v).forEach(([k, val]) => body.append(k, ["quotation_date", "validity_date"].includes(k) && val ? `${val} 00:00:00.000Z` : String(val ?? "")));
      files.forEach((f) => body.append("attachments", f));
      return quote ? pocketbase.collection("quotations").update(quote.id, body) : pocketbase.collection("quotations").create(body);
    },
    { onSuccess: (x: any) => { toast.success(`${x.number} saved — ${money(x.grand_total, x.currency)}`); onSaved(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>{quote ? `Edit ${quote.number}` : "Record quotation"} · {supplier?.name}</DialogTitle>
          <DialogDescription>Enter prices exactly as quoted. Leave a unit price empty if the supplier did not quote that line. Totals are recalculated by the server.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-[12.5px] font-medium text-slate-700">Supplier's reference<input className={cn(inputCls, "mt-1")} value={v.supplier_reference} onChange={set("supplier_reference")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Quotation date<input type="date" className={cn(inputCls, "mt-1")} value={v.quotation_date} onChange={set("quotation_date")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Valid until<input type="date" className={cn(inputCls, "mt-1")} value={v.validity_date} onChange={set("validity_date")} /></label>
        </div>
        <div className="-mx-6 overflow-x-auto">
          <table className="dnr-grid w-full min-w-[720px] text-[13px]">
            <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-6 py-2">Item</th><th className="px-2 py-2 text-right">Qty</th><th className="w-32 px-2 py-2">Unit price</th><th className="w-20 px-2 py-2">Disc. %</th><th className="w-20 px-2 py-2">Tax %</th><th className="w-36 px-2 py-2">Brand / model</th><th className="px-6 py-2 text-right">Line total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                const gross = l.unit_price === "" ? null : l.quantity * Number(l.unit_price);
                const net = gross === null ? null : gross - (gross * (Number(l.discount_pct) || 0)) / 100;
                return (
                  <tr key={l.line}>
                    <td className="px-6 py-2">{l.description}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{l.quantity} {l.unit}</td>
                    <td className="px-2 py-2"><input type="number" min={0} step="any" className={inputCls} value={l.unit_price} onChange={(e) => setLine(i, "unit_price", e.target.value)} placeholder="Not quoted" aria-label={`Line ${l.line} unit price`} /></td>
                    <td className="px-2 py-2"><input type="number" min={0} max={100} className={inputCls} value={l.discount_pct} onChange={(e) => setLine(i, "discount_pct", e.target.value)} aria-label={`Line ${l.line} discount`} /></td>
                    <td className="px-2 py-2"><input type="number" min={0} max={100} className={inputCls} value={l.tax_rate} onChange={(e) => setLine(i, "tax_rate", e.target.value)} aria-label={`Line ${l.line} tax`} /></td>
                    <td className="px-2 py-2"><input className={inputCls} value={l.brand} onChange={(e) => setLine(i, "brand", e.target.value)} aria-label={`Line ${l.line} brand`} /></td>
                    <td className="px-6 py-2 text-right tabular-nums">{net === null ? <span className="text-slate-400">—</span> : Math.round(net + (net * (Number(l.tax_rate) || 0)) / 100).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block text-[12.5px] font-medium text-slate-700">Delivery cost<input type="number" min={0} className={cn(inputCls, "mt-1")} value={v.delivery_cost} onChange={set("delivery_cost")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Other charges<input type="number" min={0} className={cn(inputCls, "mt-1")} value={v.other_charges} onChange={set("other_charges")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Delivery time (days)<input type="number" min={0} className={cn(inputCls, "mt-1")} value={v.delivery_days} onChange={set("delivery_days")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Technical compliance
            <select className={cn(inputCls, "mt-1")} value={v.technical_compliance} onChange={set("technical_compliance")}>
              {Object.entries(COMPLIANCE).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Payment terms<input className={cn(inputCls, "mt-1")} value={v.payment_terms} onChange={set("payment_terms")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Warranty<input className={cn(inputCls, "mt-1")} value={v.warranty} onChange={set("warranty")} placeholder="e.g. 12 months" /></label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-3">Notes<input className={cn(inputCls, "mt-1")} value={v.notes} onChange={set("notes")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Attach quotation<input type="file" multiple className="mt-1 block w-full text-[12px]" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label>
        </div>
        <dl className="ml-auto w-full max-w-xs space-y-1 text-[13px]">
          <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
          <div className="flex justify-between text-slate-600"><dt>Discount</dt><dd className="tabular-nums">− {money(discount)}</dd></div>
          <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd className="tabular-nums">{money(tax)}</dd></div>
          <div className="flex justify-between text-slate-600"><dt>Delivery + other</dt><dd className="tabular-nums">{money((Number(v.delivery_cost) || 0) + (Number(v.other_charges) || 0))}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Grand total</dt><dd className="tabular-nums">{money(grand)}</dd></div>
        </dl>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isLoading} onClick={() => save.mutate()}>{save.isLoading ? "Saving…" : "Save quotation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Comparison({ rfq, quotes, onChanged, canScore, canAward }: { rfq: any; quotes: any[]; onChanged: () => void; canScore: boolean; canAward: boolean }) {
  const locked = ["awarded", "cancelled"].includes(rfq.status);
  const weights = rfq.evaluation_weights || {};
  const [scores, setScores] = React.useState<Record<string, Record<string, number>>>(() => Object.fromEntries(quotes.map((q) => [q.id, q.scores || {}])));
  const [choice, setChoice] = React.useState<string>(rfq.awarded_quotation || "");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setScores(Object.fromEntries(quotes.map((q) => [q.id, q.scores || {}]))), [quotes]);

  const saveScores = useMutation(() => Promise.all(quotes.map((q) => pocketbase.collection("quotations").update(q.id, { scores: scores[q.id] || {} }))), {
    onSuccess: () => { toast.success("Evaluation scores saved"); onChanged(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const award = useMutation(() => sourcingApi.rfqAction(rfq.id, "award", { quotation: choice, reason }), {
    onSuccess: () => { toast.success(`${rfq.number} awarded`); onChanged(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });

  if (!quotes.length) return <Panel><EmptyState icon={FileSearch} text="Record at least one quotation to compare offers." /></Panel>;

  const lowestTotal = Math.min(...quotes.map((q) => q.grand_total));
  const fastest = Math.min(...quotes.filter((q) => q.delivery_days > 0).map((q) => q.delivery_days));
  const weighted = (qid: string) => EVALUATION_CRITERIA.reduce((a, c) => a + ((weights[c.key] || 0) * Math.min(Math.max(Number(scores[qid]?.[c.key]) || 0, 0), 10)) / 10, 0);
  const best = quotes.reduce((b, q) => (weighted(q.id) > weighted(b.id) ? q : b), quotes[0]);
  const chosen = quotes.find((q) => q.id === choice);
  const aboveLowest = chosen ? chosen.grand_total - lowestTotal : 0;
  const cell = "px-3 py-2 text-right tabular-nums";

  const suggestPriceScores = () =>
    setScores((s) => Object.fromEntries(quotes.map((q) => [q.id, { ...(s[q.id] || {}), price: Math.round((lowestTotal / q.grand_total) * 100) / 10 }])));

  return (
    <div className="space-y-4">
      <Panel title="Side-by-side comparison" subtitle="Lowest price and fastest delivery are highlighted — the system never selects a supplier automatically" bodyClassName="px-0">
        <div className="overflow-x-auto">
          <table className="dnr-grid w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 text-left">Item</th>
                {quotes.map((q) => <th key={q.id} className="px-3 py-2 text-right normal-case tracking-normal"><span className="text-[12.5px] font-semibold text-slate-800">{q.expand?.supplier?.name}</span><span className="block font-normal text-slate-500">{q.number}</span></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rfq.items || []).map((it: any) => {
                const prices = quotes.map((q) => q.items?.find((x: any) => x.line === it.line)).map((x) => (x?.quoted ? x.total : null));
                const min = Math.min(...(prices.filter((p) => p !== null) as number[]));
                return (
                  <tr key={it.line}>
                    <td className="px-4 py-2"><p>{it.description}</p><p className="text-[12px] text-slate-500">{it.quantity} {it.unit}</p></td>
                    {prices.map((p, i) => <td key={i} className={cn(cell, p === min && quotes.length > 1 && "font-semibold text-emerald-700")}>{p === null ? <span className="text-slate-400">not quoted</span> : Math.round(p).toLocaleString()}</td>)}
                  </tr>
                );
              })}
              {[
                ["Discount", (q: any) => q.discount_total ? `− ${Math.round(q.discount_total).toLocaleString()}` : "—"],
                ["Delivery + other charges", (q: any) => Math.round(q.delivery_cost + q.other_charges).toLocaleString()],
              ].map(([label, f]: any) => (
                <tr key={label} className="text-slate-600"><td className="px-4 py-2">{label}</td>{quotes.map((q) => <td key={q.id} className={cell}>{f(q)}</td>)}</tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5">Grand total ({rfq.currency})</td>
                {quotes.map((q) => <td key={q.id} className={cn(cell, q.grand_total === lowestTotal && "text-emerald-700")}>{Math.round(q.grand_total).toLocaleString()}{q.grand_total === lowestTotal && quotes.length > 1 && <Badge tone="success" className="ml-1.5">Lowest</Badge>}</td>)}
              </tr>
              {[
                ["Delivery time", (q: any) => q.delivery_days ? <span className={cn(q.delivery_days === fastest && "font-semibold text-emerald-700")}>{q.delivery_days} days</span> : "—"],
                ["Warranty", (q: any) => q.warranty || "—"],
                ["Payment terms", (q: any) => q.payment_terms || "—"],
                ["Valid until", (q: any) => q.validity_date ? format(new Date(q.validity_date), "d MMM yyyy") : "—"],
                ["Technical compliance", (q: any) => q.technical_compliance ? <StatusBadge status={q.technical_compliance} map={COMPLIANCE} /> : "—"],
                ["Supplier rating", (q: any) => <Rating value={q.expand?.supplier?.rating} count={q.expand?.supplier?.evaluations_count} />],
                ["Received", (q: any) => q.received_late ? <Badge tone="warning">Late</Badge> : "On time"],
              ].map(([label, f]: any) => (
                <tr key={label}><td className="px-4 py-2 text-slate-600">{label}</td>{quotes.map((q) => <td key={q.id} className={cell}>{f(q)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Weighted evaluation"
        subtitle={`Score each criterion 0–10. Weights: ${EVALUATION_CRITERIA.map((c) => `${c.label} ${weights[c.key] || 0}%`).join(" · ")}`}
        action={canScore && !locked && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={suggestPriceScores}>Suggest price scores</Button>
            <Button size="sm" onClick={() => saveScores.mutate()} disabled={saveScores.isLoading}>Save scores</Button>
          </div>
        )}
        bodyClassName="px-0"
      >
        <div className="overflow-x-auto">
          <table className="dnr-grid w-full min-w-[640px] text-[13px]">
            <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Criterion</th>{quotes.map((q) => <th key={q.id} className="px-3 py-2 text-right normal-case tracking-normal text-slate-700">{q.expand?.supplier?.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {EVALUATION_CRITERIA.map((c) => (
                <tr key={c.key}>
                  <td className="px-4 py-2 text-slate-600">{c.label} <span className="text-slate-400">({weights[c.key] || 0}%)</span></td>
                  {quotes.map((q) => (
                    <td key={q.id} className="px-3 py-1.5 text-right">
                      <input type="number" min={0} max={10} step={0.5} disabled={!canScore || locked} aria-label={`${c.label} score for ${q.expand?.supplier?.name}`}
                        className="h-8 w-20 rounded-md border border-slate-200 px-2 text-right text-[13px] tabular-nums disabled:bg-slate-50"
                        value={scores[q.id]?.[c.key] ?? ""} onChange={(e) => setScores((s) => ({ ...s, [q.id]: { ...(s[q.id] || {}), [c.key]: Number(e.target.value) } }))} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5">Weighted score (of 100)</td>
                {quotes.map((q) => <td key={q.id} className={cn("px-3 py-2.5 text-right tabular-nums", q.id === best.id && weighted(best.id) > 0 && "text-emerald-700")}>{weighted(q.id).toFixed(1)}{q.id === best.id && weighted(best.id) > 0 && <Badge tone="success" className="ml-1.5">Highest</Badge>}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {!locked && (
        <Panel title={<span className="flex items-center gap-2"><Award size={15} /> Select supplier</span>} subtitle={canAward ? "Your decision and reason are recorded permanently in the audit trail" : "Only roles with “Select the winning supplier” can award"}>
          {!canAward ? (
            <p className="text-[13px] text-slate-500">Scores are advisory. A procurement manager or director makes the award.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {quotes.map((q) => (
                  <label key={q.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-3 text-[13px]", choice === q.id ? "border-primary bg-primary/5" : "border-slate-200 hover:bg-slate-50", q.technical_compliance === "non_compliant" && "cursor-not-allowed opacity-50")}>
                    <input type="radio" name="award" disabled={q.technical_compliance === "non_compliant"} checked={choice === q.id} onChange={() => setChoice(q.id)} className="mt-0.5" />
                    <span><span className="font-medium">{q.expand?.supplier?.name}</span><span className="block tabular-nums text-slate-600">{money(q.grand_total, q.currency)} · score {weighted(q.id).toFixed(1)}</span></span>
                  </label>
                ))}
              </div>
              {chosen && aboveLowest > 0 && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> This offer is {money(aboveLowest, rfq.currency)} above the lowest quotation. Explain why it offers better value — the award will be flagged “not lowest price”.</p>
              )}
              <label className="block text-[12.5px] font-medium text-slate-700">Reason for selection <span className="text-red-600">*</span>
                <textarea className={cn(inputCls, "mt-1 h-20 py-2")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Selected Supplier B because delivery time and technical compliance were superior." />
                <span className="mt-1 block text-[11.5px] text-slate-500">{reason.trim().length}/15 characters minimum</span>
              </label>
              <Button disabled={!choice || reason.trim().length < 15 || award.isLoading} onClick={() => award.mutate()}><Trophy size={14} /> {award.isLoading ? "Awarding…" : "Award RFQ"}</Button>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function RfqActivity({ rfqId }: { rfqId: string }) {
  const q = useQuery(["audit", "rfqs", rfqId], () => procurementApi.audit({ collection: "rfqs", record: rfqId, perPage: 100 }));
  return (
    <Panel title="Activity and audit trail">
      {q.isLoading ? <ListSkeleton rows={4} /> : !q.data?.items.length ? <p className="text-[13px] text-slate-500">No activity yet.</p> : (
        <ol className="space-y-3">
          {q.data.items.map((e) => (
            <li key={e.id} className="flex gap-3 text-[13px]">
              <Initials name={e.actor_name} />
              <div className="min-w-0 flex-1">
                <p><span className="font-medium">{e.actor_name || "System"}</span> {e.action.replace(/_/g, " ")} {e.record_label !== "" && e.action.startsWith("quotation") && <span className="text-slate-500">{e.record_label}</span>}</p>
                <p className="text-[12px] text-slate-500">{formatDistanceToNow(new Date(e.created), { addSuffix: true })}</p>
                {e.comment && <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-slate-700">“{e.comment}”</p>}
                {e.action === "awarded" && e.changes?.not_lowest_price?.new === true && <Badge tone="warning" className="mt-1">Not the lowest price</Badge>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function CreatePoButton({ rfqId }: { rfqId: string }) {
  const navigate = useNavigate();
  const create = useMutation(() => purchasingApi.fromRfq(rfqId), {
    onSuccess: (po) => {
      toast.success(`${po.number} created as a draft — review and submit it for approval`);
      navigate(`/dashboard/procurement/purchase-orders/${po.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return <Button size="sm" onClick={() => create.mutate()} disabled={create.isLoading}><ShoppingCart size={14} /> {create.isLoading ? "Creating…" : "Create purchase order"}</Button>;
}
