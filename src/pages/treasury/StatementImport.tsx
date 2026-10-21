/**
 * Bank statement import: upload the bank's Excel or CSV export, say which column is which (remembered per
 * account), check the lines and the balances, then import. The server re-checks everything, refuses
 * overlapping periods and matches the lines to the cash book automatically.
 */
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { ImportRow, treasuryApi } from "@/lib/treasury";
import { errorMessage } from "@/lib/procurement";
import { rwf, showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";

type Mapping = { header_row: number; date: string; value_date: string; description: string; reference: string; mode: "two" | "one"; amount_out: string; amount_in: string; amount: string; balance: string; date_format: "dmy" | "mdy" | "ymd" };
type Parsed = ImportRow & { n: number; errors: string[] };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, janv: 1, fev: 2, fév: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, août: 8 };
const pad = (n: number) => String(n).padStart(2, "0");
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const GUESS: Record<string, RegExp> = {
  date: /^(transaction |trans\.? |txn |posting |book(ing)? )?date$|^date/,
  value_date: /value/,
  description: /narrat|descr|detail|particular|libell|transaction$|remark/,
  reference: /ref|cheque|chq|doc/,
  amount_out: /debit|withdraw|money out|paid out|dr\b|retrait|débit/,
  amount_in: /credit|deposit|money in|paid in|cr\b|versement|crédit/,
  amount: /^amount|montant/,
  balance: /balance|solde/,
};
const BALANCE_ROW = /opening|closing|balance b\/?f|b\/f|c\/f|brought forward|carried forward|solde|^total/i;

function toDay(v: unknown, fmt: Mapping["date_format"]): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime() + 12 * 3600e3); // XLSX dates are local midnight, sometimes a few seconds early
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-zéû]{3,5})[a-z]*[-/. ,]+(\d{2,4})/);
  if (m) return valid(year(+m[3]), MONTHS[m[2].toLowerCase()] || 0, +m[1]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return fmt === "mdy" ? valid(year(+m[3]), +m[1], +m[2]) : valid(year(+m[3]), +m[2], +m[1]);
  return "";
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
function valid(y: number, mo: number, d: number) {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? dt.toISOString().slice(0, 10) : "";
}
/** "1,250,000", "(5,000)", "5,000-", "5 000 CR", 1250000 → number (NaN when not a number, 0 when empty). */
function toAmount(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s || s === "-") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/\bdr$/i.test(s)) { neg = true; s = s.replace(/dr$/i, ""); }
  s = s.replace(/cr$/i, "").replace(/rwf|frw/gi, "").replace(/[\s, ]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  const n = Number(s);
  return isNaN(n) ? NaN : neg ? -n : n;
}

export default function StatementImport({ account, onClose, onDone }: { account: any; onClose: () => void; onDone: (r: { id: string; number: string; lines: number; matched: number }) => void }) {
  const [step, setStep] = React.useState<"file" | "map" | "check" | "done">("file");
  const [file, setFile] = React.useState<File | null>(null);
  const [grid, setGrid] = React.useState<unknown[][]>([]);
  const [map, setMap] = React.useState<Mapping>({ header_row: 0, date: "", value_date: "", description: "", reference: "", mode: "two", amount_out: "", amount_in: "", amount: "", balance: "", date_format: "dmy" });
  const [opening, setOpening] = React.useState<string>("");
  const [closing, setClosing] = React.useState<string>("");
  const [period, setPeriod] = React.useState({ from: "", to: "" });
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [dragging, setDragging] = React.useState(false);

  const headers = (grid[map.header_row] || []).map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const col = (name: string) => headers.indexOf(name);

  async function read(f: File) {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return toast.error("Choose the Excel (.xlsx, .xls) or CSV file exported from the bank.");
    if (f.size > 10 * 1024 * 1024) return toast.error("The file is larger than 10 MB.");
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false });
    if (!rows.length) return toast.error("The file is empty.");
    // Header row: the first row (of the first 30) that names a date and an amount or balance column.
    let header = 0;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const cells = rows[i].map(norm);
      if (cells.some((c) => /date/.test(c)) && cells.some((c) => /debit|credit|amount|balance|montant|solde|withdraw|deposit/.test(c))) { header = i; break; }
    }
    setFile(f);
    setGrid(rows);
    const hs = (rows[header] || []).map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
    const saved = account.statement_mapping || {};
    const pick = (key: string) => (saved[key] && hs.includes(saved[key]) ? saved[key] : hs.find((h) => GUESS[key].test(norm(h)) && !(key === "date" && /value/.test(norm(h)))) || "");
    const next: Mapping = {
      header_row: header, date: pick("date"), value_date: pick("value_date"), description: pick("description"), reference: pick("reference"),
      amount_out: pick("amount_out"), amount_in: pick("amount_in"), amount: pick("amount"), balance: pick("balance"),
      mode: "two", date_format: saved.date_format || "dmy",
    };
    next.mode = next.amount_out || next.amount_in ? "two" : next.amount ? "one" : "two";
    if (next.value_date === next.date) next.value_date = "";
    setMap(next);
    setStep("map");
  }

  // Lines as the bank shows them, in date order (oldest first).
  const parsed: Parsed[] = React.useMemo(() => {
    if (step === "file") return [];
    const out: Parsed[] = [];
    const ix = { date: col(map.date), vd: col(map.value_date), desc: col(map.description), ref: col(map.reference), out: col(map.amount_out), in: col(map.amount_in), amt: col(map.amount), bal: col(map.balance) };
    grid.slice(map.header_row + 1).forEach((r, i) => {
      const cell = (k: number) => (k >= 0 ? r[k] : "");
      const description = String(cell(ix.desc) ?? "").trim();
      const reference = String(cell(ix.ref) ?? "").trim();
      let inn = 0;
      let outt = 0;
      let bad = false;
      if (map.mode === "two") {
        const a = toAmount(cell(ix.in));
        const b = toAmount(cell(ix.out));
        bad = isNaN(a) || isNaN(b);
        inn = Math.abs(a || 0);
        outt = Math.abs(b || 0);
      } else {
        const a = toAmount(cell(ix.amt));
        bad = isNaN(a);
        if (a > 0) inn = a;
        else outt = Math.abs(a || 0);
      }
      const rawDate = cell(ix.date);
      const date = toDay(rawDate, map.date_format);
      const balRaw = cell(ix.bal);
      const balance = ix.bal >= 0 && String(balRaw ?? "").trim() !== "" ? toAmount(balRaw) : null;
      if (!String(rawDate ?? "").trim() && !inn && !outt) return; // blank or footer row
      if (!inn && !outt && BALANCE_ROW.test(description)) return; // "Opening balance", "Total"…
      const errors: string[] = [];
      if (!date) errors.push(`date "${String(rawDate)}" not understood`);
      if (bad) errors.push("amount not a number");
      else if (!inn && !outt) errors.push("no amount");
      else if (inn && outt) errors.push("both money in and money out");
      if (!description && !reference) errors.push("no description");
      out.push({ n: map.header_row + 2 + i, date, value_date: toDay(cell(ix.vd), map.date_format), description, reference, amount_in: Math.round(inn), amount_out: Math.round(outt), balance: balance === null || isNaN(balance) ? null : Math.round(balance), errors });
    });
    const dated = out.filter((r) => r.date);
    if (dated.length > 1 && dated[0].date > dated[dated.length - 1].date) out.reverse(); // newest first in the file
    return out;
  }, [grid, map, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const bad = parsed.filter((r) => r.errors.length);
  const good = parsed.filter((r) => !r.errors.length);
  const totalIn = good.reduce((s, r) => s + r.amount_in, 0);
  const totalOut = good.reduce((s, r) => s + r.amount_out, 0);
  const withBal = good.length > 0 && good.every((r) => r.balance !== null && r.balance !== undefined);
  const derivedOpening = withBal ? (good[0].balance as number) - good[0].amount_in + good[0].amount_out : null;
  const openingN = opening.trim() === "" ? derivedOpening : Number(opening.replace(/[\s,]/g, ""));
  const computedClosing = openingN === null || isNaN(openingN) ? null : openingN + totalIn - totalOut;
  const statedClosing = closing.trim() === "" ? (withBal ? (good[good.length - 1].balance as number) : null) : Number(closing.replace(/[\s,]/g, ""));
  const runBreak = React.useMemo(() => {
    if (!withBal || openingN === null) return null;
    let run = openingN;
    for (const r of good) {
      run += r.amount_in - r.amount_out;
      if (r.balance !== run) return r;
    }
    return null;
  }, [good, withBal, openingN]);
  const dates = good.map((r) => r.date).sort();
  React.useEffect(() => {
    if (step !== "check") return;
    // A statement normally starts the day after the previous one (or on the opening date for the first one).
    const start = account.statement_date ? new Date(Date.parse(`${String(account.statement_date).slice(0, 10)}T12:00:00Z`) + 864e5).toISOString().slice(0, 10) : String(account.opening_date || "").slice(0, 10);
    setPeriod({ from: start && dates[0] && start <= dates[0] ? start : dates[0] || "", to: dates[dates.length - 1] || "" });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapOk = map.date && map.description && (map.mode === "two" ? map.amount_in || map.amount_out : map.amount);
  const balancesAgree = computedClosing !== null && (statedClosing === null || statedClosing === computedClosing) && !runBreak;
  const canImport = good.length > 0 && !bad.length && openingN !== null && !isNaN(openingN) && balancesAgree && period.from && period.to && period.from <= period.to;

  async function doImport() {
    setBusy(true);
    try {
      const r = await treasuryApi.importStatement({
        account: account.id, rows: good.map(({ n, errors, ...x }) => x), opening_balance: openingN, closing_balance: statedClosing ?? undefined,
        statement_from: period.from, statement_to: period.to, file_name: file?.name || "",
        mapping: { date: map.date, value_date: map.value_date, description: map.description, reference: map.reference, amount_in: map.mode === "two" ? map.amount_in : "", amount_out: map.mode === "two" ? map.amount_out : "", amount: map.mode === "one" ? map.amount : "", balance: map.balance, date_format: map.date_format, header_row: map.header_row },
      });
      if (file) {
        const fd = new FormData();
        fd.append("files", file);
        await pocketbase.send(`/api/ims/attachments/bank_statements/${r.id}`, { method: "POST", body: fd }).catch(() => null);
      }
      setResult(r);
      setStep("done");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function template() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date", "Description", "Reference", "Money out", "Money in", "Balance"],
      ["01/10/2026", "Opening balance", "", "", "", 1250000000],
      ["02/10/2026", "CR TRF GASABO DISTRICT CONTRIBUTION", "GSB-CONTR-2627", "", 42000000, 1292000000],
      ["03/10/2026", "DR TRF KIGALI OFFICE SOLUTIONS LTD", "BK-TRF-482911", 1534000, "", 1290466000],
      ["31/10/2026", "ACCOUNT MAINTENANCE FEE", "FEE-202610", 10000, "", 1290456000],
    ]);
    ws["!cols"] = [{ wch: 12 }, { wch: 44 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, "bank-statement-template.xlsx");
  }

  const sel = (key: keyof Mapping, label: string, required?: boolean, hint?: string) => (
    <Field label={label} required={required} hint={hint} htmlFor={`map-${key}`}>
      <select id={`map-${key}`} className={inputCls} value={map[key] as string} onChange={(e) => setMap({ ...map, [key]: e.target.value })}>
        <option value="">{required ? "Choose the column…" : "Not in the file"}</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col gap-0 bg-white p-0 sm:h-auto sm:max-h-[94vh] sm:rounded-xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primaryDark"><FileSpreadsheet size={19} /></span>
            <div className="min-w-0">
              <DialogTitle className="text-[16px]">Import bank statement · {account.code}</DialogTitle>
              <DialogDescription className="text-[12.5px]">{account.bank_name} · {account.account_number}{account.statement_date ? ` · imported up to ${showDay(account.statement_date)}` : ""}</DialogDescription>
            </div>
          </div>
          <ol className="mt-3 flex gap-1.5 text-[11.5px] font-medium" aria-label="Steps">
            {[["file", "1 File"], ["map", "2 Columns"], ["check", "3 Check"], ["done", "4 Done"]].map(([k, l]) => (
              <li key={k} className={cn("rounded-full px-2.5 py-0.5", step === k ? "bg-primary text-white" : "bg-slate-100 text-slate-500")}>{l}</li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {step === "file" && (
            <div className="space-y-4">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) read(f); }}
                className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center", dragging ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300")}
              >
                <Upload size={24} className="text-slate-400" />
                <span className="text-[14px] font-medium text-slate-800">Choose the statement file or drop it here</span>
                <span className="text-[12.5px] text-slate-500">Excel (.xlsx, .xls) or CSV, as downloaded from the bank's internet banking</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-600">
                <span>Only a PDF statement? Type its lines into the template and import that.</span>
                <Button size="sm" variant="outline" onClick={template}><Download size={14} /> Statement template</Button>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-slate-500">
                <li>One statement at a time; periods already imported for this account are refused.</li>
                <li>The lines must add up: opening balance + money in − money out = closing balance.</li>
                <li>Lines are matched to the cash book automatically (same amount within {7} days, the reference first).</li>
              </ul>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-5">
              <p className="text-[13px] text-slate-600"><span className="font-medium text-slate-900">{file?.name}</span> · {grid.length} rows. Say which column holds what{account.statement_mapping?.date ? " (remembered from the last import)" : ""}.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Header row" htmlFor="map-header" hint="The row with the column names">
                  <select id="map-header" className={inputCls} value={map.header_row} onChange={(e) => setMap({ ...map, header_row: Number(e.target.value) })}>
                    {grid.slice(0, 30).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter((c) => String(c ?? "").trim()).slice(0, 4).join(" | ").slice(0, 60)}</option>)}
                  </select>
                </Field>
                {sel("date", "Date", true)}
                <Field label="Dates are written" htmlFor="map-dfmt" hint="Only for dates typed as text">
                  <select id="map-dfmt" className={inputCls} value={map.date_format} onChange={(e) => setMap({ ...map, date_format: e.target.value as Mapping["date_format"] })}>
                    <option value="dmy">Day/month/year (31/10/2026)</option>
                    <option value="mdy">Month/day/year (10/31/2026)</option>
                    <option value="ymd">Year-month-day (2026-10-31)</option>
                  </select>
                </Field>
                {sel("description", "Description / narrative", true)}
                {sel("reference", "Reference", false, "Cheque or transfer reference — best for matching")}
                {sel("value_date", "Value date")}
                <Field label="Amounts" htmlFor="map-mode">
                  <select id="map-mode" className={inputCls} value={map.mode} onChange={(e) => setMap({ ...map, mode: e.target.value as Mapping["mode"] })}>
                    <option value="two">Two columns: money out and money in</option>
                    <option value="one">One column: negative = money out</option>
                  </select>
                </Field>
                {map.mode === "two" ? <>{sel("amount_out", "Money out (debit)", true)}{sel("amount_in", "Money in (credit)", true)}</> : sel("amount", "Amount", true)}
                {sel("balance", "Running balance", false, "Lets the system check every line")}
              </div>
              {mapOk && (
                <div className="overflow-x-auto rounded-md border border-slate-100">
                  <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[12px] font-medium text-slate-600">First lines as read</p>
                  <table className="dnr-grid w-full min-w-[640px]">
                    <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Money out</th><th className="text-right">Money in</th><th className="text-right">Balance</th></tr></thead>
                    <tbody>{parsed.slice(0, 6).map((r) => <PreviewRow key={r.n} r={r} />)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {step === "check" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Lines" value={good.length} sub={bad.length ? `${bad.length} with problems` : "All readable"} tone={bad.length ? "bad" : "ok"} />
                <Tile label="Money in" value={rwf(totalIn)} sub={`${good.filter((r) => r.amount_in).length} credits`} />
                <Tile label="Money out" value={rwf(totalOut)} sub={`${good.filter((r) => r.amount_out).length} debits`} />
                <Tile label="Closing balance" value={computedClosing === null ? "—" : rwf(computedClosing)} sub={balancesAgree ? "Agrees with the statement" : "Does not agree"} tone={balancesAgree ? "ok" : "bad"} />
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Statement from" required htmlFor="st-from"><input id="st-from" type="date" className={inputCls} value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></Field>
                <Field label="Statement to" required htmlFor="st-to"><input id="st-to" type="date" className={inputCls} value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></Field>
                <Field label="Opening balance" required htmlFor="st-open" hint={derivedOpening !== null ? `From the balance column: ${derivedOpening.toLocaleString("en-US")}` : "As printed on the statement"}>
                  <input id="st-open" inputMode="numeric" className={cn(inputCls, "text-right tabular-nums")} value={opening} placeholder={derivedOpening !== null ? derivedOpening.toLocaleString("en-US") : ""} onChange={(e) => setOpening(e.target.value)} />
                </Field>
                <Field label="Closing balance on the statement" htmlFor="st-close" hint={withBal ? "From the balance column" : "Optional, but recommended"}>
                  <input id="st-close" inputMode="numeric" className={cn(inputCls, "text-right tabular-nums")} value={closing} placeholder={statedClosing !== null ? statedClosing.toLocaleString("en-US") : ""} onChange={(e) => setClosing(e.target.value)} />
                </Field>
              </div>
              {runBreak && <Problem text={`Line ${runBreak.n} (${showDay(runBreak.date)}): the balance ${Number(runBreak.balance).toLocaleString("en-US")} does not follow from the lines before it. Check the money in / money out columns.`} />}
              {!runBreak && computedClosing !== null && statedClosing !== null && statedClosing !== computedClosing && <Problem text={`The lines add up to ${rwf(computedClosing)} but the statement shows ${rwf(statedClosing)} (difference ${rwf(statedClosing - computedClosing)}): a line is missing or was read wrongly.`} />}
              {bad.length > 0 && <Problem text={`${bad.length} line${bad.length === 1 ? "" : "s"} could not be read — fix the mapping (step 2) or the file. Lines with problems are shown first below.`} />}
              <div className="overflow-x-auto rounded-md border border-slate-100">
                <table className="dnr-grid w-full min-w-[700px]">
                  <thead><tr><th>Row</th><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Money out</th><th className="text-right">Money in</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>{[...bad, ...good].slice(0, 300).map((r) => <PreviewRow key={r.n} r={r} showRow />)}</tbody>
                </table>
                {parsed.length > 300 && <p className="px-3 py-2 text-[12px] text-slate-500">… and {parsed.length - 300} more lines.</p>}
              </div>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-4 py-4 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
              <div>
                <p className="text-[17px] font-semibold text-slate-900">{result.number} imported</p>
                <p className="text-[13px] text-slate-600">{result.lines} lines · {result.matched} matched to the cash book automatically{result.ambiguous ? ` · ${result.ambiguous} with several possible matches` : ""}</p>
              </div>
              {result.warnings?.length > 0 && <div className="mx-auto max-w-xl text-left">{result.warnings.map((w: string) => <Problem key={w} text={w} tone="warn" />)}</div>}
              <p className="text-[12.5px] text-slate-500">Match what is left on the reconciliation screen, record bank charges, then prepare the reconciliation.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
          {step === "map" && <><Button variant="outline" onClick={() => setStep("file")}>Another file</Button><Button disabled={!mapOk} onClick={() => setStep("check")}>Check the lines</Button></>}
          {step === "check" && <><Button variant="outline" onClick={() => setStep("map")}>Back to columns</Button><Button disabled={!canImport || busy} onClick={doImport}>{busy ? "Importing…" : `Import ${good.length} lines`}</Button></>}
          {step === "done" && <Button onClick={() => onDone(result)}>Done</Button>}
          {step === "file" && <Button variant="outline" onClick={onClose}>Cancel</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({ r, showRow }: { r: Parsed; showRow?: boolean }) {
  const err = r.errors.length > 0;
  return (
    <tr className={cn(err && "bg-red-50/70")}>
      {showRow && <td className="text-[12px] text-slate-500">{r.n}</td>}
      <td className="whitespace-nowrap text-[12.5px]">{r.date ? showDay(r.date) : <span className="text-red-600">?</span>}</td>
      <td className="max-w-[320px] text-[12.5px]"><span className="line-clamp-1">{r.description}</span>{err && <span className="block text-[11.5px] font-medium text-red-600">{r.errors.join(", ")}</span>}</td>
      <td className="whitespace-nowrap font-mono text-[12px] text-slate-500">{r.reference}</td>
      <td className="whitespace-nowrap text-right tabular-nums">{r.amount_out ? r.amount_out.toLocaleString("en-US") : ""}</td>
      <td className="whitespace-nowrap text-right tabular-nums text-emerald-700">{r.amount_in ? r.amount_in.toLocaleString("en-US") : ""}</td>
      <td className="whitespace-nowrap text-right tabular-nums text-slate-500">{r.balance !== null && r.balance !== undefined ? r.balance.toLocaleString("en-US") : ""}</td>
    </tr>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-[11.5px] text-slate-500">{label}</p>
      <p className="text-[16px] font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className={cn("flex items-center gap-1 text-[11.5px]", tone === "bad" ? "text-red-600" : tone === "ok" ? "text-emerald-700" : "text-slate-400")}>{tone === "bad" ? <XCircle size={12} /> : tone === "ok" ? <CheckCircle2 size={12} /> : null}{sub}</p>}
    </div>
  );
}

function Problem({ text, tone = "bad" }: { text: string; tone?: "bad" | "warn" }) {
  return (
    <p className={cn("mb-2 flex items-start gap-2 rounded-md border px-3 py-2 text-left text-[12.5px]", tone === "bad" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {text}
    </p>
  );
}
