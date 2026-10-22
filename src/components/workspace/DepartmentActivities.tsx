/**
 * A department plan's activities with what is achieved and what remains: target, achieved (the sum of the
 * staff results that count), progress, remaining and how many people contribute. Used in the plan editor
 * (with "Contribute"), on the Department plan tab and on the department plan page.
 */
import * as React from "react";
import { Check, Plus, Target } from "lucide-react";
import { DepartmentActivity, DepartmentView, qty } from "@/lib/plans";
import { cn } from "@/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, Card, CardHeader, Column, DataTable, EmptyState, fmtDate } from "@/components/ims";

export function remainingTone(progress: number) {
  return progress >= 100 ? "text-ims-success" : 100 - progress >= 50 ? "text-ims-danger" : "text-ims-warning";
}

export function teamText(team: number, you: boolean) {
  if (!team) return you ? "You" : "—";
  return `${team} ${team === 1 ? "person" : "people"}${you ? " + you" : ""}`;
}

/** Thin progress bar with the percentage on its right. */
function ProgressCell({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="flex items-center gap-2.5">
      <span className="block h-[7px] w-[72px] overflow-hidden rounded-full bg-ims-neutral-bg" aria-hidden>
        <span className={cn("block h-full rounded-full", v >= 100 ? "bg-ims-success" : "bg-ims-link")} style={{ width: `${v}%` }} />
      </span>
      <b className="w-10 text-right tabular-nums">{v}%</b>
    </span>
  );
}

export function DepartmentActivitiesTable({ activities, linked, onContribute, contributeLabel = "Contribute" }: {
  activities: DepartmentActivity[];
  linked?: Set<string>;
  onContribute?: (a: DepartmentActivity) => void;
  contributeLabel?: string;
}) {
  const columns: Column<DepartmentActivity>[] = [
    {
      key: "title",
      header: "Department activity",
      className: "min-w-[220px]",
      cell: (a) => <span className="font-semibold">{a.title}</span>,
      sub: (a) => {
        const you = Boolean(a.mine || linked?.has(a.id));
        return `${a.code}${a.due ? ` · due ${fmtDate(a.due)}` : ""}${a.team || you ? ` · team: ${teamText(a.team, you)}` : ""}`;
      },
    },
    {
      key: "achieved",
      header: "Achieved",
      numeric: true,
      cell: (a) => <b>{a.target_value !== null ? qty(a.achieved, a.unit) : "—"}</b>,
      sub: (a) => `of ${a.target_value !== null ? qty(a.target_value, a.unit) : a.target || "—"}`,
    },
    { key: "progress", header: "Progress", nowrap: true, cell: (a) => <ProgressCell value={a.progress} /> },
    {
      key: "remaining",
      header: "Remaining",
      numeric: true,
      cell: (a) => <span className={cn("font-bold", remainingTone(a.progress))}>{a.progress >= 100 ? "None" : a.remaining !== null ? qty(a.remaining, a.unit) : `${100 - a.progress}%`}</span>,
      sub: (a) => (a.progress >= 100 ? null : `${100 - a.progress}% left`),
    },
    ...(onContribute
      ? [
          {
            key: "action",
            header: <span className="sr-only">Action</span>,
            align: "right" as const,
            nowrap: true,
            cell: (a: DepartmentActivity) =>
              a.mine || linked?.has(a.id) ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-control bg-ims-success-bg px-3 py-1.5 text-t-small font-bold text-ims-success">
                  <Check size={13} aria-hidden /> In your plan
                </span>
              ) : (
                <Button size="sm" icon={Plus} onClick={() => onContribute(a)} disabled={a.progress >= 100} aria-label={`${contributeLabel}: ${a.title}`}>
                  {contributeLabel}
                </Button>
              ),
          },
        ]
      : []),
  ];
  return <DataTable columns={columns} rows={activities} rowKey={(a) => a.id} minWidth={onContribute ? 700 : 600} caption="Department activities" />;
}

export function DepartmentActivitiesCard({ view, loading, linked, onContribute, empty, action }: {
  view?: DepartmentView;
  loading?: boolean;
  linked?: Set<string>;
  onContribute?: (a: DepartmentActivity) => void;
  empty?: string;
  action?: React.ReactNode;
}) {
  if (loading) {
    return (
      <Card>
        <Skeleton className="h-28 w-full" />
      </Card>
    );
  }
  if (!view) return null;
  const hasPlan = Boolean(view.plan && view.activities.length);
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
        <CardHeader
          title={`Department activities · ${view.period.label}`}
          subtitle={`${view.department.name}${view.plan ? ` · ${view.plan.number}` : ""} · what is left to achieve.${onContribute ? " Contribute to add an activity to your plan." : ""}`}
          action={
            (view.plan || action) && (
              <div className="flex flex-wrap items-center gap-3">
                {view.plan && (
                  <span className="text-t-small text-ims-muted">
                    Department overall <b className="text-ims-text">{view.overall}% achieved</b> · {100 - view.overall}% remaining
                  </span>
                )}
                {action}
              </div>
            )
          }
        />
      </div>
      {hasPlan ? (
        <div className="border-t border-ims-divider">
          <DepartmentActivitiesTable activities={view.activities} linked={linked} onContribute={onContribute} />
        </div>
      ) : (
        <EmptyState compact icon={Target} className="border-t border-ims-divider" text={empty || `No department plan shared for ${view.period.label} yet. The head of department prepares it.`} />
      )}
    </Card>
  );
}
