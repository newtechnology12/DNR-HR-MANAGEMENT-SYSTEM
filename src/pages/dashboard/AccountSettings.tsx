import BreadCrumb from "@/components/breadcrumb";
import AppFormField from "@/components/forms/AppFormField";
import Loader from "@/components/icons/Loader";
import Avatar from "@/components/shared/Avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/context/auth.context";
import { cn } from "@/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout, LogOut, Phone, TypeIcon } from "lucide-react";
import { useState } from "react";
import { Mail } from "react-feather";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import pocketbase from "@/lib/pocketbase";
import authService from "@/services/auth.service";
import useModalState from "@/hooks/useModalState";
import LogoutModal from "@/components/modals/LogoutModal";
import { useSearchParams } from "react-router-dom";
import SecuritySettings from "@/pages/account/SecuritySettings";

export default function AccountSettings() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [activeTab, setactiveTab] = useState(params.get("tab") === "security" ? "security" : "personal details");
  return (
    <div className="px-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            Account Settings
          </h2>
          <BreadCrumb
            items={[{ title: "Account Settings", link: "/dashboard" }]}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-3">
        <div className="col-span-1 lg:col-span-3">
          <div className="bg-white rounded-[3px] px-3 border py-4">
            <div className="flex items-center pb-5 text-center flex-col justify-center gap-2">
              <Avatar
                className="h-16 w-16"
                name={user?.names || ""}
                path={user?.photo}
              />
              <div className="flex items-center flex-col justify-center gap-3">
                <h2 className="text-[15px] font-semibold tracking-tight">
                  {user?.names}
                </h2>
                <div className="flex flex-wrap justify-center gap-1">
                  {(user?.roles?.length ? user.roles : [{ id: "main", name: user?.role?.name }]).map((r: any) => (
                    <p key={r.id} className="text-[12px] w-fit px-2.5 py-[2px] rounded-md text-primaryDark bg-primary/10 font-medium">
                      {r.name}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <div className="mb-3 border-b pb-2 border-dashed">
                <h4 className="text-sm font-semibold">Details Info</h4>
              </div>
              <div className="mt-2 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-100">
                    <TypeIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-[13px] !leading-0 capitalize font-semibold">
                      {user.names}
                    </h4>
                    <span className="text-[13px] text-slate-500">
                      Full names
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-100">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-[13px] capitalize- font-semibold">
                      {user.email}
                    </h4>
                    <span className="text-[13px] text-slate-500">
                      Email Address
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-100">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-[13px] capitalize font-semibold">
                      {user.phone}
                    </h4>
                    <span className="text-[13px] text-slate-500">
                      {" "}
                      Phone Number
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-100">
                    <Layout className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-[13px] capitalize font-semibold">
                      {user.department}
                    </h4>
                    <span className="text-[13px] text-slate-500">
                      {" "}
                      Department
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-1 lg:col-span-7">
          <Card>
            <div className="flex px-2 gap-2 sm:gap-4 w-full border-b items-center justify-start overflow-x-auto">
              {[
                "personal details",
                "security",
                "Reset password",
                // "notification settings",
                "logout",
              ].map((e, i) => {
                return (
                  <a
                    key={i}
                    className={cn(
                      "cursor-pointer px-3 sm:px-6 capitalize text-center relative whitespace-nowrap text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
                      {
                        "text-primary ": activeTab === e,
                      }
                    )}
                    onClick={() => {
                      setactiveTab(e);
                    }}
                  >
                    {activeTab === e && (
                      <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                    )}
                    <span className=""> {e}</span>
                  </a>
                );
              })}
            </div>
            <div>
              {activeTab === "logout" && <Logout />}
              {activeTab === "Reset password" && <ResetPassword />}
              {activeTab === "personal details" && <Personal />}
              {activeTab === "security" && <SecuritySettings required={params.get("required") === "1"} />}
              {activeTab === "notification settings" && <Notifications />}
            </div>
          </Card>
        </div>
      </div>
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

  function onSubmit(data: z.infer<typeof FormSchema>) {}
  return (
    <div>
      <div className="max-w-xl pb-5 pt-3 px-4">
        <div className="dark:border-slate-700 border-slate-300">
          <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
            <h4 className="font-semibold dark:text-slate-200 text-[15px]">
              Notification Settings
            </h4>
            <p className="text-[13.5px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
              Choose which email and system notifications you want to receive.
            </p>
          </div>
        </div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full space-y-6"
          >
            <div>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="marketing_emails"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-[4px] border px-3 py-[10px] shadow-sm-">
                      <div className="space-y-1.5">
                        <FormLabel>Marketing emails</FormLabel>
                        <FormDescription>
                          Receive emails about new products, features, and more.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="security_emails"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-[4px] border px-3 py-[10px] shadow-sm-">
                      <div className="space-y-1.5">
                        <FormLabel>Security emails</FormLabel>
                        <FormDescription>
                          Receive emails about your account security.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled
                          aria-readonly
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

function Logout() {
  const logoutModal = useModalState();

  return (
    <>
      <div className="mt-4- rounded-[3px] py-4 px-4">
        <div className="mb-3 py-3- ">
          <h4 className="font-semibold dark:text-slate-100 text-[14px]">
            Logout Your Account
          </h4>
          <p className="text-[14.5px] leading-8 mt-1 dark:text-slate-400 text-slate-500">
            This action cannot be undone. This will permanently logout your
            account
          </p>
        </div>
        <div className="mt-4 flex items-center justify-start">
          <Button
            onClick={() => logoutModal.open()}
            variant="destructive"
            className="px-4"
            size="sm"
          >
            <LogOut className="mr-2" size={14} />
            Logout Your Account
          </Button>
        </div>
      </div>

      <LogoutModal
        onClose={() => logoutModal.close()}
        open={logoutModal.isOpen}
      />
    </>
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
    <div className="grid max-w-3xl gap-6 px-4 py-4 md:grid-cols-[1fr_260px]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <h4 className="text-[14px] font-semibold text-slate-900">Change password</h4>
            <p className="text-[12.5px] text-slate-500">You will stay signed in on this device.</p>
          </div>
          <AppFormField form={form} required type="password" autoComplete="current-password" label="Current password" name="oldPassword" placeholder="" />
          <AppFormField form={form} required type="password" autoComplete="new-password" label="New password" name="password" placeholder="At least 10 characters, letters and numbers" />
          {strength >= 0 && (
            <div aria-live="polite">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full", i < strength ? (strength <= 2 ? "bg-amber-500" : "bg-emerald-500") : "bg-slate-200")} />
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500">{strength <= 2 ? "Weak — add length, capitals, numbers or symbols" : strength <= 3 ? "Good" : "Strong"}</p>
            </div>
          )}
          <AppFormField form={form} required type="password" autoComplete="new-password" label="Confirm new password" name="passwordConfirm" placeholder="" />
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader className="mr-2 h-4 w-4 animate-spin text-white" />}
            Change password
          </Button>
        </form>
      </Form>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[12.5px] text-slate-600">
        <p className="font-medium text-slate-800">Forgot your current password?</p>
        <p className="mt-1">We can email a reset link to {user?.email}.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={sendLink} disabled={linkState === "sending"}>
          {linkState === "sending" ? "Sending…" : "Email me a reset link"}
        </Button>
        {linkState === "sent" && <p className="mt-2 text-emerald-700">Reset link sent — check your inbox.</p>}
        {!["idle", "sending", "sent"].includes(linkState) && <p className="mt-2 text-red-700">{linkState}</p>}
      </div>
    </div>
  );
}

function Personal() {
  const { user } = useAuth();

  const formSchema = z.object({
    name: z.string().min(3, "Name is too short"),
    email: z.string().min(1, { message: "Email is a required field" }),
    phone: z.string().min(1, { message: "Phone is a required field" }),
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
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("An error occured");
    }
  }
  return (
    <div>
      <div className="max-w-2xl py-4 px-4">
        <div className="dark:border-slate-700 border-slate-300">
          <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
            <h4 className="font-semibold dark:text-slate-200 text-sm">
              Update Personal Details
            </h4>
            <p className="text-[13.5px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
              Update your personal and contact information.
            </p>
          </div>
          <div className="mb-0">
            <Form {...form}>
              <form
                className="space-y-2"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <div className="grid-cols-2 gap-2 grid">
                  <AppFormField
                    type={"name"}
                    form={form}
                    label={"Your email"}
                    placeholder={"Enter Full names"}
                    name={"name"}
                  />
                  <AppFormField
                    type={"email"}
                    disabled={true}
                    form={form}
                    label={"Your email"}
                    placeholder={"Enter new email"}
                    name={"email"}
                  />
                </div>
                <div>
                  <AppFormField
                    type={"phone"}
                    form={form}
                    label={"Your phone number"}
                    placeholder={"Enter new number"}
                    name={"phone"}
                  />
                </div>
                <div className="mt-5 flex items-center justify-end">
                  <Button
                    size="sm"
                    type="submit"
                    className="mt-1"
                    disabled={
                      form.formState.disabled || form.formState.isSubmitting
                    }
                  >
                    {form.formState.isSubmitting && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    Update Profile Details
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
