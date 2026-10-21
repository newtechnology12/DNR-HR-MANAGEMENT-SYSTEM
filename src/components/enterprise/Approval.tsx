/**
 * Shared approval UI for any document routed through the approval engine
 * (purchase requisitions, purchase orders, …): step tracker, activity timeline and decision dialog.
 */
import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock, Send, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { Badge, EmptyState, Initials, Panel } from "@/components/enterprise/ui";
import { ACTION_LABELS, errorMessage, money } from "@/lib/procurement";

export type ActionKind = "approve" | "reject" | "return" | "delegate" | "escalate" | "comment" | "cancel" | "submit" | "delete";

export const ACTION_UI: Record<ActionKind, { title: string; verb: string; needsComment?: boolean; needsUser?: boolean; variant?: any; hint?: string }> = {
  approve: { title: "Approve", verb: "Approve", hint: "Optional comment for the requester and the next approver." },
  reject: { title: "Reject request", verb: "Reject", needsComment: true, variant: "danger", hint: "The request will be closed. Explain why." },
  return: { title: "Send back for changes", verb: "Send back", needsComment: true, hint: "The requester can edit and resubmit. Say what needs to change." },
  delegate: { title: "Delegate approval", verb: "Delegate", needsUser: true, hint: "Hand your decision to someone else. You will no longer be an approver." },
  escalate: { title: "Escalate", verb: "Escalate", needsUser: true, hint: "Add a more senior approver. You remain an approver too." },
  comment: { title: "Add a comment", verb: "Post comment", needsComment: true },
  cancel: { title: "Cancel requisition", verb: "Cancel requisition", needsComment: true, variant: "danger", hint: "Cancelling stops any running approval. This cannot be undone." },
  submit: { title: "Submit for approval", verb: "Submit" },
  delete: { title: "Delete draft", verb: "Delete", variant: "danger", hint: "The draft will be permanently removed." },
};

export function ApprovalTracker({ approval, actions }: { approval: any; actions: any[] }) {
  if (!approval) {
    return (
      <Panel>
        <EmptyState icon={Send} title="Not submitted yet" text="The approval route is chosen when this document is submitted." />
      </Panel>
    );
  }
  const runActions = actions.filter((a) => a.approval === approval.id);
  const steps: any[] = approval.steps || [];
  return (
    <Panel title={`Workflow: ${approval.workflow_name}`} subtitle={`${money(approval.amount, approval.currency)} · ${steps.length} step(s)`}>
      <ol className="relative space-y-5 border-l border-slate-200 pl-6">
        {steps.map((s, level) => {
          const decision = [...runActions].reverse().find((a) => a.level === level && ["approve", "reject", "return"].includes(a.action));
          const current = approval.status === "pending" && approval.current_level === level;
          const state = decision?.action === "approve" ? "done" : decision ? "stopped" : current ? "current" : "upcoming";
          const Icon = state === "done" ? CheckCircle2 : state === "stopped" ? XCircle : state === "current" ? Clock : Circle;
          return (
            <li key={level} className="relative">
              <span
                className={cn(
                  "absolute -left-[33px] flex h-5 w-5 items-center justify-center rounded-full bg-white",
                  state === "done" ? "text-emerald-600" : state === "stopped" ? "text-red-600" : state === "current" ? "text-amber-600" : "text-slate-300"
                )}
              >
                <Icon size={18} />
              </span>
              <p className="text-[13px] font-semibold text-slate-800">
                Step {level + 1}: {s.name}{" "}
                {state === "current" && <Badge tone="warning" className="ml-1">Waiting</Badge>}
              </p>
              <p className="text-[12px] text-slate-500">Approver: {s.rule}</p>
              {decision && (
                <p className="mt-1 text-[12.5px] text-slate-700">
                  <span className="font-medium">{decision.expand?.actor?.name}</span> {ACTION_LABELS[decision.action]} ·{" "}
                  {format(new Date(decision.created), "d MMM yyyy, HH:mm")}
                  {decision.comment && <span className="block text-slate-500">“{decision.comment}”</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {approval.status !== "pending" && (
        <p className="mt-4 text-[12.5px] text-slate-500">
          Approval {approval.status}
          {approval.completed_at ? ` on ${format(new Date(approval.completed_at), "d MMM yyyy, HH:mm")}` : ""}.
        </p>
      )}
    </Panel>
  );
}

export function Activity({ actions, audit, loading }: { actions: any[]; audit: any[]; loading: boolean }) {
  const events = [
    ...actions.map((a) => ({
      id: a.id,
      at: a.created,
      who: a.expand?.actor?.name,
      what: `${ACTION_LABELS[a.action] || a.action}${a.step_name && !["submit", "cancel"].includes(a.action) ? ` at “${a.step_name}”` : ""}${
        a.expand?.target_user ? ` → ${a.expand.target_user.name}` : ""
      }`,
      comment: a.comment,
      kind: "workflow",
    })),
    ...audit
      .filter((e) => ["created", "updated", "deleted"].includes(e.action))
      .map((e) => ({
        id: e.id,
        at: e.created,
        who: e.actor_name,
        what: e.action === "updated" ? `edited ${Object.keys(e.changes).map((k) => k.replace(/_/g, " ")).join(", ")}` : e.action,
        comment: e.comment,
        kind: "audit",
        changes: e.changes,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Panel title="Activity timeline" subtitle="Workflow decisions and record changes. The audit trail cannot be edited.">
      {loading && !events.length ? (
        <Skeleton className="h-32 w-full" />
      ) : !events.length ? (
        <p className="text-[13px] text-slate-500">No activity yet.</p>
      ) : (
        <ol className="space-y-4">
          {events.map((e: any) => (
            <li key={`${e.kind}-${e.id}`} className="flex gap-3">
              <Initials name={e.who} />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="text-slate-800">
                  <span className="font-medium">{e.who || "System"}</span> {e.what}
                </p>
                <p className="text-[12px] text-slate-500" title={format(new Date(e.at), "d MMM yyyy, HH:mm:ss")}>
                  {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                </p>
                {e.comment && <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-slate-700">“{e.comment}”</p>}
                {e.changes && e.kind === "audit" && Object.keys(e.changes).length > 0 && Object.keys(e.changes).length <= 4 && (
                  <ul className="mt-1 space-y-0.5 text-[12px] text-slate-500">
                    {Object.entries(e.changes)
                      .filter(([k]) => !["items", "attachments"].includes(k))
                      .map(([k, v]: any) => (
                        <li key={k}>
                          {k.replace(/_/g, " ")}: <span className="line-through">{String(v.old ?? "—") || "—"}</span> → {String(v.new ?? "—") || "—"}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function ActionDialog({
  kind,
  onClose,
  number,
  run: runAction,
  onDone,
}: {
  kind: ActionKind | null;
  onClose: () => void;
  /** Document number shown in the dialog title, e.g. PR-2026-000001. */
  number: string;
  /** Performs the action; throw to show the server's error message. */
  run: (kind: ActionKind, input: { comment: string; user: string }) => Promise<unknown>;
  onDone: (kind: ActionKind) => void;
}) {
  const [comment, setComment] = React.useState("");
  const [user, setUser] = React.useState("");
  const [userSearch, setUserSearch] = React.useState("");
  React.useEffect(() => {
    setComment("");
    setUser("");
    setUserSearch("");
  }, [kind]);
  const ui = kind ? ACTION_UI[kind] : null;

  const users = useQuery(
    ["active-users"],
    () => pocketbase.collection("users").getFullList({ filter: `status = "Active"`, sort: "name", fields: "id,name,email" }),
    { enabled: Boolean(ui?.needsUser), staleTime: 60_000 }
  );

  const run = useMutation(
    async () => {
      if (!kind) return;
      return runAction(kind, { comment, user });
    },
    {
      onSuccess: () => {
        toast.success(
          kind === "submit" ? `${number} submitted for approval` : kind === "delete" ? "Draft deleted" : `${number}: ${ui?.verb.toLowerCase()} done`
        );
        onDone(kind!);
      },
      onError: (e) => {
      toast.error(errorMessage(e));
    },
    }
  );

  const filtered = (users.data || []).filter((u: any) => `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())).slice(0, 50);
  const disabled = run.isLoading || (ui?.needsComment && !comment.trim()) || (ui?.needsUser && !user);

  return (
    <Dialog open={Boolean(kind)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>{ui?.title} · {number}</DialogTitle>
          {ui?.hint && <DialogDescription>{ui.hint}</DialogDescription>}
        </DialogHeader>
        {ui?.needsUser && (
          <div className="space-y-2">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search people…"
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-[13px] outline-none focus:border-primary"
            />
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {filtered.map((u: any) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setUser(u.id)}
                    className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-slate-50", user === u.id && "bg-primary/10")}
                  >
                    <span>{u.name}</span>
                    <span className="truncate pl-2 text-[12px] text-slate-500">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {kind && !["submit", "delete"].includes(kind) && (
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-slate-700">
              {ui?.needsComment ? "Reason" : "Comment"}
              {ui?.needsComment && <span className="text-red-600"> *</span>}
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={run.isLoading}>Close</Button>
          <Button variant={ui?.variant} onClick={() => run.mutate()} disabled={disabled}>
            {run.isLoading ? "Working…" : ui?.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
