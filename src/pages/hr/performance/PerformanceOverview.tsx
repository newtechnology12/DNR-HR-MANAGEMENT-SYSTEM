import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Award, ClipboardCheck, Download, ExternalLink, LayoutTemplate, Plus, Rocket } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { APPRAISAL_STATUS, appraisalApi } from "@/lib/hr";
import { toPbDate, useMe } from "@/components/portal/kit";
import {
  Button,
  Card,
  Checkbox,
  Column,
  DataTable,
  DatePicker,
  EmptyState,
  Field,
  FilterBar,
  FilterChip,
  FilterSelect,
  Input,
  KpiBand,
  Modal,
  Num,
  Page,
  PageHeader,
  Pager,
  Person,
  Select,
    Tabs,
  fmtDate,
  fmtNumber,
  sentence,
  statusText,
  statusWord,
} from "@/components/ims";
import { cn } from "@/utils";
import { GRADE_DOT, Grade } from "./AppraisalPage";

const LOCKED = ["shared", "acknowledged", "finalized"];

export default function PerformanceOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_appraisals");
  const [cycleId, setCycleId] = React.useState("");
  const [view, setView] = React.useState<"mine" | "all">("all");
  const [status, setStatus] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [sort, setSort] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(30);

  const cycles = useQuery(["appraisal-cycles"], () => pocketbase.collection("appraisal_cycles").getFullList({ sort: "-period_start", expand: "template" }));
  React.useEffect(() => {
    if (!cycleId && cycles.data?.length) setCycleId((cycles.data.find((c: any) => c.status === "open") || cycles.data[0]).id);
  }, [cycles.data, cycleId]);
  const cycle: any = (cycles.data || []).find((c: any) => c.id === cycleId);
  const q = useQuery(["appraisals", cycleId], () => pocketbase.collection("appraisals").getFullList({ filter: `cycle = "${cycleId}"`, sort: "department.name,employee.name", expand: "employee,department,evaluators" }), { enabled: Boolean(cycleId) });
  const myReviews = useQuery(["my-reviews", cycleId, me.data?.id], () => pocketbase.collection("appraisal_reviews").getFullList({ filter: `evaluator = "${me.data!.id}" && appraisal.cycle = "${cycleId}"`, fields: "appraisal,status" }), { enabled: Boolean(cycleId && me.data) });
  const launch = useMutation(() => appraisalApi.launch(cycleId), {
    onSuccess: (r) => {
      toast.success(`${r.created} appraisal${r.created === 1 ? "" : "s"} created and the evaluators notified`);
      queryClient.invalidateQueries(["appraisal-cycles"]);
      queryClient.invalidateQueries(["appraisals"]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const all = (q.data || []) as any[];
  const submittedByMe = new Set((myReviews.data || []).filter((r: any) => r.status === "submitted").map((r: any) => r.appraisal));
  const isMine = (a: any) => (a.evaluators || []).includes(me.data?.id) && !submittedByMe.has(a.id) && !LOCKED.includes(a.status);
  const toDo = all.filter(isMine);
  const rows = (view === "mine" ? toDo : all).filter(
    (a) => (!status || a.status === status) && (!department || a.department === department) && `${a.expand?.employee?.name} ${a.expand?.department?.name}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const scored = all.filter((a) => a.final_score > 0);
  const avg = scored.length ? Math.round((scored.reduce((s, a) => s + a.final_score, 0) / scored.length) * 10) / 10 : 0;
  const grades = ["A", "B", "C", "D", "E"].map((g) => ({ g, n: scored.filter((a) => a.grade === g).length }));
  const departments = Array.from(new Map(all.map((a) => [a.department, a.expand?.department?.name])).entries());
  const bands = cycle?.expand?.template?.grade_bands || [];
  const evaluated = all.filter((a) => a.evaluator_score > 0).length;
  const claims = all.filter((a) => a.status === "disputed").length;

  // Sorting and paging happen in the browser: the whole cycle is already loaded.
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const desc = sort.startsWith("-");
    const key = desc ? sort.slice(1) : sort;
    const val = (a: any) => (key === "employee" ? String(a.expand?.employee?.name || "").toLowerCase() : Number(a[key]) || 0);
    return [...rows].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      return (a < b ? -1 : a > b ? 1 : 0) * (desc ? -1 : 1);
    });
  }, [rows, sort]);
  React.useEffect(() => setPage(1), [cycleId, view, status, department, search, perPage]);
  const shown = sorted.slice((page - 1) * perPage, page * perPage);

  function exportExcel() {
    const data = [["Employee", "Department", "Evaluators", "Activity score", "Evaluator score", "Self-assessment", "Final score", "Grade", "Status"], ...all.map((a) => [a.expand?.employee?.name, a.expand?.department?.name, (a.expand?.evaluators || []).map((u: any) => u.name).join(", "), a.activity_score, a.evaluator_score || "", a.self_score || "", a.final_score || "", a.grade ? `${a.grade} — ${a.grade_label}` : "", statusText(APPRAISAL_STATUS[a.status], a.status)])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Appraisals");
    XLSX.writeFile(wb, `${cycle?.name || "appraisals"}.xlsx`);
  }

  const open = (a: any) => navigate(`/dashboard/hr/performance/appraisals/${a.id}`);

  const columns: Column<any>[] = [
    {
      key: "employee",
      header: "Staff",
      sortField: "employee",
      className: "max-w-[220px]",
      cell: (a) => <Person name={a.expand?.employee?.name} detail={a.expand?.department?.name} />,
    },
    {
      key: "evaluators",
      header: "Evaluated by",
      className: "max-w-[220px]",
      cell: (a) => {
        const names = (a.expand?.evaluators || []).map((u: any) => u.name).join(", ");
        return (
          <span className="block min-w-0">
            {names ? <span className="line-clamp-2 break-words text-ims-body" title={names}>{names}</span> : <span className="text-ims-warning">No evaluator · HR evaluates</span>}
            {isMine(a) && <span className="mt-0.5 block text-t-small font-semibold text-ims-link">Your evaluation is due</span>}
          </span>
        );
      },
    },
    { key: "activity_score", header: <span title="From action plans and work reports">Activity</span>, sortField: "activity_score", numeric: true, cell: (a) => <span className="text-ims-body"><Num value={a.activity_score} decimals /></span> },
    { key: "evaluator_score", header: "Evaluator score", sortField: "evaluator_score", numeric: true, cell: (a) => (a.evaluator_score ? <Num value={a.evaluator_score} decimals /> : <span className="text-ims-faint">—</span>) },
    { key: "self_score", header: "Self", sortField: "self_score", numeric: true, cell: (a) => (a.self_score ? <span className="text-ims-muted"><Num value={a.self_score} decimals /></span> : <span className="text-ims-faint">—</span>) },
    {
      key: "final_score",
      header: "Final score",
      sortField: "final_score",
      numeric: true,
      cell: (a) => (a.final_score > 0 ? <span className="font-bold text-ims-text"><Num value={a.final_score} decimals /></span> : <span className="text-ims-faint">—</span>),
      sub: (a) => (a.grade ? <Grade small grade={a.grade} label={a.grade_label} /> : null),
    },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} map={APPRAISAL_STATUS} /> },
  ];

  const chips: FilterChip[] = [
    ...(status ? [{ key: "status", label: `Status: ${statusText(APPRAISAL_STATUS[status], status)}`, onRemove: () => setStatus("") }] : []),
    ...(department ? [{ key: "department", label: `Department: ${departments.find(([id]) => id === department)?.[1] || "—"}`, onRemove: () => setDepartment("") }] : []),
  ];
  const clearFilters = () => {
    setStatus("");
    setDepartment("");
    setSearch("");
  };

  const noCycles = !cycles.isLoading && !cycles.data?.length;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR", to: "/dashboard/hr/employees" }, { label: "Performance appraisals" }]}
        title="Performance appraisals"
        subtitle="Evaluations by department, with the activity score from action plans and reports added by the system."
        primary={canManage ? { label: "New cycle", icon: Plus, onClick: () => setCreating(true) } : undefined}
        secondary={[
          ...(canManage ? [{ label: "Templates", icon: LayoutTemplate, to: "/dashboard/hr/performance/templates" }] : []),
          { label: "Export", icon: Download, onClick: exportExcel, disabled: !all.length },
        ]}
      />

      {noCycles ? (
        <Card>
          <EmptyState
            icon={Award}
            text={canManage ? "No appraisal cycle yet. Create one with New cycle." : "No appraisal cycle yet."}
            action={canManage ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New cycle</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <Card className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-8">
            <div className="min-w-0 space-y-2.5">
              <FilterSelect
                label="Appraisal cycle"
                all={false}
                value={cycleId}
                onChange={setCycleId}
                className="block w-full sm:inline-block sm:w-auto [&_select]:w-full sm:[&_select]:w-[360px]"
                options={(cycles.data || []).map((c: any) => ({ value: c.id, label: `${c.name} · ${statusWord(c.status) || sentence(c.status)}` }))}
              />
              {cycle && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-t-small text-ims-muted">
                  <span>{fmtDate(cycle.period_start)} – {fmtDate(cycle.period_end)}</span>
                  <span aria-hidden>·</span>
                  <span>Due {fmtDate(cycle.due_date)}</span>
                  {cycle.expand?.template?.name && (
                    <>
                      <span aria-hidden>·</span>
                      <span>Template “{cycle.expand.template.name}”</span>
                    </>
                  )}
                </p>
              )}
              {cycle?.status === "draft" && canManage && (
                <div className="flex flex-col gap-2 rounded-control bg-ims-info-bg px-3 py-2.5 text-t-small text-ims-info sm:flex-row sm:items-center sm:justify-between">
                  <span>This cycle is a draft. Launching it creates the appraisals and notifies the evaluators.</span>
                  <Button variant="primary" size="sm" icon={Rocket} loading={launch.isLoading} onClick={() => launch.mutate()} className="shrink-0">Launch cycle</Button>
                </div>
              )}
            </div>
            <div className="min-w-0" role="group" aria-label="Grade distribution">
              <p className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-t-label text-ims-text">Grade distribution</span>
                <span className="text-t-small text-ims-muted">{scored.length ? `${scored.length} staff with a final score` : "No final scores yet"}</span>
              </p>
              <div className="flex h-3 overflow-hidden rounded-pill bg-ims-subtle" role="img" aria-label={grades.map((g) => `${g.g}: ${g.n}`).join(", ")}>
                {grades.filter((g) => g.n).map((g) => (
                  <div key={g.g} className={cn(GRADE_DOT[g.g], "border-r-2 border-ims-card last:border-r-0")} style={{ width: `${(g.n / Math.max(1, scored.length)) * 100}%` }} title={`${g.g}: ${g.n}`} />
                ))}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {grades.map((g) => (
                  <li key={g.g} className="flex items-center gap-1.5 text-t-small">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", GRADE_DOT[g.g])} aria-hidden />
                    <span className="font-semibold text-ims-text">{g.g}</span>
                    <span className="text-ims-muted">{bands.find((b: any) => b.grade === g.g)?.label}</span>
                    <span className="font-semibold tabular-nums text-ims-text">{g.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <KpiBand
            loading={q.isLoading}
            items={[
              { label: "Staff", value: fmtNumber(all.length) },
              { label: "Evaluated", value: fmtNumber(evaluated), sub: `${Math.round((evaluated / Math.max(1, all.length)) * 100)}% done` },
              { label: "Average score", value: avg || "—", sub: scored.length ? `${scored.length} scored` : "None scored yet" },
              { label: "Open claims", value: fmtNumber(claims), tone: claims ? "warning" : "default", onClick: claims ? () => { setView("all"); setStatus("disputed"); } : undefined },
            ]}
          />

          <Card padded={false}>
            <Tabs
              inset
              label="Appraisal views"
              active={view}
              onChange={(k) => setView(k as "mine" | "all")}
              tabs={[
                { key: "all", label: "All staff", count: all.length },
                { key: "mine", label: "To evaluate by me", count: toDo.length },
              ]}
            />
            <FilterBar
              search={{ value: search, onChange: setSearch, placeholder: "Search staff or department" }}
              chips={chips}
              onClear={clearFilters}
            >
              <FilterSelect label="Status" value={status} onChange={setStatus} options={Object.entries(APPRAISAL_STATUS).map(([k, s]) => ({ value: k, label: statusText(s, k) }))} />
              <FilterSelect label="Department" value={department} onChange={setDepartment} options={departments.map(([id, name]) => ({ value: id, label: name || "—" }))} />
            </FilterBar>
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(a) => a.id}
              loading={q.isLoading || cycles.isLoading}
              error={q.error}
              onRetry={() => q.refetch()}
              sort={sort}
              onSort={setSort}
              onRowClick={open}
              rowActions={(a) => [isMine(a) ? { label: "Evaluate", icon: ClipboardCheck, onSelect: open } : { label: "Open", icon: ExternalLink, onSelect: open }]}
              minWidth={960}
              caption="Appraisals in this cycle"
              empty={
                <EmptyState
                  icon={ClipboardCheck}
                  text={view === "mine" ? "Nothing is waiting for your evaluation." : chips.length || search ? "No appraisal matches these filters." : "No appraisals in this cycle yet."}
                  action={chips.length || search ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
                />
              }
              footer={sorted.length > 15 ? <Pager page={page} perPage={perPage} total={sorted.length} onPage={setPage} onPerPage={setPerPage} /> : undefined}
            />
          </Card>
        </>
      )}
      {creating && <NewCycleDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setCycleId(id); }} />}
    </Page>
  );
}

function NewCycleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const y = new Date().getFullYear();
  const [v, setV] = React.useState({ name: `Annual performance review ${y}`, template: "", period_start: `${y}-01-01`, period_end: `${y}-12-31`, due_date: `${y}-12-20`, departments: [] as string[] });
  const [tried, setTried] = React.useState(false);
  const templates = useQuery(["appraisal-templates"], () => pocketbase.collection("appraisal_templates").getFullList({ filter: "active = true", sort: "name" }));
  const depts = useQuery(["departments-simple"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  React.useEffect(() => {
    if (!v.template && templates.data?.[0]) setV((x) => ({ ...x, template: templates.data![0].id }));
  }, [templates.data, v.template]);
  const save = useMutation(() => pocketbase.collection("appraisal_cycles").create({ ...v, period_start: toPbDate(v.period_start), period_end: toPbDate(v.period_end), due_date: toPbDate(v.due_date), status: "draft" }), {
    onSuccess: (c: any) => {
      toast.success(`${c.name || "Cycle"} created as a draft. Review it, then launch it to create the appraisals`);
      queryClient.invalidateQueries(["appraisal-cycles"]);
      onCreated(c.id);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const nameError = tried && !v.name.trim() ? "Enter a name, for example “Annual performance review 2026”." : null;
  const templateError = tried && !v.template ? (templates.data?.length ? "Choose the template evaluators will use." : "No active template yet. Create one under Templates first.") : null;
  const create = () => {
    setTried(true);
    if (!v.name.trim() || !v.template) return;
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="New appraisal cycle"
      description="Launching the cycle creates one appraisal per employee and notifies the evaluators."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} onClick={create}>Create cycle</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required htmlFor="cycle-name" error={nameError} className="sm:col-span-2">
          <Input id="cycle-name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} invalid={Boolean(nameError)} />
        </Field>
        <Field label="Template" required htmlFor="cycle-template" error={templateError} className="sm:col-span-2">
          <Select id="cycle-template" value={v.template} onChange={(e) => setV((x) => ({ ...x, template: e.target.value }))} invalid={Boolean(templateError)}>
            {!templates.data?.length && <option value="">No active template</option>}
            {(templates.data || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Period from" required htmlFor="cycle-start">
          <DatePicker id="cycle-start" value={v.period_start} max={v.period_end || undefined} onChange={(d) => setV((x) => ({ ...x, period_start: d }))} />
        </Field>
        <Field label="Period to" required htmlFor="cycle-end">
          <DatePicker id="cycle-end" value={v.period_end} min={v.period_start || undefined} onChange={(d) => setV((x) => ({ ...x, period_end: d }))} />
        </Field>
        <Field label="Evaluations due" htmlFor="cycle-due" className="sm:col-span-2">
          <DatePicker id="cycle-due" value={v.due_date} onChange={(d) => setV((x) => ({ ...x, due_date: d }))} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-t-label text-ims-text">Departments</legend>
          <p className="mb-2 text-t-hint text-ims-muted">Leave all unticked to include every department.</p>
          <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-control border border-ims-border p-3 sm:grid-cols-2">
            {(depts.data || []).map((d: any) => (
              <Checkbox
                key={d.id}
                label={d.name}
                checked={v.departments.includes(d.id)}
                onChange={(checked) => setV((x) => ({ ...x, departments: checked ? [...x.departments, d.id] : x.departments.filter((i) => i !== d.id) }))}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
