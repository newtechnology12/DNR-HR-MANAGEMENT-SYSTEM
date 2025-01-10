import PocketBase from "pocketbase";

const pocketbase = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL
).autoCancellation(false);

export default pocketbase;
