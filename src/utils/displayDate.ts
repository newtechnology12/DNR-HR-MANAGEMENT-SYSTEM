/**
 * Short, readable date for tables and profiles ("2 Feb 2025").
 * Empty or unparseable values (e.g. a blank PocketBase date) show `fallback` instead of "Invalid Date".
 */
export default function displayDate(value?: string | Date | null, fallback = "N.A") {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
