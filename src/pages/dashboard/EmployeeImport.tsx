import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Square, XCircle,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { cn } from "@/utils";
import {
  Button,
  Card,
  Column,
  DataTable,
  EmptyState,
  FormActions,
  FormSection,
  KpiBand,
  Page,
  PageHeader,
  Pager,
  Tabs,
  fmtNumber,
} from "@/components/ims";

const LIST = "/dashboard/hr/employees";
const STEPS = ["Download template", "Upload file", "Review and fix", "Import", "Results"];

/**
 * Bulk employee import from an Excel template.
 *
 * 1. The template is generated live, with reference sheets listing the exact department, designation,
 *    branch and role names that exist in this system, so names always match.
 * 2. The uploaded file is fully validated in the browser before anything is written.
 * 3. Valid rows are created one by one with a progress bar; every row gets a clear result.
 * The server still enforces permissions (create_employee, and access_general_settings to assign roles).
 */

type Field =
  | "first_name" | "last_name" | "email" | "phone" | "gender" | "birth" | "national_id" | "nationality" | "country"
  | "address" | "department" | "designation" | "branch" | "role" | "employment_type" | "status" | "joined_at"
  | "salary" | "bank_name" | "bank_account_number";

const COLUMNS: { field: Field; header: string; required?: boolean; format: string; example: string }[] = [
  { field: "first_name", header: "First name", required: true, format: "Text", example: "Aline" },
  { field: "last_name", header: "Last name", required: true, format: "Text", example: "Mukamana" },
  { field: "email", header: "Email", required: true, format: "Valid email, unique per employee (used to log in)", example: "aline.mukamana@dnr.rw" },
  { field: "phone", header: "Phone", format: "Text, e.g. +250788123456", example: "+250788123456" },
  { field: "gender", header: "Gender", format: "Male or Female", example: "Female" },
  { field: "birth", header: "Date of birth", format: "Date (YYYY-MM-DD)", example: "1994-05-17" },
  { field: "national_id", header: "National ID", format: "Text (16 digits for Rwandan ID)", example: "1199480012345678" },
  { field: "nationality", header: "Nationality", format: "Text", example: "Rwandan" },
  { field: "country", header: "Country", format: "Text", example: "Rwanda" },
  { field: "address", header: "Address", format: "Text", example: "Kigali, Gasabo" },
  { field: "department", header: "Department", format: "Exact name from the Lists sheet", example: "" },
  { field: "designation", header: "Designation", format: "Exact name from the Lists sheet", example: "" },
  { field: "branch", header: "Branch", format: "Exact name from the Lists sheet", example: "" },
  { field: "role", header: "Role", format: "Exact name from the Lists sheet (empty = Staff / Requester)", example: "Staff / Requester" },
  { field: "employment_type", header: "Employment type", format: "permanent, contract, probation, intern, casual or part-time", example: "permanent" },
  { field: "status", header: "Status", format: "Active or Inactive (empty = Active)", example: "Active" },
  { field: "joined_at", header: "Joined on", format: "Date (YYYY-MM-DD)", example: "2024-01-15" },
  { field: "salary", header: "Gross salary (RWF)", format: "Number without currency", example: "750000" },
  { field: "bank_name", header: "Bank name", format: "Text", example: "Bank of Kigali" },
  { field: "bank_account_number", header: "Bank account number", format: "Text", example: "00012345678901" },
];
const EMPLOYMENT_TYPES = ["permanent", "contract", "probation", "intern", "casual", "part-time"];
const STATUSES = ["Active", "Inactive"];
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_MAP: Record<string, Field> = Object.fromEntries(COLUMNS.flatMap((c) => [[norm(c.header), c.field], [norm(c.field), c.field]]));
Object.assign(HEADER_MAP, { name: "first_name", firstname: "first_name", surname: "last_name", lastname: "last_name", emailaddress: "email", telephone: "phone", phonenumber: "phone", dob: "birth", dateofbirth: "birth", birthdate: "birth", joindate: "joined_at", joiningdate: "joined_at", startdate: "joined_at", salary: "salary", grosssalary: "salary", id: "national_id", nid: "national_id" });

interface Reference {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string; department: string }[];
  branches: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  emails: Set<string>;
}

interface Row {
  row: number;
  raw: Record<string, unknown>;
  data: Record<string, any>;
  errors: string[];
  warnings: string[];
  result?: { ok: boolean; message: string; password?: string };
}

function toIsoDate(v: unknown): string | null | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString();
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString() : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day/month/year
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).toISOString();
  return null;
}

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return `Dnr-${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}

function validate(rows: Record<string, unknown>[], ref: Reference, canAssignRole: boolean): Row[] {
  const seen = new Map<string, number>();
  const find = <T extends { name: string }>(list: T[], v: string) => list.find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase());
  const defaultRole = find(ref.roles, "Staff / Requester");
  return rows.map((raw, i) => {
    const r: Row = { row: i + 2, raw, data: {}, errors: [], warnings: [] };
    const get = (f: Field) => raw[f];
    const text = (f: Field) => String(get(f) ?? "").trim();

    const first = text("first_name");
    const last = text("last_name");
    if (!first) r.errors.push("First name is required");
    if (!last) r.errors.push("Last name is required");
    const email = text("email").toLowerCase();
    if (!email) r.errors.push("Email is required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) r.errors.push(`“${email}” is not a valid email`);
    else if (ref.emails.has(email)) r.errors.push("An employee with this email already exists");
    else if (seen.has(email)) r.errors.push(`Duplicate email — also on row ${seen.get(email)}`);
    if (email) seen.set(email, r.row);

    const gender = text("gender");
    if (gender && !["male", "female", "m", "f"].includes(gender.toLowerCase())) r.errors.push(`Gender must be Male or Female (got “${gender}”)`);
    for (const f of ["birth", "joined_at"] as Field[]) {
      const iso = toIsoDate(get(f));
      if (iso === null) r.errors.push(`${f === "birth" ? "Date of birth" : "Joined on"} “${get(f)}” is not a date — use YYYY-MM-DD`);
      else if (iso) r.data[f] = iso;
    }
    if (r.data.birth) {
      const age = (Date.now() - new Date(r.data.birth).getTime()) / (365.25 * 864e5);
      if (age < 16 || age > 80) r.warnings.push(`Unusual age (${Math.floor(age)} years) — check the date of birth`);
    }
    if (r.data.joined_at && new Date(r.data.joined_at) > new Date(Date.now() + 90 * 864e5)) r.warnings.push("Joined date is more than 3 months in the future");

    const lookups: [Field, { id: string; name: string }[], string][] = [
      ["department", ref.departments, "department"], ["designation", ref.designations, "designation"], ["branch", ref.branches, "branch"], ["role", ref.roles, "role"],
    ];
    for (const [f, list, label] of lookups) {
      const v = text(f);
      if (!v) continue;
      const hit = find(list, v);
      if (!hit) r.errors.push(`Unknown ${label} “${v}” — use a name from the Lists sheet`);
      else r.data[f] = hit.id;
    }
    if (r.data.designation && r.data.department) {
      const des = ref.designations.find((d) => d.id === r.data.designation);
      if (des?.department && des.department !== r.data.department) r.warnings.push("Designation belongs to a different department");
    }
    if (r.data.role && !canAssignRole) r.errors.push("Your role cannot assign roles — leave Role empty or ask an administrator");
    if (!r.data.role && canAssignRole && defaultRole) r.data.role = defaultRole.id;
    if (!r.data.role && !canAssignRole) r.warnings.push("No role — the employee will have no menu access until an administrator assigns one");

    const et = text("employment_type").toLowerCase().replace(/\s+/g, "-");
    if (et && !EMPLOYMENT_TYPES.includes(et)) r.errors.push(`Employment type must be one of: ${EMPLOYMENT_TYPES.join(", ")}`);
    const status = text("status");
    const statusHit = STATUSES.find((s) => s.toLowerCase() === status.toLowerCase());
    if (status && !statusHit) r.errors.push("Status must be Active or Inactive");

    const salaryRaw = text("salary").replace(/[,\s]|rwf/gi, "");
    if (salaryRaw && !(Number(salaryRaw) >= 0)) r.errors.push(`Salary “${text("salary")}” is not a number`);

    let phone = text("phone").replace(/\s+/g, "");
    if (/^2507\d{8}$/.test(phone)) phone = `+${phone}`;
    if (/^07\d{8}$/.test(phone)) phone = `+250${phone.slice(1)}`;

    Object.assign(r.data, {
      name: `${first} ${last}`.trim(),
      names: `${first} ${last}`.trim(),
      email,
      phone,
      gender: gender ? (gender.toLowerCase().startsWith("f") ? "Female" : "Male") : "",
      national_id: text("national_id"),
      nationality: text("nationality"),
      country: text("country"),
      address: text("address"),
      employment_type: et,
      status: statusHit || "Active",
      salary: salaryRaw,
      bank_name: text("bank_name"),
      bank_account_number: text("bank_account_number"),
    });
    return r;
  });
}

export default function EmployeeImport() {
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const canAssignRole = canPerform("access_general_settings");
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [readError, setReadError] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "importing" | "done">("idle");
  const [progress, setProgress] = React.useState({ done: 0, total: 0, ok: 0, failed: 0 });
  const [filter, setFilter] = React.useState<"all" | "errors" | "warnings">("all");
  const cancelRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const ref = useQuery(["employee-import-reference"], async (): Promise<Reference> => {
    const [departments, designations, branches, roles, users] = await Promise.all([
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("designations").getFullList({ sort: "name", fields: "id,name,department" }),
      pocketbase.collection("branches").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("roles").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("users").getFullList({ fields: "email", batch: 1000 }),
    ]);
    return { departments, designations, branches, roles, emails: new Set(users.map((u: any) => String(u.email).toLowerCase())) } as any;
  });

  const downloadTemplate = () => {
    if (!ref.data) return;
    const wb = XLSX.utils.book_new();
    const employees = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => (c.required ? `${c.header} *` : c.header))]);
    employees["!cols"] = COLUMNS.map((c) => ({ wch: Math.max(c.header.length + 4, 16) }));
    employees["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: COLUMNS.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, employees, "Employees");

    const instructions = XLSX.utils.aoa_to_sheet([
      ["DNR HR — employee import template"],
      ["Fill one employee per row on the “Employees” sheet. Do not rename or reorder the header row."],
      ["Columns marked * are required. Names in Department / Designation / Branch / Role must match the “Lists” sheet exactly."],
      ["Each imported employee receives a unique temporary password, shown in the results file after import."],
      [],
      ["Column", "Required", "Format / allowed values", "Example"],
      ...COLUMNS.map((c) => [c.header, c.required ? "Yes" : "No", c.format, c.example || (c.field === "department" ? ref.data!.departments[0]?.name : c.field === "designation" ? ref.data!.designations[0]?.name : c.field === "branch" ? ref.data!.branches[0]?.name : "")]),
    ]);
    instructions["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 62 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

    const deptName = Object.fromEntries(ref.data.departments.map((d) => [d.id, d.name]));
    const max = Math.max(ref.data.departments.length, ref.data.designations.length, ref.data.branches.length, ref.data.roles.length, EMPLOYMENT_TYPES.length);
    const lists = XLSX.utils.aoa_to_sheet([
      ["Departments", "Designations", "Designation's department", "Branches", "Roles", "Employment types", "Status", "Gender"],
      ...Array.from({ length: max }, (_, i) => [
        ref.data!.departments[i]?.name || "", ref.data!.designations[i]?.name || "", deptName[ref.data!.designations[i]?.department] || "",
        ref.data!.branches[i]?.name || "", ref.data!.roles[i]?.name || "", EMPLOYMENT_TYPES[i] || "", STATUSES[i] || "", ["Male", "Female"][i] || "",
      ]),
    ]);
    lists["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, lists, "Lists");
    XLSX.writeFile(wb, "DNR-employee-import-template.xlsx");
  };

  const readFile = async (file: File) => {
    setReadError("");
    setRows([]);
    setPhase("idle");
    setFileName(file.name);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("The file is larger than 10 MB.");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheet = wb.Sheets["Employees"] || wb.Sheets[wb.SheetNames[0]];
      const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
      if (!matrix.length) throw new Error("The sheet is empty.");
      const headers = (matrix[0] as unknown[]).map((h) => HEADER_MAP[norm(String(h).replace("*", ""))]);
      const missing = COLUMNS.filter((c) => c.required && !headers.includes(c.field)).map((c) => c.header);
      if (missing.length) throw new Error(`Missing required column(s): ${missing.join(", ")}. Download the template and copy your data into it.`);
      const data = matrix
        .slice(1)
        .filter((r) => (r as unknown[]).some((v) => String(v ?? "").trim() !== ""))
        .map((r) => Object.fromEntries(headers.map((f, i) => [f, (r as unknown[])[i]]).filter(([f]) => f)));
      if (!data.length) throw new Error("No employee rows found under the header row.");
      if (data.length > 2000) throw new Error(`The file has ${data.length} rows; import at most 2,000 at a time.`);
      setRows(validate(data, ref.data!, canAssignRole));
    } catch (e: any) {
      setReadError(e?.message || "The file could not be read. Save it as .xlsx or .csv and try again.");
    }
  };

  const valid = rows.filter((r) => !r.errors.length);
  const withErrors = rows.filter((r) => r.errors.length);
  const withWarnings = rows.filter((r) => !r.errors.length && r.warnings.length);

  const runImport = async () => {
    cancelRef.current = false;
    setPhase("importing");
    const queue = [...valid];
    const total = queue.length;
    let done = 0, ok = 0, failed = 0;
    setProgress({ done, total, ok, failed });
    const worker = async () => {
      while (queue.length && !cancelRef.current) {
        const r = queue.shift()!;
        const password = tempPassword();
        try {
          await pocketbase.collection("users").create({ ...r.data, emailVisibility: true, password, passwordConfirm: password });
          r.result = { ok: true, message: "Created", password };
          ok++;
        } catch (e: any) {
          const d = e?.response?.data || {};
          const msg = d.email?.code === "validation_invalid_email" || d.email?.code === "validation_not_unique"
            ? "Email already used by another account"
            : Object.keys(d).length ? Object.entries(d).map(([k, v]: any) => `${k}: ${v?.message}`).join("; ") : e?.response?.message || e?.message;
          r.result = { ok: false, message: msg };
          failed++;
        }
        done++;
        setProgress({ done, total, ok, failed });
        setRows((prev) => [...prev]);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setPhase("done");
    queryClient.invalidateQueries(["employee-import-reference"]);
    if (cancelRef.current) toast.warning(`Import stopped: ${ok} created, ${failed} failed, ${total - done} not attempted`);
    else toast.success(`${ok} ${ok === 1 ? "employee" : "employees"} imported${failed ? `, ${failed} failed` : ""}`);
  };

  const downloadResults = () => {
    const out = rows.map((r) => ({
      Row: r.row,
      Name: r.data.name,
      Email: r.data.email,
      Result: r.result ? (r.result.ok ? "Created" : "Failed") : r.errors.length ? "Not imported (errors)" : "Not imported",
      Details: r.result?.message && !r.result.ok ? r.result.message : r.errors.concat(r.warnings).join("; "),
      "Temporary password": r.result?.password || "",
    }));
    const ws = XLSX.utils.json_to_sheet(out);
    ws["!cols"] = [{ wch: 6 }, { wch: 28 }, { wch: 34 }, { wch: 22 }, { wch: 60 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import results");
    XLSX.writeFile(wb, `employee-import-results-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.xlsx`);
  };

  const reset = () => {
    setRows([]);
    setFileName("");
    setReadError("");
    setPhase("idle");
    setProgress({ done: 0, total: 0, ok: 0, failed: 0 });
    if (inputRef.current) inputRef.current.value = "";
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const shown = rows.filter((r) => (filter === "errors" ? r.errors.length : filter === "warnings" ? !r.errors.length && r.warnings.length : true));
  const step = phase === "done" ? 5 : phase === "importing" ? 4 : rows.length ? 3 : fileName ? 2 : 1;

  // The review table pages through every row (the report file still holds all of them).
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(50);
  React.useEffect(() => setPage(1), [filter, rows.length, perPage]);
  const pageRows = shown.slice((page - 1) * perPage, page * perPage);
  const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

  const columns: Column<Row>[] = [
    { key: "row", header: "Row", numeric: true, width: "72px", cell: (r) => <span className="text-ims-muted">{r.row}</span> },
    { key: "name", header: "Name", cell: (r) => <span className="font-semibold">{r.data.name || "—"}</span> },
    { key: "email", header: "Email", nowrap: true, cell: (r) => <span className="text-ims-body">{r.data.email || "—"}</span> },
    { key: "department", header: "Department", cell: (r) => ref.data?.departments.find((d) => d.id === r.data.department)?.name || String(r.raw.department || "—") },
    { key: "role", header: "Role", cell: (r) => ref.data?.roles.find((x) => x.id === r.data.role)?.name || String(r.raw.role || "—") },
    {
      key: "check",
      header: "Check",
      className: "min-w-[260px]",
      cell: (r) =>
        r.result ? (
          r.result.ok ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ims-success"><CheckCircle2 size={15} aria-hidden /> Created</span>
          ) : (
            <span className="block text-ims-danger">
              <span className="inline-flex items-center gap-1.5 font-semibold"><XCircle size={15} aria-hidden /> Failed</span>
              <span className="mt-0.5 block text-t-small">{r.result.message}</span>
            </span>
          )
        ) : r.errors.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-t-small text-ims-danger">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : r.warnings.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-t-small text-ims-warning">{r.warnings.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ims-success"><CheckCircle2 size={15} aria-hidden /> Ready to import</span>
        ),
    },
  ];

  const busy = phase === "importing";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Employees", to: LIST }, { label: "Import" }]}
        title="Import employees"
        subtitle="Add many employees at once from Excel. Every row is checked before anything is saved."
        secondary={[{ label: "Back to employees", to: LIST, disabled: busy }]}
      />

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Import steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = step === n ? "current" : step > n ? "done" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-control border px-3 py-2 text-t-small",
                state === "current" ? "border-ims-link bg-ims-info-bg font-semibold text-ims-primary" : state === "done" ? "border-ims-border bg-ims-card text-ims-body" : "border-ims-border bg-ims-card text-ims-faint"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-t-hint font-bold",
                  state === "done" ? "bg-ims-success text-white" : state === "current" ? "bg-ims-primary text-white" : "bg-ims-subtle text-ims-muted"
                )}
              >
                {state === "done" ? <Check size={12} aria-label="Done" /> : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FormSection number={1} title="Download the template" description="Always use the latest template: it lists the departments, designations, branches and roles that exist now.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={step === 1 ? "primary" : "secondary"} icon={Download} onClick={downloadTemplate} disabled={!ref.data} loading={ref.isLoading}>Download Excel template</Button>
            <p className="text-t-small text-ims-muted">Sheets: Employees · Instructions · Lists</p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-t-small text-ims-body">
            <li>Required: <b>First name</b>, <b>Last name</b> and <b>Email</b> (one email per employee).</li>
            <li>Dates as <b>YYYY-MM-DD</b> (Excel date cells also work).</li>
            <li>Up to 2,000 employees per file, as .xlsx, .xls or .csv.</li>
          </ul>
        </FormSection>

        <FormSection
          number={2}
          title="Upload the completed file"
          description={canAssignRole ? "Employees without a role get the Staff / Requester role." : "Your role cannot assign roles, so leave the Role column empty."}
        >
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ims-focus",
              busy || !ref.data ? "pointer-events-none border-ims-field bg-ims-thead opacity-60" : "border-ims-field bg-ims-thead hover:border-ims-link hover:bg-ims-info-bg"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
          >
            <FileSpreadsheet size={24} className="text-ims-link" aria-hidden />
            <span className="text-t-body font-bold text-ims-text">{fileName || "Drop the Excel file here, or click to choose"}</span>
            <span className="text-t-hint text-ims-muted">{fileName ? "Click to choose another file" : ".xlsx, .xls or .csv · max 10 MB"}</span>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} disabled={!ref.data} />
          </label>
          {readError && (
            <p role="alert" className="flex items-start gap-2 rounded-control border border-ims-danger/30 bg-ims-danger-bg px-3 py-2.5 text-t-body text-ims-danger">
              <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {readError}
            </p>
          )}
        </FormSection>
      </div>

      {rows.length > 0 && (
        <>
          <KpiBand
            items={[
              { label: "Rows in file", value: fmtNumber(rows.length) },
              { label: "Ready to import", value: fmtNumber(valid.length), tone: valid.length ? "success" : "default" },
              { label: "With warnings", value: fmtNumber(withWarnings.length), tone: withWarnings.length ? "warning" : "default", sub: "Imported, but check them" },
              { label: "With errors", value: fmtNumber(withErrors.length), tone: withErrors.length ? "danger" : "default", sub: "Skipped" },
            ]}
          />

          <Card padded={false} className="relative overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-[18px] pt-[18px] sm:px-5 sm:pt-5">
              <div className="min-w-0">
                <h2 className="text-t-section text-ims-text">
                  {phase === "idle" ? 3 : phase === "importing" ? 4 : 5}
                  <span className="px-1.5 text-ims-faint">·</span>
                  {phase === "idle" ? "Review" : phase === "importing" ? "Importing" : "Results"}
                </h2>
                <p className="mt-0.5 break-all text-t-small text-ims-muted">{fileName} · {plural(rows.length, "row")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {phase !== "importing" && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>Start over</Button>}
                {(phase === "done" || withErrors.length > 0) && (
                  <Button size="sm" variant={phase === "done" ? "primary" : "secondary"} icon={Download} onClick={downloadResults}>
                    {phase === "done" ? "Download results and passwords" : "Download error report"}
                  </Button>
                )}
              </div>
            </div>

            {phase !== "idle" && (
              <div className="mx-[18px] mt-4 space-y-2 sm:mx-5" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2 text-t-body">
                  <span className="flex items-center gap-2 font-semibold text-ims-text">
                    {phase === "importing" ? <Loader2 size={16} className="animate-spin text-ims-link" aria-hidden /> : <CheckCircle2 size={16} className="text-ims-success" aria-hidden />}
                    {phase === "importing" ? `Importing ${fmtNumber(progress.done)} of ${fmtNumber(progress.total)}…` : "Import finished"}
                  </span>
                  <span className="tabular-nums text-ims-muted">{pct}% · {fmtNumber(progress.ok)} created · {fmtNumber(progress.failed)} failed</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-pill bg-ims-subtle" role="progressbar" aria-label="Import progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-pill bg-ims-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                {phase === "importing" && <Button size="sm" icon={Square} onClick={() => { cancelRef.current = true; }}>Stop after the current rows</Button>}
                {phase === "done" && progress.ok > 0 && (
                  <p role="status" className="flex items-start gap-2 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3 py-2.5 text-t-small text-ims-warning">
                    <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
                    Download the results file now. It holds each new employee's temporary password, which is not stored anywhere else. Share the passwords privately.
                  </p>
                )}
              </div>
            )}

            <Tabs
              inset
              className="mt-3"
              label="Rows to show"
              active={filter}
              onChange={(k) => setFilter(k as typeof filter)}
              tabs={[
                { key: "all", label: "All rows", count: rows.length },
                { key: "errors", label: "Errors", count: withErrors.length },
                { key: "warnings", label: "Warnings", count: withWarnings.length },
              ]}
            />
            <DataTable
              caption="Rows in the file"
              columns={columns}
              rows={pageRows}
              rowKey={(r) => String(r.row)}
              minWidth={860}
              empty={<EmptyState compact icon={CheckCircle2} text={filter === "errors" ? "No rows with errors." : filter === "warnings" ? "No rows with warnings." : "No rows."} />}
              footer={shown.length > 0 ? <Pager page={page} perPage={perPage} total={shown.length} onPage={setPage} onPerPage={setPerPage} sizes={[25, 50, 100]} /> : null}
            />
          </Card>

          {phase === "idle" && (
            <FormActions
              submitLabel={`Import ${plural(valid.length, "employee")}`}
              onSubmit={runImport}
              disabled={!valid.length || !canPerform("create_employee")}
              cancelTo={LIST}
              note={withErrors.length > 0 ? "Rows with errors are skipped. Fix them in Excel and upload the file again, or import the valid rows now." : "Each new employee gets a temporary password, listed in the results file."}
            />
          )}
        </>
      )}
    </Page>
  );
}
