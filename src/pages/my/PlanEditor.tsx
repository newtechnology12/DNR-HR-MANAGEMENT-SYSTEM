/**
 * Create or correct a work plan: kind (week, month, quarter, fiscal year), period, the higher-level plan it
 * contributes to, the main focus and the activities / outputs / objectives with the fields public-sector
 * planning asks for at that level. Saved as a draft or sent straight to the supervisor.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarRange, Flag, Info, ListPlus, Plus, Target, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { PLAN_TYPES, PlanItem, PlanType, PRIORITY, TYPE_INFO, WEEKDAYS, blankItem, dayOf, plansApi } from "@/lib/plans";
import { ChoiceCards, Field, inputCls } from "@/components/portal/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { MyHeader, WCard, btnOutline, btnPrimary, myPage } from "@/components/workspace/WorkspaceKit";
import { MoneyInput } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);

export default function PlanEditor() {
  const { planId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const editing = Boolean(planId);
  const existing = useQuery(["work-plan", planId], () => pocketbase.collection("work_plans").getOne(planId!), { enabled: editing });
  const [type, setType] = React.useState<PlanType>((params.get("type") as PlanType) || "weekly");
  const [date, setDate] = React.useState(params.get("date") || today());
  const [parent, setParent] = React.useState("");
  const [focus, setFocus] = React.useState("");
  const [items, setItems] = React.useState<PlanItem[]>([blankItem()]);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState<"" | "draft" | "submit">("");

  React.useEffect(() => {
    const p: any = existing.data;
    if (!p) return;
    setType(p.plan_type);
    setDate(dayOf(p.period_start));
    setParent(p.parent || "");
    setFocus(p.focus || "");
    setItems((p.items || []).map((i: any) => ({ ...blankItem(), ...i })));
  }, [existing.data]);

  const period = useQuery(["plan-period", type, date], () => plansApi.period(type, date), { enabled: Boolean(date), keepPreviousData: true });
  const ref = useQuery(["plan-ref", uid], async () => ({
    objectives: await pocketbase.collection("strategic_objectives").getFullList({ filter: "active = true", sort: "sort,code" }),
    deptPlans: user?.department ? await pocketbase.collection("actionPlans").getFullList({ filter: `scope = "department" && department_id = "${user.department}" && status != "cancelled"`, sort: "-start_date", fields: "id,title,start_date,end_date,status" }) : [],
    mine: await pocketbase.collection("work_plans").getFullList({ filter: `staff = "${uid}" && plan_type != "weekly"`, sort: "-period_start", fields: "id,number,plan_type,period_label,period_start,period_end,status,items" }),
  }), { enabled: Boolean(uid) });
  const info = TYPE_INFO[type];
  const p = period.data;
  const parents = ((ref.data?.mine || []) as any[]).filter((x) => info.parent.includes(x.plan_type) && p && dayOf(x.period_start) <= p.end && dayOf(x.period_end) >= p.start && x.id !== planId);
  const parentPlan = parents.find((x) => x.id === parent);
  // One plan per kind and period: say so before the person fills it in.
  const taken = useQuery(["plan-taken", uid, type, p?.start], () => pocketbase.collection("work_plans").getList(1, 1, { filter: `staff = "${uid}" && plan_type = "${type}" && period_start >= "${p!.start} 00:00:00.000Z" && period_start <= "${p!.start} 23:59:59.999Z"`, fields: "id,number" }).then((r) => (r.items[0] as any) || null), { enabled: Boolean(uid && p?.start) });
  const clash = taken.data && taken.data.id !== planId ? taken.data : null;
  React.useEffect(() => {
    if (parent && !parents.some((x) => x.id === parent) && ref.data) setParent("");
    if (!editing && !parent && parents.length) setParent(parents.sort((a, b) => ["monthly", "quarterly", "annual"].indexOf(a.plan_type) - ["monthly", "quarterly", "annual"].indexOf(b.plan_type))[0].id);
  }, [p?.start, ref.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i: number, k: keyof PlanItem, v: any) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: -1 | 1) => setItems((xs) => {
    const n = [...xs];
    const [a] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, a);
    return n;
  });
  const weightTotal = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const itemErrors = items.map((i) => {
    if (i.title.trim().length < 3) return `Describe the ${info.item.toLowerCase()} (at least 3 characters).`;
    if ((type === "annual" || type === "quarterly") && (!i.indicator.trim() || !i.target.trim())) return "Give the indicator and the target.";
    if (p && i.due && (i.due < p.start || i.due > p.end)) return "The due date is outside the period.";
    return "";
  });
  const planError = !items.length ? `Add at least one ${info.item.toLowerCase()}.` : type === "annual" && weightTotal !== 100 ? `The weights add up to ${weightTotal}%; they must add up to 100%.` : "";
  const invalid = Boolean(planError) || itemErrors.some(Boolean);

  async function save(submit: boolean) {
    setTried(true);
    if (clash) return toast.error(`You already have a ${info.label.toLowerCase()} for ${p?.label} (${clash.number}).`);
    if (invalid) return toast.error(planError || "Complete the highlighted activities.");
    setBusy(submit ? "submit" : "draft");
    const body = { staff: uid, plan_type: type, period_start: `${date} 12:00:00.000Z`, parent, focus: focus.trim(), items: items.map((i) => ({ ...i, weight: Number(i.weight) || 0, cost: Number(i.cost) || 0 })) };
    try {
      const r = editing ? await pocketbase.collection("work_plans").update(planId!, body) : await pocketbase.collection("work_plans").create(body);
      if (submit) {
        const s = await plansApi.act(r.id, "submit");
        toast.success(s.status === "approved" ? `${r.number} saved and approved` : `${r.number} sent to your supervisor`);
      } else toast.success(`${r.number} saved as a draft`);
      navigate(`/dashboard/my/plans/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  if (editing && existing.isLoading) return <div className={myPage}><Skeleton className="h-96 w-full" /></div>;
  const parentItems = (parentPlan?.items || []) as any[];
  const parentLabel = parentPlan ? `${TYPE_INFO[parentPlan.plan_type as PlanType].label} · ${parentPlan.period_label}` : "";

  return (
    <main className={myPage}>
      <MyHeader
        title={editing ? `Edit ${(existing.data as any)?.number}` : "New plan"}
        subtitle="Plan from the top down: your annual contract, then the quarter, the month and the week. Each plan is approved by your supervisor before you start."
        actions={<button type="button" className={btnOutline} onClick={() => navigate(-1)}>Cancel</button>}
      />

      {!editing && (
        <WCard>
          <h2 className="mb-3 text-[15px] font-extrabold">What are you planning?</h2>
          <ChoiceCards<PlanType>
            columns={4}
            value={type}
            onChange={setType}
            options={PLAN_TYPES.map((t) => ({ value: t, label: TYPE_INFO[t].label, description: TYPE_INFO[t].hint, icon: t === "annual" ? Flag : t === "quarterly" ? Target : CalendarRange }))}
          />
        </WCard>
      )}

      <WCard>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={type === "weekly" ? "Any day of the week" : type === "monthly" ? "Any day of the month" : type === "quarterly" ? "Any day of the quarter" : "Any day of the fiscal year"} required htmlFor="pl-date" hint={p ? <span className="font-semibold text-[#0B3A6F]">{p.label}</span> : undefined}>
            <input id="pl-date" type="date" className={inputCls} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} disabled={editing && (existing.data as any)?.status !== "draft"} />
          </Field>
          <Field label="Contributes to" htmlFor="pl-parent" hint={info.parent.length ? "Your approved plan for a longer period that this one implements" : "The annual contract is the top of your plan"}>
            <select id="pl-parent" className={inputCls} value={parent} disabled={!info.parent.length} onChange={(e) => setParent(e.target.value)}>
              <option value="">{info.parent.length ? (parents.length ? "Not linked" : "No higher plan for this period yet") : "—"}</option>
              {parents.map((x) => <option key={x.id} value={x.id}>{TYPE_INFO[x.plan_type as PlanType].label} · {x.period_label} ({x.number})</option>)}
            </select>
          </Field>
          <Field label="Main focus of the period" htmlFor="pl-focus" className="md:col-span-1">
            <input id="pl-focus" className={inputCls} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={type === "annual" ? "e.g. Strengthen councillors' leadership skills" : "e.g. Rulindo training and the budgeting guide"} />
          </Field>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#F8FAFC] px-3 py-2 text-[12.5px] text-[#36435A]">
          <Info size={14} className="mt-0.5 shrink-0 text-[#1466C0]" />
          {type === "annual"
            ? "Write 3 to 6 SMART objectives (specific, measurable, achievable, relevant, time-bound). Each gets an indicator, the baseline (today's value), the target for the year, a weight (all together 100%) and the evidence that will prove it."
            : type === "quarterly"
              ? "List the outputs you will deliver this quarter, each with how it is measured and the target, so the quarterly review is objective."
              : type === "monthly"
                ? "List the month's activities with what each will produce and when. Link them to your department's plan and to RALGA's strategic objectives."
                : "List what you will do each day of the week. Keep it realistic: meetings, travel and reporting take time too."}
        </p>
        {clash && (
          <p role="alert" className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-[#F5DFA3] bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#5B4A1C]">
            <AlertTriangle size={14} className="shrink-0 text-[#9A6300]" aria-hidden />
            You already have a {info.label.toLowerCase()} for {p?.label} ({clash.number}).
            <Link to={`/dashboard/my/plans/${clash.id}`} className="font-bold text-[#1466C0] hover:underline">Open it</Link> or choose another date.
          </p>
        )}
      </WCard>

      <WCard flush className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDF0F5] px-5 py-3.5">
          <div>
            <h2 className="text-[17px] font-extrabold">{info.items}</h2>
            <p className="text-[13px] text-[#5B6577]">{items.length} {items.length === 1 ? info.item.toLowerCase() : info.items.toLowerCase()}{type === "annual" && <> · weights <b className={cn(weightTotal === 100 ? "text-[#0F6B3A]" : "text-[#B42318]")}>{weightTotal}%</b> of 100%</>}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {parentItems.length > 0 && <AddFromParent items={parentItems} label={parentLabel} onAdd={(src) => setItems((xs) => [...xs.filter((x) => x.title.trim()), ...src.map((s) => ({ ...blankItem(), title: s.title, output: s.output || "", objective: s.objective || "", department_plan: s.department_plan || "", indicator: type === "quarterly" ? s.indicator || "" : "", target: type === "quarterly" ? s.target || "" : "" }))])} />}
            <button type="button" className={btnOutline} onClick={() => setItems((xs) => [...xs, blankItem()])}><Plus size={15} /> Add {info.item.toLowerCase()}</button>
          </div>
        </div>
        <ol className="divide-y divide-[#EDF0F5]">
          {items.map((it, i) => (
            <li key={i} className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#5B6577]">{info.item} {i + 1}</span>
                <span className="flex gap-1">
                  <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></IconBtn>
                  <IconBtn label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></IconBtn>
                  <IconBtn label="Remove" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></IconBtn>
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-6">
                <Field label={type === "annual" ? "Objective" : type === "quarterly" ? "Output" : "Activity"} required className="md:col-span-4" error={tried && itemErrors[i] && itemErrors[i].startsWith("Describe") ? itemErrors[i] : undefined}>
                  <input className={inputCls} value={it.title} onChange={(e) => set(i, "title", e.target.value)} placeholder={type === "annual" ? "e.g. Train newly elected councillors on their roles" : type === "quarterly" ? "e.g. Induction training for councillors of 4 districts" : "e.g. Confirm the venue with the district"} />
                </Field>
                {type === "weekly" ? (
                  <Field label="Days" className="md:col-span-2">
                    <div className="flex gap-1">
                      {WEEKDAYS.map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={it.days.includes(k)} onClick={() => set(i, "days", it.days.includes(k) ? it.days.filter((d) => d !== k) : [...it.days, k])}
                          className={cn("h-10 flex-1 rounded-lg border text-[12.5px] font-bold", it.days.includes(k) ? "border-[#1466C0] bg-[#EAF2FC] text-[#0B3A6F]" : "border-[#DDE3EC] text-[#5B6577] hover:bg-[#F8FAFC]")}>{l}</button>
                      ))}
                    </div>
                  </Field>
                ) : type === "monthly" ? (
                  <Field label="Due" className="md:col-span-2" error={tried && itemErrors[i] === "The due date is outside the period." ? itemErrors[i] : undefined}>
                    <input type="date" className={inputCls} value={it.due} min={p?.start} max={p?.end} onChange={(e) => set(i, "due", e.target.value)} />
                  </Field>
                ) : type === "annual" ? (
                  <Field label="Weight %" required className="md:col-span-2">
                    <input type="number" min={0} max={100} className={cn(inputCls, "text-right")} value={it.weight || ""} onChange={(e) => set(i, "weight", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                  </Field>
                ) : (
                  <Field label="Estimated cost" className="md:col-span-2"><MoneyInput value={it.cost || ""} onChange={(v) => set(i, "cost", v === "" ? 0 : v)} /></Field>
                )}
                <Field label={type === "annual" ? "Key output / result" : "Expected output"} className="md:col-span-3">
                  <input className={inputCls} value={it.output} onChange={(e) => set(i, "output", e.target.value)} placeholder="What will exist when it is done" />
                </Field>
                {(type === "annual" || type === "quarterly") ? (
                  <>
                    <Field label="Indicator" required className="md:col-span-3" error={tried && itemErrors[i] === "Give the indicator and the target." ? itemErrors[i] : undefined}>
                      <input className={inputCls} value={it.indicator} onChange={(e) => set(i, "indicator", e.target.value)} placeholder="e.g. Councillors trained" />
                    </Field>
                    <Field label="Baseline" className="md:col-span-1"><input className={inputCls} value={it.baseline} onChange={(e) => set(i, "baseline", e.target.value)} placeholder="Today" /></Field>
                    <Field label="Target" required className="md:col-span-1"><input className={inputCls} value={it.target} onChange={(e) => set(i, "target", e.target.value)} placeholder="e.g. 300" /></Field>
                    <Field label="Means of verification" className="md:col-span-4"><input className={inputCls} value={it.verification} onChange={(e) => set(i, "verification", e.target.value)} placeholder="e.g. Attendance lists, training reports" /></Field>
                  </>
                ) : (
                  <Field label="Priority" className="md:col-span-1">
                    <select className={inputCls} value={it.priority} onChange={(e) => set(i, "priority", e.target.value)}>
                      {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </Field>
                )}
                {type === "monthly" && <Field label="Estimated cost" className="md:col-span-2"><MoneyInput value={it.cost || ""} onChange={(v) => set(i, "cost", v === "" ? 0 : v)} /></Field>}
                {type === "annual" && (
                  <Field label="Quarters" className="md:col-span-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((q) => (
                        <button key={q} type="button" aria-pressed={it.quarters.includes(q)} onClick={() => set(i, "quarters", it.quarters.includes(q) ? it.quarters.filter((x) => x !== q) : [...it.quarters, q].sort())}
                          className={cn("h-10 flex-1 rounded-lg border text-[12.5px] font-bold", it.quarters.includes(q) ? "border-[#1466C0] bg-[#EAF2FC] text-[#0B3A6F]" : "border-[#DDE3EC] text-[#5B6577] hover:bg-[#F8FAFC]")}>Q{q}</button>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label="Strategic objective" className={type === "weekly" ? "md:col-span-2" : "md:col-span-3"}>
                  <select className={inputCls} value={it.objective} onChange={(e) => set(i, "objective", e.target.value)}>
                    <option value="">—</option>
                    {((ref.data?.objectives || []) as any[]).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
                  </select>
                </Field>
                {type !== "annual" && (
                  <Field label="Department plan" className={type === "weekly" ? "md:col-span-3" : "md:col-span-3"}>
                    <select className={inputCls} value={it.department_plan} onChange={(e) => set(i, "department_plan", e.target.value)}>
                      <option value="">—</option>
                      {((ref.data?.deptPlans || []) as any[]).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </li>
          ))}
        </ol>
        {tried && planError && <p className="border-t border-[#EDF0F5] px-5 py-3 text-[13px] font-semibold text-[#B42318]">{planError}</p>}
      </WCard>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={Boolean(busy) || Boolean(clash)} onClick={() => save(false)} className={btnOutline}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
        <button type="button" disabled={Boolean(busy) || Boolean(clash)} onClick={() => save(true)} className={btnPrimary}>{busy === "submit" ? "Sending…" : "Save and send to my supervisor"}</button>
      </div>
    </main>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5B6577] hover:bg-[#F1F4F9] hover:text-[#14213D] disabled:opacity-30">
      {children}
    </button>
  );
}

function AddFromParent({ items, label, onAdd }: { items: any[]; label: string; onAdd: (items: any[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const live = items.filter((i) => i.status !== "done" && i.status !== "dropped");
  return (
    <div className="relative">
      <button type="button" className={btnOutline} onClick={() => setOpen((o) => !o)}><ListPlus size={15} /> From {label.split(" · ")[0].toLowerCase()}</button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[360px] max-w-[85vw] rounded-xl border border-[#E3E8EF] bg-white p-3 shadow-lg">
          <p className="mb-2 text-[12.5px] text-[#5B6577]">Open items of {label}</p>
          <ul className="max-h-64 space-y-1 overflow-auto">
            {live.map((i) => (
              <li key={i.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-[#F8FAFC]">
                  <input type="checkbox" className="mt-0.5" checked={picked.has(i.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} />
                  <span>{i.title}</span>
                </label>
              </li>
            ))}
            {!live.length && <li className="px-2 py-1.5 text-[13px] text-[#5B6577]">Everything is done there.</li>}
          </ul>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#5B6577] hover:bg-[#F1F4F9]" onClick={() => setOpen(false)}>Close</button>
            <button type="button" disabled={!picked.size} className="h-9 rounded-lg bg-[#0B3A6F] px-3 text-[13px] font-bold text-white disabled:opacity-50" onClick={() => { onAdd(live.filter((i) => picked.has(i.id))); setPicked(new Set()); setOpen(false); }}>Add {picked.size || ""}</button>
          </div>
        </div>
      )}
    </div>
  );
}
