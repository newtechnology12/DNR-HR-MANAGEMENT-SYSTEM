/**
 * Account settings: the signed-in person's profile card, and tabs for personal details, sign-in
 * security (two-factor authentication), password and signing out.
 */
import * as React from "react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Control, Controller, FieldValues, Path, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import Avatar from "@/components/shared/Avatar";
import { useAuth } from "@/context/auth.context";
import pocketbase from "@/lib/pocketbase";
import authService from "@/services/auth.service";
import SecuritySettings from "@/pages/account/SecuritySettings";
import { Button, Card, Checkbox, ConfirmDialog, Details, Field, Input, Page, PageHeader, Pill, Tabs } from "@/components/ims";
import { cn } from "@/utils";

type TabKey = "personal" | "security" | "password" | "logout" | "notifications";

/** A kit input bound to react-hook-form, with the field's error under it. */
function FormInput<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  ...input
}: { control: Control<T>; name: Path<T>; label: string; required?: boolean; hint?: React.ReactNode } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = `acc-${String(name)}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} required={required} htmlFor={id} hint={hint} error={fieldState.error?.message}>
          <Input id={id} {...field} value={field.value ?? ""} {...input} invalid={Boolean(fieldState.error)} />
        </Field>
      )}
    />
  );
}

export default function AccountSettings() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [activeTab, setactiveTab] = useState<TabKey>(params.get("tab") === "security" ? "security" : "personal");
  const roles = user?.roles?.length ? user.roles : [{ id: "main", name: user?.role?.name }];
  return (
    <Page>
      <PageHeader breadcrumbs={[{ label: "Account settings" }]} title="Account settings" subtitle="Your profile, password and sign-in security." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="self-start">
          <div className="flex flex-col items-center gap-2 border-b border-ims-divider pb-5 text-center">
            <Avatar className="h-16 w-16" name={user?.names || ""} path={user?.photo} />
            <h2 className="text-t-section text-ims-text">{user?.names}</h2>
            <div className="flex flex-wrap justify-center gap-1">
              {roles.map((r: any) => <Pill key={r.id} tone="info">{r.name}</Pill>)}
            </div>
          </div>
          <Details
            className="pt-4"
            columns={1}
            items={[
              { label: "Full name", value: user?.names },
              { label: "E-mail", value: <span className="break-all">{user?.email}</span> },
              { label: "Phone", value: user?.phone },
              { label: "Department", value: user?.department },
            ]}
          />
        </Card>
        <Card padded={false} className="overflow-hidden">
          <Tabs
            inset
            label="Account settings"
            active={activeTab}
            onChange={(k) => setactiveTab(k as TabKey)}
            tabs={[
              { key: "personal", label: "Personal details" },
              { key: "security", label: "Security" },
              { key: "password", label: "Password" },
              { key: "logout", label: "Sign out" },
            ]}
          />
          <div className="px-[18px] py-[18px] sm:px-5 sm:py-5">
            {activeTab === "logout" && <Logout />}
            {activeTab === "password" && <ResetPassword />}
            {activeTab === "personal" && <Personal />}
            {activeTab === "security" && <SecuritySettings required={params.get("required") === "1"} />}
            {activeTab === "notifications" && <Notifications />}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-t-section text-ims-text">{title}</h3>
      {subtitle && <p className="mt-0.5 text-t-body text-ims-muted">{subtitle}</p>}
    </div>
  );
}

function Notifications() {
  const FormSchema = z.object({
    marketing_emails: z.boolean().default(false).optional(),
    security_emails: z.boolean(),
  });

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      security_emails: true,
    },
  });

  function onSubmit(_data: z.infer<typeof FormSchema>) {}
  return (
    <div className="max-w-xl">
      <SectionTitle title="Notification settings" subtitle="Choose which e-mail and system notifications you want to receive." />
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <Controller
          control={form.control}
          name="marketing_emails"
          render={({ field }) => (
            <div className="rounded-control border border-ims-border px-3.5 py-3">
              <Checkbox label="Product e-mails" hint="Receive e-mails about new features." checked={Boolean(field.value)} onChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="security_emails"
          render={({ field }) => (
            <div className="rounded-control border border-ims-border px-3.5 py-3">
              <Checkbox label="Security e-mails" hint="Receive e-mails about your account security." checked={Boolean(field.value)} onChange={field.onChange} disabled />
            </div>
          )}
        />
      </form>
    </div>
  );
}

function Logout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-xl">
      <SectionTitle title="Sign out" subtitle="Ends your session on this device. You can sign in again at any time with your password." />
      <Button variant="danger" icon={LogOut} onClick={() => setOpen(true)}>Sign out</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Sign out of RALGA IMS?"
        description="Your session on this device ends and you return to the sign-in page."
        confirmLabel="Sign out"
        danger
        onConfirm={() => authService.logout().then(() => navigate("/"))}
      />
    </div>
  );
}

const passwordSchema = z
  .object({
    oldPassword: z.string().min(1, { message: "Enter your current password" }),
    password: z
      .string()
      .min(10, { message: "Use at least 10 characters" })
      .regex(/[A-Za-z]/, { message: "Include at least one letter" })
      .regex(/[0-9]/, { message: "Include at least one number" }),
    passwordConfirm: z.string().min(1, { message: "Repeat the new password" }),
  })
  .refine((v) => v.password === v.passwordConfirm, { message: "The passwords do not match", path: ["passwordConfirm"] })
  .refine((v) => v.password !== v.oldPassword, { message: "Choose a password different from the current one", path: ["password"] });

/** Change password (current password required), with an emailed reset link as a fallback. */
function ResetPassword() {
  const { user } = useAuth();
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent" | string>("idle");
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { oldPassword: "", password: "", passwordConfirm: "" },
  });

  async function onSubmit(values: z.infer<typeof passwordSchema>) {
    try {
      await authService.changePassword(values as { oldPassword: string; password: string; passwordConfirm: string });
      toast.success("Password changed. Use your new password next time you sign in.");
      form.reset();
    } catch (e: any) {
      const field = e?.response?.data?.oldPassword ? "oldPassword" : e?.response?.data?.password ? "password" : null;
      const message = field === "oldPassword" ? "The current password is incorrect" : e?.response?.data?.password?.message || e?.message || "Could not change the password";
      if (field) form.setError(field as any, { message });
      else toast.error(message);
    }
  }

  const sendLink = async () => {
    setLinkState("sending");
    try {
      await pocketbase.collection("users").requestPasswordReset(user.email);
      setLinkState("sent");
    } catch (e: any) {
      setLinkState(e?.message || "The reset email could not be sent. Ask an administrator to check the email (SMTP) settings.");
    }
  };

  const strength = (() => {
    const v = form.watch("password") || "";
    let score = 0;
    if (v.length >= 10) score++;
    if (v.length >= 14) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    return v ? score : -1;
  })();

  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <SectionTitle title="Change password" subtitle="You stay signed in on this device." />
        <FormInput control={form.control} name="oldPassword" label="Current password" required type="password" autoComplete="current-password" />
        <div>
          <FormInput control={form.control} name="password" label="New password" required type="password" autoComplete="new-password" placeholder="At least 10 characters, letters and numbers" />
          {strength >= 0 && (
            <div aria-live="polite" className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full", i < strength ? (strength <= 2 ? "bg-ims-priority-high" : "bg-ims-success") : "bg-ims-divider")} />
                ))}
              </div>
              <p className="mt-1 text-t-hint text-ims-muted">{strength <= 2 ? "Weak — add length, capitals, numbers or symbols" : strength <= 3 ? "Good" : "Strong"}</p>
            </div>
          )}
        </div>
        <FormInput control={form.control} name="passwordConfirm" label="Confirm new password" required type="password" autoComplete="new-password" />
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Change password</Button>
      </form>
      <div className="self-start rounded-control border border-ims-border bg-ims-thead p-4 text-t-small text-ims-body">
        <p className="text-t-body font-bold text-ims-text">Forgot your current password?</p>
        <p className="mt-1">We can e-mail a reset link to {user?.email}.</p>
        <Button size="sm" className="mt-3" onClick={sendLink} loading={linkState === "sending"}>
          {linkState === "sending" ? "Sending…" : "E-mail me a reset link"}
        </Button>
        {linkState === "sent" && <p role="status" className="mt-2 text-ims-success">Reset link sent — check your inbox.</p>}
        {!["idle", "sending", "sent"].includes(linkState) && <p role="alert" className="mt-2 text-ims-danger">{linkState}</p>}
      </div>
    </div>
  );
}

function Personal() {
  const { user } = useAuth();

  const formSchema = z.object({
    name: z.string().min(3, "Enter your full name (at least 3 characters)"),
    email: z.string().min(1, { message: "Email is a required field" }),
    phone: z.string().min(1, { message: "Enter your phone number" }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      name: user.names,
      email: user.email,
      phone: user.phone,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await pocketbase.collection("users").update(user.id, values);
      toast.success("Profile saved");
    } catch (error) {
      toast.error("Your profile could not be saved. Try again.");
    }
  }
  return (
    <div className="max-w-2xl">
      <SectionTitle title="Personal details" subtitle="Your name and contact information." />
      <form noValidate className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput control={form.control} name="name" label="Full name" required autoComplete="name" placeholder="Your full name" />
          <FormInput control={form.control} name="email" label="E-mail" type="email" disabled hint="Your e-mail is your sign-in name; it cannot be changed here." />
        </div>
        <FormInput control={form.control} name="phone" label="Phone number" required type="tel" autoComplete="tel" placeholder="+250 788 000 000" />
        <div className="flex justify-end border-t border-ims-divider pt-4">
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting} disabled={form.formState.disabled}>
            Save profile
          </Button>
        </div>
      </form>
    </div>
  );
}
