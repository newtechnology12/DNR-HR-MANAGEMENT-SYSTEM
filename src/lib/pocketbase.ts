import PocketBase from "pocketbase";

const pocketbase = new PocketBase(
  "https://pocketbase-production-f0b0.up.railway.app"
).autoCancellation(false);

export default pocketbase;
