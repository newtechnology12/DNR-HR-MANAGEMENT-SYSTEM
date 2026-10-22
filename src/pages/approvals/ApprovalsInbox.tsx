/**
 * My approvals — one inbox for every document routed through the approval engine (requisitions,
 * purchase orders, invoices, suppliers, contracts, plans, returns, payroll…). An approver can open,
 * approve, return or reject from the row menu, also on a phone. Overdue items are highlighted.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { CheckCircle2, ExternalLink, Inbox, Split, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { DOCUMENT_LINKS, DOCUMENT_TYPE_LABELS } from "@/lib/ims";
import { procurementApi } from "@/lib/procurement";
import { ActionDialog, ActionKind } from "@/components/enterprise/Approval";
import { WithPeople } from "@/components/enterprise/WithCell";
import {
  Card,
  Column,
  DataTable,
  DocNo,
  EmptyState,
  FilterBar,
  FilterSelect,
  Num,
  Page,
  PageHeader,
  Person,
  StatusPill,
  Tabs,
  fmtWhen,
} from "@/components/ims";

type Tab = "waiting" | "mine" | "decided";
const OVERDUE_HOURS = 48;
const toDate = (v: string) => new Date(String(v || "").replace(" ", "T"));

export default function ApprovalsInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Tab>("waiting");
  const [type, setType] = React.useState("all");
  const [search, setSearch] = React.useState("");
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

  const term = search.trim().toLowerCase();
  const items = (q.data?.items || []).filter(
    (a: any) =>
      (type === "all" || a.document_type === type) &&
      (!term || `${a.document_number} ${a.document_title} ${a.expand?.requester?.name || ""}`.toLowerCase().includes(term))
  );
  const types = Array.from(new Set((q.data?.items || []).map((a: any) => a.document_type))) as string[];
  const onBehalf = (a: any) => {
    const pending = String(a.pending_approvers || "").split(",");
    const d = (delegations.data || []).find((x: any) => pending.includes(x.delegator));
    return d?.expand?.delegator?.name;
  };
  const changeTab = (t: Tab) => {
    setTab(t);
    setType("all");
  };

  /** Hours the document has been waiting at its current step. */
  const waited = (a: any) => (Date.now() - toDate(a.level_started_at || a.created).getTime()) / 36e5;
  const overdueText = (a: any) => {
    if (a.status !== "pending") return null;
    const late = waited(a) - OVERDUE_HOURS;
    if (late <= 0) return null;
    const d = Math.max(1, Math.ceil(late / 24));
    return `Overdue · ${d} day${d === 1 ? "" : "s"}`;
  };
  const linkOf = (a: any) => DOCUMENT_LINKS[a.document_type]?.(a.document_id);
  const total = items.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);

  const columns: Column<any>[] = [
    { key: "number", header: "Document", nowrap: true, cell: (a) => <DocNo value={a.document_number} />, sub: (a) => DOCUMENT_TYPE_LABELS[a.document_type] || a.document_type },
    {
      key: "title",
      header: "Title",
      clamp: true,
      cell: (a) => <span className="font-semibold">{a.document_title || "—"}</span>,
      sub: (a) => [a.expand?.requester?.name, a.expand?.department?.name].filter(Boolean).join(" · "),
    },
    { key: "amount", header: "Amount (RWF)", numeric: true, cell: (a) => <Num value={a.amount} />, total: <Num value={total} /> },
    {
      key: "step",
      header: "Step",
      clamp: true,
      width: "200px",
      cell: (a) => {
        const steps = a.steps || [];
        return a.status === "pending" && steps[a.current_level] ? `Step ${a.current_level + 1} of ${steps.length}` : a.workflow_name || "—";
      },
      sub: (a) => (a.status === "pending" ? (a.steps || [])[a.current_level]?.name : null),
    },
    {
      key: "with",
      header: "With",
      className: "max-w-[200px]",
      cell: (a) => {
        if (tab === "waiting") {
          const behalf = onBehalf(a);
          return <Person name="You" detail={behalf ? `On behalf of ${behalf}` : "Your decision"} />;
        }
        if (a.status === "pending") return <WithPeople ids={a.pending_approvers} />;
        if (a.status === "returned") return <Person name={a.expand?.requester?.name} detail="Requester" />;
        return <span className="text-ims-faint">—</span>;
      },
    },
    { key: "status", header: "Status", cell: (a) => <StatusPill status={a.status} sub={overdueText(a) ? <span className="font-semibold text-ims-danger">{overdueText(a)}</span> : undefined} /> },
    {
      key: "since",
      header: tab === "waiting" ? "Waiting since" : "Updated",
      nowrap: true,
      cell: (a) => fmtWhen(tab === "waiting" || a.status === "pending" ? a.level_started_at || a.created : a.updated),
    },
  ];

  const tabs = [
    { key: "waiting", label: "Waiting for me", count: counts.data?.totalItems },
    { key: "mine", label: "My submissions" },
    { key: "decided", label: "I decided" },
  ];
  const filtered = Boolean(term || type !== "all");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "My approvals" }]}
        title="My approvals"
        subtitle="Everything waiting for your decision, across all modules. Rejecting or returning needs a reason."
        secondary={[{ label: "Delegations", icon: Split, to: "/dashboard/admin/delegations" }]}
      />
      <Card padded={false} className="overflow-hidden">
        <Tabs inset label="Approvals" tabs={tabs} active={tab} onChange={(k) => changeTab(k as Tab)} />
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search number, title or requester" }}
          chips={type !== "all" ? [{ key: "type", label: `Type: ${DOCUMENT_TYPE_LABELS[type] || type}`, onRemove: () => setType("all") }] : []}
          onClear={() => setType("all")}
        >
          {types.length > 1 && (
            <FilterSelect label="Type" value={type === "all" ? "" : type} onChange={(v) => setType(v || "all")} options={types.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] || t }))} className="[&_select]:w-[220px]" />
          )}
        </FilterBar>
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(a) => a.id}
          loading={q.isLoading || !uid}
          fetching={q.isFetching}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={980}
          caption="My approvals"
          rowClassName={(a) => Boolean(overdueText(a)) && "bg-ims-warning-bg/40"}
          onRowClick={(a) => {
            const link = linkOf(a);
            if (link) navigate(link);
          }}
          rowActions={(a) => {
            const link = linkOf(a);
            return [
              ...(link ? [{ label: "Open", icon: ExternalLink, onSelect: () => navigate(link) }] : []),
              ...(tab === "waiting"
                ? [
                    { label: "Approve", icon: CheckCircle2, onSelect: () => setActing({ kind: "approve", approval: a }) },
                    { label: "Return", icon: Undo2, onSelect: () => setActing({ kind: "return", approval: a }) },
                    { label: "Reject", icon: XCircle, danger: true, onSelect: () => setActing({ kind: "reject", approval: a }) },
                  ]
                : []),
            ];
          }}
          empty={
            <EmptyState
              icon={tab === "waiting" && !filtered ? CheckCircle2 : Inbox}
              text={filtered ? "Nothing matches. Change the search or the type." : tab === "waiting" ? "No document is waiting for your decision." : tab === "mine" ? "You have not submitted a document for approval yet." : "You have not decided on a document yet."}
            />
          }
        />
      </Card>

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
    </Page>
  );
}
