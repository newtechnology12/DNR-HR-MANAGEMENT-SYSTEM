/**
 * A department plan's activities with what is achieved and what remains: target, achieved (the sum of the
 * staff results that count), progress, remaining and how many people contribute. Used in the plan editor
 * (with "Contribute"), on the Department plan tab and on the department plan page.
 */
import * as React from "react";
import { Check, Plus } from "lucide-react";
import { DepartmentActivity, DepartmentView, dmy, qty } from "@/lib/plans";
import { cn } from "@/utils";
import { WCard } from "./WorkspaceKit";

export function remainingTone(progress: number) {
  return progress >= 100 ? "text-[#0F6B3A]" : 100 - progress >= 50 ? "text-[#B42318]" : "text-[#8A5A00]";
}

export function teamText(team: number, you: boolean) {
  if (!team) return you ? "You" : "—";
  return `${team} ${team === 1 ? "person" : "people"}${you ? " + you" : ""}`;
}

export function DepartmentActivitiesTable({ activities, linked, onContribute, contributeLabel = "Contribute" }: {
  activities: DepartmentActivity[];
  linked?: Set<string>;
  onContribute?: (a: DepartmentActivity) => void;
  contributeLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead>
          <tr className="border-y border-[#EDF0F5] bg-[#F8FAFC] text-left text-[13px] text-[#5B6577]">
            <th scope="col" className="px-5 py-2.5 font-bold">Department activity</th>
            <th scope="col" className="px-3 py-2.5 text-right font-bold">Target</th>
            <th scope="col" className="px-3 py-2.5 text-right font-bold">Achieved</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Progress</th>
            <th scope="col" className="px-3 py-2.5 text-right font-bold">Remaining</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Team</th>
            {onContribute && <th scope="col" className="py-2.5 pl-3 pr-5"><span className="sr-only">Action</span></th>}
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => {
            const you = Boolean(a.mine || linked?.has(a.id));
            const done = a.progress >= 100;
            return (
              <tr key={a.id} className="border-b border-[#EDF0F5] last:border-b-0">
                <td className="max-w-[230px] px-5 py-3">
                  <span className="block font-bold leading-snug">{a.title}</span>
                  <span className="block text-[12.5px] text-[#5B6577]">{a.code}{a.due ? ` · due ${dmy(a.due).slice(0, 5)}` : ""}</span>
                </td>
                <td className="px-3 py-3 text-right text-[13.5px]">{a.target_value !== null ? qty(a.target_value, a.unit) : a.target}</td>
                <td className="px-3 py-3 text-right font-bold">{a.target_value !== null ? qty(a.achieved, a.unit) : "—"}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className="block h-[7px] w-[72px] overflow-hidden rounded-full bg-[#EEF1F5]" aria-hidden><span className="block h-full rounded-full" style={{ width: `${a.progress}%`, background: done ? "#0F6B3A" : "#1466C0" }} /></span>
                    <b className="w-10 text-right tabular-nums">{a.progress}%</b>
                  </span>
                </td>
                <td className={cn("px-3 py-3 text-right text-[13.5px] font-bold", remainingTone(a.progress))}>
                  {done ? "Done" : <>{100 - a.progress}%{a.remaining !== null && <> · {qty(a.remaining, a.unit)}</>}</>}
                </td>
                <td className="px-3 py-3 text-[13.5px] text-[#36435A]">{teamText(a.team, you)}</td>
                {onContribute && (
                  <td className="py-3 pl-3 pr-5 text-right">
                    {you ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#E4F4EA] px-3 py-1.5 text-[12.5px] font-bold text-[#0F6B3A]"><Check size={13} aria-hidden /> In your plan</span>
                    ) : (
                      <button type="button" onClick={() => onContribute(a)} disabled={done} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#1466C0] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#1466C0] hover:bg-[#EAF2FC] disabled:border-[#DDE3EC] disabled:text-[#8A94A6]">
                        <Plus size={13} aria-hidden /> {contributeLabel}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DepartmentActivitiesCard({ view, loading, linked, onContribute, empty, action }: {
  view?: DepartmentView;
  loading?: boolean;
  linked?: Set<string>;
  onContribute?: (a: DepartmentActivity) => void;
  empty?: string;
  action?: React.ReactNode;
}) {
  if (loading) return <WCard><div className="h-28 animate-pulse rounded-lg bg-[#F1F4F9]" /></WCard>;
  if (!view) return null;
  return (
    <WCard flush className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-[18px]">
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold">Department activities · {view.period.label}</h2>
          <p className="text-[13px] text-[#5B6577]">
            {view.department.name}{view.plan ? ` · ${view.plan.number}` : ""} · what is left to achieve.{onContribute ? " Contribute to add it to your plan." : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view.plan && <span className="text-[13px] text-[#5B6577]">Department overall: <b className="text-[#14213D]">{view.overall}% achieved</b> · {100 - view.overall}% remaining</span>}
          {action}
        </div>
      </div>
      {!view.plan || !view.activities.length ? (
        <p className="border-t border-[#EDF0F5] px-5 py-6 text-[13.5px] text-[#5B6577]">{empty || `No department plan shared for ${view.period.label} yet. The head of department prepares it.`}</p>
      ) : (
        <DepartmentActivitiesTable activities={view.activities} linked={linked} onContribute={onContribute} />
      )}
    </WCard>
  );
}
