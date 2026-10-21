import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, PageHeader } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { GradeBand, ScaleLevel, Section } from "@/lib/hr";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const uid = () => Math.random().toString(36).slice(2, 9);
const small = "h-9 w-full rounded-md border border-slate-200 px-2 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function TemplateEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_appraisals");
  const list = useQuery(["appraisal-templates-all"], () => pocketbase.collection("appraisal_templates").getFullList({ sort: "name" }));
  const [selected, setSelected] = React.useState<string>("");
  const [t, setT] = React.useState<any>(null);
  React.useEffect(() => {
    if (!selected && list.data?.[0]) setSelected(list.data[0].id);
  }, [list.data, selected]);
  React.useEffect(() => {
    const rec: any = (list.data || []).find((x: any) => x.id === selected);
    if (rec) setT(JSON.parse(JSON.stringify(rec)));
  }, [selected, list.data]);

  const save = useMutation(
    () => {
      const data = { name: t.name, description: t.description, rating_scale: t.rating_scale, sections: t.sections, grade_bands: t.grade_bands, activity_weight: Number(t.activity_weight) || 0, allow_self_assessment: Boolean(t.allow_self_assessment), active: Boolean(t.active) };
      return t.id ? pocketbase.collection("appraisal_templates").update(t.id, data) : pocketbase.collection("appraisal_templates").create(data);
    },
    {
      onSuccess: (rec: any) => {
        toast.success("Template saved — used by new appraisal cycles");
        queryClient.invalidateQueries(["appraisal-templates-all"]);
        queryClient.invalidateQueries(["appraisal-templates"]);
        setSelected(rec.id);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );

  if (list.isLoading || !t) return <div className="space-y-3 p-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>;
  const sections: Section[] = t.sections || [];
  const scale: ScaleLevel[] = t.rating_scale || [];
  const bands: GradeBand[] = t.grade_bands || [];
  const weightSum = sections.reduce((a, s) => a + (Number(s.weight) || 0), 0);
  const upd = (patch: any) => setT((x: any) => ({ ...x, ...patch }));
  const updSection = (i: number, patch: Partial<Section>) => upd({ sections: sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = <T,>(arr: T[], i: number, d: number) => {
    const out = arr.slice();
    const j = i + d;
    if (j < 0 || j >= out.length) return out;
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };
  const problems = [
    weightSum !== 100 && `Section weights add up to ${weightSum}% (should be 100%).`,
    !scale.length && "Add at least one rating level.",
    sections.some((s) => !s.criteria.length) && "Every section needs at least one criterion.",
    !bands.length && "Add grade bands.",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Appraisal templates"
        description="Define what staff are evaluated on. Changes apply to cycles created afterwards; running cycles keep the version they were launched with."
        breadcrumbs={[{ title: "Performance", link: "/dashboard/hr/performance" }, { title: "Templates", link: "/dashboard/hr/performance/templates" }]}
        actions={
          canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => { setSelected(""); setT({ ...t, id: undefined, name: `${t.name} (copy)` }); }}><Copy size={14} /> Duplicate</Button>
              <Button size="sm" variant="outline" onClick={() => { setSelected(""); setT({ name: "New template", description: "", rating_scale: scale, sections: [{ id: uid(), title: "Objectives", weight: 100, criteria: [{ id: uid(), title: "Achievement of objectives", description: "", weight: 1 }] }], grade_bands: bands, activity_weight: 20, allow_self_assessment: true, active: true }); }}><Plus size={14} /> New</Button>
              <Button size="sm" disabled={save.isLoading || problems.length > 0} onClick={() => save.mutate()}>Save template</Button>
            </>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-1">
          {(list.data || []).map((x: any) => (
            <button key={x.id} type="button" onClick={() => setSelected(x.id)} className={cn("w-full rounded-lg border px-3 py-2 text-left text-[13px]", selected === x.id ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300")}>
              <span className="block font-medium">{x.name}</span>
              <span className="text-[11.5px] text-slate-500">{(x.sections || []).length} sections · {x.active ? "active" : "inactive"}</span>
            </button>
          ))}
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => navigate("/dashboard/hr/performance")}>Back to appraisals</Button>
        </aside>

        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          {problems.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{problems.join(" ")}</div>}
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-2">
            <Field label="Template name" required><input className={inputCls} value={t.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
            <Field label={`System activity score weight: ${t.activity_weight || 0}%`} hint="Share of the final score coming from action plans and reports (0 to disable)">
              <input type="range" min={0} max={50} step={5} value={t.activity_weight || 0} onChange={(e) => upd({ activity_weight: Number(e.target.value) })} className="w-full accent-[#16a34a]" />
            </Field>
            <Field label="Description" className="sm:col-span-2"><textarea className={textareaCls} rows={2} value={t.description || ""} onChange={(e) => upd({ description: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-4 text-[13px] sm:col-span-2">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={Boolean(t.allow_self_assessment)} onChange={(e) => upd({ allow_self_assessment: e.target.checked })} /> Staff complete a self-assessment</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={Boolean(t.active)} onChange={(e) => upd({ active: e.target.checked })} /> Active</label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">Criteria</h2>
              <Badge tone={weightSum === 100 ? "success" : "warning"}>Weights: {weightSum}%</Badge>
            </div>
            <div className="space-y-4">
              {sections.map((s, i) => (
                <div key={s.id} className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <input className={cn(small, "min-w-[200px] flex-1 font-semibold")} value={s.title} onChange={(e) => updSection(i, { title: e.target.value })} aria-label="Section title" />
                    <label className="flex items-center gap-1 text-[12.5px]"><input type="number" min={0} max={100} className={cn(small, "w-20 text-right")} value={s.weight} onChange={(e) => updSection(i, { weight: Number(e.target.value) })} aria-label="Section weight" />%</label>
                    <button type="button" onClick={() => upd({ sections: move(sections, i, -1) })} className="rounded p-1.5 text-slate-500 hover:bg-white" aria-label="Move up"><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => upd({ sections: move(sections, i, 1) })} className="rounded p-1.5 text-slate-500 hover:bg-white" aria-label="Move down"><ArrowDown size={14} /></button>
                    <button type="button" onClick={() => upd({ sections: sections.filter((_, j) => j !== i) })} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove section"><Trash2 size={14} /></button>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {s.criteria.map((c, k) => (
                      <li key={c.id} className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-[1fr_1.4fr_80px_auto] sm:items-center">
                        <input className={small} value={c.title} placeholder="Criterion" onChange={(e) => updSection(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
                        <input className={small} value={c.description || ""} placeholder="What evaluators should look at (optional)" onChange={(e) => updSection(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, description: e.target.value } : x)) })} />
                        <input type="number" min={0.5} step={0.5} className={cn(small, "text-right")} value={c.weight} title="Relative weight inside the section" onChange={(e) => updSection(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, weight: Number(e.target.value) } : x)) })} />
                        <div className="flex">
                          <button type="button" onClick={() => updSection(i, { criteria: move(s.criteria, k, -1) })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Move up"><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => updSection(i, { criteria: s.criteria.filter((_, j) => j !== k) })} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove criterion"><Trash2 size={14} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="px-3 py-2"><Button type="button" size="sm" variant="ghost" onClick={() => updSection(i, { criteria: [...s.criteria, { id: uid(), title: "", description: "", weight: 1 }] })}><Plus size={14} /> Add criterion</Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => upd({ sections: [...sections, { id: uid(), title: "New section", weight: 0, criteria: [{ id: uid(), title: "", description: "", weight: 1 }] }] })}><Plus size={14} /> Add section</Button>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="mb-2 text-[14px] font-semibold">Rating scale</h2>
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="w-16 pb-1">Value</th><th className="pb-1">Label</th><th /></tr></thead>
                <tbody>
                  {scale.map((s, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2"><input type="number" min={1} className={cn(small, "text-right")} value={s.value} onChange={(e) => upd({ rating_scale: scale.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })} /></td>
                      <td className="py-1 pr-2"><input className={small} value={s.label} onChange={(e) => upd({ rating_scale: scale.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></td>
                      <td className="py-1"><button type="button" onClick={() => upd({ rating_scale: scale.filter((_, j) => j !== i) })} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove level"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => upd({ rating_scale: [...scale, { value: (scale[scale.length - 1]?.value || 0) + 1, label: "" }] })}><Plus size={14} /> Add level</Button>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="mb-2 text-[14px] font-semibold">Grades</h2>
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="w-24 pb-1">From score</th><th className="w-16 pb-1">Grade</th><th className="pb-1">Meaning</th><th /></tr></thead>
                <tbody>
                  {bands.map((b, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2"><input type="number" min={0} max={100} className={cn(small, "text-right")} value={b.min} onChange={(e) => upd({ grade_bands: bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} /></td>
                      <td className="py-1 pr-2"><input className={cn(small, "text-center font-semibold")} value={b.grade} onChange={(e) => upd({ grade_bands: bands.map((x, j) => (j === i ? { ...x, grade: e.target.value.toUpperCase().slice(0, 3) } : x)) })} /></td>
                      <td className="py-1 pr-2"><input className={small} value={b.label} onChange={(e) => upd({ grade_bands: bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></td>
                      <td className="py-1"><button type="button" onClick={() => upd({ grade_bands: bands.filter((_, j) => j !== i) })} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove grade"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => upd({ grade_bands: [...bands, { min: 0, grade: "", label: "" }] })}><Plus size={14} /> Add grade</Button>
            </section>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
