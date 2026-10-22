import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileText, Paperclip, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { StatusBadge } from "@/components/enterprise/ui";
import { useMe } from "@/components/portal/kit";
import { Button, Card, Column, DataTable, EmptyState, FilterBar, FilterChip, FilterSelect, Person, Tabs, TwoLine, fmtDate } from "@/components/ims";
import { REPORT_STATUS, reportTypeLabel, statusText } from "./shared";

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
  const write = () => navigate("/dashboard/employee-portal/reports/new");

  const chips: FilterChip[] = status !== "all" ? [{ key: "status", label: `Status: ${statusText(REPORT_STATUS[status])}`, onRemove: () => setStatus("all") }] : [];
  const columns: Column<any>[] = [
    {
      key: "report",
      header: "Report",
      className: "min-w-[240px] max-w-[340px]",
      cell: (r) => (
        <TwoLine
          main={title(r)}
          sub={
            (r.attachments?.length || 0) > 0 ? (
              <>
                <Paperclip size={12} className="mr-1 inline align-[-1px]" aria-label={`${r.attachments.length} attachment${r.attachments.length > 1 ? "s" : ""}`} />
                {r.tasksCompleted}
              </>
            ) : (
              r.tasksCompleted
            )
          }
        />
      ),
    },
    ...(view === "review" ? [{ key: "from", header: "From", className: "min-w-[140px]", cell: (r: any) => <Person name={r.expand?.employee?.name || r.employeeName} /> }] : []),
    { key: "type", header: "Type", nowrap: true, cell: (r) => reportTypeLabel(r.reportType) },
    { key: "date", header: "Date", nowrap: true, cell: (r) => fmtDate(r.reportDate) },
    { key: "plan", header: "Action plan", clamp: true, className: "max-w-[220px]", cell: (r) => r.expand?.action_plan?.title || r.plane || <span className="text-ims-faint">—</span> },
    ...(view === "mine" ? [{ key: "to", header: "Sent to", clamp: true, className: "max-w-[200px]", cell: (r: any) => (r.expand?.recipients || []).map((u: any) => u.name).join(", ") || <span className="text-ims-faint">—</span> }] : []),
    { key: "status", header: "Status", nowrap: true, cell: (r) => <StatusBadge status={r.status || "submitted"} map={REPORT_STATUS} /> },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      {isSelf && (toReview.data || []).length > 0 && (
        <Tabs
          inset
          label="Reports"
          active={view}
          onChange={(k) => setView(k as "mine" | "review")}
          tabs={[
            { key: "mine", label: "My reports" },
            { key: "review", label: "To review", count: waiting },
          ]}
        />
      )}
      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: "Search title, author, work or plan" }}
        chips={chips}
        onClear={() => setStatus("all")}
        right={isSelf && <Button icon={Plus} onClick={write}>Write a report</Button>}
      >
        <FilterSelect
          label="Status"
          value={status === "all" ? "" : status}
          onChange={(v) => setStatus(v || "all")}
          options={Object.entries(REPORT_STATUS).map(([k, m]) => ({ value: k, label: `${statusText(m)} (${rows.filter((r) => r.status === k).length})` }))}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={open}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={860}
        caption={view === "review" ? "Reports to review" : "My reports"}
        rowActions={(r) => [{ label: "Open", icon: ExternalLink, onSelect: () => open(r) }]}
        empty={
          <EmptyState
            compact
            icon={FileText}
            text={
              rows.length
                ? "No report matches. Change the filter or the search."
                : view === "review"
                ? "Nothing to review."
                : "No reports yet. Report on your work regularly: your supervisor is notified and can comment or ask for more information."
            }
            action={!rows.length && view === "mine" && isSelf ? <Button variant="primary" icon={Plus} onClick={write}>Write a report</Button> : undefined}
          />
        }
      />
    </Card>
  );
}
