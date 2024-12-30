import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils";
import { useNavigate } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import Loader from "./icons/Loader";
import { useAuth } from "@/context/auth.context";
import { useQuery } from "react-query";
import { useworkShift } from "@/context/workShift.context";

function generateUniqueId() {
  return Math.floor(Math.random() * 1000000);
}

export default function NewOrderModal({
  open,
  setOpen,
  table: defaultTable,
  tables,
}: any) {
  const [guests, setguests] = useState<any>();

  const [table, settable] = useState<any>();

  const tablesQuery = useQuery({
    queryKey: ["tables"],
    keepPreviousData: true,
    queryFn: () => {
      return pocketbase
        .collection("tables")
        .getFullList({ filter: `status='available'` })
        .then((e) =>
          e.map((e) => ({
            label: e.name,
            value: e.id,
            seats: e.seats,
            id: e.id,
          }))
        );
    },
    enabled: Boolean(open) && !tables,
  });

  useEffect(() => {
    if (defaultTable) {
      settable(defaultTable.id);
    }
  }, [defaultTable]);

  const navigate = useNavigate();

  const { user } = useAuth();

  const [isCreatingOrder, setisCreatingOrder] = useState(false);

  const { current, work_period } = useworkShift();

  const handlePlaceOrder = async () => {
    try {
      setisCreatingOrder(true);
      const order = await pocketbase.collection("orders").create({
        guests: guests,
        table: table,
        subTotal: 0,
        itemCount: 0,
        total: 0,
        waiter: user.id,
        kitchen_notes: "",
        customer_notes: "",
        status: "on going",
        kitchenStatus: "queue",
        code: generateUniqueId(),
        work_period: work_period.id,
        work_shift: current.id,
      });

      await pocketbase
        .collection("tables")
        .update(table, { status: "occupied" });

      const ticket = await pocketbase.collection("order_tickets").create({
        order: order.id,
        items: [],
        status: "draft",
        name: "Course 1",
      });

      await pocketbase.collection("orders").update(order.id, {
        tickets: [ticket.id],
      });

      const bill = await pocketbase.collection("order_bills").create({
        items: [],
        order: order.id,
        payment_status: "pending",
      });

      await pocketbase.collection("orders").update(order.id, {
        "bills+": bill.id,
      });

      navigate(`/pos/orders/${order.id}`);
      setisCreatingOrder(false);
      toast.success("Order created succesfully");
    } catch (error) {
      console.log(error);
      setisCreatingOrder(false);
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[445px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              Place New Order
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 leading-7">
              This action cannot be undone this will permanently.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="px-2 mb-5">
            <h4 className="font-medium text-[13px] text-slate-600 mb-[8px]">
              Choose Table
            </h4>
            <Select
              onValueChange={(value) => {
                settable(value);
              }}
              value={table}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose Tables" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {(tables || tablesQuery.data || [])?.map((e, i) => {
                  return (
                    <SelectItem key={i} value={e.value || e.id}>
                      {e.label || e.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {table && (
            <div className="px-2">
              <h4 className="font-medium text-[13px] text-slate-600 mb-[8px]">
                Guests
              </h4>
              <div className="flex flex-wrap items-center gap-[10px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
                  .filter(
                    (e) =>
                      e <=
                      (tables || tablesQuery.data || [])?.find(
                        (e) => e.id === table
                      )?.seats
                  )
                  .map((e, i) => {
                    return (
                      <a
                        onClick={() => setguests(e)}
                        key={i}
                        className={cn(
                          "h-10 w-10 border hover:bg-slate-50 cursor-pointer border-slate-200 text-slate-500 rounded-[3px] font-medium flex items-center justify-center text-[13px]",
                          {
                            "border-primary bg-primary text-primary bg-opacity-5":
                              e === guests,
                          }
                        )}
                      >
                        {e}
                      </a>
                    );
                  })}
                {/* <div className="h-10 px-3 border border-slate-200 text-slate-500 rounded-[3px] font-medium flex items-center justify-center text-[13px]">
                Custom
              </div> */}
              </div>
            </div>
          )}

          <div className="mt-5 px-2 pb-1">
            <Button
              onClick={handlePlaceOrder}
              disabled={!guests || isCreatingOrder}
              className="w-full"
              size="sm"
            >
              {isCreatingOrder && (
                <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
              )}
              Create Order Now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
