/// <reference path="../../pb_data/types.d.ts" />
/**
 * Employee privacy and self-service limits.
 *
 * - The staff directory (name, photo, department, designation, phone) stays visible to everyone,
 *   but the personal file (salary, IDs, bank, family, health…) is blanked in every API response,
 *   including records reached through `expand`, unless it is the viewer's own record or the
 *   viewer has "view_employee_profile" (HR, DAF, SG, Internal Audit in the RALGA matrix).
 * - Filtering or sorting on those fields is refused for the same people, so values cannot be
 *   guessed from which records come back.
 * - Requesters cannot approve or reject their own petty cash, equipment or vehicle requests,
 *   and self clock-in uses the server's time.
 */
const core = require("./core.js");

const PROFILE_PERMISSION = "view_employee_profile";
const SENSITIVE = [
  "salary", "birth", "gender", "nationality", "national_id", "country", "address", "bank_name", "bank_account_number",
  "other_names", "father_name", "mother_name", "place_of_birth", "certified_academic_documents", "previous_employers",
  "number_of_dependents", "spouse_name", "spouse_telephone", "spouse_email", "spouse_occupation", "spouse_employer",
  "spouse_position", "spouse_medical_insurance", "spouse_id_passport", "children_names", "recent_tested_diseases",
  "physical_handicap", "ongoing_education", "other_employment", "business_shareholding", "bank_accounts", "loans_ongoing",
  "recent_pay_slips", "recent_bank_statements", "criminal_record",
];
const SENSITIVE_SET = {};
for (const f of SENSITIVE) SENSITIVE_SET[f] = true;

/** Lazily answers "may this viewer see personal files?" once per request. */
function viewer(auth) {
  let cached = null;
  return {
    id: auth ? auth.id : "",
    seesProfiles() {
      if (!auth) return true; // superuser
      if (cached === null) cached = core.can($app.dao(), auth, PROFILE_PERMISSION);
      return cached;
    },
  };
}

function scrub(record, who, depth) {
  if (!record || depth > 4) return;
  if (record.collection().name === "users" && record.id !== who.id && !who.seesProfiles()) {
    for (const f of SENSITIVE) if (record.get(f)) record.set(f, "");
  }
  const expand = record.expand() || {};
  for (const key of Object.keys(expand)) {
    const v = expand[key];
    if (!v) continue;
    if (typeof v.collection === "function") scrub(v, who, depth + 1);
    else for (let i = 0; i < (v.length || 0); i++) scrub(v[i], who, depth + 1); // multi-relation (Go slice)
  }
}

/** Field paths in a filter or sort expression, e.g. "employee.salary" or "@collection.users.salary". */
function paths(expr) {
  const out = [];
  const bare = String(expr || "").replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, " ");
  const re = /@?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z]+)?)*/g;
  let m;
  while ((m = re.exec(bare))) out.push(m[0]);
  return out;
}

/** True when the path ends on a sensitive field of the users collection. */
function touchesProfile(dao, collection, path) {
  let segs = path.split(".");
  let col = collection;
  if (segs[0] === "@collection") {
    try {
      col = dao.findCollectionByNameOrId(segs[1]);
    } catch (_) {
      return false;
    }
    segs = segs.slice(2);
  } else if (segs[0].charAt(0) === "@") {
    return false; // @request.*, @now…: values of the viewer or the server, not of other people
  }
  for (const raw of segs) {
    const seg = raw.split(":")[0];
    const field = col.schema.getFieldByName(seg);
    if (!field) return false;
    if (field.type === "relation") {
      try {
        col = dao.findCollectionByNameOrId(field.options.collectionId);
      } catch (_) {
        return false;
      }
      continue;
    }
    return col.name === "users" && !!SENSITIVE_SET[seg];
  }
  return false;
}

function guardQuery(e, who) {
  if (who.seesProfiles()) return;
  const dao = $app.dao();
  const q = [e.httpContext.queryParam("filter"), e.httpContext.queryParam("sort")].join(" ");
  if (!q.trim()) return;
  for (const p of paths(q)) {
    const clean = p.replace(/^-/, "");
    if (touchesProfile(dao, e.collection, clean)) {
      throw new ForbiddenError(`Only HR can search or sort by "${clean.split(".").pop().replace(/_/g, " ")}".`);
    }
  }
}

/**
 * PocketBase 0.21 fills `expand` only after the request hooks have run, so expand here (with the
 * same per-collection view rules), scrub, and clear the parameter so it is not expanded again.
 */
function expandNow(e, enrich) {
  const params = e.httpContext.queryParams();
  const raw = params.get("expand");
  if (!raw) return;
  // PocketBase silently ignores expand paths that are not relations; enriching them here would
  // fail the whole request instead, so keep only the paths that resolve to relations.
  const valid = validExpand($app.dao(), e.collection, raw);
  if (valid) {
    params.set("expand", valid);
    try {
      enrich();
    } catch (err) {
      // Never fail the list because of an expand; never return unscrubbed related records either.
      console.log(`privacy: expand "${valid}" on ${e.collection.name} skipped: ${err}`);
    }
  }
  params.del("expand");
}

/** The comma separated expand paths whose every segment is a relation (or a `x_via_y` back-relation). */
function validExpand(dao, collection, expand) {
  const keep = [];
  for (const path of String(expand).split(",").map((p) => p.trim()).filter(Boolean)) {
    let col = collection;
    let ok = true;
    for (const seg of path.split(".")) {
      const field = col.schema.getFieldByName(seg);
      if (field && field.type === "relation") {
        try {
          col = dao.findCollectionByNameOrId(field.options.collectionId);
          continue;
        } catch (_) {
          ok = false;
          break;
        }
      }
      const via = seg.match(/^([A-Za-z0-9_]+)_via_([A-Za-z0-9_]+)$/);
      if (via) {
        try {
          const other = dao.findCollectionByNameOrId(via[1]);
          const back = other.schema.getFieldByName(via[2]);
          if (back && back.type === "relation" && back.options.collectionId === col.id) {
            col = other;
            continue;
          }
        } catch (_) {}
      }
      ok = false;
      break;
    }
    if (ok) keep.push(path);
  }
  return keep.join(",");
}

function onList(e) {
  const who = viewer(e.httpContext.get("authRecord"));
  if (!who.id) return;
  guardQuery(e, who);
  if (!e.records || !e.records.length) return;
  expandNow(e, () => $apis.enrichRecords(e.httpContext, $app.dao(), e.records));
  for (const r of e.records) scrub(r, who, 0);
}

function onView(e) {
  const who = viewer(e.httpContext.get("authRecord"));
  if (!who.id || !e.record) return;
  expandNow(e, () => $apis.enrichRecord(e.httpContext, $app.dao(), e.record));
  scrub(e.record, who, 0);
}

/**
 * Live updates of employee records ("users/*" or "users/<id>", by name or collection id) carry the
 * whole record, so they only go to people who may see personal files, or to the employee themselves.
 * The app itself only subscribes to notifications.
 */
function onRealtime(e) {
  if (!e.message) return;
  const [topic, id] = String(e.message.name).split("/");
  if (topic !== "users" && topic !== usersCollectionId()) return;
  const auth = e.client.get("authRecord");
  if (!auth || id === auth.id || core.can($app.dao(), auth, PROFILE_PERMISSION)) return;
  throw new ForbiddenError("not delivered: personal file"); // stops this one message for this client
}

let USERS_ID = "";
function usersCollectionId() {
  if (!USERS_ID) USERS_ID = $app.dao().findCollectionByNameOrId("users").id;
  return USERS_ID;
}

// ------------------------------------------------------------------ self-service requests
// Who may decide each kind of request; everybody else (the requester included) cannot change the decision fields.
const DECISION = {
  petty_cash_requests: { permission: "approve_or_reject_request", owner: "requested_by", label: "petty cash requests" },
  assets_requests: { permission: "reject_or_approve_assets_requests", owner: "requested_by", label: "equipment requests" },
  CarRequests: { permission: "approve_or_reject_request", owner: "employee", label: "vehicle requests" },
};
const DECISION_FIELDS = ["status", "approved_by", "rejected_by", "rejected_reason", "approved_at", "rejected_at"];

function requestBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const d = DECISION[e.record.collection().name];
  const r = e.record;
  if (!core.can($app.dao(), auth, d.permission)) {
    r.set("status", "pending");
    for (const f of DECISION_FIELDS.slice(1)) if (r.collection().schema.getFieldByName(f)) r.set(f, null);
  }
  if (r.collection().schema.getFieldByName("created_by") && !r.getString("created_by")) r.set("created_by", auth.id);
}

function requestBeforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth) return;
  const d = DECISION[e.record.collection().name];
  const fields = DECISION_FIELDS.filter((f) => e.record.collection().schema.getFieldByName(f));
  const changed = Object.keys(core.diff(e.record.originalCopy(), e.record, fields));
  if (!changed.length) return;
  core.requirePermission($app.dao(), auth, d.permission, `approve or reject ${d.label}`);
  if (e.record.getString(d.owner) === auth.id) {
    throw new ForbiddenError(`You cannot decide on your own request. Another approver must review it.`);
  }
}

// ------------------------------------------------------------------ attendance
// Rwanda has no daylight saving, so Kigali time is UTC+2 whatever the server's time zone is.
const KIGALI_OFFSET_MIN = 120;

function kigaliMinutes(d) {
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + KIGALI_OFFSET_MIN) % 1440;
}

function attendanceBeforeCreate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth || core.can($app.dao(), auth, "create_attendance")) return;
  // Self clock-in: the server decides the time and whether it is late.
  const now = new Date();
  const r = e.record;
  r.set("employee", auth.id);
  r.set("clockin_time", now.toISOString().replace("T", " "));
  r.set("date", now.toISOString().replace("T", " "));
  r.set("clockout_time", "");
  const s = ($app.dao().findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0];
  const start = s ? s.getString("work_start_time") : "";
  const m = /^(\d{1,2}):(\d{2})/.exec(start || "");
  if (m) r.set("behaviour", kigaliMinutes(now) > Number(m[1]) * 60 + Number(m[2]) ? "late" : "early");
}

function attendanceBeforeUpdate(e) {
  const auth = e.httpContext.get("authRecord");
  if (!auth || core.can($app.dao(), auth, "update_attendance")) return;
  // Staff may only clock out of their own day, once, at the server's time.
  const before = e.record.originalCopy();
  const others = core.diff(before, e.record);
  delete others.clockout_time;
  if (Object.keys(others).length) {
    throw new ForbiddenError(`Only HR can change ${Object.keys(others).join(", ").replace(/_/g, " ")} on an attendance record.`);
  }
  if (e.record.getString("clockout_time") !== before.getString("clockout_time")) {
    if (before.getString("clockout_time")) throw new BadRequestError("You have already clocked out today.");
    e.record.set("clockout_time", new Date().toISOString().replace("T", " "));
  }
}

// ------------------------------------------------------------------ roles
/**
 * The API rules find a granted permission by the text {"access":true,"name":"…","title":"…"}
 * (see migration 1790430000), so every entry is saved in exactly that shape.
 */
function normalizeRole(record) {
  const list = core.parseJson(record, "permitions", null);
  if (!Array.isArray(list)) return;
  record.set(
    "permitions",
    list.filter((p) => p && p.name).map((p) => ({ access: p.access === true, name: String(p.name), title: String(p.title || "") }))
  );
}

module.exports = {
  SENSITIVE, PROFILE_PERMISSION, onList, onView, onRealtime, paths, touchesProfile, normalizeRole,
  requestBeforeCreate, requestBeforeUpdate, attendanceBeforeCreate, attendanceBeforeUpdate,
};
