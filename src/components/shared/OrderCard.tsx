/* eslint-disable @typescript-eslint/no-explicit-any */
import { cn } from "@/utils";
import dayjs from "dayjs";
import { Button } from "../ui/button";
import { CheckCircle, Printer, Undo2 } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { forwardRef, useRef, useState } from "react";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import Loader from "../icons/Loader";
import { useStopwatch } from "react-timer-hook";
import Logo from "./Logo";
import { useAuth } from "@/context/auth.context";
import { useReactToPrint } from "react-to-print";
import { IoMdNotifications } from "react-icons/io";

// Renderer callback with condition

function renderNumberWithLeadingZero(number) {
  return number < 10 ? `0${number}` : number;
}

function calculateTicketStatus(creation_time, preparation_time) {
  const ticketTime =
    new Date(creation_time).getTime() + preparation_time * 1000;
  const currentTime = Date.now();
  const timeLeft = ticketTime - currentTime;
  if (timeLeft < 240000 && timeLeft > 0) {
    return "nearDeadline";
  }
  if (timeLeft < 0) {
    return "delayed";
  }
  return "onTime";
}

function CountDown({
  offset,
  setDeliveryStatus,
  created,
  highestPreparationTime,
}) {
  const stopwatchOffset = new Date();
  stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);
  const { seconds, minutes, hours } = useStopwatch({
    autoStart: true,
    offsetTimestamp: stopwatchOffset,
  });
  const ticketTime =
    new Date(created).getTime() + highestPreparationTime * 1000;
  const currentTime = Date.now();
  const timeLeft = ticketTime - currentTime;

  if (timeLeft == 240000) {
    console.log("nearDeadlinenearDeadlinenearDeadline");
    setDeliveryStatus("nearDeadline");
  }

  if (timeLeft == 0) {
    console.log("delayeddelayeddelayeddelayeddelayeddelayed");
    setDeliveryStatus("delayed");
  }

  return (
    <>
      {renderNumberWithLeadingZero(hours)}:
      {renderNumberWithLeadingZero(minutes)}:
      {renderNumberWithLeadingZero(seconds)}
    </>
  );
}
const getOffest = (clock_start) => {
  const now = new Date();
  return (now.getTime() - new Date(clock_start).getTime()) / 1000;
};

const OrderCard = forwardRef(
  ({ order: ticket, ticktesQuery,className,handleNotifictionIcon, ...props }: any, ref: any) => {
    const highestPreparationTime = ticket?.expand?.order_items.reduce(
      (acc, item) => Math.max(acc, item?.expand?.menu?.preparation_time),
      0
    );
    const { user }: any = useAuth();
    const printeRef = useRef();
    const [deliveryStatus, setDeliveryStatus] = useState(
      calculateTicketStatus(ticket.fired_at, highestPreparationTime)
    );
    const [completingItem, setcompletingItem] = useState(undefined);
    const completeItem = async (item) => {
      setcompletingItem(item.id);
      return pocketbase
        .collection("order_items")
        .update(item.id, {
          status: "completed",
        })
        .then(() => {
          ticktesQuery.refetch();
          setcompletingItem(undefined);
          toast.success("Item completed successfully");
        });
    };

    const unCompleteItem = async (item) => {
      setcompletingItem(item.id);
      return pocketbase
        .collection("order_items")
        .update(item.id, {
          status: "pending",
        })
        .then(() => {
          setcompletingItem(undefined);
          toast.success("Item uncompleted successfully");
          ticktesQuery.refetch();
        });
    };

    const [completing, setCompleting] = useState(false);

    const completeTicket = async () => {
      setCompleting(true);
      return Promise.all(
        ticket?.expand?.order_items.map((item) =>
          pocketbase.collection("order_items").update(item.id, {
            status: "completed",
          })
        )
      ).then(() => {
        return pocketbase
          .collection("order_tickets")
          .update(ticket.id, {
            status: "completed",
          })
          .then(() => {
            setCompleting(false);
            toast.success("Ticket completed successfully");
            ticktesQuery.refetch();
          });
      });
    };

    const recallTicket = async () => {
      setCompleting(true);
      return pocketbase
        .collection("order_tickets")
        .update(ticket.id, {
          status: "open",
          fired_at: dayjs(),
        })
        .then(() => {
          setCompleting(false);
          toast.success("Ticket recalled successfully");
          ticktesQuery.refetch();
        });
    };

    const percent =
      (ticket?.expand?.order_items.reduce((acc, item) => {
        return acc + (item.status === "completed" ? 1 : 0);
      }, 0) /
        ticket?.expand?.order_items.length) *
      100;
    const handlePrint = useReactToPrint({
      content: () => printeRef.current,
      removeAfterPrint: true,
      bodyClass:"bg-red-900 print",
      pageStyle:"print",
    });
    
    return (
      <div
        onMouseLeave={()=>{
          if(ticket.isNew){
            handleNotifictionIcon(ticket.id)
          }
        }}
        ref={ref}
        className={cn(
          "relative",
          className
        )}

        {...props}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={cn(
            "bg-white item mb-3 w-full pt-2 pb-0.5 flex flex-col border rounded-[4px] border-slate-300 relative",
            {
              "border-t-[3px] border-t-green-500-": deliveryStatus === "onTime",
              "border-t-[3px] border-t-orange-500-":
                deliveryStatus === "nearDeadline",
              "border-t-[3px] border-t-red-500-": deliveryStatus === "delayed",
            }
          )}
        >
          {
            ticket.isNew &&
            <div
            className={
              cn("absolute -top-2.5 animate-bounce right-0 bg-red rounded-full transform -translate-y-1/2 -translate-x-1/2",{
                "!text-green-500": deliveryStatus === "onTime",
                "!text-orange-500":
                  deliveryStatus === "nearDeadline",
                "!text-red-500": deliveryStatus === "delayed",
              })
            } 
            >
            <IoMdNotifications className=" w-6 h-6" />
            </div>
          }
          
          <div className="border-b-">
            <div className=" px-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-[4px]",
                      ticket.status === "completed"
                        ? "bg-slate-300 font-medium"
                        : {
                            "bg-green-500 text-white":
                              deliveryStatus === "onTime",
                            "bg-orange-500 text-white":
                              deliveryStatus === "nearDeadline",
                            "bg-red-500 text-white":
                              deliveryStatus === "delayed",
                          }
                    )}
                  >
                    {ticket?.expand.order?.expand?.table?.code || "N.A"}
                  </div>
                  <div className="flex flex-col gap-1 items-start">
                    <h4 className="text-[14px] font-medium">Hirwa aldo</h4>
                    <div className="flex items-center gap-3">
                      <p className="text-[12.5px] font-medium text-slate-500 font-medium-">
                        #Order 143
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-end gap-2 flex-col">
                  {ticket.status === "open" ? (
                    <div
                      className={cn(
                        "rounded-[3px] px-2 flex items-center gap-1 py-0.5 text-white text-[12px]",
                        {
                          "bg-green-500 text-white":
                            deliveryStatus === "onTime",
                          "bg-orange-500 text-white":
                            deliveryStatus === "nearDeadline",
                          "bg-red-500 text-white": deliveryStatus === "delayed",
                        }
                      )}
                    >
                      {ticket.status !== "completed" && (
                        <CountDown
                          setDeliveryStatus={setDeliveryStatus}
                          created={ticket.fired_at}
                          highestPreparationTime={highestPreparationTime}
                          offset={getOffest(ticket.fired_at)}
                        />
                      )}
                    </div>
                  ) : (
                    ""
                  )}
                </div>
              </div>
              <div className="flex mt-0 items-center justify-between py-2">
                <span className="text-[12.5px] text-slate-500 font-medium-">
                  {dayjs(ticket.fired_at).format("MMM D, YYYY")}
                </span>
                <span className="text-[12.5px] text-slate-500 font-medium-">
                  {dayjs(ticket.fired_at).format("h:mm:ss A")}
                </span>
              </div>
            </div>
            {ticket.status !== "completed" && (
              <div className="pb-2 px-3 pt-2">
                <Progress
                  className="h-[7px] !bg-slate-200"
                  indicatorClass={cn({
                    "!bg-green-500 text-white": deliveryStatus === "onTime",
                    "!bg-orange-500 text-white":
                      deliveryStatus === "nearDeadline",
                    "!bg-red-500 text-white": deliveryStatus === "delayed",
                  })}
                  value={percent}
                />
              </div>
            )}
          </div>
          <div className="w-full">
            {ticket?.expand?.order_items.map((item, idx) => {
              return (
                <OrderItem
                  deliveryStatus={deliveryStatus}
                  status={ticket.status}
                  onCompleteItem={() => {
                    const unCompletedItems = ticket?.expand?.order_items.filter(
                      (i) => i.status !== "completed"
                    );
                    if (unCompletedItems.length === 1) {
                      console.log("complete ticket");
                      completeTicket();
                    } else {
                      console.log("complete item");
                      completeItem(item);
                    }
                  }}
                  onUnCompleteItem={() => unCompleteItem(item)}
                  disabled={
                    completingItem === item.id ||
                    ticket.status === "completed" ||
                    completing
                  }
                  key={idx}
                  item={item}
                />
              );
            })}
          </div>
          <div className="flex px-2 py-2 gap-2 border-t justify-between- h-full">
            {ticket.status === "completed" ? (
              <Button
                onClick={recallTicket}
                size="sm"
                disabled={completing}
                className="w-full !border-slate-200 hover:!text-slate-700 !bg-slate-100 !text-slate-500-"
                variant="outline"
              >
                {completing ? (
                  <Loader className="mr-2 h-3 w-3 text-slate-700 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 " size={14} />
                )}
                Recall
              </Button>
            ) : (
              <Button
                onClick={completeTicket}
                size="sm"
                disabled={completing}
                className={cn("w-full", {
                  "!bg-green-500 !text-white": deliveryStatus === "onTime",
                  "!bg-orange-500 !text-white":
                    deliveryStatus === "nearDeadline",
                  "!bg-red-500 !text-white": deliveryStatus === "delayed",
                })}
              >
                Complete
                {completing ? (
                  <Loader className="ml-2 h-3 w-3 !text-white animate-spin" />
                ) : (
                  <CheckCircle className="ml-2 " size={15} />
                )}
              </Button>
            )}
            <Button
              onClick={() => handlePrint()}
              variant="secondary"
              className={cn("w-full !text-slate-600 !bg-slate-100")}
              size="sm"
            >
              Print
              <Printer className="ml-2" size={15} />
            </Button>
          </div>
        </div>
        <div className="absolute w-full h-full -top-[10000px] left-0">
          <div
            className="w-80 rounded bg-gray-50 px-6 pt-8 shadow-lg print"
            ref={printeRef}
          >
            <div className="w-fit mx-auto mb-4">
              <Logo />
            </div>
            <h4 className="font-semibold underline text-center">
              Ticket Summmary
            </h4>
            <div className="flex flex-col gap-3 border-b py-6 text-xs">
              <p className="flex justify-between">
                <span className="text-gray-500">Ticket No.:</span>
                <span>{ticket?.id}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Order No.:</span>
                <span>{ticket?.order}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Chef:</span>
                <span>{user?.names || "Chef"}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Waiter:</span>
                <span className="capitalize">
                  {ticket?.expand?.order?.expand?.waiter?.name}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Table Name:</span>
                <span>{ticket?.expand?.order?.expand?.table?.name}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Order Code:</span>
                <span>{ticket?.expand?.order?.code}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className="capitalize">{ticket?.status}</span>
              </p>
            </div>
            <div className="flex flex-col gap-3 pb-6 pt-2 text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="flex">
                    <th className="w-full py-2">Product</th>
                    <th className="min-w-[44px] py-2">QTY</th>
                  </tr>
                </thead>
                <tbody>
                  {ticket?.expand?.order_items.map((item, i) => {
                    return (
                      <tr className="flex" key={i}>
                        <td className="flex-1 py-1 flex flex-col">
                          <div className="flex gap-1">
                            <span>-</span>
                            <div>
                              <p className="font-semibold">
                                {item?.expand?.menu?.name}
                              </p>
                              {item.notes && (
                                <p>
                                  <span className="underline">Notes</span>:{" "}
                                  {item.notes}
                                </p>
                              )}
                              {item.variant && (
                                <div className="items-center justify-between">
                                  {Object.keys(item.variant).map((e, i) => {
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center"
                                      >
                                        <span className="underline capitalize">
                                          {e}:
                                        </span>
                                        <span className="capitalize">
                                          {item.variant[e].name}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="min-w-[44px] text-center">
                          {item?.quantity}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-b border border-dashed" />
              <p className="mx-auto font-semibold">
                Form {ticket?.expand?.kitchen_display?.name}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

function OrderItem({
  item,
  disabled,
  onCompleteItem,
  onUnCompleteItem,
  deliveryStatus,
  status,
}) {
  return (
    <div className="flex px-3 py-2 hover:bg-slate-50 cursor-pointer w-full items-start gap-3">
      <Checkbox
        onCheckedChange={(e) => {
          if (e) {
            onCompleteItem();
          } else {
            onUnCompleteItem();
          }
        }}
        className={cn(
          status === "completed"
            ? "focus-visible:ring-slate-500 data-[state=checked]:bg-slate-500 data-[state=checked]:border-slate-500"
            : {
                "data-[state=checked]:bg-green-500  data-[state=checked]:border-green-500 focus-visible:ring-green-500":
                  deliveryStatus === "onTime",
                "data-[state=checked]:bg-orange-500  data-[state=checked]:border-orange-500 focus-visible:ring-orange-500":
                  deliveryStatus === "nearDeadline",
                " data-[state=checked]:bg-red-500  data-[state=checked]:border-red-500 focus-visible:ring-red-500":
                  deliveryStatus === "delayed",
              }
        )}
        disabled={disabled}
        checked={item.status === "completed"}
        id={`item-${item.id}`}
      />
      <label
        htmlFor={`item-${item.id}`}
        className={cn("w-full", {
          "opacity-50 pointer-events-none": disabled,
        })}
      >
        <div className="flex flex-1 mb-1 text-[13px] text-slate-600 font-medium items-center justify-between">
          <div className="capitalize">{item?.expand?.menu?.name}</div>
          <div>x {item?.quantity}</div>
        </div>

        {item.notes && (
          <p className="whitespace-normal text-sm leading-7">
            <span className="underline">Notes</span>: {item.notes}
          </p>
        )}
        {item.variant && (
          <div className="text-[13px] font-medium items-center justify-between">
            {Object.keys(item.variant).map((e, i) => {
              return (
                <div key={i} className="flex items-center leading-7 gap-2">
                  <span className="underline capitalize">{e}:</span>
                  <span className="capitalize">{item.variant[e].name}</span>
                </div>
              );
            })}
          </div>
        )}
      </label>
    </div>
  );
}

export default OrderCard;
