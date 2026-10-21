/// <reference path="../../pb_data/types.d.ts" />
/**
 * Fixed assets (M7). The register is written only here:
 *  - capitalisation of an asset received on a GRN, bought outside a PO or donated → GL: Dr asset / Cr goods received
 *    not invoiced (or deferred capital grants for a donation)
 *  - opening balances at go-live: one opening journal (cost, accumulated depreciation, accumulated surplus)
 *  - custodian / location and status changes by the Store & Asset Officer; transfers between departments approved
 *    by the DAF (approval engine type asset_transfer)
 *  - maintenance log
 *  - disposals: Store & Asset Officer → DAF → SG (engine type asset_disposal) → GL: accumulated depreciation, proceeds,
 *    gain or loss, cost
 *  - monthly depreciation: the Accountant calculates, the DAF approves (engine type depreciation_run) → GL, by
 *    department, funding source and project
 *  - verification counts and the reconciliation of the register with the GL
 * The depreciation policy comes from the category (method, useful life, rate, residual %); an asset may override the
 * method and the life. Amounts are whole RWF.
 */
const core = require("./core.js");

/** 1234567 → "1,234,567" (the JS engine has no locale formatting). */
const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const r0 = (n) => Math.round(Number(n) || 0);
const day = (v) => String(v || "").slice(0, 10);
const noon = (d) => `${d} 12:00:00.000Z`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Month index: year × 12 + month − 1. */
const mIndex = (y, m) => y * 12 + (m - 1);
const mOf = (d) => {
  const s = day(d);
  return /^\d{4}-\d{2}/.test(s) ? mIndex(parseInt(s.slice(0, 4), 10), parseInt(s.slice(5, 7), 10)) : null;
};
const mLabel = (k) => `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
const mKey = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
const mStart = (k) => `${mKey(k)}-01`;
const mEnd = (k) => new Date(Date.UTC(Math.floor(k / 12), (k % 12) + 1, 0)).toISOString().slice(0, 10);
const lastDep = (a) => (a.getString("last_depreciated") ? mOf(`${a.getString("last_depreciated")}-01`) : null);

const VIEW = ["view_fixed_assets", "manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation", "view_asset_reports", "export_assets", "view_assets"];
const STATUSES = ["in_stock", "in_use", "under_maintenance", "damaged", "lost"];
const STATUS_LABEL = { in_stock: "in store", in_use: "in use", under_maintenance: "under maintenance", damaged: "damaged", lost: "lost", disposed: "disposed" };
const CONDITIONS = ["new", "good", "fair", "poor", "damaged"];
const METHODS = ["sale", "auction", "donation", "scrap", "write_off", "theft_loss", "transfer_out"];
const METHOD_LABEL = { sale: "sale", auction: "public auction", donation: "donation", scrap: "scrapping", write_off: "write-off", theft_loss: "theft or loss", transfer_out: "transfer to another institution" };
const OPEN = ["draft", "pending_approval", "returned"];

const can = (dao, auth, p) => !!auth && core.can(dao, auth, p);
function requireAny(dao, auth, perms, what) {
  if (!auth) throw new UnauthorizedError("Please sign in again.");
  if (!perms.some((p) => core.can(dao, auth, p))) throw new ForbiddenError(`You don't have permission to ${what}. Ask an administrator to grant "${perms[0]}" to your role.`);
}
function load(dao, collection, id, what) {
  try {
    return dao.findRecordById(collection, String(id || ""));
  } catch (_) {
    throw new NotFoundError(`${what} not found.`);
  }
}
function find(dao, collection, id) {
  if (!id) return null;
  try {
    return dao.findRecordById(collection, String(id));
  } catch (_) {
    return null;
  }
}
function nameOf(dao, collection, id, field) {
  const r = find(dao, collection, id);
  return r ? r.getString(field || "name") : "";
}
const label = (a) => `${a.getString("code")} ${a.getString("name")}`.trim();

/** Member contributions: the funding source of everything not donor-funded. */
function defaultFunding(dao) {
  const mc = (dao.findRecordsByFilter("funding_sources", "code = 'MC'", "", 1, 0) || [])[0];
  return mc ? mc.id : "";
}

// ------------------------------------------------------------------ policy and depreciation
function policy(dao, a) {
  const cat = find(dao, "assets_categories", a.getString("category"));
  if (!cat) throw new BadRequestError(`${a.getString("code")} has no asset category. Complete the asset card first.`);
  return {
    cat,
    method: a.getString("method") || cat.getString("method") || "straight_line",
    life: a.getInt("useful_life_months") || cat.getInt("useful_life_months"),
    rate: cat.getFloat("rate"),
    residualPct: cat.getFloat("residual_percent"),
    threshold: cat.getInt("capitalisation_threshold"),
    assetAccount: cat.getString("asset_account"),
    accumulatedAccount: cat.getString("accumulated_account"),
    expenseAccount: cat.getString("expense_account"),
  };
}

const ACCOUNT_NAMES = { assetAccount: "cost", accumulatedAccount: "accumulated depreciation", expenseAccount: "depreciation expense" };
function requireAccounts(pol, keys) {
  const need = pol.method === "none" ? keys.filter((k) => k === "assetAccount") : keys;
  const missing = need.filter((k) => !pol[k]);
  if (missing.length) {
    throw new BadRequestError(`Category "${pol.cat.getString("name")}" has no ${missing.map((k) => ACCOUNT_NAMES[k]).join(" or ")} account. The DAF sets them in Fixed assets → Categories.`);
  }
}

/** Depreciation of an asset for month k when `acc` is already accumulated. */
function chargeFor(a, pol, k, acc) {
  if (pol.method === "none") return 0;
  const cost = r0(a.getFloat("cost"));
  const residual = r0(a.getInt("residual_value"));
  const start = mOf(a.getString("depreciation_start") || a.getString("purchased_at"));
  if (start === null || k < start) return 0;
  const left = cost - residual - acc;
  if (left <= 0) return 0;
  let c = 0;
  if (pol.method === "reducing_balance") {
    if (!(pol.rate > 0)) return 0;
    c = r0(((cost - acc) * pol.rate) / 1200);
  } else {
    if (!(pol.life > 0)) return 0;
    c = k >= start + pol.life - 1 ? left : r0((cost - residual) / pol.life);
  }
  return Math.max(0, Math.min(c, left));
}

/** What is still to be charged up to month k (catching up months missed since the last charge). */
function dueUpTo(a, pol, k) {
  const start = mOf(a.getString("depreciation_start") || a.getString("purchased_at"));
  if (start === null) return { charge: 0, months: 0 };
  const last = lastDep(a);
  let m = Math.max(start, last === null ? start : last + 1);
  let acc = a.getInt("accumulated_depreciation");
  let charge = 0;
  let months = 0;
  for (; m <= k && months < 600; m++) {
    const c = chargeFor(a, pol, m, acc + charge);
    if (c > 0) months++;
    charge += c;
  }
  return { charge, months };
}

/** The depreciation still to come, month by month. */
function projection(dao, auth, id) {
  const a = load(dao, "assets", id, "Asset");
  requireRead(dao, auth, a);
  if (a.getString("status") === "disposed") return { rows: [], note: "Disposed." };
  const pol = policy(dao, a);
  const cost = r0(a.getFloat("cost"));
  const start = mOf(a.getString("depreciation_start") || a.getString("purchased_at"));
  if (start === null || pol.method === "none") return { rows: [], method: pol.method, note: pol.method === "none" ? "Not depreciated (land, or a category without depreciation)." : "" };
  const last = lastDep(a);
  let k = Math.max(start, last === null ? start : last + 1);
  let acc = a.getInt("accumulated_depreciation");
  const rows = [];
  while (rows.length < 600) {
    const c = chargeFor(a, pol, k, acc);
    if (!c) break;
    acc += c;
    rows.push({ period: mKey(k), label: mLabel(k), charge: c, accumulated: acc, net_book_value: cost - acc });
    k++;
  }
  return { rows, method: pol.method, life: pol.life, rate: pol.rate, residual: a.getInt("residual_value") };
}

// ------------------------------------------------------------------ read access
function requireRead(dao, auth, a) {
  if (!auth) return;
  if (VIEW.some((p) => core.can(dao, auth, p))) return;
  if (a && a.getString("assigned_to") === auth.id) return;
  if (a && auth.getString("department") && a.getString("department") === auth.getString("department") && core.can(dao, auth, "request_asset_transfer")) return;
  throw new ForbiddenError("You don't have access to this asset.");
}

// ------------------------------------------------------------------ the asset card and capitalisation
function userOk(dao, id, what) {
  const u = find(dao, "users", id);
  if (!u) throw new BadRequestError(`${what} not found.`);
  if (u.getString("status") && u.getString("status") !== "Active") throw new BadRequestError(`${u.getString("name")} is not an active employee.`);
  return u;
}

/** Copies the editable card fields from the input (relations are checked). */
function applyCard(dao, a, input) {
  const str = (k, max) => (input[k] !== undefined ? String(input[k] === null ? "" : input[k]).trim().slice(0, max || 500) : undefined);
  const set = (k, max) => {
    const v = str(k, max);
    if (v !== undefined) a.set(k, v);
  };
  set("name", 200);
  set("description", 1000);
  set("serial_number", 120);
  set("warranty", 200);
  set("location_name", 160);
  set("notes", 2000);
  for (const [k, col, what] of [["category", "assets_categories", "Asset category"], ["type", "assets_types", "Asset type"], ["department", "departments", "Department"], ["funding_source", "funding_sources", "Funding source"], ["project", "projects", "Project"], ["supplier", "suppliers", "Supplier"], ["invoice", "supplier_invoices", "Supplier invoice"]]) {
    const v = str(k, 40);
    if (v === undefined) continue;
    if (v && !find(dao, col, v)) throw new BadRequestError(`${what} not found.`);
    a.set(k, v);
  }
  if (input.assigned_to !== undefined) {
    const v = String(input.assigned_to || "");
    if (v) userOk(dao, v, "Custodian");
    a.set("assigned_to", v);
  }
  if (input.condition !== undefined) {
    if (input.condition && CONDITIONS.indexOf(input.condition) === -1) throw new BadRequestError("Unknown condition.");
    a.set("condition", input.condition || "");
  }
  if (input.method !== undefined) {
    if (input.method && ["straight_line", "reducing_balance", "none"].indexOf(input.method) === -1) throw new BadRequestError("Unknown depreciation method.");
    a.set("method", input.method || "");
  }
  if (input.useful_life_months !== undefined && input.useful_life_months !== "") {
    const life = parseInt(input.useful_life_months, 10) || 0;
    if (life < 0 || life > 1200) throw new BadRequestError("Give the useful life in months (at most 100 years).");
    a.set("useful_life_months", life);
  }
  if (a.getString("name").length < 3) throw new BadRequestError("Describe the asset (at least 3 characters).");
  if (!a.getString("category")) throw new BadRequestError("Choose the asset category.");
  if (!a.getString("department")) throw new BadRequestError("Choose the department that uses the asset.");
  const cat = find(dao, "assets_categories", a.getString("category"));
  if (cat && cat.get("active") === false && cat.getString("method")) throw new BadRequestError(`Category "${cat.getString("name")}" is not in use any more.`);
  // a custodian works in the asset's department (otherwise it is a transfer)
  const custodian = a.getString("assigned_to") ? find(dao, "users", a.getString("assigned_to")) : null;
  if (custodian && custodian.getString("department") && custodian.getString("department") !== a.getString("department")) {
    throw new BadRequestError(`${custodian.getString("name")} works in ${nameOf(dao, "departments", custodian.getString("department"))}, not in ${nameOf(dao, "departments", a.getString("department"))}. Choose someone in the asset's department, or transfer the asset.`);
  }
}

/** Puts an asset in the register and posts it to the GL (Dr asset / Cr goods received not invoiced, or donation). */
function capitalise(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "capitalise assets");
  const ledger = require("./ledger.js");
  const a = load(dao, "assets", id, "Asset");
  const code = a.getString("code");
  if (a.getBool("capitalised")) throw new BadRequestError(`${code} is already in the register.`);
  if (a.getString("status") === "disposed") throw new BadRequestError(`${code} was disposed of.`);
  applyCard(dao, a, input || {});
  if (!a.getString("funding_source")) a.set("funding_source", defaultFunding(dao));
  // the cost of an asset received on a GRN comes from the purchase order
  if (!a.getString("goods_receipt") && input.cost !== undefined) a.set("cost", r0(input.cost));
  const cost = r0(a.getFloat("cost"));
  if (cost <= 0) throw new BadRequestError("Give the cost of the asset.");
  a.set("cost", cost);
  const acquired = day(input.purchased_at) || day(a.getString("purchased_at")) || todayStr();
  if (acquired > todayStr()) throw new BadRequestError("The acquisition date cannot be in the future.");
  a.set("purchased_at", noon(acquired));
  const pol = policy(dao, a);
  requireAccounts(pol, ["assetAccount", "accumulatedAccount", "expenseAccount"]);
  if (pol.threshold && cost < pol.threshold) {
    throw new BadRequestError(`RWF ${num(cost)} is below the capitalisation threshold of ${pol.cat.getString("name")} (RWF ${num(pol.threshold)}): it is an expense, not a fixed asset.`);
  }
  const residual = input.residual_value !== undefined && input.residual_value !== "" ? r0(input.residual_value) : r0((cost * pol.residualPct) / 100);
  if (residual < 0 || residual >= cost) throw new BadRequestError("The residual value must be below the cost.");
  a.set("residual_value", residual);
  const start = day(input.depreciation_start) || mStart(mOf(acquired) + 1);
  if (start < mStart(mOf(acquired))) throw new BadRequestError("Depreciation cannot start before the asset was acquired.");
  a.set("depreciation_start", noon(start));
  const date = day(input.date) || todayStr();
  if (date > todayStr()) throw new BadRequestError("The capitalisation date cannot be in the future.");
  const type = input.acquisition_type === "donation" ? "donation" : "purchase";
  const credit = ledger.accountFor(dao, type === "donation" ? "assets.donated" : "assets.grni");
  const grn = a.getString("goods_receipt") ? find(dao, "goods_receipts", a.getString("goods_receipt")) : null;
  const dims = { department: a.getString("department"), funding_source: a.getString("funding_source"), project: a.getString("project") };
  const j = ledger.post(dao, {
    date, source: { type: "asset", id: a.id, number: code }, description: `Capitalisation of ${label(a)}`.slice(0, 500), actor: auth, meta,
    what: `the capitalisation of ${code}`,
    lines: [
      Object.assign({ account: pol.assetAccount, debit: cost, description: label(a) }, dims),
      { account: credit.id, credit: cost, funding_source: dims.funding_source, description: type === "donation" ? `Donated asset ${code}` : `${code} received${grn ? ` on ${grn.getString("number")}` : ""}, not yet invoiced` },
    ],
  });
  a.set("capitalised", true);
  a.set("capitalised_at", noon(date));
  a.set("capitalised_by", auth.id);
  a.set("capitalisation_journal", j.id);
  a.set("acquisition_type", type);
  a.set("accumulated_depreciation", 0);
  a.set("net_book_value", cost);
  if (!a.getString("condition")) a.set("condition", "new");
  if (["in_stock", "in_use", "", "assigned", "in-use", "returned"].indexOf(a.getString("status")) !== -1) a.set("status", a.getString("assigned_to") ? "in_use" : "in_stock");
  if (a.getString("assigned_to") && !a.getString("assigned_at")) a.set("assigned_at", new Date().toISOString());
  dao.saveRecord(a);
  core.audit(dao, { actor: auth, action: "asset_capitalised", collection: "assets", recordId: a.id, label: label(a), comment: `RWF ${num(cost)} · ${j.getString("number")}`, meta });
  return a;
}

/** An asset that did not come through a purchase order (bought by voucher, donated). */
function registerAsset(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "register assets");
  const a = new Record(dao.findCollectionByNameOrId("assets"));
  a.set("code", core.nextNumber(dao, "asset"));
  a.set("status", "in_stock");
  a.set("created_by", auth.id);
  a.set("name", String(input.name || "").trim().slice(0, 200));
  a.set("cost", r0(input.cost));
  a.set("purchased_at", noon(day(input.purchased_at) || todayStr()));
  dao.saveRecord(a);
  return capitalise(dao, auth, a.id, input, meta);
}

/** Resolves a reference given as id, code, name or e-mail. */
function resolve(dao, collection, v, fields) {
  const s = String(v || "").trim();
  if (!s) return null;
  const byId = find(dao, collection, s);
  if (byId) return byId;
  for (const f of fields) {
    const r = (dao.findRecordsByFilter(collection, `${f} = {:v}`, "", 1, 0, { v: s }) || [])[0];
    if (r) return r;
  }
  return null;
}

/**
 * Opening balances at go-live: the assets RALGA already owns, with their accumulated depreciation at that date.
 * One opening journal: Dr cost, Cr accumulated depreciation, Cr accumulated surplus (the net book value).
 */
function opening(dao, auth, input, meta) {
  requireAny(dao, auth, ["approve_fixed_assets", "manage_chart_of_accounts"], "enter the opening asset register");
  const ledger = require("./ledger.js");
  const asOf = day(input.as_of);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new BadRequestError("Give the go-live date of the register.");
  const rows = input.assets || [];
  if (!rows.length) throw new BadRequestError("No assets to load.");
  if (rows.length > 3000) throw new BadRequestError("At most 3,000 assets at a time.");
  const fund = defaultFunding(dao);
  const errors = [];
  const plan = rows.map((x, i) => {
    const row = i + 1;
    const err = (t) => errors.push(`Row ${row}: ${t}`);
    const cat = resolve(dao, "assets_categories", x.category, ["code", "name"]);
    const dept = resolve(dao, "departments", x.department, ["code", "name"]);
    const custodian = x.custodian ? resolve(dao, "users", x.custodian, ["email"]) : null;
    const funding = x.funding_source ? resolve(dao, "funding_sources", x.funding_source, ["code"]) : null;
    const project = x.project ? resolve(dao, "projects", x.project, ["code"]) : null;
    const cost = r0(x.cost);
    const acc = r0(x.accumulated);
    const acquired = day(x.purchased_at);
    if (!String(x.name || "").trim()) err("the description is missing");
    if (!cat) err(`category "${x.category}" not found`);
    if (!dept) err(`department "${x.department}" not found`);
    if (x.custodian && !custodian) err(`custodian "${x.custodian}" not found`);
    if (x.funding_source && !funding) err(`funding source "${x.funding_source}" not found`);
    if (x.project && !project) err(`project "${x.project}" not found`);
    if (cost <= 0) err("the cost must be more than zero");
    if (acc < 0 || acc > cost) err("the accumulated depreciation must be between 0 and the cost");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acquired) || acquired >= asOf) err("the acquisition date must be before the go-live date");
    if (x.code && (dao.findRecordsByFilter("assets", "code = {:c}", "", 1, 0, { c: String(x.code) }) || []).length) err(`tag ${x.code} is already used`);
    return { x, cat, dept, custodian, funding, project, cost, acc, acquired };
  });
  if (errors.length) throw new BadRequestError(`The opening register has problems — nothing was loaded. ${errors.slice(0, 15).join("; ")}${errors.length > 15 ? ` (and ${errors.length - 15} more)` : ""}.`);
  const equity = ledger.accountFor(dao, "assets.opening_equity");
  const col = dao.findCollectionByNameOrId("assets");
  const lines = [];
  const created = [];
  const goLive = mOf(asOf);
  for (const p of plan) {
    const a = new Record(col);
    a.set("code", p.x.code ? String(p.x.code).trim() : core.nextNumber(dao, "asset"));
    a.set("name", String(p.x.name).trim().slice(0, 200));
    a.set("description", String(p.x.description || "").slice(0, 1000));
    a.set("serial_number", String(p.x.serial_number || "").slice(0, 120));
    a.set("category", p.cat.id);
    a.set("department", p.dept.id);
    a.set("location_name", String(p.x.location_name || "").slice(0, 160));
    a.set("assigned_to", p.custodian ? p.custodian.id : "");
    if (p.custodian) a.set("assigned_at", noon(asOf));
    a.set("funding_source", p.funding ? p.funding.id : fund);
    a.set("project", p.project ? p.project.id : "");
    a.set("cost", p.cost);
    a.set("purchased_at", noon(p.acquired));
    a.set("depreciation_start", noon(day(p.x.depreciation_start) || mStart(mOf(p.acquired) + 1)));
    if (p.x.useful_life_months) a.set("useful_life_months", parseInt(p.x.useful_life_months, 10) || 0);
    if (p.x.method) a.set("method", p.x.method);
    const pol = policy(dao, a);
    requireAccounts(pol, ["assetAccount", "accumulatedAccount", "expenseAccount"]);
    a.set("residual_value", p.x.residual_value !== undefined && p.x.residual_value !== "" ? r0(p.x.residual_value) : r0((p.cost * pol.residualPct) / 100));
    a.set("opening_accumulated", p.acc);
    a.set("accumulated_depreciation", p.acc);
    a.set("net_book_value", p.cost - p.acc);
    const start = mOf(a.getString("depreciation_start"));
    if (start !== null && start <= goLive - 1) a.set("last_depreciated", mKey(goLive - 1));
    a.set("capitalised", true);
    a.set("capitalised_at", noon(asOf));
    a.set("capitalised_by", auth.id);
    a.set("acquisition_type", "opening_balance");
    a.set("condition", CONDITIONS.indexOf(p.x.condition) !== -1 ? p.x.condition : "good");
    // in service at go-live (shared assets have a location but no personal custodian), unless kept in the store
    a.set("status", p.x.status === "in_stock" && !p.custodian ? "in_stock" : "in_use");
    a.set("created_by", auth.id);
    dao.saveRecord(a);
    created.push(a);
    const dims = { department: a.getString("department"), funding_source: a.getString("funding_source"), project: a.getString("project") };
    lines.push(Object.assign({ account: pol.assetAccount, debit: p.cost, description: "Fixed assets at go-live" }, dims));
    if (p.acc) lines.push(Object.assign({ account: pol.accumulatedAccount, credit: p.acc, description: "Accumulated depreciation at go-live" }, dims));
    if (p.cost - p.acc) lines.push({ account: equity.id, credit: p.cost - p.acc, funding_source: dims.funding_source, description: "Net book value of fixed assets at go-live" });
  }
  const j = ledger.post(dao, {
    date: asOf, journalType: "opening", source: { type: "asset_opening", id: "", number: `Opening register ${asOf}` },
    description: `Fixed asset register at go-live (${created.length} assets)`, actor: auth, meta, what: "the opening asset register", lines,
  });
  for (const a of created) {
    a.set("capitalisation_journal", j.id);
    dao.saveRecord(a);
  }
  core.audit(dao, { actor: auth, action: "asset_opening_register", collection: "assets", recordId: "", label: `${created.length} assets`, comment: j.getString("number"), meta });
  return { count: created.length, journal: j.getString("number"), journal_id: j.id, cost: plan.reduce((t, p) => t + p.cost, 0), accumulated: plan.reduce((t, p) => t + p.acc, 0) };
}

// ------------------------------------------------------------------ movements
function movement(dao, a, auth, fields) {
  const m = new Record(dao.findCollectionByNameOrId("asset_movements"));
  m.set("asset", a.id);
  m.set("from_department", a.getString("department"));
  m.set("from_custodian", a.getString("assigned_to"));
  m.set("from_location", a.getString("location_name"));
  m.set("from_status", a.getString("status"));
  m.set("status", "approved");
  m.set("requested_by", auth ? auth.id : "");
  m.set("effective_date", noon(todayStr()));
  for (const k of Object.keys(fields)) m.set(k, fields[k]);
  dao.saveRecord(m);
  return m;
}

/** Custodian or location change inside the asset's department (immediate). Optionally answers an equipment request. */
function assign(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "assign assets");
  const a = load(dao, "assets", id, "Asset");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was disposed of.`);
  const to = String(input.custodian || "").trim();
  const custodian = to ? userOk(dao, to, "Custodian") : null;
  if (custodian && custodian.getString("department") && a.getString("department") && custodian.getString("department") !== a.getString("department")) {
    throw new BadRequestError(`${custodian.getString("name")} works in ${nameOf(dao, "departments", custodian.getString("department"))}; ${a.getString("code")} belongs to ${nameOf(dao, "departments", a.getString("department"))}. Transfer the asset to that department instead.`);
  }
  const loc = input.location_name !== undefined ? String(input.location_name || "").trim().slice(0, 160) : a.getString("location_name");
  if (to === a.getString("assigned_to") && loc === a.getString("location_name")) throw new BadRequestError("Nothing changes.");
  if (to && ["lost", "damaged"].indexOf(a.getString("status")) !== -1) throw new BadRequestError(`${a.getString("code")} is ${STATUS_LABEL[a.getString("status")]}; it cannot be given to anyone.`);
  const reason = String(input.reason || "").trim().slice(0, 1000);
  let request = null;
  if (input.request) {
    request = load(dao, "assets_requests", input.request, "Equipment request");
    if (request.getString("status") !== "pending") throw new BadRequestError("That equipment request was already answered.");
    if (request.getString("requested_by") !== to) throw new BadRequestError("Give the asset to the person who asked for it.");
  }
  const newStatus = ["in_stock", "in_use"].indexOf(a.getString("status")) !== -1 || !a.getString("status") ? (to ? "in_use" : "in_stock") : a.getString("status");
  movement(dao, a, auth, {
    kind: "assignment", to_department: a.getString("department"), to_custodian: to, to_location: loc, to_status: newStatus,
    reason: reason || (request ? `Equipment request: ${request.getString("notes")}`.slice(0, 1000) : to ? "Given to the custodian" : "Returned to the store"),
  });
  a.set("assigned_to", to);
  a.set("assigned_at", to ? new Date().toISOString() : "");
  a.set("location_name", loc);
  a.set("status", newStatus);
  dao.saveRecord(a);
  if (request) {
    request.set("status", "approved");
    request.set("asset", a.id);
    request.set("approved_by", auth.id);
    request.set("decided_at", new Date().toISOString());
    request.set("decision_comment", reason);
    dao.saveRecord(request);
    core.notify(dao, [to], { title: `Equipment ready: ${label(a)}`, body: loc ? `Collect it at ${loc}.` : "Collect it from the store.", link: "/dashboard/my/equipment", type: "success" });
  }
  core.audit(dao, { actor: auth, action: to ? "asset_assigned" : "asset_returned", collection: "assets", recordId: a.id, label: label(a), comment: custodian ? custodian.getString("name") : "store", meta });
  return a;
}

/** Status change (in store, in use, under maintenance, damaged, lost) with the reason. */
function setStatus(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "change the status of assets");
  const a = load(dao, "assets", id, "Asset");
  const to = String(input.status || "");
  if (STATUSES.indexOf(to) === -1) throw new BadRequestError("Choose the new status.");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was disposed of.`);
  if (a.getString("status") === to) throw new BadRequestError(`${a.getString("code")} is already ${STATUS_LABEL[to]}.`);
  if (to === "in_use" && !a.getString("assigned_to") && !a.getString("location_name")) throw new BadRequestError("Give the asset a custodian or a location to put it in use.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Say why the status changes.");
  movement(dao, a, auth, { kind: "status_change", to_department: a.getString("department"), to_custodian: a.getString("assigned_to"), to_location: a.getString("location_name"), to_status: to, reason: reason.slice(0, 1000) });
  a.set("status", to);
  if (to === "damaged") a.set("condition", "damaged");
  dao.saveRecord(a);
  core.audit(dao, { actor: auth, action: "asset_status", collection: "assets", recordId: a.id, label: label(a), comment: `${STATUS_LABEL[to]}: ${reason}`.slice(0, 300), meta });
  return a;
}

/** Transfer to another department: requested by the Store & Asset Officer or the department head, approved by the DAF. */
function requestTransfer(dao, auth, id, input, meta) {
  const a = load(dao, "assets", id, "Asset");
  const store = can(dao, auth, "manage_fixed_assets");
  const head = can(dao, auth, "request_asset_transfer") && auth.getString("department") && auth.getString("department") === a.getString("department");
  if (!store && !head) throw new ForbiddenError("Only the Store & Asset Officer, or the head of the department that holds the asset, can request a transfer.");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was disposed of.`);
  const open = dao.findRecordsByFilter("asset_movements", "asset = {:a} && kind = 'transfer' && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 1, 0, { a: a.id }) || [];
  if (open.length) throw new BadRequestError(`${a.getString("code")} already has a transfer waiting (${open[0].getString("number")}).`);
  const toDept = String(input.to_department || "");
  if (!find(dao, "departments", toDept)) throw new BadRequestError("Choose the department receiving the asset.");
  if (toDept === a.getString("department")) throw new BadRequestError("The asset is already in that department; change the custodian instead.");
  const to = String(input.to_custodian || "");
  if (to) {
    const u = userOk(dao, to, "New custodian");
    if (u.getString("department") && u.getString("department") !== toDept) throw new BadRequestError(`${u.getString("name")} does not work in ${nameOf(dao, "departments", toDept)}.`);
  }
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new BadRequestError("Explain the transfer (at least 10 characters).");
  const eff = day(input.effective_date) || todayStr();
  const m = new Record(dao.findCollectionByNameOrId("asset_movements"));
  m.set("number", core.nextNumber(dao, "asset_transfer"));
  m.set("asset", a.id);
  m.set("kind", "transfer");
  m.set("from_department", a.getString("department"));
  m.set("from_custodian", a.getString("assigned_to"));
  m.set("from_location", a.getString("location_name"));
  m.set("from_status", a.getString("status"));
  m.set("to_department", toDept);
  m.set("to_custodian", to);
  m.set("to_location", String(input.to_location || a.getString("location_name")).trim().slice(0, 160));
  m.set("reason", reason.slice(0, 1000));
  m.set("effective_date", noon(eff));
  m.set("status", "draft");
  m.set("requested_by", auth.id);
  dao.saveRecord(m);
  require("./approvals.js").start(dao, "asset_transfer", m, auth, meta);
  return m;
}

function onTransferApproved(dao, m, actor, meta) {
  const a = load(dao, "assets", m.getString("asset"), "Asset");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was disposed of; the transfer cannot be completed.`);
  const to = m.getString("to_custodian");
  a.set("department", m.getString("to_department"));
  a.set("assigned_to", to);
  a.set("assigned_at", to ? new Date().toISOString() : "");
  if (m.getString("to_location")) a.set("location_name", m.getString("to_location"));
  if (["in_stock", "in_use", ""].indexOf(a.getString("status")) !== -1) a.set("status", to ? "in_use" : "in_stock");
  m.set("to_status", a.getString("status"));
  dao.saveRecord(m);
  dao.saveRecord(a);
  core.notify(dao, [m.getString("requested_by"), to].filter(Boolean), {
    title: `Transfer approved: ${label(a)}`, body: `Now with ${nameOf(dao, "departments", m.getString("to_department"))}${to ? ` (${nameOf(dao, "users", to)})` : ""}.`,
    link: `/dashboard/assets/register/${a.id}`, type: "success",
  });
  core.audit(dao, { actor, action: "asset_transferred", collection: "assets", recordId: a.id, label: label(a), comment: `${m.getString("number")} → ${nameOf(dao, "departments", m.getString("to_department"))}`, meta });
}

function cancelTransfer(dao, auth, id, input, meta) {
  const m = load(dao, "asset_movements", id, "Transfer");
  if (m.getString("kind") !== "transfer") throw new BadRequestError("Only a transfer can be cancelled.");
  if (m.getString("requested_by") !== auth.id && !can(dao, auth, "manage_fixed_assets")) throw new ForbiddenError("Only the person who asked for the transfer, or the Store & Asset Officer, can cancel it.");
  if (OPEN.indexOf(m.getString("status")) === -1) throw new BadRequestError(`${m.getString("number")} is ${m.getString("status").replace(/_/g, " ")}.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason for cancelling.");
  m.set("decision_comment", reason.slice(0, 1000));
  if (m.getString("approval")) return require("./approvals.js").cancel(dao, "asset_transfer", m, auth, reason, meta) || m;
  m.set("status", "cancelled");
  m.set("cancel_reason", reason.slice(0, 500));
  dao.saveRecord(m);
  core.audit(dao, { actor: auth, action: "cancelled", collection: "asset_movements", recordId: m.id, label: m.getString("number"), comment: reason, meta });
  return m;
}

// ------------------------------------------------------------------ maintenance
const MAINTENANCE = ["service", "repair", "inspection", "upgrade", "insurance", "other"];
function addMaintenance(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "record maintenance");
  const a = load(dao, "assets", id, "Asset");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was disposed of.`);
  const d = day(input.date) || todayStr();
  if (d > todayStr()) throw new BadRequestError("Record maintenance once it is done (the date cannot be in the future).");
  const kind = MAINTENANCE.indexOf(input.kind) !== -1 ? input.kind : "service";
  const description = String(input.description || "").trim();
  if (description.length < 5) throw new BadRequestError("Describe the work done.");
  const cost = r0(input.cost);
  if (cost < 0) throw new BadRequestError("The cost cannot be negative.");
  const next = day(input.next_due);
  if (next && next <= d) throw new BadRequestError("The next service date must be after this one.");
  if (input.supplier && !find(dao, "suppliers", input.supplier)) throw new BadRequestError("Supplier not found.");
  const r = new Record(dao.findCollectionByNameOrId("asset_maintenance"));
  r.set("asset", a.id);
  r.set("date", noon(d));
  r.set("kind", kind);
  r.set("description", description.slice(0, 1000));
  r.set("supplier", input.supplier || "");
  r.set("provider", String(input.provider || "").trim().slice(0, 160));
  r.set("cost", cost);
  r.set("downtime_days", Math.max(0, parseInt(input.downtime_days, 10) || 0));
  r.set("next_due", next ? noon(next) : "");
  r.set("recorded_by", auth.id);
  dao.saveRecord(r);
  core.audit(dao, { actor: auth, action: "asset_maintenance", collection: "assets", recordId: a.id, label: label(a), comment: `${kind}: ${description}`.slice(0, 300), meta });
  return r;
}

// ------------------------------------------------------------------ disposals
function figures(a, proceeds) {
  const cost = r0(a.getFloat("cost"));
  const acc = a.getBool("capitalised") ? a.getInt("accumulated_depreciation") : 0;
  const nbv = a.getBool("capitalised") ? cost - acc : 0;
  return { cost, acc, nbv, gain: r0(proceeds) - nbv };
}

function saveDisposal(dao, auth, assetId, input, meta, existing) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "prepare asset disposals");
  const a = load(dao, "assets", assetId, "Asset");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was already disposed of.`);
  const others = (dao.findRecordsByFilter("asset_disposals", "asset = {:a} && (status = 'draft' || status = 'pending_approval' || status = 'returned')", "", 5, 0, { a: a.id }) || []).filter((d) => !existing || d.id !== existing.id);
  if (others.length) throw new BadRequestError(`${a.getString("code")} already has a disposal in progress (${others[0].getString("number")}).`);
  const method = String(input.method || "");
  if (METHODS.indexOf(method) === -1) throw new BadRequestError("Choose how the asset is disposed of.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 10) throw new BadRequestError("Explain why the asset is disposed of (at least 10 characters).");
  const d = day(input.disposal_date) || todayStr();
  if (d < day(a.getString("purchased_at"))) throw new BadRequestError("The disposal date is before the asset was acquired.");
  const sold = method === "sale" || method === "auction";
  const proceeds = sold ? r0(input.proceeds) : 0;
  if (proceeds < 0) throw new BadRequestError("The proceeds cannot be negative.");
  const buyer = String(input.buyer || "").trim().slice(0, 200);
  if (sold && !buyer) throw new BadRequestError("Name the buyer.");
  const r = existing || new Record(dao.findCollectionByNameOrId("asset_disposals"));
  if (!existing) {
    r.set("number", core.nextNumber(dao, "asset_disposal"));
    r.set("asset", a.id);
    r.set("prepared_by", auth.id);
    r.set("status", "draft");
  }
  const f = figures(a, proceeds);
  r.set("method", method);
  r.set("reason", reason.slice(0, 1000));
  r.set("disposal_date", noon(d));
  r.set("proceeds", proceeds);
  r.set("buyer", buyer);
  r.set("cost", f.cost);
  r.set("accumulated", f.acc);
  r.set("net_book_value", f.nbv);
  r.set("gain_loss", f.gain);
  dao.saveRecord(r);
  core.audit(dao, { actor: auth, action: existing ? "updated" : "created", collection: "asset_disposals", recordId: r.id, label: r.getString("number"), comment: `${label(a)} · ${METHOD_LABEL[method]}`, meta });
  return r;
}

function createDisposal(dao, auth, assetId, input, meta) {
  return saveDisposal(dao, auth, assetId, input, meta, null);
}

function updateDisposal(dao, auth, id, input, meta) {
  const r = load(dao, "asset_disposals", id, "Disposal");
  if (["draft", "returned"].indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}; it cannot be changed.`);
  return saveDisposal(dao, auth, r.getString("asset"), input, meta, r);
}

function submitDisposal(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "submit asset disposals");
  const r = load(dao, "asset_disposals", id, "Disposal");
  if (["draft", "returned"].indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}.`);
  const a = load(dao, "assets", r.getString("asset"), "Asset");
  const f = figures(a, r.getInt("proceeds"));
  r.set("cost", f.cost);
  r.set("accumulated", f.acc);
  r.set("net_book_value", f.nbv);
  r.set("gain_loss", f.gain);
  dao.saveRecord(r);
  return require("./approvals.js").start(dao, "asset_disposal", r, auth, meta);
}

/** Final approval: the asset leaves the register; the GL removes its cost and accumulated depreciation. */
function onDisposalApproved(dao, r, actor, meta) {
  const ledger = require("./ledger.js");
  const a = load(dao, "assets", r.getString("asset"), "Asset");
  if (a.getString("status") === "disposed") throw new BadRequestError(`${a.getString("code")} was already disposed of.`);
  const proceeds = r.getInt("proceeds");
  const f = figures(a, proceeds);
  const date = day(r.getString("disposal_date")) > todayStr() ? todayStr() : day(r.getString("disposal_date"));
  if (a.getBool("capitalised")) {
    const pol = policy(dao, a);
    requireAccounts(pol, ["assetAccount", "accumulatedAccount"]);
    const dims = { department: a.getString("department"), funding_source: a.getString("funding_source"), project: a.getString("project") };
    const lines = [];
    if (f.acc) lines.push(Object.assign({ account: pol.accumulatedAccount, debit: f.acc, description: `Accumulated depreciation of ${a.getString("code")}` }, dims));
    if (proceeds) lines.push(Object.assign({ account: ledger.accountFor(dao, "assets.disposal_proceeds").id, debit: proceeds, description: `Proceeds from ${a.getString("code")} (${r.getString("buyer")})`.slice(0, 300) }, dims));
    if (f.gain < 0) lines.push(Object.assign({ account: ledger.accountFor(dao, "assets.disposal_loss").id, debit: -f.gain, description: `Loss on disposal of ${a.getString("code")}` }, dims));
    if (f.gain > 0) lines.push(Object.assign({ account: ledger.accountFor(dao, "assets.disposal_gain").id, credit: f.gain, description: `Gain on disposal of ${a.getString("code")}` }, dims));
    lines.push(Object.assign({ account: pol.assetAccount, credit: f.cost, description: `Cost of ${a.getString("code")} disposed` }, dims));
    const j = ledger.post(dao, {
      date, source: { type: "asset_disposal", id: r.id, number: r.getString("number") }, description: `Disposal of ${label(a)} (${METHOD_LABEL[r.getString("method")]})`.slice(0, 500),
      actor, meta, what: `the disposal ${r.getString("number")}`, lines,
    });
    r.set("journal", j.id);
  }
  r.set("cost", f.cost);
  r.set("accumulated", f.acc);
  r.set("net_book_value", f.nbv);
  r.set("gain_loss", f.gain);
  dao.saveRecord(r);
  movement(dao, a, actor, { kind: "status_change", to_department: a.getString("department"), to_custodian: "", to_location: "", to_status: "disposed", reason: `${r.getString("number")}: ${METHOD_LABEL[r.getString("method")]} — ${r.getString("reason")}`.slice(0, 1000) });
  a.set("status", "disposed");
  a.set("disposed_at", noon(date));
  a.set("disposal", r.id);
  a.set("assigned_to", "");
  a.set("net_book_value", 0);
  dao.saveRecord(a);
  core.notify(dao, [r.getString("prepared_by")], { title: `Disposal approved: ${r.getString("number")}`, body: label(a), link: `/dashboard/assets/disposals/${r.id}`, type: "success" });
}

function cancelDisposal(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "cancel asset disposals");
  const r = load(dao, "asset_disposals", id, "Disposal");
  if (OPEN.indexOf(r.getString("status")) === -1) throw new BadRequestError(`${r.getString("number")} is ${r.getString("status").replace(/_/g, " ")}.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason for cancelling.");
  if (r.getString("approval")) {
    require("./approvals.js").cancel(dao, "asset_disposal", r, auth, reason.slice(0, 500), meta);
    return r;
  }
  r.set("status", "cancelled");
  r.set("cancel_reason", reason.slice(0, 500));
  dao.saveRecord(r);
  core.audit(dao, { actor: auth, action: "cancelled", collection: "asset_disposals", recordId: r.id, label: r.getString("number"), comment: reason, meta });
  return r;
}

// ------------------------------------------------------------------ depreciation runs
function runsOrdered(dao) {
  return (dao.findRecordsByFilter("depreciation_runs", "status != 'cancelled' && status != 'rejected'", "", 0, 0) || []).sort((x, y) => mIndex(y.getInt("year"), y.getInt("month")) - mIndex(x.getInt("year"), x.getInt("month")));
}

/** Calculates (or recalculates) the depreciation of a month: one line per asset, catching up missed months. */
function buildRun(dao, auth, y, m, existing) {
  const k = mIndex(y, m);
  if (k > mOf(todayStr())) throw new BadRequestError(`${mLabel(k)} has not started yet.`);
  const end = mEnd(k);
  const period = require("./masterdata.js").requireOpenPeriod(dao, noon(end), `the depreciation of ${mLabel(k)}`);
  const runs = runsOrdered(dao).filter((r) => !existing || r.id !== existing.id);
  const same = runs.find((r) => mIndex(r.getInt("year"), r.getInt("month")) === k);
  if (same) throw new BadRequestError(`The depreciation of ${mLabel(k)} is ${same.getString("status") === "approved" ? "already posted" : same.getString("status") === "pending_approval" ? "waiting for approval" : "already prepared"} (${same.getString("number")}).`);
  const later = runs.find((r) => mIndex(r.getInt("year"), r.getInt("month")) > k);
  if (later) throw new BadRequestError(`${later.getString("number")} (${later.getString("period_label")}) is later; months are depreciated in order.`);
  const prev = runs.find((r) => r.getString("status") === "approved");
  if (prev && mIndex(prev.getInt("year"), prev.getInt("month")) !== k - 1) throw new BadRequestError(`Post the depreciation of ${mLabel(mIndex(prev.getInt("year"), prev.getInt("month")) + 1)} first: months are depreciated in order.`);
  const waiting = runs.find((r) => r.getString("status") !== "approved");
  if (waiting) throw new BadRequestError(`${waiting.getString("number")} (${waiting.getString("period_label")}) is not posted yet.`);

  const list = dao.findRecordsByFilter("assets", "capitalised = true && status != 'disposed'", "code", 0, 0) || [];
  const lines = [];
  const missing = {};
  for (const a of list) {
    const last = lastDep(a);
    if (last !== null && last >= k) continue;
    let pol;
    try {
      pol = policy(dao, a);
    } catch (_) {
      continue;
    }
    if (pol.method === "none") continue;
    if (!pol.expenseAccount || !pol.accumulatedAccount) {
      missing[pol.cat.getString("name")] = true;
      continue;
    }
    const due = dueUpTo(a, pol, k);
    if (!due.charge) continue;
    const before = a.getInt("accumulated_depreciation");
    lines.push({
      asset: a.id, category: pol.cat.id, department: a.getString("department"), funding_source: a.getString("funding_source"), project: a.getString("project"),
      method: pol.method, cost: r0(a.getFloat("cost")), residual_value: a.getInt("residual_value"), accumulated_before: before, charge: due.charge,
      accumulated_after: before + due.charge, net_book_value: r0(a.getFloat("cost")) - before - due.charge, months: due.months,
    });
  }
  if (Object.keys(missing).length) throw new BadRequestError(`These categories have no depreciation accounts: ${Object.keys(missing).join(", ")}. The DAF sets them in Fixed assets → Categories.`);
  const run = existing || new Record(dao.findCollectionByNameOrId("depreciation_runs"));
  if (!existing) {
    run.set("number", core.nextNumber(dao, "depreciation_run"));
    run.set("status", "draft");
  } else {
    for (const l of dao.findRecordsByFilter("depreciation_lines", "run = {:r}", "", 0, 0, { r: run.id }) || []) dao.deleteRecord(l);
  }
  const byCat = {};
  for (const l of lines) {
    const c = byCat[l.category] || (byCat[l.category] = { category: l.category, name: nameOf(dao, "assets_categories", l.category), count: 0, total: 0 });
    c.count++;
    c.total += l.charge;
  }
  run.set("year", y);
  run.set("month", m);
  run.set("period_label", mLabel(k));
  run.set("period", period.id);
  run.set("fiscal_year", period.getString("fiscal_year"));
  run.set("total", lines.reduce((t, l) => t + l.charge, 0));
  run.set("asset_count", lines.length);
  run.set("by_category", Object.values(byCat).sort((p, q) => q.total - p.total));
  run.set("prepared_by", auth.id);
  run.set("computed_at", new Date().toISOString());
  dao.saveRecord(run);
  const col = dao.findCollectionByNameOrId("depreciation_lines");
  for (const l of lines) {
    const r = new Record(col);
    r.set("run", run.id);
    for (const f of ["asset", "category", "department", "funding_source", "project", "method", "cost", "residual_value", "accumulated_before", "charge", "accumulated_after", "net_book_value"]) r.set(f, l[f]);
    r.set("year", y);
    r.set("month", m);
    r.set("status", "draft");
    dao.saveRecord(r);
  }
  return run;
}

function computeRun(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "run_depreciation", "calculate depreciation");
  const y = parseInt(input.year, 10);
  const m = parseInt(input.month, 10);
  if (!(y >= 2000 && m >= 1 && m <= 12)) throw new BadRequestError("Choose the month.");
  const run = buildRun(dao, auth, y, m, null);
  core.audit(dao, { actor: auth, action: "depreciation_calculated", collection: "depreciation_runs", recordId: run.id, label: run.getString("number"), comment: `${run.getString("period_label")} · RWF ${num(run.getInt("total"))}`, meta });
  return run;
}

function loadRun(dao, id) {
  return load(dao, "depreciation_runs", id, "Depreciation run");
}

function recalculateRun(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "run_depreciation", "calculate depreciation");
  const run = loadRun(dao, id);
  if (["draft", "returned"].indexOf(run.getString("status")) === -1) throw new BadRequestError(`${run.getString("number")} is ${run.getString("status").replace(/_/g, " ")}.`);
  buildRun(dao, auth, run.getInt("year"), run.getInt("month"), run);
  return run;
}

function submitRun(dao, auth, id, meta) {
  core.requirePermission(dao, auth, "run_depreciation", "submit depreciation");
  const run = loadRun(dao, id);
  if (["draft", "returned"].indexOf(run.getString("status")) === -1) throw new BadRequestError(`${run.getString("number")} is ${run.getString("status").replace(/_/g, " ")}.`);
  buildRun(dao, auth, run.getInt("year"), run.getInt("month"), run); // fresh figures
  if (!run.getInt("asset_count")) throw new BadRequestError(`Nothing to depreciate in ${run.getString("period_label")}.`);
  return require("./approvals.js").start(dao, "depreciation_run", run, auth, meta);
}

/** Final approval: the charge goes to the GL (by department, funding source and project) and to the assets. */
function onRunApproved(dao, run, actor, meta) {
  const ledger = require("./ledger.js");
  const k = mIndex(run.getInt("year"), run.getInt("month"));
  const rows = dao.findRecordsByFilter("depreciation_lines", "run = {:r}", "", 0, 0, { r: run.id }) || [];
  const cats = {};
  const lines = [];
  const posted = [];
  for (const l of rows) {
    const a = find(dao, "assets", l.getString("asset"));
    if (!a || a.getString("status") === "disposed" || a.getInt("accumulated_depreciation") !== l.getInt("accumulated_before")) {
      l.set("status", "skipped");
      dao.saveRecord(l);
      continue;
    }
    const cat = cats[l.getString("category")] || (cats[l.getString("category")] = find(dao, "assets_categories", l.getString("category")));
    if (!cat || !cat.getString("expense_account") || !cat.getString("accumulated_account")) throw new BadRequestError(`Category "${cat ? cat.getString("name") : "?"}" has no depreciation accounts.`);
    const dims = { department: l.getString("department"), funding_source: l.getString("funding_source"), project: l.getString("project") };
    lines.push(Object.assign({ account: cat.getString("expense_account"), debit: l.getInt("charge"), description: `Depreciation ${run.getString("period_label")} — ${cat.getString("name")}` }, dims));
    lines.push(Object.assign({ account: cat.getString("accumulated_account"), credit: l.getInt("charge"), description: `Depreciation ${run.getString("period_label")} — ${cat.getString("name")}` }, dims));
    posted.push([l, a]);
  }
  if (!posted.length) throw new BadRequestError("Nothing left to post: recalculate the run.");
  const j = ledger.post(dao, {
    date: mEnd(k), source: { type: "depreciation_run", id: run.id, number: run.getString("number") }, description: `Depreciation ${run.getString("period_label")}`,
    actor, meta, what: `the depreciation of ${run.getString("period_label")}`, lines,
  });
  for (const [l, a] of posted) {
    a.set("accumulated_depreciation", l.getInt("accumulated_after"));
    a.set("net_book_value", r0(a.getFloat("cost")) - l.getInt("accumulated_after"));
    a.set("last_depreciated", mKey(k));
    dao.saveRecord(a);
    l.set("status", "posted");
    dao.saveRecord(l);
  }
  run.set("journal", j.id);
  run.set("posted_at", new Date().toISOString());
  run.set("total", posted.reduce((t, x) => t + x[0].getInt("charge"), 0));
  run.set("asset_count", posted.length);
  dao.saveRecord(run);
  core.notify(dao, [run.getString("prepared_by")], { title: `Depreciation posted: ${run.getString("period_label")}`, body: `RWF ${num(run.getInt("total"))} · ${j.getString("number")}`, link: `/dashboard/assets/depreciation/${run.id}`, type: "success" });
}

function cancelRun(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "run_depreciation", "cancel depreciation runs");
  const run = loadRun(dao, id);
  if (OPEN.indexOf(run.getString("status")) === -1) throw new BadRequestError(`${run.getString("number")} is ${run.getString("status").replace(/_/g, " ")}.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason for cancelling.");
  for (const l of dao.findRecordsByFilter("depreciation_lines", "run = {:r}", "", 0, 0, { r: run.id }) || []) {
    l.set("status", "cancelled");
    dao.saveRecord(l);
  }
  if (run.getString("approval")) {
    require("./approvals.js").cancel(dao, "depreciation_run", run, auth, reason.slice(0, 500), meta);
    return run;
  }
  run.set("status", "cancelled");
  run.set("cancel_reason", reason.slice(0, 500));
  dao.saveRecord(run);
  core.audit(dao, { actor: auth, action: "cancelled", collection: "depreciation_runs", recordId: run.id, label: run.getString("number"), comment: reason, meta });
  return run;
}

// ------------------------------------------------------------------ verification and reconciliation
/** Posted depreciation per asset: [{ k, charge }]. */
function postedCharges(dao) {
  const out = {};
  for (const l of dao.findRecordsByFilter("depreciation_lines", "status = 'posted'", "", 0, 0) || []) {
    (out[l.getString("asset")] = out[l.getString("asset")] || []).push({ k: mIndex(l.getInt("year"), l.getInt("month")), charge: l.getInt("charge") });
  }
  return out;
}

/** The last month fully closed on a date: its own month on the last day, otherwise the month before. */
const monthsClosed = (d) => (d >= mEnd(mOf(d)) ? mOf(d) : mOf(d) - 1);

/** Depreciation posted per asset for the months closed on a date (the GL dates each run on the month's last day). */
function accumulatedAt(dao, d) {
  const k = monthsClosed(d);
  const out = {};
  const charges = postedCharges(dao);
  for (const id of Object.keys(charges)) out[id] = charges[id].reduce((t, x) => t + (x.k <= k ? x.charge : 0), 0);
  return out;
}

/** In the register on a date: capitalised by then and not disposed by then. */
const inRegister = (a, d) => a.getBool("capitalised") && day(a.getString("capitalised_at")) <= d && (!a.getString("disposed_at") || day(a.getString("disposed_at")) > d);

/** Register against the GL, per category: cost and accumulated depreciation. */
function reconcile(dao, asOf) {
  const acc = accumulatedAt(dao, asOf);
  const cats = dao.findRecordsByFilter("assets_categories", "id != ''", "name", 0, 0) || [];
  const assets = dao.findRecordsByFilter("assets", "capitalised = true", "", 0, 0) || [];
  const glBalance = (account, side) => {
    if (!account) return 0;
    let t = 0;
    for (const l of dao.findRecordsByFilter("gl_journal_lines", "account = {:a} && date <= {:d}", "", 0, 0, { a: account, d: `${asOf} 23:59:59.999Z` }) || []) t += side === "debit" ? l.getInt("debit") - l.getInt("credit") : l.getInt("credit") - l.getInt("debit");
    return t;
  };
  const rows = [];
  for (const c of cats) {
    if (!c.getString("asset_account")) continue;
    const mine = assets.filter((a) => a.getString("category") === c.id && inRegister(a, asOf));
    const regCost = mine.reduce((t, a) => t + r0(a.getFloat("cost")), 0);
    const regAcc = mine.reduce((t, a) => t + a.getInt("opening_accumulated") + (acc[a.id] || 0), 0);
    const glCost = glBalance(c.getString("asset_account"), "debit");
    const glAcc = glBalance(c.getString("accumulated_account"), "credit");
    if (!regCost && !glCost && !regAcc && !glAcc) continue;
    rows.push({
      category: c.getString("name"), asset_account: nameOf(dao, "gl_accounts", c.getString("asset_account"), "code"), assets: mine.length,
      register_cost: regCost, gl_cost: glCost, cost_difference: regCost - glCost,
      accumulated_account: nameOf(dao, "gl_accounts", c.getString("accumulated_account"), "code"),
      register_accumulated: regAcc, gl_accumulated: glAcc, accumulated_difference: regAcc - glAcc,
    });
  }
  return rows;
}

function startVerification(dao, auth, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "start an asset count");
  const title = String(input.title || "").trim();
  if (title.length < 5) throw new BadRequestError("Give the count a title, e.g. \"Year-end count June 2027\".");
  const asOf = day(input.as_of) || todayStr();
  if (asOf > todayStr()) throw new BadRequestError("The count date cannot be in the future.");
  const dept = String(input.department || "");
  if (dept && !find(dao, "departments", dept)) throw new BadRequestError("Department not found.");
  const loc = String(input.location || "").trim().toLowerCase();
  const list = (dao.findRecordsByFilter("assets", "status != 'disposed'", "code", 0, 0) || []).filter((a) => (!dept || a.getString("department") === dept) && (!loc || a.getString("location_name").toLowerCase().indexOf(loc) !== -1));
  if (!list.length) throw new BadRequestError("No asset matches this scope.");
  const v = new Record(dao.findCollectionByNameOrId("asset_verifications"));
  v.set("number", core.nextNumber(dao, "asset_verification"));
  v.set("title", title.slice(0, 200));
  v.set("as_of", noon(asOf));
  v.set("department", dept);
  v.set("location", String(input.location || "").trim().slice(0, 160));
  v.set("status", "open");
  v.set("started_by", auth.id);
  v.set("notes", String(input.notes || "").slice(0, 2000));
  dao.saveRecord(v);
  const col = dao.findCollectionByNameOrId("asset_verification_lines");
  for (const a of list) {
    const l = new Record(col);
    l.set("verification", v.id);
    l.set("asset", a.id);
    l.set("expected_location", a.getString("location_name"));
    l.set("expected_custodian", a.getString("assigned_to"));
    l.set("expected_department", a.getString("department"));
    l.set("result", "pending");
    dao.saveRecord(l);
  }
  core.audit(dao, { actor: auth, action: "created", collection: "asset_verifications", recordId: v.id, label: v.getString("number"), comment: `${title} · ${list.length} assets`, meta });
  return v;
}

const RESULTS = ["found", "missing", "damaged", "found_elsewhere"];
function countLine(dao, auth, lineId, input) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "record asset counts");
  const l = load(dao, "asset_verification_lines", lineId, "Count line");
  const v = load(dao, "asset_verifications", l.getString("verification"), "Asset count");
  if (v.getString("status") !== "open") throw new BadRequestError(`${v.getString("number")} is closed.`);
  const result = String(input.result || "");
  if (RESULTS.indexOf(result) === -1) throw new BadRequestError("Choose found, missing, damaged or found elsewhere.");
  const where = String(input.found_location || "").trim().slice(0, 160);
  if (result === "found_elsewhere" && !where) throw new BadRequestError("Say where the asset was found.");
  if (input.condition && CONDITIONS.indexOf(input.condition) === -1) throw new BadRequestError("Unknown condition.");
  l.set("result", result);
  l.set("condition", result === "damaged" ? "damaged" : input.condition || "");
  l.set("found_location", where);
  l.set("notes", String(input.notes || "").trim().slice(0, 500));
  l.set("checked_by", auth.id);
  l.set("checked_at", new Date().toISOString());
  dao.saveRecord(l);
  return l;
}

function completeVerification(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "complete asset counts");
  const v = load(dao, "asset_verifications", id, "Asset count");
  if (v.getString("status") !== "open") throw new BadRequestError(`${v.getString("number")} is ${v.getString("status")}.`);
  const lines = dao.findRecordsByFilter("asset_verification_lines", "verification = {:v}", "", 0, 0, { v: v.id }) || [];
  const pending = lines.filter((l) => l.getString("result") === "pending").length;
  if (pending) throw new BadRequestError(`${pending} asset${pending === 1 ? " is" : "s are"} not counted yet.`);
  const asOf = day(v.getString("as_of"));
  const summary = { total: lines.length, found: 0, missing: 0, damaged: 0, found_elsewhere: 0, missing_cost: 0, missing_nbv: 0, damaged_nbv: 0 };
  for (const l of lines) {
    const a = find(dao, "assets", l.getString("asset"));
    const result = l.getString("result");
    summary[result]++;
    if (!a) continue;
    const nbv = a.getBool("capitalised") ? r0(a.getFloat("cost")) - a.getInt("accumulated_depreciation") : 0;
    if (result === "missing") {
      summary.missing_cost += r0(a.getFloat("cost"));
      summary.missing_nbv += nbv;
    }
    if (result === "damaged") summary.damaged_nbv += nbv;
    if (result === "missing" && a.getString("status") !== "lost") movement(dao, a, auth, { kind: "verification", to_department: a.getString("department"), to_custodian: a.getString("assigned_to"), to_location: a.getString("location_name"), to_status: "lost", reason: `Not found at the count ${v.getString("number")}` });
    if (result === "damaged" && a.getString("status") !== "damaged") movement(dao, a, auth, { kind: "verification", to_department: a.getString("department"), to_custodian: a.getString("assigned_to"), to_location: a.getString("location_name"), to_status: "damaged", reason: `Found damaged at the count ${v.getString("number")}` });
    if (result === "found_elsewhere") movement(dao, a, auth, { kind: "verification", to_department: a.getString("department"), to_custodian: a.getString("assigned_to"), to_location: l.getString("found_location"), to_status: a.getString("status"), reason: `Found at another location during the count ${v.getString("number")}` });
    if (result === "missing") a.set("status", "lost");
    if (result === "damaged") {
      a.set("status", "damaged");
      a.set("condition", "damaged");
    }
    if (result === "found_elsewhere") a.set("location_name", l.getString("found_location"));
    if ((result === "found" || result === "found_elsewhere") && l.getString("condition")) a.set("condition", l.getString("condition"));
    a.set("last_verified", noon(asOf));
    a.set("last_verification_result", result);
    dao.saveRecord(a);
  }
  v.set("summary", summary);
  v.set("reconciliation", reconcile(dao, asOf));
  v.set("status", "completed");
  v.set("completed_by", auth.id);
  v.set("completed_at", new Date().toISOString());
  if (input.notes) v.set("notes", String(input.notes).slice(0, 2000));
  dao.saveRecord(v);
  core.audit(dao, { actor: auth, action: "asset_count_completed", collection: "asset_verifications", recordId: v.id, label: v.getString("number"), comment: `${summary.found + summary.found_elsewhere} found, ${summary.missing} missing, ${summary.damaged} damaged`, meta });
  return v;
}

function cancelVerification(dao, auth, id, input, meta) {
  core.requirePermission(dao, auth, "manage_fixed_assets", "cancel asset counts");
  const v = load(dao, "asset_verifications", id, "Asset count");
  if (v.getString("status") !== "open") throw new BadRequestError(`${v.getString("number")} is ${v.getString("status")}.`);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new BadRequestError("Give the reason for cancelling.");
  v.set("status", "cancelled");
  v.set("notes", `${v.getString("notes")}\nCancelled: ${reason}`.trim().slice(0, 2000));
  dao.saveRecord(v);
  return v;
}

// ------------------------------------------------------------------ equipment requests (staff)
function decideRequest(dao, auth, id, input, meta) {
  requireAny(dao, auth, ["manage_fixed_assets", "reject_or_approve_assets_requests"], "answer equipment requests");
  const r = load(dao, "assets_requests", id, "Equipment request");
  if (r.getString("status") !== "pending") throw new BadRequestError("This request was already answered.");
  if (r.getString("requested_by") === auth.id) throw new ForbiddenError("You cannot answer your own request.");
  const decision = String(input.decision || "");
  if (decision === "approve") {
    if (!input.asset) throw new BadRequestError("Choose the asset to give.");
    const a = load(dao, "assets", input.asset, "Asset");
    if (a.getString("assigned_to")) throw new BadRequestError(`${a.getString("code")} is already with ${nameOf(dao, "users", a.getString("assigned_to"))}.`);
    if (["in_stock", ""].indexOf(a.getString("status")) === -1) throw new BadRequestError(`${a.getString("code")} is ${STATUS_LABEL[a.getString("status")] || a.getString("status")}.`);
    return assign(dao, auth, a.id, { custodian: r.getString("requested_by"), location_name: input.location_name, request: r.id, reason: input.comment }, meta);
  }
  if (decision !== "reject") throw new BadRequestError("Approve or reject the request.");
  const why = String(input.comment || "").trim();
  if (why.length < 5) throw new BadRequestError("Say why the request is rejected.");
  r.set("status", "rejected");
  r.set("rejected_by", auth.id);
  r.set("rejected_reason", why.slice(0, 500));
  r.set("decided_at", new Date().toISOString());
  r.set("decision_comment", why.slice(0, 500));
  dao.saveRecord(r);
  core.notify(dao, [r.getString("requested_by")], { title: "Equipment request not approved", body: why, link: "/dashboard/my/equipment", type: "warning" });
  core.audit(dao, { actor: auth, action: "approval_reject", collection: "assets_requests", recordId: r.id, label: "Equipment request", comment: why, meta });
  return r;
}

// ------------------------------------------------------------------ categories (validation by the masterdata guard)
function validateCategory(dao, r) {
  r.set("code", String(r.getString("code") || "").trim().toUpperCase());
  if (!r.getString("name").trim()) throw new BadRequestError("Give the category a name.");
  const method = r.getString("method");
  if (method && ["straight_line", "reducing_balance", "none"].indexOf(method) === -1) throw new BadRequestError("Unknown depreciation method.");
  if (method === "straight_line" && !(r.getInt("useful_life_months") > 0)) throw new BadRequestError("Straight-line depreciation needs the useful life in months.");
  if (method === "reducing_balance" && !(r.getFloat("rate") > 0 && r.getFloat("rate") <= 100)) throw new BadRequestError("Reducing-balance depreciation needs an annual rate between 0 and 100%.");
  const res = r.getFloat("residual_percent");
  if (res < 0 || res >= 100) throw new BadRequestError("The residual value is a percentage of the cost below 100%.");
  if (r.getInt("capitalisation_threshold") < 0) throw new BadRequestError("The capitalisation threshold cannot be negative.");
  const check = (field, type, what) => {
    const id = r.getString(field);
    if (!id) return;
    const a = find(dao, "gl_accounts", id);
    if (!a) throw new BadRequestError(`The ${what} account was not found.`);
    if (!a.getBool("is_posting")) throw new BadRequestError(`${a.getString("code")} ${a.getString("name")} is a heading, not a posting account.`);
    if (a.getString("type") !== type) throw new BadRequestError(`The ${what} account must be ${type === "asset" ? "an asset" : "an expense"} account (${a.getString("code")} is ${a.getString("type").replace(/_/g, " ")}).`);
  };
  check("asset_account", "asset", "cost");
  check("accumulated_account", "asset", "accumulated depreciation");
  check("expense_account", "expense", "depreciation expense");
  if (r.getString("asset_account") && r.getString("asset_account") === r.getString("accumulated_account")) throw new BadRequestError("Cost and accumulated depreciation need two different accounts.");
}

// ------------------------------------------------------------------ overview and reports
function overview(dao, auth) {
  requireAny(dao, auth, VIEW, "see the fixed assets");
  const all = dao.findRecordsByFilter("assets", "id != ''", "", 0, 0) || [];
  const live = all.filter((a) => a.getString("status") !== "disposed");
  const reg = live.filter((a) => a.getBool("capitalised"));
  const cats = {};
  for (const a of reg) {
    const c = cats[a.getString("category")] || (cats[a.getString("category")] = { category: a.getString("category"), name: nameOf(dao, "assets_categories", a.getString("category")), count: 0, cost: 0, accumulated: 0 });
    c.count++;
    c.cost += r0(a.getFloat("cost"));
    c.accumulated += a.getInt("accumulated_depreciation");
  }
  const status = {};
  for (const a of live) status[a.getString("status") || "in_stock"] = (status[a.getString("status") || "in_stock"] || 0) + 1;
  const runs = runsOrdered(dao);
  const lastPosted = runs.find((r) => r.getString("status") === "approved");
  const openRun = runs.find((r) => r.getString("status") !== "approved");
  const today = todayStr();
  const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const due = (dao.findRecordsByFilter("asset_maintenance", "next_due != ''", "next_due", 200, 0) || []).filter((m) => day(m.getString("next_due")) <= soon);
  const latestDue = {};
  for (const m of due) {
    const later = (dao.findRecordsByFilter("asset_maintenance", "asset = {:a} && date > {:d}", "", 1, 0, { a: m.getString("asset"), d: m.getString("date") }) || []).length;
    if (!later) latestDue[m.getString("asset")] = m;
  }
  const lastCount = (dao.findRecordsByFilter("asset_verifications", "status = 'completed'", "-as_of", 1, 0) || [])[0];
  return {
    generated_at: new Date().toISOString(),
    totals: { count: reg.length, cost: reg.reduce((t, a) => t + r0(a.getFloat("cost")), 0), accumulated: reg.reduce((t, a) => t + a.getInt("accumulated_depreciation"), 0) },
    by_category: Object.values(cats).sort((p, q) => q.cost - p.cost),
    status,
    to_capitalise: live.filter((a) => !a.getBool("capitalised")).length,
    transfers_waiting: (dao.findRecordsByFilter("asset_movements", "kind = 'transfer' && status = 'pending_approval'", "", 0, 0) || []).length,
    disposals_waiting: (dao.findRecordsByFilter("asset_disposals", "status = 'pending_approval'", "", 0, 0) || []).length,
    disposals_draft: (dao.findRecordsByFilter("asset_disposals", "status = 'draft' || status = 'returned'", "", 0, 0) || []).length,
    depreciation: {
      last_posted: lastPosted ? { id: lastPosted.id, number: lastPosted.getString("number"), period: lastPosted.getString("period_label"), total: lastPosted.getInt("total") } : null,
      open: openRun ? { id: openRun.id, number: openRun.getString("number"), period: openRun.getString("period_label"), status: openRun.getString("status"), total: openRun.getInt("total") } : null,
      next: lastPosted ? mLabel(mIndex(lastPosted.getInt("year"), lastPosted.getInt("month")) + 1) : "",
    },
    maintenance_due: Object.values(latestDue).map((m) => {
      const a = find(dao, "assets", m.getString("asset"));
      if (!a || a.getString("status") === "disposed") return null;
      return { asset: m.getString("asset"), code: a.getString("code"), name: a.getString("name"), next_due: day(m.getString("next_due")), overdue: day(m.getString("next_due")) < today, kind: m.getString("kind") };
    }).filter(Boolean).slice(0, 10),
    last_count: lastCount ? { id: lastCount.id, number: lastCount.getString("number"), title: lastCount.getString("title"), as_of: day(lastCount.getString("as_of")), summary: core.parseJson(lastCount, "summary", {}) } : null,
  };
}

const total = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

const REPORTS = {
  asset_register: {
    title: "Fixed asset register",
    run: (dao, f) => {
      const to = f.to || todayStr();
      const acc = accumulatedAt(dao, to);
      const rows = [];
      for (const a of dao.findRecordsByFilter("assets", "capitalised = true", "code", 0, 0) || []) {
        if (!inRegister(a, to)) continue;
        if (f.department && a.getString("department") !== f.department) continue;
        const accum = a.getInt("opening_accumulated") + (acc[a.id] || 0);
        rows.push({
          code: a.getString("code"), name: a.getString("name"), category: nameOf(dao, "assets_categories", a.getString("category")), department: nameOf(dao, "departments", a.getString("department")),
          location: a.getString("location_name"), custodian: nameOf(dao, "users", a.getString("assigned_to")), funding: nameOf(dao, "funding_sources", a.getString("funding_source"), "code"),
          acquired: day(a.getString("purchased_at")), cost: r0(a.getFloat("cost")), accumulated: accum, nbv: r0(a.getFloat("cost")) - accum, status: a.getString("status"),
          link: `/dashboard/assets/register/${a.id}`,
        });
      }
      return { columns: [["code", "Tag"], ["name", "Asset"], ["category", "Category"], ["department", "Department"], ["location", "Location"], ["custodian", "Custodian"], ["funding", "Funding"], ["acquired", "Acquired", "date"], ["cost", "Cost", "money"], ["accumulated", "Accumulated depreciation", "money"], ["nbv", "Net book value", "money"], ["status", "Status", "status"]], rows, totals: { cost: total(rows, "cost"), accumulated: total(rows, "accumulated"), nbv: total(rows, "nbv") }, note: `Assets in the register on ${to}, with depreciation posted up to that month.` };
    },
  },
  asset_schedule: {
    title: "Fixed asset schedule (movement by category)",
    run: (dao, f) => {
      const from = f.from || `${todayStr().slice(0, 4)}-01-01`;
      const to = f.to || todayStr();
      const kFrom = mOf(from);
      const kTo = monthsClosed(to);
      const charges = postedCharges(dao);
      const sum = (id, lo, hi) => (charges[id] || []).reduce((t, x) => t + (x.k >= lo && x.k <= hi ? x.charge : 0), 0);
      const cats = {};
      const row = (c) => cats[c] || (cats[c] = { category: nameOf(dao, "assets_categories", c), opening_cost: 0, additions: 0, disposals: 0, closing_cost: 0, opening_acc: 0, charge: 0, disposal_acc: 0, closing_acc: 0, opening_nbv: 0, closing_nbv: 0 });
      for (const a of dao.findRecordsByFilter("assets", "capitalised = true", "", 0, 0) || []) {
        if (f.department && a.getString("department") !== f.department) continue;
        // assets of the opening register count as held at the start; others from the day they were capitalised
        const ob = a.getString("acquisition_type") === "opening_balance";
        const inFrom = day(a.getString("capitalised_at"));
        const out = a.getString("disposed_at") ? day(a.getString("disposed_at")) : "";
        if (inFrom > to || (out && out < from)) continue;
        const wasIn = ob || inFrom < from;
        const gone = out && out <= to;
        const cost = r0(a.getFloat("cost"));
        const r = row(a.getString("category"));
        const accStart = a.getInt("opening_accumulated") + sum(a.id, -1, kFrom - 1);
        const charge = sum(a.id, kFrom, kTo);
        if (wasIn) {
          r.opening_cost += cost;
          r.opening_acc += accStart;
        } else r.additions += cost;
        r.charge += charge;
        if (gone) {
          r.disposals += cost;
          r.disposal_acc += accStart + charge;
        }
      }
      const rows = Object.values(cats).map((r) => Object.assign(r, {
        closing_cost: r.opening_cost + r.additions - r.disposals, closing_acc: r.opening_acc + r.charge - r.disposal_acc,
        opening_nbv: r.opening_cost - r.opening_acc, closing_nbv: r.opening_cost + r.additions - r.disposals - (r.opening_acc + r.charge - r.disposal_acc),
      })).sort((p, q) => q.closing_cost - p.closing_cost);
      const keys = ["opening_cost", "additions", "disposals", "closing_cost", "opening_acc", "charge", "disposal_acc", "closing_acc", "opening_nbv", "closing_nbv"];
      return {
        columns: [["category", "Category"], ["opening_cost", "Cost at start", "money"], ["additions", "Additions", "money"], ["disposals", "Disposals", "money"], ["closing_cost", "Cost at end", "money"], ["opening_acc", "Depreciation at start", "money"], ["charge", "Charge for the period", "money"], ["disposal_acc", "On disposals", "money"], ["closing_acc", "Depreciation at end", "money"], ["opening_nbv", "Net book value at start", "money"], ["closing_nbv", "Net book value at end", "money"]],
        rows, totals: Object.fromEntries(keys.map((k) => [k, total(rows, k)])), note: `From ${from} to ${to}. Cost at end = start + additions − disposals; depreciation at end = start + charge − on disposals (posted depreciation only).`,
      };
    },
  },
  depreciation_by_month: {
    title: "Depreciation by month and category",
    run: (dao, f) => {
      const from = mOf(f.from || `${todayStr().slice(0, 4)}-01-01`);
      const to = mOf(f.to || todayStr());
      const g = {};
      for (const l of dao.findRecordsByFilter("depreciation_lines", "status = 'posted'", "", 0, 0) || []) {
        const k = mIndex(l.getInt("year"), l.getInt("month"));
        if (k < from || k > to) continue;
        if (f.department && l.getString("department") !== f.department) continue;
        const key = `${k}|${l.getString("category")}`;
        const r = g[key] || (g[key] = { k, period: mLabel(k), category: nameOf(dao, "assets_categories", l.getString("category")), assets: 0, charge: 0 });
        r.assets++;
        r.charge += l.getInt("charge");
      }
      const rows = Object.values(g).sort((p, q) => p.k - q.k || q.charge - p.charge).map((r) => ({ period: r.period, category: r.category, assets: r.assets, charge: r.charge }));
      return { columns: [["period", "Month"], ["category", "Category"], ["assets", "Assets", "number"], ["charge", "Depreciation", "money"]], rows, totals: { charge: total(rows, "charge") }, note: "Posted depreciation runs only." };
    },
  },
  depreciation_by_department: {
    title: "Depreciation by department and funding source",
    run: (dao, f) => {
      const from = mOf(f.from || `${todayStr().slice(0, 4)}-01-01`);
      const to = mOf(f.to || todayStr());
      const g = {};
      for (const l of dao.findRecordsByFilter("depreciation_lines", "status = 'posted'", "", 0, 0) || []) {
        const k = mIndex(l.getInt("year"), l.getInt("month"));
        if (k < from || k > to) continue;
        if (f.department && l.getString("department") !== f.department) continue;
        const key = `${l.getString("department")}|${l.getString("funding_source")}|${l.getString("project")}`;
        const r = g[key] || (g[key] = { department: nameOf(dao, "departments", l.getString("department")) || "—", funding: nameOf(dao, "funding_sources", l.getString("funding_source"), "code") || "—", project: nameOf(dao, "projects", l.getString("project"), "code"), charge: 0 });
        r.charge += l.getInt("charge");
      }
      const rows = Object.values(g).sort((p, q) => q.charge - p.charge);
      return { columns: [["department", "Department"], ["funding", "Funding source"], ["project", "Project"], ["charge", "Depreciation", "money"]], rows, totals: { charge: total(rows, "charge") }, note: "Posted depreciation in the period, as charged in the GL." };
    },
  },
  movements: {
    title: "Asset movements",
    run: (dao, f) => {
      const from = f.from || `${todayStr().slice(0, 4)}-01-01`;
      const to = f.to || todayStr();
      const KIND = { transfer: "Transfer", assignment: "Custodian / location", status_change: "Status change", verification: "Count result" };
      const rows = [];
      for (const m of dao.findRecordsByFilter("asset_movements", "status = 'approved' && created >= {:f} && created <= {:t}", "-created", 0, 0, { f: `${from} 00:00:00.000Z`, t: `${to} 23:59:59.999Z` }) || []) {
        const a = find(dao, "assets", m.getString("asset"));
        if (!a) continue;
        if (f.department && m.getString("from_department") !== f.department && m.getString("to_department") !== f.department) continue;
        rows.push({
          date: day(m.getString("created")), number: m.getString("number"), asset: label(a), kind: KIND[m.getString("kind")] || m.getString("kind"),
          from: [nameOf(dao, "departments", m.getString("from_department")), nameOf(dao, "users", m.getString("from_custodian")), m.getString("from_location")].filter(Boolean).join(" · "),
          to: [nameOf(dao, "departments", m.getString("to_department")), nameOf(dao, "users", m.getString("to_custodian")), m.getString("to_location")].filter(Boolean).join(" · "),
          status_change: m.getString("from_status") !== m.getString("to_status") ? `${STATUS_LABEL[m.getString("from_status")] || m.getString("from_status") || "—"} → ${STATUS_LABEL[m.getString("to_status")] || m.getString("to_status")}` : "",
          reason: m.getString("reason"), by: nameOf(dao, "users", m.getString("requested_by")),
        });
      }
      for (const a of dao.findRecordsByFilter("assets", "capitalised = true && capitalised_at >= {:f} && capitalised_at <= {:t}", "", 0, 0, { f: `${from} 00:00:00.000Z`, t: `${to} 23:59:59.999Z` }) || []) {
        if (f.department && a.getString("department") !== f.department) continue;
        if (a.getString("acquisition_type") === "opening_balance") continue;
        rows.push({ date: day(a.getString("capitalised_at")), number: "", asset: label(a), kind: "Capitalised", from: "", to: nameOf(dao, "departments", a.getString("department")), status_change: "", reason: `RWF ${num(a.getFloat("cost"))}`, by: nameOf(dao, "users", a.getString("capitalised_by")) });
      }
      rows.sort((p, q) => (p.date < q.date ? 1 : p.date > q.date ? -1 : 0));
      return { columns: [["date", "Date", "date"], ["number", "Document"], ["asset", "Asset"], ["kind", "Movement"], ["from", "From"], ["to", "To"], ["status_change", "Status"], ["reason", "Reason"], ["by", "By"]], rows, totals: {}, note: `Capitalisations, transfers, custodian and location changes, status changes and count results from ${from} to ${to}.` };
    },
  },
  disposals: {
    title: "Disposals register",
    run: (dao, f) => {
      const from = f.from || `${todayStr().slice(0, 4)}-01-01`;
      const to = f.to || todayStr();
      const rows = [];
      for (const d of dao.findRecordsByFilter("asset_disposals", "status != 'cancelled'", "-disposal_date", 0, 0) || []) {
        const dd = day(d.getString("disposal_date"));
        if (dd < from || dd > to) continue;
        const a = find(dao, "assets", d.getString("asset"));
        if (f.department && a && a.getString("department") !== f.department) continue;
        rows.push({
          number: d.getString("number"), date: dd, asset: a ? label(a) : "", method: METHOD_LABEL[d.getString("method")] || d.getString("method"), buyer: d.getString("buyer"),
          cost: d.getInt("cost"), accumulated: d.getInt("accumulated"), nbv: d.getInt("net_book_value"), proceeds: d.getInt("proceeds"), gain_loss: d.getInt("gain_loss"), status: d.getString("status"),
          link: `/dashboard/assets/disposals/${d.id}`,
        });
      }
      return { columns: [["number", "Disposal"], ["date", "Date", "date"], ["asset", "Asset"], ["method", "Method"], ["buyer", "Buyer"], ["cost", "Cost", "money"], ["accumulated", "Accumulated depreciation", "money"], ["nbv", "Net book value", "money"], ["proceeds", "Proceeds", "money"], ["gain_loss", "Gain / (loss)", "money"], ["status", "Status", "status"]], rows, totals: { cost: total(rows, "cost"), nbv: total(rows, "nbv"), proceeds: total(rows, "proceeds"), gain_loss: total(rows, "gain_loss") }, note: "Gain or loss = proceeds − net book value; posted to the GL when the SG approves." };
    },
  },
  maintenance: {
    title: "Maintenance log",
    run: (dao, f) => {
      const from = f.from || `${todayStr().slice(0, 4)}-01-01`;
      const to = f.to || todayStr();
      const rows = [];
      for (const m of dao.findRecordsByFilter("asset_maintenance", "date >= {:f} && date <= {:t}", "-date", 0, 0, { f: `${from} 00:00:00.000Z`, t: `${to} 23:59:59.999Z` }) || []) {
        const a = find(dao, "assets", m.getString("asset"));
        if (f.department && a && a.getString("department") !== f.department) continue;
        rows.push({ date: day(m.getString("date")), asset: a ? label(a) : "", kind: m.getString("kind"), description: m.getString("description"), provider: m.getString("supplier") ? nameOf(dao, "suppliers", m.getString("supplier")) : m.getString("provider"), cost: m.getInt("cost"), downtime: m.getInt("downtime_days"), next_due: day(m.getString("next_due")) });
      }
      return { columns: [["date", "Date", "date"], ["asset", "Asset"], ["kind", "Type", "status"], ["description", "Work done"], ["provider", "By"], ["cost", "Cost", "money"], ["downtime", "Days out of use", "number"], ["next_due", "Next due", "date"]], rows, totals: { cost: total(rows, "cost") }, note: "Maintenance is paid through payment vouchers; this log keeps the history of each asset." };
    },
  },
  reconciliation: {
    title: "Register against the general ledger",
    run: (dao, f) => {
      const to = f.to || todayStr();
      const rows = reconcile(dao, to);
      return { columns: [["category", "Category"], ["assets", "Assets", "number"], ["asset_account", "Cost account"], ["register_cost", "Cost in the register", "money"], ["gl_cost", "Cost in the GL", "money"], ["cost_difference", "Difference", "money"], ["accumulated_account", "Depreciation account"], ["register_accumulated", "Depreciation in the register", "money"], ["gl_accumulated", "Depreciation in the GL", "money"], ["accumulated_difference", "Difference", "money"]], rows, totals: { register_cost: total(rows, "register_cost"), gl_cost: total(rows, "gl_cost"), cost_difference: total(rows, "cost_difference"), register_accumulated: total(rows, "register_accumulated"), gl_accumulated: total(rows, "gl_accumulated"), accumulated_difference: total(rows, "accumulated_difference") }, note: `As of ${to}. Every difference must be explained before the period is closed.` };
    },
  },
};

function report(dao, auth, key, f) {
  requireAny(dao, auth, VIEW, "see the fixed asset reports");
  const def = REPORTS[key];
  if (!def) throw new NotFoundError(`Unknown report "${key}".`);
  const out = def.run(dao, f);
  return { key, title: def.title, filters: f, generated_at: new Date().toISOString(), columns: out.columns.map((c) => ({ key: c[0], label: c[1], type: c[2] || "text" })), rows: out.rows, totals: out.totals, note: out.note || "" };
}

module.exports = {
  MONTHS, mIndex, mOf, mKey, mLabel, chargeFor, policy, projection, capitalise, registerAsset, opening, assign, setStatus,
  requestTransfer, onTransferApproved, cancelTransfer, addMaintenance, createDisposal, updateDisposal, submitDisposal, onDisposalApproved,
  cancelDisposal, computeRun, recalculateRun, submitRun, onRunApproved, cancelRun, startVerification, countLine, completeVerification,
  cancelVerification, decideRequest, validateCategory, reconcile, overview, report,
};
