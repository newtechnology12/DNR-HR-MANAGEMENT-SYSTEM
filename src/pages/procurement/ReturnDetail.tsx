import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Check, Clock, CornerUpLeft, FileMinus, Receipt, Send, Truck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionDialog, ActionKind, Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  Field,
  Input,
  MenuItem,
  Modal,
  MoneyInput,
  MoreMenu,
  Num,
  Page,
  Tabs,
  TwoLine,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  sentence,
} from "@/components/ims";
import { RETURN_STATUS, errorMessage, phase5Api, procurementApi } from "@/lib/procurement";
import DocumentUploads from "@/components/enterprise/Attachments";

const LIST = "/dashboard/procurement/returns";
const ACTION_LABEL: Record<string, string> = { credit_note: "Credit note", replacement: "Replacement", refund: "Refund" };
type TabKey = "details" | "items" | "approvals" | "documents" | "activity";

export default function ReturnDetail() {
  const { returnId } = useParams();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState<TabKey>("details");
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
      toast.success(`${q.data?.r?.number || "Return"} handed to the supplier; stock reduced`);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={FileMinus} text="This return is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to returns</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { r, actions, audit } = q.data;
  const approval = r.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const canHandle = canPerform("receive_goods") || canPerform("manage_purchase_orders");
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const items: any[] = r.items || [];
  const canSubmit = canHandle && ["draft", "returned_for_changes"].includes(r.status);
  const canDispatch = canPerform("receive_goods") && r.status === "approved";
  const canCredit = canPerform("manage_invoices") && r.status === "dispatched";
  const submitReturn = () => phase5Api.returnAction(r.id, "submit").then(() => { toast.success(`${r.number} sent for approval`); refresh(); }).catch((e) => toast.error(errorMessage(e)));

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  const primary = isApprover ? (
    <Button variant="primary" icon={Check} onClick={() => setDecision("approve")}>Approve</Button>
  ) : canSubmit ? (
    <Button variant="primary" icon={Send} onClick={submitReturn}>Submit for approval</Button>
  ) : canDispatch ? (
    <Button variant="primary" icon={Truck} loading={dispatch.isLoading} onClick={() => dispatch.mutate()}>Goods handed to supplier</Button>
  ) : canCredit ? (
    <Button variant="primary" icon={Receipt} onClick={() => setCrediting(true)}>Record credit note</Button>
  ) : null;
  const secondary = isApprover ? (
    <>
      <Button icon={CornerUpLeft} onClick={() => setDecision("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => setDecision("reject")}>Reject</Button>
    </>
  ) : null;
  const more: MenuItem[] = [
    { label: "Cancel return", icon: Ban, danger: true, onSelect: () => setDecision("cancel"), hidden: !(canHandle && ["draft", "returned_for_changes", "pending_approval", "rejected"].includes(r.status)) },
  ];

  const itemColumns: Column<any>[] = [
    { key: "line", header: "#", width: "48px", cell: (it, i) => <span className="text-ims-muted">{it.line || i + 1}</span> },
    { key: "item", header: "Item", cell: (it) => <TwoLine main={it.description} sub={`${it.unit || ""}${it.batch ? ` · batch ${it.batch}` : ""}`} /> },
    { key: "condition", header: "Condition", nowrap: true, cell: (it) => sentence(it.condition) || "—" },
    { key: "received", header: "Accepted on receipt", numeric: true, cell: (it) => fmtNumber(it.received, true) },
    { key: "quantity", header: "Returned", numeric: true, cell: (it) => <span className="font-semibold">{fmtNumber(it.quantity, true)}</span> },
    { key: "unit_cost", header: "Unit cost (RWF)", numeric: true, cell: (it) => <Num value={it.unit_cost} /> },
    { key: "value", header: "Value (RWF)", numeric: true, cell: (it) => <Num value={it.value} />, total: <Num value={r.total_value} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to returns", to: LIST }}
        number={r.number}
        type="Purchase return"
        status={RETURN_STATUS[r.status]?.label || r.status}
        statusNote={stepName ? `At “${stepName}”` : RETURN_STATUS[r.status]?.note}
        title={r.expand?.supplier?.name ? `Return to ${r.expand.supplier.name}` : "Purchase return"}
        facts={[
          { label: "Requested by", value: r.expand?.requested_by?.name || "—" },
          r.expand?.purchase_order?.number ? { label: "Order", value: <span className="whitespace-nowrap">{r.expand.purchase_order.number}</span> } : null,
          fmtDate(r.created),
          <strong key="total" className="font-bold text-ims-text">{fmtMoney(r.total_value)}</strong>,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary}
            {primary}
          </>
        }
      />

      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}

      <Tabs
        label="Return sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "items", label: "Items", count: items.length },
          { key: "approvals", label: "Approvals" },
          { key: "documents", label: "Documents", count: (r.attachments || []).length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <Card>
          <CardHeader title="Return" />
          <Details
            items={[
              { label: "Supplier", value: r.supplier ? <Link className="font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/suppliers/${r.supplier}`}>{r.expand?.supplier?.name}</Link> : null },
              { label: "Purchase order", value: r.purchase_order ? <Link className="whitespace-nowrap font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/purchase-orders/${r.purchase_order}`}>{r.expand?.purchase_order?.number}</Link> : null },
              { label: "Goods receipt", value: r.expand?.goods_receipt?.number ? <span className="whitespace-nowrap">{r.expand.goods_receipt.number}</span> : null, hint: r.expand?.goods_receipt?.receipt_date ? `Received ${fmtDate(r.expand.goods_receipt.receipt_date)}` : undefined },
              { label: "Warehouse", value: r.expand?.warehouse?.name },
              { label: "Requested by", value: r.expand?.requested_by?.name, hint: fmtDateTime(r.created) },
              { label: "Supplier action", value: ACTION_LABEL[r.supplier_action] || r.supplier_action },
              { label: "Handed to supplier", value: r.dispatched_at ? `${fmtDate(r.dispatched_at)} by ${r.expand?.dispatched_by?.name || "—"}` : null },
              { label: "Credit note", value: r.credit_note_number ? `${r.credit_note_number} · ${fmtMoney(r.credit_amount)}` : null },
              { label: "Reason", value: r.reason ? <span className="whitespace-pre-line">{r.reason}</span> : null, wide: true },
              ...(r.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{r.notes}</span>, wide: true }] : []),
              ...(r.cancel_reason ? [{ label: "Cancellation reason", value: r.cancel_reason, wide: true }] : []),
            ]}
          />
        </Card>
      )}

      {tab === "items" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader
              title="Returned items"
              subtitle={r.credit_amount ? `Value returned ${fmtMoney(r.total_value)} · credit note received ${fmtMoney(r.credit_amount)}` : `Value returned ${fmtMoney(r.total_value)}`}
            />
          </div>
          <DataTable columns={itemColumns} rows={items} rowKey={(it, i) => String(it.line ?? i)} minWidth={760} caption="Returned items" empty={<EmptyState compact text="No items on this return." />} />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={actions} />}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Photos of the defects, the supplier's return note, the credit note." />
          <DocumentUploads
            collection="purchase_returns"
            record={r}
            canAdd={canPerform("manage_purchase_orders") || canPerform("receive_goods") || canPerform("approve_purchase_returns")}
            canRemove={["draft", "returned"].includes(r.status) && canPerform("manage_purchase_orders")}
            onChange={refresh}
            hint="Photos of the defects, supplier's return note, credit note…"
          />
        </Card>
      )}

      {tab === "activity" && <Activity actions={actions} audit={audit} loading={false} />}

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
    </Page>
  );
}

function CreditDialog({ ret, onClose, onDone }: { ret: any; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = React.useState("");
  const [amount, setAmount] = React.useState(String(ret.total_value));
  const [tried, setTried] = React.useState(false);
  const save = useMutation(() => phase5Api.returnAction(ret.id, "credit", { credit_note_number: number, credit_amount: Number(amount) }), {
    onSuccess: () => {
      toast.success(`Credit note ${number} recorded on ${ret.number}`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const submit = () => {
    setTried(true);
    if (number.trim() && Number(amount) > 0) save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Record the credit note for ${ret.number}`}
      description={`${ret.expand?.supplier?.name || "Supplier"} · value returned ${fmtMoney(ret.total_value)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} onClick={submit}>Record credit note</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Credit note number" required htmlFor="cn-number" error={tried && !number.trim() && "Enter the number printed on the credit note."}>
          <Input id="cn-number" invalid={tried && !number.trim()} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. CN-2026-0117" />
        </Field>
        <Field label="Amount" required htmlFor="cn-amount" error={tried && !(Number(amount) > 0) && "Enter the amount on the credit note, above 0."}>
          <MoneyInput id="cn-amount" invalid={tried && !(Number(amount) > 0)} value={amount === "" ? "" : Number(amount)} onChange={(v) => setAmount(v === "" ? "" : String(v))} />
        </Field>
      </div>
    </Modal>
  );
}
