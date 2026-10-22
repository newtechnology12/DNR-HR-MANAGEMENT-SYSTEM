/**
 * One employee's personal file (ID, contract, certificates…), embedded in a card: the staff workspace
 * (/dashboard/my/documents), the HR employee profile and the classic portal. Documents are kept
 * permanently; only HR with the "delete_employee_documents" permission can delete one.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { Download, Eye, FolderOpen, Lock, Plus, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { FileDrop, FilePreview, fileKind, fileUrl, toFormData, toPbDate, useMe } from "@/components/portal/kit";
import {
  Button,
  Column,
  ConfirmDialog,
  DataTable,
  DatePicker,
  EmptyState,
  FilterBar,
  FilterSelect,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  TwoLine,
  fmtDate,
} from "@/components/ims";

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
  if (days < 0) return { label: `Expired ${fmtDate(d)}`, tone: "danger" as const };
  if (days <= 60) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, tone: "warning" as const };
  return { label: `Valid until ${fmtDate(d)}`, tone: "success" as const };
}
const EXPIRY_TEXT = { danger: "font-semibold text-ims-danger", warning: "font-semibold text-ims-warning", success: "text-ims-body" };

/** inset: the list sits inside a padded card (no side padding, table in its own box); otherwise it fills an unpadded card. */
export default function EmployeeDocuments({ employeeId, inset = false }: { employeeId: string; inset?: boolean }) {
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
      toast.success(`${deleting?.name || "Document"} deleted`);
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
  const filtered = Boolean(search.trim() || group !== "all");

  const download = (d: any) => {
    if (d.attachment) window.location.assign(fileUrl(d, d.attachment, true));
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Document",
      cell: (d) => {
        const k = fileKind(d.attachment);
        return (
          <span className="flex min-w-0 items-center gap-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-control", k.color)} aria-hidden><k.icon size={17} /></span>
            <TwoLine main={d.name} sub={[typeOf(d.type).label !== d.name ? typeOf(d.type).label : "", d.document_number ? `No. ${d.document_number}` : "", d.description].filter(Boolean).join(" · ")} />
          </span>
        );
      },
      className: "max-w-[420px]",
    },
    {
      key: "validity",
      header: "Validity",
      nowrap: true,
      cell: (d) => {
        const exp = expiry(d.expiry_date);
        return exp ? <span className={EXPIRY_TEXT[exp.tone]}>{exp.label}</span> : <span className="text-ims-faint">No expiry</span>;
      },
    },
    {
      key: "created",
      header: "Added",
      nowrap: true,
      cell: (d) => fmtDate(d.created),
      sub: (d) => (d.expand?.created_by && d.created_by !== employeeId ? `by ${d.expand.created_by.name}` : undefined),
    },
  ];

  const notices = (
    <>
      <p className="flex items-start gap-2 text-t-small text-ims-muted">
        <ShieldCheck size={16} className="mt-px shrink-0 text-ims-success" aria-hidden />
        <span>
          {isSelf ? "Your documents are private: only you and HR can see them." : "Only this employee, their head of department and HR can see these documents."} Documents are kept permanently: they can be
          added but not deleted from the portal.
        </span>
      </p>
      {attention.length > 0 && (
        <div role="status" className="flex items-start gap-2.5 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-text">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-ims-warning" aria-hidden />
          <p>
            <b>{attention.length} document{attention.length > 1 ? "s need" : " needs"} attention:</b>{" "}
            {attention.map((d) => `${d.name} (${expiry(d.expiry_date)!.label.toLowerCase()})`).join(", ")}. Upload the renewed version.
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="min-w-0">
      <div className={cn("space-y-3", inset ? "mb-4" : "px-4 pt-4 sm:px-5")}>{notices}</div>
      <FilterBar
        className={inset ? "!px-0 !pt-0" : undefined}
        search={{ value: search, onChange: setSearch, placeholder: "Search name, type or number" }}
        chips={group !== "all" ? [{ key: "group", label: `Group: ${group}`, onRemove: () => setGroup("all") }] : []}
        onClear={() => setGroup("all")}
        right={canAdd && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add document</Button>}
      >
        <FilterSelect
          label="Group"
          value={group === "all" ? "" : group}
          onChange={(v) => setGroup(v || "all")}
          options={GROUPS.map((g) => ({ value: g, label: `${g} (${counts[g]})` }))}
        />
      </FilterBar>
      <div className={inset ? "overflow-hidden rounded-control border border-ims-border" : "border-t border-ims-divider"}>
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(d) => d.id}
          onRowClick={(d) => setViewing(d)}
          rowActions={(d) => [
            { label: "View", icon: Eye, disabled: !d.attachment, onSelect: (row) => setViewing(row) },
            { label: "Download", icon: Download, disabled: !d.attachment, onSelect: download },
            ...(canDelete ? [{ label: "Delete", icon: Trash2, danger: true, onSelect: (row: any) => setDeleting(row) }] : []),
          ]}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={shown.length ? 620 : 0}
          caption="Personal documents"
          empty={
            <EmptyState
              icon={FolderOpen}
              text={filtered ? "No document matches. Try another word or group." : "No document yet. Add the national ID, contract, CV and certificates so HR has a complete file."}
              action={!filtered && canAdd ? <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add document</Button> : undefined}
            />
          }
        />
      </div>

      <FilePreview
        record={viewing}
        name={viewing?.attachment || null}
        title={viewing ? `${viewing.name} · ${typeOf(viewing.type).label}` : ""}
        onClose={() => setViewing(null)}
        footer={
          canDelete ? (
            <Button variant="ghost" icon={Trash2} className="mr-auto text-ims-danger hover:bg-ims-danger-bg hover:text-ims-danger" onClick={() => setDeleting(viewing)}>Delete</Button>
          ) : (
            <span className="mr-auto flex items-center gap-1.5 text-t-small text-ims-muted"><Lock size={13} aria-hidden /> Kept permanently</span>
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || "this document"}?`}
        description="The file is removed permanently. The deletion is recorded in the audit log."
        confirmLabel="Delete"
        danger
        onConfirm={() => del.mutateAsync()}
      />

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
        toast.success(`${name.trim()} added to the file`);
        onSaved();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const setDate = (k: "issue_date" | "expiry_date") => (value: string) => setV((x) => ({ ...x, [k]: value }));
  const submit = () => {
    setTried(true);
    if (!invalid) save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a document"
      description="Upload a clear scan or photo. Once added, a document stays in the file."
      footer={
        <>
          <Button onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isLoading}>Add document</Button>
        </>
      }
    >
      <Field label="Document type" required htmlFor="doc-type">
        <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value)}>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {DOCUMENT_TYPES.filter((d) => d.group === g).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </optgroup>
          ))}
        </Select>
      </Field>
      <Field label={type === "other" ? "What is this document?" : "Document name"} required htmlFor="doc-name" error={tried && errors.name}>
        <Input id="doc-name" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder={type === "other" ? "For example: bank account confirmation" : ""} invalid={Boolean(tried && errors.name)} />
      </Field>
      {(meta.numbered || meta.expires) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {meta.numbered && (
            <Field label="Document number" htmlFor="doc-number">
              <Input id="doc-number" value={v.document_number} onChange={set("document_number")} inputMode="text" />
            </Field>
          )}
          <Field label="Issue date" htmlFor="doc-issued">
            <DatePicker id="doc-issued" value={v.issue_date} onChange={setDate("issue_date")} max={format(new Date(), "yyyy-MM-dd")} />
          </Field>
          {meta.expires && (
            <Field label="Expiry date" htmlFor="doc-expires" hint="You will be reminded before it expires." error={tried && errors.expiry}>
              <DatePicker id="doc-expires" value={v.expiry_date} onChange={setDate("expiry_date")} min={v.issue_date || undefined} invalid={Boolean(tried && errors.expiry)} />
            </Field>
          )}
        </div>
      )}
      <Field label="Notes" htmlFor="doc-notes" hint="Optional.">
        <Textarea id="doc-notes" rows={2} className="min-h-[72px]" value={v.description} onChange={set("description")} />
      </Field>
      <Field label="File" required error={tried && errors.file}>
        <FileDrop files={files} onChange={setFiles} multiple={false} label="Choose the document" />
      </Field>
    </Modal>
  );
}
