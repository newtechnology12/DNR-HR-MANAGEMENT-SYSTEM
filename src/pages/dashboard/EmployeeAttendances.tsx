/**
 * One employee's attendance log, embedded in a card: the staff workspace (/dashboard/my/attendance), the
 * HR employee profile and the classic portal. Every clock-in and clock-out with the hours worked, whether
 * the person arrived on time, and where the record came from (biometric, manual, corrected by HR).
 */
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { useState } from "react";
import { useQuery } from "react-query";
import { addDays, differenceInSeconds, format, isToday } from "date-fns";
import { Clock } from "lucide-react";
import formatSeconds from "@/utils/formatSeconds";
import { cn } from "@/utils";
import {
  Column,
  DataTable,
  DateRangeFilter,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterSelect,
  Pager,
  fmtDate,
  toDate,
} from "@/components/ims";

const ARRIVAL_OPTIONS = [
  { value: "early", label: "On time" },
  { value: "late", label: "Late" },
];
const SOURCE_OPTIONS = [
  { value: "biometric", label: "Biometric" },
  { value: "manual", label: "Manual" },
  { value: "correction", label: "Corrected by HR" },
];
const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCE_OPTIONS.map((o) => [o.value, o.label]));

const hm = (v?: string | null) => {
  const d = toDate(v);
  return d ? format(d, "HH:mm") : "";
};

/** On time / Late as a dot + text, the same colours as the attendance calendar. */
function Arrival({ value }: { value?: string }) {
  if (!value) return <span className="text-ims-faint">—</span>;
  const late = value === "late";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", late ? "font-semibold text-ims-text" : "text-ims-body")}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", late ? "bg-ims-priority-high" : "bg-ims-link")} aria-hidden />
      {late ? "Late" : "On time"}
    </span>
  );
}

/** inset: the list sits inside a padded card (no side padding, table in its own box); otherwise it fills an unpadded card. */
export default function EmployeeAttendances({ employeeId, inset = false }: { employeeId: string; inset?: boolean }) {
  // The attendance collection has no text field to search on, so the list offers filters only.
  const [searchText] = useState("");

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
      "employee-attendances",
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
      const searchQ = searchText ? `name~"${searchText}"` : "";

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
        .collection("attendance")
        .getList(pageIndex + 1, pageSize, {
          ...cleanObject({
            filter: [searchQ, filters, `employee="${employeeId}"`]
              .filter((e) => e)
              .join("&&"),
            sort: sorters,
            expand: ``,
          }),
        })
        .then((e) => {
          return {
            items: e?.items?.map((e) => {
              return {
                id: e.id,
                behaviour: e.behaviour,
                type: e.type || "",
                total_hours:
                  formatSeconds(
                    differenceInSeconds(
                      new Date(e.clockout_time || new Date()),
                      new Date(e.clockin_time)
                    )
                  ) || "",
                clockin_location: e.clockin_location || "",
                clockout_location: e.clockout_location || "",
                lunch_start_time: e.lunch_start_time || "",
                lunch_end_time: e.lunch_end_time || "",
                lunch_break: e.lunch_start_time
                  ? formatSeconds(
                      differenceInSeconds(
                        new Date(e.lunch_end_time || new Date()),
                        new Date(e.lunch_start_time)
                      )
                    ) || ""
                  : "",
                original: e,
              };
            }),
            totalPages: e.totalPages,
            totalItems: e.totalItems,
          };
        });
    },
    enabled: Boolean(employeeId),
  });

  // ------------------------------------------------------------------ filters (same shape as before)
  const filterOf = (id: string) => (columnFilters as any[]).find((f) => f.id === id)?.value;
  const listValue = (id: string) => (filterOf(id) || [])[0] || "";
  const setList = (id: string, v: string) => {
    setColumnFilters((fs: any[]) => [...fs.filter((f) => f.id !== id), ...(v ? [{ id, value: [v] }] : [])] as any);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };
  const [range, setRange] = useState({ from: "", to: "" });
  const setDates = (from: string, to: string) => {
    setRange({ from, to });
    setColumnFilters((fs: any[]) => [
      ...fs.filter((f) => f.id !== "created"),
      // Whole days: from the start of the first day to the end of the last one.
      ...(from ? [{ id: "created", value: { from: new Date(`${from}T00:00:00`), ...(to ? { to: new Date(`${to}T23:59:59`) } : {}) } }] : []),
    ] as any);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };
  const chips: FilterChip[] = [
    ...(listValue("behaviour") ? [{ key: "behaviour", label: `Arrival: ${ARRIVAL_OPTIONS.find((o) => o.value === listValue("behaviour"))?.label}`, onRemove: () => setList("behaviour", "") }] : []),
    ...(listValue("type") ? [{ key: "type", label: `Source: ${SOURCE_LABEL[listValue("type")]}`, onRemove: () => setList("type", "") }] : []),
    ...(range.from || range.to ? [{ key: "date", label: `Date: ${range.from ? fmtDate(range.from) : "…"} – ${range.to ? fmtDate(range.to) : "…"}`, onRemove: () => setDates("", "") }] : []),
  ];

  const sort = sorting[0] ? `${sorting[0].desc ? "-" : ""}${sorting[0].id}` : undefined;
  const onSort = (s: string) => {
    setSorting([{ id: s.replace(/^-/, ""), desc: s.startsWith("-") }]);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const rows: any[] = recordsQuery?.data?.items || [];
  const hasLunch = rows.some((r) => r.lunch_start_time);
  const day = (r: any) => toDate(r.original?.date || r.original?.clockin_time);

  const columns: Column<any>[] = [
    {
      key: "date",
      header: "Date",
      sortField: "date",
      nowrap: true,
      cell: (r) => <span className="font-semibold text-ims-text">{fmtDate(day(r))}</span>,
      sub: (r) => (day(r) ? format(day(r) as Date, "EEEE") : undefined),
    },
    { key: "in", header: "Clock in", sortField: "clockin_time", nowrap: true, cell: (r) => hm(r.original?.clockin_time) || "—", sub: (r) => r.clockin_location || undefined },
    {
      key: "out",
      header: "Clock out",
      sortField: "clockout_time",
      nowrap: true,
      cell: (r) => hm(r.original?.clockout_time) || <span className="text-ims-faint">—</span>,
      sub: (r) => r.clockout_location || (!r.original?.clockout_time && r.original?.clockin_time ? "Not clocked out" : undefined),
    },
    ...(hasLunch
      ? [{ key: "lunch", header: "Lunch", nowrap: true, cell: (r: any) => (r.lunch_start_time ? `${hm(r.lunch_start_time)} – ${hm(r.lunch_end_time) || "…"}` : "—"), sub: (r: any) => r.lunch_break || undefined } as Column<any>]
      : []),
    {
      key: "hours",
      header: "Hours",
      numeric: true,
      cell: (r) => {
        if (!r.original?.clockin_time) return "—";
        if (r.original?.clockout_time) return r.total_hours || "—";
        return day(r) && isToday(day(r) as Date) && r.total_hours ? <span className="text-ims-muted">{r.total_hours} so far</span> : <span className="text-ims-faint">—</span>;
      },
    },
    { key: "arrival", header: "Arrival", sortField: "behaviour", cell: (r) => <Arrival value={r.behaviour} />, sub: (r) => r.original?.notes || undefined, className: "max-w-[260px]" },
    { key: "source", header: "Source", sortField: "type", nowrap: true, cell: (r) => SOURCE_LABEL[r.type] || (r.type ? r.type.charAt(0).toUpperCase() + r.type.slice(1) : "—") },
  ];

  return (
    <div className="min-w-0">
      <FilterBar className={inset ? "!px-0 !pt-0" : undefined} chips={chips} onClear={() => { setColumnFilters([]); setRange({ from: "", to: "" }); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
        <FilterSelect label="Arrival" value={listValue("behaviour")} onChange={(v) => setList("behaviour", v)} options={ARRIVAL_OPTIONS} />
        <FilterSelect label="Source" value={listValue("type")} onChange={(v) => setList("type", v)} options={SOURCE_OPTIONS} />
        <DateRangeFilter label="Date" from={range.from} to={range.to} onChange={setDates} />
      </FilterBar>
      <div className={inset ? "overflow-hidden rounded-control border border-ims-border" : "border-t border-ims-divider"}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          sort={sort}
          onSort={onSort}
          loading={recordsQuery.status === "loading"}
          fetching={recordsQuery.isFetching}
          error={recordsQuery.isError ? recordsQuery.error : undefined}
          onRetry={() => recordsQuery.refetch()}
          minWidth={!rows.length ? 0 : hasLunch ? 820 : 720}
          caption="Attendance log"
          empty={<EmptyState icon={Clock} text={chips.length ? "No attendance record matches these filters. Change or clear the filters." : "No attendance recorded yet."} />}
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
    </div>
  );
}
