/// <reference path="../../pb_data/types.d.ts" />
/**
 * Sign-in security: password policy, account lockout and two-factor authentication (TOTP, RFC 6238).
 *
 * The 2FA secret, failed-login counter and lockout live in `user_security`, which has no API rules,
 * so they can never be read or changed through the REST API — only by these hooks.
 *
 * TOTP uses HMAC-SHA1 (what Google / Microsoft Authenticator expect). PocketBase's built-in HMAC
 * helpers only accept text, so SHA-1 is implemented here over byte arrays.
 */
const core = require("./core.js");

// ------------------------------------------------------------------ settings
function policy(dao) {
  let s = null;
  try {
    s = (dao.findRecordsByFilter("settings", "id != ''", "", 1, 0) || [])[0] || null;
  } catch (_) {}
  const n = (k, d) => {
    const v = s ? s.getInt(k) : 0;
    return v > 0 ? v : d;
  };
  return {
    minLength: n("password_min_length", 10),
    lockoutThreshold: n("lockout_threshold", 5),
    lockoutMinutes: n("lockout_minutes", 15),
    sessionTimeoutMinutes: n("session_timeout_minutes", 30),
    require2fa: (s && s.getString("require_2fa")) || "none",
  };
}

/** Throws a 400 listing what the password is missing. */
function checkPassword(dao, password, user) {
  const p = policy(dao);
  const pw = String(password || "");
  const missing = [];
  if (pw.length < p.minLength) missing.push(`at least ${p.minLength} characters`);
  if (!/[a-z]/.test(pw)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(pw)) missing.push("an uppercase letter");
  if (!/[0-9]/.test(pw)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push("a symbol (for example ! or #)");
  const email = user ? String(user.getString("email") || "").split("@")[0].toLowerCase() : "";
  if (email && email.length >= 3 && pw.toLowerCase().indexOf(email) !== -1) missing.push("no part of your e-mail address");
  if (missing.length) {
    throw new BadRequestError(`The password must contain ${missing.join(", ")}.`, {
      password: new ValidationError("weak_password", `The password must contain ${missing.join(", ")}.`),
    });
  }
}

// ------------------------------------------------------------------ user_security record
function securityOf(dao, userId, create) {
  try {
    return dao.findFirstRecordByFilter("user_security", "user = {:u}", { u: userId });
  } catch (_) {
    if (!create) return null;
    const r = new Record(dao.findCollectionByNameOrId("user_security"));
    r.set("user", userId);
    r.set("failed_logins", 0);
    r.set("totp_enabled", false);
    return r;
  }
}

function toDate(v) {
  const d = new Date(String(v || "").trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function lockedUntil(sec) {
  if (!sec) return null;
  const d = toDate(sec.getString("locked_until"));
  return d && d.getTime() > Date.now() ? d : null;
}

// ------------------------------------------------------------------ SHA-1 / HMAC / TOTP
function sha1(bytes) {
  const ml = bytes.length * 8;
  const msg = bytes.slice();
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 7; i >= 0; i--) msg.push(i >= 4 ? 0 : (ml >>> (i * 8)) & 0xff);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Array(80);
  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = [];
  for (const h of [h0, h1, h2, h3, h4]) out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  return out;
}

function hmacSha1(key, message) {
  let k = key.length > 64 ? sha1(key) : key.slice();
  while (k.length < 64) k.push(0);
  const ipad = k.map((b) => b ^ 0x36);
  const opad = k.map((b) => b ^ 0x5c);
  return sha1(opad.concat(sha1(ipad.concat(message))));
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s) {
  const clean = String(s || "").toUpperCase().split("=").join("").split(" ").join("");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out;
}

function totpAt(secret, counter) {
  const msg = [];
  for (let i = 7; i >= 0; i--) msg.push(i >= 4 ? 0 : (counter >>> (i * 8)) & 0xff);
  const h = hmacSha1(base32Decode(secret), msg);
  const o = h[19] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1000000).padStart(6, "0");
}

/** Accepts the current 30-second code and one step either side (clock drift). */
function verifyTotp(secret, code) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c) || !secret) return false;
  const now = Math.floor(Date.now() / 1000 / 30);
  for (const d of [0, -1, 1]) if (totpAt(secret, now + d) === c) return true;
  return false;
}

function newSecret() {
  return $security.randomStringWithAlphabet(32, B32);
}

function hashCode(code) {
  return $security.sha256(String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
}

function newRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const raw = $security.randomStringWithAlphabet(10, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/** True when the code is a valid TOTP code or an unused recovery code (which is then consumed). */
function verifySecondFactor(dao, sec, code) {
  if (verifyTotp(sec.getString("totp_secret"), code)) return true;
  const hashes = core.parseJson(sec, "recovery_codes", []);
  const h = hashCode(code);
  const i = hashes.indexOf(h);
  if (i === -1) return false;
  hashes.splice(i, 1);
  sec.set("recovery_codes", hashes);
  dao.saveRecord(sec);
  return true;
}

/** Whether policy forces this person to use 2FA (finance roles or everyone). */
function twoFactorRequired(dao, user) {
  const p = policy(dao).require2fa;
  if (p === "all") return true;
  if (p !== "finance") return false;
  const FINANCE = ["SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER", "SYS_ADMIN"];
  return core.roleCodes(dao, user).some((c) => FINANCE.indexOf(c) !== -1);
}

/** The plain password sent with a create / update / reset request (never stored). */
function passwordFromRequest(e) {
  try {
    return String(($apis.requestInfo(e.httpContext).data || {}).password || "");
  } catch (_) {
    return "";
  }
}

module.exports = {
  passwordFromRequest, policy, checkPassword, securityOf, lockedUntil, toDate,
  verifyTotp, totpAt, newSecret, newRecoveryCodes, hashCode, verifySecondFactor, twoFactorRequired,
};
