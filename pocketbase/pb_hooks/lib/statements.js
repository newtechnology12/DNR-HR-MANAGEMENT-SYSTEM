/// <reference path="../../pb_data/types.d.ts" />
/**
 * Financial statements and management figures straight from the general ledger (M9, IPSAS presentation), all
 * from posted journal lines — nothing is keyed in twice, so the statements always agree with the trial balance.
 *
 *  - financial position at a date, beside the start of the fiscal year: assets, liabilities and net assets (the
 *    accumulated surplus at the start of the year plus the surplus of the year so far); assets = liabilities + net
 *    assets
 *  - financial performance for a period, beside the year to date: revenue from non-exchange and exchange
 *    transactions, expenses by nature, surplus or deficit; by department, funding source or project
 *  - cash flow (direct method): every journal that moves a bank or cash account is split over its other lines —
 *    in a balanced journal the cash that moved equals the sum of those lines — so each receipt and payment is
 *    classified by what it was for; opening cash + net flow = closing cash, by construction
 *  - donor report: for a funding source, funds received, spending by budget line against its budget, the fund
 *    balance and the cash held in its restricted account
 *  - month by month revenue, expenses and closing cash for the executive dashboard
 */
const core = require("./core.js");

const r0 = (n) => Math.round(Number(n) || 0);
const day = (v) => String(v || "").slice(0, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VIEW = ["view_financial_reports", "view_journals", "approve_journals", "close_periods", "export_ledger"];
const POSTED = "(l.status = 'posted' OR l.status = 'reversed')";

function requireView(dao, auth) {
  if (!auth) throw new UnauthorizedError("Please sign in again.");
  if (!VIEW.some((p) => core.can(dao, auth, p))) throw new ForbiddenError('You don\'t have permission to see the financial statements. Ask an administrator to grant "view_financial_reports" to your role.');
}
function find(dao, collection, id) {
  if (!id) return null;
  try {
    return dao.findRecordById(collection, String(id));
  } catch (_) {
    return null;
  }
}
const fyStartOf = (dao, d) => require("./gl.js").fyStartOf(dao, d);
function datesOf(dao, input) {
  const to = day(input.to) || todayStr();
  const from = day(input.from) || fyStartOf(dao, to);
  if (from > to) throw new BadRequestError("The start date is after the end date.");
  return { from, to, fy: fyStartOf(dao, to) };
}

/** The chart of accounts with each posting account's section heading (level 2: 11 Current assets, 52 Goods and services…). */
function chart(dao) {
  const all = dao.findRecordsByFilter("gl_accounts", "id != ''", "code", 0, 0) || [];
  const byId = {};
  for (const a of all) byId[a.id] = a;
  const groupOf = (a) => {
    let x = a;
    for (let i = 0; x && x.getInt("level") > 2 && i < 6; i++) x = byId[x.getString("parent")];
    return x || a;
  };
  return { all, byId, groupOf };
}

/** Debits and credits per account over posted lines (dates inclusive), optionally for one department, fund or project. */
function sums(dao, o) {
  const where = [POSTED, "l.date <= {:to}"];
  const params = { to: `${o.to} 23:59:59.999Z` };
  if (o.from) {
    where.push("l.date >= {:from}");
    params.from = `${o.from} 00:00:00.000Z`;
  }
  for (const k of ["department", "funding_source", "project"]) {
    if (o[k]) {
      where.push(`l.${k} = {:${k}}`);
      params[k] = o[k];
    }
  }
  const rows = arrayOf(new DynamicModel({ account: "", dr: 0, cr: 0 }));
  dao.db().newQuery(`SELECT l.account AS account, COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr FROM gl_journal_lines l WHERE ${where.join(" AND ")} GROUP BY l.account`).bind(params).all(rows);
  const out = {};
  for (const x of rows) out[x.account] = { dr: r0(x.dr), cr: r0(x.cr) };
  return out;
}
const natural = (a, s) => (s ? (a.getString("type") === "asset" || a.getString("type") === "expense" ? s.dr - s.cr : s.cr - s.dr) : 0);
const isPL = (a) => a.getString("type") === "revenue" || a.getString("type") === "expense";
const isCash = (a) => a.getString("cash_flow_class") === "cash";
const plTotal = (all, s) => all.filter((a) => a.getBool("is_posting") && isPL(a)).reduce((t, a) => t + (s[a.id] ? s[a.id].cr - s[a.id].dr : 0), 0);

/** Lines of one statement section, grouped under their headings; zero lines left out unless the comparative has one. */
function grouped(c, accounts, value, compare) {
  const groups = {};
  const order = [];
  for (const a of accounts) {
    const now = value(a);
    const cmp = compare ? compare(a) : 0;
    if (!now && !cmp) continue;
    const g = c.groupOf(a);
    if (!groups[g.id]) {
      groups[g.id] = { code: g.getString("code"), name: g.getString("name"), lines: [], total: 0, compare: 0 };
      order.push(g.id);
    }
    groups[g.id].lines.push({ account: a.id, code: a.getString("code"), name: a.getString("name"), amount: now, compare: cmp });
    groups[g.id].total += now;
    groups[g.id].compare += cmp;
  }
  return order.map((id) => groups[id]);
}
const sumOf = (groups, k) => groups.reduce((t, g) => t + g[k], 0);

// ------------------------------------------------------------------ financial position
function financialPosition(dao, auth, input) {
  requireView(dao, auth);
  const asAt = day(input.as_at) || todayStr();
  const fy = fyStartOf(dao, asAt);
  const c = chart(dao);
  const posting = c.all.filter((a) => a.getBool("is_posting"));
  const now = sums(dao, { to: asAt });
  const cmp = sums(dao, { to: fy });
  const yearNow = sums(dao, { from: fy, to: asAt });
  const yearCmp = sums(dao, { from: fy, to: fy });
  const bal = (s) => (a) => natural(a, s[a.id]);

  // cash and bank accounts shown as one line, with the accounts as detail
  const cashAccounts = posting.filter(isCash);
  const assetsOther = posting.filter((a) => a.getString("type") === "asset" && !isCash(a));
  const assetGroups = grouped(c, assetsOther, bal(now), bal(cmp));
  const cashLine = {
    account: "", code: "", name: "Cash and cash equivalents", amount: cashAccounts.reduce((t, a) => t + bal(now)(a), 0), compare: cashAccounts.reduce((t, a) => t + bal(cmp)(a), 0),
    detail: cashAccounts.map((a) => ({ account: a.id, code: a.getString("code"), name: a.getString("name"), amount: bal(now)(a), compare: bal(cmp)(a) })).filter((x) => x.amount || x.compare),
  };
  let current = assetGroups.find((g) => g.code === "11");
  if (!current) {
    const h = c.all.find((a) => a.getString("code") === "11");
    current = { code: "11", name: h ? h.getString("name") : "Current assets", lines: [], total: 0, compare: 0 };
    assetGroups.unshift(current);
  }
  current.lines.unshift(cashLine);
  current.total += cashLine.amount;
  current.compare += cashLine.compare;

  const liabilityGroups = grouped(c, posting.filter((a) => a.getString("type") === "liability"), bal(now), bal(cmp));

  // net assets: the accumulated surplus brought into the year (earlier years' result included) and the year so far
  const surplusYear = plTotal(posting, yearNow);
  const surplusYearCmp = plTotal(posting, yearCmp);
  const earlierNow = plTotal(posting, now) - surplusYear;
  const earlierCmp = plTotal(posting, cmp) - surplusYearCmp;
  const equity = posting.filter((a) => a.getString("type") === "net_assets");
  const equityLines = equity.map((a) => {
    const accumulated = a.getString("code") === "3101";
    return {
      account: a.id, code: a.getString("code"), name: accumulated ? "Accumulated surplus at the start of the year" : a.getString("name"),
      amount: bal(now)(a) + (accumulated ? earlierNow : 0), compare: bal(cmp)(a) + (accumulated ? earlierCmp : 0),
    };
  }).filter((x) => x.amount || x.compare);
  equityLines.push({ account: "", code: "", name: "Surplus / (deficit) for the year", amount: surplusYear, compare: surplusYearCmp });
  const netGroup = { code: "3", name: "Net assets", lines: equityLines, total: equityLines.reduce((t, x) => t + x.amount, 0), compare: equityLines.reduce((t, x) => t + x.compare, 0) };

  const assets = { total: sumOf(assetGroups, "total"), compare: sumOf(assetGroups, "compare") };
  const liabilities = { total: sumOf(liabilityGroups, "total"), compare: sumOf(liabilityGroups, "compare") };
  return {
    as_at: asAt, compare_at: fy, fy_start: fy,
    sections: [
      { key: "assets", label: "Assets", groups: assetGroups, ...assets },
      { key: "liabilities", label: "Liabilities", groups: liabilityGroups, ...liabilities },
      { key: "net_assets", label: "Net assets", groups: [netGroup], total: netGroup.total, compare: netGroup.compare },
    ],
    totals: { assets: assets.total, liabilities: liabilities.total, net_assets: netGroup.total, compare_assets: assets.compare, compare_liabilities: liabilities.compare, compare_net_assets: netGroup.compare },
    balanced: assets.total === liabilities.total + netGroup.total && assets.compare === liabilities.compare + netGroup.compare,
    generated_at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ financial performance
function dimsOf(input) {
  const f = {};
  for (const k of ["department", "funding_source", "project"]) if (input[k]) f[k] = String(input[k]);
  return f;
}

function financialPerformance(dao, auth, input) {
  requireView(dao, auth);
  const { from, to, fy } = datesOf(dao, input);
  const f = dimsOf(input);
  const c = chart(dao);
  const posting = c.all.filter((a) => a.getBool("is_posting"));
  const period = sums(dao, { from, to, ...f });
  const year = sums(dao, { from: fy, to, ...f });
  const val = (s) => (a) => natural(a, s[a.id]);
  const revenue = grouped(c, posting.filter((a) => a.getString("type") === "revenue"), val(period), val(year));
  const expenses = grouped(c, posting.filter((a) => a.getString("type") === "expense"), val(period), val(year));
  const totals = {
    revenue: sumOf(revenue, "total"), revenue_ytd: sumOf(revenue, "compare"),
    expenses: sumOf(expenses, "total"), expenses_ytd: sumOf(expenses, "compare"),
  };
  totals.surplus = totals.revenue - totals.expenses;
  totals.surplus_ytd = totals.revenue_ytd - totals.expenses_ytd;
  return { from, to, fy_start: fy, filters: f, revenue, expenses, totals, generated_at: new Date().toISOString() };
}

// ------------------------------------------------------------------ cash flow (direct method)
const RECEIPTS = { members: "Member contributions", government: "Government of Rwanda transfers", grants: "Donor grants", fees: "Fees, interest and other receipts" };
const PAYMENTS = { employees: "Salaries, advances and other staff costs", statutory: "PAYE, RSSB and withholding tax (RRA, RSSB)", suppliers: "Suppliers and service providers" };
const INVESTING = { assets: "Property, plant and equipment" };
const FINANCING = { capital: "Capital grants and contributions" };

/** What a line opposite the cash was for. */
function flowOf(a) {
  const code = a.getString("code");
  const cls = a.getString("cash_flow_class");
  const type = a.getString("type");
  if (cls === "investing") return ["investing", "assets"];
  if (cls === "financing" || type === "net_assets") return ["financing", "capital"];
  if (code === "4101" || code === "1110") return ["operating", "members"];
  if (code === "4102") return ["operating", "government"];
  if (code === "4103" || code === "4104" || code === "2110") return ["operating", "grants"];
  if (type === "revenue" || code === "1111") return ["operating", "fees"];
  if (code.indexOf("51") === 0 || ["2103", "1120", "1121"].indexOf(code) !== -1) return ["operating", "employees"];
  if (["2104", "2105", "2106", "2107", "2108", "2109", "2112", "2113"].indexOf(code) !== -1) return ["operating", "statutory"];
  return ["operating", "suppliers"];
}

function cashFlow(dao, auth, input) {
  requireView(dao, auth);
  const { from, to, fy } = datesOf(dao, input);
  const c = chart(dao);
  const cashIds = c.all.filter((a) => a.getBool("is_posting") && isCash(a)).map((a) => a.id);
  const cashOf = (s) => cashIds.reduce((t, id) => t + (s[id] ? s[id].dr - s[id].cr : 0), 0);
  let opening = cashOf(sums(dao, { to: addDays(from, -1) }));
  const closing = cashOf(sums(dao, { to }));

  const rows = arrayOf(new DynamicModel({ journal: "", source: "", account: "", dr: 0, cr: 0 }));
  dao.db().newQuery(`
    SELECT l.journal AS journal, j.source_type AS source, l.account AS account, COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr
    FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal
    WHERE ${POSTED} AND l.date >= {:from} AND l.date <= {:to}
      AND l.journal IN (SELECT DISTINCT l2.journal FROM gl_journal_lines l2 JOIN gl_accounts a2 ON a2.id = l2.account
                        WHERE a2.cash_flow_class = 'cash' AND l2.date >= {:from} AND l2.date <= {:to} AND (l2.status = 'posted' OR l2.status = 'reversed'))
    GROUP BY l.journal, j.source_type, l.account`).bind({ from: `${from} 00:00:00.000Z`, to: `${to} 23:59:59.999Z` }).all(rows);

  // per journal first: what each line was for, and the cash that moved
  const journals = {};
  let moved = 0;
  for (const x of rows) {
    const a = c.byId[x.account];
    if (!a) continue;
    const dr = r0(x.dr);
    const cr = r0(x.cr);
    if (isCash(a)) {
      // balances brought in at go-live are the cash the year starts with, not a flow of the year
      if (x.source === "bank_opening") opening += dr - cr;
      else moved += dr - cr;
      continue;
    }
    if (x.source === "bank_opening") continue;
    const j = journals[x.journal] || (journals[x.journal] = {});
    const k = flowOf(a).join("|");
    j[k] = (j[k] || 0) + (cr - dr);
  }
  // A part running against the cash of its journal (tax withheld from a supplier payment, a deduction kept back) is
  // not a flow of its own: it reduces the main flow, so suppliers show what they were actually paid and the tax
  // appears when it is remitted.
  const flows = { operating: {}, investing: {}, financing: {} };
  for (const parts of Object.values(journals)) {
    const cash = Object.values(parts).reduce((t, v) => t + v, 0);
    const keys = Object.keys(parts);
    const main = keys.filter((k) => Math.sign(parts[k]) === Math.sign(cash)).sort((p, q) => Math.abs(parts[q]) - Math.abs(parts[p]))[0];
    for (const k of keys) {
      const target = main && cash && Math.sign(parts[k]) !== Math.sign(cash) ? main : k;
      const [section, key] = target.split("|");
      flows[section][key] = (flows[section][key] || 0) + parts[k];
    }
  }
  const lines = (section, labels) => Object.entries(labels).map(([key, label]) => ({ key, label, amount: flows[section][key] || 0 })).filter((l) => l.amount);
  const receipts = lines("operating", RECEIPTS);
  const payments = lines("operating", PAYMENTS);
  const sum = (ls) => ls.reduce((t, l) => t + l.amount, 0);
  const operating = sum(receipts) + sum(payments);
  const investing = lines("investing", INVESTING);
  const financing = lines("financing", FINANCING);
  const net = operating + sum(investing) + sum(financing);
  return {
    from, to, fy_start: fy, receipts, payments, operating, investing, investing_total: sum(investing), financing, financing_total: sum(financing),
    net, opening, closing, reconciles: opening + net === closing && net === moved, generated_at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ donor report
function donorReport(dao, auth, input) {
  requireView(dao, auth);
  const fs = find(dao, "funding_sources", input.funding_source);
  if (!fs) throw new BadRequestError("Choose the funding source.");
  const { from, to, fy } = datesOf(dao, input);
  const c = chart(dao);
  const posting = c.all.filter((a) => a.getBool("is_posting"));
  const f = { funding_source: fs.id };
  const before = sums(dao, { to: addDays(from, -1), ...f });
  const period = sums(dao, { from, to, ...f });
  const of = (s, type) => posting.filter((a) => a.getString("type") === type).reduce((t, a) => t + natural(a, s[a.id]), 0);
  const received = of(period, "revenue");
  const spent = of(period, "expense");
  // unspent funds brought in at go-live (opening balances posted to net assets with this funding source)
  const broughtIn = of(sums(dao, { to, ...f }), "net_assets");
  const opening = of(before, "revenue") - of(before, "expense") + broughtIn;

  // receipts by account, spending by budget line (with its budget) and by project
  const receipts = posting.filter((a) => a.getString("type") === "revenue" && natural(a, period[a.id]))
    .map((a) => ({ code: a.getString("code"), name: a.getString("name"), amount: natural(a, period[a.id]) }));
  const rows = arrayOf(new DynamicModel({ line: "", project: "", account: "", dr: 0, cr: 0 }));
  dao.db().newQuery(`
    SELECT COALESCE(l.budget_line, '') AS line, COALESCE(l.project, '') AS project, l.account AS account, COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr
    FROM gl_journal_lines l JOIN gl_accounts a ON a.id = l.account
    WHERE ${POSTED} AND a.type = 'expense' AND l.funding_source = {:f} AND l.date >= {:from} AND l.date <= {:to}
    GROUP BY l.budget_line, l.project, l.account`).bind({ f: fs.id, from: `${from} 00:00:00.000Z`, to: `${to} 23:59:59.999Z` }).all(rows);
  // the fund's budget lines this fiscal year: spending lines, and revenue lines (the funds expected)
  const budget = require("./budget.js");
  const fyPeriod = require("./masterdata.js").periodFor(dao, `${to} 12:00:00.000Z`);
  const fundLines = fyPeriod ? dao.findRecordsByFilter("budget_lines", "funding_source = {:f} && fiscal_year = {:y} && (status = 'active' || status = 'closed')", "code", 0, 0, { f: fs.id, y: fyPeriod.getString("fiscal_year") }) || [] : [];
  const spendLines = fundLines.filter((l) => l.getString("kind") !== "revenue");
  const expected = fundLines.filter((l) => l.getString("kind") === "revenue").reduce((t, l) => t + r0(budget.lineFigures(dao, l).budget), 0);
  // spending recorded without a budget line (a manual journal, depreciation) goes to the fund's line for its account and project
  const lineFor = {};
  for (const l of spendLines) {
    const k = `${l.getString("gl_account")}|${l.getString("project")}`;
    if (!lineFor[k]) lineFor[k] = l.id;
    if (!lineFor[`${l.getString("gl_account")}|*`]) lineFor[`${l.getString("gl_account")}|*`] = l.id;
  }
  const byLine = {};
  const byProject = {};
  for (const x of rows) {
    const amount = r0(x.dr) - r0(x.cr);
    const a = c.byId[x.account];
    const matched = x.line || lineFor[`${x.account}|${x.project || ""}`] || lineFor[`${x.account}|*`] || "";
    const key = matched || `account:${x.account}`;
    if (!byLine[key]) {
      const line = find(dao, "budget_lines", matched);
      const depreciation = Boolean(a && c.groupOf(a).getString("code") === "54");
      byLine[key] = line
        ? { line: line.id, code: line.getString("code"), name: line.getString("name"), account: a ? `${a.getString("code")} ${a.getString("name")}` : "", spent: 0 }
        : { line: "", code: a ? a.getString("code") : "", name: a ? a.getString("name") : "Other spending", account: "", spent: 0, unbudgeted: !depreciation, depreciation };
    }
    byLine[key].spent += amount;
    const pk = x.project || "";
    if (!byProject[pk]) {
      const pr = find(dao, "projects", pk);
      byProject[pk] = { project: pk, code: pr ? pr.getString("code") : "", name: pr ? pr.getString("name") : "No project", spent: 0 };
    }
    byProject[pk].spent += amount;
  }
  // every spending line of the fund, spent or not, with its budget, commitments and what is left
  for (const line of spendLines) {
    if (!byLine[line.id]) {
      const a = c.byId[line.getString("gl_account")];
      byLine[line.id] = { line: line.id, code: line.getString("code"), name: line.getString("name"), account: a ? `${a.getString("code")} ${a.getString("name")}` : "", spent: 0 };
    }
    const fig = budget.lineFigures(dao, line);
    Object.assign(byLine[line.id], { budget: r0(fig.budget), committed: r0(fig.committed), actual_ytd: r0(fig.actual), available: r0(fig.available), used_pct: fig.used_pct, status: fig.status, kind: line.getString("kind") });
  }
  const balances = sums(dao, { to });
  const accounts = (dao.findRecordsByFilter("bank_accounts", "funding_source = {:f}", "code", 0, 0, { f: fs.id }) || []).map((b) => {
    const g = balances[b.getString("gl_account")];
    return { code: b.getString("code"), name: b.getString("name"), balance: g ? g.dr - g.cr : 0 };
  });
  return {
    funding_source: { id: fs.id, code: fs.getString("code"), name: fs.getString("name"), type: fs.getString("type"), donor: fs.getString("donor_name"), agreement: fs.getString("agreement_reference"), restricted: fs.getBool("restricted"), start: day(fs.getString("start_date")), end: day(fs.getString("end_date")) },
    from, to, fy_start: fy, opening, brought_in: broughtIn, received, expected, spent, closing: opening + received - spent,
    receipts, lines: Object.values(byLine).filter((l) => l.spent || l.budget).sort((p, q) => (p.depreciation === q.depreciation ? (p.code < q.code ? -1 : 1) : p.depreciation ? 1 : -1)),
    projects: Object.values(byProject).filter((pr) => pr.spent).sort((p, q) => q.spent - p.spent),
    accounts, cash: accounts.reduce((t, a) => t + a.balance, 0), generated_at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ month by month (executive dashboard)
function trend(dao, auth, input) {
  requireView(dao, auth);
  const to = day(input.to) || todayStr();
  const fy = fyStartOf(dao, to);
  const rows = arrayOf(new DynamicModel({ ym: "", type: "", cash: "", dr: 0, cr: 0 }));
  dao.db().newQuery(`
    SELECT substr(l.date, 1, 7) AS ym, a.type AS type, a.cash_flow_class AS cash, COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr
    FROM gl_journal_lines l JOIN gl_accounts a ON a.id = l.account
    WHERE ${POSTED} AND l.date <= {:to}
    GROUP BY substr(l.date, 1, 7), a.type, a.cash_flow_class`).bind({ to: `${to} 23:59:59.999Z` }).all(rows);
  const months = [];
  for (let d = `${fy.slice(0, 7)}-01`; d <= to; ) {
    months.push(d.slice(0, 7));
    const y = parseInt(d.slice(0, 4), 10);
    const m = parseInt(d.slice(5, 7), 10);
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  let cash = 0;
  for (const x of rows) if (x.cash === "cash" && x.ym < months[0]) cash += r0(x.dr) - r0(x.cr);
  const out = months.map((ym) => {
    let revenue = 0;
    let expenses = 0;
    for (const x of rows) {
      if (x.ym !== ym) continue;
      if (x.type === "revenue") revenue += r0(x.cr) - r0(x.dr);
      if (x.type === "expense") expenses += r0(x.dr) - r0(x.cr);
      if (x.cash === "cash") cash += r0(x.dr) - r0(x.cr);
    }
    return { month: ym, label: `${MONTHS[parseInt(ym.slice(5, 7), 10) - 1]} ${ym.slice(2, 4)}`, revenue, expenses, surplus: revenue - expenses, cash };
  });
  return { to, fy_start: fy, months: out, generated_at: new Date().toISOString() };
}

module.exports = { financialPosition, financialPerformance, cashFlow, donorReport, trend, flowOf };
