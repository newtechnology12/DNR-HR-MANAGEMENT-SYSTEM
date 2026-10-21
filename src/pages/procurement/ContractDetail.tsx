import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Ban, Check, Clock, CornerUpLeft, FileSignature, Pencil, Send, ShoppingCart, Upload, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
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
  DocNo,
  EmptyState,
  Field,
  KpiBand,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Tabs,
  Textarea,
  fmtDate,
  fmtMoney,
  overdue,
} from "@/components/ims";
import { CONTRACT_STATUS, CONTRACT_TYPES, PO_STATUS, errorMessage, money, phase5Api, procurementApi } from "@/lib/procurement";
import { Attachments, FileDrop, toFormData } from "@/components/portal/kit";
import { ContractFormDialog } from "./Contracts";

const LIST = "/dashboard/procurement/contracts";
type TabKey = "details" | "orders" | "approvals" | "documents" | "activity";
/** Server alert text with its dates shown as "25 Nov 2026". */
const alertText = (t: string) => t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => fmtDate(d));

export default function ContractDetail() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState<TabKey>("details");
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
      toast.success(`${q.data?.c?.number || "Contract"} sent for approval`);
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
          <EmptyState icon={FileSignature} text="This contract is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to contracts</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { c, pos, use, actions, audit, alerts } = q.data;
  const approval = c.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const canManage = canPerform("manage_contracts");
  const draft = ["draft", "returned", "rejected"].includes(c.status);
  const daysLeft = differenceInCalendarDays(new Date(c.end_date.replace(" ", "T")), new Date());
  const usedPct = c.value ? (use.used / c.value) * 100 : 0;
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const amount = (n: number) => (c.currency && c.currency !== "RWF" ? money(n, c.currency) : fmtMoney(n));
  const late = c.status === "active" ? overdue(c.end_date) : null;
  const statusNote = stepName ? `At “${stepName}”` : late || CONTRACT_STATUS[c.status]?.note;

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  const primary = isApprover ? (
    <Button variant="primary" icon={Check} onClick={() => setDecision("approve")}>Approve</Button>
  ) : canManage && draft ? (
    <Button variant="primary" icon={Send} loading={submit.isLoading} onClick={() => submit.mutate()}>Submit for approval</Button>
  ) : null;
  const secondary = isApprover ? (
    <>
      <Button icon={CornerUpLeft} onClick={() => setDecision("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => setDecision("reject")}>Reject</Button>
    </>
  ) : canManage && draft ? (
    <>
      <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
    </>
  ) : null;
  const more: MenuItem[] = [
    { label: "Add documents", icon: Upload, onSelect: () => setUploading(true), hidden: !canManage },
    { label: "Terminate contract", icon: Ban, danger: true, onSelect: () => setTerminating(true), hidden: !(canManage && c.status === "active") },
    { label: "Cancel contract", icon: Ban, danger: true, onSelect: () => setDecision("cancel"), hidden: !(canManage && ["draft", "returned", "rejected", "pending_approval"].includes(c.status)) },
  ];

  const priceColumns: Column<any>[] = [
    { key: "description", header: "Item or service", clamp: true, cell: (it) => it.description },
    { key: "unit", header: "Unit", nowrap: true, cell: (it) => it.unit || "—" },
    { key: "price", header: `Contract price (${c.currency || "RWF"})`, numeric: true, cell: (it) => <Num value={it.unit_price} /> },
  ];
  const orderColumns: Column<any>[] = [
    { key: "number", header: "Number", nowrap: true, cell: (p) => <DocNo value={p.number} /> },
    { key: "title", header: "Title", clamp: true, cell: (p) => p.title || "—" },
    { key: "date", header: "Order date", nowrap: true, cell: (p) => fmtDate(p.order_date) },
    { key: "total", header: "Total (RWF)", numeric: true, cell: (p) => <Num value={p.grand_total} />, total: <Num value={pos.reduce((a: number, p: any) => a + (Number(p.grand_total) || 0), 0)} /> },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} map={PO_STATUS} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to contracts", to: LIST }}
        number={c.number}
        type={CONTRACT_TYPES[c.contract_type] || "Contract"}
        status={CONTRACT_STATUS[c.status]?.label || c.status}
        statusNote={statusNote}
        title={c.title}
        facts={[
          { label: "Supplier", value: c.expand?.supplier?.name || "—" },
          c.expand?.responsible?.name ? { label: "Managed by", value: c.expand.responsible.name } : null,
          `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`,
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
      {alerts.length > 0 && (
        <div role="status" className="space-y-1 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          {alerts.map((a, i) => (
            <p key={i} className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {alertText(a.text)}
            </p>
          ))}
        </div>
      )}

      <KpiBand
        items={[
          { label: "Contract value", value: amount(c.value) },
          { label: `Used · ${use.orders} order${use.orders === 1 ? "" : "s"}`, value: amount(use.used), sub: `${Math.round(usedPct)}% of the value`, onClick: () => setTab("orders") },
          { label: "Remaining", value: amount(use.remaining), tone: use.remaining < c.value * 0.1 ? "warning" : "default" },
          c.status === "active"
            ? { label: "Days left", value: Math.max(0, daysLeft), tone: daysLeft < 60 ? "warning" : "default" }
            : { label: "Ends", value: fmtDate(c.end_date) },
        ]}
      />

      <Tabs
        label="Contract sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "orders", label: "Purchase orders", count: pos.length },
          { key: "approvals", label: "Approvals" },
          { key: "documents", label: "Documents", count: (c.documents || []).length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title="Contract" />
              <Details
                items={[
                  { label: "Supplier", value: c.supplier ? <Link className="font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/suppliers/${c.supplier}`}>{c.expand?.supplier?.name}</Link> : null },
                  { label: "Type", value: CONTRACT_TYPES[c.contract_type] || c.contract_type },
                  { label: "Department", value: c.expand?.department?.name || "Organisation-wide" },
                  { label: "Contract manager", value: c.expand?.responsible?.name },
                  { label: "Period", value: `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}` },
                  { label: "Renewal decision by", value: c.renewal_date ? fmtDate(c.renewal_date) : null, hint: c.auto_renew ? "Renews automatically" : undefined },
                  { label: "Payment terms", value: c.payment_terms },
                  { label: "Approved", value: c.approved_at ? fmtDate(c.approved_at) : null },
                  ...(c.termination_reason ? [{ label: "Termination reason", value: c.termination_reason, wide: true }] : []),
                ]}
              />
            </Card>
            {(c.items || []).length > 0 && (
              <Card padded={false}>
                <div className="px-5 pt-5">
                  <CardHeader title="Price schedule" subtitle="Unit prices agreed in the contract." />
                </div>
                <DataTable columns={priceColumns} rows={c.items || []} rowKey={(_, i) => String(i)} minWidth={480} caption="Price schedule" />
              </Card>
            )}
          </div>
          <Card>
            <CardHeader title="Scope" />
            <p className="whitespace-pre-line text-t-body leading-relaxed text-ims-body">{c.scope || "No scope recorded."}</p>
            {c.notes && <p className="mt-4 rounded-control bg-ims-subtle px-3 py-2 text-t-body text-ims-body">{c.notes}</p>}
          </Card>
        </div>
      )}

      {tab === "orders" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Purchase orders" subtitle="Orders raised against this contract." />
          </div>
          <DataTable
            columns={orderColumns}
            rows={pos}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/dashboard/procurement/purchase-orders/${p.id}`)}
            minWidth={640}
            caption="Purchase orders"
            empty={<EmptyState compact icon={ShoppingCart} text="No purchase order has been raised against this contract yet. Link the contract when editing a draft purchase order." />}
          />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={actions} />}

      {tab === "documents" && (
        <Card>
          <CardHeader
            title="Documents"
            subtitle="Signed contract, annexes, addenda and performance securities."
            action={canManage ? <Button size="sm" icon={Upload} onClick={() => setUploading(true)}>Add documents</Button> : undefined}
          />
          <Attachments record={c} names={c.documents || []} empty="No document attached. Attach the signed contract." />
        </Card>
      )}

      {tab === "activity" && <Activity actions={actions} audit={audit} loading={false} />}

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
    </Page>
  );
}

function TerminateDialog({ contract, onClose, onDone }: { contract: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const run = useMutation(() => phase5Api.contractAction(contract.id, "terminate", { reason }), {
    onSuccess: () => {
      toast.success(`${contract.number} terminated`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const tooShort = reason.trim().length < 10;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Terminate ${contract.number}?`}
      description="No further purchase orders can be raised against it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={run.isLoading} onClick={() => { setTried(true); if (!tooShort) run.mutate(); }}>Terminate</Button>
        </>
      }
    >
      <Field label="Why is the contract terminated?" required htmlFor="ct-term-reason" error={tried && tooShort && "Write at least 10 characters so the file shows why it ended."}>
        <Textarea id="ct-term-reason" rows={4} autoFocus invalid={tried && tooShort} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeated late deliveries; notice given on 1 September as per clause 14." />
      </Field>
    </Modal>
  );
}

function UploadDialog({ contract, onClose, onDone }: { contract: any; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = React.useState<File[]>([]);
  const run = useMutation(() => pocketbase.collection("contracts").update(contract.id, toFormData({}, { documents: files })), {
    onSuccess: () => {
      toast.success(`${files.length} document${files.length === 1 ? "" : "s"} added to ${contract.number}`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Add documents to ${contract.number}`}
      description="Signed contract, annexes, addenda, performance securities."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Upload} loading={run.isLoading} disabled={!files.length} onClick={() => files.length && run.mutate()}>Upload</Button>
        </>
      }
    >
      <FileDrop files={files} onChange={setFiles} max={20} label="Choose documents" />
    </Modal>
  );
}
