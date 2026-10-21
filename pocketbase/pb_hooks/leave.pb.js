/// <reference path="../pb_data/types.d.ts" />
/**
 * Leave API: balances (entitlement, taken, planned), leave plans (bulk save / import, approve),
 * day counting preview. Rules in lib/leave.js.
 */

// GET /api/dnr/leave/balances?year=2026&department=&employee=
routerAdd("GET", "/api/dnr/leave/balances", (c) => {
  const leave = require(`${__hooks}/lib/leave.js`);
  const info = $apis.requestInfo(c);
  const dao = $app.dao();
  const year = parseInt(c.queryParam("year") || String(new Date().getFullYear()), 10);
  let users = leave.visibleUsers(dao, info.authRecord, c.queryParam("department"));
  const only = c.queryParam("employee");
  if (only) users = users.filter((u) => u.id === only);
  return c.json(200, { year, settings: leave.settings(dao), items: leave.balances(dao, users, year) });
}, $apis.requireAdminOrRecordAuth());

// GET /api/dnr/leave/count?start=2026-09-01&end=2026-09-10&type=Annual%20Leave
routerAdd("GET", "/api/dnr/leave/count", (c) => {
  const leave = require(`${__hooks}/lib/leave.js`);
  const dao = $app.dao();
  let basis = "working";
  try {
    basis = dao.findFirstRecordByFilter("leave_types", "name = {:n}", { n: c.queryParam("type") }).getString("day_basis") || "working";
  } catch (_) {}
  const start = c.queryParam("start");
  const end = c.queryParam("end");
  const cfg = leave.settings(dao);
  const hol = leave.holidays(dao);
  const days = leave.countDays(start, end, basis, cfg, hol);
  const inRange = [];
  for (const h of dao.findRecordsByFilter("public_holidays", "id != ''", "date", 500, 0) || []) {
    const d = h.getString("date").slice(0, 10);
    const y = (start || "").slice(0, 4);
    const key = h.getBool("recurring") ? `${y}${d.slice(4)}` : d;
    if (key >= (start || "").slice(0, 10) && key <= (end || "").slice(0, 10)) inRange.push({ date: key, name: h.getString("name") });
  }
  return c.json(200, { days, basis, holidays: inRange });
}, $apis.requireAdminOrRecordAuth());

// POST /api/dnr/leave/plans  { year, rows: [{ employee, months: {1..12}, carried_over?, adjustment?, adjustment_reason?, notes? }] }
routerAdd("POST", "/api/dnr/leave/plans", (c) => {
  const leave = require(`${__hooks}/lib/leave.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = leave.savePlans(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireAdminOrRecordAuth());

// POST /api/dnr/leave/plans/approve  { year, employees: [ids] }
routerAdd("POST", "/api/dnr/leave/plans/approve", (c) => {
  const leave = require(`${__hooks}/lib/leave.js`);
  const core = require(`${__hooks}/lib/core.js`);
  const info = $apis.requestInfo(c);
  let out;
  $app.dao().runInTransaction((tx) => {
    out = leave.approvePlans(tx, info.authRecord, info.data || {}, core.requestMeta(c));
  });
  return c.json(200, out);
}, $apis.requireRecordAuth());

// Leave policy tables: HR with "manage_leave_policy" only.
["leave_types", "public_holidays"].forEach((col) => {
  const guard = (e) => {
    const auth = e.httpContext.get("authRecord");
    if (auth) require(`${__hooks}/lib/core.js`).requirePermission($app.dao(), auth, "manage_leave_policy", "change the leave policy");
  };
  onRecordBeforeCreateRequest(guard, col);
  onRecordBeforeUpdateRequest(guard, col);
  onRecordBeforeDeleteRequest(guard, col);
});
