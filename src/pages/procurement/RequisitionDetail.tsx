import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, Ban, Check, Clock, CornerUpLeft, FileSearch, FileText, MessageSquare, Pencil, Send, ShoppingCart, Trash2, UserPlus, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { PickRequisition } from "./Rfqs";
import { DirectPoDialog } from "./PurchaseOrders";
import { ActionDialog, ActionKind, Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
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
  MenuItem,
  MoreMenu,
  Num,
  Page,
  Priority,
  Tabs,
  TwoLine,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { DOC_STATUS, PO_STATUS, REQUEST_TYPES, RFQ_STATUS, money, procurementApi } from "@/lib/procurement";
import { BudgetPanel } from "@/components/budget/BudgetKit";

type TabKey = "details" | "items" | "approvals" | "documents" | "activity";
const LIST = "/dashboard/procurement/requisitions";

export default function RequisitionDetail() {
  const { requisitionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState<TabKey>("details");
  const [dialog, setDialog] = React.useState<ActionKind | null>(null);
  const [sourcing, setSourcing] = React.useState(false);
  const [directPo, setDirectPo] = React.useState(false);
  const { canPerform } = useRoles();

  const doc = useQuery(["purchase_requisition", requisitionId], () =>
    pocketbase.collection("purchase_requisitions").getOne(requisitionId!, {
      expand: "requester,department,branch,category,action_plan,approval",
    })
  );
  const r: any = doc.data;
  const approval: any = r?.expand?.approval;

  const actions = useQuery(
    ["approval_actions", requisitionId],
    () =>
      pocketbase.collection("approval_actions").getFullList({
        filter: `document_type = "purchase_requisition" && document_id = "${requisitionId}"`,
        sort: "created",
        expand: "actor,target_user",
      }),
    { enabled: Boolean(r) }
  );
  const rfqs = useQuery(
    ["requisition-rfqs", requisitionId],
    async () => {
      const [list, pos] = await Promise.all([
        pocketbase.collection("rfqs").getFullList({ filter: `requisition = "${requisitionId}"`, sort: "-created", expand: "awarded_quotation.supplier" }).catch(() => []),
        pocketbase.collection("purchase_orders").getFullList({ filter: `requisition = "${requisitionId}"`, sort: "-created", expand: "supplier" }).catch(() => []),
      ]);
      return Object.assign(list, { pos });
    },
    { enabled: Boolean(r) && ["approved", "converted_to_rfq", "converted_to_po", "completed"].includes(r?.status) }
  );
  const history = useQuery(
    ["audit", "purchase_requisitions", requisitionId],
    () => procurementApi.audit({ collection: "purchase_requisitions", record: requisitionId, perPage: 100 }),
    { enabled: Boolean(r) && tab === "activity" }
  );

  const refresh = () => {
    queryClient.invalidateQueries(["purchase_requisition", requisitionId]);
    queryClient.invalidateQueries(["approval_actions", requisitionId]);
    queryClient.invalidateQueries(["audit", "purchase_requisitions", requisitionId]);
    queryClient.invalidateQueries(["record-table"]);
    queryClient.invalidateQueries(["procurement-dashboard"]);
    queryClient.invalidateQueries(["notifications"]);
  };

  if (doc.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (doc.isError || !r) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={FileText}
            text="This requisition is not available. It may have been deleted, or your role cannot see it."
            action={<ButtonLink to={LIST}>Back to requisitions</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const isRequester = r.requester === me?.id;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const editable = ["draft", "returned"].includes(r.status);
  const typeLabel = REQUEST_TYPES.find((t) => t.value === r.request_type)?.label;
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const returnNote = [...(actions.data || [])].reverse().find((a: any) => a.action === "return")?.comment;
  const items: any[] = r.items || [];
  const sourcingRfqs: any[] = rfqs.data || [];
  const sourcingPos: any[] = (rfqs.data as any)?.pos || [];
  const canSource = r.status === "approved" && canPerform("manage_rfqs");
  const canDirect = r.status === "approved" && canPerform("manage_purchase_orders");

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  const primary = isApprover ? (
    <Button variant="primary" icon={Check} onClick={() => setDialog("approve")}>Approve</Button>
  ) : isRequester && editable ? (
    <Button variant="primary" icon={Send} onClick={() => setDialog("submit")}>Submit for approval</Button>
  ) : canSource ? (
    <Button variant="primary" icon={FileSearch} onClick={() => setSourcing(true)}>Create RFQ</Button>
  ) : canDirect ? (
    <Button variant="primary" icon={ShoppingCart} onClick={() => setDirectPo(true)}>Direct purchase</Button>
  ) : null;
  const secondary = isApprover ? (
    <>
      <Button icon={CornerUpLeft} onClick={() => setDialog("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => setDialog("reject")}>Reject</Button>
    </>
  ) : isRequester && editable ? (
    <ButtonLink to={`${LIST}/${r.id}/edit`} icon={Pencil}>Edit</ButtonLink>
  ) : canSource && canDirect ? (
    <Button icon={ShoppingCart} onClick={() => setDirectPo(true)}>Direct purchase</Button>
  ) : null;
  const more: MenuItem[] = [
    { label: "Delegate", icon: UserPlus, onSelect: () => setDialog("delegate"), hidden: !isApprover },
    { label: "Escalate", icon: ArrowUpRight, onSelect: () => setDialog("escalate"), hidden: !isApprover },
    { label: "Comment", icon: MessageSquare, onSelect: () => setDialog("comment"), hidden: !approval },
    { label: "Cancel requisition", icon: Ban, danger: true, onSelect: () => setDialog("cancel"), hidden: !(isRequester && ["pending_approval", "returned", "approved"].includes(r.status)) },
    { label: "Delete draft", icon: Trash2, danger: true, onSelect: () => setDialog("delete"), hidden: !(isRequester && r.status === "draft") },
  ];

  const itemColumns: Column<any>[] = [
    { key: "line", header: "#", width: "48px", cell: (it, i) => <span className="text-ims-muted">{it.line || i + 1}</span> },
    { key: "description", header: "Description", clamp: true, cell: (it) => it.description, sub: (it) => it.specification },
    { key: "quantity", header: "Quantity", numeric: true, nowrap: true, cell: (it) => `${fmtNumber(it.quantity, true)} ${it.unit || ""}`.trim() },
    { key: "unit_cost", header: "Unit cost (RWF)", numeric: true, nowrap: true, cell: (it) => <Num value={it.unit_cost} /> },
    { key: "tax", header: "Tax (%)", numeric: true, nowrap: true, cell: (it) => fmtNumber(it.tax_rate, true) },
    { key: "total", header: "Total (RWF)", numeric: true, nowrap: true, cell: (it) => <Num value={it.total} />, total: <Num value={r.total} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to requisitions", to: LIST }}
        number={r.number}
        type="Purchase requisition"
        status={DOC_STATUS[r.status]?.label || r.status}
        statusNote={stepName ? `At “${stepName}”` : DOC_STATUS[r.status]?.note}
        title={r.title || "Untitled draft"}
        facts={[
          { label: "Requested by", value: r.expand?.requester?.name || "—" },
          r.expand?.department?.name,
          r.required_date ? { label: "Needed by", value: fmtDate(r.required_date) } : null,
          <strong key="total" className="font-bold text-ims-text">{fmtMoney(r.total)}</strong>,
          r.priority ? <Priority key="priority" value={r.priority} /> : null,
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
      {r.status === "returned" && isRequester && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Returned for changes{returnNote ? `: “${returnNote}”` : ""}. Edit it and submit it again.</span>
        </p>
      )}
      {r.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {r.cancel_reason}
        </p>
      )}

      <Tabs
        label="Requisition sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "items", label: "Items", count: items.length },
          { key: "approvals", label: "Approvals" },
          { key: "documents", label: "Documents", count: r.attachments?.length || 0 },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Request" />
            <Details
              items={[
                { label: "Request type", value: typeLabel },
                { label: "Category", value: r.expand?.category?.name },
                { label: "Department", value: r.expand?.department?.name },
                { label: "Branch", value: r.expand?.branch?.name },
                { label: "Delivery location", value: r.delivery_location },
                { label: "Needed by", value: r.required_date ? fmtDate(r.required_date) : null },
                { label: "Cost centre", value: r.cost_center },
                { label: "Project", value: r.project },
                { label: "Action plan", value: r.expand?.action_plan?.title },
                { label: "Preferred supplier", value: r.preferred_supplier },
                { label: "Created", value: fmtDateTime(r.created) },
                { label: "Submitted", value: r.submitted_at ? fmtDateTime(r.submitted_at) : null },
                { label: "Justification", value: r.justification ? <span className="whitespace-pre-line">{r.justification}</span> : null, wide: true },
                ...(r.notes ? [{ label: "Notes for procurement", value: <span className="whitespace-pre-line">{r.notes}</span>, wide: true }] : []),
              ]}
            />
          </Card>
          <div className="space-y-4">
            {r.status !== "cancelled" && (
              <BudgetPanel
                documentType="purchase_requisition" documentId={r.id} number={r.number} lineId={r.budget_line} department={r.department}
                amount={["draft", "returned", "pending_approval"].includes(r.status) ? Math.round(r.total || 0) : 0} overrideId={r.budget_override}
                allowOverride={["draft", "returned"].includes(r.status)} onDone={refresh} stacked
              />
            )}
            {(sourcingRfqs.length > 0 || sourcingPos.length > 0) && (
              <Card>
                <CardHeader title="Sourcing" subtitle="Quotations and orders raised from this requisition." />
                <ul className="divide-y divide-ims-divider">
                  {sourcingRfqs.map((x: any) => (
                    <li key={x.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <TwoLine clamp={false}
                        main={<Link className="whitespace-nowrap font-mono font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/rfqs/${x.id}`}>{x.number}</Link>}
                        sub={x.expand?.awarded_quotation ? `Awarded to ${x.expand.awarded_quotation.expand?.supplier?.name} · ${money(x.expand.awarded_quotation.grand_total, x.expand.awarded_quotation.currency)}` : "Request for quotation"}
                      />
                      <StatusBadge status={x.status} map={RFQ_STATUS} hideNote />
                    </li>
                  ))}
                  {sourcingPos.map((po: any) => (
                    <li key={po.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <TwoLine clamp={false}
                        main={<Link className="whitespace-nowrap font-mono font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/purchase-orders/${po.id}`}>{po.number}</Link>}
                        sub={`${po.expand?.supplier?.name || "Supplier"} · ${money(po.grand_total, po.currency)}${po.source === "direct" ? " · direct purchase" : ""}`}
                      />
                      <StatusBadge status={po.status} map={PO_STATUS} hideNote />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "items" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Items and services" subtitle={`Subtotal ${fmtMoney(r.subtotal)} · tax ${fmtMoney(r.tax_total)} · total ${fmtMoney(r.total)}`} />
          </div>
          <DataTable
            columns={itemColumns}
            rows={items}
            rowKey={(it, i) => String(it.line ?? i)}
            minWidth={640}
            caption="Items and services"
            empty={<EmptyState compact text="No items on this requisition yet." />}
          />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={actions.data || []} />}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Quotes, specifications and other files attached by the requester." />
          {!r.attachments?.length ? (
            <EmptyState compact icon={FileText} text="No documents attached." action={isRequester && editable ? <ButtonLink to={`${LIST}/${r.id}/edit`} icon={Pencil}>Add documents</ButtonLink> : undefined} />
          ) : (
            <ul className="divide-y divide-ims-divider">
              {r.attachments.map((f: string) => (
                <li key={f} className="py-2.5 first:pt-0 last:pb-0">
                  <a className="flex min-w-0 items-center gap-2 text-t-body font-semibold text-ims-link hover:underline" href={pocketbase.files.getUrl(r, f)} target="_blank" rel="noreferrer">
                    <FileText size={16} className="shrink-0" aria-hidden /> <span className="truncate">{f}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "activity" && <Activity actions={actions.data || []} audit={history.data?.items || []} loading={history.isLoading} />}

      <PickRequisition open={sourcing} requisitionId={r.id} onClose={() => setSourcing(false)} />
      <DirectPoDialog open={directPo} requisition={r} onClose={() => setDirectPo(false)} />

      <ActionDialog
        kind={dialog}
        onClose={() => setDialog(null)}
        number={r.number}
        run={(kind, { comment, user }) => {
          if (kind === "submit") return procurementApi.submit(r.id);
          if (kind === "cancel") return procurementApi.cancel(r.id, comment);
          if (kind === "delete") return pocketbase.collection("purchase_requisitions").delete(r.id);
          return procurementApi.act(approval.id, { action: kind, comment, user });
        }}
        onDone={(kind) => {
          setDialog(null);
          if (kind === "delete") {
            queryClient.invalidateQueries(["record-table"]);
            navigate(LIST);
          } else refresh();
        }}
      />
    </Page>
  );
}
