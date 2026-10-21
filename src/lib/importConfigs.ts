/**
 * Excel import definitions per list (see components/enterprise/ExcelImport.tsx). Each one creates records
 * through the normal API, so the server applies the same permissions, rules and audit as the forms.
 */
import pocketbase from "@/lib/pocketbase";
import type { ImportConfig } from "@/components/enterprise/ExcelImport";
import { DOCUMENT_TYPE_LABELS } from "@/lib/ims";
import { METHOD_LABELS, PAYER_TYPES } from "@/lib/treasury";

const USER_MATCH = ["email", "name", "names"];
const YES = (v: unknown) => (v === undefined ? true : Boolean(v));

const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "net_assets", label: "Net assets" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];
const SECTIONS = [
  ["current_assets", "Current assets"], ["non_current_assets", "Non-current assets"], ["current_liabilities", "Current liabilities"],
  ["non_current_liabilities", "Non-current liabilities"], ["net_assets", "Net assets"], ["revenue_exchange", "Revenue — exchange"],
  ["revenue_non_exchange", "Revenue — non-exchange"], ["expenses", "Expenses"],
].map(([value, label]) => ({ value, label }));
const CASH_FLOW = [["cash", "Cash and cash equivalents"], ["operating", "Operating"], ["investing", "Investing"], ["financing", "Financing"], ["none", "Non-cash"]].map(([value, label]) => ({ value, label }));

export const IMPORTS: Record<string, ImportConfig> = {
  receipts: {
    name: "receipts",
    title: "Receipts",
    collection: "cash_receipts",
    permission: "manage_treasury",
    notes: [
      "Imported receipts are drafts: open each one, check it and send it to the DAF for verification.",
      "Account: the code of the bank account or cash book (e.g. BK-OPS). Income account: its code in the chart of accounts (e.g. 4101 member contributions).",
    ],
    fields: [
      { name: "account", label: "Account", type: "relation", collection: "bank_accounts", matchBy: ["code", "name"], relationFilter: 'status = "active"', required: true, example: "BK-OPS" },
      { name: "receipt_date", label: "Date received", type: "date", required: true, example: "2026-10-06" },
      { name: "payer_type", label: "Kind of payer", type: "select", options: Object.entries(PAYER_TYPES).map(([value, label]) => ({ value, label })), example: "Member (district / City of Kigali)" },
      { name: "payer_name", label: "Received from", type: "text", required: true, example: "Karongi District" },
      { name: "amount", label: "Amount (RWF)", type: "money", required: true, example: 14600000 },
      { name: "method", label: "Method", type: "select", options: ["bank_transfer", "cheque", "mobile_money", "direct_deposit", "cash"].map((value) => ({ value, label: METHOD_LABELS[value] })), example: "Bank transfer" },
      { name: "reference", label: "Reference / cheque number", type: "text", example: "KRG-CONTR-2627", hint: "Required for cheques; helps matching with the bank statement" },
      { name: "income_account", label: "Income account", type: "relation", collection: "gl_accounts", matchBy: ["code", "name"], relationFilter: "is_posting = true", required: true, example: "4101" },
      { name: "funding_source", label: "Funding source", type: "relation", collection: "funding_sources", matchBy: ["code", "name"], example: "MC" },
      { name: "description", label: "Description", type: "textarea", example: "Annual member contribution 2026/27" },
    ],
    toPayload: (v) => ({ ...v, payer_type: v.payer_type || "other", method: v.method || "bank_transfer" }),
    validate: (v) => (v.method === "cheque" && String(v.reference || "").trim().length < 3 ? "Enter the cheque number." : null),
  },

  glAccounts: {
    name: "chart-of-accounts",
    title: "Accounts",
    permission: "manage_chart_of_accounts",
    uniqueBy: "code",
    notes: ["List parent (header) accounts before their children: each row is created in the order of the file."],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, example: "5216", hint: "Unique account code" },
      { name: "name", label: "Name", type: "text", required: true, example: "Bank charges" },
      { name: "type", label: "Type", type: "select", required: true, options: ACCOUNT_TYPES, example: "Expense" },
      { name: "parent_code", label: "Parent code", type: "text", example: "52", hint: "Code of the header account it belongs to" },
      { name: "is_posting", label: "Posting account", type: "bool", example: "Yes", hint: "Yes = receives transactions; No = header" },
      { name: "statement_section", label: "Statement section", type: "select", options: SECTIONS, example: "Expenses" },
      { name: "cash_flow_class", label: "Cash flow class", type: "select", options: CASH_FLOW, example: "Operating" },
      { name: "is_control", label: "Control account", type: "bool", example: "No" },
      { name: "active", label: "Active", type: "bool", example: "Yes" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    create: async (v) => {
      let parent = "";
      if (v.parent_code) {
        const p = await pocketbase.collection("gl_accounts").getFirstListItem(`code = "${String(v.parent_code).replace(/"/g, "")}"`).catch(() => null);
        if (!p) throw new Error(`Parent account ${v.parent_code} not found — import it first (rows are created in file order).`);
        parent = p.id;
      }
      const { parent_code, ...rest } = v;
      return pocketbase.collection("gl_accounts").create({ ...rest, parent, active: YES(v.active), is_posting: v.is_posting === undefined ? true : v.is_posting });
    },
  },

  taxRates: {
    name: "tax-rates",
    title: "Tax rates",
    collection: "tax_rates",
    permission: "manage_tax_rates",
    notes: ["Imported rates are marked 'to be confirmed by Finance' until the DAF confirms each one against the law."],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, upper: true, example: "WHT_SERVICES" },
      { name: "name", label: "Name", type: "text", required: true, example: "Withholding tax — services" },
      { name: "category", label: "Category", type: "select", required: true, options: [{ value: "vat", label: "VAT" }, { value: "withholding", label: "Withholding" }, { value: "excise", label: "Excise" }, { value: "other", label: "Other" }], example: "Withholding" },
      { name: "rate", label: "Rate %", type: "number", required: true, example: 15 },
      { name: "effective_from", label: "Effective from", type: "date", required: true, example: "2026-07-01" },
      { name: "effective_to", label: "Effective to", type: "date" },
      { name: "applies_to", label: "Applies to", type: "textarea" },
      { name: "legal_reference", label: "Legal reference", type: "text" },
      { name: "active", label: "Active", type: "bool", example: "Yes" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, active: YES(v.active) }),
  },

  approvalLimits: {
    name: "approval-limits",
    title: "Approval limits",
    collection: "approval_limits",
    permission: "manage_approval_workflows",
    fields: [
      { name: "role", label: "Role", type: "relation", required: true, collection: "roles", matchBy: ["code", "name"], example: "DAF" },
      { name: "document_type", label: "Document type", type: "select", options: Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label })), example: "Payment voucher", hint: "Empty = all documents" },
      { name: "max_amount", label: "Maximum (RWF)", type: "money", required: true, example: 5000000 },
      { name: "active", label: "Active", type: "bool", example: "Yes" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, min_amount: 0, active: YES(v.active) }),
  },

  suppliers: {
    name: "suppliers",
    title: "Suppliers",
    collection: "suppliers",
    permission: "manage_suppliers",
    uniqueBy: "name",
    notes: ["Imported suppliers start as drafts: upload their documents and submit each one for Finance approval before ordering."],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "Kigali Office Supplies Ltd" },
      { name: "supplier_type", label: "Type", type: "select", required: true, options: [{ value: "company", label: "Company" }, { value: "individual", label: "Individual" }, { value: "government", label: "Government" }, { value: "ngo", label: "NGO" }, { value: "other", label: "Other" }], example: "Company" },
      { name: "categories", label: "Categories", type: "relation", collection: "procurement_categories", matchBy: ["code", "name"], multiple: true, example: "SUP", hint: "Comma separated codes or names" },
      { name: "tin", label: "TIN", type: "text", example: "101234567" },
      { name: "registration_number", label: "RDB registration", type: "text" },
      { name: "vat_number", label: "VAT number", type: "text" },
      { name: "email", label: "E-mail", type: "email", example: "sales@example.rw" },
      { name: "phone", label: "Phone", type: "phone", example: "+250788123456" },
      { name: "address", label: "Address", type: "text", example: "KN 4 Ave, Kigali" },
      { name: "district", label: "District", type: "text", example: "Nyarugenge" },
      { name: "province", label: "Province", type: "text", example: "Kigali City" },
      { name: "country", label: "Country", type: "text", example: "Rwanda" },
      { name: "payment_terms", label: "Payment terms", type: "text", example: "30 days" },
      { name: "bank_name", label: "Bank", type: "text", example: "Bank of Kigali" },
      { name: "bank_branch", label: "Bank branch", type: "text" },
      { name: "bank_account_name", label: "Account name", type: "text" },
      { name: "bank_account_number", label: "Account number", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, currency: "RWF", country: v.country || "Rwanda", categories: v.categories || [] }),
  },

  inventoryItems: {
    name: "inventory-items",
    title: "Stock items",
    collection: "inventory_items",
    permission: "manage_inventory",
    uniqueBy: "code",
    fields: [
      { name: "code", label: "Code", type: "text", upper: true, example: "STA-A4-80G" },
      { name: "name", label: "Name", type: "text", required: true, example: "A4 paper 80g (ream)" },
      { name: "category", label: "Category", type: "relation", collection: "procurement_categories", matchBy: ["code", "name"], example: "SUP" },
      { name: "unit", label: "Unit", type: "text", example: "Ream" },
      { name: "reorder_level", label: "Reorder level", type: "number", example: 20 },
      { name: "track_batch", label: "Track batches", type: "bool", example: "No" },
      { name: "track_serial", label: "Track serial numbers", type: "bool", example: "No" },
      { name: "track_expiry", label: "Track expiry", type: "bool", example: "No" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, active: true, total_quantity: 0, avg_cost: 0 }),
  },

  procurementCategories: {
    name: "procurement-categories",
    title: "Purchase categories",
    collection: "procurement_categories",
    permission: "manage_procurement_settings",
    uniqueBy: "code",
    fields: [
      { name: "code", label: "Code", type: "text", upper: true, required: true, example: "CLN" },
      { name: "name", label: "Name", type: "text", required: true, example: "Cleaning services" },
      { name: "expense_account", label: "Expense account", type: "relation", collection: "gl_accounts", matchBy: ["code"], relationFilter: "is_posting = true", example: "5205" },
      { name: "is_asset", label: "Fixed asset", type: "bool", example: "No" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, active: true }),
  },

  unitsOfMeasure: {
    name: "units-of-measure",
    title: "Units of measure",
    collection: "units_of_measure",
    permission: "manage_procurement_settings",
    uniqueBy: "code",
    fields: [
      { name: "code", label: "Code", type: "text", upper: true, required: true, example: "BOX" },
      { name: "name", label: "Name", type: "text", required: true, example: "Box" },
    ],
    toPayload: (v) => ({ ...v, active: true }),
  },

  departments: {
    name: "departments",
    title: "Departments",
    collection: "departments",
    permission: "create_department",
    uniqueBy: "name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "Planning, Monitoring and Evaluation" },
      { name: "code", label: "Code", type: "text", upper: true, example: "PME" },
      { name: "head", label: "Head of department", type: "relation", collection: "users", matchBy: USER_MATCH, example: "hod@dnr-hr.rw", hint: "E-mail of the head" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  designations: {
    name: "designations",
    title: "Designations",
    collection: "designations",
    permission: "create_designations",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "Senior Accountant" },
      { name: "department", label: "Department", type: "relation", required: true, collection: "departments", matchBy: ["code", "name"], example: "FIN" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  branches: {
    name: "branches",
    title: "Offices",
    collection: "branches",
    permission: "create_department",
    uniqueBy: "name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "Huye branch" },
      { name: "location", label: "Location", type: "text", required: true, example: "Huye, Southern Province" },
      { name: "status", label: "Status", type: "select", required: true, options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], example: "Active" },
      { name: "manager", label: "Manager", type: "relation", required: true, collection: "users", matchBy: USER_MATCH, example: "hod@dnr-hr.rw" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  assetCategories: {
    name: "equipment-categories",
    title: "Equipment categories",
    collection: "assets_categories",
    permission: "create_assets_category",
    uniqueBy: "name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "ICT equipment" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  assetTypes: {
    name: "equipment-types",
    title: "Equipment types",
    collection: "assets_types",
    permission: "create_assets_type",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "Laptop" },
      { name: "category", label: "Category", type: "relation", required: true, collection: "assets_categories", matchBy: ["name"], example: "ICT equipment" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  assets: {
    name: "equipment",
    title: "Equipment",
    collection: "assets",
    permission: "create_assets",
    uniqueBy: "code",
    fields: [
      { name: "code", label: "Tag / code", type: "text", required: true, upper: true, example: "RALGA-ICT-0101" },
      { name: "name", label: "Name", type: "text", required: true, example: "Dell Latitude 5440 laptop" },
      { name: "category", label: "Category", type: "relation", required: true, collection: "assets_categories", matchBy: ["name"], example: "ICT equipment" },
      { name: "type", label: "Type", type: "relation", required: true, collection: "assets_types", matchBy: ["name"], example: "Laptop" },
      { name: "serial_number", label: "Serial number", type: "text" },
      { name: "status", label: "Status", type: "select", required: true, options: [{ value: "in_stock", label: "In stock" }, { value: "assigned", label: "Assigned" }, { value: "in-use", label: "In use" }, { value: "maintenance", label: "Maintenance" }, { value: "in_transit", label: "In transit" }, { value: "Damaged", label: "Damaged" }, { value: "lost", label: "Lost" }], example: "In stock" },
      { name: "assigned_to", label: "Assigned to", type: "relation", collection: "users", matchBy: USER_MATCH, hint: "E-mail of the custodian" },
      { name: "department", label: "Department", type: "relation", collection: "departments", matchBy: ["code", "name"], example: "ICT" },
      { name: "supplier", label: "Supplier", type: "relation", collection: "suppliers", matchBy: ["code", "name"] },
      { name: "cost", label: "Cost (RWF)", type: "money", example: 1150000 },
      { name: "purchased_at", label: "Purchase date", type: "date", example: "2026-08-15" },
      { name: "warranty", label: "Warranty", type: "text", example: "3 years" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  publicHolidays: {
    name: "public-holidays",
    title: "Public holidays",
    collection: "public_holidays",
    permission: "manage_leave_policy",
    fields: [
      { name: "date", label: "Date", type: "date", required: true, example: "2026-07-04" },
      { name: "name", label: "Name", type: "text", required: true, example: "Liberation Day" },
      { name: "recurring", label: "Every year", type: "bool", example: "Yes" },
      { name: "confirmed", label: "Confirmed", type: "bool", example: "Yes" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  leaveTypes: {
    name: "leave-types",
    title: "Leave types",
    collection: "leave_types",
    permission: "manage_leave_policy",
    uniqueBy: "code",
    fields: [
      { name: "code", label: "Code", type: "text", upper: true, required: true, example: "STUDY" },
      { name: "name", label: "Name", type: "text", required: true, example: "Study leave" },
      { name: "category", label: "Category", type: "select", required: true, options: ["annual", "sick", "maternity", "paternity", "circumstantial", "study", "unpaid", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), example: "Study" },
      { name: "days_per_year", label: "Days per year", type: "number", example: 10 },
      { name: "day_basis", label: "Counted in", type: "select", options: [{ value: "working", label: "Working days" }, { value: "calendar", label: "Calendar days" }], example: "Working days" },
      { name: "paid", label: "Paid", type: "bool", example: "Yes" },
      { name: "requires_attachment", label: "Needs a document", type: "bool", example: "No" },
      { name: "deducts_annual", label: "Deducted from annual leave", type: "bool", example: "No" },
      { name: "eligible_gender", label: "For", type: "select", options: [{ value: "any", label: "Everyone" }, { value: "female", label: "Women" }, { value: "male", label: "Men" }], example: "Everyone" },
      { name: "max_per_request", label: "Max days per request", type: "number" },
      { name: "legal_reference", label: "Legal reference", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, active: true, day_basis: v.day_basis || "working", eligible_gender: v.eligible_gender || "any" }),
  },

  salaryStructures: {
    name: "salary-structures",
    title: "Salary structures",
    collection: "salary_structures",
    permission: "manage_salaries",
    uniqueBy: "employee",
    notes: ["One row per employee. Amounts are monthly gross amounts in RWF."],
    fields: [
      { name: "employee", label: "Employee", type: "relation", required: true, collection: "users", matchBy: USER_MATCH, example: "employee@dnr-hr.rw" },
      { name: "employment_type", label: "Employment type", type: "select", required: true, options: [{ value: "permanent", label: "Permanent" }, { value: "contract", label: "Contract" }, { value: "casual", label: "Casual" }, { value: "internship", label: "Internship" }], example: "Permanent" },
      { name: "basic_salary", label: "Basic salary", type: "money", required: true, example: 650000 },
      { name: "transport_allowance", label: "Transport allowance", type: "money", example: 80000 },
      { name: "housing_allowance", label: "Housing allowance", type: "money", example: 120000 },
      { name: "communication_allowance", label: "Communication allowance", type: "money", example: 30000 },
      { name: "rssb_number", label: "RSSB number", type: "text" },
      { name: "tin", label: "TIN", type: "text" },
      { name: "payment_method", label: "Paid by", type: "select", options: [{ value: "bank", label: "Bank" }, { value: "mobile_money", label: "Mobile money" }, { value: "cash", label: "Cash" }], example: "Bank" },
      { name: "bank_name", label: "Bank", type: "text", example: "Bank of Kigali" },
      { name: "bank_account", label: "Bank account", type: "text" },
      { name: "momo_number", label: "Mobile money number", type: "phone" },
      { name: "effective_from", label: "Effective from", type: "date", required: true, example: "2026-07-01" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: (v) => ({ ...v, active: true, payment_method: v.payment_method || "bank" }),
    create: async (p) => {
      const existing = await pocketbase.collection("salary_structures").getFirstListItem(`employee = "${p.employee}"`).catch(() => null);
      if (existing) return pocketbase.collection("salary_structures").update(existing.id, p);
      return pocketbase.collection("salary_structures").create({ ...p, other_allowances: [], recurring_deductions: [] });
    },
  },

  vehicles: {
    name: "vehicles",
    title: "Vehicles",
    collection: "cars",
    uniqueBy: "plateNumber",
    fields: [
      { name: "carName", label: "Vehicle", type: "text", required: true, example: "Toyota Land Cruiser" },
      { name: "plateNumber", label: "Plate number", type: "text", required: true, upper: true, example: "GR 123 A" },
      { name: "carModel", label: "Model / year", type: "text", example: "2022" },
      { name: "carType", label: "Type", type: "text", example: "4x4" },
      { name: "carColor", label: "Colour", type: "text", example: "White" },
      { name: "carPrice", label: "Value (RWF)", type: "money" },
      { name: "carDescription", label: "Description", type: "textarea" },
      { name: "carStatus", label: "Available", type: "bool", example: "Yes" },
    ],
    toPayload: (v) => ({ ...v, carStatus: YES(v.carStatus) }),
  },

  clients: {
    name: "partners",
    title: "Partners",
    collection: "clients",
    uniqueBy: "name",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, example: "Nyarugenge District" },
      { name: "contact_person", label: "Contact person", type: "text" },
      { name: "email", label: "E-mail", type: "email" },
      { name: "phone", label: "Phone", type: "phone" },
      { name: "address", label: "Address", type: "text" },
      { name: "industry", label: "Sector", type: "text", example: "Local government" },
    ],
  },
};
