import { Printer, User, Terminal } from "react-feather";
import { BiChevronDown, BiGridVertical } from "react-icons/bi";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MdOutlineTableRestaurant } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { CustomerModal } from "./CustomerModal";
import { InvoiceModal } from "./InvoiceModal";
import {
  AlarmClock,
  ArrowRightIcon,
  CheckCheckIcon,
  CheckCircle2,
  CheckIcon,
  ChevronDown,
  CircleDotDashedIcon,
  CreditCard,
  PlusCircle,
  PrinterIcon,
  SplitIcon,
  Trash,
  XCircle,
} from "lucide-react";
import EditOrderModal from "./EditOrderModal";

import Loader from "./icons/Loader";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { cn } from "@/utils";
import { PaymentModal } from "./modals/PaymentModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import UpdateOrderItemModal from "./UpdateOrderItemModal";
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { closestCenter, PointerSensor } from "@dnd-kit/core";
import { arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStopwatch } from "react-timer-hook";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useModalState from "@/hooks/useModalState";
import { Skeleton } from "./ui/skeleton";
import { SplitBillModal } from "./modals/SplitBillModal";
import formatBill from "@/utils/formatBill";
import adjustStockAfterSale from "@/utils/adjustStockAfterSale";
import { useAuth } from "@/context/auth.context";

function PosCart({
  order,
  refechOrder,
  orderQuery,
  activeCourse,
  setactiveCourse,
}: any) {
  const [showCustomersModal, setshowCustomersModal] = useState(false);

  const [showPrintIvoiceModal, setshowPrintIvoiceModal] = useState(false);

  const [showTableEditModal, setshowTableEditModal] = useState(false);

  const [updatingCustomer, setupdatingCustomer] = useState(false);

  const updateCustomer = (customer) => {
    setupdatingCustomer(true);
    return pocketbase
      .collection("orders")
      .update(order.id, {
        customer: customer.id,
      })
      .then(() => {
        refechOrder();
        setTimeout(() => {
          setupdatingCustomer(false);
          toast.success("customer updated succesfully");
        }, 1000);
      })
      .catch((e) => {
        console.log(e);
        setupdatingCustomer(false);
        toast.success(e.message);
      });
  };

  const [canceling, setcanceling] = useState(false);

  const freeTable = () => {
    return pocketbase
      .collection("tables")
      .update(order.table, { status: "available" });
  };

  const { user } = useAuth();
  const cancleOrder = () => {
    setcanceling(true);
    return pocketbase
      .collection("orders")
      .update(order.id, {
        status: "canceled",
        canceled_at: new Date(),
        canceled_by: user?.id,
      })
      .then(async () => {
        refechOrder();
        if (order.table) {
          await freeTable();
        }
        setTimeout(() => {
          setcanceling(false);
          toast.success("order canceled succesfully");
        }, 500);
      })
      .catch((e) => {
        console.log(e);
        setcanceling(false);
        toast.success(e.message);
      });
  };

  const [showPaymentModal, setshowPaymentModal] = useState(false);

  const createCourse = async () => {
    try {
      const course = await pocketbase.collection("order_tickets").create({
        order: order.id,
        status: "draft",
        name: `Course ${(order?.expand?.tickets?.length || 0) + 1}`,
      });

      await pocketbase.collection("orders").update(order.id, {
        "tickets+": [course.id],
      });

      refechOrder();
      setactiveCourse(course.id);
    } catch (error) {
      console.log(error);
    }
  };

  const createCourseMutation = useMutation({
    mutationFn: () => {
      return createCourse();
    },
  });

  const splitBillModal = useModalState();

  const balance = Number(
    order?.expand?.bills?.map(formatBill).reduce((a, b) => a + b.balance, 0)
  );

  const completeOrder = async () => {
    try {
      await pocketbase.collection("orders").update(order.id, {
        status: "completed",
        completed_at: new Date(),
      });
    } catch (error) {
      console.log(error);
    }
  };

  const completeOrderMutation = useMutation({
    mutationFn: () => {
      return completeOrder();
    },
    onSuccess: () => {
      orderQuery.refetch();
      toast.success("Completed order succesfully");
    },
    onError: () => {
      toast.error("failed to Complete order");
    },
  });

  return (
    <>
      <PaymentModal
        order={order}
        open={showPaymentModal}
        setOpen={setshowPaymentModal}
        orderQuery={orderQuery}
        onCompleted={() => {
          orderQuery.refetch();
          setshowPaymentModal(false);
          freeTable();
          setshowPrintIvoiceModal(true);
        }}
      />

      <SplitBillModal
        order={order}
        open={splitBillModal.isOpen}
        setOpen={splitBillModal.setisOpen}
        orderQuery={orderQuery}
        onCompleted={() => {
          orderQuery.refetch();
          splitBillModal.close();
        }}
      />

      <CustomerModal
        open={showCustomersModal}
        setOpen={setshowCustomersModal}
        onSelect={(e) => {
          setshowCustomersModal(false);
          updateCustomer(e);
        }}
      />
      <InvoiceModal
        isReciept={order?.status === "completed"}
        order={orderQuery.data}
        open={showPrintIvoiceModal}
        setOpen={setshowPrintIvoiceModal}
        handlePay={() => {
          setshowPaymentModal(true);
          setshowPrintIvoiceModal(false);
        }}
      />
      <EditOrderModal
        open={showTableEditModal}
        setOpen={setshowTableEditModal}
        order={order}
        onCompleted={() => {
          setshowTableEditModal(false);
          refechOrder();
        }}
      />
      <div className="h-full flex flex-col bg-white">
        <div className="border-b flex  px-2 py-2 items-center justify-between">
          <div className="space-y-[2px]">
            <h4 className="text-[13px] font-semibold">Current Order</h4>
          </div>
          <div>
            {!order?.expand?.items?.length ? (
              <Button
                onClick={cancleOrder}
                variant="secondary"
                className="text-red-500 border-red-200 border bg-red-50 hover:bg-red-100"
                size="sm"
              >
                {canceling ? (
                  <Loader className="mr-2 h-4 w-4 text-red-500 animate-spin" />
                ) : (
                  <XCircle size={16} className="mr-2" />
                )}
                Cancel Order
              </Button>
            ) : (
              <Button
                disabled={
                  !order?.items ||
                  !order?.items?.length ||
                  order?.status === "completed" ||
                  !order?.expand?.items.every(function (item) {
                    return item.status === "completed";
                  }) ||
                  completeOrderMutation.isLoading
                }
                onClick={() => completeOrderMutation.mutate()}
                size="sm"
              >
                {completeOrderMutation.isLoading && (
                  <Loader className="mr-2 h-[14px] w-[14px] text-white animate-spin" />
                )}
                <CheckCheckIcon size={16} className="mr-2 text-white" />
                Complete Order
              </Button>
            )}
          </div>
        </div>
        <div className="py-2 flex justify-between items-center px-2 border-b">
          <Button
            onClick={() => setshowCustomersModal(true)}
            variant="secondary"
            size="sm"
            className="border  !text-slate-600"
            disabled={
              updatingCustomer ||
              order?.status === "completed" ||
              order?.status === "canceled"
            }
          >
            {updatingCustomer ? (
              <Loader className="mr-2 h-4 w-4 text-slate-900 animate-spin" />
            ) : (
              <User size={15} className="mr-2 text-slate-900" />
            )}
            {order?.expand?.customer
              ? order?.expand?.customer?.names
              : "Select Customer"}

            <BiChevronDown size={15} className="ml-2 text-slate-900" />
          </Button>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setshowTableEditModal(true)}
              className="flex items-center gap-2 border  !text-slate-600"
              variant="secondary"
              size="sm"
              disabled={
                order?.status === "completed" || order?.status === "canceled"
              }
            >
              <MdOutlineTableRestaurant size={17} />
              <span>{order?.expand?.table?.name || "Select table"}</span>
              <ChevronDown size={16} />
            </Button>
          </div>
        </div>
        {orderQuery.status === "loading" && (
          <div className="flex px-4 text-center w-full sm:h-full h-[50dvh] items-center py-14 justify-center gap-2 flex-col">
            <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
          </div>
        )}

        {orderQuery.status === "error" && (
          <div className="flex px-4 w-full sm:h-full h-[50dvh] items-center- py-14=">
            <Alert variant="destructive" className="rounded-sm h-fit my-5">
              <Terminal className="h-4 w-4" />
              <AlertTitle>
                <span className="text-sm">Error: Something went wrong</span>
              </AlertTitle>
              <AlertDescription>{orderQuery.error["message"]}</AlertDescription>
            </Alert>
          </div>
        )}

        {orderQuery.status === "success" && (
          <>
            <ScrollArea className="w-full scroller sm:h-full h-[50dvh]- whitespace-nowrap">
              <div className="px-[6px] pb-[6px]">
                {(orderQuery?.data?.expand?.tickets || []).map((e, i) => {
                  const items = orderQuery?.data?.items?.filter(
                    (i) => i.order_ticket === e.id
                  );
                  // sort based on e.order_items which is like this ["sdsd","dsd"]
                  const sortedItems = items.sort(
                    (a, b) =>
                      e.order_items.indexOf(a.id) - e.order_items.indexOf(b.id)
                  );
                  return (
                    <TicketItem
                      ticket={{
                        id: e.id,
                        name: e.name,
                        count: sortedItems?.length || 0,
                        items: sortedItems,
                        status: e.status,
                        fired_at: e.fired_at,
                      }}
                      setactiveCourse={setactiveCourse}
                      key={i}
                      activeCourse={activeCourse}
                      orderQuery={orderQuery}
                      index={i}
                      order={order}
                    />
                  );
                })}
                <a
                  onClick={() => createCourseMutation.mutate()}
                  className={cn(
                    "flex items-center cursor-pointer my-2 rounded-[3px] w-full py-2 text-[13px] text-center font-medium border-green-500 bg-opacity-35 text-primary justify-center border border-dashed bg-green-50 hover:bg-green-100",
                    {
                      "opacity-60 pointer-events-none":
                        createCourseMutation.isLoading ||
                        order.status === "completed" ||
                        order.status === "canceled",
                    }
                  )}
                >
                  {createCourseMutation.isLoading ? (
                    <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
                  ) : (
                    <PlusCircle size={15} className="mr-2 text-primary" />
                  )}
                  Add a course
                </a>
              </div>
            </ScrollArea>
          </>
        )}
        <div className="w-full pt-0 sm:pt-2 border-t px-3">
          <div className="border-b space-y-2 py-2 border-dashed">
            <div className="hidden- sm:flex pb-2- items-center justify-between">
              <span className="text-[13px] text-slate-500 font-medium">
                Items
              </span>
              <span className="text-[13px] text-slate-500 font-medium">
                ({order?.itemsCount || 0} Item{order?.itemsCount > 1 && "s"})
              </span>
            </div>
          </div>
          <div className="flex pb-1 pt-2 items-center justify-between">
            <span className="font-semibold text-[14px]">Grand Total</span>
            <span className="text-[15px] text-primary font-semibold">
              {Number(
                order?.expand?.bills
                  ?.map(formatBill)
                  .reduce((a, b) => a + b.total, 0) || 0
              ).toLocaleString()}{" "}
              FRW
            </span>
          </div>
          <div className="flex py-3 sm:pt-1 items-center justify-between">
            <h4 className="font-medium text-slate-600 text-[13px]">
              Paid Amount
            </h4>
            <span className="font-medium text-slate-600 text-[13px]">
              {Number(
                order?.expand?.bills
                  ?.map(formatBill)
                  .reduce((a, b) => a + b.total_paid, 0) || 0
              ).toLocaleString()}{" "}
              FRW
            </span>
          </div>
          <div className="flex pb-3 pt-0 sm:pt-1 items-center justify-between">
            <h4 className="font-medium text-slate-600 text-[13px]">
              Balance/Remaining
            </h4>
            <span className="font-medium text-slate-600 text-[13px]">
              {(balance || 0).toLocaleString()} FRW
            </span>
          </div>
          <div className="pb-2 flex items-center gap-2">
            <Button
              onClick={() => setshowPaymentModal(true)}
              className="w-full"
              size="sm"
              disabled={
                order?.status === "completed" ||
                order?.status === "draft" ||
                order?.status === "canceled" ||
                !order?.items?.length
              }
            >
              Process Payment
              <CreditCard size={17} className="ml-3" />
            </Button>
            <Button
              onClick={() => splitBillModal.open()}
              className="w-full bg-blue-500 hover:bg-blue-600"
              size="sm"
              disabled={
                order?.status === "completed" ||
                order?.items?.length < 2 ||
                !balance
              }
            >
              Split Bill
              <SplitIcon size={17} className="ml-3" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function TicketItem({
  activeCourse,
  ticket,
  setactiveCourse,
  orderQuery,
  index,
  order,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const queryClient = useQueryClient();

  const updateTicket = (newData) => {
    return pocketbase.collection("order_tickets").update(ticket.id, newData);
  };

  const deleteTicket = () => {
    return pocketbase.collection("order_tickets").delete(ticket.id);
  };

  const deleteTicketMutation = useMutation({
    mutationFn: deleteTicket,
    onError: () => {
      toast.error("Failed to delete ticket");
    },
    onSuccess: () => {
      orderQuery.refetch();
    },
  });

  const key = ["pos", "orders", orderQuery?.data?.id];
  const sortMutation = useMutation({
    mutationFn: updateTicket,
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previousData: any = queryClient.getQueryData(key);

      const data = {
        ...previousData,
        expand: {
          ...previousData.expand,
          tickets: previousData.expand.tickets.map((e) => {
            return e.id === newData.id
              ? {
                  ...e,
                  order_items: newData.order_items,
                }
              : e;
          }),
        },
      };

      queryClient.setQueryData(key, data);
      return { previousData };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(key, context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);

    if (active.id !== over.id) {
      const oldItems = ticket.items.map((e) => e.id);

      const oldIndex = oldItems.indexOf(active.id);
      const newIndex = oldItems.indexOf(over.id);

      const newItems = arrayMove(oldItems, oldIndex, newIndex);

      sortMutation.mutate({
        order_items: newItems,
        id: ticket.id,
      });
    }
  }

  const [activeId, setActiveId] = useState(null);

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  const markAsCompleted = async () => {
    await pocketbase.collection("order_tickets").update(ticket.id, {
      fired_at: new Date(),
      status: "completed",
    });

    await Promise.all(
      ticket.items
        .filter((e) => e.status === "pending")
        .map((e) =>
          pocketbase.collection("order_items").update(e.id, {
            status: "completed",
          })
        )
    );
  };

  const markAsCompletedMutation = useMutation({
    mutationFn: markAsCompleted,
    onError: () => {
      toast.error("Failed to mark as completed");
    },
    onSuccess: async () => {
      orderQuery.refetch();
      await Promise.all(
        ticket.items.map((e) =>
          adjustStockAfterSale({ order_item_id: e.id, order })
        )
      );
    },
  });

  const showTicketDestinationModal = useModalState();

  showTicketDestinationModal;
  return (
    <>
      <ChooseTicketDestination
        setOpen={showTicketDestinationModal.setisOpen}
        open={showTicketDestinationModal.isOpen}
        ticket={ticket}
        orderQuery={orderQuery}
      />
      <div
        className={cn("border-b mt-2 rounded-[3px]", {
          "border-primary border": ticket.id === activeCourse,
          "border-slate-200 border": ticket.id !== activeCourse,
        })}
      >
        <div
          onClick={() => {
            setactiveCourse(ticket.id);
          }}
          className={cn(
            "flex bg-slate-50 cursor-pointer border-b justify-between items-center px-[6px] py-[5px]",
            {
              "border-primary text-white bg-primary border":
                ticket.id === activeCourse,
            }
          )}
        >
          <h4
            className={cn("text-[13px]  font-semibold", {
              "text-white": ticket.id === activeCourse,
              "text-slate-500": ticket.id !== activeCourse,
            })}
          >
            Course {index + 1} (
            <span
              className={cn("text-[12.5px] text-slate-500 font-medium", {
                "text-white": ticket.id === activeCourse,
                "!text-slate-500": ticket.id !== activeCourse,
              })}
            >
              {ticket.count || 0} Item{ticket.count > 1 && "s"}
            </span>
            )
          </h4>
          <div className="flex items-center gap-2">
            {ticket.id === activeCourse && (
              <>
                {ticket?.items?.length &&
                ticket.status !== "draft" &&
                order.status === "on going" ? (
                  <a
                    onClick={() => {
                      window.print();
                    }}
                    className="h-6 w-7 bg-green-500 bg-opacity-60 rounded-[3px] flex items-center justify-center"
                  >
                    <PrinterIcon size={14} />
                  </a>
                ) : (
                  <></>
                )}
                {ticket.status === "draft" && !ticket?.items?.length && (
                  <a
                    onClick={() => {
                      deleteTicketMutation.mutate();
                    }}
                    className="h-6 w-7 bg-green-500 bg-opacity-60 rounded-[3px] flex items-center justify-center"
                  >
                    {deleteTicketMutation.isLoading ? (
                      <>
                        <Loader className="h-[14px] w-[14px] text-white animate-spin" />
                      </>
                    ) : (
                      <Trash size={14} />
                    )}
                  </a>
                )}
              </>
            )}
            {ticket.status === "draft" ? (
              <a
                onClick={() => showTicketDestinationModal.open()}
                className={cn(
                  "text-[11.5px] flex items-center gap-1 rounded-[2px] font-medium px-2 py-1",
                  {
                    "bg-white text-primary": ticket.id === activeCourse,
                    "text-white bg-primary": ticket.id !== activeCourse,
                    "opacity-80 pointer-events-none": !ticket?.items?.length,
                  }
                )}
              >
                <span>Fire Ticket</span>
              </a>
            ) : (
              <div className="flex items-center gap-2">
                {/* <div
                  // onClick={() => {
                  //   if (ticket.status === "draft") {
                  //     fireTicketMutation.mutate();
                  //   }
                  // }}
                  className={cn(
                    "text-[11.5px] flex items-center capitalize bg-white border-primary border text-primary gap-1 rounded-[2px] font-medium px-3 py-1"
                  )}
                >
                  {ticket.status === "open" && <AlarmClock size={14} />}
                  {ticket.status === "completed" && <CheckCircle2 size={15} />}
                  {ticket.status === "open" ? (
                    <span className="block ml-[2px]">
                      <CountDown offset={getOffest(ticket?.fired_at)} />
                    </span>
                  ) : (
                    <span>{ticket.status}</span>
                  )}
                </div> */}

                {ticket.status === "open" && (
                  <a
                    onClick={() => markAsCompletedMutation.mutate()}
                    className={cn(
                      "text-[11.5px] flex items-center gap-1 rounded-[2px] font-medium px-2 py-1",
                      {
                        "bg-white text-primary": ticket.id === activeCourse,
                        "text-white bg-primary": ticket.id !== activeCourse,
                        "opacity-80 pointer-events-none":
                          !ticket?.items?.length ||
                          markAsCompletedMutation.isLoading,
                      }
                    )}
                  >
                    {markAsCompletedMutation.isLoading && (
                      <Loader className="h-[13px] w-[13px] mr-1 text-primary animate-spin" />
                    )}
                    <span>Mark as Completed</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div>
          {!ticket?.items?.length ? (
            <div className="py-8 text-center text-slate-500 items-center justify-center flex text-[13px]">
              <span>No Items in this course.</span>
            </div>
          ) : (
            <div className="pb-2- px-1 py-1">
              <DndContext
                onDragStart={handleDragStart}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={ticket.items}
                  strategy={verticalListSortingStrategy}
                >
                  {ticket.items?.map((e, i) => {
                    return (
                      <SortableItem
                        onUpdated={() => {
                          orderQuery.refetch();
                        }}
                        ticket={ticket}
                        disabled={ticket.status !== "draft"}
                        id={e.id}
                        item={e}
                        key={i}
                        tickets={orderQuery?.data?.expand?.tickets}
                        isDragging={e.id === activeId}
                        className={cn({
                          "border-slate-200 border-dashed bg-slate-50 rounded-[4px]":
                            e.id === activeId,
                        })}
                      />
                    );
                  })}
                </SortableContext>
                <DragOverlay>
                  {activeId && (
                    <Item
                      onUpdated={() => {
                        orderQuery.refetch();
                      }}
                      ticket={ticket}
                      item={ticket.items.find((e) => e.id === activeId)}
                      key={activeId}
                      tickets={orderQuery?.data?.expand?.tickets}
                      className="!bg-white !border-primary shadow-lg !border-2 rounded-[4px]"
                    />
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SortableItem({ id, disabled, ...otherProps }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Item {...otherProps} />
    </div>
  );
}
export default PosCart;

function Item({
  item,
  onUpdated,
  className,
  isDragging,
  tickets,
  ticket,
}: any) {
  const [showUpdateOrderItem, setshowUpdateOrderItem] = useState(false);

  return (
    <>
      <UpdateOrderItemModal
        readOnly={item?.status !== "draft"}
        item={item}
        open={showUpdateOrderItem}
        onCompleted={() => {
          onUpdated();
        }}
        tickets={tickets}
        setOpen={setshowUpdateOrderItem}
        ticket={ticket}
      />

      <div
        onClick={() => {
          setshowUpdateOrderItem(true);
        }}
        className={cn(
          "flex items-start relative border-[1.5px] border-transparent select-none py-[9px] hover:bg-slate-100 cursor-pointer px-1 justify-between",
          className
        )}
      >
        {isDragging && (
          <div className="absolute text-[13px] top-0 text-slate-500 h-full w-full flex items-center justify-center text-center">
            <span>Drag item here</span>
          </div>
        )}
        <div className={isDragging ? "opacity-0" : ""}>
          <div className="flex items-center text-sm font-medium text-slate-600">
            <div className="flex items-center  gap-1">
              <a href="" className="mr-[6px]">
                {item.status === "draft" && <CircleDotDashedIcon size={14} />}
                {item.status === "pending" && (
                  <AlarmClock className="text-orange-500" size={14} />
                )}
                {item.status === "completed" && (
                  <CheckCircle2 size={15} className="text-green-500" />
                )}
              </a>
              <span>x{item.quantity}</span>
              <span>-</span>
              <span className="text-[13px]">{item?.expand?.menu?.name}</span>
            </div>
          </div>
          <div className="ml-7">
            {item.notes && (
              <p className="whitespace-normal text-[13px] text-slate-500 leading-7">
                <span className="underline">Notes</span>: {item.notes}
              </p>
            )}
            {item.variant && (
              <div className="text-[13px] text-slate-500 font-medium- items-center justify-between">
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
          </div>
        </div>
        <div
          className={cn(
            "text-[12.5px] font-medium text-slate-500",
            isDragging ? "opacity-0" : ""
          )}
        >
          {(item.amount * item.quantity).toLocaleString()} FRW
        </div>
      </div>
    </>
  );
}

function renderNumberWithLeadingZero(number) {
  if (number < 10) {
    return "0" + number;
  } else {
    return String(number);
  }
}
function CountDown({ offset }) {
  const stopwatchOffset = new Date();
  stopwatchOffset.setSeconds(stopwatchOffset.getSeconds() + offset);
  const { seconds, minutes, hours } = useStopwatch({
    autoStart: true,
    offsetTimestamp: stopwatchOffset,
  });
  return (
    <>
      <span>{renderNumberWithLeadingZero(hours)}</span>:
      <span>{renderNumberWithLeadingZero(minutes)}</span>:
      <span>{renderNumberWithLeadingZero(seconds)}</span>
    </>
  );
}

const StationItem = ({ kitchen, selectedKitchenId, onSelect }) => {
  return (
    <div className="dark">
      <div
        onClick={() => onSelect(kitchen.id)}
        className={cn({
          "rounded-[4px] cursor-pointer border border-slate-200 flex justify-between items-center w-full px-3 py-2":
            true,
          "border-primary bg-white bg-opacity-50":
            selectedKitchenId === kitchen.id,
          "bg-white bg-opacity-50": selectedKitchenId !== kitchen.id,
        })}
      >
        <div className="space-y-[6px]">
          <h4 className="font-semibold capitalize text-slate-700 text-[13px]">
            {kitchen.name}
          </h4>
          <p className="font-medium- text-[13px] text-slate-500">
            {kitchen.description ||
              "Lorem ipsum dolor sit amet consectetur adipisicing elit."}
          </p>
        </div>

        {selectedKitchenId === kitchen.id && (
          <div>
            <div className="h-5 w-5 flex items-center justify-center text-white bg-primary rounded-full">
              <CheckIcon size={16} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function ChooseTicketDestination({ open, setOpen, ticket, orderQuery }) {
  const getStations = () => {
    return pocketbase.collection("order_stations").getFullList();
  };

  const [selectedStationId, setSelectedStationId] = useState("");

  const { isLoading, data, status } = useQuery("order_stations", getStations);

  useEffect(() => {
    setSelectedStationId;
  }, []);

  const fireTicket = async () => {
    await pocketbase.collection("order_tickets").update(ticket.id, {
      fired_at: new Date(),
      status: "open",
      order_station: selectedStationId,
    });

    await Promise.all(
      ticket.items.map((e) =>
        pocketbase.collection("order_items").update(e.id, {
          status: "pending",
        })
      )
    );
  };
  const fireTicketMutation = useMutation({
    mutationFn: fireTicket,
    onError: () => {
      toast.error("Failed to fire ticket");
    },
    onSuccess: () => {
      orderQuery.refetch();
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Choose order station
          </DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="w-[100px] mt-1 mb-4 flex gap-1 h-[3px]">
            <div className="w-[70%] rounded-md bg-primary" />
            <div className="w-[30%] rounded-md bg-primary" />
          </div>
          <div className="grid grid-cols-1 gap-3 w-full mt-5">
            {isLoading && (
              <div className="space-y-3">
                {[1, 2].map((_, indx) => (
                  <div
                    key={indx}
                    className="rounded-[4px] cursor-pointer border flex justify-between items-center w-full px-4 py-4 dark:!bg-opacity-25 bg-white"
                  >
                    <div className="space-y-3 w-full">
                      <Skeleton className="h-4  w-[200px]" />
                      <Skeleton className="h-3 w-[300px]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {status === "success" &&
              data.map((kitchen) => (
                <StationItem
                  key={kitchen.id}
                  kitchen={kitchen}
                  selectedKitchenId={selectedStationId}
                  onSelect={setSelectedStationId}
                />
              ))}
          </div>
          <Button
            disabled={!selectedStationId || fireTicketMutation.isLoading}
            className="mt-4 mb-1 w-full"
            size="sm"
            onClick={() => {
              fireTicketMutation.mutate();
            }}
          >
            {fireTicketMutation.isLoading && (
              <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
            )}
            Fire ticket now.
            <ArrowRightIcon className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
