/// <reference path="../pb_data/types.d.ts" />
/**
 * Bank and cash management (IMS M5). Rules live in lib/treasury.js.
 *
 *   bank_accounts, cash_receipts, bank_transfers, bank_reconciliations   collection API with hooks
 *   cash_book_entries, bank_statements, bank_statement_lines            read-only (written by the server)
 *
 *   POST   /api/ims/treasury/receipts/:id/{submit|cancel|reverse}
 *   POST   /api/ims/treasury/transfers/:id/{submit|cancel|reverse}
 *   POST   /api/ims/treasury/reconciliations/:id/{refresh|submit|cancel}
 *   GET    /api/ims/treasury/reconciliation-preview?account=&as_of=&statement_balance=
 *   POST   /api/ims/treasury/statements/import          { account, rows, opening_balance, closing_balance, statement_from, statement_to, file_name, mapping }
 *   DELETE /api/ims/treasury/statements/:id
 *   POST   /api/ims/treasury/match                      { account, entries, lines }
 *   POST   /api/ims/treasury/unmatch                    { group }
 *   POST   /api/ims/treasury/auto-match                 { account }
 *   POST   /api/ims/treasury/statement-lines/:id/record { type, gl_account, budget_line, description }
 *   POST   /api/ims/treasury/follow-up                  { items: [{ kind, id }], follow_up, note }
 *   GET    /api/ims/treasury/workspace?account=&as_of=
 *   GET    /api/ims/treasury/position
 *   GET    /api/ims/treasury/reports/:key?from=&to=&account=
 */

const TREASURY_READ = ["bank_accounts", "cash_book_entries", "cash_receipts", "bank_transfers", "bank_statements", "bank_statement_lines", "bank_reconciliations"];
onRecordsListRequest((e) => require(`${__hooks}/lib/treasury.js`).guardRead(e), ...TREASURY_READ);
onRecordViewRequest((e) => require(`${__hooks}/lib/treasury.js`).guardRead(e), ...TREASURY_READ);

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/treasury.js`).validateAccount(e, true), "bank_accounts");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/treasury.js`).validateAccount(e, false), "bank_accounts");
// The opening balance goes to the ledger (opening journal); corrected before the account is used, it is re-posted.
onRecordAfterCreateRequest((e) => {
  const dao = $app.dao();
  require(`${__hooks}/lib/glpost.js`).bankOpening(dao, dao.findRecordById("bank_accounts", e.record.id), e.httpContext.get("authRecord"));
}, "bank_accounts");
onRecordAfterUpdateRequest((e) => {
  const dao = $app.dao();
  const a = dao.findRecordById("bank_accounts", e.record.id);
  const j = a.getString("opening_journal") ? dao.findRecordById("gl_journals", a.getString("opening_journal")) : null;
  const total = j ? j.getInt("total_debit") : 0;
  const glLine = j ? (dao.findRecordsByFilter("gl_journal_lines", "journal = {:j} && account = {:a}", "", 1, 0, { j: j.id, a: a.getString("gl_account") }) || [])[0] : null;
  const same = j ? total === Math.abs(a.getInt("opening_balance")) && Boolean(glLine) : !a.getInt("opening_balance");
  if (!same) require(`${__hooks}/lib/glpost.js`).bankOpeningChanged(dao, a, e.httpContext.get("authRecord"));
}, "bank_accounts");
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeCreateReceipt(e), "cash_receipts");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeUpdateReceipt(e), "cash_receipts");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeDeleteDraft(e, "manage_treasury", "receipts"), "cash_receipts");
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeCreateTransfer(e), "bank_transfers");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeUpdateTransfer(e), "bank_transfers");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeDeleteDraft(e, "manage_treasury", "transfers"), "bank_transfers");
onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeCreateRec(e), "bank_reconciliations");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeUpdateRec(e), "bank_reconciliations");
onRecordBeforeDeleteRequest((e) => require(`${__hooks}/lib/treasury.js`).beforeDeleteDraft(e, "prepare_bank_reconciliation", "reconciliations"), "bank_reconciliations");

onRecordAfterCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const r = e.record;
  const name = r.collection().name;
  const label = r.getString("number") || r.getString("code");
  const comment = name === "bank_accounts"
    ? `${r.getString("name")} · opening balance ${core.formatMoney(r.getInt("opening_balance"), "RWF")}`
    : name === "bank_reconciliations"
      ? `As of ${r.getString("as_of").slice(0, 10)} · difference ${core.formatMoney(r.getInt("difference"), "RWF")}`
      : core.formatMoney(r.getInt("amount"), "RWF");
  core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "created", collection: name, recordId: r.id, label, comment, meta: core.requestMeta(e.httpContext) });
}, "bank_accounts", "cash_receipts", "bank_transfers", "bank_reconciliations");

onRecordAfterUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const changes = JSON.parse(e.httpContext.get("dnrAudit") || "{}");
  if (Object.keys(changes).length) {
    const r = e.record;
    core.audit($app.dao(), { actor: e.httpContext.get("authRecord"), action: "updated", collection: r.collection().name, recordId: r.id, label: r.getString("number") || r.getString("code"), changes, meta: core.requestMeta(e.httpContext) });
  }
}, "bank_accounts", "cash_receipts", "bank_transfers", "bank_reconciliations");

// POST /api/ims/treasury/{receipts|transfers}/:id/{submit|cancel|reverse}
routerAdd("POST", "/api/ims/treasury/:kind/:id/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const t = require(`${__hooks}/lib/treasury.js`);
  const info = $apis.requestInfo(c);
  const kind = c.pathParam("kind");
  const action = c.pathParam("action");
  const id = c.pathParam("id");
  const data = info.data || {};
  const meta = core.requestMeta(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    if (kind === "receipts" || kind === "transfers") {
      const type = kind === "receipts" ? "cash_receipt" : "bank_transfer";
      const collection = kind === "receipts" ? "cash_receipts" : "bank_transfers";
      let r;
      if (action === "submit") r = kind === "receipts" ? t.submitReceipt(tx, id, info.authRecord, meta) : t.submitTransfer(tx, id, info.authRecord, meta);
      else if (action === "cancel") r = t.cancelDoc(tx, type, collection, id, info.authRecord, data.reason, meta);
      else if (action === "reverse") r = t.reverseDoc(tx, type, id, info.authRecord, data.reason, meta);
      else throw new NotFoundError(`Unknown action "${action}".`);
      out = action === "submit" ? { approval: r.id } : { id: r.id, status: r.getString("status") };
    } else if (kind === "reconciliations") {
      if (action === "refresh") {
        const r = t.refreshRec(tx, id, info.authRecord);
        out = { id: r.id, difference: r.getInt("difference") };
      } else if (action === "submit") out = { approval: t.submitRec(tx, id, info.authRecord, meta).id };
      else if (action === "cancel") out = { id, status: t.cancelRec(tx, id, info.authRecord, data.reason, meta).getString("status") };
      else throw new NotFoundError(`Unknown action "${action}".`);
    } else if (kind === "statement-lines" && action === "record") {
      out = t.recordFromLine(tx, info.authRecord, id, data, meta);
    } else {
      throw new NotFoundError("Not found.");
    }
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("POST", "/api/ims/treasury/statements/import", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const t = require(`${__hooks}/lib/treasury.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = t.importStatement(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"), $apis.bodyLimit(20 << 20));

routerAdd("DELETE", "/api/ims/treasury/statements/:id", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const t = require(`${__hooks}/lib/treasury.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = t.deleteStatement(tx, c.pathParam("id"), info.authRecord, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

// POST /api/ims/treasury/{match|unmatch|auto-match|follow-up}
routerAdd("POST", "/api/ims/treasury/:action", (c) => {
  const core = require(`${__hooks}/lib/core.js`);
  const t = require(`${__hooks}/lib/treasury.js`);
  const info = $apis.requestInfo(c);
  const data = info.data || {};
  const meta = core.requestMeta(c);
  const action = c.pathParam("action");
  let out;
  $app.dao().runInTransaction((tx) => {
    if (action === "match") out = t.match(tx, info.authRecord, data, meta);
    else if (action === "unmatch") out = t.unmatch(tx, info.authRecord, data.group, meta);
    else if (action === "follow-up") out = t.setFollowUp(tx, info.authRecord, data, meta);
    else if (action === "auto-match") {
      core.requirePermission(tx, info.authRecord, "prepare_bank_reconciliation", "match bank statements");
      out = t.autoMatch(tx, String(data.account || ""), info.authRecord);
      if (out.matched) {
        core.audit(tx, { actor: info.authRecord, action: "bank_auto_matched", collection: "bank_accounts", recordId: String(data.account || ""), label: "", comment: `${out.matched} statement line(s) matched automatically`, meta });
      }
    } else throw new NotFoundError(`Unknown action "${action}".`);
  });
  return c.json(200, out);
}, $apis.requireRecordAuth("users"));

routerAdd("GET", "/api/ims/treasury/:what", (c) => {
  const t = require(`${__hooks}/lib/treasury.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  const actor = info.admin ? null : info.authRecord;
  const what = c.pathParam("what");
  if (what === "position") return c.json(200, t.position(dao, actor));
  if (what === "workspace") return c.json(200, t.workspace(dao, actor, c.queryParam("account"), c.queryParam("as_of")));
  if (what === "reconciliation-preview") return c.json(200, t.preview(dao, actor, c.queryParam("account"), c.queryParam("as_of"), c.queryParam("statement_balance")));
  throw new NotFoundError("Not found.");
}, $apis.requireAdminOrRecordAuth());

routerAdd("GET", "/api/ims/treasury/reports/:key", (c) => {
  const t = require(`${__hooks}/lib/treasury.js`);
  const info = $apis.requestInfo(c);
  const f = {};
  for (const k of ["from", "to", "account"]) f[k] = c.queryParam(k) || "";
  return c.json(200, t.report($app.dao(), info.admin ? null : info.authRecord, c.pathParam("key"), f));
}, $apis.requireAdminOrRecordAuth());
