import { useState } from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Car, CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import TableTools from "@/components/enterprise/TableTools";
import { EXPORTS } from "@/lib/exportConfigs";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import { CarRequestForm } from "@/components/Carmodel/CarRequestForm";
import { useAuth } from "@/context/auth.context";
import { pbQuote } from "@/lib/procurement";
import {
  Button,
  Card,
  Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  KpiBand,
  Modal,
  Num,
  Page,
  PageHeader,
  Pager,
  Person,
  Tabs,
  Textarea,
  fmtDate,
  fmtNumber,
} from "@/components/ims";
import { useDebounce } from "use-debounce";

type Tab = "pending" | "approved" | "rejected";
const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending approval" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

/** "17 Oct 2026" or "27 Sep 2026 – 28 Sep 2026" */
const tripDates = (start?: string, end?: string) => {
  const a = fmtDate(start, "");
  const b = fmtDate(end, "");
  return !a ? b || "—" : !b || a === b ? a : `${a} – ${b}`;
};

export default function CarManagement() {
  const [CarToApprove, setCarToApprove] = useState<any>(null);
  const [carToReject, setCarToReject] = useState<any>(null);
  const [toDelete, setToDelete] = useState<any>(null);

  const [searchText, setsearchText] = useState("");
  const [search] = useDebounce(searchText, 300);
  const [sort, setSort] = useState("-created");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<Tab>("pending");

  // Employee name or department, as the old search intended (the request has no name/department field of its own).
  const searchQ = search.trim() ? `(users.name ~ ${pbQuote(search.trim())} || users.department.name ~ ${pbQuote(search.trim())})` : "";
  const filter = [searchQ, `status="${activeTab}"`].filter((e) => e).join(" && ");

  const recordsQuery = useQuery({
    queryKey: ["CarRequests", { search, sort, pageIndex, pageSize, activeTab }],
    keepPreviousData: true,
    queryFn: () => {
      return pocketbase
        .collection("CarRequests")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter,
            sort,
            expand: `users,created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e?.expand?.users?.name,
                created_by: e.expand?.created_by?.name,
                start: e.start,
                end: e.end,
                purpose: e.purpose,
                position: e.position,
                starting_km: e.starting_km,
                ending_km: e.ending_km,
                totalKm: e.totalKm,
                expense_amount: e.expense_amount,
                totalExpenses: e.totalExpenses,
                status: e.status,
                reason: e.reason,
                approved_by: e.approved_by || "---",
                rejected_by: e.rejected_by || "---",
                created: e.created,
                original: e,
              };
            }),
            totalPages: e.totalPages,
            totalItems: e.totalItems,
          };
        });
    },
    enabled: true,
  });

  // Totals over every request in this tab (not just this page) for the total row.
  const sums = useQuery(
    ["CarRequests-sums", filter],
    async () => {
      const rows = await pocketbase.collection("CarRequests").getFullList({ filter, fields: "id,totalKm,totalExpenses", batch: 1000 });
      return { km: rows.reduce((s, r: any) => s + (Number(r.totalKm) || 0), 0), expenses: rows.reduce((s, r: any) => s + (Number(r.totalExpenses) || 0), 0) };
    },
    { keepPreviousData: true }
  );

  const newRecordModal = useModalState();
  const editRow = useEditRow();

  const handleDelete = (e: any) => {
    return pocketbase
      .collection("CarRequests")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        toast.success(`Vehicle request of ${e.employee || "the employee"} deleted`);
      })
      .catch((err) => {
        toast.error(err.message);
        throw err;
      });
  };

  const statsQuery = useQuery({
    queryKey: ["car-requests-stats"],
    queryFn: async () => {
      const [total, pending, approved, rejected] = await Promise.all([
        pocketbase.collection("CarRequests").getList(1, 1, {}).then((e) => e.totalItems),
        pocketbase
          .collection("CarRequests")
          .getList(1, 1, { filter: `status="pending"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("CarRequests")
          .getList(1, 1, { filter: `status="approved"` })
          .then((e) => e.totalItems),
        pocketbase
          .collection("CarRequests")
          .getList(1, 1, { filter: `status="rejected"` })
          .then((e) => e.totalItems),
      ]);
      return { total, pending, approved, rejected };
    },
    enabled: true,
  });
  const statsLoading = statsQuery.status === "loading";
  const pick = (t: Tab) => {
    setActiveTab(t);
    setPageIndex(0);
  };

  const columns: Column<any>[] = [
    { key: "employee", header: "Employee", sortField: "users.name", className: "max-w-[200px]", cell: (r) => <Person name={r.employee} detail={r.position || undefined} /> },
    {
      key: "trip",
      header: "Trip",
      sortField: "start",
      nowrap: true,
      cell: (r) => tripDates(r.start, r.end),
      sub: (r) => [r.original?.fromLocation, r.original?.toLocation].filter(Boolean).join(" → ") || null,
    },
    {
      key: "purpose",
      header: "Purpose",
      sortField: "purpose",
      clamp: true,
      cell: (r) => r.purpose || "—",
      sub: (r) => (r.original?.passengerCount ? `${r.original.passengerCount} passenger${r.original.passengerCount === 1 ? "" : "s"}` : null),
    },
    {
      key: "km",
      header: "Distance (km)",
      sortField: "totalKm",
      numeric: true,
      cell: (r) => (r.totalKm ? <Num value={r.totalKm} /> : <span className="text-ims-faint">—</span>),
      sub: (r) => (r.starting_km || r.ending_km ? `${fmtNumber(r.starting_km)} → ${fmtNumber(r.ending_km)}` : null),
      total: sums.data ? <Num value={sums.data.km} /> : "…",
    },
    {
      key: "expenses",
      header: "Expenses (RWF)",
      sortField: "totalExpenses",
      numeric: true,
      cell: (r) => (r.totalExpenses ? <Num value={r.totalExpenses} /> : <span className="text-ims-faint">—</span>),
      total: sums.data ? <Num value={sums.data.expenses} /> : "…",
    },
    { key: "created", header: "Requested", sortField: "created", nowrap: true, cell: (r) => fmtDate(r.created), sub: (r) => (r.created_by && r.created_by !== r.employee ? `By ${r.created_by}` : null) },
  ];

  const data = recordsQuery.data;
  const decided = (r: any) => r.status === "approved" || r.status === "rejected";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Vehicles & expense reports" }, { label: "Vehicle requests" }]}
        title="Vehicle requests"
        subtitle="Requests to use an organisation vehicle, with the trip, the distance and the expenses."
        primary={{ label: "Request a vehicle", icon: Plus, onClick: () => newRecordModal.open() }}
      />

      <KpiBand
        loading={statsLoading}
        items={[
          { label: "All requests", value: fmtNumber(statsQuery.data?.total) },
          { label: "Pending approval", value: fmtNumber(statsQuery.data?.pending), tone: statsQuery.data?.pending ? "warning" : "default", onClick: () => pick("pending") },
          { label: "Approved", value: fmtNumber(statsQuery.data?.approved), onClick: () => pick("approved") },
          { label: "Rejected", value: fmtNumber(statsQuery.data?.rejected), onClick: () => pick("rejected") },
        ]}
      />

      <Card padded={false} className="overflow-hidden">
        <Tabs inset label="Vehicle requests" active={activeTab} onChange={(k) => pick(k as Tab)} tabs={TABS} />
        <FilterBar
          search={{
            value: searchText,
            onChange: (v) => {
              setsearchText(v);
              setPageIndex(0);
            },
            placeholder: "Search employee or department",
          }}
          right={<TableTools exportConfig={EXPORTS.vehicleRequests()} />}
        />
        <DataTable
          columns={columns}
          rows={data?.items || []}
          rowKey={(r) => r.id}
          onRowClick={(r) => editRow.edit(r)}
          rowActions={(r) => [
            { label: "Edit request", icon: Pencil, onSelect: (row) => editRow.edit(row) },
            { label: "Approve", icon: CheckCircle2, onSelect: (row) => setCarToApprove(row), disabled: decided(r) },
            { label: "Reject", icon: XCircle, onSelect: (row) => setCarToReject(row), disabled: decided(r) },
            { label: "Delete request", icon: Trash2, danger: true, onSelect: (row) => setToDelete(row) },
          ]}
          sort={sort}
          onSort={(s) => {
            setSort(s);
            setPageIndex(0);
          }}
          loading={recordsQuery.status === "loading"}
          fetching={recordsQuery.isFetching}
          error={recordsQuery.isError ? recordsQuery.error : undefined}
          onRetry={() => recordsQuery.refetch()}
          minWidth={860}
          caption="Vehicle requests"
          empty={
            <EmptyState
              icon={Car}
              text={search.trim() ? "No request matches this search." : activeTab === "pending" ? "No vehicle request is waiting for approval." : `No ${activeTab} vehicle requests.`}
              action={activeTab === "pending" && !search.trim() ? <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>Request a vehicle</Button> : undefined}
            />
          }
          footer={
            data && data.totalItems > 0 ? (
              <Pager
                page={pageIndex + 1}
                perPage={pageSize}
                total={data.totalItems}
                sizes={[10, 30, 50]}
                onPage={(p) => setPageIndex(p - 1)}
                onPerPage={(n) => {
                  setPageSize(n);
                  setPageIndex(0);
                }}
              />
            ) : null
          }
        />
      </Card>

      <CarRequestForm
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        onRequestCreated={() => {
          recordsQuery.refetch();
          statsQuery.refetch();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title={`Delete the vehicle request of ${toDelete?.employee || "this employee"}?`}
        description="The request is removed for good. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(toDelete)}
      />

      <ApproveOrRejectModal
        car={CarToApprove || carToReject}
        type={CarToApprove ? "approve" : carToReject ? "reject" : null}
        open={!!CarToApprove || !!carToReject}
        setOpen={(e) => {
          if (!e) {
            setCarToApprove(null);
            setCarToReject(null);
          }
        }}
        onCompleted={() => {
          recordsQuery.refetch();
        }}
      />
    </Page>
  );
}

function ApproveOrRejectModal({ type, open, setOpen, car, onCompleted }: { type: "approve" | "reject" | null; open: boolean; setOpen: (o: boolean) => void; car: any; onCompleted: () => void }) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const approve = type === "approve";
  const missing = !reason.trim();

  const close = () => {
    setOpen(false);
    setReason("");
    setTried(false);
  };

  const onSubmit = () => {
    setTried(true);
    if (missing) return;
    setBusy(true);
    return pocketbase
      .collection("CarRequests")
      .update(car.id, {
        status: approve ? "approved" : "rejected",
        [approve ? "approved_by" : "rejected_by"]: user?.id,
        [approve ? "approved_at" : "rejected_at"]: new Date(),
        [approve ? "approved_reason" : "rejected_reason"]: reason,
      })
      .then(() => {
        toast.success(`Vehicle request of ${car?.employee || "the employee"} ${approve ? "approved" : "rejected"}`);
        onCompleted();
        close();
      })
      .catch((e) => {
        toast.error(e.message);
      })
      .finally(() => setBusy(false));
  };

  const who = car?.employee || "this employee";
  const trip = car ? tripDates(car.start, car.end) : "";

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      size="sm"
      title={approve ? `Approve the vehicle request of ${who}?` : `Reject the vehicle request of ${who}?`}
      description={`${car?.purpose ? `${car.purpose}, ` : ""}${trip}. ${approve ? "The trip can go ahead." : "The employee sees your reason."}`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant={approve ? "primary" : "danger"} icon={approve ? CheckCircle2 : XCircle} onClick={onSubmit} loading={busy}>
            {approve ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <Field label="Reason" required htmlFor="car-decision-reason" error={tried && missing ? "Write a short reason for the decision." : null}>
        <Textarea id="car-decision-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} invalid={tried && missing} placeholder={approve ? "For example: vehicle available, driver assigned" : "For example: no vehicle free on these dates"} />
      </Field>
    </Modal>
  );
}
