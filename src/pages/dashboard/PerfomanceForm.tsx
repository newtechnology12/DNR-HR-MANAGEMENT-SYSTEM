import AsyncSelectField from "@/components/AsyncSelectField";
import { Skeleton } from "@/components/ui/skeleton";
import useConfirmModal from "@/hooks/useConfirmModal";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/context/auth.context";
import {
  Checkbox,
  Column,
  ConfirmDialog,
  DataTable,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  Textarea,
} from "@/components/ims";

const LIST = "/dashboard/hr/performance";

const formSchema = z.object({
  employee: z.string().min(1, { message: "Choose the employee to evaluate." }),
  period_month: z.string().min(1, { message: "Choose the month." }),
  period_year: z.string().min(1, { message: "Choose the year." }),
});

const getDefaultValues = (data?: any) => {
  return {
    employee: data?.employee || "",
    period_month: data?.period_month || "",
    period_year: data?.period_year || "",
  };
};

const YEARS = ["2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029", "2030"];
const MONTHS = [
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
];

/** Display names for the stored rating words (the stored values, typos included, stay as they are). */
const RATING_LABEL: Record<string, string> = {
  poor: "Poor",
  "needs improvement": "Needs improvement",
  good: "Good",
  "very good": "Very good",
  exellent: "Excellent",
};

type Rating = { title: string; status: string; score: number; comment: string };

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
      toast.success("Performance evaluation deleted");
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

  const [agreed, setAgreed] = useState(false);

  const { user } = useAuth();

  const onSubmit = async (data: any) => {
    seterror("");
    const check_exist = performance
      ? null
      : await pocketbase.collection("perfomance_evaluations").getList(1, 1, {
          filter: `employee="${data.employee}" && period_month="${data.period_month}" && period_year="${data.period_year}"`,
        });

    if (check_exist?.totalItems) return seterror("This employee already has an evaluation for that month. Open it from the list to change it.");

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
        toast.success("Performance evaluation saved");
        navigate("/dashboard/hr/performance/" + e.id);
      })
      .catch((error) => {
        seterror(error.message);
      });
  };

  const objectivesTotal = period_assessment.reduce((acc, curr) => acc + curr.score, 0);
  const standardsTotal = perfomance_standards.reduce((acc, curr) => acc + curr.score, 0);

  /** One rating table: criteria in rows, the five levels as radio buttons, then the score and a comment. */
  const ratingColumns = (group: string, setRows: Dispatch<SetStateAction<Rating[]>>, total: number): Column<Rating>[] => [
    {
      key: "title",
      header: "Criteria, comments and examples",
      className: "min-w-[260px]",
      cell: (e, idx) => (
        <span className="block py-1">
          <span className="block text-ims-text">{e.title.trim()}</span>
          <Input
            type="text"
            className="mt-2 h-9"
            placeholder="Comments and examples (optional)"
            aria-label={`${e.title.trim()}: comments and examples`}
            value={e.comment}
            onChange={(ev) => {
              setRows((prev) => {
                return prev.map((item, i) => {
                  if (i === idx) {
                    return {
                      ...item,
                      comment: ev.target.value,
                    };
                  }
                  return item;
                });
              });
            }}
          />
        </span>
      ),
    },
    ...score_types.map((score) => ({
      key: score.title,
      header: <span title={RATING_LABEL[score.status]}>{score.title} ({score.value})</span>,
      align: "center" as const,
      width: "60px",
      cell: (e: Rating, idx: number) => (
        <input
          type="radio"
          name={`${group}-${idx}`}
          className="h-4 w-4 cursor-pointer accent-ims-primary align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
          checked={e.status === score.status}
          aria-label={`${e.title.trim()}: ${RATING_LABEL[score.status]} (${score.value})`}
          onChange={(ev) => {
            if (ev.target.checked) {
              setRows((prev) => {
                return prev.map((item, i) => {
                  if (i === idx) {
                    return {
                      ...item,
                      score: score.value,
                      status: score.status,
                    };
                  }
                  return item;
                });
              });
            }
          }}
        />
      ),
    })),
    {
      key: "score",
      header: "Score",
      numeric: true,
      width: "96px",
      total: <span className="tabular-nums">{total}</span>,
      cell: (e, idx) => (
        <Input
          type="number"
          max={12}
          className="h-9 text-right tabular-nums"
          aria-label={`${e.title.trim()}: score out of 12`}
          value={e.score}
          onChange={(ev) => {
            if (Number(ev.target.value) > 12) return;
            setRows((prev) => {
              return prev.map((item, i) => {
                if (i === idx) {
                  return {
                    ...item,
                    score: Number(ev.target.value),
                    status: getStatusFromScore(Number(ev.target.value)),
                  };
                }
                return item;
              });
            });
          }}
        />
      ),
    },
  ];

  const errors = form.formState.errors;
  const summaryErrors: FormError[] = [
    ...(errors.employee?.message ? [{ field: "perf-employee", message: String(errors.employee.message) }] : []),
    ...(errors.period_year?.message ? [{ field: "perf-year", message: String(errors.period_year.message) }] : []),
    ...(errors.period_month?.message ? [{ field: "perf-month", message: String(errors.period_month.message) }] : []),
    ...(error ? [{ message: error }] : []),
  ];
  const watched = form.watch();

  const legend = (
    <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-control bg-ims-subtle px-3 py-2 text-t-small text-ims-body">
      {score_types.map((s) => (
        <span key={s.title}>
          <span className="font-bold text-ims-text">{s.title}</span> {RATING_LABEL[s.status]} ({s.value})
        </span>
      ))}
    </p>
  );

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "HR", to: "/dashboard/hr/employees" },
          { label: "Performance appraisals", to: LIST },
          { label: performance ? "Edit evaluation" : "New evaluation" },
        ]}
        title={performance ? "Edit performance evaluation" : "New performance evaluation"}
        subtitle="A critical assessment of one employee's month, criterion by criterion; the total is out of 100."
        secondary={
          performance
            ? [{ label: "Delete evaluation", icon: Trash2, variant: "danger", disabled: deleteMutation.isLoading, onClick: () => confirmModal.setisOpen(true) }]
            : []
        }
      />

      {status === "loading" ? (
        <>
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-80 w-full rounded-card" />
        </>
      ) : (
        <>
          <ErrorSummary errors={summaryErrors} title={error && summaryErrors.length === 1 ? "The evaluation could not be saved" : "Check these fields before you save"} />
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormBody
              aside={
                <SummaryPanel
                  title="Total score"
                  rows={[
                    ["Objectives (max 60)", objectivesTotal],
                    ["Performance standards (max 40)", standardsTotal],
                    ["Total (max 100)", <span key="t" className="text-[18px] font-extrabold">{objectivesTotal + standardsTotal}</span>],
                  ]}
                  checklist={[
                    { label: "Employee chosen", done: Boolean(watched.employee) },
                    { label: "Year and month chosen", done: Boolean(watched.period_year && watched.period_month) },
                  ]}
                />
              }
            >
              <FormSection title="Employee and period" description="Who is evaluated, and for which month.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <Field label="Employee" required htmlFor="perf-employee" error={errors.employee?.message ? String(errors.employee.message) : null}>
                    <Controller
                      control={form.control}
                      name="employee"
                      render={({ field, fieldState }) => (
                        <AsyncSelectField
                          name="employee"
                          inputId="perf-employee"
                          placeholder="Search employee by name"
                          className="!min-h-[42px] !rounded-control !shadow-none"
                          error={fieldState.error?.message}
                          loader={employeesLoader}
                          defaultOptions={true}
                          value={field.value}
                          onChange={(e: any) => field.onChange(e?.value)}
                        />
                      )}
                    />
                  </Field>
                  <Field label="Year" required htmlFor="perf-year" error={errors.period_year?.message ? String(errors.period_year.message) : null}>
                    <Controller
                      control={form.control}
                      name="period_year"
                      render={({ field, fieldState }) => (
                        <Select id="perf-year" value={field.value || ""} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} invalid={Boolean(fieldState.error)}>
                          <option value="">Choose a year</option>
                          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </Select>
                      )}
                    />
                  </Field>
                  <Field label="Month" required htmlFor="perf-month" error={errors.period_month?.message ? String(errors.period_month.message) : null}>
                    <Controller
                      control={form.control}
                      name="period_month"
                      render={({ field, fieldState }) => (
                        <Select id="perf-month" value={field.value || ""} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} invalid={Boolean(fieldState.error)}>
                          <option value="">Choose a month</option>
                          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </Select>
                      )}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Goals and objectives" description="Assessment of the goals and objectives set for the review period. Give examples where you can.">
                {legend}
                <div className="overflow-hidden rounded-control border border-ims-border">
                  <DataTable
                    columns={ratingColumns("objectives", setperiod_assessment as Dispatch<SetStateAction<Rating[]>>, objectivesTotal)}
                    rows={period_assessment as Rating[]}
                    rowKey={(_, i) => String(i)}
                    minWidth={640}
                    totalLabel="Total (maximum 60)"
                    caption="Goals and objectives"
                  />
                </div>
              </FormSection>

              <FormSection title="Other performance standards" description="Assessment of other performance standards and indicators.">
                <div className="overflow-hidden rounded-control border border-ims-border">
                  <DataTable
                    columns={ratingColumns("standards", setperfomance_standards as Dispatch<SetStateAction<Rating[]>>, standardsTotal)}
                    rows={perfomance_standards as Rating[]}
                    rowKey={(_, i) => String(i)}
                    minWidth={640}
                    totalLabel="Total (maximum 40)"
                    caption="Other performance standards"
                  />
                </div>
              </FormSection>

              <FormSection title="Comments by the employee">
                <Field label="Overall comments" htmlFor="perf-comment">
                  <Textarea id="perf-comment" placeholder="Enter overall comments" value={comment} onChange={(e) => setcomment(e.target.value)} />
                </Field>
                <Checkbox id="terms" label="I agree to the terms and conditions." checked={agreed} onChange={setAgreed} />
              </FormSection>
            </FormBody>

            <FormActions
              submitType="submit"
              submitLabel="Save evaluation"
              cancelTo={LIST}
              busy={form.formState.isSubmitting}
              disabled={form.formState.disabled}
              note={`Total score ${objectivesTotal + standardsTotal} of 100`}
            />
          </form>
        </>
      )}

      <ConfirmDialog
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
        danger
        title="Delete this performance evaluation?"
        description="The evaluation is removed permanently. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutateAsync()}
      />
    </Page>
  );
}
