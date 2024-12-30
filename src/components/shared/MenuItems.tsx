import { AlertCircle } from "react-feather";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { cn } from "@/utils";
import { Skeleton } from "../ui/skeleton";

export default function MenuItems({ menuItemsQuery, setmenuToShow }: any) {
  return (
    <>
      {menuItemsQuery.status === "success" &&
        menuItemsQuery?.data?.length === 0 && (
          <div className="flex px-4 text-center items-center py-24 justify-center gap-2 flex-col">
            <img className="h-20 w-20" src="/images/dish.png" alt="" />
            <h4 className="font-semibold mt-4">No Menu Items Found</h4>
            <div>
              <p className="text-[15px] whitespace-normal break-words max-w-sm leading-8 text-slate-500">
                The Food menu items you are looking are not available. Try again
                later or clear the filters.
              </p>
            </div>
          </div>
        )}
      {menuItemsQuery.status === "error" && (
        <div className="px-3 py-3">
          <Alert variant="destructive" className="bg-white dark:bg-slate-800">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="mt-2">
              {menuItemsQuery.error["message"] ||
                "Something went wront. Try again."}
            </AlertDescription>
          </Alert>
        </div>
      )}
      {menuItemsQuery.status === "loading" && (
        <>
          <div
            className={cn(
              "px-[6px] py-[6px] h-full @[1300px]:grid-cols-7 @[1100px]:grid-cols-6 @[800px]:grid-cols-5 @[650px]:grid-cols-4 @[450px]:grid-cols-3 gap-[8px] grid grid-cols-2"
            )}
          >
            {Array(25)
              .fill(null)
              .map((_, i) => {
                return (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-700 bg-opacity-50 p-[6px] rounded-[3px]"
                  >
                    <Skeleton className="w-full h-[120px] rounded-[3px]" />
                    <div className="mt-2 flex items-center justify-between">
                      <Skeleton className="w-[60%] h-[20px] rounded-[4px]" />
                      <Skeleton className="w-[35%] h-[18px] rounded-[4px]" />
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
      {menuItemsQuery.status === "success" && (
        <>
          {menuItemsQuery?.data?.length ? (
            <div
              className={cn(
                "px-2 py-[6px] h-full @[1300px]:grid-cols-7 @[1100px]:grid-cols-6 @[800px]:grid-cols-5 @[650px]:grid-cols-4 @[450px]:grid-cols-3 gap-[6px] grid grid-cols-2"
              )}
            >
              <>
                {menuItemsQuery?.data?.map((e: any, i) => {
                  const stock_item = e?.expand?.destination_stock_item;
                  const availableQuantity = stock_item?.available_quantity;
                  const quantity_alert = stock_item?.quantity_alert;
                  const isOutOfStock = availableQuantity <= 0;
                  const isLowStock = availableQuantity <= quantity_alert;
                  return (
                    <div
                      key={i}
                      onClick={() => setmenuToShow(e)}
                      className="flex group cursor-pointer h-full hover:bg-slate-50  flex-col py-1- border dark:border-slate-600 border-slate-200 rounded-[5px] px-1- w-full dark:bg-slate-800 bg-white gap-1"
                    >
                      <div className="overflow-hidden border-b dark:border-b-slate-600  rounded-t-[5px] relative">
                        {stock_item && (
                          <div className="absolute z-20 bg-white border px-[4px] py-[2px] rounded-sm right-2 top-2">
                            {isOutOfStock || isLowStock ? (
                              <svg
                                width={10}
                                height={40}
                                viewBox="0 0 14 46"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <rect
                                  y={1}
                                  width={14}
                                  height={42}
                                  rx={4}
                                  fill="#FF5D02"
                                  fillOpacity="0.06"
                                />
                                <rect
                                  y={22}
                                  width={14}
                                  height={21}
                                  rx={4}
                                  fill="#FF5D02"
                                  fillOpacity="0.12"
                                />
                                <rect
                                  y={29}
                                  width={14}
                                  height={17}
                                  rx={4}
                                  fill="#FF5D02"
                                  fillOpacity="0.12"
                                />
                                <rect
                                  y={36}
                                  width={14}
                                  height={10}
                                  rx={4}
                                  fill="#FF5D02"
                                />
                              </svg>
                            ) : (
                              <svg
                                width={10}
                                height={40}
                                viewBox="0 0 14 47"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <g clipPath="url(#clip0_11_413)">
                                  <rect
                                    y="0.187683"
                                    width={14}
                                    height={43}
                                    rx={4}
                                    fill="#01A653"
                                    fillOpacity="0.12"
                                  />
                                  <rect
                                    y="8.18768"
                                    width={14}
                                    height={35}
                                    rx={4}
                                    fill="#01A653"
                                    fillOpacity="0.55"
                                  />
                                  <rect
                                    y="17.1877"
                                    width={14}
                                    height={29}
                                    rx={4}
                                    fill="#01A653"
                                    fillOpacity="0.55"
                                  />
                                  <rect
                                    y="29.1877"
                                    width={14}
                                    height={17}
                                    rx={4}
                                    fill="#01A653"
                                  />
                                  <rect
                                    y="36.1877"
                                    width={14}
                                    height={10}
                                    rx={4}
                                    fill="#01A653"
                                  />
                                </g>
                                <defs>
                                  <clipPath id="clip0_11_413">
                                    <rect
                                      width={14}
                                      height={46}
                                      fill="white"
                                      transform="translate(0 0.187683)"
                                    />
                                  </clipPath>
                                </defs>
                              </svg>
                            )}
                          </div>
                        )}

                        <img
                          className="@[630]:h-[150px] h-[140px] transition-all group-hover:scale-105 w-full object-cover rounded-sm"
                          src={e.image}
                          alt=""
                        />
                      </div>
                      <div className="flex py-1 pb-[6px] px-2  justify-between items-center">
                        <div className="space-y-1 w-full">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[13px] dark:text-slate-100 capitalize truncate font-semibold">
                              {e.name}
                            </h4>
                          </div>
                          <div className="flex items-center justify-between w-full">
                            <p className="text-primary text-[12.5px] font-medium">
                              {parseInt(e?.price)?.toLocaleString()} FRW
                            </p>
                            <span>
                              {e.availability === "unavailable" && (
                                <span className="text-[12px] mb-[2px] block font-medium text-red-500">
                                  Unavailable
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
