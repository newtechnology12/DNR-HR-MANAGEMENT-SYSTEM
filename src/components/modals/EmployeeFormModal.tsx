import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AsyncSelectField from "../AsyncSelectField";
import { Button, DatePicker, ErrorSummary, Field, FormError, Input, Modal, ModalSection, MoneyInput, Select, toDate } from "@/components/ims";

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return `Dnr-${Array.from(crypto.getRandomValues(new Uint32Array(10)), (b) => chars[b % chars.length]).join("")}`;
}

const formSchema = z.object({
  first_name: z.string().trim().min(1, { message: "Enter the first name." }),
  last_name: z.string().trim().min(1, { message: "Enter the last name." }),
  names: z.string().optional(),
  other_names: z.string().optional(),
  nationality: z.string().optional(),
  id_passport_number: z.string().optional(),
  personal_telephone: z.string().optional(),
  personal_email: z.string().trim().min(1, { message: "Enter the email address: it is used to log in." }).email({ message: "Enter a valid email address, for example name@ralga.org.rw." }),
  father_name: z.string().optional(),
  mother_name: z.string().optional(),
  place_of_birth: z.string().optional(),
  full_address: z.string().optional(),
  department: z.string().optional(),
  status: z.string().min(1, { message: "Choose the employee status." }),
  certified_academic_documents: z.string().optional(),
  previous_employers: z.string().optional(),
  number_of_dependents: z.coerce.string().optional(),
  spouse_name: z.string().optional(),
  spouse_telephone: z.string().optional(),
  spouse_email: z.string().optional(),
  spouse_occupation: z.string().optional(),
  spouse_employer: z.string().optional(),
  spouse_position: z.string().optional(),
  spouse_medical_insurance: z.string().optional(),
  spouse_id_passport: z.string().optional(),
  children_names: z.string().optional(),
  recent_tested_diseases: z.string().optional(),
  physical_handicap: z.string().optional(),
  ongoing_education: z.string().optional(),
  other_employment: z.string().optional(),
  business_shareholding: z.string().optional(),
  bank_accounts: z.string().optional(),
  loans_ongoing: z.string().optional(),
  recent_pay_slips: z.string().optional(),
  recent_bank_statements: z.string().optional(),
  criminal_record: z.string().optional(),
  role: z.string().min(1, { message: "Choose the role: it sets what the employee can see and do." }),
  designation: z.string().optional(),
  branch: z.string().optional(),
  employment_type: z.string().optional(),
  gender: z.string().optional(),
  birth: z.date({ invalid_type_error: "Choose a valid date of birth." }).optional(),
  country: z.string().optional(),
  national_id: z.string().optional(),
  salary: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  joined_at: z.date({ invalid_type_error: "Choose a valid joining date." }).optional(),
});

// Users store one "name"; split it so editing an employee does not start with empty name fields.
const nameParts = (data?: any) => {
  const parts = String(data?.name || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

const getDefaultValues = (data?: any) => ({
  first_name: data?.first_name || nameParts(data).first,
  last_name: data?.last_name || nameParts(data).last,
  name: data?.names || "", // Map to database column `name`
  other_names: data?.other_names || "",
  nationality: data?.nationality || "",
  id_passport_number: data?.id_passport_number || "",
  personal_telephone: data?.phone || "", // Map to database column `phone`
  personal_email: data?.email || "", // Map to database column `email`
  father_name: data?.father_name || "",
  mother_name: data?.mother_name || "",
  place_of_birth: data?.place_of_birth || "",
  full_address: data?.address || "", // Map to database column `address`
  department: data?.department || "",
  status: data?.status || "Active",
  certified_academic_documents: data?.certified_academic_documents || "",
  previous_employers: data?.previous_employers || "",
  number_of_dependents: String(data?.number_of_dependents ?? ""),
  spouse_name: data?.spouse_name || "",
  spouse_telephone: data?.spouse_telephone || "",
  spouse_email: data?.spouse_email || "",
  spouse_occupation: data?.spouse_occupation || "",
  spouse_employer: data?.spouse_employer || "",
  spouse_position: data?.spouse_position || "",
  spouse_medical_insurance: data?.spouse_medical_insurance || "",
  spouse_id_passport: data?.spouse_id_passport || "",
  children_names: data?.children_names || "",
  recent_tested_diseases: data?.recent_tested_diseases || "",
  physical_handicap: data?.physical_handicap || "",
  ongoing_education: data?.ongoing_education || "",
  other_employment: data?.other_employment || "",
  business_shareholding: data?.business_shareholding || "",
  bank_accounts: data?.bank_accounts || "",
  loans_ongoing: data?.loans_ongoing || "",
  recent_pay_slips: data?.recent_pay_slips || "",
  recent_bank_statements: data?.recent_bank_statements || "",
  criminal_record: data?.criminal_record || "",
  role: data?.role || "",
  designation: data?.designation || "",
  branch: data?.branch || "",
  employment_type: data?.employment_type || "",
  gender: data?.gender || "",
  birth: data?.birth ? new Date(data?.birth) : undefined,
  country: data?.country || "",
  national_id: data?.national_id || "",
  salary: data?.salary || "",
  bank_name: data?.bank_name || "",
  bank_account_number: data?.bank_account_number || "",
  joined_at: data?.joined_at ? new Date(data?.joined_at) : undefined,
});

const EMPLOYMENT_TYPES = [
  { label: "Intern", value: "intern" },
  { label: "Probation", value: "probation" },
  { label: "Permanent", value: "permanent" },
  { label: "Casual", value: "casual" },
  { label: "Contract", value: "contract" },
  { label: "Part-time", value: "part-time" },
];
const STATUSES = [
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
  { label: "Suspended", value: "suspended" },
  { label: "Terminated", value: "terminated" },
  { label: "Resigned", value: "resigned" },
];
const GENDERS = ["Female", "Male"];

/** Date values are kept as Date objects (the payload is unchanged); the picker works in "yyyy-MM-dd". */
const ymd = (d?: Date | null) => (d instanceof Date && !Number.isNaN(d.getTime()) ? format(d, "yyyy-MM-dd") : "");
const asyncSelectClass = "!min-h-[42px] !rounded-control !shadow-none";

export function EmployeeFormModal({ open, setOpen, employee, onComplete }: any) {
  const values = useMemo(() => getDefaultValues(employee), [employee]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [employee, values, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("Form submitted with values:", values); // Debugging log

    // Map form values to database columns
    const data = {
      email: values.personal_email, // Map personal_email to email
      name: values.first_name.trim() + " " + values.last_name.trim(), // Concatenate first_name and last_name
      phone: values.personal_telephone, // Map personal_telephone to phone
      status: values.status,
      salary: values.salary,
      department: values.department,
      gender: values.gender,
      birth: values.birth,
      national_id: values.national_id,
      country: values.country,
      address: values.full_address, // Map full_address to address
      role: values.role,
      branch: values.branch,
      employment_type: values.employment_type,
      bank_name: values.bank_name,
      bank_account_number: values.bank_account_number,
      designation: values.designation,
      joined_at: values.joined_at || new Date(),
      other_names: values.other_names,
      father_name: values.father_name,
      mother_name: values.mother_name,
      place_of_birth: values.place_of_birth,
      certified_academic_documents: values.certified_academic_documents,
      previous_employers: values.previous_employers,
      number_of_dependents: values.number_of_dependents,
      spouse_name: values.spouse_name,
      spouse_telephone: values.spouse_telephone,
      spouse_email: values.spouse_email,
      spouse_occupation: values.spouse_occupation,
      spouse_employer: values.spouse_employer,
      spouse_position: values.spouse_position,
      spouse_medical_insurance: values.spouse_medical_insurance,
      spouse_id_passport: values.spouse_id_passport,
      children_names: values.children_names,
      recent_tested_diseases: values.recent_tested_diseases,
      physical_handicap: values.physical_handicap,
      ongoing_education: values.ongoing_education,
      other_employment: values.other_employment,
      business_shareholding: values.business_shareholding,
      loans_ongoing: values.loans_ongoing,
      recent_pay_slips: values.recent_pay_slips,
      recent_bank_statements: values.recent_bank_statements,
      criminal_record: values.criminal_record,
    };

    console.log("Mapped data for submission:", data); // Debugging log

    try {
      // Check if the user already exists
      const existingUser = await pocketbase
        .collection("users")
        .getFirstListItem(`email = "${values.personal_email}"`)
        .catch(() => null);

      if (existingUser && !employee) {
        // If user exists and we're not updating an existing employee
        const shouldUpdate = confirm(
          "An employee with this email already exists. Update the existing record instead?"
        );

        if (shouldUpdate) {
          // Update the existing user
          await pocketbase.collection("users").update(existingUser.id, {
            ...data,
          });

          onComplete();
          toast.success(`${data.name} updated`);
          form.reset();
          return;
        } else {
          // Do not proceed with creating a new user
          toast.info("No employee was created");
          return;
        }
      }

      // If user does not exist or we're updating an existing employee
      // The database requires 8+ character passwords, so the old fixed "123456" default always failed.
      // Each new employee gets a unique temporary password, shown once to the person creating the account.
      const temporaryPassword = employee ? "" : generateTemporaryPassword();
      const q = !employee
        ? pocketbase.collection("users").create({
            emailVisibility: true,
            password: temporaryPassword,
            passwordConfirm: temporaryPassword,
            ...data,
          })
        : pocketbase.collection("users").update(employee.id, {
            ...data,
          });

      await q;

      onComplete();
      if (employee) {
        toast.success(`${data.name} updated`);
      } else {
        toast.success(`${data.name} added`, {
          description: `Temporary password: ${temporaryPassword}. Share it privately; it is not shown again.`,
          duration: 60000,
        });
      }
      form.reset();

      // Handle department changes if updating an employee
      if (employee && employee.department !== data.department) {
        const newDepartment = await pocketbase
          .collection("departments")
          .getOne(data.department);

        const oldDepartment = await pocketbase
          .collection("departments")
          .getOne(employee?.department);

        await pocketbase.collection("departments").update(data.department, {
          employees: [...newDepartment.employees, employee.id],
        });

        await pocketbase.collection("departments").update(employee.department, {
          employees: oldDepartment.employees.filter((e) => e !== employee.id),
        });
      }
    } catch (e) {
      console.error("Error during submission:", e); // Debugging log
      if (e.data?.email?.message) {
        form.setError("personal_email", {
          type: "custom",
          message: e.data.email.message,
        });
      } else {
        toast.error("The employee could not be saved. Check the details and try again.");
      }
    }
  }

  function rolesLoader({ search }) {
    return pocketbase
      .collection("roles")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) =>
        e.items.map((e) => ({ label: e.names || e.name, value: e.id }))
      );
  }

  function departmentsLoader({ search }) {
    return pocketbase
      .collection("departments")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) =>
        e.items.map((e) => ({ label: e.names || e.name, value: e.id }))
      );
  }

  function designationLoader({ search }) {
    return pocketbase
      .collection("designations")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) => e.items.map((e) => ({ label: e.name, value: e.id })));
  }

  function branchesLoader({ search }) {
    return pocketbase
      .collection("branches")
      .getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      })
      .then((e) =>
        e.items.map((e) => ({ label: e.names || e.name, value: e.id }))
      );
  }

  // ------------------------------------------------------------------ field helpers
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  const err = (k: string) => errors[k]?.message || null;
  const id = (k: string) => `emp-${k}`;

  const text = (name: string, label: string, o: { required?: boolean; placeholder?: string; type?: string; hint?: string; wide?: boolean; inputMode?: "numeric" | "tel" | "email" | "text" } = {}) => (
    <Field label={label} required={o.required} htmlFor={id(name)} error={err(name)} hint={o.hint} className={o.wide ? "sm:col-span-2" : undefined}>
      <Input id={id(name)} type={o.type || "text"} inputMode={o.inputMode} placeholder={o.placeholder} invalid={Boolean(err(name))} {...form.register(name as any)} />
    </Field>
  );

  const asyncSelect = (name: "role" | "designation" | "department" | "branch", label: string, placeholder: string, loader: (a: { search: string }) => Promise<any[]>, required?: boolean) => (
    <Field label={label} required={required} htmlFor={id(name)} error={err(name)}>
      <Controller
        control={form.control}
        name={name}
        render={({ field, fieldState }) => (
          <AsyncSelectField
            name={name}
            inputId={id(name)}
            placeholder={placeholder}
            className={asyncSelectClass}
            error={fieldState.error?.message}
            loader={loader}
            defaultOptions={true}
            value={field.value}
            onChange={(e: any) => field.onChange(e?.value)}
          />
        )}
      />
    </Field>
  );

  /** Controlled select; a stored value that is not in the list stays visible (and is kept) instead of looking empty. */
  const choice = (name: "gender" | "employment_type" | "status", label: string, placeholder: string, options: { label: string; value: string }[], required?: boolean) => (
    <Field label={label} required={required} htmlFor={id(name)} error={err(name)}>
      <Controller
        control={form.control}
        name={name}
        render={({ field, fieldState }) => (
          <Select id={id(name)} name={field.name} ref={field.ref} value={field.value || ""} onBlur={field.onBlur} onChange={(e) => field.onChange(e.target.value)} invalid={Boolean(fieldState.error)}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {field.value && !options.some((o) => o.value === field.value) && <option value={field.value}>{field.value}</option>}
          </Select>
        )}
      />
    </Field>
  );

  const date = (name: "birth" | "joined_at", label: string, hint?: string) => (
    <Field label={label} htmlFor={id(name)} error={err(name)} hint={hint}>
      <Controller
        control={form.control}
        name={name}
        render={({ field, fieldState }) => (
          <DatePicker
            id={id(name)}
            value={ymd(field.value)}
            max={name === "birth" ? format(new Date(), "yyyy-MM-dd") : undefined}
            invalid={Boolean(fieldState.error)}
            onChange={(v) => field.onChange(toDate(v) || undefined)}
          />
        )}
      />
    </Field>
  );

  const summary: FormError[] = form.formState.isSubmitted
    ? Object.entries(errors)
        .filter(([, e]) => e?.message)
        .map(([k, e]) => ({ field: id(k), message: String(e!.message) }))
    : [];
  const busy = form.formState.isSubmitting;

  return (
    <Modal
      open={Boolean(open)}
      onClose={() => setOpen(false)}
      size="lg"
      title={employee ? `Edit ${employee.name || "employee"}` : "New employee"}
      description={employee ? "Changes apply to the employee record as soon as you save." : "The email is used to log in. A temporary password is shown once the account is created."}
      footer={
        <>
          <Button variant="ghost" onClick={() => form.reset()} disabled={busy} className="sm:mr-auto">Reset form</Button>
          <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="employee-form" loading={busy} disabled={form.formState.disabled}>
            {employee ? "Save changes" : "Create employee"}
          </Button>
        </>
      }
    >
      <form id="employee-form" noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 [counter-reset:ims-section]">
        <ErrorSummary errors={summary} title="Check these fields before you save" />

        <ModalSection title="Personal details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("first_name", "First name", { required: true, placeholder: "For example: Aline" })}
            {text("last_name", "Last name", { required: true, placeholder: "For example: Uwimana" })}
            {text("name", "Full name (as on ID)", { wide: true })}
            {text("other_names", "Other names")}
            {choice("gender", "Gender", "Not specified", GENDERS.map((g) => ({ label: g, value: g })))}
            {date("birth", "Date of birth")}
            {text("place_of_birth", "Place of birth")}
            {text("nationality", "Nationality", { placeholder: "For example: Rwandan" })}
            {text("country", "Country of residence")}
            {text("national_id", "National ID", { inputMode: "numeric", hint: "16 digits for a Rwandan ID." })}
            {text("id_passport_number", "Passport number")}
            {text("personal_telephone", "Personal telephone", { type: "tel", inputMode: "tel", placeholder: "For example: 078 123 4567" })}
            {text("personal_email", "Email (used to log in)", { required: true, type: "email", inputMode: "email", placeholder: "name@example.com" })}
            {text("father_name", "Father's name")}
            {text("mother_name", "Mother's name")}
            {text("full_address", "Full address", { wide: true })}
          </div>
        </ModalSection>

        <ModalSection title="Family">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("spouse_name", "Spouse name")}
            {text("spouse_telephone", "Spouse telephone", { type: "tel", inputMode: "tel" })}
            {text("spouse_email", "Spouse email", { type: "email", inputMode: "email" })}
            {text("spouse_occupation", "Spouse occupation")}
            {text("spouse_employer", "Spouse employer")}
            {text("spouse_position", "Spouse position")}
            {text("spouse_medical_insurance", "Spouse medical insurance")}
            {text("spouse_id_passport", "Spouse ID or passport")}
            {text("children_names", "Children's names", { hint: "Separate names with commas." })}
            {text("number_of_dependents", "Number of dependents", { inputMode: "numeric" })}
          </div>
        </ModalSection>

        <ModalSection title="Employment">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {asyncSelect("role", "Role", "Choose a role", rolesLoader, true)}
            {asyncSelect("designation", "Designation", "Choose a designation", designationLoader)}
            {asyncSelect("department", "Department", "Choose a department", departmentsLoader)}
            {asyncSelect("branch", "Branch", "Choose a branch", branchesLoader)}
            {choice("employment_type", "Employment type", "Choose employment type", EMPLOYMENT_TYPES)}
            {choice("status", "Employee status", "Choose employee status", STATUSES, true)}
            {date("joined_at", "Joined on", "Today's date is used when you leave it empty.")}
            <Field label="Salary" htmlFor={id("salary")} hint="Gross monthly salary.">
              <Controller
                control={form.control}
                name="salary"
                render={({ field }) => {
                  const n = Number(String(field.value ?? "").replace(/[^\d.]/g, ""));
                  return <MoneyInput id={id("salary")} value={field.value === "" || field.value === undefined || Number.isNaN(n) ? "" : n} onChange={(v) => field.onChange(v === "" ? "" : String(v))} />;
                }}
              />
            </Field>
            {text("certified_academic_documents", "Certified academic documents")}
            {text("previous_employers", "Previous employers")}
          </div>
        </ModalSection>

        <ModalSection title="Banking and legal">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("bank_name", "Bank name")}
            {text("bank_account_number", "Bank account number", { inputMode: "numeric" })}
            {text("loans_ongoing", "Loans ongoing")}
            {text("recent_pay_slips", "Recent pay slips")}
            {text("recent_bank_statements", "Recent bank statements")}
            {text("criminal_record", "Criminal record")}
          </div>
        </ModalSection>
      </form>
    </Modal>
  );
}
