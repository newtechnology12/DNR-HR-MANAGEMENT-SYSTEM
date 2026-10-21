import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Paperclip, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import { Chip, ListToolbar, showDate, useMe } from "@/components/portal/kit";
import { REPORT_STATUS, reportTypeLabel } from "./shared";

export default function ReportsTab({ employeeId }: { employeeId: string }) {
  const navigate = useNavigate();
  const me = useMe();
  const isSelf = me.data?.id === employeeId;
  const [view, setView] = React.useState<"mine" | "review">("mine");
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const toReview = useQuery(
    ["reports-to-review", me.data?.id],
    () => pocketbase.collection("employeeReports").getFullList({ filter: `recipients.id ?= "${me.data!.id}" && employee != "${me.data!.id}"`, sort: "-reportDate", expand: "employee,action_plan" }),
    { enabled: Boolean(isSelf && me.data) }
  );
  const mine = useQuery(["reports-mine", employeeId], () => pocketbase.collection("employeeReports").getFullList({ filter: `employee = "${employeeId}"`, sort: "-reportDate", expand: "employee,action_plan,recipients" }));

  const q = view === "review" ? toReview : mine;
  const rows = (q.data || []) as any[];
  const waiting = (toReview.data || []).filter((r: any) => r.status !== "reviewed").length;
  const shown = rows.filter(
    (r) => (status === "all" || r.status === status) && `${r.title} ${r.employeeName} ${r.tasksCompleted} ${r.expand?.action_plan?.title || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const title = (r: any) => r.title || `${reportTypeLabel(r.reportType)} report`;
  const open = (r: any) => navigate(`/dashboard/employee-portal/reports/${r.id}`);

  return (
    <div className="space-y-4">
      {isSelf && (toReview.data || []).length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          <Chip active={view === "mine"} onClick={() => setView("mine")}>My reports</Chip>
          <Chip active={view === "review"} onClick={() => setView("review")} count={waiting}>To review</Chip>
        </div>
      )}
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search reports"
        filters={[["all", "All"], ["submitted", "Awaiting review"], ["info_requested", "Info requested"], ["reviewed", "Reviewed"]].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => setStatus(k)} count={k === "all" ? rows.length : rows.filter((r) => r.status === k).length}>{l}</Chip>
        ))}
        action={isSelf && <Button className="h-10" onClick={() => navigate("/dashboard/employee-portal/reports/new")}><Plus size={16} /> Write a report</Button>}
      />

      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !shown.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <FileText size={26} className="text-slate-400" />
          <p className="text-[14px] font-medium text-slate-800">{rows.length ? "No report matches" : view === "review" ? "Nothing to review" : "No reports yet"}</p>
          <p className="max-w-sm text-[12.5px] text-slate-500">{rows.length ? "Change the filter or search." : "Report on your work regularly — your supervisor is notified and can comment or ask for more information."}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => open(r)} className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-card active:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold leading-snug text-slate-900">{title(r)}</p>
                    <StatusBadge status={r.status || "submitted"} map={REPORT_STATUS} />
                  </div>
                  <p className="mt-0.5 text-[12px] text-slate-500">{view === "review" ? `${r.expand?.employee?.name || r.employeeName} · ` : ""}{reportTypeLabel(r.reportType)} · {showDate(r.reportDate)}</p>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] text-slate-600">{r.tasksCompleted}</p>
                  {(r.attachments?.length || 0) > 0 && <p className="mt-1.5 flex items-center gap-1 text-[12px] text-slate-500"><Paperclip size={12} /> {r.attachments.length} attachment{r.attachments.length > 1 ? "s" : ""}</p>}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="dnr-grid w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Report</th>
                  {view === "review" && <th className="px-3 py-2.5">From</th>}
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Action plan</th>
                  {view === "mine" && <th className="px-3 py-2.5">Sent to</th>}
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => open(r)} className="cursor-pointer hover:bg-slate-50">
                    <td className="max-w-[320px] px-3 py-2.5">
                      <p className="flex items-center gap-1.5 truncate font-medium text-slate-900">{title(r)}{(r.attachments?.length || 0) > 0 && <Paperclip size={12} className="shrink-0 text-slate-400" />}</p>
                      <p className="truncate text-[12px] text-slate-500">{r.tasksCompleted}</p>
                    </td>
                    {view === "review" && <td className="whitespace-nowrap px-3 py-2.5">{r.expand?.employee?.name || r.employeeName}</td>}
                    <td className="px-3 py-2.5 text-slate-600">{reportTypeLabel(r.reportType)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{showDate(r.reportDate)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-600">{r.expand?.action_plan?.title || r.plane || "—"}</td>
                    {view === "mine" && <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-600">{(r.expand?.recipients || []).map((u: any) => u.name).join(", ") || "—"}</td>}
                    <td className="px-3 py-2.5"><StatusBadge status={r.status || "submitted"} map={REPORT_STATUS} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
