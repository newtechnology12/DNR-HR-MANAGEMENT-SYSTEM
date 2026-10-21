import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CalendarRange, CheckCheck, Download, FileSpreadsheet, Info, Pencil, Save, Upload, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, MetricGroup, PageHeader } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { LeaveBalance, MONTHS, MONTHS_SHORT, PlanRow, leaveApi } from "@/lib/hr";
import { cn } from "@/utils";
import { Field, inputCls, useMe } from "@/components/portal/kit";

const thisYear = new Date().getFullYear();
const n1 = (v: number) => (Math.round((Number(v) || 0) * 10) / 10).toString();
type Draft = Record<string, Record<number, number>>;

export default function LeavePlan() {
  const queryClient = useQueryClient();
  const me = useMe();
  const { canPerform } = useRoles();
  const [year, setYear] = React.useState(thisYear);
  const [department, setDepartment] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>({});
  const [saving, setSaving] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [detail, setDetail] = React.useState<LeaveBalance | null>(null);
  const [importing, setImporting] = React.useState(false);

  const q = useQuery(["leave-balances", year, department], () => leaveApi.balances(year, { department }), { keepPreviousData: true });
  const departments = useQuery(["departments-simple"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  const items = (q.data?.items || []).filter((r) => `${r.employee.name} ${r.employee.department_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const cfg = q.data?.settings;
  const isHR = me.data?.hrScope === "all";
  const canManage = canPerform("update_leave");
  const canEditRow = (r: LeaveBalance) => (r.employee.id === me.data?.id ? r.plan?.status !== "approved" || canManage : canManage && r.employee.id !== me.data?.id);
  const month = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 0;

  const val = (r: LeaveBalance, m: number) => (draft[r.employee.id]?.[m] ?? Number(r.months?.[m] || 0));
  const plannedOf = (r: LeaveBalance) => Array.from({ length: 12 }, (_, i) => val(r, i + 1)).reduce((a, b) => a + b, 0);
  const setCell = (r: LeaveBalance, m: number, v: string) => {
    const n = Math.max(0, Math.min(31, Number(v) || 0));
    setDraft((d) => ({ ...d, [r.employee.id]: { ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, val(r, i + 1)])), ...(d[r.employee.id] || {}), [m]: n } }));
  };

  const totals = {
    staff: items.length,
    entitlement: items.reduce((a, r) => a + r.entitlement, 0),
    taken: items.reduce((a, r) => a + r.taken, 0),
    planned: items.reduce((a, r) => a + plannedOf(r), 0),
    approved: items.filter((r) => r.plan?.status === "approved").length,
  };
  const monthLoad = Array.from({ length: 12 }, (_, i) => ({ days: items.reduce((a, r) => a + val(r, i + 1), 0), people: items.filter((r) => val(r, i + 1) > 0).length }));
  const maxLoad = Math.max(1, ...monthLoad.map((m) => m.days));

  async function save() {
    const rows: PlanRow[] = Object.entries(draft).map(([employee, months]) => ({ employee, months }));
    if (!rows.length) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await leaveApi.savePlans(year, rows);
      if (res.errors.length) toast.warning(`${res.saved} saved, ${res.errors.length} not saved: ${res.errors.map((e) => `${e.name || ""} ${e.message}`).join("; ")}`);
      else toast.success(`Leave plan saved for ${res.saved} employee${res.saved === 1 ? "" : "s"}`);
      setDraft({});
      setEditing(false);
      queryClient.invalidateQueries(["leave-balances"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function approve() {
    try {
      const r = await leaveApi.approvePlans(year, selected);
      toast.success(`${r.approved} plan${r.approved === 1 ? "" : "s"} approved`);
      setSelected([]);
      queryClient.invalidateQueries(["leave-balances"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function exportExcel(template = false) {
    const header = ["Employee ID", "Email", "Staff name", "Department", "Years of service", "Entitlement", "Carried over", ...MONTHS, "Total planned", "Taken", "Balance"];
    const rows = (q.data?.items || []).map((r) => [
      r.employee.id, r.employee.email, r.employee.name, r.employee.department_name, r.years_of_service, r.entitlement, r.carried_over,
      ...Array.from({ length: 12 }, (_, i) => (template ? Number(r.months?.[i + 1] || 0) || "" : val(r, i + 1))),
      plannedOf(r), r.taken, r.balance,
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map((h, i) => ({ wch: i === 2 ? 26 : i === 1 ? 28 : i === 3 ? 26 : i === 0 ? 17 : 10 }));
    ws["!freeze"] = { xSplit: 3, ySplit: 1 } as any;
    XLSX.utils.book_append_sheet(wb, ws, "Leave plan");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [`Annual leave plan ${year} — instructions`],
        [],
        ["1. Enter the number of working days each person plans to take in each month (January–December). Half days allowed (0.5)."],
        ["2. Do not change the Employee ID or Email columns: they are used to match each row to the right person."],
        ["3. Rows whose person cannot be found are shown before anything is saved; nothing is imported without your confirmation."],
        ["4. Carried over: only HR can change it; leave it as is otherwise."],
        [`5. Entitlement: ${cfg?.accrual ?? 1.5} days per month of service + ${cfg?.extra ?? 1} day per ${cfg?.every ?? 3} years of service + carried-over days (max ${cfg?.maxCarry ?? 5}).`],
        ["6. Save the file and use Import on the leave plan page."],
      ]),
      "Instructions"
    );
    XLSX.writeFile(wb, template ? `leave-plan-${year}-template.xlsx` : `leave-plan-${year}.xlsx`);
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title={`Annual leave plan ${year}`}
        description="Every employee's entitlement, planned leave by month, and leave actually taken. Weekends and public holidays are not counted."
        breadcrumbs={[{ title: "HR", link: "/dashboard/hr/leaves" }, { title: "Leave plan", link: "/dashboard/hr/leave-plan" }]}
        actions={
          editing ? (
            <>
              <Button size="sm" variant="outline" onClick={() => { setDraft({}); setEditing(false); }}><X size={14} /> Cancel</Button>
              <Button size="sm" disabled={saving} onClick={save}><Save size={14} /> {saving ? "Saving…" : `Save changes${Object.keys(draft).length ? ` (${Object.keys(draft).length})` : ""}`}</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => exportExcel(false)} disabled={!q.data}><Download size={14} /> Export</Button>
              {(canManage || isHR) && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><Upload size={14} /> Import</Button>}
              {canManage && selected.length > 0 && <Button size="sm" variant="outline" onClick={approve}><CheckCheck size={14} /> Approve {selected.length}</Button>}
              <Button size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit plan</Button>
            </>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select className={cn(inputCls, "sm:w-32")} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className={cn(inputCls, "sm:w-72")} value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {(departments.data || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="search" className={cn(inputCls, "sm:w-64")} placeholder="Search staff" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <MetricGroup
        title="Summary"
        icon={CalendarRange}
        columns={4}
        loading={q.isLoading}
        metrics={[
          { label: "Staff", value: totals.staff, sub: `${totals.approved} plans approved` },
          { label: "Total entitlement", value: `${n1(totals.entitlement)} days`, sub: `${n1(totals.entitlement / Math.max(1, totals.staff))} per person` },
          { label: "Planned", value: `${n1(totals.planned)} days`, sub: `${Math.round((totals.planned / Math.max(1, totals.entitlement)) * 100)}% of entitlement`, tone: totals.planned > totals.entitlement ? "danger" : "default" },
          { label: "Taken", value: `${n1(totals.taken)} days`, sub: `${n1(totals.entitlement - totals.taken)} days remaining`, tone: "success" },
        ]}
      />

      <details className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] text-slate-600">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-800"><Info size={14} /> How the entitlement is calculated</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><span className="font-medium">Annual accrual:</span> {cfg?.accrual ?? 1.5} working days for each month of service in the year (18 days for a full year; prorated from the joining month).</li>
          <li><span className="font-medium">Seniority:</span> +{cfg?.extra ?? 1} day for every {cfg?.every ?? 3} completed years of service{cfg?.maxSeniority ? `, up to ${cfg.maxSeniority} days` : ""}.</li>
          <li><span className="font-medium">Carried over:</span> unused days of the previous year, up to {cfg?.maxCarry ?? 5} days (HR can override per person).</li>
          <li><span className="font-medium">Adjustment:</span> manual correction by HR with a written reason.</li>
          <li>Rules and public holidays are set in Settings → Leave policy, following Law N° 66/2018 regulating labour in Rwanda.</li>
        </ul>
      </details>

      {q.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-card">
          <table className="dnr-grid w-full min-w-[1400px] border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                {canManage && <th className="sticky left-0 z-20 w-9 border-b border-slate-200 bg-slate-50 px-2 py-2" />}
                <th className={cn("sticky z-20 min-w-[210px] border-b border-slate-200 bg-slate-50 px-3 py-2", canManage ? "left-9" : "left-0")}>Staff</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right" title="Completed years of service at 1 January">Yrs</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right">Carry</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right">Entitl.</th>
                {MONTHS_SHORT.map((m, i) => (
                  <th key={m} className={cn("w-[58px] border-b border-slate-200 px-1 py-2 text-center", month === i + 1 && "bg-primary/10 text-primaryDark")}>{m}</th>
                ))}
                <th className="border-b border-slate-200 px-2 py-2 text-right">Planned</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right">Taken</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right">Balance</th>
                <th className="border-b border-slate-200 px-2 py-2">Plan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const planned = plannedOf(r);
                const over = planned > r.entitlement + 0.01;
                const editable = editing && canEditRow(r);
                const changed = Boolean(draft[r.employee.id]);
                return (
                  <tr key={r.employee.id} className={cn("group", changed ? "bg-amber-50/60" : "hover:bg-slate-50/70")}>
                    {canManage && (
                      <td className="sticky left-0 z-[1] border-b border-slate-100 bg-inherit px-2 py-1.5 text-center group-hover:bg-slate-50">
                        {r.plan && r.plan.status !== "approved" && r.employee.id !== me.data?.id && (
                          <input type="checkbox" aria-label={`Select ${r.employee.name}`} checked={selected.includes(r.employee.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.employee.id] : s.filter((x) => x !== r.employee.id)))} />
                        )}
                      </td>
                    )}
                    <td className={cn("sticky z-[1] border-b border-slate-100 bg-white px-3 py-1.5 group-hover:bg-slate-50", canManage ? "left-9" : "left-0", changed && "bg-amber-50")}>
                      <button type="button" className="text-left" onClick={() => setDetail(r)}>
                        <span className="block font-medium text-slate-900 hover:text-primaryDark">{r.employee.name}</span>
                        <span className="block text-[11.5px] text-slate-500">{r.employee.department_name}</span>
                      </button>
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600">{r.years_of_service}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600" title={r.carried_auto ? "Automatic from last year" : "Set by HR"}>{n1(r.carried_over)}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right font-semibold tabular-nums" title={`Accrual ${r.accrual} + seniority ${r.seniority_days} + carried ${r.carried_over} + adjustment ${r.adjustment}`}>{n1(r.entitlement)}</td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1;
                      const v = val(r, m);
                      const t = Number(r.taken_months?.[m] || 0);
                      return (
                        <td key={m} className={cn("border-b border-slate-100 px-1 py-1 text-center tabular-nums", month === m && "bg-primary/5")}>
                          {editable ? (
                            <input
                              type="number"
                              min={0}
                              max={31}
                              step={0.5}
                              inputMode="decimal"
                              value={v || ""}
                              placeholder="0"
                              onChange={(e) => setCell(r, m, e.target.value)}
                              className="h-8 w-[50px] rounded border border-slate-200 text-center text-[12.5px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              aria-label={`${r.employee.name} ${MONTHS[i]}`}
                            />
                          ) : (
                            <span className={cn("inline-flex min-w-[28px] justify-center rounded px-1 py-0.5", v ? "bg-sky-100 font-medium text-sky-900" : "text-slate-300")}>{v ? n1(v) : "·"}</span>
                          )}
                          {t > 0 && <span className="block text-[10.5px] font-medium text-emerald-700" title="Approved leave taken">✓ {n1(t)}</span>}
                        </td>
                      );
                    })}
                    <td className={cn("border-b border-slate-100 px-2 py-1.5 text-right font-medium tabular-nums", over && "text-red-600")} title={over ? "More than the entitlement" : ""}>{n1(planned)}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-emerald-700">{n1(r.taken)}{r.pending ? <span className="block text-[10.5px] text-amber-700">+{n1(r.pending)} pending</span> : null}</td>
                    <td className={cn("border-b border-slate-100 px-2 py-1.5 text-right font-semibold tabular-nums", r.balance < 0 ? "text-red-600" : "text-slate-900")}>{n1(r.balance)}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5">
                      {!r.plan ? <span className="text-[11.5px] text-slate-400">No plan</span> : r.plan.status === "approved" ? <Badge tone="success">Approved</Badge> : <Badge tone="warning">Draft</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-[11.5px] font-semibold text-slate-700">
                <td colSpan={canManage ? 5 : 4} className="sticky left-0 border-t-2 border-slate-200 bg-slate-50 px-3 py-2">Planned days / people per month</td>
                {monthLoad.map((m, i) => (
                  <td key={i} className="border-t-2 border-slate-200 px-1 py-2 text-center tabular-nums">
                    <div className="mx-auto mb-1 h-8 w-4 overflow-hidden rounded-sm bg-slate-200/70" title={`${n1(m.days)} days, ${m.people} people`}>
                      <div className="w-full bg-sky-500" style={{ height: `${(m.days / maxLoad) * 100}%`, marginTop: `${100 - (m.days / maxLoad) * 100}%` }} />
                    </div>
                    {n1(m.days)}
                    <span className="block text-[10.5px] font-normal text-slate-500">{m.people} ppl</span>
                  </td>
                ))}
                <td className="border-t-2 border-slate-200 px-2 py-2 text-right tabular-nums">{n1(totals.planned)}</td>
                <td className="border-t-2 border-slate-200 px-2 py-2 text-right tabular-nums">{n1(totals.taken)}</td>
                <td className="border-t-2 border-slate-200 px-2 py-2 text-right tabular-nums">{n1(totals.entitlement - totals.taken)}</td>
                <td className="border-t-2 border-slate-200" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-sky-100" /> planned days</span>
        <span className="text-emerald-700">✓ days taken (approved leave)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-primary/10" /> current month</span>
        {editing && <span className="text-amber-700">Edit mode: change any month to shift days; rows you changed are highlighted.</span>}
      </p>

      {detail && <BalanceDialog row={detail} year={year} isHR={isHR} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); queryClient.invalidateQueries(["leave-balances"]); }} />}
      {importing && q.data && <ImportDialog year={year} items={q.data.items} onClose={() => setImporting(false)} onDone={() => { setImporting(false); queryClient.invalidateQueries(["leave-balances"]); }} onTemplate={() => exportExcel(true)} />}
    </div>
  );
}

function BalanceDialog({ row: r, year, isHR, onClose, onSaved }: { row: LeaveBalance; year: number; isHR: boolean; onClose: () => void; onSaved: () => void }) {
  const [carry, setCarry] = React.useState(String(r.carried_over));
  const [adj, setAdj] = React.useState(String(r.adjustment || 0));
  const [reason, setReason] = React.useState(r.adjustment_reason || "");
  const [busy, setBusy] = React.useState(false);
  const lines: [string, string, string][] = [
    ["Annual accrual", `${r.months_of_service} month${r.months_of_service === 1 ? "" : "s"} of service in ${year}`, n1(r.accrual)],
    ["Seniority", `${r.years_of_service} completed year${r.years_of_service === 1 ? "" : "s"} of service`, `+${n1(r.seniority_days)}`],
    ["Carried over", r.carried_auto ? `Unused days of ${year - 1} (automatic)` : "Set by HR", `+${n1(r.carried_over)}`],
    ["Adjustment", r.adjustment_reason || "—", `${r.adjustment >= 0 ? "+" : ""}${n1(r.adjustment)}`],
  ];
  async function save() {
    if (Number(adj) !== r.adjustment && reason.trim().length < 5) return toast.error("Give a reason for the adjustment.");
    setBusy(true);
    try {
      await leaveApi.savePlans(year, [{ employee: r.employee.id, months: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, Number(r.months?.[i + 1] || 0)])), carried_over: carry, adjustment: adj, adjustment_reason: reason }]);
      toast.success("Entitlement updated");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>{r.employee.name} — leave {year}</DialogTitle>
          <DialogDescription>{r.employee.department_name}{r.employee.joined_at ? ` · joined ${r.employee.joined_at.slice(0, 10)}` : ""}</DialogDescription>
        </DialogHeader>
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-slate-100">
            {lines.map(([k, d, v]) => (
              <tr key={k}><td className="py-2 pr-2 font-medium text-slate-800">{k}<span className="block text-[12px] font-normal text-slate-500">{d}</span></td><td className="py-2 text-right tabular-nums">{v}</td></tr>
            ))}
            <tr className="border-t-2 border-slate-800 font-semibold"><td className="py-2">Entitlement</td><td className="py-2 text-right tabular-nums">{n1(r.entitlement)}</td></tr>
            <tr><td className="py-1.5 text-slate-600">Taken (approved)</td><td className="py-1.5 text-right tabular-nums">−{n1(r.taken)}</td></tr>
            <tr><td className="py-1.5 text-slate-600">Pending requests</td><td className="py-1.5 text-right tabular-nums">−{n1(r.pending)}</td></tr>
            <tr className="font-semibold"><td className="py-2">Available</td><td className={cn("py-2 text-right tabular-nums", r.available < 0 && "text-red-600")}>{n1(r.available)}</td></tr>
            <tr><td className="py-1.5 text-slate-600">Planned for the year</td><td className="py-1.5 text-right tabular-nums">{n1(r.planned)}</td></tr>
          </tbody>
        </table>
        {isHR && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
            <Field label="Carried over (days)" hint="Overrides the automatic value">
              <input type="number" min={0} step={0.5} className={inputCls} value={carry} onChange={(e) => setCarry(e.target.value)} />
            </Field>
            <Field label="Adjustment (days)" hint="Negative to reduce">
              <input type="number" step={0.5} className={inputCls} value={adj} onChange={(e) => setAdj(e.target.value)} />
            </Field>
            <Field label="Reason for the adjustment" className="col-span-2">
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Days worked during the audit week, approved by the SG" />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {isHR && <Button disabled={busy} onClick={save}>Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Parsed = { line: number; email: string; name: string; id: string; months: Record<number, number>; carried?: number; match?: LeaveBalance; reason?: string; changes: number };

function ImportDialog({ year, items, onClose, onDone, onTemplate }: { year: number; items: LeaveBalance[]; onClose: () => void; onDone: () => void; onTemplate: () => void }) {
  const [rows, setRows] = React.useState<Parsed[] | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [progress, setProgress] = React.useState(-1);
  const [result, setResult] = React.useState<{ saved: number; errors: { name?: string; message: string }[] } | null>(null);
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  async function read(file: File) {
    setFileName(file.name);
    setResult(null);
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets["Leave plan"] || wb.Sheets[wb.SheetNames[0]];
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
    const header = (matrix[0] || []).map(norm);
    const col = (names: string[]) => header.findIndex((h) => names.includes(h));
    const cId = col(["employee id", "id"]);
    const cEmail = col(["email", "e-mail"]);
    const cName = col(["staff name", "name", "employee", "names"]);
    const cCarry = col(["carried over", "carry", "opening balance"]);
    const monthCols = MONTHS.map((m, i) => col([m.toLowerCase(), MONTHS_SHORT[i].toLowerCase()]));
    if (monthCols.every((c) => c === -1)) {
      toast.error("No month columns found. Use the template (January … December).");
      return;
    }
    const byId = new Map(items.map((r) => [r.employee.id, r]));
    const byEmail = new Map(items.map((r) => [norm(r.employee.email), r]));
    const byName = new Map(items.map((r) => [norm(r.employee.name), r]));
    const parsed: Parsed[] = matrix.slice(1).map((row, i) => {
      const id = cId >= 0 ? String(row[cId] || "").trim() : "";
      const email = cEmail >= 0 ? norm(row[cEmail]) : "";
      const name = cName >= 0 ? String(row[cName] || "").trim() : "";
      const match = byId.get(id) || byEmail.get(email) || byName.get(norm(name));
      const months: Record<number, number> = {};
      monthCols.forEach((c, m) => (months[m + 1] = c >= 0 ? Math.max(0, Number(row[c]) || 0) : Number(match?.months?.[m + 1] || 0)));
      const changes = match ? Object.entries(months).filter(([m, v]) => Number(match.months?.[m] || 0) !== v).length : 0;
      const bad = Object.values(months).some((v) => v > 31);
      return { line: i + 2, email, name, id, months, carried: cCarry >= 0 && row[cCarry] !== "" ? Number(row[cCarry]) : undefined, match, changes, reason: !match ? "Person not found — check the email or name" : bad ? "A month has more than 31 days" : undefined };
    });
    setRows(parsed.filter((p) => p.email || p.name || p.id));
  }

  async function apply() {
    const good = (rows || []).filter((r) => r.match && !r.reason);
    const all = { saved: 0, errors: [] as { name?: string; message: string }[] };
    setProgress(0);
    for (let i = 0; i < good.length; i += 10) {
      const chunk = good.slice(i, i + 10);
      try {
        const res = await leaveApi.savePlans(year, chunk.map((r) => ({ employee: r.match!.employee.id, months: r.months, ...(r.carried !== undefined && !Number.isNaN(r.carried) && r.carried !== r.match!.carried_over ? { carried_over: r.carried } : {}) })));
        all.saved += res.saved;
        all.errors.push(...res.errors);
      } catch (e) {
        all.errors.push(...chunk.map((r) => ({ name: r.match!.employee.name, message: errorMessage(e) })));
      }
      setProgress(Math.round(((i + chunk.length) / good.length) * 100));
    }
    setResult(all);
    if (!all.errors.length) toast.success(`${all.saved} plans imported`);
  }

  const matched = (rows || []).filter((r) => r.match && !r.reason);
  const problems = (rows || []).filter((r) => !r.match || r.reason);
  return (
    <Dialog open onOpenChange={(o) => !o && progress < 0 && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col bg-white">
        <DialogHeader>
          <DialogTitle>Import leave plan {year}</DialogTitle>
          <DialogDescription>Upload the Excel template. Each row is matched to a person by Employee ID, email or name; you see the result before anything is saved.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <div className="space-y-3">
            <button type="button" onClick={onTemplate} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50">
              <FileSpreadsheet size={22} className="text-emerald-700" />
              <span><span className="block text-[13.5px] font-medium">Download the template</span><span className="text-[12px] text-slate-500">Pre-filled with every employee and their current plan</span></span>
            </button>
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center hover:border-slate-300">
              <Upload size={22} className="text-primaryDark" />
              <span className="text-[13.5px] font-medium">Choose the completed Excel file</span>
              <span className="text-[12px] text-slate-500">.xlsx or .xls</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
            </label>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <Badge tone="neutral">{fileName}</Badge>
              <Badge tone="success">{matched.length} matched</Badge>
              <Badge tone="info">{matched.filter((r) => r.changes).length} with changes</Badge>
              {problems.length > 0 && <Badge tone="danger">{problems.length} to check</Badge>}
            </div>
            {problems.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
                <p className="font-medium">These rows will be skipped:</p>
                <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p.line}>Row {p.line}: {p.name || p.email || p.id} — {p.reason}</li>)}</ul>
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="dnr-grid w-full min-w-[760px] text-[12px]">
                <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Matched to</th>{MONTHS_SHORT.map((m) => <th key={m} className="px-1 py-1.5 text-center">{m}</th>)}<th className="px-2 py-1.5 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {matched.slice(0, 200).map((r) => (
                    <tr key={r.line} className={r.changes ? "bg-amber-50/50" : ""}>
                      <td className="px-2 py-1 text-slate-500">{r.line}</td>
                      <td className="whitespace-nowrap px-2 py-1">{r.match!.employee.name}</td>
                      {Array.from({ length: 12 }, (_, i) => <td key={i} className={cn("px-1 py-1 text-center tabular-nums", Number(r.match!.months?.[i + 1] || 0) !== r.months[i + 1] && "font-semibold text-amber-800")}>{r.months[i + 1] || ""}</td>)}
                      <td className="px-2 py-1 text-right tabular-nums">{Object.values(r.months).reduce((a, b) => a + b, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {progress >= 0 && (
              <div>
                <div className="mb-1 flex justify-between text-[12.5px]"><span>{result ? "Import finished" : "Importing…"}</span><span className="tabular-nums">{progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
            {result && (
              <div className={cn("rounded-lg px-3 py-2 text-[12.5px]", result.errors.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900")}>
                {result.saved} plan{result.saved === 1 ? "" : "s"} saved.{result.errors.length > 0 && <ul className="mt-1 list-disc pl-5">{result.errors.map((e, i) => <li key={i}>{e.name}: {e.message}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onDone}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={progress >= 0}>Cancel</Button>
              {rows && <Button disabled={!matched.length || progress >= 0} onClick={apply}>Import {matched.length} plan{matched.length === 1 ? "" : "s"}</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
