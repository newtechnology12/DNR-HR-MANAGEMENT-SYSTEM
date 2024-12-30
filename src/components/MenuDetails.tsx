/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Minus, Plus } from "react-feather";
import { Button } from "./ui/button";
import { cn } from "@/utils";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import Loader from "./icons/Loader";
import { Switch } from "./ui/switch";
import { useQueryClient } from "react-query";
import formatBill from "@/utils/formatBill";
export function MenuDetailsModals({ open, setOpen, ...props }: any) {
  const [isloading, setIsloading] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={!isloading && setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <MenuDetails setIsloading={setIsloading} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function MenuDetails({
  menu,
  onCompleted,
  showAddingOptions,
  order,
  setIsloading,
  isKitchen,
  isloading,
  activeCourse,
}: any) {
  const getMatchingVariant = ({ options, optionsToMatch, arrayToFilter }) => {
    if (options.length !== Object.keys(optionsToMatch).length) return null;
    const matchingObjects = [];

    arrayToFilter.filter((obj) => {
      for (const option of options) {
        const optionName = option.name;
        const optionValue = optionsToMatch[optionName];
        console.log(obj[optionName], optionValue.name);

        if (optionValue && obj[optionName] !== optionValue.name) {
          return false;
        }
      }

      matchingObjects.push(optionsToMatch);
      return true;
    });

    return matchingObjects[0];
  };
  const options = menu?.options || [];

  const [selectedVariants, setselectedVariants] = React.useState({});

  const activeVariant = getMatchingVariant({
    arrayToFilter: menu?.variants || [],
    options: menu?.options || [],
    optionsToMatch: selectedVariants,
  });

  const [count, setcount] = React.useState(1);

  const eachPrice =
    activeVariant && activeVariant?.price
      ? activeVariant.price || 0
      : menu?.price || 0;

  const price =
    activeVariant && activeVariant?.price
      ? (activeVariant.price || 0) * count
      : (menu?.price || 0) * count;

  const [addingToOrder, setaddingToOrder] = React.useState(false);

  const mainBill = order?.expand?.bills
    ?.map(formatBill)
    .filter((e) => e.total_paid === 0)[0];

  const handleAdd = async () => {
    try {
      setaddingToOrder(true);
      console.log(mainBill);

      const order_item = await pocketbase.collection("order_items").create({
        order: order.id,
        menu: menu.id,
        quantity: count,
        variant: activeVariant,
        notes: "",
        amount: eachPrice,
        status: "draft",
        order_ticket: activeCourse,
      });

      await pocketbase.collection("orders").update(order.id, {
        "items+": order_item.id,
      });

      await pocketbase.collection("order_tickets").update(activeCourse, {
        "order_items+": order_item.id,
      });

      if (mainBill) {
        await pocketbase.collection("order_bills").update(mainBill?.id, {
          "items+": order_item.id,
        });
      } else {
        await pocketbase.collection("order_bills").create({
          items: [order_item],
          order: order.id,
          payment_status: "pending",
        });
      }

      onCompleted();
      setaddingToOrder(false);
    } catch (error) {
      console.log(error);
      setaddingToOrder(false);
      toast.success(error.message);
    }
  };

  const stock_item = menu?.expand?.destination_stock_item;
  const availableQuantity = stock_item?.available_quantity;
  const quantity_alert = stock_item?.quantity_alert;
  const isOutOfStock = availableQuantity <= 0;
  const isLowStock = availableQuantity <= quantity_alert;
  return (
    <div className="px-3- sm:px-0">
      <div className="flex pt-4- sm:pt-0 items-center gap-3">
        <div>
          <img
            className="h-20 object-cover rounded-md border border-slate-200 w-20"
            src={menu?.image}
            alt=""
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-[14.5px] capitalize font-semibold">
              {menu?.name}
            </h4>
            <span>
              {menu?.availability === "unavailable" && (
                <span className="text-[12px] font-medium text-red-500">
                  - Unavailable
                </span>
              )}
            </span>
          </div>
          <p className="text-[13px] font-medium text-slate-500">
            {parseInt(menu?.price)?.toLocaleString()} FRW
          </p>
          <p className="text-sm gap-2 font-medium">
            <span className="text-[13px] text-slate-500">Stock:</span>
            <span className="font-semibold ml-1 inline-block text-slate-700 text-[13px]">
              {isOutOfStock
                ? "Out of stock"
                : isLowStock
                ? "Low stock"
                : "Available"}
            </span>
          </p>
        </div>
      </div>
      <div className="space-y-2 mt-3 px-1 pb-[6px]">
        <div>
          <h4 className="text-[13px] font-semibold">Description</h4>
          <p className="text-[14.5px] text-slate-500 my-1 leading-7">
            {menu?.description}
          </p>
        </div>
        {menu?.variants ? (
          <div>
            <div className="text-[13px] mb-3 mt-3 font-semibold">Variants</div>
            <div className="">
              {options.map((e, i) => {
                return (
                  <div key={i} className="gap-2 my-2">
                    <h4 className="capitalize text-slate-600 text-[13px] font-medium mb-1">
                      {e?.name}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {e?.options.map((o, i) => {
                        return (
                          <a
                            key={i}
                            onClick={() =>
                              setselectedVariants({
                                ...selectedVariants,
                                [e?.name]: o,
                              })
                            }
                            className={cn(
                              "text-[13px] hover:bg-slate-100 !cursor-pointer px-3 rounded-[3px] text-slate-600 py-[6px] capitalize border",
                              {
                                "bg-green-100 hover:bg-green-100 text-primary border-green-500":
                                  selectedVariants[e?.name] === o,
                              }
                            )}
                          >
                            {/* {e.options[o] ? "true" : "f"} */}
                            {o.name}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {showAddingOptions && (
          <>
            <div>
              <div className="flex items-center mt-3 mb-4  justify-between">
                <div className="flex px-0 items-center gap-3">
                  <a
                    onClick={() =>
                      count > 1 ? setcount((prev) => prev - 1) : {}
                    }
                    className="h-8 w-8 flex items-center cursor-pointer justify-center bg-slate-200 rounded-sm"
                  >
                    <Minus size={16} />
                  </a>

                  <span className="text-[15px] select-none px-1 text-slate-600 font-semibold">
                    {count}
                  </span>
                  <a
                    onClick={() => setcount((prev) => prev + 1)}
                    className="h-8 w-8 flex cursor-pointer items-center justify-center bg-primary text-white rounded-sm"
                  >
                    <Plus size={16} />
                  </a>
                </div>
                <p className="font-semibold select-none text-sm text-primary">
                  {price?.toLocaleString()} FRW
                </p>
              </div>
            </div>
            <div className="w-full sm:pb-0 pb-2- mt-3">
              <Button
                onClick={handleAdd}
                disabled={
                  (menu?.options && !activeVariant) ||
                  addingToOrder ||
                  menu?.availability === "unavailable" ||
                  order.status === "canceled" ||
                  order.status === "completed"
                }
                className="w-full select-none"
              >
                {addingToOrder && (
                  <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                )}
                Add To Cart
              </Button>
            </div>
          </>
        )}
      </div>
      {isKitchen && (
        <ChangeTheDisheStatus
          dbstatus={menu?.availability}
          id={menu?.id}
          setIsloading={setIsloading}
          isloading={isloading}
        />
      )}
    </div>
  );
}

function ChangeTheDisheStatus({
  dbstatus,
  id,
  setIsloading,
  isloading,
}: {
  dbstatus: any;
  id: any;
  setIsloading: any;
  isloading: any;
}) {
  const [status, setStatus] = React.useState(dbstatus === "available");
  const queryClient = useQueryClient();
  async function handleOnclick() {
    setIsloading(true);
    try {
      await pocketbase.collection("menu_items").update(id, {
        availability: status ? "unavailable" : "available",
      });
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsloading(false);
    }
  }

  return (
    <button
      disabled={isloading}
      className={cn({
        "flex w-full items-center px-1 pb-3 pt-1 justify-between cursor-pointer":
          true,
        "cursor-wait": isloading,
      })}
      onClick={() => {
        setStatus((prev) => !prev);
        handleOnclick();
      }}
    >
      <div className="flex flex-col gap-3 items-start">
        <div className="text-[13px] font-medium leading-none">
          You want to make this dish {status ? "unavailable" : "available"} ?
        </div>
        <p className="text-[12.5px] text-slate-500 leading-none">
          Change the menu status
        </p>
      </div>
      <div>
        <Switch
          className="focus:shadow-[0_0_0_2px] border border-primary data-[state=checked]:border-slate-300  focus:shadow-primary data-[state=checked]:bg-primary"
          checked={status}
        />
      </div>
    </button>
  );
}
