/**
 * Lines of a manual or recurring journal: account (posting accounts only — no bank, cash or control accounts, which
 * their modules post), description, department, funding source and project, debit or credit; totals and the
 * difference live under the table.
 */
import { useQuery } from "react-query";
import { Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { ACCOUNT_TYPES, JournalLineInput, TYPE_ORDER } from "@/lib/ledger";
import { Button, MoneyInput, Num, fmtNumber, inputClass, selectClass } from "@/components/ims";
import { cn } from "@/utils";

export const emptyLine = (): JournalLineInput => ({ account: "", debit: "", credit: "", description: "", department: "", funding_source: "", project: "" });

export function useJournalRefs() {
  return useQuery(["journal-refs"], async () => {
    const [accounts, departments, funds, projects] = await Promise.all([
      pocketbase.collection("gl_accounts").getFullList({ filter: "is_posting = true && active = true", sort: "code", fields: "id,code,name,type,cash_flow_class,is_control" }),
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name,code" }),
      pocketbase.collection("funding_sources").getFullList({ sort: "code", fields: "id,code,name" }),
      pocketbase.collection("projects").getFullList({ sort: "code", fields: "id,code,name,funding_source" }),
    ]);
    return {
      accounts: (accounts as any[]).filter((a) => a.cash_flow_class !== "cash" && !a.is_control),
      departments: departments as any[],
      funds: funds as any[],
      projects: projects as any[],
    };
  }, { staleTime: 300_000 });
}

export function linesTotals(lines: JournalLineInput[]) {
  const debit = lines.reduce((t, l) => t + (Number(l.debit) || 0), 0);
  const credit = lines.reduce((t, l) => t + (Number(l.credit) || 0), 0);
  return { debit, credit, difference: debit - credit };
}

const cell = "border-b border-r border-ims-divider px-2 py-1.5 align-top last:border-r-0";
const head = "border-b border-r border-ims-divider bg-ims-thead px-2 py-2 text-left text-[12.5px] font-semibold text-ims-muted last:border-r-0";
const compact = "h-9 text-[13.5px]";

export default function LinesEditor({ lines, onChange, invalid }: { lines: JournalLineInput[]; onChange: (lines: JournalLineInput[]) => void; invalid?: Set<number> }) {
  const refs = useJournalRefs();
  const r = refs.data;
  const set = (i: number, patch: Partial<JournalLineInput>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const t = linesTotals(lines);
  const grouped = TYPE_ORDER.map((type) => [type, (r?.accounts || []).filter((a) => a.type === type)] as const).filter(([, list]) => list.length);
  return (
    // no intrinsic width (w-0) but the full width of its container: inside a dialog, which is a grid, the table
    // scrolls instead of stretching the dialog past the screen
    <div className="w-0 min-w-full">
      <div className="relative overflow-x-auto rounded-control border border-ims-border">
        {/* 960px fits the widest dialog (about 980px inside), so amounts are visible without scrolling */}
        <table className="w-full min-w-[960px] border-collapse text-t-body">
          <thead>
            <tr>
              <th className={cn(head, "w-8 text-center")}>#</th>
              <th className={cn(head, "w-[220px]")}>Account</th>
              <th className={head}>Description</th>
              <th className={cn(head, "w-[150px]")}>Department</th>
              <th className={cn(head, "w-[165px]")}>Funding / project</th>
              <th className={cn(head, "w-[130px] text-right")}>Debit (RWF)</th>
              <th className={cn(head, "w-[130px] text-right")}>Credit (RWF)</th>
              <th className={cn(head, "w-10")}><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const projects = (r?.projects || []).filter((p) => !l.funding_source || p.funding_source === l.funding_source);
              const bad = invalid?.has(i);
              return (
                <tr key={i} className={cn(bad && "bg-ims-danger-bg/60")}>
                  <td className={cn(cell, "pt-3 text-center text-t-small text-ims-muted")}>{i + 1}</td>
                  <td className={cell}>
                    <select id={`line-${i}-account`} aria-label={`Account, line ${i + 1}`} aria-invalid={(bad && !l.account) || undefined} className={cn(selectClass, compact)} value={l.account} onChange={(e) => set(i, { account: e.target.value })}>
                      <option value="">{refs.isLoading ? "Loading accounts…" : "Choose the account…"}</option>
                      {grouped.map(([type, list]) => (
                        <optgroup key={type} label={ACCOUNT_TYPES[type]}>
                          {list.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className={cell}><input aria-label={`Description, line ${i + 1}`} className={cn(inputClass, compact)} value={l.description} maxLength={300} onChange={(e) => set(i, { description: e.target.value })} placeholder="What this line records" /></td>
                  <td className={cell}>
                    <select aria-label={`Department, line ${i + 1}`} className={cn(selectClass, compact)} value={l.department} onChange={(e) => set(i, { department: e.target.value })}>
                      <option value="">—</option>
                      {(r?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className={cn(cell, "space-y-1")}>
                    <select aria-label={`Funding source, line ${i + 1}`} className={cn(selectClass, compact)} value={l.funding_source} onChange={(e) => set(i, { funding_source: e.target.value, project: "" })}>
                      <option value="">Funding: —</option>
                      {(r?.funds || []).map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                    </select>
                    {projects.length > 0 && (
                      <select aria-label={`Project, line ${i + 1}`} className={cn(selectClass, compact)} value={l.project} onChange={(e) => set(i, { project: e.target.value })}>
                        <option value="">Project: —</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className={cell}><MoneyInput value={l.debit} onChange={(v) => set(i, { debit: v, credit: v ? "" : l.credit })} className="[&_input]:h-9" /></td>
                  <td className={cell}><MoneyInput value={l.credit} onChange={(v) => set(i, { credit: v, debit: v ? "" : l.debit })} className="[&_input]:h-9" /></td>
                  <td className={cn(cell, "pt-2")}>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => onChange(lines.filter((_, j) => j !== i))}><Trash2 size={15} /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-ims-thead font-semibold">
              <td className="px-2 py-2" colSpan={5}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <Button size="sm" icon={Plus} onClick={() => onChange([...lines, emptyLine()])} disabled={lines.length >= 200}>Add a line</Button>
                  <span className={cn("text-t-small", t.difference ? "text-ims-danger" : "text-ims-success")}>{t.difference ? `Difference ${fmtNumber(Math.abs(t.difference))} — debits and credits must be equal` : t.debit ? "Balanced" : ""}</span>
                </span>
              </td>
              <td className="px-2 py-2 text-right"><Num value={t.debit} /></td>
              <td className="px-2 py-2 text-right"><Num value={t.credit} /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
