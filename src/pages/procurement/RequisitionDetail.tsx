import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowUpRight,
  Ban,
  Check,
  Clock,
  CornerUpLeft,
  FileSearch,
  FileText,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { PickRequisition } from "./Rfqs";
import { DirectPoDialog } from "./PurchaseOrders";
import { ActionDialog, ActionKind, Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Badge, EmptyState, KeyValues, PageHeader, Panel, StatusBadge } from "@/components/enterprise/ui";
import { DOC_STATUS, PO_STATUS, PRIORITY, REQUEST_TYPES, RFQ_STATUS, money, procurementApi } from "@/lib/procurement";
import { BudgetPanel } from "@/components/budget/BudgetKit";

export default function RequisitionDetail() {
  const { requisitionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState<"overview" | "approval" | "activity">("overview");
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
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (doc.isError || !r) {
    return (
      <div className="px-4 py-4 sm:px-6">
        <Panel>
          <EmptyState
            icon={FileText}
            title="Requisition not available"
            text="It may have been deleted, or it is outside what your role can see."
            action={<Button variant="outline" onClick={() => navigate("/dashboard/procurement/requisitions")}>Back to requisitions</Button>}
          />
        </Panel>
      </div>
    );
  }

  const isRequester = r.requester === me?.id;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const editable = ["draft", "returned"].includes(r.status);
  const typeLabel = REQUEST_TYPES.find((t) => t.value === r.request_type)?.label;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        breadcrumbs={[
          { title: "Procurement", link: "/dashboard/procurement" },
          { title: "Requisitions", link: "/dashboard/procurement/requisitions" },
          { title: r.number, link: "#" },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {r.number}
            <StatusBadge status={r.status} map={DOC_STATUS} />
            {r.priority && <Badge tone={PRIORITY[r.priority]?.tone}>{PRIORITY[r.priority]?.label} priority</Badge>}
          </span>
        }
        description={r.title}
        actions={
          <>
            {isApprover && (
              <>
                <Button size="sm" onClick={() => setDialog("approve")}><Check size={14} /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setDialog("return")}><CornerUpLeft size={14} /> Send back</Button>
                <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDialog("reject")}><XCircle size={14} /> Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog("delegate")}><UserPlus size={14} /> Delegate</Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog("escalate")}><ArrowUpRight size={14} /> Escalate</Button>
              </>
            )}
            {isRequester && editable && (
              <>
                <Button size="sm" onClick={() => setDialog("submit")}><Send size={14} /> Submit</Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/procurement/requisitions/${r.id}/edit`)}><Pencil size={14} /> Edit</Button>
              </>
            )}
            {isRequester && r.status === "draft" && (
              <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDialog("delete")}><Trash2 size={14} /> Delete</Button>
            )}
            {isRequester && ["pending_approval", "returned", "approved"].includes(r.status) && (
              <Button size="sm" variant="ghost" onClick={() => setDialog("cancel")}><Ban size={14} /> Cancel</Button>
            )}
            {r.status === "approved" && canPerform("manage_rfqs") && (
              <Button size="sm" onClick={() => setSourcing(true)}><FileSearch size={14} /> Create RFQ</Button>
            )}
            {r.status === "approved" && canPerform("manage_purchase_orders") && (
              <Button size="sm" variant="outline" onClick={() => setDirectPo(true)}>Direct purchase</Button>
            )}
            {approval && <Button size="sm" variant="ghost" onClick={() => setDialog("comment")}><MessageSquare size={14} /> Comment</Button>}
          </>
        }
      />

      {isApprover && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <Clock size={15} /> This requisition is waiting for your decision at step “{approval.steps?.[approval.current_level]?.name}”.
        </div>
      )}
      {r.status === "returned" && isRequester && (
        <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 text-[13px] text-violet-900">
          <CornerUpLeft size={15} /> Sent back for changes: “{[...(actions.data || [])].reverse().find((a: any) => a.action === "return")?.comment}”. Edit and submit again.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Estimated total", money(r.total, r.currency)],
          ["Requester", r.expand?.requester?.name],
          ["Department", r.expand?.department?.name],
          ["Required by", r.required_date ? format(new Date(r.required_date), "d MMM yyyy") : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
            <p className="mt-1 truncate text-[15px] font-semibold tabular-nums text-slate-900">{v || "—"}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {(["overview", "approval", "activity"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium capitalize",
              tab === t ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t === "approval" ? "Approval" : t === "activity" ? "Activity & audit" : "Overview"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Panel title="Items and services" bodyClassName="px-0">
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[600px] text-[13px]">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Unit cost</th>
                      <th className="px-4 py-2 text-right">Tax</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(r.items || []).map((it: any) => (
                      <tr key={it.line}>
                        <td className="px-4 py-2.5 text-slate-500">{it.line}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-slate-800">{it.description}</p>
                          {it.specification && <p className="text-[12px] text-slate-500">{it.specification}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{it.quantity} {it.unit}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{Math.round(it.unit_cost).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{it.tax_rate}%</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{Math.round(it.total).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="text-[13px]">
                    <tr className="border-t border-slate-200"><td colSpan={5} className="px-4 pt-2.5 text-right text-slate-500">Subtotal</td><td className="px-4 pt-2.5 text-right tabular-nums">{money(r.subtotal, r.currency)}</td></tr>
                    <tr><td colSpan={5} className="px-4 text-right text-slate-500">Tax</td><td className="px-4 text-right tabular-nums">{money(r.tax_total, r.currency)}</td></tr>
                    <tr><td colSpan={5} className="px-4 pb-3 text-right font-semibold">Total</td><td className="px-4 pb-3 text-right font-semibold tabular-nums">{money(r.total, r.currency)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </Panel>
            <Panel title="Justification">
              <p className="whitespace-pre-line text-[13px] text-slate-700">{r.justification || "—"}</p>
              {r.notes && (
                <>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notes for procurement</p>
                  <p className="mt-1 whitespace-pre-line text-[13px] text-slate-700">{r.notes}</p>
                </>
              )}
              {r.cancel_reason && (
                <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[13px] text-slate-700">Cancelled: {r.cancel_reason}</p>
              )}
            </Panel>
          </div>
          <div className="space-y-4">
            {r.status !== "cancelled" && (
              <BudgetPanel
                documentType="purchase_requisition" documentId={r.id} number={r.number} lineId={r.budget_line} department={r.department}
                amount={["draft", "returned", "pending_approval"].includes(r.status) ? Math.round(r.total || 0) : 0} overrideId={r.budget_override}
                allowOverride={["draft", "returned"].includes(r.status)} onDone={refresh} stacked
              />
            )}
            <Panel title="Details">
              <KeyValues
                columns={1}
                items={[
                  { label: "Request type", value: typeLabel },
                  { label: "Category", value: r.expand?.category?.name },
                  { label: "Branch", value: r.expand?.branch?.name },
                  { label: "Delivery location", value: r.delivery_location },
                  { label: "Cost center", value: r.cost_center },
                  { label: "Project", value: r.project },
                  { label: "Action plan", value: r.expand?.action_plan?.title },
                  { label: "Preferred supplier", value: r.preferred_supplier },
                  { label: "Created", value: format(new Date(r.created), "d MMM yyyy, HH:mm") },
                  { label: "Submitted", value: r.submitted_at ? format(new Date(r.submitted_at), "d MMM yyyy, HH:mm") : null },
                ]}
              />
            </Panel>
            {!!(rfqs.data?.length || (rfqs.data as any)?.pos?.length) && (
              <Panel title="Sourcing">
                <ul className="space-y-2">
                  {rfqs.data.map((x: any) => (
                    <li key={x.id} className="text-[13px]">
                      <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/procurement/rfqs/${x.id}`}>{x.number}</Link>{" "}
                      <StatusBadge status={x.status} map={RFQ_STATUS} />
                      {x.expand?.awarded_quotation && (
                        <p className="text-[12px] text-slate-600">
                          Awarded to {x.expand.awarded_quotation.expand?.supplier?.name} · {money(x.expand.awarded_quotation.grand_total, x.expand.awarded_quotation.currency)}
                        </p>
                      )}
                    </li>
                  ))}
                  {((rfqs.data as any)?.pos || []).map((po: any) => (
                    <li key={po.id} className="text-[13px]">
                      <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/procurement/purchase-orders/${po.id}`}>{po.number}</Link>{" "}
                      <StatusBadge status={po.status} map={PO_STATUS} />
                      <p className="text-[12px] text-slate-600">{po.expand?.supplier?.name} · {money(po.grand_total, po.currency)}{po.source === "direct" ? " · direct purchase" : ""}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            <Panel title="Documents">
              {!r.attachments?.length ? (
                <p className="text-[13px] text-slate-500">No attachments.</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.attachments.map((f: string) => (
                    <li key={f}>
                      <a className="flex items-center gap-2 truncate text-[13px] text-primaryDark hover:underline" href={pocketbase.files.getUrl(r, f)} target="_blank" rel="noreferrer">
                        <FileText size={14} className="shrink-0" /> {f}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "approval" && <ApprovalTracker approval={approval} actions={actions.data || []} />}

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
            navigate("/dashboard/procurement/requisitions");
          } else refresh();
        }}
      />
    </div>
  );
}
