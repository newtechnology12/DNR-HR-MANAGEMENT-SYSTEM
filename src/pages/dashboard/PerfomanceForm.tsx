import BreadCrumb from "@/components/breadcrumb";
import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
import AppFormSelect from "@/components/forms/AppFormSelect";
import Loader from "@/components/icons/Loader";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import useConfirmModal from "@/hooks/useConfirmModal";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "react-feather";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { useAuth } from "@/context/auth.context";

const formSchema = z.object({
  employee: z.string().min(1, { message: "Employee is a required field" }),
  period_month: z.string().min(1, { message: "Month is a required field" }),
  period_year: z.string().min(1, { message: "Year is a required field" }),
});

const getDefaultValues = (data?: any) => {
  return {
    employee: data?.employee || "",
    period_month: data?.period_month || "",
    period_year: data?.period_year || "",
  };
};

export default function PerfomanceForm() {
  const { performanceId } = useParams();

  const getPerformance = async () => {
    const performance = await pocketbase
      .collection("perfomance_evaluations")
      .getOne(performanceId);
    return performance;
  };

  const { data: performance, status } = useQuery(
    ["perfomance_evaluations", performanceId],
    getPerformance,
    {
      enabled: Boolean(performanceId),
    }
  );

  useEffect(() => {
    if (performance?.perfomance_standards) {
      setperfomance_standards(performance.perfomance_standards);
    }
  }, [performance?.perfomance_standards]);
  useEffect(() => {
    if (performance?.period_assessment) {
      setperiod_assessment(performance.period_assessment);
    }
  }, [performance?.period_assessment]);

  // comment
  useEffect(() => {
    if (performance?.comment) {
      setcomment(performance.comment);
    }
  }, [performance?.comment]);

  const values = useMemo(() => getDefaultValues(performance), [performance]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  const navigate = useNavigate();

  useEffect(() => {
    form.reset();
  }, []);

  const deleteMutation = useMutation({
    mutationFn: () => {
      return pocketbase
        .collection("perfomance_evaluations")
        .delete(performanceId);
    },
    onSuccess: () => {
      navigate("/dashboard/hr/performance");
      toast.success("You have successfully deleted a perfomance");
      confirmModal.close();
    },
    onError: (error: any) => {
      toast.error(error.message);
      console.log(error);
    },
  });

  const confirmModal = useConfirmModal();
  function employeesLoader({ search }) {
    return pocketbase
      .collection("users")
      .getFullList(
        cleanObject({
          filter: search ? `name~"${search}" || names~"${search}"` : undefined,
        })
      )
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  const [period_assessment, setperiod_assessment] = useState([
    {
      title: "Demonstrated Knowledge of duties & Quality of Work",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Timeliness of Delivery",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Impact of Achievement",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Overall Achievement of Goals/Objectives",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Going beyond the call of Duty",
      status: "poor",
      score: 0,
      comment: "",
    },
  ]);

  const [perfomance_standards, setperfomance_standards] = useState([
    {
      title: "Interpersonal skills & ability to work in a team environment	",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Attendance and Punctuality",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Communication Skills",
      status: "poor",
      score: 0,
      comment: "",
    },
    {
      title: "Contributing to company mission",
      status: "poor",
      score: 0,
      comment: "",
    },
  ]);

  const score_types = [
    { title: "P", value: 0, status: "poor" },
    { title: "NI", value: 3, status: "needs improvement" },
    { title: "G", value: 6, status: "good" },
    { title: "VG", value: 9, status: "very good" },
    { title: "E", value: 12, status: "exellent" },
  ];

  const getStatusFromScore = (score: number) => {
    if (score <= 0) {
      return "poor";
    }
    if (score <= 3) {
      return "needs improvement";
    }
    if (score <= 6) {
      return "good";
    }
    if (score <= 9) {
      return "very good";
    }
    if (score <= 12) {
      return "exellent";
    }
  };

  const [comment, setcomment] = useState("");

  const [error, seterror] = useState("");

  const { user } = useAuth();

  const onSubmit = async (data: any) => {
    seterror("");
    const check_exist = performance
      ? null
      : await pocketbase.collection("perfomance_evaluations").getList(1, 1, {
          filter: `employee="${data.employee}" && period_month="${data.period_month}" && period_year="${data.period_year}"`,
        });

    if (check_exist?.totalItems) return seterror("Performance already exists");

    const v = {
      ...data,
      period_assessment,
      perfomance_standards,
      comment,
      score:
        period_assessment?.reduce((acc, curr) => acc + curr.score, 0) +
        perfomance_standards?.reduce((acc, curr) => acc + curr.score, 0),
    };

    return (
      !performance
        ? pocketbase
            .collection("perfomance_evaluations")
            .create({ ...v, created_by: user.id })
        : pocketbase
            .collection("perfomance_evaluations")
            .update(performanceId, v)
    )
      .then((e) => {
        toast.success(
          "You have successfully completed a perfomance evaluation."
        );
        navigate("/dashboard/hr/performance/" + e.id);
      })
      .catch((error) => {
        seterror(error.message);
      });
  };
  return (
    <>
      <div className="px-4">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              {performance ? "Update" : " Create a"} Perfomance Evaluation
            </h2>
            <BreadCrumb
              items={[
                {
                  title: performance
                    ? "Create a perfermance"
                    : "update perfomance",
                  link: "/dashboard",
                },
              ]}
            />
          </div>
        </div>
        <Card>
          <div className="flex- items-center justify-between">
            <div className="px-3 flex items-center justify-between py-3">
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/dashboard/hr/performance");
                }}
                size="sm"
                className="gap-3 rounded-full text-primary hover:underline"
                variant="secondary"
              >
                <ArrowLeft size={16} />
                <span>Go back to performances.</span>
              </Button>
              <div className="flex items-center gap-2">
                {performance && (
                  <Button
                    type="submit"
                    onClick={() => confirmModal.setisOpen(true)}
                    disabled={deleteMutation.isLoading}
                    size="sm"
                    variant="destructive"
                  >
                    Delete Performance
                  </Button>
                )}
                {/* <Button
                  type="submit"
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={
                    form.formState.disabled || form.formState.isSubmitting
                  }
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  Save Performance
                </Button> */}
              </div>
            </div>
            <div>
              {status !== "loading" && (
                <div>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                      <div className="border-b border-dashed">
                        <div className="grid pb-3 px-4 max-w-4xl gap-2">
                          <div className="grid gap-2 grid-cols-3">
                            <AppFormAsyncSelect
                              form={form}
                              label={"Choose employee"}
                              placeholder={"Choose employee"}
                              name={"employee"}
                              loader={employeesLoader}
                            />
                            <AppFormSelect
                              form={form}
                              label={"Choose period year"}
                              placeholder={"Choose period year"}
                              name={"period_year"}
                              options={[
                                "2021",
                                "2022",
                                "2023",
                                "2024",
                                "2025",
                                "2026",
                                "2027",
                                "2028",
                                "2029",
                                "2030",
                              ].map((e) => ({ label: e, value: e }))}
                            />
                            <AppFormSelect
                              form={form}
                              label={"Choose period month"}
                              placeholder={"Choose period month"}
                              name={"period_month"}
                              options={[
                                { label: "January", value: "1" },
                                { label: "February", value: "2" },
                                { label: "March", value: "3" },
                                { label: "April", value: "4" },
                                { label: "May", value: "5" },
                                { label: "June", value: "6" },
                                { label: "July", value: "7" },
                                { label: "August", value: "8" },
                                { label: "September", value: "9" },
                                { label: "October", value: "10" },
                                { label: "November", value: "11" },
                                { label: "December", value: "12" },
                              ]}
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-[14.5px] italic text-slate-500 leading-7 max-w-2xl px-5">
                            Please provide a critical assessment of the
                            performance of the employee within the review period
                            using the following rating scale. Provide examples
                            where applicable. Please use a separate sheet if
                            required.
                          </p>
                          <table className="table mx-5 my-3 border table-bordered w-65">
                            <thead>
                              <tr className="text-left text-sm font-semibold">
                                <th className="py-2 px-3 text-[13.5px] border-r border-b">
                                  P
                                </th>
                                <th className="py-2 px-3 text-[13.5px] border-r border-b">
                                  NI
                                </th>
                                <th className="py-2 px-3 text-[13.5px] border-r border-b">
                                  G
                                </th>
                                <th className="py-2 px-3 text-[13.5px] border-r border-b">
                                  VG
                                </th>
                                <th className="py-2 px-3 text-[13.5px] border-r border-b">
                                  E
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="py-2 px-3 text-sm text-slate-500 border-r border-b">
                                  Poor
                                </td>
                                <td className="py-2 px-3 text-sm text-slate-500 border-r border-b">
                                  Needs Improvement
                                </td>
                                <td className="py-2 px-3 text-sm text-slate-500 border-r border-b">
                                  Good
                                </td>
                                <td className="py-2 px-3 text-sm text-slate-500 border-r border-b">
                                  Very Good
                                </td>
                                <td className="py-2 px-3 text-sm text-slate-500 border-r border-b">
                                  Excellent
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="px-5 pt-5">
                        <div>
                          <h4 className="text-[14.5px] font-semibold text-slate-700 capitalize">
                            1. assessment of goals/objectives set during the
                            review period
                          </h4>
                          <table className="table w-full table-auto   my-4 border table-bordered w-65">
                            <thead>
                              <tr className="text-left text-sm font-semibold">
                                <th className="py-2 px-3 text-[13px] border-r border-b">
                                  Criteria
                                </th>
                                {/* <th className="py-2 px-3 text-[13px] border-r border-b">
                                  P (0)
                                </th> */}
                                {score_types.map((e, i) => {
                                  return (
                                    <th
                                      key={i}
                                      className="py-2 px-3 text-[13px] border-r border-b"
                                    >
                                      {e.title} ({e.value})
                                    </th>
                                  );
                                })}
                                <th className="py-2 text-right- px-3 text-[13px] border-r border-b">
                                  Score
                                </th>
                                <th className="py-2 text-right px-3 text-[13px] border-r border-b">
                                  Comments and Examples
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {period_assessment.map((e, idx) => {
                                return (
                                  <tr key={idx}>
                                    <td className="py-[8px] px-3 text-slate-600 text-[14px] border-r border-b">
                                      {e.title}
                                    </td>

                                    {score_types.map((score, index) => {
                                      return (
                                        <td
                                          key={index}
                                          className="py-[8px] px-3 border-r border-b"
                                        >
                                          <div className="w-full flex justify-center items-center">
                                            <Checkbox
                                              checked={
                                                e.status === score.status
                                              }
                                              onCheckedChange={(checked) => {
                                                if (checked) {
                                                  setperiod_assessment(
                                                    (prev) => {
                                                      return prev.map(
                                                        (item, i) => {
                                                          if (i === idx) {
                                                            return {
                                                              ...item,
                                                              score:
                                                                score.value,
                                                              status:
                                                                score.status,
                                                            };
                                                          }
                                                          return item;
                                                        }
                                                      );
                                                    }
                                                  );
                                                }
                                              }}
                                            />
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className="py-[8px] px-3 border-r border-b">
                                      <input
                                        className="border px-3 text-sm py-1 w-full"
                                        type="number"
                                        value={e.score}
                                        onChange={(e) => {
                                          if (Number(e.target.value) > 12)
                                            return;
                                          setperiod_assessment((prev) => {
                                            return prev.map((item, i) => {
                                              if (i === idx) {
                                                return {
                                                  ...item,
                                                  score: Number(e.target.value),
                                                  status: getStatusFromScore(
                                                    Number(e.target.value)
                                                  ),
                                                };
                                              }
                                              return item;
                                            });
                                          });
                                        }}
                                      />
                                    </td>
                                    <td className="py-[8px] px-3 border-r border-b">
                                      <input
                                        className="border px-3 text-sm py-1 w-full"
                                        type="text"
                                        value={e.comment}
                                        onChange={(e) => {
                                          setperiod_assessment((prev) => {
                                            return prev.map((item, i) => {
                                              if (i === idx) {
                                                return {
                                                  ...item,
                                                  comment: e.target.value,
                                                };
                                              }
                                              return item;
                                            });
                                          });
                                        }}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td className="py-2 px-3 font-semibold text-slate-800 text-[14px] border-r border-b">
                                  Total
                                </td>
                                <td
                                  colSpan={5}
                                  className="py-2 px-3 text-sm text-slate-600 border-r border-b"
                                >
                                  Total Score (Maximum = 60)
                                </td>

                                <td className="py-2 text-sm px-3 text-slate-600 border-r border-b">
                                  {period_assessment.reduce(
                                    (acc, curr) => acc + curr.score,
                                    0
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-600 border-r border-b"></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="px-5 py-4">
                        <div>
                          <h4 className="text-[14.5px] font-semibold text-slate-700 capitalize">
                            2. Assessment of other performance standards and
                            indicators
                          </h4>
                          <table className="table w-full table-auto   my-4 border table-bordered w-65">
                            <thead>
                              <tr className="text-left text-sm font-semibold">
                                <th className="py-2 px-3 text-[13px] border-r border-b">
                                  Criteria
                                </th>
                                {score_types.map((e, i) => {
                                  return (
                                    <th
                                      key={i}
                                      className="py-2 px-3 text-[13px] border-r border-b"
                                    >
                                      {e.title} ({e.value})
                                    </th>
                                  );
                                })}
                                <th className="py-2 px-3 text-[13px] border-r border-b">
                                  Score
                                </th>
                                <th className="py-2 text-right px-3 text-[13px] border-r border-b">
                                  Comments and Examples
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {perfomance_standards.map((e, idx) => {
                                return (
                                  <tr key={idx}>
                                    <td className="py-[8px] px-3 text-slate-600 text-[14px] border-r border-b">
                                      {e.title}
                                    </td>
                                    {score_types.map((score, index) => {
                                      return (
                                        <td
                                          key={index}
                                          className="py-[8px] px-3 border-r border-b"
                                        >
                                          <div className="w-full flex justify-center items-center">
                                            <Checkbox
                                              checked={
                                                e.status === score.status
                                              }
                                              onCheckedChange={(checked) => {
                                                if (checked) {
                                                  setperfomance_standards(
                                                    (prev) => {
                                                      return prev.map(
                                                        (item, i) => {
                                                          if (i === idx) {
                                                            return {
                                                              ...item,
                                                              score:
                                                                score.value,
                                                              status:
                                                                score.status,
                                                            };
                                                          }
                                                          return item;
                                                        }
                                                      );
                                                    }
                                                  );
                                                }
                                              }}
                                            />
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className="py-[8px] px-3 border-r border-b">
                                      <input
                                        className="border px-3 w-full"
                                        type="number"
                                        value={e.score}
                                        onChange={(e) => {
                                          if (Number(e.target.value) > 12)
                                            return;
                                          setperfomance_standards((prev) => {
                                            return prev.map((item, i) => {
                                              if (i === idx) {
                                                return {
                                                  ...item,
                                                  score: Number(e.target.value),
                                                  status: getStatusFromScore(
                                                    Number(e.target.value)
                                                  ),
                                                };
                                              }
                                              return item;
                                            });
                                          });
                                        }}
                                      />
                                    </td>
                                    <td className="py-[8px] px-3 border-r border-b">
                                      <input
                                        className="border px-3 w-full"
                                        type="text"
                                        value={e.comment}
                                        onChange={(e) => {
                                          setperfomance_standards((prev) => {
                                            return prev.map((item, i) => {
                                              if (i === idx) {
                                                return {
                                                  ...item,
                                                  comment: e.target.value,
                                                };
                                              }
                                              return item;
                                            });
                                          });
                                        }}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td className="py-2 px-3 font-semibold text-slate-800 text-[14px] border-r border-b">
                                  Total
                                </td>
                                <td
                                  colSpan={5}
                                  className="py-2 px-3 text-sm text-slate-600 border-r border-b"
                                >
                                  Total Score (Maximum = 40)
                                </td>

                                <td className="py-2 text-sm px-3 text-slate-600 border-r border-b">
                                  {perfomance_standards.reduce(
                                    (acc, curr) => acc + curr.score,
                                    0
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-600 border-r border-b"></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="px-5 pb-4">
                        <div>
                          <h4 className="text-[14.5px] font-semibold text-slate-700 capitalize">
                            3. Comments by the employee
                          </h4>
                          <div className="mt-2">
                            {/* <Label className="text-[13px] mb-1 text-slate-600">
                              Provide overall Comments
                            </Label> */}
                            <Textarea
                              placeholder="Enter overall comments"
                              value={comment}
                              onChange={(e) => setcomment(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="px-5 pb-4">
                        <div>
                          <h4 className="text-[14.5px] font-semibold text-slate-700 capitalize">
                            4. Total Score
                          </h4>
                          <div className="mt-2 pl-4 space-y-2 max-w-[330px]">
                            <div className="flex items-center justify-between">
                              <h4>
                                <span className="text-[14px] text-slate-800 font-semibold">
                                  Performance standards (Maximum = 40)
                                </span>
                              </h4>

                              <span className="text-[13px] text-slate-800 font-semibold">
                                {perfomance_standards.reduce(
                                  (acc, curr) => acc + curr.score,
                                  0
                                )}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <h4>
                                <span className="text-[14px] text-slate-800 font-semibold">
                                  Objectives Set (Maximum = 60)
                                </span>
                              </h4>

                              <span className="text-[14px] text-slate-800 font-semibold">
                                {period_assessment.reduce(
                                  (acc, curr) => acc + curr.score,
                                  0
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <h4>
                                <span className="text-[14px] text-slate-800 font-semibold">
                                  Total Score (Maximum = 100)
                                </span>
                              </h4>

                              <span className="text-[14px] text-slate-800 font-semibold">
                                {period_assessment.reduce(
                                  (acc, curr) => acc + curr.score,
                                  0
                                ) +
                                  perfomance_standards.reduce(
                                    (acc, curr) => acc + curr.score,
                                    0
                                  )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="px-7 mt-4 pb-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="terms" />
                          <label
                            htmlFor="terms"
                            className="text-sm text-slate-500 font-medium- leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            I agree to the terms and conditions.
                          </label>
                        </div>
                      </div>
                      {error && (
                        <div className="max-w-md px-6 mb-3">
                          <Alert
                            variant="destructive"
                            className="py-2 my-2 rounded-[4px] flex items-center"
                          >
                            <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                            <AlertTitle className="text-[13px] font-medium fon !m-0">
                              {error}
                            </AlertTitle>
                          </Alert>
                        </div>
                      )}
                      <div className="px-6 pb-6">
                        <Button
                          type="submit"
                          onClick={form.handleSubmit(onSubmit)}
                          disabled={
                            form.formState.disabled ||
                            form.formState.isSubmitting
                          }
                          size="sm"
                        >
                          {form.formState.isSubmitting && (
                            <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                          )}
                          Save Performance
                        </Button>
                      </div>
                      {/* <div className="py-3 px-7 text-sm text-slate-500">
                        Copyright © 2024 Goodlife ®
                      </div> */}
                    </form>
                  </Form>
                </div>
              )}
              {status === "loading" && (
                <div className="w-full h-[400px] flex items-center justify-center">
                  <Loader className="mr-2 h-5 w-5 text-primary animate-spin" />
                </div>
              )}
            </div>
          </div>
        </Card>{" "}
      </div>
      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
        a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
