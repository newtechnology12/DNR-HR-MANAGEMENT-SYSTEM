// import PocketBase from "pocketbase";

// const pocketbase = new PocketBase(
//   "https://pocketbase-production-f0b0.up.railway.app"
// ).autoCancellation(false);

// export default pocketbase;

import getApiUrl from "@/utils/getApiUrl";
import PocketBase from "pocketbase";

const POCKETBASE_URL = getApiUrl();

const pocketbase = new PocketBase(POCKETBASE_URL).autoCancellation(false);

export default pocketbase;
