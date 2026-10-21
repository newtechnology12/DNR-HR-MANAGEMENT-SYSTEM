/**
 * Shared approval UI for any document routed through the approval engine
 * (purchase requisitions, purchase orders, …): step tracker, activity timeline and decision dialog.
 */
import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock, Send, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Initials } from "@/components/enterprise/ui";
import { Button, Card, CardHeader, EmptyState, Field, Modal, SearchBox, StatusPill, Textarea, fmtDateTime, fmtWhen } from "@/components/ims";
import { ACTION_LABELS, errorMessage, money } from "@/lib/procurement";

export type ActionKind = "approve" | "reject" | "return" | "delegate" | "escalate" | "comment" | "cancel" | "submit" | "delete";

/**
 * Each dialog asks a question, says in one line what happens, and names the action on its button.
 * `done` is the toast that states the result.
 */
export const ACTION_UI: Record<
  ActionKind,
  {
    question: (number: string) => string;
    verb: string;
    hint: string;
    done: (number: string, who?: string) => string;
    needsComment?: boolean;
    needsUser?: boolean;
    danger?: boolean;
    commentLabel?: string;
    placeholder?: string;
  }
> = {
  approve: {
    question: (n) => `Approve ${n}?`,
    verb: "Approve",
    hint: "It moves to the next approver, or is approved if this is the last step.",
    done: (n) => `You approved ${n}`,
    commentLabel: "Comment (optional)",
    placeholder: "A note for the requester and the next approver",
  },
  reject: {
    question: (n) => `Reject ${n}?`,
    verb: "Reject",
    hint: "The request is closed and cannot be submitted again. The requester sees your reason.",
    done: (n) => `${n} rejected`,
    needsComment: true,
    danger: true,
    placeholder: "Why it cannot go ahead",
  },
  return: {
    question: (n) => `Return ${n} for changes?`,
    verb: "Return",
    hint: "The requester can edit it and submit it again.",
    done: (n) => `${n} returned to the requester`,
    needsComment: true,
    placeholder: "What needs to change",
  },
  delegate: {
    question: (n) => `Delegate your decision on ${n}?`,
    verb: "Delegate",
    hint: "The person you choose decides instead of you. You are no longer an approver.",
    done: (n, who) => `Your decision on ${n} is now with ${who || "the person you chose"}`,
    needsUser: true,
    commentLabel: "Comment (optional)",
  },
  escalate: {
    question: (n) => `Escalate ${n}?`,
    verb: "Escalate",
    hint: "A more senior approver is added. You stay an approver too.",
    done: (n, who) => `${n} escalated to ${who || "the person you chose"}`,
    needsUser: true,
    commentLabel: "Comment (optional)",
  },
  comment: {
    question: (n) => `Comment on ${n}`,
    verb: "Post comment",
    hint: "Everyone on the approval route can read it.",
    done: () => "Comment posted",
    needsComment: true,
    commentLabel: "Comment",
  },
  cancel: {
    question: (n) => `Cancel ${n}?`,
    verb: "Cancel it",
    hint: "Any running approval stops. This cannot be undone.",
    done: (n) => `${n} cancelled`,
    needsComment: true,
    danger: true,
    placeholder: "Why it is no longer needed",
  },
  submit: {
    question: (n) => `Submit ${n} for approval?`,
    verb: "Submit for approval",
    hint: "It goes to the first approver. You cannot edit it while it is in approval.",
    done: (n) => `${n} submitted for approval`,
  },
  delete: {
    question: () => "Delete this draft?",
    verb: "Delete",
    hint: "The draft is removed for good.",
    done: () => "Draft deleted",
    danger: true,
  },
};

const STEP_ICON = {
  done: { icon: CheckCircle2, cls: "text-ims-success" },
  stopped: { icon: XCircle, cls: "text-ims-danger" },
  current: { icon: Clock, cls: "text-ims-warning" },
  upcoming: { icon: Circle, cls: "text-ims-faint" },
};

export function ApprovalTracker({ approval, actions }: { approval: any; actions: any[] }) {
  if (!approval) {
    return (
      <Card>
        <EmptyState icon={Send} text="Not submitted yet. The approval route is chosen when this is submitted." />
      </Card>
    );
  }
  const runActions = actions.filter((a) => a.approval === approval.id);
  const steps: any[] = approval.steps || [];
  return (
    <Card>
      <CardHeader
        title="Approval route"
        subtitle={`${approval.workflow_name} · ${money(approval.amount, approval.currency)} · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`}
        action={approval.status !== "pending" ? <StatusPill status={approval.status} /> : undefined}
      />
      <ol className="relative space-y-5 border-l border-ims-border pl-6">
        {steps.map((s, level) => {
          const decision = [...runActions].reverse().find((a) => a.level === level && ["approve", "reject", "return"].includes(a.action));
          const current = approval.status === "pending" && approval.current_level === level;
          const state = decision?.action === "approve" ? "done" : decision ? "stopped" : current ? "current" : "upcoming";
          const { icon: Icon, cls } = STEP_ICON[state];
          return (
            <li key={level} className="relative">
              <span className={cn("absolute -left-[33px] flex h-5 w-5 items-center justify-center rounded-full bg-ims-card", cls)}>
                <Icon size={18} aria-hidden />
              </span>
              <p className="text-t-body font-semibold text-ims-text">
                Step {level + 1}: {s.name}
                {state === "current" && <span className="ml-2 text-t-small font-semibold text-ims-warning">Waiting for a decision</span>}
              </p>
              <p className="text-t-small text-ims-muted">Approver: {s.rule}</p>
              {decision && (
                <p className="mt-1 text-t-small text-ims-body">
                  <span className="font-semibold">{decision.expand?.actor?.name}</span> {ACTION_LABELS[decision.action]} · {fmtDateTime(decision.created)}
                  {decision.comment && <span className="mt-0.5 block text-ims-muted">“{decision.comment}”</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {approval.status !== "pending" && approval.completed_at && (
        <p className="mt-4 text-t-small text-ims-muted">Finished {fmtDateTime(approval.completed_at)}.</p>
      )}
    </Card>
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
    <Card>
      <CardHeader title="Activity" subtitle="Approval decisions and changes to this record. The history cannot be edited." />
      {loading && !events.length ? (
        <Skeleton className="h-32 w-full" />
      ) : !events.length ? (
        <EmptyState compact text="No activity yet." />
      ) : (
        <ol className="space-y-4">
          {events.map((e: any) => (
            <li key={`${e.kind}-${e.id}`} className="flex gap-3">
              <Initials name={e.who} />
              <div className="min-w-0 flex-1 text-t-body">
                <p className="text-ims-text">
                  <span className="font-semibold">{e.who || "System"}</span> {e.what}
                </p>
                <p className="text-t-small text-ims-muted" title={fmtDateTime(e.at)}>
                  {fmtWhen(e.at)}
                </p>
                {e.comment && <p className="mt-1 rounded-control bg-ims-thead px-3 py-2 text-ims-body">“{e.comment}”</p>}
                {e.changes && e.kind === "audit" && Object.keys(e.changes).length > 0 && Object.keys(e.changes).length <= 4 && (
                  <ul className="mt-1 space-y-0.5 text-t-small text-ims-muted">
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
    </Card>
  );
}

/** Document numbers never wrap: "Reject PR-2026-000005?" keeps the number on one line. */
function noWrapNumber(text: string, number: string) {
  const i = number ? text.indexOf(number) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="whitespace-nowrap">{number}</span>
      {text.slice(i + number.length)}
    </>
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
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    setComment("");
    setUser("");
    setUserSearch("");
    setTouched(false);
  }, [kind]);
  const ui = kind ? ACTION_UI[kind] : null;

  const users = useQuery(
    ["active-users"],
    () => pocketbase.collection("users").getFullList({ filter: `status = "Active"`, sort: "name", fields: "id,name,email" }),
    { enabled: Boolean(ui?.needsUser), staleTime: 60_000 }
  );
  const chosen = (users.data || []).find((u: any) => u.id === user) as any;

  const run = useMutation(
    async () => {
      if (!kind) return;
      return runAction(kind, { comment: comment.trim(), user });
    },
    {
      onSuccess: () => {
        toast.success(ui!.done(number, chosen?.name));
        onDone(kind!);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );

  const filtered = (users.data || []).filter((u: any) => `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())).slice(0, 50);
  const missingComment = Boolean(ui?.needsComment) && !comment.trim();
  const missingUser = Boolean(ui?.needsUser) && !user;
  const go = () => {
    setTouched(true);
    if (missingComment || missingUser) return;
    run.mutate();
  };
  const showComment = kind && !["submit", "delete"].includes(kind);

  return (
    <Modal
      open={Boolean(kind)}
      onClose={run.isLoading ? () => undefined : onClose}
      size="sm"
      title={ui ? noWrapNumber(ui.question(number), number) : ""}
      description={ui?.hint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isLoading}>
            {kind === "cancel" ? "Keep it" : "Cancel"}
          </Button>
          <Button variant={ui?.danger ? "danger" : "primary"} onClick={go} loading={run.isLoading}>
            {ui?.verb}
          </Button>
        </>
      }
    >
      {ui?.needsUser && (
        <Field label="Person" required htmlFor="action-person-search" error={touched && missingUser ? "Choose the person from the list." : null}>
          <div className="space-y-2">
            <SearchBox value={userSearch} onChange={setUserSearch} placeholder="Search name or email" className="sm:w-full" />
            <ul id="action-person-search" role="listbox" aria-label="People" className="max-h-48 divide-y divide-ims-divider overflow-y-auto rounded-control border border-ims-border">
              {users.isLoading && <li className="px-3 py-2.5 text-t-small text-ims-muted">Loading people…</li>}
              {filtered.map((u: any) => (
                <li key={u.id} role="option" aria-selected={user === u.id}>
                  <button
                    type="button"
                    onClick={() => setUser(u.id)}
                    className={cn("flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-t-body hover:bg-ims-hover", user === u.id && "bg-ims-info-bg")}
                  >
                    <span className="shrink-0 font-semibold text-ims-text">{u.name}</span>
                    <span className="min-w-0 truncate text-t-small text-ims-muted">{u.email}</span>
                  </button>
                </li>
              ))}
              {!users.isLoading && !filtered.length && <li className="px-3 py-2.5 text-t-small text-ims-muted">No one matches “{userSearch}”.</li>}
            </ul>
          </div>
        </Field>
      )}
      {showComment && (
        <Field
          label={ui?.commentLabel || "Reason"}
          required={ui?.needsComment}
          htmlFor="action-comment"
          error={touched && missingComment ? (kind === "comment" ? "Write the comment first." : "Write the reason so the requester knows what to do next.") : null}
        >
          <Textarea id="action-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={ui?.placeholder} invalid={touched && missingComment} />
        </Field>
      )}
    </Modal>
  );
}
