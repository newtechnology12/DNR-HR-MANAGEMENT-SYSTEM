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
import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Mail } from "react-feather";
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
import { Alert, AlertTitle } from "@/components/ui/alert";
import useModalState from "@/hooks/useModalState";
import LogoutModal from "@/components/modals/LogoutModal";

export default function AccountSettings() {
  const { user } = useAuth();
  const [activeTab, setactiveTab] = useState("personal details");
  return (
    <div className="px-3">
      <div className="flex items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            Account Settings
          </h2>
          <BreadCrumb
            items={[{ title: "Account Settings", link: "/dashboard" }]}
          />
        </div>
      </div>
      <div className="grid grid-cols-10 gap-3">
        <div className="col-span-3">
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
                <p className="text-[12.5px] w-fit px-3 py-[2px] rounded-[3px] text-primary bg-primary bg-opacity-20 capitalize font-medium">
                  {user?.role?.name}
                </p>
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
        <div className="col-span-7">
          <Card>
            <div className="flex px-2 gap-4 w-full border-b items-center justify-start">
              {[
                "personal details",
                "Reset password",
                // "notification settings",
                "logout",
              ].map((e, i) => {
                return (
                  <a
                    key={i}
                    className={cn(
                      "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
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
              Lorem ipsum, dolor sit amet consectetur adipisicing elit.
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

function ResetPassword() {
  const [error, setError] = useState("");
  const [success, setsuccess] = useState("");
  const [isLoading, setisLoading] = useState(false);
  const { user } = useAuth();
  const handle = async () => {
    setisLoading(true);
    setError("");
    setsuccess("");
    try {
      await pocketbase.collection("users").requestPasswordReset(user.email);
      setsuccess("Password reset link sent to your email");
      setisLoading(false);
    } catch (error) {
      setError(error.message);
      setisLoading(false);
    }
  };
  return (
    <div className="max-w-md py-4 px-4">
      <div className="dark:border-slate-700 border-slate-300">
        <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
          <h4 className="font-semibold dark:text-slate-200 text-sm">
            Reset Password
          </h4>
          <p className="text-sm py-3- mt-2 text-slate-600 leading-7">
            Click the button below to reset your password, a reset link will be
            sent to your email.
          </p>
        </div>
        {error && (
          <Alert
            variant={"destructive"}
            className="rounded-[3px] !mt-2  h-fit p-2 my-3"
          >
            <AlertCircle className="h-4 -mt-[6px] w-4" />
            <AlertTitle className=" ml-2 !text-left">
              <span className="text-[13.8px] leading-5">{error}</span>
            </AlertTitle>
          </Alert>
        )}
        {success && (
          <Alert
            variant="default"
            className="rounded-[3px] !mt-2  h-fit p-2 my-3 !border-green-500"
          >
            <CheckCircle className="h-4 -mt-[6px] w-4 !text-green-500" />
            <AlertTitle className=" ml-2 text-green-500 !font-medium- !text-left">
              <span className="text-[13.8px] leading-5">{success}</span>
            </AlertTitle>
          </Alert>
        )}
        <Button
          onClick={handle}
          size="sm"
          type="submit"
          className="mt-1"
          disabled={isLoading}
        >
          {isLoading && (
            <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
          )}
          Reset Password
        </Button>
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
              Lorem ipsum, dolor sit amet consectetur adipisicing elit.
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
