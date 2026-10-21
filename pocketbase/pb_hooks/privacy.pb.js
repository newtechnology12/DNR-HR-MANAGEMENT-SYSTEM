/// <reference path="../pb_data/types.d.ts" />
/**
 * Employee privacy (see lib/privacy.js): personal files are hidden from colleagues in every
 * response, filters on them are refused, and requesters cannot decide on their own requests.
 * Which rows each role sees is set by the API rules (migration 1790430000_ims_privacy.js).
 */

// Every collection: employee records can be reached through expand from anywhere.
onRecordsListRequest((e) => require(`${__hooks}/lib/privacy.js`).onList(e));
onRecordViewRequest((e) => require(`${__hooks}/lib/privacy.js`).onView(e));
onRealtimeBeforeMessageSend((e) => require(`${__hooks}/lib/privacy.js`).onRealtime(e));

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/privacy.js`).requestBeforeCreate(e), "petty_cash_requests", "assets_requests", "CarRequests");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/privacy.js`).requestBeforeUpdate(e), "petty_cash_requests", "assets_requests", "CarRequests");

// Any save of a role (screens, maker–checker, seeds): permissions in the shape the rules search for.
onModelBeforeCreate((e) => require(`${__hooks}/lib/privacy.js`).normalizeRole(e.model), "roles");
onModelBeforeUpdate((e) => require(`${__hooks}/lib/privacy.js`).normalizeRole(e.model), "roles");

onRecordBeforeCreateRequest((e) => require(`${__hooks}/lib/privacy.js`).attendanceBeforeCreate(e), "attendance");
onRecordBeforeUpdateRequest((e) => require(`${__hooks}/lib/privacy.js`).attendanceBeforeUpdate(e), "attendance");
