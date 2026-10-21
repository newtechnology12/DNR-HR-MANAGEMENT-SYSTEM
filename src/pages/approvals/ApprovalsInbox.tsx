/**
 * My approvals — one inbox for every document routed through the approval engine (requisitions,
 * purchase orders, invoices, suppliers, contracts, plans, returns, payroll…). Mobile-first: an
 * approver can open, approve, return or reject from a phone. Overdue items are highlighted.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, ExternalLink, History, Inbox, Send, Split, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { DOCUMENT_LINKS, DOCUMENT_TYPE_LABELS, rwf } from "@/lib/ims";
import { procurementApi } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind } from "@/components/enterprise/Approval";
import { cn } from "@/utils";

type Tab = "waiting" | "mine" | "decided";
const OVERDUE_HOURS = 48;
const toDate = (v: string) => new Date(String(v || "").replace(" ", "T"));

export default function ApprovalsInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Tab>("waiting");
  const [type, setType] = React.useState("all");
  const [acting, setActing] = React.useState<{ kind: ActionKind; approval: any } | null>(null);
  const uid = user?.id;

  const filters: Record<Tab, string> = {
    waiting: `status = "pending" && pending_approvers ~ "${uid}"`,
    mine: `requester = "${uid}"`,
    decided: `decided_by ~ "${uid}"`,
  };
  const q = useQuery(["approvals-inbox", tab, uid], () => pocketbase.collection("approval_requests").getList(1, 100, { filter: filters[tab], sort: tab === "waiting" ? "level_started_at" : "-updated", expand: "requester,department" }), { enabled: Boolean(uid) });
  const counts = useQuery(["approvals-inbox-count", uid], () => pocketbase.collection("approval_requests").getList(1, 1, { filter: filters.waiting, fields: "id" }), { enabled: Boolean(uid) });
  // Delegations to me, to show "on behalf of".
  const delegations = useQuery(["my-delegations-in", uid], () => pocketbase.collection("delegations").getFullList({ filter: `delegate = "${uid}" && active = true`, expand: "delegator" }), { enabled: Boolean(uid) });

  const items = (q.data?.items || []).filter((a: any) => type === "all" || a.document_type === type);
  const types = Array.from(new Set((q.data?.items || []).map((a: any) => a.document_type)));
  const onBehalf = (a: any) => {
    const pending = String(a.pending_approvers || "").split(",");
    const d = (delegations.data || []).find((x: any) => pending.includes(x.delegator));
    return d?.expand?.delegator?.name;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3 sm:px-4">
      <PageHeader
        title="My approvals"
        description="Everything waiting for your decision, across all modules. Rejecting or returning needs a reason."
        breadcrumbs={[{ title: "My approvals", link: "/dashboard/approvals" }]}
        actions={<Button variant="outline" onClick={() => navigate("/dashboard/admin/delegations")}><Split size={14} /> Delegations</Button>}
      />
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {([["waiting", "Waiting for me", Inbox], ["mine", "My submissions", Send], ["decided", "I decided", History]] as [Tab, string, any][]).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium", tab === k ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}>
            <Icon size={14} /> {label}
            {k === "waiting" && (counts.data?.totalItems || 0) > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{counts.data?.totalItems}</span>}
          </button>
        ))}
      </div>
      {types.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {["all", ...types].map((t: any) => (
            <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={cn("h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium", type === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600")}>
              {t === "all" ? "All types" : DOCUMENT_TYPE_LABELS[t] || t}
            </button>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4"><ListSkeleton rows={5} /></div>
      ) : !items.length ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <EmptyState icon={tab === "waiting" ? CheckCircle2 : Inbox} title={tab === "waiting" ? "You're all caught up" : "Nothing here"} text={tab === "waiting" ? "No document is waiting for your decision." : "Documents will appear here."} />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((a: any) => {
            const steps = a.steps || [];
            const step = steps[a.current_level];
            const started = toDate(a.level_started_at || a.created);
            const hours = (Date.now() - started.getTime()) / 36e5;
            const overdue = a.status === "pending" && hours > OVERDUE_HOURS;
            const behalf = tab === "waiting" ? onBehalf(a) : undefined;
            const link = DOCUMENT_LINKS[a.document_type]?.(a.document_id);
            return (
              <li key={a.id} className={cn("rounded-xl border bg-white p-4 shadow-card", overdue ? "border-amber-300" : "border-slate-200")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="info">{DOCUMENT_TYPE_LABELS[a.document_type] || a.document_type}</Badge>
                      <span className="font-mono text-[12px] font-semibold text-slate-700">{a.document_number}</span>
                      {a.status !== "pending" && <Badge tone={a.status === "approved" ? "success" : a.status === "rejected" ? "danger" : "neutral"}>{a.status}</Badge>}
                      {overdue && <Badge tone="warning"><Clock size={11} className="mr-1" /> Overdue</Badge>}
                      {behalf && <Badge tone="violet">On behalf of {behalf}</Badge>}
                    </div>
                    <p className="mt-1.5 truncate text-[14.5px] font-semibold text-slate-900">{a.document_title}</p>
                    <p className="mt-0.5 text-[12.5px] text-slate-500">
                      {a.expand?.requester?.name}{a.expand?.department ? ` · ${a.expand.department.name}` : ""} · {a.status === "pending" && step ? `Step ${a.current_level + 1} of ${steps.length}: ${step.name}` : a.workflow_name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-400">{a.status === "pending" ? `Waiting ${formatDistanceToNow(started)}` : `Updated ${formatDistanceToNow(toDate(a.updated), { addSuffix: true })}`}</p>
                  </div>
                  <p className="shrink-0 text-[18px] font-semibold tabular-nums text-slate-900 sm:text-right">{rwf(a.amount)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {link && <Button size="sm" variant="outline" onClick={() => navigate(link)}><ExternalLink size={13} /> Open</Button>}
                  {tab === "waiting" && (
                    <>
                      <Button size="sm" className="ml-auto" onClick={() => setActing({ kind: "approve", approval: a })}><CheckCircle2 size={13} /> Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setActing({ kind: "return", approval: a })}><Undo2 size={13} /> Return</Button>
                      <Button size="sm" variant="outline" className="text-red-700 hover:text-red-800" onClick={() => setActing({ kind: "reject", approval: a })}><XCircle size={13} /> Reject</Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ActionDialog
        kind={acting?.kind || null}
        number={acting?.approval?.document_number || ""}
        onClose={() => setActing(null)}
        run={(kind, input) => procurementApi.act(acting!.approval.id, { action: kind, comment: input.comment, user: input.user })}
        onDone={() => {
          setActing(null);
          queryClient.invalidateQueries(["approvals-inbox"]);
          queryClient.invalidateQueries(["approvals-inbox-count"]);
        }}
      />
    </div>
  );
}
