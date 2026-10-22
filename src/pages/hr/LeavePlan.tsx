import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CheckCheck, Download, FileSpreadsheet, Pencil, Save, Upload, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/procurement";
import { LeaveBalance, MONTHS, MONTHS_SHORT, PlanRow, leaveApi } from "@/lib/hr";
import { cn } from "@/utils";
import { useMe } from "@/components/portal/kit";
import { Button, Card, Column, DataTable, Field, FilterBar, FilterSelect, Input, KpiBand, Modal, Page, PageHeader, Pill, StatusPill, fmtDate } from "@/components/ims";

const thisYear = new Date().getFullYear();
const n1 = (v: number) => (Math.round((Number(v) || 0) * 10) / 10).toString();
type Draft = Record<string, Record<number, number>>;

/** Grid cell styles (the plan grid is a spreadsheet, so it keeps its own compact table on the kit tokens). */
const TH = "h-11 whitespace-nowrap border-b border-r border-ims-divider bg-ims-thead px-2 text-t-small font-semibold text-ims-muted";
const TD = "border-b border-r border-ims-divider px-2 py-1.5";

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
    ws["!cols"] = header.map((_h, i) => ({ wch: i === 2 ? 26 : i === 1 ? 28 : i === 3 ? 26 : i === 0 ? 17 : 10 }));
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

  const changedCount = Object.keys(draft).length;
  const deptName = (departments.data || []).find((d: any) => d.id === department)?.name;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Leave plan" }]}
        title={`Annual leave plan ${year}`}
        subtitle="Each employee's entitlement, the leave planned month by month and the leave taken."
        primary={
          editing
            ? { label: saving ? "Saving…" : `Save changes${changedCount ? ` (${changedCount})` : ""}`, icon: Save, onClick: save, loading: saving }
            : { label: "Edit plan", icon: Pencil, onClick: () => setEditing(true) }
        }
        secondary={
          editing
            ? [{ label: "Cancel", icon: X, onClick: () => { setDraft({}); setEditing(false); } }]
            : canManage && selected.length > 0
              ? [{ label: `Approve ${selected.length} plan${selected.length === 1 ? "" : "s"}`, icon: CheckCheck, onClick: approve }]
              : []
        }
      />

      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Staff", value: totals.staff, sub: `${totals.approved} plan${totals.approved === 1 ? "" : "s"} approved` },
          { label: "Total entitlement", value: `${n1(totals.entitlement)} days`, sub: `${n1(totals.entitlement / Math.max(1, totals.staff))} per person` },
          { label: "Planned", value: `${n1(totals.planned)} days`, sub: `${Math.round((totals.planned / Math.max(1, totals.entitlement)) * 100)}% of the entitlement`, tone: totals.planned > totals.entitlement ? "danger" : "default" },
          { label: "Taken", value: `${n1(totals.taken)} days`, sub: `${n1(totals.entitlement - totals.taken)} days remaining`, tone: "success" },
        ]}
      />

      <Card padded={false} className="overflow-hidden">
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search staff or department" }}
          chips={department ? [{ key: "department", label: `Department: ${deptName || "selected"}`, onRemove: () => setDepartment("") }] : []}
          onClear={() => setDepartment("")}
          right={
            <>
              {(canManage || isHR) && !editing && <Button size="sm" icon={Upload} onClick={() => setImporting(true)}>Import</Button>}
              <Button size="sm" icon={Download} onClick={() => exportExcel(false)} disabled={!q.data}>Export</Button>
            </>
          }
        >
          <FilterSelect label="Year" all={false} value={String(year)} onChange={(v) => setYear(Number(v))} options={[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: String(y), label: String(y) }))} className="[&_select]:w-[110px]" />
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={(departments.data || []).map((d: any) => ({ value: d.id, label: d.name }))} className="[&_select]:w-[220px]" />
        </FilterBar>

        {editing && (
          <p className="border-t border-ims-divider bg-ims-warning-bg px-4 py-2 text-t-small text-ims-warning sm:px-5">
            Edit mode: change any month to shift days. Rows you changed are highlighted; nothing is saved until you choose Save changes.
          </p>
        )}

        {q.isLoading ? (
          <div className="border-t border-ims-divider p-5"><Skeleton className="h-96 w-full" /></div>
        ) : (
          <div className={cn("overflow-x-auto border-t border-ims-divider", q.isFetching && "opacity-60 transition-opacity")}>
            <table className="w-full min-w-[1400px] border-separate border-spacing-0 text-t-small text-ims-text">
              <caption className="sr-only">Annual leave plan {year}</caption>
              <thead className="sticky top-0 z-10">
                <tr className="text-left">
                  {canManage && <th scope="col" className={cn(TH, "sticky left-0 z-20 w-9 px-2")}><span className="sr-only">Select</span></th>}
                  <th scope="col" className={cn(TH, "sticky z-20 min-w-[210px] px-3", canManage ? "left-9" : "left-0")}>Staff</th>
                  <th scope="col" className={cn(TH, "text-right")} title="Completed years of service at 1 January">Years</th>
                  <th scope="col" className={cn(TH, "text-right")}>Carried</th>
                  <th scope="col" className={cn(TH, "text-right")}>Entitled</th>
                  {MONTHS_SHORT.map((m, i) => (
                    <th key={m} scope="col" className={cn(TH, "w-[58px] px-1 text-center", month === i + 1 && "bg-ims-info-bg text-ims-primary")}>{m}</th>
                  ))}
                  <th scope="col" className={cn(TH, "text-right")}>Planned</th>
                  <th scope="col" className={cn(TH, "text-right")}>Taken</th>
                  <th scope="col" className={cn(TH, "text-right")}>Balance</th>
                  <th scope="col" className={cn(TH, "border-r-0")}>Plan</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 21 : 20} className="px-6 py-12 text-center text-t-body text-ims-muted">
                      {search || department ? "Nobody matches this search. Change the search or clear the filters." : "No staff to show for this year."}
                    </td>
                  </tr>
                )}
                {items.map((r) => {
                  const planned = plannedOf(r);
                  const over = planned > r.entitlement + 0.01;
                  const editable = editing && canEditRow(r);
                  const changed = Boolean(draft[r.employee.id]);
                  const rowBg = changed ? "bg-ims-warning-bg" : "bg-ims-card group-hover:bg-ims-hover";
                  return (
                    <tr key={r.employee.id} className="group">
                      {canManage && (
                        <td className={cn(TD, "sticky left-0 z-[1] text-center", rowBg)}>
                          {r.plan && r.plan.status !== "approved" && r.employee.id !== me.data?.id && (
                            <input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-ims-field accent-ims-primary" aria-label={`Select ${r.employee.name}`} checked={selected.includes(r.employee.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.employee.id] : s.filter((x) => x !== r.employee.id)))} />
                          )}
                        </td>
                      )}
                      <td className={cn(TD, "sticky z-[1] px-3", canManage ? "left-9" : "left-0", rowBg)}>
                        <button type="button" className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus" onClick={() => setDetail(r)}>
                          <span className="block text-t-body font-semibold text-ims-text hover:text-ims-link hover:underline">{r.employee.name}</span>
                          <span className="block text-t-small text-ims-muted">{r.employee.department_name}</span>
                        </button>
                      </td>
                      <td className={cn(TD, "text-right tabular-nums text-ims-body", rowBg)}>{r.years_of_service}</td>
                      <td className={cn(TD, "text-right tabular-nums text-ims-body", rowBg)} title={r.carried_auto ? "Automatic from last year" : "Set by HR"}>{n1(r.carried_over)}</td>
                      <td className={cn(TD, "text-right font-semibold tabular-nums", rowBg)} title={`Accrual ${r.accrual} + seniority ${r.seniority_days} + carried ${r.carried_over} + adjustment ${r.adjustment}`}>{n1(r.entitlement)}</td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i + 1;
                        const v = val(r, m);
                        const t = Number(r.taken_months?.[m] || 0);
                        return (
                          <td key={m} className={cn(TD, "px-1 py-1 text-center tabular-nums", month === m ? "bg-ims-info-bg/50" : rowBg)}>
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
                                className="h-8 w-[50px] rounded-md border border-ims-field bg-ims-card text-center text-t-small text-ims-text placeholder:text-ims-faint focus:border-ims-focus focus:outline-none focus:ring-2 focus:ring-ims-focus/25"
                                aria-label={`${r.employee.name} ${MONTHS[i]}`}
                              />
                            ) : (
                              <span className={cn("inline-flex min-w-[28px] justify-center rounded px-1 py-0.5", v ? "bg-ims-info-bg font-semibold text-ims-info" : "text-ims-field")}>{v ? n1(v) : "·"}</span>
                            )}
                            {t > 0 && <span className="block text-t-hint font-semibold text-ims-success" title="Approved leave taken">✓ {n1(t)}</span>}
                          </td>
                        );
                      })}
                      <td className={cn(TD, "text-right font-semibold tabular-nums", over && "text-ims-danger", rowBg)} title={over ? "More than the entitlement" : ""}>{n1(planned)}</td>
                      <td className={cn(TD, "text-right tabular-nums text-ims-success", rowBg)}>
                        {n1(r.taken)}
                        {r.pending ? <span className="block text-t-hint text-ims-warning">+{n1(r.pending)} pending</span> : null}
                      </td>
                      <td className={cn(TD, "text-right font-semibold tabular-nums", r.balance < 0 ? "text-ims-danger" : "text-ims-text", rowBg)}>{n1(r.balance)}</td>
                      <td className={cn(TD, "border-r-0", rowBg)}>
                        {!r.plan ? <span className="text-t-small text-ims-faint">No plan</span> : <StatusPill status={r.plan.status === "approved" ? "Approved" : "Draft"} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-ims-thead text-t-small font-bold text-ims-text">
                    <td colSpan={canManage ? 5 : 4} className="sticky left-0 border-r border-t-2 border-ims-border bg-ims-thead px-3 py-2">Planned days and people per month</td>
                    {monthLoad.map((m, i) => (
                      <td key={i} className="border-r border-t-2 border-ims-border px-1 py-2 text-center tabular-nums">
                        <div className="mx-auto mb-1 flex h-8 w-4 flex-col justify-end overflow-hidden rounded-sm bg-ims-divider" title={`${n1(m.days)} days, ${m.people} people`}>
                          <div className="w-full bg-ims-link" style={{ height: `${(m.days / maxLoad) * 100}%` }} />
                        </div>
                        {n1(m.days)}
                        <span className="block text-t-hint font-normal text-ims-muted">{m.people} {m.people === 1 ? "person" : "people"}</span>
                      </td>
                    ))}
                    <td className="border-r border-t-2 border-ims-border px-2 py-2 text-right tabular-nums">{n1(totals.planned)}</td>
                    <td className="border-r border-t-2 border-ims-border px-2 py-2 text-right tabular-nums">{n1(totals.taken)}</td>
                    <td className="border-r border-t-2 border-ims-border px-2 py-2 text-right tabular-nums">{n1(totals.entitlement - totals.taken)}</td>
                    <td className="border-t-2 border-ims-border" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ims-divider px-4 py-3 text-t-small text-ims-muted sm:px-5" aria-label="Legend">
          <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-ims-info-bg ring-1 ring-inset ring-ims-link/30" aria-hidden /> Planned days</li>
          <li className="text-ims-success">✓ Days taken (approved leave)</li>
          <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-ims-info-bg/50 ring-1 ring-inset ring-ims-border" aria-hidden /> Current month</li>
          <li>Select a name to see how the entitlement is made up.</li>
        </ul>
      </Card>

      <Card as="div" className="py-3.5 sm:py-3.5">
        <details>
          <summary className="cursor-pointer text-t-body font-bold text-ims-text">How the entitlement is calculated</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-t-small text-ims-body">
            <li><span className="font-semibold">Annual accrual:</span> {cfg?.accrual ?? 1.5} working days for each month of service in the year (18 days for a full year; prorated from the joining month).</li>
            <li><span className="font-semibold">Seniority:</span> +{cfg?.extra ?? 1} day for every {cfg?.every ?? 3} completed years of service{cfg?.maxSeniority ? `, up to ${cfg.maxSeniority} days` : ""}.</li>
            <li><span className="font-semibold">Carried over:</span> unused days of the previous year, up to {cfg?.maxCarry ?? 5} days (HR can override per person).</li>
            <li><span className="font-semibold">Adjustment:</span> manual correction by HR with a written reason.</li>
            <li>Weekends and public holidays are not counted. Rules and public holidays are set in Settings → Leave policy, following Law N° 66/2018 regulating labour in Rwanda.</li>
          </ul>
        </details>
      </Card>

      {detail && <BalanceDialog row={detail} year={year} isHR={isHR} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); queryClient.invalidateQueries(["leave-balances"]); }} />}
      {importing && q.data && <ImportDialog year={year} items={q.data.items} onClose={() => setImporting(false)} onDone={() => { setImporting(false); queryClient.invalidateQueries(["leave-balances"]); }} onTemplate={() => exportExcel(true)} />}
    </Page>
  );
}

function BalanceDialog({ row: r, year, isHR, onClose, onSaved }: { row: LeaveBalance; year: number; isHR: boolean; onClose: () => void; onSaved: () => void }) {
  const [carry, setCarry] = React.useState(String(r.carried_over));
  const [adj, setAdj] = React.useState(String(r.adjustment || 0));
  const [reason, setReason] = React.useState(r.adjustment_reason || "");
  const [busy, setBusy] = React.useState(false);
  const [reasonError, setReasonError] = React.useState("");
  const lines: [string, string, string][] = [
    ["Annual accrual", `${r.months_of_service} month${r.months_of_service === 1 ? "" : "s"} of service in ${year}`, n1(r.accrual)],
    ["Seniority", `${r.years_of_service} completed year${r.years_of_service === 1 ? "" : "s"} of service`, `+${n1(r.seniority_days)}`],
    ["Carried over", r.carried_auto ? `Unused days of ${year - 1} (automatic)` : "Set by HR", `+${n1(r.carried_over)}`],
    ["Adjustment", r.adjustment_reason || "—", `${r.adjustment >= 0 ? "+" : ""}${n1(r.adjustment)}`],
  ];
  async function save() {
    if (Number(adj) !== r.adjustment && reason.trim().length < 5) return setReasonError("Give a reason for the adjustment (at least 5 characters).");
    setBusy(true);
    try {
      await leaveApi.savePlans(year, [{ employee: r.employee.id, months: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, Number(r.months?.[i + 1] || 0)])), carried_over: carry, adjustment: adj, adjustment_reason: reason }]);
      toast.success(`Entitlement of ${r.employee.name} updated`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const row = (label: React.ReactNode, value: React.ReactNode, opts: { strong?: boolean; danger?: boolean; top?: boolean } = {}) => (
    <tr className={cn(opts.top && "border-t-2 border-ims-text")}>
      <td className={cn("py-2 pr-3", opts.strong ? "font-bold text-ims-text" : "text-ims-body")}>{label}</td>
      <td className={cn("py-2 text-right tabular-nums", opts.strong && "font-bold", opts.danger && "text-ims-danger")}>{value}</td>
    </tr>
  );
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      size="md"
      title={`${r.employee.name} · leave ${year}`}
      description={`${r.employee.department_name}${r.employee.joined_at ? ` · joined ${fmtDate(r.employee.joined_at)}` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button>
          {isHR && <Button variant="primary" loading={busy} onClick={save}>Save</Button>}
        </>
      }
    >
      <table className="w-full text-t-body text-ims-text">
        <caption className="sr-only">How the entitlement is made up</caption>
        <tbody className="divide-y divide-ims-divider">
          {lines.map(([k, d, v]) => (
            <tr key={k}>
              <td className="py-2 pr-3">
                <span className="block font-semibold text-ims-text">{k}</span>
                <span className="block text-t-small text-ims-muted">{d}</span>
              </td>
              <td className="py-2 text-right tabular-nums">{v}</td>
            </tr>
          ))}
          {row("Entitlement", n1(r.entitlement), { strong: true, top: true })}
          {row("Taken (approved)", `−${n1(r.taken)}`)}
          {row("Pending requests", `−${n1(r.pending)}`)}
          {row("Available", n1(r.available), { strong: true, danger: r.available < 0 })}
          {row("Planned for the year", n1(r.planned))}
        </tbody>
      </table>
      {isHR && (
        <div className="grid grid-cols-1 gap-4 rounded-control border border-ims-border bg-ims-thead p-4 sm:grid-cols-2">
          <Field label="Carried over (days)" htmlFor="bal-carry" hint="Overrides the automatic value">
            <Input id="bal-carry" type="number" min={0} step={0.5} value={carry} onChange={(e) => setCarry(e.target.value)} />
          </Field>
          <Field label="Adjustment (days)" htmlFor="bal-adj" hint="Negative to reduce">
            <Input id="bal-adj" type="number" step={0.5} value={adj} onChange={(e) => { setAdj(e.target.value); setReasonError(""); }} />
          </Field>
          <Field label="Reason for the adjustment" htmlFor="bal-reason" className="sm:col-span-2" error={reasonError} hint="Required when the adjustment changes">
            <Input id="bal-reason" value={reason} invalid={Boolean(reasonError)} onChange={(e) => { setReason(e.target.value); setReasonError(""); }} placeholder="e.g. Days worked during the audit week, approved by the SG" />
          </Field>
        </div>
      )}
    </Modal>
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
  const columns: Column<Parsed>[] = [
    { key: "line", header: "Row", numeric: true, width: "60px", cell: (r) => <span className="text-ims-muted">{r.line}</span> },
    { key: "match", header: "Matched to", nowrap: true, cell: (r) => <span className="font-semibold">{r.match!.employee.name}</span> },
    ...MONTHS_SHORT.map<Column<Parsed>>((m, i) => ({
      key: m,
      header: m,
      align: "center",
      className: "px-1.5 tabular-nums",
      cell: (r) => <span className={cn(Number(r.match!.months?.[i + 1] || 0) !== r.months[i + 1] && "font-bold text-ims-warning")}>{r.months[i + 1] || ""}</span>,
    })),
    { key: "total", header: "Total", numeric: true, cell: (r) => Object.values(r.months).reduce((a, b) => a + b, 0) },
  ];
  return (
    <Modal
      open
      onClose={progress < 0 ? onClose : () => undefined}
      size="xl"
      title={`Import leave plan ${year}`}
      description="Upload the Excel template. Each row is matched to a person by Employee ID, email or name; you see the result before anything is saved."
      footer={
        result ? (
          <Button variant="primary" onClick={onDone}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={progress >= 0}>Cancel</Button>
            {rows && <Button variant="primary" disabled={!matched.length || progress >= 0} onClick={apply}>Import {matched.length} plan{matched.length === 1 ? "" : "s"}</Button>}
          </>
        )
      }
    >
      {!rows ? (
        <div className="space-y-3">
          <button type="button" onClick={onTemplate} className="flex w-full items-center gap-3 rounded-control border border-ims-border bg-ims-card px-3 py-2.5 text-left hover:bg-ims-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus">
            <FileSpreadsheet size={22} className="shrink-0 text-ims-success" aria-hidden />
            <span>
              <span className="block text-t-body font-bold text-ims-text">Download the template</span>
              <span className="text-t-small text-ims-muted">Pre-filled with every employee and their current plan</span>
            </span>
          </button>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-card border-2 border-dashed border-ims-field bg-ims-thead px-4 py-8 text-center hover:border-ims-faint">
            <Upload size={22} className="text-ims-link" aria-hidden />
            <span className="text-t-body font-bold text-ims-text">Choose the completed Excel file</span>
            <span className="text-t-hint text-ims-muted">.xlsx or .xls</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Pill tone="neutral">{fileName}</Pill>
            <Pill tone="success">{matched.length} matched</Pill>
            <Pill tone="info">{matched.filter((r) => r.changes).length} with changes</Pill>
            {problems.length > 0 && <Pill tone="danger">{problems.length} to check</Pill>}
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-ims-danger/30 bg-ims-danger-bg px-3 py-2 text-t-small text-ims-danger">
              <p className="font-bold">These rows will be skipped:</p>
              <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p.line}>Row {p.line}: {p.name || p.email || p.id} — {p.reason}</li>)}</ul>
            </div>
          )}
          <div className="overflow-hidden rounded-control border border-ims-border">
            <DataTable
              caption="Rows to import"
              columns={columns}
              rows={matched.slice(0, 200)}
              rowKey={(r) => String(r.line)}
              minWidth={900}
              rowClassName={(r) => (r.changes ? "bg-ims-warning-bg/50" : undefined)}
            />
          </div>
          {progress >= 0 && (
            <div>
              <div className="mb-1 flex justify-between text-t-small text-ims-body"><span>{result ? "Import finished" : "Importing…"}</span><span className="tabular-nums">{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-pill bg-ims-subtle" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-pill bg-ims-primary transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {result && (
            <div className={cn("rounded-control px-3 py-2 text-t-small", result.errors.length ? "bg-ims-warning-bg text-ims-warning" : "bg-ims-success-bg text-ims-success")}>
              {result.saved} plan{result.saved === 1 ? "" : "s"} saved.{result.errors.length > 0 && <ul className="mt-1 list-disc pl-5">{result.errors.map((e, i) => <li key={i}>{e.name}: {e.message}</li>)}</ul>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
