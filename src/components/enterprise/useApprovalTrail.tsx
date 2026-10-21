/**
 * Approval decisions + audit trail of one document, and the approve / return / reject controls for the
 * person it is waiting for. Used by every document page routed through the approval engine.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { CheckCircle2, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { imsApi } from "@/lib/ims";
import { procurementApi } from "@/lib/procurement";
import { useAuth } from "@/context/auth.context";
import { Button } from "@/components/ims";
import { ActionDialog, ActionKind } from "./Approval";

export function useApprovalTrail(documentType: string, collection: string, id?: string) {
  const actions = useQuery(
    ["approval_actions", documentType, id],
    () => pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "${documentType}" && document_id = "${id}"`, sort: "created", expand: "actor,target_user,on_behalf_of" }),
    { enabled: Boolean(id) }
  );
  const history = useQuery(["audit", collection, id], () => imsApi.audit({ collection, record: id, perPage: 100 }), { enabled: Boolean(id) });
  return {
    actions: (actions.data || []) as any[],
    audit: (history.data?.items || []) as any[],
    loading: history.isLoading,
    refresh: () => {
      actions.refetch();
      history.refetch();
    },
  };
}

/** Approve / return / reject buttons when the document is waiting for the signed-in person. */
export function DecisionButtons({ approval, number, onDone }: { approval?: any; number: string; onDone: () => void }) {
  const { user } = useAuth();
  const [kind, setKind] = React.useState<ActionKind | null>(null);
  const waiting = approval?.status === "pending" && String(approval?.pending_approvers || "").split(",").includes(user?.id);
  if (!waiting) return null;
  return (
    <>
      <Button icon={Undo2} onClick={() => setKind("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => setKind("reject")}>Reject</Button>
      <Button variant="primary" icon={CheckCircle2} onClick={() => setKind("approve")}>Approve</Button>
      <ActionDialog
        kind={kind}
        number={number}
        onClose={() => setKind(null)}
        run={(k, input) => procurementApi.act(approval.id, { action: k, comment: input.comment, user: input.user })}
        onDone={() => {
          setKind(null);
          onDone();
        }}
      />
    </>
  );
}
