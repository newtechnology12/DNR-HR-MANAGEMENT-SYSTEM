/**
 * General ledger → Period close. The Director of Finance closes each month once its checklist is clear: the previous
 * month closed, bank and cash reconciled, depreciation and payroll posted, no journal waiting, the trial balance
 * balanced. A closed month takes no posting; re-opening one needs a request the Secretary General approves, latest
 * month first.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Info, Lock, Unlock, Scale, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { CheckItem, PeriodInfo, ledgerApi } from "@/lib/ledger";
import { DecisionButtons } from "@/components/enterprise/useApprovalTrail";
import {
  Button, Card, CardHeader, Column, ConfirmDialog, DataTable, DocNo, EmptyState, ErrorState, Field, KpiBand, Modal, Page, PageHeader, Person, Pill, StatusPill, Textarea, TwoLine, fmtDate, fmtDateTime, notify,
} from "@/components/ims";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

const PERIOD_WORD = { open: "In progress", closed: "Closed" } as const;
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export default function PeriodClose() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const q = useQuery(["gl-periods"], ledgerApi.periods);
  const requests = useQuery(["period-reopen-requests"], () => pocketbase.collection("period_reopen_requests").getFullList({ sort: "-created", expand: "approval,period,requested_by", batch: 200 }));
  const [selectedId, setSelectedId] = React.useState("");
  const [closing, setClosing] = React.useState<PeriodInfo | null>(null);
  const [reopening, setReopening] = React.useState<PeriodInfo | null>(null);
  const [withdrawing, setWithdrawing] = React.useState<any | null>(null);
  const [openYears, setOpenYears] = React.useState<Record<string, boolean>>({});
  const refresh = () => {
    q.refetch();
    requests.refetch();
  };

  const periods = q.data?.periods || [];
  const today = q.data?.today || new Date().toISOString().slice(0, 10);
  const ordered = [...periods].sort((a, b) => (a.start < b.start ? -1 : 1));
  const nextToClose = ordered.find((p) => p.status === "open" && p.end < today);
  const thisMonth = ordered.find((p) => p.start <= today && p.end >= today);
  const latestClosed = [...ordered].reverse().find((p) => p.status === "closed");
  const selected = periods.find((p) => p.id === selectedId) || nextToClose || thisMonth || periods[0];
  const reqs = (requests.data || []) as any[];
  const pendingFor = (periodId: string) => reqs.find((r) => r.period === periodId && r.status === "pending_approval");
  const waitingForMe = reqs.filter((r) => r.status === "pending_approval" && String(r.expand?.approval?.pending_approvers || "").split(",").includes(user?.id));
  const years = Array.from(new Set(periods.map((p) => p.fiscal_year))).map((fy) => {
    const months = ordered.filter((p) => p.fiscal_year === fy);
    return { id: fy, name: months[0]?.fiscal_year_name || "Fiscal year", months, start: months[0]?.start || "" };
  }).sort((a, b) => (a.start < b.start ? 1 : -1));
  const yearOfToday = years.find((y) => y.months.some((p) => p.start <= today && p.end >= today)) || years[0];
  const openPast = ordered.filter((p) => p.status === "open" && p.start <= today);
  const pendingCount = reqs.filter((r) => r.status === "pending_approval").length;

  const requestColumns: Column<any>[] = [
    { key: "number", header: "Request", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => fmtDate(r.created) },
    { key: "period", header: "Month", nowrap: true, cell: (r) => r.expand?.period?.name || "—" },
    { key: "reason", header: "What must be corrected", clamp: true, width: "40%", cell: (r) => r.reason },
    { key: "by", header: "Asked by", cell: (r) => <Person name={r.expand?.requested_by?.name} /> },
    { key: "status", header: "Status", nowrap: true, cell: (r) => <StatusPill status={r.status} sub={r.status === "pending_approval" ? "With the Secretary General" : r.status === "cancelled" && r.cancel_reason ? r.cancel_reason : undefined} /> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "General ledger", to: "/dashboard/finance/journals" }, { label: "Period close" }]}
        title="Period close"
        subtitle="A month is closed once its checklist is clear; nothing more can be posted to it. Re-opening a closed month needs the Secretary General's approval."
        primary={can("close_periods") && nextToClose ? { label: `Close ${nextToClose.name}`, icon: Lock, onClick: () => setClosing(nextToClose), disabled: Boolean(nextToClose.blocking) } : undefined}
        secondary={[{ label: "Trial balance", icon: Scale, to: "/dashboard/finance/trial-balance" }]}
      />
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Next month to close", value: nextToClose?.name || "None", tone: nextToClose?.blocking ? "warning" : nextToClose ? "success" : "default", sub: nextToClose ? (nextToClose.blocking ? `${nextToClose.blocking} item${nextToClose.blocking === 1 ? "" : "s"} to clear first` : "ready to close") : "every past month is closed", onClick: nextToClose ? () => setSelectedId(nextToClose.id) : undefined },
          { label: "Months closed", value: yearOfToday ? `${yearOfToday.months.filter((p) => p.status === "closed").length} of ${yearOfToday.months.length}` : "—", sub: yearOfToday?.name },
          { label: "Open for posting", value: openPast.length, sub: openPast.map((p) => p.name.split(" ")[0]).join(", ") || "no month open" },
          { label: "Re-open requests", value: pendingCount, tone: pendingCount ? "warning" : "default", sub: pendingCount ? "with the Secretary General" : "none waiting" },
        ]}
      />

      {waitingForMe.map((r) => (
        <Card key={r.id} className="border-ims-warning/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-t-small text-ims-muted">
                <DocNo value={r.number} /> <span aria-hidden>·</span> asked by {r.expand?.requested_by?.name || "—"} on {fmtDate(r.created)} <StatusPill status="pending_approval" />
              </p>
              <h2 className="mt-1 text-t-section text-ims-text">Re-open {r.expand?.period?.name}?</h2>
              <p className="mt-1 max-w-3xl text-t-body text-ims-body">{r.reason}</p>
              <p className="mt-1 text-t-small text-ims-muted">Approving opens the month for postings again; the Director of Finance closes it once the corrections are made.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <DecisionButtons approval={r.expand?.approval} number={r.number} onDone={refresh} />
            </div>
          </div>
        </Card>
      ))}

      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2"><Skeleton className="h-6 w-48" /><div className="mt-5 space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
          <Card><div className="space-y-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div></Card>
        </div>
      ) : q.error ? (
        <Card><ErrorState text="The periods could not be loaded." detail={(q.error as Error)?.message} onRetry={() => q.refetch()} /></Card>
      ) : !selected ? (
        <Card><EmptyState icon={CalendarCheck} text="No fiscal year is set up yet. Create one under Setup → Fiscal years." /></Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={selected.name}
              subtitle={`${fmtDate(selected.start)} – ${fmtDate(selected.end)} · ${selected.fiscal_year_name}`}
              action={selected.start > today ? <Pill tone="neutral">Not started</Pill> : <StatusPill status={selected.status} map={PERIOD_WORD} />}
            />
            {selected.status === "closed" ? (
              <ClosedMonth
                p={selected}
                latest={latestClosed?.id === selected.id}
                laterClosed={latestClosed}
                pending={pendingFor(selected.id)}
                canAsk={can(["close_periods", "manage_journals"])}
                onAsk={() => setReopening(selected)}
              />
            ) : selected.checklist ? (
              <OpenMonth p={selected} today={today} isNext={nextToClose?.id === selected.id} earlier={nextToClose} canClose={can("close_periods")} links={can(["close_periods", "manage_journals", "view_journals"])} onClose={() => setClosing(selected)} />
            ) : (
              <EmptyState compact icon={CalendarCheck} text={`${selected.name} has not started. Its checklist appears on ${fmtDate(selected.start)}.`} />
            )}
          </Card>
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <h2 className="text-t-section text-ims-text">Months</h2>
              <p className="mt-0.5 text-t-small text-ims-muted">Select a month to see its checklist.</p>
            </div>
            {years.map((y) => {
              // earlier years are history: one line until opened (or until one of their months is selected)
              const folded = Boolean(yearOfToday && y.start < yearOfToday.start) && !openYears[y.id] && !y.months.some((p) => p.id === selected.id);
              const closedCount = y.months.filter((p) => p.status === "closed").length;
              return (
              <div key={y.id}>
                <p className="flex items-center justify-between border-y border-ims-divider bg-ims-thead px-5 py-2 text-[12.5px] font-semibold text-ims-muted">
                  <span>{y.name}</span>
                  {folded && (
                    <button type="button" onClick={() => setOpenYears((o) => ({ ...o, [y.id]: true }))} className="font-bold text-ims-link hover:underline">
                      {closedCount === y.months.length ? `All ${y.months.length} months closed · Show` : `${closedCount} of ${y.months.length} closed · Show`}
                    </button>
                  )}
                </p>
                {!folded && <ul>
                  {y.months.map((p) => {
                    const on = p.id === selected.id;
                    const future = p.start > today;
                    const note = p.status === "closed" ? (p.closed_at ? `Closed ${fmtDate(p.closed_at)}` : "Closed") : future ? "Not started" : p.end >= today ? `Ends ${fmtDate(p.end)}` : p.blocking ? `${p.blocking} to clear` : "Ready to close";
                    return (
                      <li key={p.id} className="border-b border-ims-divider last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          aria-current={on ? "true" : undefined}
                          className={cn("flex min-h-[52px] w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus", on && "bg-ims-info-bg hover:bg-ims-info-bg")}
                        >
                          {p.status === "closed" ? <Lock size={16} className="shrink-0 text-ims-success" aria-hidden /> : <Unlock size={16} className={cn("shrink-0", future ? "text-ims-faint" : "text-ims-link")} aria-hidden />}
                          <span className="min-w-0 flex-1">
                            <span className={cn("block font-semibold", future ? "text-ims-muted" : "text-ims-text")}>{p.name}</span>
                            <span className={cn("block text-t-small", !future && p.status === "open" && p.end < today && p.blocking ? "text-ims-warning" : "text-ims-muted")}>{note}</span>
                          </span>
                          {pendingFor(p.id) && <Pill tone="warning">Re-open asked</Pill>}
                        </button>
                      </li>
                    );
                  })}
                </ul>}
              </div>
              );
            })}
          </Card>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pb-4 pt-5">
          <h2 className="text-t-section text-ims-text">Re-open requests</h2>
          <p className="mt-0.5 text-t-small text-ims-muted">Asked by the Director of Finance or the Accountant; decided by the Secretary General.</p>
        </div>
        <DataTable
          columns={requestColumns}
          rows={reqs}
          rowKey={(r) => r.id}
          rowActions={(r) => (r.status === "pending_approval" && (r.requested_by === user?.id || can("close_periods")) ? [{ label: "Withdraw the request", icon: Undo2, danger: true, onSelect: () => setWithdrawing(r) }] : [])}
          loading={requests.isLoading}
          error={requests.error}
          onRetry={() => requests.refetch()}
          minWidth={860}
          empty={<EmptyState compact icon={Unlock} text="No month has been asked to be re-opened." />}
        />
      </Card>

      {closing && <CloseDialog p={closing} onClose={() => setClosing(null)} onDone={() => { setClosing(null); refresh(); }} />}
      {reopening && <ReopenDialog p={reopening} onClose={() => setReopening(null)} onDone={() => { setReopening(null); refresh(); }} />}
      <ConfirmDialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        title={`Withdraw ${withdrawing?.number || "the request"}?`}
        description={`${withdrawing?.expand?.period?.name || "The month"} stays closed and the Secretary General no longer sees the request.`}
        confirmLabel="Withdraw"
        danger
        reason={{ label: "Why (optional)", placeholder: "e.g. The correction can wait for the next month", required: false }}
        onConfirm={async (reason) => {
          try {
            await ledgerApi.cancelReopen(withdrawing.id, reason);
            notify.success(`${withdrawing.number} withdrawn.`);
            refresh();
          } catch (e) {
            notify.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Page>
  );
}

// ------------------------------------------------------------------ checklist
const STATE = {
  ok: { icon: CheckCircle2, color: "text-ims-success" },
  fail: { icon: XCircle, color: "text-ims-danger" },
  warn: { icon: AlertTriangle, color: "text-ims-warning" },
};

/** `links`: only for the people who work on the ledger — the pages behind them are theirs. */
function Checklist({ items, live, links = live }: { items: CheckItem[]; live: boolean; links?: boolean }) {
  return (
    <ul className="divide-y divide-ims-divider overflow-hidden rounded-control border border-ims-border">
      {items.map((it) => {
        const s = STATE[it.state] || STATE.warn;
        return (
          <li key={it.key} className="flex items-start gap-3 px-4 py-3">
            <s.icon size={18} className={cn("mt-0.5 shrink-0", s.color)} aria-label={it.state === "ok" ? "Done" : it.state === "fail" ? "Not done" : "To check"} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-ims-text">
                {it.label}
                {live && it.blocking && <Pill tone="danger">Must be cleared</Pill>}
                {live && it.state === "warn" && <Pill tone="warning">Check before closing</Pill>}
              </p>
              {it.detail && <p className="mt-0.5 text-t-small text-ims-muted">{it.detail}</p>}
            </div>
            {links && it.link && it.state !== "ok" && (
              <Link to={it.link} className="inline-flex shrink-0 items-center gap-1 self-center text-[13px] font-bold text-ims-link hover:underline">
                Open <ArrowRight size={14} aria-hidden />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Banner({ tone, children }: { tone: "info" | "success" | "warning"; children: React.ReactNode }) {
  const cls = { info: "bg-ims-info-bg text-ims-info", success: "bg-ims-success-bg text-ims-success", warning: "bg-ims-warning-bg text-ims-warning" }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : Info;
  return (
    <p className={cn("mb-4 flex items-start gap-2 rounded-control px-3.5 py-2.5 text-t-body font-semibold", cls)}>
      <Icon size={17} className="mt-0.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

function OpenMonth({ p, today, isNext, earlier, canClose, links, onClose }: { p: PeriodInfo; today: string; isNext: boolean; earlier?: PeriodInfo; canClose: boolean; links: boolean; onClose: () => void }) {
  const items = p.checklist || [];
  const over = p.end < today;
  const blocking = p.blocking || 0;
  const warnings = p.warnings || 0;
  return (
    <>
      {!over ? (
        <Banner tone="info">The month ends on {fmtDate(p.end)}. This shows where things stand; it can be closed from {fmtDate(nextDay(p.end))}.</Banner>
      ) : blocking ? (
        <Banner tone="warning">{blocking} item{blocking === 1 ? "" : "s"} must be cleared before {p.name} can be closed.</Banner>
      ) : (
        <Banner tone="success">Ready to close{warnings ? ` — look at the ${warnings} point${warnings === 1 ? "" : "s"} marked “Check before closing” first` : ""}.</Banner>
      )}
      <Checklist items={items} live links={links} />
      {p.reopened_at && (
        <p className="mt-4 text-t-small text-ims-muted">
          Re-opened {fmtDateTime(p.reopened_at)}{p.reopened_by ? ` by ${p.reopened_by}` : ""}: {p.reopen_reason}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3 border-t border-ims-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-t-small text-ims-muted">
          {!canClose ? "The Director of Finance closes the month." : !over ? "A month is closed after its last day." : !isNext && earlier ? `Close ${earlier.name} first — months are closed in order.` : blocking ? "The close button is available once every item above is cleared." : "Closing locks the month: nothing more can be posted to it."}
        </p>
        {canClose && over && (
          <Button variant="primary" icon={Lock} onClick={onClose} disabled={Boolean(blocking) || !isNext}>Close {p.name}</Button>
        )}
      </div>
    </>
  );
}

function ClosedMonth({ p, latest, laterClosed, pending, canAsk, onAsk }: { p: PeriodInfo; latest: boolean; laterClosed?: PeriodInfo; pending?: any; canAsk: boolean; onAsk: () => void }) {
  return (
    <>
      <Banner tone="success">
        Closed{p.closed_at ? ` ${fmtDateTime(p.closed_at)}` : ""}{p.closed_by ? ` by ${p.closed_by}` : ""}. No posting can be dated in this month.
      </Banner>
      {p.close_note && (
        <div className="mb-4">
          <p className="text-t-small text-ims-muted">Note when closing</p>
          <p className="mt-0.5 text-t-body text-ims-text">{p.close_note}</p>
        </div>
      )}
      {p.reopened_at && (
        <p className="mb-4 text-t-small text-ims-muted">
          Re-opened once before — {fmtDateTime(p.reopened_at)}{p.reopened_by ? ` by ${p.reopened_by}` : ""}: {p.reopen_reason}
        </p>
      )}
      {p.close_checklist?.length ? (
        <>
          <p className="mb-2 text-t-small font-semibold text-ims-muted">Checklist when it was closed</p>
          <Checklist items={p.close_checklist} live={false} />
        </>
      ) : null}
      <div className="mt-5 flex flex-col gap-3 border-t border-ims-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-t-small text-ims-muted">
          {pending ? (
            <>
              <TwoLine main={`${pending.number} asks to re-open it`} sub="Waiting for the Secretary General." />
            </>
          ) : !latest && laterClosed ? (
            `Months are re-opened from the latest one: ${laterClosed.name} first.`
          ) : canAsk ? (
            "If a correction must be dated in this month, ask the Secretary General to re-open it."
          ) : (
            "The Director of Finance or the Accountant can ask for the month to be re-opened."
          )}
        </p>
        {canAsk && latest && !pending && (
          <Button icon={Unlock} onClick={onAsk}>Ask to re-open</Button>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ dialogs
function CloseDialog({ p, onClose, onDone }: { p: PeriodInfo; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const warnings = (p.checklist || []).filter((i) => i.state === "warn");
  const go = async () => {
    setBusy(true);
    try {
      await ledgerApi.closePeriod(p.id, note.trim());
      notify.success(`${p.name} is closed.`);
      onDone();
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Close ${p.name}?`}
      description={`Nothing more can be posted between ${fmtDate(p.start)} and ${fmtDate(p.end)}. Re-opening it needs the Secretary General's approval.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon={Lock} loading={busy} onClick={go}>Close {p.name}</Button></>}
    >
      {warnings.length > 0 && (
        <div className="rounded-control bg-ims-warning-bg px-3.5 py-3 text-t-body text-ims-warning">
          <p className="font-semibold">Still to look at:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w) => <li key={w.key}>{w.detail || w.label}</li>)}
          </ul>
        </div>
      )}
      <Field label="Note" htmlFor="close-note" hint="Optional — kept with the month, e.g. what was explained or accepted.">
        <Textarea id="close-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-[88px]" />
      </Field>
    </Modal>
  );
}

function ReopenDialog({ p, onClose, onDone }: { p: PeriodInfo; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const short = reason.trim().length < 20;
  const go = async () => {
    setTouched(true);
    if (short) return;
    setBusy(true);
    try {
      const r = await ledgerApi.reopenPeriod(p.id, reason.trim());
      notify.success(`${r.number} sent to the Secretary General.`);
      onDone();
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Ask to re-open ${p.name}?`}
      description="The Secretary General decides. Once approved the month takes postings again, until the Director of Finance closes it."
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon={Unlock} loading={busy} onClick={go}>Send the request</Button></>}
    >
      <Field label="What must be corrected, and why" required htmlFor="reopen-reason" error={touched && short ? "Write at least 20 characters: the correction and the reason it must be dated in this month." : null}>
        <Textarea id="reopen-reason" autoFocus value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} invalid={touched && short} placeholder="e.g. The August electricity invoice was received late and must be accrued in August" />
      </Field>
    </Modal>
  );
}
