/**
 * One employee's leave requests, embedded in a card: the staff workspace (/dashboard/my/leave), the HR
 * employee profile and the classic portal. Search and filters above, then the requests with their status
 * and who has them now. Pending requests can be edited or deleted from the "⋯" menu.
 */
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import { useDebounce } from "react-use";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import { LEAVE_TYPES, LeaveFormModal, leaveTypeLabel } from "@/components/modals/LeaveFormModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import { addDays } from "date-fns";
import {
  Button,
  Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterSelect,
  Num,
  Pager,
  StatusPill,
  fmtDate,
} from "@/components/ims";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
const TYPE_OPTIONS = LEAVE_TYPES.map((t) => ({ value: t.value, label: t.value }));

/** Detail under the status pill: who has the request now (the head of the employee's department, else HR), or why it was refused. */
const statusNote = (l: any) => {
  if (l?.status === "pending") {
    const head = l.expand?.employee?.expand?.department?.expand?.head;
    return head && head.id !== l.employee ? `With ${head.name} (line manager)` : "With HR";
  }
  if (l?.status === "rejected") return l.rejected_reason || undefined;
  return undefined;
};

const dateRange = (l: any) => {
  const from = fmtDate(l?.start, "");
  const to = fmtDate(l?.end, "");
  if (!from && !to) return "—";
  return from === to || !to ? from : `${from} – ${to}`;
};

/**
 * hideCreate: the page header already has "Request leave" (e.g. /dashboard/my/leave).
 * inset: the list sits inside a padded card, so it takes no side padding and draws the table in its own box;
 * without it the list fills an unpadded card edge to edge.
 */
export default function EmployeeLeaves({ employeeId, hideCreate = false, inset = false }: { employeeId: string; hideCreate?: boolean; inset?: boolean }) {
  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("leaves")
      .delete(e.id)
      .then(() => {
        recordsQuery.refetch();
        confirmModal.close();
        toast.success("Leave request deleted");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
        // Keep the confirmation open so the person can try again or cancel.
        throw e;
      });
  };

  const [search, setSearch] = useState("");
  const [searchText, setsearchText] = useState("");
  useDebounce(() => setsearchText(search), 700, [search]);

  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([
    {
      id: "created",
      desc: true,
    },
  ]);

  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "leaves",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        employeeId,
      },
    ],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = searchText
        ? `employee.name~"${searchText}" || type~"${searchText}"`
        : "";
      const filters = columnFilters
        .map((e) => {
          if (e.value["from"]) {
            if (e.value?.to) {
              return `created >= "${new Date(
                e.value?.from
              ).toISOString()}" && created <= "${new Date(
                e.value?.to
              ).toISOString()}"`;
            } else {
              return `created >= "${new Date(
                e.value?.from
              ).toISOString()}" && created <= "${new Date(
                addDays(new Date(e.value?.from), 1)
              ).toISOString()}"`;
            }
          } else {
            return e.value
              .map((p) => `${e.id}="${p.id || p.value || p}"`)
              .join(" || ");
          }
        })
        .join(" && ");

      const sorters = sorting
        .map((p) => `${p.desc ? "-" : "+"}${p.id}`)
        .join(" && ");

      return pocketbase
        .collection("leaves")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `employee="${employeeId}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            // employee.department.head: the line manager, shown as "With …" while the request is pending.
            expand: `employee,employee.department,employee.department.head,created_by`,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                employee: e?.expand?.employee?.name,
                created_by: e.expand?.created_by?.name,
                days: e.Leaveduration,
                type: e.type,
                status: e.status,
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

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  // ------------------------------------------------------------------ filters (same shape as before: [{ id, value: [v] }])
  const filterValue = (id: string) => ((columnFilters as any[]).find((f) => f.id === id)?.value || [])[0] || "";
  const setFilter = (id: string, v: string) => {
    setColumnFilters((fs: any[]) => [...fs.filter((f) => f.id !== id), ...(v ? [{ id, value: [v] }] : [])] as any);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };
  const chips: FilterChip[] = [
    ...(filterValue("status") ? [{ key: "status", label: `Status: ${STATUS_OPTIONS.find((o) => o.value === filterValue("status"))?.label}`, onRemove: () => setFilter("status", "") }] : []),
    ...(filterValue("type") ? [{ key: "type", label: `Type: ${filterValue("type")}`, onRemove: () => setFilter("type", "") }] : []),
  ];
  const filtered = Boolean(searchText || chips.length);

  const sort = sorting[0] ? `${sorting[0].desc ? "-" : ""}${sorting[0].id}` : undefined;
  const onSort = (s: string) => {
    setSorting([{ id: s.replace(/^-/, ""), desc: s.startsWith("-") }]);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const rows: any[] = recordsQuery?.data?.items || [];
  const columns: Column<any>[] = [
    {
      key: "type",
      header: "Type",
      sortField: "type",
      cell: (r) => <span className="font-semibold text-ims-text">{leaveTypeLabel(r.original)}</span>,
      sub: (r) => r.original?.reason,
      className: "max-w-[320px]",
    },
    { key: "dates", header: "Dates", sortField: "start", nowrap: true, cell: (r) => dateRange(r.original) },
    { key: "days", header: "Days", sortField: "days", numeric: true, cell: (r) => <Num value={r.days ?? r.original?.days} /> },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusPill status={r.status} sub={statusNote(r.original)} /> },
    {
      key: "created",
      header: "Requested",
      sortField: "created",
      nowrap: true,
      cell: (r) => fmtDate(r.original?.created),
      sub: (r) => (r.created_by && r.original?.created_by !== r.original?.employee ? `by ${r.created_by}` : undefined),
    },
  ];

  const create = !hideCreate && (
    <Button variant="primary" icon={Plus} onClick={() => newRecordModal.open()}>
      Request leave
    </Button>
  );

  return (
    <div className="min-w-0">
      <ConfirmDialog
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
        title="Delete this leave request?"
        description={
          confirmModal.meta
            ? `${leaveTypeLabel(confirmModal.meta.original)}, ${dateRange(confirmModal.meta.original)}. The request is removed and cannot be restored.`
            : "The request is removed and cannot be restored."
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(confirmModal.meta)}
      />
      <FilterBar
        className={inset ? "!px-0 !pt-0" : undefined}
        search={{ value: search, onChange: (v) => { setSearch(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }, placeholder: "Search leave type" }}
        chips={chips}
        onClear={() => { setColumnFilters([]); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
        right={create}
      >
        <FilterSelect label="Status" value={filterValue("status")} onChange={(v) => setFilter("status", v)} options={STATUS_OPTIONS} />
        <FilterSelect label="Type" value={filterValue("type")} onChange={(v) => setFilter("type", v)} options={TYPE_OPTIONS} />
      </FilterBar>
      <div className={inset ? "overflow-hidden rounded-control border border-ims-border" : "border-t border-ims-divider"}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => editRow.edit(r.original)}
          rowActions={(r) => [
            { label: "Edit leave request", icon: Pencil, disabled: r.original?.status !== "pending", onSelect: (row) => editRow.edit(row.original) },
            { label: "Delete leave request", icon: Trash2, danger: true, disabled: r.original?.status !== "pending", onSelect: (row) => confirmModal.open({ meta: row }) },
          ]}
          sort={sort}
          onSort={onSort}
          loading={recordsQuery.status === "loading"}
          fetching={recordsQuery.isFetching}
          error={recordsQuery.isError ? recordsQuery.error : undefined}
          onRetry={() => recordsQuery.refetch()}
          // No rows: let the table fit the card so the empty message is not cut off on phones.
          minWidth={rows.length ? 680 : 0}
          caption="Leave requests"
          empty={
            <EmptyState
              icon={CalendarDays}
              text={filtered ? "No leave request matches these filters. Change the search or clear the filters." : "No leave request yet."}
              action={!filtered ? create : undefined}
            />
          }
          footer={
            recordsQuery.data?.totalItems ? (
              <Pager
                page={pageIndex + 1}
                perPage={pageSize}
                total={recordsQuery.data.totalItems}
                sizes={[10, 30, 50]}
                onPage={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))}
                onPerPage={(n) => setPagination({ pageIndex: 0, pageSize: n })}
              />
            ) : null
          }
        />
      </div>
      <LeaveFormModal
        onComplete={() => {
          recordsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        employeeId={employeeId}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />
    </div>
  );
}
