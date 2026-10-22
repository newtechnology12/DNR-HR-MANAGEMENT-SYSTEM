/// <reference path="../pb_data/types.d.ts" />
/**
 * Financial statements and management figures from the general ledger (rules in lib/statements.js).
 *
 *   GET /api/ims/statements/financial-position?as_at=
 *   GET /api/ims/statements/financial-performance?from=&to=&department=&funding_source=&project=
 *   GET /api/ims/statements/cash-flow?from=&to=
 *   GET /api/ims/statements/donor?funding_source=&from=&to=
 *   GET /api/ims/statements/trend?to=                      month by month for the fiscal year (executive dashboard)
 */

routerAdd("GET", "/api/ims/statements/:name", (c) => {
  const lib = require(`${__hooks}/lib/statements.js`);
  const info = $apis.requestInfo(c);
  const input = {};
  for (const k of ["as_at", "from", "to", "department", "funding_source", "project"]) input[k] = c.queryParam(k) || "";
  const name = c.pathParam("name");
  const fn = { "financial-position": lib.financialPosition, "financial-performance": lib.financialPerformance, "cash-flow": lib.cashFlow, donor: lib.donorReport, trend: lib.trend }[name];
  if (!fn) throw new NotFoundError(`Unknown statement "${name}".`);
  return c.json(200, fn($app.dao(), info.authRecord, input));
}, $apis.requireRecordAuth("users"));
