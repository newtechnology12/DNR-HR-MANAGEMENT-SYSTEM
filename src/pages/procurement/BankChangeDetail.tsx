/**
 * Supplier bank-details change request (IMS §3 rule 6): current verified details next to the requested
 * ones, the reason, and the Finance approval. The supplier keeps its verified account until approval.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRight, Landmark, ShieldCheck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { showDay } from "@/lib/ims";
import { DOC_STATUS, errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { usePermissions } from "@/context/auth.context";
import DocumentUploads from "@/components/enterprise/Attachments";

export const BANK_LABELS: [string, string][] = [
  ["bank_name", "Bank"],
  ["bank_branch", "Branch"],
  ["bank_account_name", "Account name"],
  ["bank_account_number", "Account number"],
  ["swift_code", "SWIFT / BIC"],
];
const STEPS = [{ key: "pending_approval", label: "Finance verification" }, { key: "approved", label: "Applied" }];

export default function BankChangeDetail() {
  const { changeId } = useParams();
  const [tab, setTab] = React.useState("details");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const me = pocketbase.authStore.model as any;
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

  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!r) return <div className="p-6"><EmptyState icon={Landmark} title="Request not found" text="It may be outside what your role can see." /></div>;
  const old = r.old_details || {};
  const next = r.new_details || {};
  const open = ["pending_approval", "returned"].includes(r.status);

  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Suppliers", link: "/dashboard/procurement/suppliers" }, { title: r.supplier_name, link: `/dashboard/procurement/suppliers/${r.supplier}` }, { title: r.number }]}
        steps={STEPS}
        current={r.status === "approved" ? "approved" : "pending_approval"}
        actions={
          <>
            <DecisionButtons approval={r.expand?.approval} number={r.number} onDone={refresh} />
            {open && r.requested_by === me?.id && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelOpen(true)}><XCircle size={14} /> Cancel request</Button>}
          </>
        }
      />
      <Sheet ribbon={r.status === "approved" ? { label: "Applied", tone: "success" } : r.status === "rejected" ? { label: "Rejected", tone: "danger" } : r.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : undefined}>
        <SheetTitle kicker="Supplier bank details change" title={r.number} badges={<StatusBadge status={r.status} map={DOC_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Supplier", value: <Link to={`/dashboard/procurement/suppliers/${r.supplier}`} className="text-primaryDark hover:underline">{r.supplier_name}</Link> },
            { label: "Requested by", value: r.expand?.requested_by?.name, hint: showDay(r.created) },
            { label: "Reason", value: r.reason },
          ]}
          right={[
            { label: "Status", value: r.status === "approved" ? `Applied ${r.applied_at ? showDay(r.applied_at) : ""}` : open ? "Waiting for Finance — payments still go to the verified account" : (r.status || "").replace(/_/g, " ") },
            { label: "Cancelled because", value: r.cancel_reason },
          ]}
        />
        <Notebook tabs={[{ key: "details", label: "Old and new details" }, { key: "documents", label: "Bank letter", count: (r.attachments || []).length }, { key: "approval", label: "Approval" }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "details" && (
            <div className="overflow-x-auto">
              <table className="dnr-grid w-full min-w-[640px]">
                <thead><tr><th>Field</th><th>Verified (current)</th><th className="w-8" /><th>Requested</th></tr></thead>
                <tbody>
                  {BANK_LABELS.map(([k, label]) => {
                    const changed = (old[k] || "") !== (next[k] || "");
                    return (
                      <tr key={k} className={cn(changed && "bg-amber-50/60")}>
                        <td className="font-medium text-slate-700">{label}</td>
                        <td className={cn("font-mono text-[13px]", changed ? "text-slate-500 line-through" : "text-slate-800")}>{old[k] || "—"}</td>
                        <td>{changed && <ArrowRight size={14} className="text-amber-700" />}</td>
                        <td className={cn("font-mono text-[13px]", changed ? "font-semibold text-slate-900" : "text-slate-500")}>{next[k] || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {open && (
                <p className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ralga-navy" />
                  Before approving: check the bank confirmation letter in the supplier's documents and call the supplier back on the phone number already on file — never on a number given in the request.
                </p>
              )}
            </div>
          )}
          {tab === "documents" && <DocumentUploads collection="supplier_bank_changes" record={r} canAdd={can(["manage_suppliers", "approve_suppliers"])} canRemove={open && r.requested_by === me?.id} onChange={refresh} hint="The supplier's signed bank confirmation letter" />}
          {tab === "approval" && <ApprovalTracker approval={r.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Cancel {r.number}?</DialogTitle>
            <DialogDescription>The supplier keeps its verified bank details.</DialogDescription>
          </DialogHeader>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep</Button>
            <Button variant="danger" disabled={!reason.trim() || busy} onClick={cancel}>Cancel request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DocumentPage>
  );
}
