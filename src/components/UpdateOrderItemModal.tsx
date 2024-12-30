import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import Loader from "./icons/Loader";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { cn } from "@/utils";
import { Minus, Plus } from "react-feather";
import { useMutation } from "react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "./ui/checkbox";

export default function UpdateOrderItemModal({
  open,
  setOpen,
  item,
  onCompleted,
  readOnly,
  tickets,
  ticket: defaultTicket,
}: any) {
  const [notes, setnotes] = useState("");
  const [quantity, setquantity] = useState(item.quantity);

  const [ticket, setTicket] = useState<any>(undefined);

  useEffect(() => {
    if (item.notes) {
      setnotes(item.notes);
    } else {
      setnotes("");
    }
  }, [item]);

  const handleUpdate = async () => {
    const newTicket = ticket || item.order_ticket;
    await pocketbase.collection("order_items").update(item.id, {
      notes,
      quantity,
      order_ticket: newTicket,
    });

    if (item.order_ticket !== newTicket) {
      await pocketbase.collection("order_tickets").update(newTicket, {
        "order_items+": item.id,
      });
    }
    setTicket(undefined);
  };

  const handleDelete = async () => {
    await pocketbase.collection("order_items").delete(item.id);
  };

  const deleteItemMutation = useMutation({
    mutationFn: () => {
      return handleDelete();
    },
    onSuccess: () => {
      onCompleted();
      setOpen(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: () => {
      return handleUpdate();
    },
    onSuccess: () => {
      onCompleted();
      setOpen(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
    },
  });

  const menu = item?.expand?.menu;

  useEffect(() => {
    setquantity(item.quantity);
  }, [item]);

  const makeCompleted = ({ status }) => {
    return pocketbase.collection("order_items").update(item.id, {
      status: status,
    });
  };

  const makeCompletedMutation = useMutation({
    mutationFn: makeCompleted,
    onSuccess: () => onCompleted(),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[445px]">
        <div className="flex pt-4- sm:pt-0 items-center gap-3">
          <div className="flex h-20 w-20">
            <img
              className="object-cover w-full rounded-[4px] border border-slate-200"
              src={menu?.image}
              alt=""
            />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-[14.5px] capitalize font-semibold">
                {menu?.name}
              </h4>
            </div>
            <div className="flex items-end justify-between w-full">
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-slate-500">
                  {Number(menu?.price * quantity)?.toLocaleString()} FRW
                </p>
                <p className="text-sm gap-2 font-medium">
                  <span className="text-[13px] text-slate-500">Quantity:</span>
                  <span className="font-semibold text-slate-700 ml-1 text-[13px]">
                    {quantity}
                  </span>
                </p>
              </div>
              {!readOnly && (
                <div className="flex justify-center select-none items-end flex-col">
                  <div className="flex px-2 items-center gap-2">
                    <a
                      className={cn(
                        "h-7 w-7  cursor-pointer flex items-center justify-center bg-slate-200 rounded-sm",
                        {
                          "pointer-events-none opacity-65": quantity === 1,
                        }
                      )}
                      onClick={() =>
                        quantity !== 1 && setquantity(quantity - 1)
                      }
                    >
                      <Minus size={13} />
                    </a>
                    <span className="text-[12px] px-2 text-slate-600 font-semibold">
                      {quantity}
                    </span>
                    <a
                      className="h-7 cursor-pointer w-7 flex items-center justify-center bg-primary text-white rounded-sm"
                      onClick={() => setquantity(quantity + 1)}
                    >
                      <Plus size={13} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {!readOnly ? (
          <div className="mt-1">
            <div className="px-2- mt-1 mb-2">
              <Textarea
                value={notes}
                onChange={(e) => setnotes(e.target.value)}
                placeholder="Add some notes here."
                disabled={readOnly}
              />
            </div>
            <div className="mt-3">
              <Select
                defaultValue={item.order_ticket}
                value={ticket}
                disabled={readOnly}
                onValueChange={(e) => setTicket(e)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose Couse" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {tickets
                    .map((e) => ({ label: e.name, value: e.id }))
                    .map((e, i) => {
                      return (
                        <SelectItem key={i} value={e.value}>
                          {e.label}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 flex items-center gap-2 px-2- pb-1">
              <Button
                onClick={() => updateItemMutation.mutate()}
                disabled={updateItemMutation.isLoading || readOnly}
                className="w-full"
                size="sm"
              >
                {updateItemMutation.isLoading && (
                  <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                )}
                Save Order Item
              </Button>
              <Button
                onClick={() => deleteItemMutation.mutate()}
                disabled={deleteItemMutation.isLoading || readOnly}
                className="w-full"
                size="sm"
                variant="destructive"
              >
                {deleteItemMutation.isLoading && (
                  <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                )}
                Remove Order Item
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="ml-0">
              <p className="whitespace-normal text-[13px] capitalize text-slate-500 leading-7">
                <span className="underline mr-1">Status: </span>
                {item?.status}
              </p>
              <p className="whitespace-normal text-[13px] text-slate-500 leading-7">
                <span className="underline mr-1">Sent at:</span>{" "}
                {new Date(item?.created).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="whitespace-normal text-[13px] text-slate-500 leading-7">
                <span className="underline mr-1">Destination:</span>{" "}
                {item?.expand?.menu?.expand?.destination?.name}
              </p>
              {item.notes && (
                <p className="whitespace-normal text-[13px] text-slate-500 leading-7">
                  <span className="underline">Notes</span>: {item.notes}
                </p>
              )}
              {item.variant && (
                <div className="text-[13px] text-slate-500 font-medium- items-center justify-between">
                  {Object.keys(item.variant).map((e, i) => {
                    return (
                      <div
                        key={i}
                        className="flex items-center leading-7 gap-2"
                      >
                        <span className="underline capitalize">{e}:</span>
                        <span className="capitalize">
                          {item.variant[e].name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {item.status !== "draft" && (
          <div className="flex py-2 items-center space-x-2">
            <div className="items-top flex space-x-3">
              <Checkbox
                disabled={makeCompletedMutation.isLoading || defaultTicket}
                checked={item.status === "completed"}
                onCheckedChange={(e) => {
                  makeCompletedMutation.mutate({
                    status: e ? "completed" : "pending",
                  });
                }}
                id="mark-as-completed"
              />
              <label
                htmlFor="mark-as-completed"
                className="grid gap-3 leading-none"
              >
                <div className="text-sm font-medium text-slate-700 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Mark as completed.
                </div>
                <p className="text-[13px]  text-slate-500">
                  You agree to our Terms of Service and Privacy Policy.
                </p>
              </label>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
