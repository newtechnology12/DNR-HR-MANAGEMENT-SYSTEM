import pocketbase from "@/lib/pocketbase";
import formatBill from "@/utils/formatBill";
import formatSeconds from "@/utils/formatSeconds";
import { differenceInSeconds } from "date-fns";
import { useMemo, useState } from "react";
import { useQuery } from "react-query";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useOutletContext } from "react-router-dom";

function GeneralWorkPeriodReport() {
  const [work_period] = useOutletContext() as [any];

  const workPeriod = work_period;

  const getWorkPeriodReport = async () => {
    const orders = await pocketbase.collection("orders").getFullList({
      filter: `work_period="${workPeriod.id}"`,
      expand:
        "bills,bills.items,bills.transactions,bills.transactions.payment_method,items,items.menu,items.menu.category,waiter",
    });

    const work_shifts = await pocketbase.collection("work_shifts").getFullList({
      filter: `work_period="${workPeriod.id}"`,
    });

    const items = orders
      .map((order) => order?.expand?.items)
      .flat()
      .map((e) => {
        return {
          ...e,
          menu: e?.expand?.menu,
        };
      });

    const grouped_items_by_menu = items.reduce((acc, item) => {
      if (!acc[item.menu.id]) {
        acc[item.menu.id] = [];
      }
      acc[item.menu.id].push(item);
      return acc;
    }, {});

    const array_of_single_items = Object.keys(grouped_items_by_menu).map(
      (key) => {
        return {
          menu: grouped_items_by_menu[key][0].menu,
          total_quantity: grouped_items_by_menu[key].reduce(
            (a, b) => a + b.quantity,
            0
          ),
          total_amount: grouped_items_by_menu[key].reduce(
            (a, b) => a + b.amount,
            0
          ),
          percentage: (
            (grouped_items_by_menu[key].reduce((a, b) => a + b.amount, 0) /
              items.reduce((a, b) => a + b.amount, 0)) *
            100
          ).toFixed(2),
        };
      }
    );

    const categories = orders
      .map((order) => order?.expand?.items)
      .flat()
      .map((e) => {
        return {
          ...e,
          category: e?.expand?.menu?.category,
        };
      });

    const grouped_items_by_category = categories.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {});

    const array_of_single_items_by_category = Object.keys(
      grouped_items_by_category
    ).map((key) => {
      return {
        category:
          grouped_items_by_category[key][0].expand?.menu?.expand?.category
            ?.name,
        total_quantity: grouped_items_by_category[key].reduce(
          (a, b) => a + b.quantity,
          0
        ),
        total_amount: grouped_items_by_category[key].reduce(
          (a, b) => a + b.amount,
          0
        ),
        percentage: (
          (grouped_items_by_category[key].reduce((a, b) => a + b.amount, 0) /
            items.reduce((a, b) => a + b.amount, 0)) *
          100
        ).toFixed(2),
      };
    });

    const waiters_items_sales = orders
      .map((order) =>
        order?.expand?.items.map((e) => ({
          ...e,
          waiter: order?.expand?.waiter,
        }))
      )
      .flat()
      .map((e) => {
        return {
          ...e,
          waiter: e?.waiter,
        };
      });

    const grouped_items_by_waiter = waiters_items_sales.reduce((acc, item) => {
      if (!acc[item.waiter.id]) {
        acc[item.waiter.id] = [];
      }
      acc[item.waiter.id].push(item);
      return acc;
    }, {});

    const array_of_single_items_by_waiter = Object.keys(
      grouped_items_by_waiter
    ).map((key) => {
      const grouped_items_by_menu = grouped_items_by_waiter[key].reduce(
        (acc, item) => {
          if (!acc[item.menu]) {
            acc[item.menu] = [];
          }
          acc[item.menu].push(item);
          return acc;
        },
        {}
      );

      const array_of_single_items_by_waiter = Object.keys(
        grouped_items_by_menu
      ).map((key) => {
        return {
          menu: grouped_items_by_menu[key][0]?.expand?.menu,
          total_quantity: grouped_items_by_menu[key].reduce(
            (a, b) => a + b.quantity,
            0
          ),
          total_amount: grouped_items_by_menu[key].reduce(
            (a, b) => a + b.amount,
            0
          ),
          percentage: (
            (grouped_items_by_menu[key].reduce((a, b) => a + b.amount, 0) /
              items.reduce((a, b) => a + b.amount, 0)) *
            100
          ).toFixed(2),
        };
      });

      console.log(array_of_single_items_by_waiter);

      return {
        waiter: grouped_items_by_waiter[key][0].waiter,
        total_quantity: grouped_items_by_waiter[key].reduce(
          (a, b) => a + b.quantity,
          0
        ),
        total_amount: grouped_items_by_waiter[key].reduce(
          (a, b) => a + b.amount,
          0
        ),
        items: array_of_single_items_by_waiter,
        orders: orders.filter((e) => e?.expand?.waiter?.id === key),
        ordersCount: orders.filter((e) => e?.expand?.waiter?.id === key).length,
        percentage: (
          (grouped_items_by_waiter[key].reduce((a, b) => a + b.amount, 0) /
            items.reduce((a, b) => a + b.amount, 0)) *
          100
        ).toFixed(2),
      };
    });

    const payment_methods = await pocketbase
      .collection("payment_methods")
      .getFullList();

    const bills = orders
      .map((order) => order?.expand?.bills)
      .flat()
      .map(formatBill);

    const transactions = bills
      .map((bill) => bill?.expand?.transactions)
      .flat()
      .filter((e) => e);

    const total_sales = bills.reduce((a, b) => a + b.total, 0);

    const total_transactions = transactions.reduce((a, b) => a + b.amount, 0);

    const cash_amount = transactions
      .filter((e) => e?.expand?.payment_method?.type === "cash")
      .reduce((a, b) => a + b.amount, 0);

    const unsettled_amount = transactions
      .filter((e) => e.status !== "approved")
      .reduce((a, b) => a + b.amount, 0);

    const settled_amount = transactions
      .filter((e) => e.status === "approved")
      .reduce((a, b) => a + b.amount, 0);

    const amount_owed = total_sales - total_transactions;

    const payment_methods_used = payment_methods.map((e) => {
      return {
        payment_method: { name: e.name },
        amount: transactions
          .filter((i) => i.payment_method === e.id)
          .reduce((a, b) => a + b.amount, 0),
      };
    });

    return {
      payment_methods: payment_methods_used,
      amount_owed,
      cash_amount,
      settled_amount: settled_amount,
      unsettled_amount: unsettled_amount,
      gross_sales: total_sales,
      closed_bills: bills.filter((e) => e.payment_status === "paid").length,
      pending_bills: bills.filter((e) => e.payment_status === "pending").length,
      all_bills: bills.length,
      orders_count: orders.length,
      closing_notes: workPeriod?.closing_notes,
      work_shifts: work_shifts.length,
      sold_items: array_of_single_items,
      sold_items_by_waiter: array_of_single_items_by_waiter,
      sold_categories: array_of_single_items_by_category,
      duration: formatSeconds(
        differenceInSeconds(
          workPeriod.ended_at ? new Date(workPeriod.ended_at) : new Date(),
          new Date(workPeriod.started_at)
        )
      ),
    };
  };

  const { data } = useQuery(
    ["work_period_report", workPeriod?.id],
    getWorkPeriodReport,
    {
      enabled: Boolean(workPeriod?.id),
    }
  );

  const report_status = useMemo(
    () => [
      {
        name: "period_time",
        title: "Period Time",
        value: data ? data?.duration : "---",
      },
      {
        name: "gross_sales_amount",
        title: "Gross Sales Amount",
        value: data
          ? Number(data?.gross_sales).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "unsettled_amount",
        title: "Unsettled amount",
        value: data
          ? Number(data?.unsettled_amount).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "settled_amount",
        title: "settled amount",
        value: data
          ? Number(data?.settled_amount).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "total_orders",
        title: "Total Orders",
        value: data ? Number(data?.orders_count) : "---",
      },
      {
        name: "amount_owed",
        title: "Amount Owed",
        value: data
          ? Number(data?.amount_owed).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "open_closed_bills",
        title: "Open/Closed bills",
        value: data ? `${data?.closed_bills}/${data?.all_bills}` : "---",
      },
      {
        name: "expected_cash_amount",
        title: "Expected cash amount",
        value: data
          ? Number(data?.cash_amount).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "shifts",
        title: "Work Shifts",
        value: data ? data?.work_shifts : "---",
      },
    ],
    [data]
  );

  const [soldItemsToShow, setSoldItemsToShow] = useState(null);

  return (
    <>
      <div>
        <div className="px-5">
          <div className="border-b  border-dashed">
            <h4>
              <span className="py-2 uppercase text-[12px] mb-1 block font-medium text-slate-500">
                Work Period Summary
              </span>
            </h4>
            <div className="grid gap-4  pb-3 grid-cols-2 sm:grid-cols-5">
              {report_status.map((status, i) => (
                <div key={i}>
                  <h1 className="px-2- py-1 text-base sm:text-[17px] font-semibold">
                    {status.value}
                  </h1>
                  <div className="px-2- py-1 text-sm text-slate-500">
                    {status.title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 border-b border-dashed  pb-4">
            <h4>
              <span className="py-2 uppercase text-[12px] font-medium text-slate-500">
                Payment Methods
              </span>
            </h4>
            <div className="grid px-2- pt-3 grid-cols-3 gap-x-6 gap-y-3">
              {data?.payment_methods?.map((method, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className=" text-[13px] text-slate-600">
                    {method.payment_method.name}
                  </span>
                  <p>
                    <span className="font-semibold text-[13px]">
                      {method.amount.toLocaleString()} FRW
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
          {data?.closing_notes && (
            <div className="border-b border-dashed">
              <div className="px-2- mt-3">
                <Label className="text-[13px] mb-2 block text-slate-500">
                  Closing Note (Optional)
                </Label>
              </div>
            </div>
          )}
          <div className="border-b border-dashed  pb-3 ">
            <div className="grid grid-cols-2 gap-3">
              <div className="border-r pt-2 py-1 border-slate-200 border-dashed">
                <div className="px-2- mt-2">
                  <p className="text-[13px] uppercase mb-1 block text-slate-500">
                    Sales by items.
                  </p>
                </div>
                <div className="w-full">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Item
                        </th>
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Quantity
                        </th>
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Gross Amount
                        </th>
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Percentage
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.sold_items?.map((e, i) => {
                        return (
                          <tr key={i}>
                            <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                              {e.menu?.name}
                            </td>
                            <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                              {e.total_quantity}
                            </td>
                            <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                              {Number(e.total_amount).toLocaleString()} FRW
                            </td>
                            <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                              {e.percentage}%
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="font-medium border-t border-dashed capitalize py-[10px] text-slate-800 text-[12.5px]">
                          Total
                        </td>
                        <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                          {data?.sold_items.reduce(
                            (a, b) => a + b.total_quantity,
                            0
                          )}
                        </td>
                        <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                          {Number(
                            data?.sold_items.reduce(
                              (a, b) => a + b.total_amount,
                              0
                            ) || 0
                          ).toLocaleString()}{" "}
                          FRW
                        </td>
                        <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                          100%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="border-r- px-3- pt-2 py-1 border-slate-200 border-dashed">
                <div className="px-2- mt-2">
                  <p className="text-[13px] uppercase mb-2 block text-slate-500">
                    Sales by categories.
                  </p>
                </div>
                <div className="w-full">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Category
                        </th>
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Quantity
                        </th>
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Gross Amount
                        </th>
                        <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                          Percentage
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.sold_categories?.map((e, i) => {
                        return (
                          <tr key={i}>
                            <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                              {e.category}
                            </td>
                            <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                              {e.total_quantity}
                            </td>
                            <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                              {Number(e.total_amount).toLocaleString()} FRW
                            </td>
                            <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                              {e.percentage}%
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="font-medium border-t border-dashed capitalize py-[10px] text-slate-800 text-[12.5px]">
                          Total
                        </td>
                        <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                          {data?.sold_categories.reduce(
                            (a, b) => a + b.total_quantity,
                            0
                          )}
                        </td>
                        <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                          {Number(
                            data?.sold_categories.reduce(
                              (a, b) => a + b.total_amount,
                              0
                            ) || 0
                          ).toLocaleString()}{" "}
                          FRW
                        </td>
                        <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                          100%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div className="border-b- border-dashed  pb-3 ">
            <div className="px-2- pt-3">
              <p className="text-[13px] uppercase mb-1 block text-slate-500">
                Sales by waiters.
              </p>
            </div>
            <div className="w-full">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                      Waiter
                    </th>
                    <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                      Quantity
                    </th>
                    <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                      Orders count
                    </th>
                    <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                      Gross Amount
                    </th>
                    <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                      Percentage
                    </th>
                    <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.sold_items_by_waiter?.map((e, i) => {
                    return (
                      <tr key={i}>
                        <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                          {e.waiter?.name}
                        </td>
                        <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                          {e.total_quantity}
                        </td>
                        <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                          {e.ordersCount}
                        </td>
                        <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                          {Number(e.total_amount).toLocaleString()} FRW
                        </td>
                        <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                          {e.percentage}%
                        </td>

                        <td>
                          <div className="flex items-center gap-3">
                            <Button
                              size={"sm"}
                              onClick={() => {
                                setSoldItemsToShow(e?.items);
                              }}
                              className={"text-orange-500 !px-0"}
                              variant="link"
                            >
                              View sales
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="font-medium border-t border-dashed capitalize py-[10px] text-slate-800 text-[12.5px]">
                      Total
                    </td>
                    <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                      {data?.sold_items_by_waiter.reduce(
                        (a, b) => a + b.total_quantity,
                        0
                      )}
                    </td>
                    <td className="font-medium capitalize border-t border-dashed py-[10px] text-slate-800 text-[12.5px]">
                      {data?.sold_items_by_waiter.reduce(
                        (a, b) => a + b.ordersCount,
                        0
                      )}
                    </td>
                    <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                      {Number(
                        data?.sold_items_by_waiter.reduce(
                          (a, b) => a + b.total_amount,
                          0
                        )
                      ).toLocaleString()}{" "}
                      FRW
                    </td>
                    <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                      100%
                    </td>
                    <td className=" border-t border-dashed"></td>
                    <td className=" border-t border-dashed"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <WaiterSalesModal
        open={Boolean(soldItemsToShow)}
        setOpen={() => {
          setSoldItemsToShow(null);
        }}
        sold_items={soldItemsToShow}
      />
    </>
  );
}

export default GeneralWorkPeriodReport;

function WaiterSalesModal({ open, setOpen, sold_items }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        // @ts-ignore
        overlayClass={"backdrop-blur-md"}
        className="sm:max-w-[550px]"
      >
        <DialogHeader>
          <DialogTitle>
            <span className="text-sm px-1 font-semibold py-2">
              Waiter Sales
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-1 py-0 text-sm text-slate-500 leading-7">
              Total quantity, gross amount and percentage of each waiter.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className=" pt-2 px-2 py-1">
          <div className="w-full">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                    Item
                  </th>
                  <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                    Quantity
                  </th>
                  <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                    Gross Amount
                  </th>
                  <th className="font-semibold py-2 text-slate-700 uppercase text-[12px]">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody>
                {sold_items?.map((e, i) => {
                  return (
                    <tr key={i}>
                      <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                        {e?.menu?.name}
                      </td>
                      <td className="font-medium py-[10px] text-slate-500 text-[12.5px]">
                        {e.total_quantity}
                      </td>
                      <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                        {Number(e.total_amount).toLocaleString()} FRW
                      </td>
                      <td className="font-medium capitalize py-[10px] text-slate-500 text-[12.5px]">
                        {e.percentage}%
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="font-medium border-t border-dashed capitalize py-[10px] text-slate-800 text-[12.5px]">
                    Total
                  </td>
                  <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                    {sold_items?.reduce((a, b) => a + b.total_quantity, 0)}
                  </td>
                  <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                    {Number(
                      sold_items?.reduce((a, b) => a + b.total_amount, 0)
                    ).toLocaleString()}{" "}
                    FRW
                  </td>
                  <td className="font-medium py-[10px] border-t border-dashed text-slate-800 text-[12.5px]">
                    100%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
