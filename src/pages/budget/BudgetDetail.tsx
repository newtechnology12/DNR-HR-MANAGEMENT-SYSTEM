/**
 * Budget document: lines with monthly phasing (editable while draft / returned), Excel import with a
 * template, submission, approval (Budget Officer → DAF → SG) and, once approved, live utilisation per line.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Ban, Clock, CornerUpLeft, Download, FileSpreadsheet, FileText, GitCompareArrows, ListTree, Pencil, Plus, Search, Send, Sheet, Trash2, Upload } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { BudgetLineUsage, KIND_LABEL, MONTHS_FY, budgetApi } from "@/lib/budget";
import { DOC_STATUS, errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { Segmented } from "@/components/portal/kit";
import DocumentUploads from "@/components/enterprise/Attachments";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  Column,
  ConfirmDialog,
  DataTable,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  Field,
  FilterBar,
  Input,
  KpiBand,
  MenuItem,
  Modal,
  ModalSection,
  MoneyInput,
  MoreMenu,
  Num,
  Page,
  Pager,
  Select,
  Tabs,
  buttonClass,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
} from "@/components/ims";
import { LineLedgerDialog, UseBar } from "@/components/budget/BudgetKit";
import { cn } from "@/utils";

const KIND_ACCOUNT: Record<string, string> = { expense: "expense", capital: "asset", revenue: "revenue" };
const EDITABLE = ["draft", "returned"];
const LIST = "/dashboard/budget/budgets";
type TabKey = "details" | "lines" | "approvals" | "documents" | "activity";

function spread(amount: number) {
  const base = Math.floor(amount / 12);
  const out = Array(12).fill(base);
  out[11] += amount - base * 12;
  return out;
}

const amountOf = (l: any) => l.revised_amount || l.original_amount;

export default function BudgetDetail() {
  const { budgetId } = useParams();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState<TabKey>("details");
  const [view, setView] = React.useState<"amounts" | "phasing">("amounts");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(15);
  const [editing, setEditing] = React.useState<any>(null);
  const [removing, setRemoving] = React.useState<any>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [drill, setDrill] = React.useState<BudgetLineUsage | null>(null);

  const doc = useQuery(["budget", budgetId], () => pocketbase.collection("budgets").getOne(budgetId!, { expand: "fiscal_year,prepared_by,approval,department" }));
  const b: any = doc.data;
  const lines = useQuery(["budget-lines", budgetId], () => pocketbase.collection("budget_lines").getFullList({ filter: `budget = "${budgetId}"`, sort: "code", expand: "gl_account,department,funding_source,project,cost_centre", batch: 2000 }), { enabled: Boolean(b) });
  const usage = useQuery(["budget-usage-doc", b?.fiscal_year], () => budgetApi.usage({ fiscal_year: b.fiscal_year }), { enabled: b?.status === "approved" && can(["view_budgets", "manage_budgets"]) });
  const trail = useApprovalTrail("budget", "budgets", budgetId);
  const editable = b && EDITABLE.includes(b.status) && can("manage_budgets");
  const figures = React.useMemo(() => Object.fromEntries((usage.data?.items || []).map((i) => [i.id, i])), [usage.data]);
  const refresh = () => {
    queryClient.invalidateQueries(["budget", budgetId]);
    queryClient.invalidateQueries(["budget-lines", budgetId]);
    queryClient.invalidateQueries(["budget-usage-doc"]);
    trail.refresh();
  };

  const ref = useQuery(["budget-reference"], async () => {
    const [accounts, departments, funding, projects, centres] = await Promise.all([
      pocketbase.collection("gl_accounts").getFullList({ filter: "is_posting = true && active = true", sort: "code" }),
      pocketbase.collection("departments").getFullList({ sort: "name" }),
      pocketbase.collection("funding_sources").getFullList({ filter: "active = true", sort: "code" }),
      pocketbase.collection("projects").getFullList({ filter: 'status != "closed"', sort: "code" }),
      pocketbase.collection("cost_centres").getFullList({ filter: "active = true", sort: "code" }),
    ]);
    return { accounts, departments, funding, projects, centres };
  }, { enabled: Boolean(editable), staleTime: 5 * 60_000 });

  /** Runs an action with a toast; resolves false when it failed (the error is already shown). */
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLine() {
    const l = editing;
    const amount = Math.round(Number(l.original_amount) || 0);
    const phasing = (l.phasing || []).map((v: any) => Math.round(Number(v) || 0));
    if (phasing.length === 12 && phasing.reduce((a: number, v: number) => a + v, 0) !== amount) return toast.error("The monthly amounts must add up to the annual amount. Use “Spread evenly” or correct the months.");
    const data = {
      budget: b.id, code: String(l.code || "").trim().toUpperCase(), name: l.name || "", kind: l.kind, gl_account: l.gl_account, department: l.department,
      funding_source: l.funding_source, project: l.project || "", cost_centre: l.cost_centre || "", original_amount: amount, phasing, notes: l.notes || "",
    };
    await run(() => (l.id ? pocketbase.collection("budget_lines").update(l.id, data) : pocketbase.collection("budget_lines").create(data)), `Line ${data.code} saved`);
    setEditing(null);
  }

  const items: any[] = lines.data || [];
  const revenue = items.filter((l) => l.kind === "revenue").reduce((a, l) => a + l.original_amount, 0);
  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: `${b.number} — ${b.name}`, subtitle: `${b.expand?.fiscal_year?.name} · ${DOC_STATUS[b.status]?.label || b.status}`, rows: items, format, orientation: "landscape", what: "budget_lines",
      totals: ["Annual amount", ...MONTHS_FY],
      columns: [
        { header: "Line", value: (l: any) => l.code, width: 16 },
        { header: "Account", value: (l: any) => `${l.expand?.gl_account?.code} ${l.expand?.gl_account?.name}`, width: 30 },
        { header: "Department", value: (l: any) => l.expand?.department?.name || "" },
        { header: "Funding", value: (l: any) => l.expand?.funding_source?.code || "" },
        { header: "Project", value: (l: any) => l.expand?.project?.code || "" },
        { header: "Annual amount", value: (l: any) => l.revised_amount || l.original_amount, format: "money" },
        ...MONTHS_FY.map((m, i) => ({ header: m, value: (l: any) => (l.phasing || [])[i] || 0, format: "money" as const })),
      ],
    });
  // Same permission and error handling as the shared Export button, offered from the "More" menu.
  const canExport = can(["export_budgets", "export_reports", "manage_budgets"]);
  const exportAs = async (format: "xlsx" | "pdf" | "csv") => {
    try {
      await doExport(format);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    }
  };

  // ------------------------------------------------------------------ table views (UI only)
  const term = search.trim().toLowerCase();
  const shown = items.filter((l) => !term || `${l.code} ${l.name} ${l.expand?.gl_account?.code} ${l.expand?.gl_account?.name} ${l.expand?.department?.name} ${l.expand?.funding_source?.code} ${l.expand?.project?.code || ""}`.toLowerCase().includes(term));
  React.useEffect(() => setPage(1), [term, view]);
  const pageRows = shown.slice((page - 1) * perPage, page * perPage);
  const shownSpend = shown.filter((l) => l.kind !== "revenue");
  const hasRevenue = shown.length > shownSpend.length;

  if (doc.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!b) {
    return (
      <Page>
        <Card>
          <EmptyState icon={FileSpreadsheet} text="This budget is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to budgets</ButtonLink>} />
        </Card>
      </Page>
    );
  }

  const approval: any = b.expand?.approval;
  const isApprover = approval?.status === "pending" && String(approval.pending_approvers || "").split(",").includes(me?.id);
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const returnNote = [...trail.actions].reverse().find((a: any) => a.action === "return")?.comment;
  const approved = b.status === "approved";
  const fy = b.expand?.fiscal_year;

  // Live use of this budget's spending lines (approved budgets only).
  const live = approved && usage.data ? items.filter((l) => l.kind !== "revenue").map((l) => figures[l.id]).filter(Boolean) as BudgetLineUsage[] : [];
  const liveSum = (k: "budget" | "committed" | "actual" | "available") => live.reduce((a, f) => a + f[k], 0);
  const liveBudget = liveSum("budget");
  const liveUsed = liveSum("committed") + liveSum("actual");

  const openLine = (l: any) => setEditing({ ...l, phasing: l.phasing || [] });
  const addLine = () => setEditing({ kind: "expense", department: b.department || "", phasing: [], original_amount: "" });

  const primary = editable ? (
    <Button variant="primary" icon={Send} onClick={() => run(() => budgetApi.budgetAction(b.id, "submit"), `${b.number} submitted for approval`)} loading={busy} disabled={!items.length}>Submit for approval</Button>
  ) : approved ? (
    <ButtonLink to="/dashboard/budget/revisions/new" variant={can("manage_budgets") ? "primary" : "secondary"} icon={GitCompareArrows}>Revise this budget</ButtonLink>
  ) : null;
  const secondary = editable ? (
    <>
      <Button icon={Plus} onClick={addLine}>Add line</Button>
      <Button icon={Upload} onClick={() => setImportOpen(true)}>Import from Excel</Button>
    </>
  ) : null;
  const more: MenuItem[] = [
    { label: "Export to Excel", icon: FileSpreadsheet, onSelect: () => exportAs("xlsx"), hidden: !canExport, disabled: !items.length },
    { label: "Export to PDF", icon: FileText, onSelect: () => exportAs("pdf"), hidden: !canExport, disabled: !items.length },
    { label: "Export to CSV", icon: Sheet, onSelect: () => exportAs("csv"), hidden: !canExport, disabled: !items.length },
    { label: "Cancel budget", icon: Ban, danger: true, onSelect: () => setCancelOpen(true), hidden: !(can("manage_budgets") && ["draft", "returned", "pending_approval"].includes(b.status)) },
  ];

  const amountColumns: Column<any>[] = [
    { key: "code", header: "Line", nowrap: true, cell: (l) => <DocNo value={l.code} className="font-semibold text-ims-text" />, sub: (l) => `${l.expand?.gl_account?.code || ""} ${l.expand?.gl_account?.name || ""} · ${KIND_LABEL[l.kind] || l.kind}` },
    { key: "department", header: "Department", clamp: true, cell: (l) => l.expand?.department?.name || "—" },
    {
      key: "funding",
      header: "Funding / project",
      cell: (l) => (
        <>
          {l.expand?.funding_source?.code || "—"}
          {l.expand?.project && <span className="text-ims-muted"> · {l.expand.project.code}</span>}
        </>
      ),
    },
    {
      key: "amount",
      header: "Annual amount (RWF)",
      numeric: true,
      cell: (l) => <span className="font-semibold"><Num value={amountOf(l)} /></span>,
      sub: (l) => (l.revised_amount && l.revised_amount !== l.original_amount ? `Original ${fmtNumber(l.original_amount)}` : null),
      total: <Num value={shownSpend.reduce((a, l) => a + amountOf(l), 0)} />,
    },
    ...(approved
      ? [{
          key: "use",
          header: "Use",
          cell: (l: any) => (figures[l.id] && l.kind !== "revenue" ? <UseBar line={figures[l.id]} compact /> : <span className="text-t-small text-ims-muted">{l.kind === "revenue" ? "Revenue line" : "—"}</span>),
        } as Column<any>]
      : []),
  ];
  const phasingColumns: Column<any>[] = [
    { key: "code", header: "Line", nowrap: true, cell: (l) => <DocNo value={l.code} className="font-semibold text-ims-text" />, sub: (l) => (l.kind === "revenue" ? "Revenue" : undefined) },
    ...MONTHS_FY.map((m, i) => ({
      key: m,
      header: m,
      numeric: true,
      cell: (l: any) => <Num value={(l.phasing || [])[i] || 0} />,
      total: <Num value={shownSpend.reduce((a, l) => a + ((l.phasing || [])[i] || 0), 0)} />,
    })),
    { key: "year", header: "Year (RWF)", numeric: true, className: "font-semibold", cell: (l) => <Num value={amountOf(l)} />, total: <Num value={shownSpend.reduce((a, l) => a + amountOf(l), 0)} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to budgets", to: LIST }}
        number={b.number}
        type={`Budget${fy?.name ? ` · ${fy.name}` : ""}`}
        status={DOC_STATUS[b.status]?.label || b.status}
        statusNote={stepName ? `At “${stepName}”` : DOC_STATUS[b.status]?.note}
        title={b.name}
        facts={[
          b.expand?.prepared_by?.name ? { label: "Prepared by", value: b.expand.prepared_by.name } : null,
          b.expand?.department?.name,
          <strong key="total" className="font-bold text-ims-text">{fmtMoney(b.total)}</strong>,
          `${fmtNumber(b.line_count)} line${b.line_count === 1 ? "" : "s"}`,
          b.approved_at ? { label: "Approved", value: fmtDate(b.approved_at) } : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary}
            <DecisionButtons approval={approval} number={b.number} onDone={refresh} />
            {primary}
          </>
        }
      />

      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}
      {b.status === "returned" && editable && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Returned for changes{returnNote ? `: “${returnNote}”` : ""}. Correct the lines and submit it again.</span>
        </p>
      )}

      {live.length > 0 && (
        <KpiBand
          loading={usage.isLoading}
          items={[
            { label: "Revised budget", value: fmtMoneyShort(liveBudget), sub: "Spending lines" },
            { label: "Committed", value: fmtMoneyShort(liveSum("committed")), sub: "Open orders" },
            { label: "Actual", value: fmtMoneyShort(liveSum("actual")), sub: "Spent" },
            { label: "Available", value: fmtMoneyShort(liveSum("available")), tone: liveSum("available") < 0 ? "danger" : "success", sub: `${liveBudget ? Math.round((liveUsed / liveBudget) * 1000) / 10 : 0}% used` },
          ]}
        />
      )}

      <Tabs
        label="Budget sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "lines", label: "Budget lines", count: items.length },
          { key: "approvals", label: "Approvals" },
          { key: "documents", label: "Documents", count: (b.attachments || []).length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <Card>
          <CardHeader title="Budget" />
          <Details
            columns={3}
            items={[
              { label: "Fiscal year", value: fy?.name, hint: fy ? `${fmtDate(fy.start_date)} – ${fmtDate(fy.end_date)}` : undefined },
              { label: "Department", value: b.expand?.department?.name },
              { label: "Prepared by", value: b.expand?.prepared_by?.name },
              { label: "Spending budget", value: fmtMoney(b.total), hint: "Expense and capital lines" },
              { label: "Revenue budget", value: fmtMoney(revenue), hint: "Expected income" },
              { label: "Lines", value: fmtNumber(b.line_count) },
              { label: "Created", value: fmtDateTime(b.created) },
              { label: "Approved", value: b.approved_at ? fmtDate(b.approved_at) : null },
              { label: "Description", value: b.description ? <span className="whitespace-pre-line">{b.description}</span> : null, wide: true },
            ]}
          />
        </Card>
      )}

      {tab === "lines" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader
              className="mb-0"
              title="Budget lines"
              subtitle={view === "phasing" ? "Monthly amounts from July to June, in RWF." : approved ? "Annual amount per line. Open a line for its commitments and actuals." : editable ? "Annual amount per line. Open a line to change it." : "Annual amount per line."}
              action={
                <Segmented
                  ariaLabel="Show"
                  className="w-full sm:w-auto"
                  value={view}
                  onChange={(v) => setView(v as "amounts" | "phasing")}
                  options={[{ value: "amounts", label: "Annual amounts" }, { value: "phasing", label: "Monthly phasing" }]}
                />
              }
            />
          </div>
          {lines.isLoading || items.length > 0 ? (
            <>
              <FilterBar
                search={{ value: search, onChange: setSearch, placeholder: "Search line, account or department" }}
                right={<span className="text-t-small tabular-nums text-ims-muted">{fmtNumber(shown.length)} of {fmtNumber(items.length)} lines</span>}
              />
              <div className="border-t border-ims-divider">
                <DataTable
                  columns={view === "phasing" ? phasingColumns : amountColumns}
                  rows={pageRows}
                  rowKey={(l) => l.id}
                  loading={lines.isLoading}
                  onRowClick={approved && usage.data ? (l) => figures[l.id] && setDrill(figures[l.id]) : editable ? openLine : undefined}
                  rowActions={editable ? () => [
                    { label: "Edit", icon: Pencil, onSelect: openLine },
                    { label: "Remove", icon: Trash2, danger: true, onSelect: (l: any) => setRemoving(l) },
                  ] : undefined}
                  totalLabel={hasRevenue ? "Spending total" : "Total"}
                  minWidth={view === "phasing" ? 1560 : 900}
                  caption="Budget lines"
                  empty={<EmptyState compact icon={Search} text="No line matches. Clear the search." />}
                  footer={shown.length > 15 ? <Pager page={page} perPage={perPage} total={shown.length} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} /> : undefined}
                />
              </div>
              {hasRevenue && <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">Revenue lines are listed but not counted in the spending total.</p>}
            </>
          ) : (
            <EmptyState
              icon={ListTree}
              text={editable ? "No lines yet. Add them one by one or import them from the Excel template." : "No lines on this budget."}
              action={editable ? <Button variant="primary" icon={Upload} onClick={() => setImportOpen(true)}>Import from Excel</Button> : undefined}
            />
          )}
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={trail.actions} />}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Budget submissions, council resolutions and assumptions." />
          <DocumentUploads collection="budgets" record={b} canAdd={can(["manage_budgets", "approve_budgets"])} canRemove={can("manage_budgets") && EDITABLE.includes(b.status)} onChange={refresh} hint="Budget submissions, council resolutions, assumptions…" />
        </Card>
      )}

      {tab === "activity" && <Chatter items={toChatter(trail.actions, trail.audit)} />}

      <LineEditor value={editing} onChange={setEditing} reference={ref.data} busy={busy} onSave={saveLine} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} budget={b} reference={ref.data} onDone={() => { setImportOpen(false); refresh(); }} />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${b.number}?`}
        description="Any running approval stops. The budget stays on record as cancelled."
        confirmLabel="Cancel budget"
        danger
        reason={{ label: "Reason", placeholder: "Why is this budget cancelled?" }}
        onConfirm={async (reason) => {
          const ok = await run(() => budgetApi.budgetAction(b.id, "cancel", reason), `${b.number} cancelled`);
          if (!ok) throw new Error("not cancelled");
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove line ${removing?.code || ""}?`}
        description={`It is taken out of ${b.number}. You can add it again while the budget is a draft.`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const ok = await run(() => pocketbase.collection("budget_lines").delete(removing.id), `Line ${removing.code} removed`);
          if (!ok) throw new Error("not removed");
        }}
      />
      <LineLedgerDialog line={drill} onClose={() => setDrill(null)} />
    </Page>
  );
}

function LineEditor({ value, onChange, reference, busy, onSave }: { value: any; onChange: (v: any) => void; reference?: any; busy: boolean; onSave: () => void }) {
  if (!value) return null;
  const set = (patch: any) => onChange({ ...value, ...patch });
  const accounts = (reference?.accounts || []).filter((a: any) => a.type === KIND_ACCOUNT[value.kind || "expense"]);
  const amount = Math.round(Number(value.original_amount) || 0);
  const phasing: number[] = value.phasing?.length === 12 ? value.phasing : [];
  const sum = phasing.reduce((a, v) => a + (Number(v) || 0), 0);
  return (
    <Modal
      open
      onClose={() => (busy ? undefined : onChange(null))}
      size="lg"
      title={value.id ? `Edit ${value.code}` : "New budget line"}
      description="A line is the unit of budget control: account × department × funding source × project."
      footer={
        <>
          <Button onClick={() => onChange(null)} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={onSave} loading={busy}>Save line</Button>
        </>
      }
    >
      <ModalSection title="Line">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code" required htmlFor="bl-code" hint="For example FIN-5201-MC">
            <Input id="bl-code" value={value.code || ""} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className="font-mono" />
          </Field>
          <Field label="Type" required>
            <Segmented ariaLabel="Type" value={value.kind || "expense"} onChange={(k) => set({ kind: k, gl_account: "" })} options={[{ value: "expense", label: "Expense" }, { value: "capital", label: "Capital" }, { value: "revenue", label: "Revenue" }]} />
          </Field>
          <Field label="GL account" required htmlFor="bl-account" className="sm:col-span-2">
            <Select id="bl-account" value={value.gl_account || ""} onChange={(e) => set({ gl_account: e.target.value })}>
              <option value="">Choose the account…</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </Field>
          <Field label="Department" required htmlFor="bl-department">
            <Select id="bl-department" value={value.department || ""} onChange={(e) => set({ department: e.target.value })}>
              <option value="">Choose the department…</option>
              {(reference?.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Funding source" required htmlFor="bl-funding">
            <Select id="bl-funding" value={value.funding_source || ""} onChange={(e) => set({ funding_source: e.target.value, project: "" })}>
              <option value="">Choose the funding source…</option>
              {(reference?.funding || []).map((f: any) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
            </Select>
          </Field>
          <Field label="Project" htmlFor="bl-project">
            <Select id="bl-project" value={value.project || ""} onChange={(e) => set({ project: e.target.value })}>
              <option value="">No project</option>
              {(reference?.projects || []).filter((p: any) => !value.funding_source || !p.funding_source || p.funding_source === value.funding_source).map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Cost centre" htmlFor="bl-centre">
            <Select id="bl-centre" value={value.cost_centre || ""} onChange={(e) => set({ cost_centre: e.target.value })}>
              <option value="">No cost centre</option>
              {(reference?.centres || []).map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Annual amount" required htmlFor="bl-amount">
            <MoneyInput id="bl-amount" value={value.original_amount === "" || value.original_amount === null || value.original_amount === undefined ? "" : Number(value.original_amount)} onChange={(n) => set({ original_amount: n })} />
          </Field>
        </div>
      </ModalSection>
      <ModalSection title="Monthly phasing" description="July to June. Left empty, the annual amount is spread evenly.">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => set({ phasing: spread(amount) })} disabled={!amount}>Spread evenly</Button>
          {phasing.length === 12 && (
            <span className={cn("text-t-small", sum === amount ? "text-ims-success" : "text-ims-danger")}>
              Months total {fmtMoney(sum)}{sum === amount ? ", matching the annual amount." : `. ${fmtMoney(amount - sum)} still to allocate.`}
            </span>
          )}
        </div>
        {phasing.length === 12 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {MONTHS_FY.map((m, i) => (
              <div key={m} className="min-w-0">
                <label htmlFor={`bl-month-${i}`} className="mb-1 block text-t-small font-semibold text-ims-muted">{m}</label>
                <Input id={`bl-month-${i}`} type="number" min={0} value={phasing[i]} onChange={(e) => set({ phasing: phasing.map((v, j) => (j === i ? e.target.value : v)) })} className="h-9 px-2 text-right tabular-nums" />
              </div>
            ))}
          </div>
        )}
      </ModalSection>
    </Modal>
  );
}

const TEMPLATE_HEADERS = ["code", "name", "kind", "gl_account", "department", "funding_source", "project", "cost_centre", "amount", ...MONTHS_FY];

function ImportDialog({ open, onClose, budget, reference, onDone }: { open: boolean; onClose: () => void; budget: any; reference?: any; onDone: () => void }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [fileName, setFileName] = React.useState("");
  const [replace, setReplace] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function template() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const example = [["FIN-5201-MC", "Office supplies — Finance", "expense", "5201", "FIN", "MC", "", "FIN", 12000000, ...spread(12000000)]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...example]), "Budget lines");
    const lists = [["Accounts (code)", "Account name", "Type", "", "Departments (code)", "Department", "", "Funding (code)", "Funding source", "", "Projects (code)", "Project"]];
    const n = Math.max(reference?.accounts?.length || 0, reference?.departments?.length || 0, reference?.funding?.length || 0, reference?.projects?.length || 0);
    for (let i = 0; i < n; i++) {
      const a = reference?.accounts?.[i], d = reference?.departments?.[i], f = reference?.funding?.[i], p = reference?.projects?.[i];
      lists.push([a?.code || "", a?.name || "", a?.type || "", "", d?.code || "", d?.name || "", "", f?.code || "", f?.name || "", "", p?.code || "", p?.name || ""]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lists), "Lists");
    XLSX.writeFile(wb, "budget-lines-template.xlsx");
  }

  async function read(file: File) {
    setError("");
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = wb.Sheets["Budget lines"] || wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
    const parsed = raw
      .filter((r) => String(r.code || "").trim())
      .map((r) => {
        const months = MONTHS_FY.map((m) => Number(r[m]) || 0);
        return {
          code: String(r.code).trim(), name: String(r.name || ""), kind: String(r.kind || "expense").toLowerCase(), gl_account: String(r.gl_account || "").trim(),
          department: String(r.department || "").trim(), funding_source: String(r.funding_source || "").trim(), project: String(r.project || "").trim(),
          cost_centre: String(r.cost_centre || "").trim(), amount: Math.round(Number(r.amount) || 0), phasing: months.some(Boolean) ? months : [],
        };
      });
    setRows(parsed);
    setFileName(file.name);
    if (!parsed.length) setError("No lines found. Use the template: one line per row, each with a code.");
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await budgetApi.saveLines(budget.id, rows, replace);
      toast.success(`${r.saved} lines imported into ${budget.number}`);
      setRows([]);
      setFileName("");
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const total = rows.reduce((a, r) => a + (r.kind === "revenue" ? 0 : r.amount), 0);
  const columns: Column<any>[] = [
    { key: "code", header: "Code", nowrap: true, cell: (r) => <DocNo value={r.code} /> },
    { key: "kind", header: "Type", cell: (r) => KIND_LABEL[r.kind] || r.kind },
    { key: "gl_account", header: "Account", nowrap: true, cell: (r) => r.gl_account || "—" },
    { key: "department", header: "Department", cell: (r) => r.department || "—" },
    { key: "funding", header: "Funding", cell: (r) => r.funding_source || "—" },
    { key: "project", header: "Project", cell: (r) => r.project || "—" },
    { key: "amount", header: "Amount (RWF)", numeric: true, cell: (r) => <Num value={r.amount} />, total: <Num value={total} /> },
  ];
  return (
    <Modal
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      size="lg"
      title="Import budget lines from Excel"
      description="Every row is checked first. If one has a problem, nothing is saved and you see which rows to fix."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="primary" icon={FileSpreadsheet} onClick={submit} disabled={!rows.length} loading={busy}>{busy ? "Checking…" : rows.length ? `Check and import ${fmtNumber(rows.length)} lines` : "Check and import"}</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Download} onClick={template}>Download template</Button>
        <label className={cn(buttonClass({ variant: "secondary" }), "max-w-full cursor-pointer focus-within:ring-2 focus-within:ring-ims-focus focus-within:ring-offset-2")}>
          <Upload size={16} aria-hidden /> <span className="truncate">{fileName || "Choose the filled template…"}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </label>
        <Checkbox label="Replace the current lines" checked={replace} onChange={setReplace} className="items-center sm:ml-auto" />
      </div>
      {error && <p role="alert" className="rounded-control border border-ims-danger/30 bg-ims-danger-bg px-3 py-2 text-t-small text-ims-danger">{error}</p>}
      {rows.length > 0 && (
        <>
          <p className="text-t-small text-ims-muted">{fmtNumber(rows.length)} lines read · spending total <strong className="font-semibold text-ims-text">{fmtMoney(total)}</strong>{rows.length > 200 ? " · the first 200 are shown" : ""}</p>
          <div className="overflow-hidden rounded-control border border-ims-border">
            <DataTable columns={columns} rows={rows.slice(0, 200)} rowKey={(_, i) => String(i)} totalLabel="Spending total" minWidth={640} caption="Lines read from the file" />
          </div>
        </>
      )}
    </Modal>
  );
}
