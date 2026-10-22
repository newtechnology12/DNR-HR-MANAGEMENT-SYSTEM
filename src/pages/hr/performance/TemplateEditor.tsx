import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/procurement";
import { GradeBand, ScaleLevel, Section } from "@/lib/hr";
import { Button, Card, Checkbox, Column, DataTable, EmptyState, Field, FormBody, FormSection, Input, Page, PageHeader, StatusPill, Textarea } from "@/components/ims";
import { cn } from "@/utils";

const uid = () => Math.random().toString(36).slice(2, 9);
const LIST = "/dashboard/hr/performance";
const small = "h-9 text-t-body";

export default function TemplateEditor() {
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
        toast.success(`${rec.name || "Template"} saved. New appraisal cycles use it`);
        queryClient.invalidateQueries(["appraisal-templates-all"]);
        queryClient.invalidateQueries(["appraisal-templates"]);
        setSelected(rec.id);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );

  const header = (extra?: Partial<React.ComponentProps<typeof PageHeader>>) => (
    <PageHeader
      breadcrumbs={[{ label: "HR", to: "/dashboard/hr/employees" }, { label: "Performance appraisals", to: LIST }, { label: "Templates" }]}
      title="Appraisal templates"
      subtitle="What staff are evaluated on. Running cycles keep the version they were launched with."
      {...extra}
    />
  );

  if (list.isLoading || !t) {
    return (
      <Page>
        {header()}
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-96 w-full rounded-card" />
        </div>
      </Page>
    );
  }
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
    weightSum !== 100 && `Section weights add up to ${weightSum}%: change them so they add up to 100%.`,
    !scale.length && "Add at least one rating level.",
    sections.some((s) => !s.criteria.length) && "Every section needs at least one criterion.",
    !bands.length && "Add grade bands.",
  ].filter(Boolean) as string[];

  const duplicate = () => {
    setSelected("");
    setT({ ...t, id: undefined, name: `${t.name} (copy)` });
  };
  const create = () => {
    setSelected("");
    setT({ name: "New template", description: "", rating_scale: scale, sections: [{ id: uid(), title: "Objectives", weight: 100, criteria: [{ id: uid(), title: "Achievement of objectives", description: "", weight: 1 }] }], grade_bands: bands, activity_weight: 20, allow_self_assessment: true, active: true });
  };

  const removeButton = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="icon-sm" icon={Trash2} aria-label={label} title={label} onClick={onClick} className="hover:bg-ims-danger-bg hover:text-ims-danger" />
  );

  const scaleColumns: Column<ScaleLevel>[] = [
    {
      key: "value",
      header: "Value",
      width: "96px",
      cell: (s, i) => <Input type="number" min={1} className={cn(small, "text-right tabular-nums")} aria-label={`Level ${i + 1} value`} value={s.value} onChange={(e) => upd({ rating_scale: scale.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })} />,
    },
    {
      key: "label",
      header: "Label",
      cell: (s, i) => <Input className={small} aria-label={`Level ${i + 1} label`} placeholder="For example: Meets expectations" value={s.label} onChange={(e) => upd({ rating_scale: scale.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />,
    },
    { key: "remove", header: <span className="sr-only">Remove</span>, width: "56px", align: "center", cell: (_, i) => removeButton(`Remove level ${i + 1}`, () => upd({ rating_scale: scale.filter((__, j) => j !== i) })) },
  ];
  const bandColumns: Column<GradeBand>[] = [
    {
      key: "min",
      header: "From score",
      width: "112px",
      cell: (b, i) => <Input type="number" min={0} max={100} className={cn(small, "text-right tabular-nums")} aria-label={`Grade ${i + 1} from score`} value={b.min} onChange={(e) => upd({ grade_bands: bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />,
    },
    {
      key: "grade",
      header: "Grade",
      width: "84px",
      cell: (b, i) => <Input className={cn(small, "text-center font-semibold")} aria-label={`Grade ${i + 1} letter`} value={b.grade} onChange={(e) => upd({ grade_bands: bands.map((x, j) => (j === i ? { ...x, grade: e.target.value.toUpperCase().slice(0, 3) } : x)) })} />,
    },
    {
      key: "label",
      header: "Meaning",
      cell: (b, i) => <Input className={small} aria-label={`Grade ${i + 1} meaning`} placeholder="For example: Exceeds expectations" value={b.label} onChange={(e) => upd({ grade_bands: bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />,
    },
    { key: "remove", header: <span className="sr-only">Remove</span>, width: "56px", align: "center", cell: (_, i) => removeButton(`Remove grade ${i + 1}`, () => upd({ grade_bands: bands.filter((__, j) => j !== i) })) },
  ];

  return (
    <Page>
      {header(
        canEdit
          ? {
              primary: { label: "Save template", onClick: () => save.mutate(), loading: save.isLoading, disabled: problems.length > 0 },
              secondary: [
                { label: "Duplicate", icon: Copy, onClick: duplicate },
                { label: "New template", icon: Plus, onClick: create },
              ],
            }
          : undefined
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card padded={false} className="self-start" aria-label="Templates">
          <h2 className="border-b border-ims-divider px-4 py-3 text-t-section text-ims-text">Templates</h2>
          <ul className="divide-y divide-ims-divider">
            {!selected && (
              <li className="border-l-[3px] border-ims-link bg-ims-info-bg px-4 py-3" aria-current="true">
                <span className="block truncate text-t-body font-semibold text-ims-text">{t.name || "New template"}</span>
                <span className="text-t-small text-ims-muted">Not saved yet</span>
              </li>
            )}
            {(list.data || []).map((x: any) => {
              const on = selected === x.id;
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(x.id)}
                    aria-current={on || undefined}
                    className={cn(
                      "block w-full border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus",
                      on ? "border-ims-link bg-ims-info-bg" : "border-transparent hover:bg-ims-hover"
                    )}
                  >
                    <span className="block truncate text-t-body font-semibold text-ims-text">{x.name}</span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-t-small text-ims-muted">{(x.sections || []).length} section{(x.sections || []).length === 1 ? "" : "s"}</span>
                      <StatusPill status={x.active ? "Active" : "Inactive"} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          {problems.length > 0 && (
            <div role="status" className="rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-ims-warning">
              <p className="flex items-center gap-2 text-t-body font-bold"><AlertTriangle size={16} aria-hidden /> Fix these before you save</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-t-small">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}

          <FormBody>
            <FormSection title="Template" description="Its name, and how much of the final score comes from the system.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Template name" required htmlFor="tpl-name">
                  <Input id="tpl-name" value={t.name} onChange={(e) => upd({ name: e.target.value })} />
                </Field>
                <Field label={`System activity score weight: ${t.activity_weight || 0}%`} htmlFor="tpl-activity" hint="Share of the final score that comes from action plans and reports (0 turns it off).">
                  <input id="tpl-activity" type="range" min={0} max={50} step={5} value={t.activity_weight || 0} onChange={(e) => upd({ activity_weight: Number(e.target.value) })} className="h-control w-full cursor-pointer accent-ims-primary" />
                </Field>
                <Field label="Description" htmlFor="tpl-description" className="sm:col-span-2">
                  <Textarea id="tpl-description" rows={2} className="min-h-[72px]" value={t.description || ""} onChange={(e) => upd({ description: e.target.value })} />
                </Field>
                <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:gap-8">
                  <Checkbox id="tpl-self" label="Staff complete a self-assessment" checked={Boolean(t.allow_self_assessment)} onChange={(v) => upd({ allow_self_assessment: v })} />
                  <Checkbox id="tpl-active" label="Active" hint="Only active templates can be chosen for a new cycle." checked={Boolean(t.active)} onChange={(v) => upd({ active: v })} />
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Criteria"
              description={
                <span className={cn("font-semibold", weightSum === 100 ? "text-ims-success" : "text-ims-warning")}>
                  Section weights add up to {weightSum}%{weightSum === 100 ? "." : " (should be 100%)."}
                </span>
              }
            >
              <div className="space-y-4">
                {sections.map((s, i) => (
                  <div key={s.id} className="overflow-hidden rounded-control border border-ims-border">
                    <div className="flex flex-wrap items-center gap-2 border-b border-ims-divider bg-ims-thead px-3 py-2.5">
                      <span className="w-5 text-t-small font-bold text-ims-muted" aria-hidden>{i + 1}</span>
                      <Input className={cn(small, "min-w-[180px] flex-1 font-semibold")} value={s.title} onChange={(e) => updSection(i, { title: e.target.value })} aria-label={`Section ${i + 1} title`} />
                      <label className="flex items-center gap-1.5 text-t-small text-ims-muted">
                        Weight
                        <Input type="number" min={0} max={100} className={cn(small, "w-20 text-right tabular-nums")} value={s.weight} onChange={(e) => updSection(i, { weight: Number(e.target.value) })} aria-label={`Section ${i + 1} weight (%)`} />
                        %
                      </label>
                      <span className="ml-auto flex items-center">
                        <Button variant="ghost" size="icon-sm" icon={ArrowUp} aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => upd({ sections: move(sections, i, -1) })} />
                        <Button variant="ghost" size="icon-sm" icon={ArrowDown} aria-label={`Move section ${i + 1} down`} disabled={i === sections.length - 1} onClick={() => upd({ sections: move(sections, i, 1) })} />
                        {removeButton(`Remove section ${i + 1}`, () => upd({ sections: sections.filter((_, j) => j !== i) }))}
                      </span>
                    </div>
                    {s.criteria.length > 0 && (
                      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_88px_76px] gap-2 px-3 pt-2.5 text-t-small font-semibold text-ims-muted sm:grid">
                        <span>Criterion</span>
                        <span>What evaluators look at</span>
                        <span className="text-right" title="Relative weight inside the section">Weight</span>
                        <span className="sr-only">Actions</span>
                      </div>
                    )}
                    <ul className="divide-y divide-ims-divider sm:divide-y-0">
                      {s.criteria.map((c, k) => (
                        <li key={c.id} className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_88px_76px] sm:items-center sm:py-1.5">
                          <Input className={small} value={c.title} placeholder="Criterion" aria-label={`Section ${i + 1}, criterion ${k + 1}`} onChange={(e) => updSection(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
                          <Input className={small} value={c.description || ""} placeholder="What evaluators should look at (optional)" aria-label={`Section ${i + 1}, criterion ${k + 1} guidance`} onChange={(e) => updSection(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, description: e.target.value } : x)) })} />
                          <Input type="number" min={0.5} step={0.5} className={cn(small, "text-right tabular-nums")} value={c.weight} title="Relative weight inside the section" aria-label={`Section ${i + 1}, criterion ${k + 1} weight`} onChange={(e) => updSection(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, weight: Number(e.target.value) } : x)) })} />
                          <span className="flex items-center justify-end">
                            <Button variant="ghost" size="icon-sm" icon={ArrowUp} aria-label={`Move criterion ${k + 1} up`} disabled={k === 0} onClick={() => updSection(i, { criteria: move(s.criteria, k, -1) })} />
                            {removeButton(`Remove criterion ${k + 1}`, () => updSection(i, { criteria: s.criteria.filter((_, j) => j !== k) }))}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!s.criteria.length && <p className="px-3 pt-3 text-t-small text-ims-danger">Add at least one criterion to this section.</p>}
                    <div className="px-3 py-2">
                      <Button size="sm" variant="ghost" icon={Plus} onClick={() => updSection(i, { criteria: [...s.criteria, { id: uid(), title: "", description: "", weight: 1 }] })}>Add criterion</Button>
                    </div>
                  </div>
                ))}
                <Button icon={Plus} onClick={() => upd({ sections: [...sections, { id: uid(), title: "New section", weight: 0, criteria: [{ id: uid(), title: "", description: "", weight: 1 }] }] })}>Add section</Button>
              </div>
            </FormSection>

            <div className="grid gap-4 2xl:grid-cols-2">
              <FormSection title="Rating scale" description="The values evaluators choose from, lowest first.">
                <div className="overflow-hidden rounded-control border border-ims-border">
                  <DataTable columns={scaleColumns} rows={scale} rowKey={(_, i) => String(i)} minWidth={300} caption="Rating scale" empty={<EmptyState compact text="No rating levels yet." />} />
                </div>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => upd({ rating_scale: [...scale, { value: (scale[scale.length - 1]?.value || 0) + 1, label: "" }] })}>Add level</Button>
              </FormSection>
              <FormSection title="Grades" description="The final score (out of 100) from which each grade starts.">
                <div className="overflow-hidden rounded-control border border-ims-border">
                  <DataTable columns={bandColumns} rows={bands} rowKey={(_, i) => String(i)} minWidth={360} caption="Grades" empty={<EmptyState compact text="No grades yet." />} />
                </div>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => upd({ grade_bands: [...bands, { min: 0, grade: "", label: "" }] })}>Add grade</Button>
              </FormSection>
            </div>
          </FormBody>
        </fieldset>
      </div>
    </Page>
  );
}
