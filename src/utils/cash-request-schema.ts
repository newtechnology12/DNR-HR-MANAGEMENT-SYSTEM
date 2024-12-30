import { z } from "zod";

export const expenseCategories = [
  { label: "Travel", value: "travel" },
  { label: "Office Supplies", value: "office_supplies" },
  { label: "Meals and Entertainment", value: "meals_entertainment" },
  { label: "Utilities", value: "utilities" },
  { label: "Communication", value: "communication" },
  { label: "Transport", value: "transportation" },
  { label: "Commission and Fees", value: "commission_fees" },
  { label: "Professional Services", value: "professional_services" },
  { label: "Marketing and Advertising", value: "marketing_advertising" },
  { label: "Insurance", value: "insurance" },
  { label: "Salaries and Wages", value: "salaries_wages" },
  { label: "Rent and Lease", value: "rent_lease" },
  { label: "Repairs and Maintenance", value: "repairs_maintenance" },
  { label: "Training and Education", value: "training_education" },
  { label: "Subscriptions and Licenses", value: "subscriptions_licenses" },
  { label: "Equipment and Furniture", value: "equipment_furniture" },
  { label: "Depreciation", value: "depreciation" },
  { label: "Taxes and Dues", value: "taxes_dues" },
  { label: "Bank Charges", value: "bank_charges" },
  { label: "Gifts and Donations", value: "gifts_donations" },
  { label: "Airtime", value: "airtime" },
  { label: "Internet Subscription", value: "internet_subscription" },
  { label: "Tender", value: "tender" },
  { label: "Inyange Water", value: "inyange_water" },
  { label: "Gibu WANTE", value: "gibu_wante" },
  { label: "Other", value: "other" },
];

export const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Mobile Money", value: "mobile_money" },
];

export const CashRequestFormSchema = z.object({
  employeeName: z.string().optional(),
  department: z.string().optional(),
  expenseCategory: z.string().min(1, "Expense category is required"),
  totalAmount: z.number().min(1, "Total amount is required"),
  date: z.date(),
  paymentMethod: z.string().min(1, "Payment method is required"),
  additionalInfo: z.string().optional(),
  momoNumber: z.string().optional(),
  momoName: z.string().optional(),
  particularly: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  preparedBy: z.string().optional(),
  verifiedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  attachment: z.any().optional(),
});

export type CashRequestFormData = z.infer<typeof CashRequestFormSchema>;

export function getDefaultValues(data?: Partial<CashRequestFormData>, user?: any): CashRequestFormData {
  return {
    employeeName: user?.names || data?.employeeName || "",
    department: user?.department || data?.department || "",
    expenseCategory: data?.expenseCategory || "",
    totalAmount: data?.totalAmount || 0,
    date: data?.date ? new Date(data.date) : new Date(),
    paymentMethod: data?.paymentMethod || "",
    additionalInfo: data?.additionalInfo || "",
    momoNumber: data?.momoNumber || "",
    momoName: data?.momoName || "",
    particularly: data?.particularly || "",
    description: data?.description || "",
    preparedBy: data?.preparedBy || "",
    verifiedBy: data?.verifiedBy || "",
    approvedBy: data?.approvedBy || "",
    attachment: data?.attachment || null,
  };
}