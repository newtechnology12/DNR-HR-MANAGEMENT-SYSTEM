import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Loader from "@/components/icons/Loader";
import authService from "@/services/auth.service";
import { toast } from "sonner";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { cn } from "@/utils";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "react-feather";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle } from "lucide-react";
const formSchema = z.object({
  email: z.string().min(1, { message: "Email is a required field" }).email(),
});

export function ForgotPassword() {
  const [error, seterror] = useState(undefined);
  const [success, setsuccess] = useState(undefined);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  // 2. Define a submit handler.
  async function onSubmit(values: z.infer<typeof formSchema>) {
    seterror(undefined);
    setsuccess(undefined);
    return authService
      .forgotPassword({
        email: values.email,
      })
      .then(() => {
        setsuccess("Reset link sent successfully");
      })
      .catch((e) => {
        toast.error(e.message);
        seterror(e.message);
        console.log(e.message);
      });
  }
  return (
    <>
      <div className="container- bg-white relative h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
        <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
          <div className="absolute inset-0 z-30 bg-zinc-900 bg-opacity-80 backdrop-blur-sm" />
          <img
            className="absolute h-full w-full left-0 top-0 object-cover"
            src="/bg.webp"
            alt=""
          />
          <div className="relative z-40">
            <Link to={"/"} className=" flex items-center text-lg font-medium">
              <img className="h-12" src="/dnr_log.png" alt="" />
            </Link>
            <div className="mt-8 flex flex-col gap-2">
              <p className="text-sm">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>

              <span className="flex items-end gap-2">
                <span className="text-5xl font-medium">
                  {
                    new Date()
                      .toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "numeric",
                      })
                      .split(" ")[0]
                  }
                </span>
                <span>
                  {
                    new Date()
                      .toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "numeric",
                      })
                      .split(" ")[1]
                  }
                </span>
              </span>
            </div>
          </div>
          <div className="relative z-40 mt-auto">
            <blockquote className="space-y-4 max-w-xl">
              <p className="text-base leading-8">
                Rwanda's Leading Wellness Group -{" "}
                <span>
                  Health <span>Beauty</span>
                </span>
              </p>
              <footer className="text-sm">
                © {new Date().getFullYear()} GoodLife, Group. All rights
                reserved.
              </footer>
            </blockquote>
          </div>
        </div>
        <div className="py-8 px-3">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="flex flex-col items-center justify-center space-y-2 text-center">
              <img
                className="h-9 mb-2"
                src="https://static.wixstatic.com/media/af5699_f5a953888c274680ac6d7b40738b8ab2~mv2.png/v1/fill/w_160,h_60,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/GOODLIFE%20WEBSITE%20logo.png"
                alt=""
              />

              <h1 className="text-lg font-semibold tracking-tight">
                Forgot your password?
              </h1>
              <p className="text-[14px] text-slate-600 text-muted-foreground">
                Enter your email to reset your password
              </p>
              {error && (
                <Alert
                  variant="destructive"
                  className="rounded-[3px] !mt-4  h-fit p-2 my-3"
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
                  className="rounded-[3px] !mt-4  h-fit p-2 my-3 !border-green-500"
                >
                  <CheckCircle className="h-4 -mt-[6px] w-4 !text-green-500" />
                  <AlertTitle className=" ml-2 text-green-500 !font-medium- !text-left">
                    <span className="text-[13.8px] leading-5">{success}</span>
                  </AlertTitle>
                </Alert>
              )}
            </div>
            <Form {...form}>
              <div className={cn("grid !mt-3 gap-6")}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <div className="grid gap-3">
                    <div className="grid gap-1">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <Label className="sr-only" htmlFor="email">
                                Email
                              </Label>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter Your email"
                                {...field}
                              />
                            </FormControl>

                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div>
                      <div className="flex items-center mb-1 space-x-2">
                        <Checkbox id="terms" />
                        <label
                          htmlFor="terms"
                          className="text-[13px] text-slate-500 font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Accept terms and conditions
                        </label>
                      </div>
                    </div>

                    <Button
                      disabled={
                        form.formState.disabled || form.formState.isSubmitting
                      }
                    >
                      {form.formState.isSubmitting && (
                        <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                      )}
                      Send Reset Link
                    </Button>
                  </div>
                </form>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                </div>
              </div>
            </Form>

            <p className="px-8 text-center leading-8 text-[13.5px] text-slate-500 text-muted-foreground">
              By clicking continue, you agree to our{" "}
              <Link
                to="/terms"
                className="underline underline-offset-4 hover:text-primary"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                className="underline underline-offset-4 hover:text-primary"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
