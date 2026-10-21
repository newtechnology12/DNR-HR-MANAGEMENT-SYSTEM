import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { SUPPLIER_STATUS, SUPPLIER_TYPES, errorMessage } from "@/lib/procurement";

const inputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const EMPTY = {
  name: "", supplier_type: "company", categories: [] as string[], registration_number: "", tin: "", vat_number: "",
  country: "Rwanda", province: "", district: "", address: "", email: "", phone: "", website: "",
  payment_terms: "30 days", currency: "RWF", status: "active",
  bank_name: "", bank_branch: "", bank_account_name: "", bank_account_number: "", swift_code: "", notes: "",
};
const BANK = ["bank_name", "bank_branch", "bank_account_name", "bank_account_number", "swift_code"] as const;

function F({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block text-[12.5px] font-medium text-slate-700", className)}>
      {label}
      {required && <span className="text-red-600"> *</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function SupplierFormDialog({
  open,
  onClose,
  supplier,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  supplier?: any;
  onSaved?: (s: any) => void;
}) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState({ ...EMPTY });
  React.useEffect(() => {
    if (open) setV(supplier ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, supplier[k] ?? (EMPTY as any)[k]])) } : { ...EMPTY });
  }, [open, supplier]);

  const cats = useQuery(["procurement-categories-active"], () =>
    pocketbase.collection("procurement_categories").getFullList({ filter: "active = true", sort: "name", fields: "id,name" })
  );

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const bankChanged = supplier && BANK.some((k) => (supplier[k] || "") !== (v[k] || ""));
  // Approved suppliers: bank details change only through a request verified by Finance (IMS §3 rule 6).
  const bankLocked = Boolean(supplier && !["draft", "rejected"].includes(supplier.status));

  const save = useMutation(
    () => {
      if (!v.name.trim()) throw new Error("Supplier name is required.");
      const approved = supplier && ["active", "inactive", "blacklisted"].includes(supplier.status);
      // New and onboarding suppliers change status only through the approval workflow.
      const body: any = { ...v, name: v.name.trim(), tin: v.tin.trim() };
      if (!approved) delete body.status;
      return supplier ? pocketbase.collection("suppliers").update(supplier.id, body) : pocketbase.collection("suppliers").create(body);
    },
    {
      onSuccess: (s: any) => {
        toast.success(supplier ? `${s.name} updated` : `${s.name} added as ${s.code}`);
        queryClient.invalidateQueries(["record-table"]);
        queryClient.invalidateQueries(["supplier", s.id]);
        onSaved?.(s);
        onClose();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : "Add supplier"}</DialogTitle>
          <DialogDescription>
            {supplier ? `Supplier code ${supplier.code}.` : "A supplier code is assigned automatically. Duplicate names and TINs are refused."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-semibold text-slate-900">Company</legend>
            <F label="Legal name" required className="sm:col-span-2"><input className={inputCls} value={v.name} onChange={set("name")} /></F>
            <F label="Type">
              <select className={inputCls} value={v.supplier_type} onChange={set("supplier_type")}>
                {SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </F>
            <F label="Registration number"><input className={inputCls} value={v.registration_number} onChange={set("registration_number")} /></F>
            <F label="TIN"><input className={inputCls} value={v.tin} onChange={set("tin")} inputMode="numeric" /></F>
            <F label="VAT number"><input className={inputCls} value={v.vat_number} onChange={set("vat_number")} /></F>
            <div className="sm:col-span-3">
              <p className="mb-1 text-[12.5px] font-medium text-slate-700">Supplies these categories</p>
              <div className="flex flex-wrap gap-1.5">
                {cats.data?.map((c: any) => {
                  const on = v.categories.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setV((x) => ({ ...x, categories: on ? x.categories.filter((id) => id !== c.id) : [...x.categories, c.id] }))}
                      className={cn("rounded-full border px-2.5 py-1 text-[12px]", on ? "border-primary bg-primary/10 text-primaryDark" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-semibold text-slate-900">Address and contact</legend>
            <F label="Country"><input className={inputCls} value={v.country} onChange={set("country")} /></F>
            <F label="Province"><input className={inputCls} value={v.province} onChange={set("province")} /></F>
            <F label="District"><input className={inputCls} value={v.district} onChange={set("district")} /></F>
            <F label="Street address" className="sm:col-span-3"><input className={inputCls} value={v.address} onChange={set("address")} /></F>
            <F label="Email"><input type="email" className={inputCls} value={v.email} onChange={set("email")} /></F>
            <F label="Phone"><input className={inputCls} value={v.phone} onChange={set("phone")} /></F>
            <F label="Website"><input className={inputCls} value={v.website} onChange={set("website")} placeholder="https://" /></F>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-semibold text-slate-900">Commercial terms</legend>
            <F label="Payment terms"><input className={inputCls} value={v.payment_terms} onChange={set("payment_terms")} /></F>
            <F label="Currency"><input className={inputCls} value={v.currency} onChange={set("currency")} maxLength={3} /></F>
            <F label="Status">
              {supplier && ["active", "inactive", "blacklisted"].includes(supplier.status) ? (
                <select className={inputCls} value={v.status} onChange={set("status")}>
                  {["active", "inactive", "blacklisted"].map((k) => <option key={k} value={k}>{SUPPLIER_STATUS[k].label}</option>)}
                </select>
              ) : (
                <p className="flex h-9 items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-[12.5px] text-slate-600">Draft — activated by approval</p>
              )}
            </F>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-semibold text-slate-900">Bank details</legend>
            <F label="Bank"><input className={inputCls} value={v.bank_name} onChange={set("bank_name")} disabled={bankLocked} /></F>
            <F label="Branch"><input className={inputCls} value={v.bank_branch} onChange={set("bank_branch")} disabled={bankLocked} /></F>
            <F label="SWIFT / BIC"><input className={inputCls} value={v.swift_code} onChange={set("swift_code")} disabled={bankLocked} /></F>
            <F label="Account name" className="sm:col-span-2"><input className={inputCls} value={v.bank_account_name} onChange={set("bank_account_name")} disabled={bankLocked} /></F>
            <F label="Account number"><input className={inputCls} value={v.bank_account_number} onChange={set("bank_account_number")} disabled={bankLocked} /></F>
            {bankLocked && (
              <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600 sm:col-span-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-slate-400" />
                Bank details of an approved supplier are changed with “Change bank details” on the supplier page and verified by Finance before any payment uses them.
              </p>
            )}
            {bankChanged && !bankLocked && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 sm:col-span-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                Bank detail changes are recorded separately in the audit log and alert all supplier managers. Confirm the change with the supplier by phone before saving.
              </p>
            )}
          </fieldset>

          <F label="Notes"><textarea className={cn(inputCls, "h-16 py-2")} value={v.notes} onChange={set("notes")} /></F>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isLoading}>{save.isLoading ? "Saving…" : supplier ? "Save changes" : "Add supplier"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
