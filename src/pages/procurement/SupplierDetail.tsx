import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Building2, FileText, Landmark, Mail, Pencil, Phone, Plus, Star, Trash2, Upload, User } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { Badge, EmptyState, Initials, KeyValues, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/enterprise/ui";
import {
  INVITE_STATUS,
  QUOTE_STATUS,
  SUPPLIER_DOC_TYPES,
  SUPPLIER_STATUS,
  SUPPLIER_TYPES,
  errorMessage,
  expiryState,
  money,
  phase5Api,
  procurementApi,
} from "@/lib/procurement";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import SupplierFormDialog from "./SupplierFormDialog";
import { Rating } from "./Suppliers";

const inputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const TABS = ["overview", "contacts", "documents", "sourcing", "performance", "activity"] as const;

export default function SupplierDetail() {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as (typeof TABS)[number]) || "overview";
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_suppliers");
  const [editing, setEditing] = React.useState(false);

  const q = useQuery(["supplier", supplierId], async () => {
    const [supplier, contacts, documents, evaluations, invitations, quotations] = await Promise.all([
      pocketbase.collection("suppliers").getOne(supplierId!, { expand: "categories" }),
      pocketbase.collection("supplier_contacts").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-is_primary,name" }),
      pocketbase.collection("supplier_documents").getFullList({ filter: `supplier = "${supplierId}"`, sort: "expiry_date", expand: "uploaded_by" }),
      pocketbase.collection("supplier_evaluations").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "evaluator" }),
      pocketbase.collection("rfq_suppliers").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "rfq" }).catch(() => []),
      pocketbase.collection("quotations").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "rfq" }).catch(() => []),
    ]);
    return { supplier, contacts, documents, evaluations, invitations, quotations };
  });
  const s: any = q.data?.supplier;

  if (q.isLoading) {
    return (
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!s) {
    return (
      <div className="px-4 py-4 sm:px-6">
        <Panel><EmptyState icon={Building2} title="Supplier not found" text="It may have been removed." /></Panel>
      </div>
    );
  }

  const docIssues = (q.data?.documents || []).filter((d: any) => (expiryState(d.expiry_date).daysLeft ?? 999) <= 30);
  const awarded = (q.data?.quotations || []).filter((x: any) => x.status === "accepted");
  const winRate = q.data?.quotations.length ? Math.round((awarded.length / q.data.quotations.length) * 100) : null;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        breadcrumbs={[
          { title: "Procurement", link: "/dashboard/procurement" },
          { title: "Suppliers", link: "/dashboard/procurement/suppliers" },
          { title: s.code, link: "#" },
        ]}
        title={<span className="flex flex-wrap items-center gap-2">{s.name} <StatusBadge status={s.status} map={SUPPLIER_STATUS} /></span>}
        description={`${s.code} · ${SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label || "Supplier"} · ${(s.expand?.categories || []).map((c: any) => c.name).join(", ") || "No categories"}`}
        actions={canManage && s.status !== "under_review" && <Button variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
      />

      {["draft", "under_review", "rejected"].includes(s.status) && <Onboarding supplier={s} onChange={() => q.refetch()} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Performance", <Rating key="r" value={s.rating} count={s.evaluations_count} />],
          ["RFQs received", q.data?.invitations.length ?? 0],
          ["Quotations / won", `${q.data?.quotations.length ?? 0} / ${awarded.length}${winRate !== null ? ` (${winRate}%)` : ""}`],
          ["Awarded value", money(awarded.reduce((a: number, x: any) => a + x.grand_total, 0))],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
            <div className="mt-1 text-[15px] font-semibold tabular-nums text-slate-900">{v}</div>
          </div>
        ))}
      </div>

      {docIssues.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {docIssues.map((d: any) => `${SUPPLIER_DOC_TYPES[d.document_type]}: ${expiryState(d.expiry_date).label.toLowerCase()}`).join(" · ")}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === "overview" ? {} : { tab: t })}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium capitalize", tab === t ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}
          >
            {t === "sourcing" ? "RFQs & quotations" : t === "activity" ? "Activity & audit" : t}
            {t === "documents" && docIssues.length > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-800">{docIssues.length}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Company">
            <KeyValues
              items={[
                { label: "Registration number", value: s.registration_number },
                { label: "TIN", value: s.tin },
                { label: "VAT number", value: s.vat_number },
                { label: "Payment terms", value: s.payment_terms },
                { label: "Currency", value: s.currency },
                { label: "Address", value: [s.address, s.district, s.province, s.country].filter(Boolean).join(", ") },
                { label: "Email", value: s.email && <a className="text-primaryDark hover:underline" href={`mailto:${s.email}`}>{s.email}</a> },
                { label: "Phone", value: s.phone },
                { label: "Website", value: s.website && <a className="text-primaryDark hover:underline" href={s.website} target="_blank" rel="noreferrer">{s.website}</a> },
              ]}
            />
            {s.notes && <p className="mt-4 whitespace-pre-line rounded-md bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{s.notes}</p>}
          </Panel>
          <Panel title={<span className="flex items-center gap-2"><Landmark size={15} /> Bank details</span>} subtitle="Changes are audited and alert supplier managers">
            <KeyValues
              items={[
                { label: "Bank", value: s.bank_name },
                { label: "Branch", value: s.bank_branch },
                { label: "Account name", value: s.bank_account_name },
                { label: "Account number", value: s.bank_account_number && <span className="font-mono">{s.bank_account_number}</span> },
                { label: "SWIFT / BIC", value: s.swift_code },
              ]}
            />
          </Panel>
        </div>
      )}

      {tab === "contacts" && <Contacts supplierId={s.id} contacts={q.data!.contacts} canManage={canManage} />}
      {tab === "documents" && <Documents supplierId={s.id} documents={q.data!.documents} canManage={canManage} />}

      {tab === "sourcing" && (
        <Panel title="RFQs and quotations" bodyClassName="px-0">
          {!q.data?.invitations.length ? (
            <EmptyState icon={FileText} text="This supplier has not been invited to any RFQ yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="dnr-grid w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2">RFQ</th><th className="px-4 py-2">Invitation</th><th className="px-4 py-2">Quotation</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q.data.invitations.map((inv: any) => {
                    const quote = q.data!.quotations.find((x: any) => x.rfq === inv.rfq);
                    return (
                      <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/procurement/rfqs/${inv.rfq}`)}>
                        <td className="px-4 py-2.5"><p className="font-medium">{inv.expand?.rfq?.number}</p><p className="text-[12px] text-slate-500">{inv.expand?.rfq?.title}</p></td>
                        <td className="px-4 py-2.5"><StatusBadge status={inv.status} map={INVITE_STATUS} /></td>
                        <td className="px-4 py-2.5">{quote?.number || "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{quote ? money(quote.grand_total, quote.currency) : "—"}</td>
                        <td className="px-4 py-2.5">{quote ? <StatusBadge status={quote.status} map={QUOTE_STATUS} /> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "performance" && (
        <div className="space-y-4">
          <SystemPerformance supplierId={s.id} />
          <Performance supplierId={s.id} evaluations={q.data!.evaluations} canEvaluate={canPerform("evaluate_suppliers")} />
        </div>
      )}
      {tab === "activity" && <SupplierActivity supplierId={s.id} />}

      <SupplierFormDialog open={editing} onClose={() => setEditing(false)} supplier={s} />
    </div>
  );
}

function useRefresh(supplierId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries(["supplier", supplierId]);
    queryClient.invalidateQueries(["supplier-docs-expiring"]);
    queryClient.invalidateQueries(["audit", "suppliers", supplierId]);
  };
}

function Contacts({ supplierId, contacts, canManage }: { supplierId: string; contacts: any[]; canManage: boolean }) {
  const refresh = useRefresh(supplierId);
  const [draft, setDraft] = React.useState<any | null>(null);
  const save = useMutation(
    () => {
      if (!draft.name?.trim()) throw new Error("Contact name is required.");
      const body = { supplier: supplierId, name: draft.name, position: draft.position || "", email: draft.email || "", phone: draft.phone || "", is_primary: !!draft.is_primary };
      return draft.id ? pocketbase.collection("supplier_contacts").update(draft.id, body) : pocketbase.collection("supplier_contacts").create(body);
    },
    { onSuccess: () => { toast.success("Contact saved"); setDraft(null); refresh(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const remove = useMutation((id: string) => pocketbase.collection("supplier_contacts").delete(id), {
    onSuccess: () => { toast.success("Contact removed"); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  return (
    <Panel title="Contact persons" action={canManage && <Button size="sm" onClick={() => setDraft({})}><Plus size={14} /> Add contact</Button>}>
      {!contacts.length ? (
        <EmptyState icon={User} text="No contact persons recorded." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <Initials name={c.name} />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="font-medium text-slate-800">{c.name} {c.is_primary && <Badge tone="info" className="ml-1">Primary</Badge>}</p>
                <p className="text-slate-500">{c.position || "—"}</p>
                <p className="mt-1 flex items-center gap-1.5 text-slate-600"><Mail size={12} /> {c.email || "—"}</p>
                <p className="flex items-center gap-1.5 text-slate-600"><Phone size={12} /> {c.phone || "—"}</p>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDraft(c)} aria-label={`Edit ${c.name}`}><Pencil size={14} /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => remove.mutate(c.id)} aria-label={`Remove ${c.name}`}><Trash2 size={14} /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid gap-3">
              {(["name", "position", "email", "phone"] as const).map((k) => (
                <label key={k} className="block text-[12.5px] font-medium capitalize text-slate-700">
                  {k}{k === "name" && <span className="text-red-600"> *</span>}
                  <input className={cn(inputCls, "mt-1")} value={draft[k] || ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                </label>
              ))}
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!draft.is_primary} onChange={(e) => setDraft({ ...draft, is_primary: e.target.checked })} /> Primary contact</label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isLoading}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function Documents({ supplierId, documents, canManage }: { supplierId: string; documents: any[]; canManage: boolean }) {
  const refresh = useRefresh(supplierId);
  const [open, setOpen] = React.useState(false);
  const [doc, setDoc] = React.useState<any>({ document_type: "tax_certificate" });
  const [file, setFile] = React.useState<File | null>(null);
  const upload = useMutation(
    () => {
      const body = new FormData();
      body.append("supplier", supplierId);
      body.append("document_type", doc.document_type);
      body.append("document_number", doc.document_number || "");
      if (doc.issue_date) body.append("issue_date", `${doc.issue_date} 00:00:00.000Z`);
      if (doc.expiry_date) body.append("expiry_date", `${doc.expiry_date} 00:00:00.000Z`);
      body.append("notes", doc.notes || "");
      if (file) body.append("file", file);
      return pocketbase.collection("supplier_documents").create(body);
    },
    {
      onSuccess: () => { toast.success("Document added"); setOpen(false); setDoc({ document_type: "tax_certificate" }); setFile(null); refresh(); },
      onError: (e) => { toast.error(errorMessage(e)); },
    }
  );
  const remove = useMutation((id: string) => pocketbase.collection("supplier_documents").delete(id), {
    onSuccess: () => { toast.success("Document removed"); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  return (
    <Panel title="Documents" subtitle="Expiring documents are flagged 30 days ahead" action={canManage && <Button size="sm" onClick={() => setOpen(true)}><Upload size={14} /> Add document</Button>} bodyClassName="px-0">
      {!documents.length ? (
        <EmptyState icon={FileText} text="No documents on file." />
      ) : (
        <div className="overflow-x-auto">
          <table className="dnr-grid w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2">Document</th><th className="px-4 py-2">Number</th><th className="px-4 py-2">Issued</th><th className="px-4 py-2">Expires</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((d) => {
                const st = expiryState(d.expiry_date);
                return (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5">
                      {d.file ? (
                        <a className="flex items-center gap-1.5 text-primaryDark hover:underline" href={pocketbase.files.getUrl(d, d.file)} target="_blank" rel="noreferrer"><FileText size={14} />{SUPPLIER_DOC_TYPES[d.document_type]}</a>
                      ) : (
                        SUPPLIER_DOC_TYPES[d.document_type]
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{d.document_number || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{d.issue_date ? format(new Date(d.issue_date), "d MMM yyyy") : "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{d.expiry_date ? format(new Date(d.expiry_date), "d MMM yyyy") : "—"}</td>
                    <td className="px-4 py-2.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="px-4 py-2.5 text-right">
                      {canManage && <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => remove.mutate(d.id)} aria-label="Remove document"><Trash2 size={14} /></Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader><DialogTitle>Add document</DialogTitle><DialogDescription>Record the expiry date so the system can warn before it lapses.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <label className="block text-[12.5px] font-medium text-slate-700">Type
              <select className={cn(inputCls, "mt-1")} value={doc.document_type} onChange={(e) => setDoc({ ...doc, document_type: e.target.value })}>
                {Object.entries(SUPPLIER_DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-slate-700">Document number
              <input className={cn(inputCls, "mt-1")} value={doc.document_number || ""} onChange={(e) => setDoc({ ...doc, document_number: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12.5px] font-medium text-slate-700">Issue date<input type="date" className={cn(inputCls, "mt-1")} value={doc.issue_date || ""} onChange={(e) => setDoc({ ...doc, issue_date: e.target.value })} /></label>
              <label className="block text-[12.5px] font-medium text-slate-700">Expiry date<input type="date" className={cn(inputCls, "mt-1")} value={doc.expiry_date || ""} onChange={(e) => setDoc({ ...doc, expiry_date: e.target.value })} /></label>
            </div>
            <label className="block text-[12.5px] font-medium text-slate-700">File
              <input type="file" className="mt-1 block w-full text-[13px]" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => upload.mutate()} disabled={upload.isLoading}>{upload.isLoading ? "Uploading…" : "Add document"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

const EVAL_KEYS = [
  ["quality", "Quality"], ["delivery", "Delivery"], ["price", "Price competitiveness"],
  ["compliance", "Compliance"], ["responsiveness", "Responsiveness"], ["contract_compliance", "Contract compliance"],
] as const;

function Performance({ supplierId, evaluations, canEvaluate }: { supplierId: string; evaluations: any[]; canEvaluate: boolean }) {
  const refresh = useRefresh(supplierId);
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<any>({ period: `${new Date().getFullYear()} Q${Math.ceil((new Date().getMonth() + 1) / 3)}` });
  const save = useMutation(() => pocketbase.collection("supplier_evaluations").create({ supplier: supplierId, ...v }), {
    onSuccess: () => { toast.success("Evaluation recorded"); setOpen(false); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const avg = (k: string) => (evaluations.length ? evaluations.reduce((a, e) => a + (e[k] || 0), 0) / evaluations.length : 0);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="Average scores" subtitle={`${evaluations.length} evaluation(s), scale 1–5`}>
        {!evaluations.length ? (
          <p className="text-[13px] text-slate-500">Not evaluated yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {EVAL_KEYS.map(([k, label]) => (
              <li key={k} className="text-[13px]">
                <div className="mb-1 flex justify-between"><span className="text-slate-600">{label}</span><span className="font-semibold tabular-nums">{avg(k).toFixed(1)}</span></div>
                <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(avg(k) / 5) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="lg:col-span-2" title="Evaluations" action={canEvaluate && <Button size="sm" onClick={() => setOpen(true)}><Star size={14} /> Evaluate</Button>}>
        {!evaluations.length ? (
          <EmptyState icon={Star} text="No performance evaluations yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {evaluations.map((e) => (
              <li key={e.id} className="py-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <p><span className="font-medium">{e.period}</span> · {e.expand?.evaluator?.name}</p>
                  <Rating value={e.overall} count={1} />
                </div>
                {e.comments && <p className="text-slate-600">“{e.comments}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader><DialogTitle>Evaluate supplier</DialogTitle><DialogDescription>Score each criterion from 1 (poor) to 5 (excellent).</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <label className="block text-[12.5px] font-medium text-slate-700">Period<input className={cn(inputCls, "mt-1")} value={v.period} onChange={(e) => setV({ ...v, period: e.target.value })} /></label>
            {EVAL_KEYS.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-slate-700">{label}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={v[k] === n} onClick={() => setV({ ...v, [k]: n })} className={cn("h-7 w-7 rounded-md border text-[12px]", v[k] === n ? "border-primary bg-primary text-white" : "border-slate-200 hover:bg-slate-50")}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <label className="block text-[12.5px] font-medium text-slate-700">Comments<textarea className={cn(inputCls, "mt-1 h-16 py-2")} value={v.comments || ""} onChange={(e) => setV({ ...v, comments: e.target.value })} /></label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isLoading || EVAL_KEYS.some(([k]) => !v[k])}>Save evaluation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplierActivity({ supplierId }: { supplierId: string }) {
  const q = useQuery(["audit", "suppliers", supplierId], () => procurementApi.audit({ collection: "suppliers", record: supplierId, perPage: 100 }));
  return (
    <Panel title="Activity and audit trail" subtitle="Includes every bank detail change">
      {q.isLoading ? <ListSkeleton rows={4} /> : !q.data?.items.length ? (
        <p className="text-[13px] text-slate-500">No activity yet.</p>
      ) : (
        <ol className="space-y-3">
          {q.data.items.map((e) => (
            <li key={e.id} className="flex gap-3 text-[13px]">
              <Initials name={e.actor_name} />
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-medium">{e.actor_name || "System"}</span> {e.action.replace(/_/g, " ")}
                  {e.action === "bank_details_changed" && <Badge tone="danger" className="ml-2">Bank details</Badge>}
                </p>
                <p className="text-[12px] text-slate-500">{formatDistanceToNow(new Date(e.created), { addSuffix: true })}</p>
                {Object.keys(e.changes || {}).length > 0 && (
                  <ul className="mt-1 text-[12px] text-slate-500">
                    {Object.entries(e.changes).slice(0, 6).map(([k, c]) => (
                      <li key={k}>{k.replace(/_/g, " ")}: <span className="line-through">{String(c.old ?? "—") || "—"}</span> → {String(c.new ?? "—") || "—"}</li>
                    ))}
                  </ul>
                )}
                {e.comment && <p className="mt-1 text-slate-600">“{e.comment}”</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Onboarding: readiness checklist, submission, approval by procurement and finance. */
function Onboarding({ supplier: s, onChange }: { supplier: any; onChange: () => void }) {
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const ready = useQuery(["supplier-readiness", s.id, s.updated], () => phase5Api.supplierReadiness(s.id), { enabled: s.status !== "under_review" });
  const approvalQ = useQuery(["supplier-approval", s.approval], () => pocketbase.collection("approval_requests").getOne(s.approval), { enabled: Boolean(s.approval) });
  const actionsQ = useQuery(["supplier-approval-actions", s.approval], () => pocketbase.collection("approval_actions").getFullList({ filter: `approval = "${s.approval}"`, sort: "created", expand: "actor,target_user" }), { enabled: Boolean(s.approval) });
  const submit = useMutation(() => phase5Api.submitSupplier(s.id), {
    onSuccess: () => {
      toast.success("Sent for approval to procurement and finance");
      onChange();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const approval: any = approvalQ.data;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const missing = ready.data?.missing || [];
  return (
    <div className={cn("rounded-lg border px-4 py-3", s.status === "rejected" ? "border-red-200 bg-red-50" : s.status === "under_review" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-[13px]">
          <p className="font-semibold text-slate-900">
            {s.status === "under_review" ? "Registration under review" : s.status === "rejected" ? "Registration rejected — correct and submit again" : "New supplier — not yet approved"}
          </p>
          <p className="text-slate-700">A supplier can receive RFQs, orders and payments only after procurement and finance approve its registration.</p>
          {s.status !== "under_review" && (
            missing.length ? (
              <ul className="mt-1.5 space-y-0.5 text-slate-700">{missing.map((m) => <li key={m} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Missing: {m}</li>)}</ul>
            ) : ready.data ? <p className="mt-1 font-medium text-emerald-700">✓ The file is complete and can be submitted.</p> : null
          )}
          {approval && s.status === "under_review" && <p className="mt-1 text-slate-700">Step {approval.current_level + 1} of {approval.steps?.length}: {approval.steps?.[approval.current_level]?.name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {isApprover && (
            <>
              <Button size="sm" onClick={() => setDecision("approve")}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => setDecision("return")}>Send back</Button>
              <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision("reject")}>Reject</Button>
            </>
          )}
          {canPerform("manage_suppliers") && ["draft", "rejected"].includes(s.status) && <Button size="sm" disabled={submit.isLoading || missing.length > 0} onClick={() => submit.mutate()}>Submit for approval</Button>}
        </div>
      </div>
      {approval && (actionsQ.data || []).length > 0 && <div className="mt-3"><ApprovalTracker approval={approval} actions={actionsQ.data as any[]} /></div>}
      <ActionDialog
        kind={decision}
        number={s.code}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => procurementApi.act(approval.id, { action: kind, comment, user })}
        onDone={() => {
          setDecision(null);
          onChange();
          approvalQ.refetch();
          actionsQ.refetch();
        }}
      />
    </div>
  );
}

/** Performance calculated from orders, receipts, quotations and invoices — cannot be edited. */
function SystemPerformance({ supplierId }: { supplierId: string }) {
  const q = useQuery(["supplier-performance", supplierId], () => phase5Api.supplierPerformance(supplierId).then((r) => r.items[0] || null));
  const p: any = q.data;
  const pct = (v: number | null) => (v === null || v === undefined ? "n/a" : `${v}%`);
  const tone = (v: number | null) => (v === null || v === undefined ? "text-slate-400" : v >= 80 ? "text-emerald-700" : v >= 60 ? "text-amber-700" : "text-red-600");
  return (
    <Panel title="Calculated performance" subtitle="From real purchase orders, deliveries, quotations and invoices — not editable, so it cannot be manipulated.">
      {q.isLoading ? <Skeleton className="h-24 w-full" /> : !p ? <p className="text-[13px] text-slate-500">No transactions yet.</p> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Overall score", p.score, `${p.orders} order(s)`],
            ["Delivered on time", p.on_time_pct, `${p.deliveries} deliveries`],
            ["Accepted quality", p.quality_pct, p.rejection_pct !== null ? `${p.rejection_pct}% rejected` : ""],
            ["Price index", p.price_index, "100 = average quote"],
            ["RFQ response", p.response_pct, `${p.invited} invitations${p.avg_response_days !== null ? ` · ${p.avg_response_days} d` : ""}`],
            ["Invoice accuracy", p.invoice_accuracy_pct, `outstanding ${money(p.outstanding)}`],
          ].map(([k, v, s]: any) => (
            <div key={k} className="rounded-lg border border-slate-200 px-3 py-2.5">
              <p className="text-[11.5px] text-slate-500">{k}</p>
              <p className={cn("text-[18px] font-semibold tabular-nums", k === "Price index" ? (v === null ? "text-slate-400" : v <= 100 ? "text-emerald-700" : "text-amber-700") : tone(v))}>{k === "Price index" ? (v ?? "n/a") : pct(v)}</p>
              <p className="text-[11px] text-slate-500">{s}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
