/* eslint-disable @typescript-eslint/no-explicit-any */
import { IoCheckmarkDoneCircleOutline } from "react-icons/io5";
import {
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";
import { HiOutlineQueueList } from "react-icons/hi2";
import { PiCookingPot } from "react-icons/pi";
import { PiBowlFoodThin } from "react-icons/pi";
import { MdOutlineCancel } from "react-icons/md";
import { cn } from "@/utils";
import { useState } from "react";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import Loader from "../icons/Loader";
const MENU = ["Cooking", "Ready", "Queue",];

export default function AreSure({ status,data,onDone,setOrder }: { status: string,data:any, onDone:any,setOrder:any }) {
  const [isUpdatingOrder, setisUpdatingOrder] = useState(false);
  const handleUpdateOrder = async () => {
    console.log("......................",data);
    setisUpdatingOrder(true);
    
    const records = await pocketbase.collection("order_items").getFullList({
      filter: `order="${data.id}"`,
      sort: "-created",
    });
    for (const record of records) {
        await pocketbase.collection("order_items").update(record.id, {
          status: MENU[MENU.indexOf(status)+1].toLocaleLowerCase(),
        });
    }
    await pocketbase
      .collection("orders")
      .update(data.id, {
        kitchenStatus: MENU[MENU.indexOf(status)+1],
      })
      .then((data) => {
        setisUpdatingOrder(false);
        toast.success(`Successful moved to ${MENU[MENU.indexOf(status)+1]}`)
        setOrder((prev) => {
          return prev.map((order) => order.id === data.id ? {...order,
            items:order.items.map((ll)=>{
              return {...ll,status:MENU[MENU.indexOf(status)+1]}
            })
            , kitchenStatus:MENU[MENU.indexOf(status)+1] }: order );
        });
        console.log("00000-------",data)
        onDone();
      })
      .catch((e) => {
        setisUpdatingOrder(false);
        toast.error(e.message);
      });
  };
  return (
    <AlertDialogContent>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-14 text-[16px] w-14 bg-ims-divider flex items-center justify-center text-ims-muted rounded-[4px]",
              {
                "bg-cyan-500 text-white": status === "Queue",
                "bg-ims-orange text-white": status === "Cooking",
                "bg-ims-link text-white": status === "Ready",
                "bg-primary text-white": status === "Completed",
                "bg-ims-danger text-white": status === "Canceled",
              }
            )}
          >
          {data?.expand?.table?.code}
          </div>
          <div className="flex flex-col items-start">
            <h4 className="text-[14.5px] font-medium">#Order {data?.code}</h4>
            <p className="text-t-small text-ims-muted font-medium">{data?.itemCount} items</p>
          </div>
        </div>
        <div className="flex justify-end items-end gap-2 flex-col">
          <div
            className={cn(
              "text-t-hint bg-opacity-55 flex items-center gap-2 px-3 py-[4px] rounded-full",
              {
                "bg-cyan-500/15 text-cyan-500": status === "Queue",
                "bg-ims-orange text-ims-orange": status === "Cooking",
                "bg-ims-link text-ims-link": status === "Ready",
                "bg-primary/15 text-primary": status === "Completed",
                "bg-ims-danger text-ims-danger": status === "Canceled",
              }
            )}
          >
            {status === "Queue" && <HiOutlineQueueList size={15} />}
            {status === "Cooking" && <PiCookingPot size={15} />}
            {status === "Ready" && <PiBowlFoodThin size={15} />}
            {status === "Completed" && <IoCheckmarkDoneCircleOutline size={15} />}
            {status === "Canceled" && <MdOutlineCancel size={15} />}
            <span className="capitalize">{status}</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn("h-2 w-2 rounded-full", {
                "bg-cyan-500 text-white": status === "Queue",
                "bg-ims-orange text-white": status === "Cooking",
                "bg-ims-link text-white": status === "Ready",
                "bg-primary text-white": status === "Completed",
                "bg-ims-danger text-white": status === "Canceled",
              })}
            ></div>
            <span className="text-xs text-ims-body">
              It's {status?.toLowerCase()}
            </span>
          </div>
        </div>
      </div>
      <AlertDialogHeader className="!m-0 !p-0 leading-none">
        <AlertDialogTitle className="!m-0 !p-0 leading-none">
          Are you absolutely sure?
        </AlertDialogTitle>
        <AlertDialogDescription className="leading-none text-sm mt-3">
          This action cannot be undone. This will permanently moved to the next progress so be carefully 
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel
        onClick={((e) => {
          // e.preventDefault();
          onDone()
        })}
        >Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={(e)=>{
            e.preventDefault();
            handleUpdateOrder()
          }}
          
          className={cn("hover:bg-opacity-80", {
            "bg-cyan-500 hover:bg-cyan-500 text-white": status === "Queue",
            "bg-ims-orange hover:bg-ims-orange text-white":
              status === "Cooking",
            "bg-ims-link hover:bg-ims-link text-white": status === "Ready",
            "bg-primary hover:bg-primary text-white": status === "Completed",
            "bg-ims-danger hover:bg-ims-danger text-white": status === "Canceled",
          })}
        >
        {isUpdatingOrder && (
          <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
        )}
          Continue {MENU[MENU.indexOf(status)+1]}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
