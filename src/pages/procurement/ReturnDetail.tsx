import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Check, CornerUpLeft, FileMinus, Receipt, ShoppingCart, Truck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, Totals, toChatter } from "@/components/enterprise/DocumentLayout";
import { RETURN_STATUS, errorMessage, money, phase5Api, procurementApi } from "@/lib/procurement";
import { Field, FormBlock, FormDialog, inputCls, showDate } from "@/components/portal/kit";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Approval" },
  { key: "approved", label: "Approved" },
  { key: "dispatched", label: "Returned" },
  { key: "credited", label: "Credited" },
];
const stepOf = (s: string) => (s === "returned_for_changes" || s === "rejected" || s === "cancelled" ? "draft" : s);
const ACTION_LABEL: Record<string, string> = { credit_note: "Credit note", replacement: "Replacement", refund: "Refund" };

export default function ReturnDetail() {
  const { returnId } = useParams();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState("lines");
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [crediting, setCrediting] = React.useState(false);

  const q = useQuery(["purchase-return", returnId], async () => {
    const r: any = await pocketbase.collection("purchase_returns").getOne(returnId!, { expand: "supplier,purchase_order,goods_receipt,warehouse,requested_by,dispatched_by,approval" });
    const [actions, audit] = await Promise.all([
      pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "purchase_return" && document_id = "${returnId}"`, sort: "created", expand: "actor,target_user" }).catch(() => [] as any[]),
      procurementApi.audit({ collection: "purchase_returns", record: returnId, perPage: 100 }).then((x) => x.items).catch(() => []),
    ]);
    return { r, actions, audit };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["purchase-return", returnId]);
    queryClient.invalidateQueries(["record-table"]);
  };
  const dispatch = useMutation(() => phase5Api.returnAction(returnId!, "dispatch"), {
    onSuccess: () => {
      toast.success("Goods recorded as returned; stock reduced");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-96 w-full" /></div>;
  if (!q.data) return <div className="p-4"><Panel><EmptyState icon={FileMinus} title="Return not available" text="It may be outside what your role can see." /></Panel></div>;
  const { r, actions, audit } = q.data;
  const approval = r.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const canHandle = canPerform("receive_goods") || canPerform("manage_purchase_orders");

  return (
    <DocumentPage chatter={<Chatter items={toChatter(actions, audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Returns", link: "/dashboard/procurement/returns" }, { title: r.number }]}
        steps={STEPS}
        current={stepOf(r.status)}
        actions={
          <>
            {isApprover && (
              <>
                <Button size="sm" onClick={() => setDecision("approve")}><Check size={14} /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setDecision("return")}><CornerUpLeft size={14} /> Send back</Button>
                <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision("reject")}><XCircle size={14} /> Reject</Button>
              </>
            )}
            {canHandle && ["draft", "returned_for_changes"].includes(r.status) && <Button size="sm" onClick={() => phase5Api.returnAction(r.id, "submit").then(() => { toast.success("Sent for approval"); refresh(); }).catch((e) => toast.error(errorMessage(e)))}>Submit for approval</Button>}
            {canPerform("receive_goods") && r.status === "approved" && <Button size="sm" disabled={dispatch.isLoading} onClick={() => dispatch.mutate()}><Truck size={14} /> Goods handed to supplier</Button>}
            {canPerform("manage_invoices") && r.status === "dispatched" && <Button size="sm" onClick={() => setCrediting(true)}><Receipt size={14} /> Record credit note</Button>}
            {canHandle && ["draft", "returned_for_changes", "pending_approval", "rejected"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setDecision("cancel")}><Ban size={14} /> Cancel</Button>}
          </>
        }
      />
      <SmartButtons
        items={[
          { icon: ShoppingCart, label: "Purchase order", value: r.expand?.purchase_order?.number || "—" },
          { icon: Truck, label: "Goods receipt", value: r.expand?.goods_receipt?.number || "—" },
          { icon: Receipt, label: "Credit note", value: r.credit_amount ? money(r.credit_amount) : "—" },
        ]}
      />
      <Sheet ribbon={r.status === "credited" ? { label: "Credited", tone: "success" } : r.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : r.status === "rejected" ? { label: "Rejected", tone: "danger" } : undefined}>
        <SheetTitle kicker="Purchase return" title={r.number} badges={<StatusBadge status={r.status} map={RETURN_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Supplier", value: <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/procurement/suppliers/${r.supplier}`}>{r.expand?.supplier?.name}</Link> },
            { label: "Purchase order", value: <Link className="text-primaryDark hover:underline" to={`/dashboard/procurement/purchase-orders/${r.purchase_order}`}>{r.expand?.purchase_order?.number}</Link> },
            { label: "Goods receipt", value: r.expand?.goods_receipt?.number, hint: showDate(r.expand?.goods_receipt?.receipt_date) },
            { label: "Reason", value: r.reason },
          ]}
          right={[
            { label: "Requested by", value: r.expand?.requested_by?.name, hint: showDate(r.created, "d MMM yyyy, HH:mm") },
            { label: "Warehouse", value: r.expand?.warehouse?.name },
            { label: "Supplier action", value: ACTION_LABEL[r.supplier_action] || r.supplier_action },
            { label: "Handed to supplier", value: r.dispatched_at ? `${showDate(r.dispatched_at)} by ${r.expand?.dispatched_by?.name || "—"}` : "" },
            { label: "Credit note", value: r.credit_note_number ? `${r.credit_note_number} · ${money(r.credit_amount)}` : "" },
          ]}
        />
        <Notebook active={tab} onChange={setTab} tabs={[{ key: "lines", label: "Returned items", count: (r.items || []).length }, ...(approval ? [{ key: "approval", label: "Approval" }] : [])]} />
        <div className="pt-4">
          {tab === "lines" && (
            <>
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[640px] text-[13px]">
                  <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Item</th><th className="px-3 py-2">Condition</th><th className="px-3 py-2 text-right">Accepted on receipt</th><th className="px-3 py-2 text-right">Returned</th><th className="px-3 py-2 text-right">Unit cost</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(r.items || []).map((it: any) => (
                      <tr key={it.line}>
                        <td className="px-3 py-2.5"><p className="font-medium">{it.description}</p><p className="text-[12px] text-slate-500">{it.unit}{it.batch ? ` · batch ${it.batch}` : ""}</p></td>
                        <td className="px-3 py-2.5 capitalize text-slate-600">{String(it.condition).replace(/_/g, " ")}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{it.received}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{it.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(it.unit_cost).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{Math.round(it.value).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Totals rows={r.credit_amount ? [["Credit note received", money(r.credit_amount)]] : []} total={["Value returned", money(r.total_value)]} />
            </>
          )}
          {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}
        </div>
      </Sheet>
      <ActionDialog
        kind={decision}
        number={r.number}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => (kind === "cancel" ? phase5Api.returnAction(r.id, "cancel", { reason: comment }) : procurementApi.act(approval.id, { action: kind, comment, user }))}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />
      {crediting && <CreditDialog ret={r} onClose={() => setCrediting(false)} onDone={() => { setCrediting(false); refresh(); }} />}
    </DocumentPage>
  );
}

function CreditDialog({ ret, onClose, onDone }: { ret: any; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = React.useState("");
  const [amount, setAmount] = React.useState(String(ret.total_value));
  const [tried, setTried] = React.useState(false);
  const save = useMutation(() => phase5Api.returnAction(ret.id, "credit", { credit_note_number: number, credit_amount: Number(amount) }), {
    onSuccess: () => {
      toast.success("Credit note recorded");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <FormDialog open onClose={onClose} icon={Receipt} title={`Credit note for ${ret.number}`} description={`${ret.expand?.supplier?.name} · value returned ${money(ret.total_value)}`} submitLabel="Record credit note" busy={save.isLoading} onSubmit={() => { setTried(true); if (number.trim() && Number(amount) > 0) save.mutate(); }}>
      <FormBlock icon={Receipt} title="Supplier credit note">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Credit note number" required error={tried && !number.trim() && "Enter the number printed on the credit note."}><input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. CN-2026-0117" /></Field>
          <Field label="Amount (RWF)" required error={tried && !(Number(amount) > 0) && "Enter the amount."}><input type="number" min={0} className={`${inputCls} text-right tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
      </FormBlock>
    </FormDialog>
  );
}
