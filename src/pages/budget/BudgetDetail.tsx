/**
 * Budget document: lines with monthly phasing (editable while draft / returned), Excel import with a
 * template, submission, approval (Budget Officer → DAF → SG) and, once approved, live utilisation per line.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { CalendarRange, Download, FileSpreadsheet, ListTree, Pencil, Plus, Send, Trash2, Upload, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { BudgetLineUsage, KIND_LABEL, MONTHS_FY, budgetApi } from "@/lib/budget";
import { rwf, showDay } from "@/lib/ims";
import { DOC_STATUS, errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { Field, FormBlock, FormDialog, inputCls, Segmented } from "@/components/portal/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineLedgerDialog, UseBar } from "@/components/budget/BudgetKit";
import { cn } from "@/utils";

const STEPS = [{ key: "draft", label: "Draft" }, { key: "pending_approval", label: "In approval" }, { key: "approved", label: "Approved" }];
const KIND_ACCOUNT: Record<string, string> = { expense: "expense", capital: "asset", revenue: "revenue" };
const EDITABLE = ["draft", "returned"];

function spread(amount: number) {
  const base = Math.floor(amount / 12);
  const out = Array(12).fill(base);
  out[11] += amount - base * 12;
  return out;
}

export default function BudgetDetail() {
  const { budgetId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("lines");
  const [editing, setEditing] = React.useState<any>(null);
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

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveLine() {
    const l = editing;
    const amount = Math.round(Number(l.original_amount) || 0);
    const phasing = (l.phasing || []).map((v: any) => Math.round(Number(v) || 0));
    if (phasing.length === 12 && phasing.reduce((a: number, v: number) => a + v, 0) !== amount) return toast.error("The monthly amounts must add up to the annual amount — use “Spread evenly” or correct the months.");
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

  if (doc.isLoading) return <div className="p-6"><ListSkeleton rows={8} /></div>;
  if (!b) return <div className="p-6"><EmptyState icon={FileSpreadsheet} title="Budget not found" text="It may have been deleted." /></div>;

  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Budget", link: "/dashboard/budget" }, { title: "Budgets", link: "/dashboard/budget/budgets" }, { title: b.number }]}
        steps={STEPS}
        current={b.status === "returned" ? "draft" : b.status}
        actions={
          <>
            {editable && <Button size="sm" onClick={() => run(() => budgetApi.budgetAction(b.id, "submit"), `${b.number} submitted for approval`)} disabled={busy || !items.length}><Send size={14} /> Submit for approval</Button>}
            {editable && <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "expense", department: b.department || "", phasing: [], original_amount: "" })}><Plus size={14} /> Add line</Button>}
            {editable && <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload size={14} /> Import from Excel</Button>}
            <DecisionButtons approval={b.expand?.approval} number={b.number} onDone={refresh} />
            <ExportMenu onExport={doExport} permission={["export_budgets", "export_reports", "manage_budgets"]} disabled={!items.length} />
            {can("manage_budgets") && ["draft", "returned", "pending_approval"].includes(b.status) && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelOpen(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={b.status === "rejected" ? { label: "Rejected", tone: "danger" } : b.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : b.status === "approved" ? { label: "Approved", tone: "success" } : b.status === "returned" ? { label: "Returned", tone: "warning" } : undefined}>
        <SheetTitle kicker={`Budget · ${b.expand?.fiscal_year?.name || ""}`} title={<>{b.number}</>} badges={<StatusBadge status={b.status} map={DOC_STATUS} />} />
        <p className="-mt-4 mb-5 text-[15px] font-medium text-slate-700">{b.name}</p>
        <FieldGrid
          left={[
            { label: "Fiscal year", value: b.expand?.fiscal_year ? `${b.expand.fiscal_year.name} (${showDay(b.expand.fiscal_year.start_date)} – ${showDay(b.expand.fiscal_year.end_date)})` : "" },
            { label: "Prepared by", value: b.expand?.prepared_by?.name },
            { label: "Description", value: b.description },
          ]}
          right={[
            { label: "Spending budget", value: <span className="font-semibold tabular-nums">{rwf(b.total)}</span>, hint: "Expense and capital lines" },
            { label: "Revenue budget", value: <span className="tabular-nums">{rwf(revenue)}</span> },
            { label: "Lines", value: b.line_count },
            { label: "Approved", value: b.approved_at ? showDay(b.approved_at) : "" },
          ]}
        />
        <Notebook
          tabs={[{ key: "lines", label: "Budget lines", count: items.length }, { key: "phasing", label: "Monthly phasing" }, { key: "approval", label: "Approval" }]}
          active={tab}
          onChange={setTab}
        />
        <div className="pt-4">
          {tab === "lines" && (lines.isLoading ? <ListSkeleton rows={6} /> : !items.length ? (
            <EmptyState icon={ListTree} title="No lines yet" text="Add lines one by one or import them from the Excel template." action={editable && <Button size="sm" onClick={() => setImportOpen(true)}><Upload size={14} /> Import from Excel</Button>} />
          ) : (
            <div className="max-h-[620px] overflow-auto">
              <table className="dnr-grid w-full min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr><th>Line</th><th>Department</th><th>Funding / project</th><th className="text-right">Annual amount</th>{b.status === "approved" && <th>Utilisation</th>}{editable && <th />}</tr>
                </thead>
                <tbody>
                  {items.map((l) => {
                    const f = figures[l.id];
                    return (
                      <tr key={l.id} className={cn(f && "cursor-pointer hover:bg-slate-50")} onClick={() => f && setDrill(f)}>
                        <td>
                          <span className="block font-mono text-[12.5px] font-semibold text-slate-800">{l.code}</span>
                          <span className="block text-[12px] text-slate-500">{l.expand?.gl_account?.code} {l.expand?.gl_account?.name} · {KIND_LABEL[l.kind]}</span>
                        </td>
                        <td className="text-[12.5px]">{l.expand?.department?.name}</td>
                        <td className="text-[12.5px]">{l.expand?.funding_source?.code}{l.expand?.project && <span className="text-slate-500"> · {l.expand.project.code}</span>}</td>
                        <td className="text-right font-medium tabular-nums">{rwf(l.revised_amount || l.original_amount)}{l.revised_amount && l.revised_amount !== l.original_amount ? <span className="block text-[11px] text-slate-400">original {rwf(l.original_amount)}</span> : null}</td>
                        {b.status === "approved" && <td>{f && l.kind !== "revenue" ? <UseBar line={f} compact /> : <span className="text-[12px] text-slate-400">{l.kind === "revenue" ? "revenue" : "—"}</span>}</td>}
                        {editable && (
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <span className="inline-flex gap-0.5">
                              <button type="button" onClick={() => setEditing({ ...l, phasing: l.phasing || [] })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${l.code}`}><Pencil size={14} /></button>
                              <button type="button" onClick={() => run(() => pocketbase.collection("budget_lines").delete(l.id), `Line ${l.code} removed`)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${l.code}`}><Trash2 size={14} /></button>
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {tab === "phasing" && (
            <div className="overflow-x-auto">
              <table className="dnr-grid w-full min-w-[1100px] text-[12px]">
                <thead><tr><th>Line</th>{MONTHS_FY.map((m) => <th key={m} className="text-right">{m}</th>)}<th className="text-right">Year</th></tr></thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.id}>
                      <td className="font-mono font-semibold">{l.code}</td>
                      {MONTHS_FY.map((m, i) => <td key={m} className="text-right tabular-nums text-slate-600">{Math.round(((l.phasing || [])[i] || 0) / 1000).toLocaleString()}k</td>)}
                      <td className="text-right font-semibold tabular-nums">{Math.round((l.revised_amount || l.original_amount) / 1000).toLocaleString()}k</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === "approval" && <ApprovalTracker approval={b.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>

      <LineEditor value={editing} onChange={setEditing} reference={ref.data} busy={busy} onSave={saveLine} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} budget={b} reference={ref.data} onDone={() => { setImportOpen(false); refresh(); }} />
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <CancelBody onCancel={(reason) => run(() => budgetApi.budgetAction(b.id, "cancel", reason), `${b.number} cancelled`).then(() => setCancelOpen(false))} onClose={() => setCancelOpen(false)} />
      </Dialog>
      <LineLedgerDialog line={drill} onClose={() => setDrill(null)} />
      {b.status === "approved" && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => navigate("/dashboard/budget/revisions/new")}><Wallet size={14} /> Revise this budget</Button>
        </div>
      )}
    </DocumentPage>
  );
}

function CancelBody({ onCancel, onClose }: { onCancel: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return (
    <DialogContent className="max-w-md bg-white">
      <DialogHeader>
        <DialogTitle>Cancel this budget?</DialogTitle>
        <DialogDescription>Any running approval stops. The budget stays on record as cancelled.</DialogDescription>
      </DialogHeader>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary" />
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Keep</Button>
        <Button variant="danger" disabled={!reason.trim()} onClick={() => onCancel(reason.trim())}>Cancel budget</Button>
      </DialogFooter>
    </DialogContent>
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
    <FormDialog open onClose={() => onChange(null)} icon={ListTree} wide title={value.id ? `Edit ${value.code}` : "New budget line"} description="A line is the unit of budget control: account × department × funding source × project." submitLabel="Save line" busy={busy} onSubmit={onSave}>
      <FormBlock icon={ListTree} title="Line">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code" required hint="e.g. FIN-5201-MC"><input value={value.code || ""} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={cn(inputCls, "font-mono")} /></Field>
          <Field label="Type" required>
            <Segmented value={value.kind || "expense"} onChange={(k) => set({ kind: k, gl_account: "" })} options={[{ value: "expense", label: "Expense" }, { value: "capital", label: "Capital" }, { value: "revenue", label: "Revenue" }]} />
          </Field>
          <Field label="GL account" required className="sm:col-span-2">
            <select value={value.gl_account || ""} onChange={(e) => set({ gl_account: e.target.value })} className={inputCls}>
              <option value="">Choose…</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </Field>
          <Field label="Department" required>
            <select value={value.department || ""} onChange={(e) => set({ department: e.target.value })} className={inputCls}>
              <option value="">Choose…</option>
              {(reference?.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Funding source" required>
            <select value={value.funding_source || ""} onChange={(e) => set({ funding_source: e.target.value, project: "" })} className={inputCls}>
              <option value="">Choose…</option>
              {(reference?.funding || []).map((f: any) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={value.project || ""} onChange={(e) => set({ project: e.target.value })} className={inputCls}>
              <option value="">— None —</option>
              {(reference?.projects || []).filter((p: any) => !value.funding_source || !p.funding_source || p.funding_source === value.funding_source).map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <Field label="Cost centre">
            <select value={value.cost_centre || ""} onChange={(e) => set({ cost_centre: e.target.value })} className={inputCls}>
              <option value="">— None —</option>
              {(reference?.centres || []).map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>
          <Field label="Annual amount (RWF)" required>
            <input type="number" min={0} step={1000} value={value.original_amount ?? ""} onChange={(e) => set({ original_amount: e.target.value })} className={cn(inputCls, "text-right tabular-nums")} />
          </Field>
        </div>
      </FormBlock>
      <FormBlock icon={CalendarRange} title="Monthly phasing (July → June)">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => set({ phasing: spread(amount) })} disabled={!amount}>Spread evenly</Button>
          {phasing.length === 12 && (
            <span className={cn("text-[12.5px]", sum === amount ? "text-emerald-700" : "text-red-700")}>
              Months total {rwf(sum)} {sum === amount ? "— matches the annual amount" : `— ${rwf(amount - sum)} to allocate`}
            </span>
          )}
          {!phasing.length && <span className="text-[12.5px] text-slate-500">Left empty, the amount is spread evenly.</span>}
        </div>
        {phasing.length === 12 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {MONTHS_FY.map((m, i) => (
              <label key={m} className="text-[12px] text-slate-600">
                {m}
                <input type="number" min={0} value={phasing[i]} onChange={(e) => set({ phasing: phasing.map((v, j) => (j === i ? e.target.value : v)) })} className={cn(inputCls, "mt-0.5 h-9 text-right tabular-nums")} />
              </label>
            ))}
          </div>
        )}
      </FormBlock>
    </FormDialog>
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
    if (!parsed.length) setError("No lines found. Use the template: one line per row with a code.");
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col bg-white">
        <DialogHeader>
          <DialogTitle>Import budget lines from Excel</DialogTitle>
          <DialogDescription>Every row is validated first; if one has a problem nothing is saved and you see which rows to fix.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={template}><Download size={14} /> Download template</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-btn border border-slate-200 bg-white px-3 text-[12.7px] font-medium text-slate-700 hover:bg-slate-50">
            <Upload size={14} /> {fileName || "Choose the filled template…"}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" /> Replace the current lines
          </label>
        </div>
        {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>}
        {rows.length > 0 && (
          <>
            <p className="text-[12.5px] text-slate-600">{rows.length} lines read · spending total <strong>{rwf(total)}</strong></p>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
              <table className="dnr-grid w-full text-[12px]">
                <thead><tr><th>Code</th><th>Type</th><th>Account</th><th>Dept.</th><th>Funding</th><th>Project</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i}><td className="font-mono">{r.code}</td><td>{r.kind}</td><td>{r.gl_account}</td><td>{r.department}</td><td>{r.funding_source}</td><td>{r.project}</td><td className="text-right tabular-nums">{rwf(r.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={submit} disabled={!rows.length || busy}><FileSpreadsheet size={14} /> {busy ? "Validating…" : `Validate and import ${rows.length || ""} lines`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
