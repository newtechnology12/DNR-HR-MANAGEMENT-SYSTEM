/**
 * Supporting documents of a business document: list (with image previews), open / download, upload by
 * drag & drop or file picker (several at once), remove while the document is still being prepared.
 * Uploads go through /api/ims/attachments (server checks who may attach, file types and sizes, and audits).
 */
import * as React from "react";
import { toast } from "sonner";
import { Download, ExternalLink, File, FileImage, FileSpreadsheet, FileText, Loader2, Lock, Paperclip, Trash2, Upload } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { EmptyState } from "@/components/enterprise/ui";
import { cn } from "@/utils";

const MAX = 20 * 1024 * 1024;
const OK = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv|pptx?|txt|zip|msg|eml)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/** PocketBase adds a random suffix to stored names ("invoice_8xk2l0s9qa.pdf"); show the original name. */
export const displayName = (f: string) => f.replace(/_[a-z0-9]{10}(\.[a-z0-9]+)$/i, "$1");
const iconFor = (f: string) => (IMAGE.test(f) ? FileImage : /\.(xlsx?|csv)$/i.test(f) ? FileSpreadsheet : /\.(pdf|docx?|txt)$/i.test(f) ? FileText : File);

export default function Attachments({
  collection, record, field = "attachments", canAdd, canRemove, onChange, hint,
}: {
  collection: string;
  record: any;
  field?: string;
  /** Show the upload area (the server checks again). */
  canAdd?: boolean;
  /** Files can still be removed (document being prepared). */
  canRemove?: boolean;
  onChange?: () => void;
  hint?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const files: string[] = Array.isArray(record?.[field]) ? record[field] : record?.[field] ? [record[field]] : [];

  async function upload(list: FileList | File[] | null) {
    const chosen = Array.from(list || []);
    if (!chosen.length) return;
    const bad = chosen.filter((f) => f.size > MAX || !OK.test(f.name));
    if (bad.length) {
      toast.error(`${bad.map((f) => f.name).join(", ")}: only PDF, images, Office, CSV, text, e-mail or zip files up to 20 MB.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      chosen.forEach((f) => body.append("files", f));
      await pocketbase.send(`/api/ims/attachments/${collection}/${record.id}`, { method: "POST", body });
      toast.success(`${chosen.length} document${chosen.length > 1 ? "s" : ""} attached`);
      onChange?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: string) {
    if (!window.confirm(`Remove ${displayName(f)}?`)) return;
    try {
      await pocketbase.send(`/api/ims/attachments/${collection}/${record.id}/${encodeURIComponent(f)}`, { method: "DELETE" });
      toast.success(`${displayName(f)} removed`);
      onChange?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-3">
      {canAdd && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-[13px] transition-colors", drag ? "border-primary bg-primary/[0.05]" : "border-slate-200 bg-slate-50 hover:border-primary/40 hover:bg-primary/[0.03]")}
        >
          {busy ? <Loader2 size={18} className="animate-spin text-primary" /> : <Upload size={18} className="text-slate-400" />}
          <span><span className="font-medium text-primaryDark">Add documents</span> — choose files or drop them here</span>
          <span className="text-[11.5px] text-slate-500">{hint || "PDF, images, Word, Excel… up to 20 MB each"}</span>
          <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {!files.length ? (
        <EmptyState icon={Paperclip} text={canAdd ? "No document attached yet." : "No supporting documents."} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => {
            const Icon = iconFor(f);
            const url = pocketbase.files.getUrl(record, f);
            return (
              <li key={f} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                {IMAGE.test(f) ? (
                  <a href={url} target="_blank" rel="noreferrer" className="shrink-0"><img src={pocketbase.files.getUrl(record, f, { thumb: "100x100" })} alt="" className="h-11 w-11 rounded object-cover" /></a>
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500"><Icon size={20} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900" title={displayName(f)}>{displayName(f)}</span>
                  <span className="flex items-center gap-2 text-[12px]">
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primaryDark hover:underline"><ExternalLink size={12} /> Open</a>
                    <a href={`${url}?download=1`} className="inline-flex items-center gap-1 text-slate-600 hover:underline"><Download size={12} /> Download</a>
                  </span>
                </span>
                {canRemove ? (
                  <button type="button" onClick={() => remove(f)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${displayName(f)}`}><Trash2 size={14} /></button>
                ) : (
                  <span title="Part of the record — cannot be removed" className="p-1.5 text-slate-300"><Lock size={13} /></span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
