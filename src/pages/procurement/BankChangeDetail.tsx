/**
 * Supplier bank-details change request (IMS §3 rule 6): current verified details next to the requested
 * ones, the reason, and the Finance approval. The supplier keeps its verified account until approval.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Ban, Check, CornerUpLeft, Landmark, ShieldCheck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { DOC_STATUS, errorMessage, procurementApi } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { useAuth, usePermissions } from "@/context/auth.context";
import DocumentUploads from "@/components/enterprise/Attachments";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  Field,
  MenuItem,
  Modal,
  MoreMenu,
  Page,
  Tabs,
  Textarea,
  fmtDate,
  fmtDateTime,
} from "@/components/ims";
import { cn } from "@/utils";

export const BANK_LABELS: [string, string][] = [
  ["bank_name", "Bank"],
  ["bank_branch", "Branch"],
  ["bank_account_name", "Account name"],
  ["bank_account_number", "Account number"],
  ["swift_code", "SWIFT / BIC"],
];

type TabKey = "details" | "documents" | "approvals" | "activity";
type Row = { key: string; label: string; old: string; next: string; changed: boolean };

export default function BankChangeDetail() {
  const { changeId } = useParams();
  const [tab, setTab] = React.useState<TabKey>("details");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const me = pocketbase.authStore.model as any;
  const { user } = useAuth();
  const { can } = usePermissions();
  const q = useQuery(["bank-change", changeId], () => pocketbase.collection("supplier_bank_changes").getOne(changeId!, { expand: "supplier,requested_by,approval" }));
  const trail = useApprovalTrail("supplier_bank_change", "supplier_bank_changes", changeId);
  const r: any = q.data;
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };

  async function cancel() {
    setBusy(true);
    try {
      await pocketbase.send(`/api/ims/supplier-bank-changes/${r.id}/cancel`, { method: "POST", body: { reason: reason.trim() } });
      toast.success(`${r.number} cancelled — the verified details stay in place`);
      setCancelOpen(false);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!r) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Landmark}
            text="This bank details change is not available. It may be outside what your role can see."
            action={<ButtonLink to="/dashboard/procurement/suppliers">Back to suppliers</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }
  const old = r.old_details || {};
  const next = r.new_details || {};
  const open = ["pending_approval", "returned"].includes(r.status);
  const approval = r.expand?.approval;
  // Same rule as the shared decision buttons: the approval is waiting for the signed-in person.
  const waiting = approval?.status === "pending" && String(approval?.pending_approvers || "").split(",").includes(user?.id);
  const isRequester = r.requested_by === me?.id;
  const supplierLink = `/dashboard/procurement/suppliers/${r.supplier}`;

  const rows: Row[] = BANK_LABELS.map(([k, label]) => ({ key: k, label, old: old[k] || "", next: next[k] || "", changed: (old[k] || "") !== (next[k] || "") }));
  const changedCount = rows.filter((x) => x.changed).length;

  const columns: Column<Row>[] = [
    { key: "field", header: "Field", width: "180px", cell: (x) => <span className="font-semibold">{x.label}</span> },
    {
      key: "old",
      header: "Verified now",
      cell: (x) => <span className={cn("break-words font-mono text-[13px]", x.changed ? "text-ims-muted line-through decoration-ims-faint" : "text-ims-text")}>{x.old || "—"}</span>,
    },
    {
      key: "next",
      header: "Requested",
      cell: (x) => <span className={cn("break-words font-mono text-[13px]", x.changed ? "font-semibold text-ims-text" : "text-ims-muted")}>{x.next || "—"}</span>,
      sub: (x) => (x.changed ? <span className="font-semibold text-ims-warning">Changed</span> : null),
    },
  ];

  const more: MenuItem[] = [{ label: "Cancel request", icon: Ban, danger: true, onSelect: () => setCancelOpen(true), hidden: !(open && isRequester) }];

  return (
    <Page>
      <DetailHeader
        back={{ label: `Back to ${r.supplier_name}`, to: supplierLink }}
        number={r.number}
        type="Bank details change"
        status={DOC_STATUS[r.status]?.label || r.status}
        statusNote={
          r.status === "approved"
            ? `Applied${r.applied_at ? ` ${fmtDate(r.applied_at)}` : ""}`
            : open
              ? "Payments still go to the verified account"
              : undefined
        }
        title={`New bank details for ${r.supplier_name}`}
        facts={[
          { label: "Requested by", value: r.expand?.requested_by?.name || "—" },
          fmtDate(r.created),
          `${changedCount} ${changedCount === 1 ? "field" : "fields"} changed`,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {waiting && (
              <>
                <Button icon={CornerUpLeft} onClick={() => setDecision("return")}>Return</Button>
                <Button icon={XCircle} onClick={() => setDecision("reject")}>Reject</Button>
                <Button variant="primary" icon={Check} onClick={() => setDecision("approve")}>Approve</Button>
              </>
            )}
          </>
        }
      />

      {waiting && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Before you approve: check the bank confirmation letter under Documents and call the supplier back on the phone number already on file, never on a number given in the request.
          </span>
        </p>
      )}
      {r.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {r.cancel_reason}
        </p>
      )}

      <Tabs
        label="Bank details change sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "documents", label: "Documents", count: (r.attachments || []).length },
          { key: "approvals", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card padded={false} className="relative overflow-hidden xl:col-span-2">
            <div className="px-5 pt-5">
              <CardHeader title="Old and new details" subtitle="The verified account stays in use until Finance approves this change." />
            </div>
            <DataTable columns={columns} rows={rows} rowKey={(x) => x.key} minWidth={560} caption="Verified and requested bank details" />
            {open && !waiting && (
              <p className="flex items-start gap-2 border-t border-ims-divider px-5 py-3.5 text-t-small text-ims-body">
                <ShieldCheck size={15} className="mt-px shrink-0 text-ims-primary" aria-hidden />
                Before approving, Finance checks the bank confirmation letter and calls the supplier back on the phone number already on file, never on a number given in the request.
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Request" />
            <Details
              columns={1}
              items={[
                { label: "Supplier", value: <Link to={supplierLink} className="font-semibold text-ims-link hover:underline">{r.supplier_name}</Link> },
                { label: "Requested by", value: r.expand?.requested_by?.name, hint: fmtDateTime(r.created) },
                { label: "Reason and how it was confirmed", value: r.reason ? <span className="whitespace-pre-line">{r.reason}</span> : null },
                ...(r.status === "approved" ? [{ label: "Applied", value: r.applied_at ? fmtDateTime(r.applied_at) : "Yes" }] : []),
                ...(r.cancel_reason ? [{ label: "Cancelled because", value: r.cancel_reason }] : []),
              ]}
            />
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Bank letter" subtitle="The supplier's signed bank confirmation letter, checked by Finance." />
          <DocumentUploads
            collection="supplier_bank_changes"
            record={r}
            canAdd={can(["manage_suppliers", "approve_suppliers"])}
            canRemove={open && r.requested_by === me?.id}
            onChange={refresh}
            hint="The supplier's signed bank confirmation letter"
          />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={trail.actions} />}

      {tab === "activity" && <Chatter items={toChatter(trail.actions, trail.audit)} />}

      <ActionDialog
        kind={decision}
        number={r.number}
        onClose={() => setDecision(null)}
        run={(k, input) => procurementApi.act(approval.id, { action: k, comment: input.comment, user: input.user })}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />

      <Modal
        open={cancelOpen}
        onClose={busy ? () => undefined : () => setCancelOpen(false)}
        size="sm"
        title={<>Cancel <span className="whitespace-nowrap">{r.number}</span>?</>}
        description="The supplier keeps its verified bank details."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={busy}>Keep request</Button>
            <Button variant="danger" disabled={!reason.trim()} loading={busy} onClick={cancel}>Cancel request</Button>
          </>
        }
      >
        <Field label="Reason" required htmlFor="bank-cancel-reason" hint="The requester and Finance see this reason.">
          <Textarea id="bank-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the change is no longer needed" />
        </Field>
      </Modal>
    </Page>
  );
}
