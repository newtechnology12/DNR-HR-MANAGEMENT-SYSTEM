/// <reference path="../../pb_data/types.d.ts" />
/**
 * General ledger (M8): manual journals (the Accountant prepares, the DAF approves — never the preparer), recurring
 * journals, reversals, the trial balance, the account ledger and the monthly period close (checklist, closed by the
 * DAF, re-opened only with the Secretary General's approval). Operational postings come from lib/glpost.js and the
 * payroll and asset modules; the posting core is lib/ledger.js.
 */
const core = require("./core.js");
const ledger = require("./ledger.js");

const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const r0 = (n) => Math.round(Number(n) || 0);
const day = (v) => String(v || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const showDay = (d) => (d ? `${parseInt(d.slice(8, 10), 10)} ${MONTHS[parseInt(d.slice(5, 7), 10) - 1].slice(0, 3)} ${d.slice(0, 4)}` : "");

// ledger detail is for the finance team, the auditors and the SG (who decides re-openings); not for view_financial_reports
const VIEW = ["view_journals", "manage_journals", "approve_journals", "export_ledger", "close_periods", "reopen_periods"];
const OPEN = ["draft", "returned"];

function requireAny(dao, auth, perms, what) {
  if (!auth) throw new UnauthorizedError("Please sign in again.");
  if (!perms.some((p) => core.can(dao, auth, p))) throw new ForbiddenError(`You don't have permission to ${what}. Ask an administrator to grant "${perms[0]}" to your role.`);
}
function find(dao, collection, id) {
  if (!id) return null;
  try {
    return dao.findRecordById(collection, String(id));
  } catch (_) {
    return null;
  }
}
function load(dao, collection, id, what) {
  const r = find(dao, collection, id);
  if (!r) throw new NotFoundError(`${what} not found.`);
  return r;
}
const nameOf = (dao, collection, id, field) => {
  const r = find(dao, collection, id);
  return r ? r.getString(field || "name") : "";
};

// ------------------------------------------------------------------ manual journals
const DIMS = [["department", "departments", "Department"], ["funding_source", "funding_sources", "Funding source"], ["project", "projects", "Project"], ["budget_line", "budget_lines", "Budget line"]];

/** Lines of a manual journal: posting accounts only (no bank or control accounts), balanced. */
function cleanLines(dao, raw) {
  if (!Array.isArray(raw) || raw.length < 2) throw new BadRequestError("A journal needs at least two lines.");
  if (raw.length > 200) throw new BadRequestError("A journal has at most 200 lines.");
  const accounts = {};
  const lines = raw.map((x, i) => {
    const row = i + 1;
    const id = String((x && x.account) || "");
    const a = accounts[id] || (accounts[id] = find(dao, "gl_accounts", id));
    if (!a) throw new BadRequestError(`Line ${row}: choose the account.`);
    const label = `${a.getString("code")} ${a.getString("name")}`;
    if (!a.getBool("is_posting") || !a.getBool("active")) throw new BadRequestError(`Line ${row}: ${label} is not an active posting account.`);
    if (a.getString("cash_flow_class") === "cash") throw new BadRequestError(`Line ${row}: ${label} is a bank or cash account — money in or out of it is recorded as a receipt, a payment or a transfer, so the cash book and the ledger stay the same.`);
    if (a.getBool("is_control")) throw new BadRequestError(`Line ${row}: ${label} is a control account kept by its module (supplier invoices, member contributions); it is not posted by hand.`);
    const debit = r0(x.debit);
    const credit = r0(x.credit);
    if (debit < 0 || credit < 0) throw new BadRequestError(`Line ${row}: amounts are positive; put them in the other column instead.`);
    if (debit && credit) throw new BadRequestError(`Line ${row}: a line is a debit or a credit, not both.`);
    if (!debit && !credit) throw new BadRequestError(`Line ${row}: enter the amount.`);
    const out = { account: a.id, debit, credit, description: String(x.description || "").trim().slice(0, 300) };
    for (const [k, col, what] of DIMS) {
      const v = String(x[k] || "");
      if (v && !find(dao, col, v)) throw new BadRequestError(`Line ${row}: ${what} not found.`);
      out[k] = v;
    }
    return out;
  });
  const dr = lines.reduce((t, l) => t + l.debit, 0);
  const cr = lines.reduce((t, l) => t + l.credit, 0);
  if (dr !== cr) throw new BadRequestError(`The journal does not balance: debits ${num(dr)}, credits ${num(cr)} (difference ${num(Math.abs(dr - cr))}).`);
  return { lines, total: dr };
}

function linesOf(dao, j) {
  return dao.findRecordsByFilter("gl_journal_lines", "journal = {:j}", "line_no", 0, 0, { j: j.id }) || [];
}

function writeLines(dao, j, lines, status) {
  for (const l of linesOf(dao, j)) dao.deleteRecord(l);
  const col = dao.findCollectionByNameOrId("gl_journal_lines");
  lines.forEach((l, i) => {
    const r = new Record(col);
    r.set("journal", j.id);
    r.set("line_no", i + 1);
    r.set("account", l.account);
    r.set("debit", l.debit);
    r.set("credit", l.credit);
    r.set("description", l.description || j.getString("description").slice(0, 300));
    for (const [k] of DIMS) r.set(k, l[k] || "");
    r.set("date", j.getString("date"));
    r.set("fiscal_year", j.getString("fiscal_year"));
    r.set("period", j.getString("period"));
    r.set("source_type", j.getString("journal_type"));
    r.set("status", status);
    dao.saveRecord(r);
  });
}

/** Creates or updates a draft manual journal. */
function saveJournal(dao, auth, input, existing, meta) {
  core.requirePermission(dao, auth, "manage_journals", "prepare journals");
  const j = existing || new Record(dao.findCollectionByNameOrId("gl_journals"));
  if (existing) {
    if (OPEN.indexOf(j.getString("status")) === -1) throw new BadRequestError(`${j.getString("number")} is ${j.getString("status").replace(/_/g, " ")}; only drafts and returned journals are changed.`);
    if (["manual", "recurring"].indexOf(j.getString("journal_type")) === -1) throw new BadRequestError("Automatic journals are never edited.");
  }
  const d = day(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestError("Give the date of the journal.");
  const period = require("./masterdata.js").periodFor(dao, noon(d));
  if (!period) throw new BadRequestError(`No fiscal period covers ${showDay(d)}.`);
  const description = String(input.description || "").trim();
  if (description.length < 5) throw new BadRequestError("Describe the journal (at least 5 characters): what it records and why.");
  const { lines, total } = cleanLines(dao, input.lines);
  if (!existing) {
    j.set("number", core.nextNumber(dao, "journal_entry"));
    j.set("journal_type", input.journal_type === "recurring" ? "recurring" : "manual");
    j.set("status", "draft");
    j.set("prepared_by", auth.id);
    j.set("created_by", auth.id);
    j.set("source_type", "manual");
    j.set("recurring", input.recurring || "");
  }
  j.set("date", noon(d));
  j.set("fiscal_year", period.getString("fiscal_year"));
  j.set("period", period.id);
  j.set("description", description.slice(0, 500));
  j.set("total_debit", total);
  j.set("total_credit", total);
  j.set("line_count", lines.length);
  dao.saveRecord(j);
  writeLines(dao, j, lines, "draft");
  core.audit(dao, { actor: auth, action: existing ? "updated" : "created", collection: "gl_journals", recordId: j.id, label: j.getString("number"), comment: `${description} · ${num(total)}`.slice(0, 300), meta });
  return j;
}

function submitJournal(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "manage_journals", "submit journals");
  const j = load(dao, "gl_journals", id, "Journal");
  if (OPEN.indexOf(j.getString("status")) === -1) throw new BadRequestError(`${j.getString("number")} is ${j.getString("status").replace(/_/g, " ")}.`);
  require("./masterdata.js").requireOpenPeriod(dao, j.getString("date"), `journal ${j.getString("number")}`);
  cleanLines(dao, linesOf(dao, j).map(lineJson));
  return require("./approvals.js").start(dao, "journal_entry", j, auth, meta);
}

const lineJson = (l) => ({ account: l.getString("account"), debit: l.getInt("debit"), credit: l.getInt("credit"), description: l.getString("description"), department: l.getString("department"), funding_source: l.getString("funding_source"), project: l.getString("project"), budget_line: l.getString("budget_line") });

/** Final approval: the journal is posted (the engine already set its status). */
function onJournalApproved(dao, j, actor, meta) {
  require("./masterdata.js").requireOpenPeriod(dao, j.getString("date"), `journal ${j.getString("number")}`);
  const lines = linesOf(dao, j);
  const { total } = cleanLines(dao, lines.map(lineJson));
  for (const l of lines) {
    l.set("status", "posted");
    dao.saveRecord(l);
  }
  j.set("status", "posted");
  j.set("total_debit", total);
  j.set("total_credit", total);
  j.set("posted_by", actor ? actor.id : "");
  j.set("posted_at", new Date().toISOString());
  dao.saveRecord(j);
  core.audit(dao, { actor, action: "journal_posted", collection: "gl_journals", recordId: j.id, label: j.getString("number"), comment: j.getString("description").slice(0, 300), meta });
  core.notify(dao, [j.getString("prepared_by")].filter((x) => x && (!actor || x !== actor.id)), { title: `${j.getString("number")} posted`, body: j.getString("description"), link: `/dashboard/finance/journals/${j.id}`, type: "success" });
}

/** Rejected or returned: the lines stay out of the ledger (status draft). */
function onJournalClosed(dao, j) {
  for (const l of linesOf(dao, j)) {
    if (l.getString("status") !== "draft") {
      l.set("status", "draft");
      dao.saveRecord(l);
    }
  }
}

function cancelJournal(dao, auth, id, input, meta) {
  requireAny(dao, auth, ["manage_journals", "approve_journals"], "cancel journals");
  const j = load(dao, "gl_journals", id, "Journal");
  if (["draft", "returned", "pending_approval"].indexOf(j.getString("status")) === -1) throw new BadRequestError(`${j.getString("number")} is ${j.getString("status").replace(/_/g, " ")}; posted journals are reversed, not cancelled.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason for cancelling.");
  for (const l of linesOf(dao, j)) {
    l.set("status", "cancelled");
    dao.saveRecord(l);
  }
  if (j.getString("approval")) {
    require("./approvals.js").cancel(dao, "journal_entry", j, auth, reason.slice(0, 500), meta);
    return j;
  }
  j.set("status", "cancelled");
  j.set("cancel_reason", reason.slice(0, 500));
  dao.saveRecord(j);
  core.audit(dao, { actor: auth, action: "cancelled", collection: "gl_journals", recordId: j.id, label: j.getString("number"), comment: reason, meta });
  return j;
}

const SOURCE_LABEL = { payroll: "the payroll", payroll_payment: "the payroll", payment_voucher: "the payment voucher", supplier_invoice: "the supplier invoice", cash_receipt: "the receipt", bank_transfer: "the transfer", statement_line: "the bank statement line", depreciation_run: "the depreciation run", asset_disposal: "the disposal", asset: "the asset", asset_opening: "the opening register", bank_opening: "the bank account", staff_expense: "the staff expense" };

/** A posted manual journal is corrected by a reversal (the DAF). Automatic journals are reversed from their document. */
function reverseJournal(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "approve_journals", "reverse journals");
  const j = load(dao, "gl_journals", id, "Journal");
  if (j.getString("status") !== "posted") throw new BadRequestError(`${j.getString("number")} is ${j.getString("status").replace(/_/g, " ")}; only a posted journal is reversed.`);
  if (["manual", "recurring"].indexOf(j.getString("journal_type")) === -1) {
    throw new BadRequestError(`${j.getString("number")} was posted by ${SOURCE_LABEL[j.getString("source_type")] || "its module"}${j.getString("source_number") ? ` ${j.getString("source_number")}` : ""}; correct it there (cancel or reverse the document), so the document and the ledger agree.`);
  }
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new BadRequestError("Explain the reversal (at least 10 characters).");
  const d = day(input.date) || todayStr();
  if (d < day(j.getString("date"))) throw new BadRequestError("A reversal cannot be dated before the journal it reverses.");
  return ledger.reverse(dao, j.id, auth, reason, d, meta);
}

// ------------------------------------------------------------------ recurring journals
const FREQ = { monthly: 1, quarterly: 3, yearly: 12 };
const ymd = (y, m, d) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};
/** First date on or after `from` falling on the template's day of the month. */
function firstOn(from, dom) {
  const y = parseInt(from.slice(0, 4), 10);
  const m = parseInt(from.slice(5, 7), 10);
  const same = ymd(y, m, dom);
  if (same >= from) return same;
  return m === 12 ? ymd(y + 1, 1, dom) : ymd(y, m + 1, dom);
}
function advance(d, freq, dom) {
  let y = parseInt(d.slice(0, 4), 10);
  let m = parseInt(d.slice(5, 7), 10) + FREQ[freq];
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return ymd(y, m, dom);
}

function saveRecurring(dao, auth, input, existingId, meta) {
  core.requirePermission(dao, auth, "manage_journals", "set up recurring journals");
  const t = existingId ? load(dao, "gl_recurring_journals", existingId, "Recurring journal") : new Record(dao.findCollectionByNameOrId("gl_recurring_journals"));
  const name = String(input.name || "").trim();
  if (name.length < 3) throw new BadRequestError("Name the recurring journal, e.g. \"Monthly rent of the regional office\".");
  const freq = String(input.frequency || "monthly");
  if (!FREQ[freq]) throw new BadRequestError("Choose how often it recurs.");
  const dom = parseInt(input.day_of_month, 10);
  if (!(dom >= 1 && dom <= 28)) throw new BadRequestError("Choose the day of the month (1 to 28).");
  const start = day(input.start_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new BadRequestError("Give the first date.");
  const end = day(input.end_date);
  if (end && end < start) throw new BadRequestError("The end date is before the first date.");
  const { lines, total } = cleanLines(dao, input.lines);
  const changed = !existingId || day(t.getString("start_date")) !== start || t.getInt("day_of_month") !== dom || t.getString("frequency") !== freq;
  t.set("name", name.slice(0, 160));
  t.set("description", String(input.description || "").trim().slice(0, 500));
  t.set("frequency", freq);
  t.set("day_of_month", dom);
  t.set("start_date", noon(start));
  t.set("end_date", end ? noon(end) : "");
  if (changed) {
    const last = day(t.getString("last_generated"));
    t.set("next_date", noon(firstOn(last && last >= start ? advance(last, freq, dom) : start, dom)));
  }
  t.set("lines", lines);
  t.set("total", total);
  t.set("active", input.active !== false);
  if (!existingId) t.set("created_by", auth.id);
  dao.saveRecord(t);
  core.audit(dao, { actor: auth, action: existingId ? "updated" : "created", collection: "gl_recurring_journals", recordId: t.id, label: name, comment: `${freq} · ${num(total)}`, meta });
  return t;
}

const periodName = (d) => `${MONTHS[parseInt(d.slice(5, 7), 10) - 1]} ${d.slice(0, 4)}`;

/** Journals due from the recurring templates, sent to the DAF for approval (one per occurrence, at most 12). */
function generateDue(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "manage_journals", "generate recurring journals");
  const today = todayStr();
  const filter = input && input.id ? "id = {:id}" : "active = true";
  const templates = dao.findRecordsByFilter("gl_recurring_journals", filter, "next_date", 0, 0, input && input.id ? { id: input.id } : {}) || [];
  const created = [];
  const problems = [];
  for (const t of templates) {
    if (!t.getBool("active")) continue;
    let next = day(t.getString("next_date"));
    const end = day(t.getString("end_date"));
    let n = 0;
    while (next && next <= today && (!end || next <= end) && n < 12) {
      let j = null;
      try {
        // checked first so a closed month creates nothing (no draft, no number used)
        require("./masterdata.js").requireOpenPeriod(dao, noon(next), `${t.getString("name")} of ${showDay(next)}`);
        j = saveJournal(dao, auth, { date: next, description: `${t.getString("name")} — ${periodName(next)}`, lines: core.parseJson(t, "lines", []), journal_type: "recurring", recurring: t.id }, null, meta);
        submitJournal(dao, auth, j.id, meta);
        created.push({ id: j.id, number: j.getString("number"), date: next, template: t.getString("name") });
        t.set("last_journal", j.id);
        t.set("last_generated", noon(next));
      } catch (e) {
        const why = e && e.message ? e.message : String(e);
        // a draft made before the failure would be generated again next time: remove it
        if (j) {
          for (const l of linesOf(dao, j)) dao.deleteRecord(l);
          dao.deleteRecord(dao.findRecordById("gl_journals", j.id));
          core.audit(dao, { actor: auth, action: "deleted", collection: "gl_journals", recordId: j.id, label: j.getString("number"), comment: `Not generated: ${why}`.slice(0, 300), meta });
        }
        problems.push(`${t.getString("name")} (${showDay(next)}): ${why}`);
        break;
      }
      next = advance(next, t.getString("frequency"), t.getInt("day_of_month"));
      n++;
    }
    t.set("next_date", next ? noon(next) : "");
    if (end && next > end) t.set("active", false);
    dao.saveRecord(t);
  }
  return { created, problems };
}

// ------------------------------------------------------------------ trial balance and account ledger
/** First day of the fiscal year a date falls in. */
function fyStartOf(dao, d) {
  const fy = (dao.findRecordsByFilter("fiscal_years", "start_date <= {:d} && end_date >= {:d}", "", 1, 0, { d: noon(d) }) || [])[0];
  if (fy) return day(fy.getString("start_date"));
  const start = require("./masterdata.js").fiscalStartMonth(dao) || 7;
  const y = parseInt(d.slice(0, 4), 10);
  const m = parseInt(d.slice(5, 7), 10);
  return `${m >= start ? y : y - 1}-${String(start).padStart(2, "0")}-01`;
}

const PL = ["revenue", "expense"];
function dimWhere(f, prefix) {
  const parts = [];
  const params = {};
  for (const k of ["department", "funding_source", "project"]) {
    if (f[k]) {
      parts.push(`${prefix}${k} = {:${k}}`);
      params[k] = f[k];
    }
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

/**
 * Trial balance from `from` to `to`: opening balance, debits, credits and closing balance per account. Revenue and
 * expense accounts start each fiscal year at nil; earlier years' surplus is in the accumulated surplus' opening.
 */
function trialBalance(dao, auth, f) {
  requireAny(dao, auth, VIEW, "see the trial balance");
  const to = day(f.to) || todayStr();
  const from = day(f.from) || fyStartOf(dao, to);
  if (from > to) throw new BadRequestError("The start date is after the end date.");
  const fy = fyStartOf(dao, from);
  const w = dimWhere(f, "l.");
  const rows = arrayOf(new DynamicModel({ account: "", type: "", ob: 0, py: 0, dr: 0, cr: 0 }));
  dao.db().newQuery(`
    SELECT l.account AS account, a.type AS type,
      COALESCE(SUM(CASE WHEN l.date < {:from} AND (a.type NOT IN ('revenue','expense') OR l.date >= {:fy}) THEN l.debit - l.credit ELSE 0 END), 0) AS ob,
      COALESCE(SUM(CASE WHEN l.date < {:fy} AND a.type IN ('revenue','expense') THEN l.credit - l.debit ELSE 0 END), 0) AS py,
      COALESCE(SUM(CASE WHEN l.date >= {:from} THEN l.debit ELSE 0 END), 0) AS dr,
      COALESCE(SUM(CASE WHEN l.date >= {:from} THEN l.credit ELSE 0 END), 0) AS cr
    FROM gl_journal_lines l JOIN gl_accounts a ON a.id = l.account
    WHERE l.date <= {:to} AND (l.status = 'posted' OR l.status = 'reversed')${w.sql}
    GROUP BY l.account, a.type`).bind(Object.assign({ from: `${from} 00:00:00.000Z`, to: `${to} 23:59:59.999Z`, fy: `${fy} 00:00:00.000Z` }, w.params)).all(rows);
  const accounts = {};
  for (const a of dao.findRecordsByFilter("gl_accounts", "id != ''", "code", 0, 0) || []) accounts[a.id] = a;
  // earlier years' surplus belongs to the accumulated surplus account
  const py = rows.reduce((t, x) => t + r0(x.py), 0);
  let surplusId = "";
  try {
    surplusId = ledger.accountFor(dao, "treasury.opening_equity").id;
  } catch (_) {}
  const out = [];
  const byId = {};
  for (const x of rows) {
    const a = accounts[x.account];
    if (!a) continue;
    const r = { account: a.id, code: a.getString("code"), name: a.getString("name"), type: a.getString("type"), section: a.getString("statement_section"), opening: r0(x.ob), debit: r0(x.dr), credit: r0(x.cr) };
    byId[a.id] = r;
    out.push(r);
  }
  if (py && surplusId) {
    if (!byId[surplusId]) {
      const a = accounts[surplusId];
      byId[surplusId] = { account: surplusId, code: a.getString("code"), name: a.getString("name"), type: a.getString("type"), section: a.getString("statement_section"), opening: 0, debit: 0, credit: 0 };
      out.push(byId[surplusId]);
    }
    byId[surplusId].opening -= py;
  }
  const shown = out.filter((r) => r.opening || r.debit || r.credit).map((r) => {
    const closing = r.opening + r.debit - r.credit;
    return Object.assign(r, { closing, opening_dr: Math.max(r.opening, 0), opening_cr: Math.max(-r.opening, 0), closing_dr: Math.max(closing, 0), closing_cr: Math.max(-closing, 0) });
  }).sort((p, q) => (p.code < q.code ? -1 : p.code > q.code ? 1 : 0));
  const sum = (k) => shown.reduce((t, r) => t + r[k], 0);
  const totals = { opening_dr: sum("opening_dr"), opening_cr: sum("opening_cr"), debit: sum("debit"), credit: sum("credit"), closing_dr: sum("closing_dr"), closing_cr: sum("closing_cr") };
  const balanced = totals.opening_dr === totals.opening_cr && totals.debit === totals.credit && totals.closing_dr === totals.closing_cr;
  return { from, to, fy_start: fy, rows: shown, totals, balanced, filters: { department: f.department || "", funding_source: f.funding_source || "", project: f.project || "" }, generated_at: new Date().toISOString() };
}

/** Every posting on one account with the running balance. */
function accountLedger(dao, auth, accountId, f) {
  requireAny(dao, auth, VIEW, "see the general ledger");
  const a = load(dao, "gl_accounts", accountId, "Account");
  const to = day(f.to) || todayStr();
  const from = day(f.from) || fyStartOf(dao, to);
  const fy = fyStartOf(dao, from);
  const w = dimWhere(f, "");
  const pl = PL.indexOf(a.getString("type")) !== -1;
  const m = new DynamicModel({ n: 0 });
  dao.db().newQuery(`SELECT COALESCE(SUM(debit - credit), 0) AS n FROM gl_journal_lines WHERE account = {:a} AND date < {:from}${pl ? " AND date >= {:fy}" : ""} AND (status = 'posted' OR status = 'reversed')${w.sql}`)
    .bind(Object.assign({ a: a.id, from: `${from} 00:00:00.000Z`, fy: `${fy} 00:00:00.000Z` }, w.params)).one(m);
  const opening = r0(m.n);
  const filter = `account = {:a} && date >= {:from} && date <= {:to} && (status = 'posted' || status = 'reversed')${f.department ? " && department = {:department}" : ""}${f.funding_source ? " && funding_source = {:funding_source}" : ""}${f.project ? " && project = {:project}" : ""}`;
  const lines = dao.findRecordsByFilter("gl_journal_lines", filter, "date,created", 3001, 0, Object.assign({ a: a.id, from: `${from} 00:00:00.000Z`, to: `${to} 23:59:59.999Z` }, w.params)) || [];
  const truncated = lines.length > 3000;
  const journals = {};
  const names = {};
  const cached = (col, id, field) => {
    if (!id) return "";
    const k = `${col}:${id}`;
    if (!(k in names)) names[k] = nameOf(dao, col, id, field);
    return names[k];
  };
  let bal = opening;
  let dr = 0;
  let cr = 0;
  const rows = lines.slice(0, 3000).map((l) => {
    const jid = l.getString("journal");
    const j = journals[jid] || (journals[jid] = find(dao, "gl_journals", jid));
    bal += l.getInt("debit") - l.getInt("credit");
    dr += l.getInt("debit");
    cr += l.getInt("credit");
    return {
      id: l.id, date: day(l.getString("date")), journal: jid, number: j ? j.getString("number") : "", journal_type: j ? j.getString("journal_type") : "",
      source_type: j ? j.getString("source_type") : "", source_id: j ? j.getString("source_id") : "", source_number: j ? j.getString("source_number") : "",
      description: l.getString("description") || (j ? j.getString("description") : ""), department: cached("departments", l.getString("department")),
      funding: cached("funding_sources", l.getString("funding_source"), "code"), project: cached("projects", l.getString("project"), "code"),
      debit: l.getInt("debit"), credit: l.getInt("credit"), balance: bal,
    };
  });
  return { account: { id: a.id, code: a.getString("code"), name: a.getString("name"), type: a.getString("type") }, from, to, opening, debit: dr, credit: cr, closing: bal, rows, truncated, generated_at: new Date().toISOString() };
}

// ------------------------------------------------------------------ period close
function periodOf(dao, id) {
  return load(dao, "fiscal_periods", id, "Period");
}
const DONE = ["approved", "paid"];

/** What must be true before a month is closed. Blocking items stop the close; warnings are shown. */
function checklist(dao, p) {
  const start = day(p.getString("start_date"));
  const end = day(p.getString("end_date"));
  const y = parseInt(end.slice(0, 4), 10);
  const m = parseInt(end.slice(5, 7), 10);
  const range = { s: `${start} 00:00:00.000Z`, e: `${end} 23:59:59.999Z` };
  const items = [];
  const add = (key, label, state, detail, link, blocking) => items.push({ key, label, state, detail: detail || "", link: link || "", blocking: Boolean(blocking) && state === "fail" });

  // 1. months are closed in order
  const prev = (dao.findRecordsByFilter("fiscal_periods", "end_date < {:s}", "-end_date", 1, 0, { s: range.s }) || [])[0];
  if (prev && prev.getString("status") !== "closed") add("previous", "The previous month is closed", "fail", `${prev.getString("name")} is still open — close the months in order.`, "", true);
  else add("previous", "The previous month is closed", "ok", prev ? `${prev.getString("name")} is closed.` : "");

  // 2. every bank account and cash book reconciled to the month end
  const accounts = (dao.findRecordsByFilter("bank_accounts", "status = 'active'", "code", 0, 0) || []).filter((a) => day(a.getString("opening_date")) <= end);
  const late = accounts.filter((a) => !a.getString("reconciled_to") || day(a.getString("reconciled_to")) < end);
  if (!accounts.length) add("bank", "Bank and cash reconciled to the month end", "ok", "No bank or cash account yet.");
  else if (late.length) add("bank", "Bank and cash reconciled to the month end", "fail", late.map((a) => `${a.getString("code")} ${a.getString("reconciled_to") ? `reconciled to ${showDay(day(a.getString("reconciled_to")))}` : "never reconciled"}`).join("; "), "/dashboard/treasury/reconciliations", true);
  else add("bank", "Bank and cash reconciled to the month end", "ok", `${accounts.length} account${accounts.length === 1 ? "" : "s"} reconciled.`);

  // 3. depreciation posted for the month
  const depreciable = (dao.findRecordsByFilter("assets", "capitalised = true && status != 'disposed' && depreciation_start <= {:e}", "", 1, 0, { e: range.e }) || []).length;
  const run = (dao.findRecordsByFilter("depreciation_runs", "year = {:y} && month = {:m} && status != 'cancelled' && status != 'rejected'", "", 1, 0, { y, m }) || [])[0];
  if (!depreciable) add("depreciation", "Depreciation posted", "ok", "No asset to depreciate this month.");
  else if (run && run.getString("status") === "approved") add("depreciation", "Depreciation posted", "ok", `${run.getString("number")} · RWF ${num(run.getInt("total"))}`, `/dashboard/assets/depreciation/${run.id}`);
  else add("depreciation", "Depreciation posted", "fail", run ? `${run.getString("number")} is ${run.getString("status") === "pending_approval" ? "waiting for the DAF" : "not sent for approval"}.` : "The Accountant has not calculated it yet.", run ? `/dashboard/assets/depreciation/${run.id}` : "/dashboard/assets/depreciation", true);

  // 4. payroll approved and posted
  const pay = (dao.findRecordsByFilter("payrolls", "year = {:y} && month = {:m} && status != 'cancelled' && status != 'rejected'", "", 1, 0, { y, m }) || [])[0];
  const first = (dao.findRecordsByFilter("payrolls", "status = 'approved' || status = 'paid'", "year,month", 1, 0) || [])[0];
  const beforeFirst = first && first.getInt("year") * 12 + first.getInt("month") > y * 12 + m;
  if (pay && DONE.indexOf(pay.getString("status")) !== -1 && pay.getString("gl_journal")) add("payroll", "Payroll approved and posted", "ok", `${pay.getString("number")} · ${pay.getString("status")}`, `/dashboard/hr/payroll/${pay.id}`);
  else if (!pay && (!first || beforeFirst)) add("payroll", "Payroll approved and posted", "ok", first ? `The first payroll in the system is ${first.getString("period_label")}.` : "No payroll in the system yet.");
  else add("payroll", "Payroll approved and posted", "fail", pay ? `${pay.getString("number")} is ${pay.getString("status").replace(/_/g, " ")}.` : "No payroll was prepared for this month.", pay ? `/dashboard/hr/payroll/${pay.id}` : "/dashboard/hr/payroll", true);

  // 5. journals of the month decided
  const journals = dao.findRecordsByFilter("gl_journals", "date >= {:s} && date <= {:e} && (status = 'pending_approval' || status = 'draft' || status = 'returned')", "", 0, 0, range) || [];
  const waiting = journals.filter((j) => j.getString("status") === "pending_approval");
  if (waiting.length) add("journals", "No journal waiting for approval", "fail", `${waiting.map((j) => j.getString("number")).join(", ")} waiting for the DAF.`, "/dashboard/finance/journals?view=pending", true);
  else if (journals.length) add("journals", "No journal waiting for approval", "warn", `${journals.length} draft or returned journal${journals.length === 1 ? "" : "s"} dated this month — post them or cancel them.`, "/dashboard/finance/journals?view=drafts");
  else add("journals", "No journal waiting for approval", "ok", "");

  // 6–8. documents of the month still open (warnings)
  const openInvoices = (dao.findRecordsByFilter("supplier_invoices", "invoice_date >= {:s} && invoice_date <= {:e} && (status = 'received' || status = 'matched' || status = 'exception' || status = 'pending_approval' || status = 'returned')", "", 0, 0, range) || []).length;
  add("invoices", "Supplier invoices of the month approved", openInvoices ? "warn" : "ok", openInvoices ? `${openInvoices} invoice${openInvoices === 1 ? "" : "s"} dated this month not approved yet — the cost is missing from the month.` : "", "/dashboard/finance/invoices");
  const unpaid = (dao.findRecordsByFilter("payment_vouchers", "status = 'approved'", "", 0, 0) || []).length;
  add("vouchers", "Approved vouchers paid", unpaid ? "warn" : "ok", unpaid ? `${unpaid} approved voucher${unpaid === 1 ? "" : "s"} waiting for the Cashier.` : "", "/dashboard/finance/vouchers");
  const docs = (dao.findRecordsByFilter("cash_receipts", "receipt_date >= {:s} && receipt_date <= {:e} && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 0, 0, range) || []).length
    + (dao.findRecordsByFilter("bank_transfers", "transfer_date >= {:s} && transfer_date <= {:e} && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 0, 0, range) || []).length;
  add("treasury", "Receipts and transfers of the month posted", docs ? "warn" : "ok", docs ? `${docs} receipt${docs === 1 ? "" : "s"} or transfer${docs === 1 ? "" : "s"} dated this month not posted.` : "", "/dashboard/treasury");

  // 9. goods and assets received not invoiced (clearing account) — explained before closing
  let grni = 0;
  try {
    const acc = ledger.accountFor(dao, "assets.grni");
    const g = new DynamicModel({ n: 0 });
    dao.db().newQuery("SELECT COALESCE(SUM(credit - debit), 0) AS n FROM gl_journal_lines WHERE account = {:a} AND date <= {:e} AND (status = 'posted' OR status = 'reversed')").bind({ a: acc.id, e: range.e }).one(g);
    grni = r0(g.n);
  } catch (_) {}
  add("grni", "Assets received, not yet invoiced, explained", grni ? "warn" : "ok", grni ? `RWF ${num(Math.abs(grni))} ${grni > 0 ? "received and not yet invoiced" : "invoiced and not yet capitalised"} at the month end.` : "Nil balance.", "/dashboard/finance/trial-balance");

  // 10. the ledger balances
  const tb = new DynamicModel({ n: 0 });
  dao.db().newQuery("SELECT COALESCE(SUM(debit - credit), 0) AS n FROM gl_journal_lines WHERE date <= {:e} AND (status = 'posted' OR status = 'reversed')").bind({ e: range.e }).one(tb);
  add("balanced", "The trial balance balances", r0(tb.n) === 0 ? "ok" : "fail", r0(tb.n) === 0 ? "" : `Debits and credits differ by RWF ${num(Math.abs(tb.n))}.`, "/dashboard/finance/trial-balance", true);
  return items;
}

function periodJson(dao, p, withChecklist) {
  const items = withChecklist ? checklist(dao, p) : null;
  return {
    id: p.id, name: p.getString("name"), code: p.getString("code"), number: p.getInt("number"), start: day(p.getString("start_date")), end: day(p.getString("end_date")),
    status: p.getString("status"), fiscal_year: p.getString("fiscal_year"), fiscal_year_name: nameOf(dao, "fiscal_years", p.getString("fiscal_year")),
    closed_by: nameOf(dao, "users", p.getString("closed_by")), closed_at: p.getString("closed_at"), close_note: p.getString("close_note"),
    reopened_by: nameOf(dao, "users", p.getString("reopened_by")), reopened_at: p.getString("reopened_at"), reopen_reason: p.getString("reopen_reason"),
    checklist: items, blocking: items ? items.filter((i) => i.blocking).length : null, warnings: items ? items.filter((i) => i.state === "warn").length : null,
    close_checklist: core.parseJson(p, "close_checklist", null),
  };
}

/** The periods of the open fiscal years (and the last closed one), newest first, with the checklist of open months. */
function periods(dao, auth) {
  requireAny(dao, auth, VIEW, "see the periods");
  const years = (dao.findRecordsByFilter("fiscal_years", "id != ''", "-start_date", 3, 0) || []);
  const today = todayStr();
  const out = [];
  for (const fy of years) {
    for (const p of dao.findRecordsByFilter("fiscal_periods", "fiscal_year = {:f}", "-start_date", 0, 0, { f: fy.id }) || []) {
      out.push(periodJson(dao, p, p.getString("status") === "open" && day(p.getString("start_date")) <= today));
    }
  }
  const reopen = (dao.findRecordsByFilter("period_reopen_requests", "id != ''", "-created", 20, 0) || []).map((r) => ({
    id: r.id, number: r.getString("number"), period: r.getString("period"), period_name: nameOf(dao, "fiscal_periods", r.getString("period")), reason: r.getString("reason"),
    status: r.getString("status"), requested_by: nameOf(dao, "users", r.getString("requested_by")), created: r.getString("created"), approval: r.getString("approval"),
  }));
  return { periods: out, reopen_requests: reopen, today };
}

function periodDetail(dao, auth, id) {
  requireAny(dao, auth, VIEW, "see the periods");
  return periodJson(dao, periodOf(dao, id), true);
}

function closePeriod(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "close_periods", "close periods");
  const p = periodOf(dao, id);
  if (p.getString("status") !== "open") throw new BadRequestError(`${p.getString("name")} is already closed.`);
  if (day(p.getString("end_date")) >= todayStr()) throw new BadRequestError(`${p.getString("name")} is not over yet.`);
  const items = checklist(dao, p);
  const blocking = items.filter((i) => i.blocking);
  if (blocking.length) throw new BadRequestError(`${p.getString("name")} cannot be closed yet: ${blocking.map((i) => `${i.label.toLowerCase()} — ${i.detail}`).join("; ")}`);
  p.set("status", "closed");
  p.set("closed_by", auth.id);
  p.set("closed_at", new Date().toISOString());
  p.set("close_checklist", items);
  p.set("close_note", String(input.note || "").trim().slice(0, 1000));
  dao.saveRecord(p);
  core.audit(dao, { actor: auth, action: "period_closed", collection: "fiscal_periods", recordId: p.id, label: p.getString("name"), comment: String(input.note || "").slice(0, 300), meta, changes: { status: { old: "open", new: "closed" } } });
  return p;
}

function requestReopen(dao, auth, id, input, meta) {
  requireAny(dao, auth, ["close_periods", "manage_journals"], "ask for a period to be re-opened");
  const p = periodOf(dao, id);
  if (p.getString("status") !== "closed") throw new BadRequestError(`${p.getString("name")} is open.`);
  const fy = find(dao, "fiscal_years", p.getString("fiscal_year"));
  if (fy && fy.getString("status") === "closed") throw new BadRequestError(`${fy.getString("name")} is closed; its months cannot be re-opened.`);
  const later = (dao.findRecordsByFilter("fiscal_periods", "start_date > {:s} && status = 'closed'", "-start_date", 1, 0, { s: p.getString("start_date") }) || [])[0];
  if (later) throw new BadRequestError(`${later.getString("name")} is closed too: months are re-opened from the latest one.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 20) throw new BadRequestError("Explain what must be corrected and why (at least 20 characters).");
  const pending = (dao.findRecordsByFilter("period_reopen_requests", "period = {:p} && status = 'pending_approval'", "", 1, 0, { p: p.id }) || [])[0];
  if (pending) throw new BadRequestError(`${pending.getString("number")} already asks to re-open ${p.getString("name")}.`);
  const r = new Record(dao.findCollectionByNameOrId("period_reopen_requests"));
  r.set("number", core.nextNumber(dao, "period_reopen"));
  r.set("period", p.id);
  r.set("reason", reason.slice(0, 1000));
  r.set("requested_by", auth.id);
  r.set("status", "pending_approval");
  dao.saveRecord(r);
  require("./approvals.js").start(dao, "period_reopen", r, auth, meta);
  return r;
}

/** The SG approved: the month is open again for corrections. */
function onReopenApproved(dao, r, actor, meta) {
  const p = periodOf(dao, r.getString("period"));
  p.set("status", "open");
  p.set("reopened_by", actor ? actor.id : "");
  p.set("reopened_at", new Date().toISOString());
  p.set("reopen_reason", r.getString("reason"));
  dao.saveRecord(p);
  core.audit(dao, { actor, action: "period_reopened", collection: "fiscal_periods", recordId: p.id, label: p.getString("name"), comment: r.getString("reason").slice(0, 300), meta, changes: { status: { old: "closed", new: "open" } } });
  core.notify(dao, [r.getString("requested_by")].filter(Boolean), { title: `${p.getString("name")} re-opened`, body: "Make the corrections, then close the month again.", link: "/dashboard/finance/periods", type: "success" });
}

function cancelReopen(dao, auth, id, input, meta) {
  const r = load(dao, "period_reopen_requests", id, "Request");
  if (r.getString("requested_by") !== auth.id && !core.can(dao, auth, "close_periods")) throw new ForbiddenError("Only the person who asked, or the DAF, can withdraw this request.");
  if (r.getString("status") !== "pending_approval") throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}.`);
  const reason = String(input.reason || "").trim() || "Withdrawn";
  require("./approvals.js").cancel(dao, "period_reopen", r, auth, reason.slice(0, 500), meta);
  return r;
}

module.exports = {
  cleanLines, saveJournal, submitJournal, onJournalApproved, onJournalClosed, cancelJournal, reverseJournal,
  saveRecurring, generateDue, trialBalance, accountLedger, checklist, periods, periodDetail, closePeriod, requestReopen, onReopenApproved, cancelReopen, fyStartOf,
};
