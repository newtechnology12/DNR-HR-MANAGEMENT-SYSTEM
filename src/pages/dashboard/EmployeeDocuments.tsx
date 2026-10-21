import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { Download, Eye, FolderOpen, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import {
  Chip, Field, FileDrop, FilePreview, ListToolbar, fileKind, fileUrl, inputCls, showDate, textareaCls, toFormData, toPbDate, useMe,
} from "@/components/portal/kit";

export const DOCUMENT_TYPES: { value: string; label: string; group: string; expires?: boolean; numbered?: boolean }[] = [
  { value: "national_id", label: "National ID", group: "Identity", numbered: true },
  { value: "passport", label: "Passport", group: "Identity", expires: true, numbered: true },
  { value: "drivers_license", label: "Driving licence", group: "Identity", expires: true, numbered: true },
  { value: "contract", label: "Employment contract", group: "Employment", expires: true },
  { value: "appointment", label: "Appointment letter", group: "Employment" },
  { value: "cv", label: "Curriculum vitae", group: "Qualifications" },
  { value: "certificate", label: "Academic certificate", group: "Qualifications" },
  { value: "professional", label: "Professional certificate", group: "Qualifications", expires: true },
  { value: "medical", label: "Medical certificate", group: "Other" },
  { value: "other", label: "Other document", group: "Other" },
];
// Older records used free text or other codes.
const LEGACY: Record<string, string> = { id: "national_id", "national id": "national_id", "employment contract": "contract", voters_id: "other", ssnit: "other" };
const typeOf = (t = "") => DOCUMENT_TYPES.find((d) => d.value === (LEGACY[t.toLowerCase()] || t)) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
const GROUPS = ["Identity", "Employment", "Qualifications", "Other"];

function expiry(d?: string) {
  if (!d) return null;
  const days = differenceInCalendarDays(new Date(d.replace(" ", "T")), new Date());
  if (days < 0) return { label: `Expired ${showDate(d)}`, tone: "danger" as const };
  if (days <= 60) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, tone: "warning" as const };
  return { label: `Valid until ${showDate(d)}`, tone: "success" as const };
}

export default function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const { canPerform } = useRoles();
  const [search, setSearch] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const [adding, setAdding] = React.useState(false);
  const [viewing, setViewing] = React.useState<any>(null);
  const [deleting, setDeleting] = React.useState<any>(null);

  const q = useQuery(["employee-documents", employeeId], () =>
    pocketbase.collection("employee_documents").getFullList({ filter: `employee = "${employeeId}"`, sort: "-created", expand: "created_by" })
  );
  const isSelf = me.data?.id === employeeId;
  const canAdd = isSelf || (me.data && me.data.hrScope !== "own");
  const canDelete = !isSelf && canPerform("delete_employee_documents");

  const del = useMutation(() => pocketbase.collection("employee_documents").delete(deleting.id), {
    onSuccess: () => {
      toast.success("Document deleted");
      setDeleting(null);
      setViewing(null);
      queryClient.invalidateQueries(["employee-documents", employeeId]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const docs = (q.data || []) as any[];
  const counts = Object.fromEntries(GROUPS.map((g) => [g, docs.filter((d) => typeOf(d.type).group === g).length]));
  const attention = docs.filter((d) => ["danger", "warning"].includes(expiry(d.expiry_date)?.tone || ""));
  const shown = docs.filter(
    (d) => (group === "all" || typeOf(d.type).group === group) && `${d.name} ${typeOf(d.type).label} ${d.document_number || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3 text-[12.5px] text-emerald-900">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" />
        <p>
          {isSelf ? "Your documents are private: only you and HR can see them." : "Only this employee, their department head and HR can see these documents."} Documents are kept permanently — they
          can be added but not deleted from the portal.
        </p>
      </div>

      {attention.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          {attention.length} document{attention.length > 1 ? "s need" : " needs"} attention: {attention.map((d) => `${d.name} (${expiry(d.expiry_date)!.label.toLowerCase()})`).join(", ")}. Upload the renewed version.
        </div>
      )}

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search documents"
        filters={
          <>
            <Chip active={group === "all"} onClick={() => setGroup("all")} count={docs.length}>All</Chip>
            {GROUPS.map((g) => (
              <Chip key={g} active={group === g} onClick={() => setGroup(g)} count={counts[g]}>{g}</Chip>
            ))}
          </>
        }
        action={canAdd && <Button onClick={() => setAdding(true)} className="h-10"><Plus size={16} /> Add document</Button>}
      />

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : !shown.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <FolderOpen size={26} className="text-slate-400" />
          <p className="text-[14px] font-medium text-slate-800">{docs.length ? "No document matches your search" : "No documents yet"}</p>
          <p className="max-w-sm text-[12.5px] text-slate-500">{docs.length ? "Try another word or category." : "Add your national ID, contract, CV and certificates so HR has a complete file."}</p>
          {!docs.length && canAdd && <Button size="sm" className="mt-1" onClick={() => setAdding(true)}><Plus size={14} /> Add document</Button>}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => {
            const k = fileKind(d.attachment);
            const exp = expiry(d.expiry_date);
            return (
              <li key={d.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-card">
                <button type="button" onClick={() => setViewing(d)} className="flex items-start gap-3 text-left">
                  <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", k.color)}><k.icon size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-slate-900">{d.name}</span>
                    <span className="block text-[12.5px] text-slate-500">{typeOf(d.type).label}{d.document_number ? ` · No. ${d.document_number}` : ""}</span>
                  </span>
                </button>
                {d.description && <p className="mt-2 line-clamp-2 text-[12.5px] text-slate-600">{d.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {exp && <Badge tone={exp.tone}>{exp.label}</Badge>}
                  <span className="text-[11.5px] text-slate-500">Added {showDate(d.created)}{d.expand?.created_by && d.created_by !== employeeId ? ` by ${d.expand.created_by.name}` : ""}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setViewing(d)} disabled={!d.attachment}><Eye size={15} /> View</Button>
                  <a href={fileUrl(d, d.attachment, true)} className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50", !d.attachment && "pointer-events-none opacity-50")}>
                    <Download size={15} /> Download
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FilePreview
        record={viewing}
        name={viewing?.attachment || null}
        title={viewing ? `${viewing.name} — ${typeOf(viewing.type).label}` : ""}
        onClose={() => setViewing(null)}
        footer={
          canDelete ? (
            <Button variant="ghost" className="mr-auto h-10 text-red-700" onClick={() => setDeleting(viewing)}><Trash2 size={15} /> Delete</Button>
          ) : (
            <span className="mr-auto flex items-center gap-1 text-[12px] text-slate-500"><Lock size={13} /> Kept permanently</span>
          )
        }
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>The file is removed permanently. The deletion is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep</Button>
            <Button variant="destructive" disabled={del.isLoading} onClick={() => del.mutate()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {adding && <AddDocumentDialog employeeId={employeeId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); queryClient.invalidateQueries(["employee-documents", employeeId]); }} />}
    </div>
  );
}

function AddDocumentDialog({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = React.useState("national_id");
  const [name, setName] = React.useState("National ID");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [v, setV] = React.useState({ document_number: "", issue_date: "", expiry_date: "", description: "" });
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const meta = typeOf(type);

  React.useEffect(() => {
    if (!nameTouched) setName(type === "other" ? "" : meta.label);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = {
    name: !name.trim() && (type === "other" ? "Say what this document is." : "Enter a name."),
    file: !files.length && "Choose the file to upload.",
    expiry: v.expiry_date && v.issue_date && v.expiry_date < v.issue_date && "The expiry date must be after the issue date.",
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation(
    () =>
      pocketbase.collection("employee_documents").create(
        toFormData({ name: name.trim(), type, employee: employeeId, document_number: v.document_number.trim(), issue_date: toPbDate(v.issue_date), expiry_date: toPbDate(v.expiry_date), description: v.description.trim() }, { attachment: files })
      ),
    {
      onSuccess: () => {
        toast.success("Document added");
        onSaved();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-xl flex-col gap-0 bg-white p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-5">
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>Upload a clear scan or photo. Once added, a document stays in your file.</DialogDescription>
        </DialogHeader>
        <form
          id="add-doc"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (!invalid) save.mutate();
          }}
        >
          <Field label="Document type" required>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {DOCUMENT_TYPES.filter((d) => d.group === g).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={type === "other" ? "What is this document?" : "Document name"} required error={tried && errors.name}>
            <input className={inputCls} value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder={type === "other" ? "e.g. Bank account confirmation" : ""} aria-invalid={Boolean(tried && errors.name)} />
          </Field>
          {(meta.numbered || meta.expires) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {meta.numbered && (
                <Field label="Document number">
                  <input className={inputCls} value={v.document_number} onChange={set("document_number")} inputMode="text" />
                </Field>
              )}
              <Field label="Issue date">
                <input type="date" className={inputCls} value={v.issue_date} onChange={set("issue_date")} max={new Date().toISOString().slice(0, 10)} />
              </Field>
              {meta.expires && (
                <Field label="Expiry date" hint="You will be reminded before it expires." error={tried && errors.expiry}>
                  <input type="date" className={inputCls} value={v.expiry_date} onChange={set("expiry_date")} min={v.issue_date || undefined} />
                </Field>
              )}
            </div>
          )}
          <Field label="Notes">
            <textarea className={textareaCls} rows={2} value={v.description} onChange={set("description")} placeholder="Optional" />
          </Field>
          <Field label="File" required error={tried && errors.file}>
            <FileDrop files={files} onChange={setFiles} multiple={false} label="Choose the document" />
          </Field>
        </form>
        <DialogFooter className="flex-row gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" className="h-10 flex-1 sm:flex-none" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-doc" className="h-10 flex-1 sm:flex-none" disabled={save.isLoading}>{save.isLoading ? "Uploading…" : "Add document"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
