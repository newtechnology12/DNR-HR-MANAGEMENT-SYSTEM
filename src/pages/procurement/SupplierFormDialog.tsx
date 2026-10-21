import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Lock } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ims";
import { cn } from "@/utils";
import { SUPPLIER_STATUS, SUPPLIER_TYPES, errorMessage } from "@/lib/procurement";

const EMPTY = {
  name: "", supplier_type: "company", categories: [] as string[], registration_number: "", tin: "", vat_number: "",
  country: "Rwanda", province: "", district: "", address: "", email: "", phone: "", website: "",
  payment_terms: "30 days", currency: "RWF", status: "active",
  bank_name: "", bank_branch: "", bank_account_name: "", bank_account_number: "", swift_code: "", notes: "",
};
const BANK = ["bank_name", "bank_branch", "bank_account_name", "bank_account_number", "swift_code"] as const;

/** A titled group of fields inside the dialog (a dialog has no numbered section cards). */
function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 border-t border-ims-divider pt-4 first:border-t-0 first:pt-0", className)}>
      <legend className="float-left mb-3 w-full text-[15px] font-bold text-ims-text">{title}</legend>
      <div className="clear-left grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </fieldset>
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
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (open) setV(supplier ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, supplier[k] ?? (EMPTY as any)[k]])) } : { ...EMPTY });
    if (open) setTouched(false);
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

  const nameError = touched && !v.name.trim() ? "Enter the supplier's legal name." : null;
  const approvedStatus = supplier && ["active", "inactive", "blacklisted"].includes(supplier.status);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={supplier ? `Edit ${supplier.name}` : "Add supplier"}
      description={supplier ? `Supplier code ${supplier.code}.` : "The supplier code is assigned automatically. Duplicate names and TINs are refused."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" type="submit" form="supplier-form" loading={save.isLoading}>{supplier ? "Save changes" : "Add supplier"}</Button>
        </>
      }
    >
      <form
        id="supplier-form"
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!v.name.trim()) {
            document.getElementById("sup-name")?.focus();
            return;
          }
          save.mutate();
        }}
      >
        <Group title="Company">
          <Field label="Legal name" required htmlFor="sup-name" error={nameError} className="sm:col-span-2">
            <Input id="sup-name" value={v.name} onChange={set("name")} invalid={Boolean(nameError)} aria-describedby={nameError ? "sup-name-error" : undefined} />
          </Field>
          <Field label="Type" htmlFor="sup-type">
            <Select id="sup-type" value={v.supplier_type} onChange={set("supplier_type")}>
              {SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Registration number" htmlFor="sup-reg"><Input id="sup-reg" value={v.registration_number} onChange={set("registration_number")} /></Field>
          <Field label="TIN" htmlFor="sup-tin"><Input id="sup-tin" value={v.tin} onChange={set("tin")} inputMode="numeric" /></Field>
          <Field label="VAT number" htmlFor="sup-vat"><Input id="sup-vat" value={v.vat_number} onChange={set("vat_number")} /></Field>
          <div className="min-w-0 sm:col-span-3" role="group" aria-labelledby="sup-cats-label">
            <p id="sup-cats-label" className="mb-1.5 text-t-label text-ims-text">Supplies these categories</p>
            {cats.isLoading ? (
              <p className="text-t-small text-ims-muted">Loading categories…</p>
            ) : !cats.data?.length ? (
              <p className="text-t-small text-ims-muted">No procurement categories are set up yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cats.data.map((c: any) => {
                  const on = v.categories.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setV((x) => ({ ...x, categories: on ? x.categories.filter((id) => id !== c.id) : [...x.categories, c.id] }))}
                      className={cn(
                        "rounded-pill border px-3 py-1.5 text-t-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                        on ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-ims-field bg-ims-card text-ims-body hover:bg-ims-subtle"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Group>

        <Group title="Address and contact">
          <Field label="Country" htmlFor="sup-country"><Input id="sup-country" value={v.country} onChange={set("country")} /></Field>
          <Field label="Province" htmlFor="sup-province"><Input id="sup-province" value={v.province} onChange={set("province")} /></Field>
          <Field label="District" htmlFor="sup-district"><Input id="sup-district" value={v.district} onChange={set("district")} /></Field>
          <Field label="Street address" htmlFor="sup-address" className="sm:col-span-3"><Input id="sup-address" value={v.address} onChange={set("address")} /></Field>
          <Field label="Email" htmlFor="sup-email"><Input id="sup-email" type="email" value={v.email} onChange={set("email")} /></Field>
          <Field label="Phone" htmlFor="sup-phone"><Input id="sup-phone" type="tel" value={v.phone} onChange={set("phone")} /></Field>
          <Field label="Website" htmlFor="sup-web"><Input id="sup-web" value={v.website} onChange={set("website")} placeholder="https://" /></Field>
        </Group>

        <Group title="Commercial terms">
          <Field label="Payment terms" htmlFor="sup-terms"><Input id="sup-terms" value={v.payment_terms} onChange={set("payment_terms")} /></Field>
          <Field label="Currency" htmlFor="sup-currency" hint="Three-letter code, e.g. RWF"><Input id="sup-currency" value={v.currency} onChange={set("currency")} maxLength={3} /></Field>
          <Field label="Status" htmlFor="sup-status" hint={approvedStatus ? undefined : "Set by the registration approval"}>
            {approvedStatus ? (
              <Select id="sup-status" value={v.status} onChange={set("status")}>
                {["active", "inactive", "blacklisted"].map((k) => (
                  <option key={k} value={k}>{SUPPLIER_STATUS[k].note ? `${SUPPLIER_STATUS[k].label} · ${SUPPLIER_STATUS[k].note}` : SUPPLIER_STATUS[k].label}</option>
                ))}
              </Select>
            ) : (
              <p id="sup-status" className="flex h-control items-center rounded-control border border-dashed border-ims-field bg-ims-subtle px-3 text-t-body text-ims-muted">{SUPPLIER_STATUS[supplier?.status]?.label || "Draft"}</p>
            )}
          </Field>
        </Group>

        <Group title="Bank details">
          <Field label="Bank" htmlFor="sup-bank"><Input id="sup-bank" value={v.bank_name} onChange={set("bank_name")} disabled={bankLocked} /></Field>
          <Field label="Branch" htmlFor="sup-branch"><Input id="sup-branch" value={v.bank_branch} onChange={set("bank_branch")} disabled={bankLocked} /></Field>
          <Field label="SWIFT / BIC" htmlFor="sup-swift"><Input id="sup-swift" value={v.swift_code} onChange={set("swift_code")} disabled={bankLocked} /></Field>
          <Field label="Account name" htmlFor="sup-acc-name" className="sm:col-span-2"><Input id="sup-acc-name" value={v.bank_account_name} onChange={set("bank_account_name")} disabled={bankLocked} /></Field>
          <Field label="Account number" htmlFor="sup-acc-no"><Input id="sup-acc-no" className="font-mono" value={v.bank_account_number} onChange={set("bank_account_number")} disabled={bankLocked} /></Field>
          {bankLocked && (
            <p className="flex items-start gap-2 rounded-control border border-ims-border bg-ims-thead px-3 py-2.5 text-t-small text-ims-body sm:col-span-3">
              <Lock size={15} className="mt-px shrink-0 text-ims-muted" aria-hidden />
              Bank details of an approved supplier change with “Change bank details” on the supplier page. Finance verifies them before any payment uses them.
            </p>
          )}
          {bankChanged && !bankLocked && (
            <p role="status" className="flex items-start gap-2 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2.5 text-t-small text-ims-warning sm:col-span-3">
              <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
              Bank detail changes are recorded separately in the audit log and alert all supplier managers. Confirm the change with the supplier by phone before you save.
            </p>
          )}
        </Group>

        <Field label="Notes" htmlFor="sup-notes"><Textarea id="sup-notes" className="min-h-[80px]" value={v.notes} onChange={set("notes")} /></Field>
      </form>
    </Modal>
  );
}
