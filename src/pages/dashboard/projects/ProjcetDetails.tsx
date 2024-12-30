import Taskboard from "@/components/Taskboard";
import TenderModal from "@/components/modals/TenderModal";
import NewTaskPannel from "@/components/pannels/NewTaskPannel";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import Skeleton from "@/components/ui/Skeleton";
import { useAuth } from "@/context/auth.context";
import { tasks_status } from "@/data";
import { api } from "@/lib/api";
import { cn } from "@/utils/cn";
import formatPreviewLink from "@/utils/formatPreviewLink";
import { useMemo, useState } from "react";
import { AlertTriangle, PlusCircle } from "react-feather";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import markdownit from "markdown-it";
const md = markdownit();

function isLink(str) {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}
function isExternalLink(url) {
  const currentHostname = window.location.hostname;
  const link = document.createElement("a");
  link.href = url;
  const linkHostname = link.hostname;

  return currentHostname !== linkHostname;
}
export default function ProjectDetails() {
  const params = useParams();
  const navigate = useNavigate();
  const projectId = params.id;

  async function fetchData() {
    const { data } = await api.get(`/projects/${projectId}`);
    return data;
  }
  const {
    data: project,
    status,
    error,
  } = useQuery(["projects", projectId], fetchData, {
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
    enabled: Boolean(projectId),
  });
  const [activeTab, setactiveTab] = useState("Task Board");

  const queryClient = useQueryClient();

  const [showTaskForm, setshowTaskForm] = useState(false);

  async function fetchTasks(e) {
    try {
      const q = e.queryKey[3] || {};
      const { data } = await api.get(`/projects/${project.id}/tasks`, {
        params: q,
      });
      return data;
    } catch (error) {
      console.log(error);
    }
  }

  const qk = useMemo(() => ["project-tasks", project?.id], [project?.id]);

  const {
    data: tasks,
    status: tasksStatus,
    refetch,
  } = useQuery({
    queryFn: fetchTasks,
    staleTime: Infinity,
    queryKey: qk,
    enabled: Boolean(project),
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: (record: any) => {
      return api.put(`/projects/${project.id}/tasks/${record.id}`, {
        status: record.status,
      });
    },
    onMutate: async (newTask) => {
      await queryClient.cancelQueries({ queryKey: qk });
      // Snapshot the previous value
      const previousTasks: any = queryClient.getQueryData(qk);

      const newTasks = previousTasks.map((e) =>
        e.id === newTask.id ? { ...e, ...newTask } : e
      );

      // Optimistically update to the new value
      queryClient.setQueryData(qk, newTasks);

      // Return a context with the previous and new Record
      return { previousTasks, newTasks };
    },
    onError: (err, _, context) => {
      toast.error(err["message"] || "Something went wrong");
      queryClient.setQueryData(qk, context.previousTasks);
    },
  });

  const handleUpdate = (task) => {
    const existingTask = tasks.find((e) => e.id === task.id);
    if (existingTask.status === task.status) return;
    updateMutation.mutate({
      ...task,
    });
  };

  return (
    <>
      <div className="w-full">
        {status === "success" && (
          <div>
            <div className="bg-white border border-slate-200 p-2- rounded-md">
              <div className="flex items-start p-4 pb-1 justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="text-[15px] capitalize font-semibold">
                      {project.name}
                    </h4>
                    <div className="mt-2-">
                      <div className="flex bg-green-100 font-medium text-green-500 px-2 py-1 rounded-md items-center gap-1">
                        <div className="h-[7px] w-[7px] rounded-full bg-green-500"></div>
                        <span className="text-xs capitalize">
                          {
                            [
                              {
                                label: "waiting",
                                value: "waiting",
                              },
                              {
                                label: "on going",
                                value: "on-going",
                              },
                              {
                                label: "completed",
                                value: "completed",
                              },
                              {
                                label: "cancelled",
                                value: "cancelled",
                              },
                            ].find((e) => e.value === project.status)?.label
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[13px] max-w-xl line-clamp-2 mt-2 leading-7 font-medium text-slate-500">
                    {project.description}
                  </div>
                  <div className="my-3 flex  gap-6 max-w-lg">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px]  truncate font-semibold capitalize text-slate-700">
                        Client:
                      </p>
                      <span className="text-slate-500 truncate text-[13px] capitalize font-medium">
                        {project.client}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] truncate font-semibold capitalize text-slate-700">
                        Project Categoty:
                      </p>
                      <span className="text-slate-500 truncate text-[13px] capitalize font-medium">
                        {project.category}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-between items-end">
                  <Button
                    onClick={() => {
                      setshowTaskForm(true);
                    }}
                    LeftIcon={PlusCircle}
                    size="sm"
                  >
                    Add new task
                  </Button>
                </div>
              </div>
              <div className="px-1 flex items-center  justify-between  border-b border-slate-200">
                <div className="flex items-center w-full justify-start px-3 gap-3   py-1">
                  {[
                    "Task Board",
                    //  "Milestones",
                    "Overview",
                  ].map((e, i) => {
                    return (
                      <a
                        key={i}
                        className={cn(
                          "text-[13px] text-center truncate- capitalize py-[6px] px-6 cursor-pointer flex items-center justify-center relative font-medium",
                          {
                            "text-primary font-semibold": activeTab === e,
                            "text-slate-600": activeTab !== e,
                          }
                        )}
                        onClick={() => {
                          setactiveTab(e);
                        }}
                      >
                        {e}
                        {activeTab === e && (
                          <div className="w-full -bottom-1 absolute h-[4px] rounded-t-lg bg-red-600"></div>
                        )}
                      </a>
                    );
                  })}
                </div>
                <div>
                  <a
                    onClick={() => {}}
                    className={cn(
                      "border-dashed hidden cursor-pointer text-[11.5px] hover:bg-slate-100 py-[5px] px-3 font-semibold items-center gap-2 border border-slate-200 rounded-md"
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      height={18}
                      width={18}
                      className="text-slate-800 stroke-current"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g id="SVGRepo_bgCarrier" strokeWidth={0} />
                      <g
                        id="SVGRepo_tracerCarrier"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <g id="SVGRepo_iconCarrier">
                        {"{"}" "{"}"}
                        <path
                          d="M8 8.5C8 9.88071 6.88071 11 5.5 11C4.11929 11 3 9.88071 3 8.5C3 7.11929 4.11929 6 5.5 6C6.88071 6 8 7.11929 8 8.5ZM8 8.5H21M16 15.5C16 16.8807 17.1193 18 18.5 18C19.8807 18 21 16.8807 21 15.5C21 14.1193 19.8807 13 18.5 13C17.1193 13 16 14.1193 16 15.5ZM16 15.5H3"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    </svg>

                    <span className="text-slate-600 truncate">
                      Filter Tasks
                    </span>
                  </a>
                </div>
              </div>
            </div>

            {activeTab === "Task Board" && (
              <>
                {tasksStatus === "loading" && (
                  <>
                    <div className="w-full  flex items-center justify-center border mt-3 h-[500px] bg-white border-slate-200 rounded-md">
                      <Loader />
                    </div>
                  </>
                )}
                {tasksStatus === "success" && (
                  <ProjectTaskBoardContainer
                    refetch={refetch}
                    handleChange={handleUpdate}
                    tasks={tasks || []}
                    project={project}
                    createTask={() => {
                      setshowTaskForm(true);
                    }}
                  />
                )}
              </>
            )}

            {activeTab === "Milestones" && <Milestones project={project} />}
            {activeTab === "Overview" && <Overview project={project} />}
          </div>
        )}
        {status === "loading" && (
          <div>
            <div className="bg-white border border-slate-200 p-2- rounded-md">
              <div className="flex items-start p-4 justify-between">
                <div>
                  <div className="flex mb-4 items-center gap-3">
                    <Skeleton className={"w-[170px] h-4"} />
                    <div className="mt-2-">
                      <Skeleton className={"w-[80px] h-4"} />
                    </div>
                  </div>
                  <div className="space-y-3 mt-4">
                    <Skeleton className={"w-[400px] h-3"} />
                    <Skeleton className={"w-[300px] h-2"} />
                    <Skeleton className={"w-[200px] h-2"} />
                  </div>
                  <div className="my-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className={"w-[130px] h-4"} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className={"w-[100px] h-4"} />
                    </div>
                  </div>
                  <div
                    className={`w-[600px] bg-slate-200 animate-pulse overflow-hidden rounded-md h-[10px]`}
                  >
                    <div
                      style={{
                        width: "60%",
                      }}
                      className={`h-full flex animate-pulse items-center justify-center transition-all rounded-md bg-slate-300`}
                    ></div>
                  </div>
                </div>
                <div className="flex flex-col justify-between items-end"></div>
              </div>
              <div>
                <div className="px-4 flex items-center  justify-between">
                  <div className="flex items-center w-full justify-start gap-3   py-2 border-b border-slate-200">
                    {[1, 2, 3, 4].map((_, i) => {
                      return <Skeleton key={i} className="w-[130px] h-7" />;
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full border mt-3 h-[500px] bg-white border-slate-200 rounded-md"></div>
          </div>
        )}
        {status === "error" && (
          <div>
            <div className="flex bg-white  max-w-2xl border border-slate-200 mx-auto my-12 items-center justify-center flex-col gap-4 py-24">
              <div className="bg-red-200 border-[6px] border-red-100 h-16 w-16 rounded-full flex items-center justify-center">
                <AlertTriangle className="text-red-500" size={22} />
              </div>
              <div className="flex flex-col gap-2 text-center">
                <h4 className="font-semibold text-[15px]">
                  {error["response"]?.data?.message ||
                    "Something  went wrong fetching project information."}
                </h4>
                <h4 className="font-medium text-slate-500 leading-7 text-[13px]">
                  Error occured while fetching data. Please try again <br /> or
                  contact administrator.
                </h4>
                <div className="mt-2">
                  <Button
                    onClick={() => {
                      navigate(-1);
                    }}
                  >
                    Go to previous page
                  </Button>
                </div>
              </div>
            </div>
            <span></span>
          </div>
        )}
      </div>
      <NewTaskPannel
        tasks_status={tasks_status}
        type="project"
        project={project}
        size="lg"
        onComplete={() => {
          refetch();
        }}
        open={showTaskForm}
        onClose={() => {
          setshowTaskForm(false);
        }}
      />
    </>
  );
}

function ProjectTaskBoardContainer({
  tasks,
  handleChange,
  project,
  createTask,
  refetch,
}) {
  return (
    <>
      <Taskboard
        cols={tasks_status}
        handleRefetch={refetch}
        createTask={createTask}
        handleChange={handleChange}
        tasks={tasks || []}
        type={"project"}
        members={project.members}
      />
    </>
  );
}

function Milestones({ project }) {
  console.log(project);
  return (
    <div className="bg-white border mt-2 p-3 border-slate-300 rounded-md">
      <span className="text-[13px] font-medium "> Milestones comming soon</span>
    </div>
  );
}

function Overview({ project }) {
  const [showTender, setshowTender] = useState(false);
  const { user } = useAuth();
  return (
    <>
      {" "}
      <div>
        <div className="bg-white border mt-2 p-3 border-slate-300 rounded-md">
          <div className="grid px-[6px] gap-6 my-0 pt-0 grid-cols-2">
            {[
              {
                key: "Project name",
                value: project.name,
              },
              {
                key: "Project type",
                value: "Project and consultancy",
              },
              {
                key: "Start date",
                value: new Date(project?.start).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
              },
              {
                key: "End date",
                value: new Date(project?.end).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
              },

              { key: "status", value: project?.status },

              {
                key: "Assigned to",
                value: project?.assignedTo
                  ? project?.assignedTo["first_name"] +
                    " " +
                    project?.assignedTo["last_name"]
                  : "N/A",
              },
              { key: "Client email", value: project?.email },
              { key: "Client phone", value: project?.phone },
              { key: "Tin number", value: project?.tin_number },
              {
                key: "client address",
                value: `${project?.client_address?.district}, ${project?.client_address?.province}, ${project?.client_address?.country}`,
              },
              {
                key: "contract doc",
                value: project.contract_doc || "N/A",
              },
              {
                key: "tender",
                value: project?.tender?.title || "N/A",
                // link: `${location.pathname}?show_tender=${project.tender.id}`,
                onClick: () => {
                  setshowTender(true);
                },
              },
              { key: "Payment cycle", value: project?.payment_cycle },
              {
                key: "Project fees",
                value: project?.fees?.toLocaleString() || +" Frw",
                hidden: !["admin", "project-manager"].includes(user.role),
              },
              { key: "Contract duration", value: project?.contract_duration },
            ]
              .filter((e) => !e.hidden)
              .map((e: any, i) => {
                return (
                  <div
                    onClick={(i) => {
                      i.preventDefault();
                      i.stopPropagation();
                      if (e.onClick) {
                        setshowTender(true);
                      }
                    }}
                    className="flex items-center gap-4"
                    key={i}
                  >
                    <span className="text-[12.5px] truncate font-medium capitalize text-slate-500">
                      {e.key}:
                    </span>
                    {isLink(e.value) || e.link ? (
                      <>
                        {!isExternalLink(e.link || e.value) ? (
                          <Link
                            to={e.link || e.value}
                            className="text-[12.5px] underline truncate font-semibold text-slate-700"
                          >
                            {e.value}
                          </Link>
                        ) : (
                          <a
                            href={formatPreviewLink(e.value)}
                            target={"_blank"}
                            className="text-[12.5px] underline truncate font-semibold text-slate-700"
                          >
                            {formatPreviewLink(e.value)}
                          </a>
                        )}
                      </>
                    ) : (
                      <span
                        className={`text-[12.5px] truncate font-semibold capitalize text-slate-700 ${
                          e.onClick ? "underline cursor-pointer" : ""
                        }`}
                      >
                        {e.value}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="px-2 mt-3 py-2">
            <h2 className="text-[13px] font-semibold capitalize text-slate-700">
              Description
            </h2>
            <p className="mt-2 text-[13px] prose max-w-3xl font-medium leading-7 text-slate-600">
              <div
                dangerouslySetInnerHTML={{
                  __html: md.render(project.description),
                }}
              ></div>
            </p>
          </div>
        </div>
      </div>
      <TenderModal
        open={showTender}
        onClose={() => {
          setshowTender(false);
        }}
        tender={project.tender}
      />
    </>
  );
}
