// import PocketBase from "pocketbase";

// const pocketbase = new PocketBase(
//   "https://pocketbase-production-f0b0.up.railway.app"
// ).autoCancellation(false);

// export default pocketbase;

import getApiUrl from "@/utils/getApiUrl";
import PocketBase from "pocketbase";

const POCKETBASE_URL = getApiUrl();

const pocketbase = new PocketBase(POCKETBASE_URL).autoCancellation(false);

/**
 * "Keep me signed in on this device": when it is off, a session cookie marks this browser session and the
 * stored sign-in is cleared on the first visit after the browser was closed.
 */
const KEEP_KEY = "ims.keepSignedIn";
const SESSION_COOKIE = "ims_session=1";
export function rememberSignIn(keep: boolean) {
  try {
    localStorage.setItem(KEEP_KEY, keep ? "1" : "0");
    document.cookie = `${SESSION_COOKIE}; path=/; SameSite=Lax`;
  } catch (_) {}
}
try {
  if (localStorage.getItem(KEEP_KEY) === "0" && !document.cookie.split("; ").includes(SESSION_COOKIE)) pocketbase.authStore.clear();
} catch (_) {}

export default pocketbase;
