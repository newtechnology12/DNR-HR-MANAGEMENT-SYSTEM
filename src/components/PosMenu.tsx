import { Button } from "@/components/ui/button";
import { ScrollBar, ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils";
import {
  AlarmClock,
  ArrowLeftToLine,
  CheckCheckIcon,
  Menu,
  PlusCircle,
  XIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { GitPullRequest, Search } from "react-feather";
import { useLocation, useNavigate } from "react-router-dom";
import { MenuDetailsModals } from "./MenuDetails";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "react-use";
import Loader from "@/components/icons/Loader";

import cleanObject from "@/utils/cleanObject";
import useShowSidebar from "@/hooks/useShowSidebar";
import { useAuth } from "@/context/auth.context";
import { toast } from "sonner";
import MenuItems from "./shared/MenuItems";
import { useworkShift } from "@/context/workShift.context";

function createCategoryTree(categories) {
  const categoryMap = {};
  const categoryTree = [];

  // Build a map of categories using their IDs
  categories.forEach((category) => {
    categoryMap[category.id] = {
      ...category,
      subcategories: [{ name: `All ${category.name}`, filter: false }],
    };
  });

  // Populate the subcategories array based on parent relationships
  categories.forEach((category) => {
    if (category.parent) {
      categoryMap[category.parent].subcategories.push(categoryMap[category.id]);
    } else {
      categoryTree.push(categoryMap[category.id]);
    }
  });

  return categoryTree;
}

function generateUniqueId() {
  return Math.floor(Math.random() * 1000000);
}

export default function PosMenu({
  setshowDraer,
  order,
  refetch,
  isKitchen = false,
  activeCourse,
}: any) {
  const [search, setsearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  useDebounce(
    () => {
      setDebouncedSearch(search);
    },
    700,
    [search]
  );

  const [activeCategory, setactiveCategory] = useState<any>({
    name: "All",
    filter: false,
  });

  const [activeSubcategory, setactiveSubcategory] = useState(undefined);

  const categoriesQuery = useQuery({
    queryKey: ["pos", "categories"],
    queryFn: () => {
      return pocketbase.collection("categories").getFullList();
    },
    enabled: true,
  });

  const router = useLocation();

  const menuItemsQuery = useQuery({
    queryKey: [
      "pos",
      "menuItems",
      {
        activeCategory,
        activeSubcategory,
        debouncedSearch,
      },
    ],
    retry: false,
    queryFn: () => {
      const categoryQ =
        activeCategory.filter !== false && activeCategory?.id
          ? `category.id="${activeCategory.id}"`
          : "";
      const subCategoryQ =
        activeSubcategory?.filter !== false && activeSubcategory?.id
          ? `subCategory.id="${activeSubcategory?.id}"`
          : "";
      const searchQ = `name~"${debouncedSearch}"`;
      return pocketbase.collection("menu_items").getFullList(
        cleanObject({
          filter: [categoryQ, subCategoryQ, searchQ]
            .filter((e) => e)
            .join("&&"),
          expand: "destination_stock_item",
        })
      );
    },
    enabled: true,
  });

  const categories = [
    {
      name: "All",
      subcategories: [],
    },
    ...createCategoryTree(categoriesQuery.data || []),
  ];

  const subcategories = categories.find(
    (e) => e.name === activeCategory.name
  )?.subcategories;

  const subCategoriesToShow = useMemo(
    () => (subcategories.length ? subcategories : []),
    [activeCategory, categories]
  );

  const navigate = useNavigate();

  const [menuToShow, setmenuToShow] = useState<null>();

  const handleAddToCart = () => {
    setmenuToShow(undefined);
  };

  const { showSideBar } = useShowSidebar();

  const [isCreatingOrder, setisCreatingOrder] = useState(false);

  const { user } = useAuth();

  const handlePlaceOrder = async () => {
    try {
      setisCreatingOrder(true);
      const order = await pocketbase.collection("orders").create({
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

  const { current, setShowClockinModal, work_period } = useworkShift();

  return (
    <>
      {order && (
        <div className="bg-white sm:hidden border-t flex items-center justify-between px-3 pt-[8px] pb-3 bottom-0 absolute z-30 w-full">
          <div className="space-y-1">
            <h4 className="font-semibold text-[13px] ">Order #{order?.code}</h4>
            <p className="text-[13px] font-medium text-slate-500">
              {order.itemsCount} (Items) - {order?.total} FRW
            </p>
          </div>
          <div>
            <Button onClick={() => setshowDraer(true)} size="sm">
              View Order.
            </Button>
          </div>
        </div>
      )}
      <MenuDetailsModals
        isKitchen={isKitchen}
        open={Boolean(menuToShow)}
        showAddingOptions={order && order?.status !== "completed"}
        menu={menuToShow}
        order={order}
        onCompleted={() => {
          setmenuToShow(undefined);
          refetch();
        }}
        setOpen={(e) => {
          if (e === false) {
            setmenuToShow(undefined);
          }
        }}
        handleAdd={handleAddToCart}
        activeCourse={activeCourse}
      />
      <div className="h-dvh flex flex-col">
        <div>
          <div className="bg-white py-2 border-b flex items-center justify-between px-2">
            <div className="font-semibold gap-3 flex items-center text-sm">
              {order && (
                <a
                  onClick={() =>
                    navigate({
                      search: showSideBar ? "" : "?show_sidebar=yes",
                    })
                  }
                  className="h-8 w-8 cursor-pointer bg-slate-100 flex text-slate-600 items-center gap-2 justify-center rounded-[4px]"
                >
                  {!showSideBar ? (
                    <Menu size={16} className="text-slate-700" />
                  ) : (
                    <ArrowLeftToLine size={16} className="text-slate-700" />
                  )}
                </a>
              )}
              {order ? (
                <>
                  <span>Order #{order?.code}</span>
                </>
              ) : (
                <>
                  <a
                    onClick={() =>
                      navigate({
                        search: showSideBar ? "" : "?show_sidebar=yes",
                      })
                    }
                    className="h-8 w-8 cursor-pointer bg-slate-100 flex text-slate-600 items-center gap-2 justify-center rounded-[4px]"
                  >
                    {!showSideBar ? (
                      <Menu size={16} className="text-slate-700" />
                    ) : (
                      <ArrowLeftToLine size={16} className="text-slate-700" />
                    )}
                  </a>

                  <span className="block ml-0">Saga Bay Menu</span>
                </>
              )}
            </div>

            {!order ? (
              <Button
                onClick={() => {
                  if (current) {
                    handlePlaceOrder();
                  } else {
                    setShowClockinModal(true);
                  }
                }}
                size="sm"
                disabled={isCreatingOrder}
              >
                {isCreatingOrder ? (
                  <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                ) : (
                  <PlusCircle size={16} className="mr-2" />
                )}

                <span>Create Order</span>
              </Button>
            ) : (
              <div
                className={cn(
                  "text-[12px] mr-3- capitalize border bg-opacity-55 flex items-center gap-2 px-3 py-[3px] rounded-full ",
                  {
                    "text-yellow-500 border-yellow-300  bg-yellow-100":
                      order.status === "on going",
                    "text-green-500  border-green-300   bg-green-100":
                      order.status === "completed",
                    "text-gray-500  border-gray-300  bg-gray-100":
                      order.status === "draft",
                    "text-red-500  border-red-300  bg-red-100":
                      order.status === "canceled",
                  }
                )}
              >
                {
                  {
                    "on going": <AlarmClock size={15} />,
                    completed: <CheckCheckIcon size={15} />,
                    draft: <GitPullRequest size={15} />,
                    canceled: <XIcon size={15} />,
                  }[order.status]
                }
                <span>{order.status}</span>
              </div>
            )}
          </div>
          <div className="py-1 sm:py-2 px-2">
            <div className="flex border focus-within:border-green-500  bg-white border-slate-200 overflow-hidden rounded-[4px] items-center gap-3-">
              <div>
                <a className="bg-primary text-white rounded-r-none h-9 w-9 rounded-[2px] flex items-center justify-center">
                  <Search size={14} />
                </a>
              </div>
              <input
                className="text-sm bg-transparent w-full h-full px-2 outline-none"
                placeholder="Search here.."
                type="search"
                onChange={(e) => setsearch(e.target.value)}
                value={search}
              />
              {menuItemsQuery.isFetching && (
                <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
              )}
            </div>
          </div>
          <div className="bg-white border-b scroller border-b-slate-200 border-t border-slate-200">
            <ScrollArea className="w-full  whitespace-nowrap">
              {categoriesQuery.status === "success" && (
                <div className="flex px-2 items-center justify-around">
                  {categories.map((e, i) => {
                    return (
                      <a
                        key={i}
                        className={cn(
                          "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
                          {
                            "text-primary ": activeCategory.name === e.name,
                          }
                        )}
                        onClick={() => {
                          setactiveCategory(e);

                          setactiveSubcategory(
                            categories.find((i) => i?.name === e?.name)
                              .subcategories[0]
                          );
                        }}
                      >
                        {activeCategory.name === e.name && (
                          <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                        )}
                        <span className=""> {e.name}</span>
                      </a>
                    );
                  })}
                </div>
              )}
              {categoriesQuery.status === "loading" && (
                <div className="flex w-max border-b  space-x-2 px-2 py-[6px] sm:py-[10px]">
                  {Array(10)
                    .fill(null)
                    .map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-[30px] border w-[170px] rounded-[3px]"
                      />
                    ))}
                </div>
              )}
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {subCategoriesToShow.length ? (
              <ScrollArea className="w-full  border-t whitespace-nowrap">
                {categoriesQuery.status === "success" && (
                  <div className="flex w-max  space-x-2 px-2 py-[6px] sm:py-[8px]">
                    {subCategoriesToShow.map((sub, i) => (
                      <a
                        key={i}
                        onClick={() => setactiveSubcategory(sub)}
                        className={cn(
                          "flex px-5 py-[8px] text-slate-600 capitalize border cursor-pointer rounded-sm items-center gap-[10px]",
                          {
                            "border-primary !text-primary bg-opacity-5 bg-primary":
                              activeSubcategory?.name === sub.name,
                          }
                        )}
                      >
                        {activeCategory.image && (
                          <img
                            src={sub["image"] || activeCategory.image}
                            className="h-[18px] w-[18px]"
                            alt=""
                          />
                        )}

                        <span className="text-[13px] text-slate-600- font-medium">
                          {sub?.name}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
                {categoriesQuery.status === "loading" && (
                  <div className="flex w-max space-x-2 px-2 py-[6px] sm:py-[10px]">
                    {Array(10)
                      .fill(null)
                      .map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-[30px] border w-[130px] rounded-[3px]"
                        />
                      ))}
                  </div>
                )}
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            ) : null}
          </div>
        </div>
        <ScrollArea className="w-full h-full- whitespace-nowrap overflow-auto">
          <div className="@container py-1 px-1">
            <MenuItems
              order={order}
              setmenuToShow={setmenuToShow}
              menuItemsQuery={menuItemsQuery}
            />
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
