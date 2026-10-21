import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Ban, CalendarClock, Check, CornerUpLeft, FileSignature, Pencil, Send, ShoppingCart, Upload, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, toChatter } from "@/components/enterprise/DocumentLayout";
import { CONTRACT_STATUS, CONTRACT_TYPES, PO_STATUS, errorMessage, money, phase5Api, procurementApi } from "@/lib/procurement";
import { Attachments, Field, FileDrop, FormBlock, FormDialog, Progress, showDate, textareaCls, toFormData } from "@/components/portal/kit";
import { ContractFormDialog } from "./Contracts";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Approval" },
  { key: "active", label: "Active" },
  { key: "ended", label: "Ended" },
];
const stepOf = (s: string) => (["expired", "terminated"].includes(s) ? "ended" : ["returned", "rejected", "cancelled"].includes(s) ? "draft" : s);

export default function ContractDetail() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState("terms");
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [terminating, setTerminating] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const q = useQuery(["contract", contractId], async () => {
    const c: any = await pocketbase.collection("contracts").getOne(contractId!, { expand: "supplier,department,responsible,created_by,approval" });
    const [pos, use, actions, audit, alerts] = await Promise.all([
      pocketbase.collection("purchase_orders").getFullList({ filter: `contract = "${contractId}"`, sort: "-created" }),
      phase5Api.contractUse(contractId!),
      pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "contract" && document_id = "${contractId}"`, sort: "created", expand: "actor,target_user" }).catch(() => [] as any[]),
      procurementApi.audit({ collection: "contracts", record: contractId, perPage: 100 }).then((x) => x.items).catch(() => []),
      phase5Api.contractAlerts().then((r) => r.items.filter((a) => a.contract === contractId)).catch(() => []),
    ]);
    return { c, pos, use, actions, audit, alerts };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["contract", contractId]);
    queryClient.invalidateQueries(["record-table"]);
    queryClient.invalidateQueries(["contract-alerts"]);
  };
  const submit = useMutation(() => phase5Api.contractAction(contractId!, "submit"), {
    onSuccess: () => {
      toast.success("Sent for approval");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-96 w-full" /></div>;
  if (!q.data) return <div className="p-4"><Panel><EmptyState icon={FileSignature} title="Contract not available" text="It may be outside what your role can see." /></Panel></div>;
  const { c, pos, use, actions, audit, alerts } = q.data;
  const approval = c.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const canManage = canPerform("manage_contracts");
  const draft = ["draft", "returned", "rejected"].includes(c.status);
  const daysLeft = differenceInCalendarDays(new Date(c.end_date.replace(" ", "T")), new Date());
  const usedPct = c.value ? (use.used / c.value) * 100 : 0;

  return (
    <DocumentPage chatter={<Chatter items={toChatter(actions, audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Contracts", link: "/dashboard/procurement/contracts" }, { title: c.number }]}
        steps={STEPS}
        current={stepOf(c.status)}
        actions={
          <>
            {isApprover && (
              <>
                <Button size="sm" onClick={() => setDecision("approve")}><Check size={14} /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setDecision("return")}><CornerUpLeft size={14} /> Send back</Button>
                <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision("reject")}><XCircle size={14} /> Reject</Button>
              </>
            )}
            {canManage && draft && <Button size="sm" disabled={submit.isLoading} onClick={() => submit.mutate()}><Send size={14} /> Submit for approval</Button>}
            {canManage && draft && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
            {canManage && <Button size="sm" variant="outline" onClick={() => setUploading(true)}><Upload size={14} /> Add document</Button>}
            {canManage && c.status === "active" && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setTerminating(true)}><Ban size={14} /> Terminate</Button>}
            {canManage && ["draft", "returned", "rejected", "pending_approval"].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => setDecision("cancel")}><Ban size={14} /> Cancel</Button>}
          </>
        }
      />
      {alerts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          {alerts.map((a, i) => <p key={i} className="flex items-center gap-2"><AlertTriangle size={14} /> {a.text}</p>)}
        </div>
      )}
      <SmartButtons
        items={[
          { icon: Wallet, label: "Contract value", value: money(c.value, c.currency) },
          { icon: ShoppingCart, label: `Used · ${use.orders} order${use.orders === 1 ? "" : "s"}`, value: money(use.used, c.currency), onClick: () => setTab("orders") },
          { icon: Wallet, label: "Remaining", value: money(use.remaining, c.currency), tone: use.remaining < c.value * 0.1 ? "warning" : "default" },
          { icon: CalendarClock, label: c.status === "active" ? "Days left" : "Status", value: c.status === "active" ? Math.max(0, daysLeft) : CONTRACT_STATUS[c.status]?.label, tone: c.status === "active" && daysLeft < 60 ? "warning" : "default" },
        ]}
      />
      <Sheet ribbon={c.status === "terminated" ? { label: "Terminated", tone: "danger" } : c.status === "expired" ? { label: "Expired", tone: "neutral" } : undefined}>
        <SheetTitle kicker={CONTRACT_TYPES[c.contract_type] || "Contract"} title={c.title} badges={<StatusBadge status={c.status} map={CONTRACT_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Number", value: c.number },
            { label: "Supplier", value: <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/procurement/suppliers/${c.supplier}`}>{c.expand?.supplier?.name}</Link> },
            { label: "Department", value: c.expand?.department?.name || "Organisation-wide" },
            { label: "Contract manager", value: c.expand?.responsible?.name },
            { label: "Payment terms", value: c.payment_terms },
          ]}
          right={[
            { label: "Period", value: `${showDate(c.start_date)} – ${showDate(c.end_date)}` },
            { label: "Renewal decision by", value: c.renewal_date ? showDate(c.renewal_date) : "", hint: c.auto_renew ? "Renews automatically" : undefined },
            { label: "Value used", value: <Progress value={usedPct} className="max-w-[240px]" /> },
            { label: "Approved", value: c.approved_at ? showDate(c.approved_at) : "" },
            { label: "Termination reason", value: c.termination_reason },
          ]}
        />
        <Notebook
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "terms", label: "Scope and prices" },
            { key: "orders", label: "Purchase orders", count: pos.length },
            { key: "documents", label: "Documents", count: (c.documents || []).length },
            ...(approval ? [{ key: "approval", label: "Approval" }] : []),
          ]}
        />
        <div className="pt-4">
          {tab === "terms" && (
            <div className="space-y-4">
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">{c.scope || "No scope recorded."}</p>
              {(c.items || []).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[480px] text-[13px]">
                    <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Item / service</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Contract price</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(c.items || []).map((it: any, i: number) => <tr key={i}><td className="px-3 py-2">{it.description}</td><td className="px-3 py-2 text-slate-600">{it.unit}</td><td className="px-3 py-2 text-right tabular-nums">{money(it.unit_price, c.currency)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              )}
              {c.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">{c.notes}</p>}
            </div>
          )}
          {tab === "orders" && (
            !pos.length ? <EmptyState icon={ShoppingCart} text="No purchase order has been raised against this contract yet. Link the contract when editing a draft purchase order." /> : (
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[560px] text-[13px]">
                  <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">PO</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Order date</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {pos.map((p: any) => (
                      <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/procurement/purchase-orders/${p.id}`)}>
                        <td className="px-3 py-2 font-medium text-primaryDark">{p.number}</td><td className="px-3 py-2">{p.title}</td><td className="px-3 py-2 text-slate-600">{showDate(p.order_date)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(p.grand_total)}</td><td className="px-3 py-2"><StatusBadge status={p.status} map={PO_STATUS} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {tab === "documents" && <Attachments record={c} names={c.documents || []} empty="No document attached. Attach the signed contract." />}
          {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}
        </div>
      </Sheet>

      <ActionDialog
        kind={decision}
        number={c.number}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => (kind === "cancel" ? phase5Api.contractAction(c.id, "cancel", { reason: comment }) : procurementApi.act(approval.id, { action: kind, comment, user }))}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />
      {editing && <ContractFormDialog contract={c} onClose={() => { setEditing(false); refresh(); }} />}
      {terminating && <TerminateDialog contract={c} onClose={() => setTerminating(false)} onDone={() => { setTerminating(false); refresh(); }} />}
      {uploading && <UploadDialog contract={c} onClose={() => setUploading(false)} onDone={() => { setUploading(false); refresh(); }} />}
    </DocumentPage>
  );
}

function TerminateDialog({ contract, onClose, onDone }: { contract: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const run = useMutation(() => phase5Api.contractAction(contract.id, "terminate", { reason }), {
    onSuccess: () => {
      toast.success("Contract terminated");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <FormDialog open onClose={onClose} icon={Ban} title={`Terminate ${contract.number}`} description="No further purchase orders can be raised against it." submitLabel="Terminate contract" busy={run.isLoading} onSubmit={() => { setTried(true); if (reason.trim().length >= 10) run.mutate(); }}>
      <FormBlock icon={Ban} title="Reason">
        <Field label="Why is the contract terminated?" required error={tried && reason.trim().length < 10 && "At least 10 characters."}>
          <textarea className={textareaCls} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeated late deliveries; notice given on 1 September as per clause 14." />
        </Field>
      </FormBlock>
    </FormDialog>
  );
}

function UploadDialog({ contract, onClose, onDone }: { contract: any; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = React.useState<File[]>([]);
  const run = useMutation(() => pocketbase.collection("contracts").update(contract.id, toFormData({}, { documents: files })), {
    onSuccess: () => {
      toast.success("Documents added");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <FormDialog open onClose={onClose} icon={Upload} title={`Add documents to ${contract.number}`} description="Signed contract, annexes, addenda, performance securities…" submitLabel="Upload" busy={run.isLoading} onSubmit={() => files.length && run.mutate()}>
      <FileDrop files={files} onChange={setFiles} max={20} label="Choose documents" />
    </FormDialog>
  );
}
