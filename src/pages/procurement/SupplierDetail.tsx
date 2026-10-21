import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Check,
  CornerUpLeft,
  ExternalLink,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Initials, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import {
  INVITE_STATUS,
  QUOTE_STATUS,
  StatusMeta,
  SUPPLIER_DOC_TYPES,
  SUPPLIER_STATUS,
  SUPPLIER_TYPES,
  errorMessage,
  expiryState,
  phase5Api,
  procurementApi,
} from "@/lib/procurement";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DatePicker,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  Field,
  Input,
  KpiBand,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Person,
  Select,
  Tabs,
  Textarea,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  fmtWhen,
} from "@/components/ims";
import SupplierFormDialog from "./SupplierFormDialog";
import { BANK_LABELS } from "./BankChangeDetail";
import { Rating, expiryText } from "./Suppliers";

const LIST = "/dashboard/procurement/suppliers";
/** Five tabs. Contacts sit with the bank details; RFQs and quotations sit with performance. */
const TABS = ["details", "bank", "performance", "documents", "activity"] as const;
type TabKey = (typeof TABS)[number];
/** Links from before the tabs were grouped (?tab=overview, contacts, sourcing) still land on the right tab. */
const OLD_TABS: Record<string, TabKey> = { overview: "details", contacts: "bank", sourcing: "performance" };
const ONBOARDING = ["draft", "under_review", "rejected"];

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

type SupplierData = {
  supplier: any;
  contacts: any[];
  documents: any[];
  evaluations: any[];
  invitations: any[];
  quotations: any[];
  bankChanges: any[];
  verifiedBy: any;
};

export default function SupplierDetail() {
  const { supplierId } = useParams();

  const q = useQuery(["supplier", supplierId], async () => {
    const [supplier, contacts, documents, evaluations, invitations, quotations] = await Promise.all([
      pocketbase.collection("suppliers").getOne(supplierId!, { expand: "categories" }),
      pocketbase.collection("supplier_contacts").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-is_primary,name" }),
      pocketbase.collection("supplier_documents").getFullList({ filter: `supplier = "${supplierId}"`, sort: "expiry_date", expand: "uploaded_by" }),
      pocketbase.collection("supplier_evaluations").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "evaluator" }),
      pocketbase.collection("rfq_suppliers").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "rfq" }).catch(() => []),
      pocketbase.collection("quotations").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "rfq" }).catch(() => []),
    ]);
    const bankChanges = await pocketbase.collection("supplier_bank_changes").getFullList({ filter: `supplier = "${supplierId}"`, sort: "-created", expand: "requested_by" }).catch(() => [] as any[]);
    const verifiedBy = (supplier as any).bank_verified_by ? await pocketbase.collection("users").getOne((supplier as any).bank_verified_by, { fields: "id,name" }).catch(() => null) : null;
    return { supplier, contacts, documents, evaluations, invitations, quotations, bankChanges, verifiedBy };
  });
  const s: any = q.data?.supplier;

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!s) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Building2} text="This supplier is not available. It may have been removed." action={<ButtonLink to={LIST}>Back to suppliers</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  return <SupplierPage data={q.data as SupplierData} refetch={() => q.refetch()} />;
}

function SupplierPage({ data, refetch }: { data: SupplierData; refetch: () => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") || "details";
  const tab: TabKey = OLD_TABS[raw] || ((TABS as readonly string[]).includes(raw) ? (raw as TabKey) : "details");
  const setTab = (t: TabKey) => setParams(t === "details" ? {} : { tab: t });
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_suppliers");
  const [editing, setEditing] = React.useState(false);
  const [changingBank, setChangingBank] = React.useState(false);
  const s: any = data.supplier;
  const ob = useOnboarding(s, refetch);

  const docIssues = (data.documents || []).filter((d: any) => (expiryState(d.expiry_date).daysLeft ?? 999) <= 30);
  const awarded = (data.quotations || []).filter((x: any) => x.status === "accepted");
  const winRate = data.quotations.length ? Math.round((awarded.length / data.quotations.length) * 100) : null;
  const typeLabel = SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label || "Supplier";
  const categories = (s.expand?.categories || []).map((c: any) => c.name).join(", ");
  const approvedSupplier = !ONBOARDING.includes(s.status);

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  const primary = ob.isApprover ? (
    <Button variant="primary" icon={Check} onClick={() => ob.setDecision("approve")}>Approve</Button>
  ) : ob.canSubmit ? (
    <Button variant="primary" icon={Send} loading={ob.submit.isLoading} disabled={ob.missing.length > 0} onClick={() => ob.submit.mutate()}>Submit for approval</Button>
  ) : null;
  const secondary = ob.isApprover ? (
    <>
      <Button icon={CornerUpLeft} onClick={() => ob.setDecision("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => ob.setDecision("reject")}>Reject</Button>
    </>
  ) : canManage && s.status !== "under_review" ? (
    <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
  ) : null;
  const more: MenuItem[] = [
    { label: "Change bank details", icon: Landmark, onSelect: () => setChangingBank(true), hidden: !(canManage && approvedSupplier && !s.bank_change_pending) },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to suppliers", to: LIST }}
        number={s.code}
        type="Supplier"
        status={SUPPLIER_STATUS[s.status]?.label || s.status}
        statusNote={SUPPLIER_STATUS[s.status]?.note}
        title={s.name}
        facts={[typeLabel, categories || "No categories", s.tin ? { label: "TIN", value: s.tin } : null, s.phone]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary}
            {primary}
          </>
        }
      />

      {ob.active && <OnboardingNotice s={s} ob={ob} />}

      {docIssues.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {docIssues.map((d: any) => `${SUPPLIER_DOC_TYPES[d.document_type]}: ${expiryText(d.expiry_date).text.toLowerCase()}`).join(" · ")}.{" "}
            {tab !== "documents" && (
              <button type="button" className="font-semibold underline underline-offset-2 hover:no-underline" onClick={() => setTab("documents")}>
                Open documents
              </button>
            )}
          </span>
        </p>
      )}

      <KpiBand
        items={[
          {
            label: "Rating",
            value: s.evaluations_count ? `${Number(s.rating).toFixed(1)} / 5` : "Not rated",
            sub: s.evaluations_count ? `From ${plural(s.evaluations_count, "evaluation")}` : "No evaluations yet",
          },
          { label: "RFQs received", value: fmtNumber(data.invitations.length) },
          { label: "Quotations won", value: `${fmtNumber(awarded.length)} of ${fmtNumber(data.quotations.length)}`, sub: winRate !== null ? `${winRate}% win rate` : "No quotations yet" },
          { label: "Awarded value", value: fmtMoney(awarded.reduce((a: number, x: any) => a + x.grand_total, 0)) },
        ]}
      />

      <Tabs
        label="Supplier sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "bank", label: "Bank and contacts", count: data.contacts.length },
          { key: "performance", label: "Performance" },
          { key: "documents", label: "Documents", count: data.documents.length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <>
          <Card>
            <CardHeader title="Company" />
            <Details
              columns={3}
              items={[
                { label: "Type", value: typeLabel },
                { label: "Categories", value: categories },
                { label: "Registration number", value: s.registration_number },
                { label: "TIN", value: s.tin },
                { label: "VAT number", value: s.vat_number },
                { label: "Payment terms", value: s.payment_terms },
                { label: "Currency", value: s.currency },
                { label: "Email", value: s.email && <a className="text-ims-link hover:underline" href={`mailto:${s.email}`}>{s.email}</a> },
                { label: "Phone", value: s.phone },
                { label: "Website", value: s.website && <a className="break-all text-ims-link hover:underline" href={s.website} target="_blank" rel="noreferrer">{s.website}</a> },
                { label: "Address", value: [s.address, s.district, s.province, s.country].filter(Boolean).join(", "), wide: true },
                ...(s.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{s.notes}</span>, wide: true }] : []),
              ]}
            />
          </Card>
          {ob.approval && (ob.actionsQ.data || []).length > 0 && <ApprovalTracker approval={ob.approval} actions={ob.actionsQ.data as any[]} />}
        </>
      )}

      {tab === "bank" && (
        <>
          <div className={cn("grid grid-cols-1 gap-4", data.bankChanges.length > 0 && "xl:grid-cols-2 xl:items-start")}>
            <Card>
              <CardHeader
                title="Bank details"
                subtitle={!approvedSupplier ? "Checked by Finance as part of the supplier approval." : "Verified by Finance. A change needs Finance approval before payments use it."}
                action={
                  canManage && approvedSupplier && !s.bank_change_pending ? (
                    <Button size="sm" icon={Pencil} onClick={() => setChangingBank(true)}>Change bank details</Button>
                  ) : undefined
                }
              />
              {s.bank_change_pending &&
                (() => {
                  const open = (data.bankChanges || []).find((c: any) => ["pending_approval", "returned"].includes(c.status));
                  return (
                    <p role="status" className="mb-4 flex items-start gap-2 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2.5 text-t-small text-ims-warning">
                      <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
                      <span>
                        New bank details are waiting for Finance verification
                        {open ? (
                          <>
                            {" "}(<Link className="whitespace-nowrap font-semibold underline" to={`/dashboard/procurement/bank-changes/${open.id}`}>{open.number}</Link>)
                          </>
                        ) : null}
                        . Payments keep going to the verified account below until it is approved.
                      </span>
                    </p>
                  );
                })()}
              <Details
                items={[
                  { label: "Bank", value: s.bank_name },
                  { label: "Branch", value: s.bank_branch },
                  { label: "Account name", value: s.bank_account_name },
                  { label: "Account number", value: s.bank_account_number && <span className="font-mono">{s.bank_account_number}</span> },
                  { label: "SWIFT / BIC", value: s.swift_code },
                  ...(s.bank_verified_at
                    ? [
                        {
                          label: "Verified",
                          value: (
                            <span className="inline-flex items-start gap-1.5 text-ims-success">
                              <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden />
                              <span>
                                {fmtDate(s.bank_verified_at)}
                                {data.verifiedBy ? ` by ${(data.verifiedBy as any).name}` : ""}
                              </span>
                            </span>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Card>
            {data.bankChanges.length > 0 && <BankChanges changes={data.bankChanges.slice(0, 5)} onOpen={(c) => navigate(`/dashboard/procurement/bank-changes/${c.id}`)} />}
          </div>
          <Contacts supplierId={s.id} contacts={data.contacts} canManage={canManage} />
        </>
      )}

      {tab === "performance" && (
        <>
          <SystemPerformance supplierId={s.id} />
          <Performance supplierId={s.id} evaluations={data.evaluations} canEvaluate={canPerform("evaluate_suppliers")} />
          <Sourcing invitations={data.invitations} quotations={data.quotations} onOpen={(rfq) => navigate(`/dashboard/procurement/rfqs/${rfq}`)} />
        </>
      )}

      {tab === "documents" && <Documents supplierId={s.id} documents={data.documents} canManage={canManage} />}
      {tab === "activity" && <SupplierActivity supplierId={s.id} />}

      {changingBank && (
        <BankChangeDialog
          supplier={s}
          onClose={() => setChangingBank(false)}
          onDone={(id) => {
            setChangingBank(false);
            navigate(`/dashboard/procurement/bank-changes/${id}`);
          }}
        />
      )}
      <SupplierFormDialog open={editing} onClose={() => setEditing(false)} supplier={s} />
      <ActionDialog
        kind={ob.decision}
        number={s.code}
        onClose={() => ob.setDecision(null)}
        run={(kind, { comment, user }) => procurementApi.act(ob.approval.id, { action: kind, comment, user })}
        onDone={() => {
          ob.setDecision(null);
          refetch();
          ob.approvalQ.refetch();
          ob.actionsQ.refetch();
        }}
      />
    </Page>
  );
}

// ------------------------------------------------------------------ onboarding
/** Onboarding (draft, under review, rejected): readiness checklist, submission, approval by procurement and finance. */
function useOnboarding(s: any, onChange: () => void) {
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const active = ONBOARDING.includes(s.status);
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  // Fetched only while the supplier is being onboarded, as before.
  const ready = useQuery(["supplier-readiness", s.id, s.updated], () => phase5Api.supplierReadiness(s.id), { enabled: active && s.status !== "under_review" });
  const approvalQ = useQuery(["supplier-approval", s.approval], () => pocketbase.collection("approval_requests").getOne(s.approval), { enabled: active && Boolean(s.approval) });
  const actionsQ = useQuery(
    ["supplier-approval-actions", s.approval],
    () => pocketbase.collection("approval_actions").getFullList({ filter: `approval = "${s.approval}"`, sort: "created", expand: "actor,target_user" }),
    { enabled: active && Boolean(s.approval) }
  );
  const submit = useMutation(() => phase5Api.submitSupplier(s.id), {
    onSuccess: () => {
      toast.success("Sent for approval to procurement and finance");
      onChange();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const approval: any = active ? approvalQ.data : undefined;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const missing: string[] = ready.data?.missing || [];
  const canSubmit = active && canPerform("manage_suppliers") && ["draft", "rejected"].includes(s.status);
  return { active, decision, setDecision, ready, approvalQ, actionsQ, submit, approval, isApprover, missing, canSubmit };
}

function OnboardingNotice({ s, ob }: { s: any; ob: ReturnType<typeof useOnboarding> }) {
  const tone =
    s.status === "rejected"
      ? "border-ims-danger/30 bg-ims-danger-bg"
      : s.status === "under_review"
        ? "border-ims-warning/30 bg-ims-warning-bg"
        : "border-ims-link/25 bg-ims-info-bg";
  return (
    <div role="status" className={cn("rounded-card border px-4 py-3 text-t-body", tone)}>
      <p className="font-semibold text-ims-text">
        {s.status === "under_review" ? "Registration under review" : s.status === "rejected" ? "Registration rejected. Correct the file and submit it again." : "New supplier, not approved yet"}
      </p>
      <p className="text-ims-body">A supplier can receive RFQs, orders and payments only after procurement and finance approve its registration.</p>
      {s.status !== "under_review" &&
        (ob.missing.length ? (
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-ims-body sm:grid-cols-2" aria-label="Still needed before submitting">
            {ob.missing.map((m) => (
              <li key={m} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ims-priority-high" aria-hidden /> Missing: {m}
              </li>
            ))}
          </ul>
        ) : ob.ready.data ? (
          <p className="mt-1.5 flex items-center gap-1.5 font-semibold text-ims-success">
            <Check size={15} aria-hidden /> The file is complete and can be submitted.
          </p>
        ) : null)}
      {ob.approval && s.status === "under_review" && (
        <p className="mt-1 text-ims-body">
          Step {ob.approval.current_level + 1} of {ob.approval.steps?.length}: {ob.approval.steps?.[ob.approval.current_level]?.name}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ bank details
/** Change requests in the glossary: the detail goes in the note. */
const BANK_CHANGE_STATUS: Record<string, StatusMeta> = {
  pending_approval: { label: "Pending approval", tone: "warning", note: "With Finance" },
  returned: { label: "Returned", tone: "violet" },
  approved: { label: "Approved", tone: "success", note: "Applied" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

function BankChanges({ changes, onOpen }: { changes: any[]; onOpen: (c: any) => void }) {
  const columns: Column<any>[] = [
    { key: "number", header: "Number", nowrap: true, cell: (c) => <DocNo value={c.number} /> },
    { key: "requested", header: "Requested by", cell: (c) => <Person name={c.expand?.requested_by?.name} detail={fmtDate(c.created)} /> },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} map={BANK_CHANGE_STATUS} /> },
  ];
  return (
    <Card padded={false} className="relative overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title="Change requests" subtitle="Requests to change the bank details, newest first." />
      </div>
      <DataTable columns={columns} rows={changes} rowKey={(c) => c.id} onRowClick={onOpen} minWidth={420} caption="Bank details change requests" />
    </Card>
  );
}

/** New bank details for an approved supplier: a request to Finance, never a direct edit. */
function BankChangeDialog({ supplier, onClose, onDone }: { supplier: any; onClose: () => void; onDone: (id: string) => void }) {
  const [v, setV] = React.useState<Record<string, string>>(() => Object.fromEntries(BANK_LABELS.map(([k]) => [k, supplier[k] || ""])));
  const [reason, setReason] = React.useState("");
  const changed = BANK_LABELS.some(([k]) => (supplier[k] || "") !== (v[k] || "").trim());
  const save = useMutation(() => pocketbase.send(`/api/ims/suppliers/${supplier.id}/bank-change`, { method: "POST", body: { ...v, reason: reason.trim() } }), {
    onSuccess: (r: any) => {
      toast.success(`${r.number} sent to Finance for verification`);
      onDone(r.id);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const required = ["bank_name", "bank_account_name", "bank_account_number"];
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Change bank details"
      description={`Finance verifies the new details for ${supplier.name} before they are used. Until then, payments go to the current verified account.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" icon={ShieldCheck} loading={save.isLoading} disabled={!changed || reason.trim().length < 10} onClick={() => save.mutate()}>
            Send to Finance
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {BANK_LABELS.map(([k, label]) => {
          const was = supplier[k] || "";
          const isChanged = was !== (v[k] || "").trim();
          return (
            <Field
              key={k}
              label={label}
              required={required.includes(k)}
              htmlFor={`bank-${k}`}
              hint={isChanged ? `Changed from ${was || "empty"}` : undefined}
              className={k === "bank_account_name" ? "sm:col-span-2" : undefined}
            >
              <Input
                id={`bank-${k}`}
                className={cn(k === "bank_account_number" && "font-mono", isChanged && "border-ims-priority-high")}
                value={v[k]}
                onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}
              />
            </Field>
          );
        })}
        <Field
          label="Reason and how the change was confirmed"
          required
          htmlFor="bank-reason"
          hint="At least 10 characters. Upload the bank confirmation letter under Documents › Bank confirmation so Finance can check it."
          className="sm:col-span-2"
        >
          <Textarea
            id="bank-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Supplier moved its account to Equity Bank; bank letter uploaded under Documents; confirmed by phone with the finance manager on the number on file."
          />
        </Field>
      </div>
    </Modal>
  );
}

function useRefresh(supplierId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries(["supplier", supplierId]);
    queryClient.invalidateQueries(["supplier-docs-expiring"]);
    queryClient.invalidateQueries(["audit", "suppliers", supplierId]);
  };
}

// ------------------------------------------------------------------ contacts
function Contacts({ supplierId, contacts, canManage }: { supplierId: string; contacts: any[]; canManage: boolean }) {
  const refresh = useRefresh(supplierId);
  const [draft, setDraft] = React.useState<any | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [removing, setRemoving] = React.useState<any | null>(null);
  const save = useMutation(
    () => {
      if (!draft.name?.trim()) throw new Error("Contact name is required.");
      const body = { supplier: supplierId, name: draft.name, position: draft.position || "", email: draft.email || "", phone: draft.phone || "", is_primary: !!draft.is_primary };
      return draft.id ? pocketbase.collection("supplier_contacts").update(draft.id, body) : pocketbase.collection("supplier_contacts").create(body);
    },
    { onSuccess: () => { toast.success("Contact saved"); setDraft(null); refresh(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const remove = useMutation((id: string) => pocketbase.collection("supplier_contacts").delete(id), {
    onSuccess: () => { toast.success("Contact removed"); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const openDraft = (c: any) => {
    setTouched(false);
    setDraft(c);
  };
  const nameError = touched && draft && !draft.name?.trim() ? "Enter the contact's full name." : null;

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) => (
        <span className="font-semibold text-ims-text">
          {c.name}
          {c.is_primary && <span className="ml-2 whitespace-nowrap text-t-small font-semibold text-ims-link">Primary contact</span>}
        </span>
      ),
      sub: (c) => c.position || null,
    },
    { key: "email", header: "Email", cell: (c) => (c.email ? <a className="break-all text-ims-link hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-ims-faint">—</span>) },
    { key: "phone", header: "Phone", nowrap: true, cell: (c) => (c.phone ? <span className="tabular-nums">{c.phone}</span> : <span className="text-ims-faint">—</span>) },
  ];

  return (
    <Card padded={false} className="relative overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          title="Contact persons"
          subtitle="People to call about quotations, orders and payments."
          action={canManage ? <Button size="sm" icon={Plus} onClick={() => openDraft({})}>Add contact</Button> : undefined}
        />
      </div>
      <DataTable
        columns={columns}
        rows={contacts}
        rowKey={(c) => c.id}
        minWidth={600}
        caption="Contact persons"
        rowActions={
          canManage
            ? (c) => [
                { label: "Edit", icon: Pencil, onSelect: () => openDraft(c) },
                { label: "Remove", icon: Trash2, danger: true, onSelect: () => setRemoving(c) },
              ]
            : undefined
        }
        empty={<EmptyState compact icon={User} text="No contact persons recorded." action={canManage ? <Button icon={Plus} onClick={() => openDraft({})}>Add contact</Button> : undefined} />}
      />
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        size="sm"
        title={draft?.id ? "Edit contact" : "Add contact"}
        description="Who the procurement team calls at this supplier."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={save.isLoading}>Cancel</Button>
            <Button
              variant="primary"
              loading={save.isLoading}
              onClick={() => {
                setTouched(true);
                if (!draft?.name?.trim()) return;
                save.mutate();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <Field label="Name" required htmlFor="contact-name" error={nameError}>
              <Input id="contact-name" value={draft.name || ""} invalid={Boolean(nameError)} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Position" htmlFor="contact-position">
              <Input id="contact-position" value={draft.position || ""} onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="contact-email">
                <Input id="contact-email" type="email" value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
              <Field label="Phone" htmlFor="contact-phone">
                <Input id="contact-phone" type="tel" value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-t-body text-ims-text">
              <input type="checkbox" className="h-4 w-4 rounded border-ims-field accent-ims-primary" checked={!!draft.is_primary} onChange={(e) => setDraft({ ...draft, is_primary: e.target.checked })} />
              Primary contact
            </label>
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name || "this contact"}?`}
        description="The contact is removed from this supplier."
        confirmLabel="Remove"
        danger
        onConfirm={() => remove.mutate(removing.id)}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ documents
function Documents({ supplierId, documents, canManage }: { supplierId: string; documents: any[]; canManage: boolean }) {
  const refresh = useRefresh(supplierId);
  const [open, setOpen] = React.useState(false);
  const [doc, setDoc] = React.useState<any>({ document_type: "tax_certificate" });
  const [file, setFile] = React.useState<File | null>(null);
  const [removing, setRemoving] = React.useState<any | null>(null);
  const upload = useMutation(
    () => {
      const body = new FormData();
      body.append("supplier", supplierId);
      body.append("document_type", doc.document_type);
      body.append("document_number", doc.document_number || "");
      if (doc.issue_date) body.append("issue_date", `${doc.issue_date} 00:00:00.000Z`);
      if (doc.expiry_date) body.append("expiry_date", `${doc.expiry_date} 00:00:00.000Z`);
      body.append("notes", doc.notes || "");
      if (file) body.append("file", file);
      return pocketbase.collection("supplier_documents").create(body);
    },
    {
      onSuccess: () => { toast.success("Document added"); setOpen(false); setDoc({ document_type: "tax_certificate" }); setFile(null); refresh(); },
      onError: (e) => { toast.error(errorMessage(e)); },
    }
  );
  const remove = useMutation((id: string) => pocketbase.collection("supplier_documents").delete(id), {
    onSuccess: () => { toast.success("Document removed"); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });

  const columns: Column<any>[] = [
    {
      key: "type",
      header: "Document",
      cell: (d) =>
        d.file ? (
          <a className="inline-flex items-center gap-1.5 font-semibold text-ims-link hover:underline" href={pocketbase.files.getUrl(d, d.file)} target="_blank" rel="noreferrer">
            <FileText size={15} className="shrink-0" aria-hidden />
            {SUPPLIER_DOC_TYPES[d.document_type]}
          </a>
        ) : (
          <span className="font-semibold">{SUPPLIER_DOC_TYPES[d.document_type]}</span>
        ),
      sub: (d) => (d.file ? null : "No file attached"),
    },
    { key: "number", header: "Number", nowrap: true, cell: (d) => (d.document_number ? <DocNo value={d.document_number} /> : <span className="text-ims-faint">—</span>) },
    { key: "issued", header: "Issued", nowrap: true, cell: (d) => fmtDate(d.issue_date) },
    {
      key: "expires",
      header: "Expires",
      nowrap: true,
      cell: (d) => fmtDate(d.expiry_date),
      sub: (d) => {
        const st = expiryText(d.expiry_date);
        if (st.tone === "none") return null;
        return <span className={cn("font-semibold", st.tone === "danger" ? "text-ims-danger" : st.tone === "warning" ? "text-ims-warning" : "text-ims-success")}>{st.text}</span>;
      },
    },
  ];

  return (
    <Card padded={false} className="relative overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          title="Documents"
          subtitle="Certificates and contracts on file. Documents are flagged 30 days before they expire."
          action={canManage ? <Button size="sm" icon={Upload} onClick={() => setOpen(true)}>Add document</Button> : undefined}
        />
      </div>
      <DataTable
        columns={columns}
        rows={documents}
        rowKey={(d) => d.id}
        minWidth={640}
        caption="Supplier documents"
        rowActions={(d) => [
          ...(d.file ? [{ label: "Open file", icon: ExternalLink, onSelect: () => window.open(pocketbase.files.getUrl(d, d.file), "_blank", "noreferrer") }] : []),
          ...(canManage ? [{ label: "Remove", icon: Trash2, danger: true, onSelect: () => setRemoving(d) }] : []),
        ]}
        empty={<EmptyState compact icon={FileText} text="No documents on file." action={canManage ? <Button icon={Upload} onClick={() => setOpen(true)}>Add document</Button> : undefined} />}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Add document"
        description="Record the expiry date so the system can warn before it lapses."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={upload.isLoading}>Cancel</Button>
            <Button variant="primary" loading={upload.isLoading} onClick={() => upload.mutate()}>Add document</Button>
          </>
        }
      >
        <Field label="Type" htmlFor="doc-type">
          <Select id="doc-type" value={doc.document_type} onChange={(e) => setDoc({ ...doc, document_type: e.target.value })}>
            {Object.entries(SUPPLIER_DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Document number" htmlFor="doc-number">
          <Input id="doc-number" value={doc.document_number || ""} onChange={(e) => setDoc({ ...doc, document_number: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Issue date" htmlFor="doc-issued">
            <DatePicker id="doc-issued" value={doc.issue_date || ""} onChange={(v) => setDoc({ ...doc, issue_date: v })} />
          </Field>
          <Field label="Expiry date" htmlFor="doc-expires">
            <DatePicker id="doc-expires" value={doc.expiry_date || ""} min={doc.issue_date || undefined} onChange={(v) => setDoc({ ...doc, expiry_date: v })} />
          </Field>
        </div>
        <Field label="File" htmlFor="doc-file" hint="PDF or a scan of the certificate.">
          <input
            id="doc-file"
            type="file"
            className="block w-full text-t-body text-ims-body file:mr-3 file:h-9 file:cursor-pointer file:rounded-control file:border file:border-solid file:border-ims-field file:bg-ims-card file:px-3 file:text-[13px] file:font-bold file:text-ims-text hover:file:bg-ims-subtle"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove the ${removing ? (SUPPLIER_DOC_TYPES[removing.document_type] || "document").toLowerCase() : "document"}?`}
        description="The document and its file are removed from this supplier."
        confirmLabel="Remove"
        danger
        onConfirm={() => remove.mutate(removing.id)}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ performance
const EVAL_KEYS = [
  ["quality", "Quality"], ["delivery", "Delivery"], ["price", "Price competitiveness"],
  ["compliance", "Compliance"], ["responsiveness", "Responsiveness"], ["contract_compliance", "Contract compliance"],
] as const;

function Performance({ supplierId, evaluations, canEvaluate }: { supplierId: string; evaluations: any[]; canEvaluate: boolean }) {
  const refresh = useRefresh(supplierId);
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<any>({ period: `${new Date().getFullYear()} Q${Math.ceil((new Date().getMonth() + 1) / 3)}` });
  const save = useMutation(() => pocketbase.collection("supplier_evaluations").create({ supplier: supplierId, ...v }), {
    onSuccess: () => { toast.success("Evaluation recorded"); setOpen(false); refresh(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const avg = (k: string) => (evaluations.length ? evaluations.reduce((a, e) => a + (e[k] || 0), 0) / evaluations.length : 0);
  const unscored = EVAL_KEYS.filter(([k]) => !v[k]).length;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Average scores" subtitle="Scale 1 (poor) to 5 (excellent)." />
        {!evaluations.length ? (
          <p className="text-t-body text-ims-muted">Not evaluated yet.</p>
        ) : (
          <ul className="space-y-3">
            {EVAL_KEYS.map(([k, label]) => (
              <li key={k} className="text-t-body">
                <div className="mb-1 flex justify-between gap-3">
                  <span className="text-ims-body">{label}</span>
                  <span className="font-semibold tabular-nums text-ims-text">{avg(k).toFixed(1)}</span>
                </div>
                <div className="h-1.5 rounded-pill bg-ims-subtle" role="presentation">
                  <div className="h-1.5 rounded-pill bg-ims-link" style={{ width: `${(avg(k) / 5) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title="Evaluations"
          subtitle={evaluations.length ? `${plural(evaluations.length, "evaluation")}, newest first.` : undefined}
          action={canEvaluate ? <Button size="sm" icon={Star} onClick={() => setOpen(true)}>Evaluate</Button> : undefined}
        />
        {!evaluations.length ? (
          <EmptyState compact icon={Star} text="No performance evaluations yet." />
        ) : (
          <ul className="divide-y divide-ims-divider">
            {evaluations.map((e) => (
              <li key={e.id} className="py-3 text-t-body first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0">
                    <span className="font-semibold text-ims-text">{e.period}</span>
                    <span className="text-ims-muted"> · {e.expand?.evaluator?.name || "—"} · {fmtDate(e.created)}</span>
                  </p>
                  <Rating value={e.overall} count={1} />
                </div>
                {e.comments && <p className="mt-1 text-ims-body">“{e.comments}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Evaluate supplier"
        description="Score each criterion from 1 (poor) to 5 (excellent)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={save.isLoading}>Cancel</Button>
            <Button variant="primary" loading={save.isLoading} disabled={EVAL_KEYS.some(([k]) => !v[k])} onClick={() => save.mutate()}>Save evaluation</Button>
          </>
        }
      >
        <Field label="Period" htmlFor="eval-period" hint="For example 2026 Q4">
          <Input id="eval-period" value={v.period} onChange={(e) => setV({ ...v, period: e.target.value })} />
        </Field>
        <div className="space-y-2.5">
          {EVAL_KEYS.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-t-body">
              <span id={`eval-${k}`} className="font-semibold text-ims-text">{label}</span>
              <div className="flex gap-1" role="radiogroup" aria-labelledby={`eval-${k}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={v[k] === n}
                    aria-label={`${n} of 5`}
                    onClick={() => setV({ ...v, [k]: n })}
                    className={cn(
                      "h-8 w-8 rounded-control border text-[13px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                      v[k] === n ? "border-ims-primary bg-ims-primary text-white" : "border-ims-field bg-ims-card text-ims-body hover:bg-ims-subtle"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {unscored > 0 && <p className="text-t-hint text-ims-muted">Score every criterion to save ({unscored} left).</p>}
        </div>
        <Field label="Comments" htmlFor="eval-comments">
          <Textarea id="eval-comments" className="min-h-[80px]" value={v.comments || ""} onChange={(e) => setV({ ...v, comments: e.target.value })} />
        </Field>
      </Modal>
    </div>
  );
}

/** RFQs this supplier was invited to, with its quotation and the outcome. */
function Sourcing({ invitations, quotations, onOpen }: { invitations: any[]; quotations: any[]; onOpen: (rfq: string) => void }) {
  const quoteFor = (inv: any) => quotations.find((x: any) => x.rfq === inv.rfq);
  const rwf = (x: any) => !x.currency || x.currency === "RWF";
  const quotedTotal = invitations.reduce((a, inv) => {
    const quote = quoteFor(inv);
    return quote && rwf(quote) ? a + (Number(quote.grand_total) || 0) : a;
  }, 0);
  const columns: Column<any>[] = [
    { key: "rfq", header: "RFQ", nowrap: true, cell: (inv) => <DocNo value={inv.expand?.rfq?.number} /> },
    { key: "title", header: "Title", clamp: true, cell: (inv) => inv.expand?.rfq?.title || "—" },
    { key: "invitation", header: "Invitation", cell: (inv) => <StatusBadge status={inv.status} map={INVITE_STATUS} /> },
    { key: "quotation", header: "Quotation", nowrap: true, cell: (inv) => (quoteFor(inv) ? <DocNo value={quoteFor(inv).number} /> : <span className="text-ims-faint">—</span>) },
    {
      key: "amount",
      header: "Amount (RWF)",
      numeric: true,
      cell: (inv) => {
        const quote = quoteFor(inv);
        if (!quote) return <span className="text-ims-faint">—</span>;
        return rwf(quote) ? <Num value={quote.grand_total} /> : `${fmtNumber(quote.grand_total)} ${quote.currency}`;
      },
      total: <Num value={quotedTotal} />,
    },
    { key: "outcome", header: "Outcome", cell: (inv) => (quoteFor(inv) ? <StatusBadge status={quoteFor(inv).status} map={QUOTE_STATUS} /> : <span className="text-ims-faint">—</span>) },
  ];
  return (
    <Card padded={false} className="relative overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title="RFQs and quotations" subtitle="Every request for quotation this supplier was invited to." />
      </div>
      <DataTable
        columns={columns}
        rows={invitations}
        rowKey={(inv) => inv.id}
        onRowClick={(inv) => onOpen(inv.rfq)}
        minWidth={760}
        caption="RFQs and quotations"
        empty={<EmptyState compact icon={FileText} text="This supplier has not been invited to any RFQ yet." />}
      />
    </Card>
  );
}

/** Performance calculated from orders, receipts, quotations and invoices — cannot be edited. */
function SystemPerformance({ supplierId }: { supplierId: string }) {
  const q = useQuery(["supplier-performance", supplierId], () => phase5Api.supplierPerformance(supplierId).then((r) => r.items[0] || null));
  const p: any = q.data;
  const pct = (v: number | null) => (v === null || v === undefined ? "n/a" : `${v}%`);
  const tone = (v: number | null) => (v === null || v === undefined ? "text-ims-faint" : v >= 80 ? "text-ims-success" : v >= 60 ? "text-ims-warning" : "text-ims-danger");
  const metric = (value: React.ReactNode, cls: string) => <span className={cn("text-[18px] font-extrabold tabular-nums", cls)}>{value}</span>;
  return (
    <Card>
      <CardHeader title="Calculated performance" subtitle="From real purchase orders, deliveries, quotations and invoices. It cannot be edited, so it cannot be manipulated." />
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !p ? (
        <p className="text-t-body text-ims-muted">No transactions yet.</p>
      ) : (
        <Details
          columns={3}
          items={[
            { label: "Overall score", value: metric(pct(p.score), tone(p.score)), hint: plural(p.orders || 0, "order") },
            { label: "Delivered on time", value: metric(pct(p.on_time_pct), tone(p.on_time_pct)), hint: plural(p.deliveries || 0, "delivery", "deliveries") },
            { label: "Accepted quality", value: metric(pct(p.quality_pct), tone(p.quality_pct)), hint: p.rejection_pct !== null ? `${p.rejection_pct}% rejected` : undefined },
            {
              label: "Price index",
              value: metric(p.price_index ?? "n/a", p.price_index === null || p.price_index === undefined ? "text-ims-faint" : p.price_index <= 100 ? "text-ims-success" : "text-ims-warning"),
              hint: "100 = average quote",
            },
            {
              label: "RFQ response",
              value: metric(pct(p.response_pct), tone(p.response_pct)),
              hint: `${plural(p.invited || 0, "invitation")}${p.avg_response_days !== null ? ` · ${Number(p.avg_response_days) < 1 ? "replies the same day on average" : `replies in ${plural(Math.round(Number(p.avg_response_days)), "day")} on average`}` : ""}`,
            },
            { label: "Invoice accuracy", value: metric(pct(p.invoice_accuracy_pct), tone(p.invoice_accuracy_pct)), hint: `Outstanding ${fmtMoney(p.outstanding)}` },
          ]}
        />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ activity
/** An audit value as people read it: dates as "25 Nov 2026" (with the time when there is one), empty as "—". */
function shown(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t)) {
    const local = fmtDateTime(t);
    return local.endsWith(", 00:00") ? fmtDate(t) : local;
  }
  return t;
}

function SupplierActivity({ supplierId }: { supplierId: string }) {
  const q = useQuery(["audit", "suppliers", supplierId], () => procurementApi.audit({ collection: "suppliers", record: supplierId, perPage: 100 }));
  return (
    <Card>
      <CardHeader title="Activity" subtitle="Every change to this supplier, including bank details. The history cannot be edited." />
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !q.data?.items.length ? (
        <EmptyState compact text="No activity yet." />
      ) : (
        <ol className="space-y-4">
          {q.data.items.map((e) => (
            <li key={e.id} className="flex gap-3">
              <Initials name={e.actor_name} />
              <div className="min-w-0 flex-1 text-t-body">
                <p className="text-ims-text">
                  <span className="font-semibold">{e.actor_name === "system" ? "System" : e.actor_name || "System"}</span> {e.action.replace(/_/g, " ")}
                  {e.action === "bank_details_changed" && (
                    <span className="ml-2 inline-flex items-center gap-1 text-t-small font-semibold text-ims-danger">
                      <Landmark size={13} aria-hidden /> Bank details
                    </span>
                  )}
                </p>
                <p className="text-t-small text-ims-muted" title={fmtDateTime(e.created)}>{fmtWhen(e.created)}</p>
                {Object.keys(e.changes || {}).length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-t-small text-ims-muted">
                    {Object.entries(e.changes).slice(0, 6).map(([k, c]) => (
                      <li key={k}>
                        {k.replace(/_/g, " ")}: <span className="line-through decoration-ims-faint">{shown(c.old)}</span> → <span className="text-ims-body">{shown(c.new)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {e.comment && <p className="mt-1 rounded-control bg-ims-thead px-3 py-2 text-ims-body">“{e.comment}”</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
