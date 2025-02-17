// import { CheckCircle, Search } from "react-feather";
// // import { Button } from "./ui/button";
// import { useEffect, useMemo, useState } from "react";
// // import Loader from "./icons/Loader";
// import { toast } from "sonner";
// import { useNavigate, useParams } from "react-router-dom";
// import { useMutation, useQuery } from "react-query";
// // import { ScrollArea, ScrollBar } from "./ui/scroll-area";
// import { Save } from "lucide-react";
// import useModalState from "@/hooks/useModalState";
// // import { BulkImport } from "./modals/BulkImport";
// import useConfirmModal from "@/hooks/useConfirmModal";
// // import ConfirmModal from "./modals/ConfirmModal";
// import { cn } from "@/utils";
// import pocketbase from "@/lib/pocketbase";
// import { useAuth } from "@/context/auth.context";
// import { useRoles } from "@/context/roles.context";
// import truncateString from "@/utils/truncateString";
// import ConfirmModal from "@/components/modals/ConfirmModal";
// import { Button } from "@/components/ui/button";
// import Loader from "@/components/icons/Loader";
// import { ScrollArea } from "@radix-ui/react-scroll-area";
// import { ScrollBar } from "@/components/ui/scroll-area";
// import { BulkImport } from "@/components/modals/BulkImport";

// export default function CountInventorySession({ readonly = false }) {
//   const [items, setItems] = useState<any>([]);

//   const sessionId = useParams().sessionId;

//   const {
//     data: session,
//     isLoading,
//     refetch,
//   } = useQuery("stock_session", async () => {
//     const session = await pocketbase
//       .collection("inventory_sessions")
//       .getOne(sessionId, {
//         expand: `stock`,
//       });

//     const sessionItems = await pocketbase
//       .collection("inventory_session_items")
//       .getFullList({
//         filter: `inventory_session="${sessionId}"`,
//         expand:
//           "stock_item,location_stock_item,location_stock_item.unit,location_stock_item.unit.base_unit,transfer_items,sales,sales.order_item",
//       });

//     return {
//       ...session,
//       items: sessionItems,
//     };
//   });

//   useEffect(() => {
//     if (session?.items) {
//       const items = session.items.map((sessionItem) => {
//         return {
//           id: sessionItem?.id,
//           opening_stock: sessionItem?.opening_stock || 0,
//           closing_stock: sessionItem?.closing_stock || 0,
//           entrance_stock: sessionItem?.entrance_stock || 0,
//           selling_price: sessionItem?.selling_price,
//           transfer_items: sessionItem?.expand?.transfer_items || [],
//           opening_weight: sessionItem?.opening_weight || 0,
//           closing_weight: sessionItem?.closing_weight || 0,
//           used_stock_weight: sessionItem?.used_stock_weight || 0,

//           opening_bottle_count: sessionItem?.opening_bottle_count || 0,
//           closing_bottle_count: sessionItem?.closing_bottle_count || 0,
//           used_stock_bottle_count: sessionItem?.used_stock_bottle_count || 0,

//           closing_full_bottle_count:
//             sessionItem?.closing_full_bottle_count || 0,
//           opening_full_bottle_count:
//             sessionItem?.opening_full_bottle_count || 0,

//           used_stock_notes: sessionItem?.used_stock_notes || "",
//           used_stock: sessionItem?.used_stock || 0,
//           sales: sessionItem?.expand?.sales || [],
//           item: {
//             id: sessionItem?.location_stock_item,
//             name: sessionItem?.expand?.stock_item?.name,
//             category: sessionItem?.expand?.stock_item?.category,
//             stock_item: sessionItem?.expand?.stock_item?.id,
//             unit: {
//               id: sessionItem?.expand?.location_stock_item?.expand?.unit.id,
//               name: sessionItem?.expand?.location_stock_item?.expand?.unit
//                 ?.display_name,
//               base_unit: {
//                 id: sessionItem?.expand?.location_stock_item?.expand?.unit
//                   ?.expand?.base_unit?.id,
//                 name: sessionItem?.expand?.location_stock_item?.expand?.unit
//                   ?.expand?.base_unit?.display_name,
//                 conversion_factor:
//                   sessionItem?.expand?.location_stock_item?.expand?.unit
//                     ?.conversion_factor,
//               },
//             },
//             sold_as_shorts: sessionItem?.expand?.stock_item?.sold_as_shorts,
//             empty_bottle_weight:
//               sessionItem?.expand?.stock_item?.empty_bottle_weight,
//             shot_weight: sessionItem?.expand?.stock_item?.shot_weight,
//           },
//         };
//       });

//       setItems(items);
//     }
//   }, [session]);

//   const computedItems = useMemo(() => {
//     return items.map((item) => {
//       if (item.id === "bgylkzrvdij8hn3") {
//         console.log(item);
//       }
//       const entrance_stock = item?.transfer_items?.reduce((acc, transfer) => {
//         return acc + transfer?.quantity_received;
//       }, 0);

//       const pos_sales = item?.sales?.reduce((acc, sale) => {
//         return acc + sale.quantity;
//       }, 0);

//       const stock_out = item.closing_stock
//         ? entrance_stock +
//           item.opening_stock -
//           item.closing_stock -
//           item.used_stock
//         : 0;

//       const current_stock_before_close = item.opening_stock + entrance_stock;

//       const current_stock_after_close = item.closing_stock;

//       return {
//         ...item,
//         entrance_stock,
//         stock_out: stock_out,
//         totalSales: (item?.selling_price || 0) * stock_out,
//         current_stock_before_close,
//         current_stock_after_close,
//         pos_sales: pos_sales || 0,
//         pos_sales_amount: pos_sales * item?.selling_price || 0,
//         offline_sales: stock_out - pos_sales || 0,
//         offline_sales_amount:
//           (stock_out - pos_sales) * item?.selling_price || 0,
//       };
//     });
//   }, [items]);

//   const [submiting, setSubmiting] = useState(false);

//   const submit = async ({ silent = false }: any) => {
//     try {
//       setSubmiting(true);
//       await Promise.all(
//         items.map(async (item) => {
//           const current_stock = itemsToshows.find(
//             (e) => e.id === item.id
//           )?.current_stock;

//           await pocketbase
//             .collection("location_stock_items")
//             .update(item.item?.id, {
//               available_quantity: current_stock,
//             });
//           return pocketbase
//             .collection("inventory_session_items")
//             .update(item.id, {
//               opening_stock: item.opening_stock,
//               closing_stock: item.closing_stock,
//               selling_price: item.selling_price,
//               current_stock: current_stock,
//               opening_weight: item.opening_weight,
//               closing_weight: item.closing_weight,
//               used_stock_weight: item.used_stock_weight,
//               closing_full_bottle_count: item.closing_full_bottle_count,
//               opening_full_bottle_count: item.opening_full_bottle_count,
//               opening_bottle_count: item.opening_bottle_count,
//               closing_bottle_count: item.closing_bottle_count,
//               used_stock_bottle_count: item.used_stock_bottle_count,
//               used_stock: item.used_stock,
//               used_stock_notes: item.used_stock_notes,
//             });
//         })
//       );

//       if (!silent) {
//         toast.success("Stock audit report submitted successfully");
//       }

//       setSubmiting(false);
//     } catch (error) {
//       toast.error("Failed to submit stock audit report");
//       setSubmiting(false);
//     }
//   };

//   useEffect(() => {
//     const saveInterval = setInterval(() => {
//       if (!readonly) {
//         submit({ silent: true });
//       }
//     }, 30000); // Save every 30 seconds

//     return () => clearInterval(saveInterval);
//   }, [items]);

//   const [search, setsearch] = useState("");

//   const itemsToshows = useMemo(() => {
//     return computedItems
//       .filter((item) => {
//         return (
//           item?.item?.name?.toLowerCase().includes(search.toLowerCase()) ||
//           item?.item?.category?.toLowerCase().includes(search.toLowerCase())
//         );
//       })
//       .sort((a, b) =>
//         a?.item?.sold_as_shorts === b?.item?.sold_as_shorts
//           ? 0
//           : a?.item?.sold_as_shorts
//           ? -1
//           : 1
//       );
//   }, [search, computedItems]);

//   const totals = useMemo(() => {
//     return {
//       totalProfits: itemsToshows.reduce((acc, item) => {
//         return acc + (item.profit || 0);
//       }, 0),
//       totalSales: itemsToshows.reduce((acc, item) => {
//         return acc + (item.totalSales || 0);
//       }, 0),
//       totalCostRemaining: itemsToshows.reduce((acc, item) => {
//         return acc + (item.costRemaining || 0);
//       }, 0),
//       total_pos_sales: itemsToshows.reduce((acc, item) => {
//         return acc + (item.pos_sales_amount || 0);
//       }, 0),
//       total_offline_sales: itemsToshows.reduce((acc, item) => {
//         return acc + (item.offline_sales_amount || 0);
//       }, 0),
//     };
//   }, [itemsToshows]);

//   const bulkImportModal = useModalState();

//   const handleValidateBulkImport = async (rows) => {
//     const errors = [];
//     // Validation for each row
//     for (let i = 0; i < rows.length; i++) {
//       // handle logic validation here
//     }
//     return errors;
//   };

//   const confirmModal = useConfirmModal();

//   const navigate = useNavigate();

//   const { user } = useAuth();

//   const finishMutation = useMutation(
//     async () => {
//       return pocketbase.collection("inventory_sessions").update(sessionId, {
//         status: "closed",
//         ended_at: new Date().toISOString(),
//         closed_by: user?.id,
//       });
//     },
//     {
//       onSuccess: () => {
//         navigate(`/dashboard/inventory/inventory-sessions`);
//         toast.success("Inventory session closed successfully");
//         refetch();
//       },
//       onError: () => {
//         toast.error("Failed to close inventory session");
//       },
//     }
//   );

//   const { canPerform } = useRoles();

//   return (
//     <>
//       <ConfirmModal
//         title={"Are you sure you want to close the inventory?"}
//         description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
//         a! Nihil`}
//         meta={confirmModal.meta}
//         onConfirm={() => finishMutation.mutate()}
//         isLoading={finishMutation.isLoading}
//         open={confirmModal.isOpen}
//         onClose={() => confirmModal.close()}
//       />
//       <div className="sm:px-4 mt-3 px-2">
//         <h3 className="text-[14px] font-semibold">
//           {session?.expand?.stock?.name} - Count inventory session
//         </h3>

//         <div className="w-full bg-white mt-3 border rounded-md">
//           <div className="py-2 border-b px-3">
//             <div className="flex items-center justify-between">
//               <div className="rounded-[4px] relative overflow-hidden text-sm w-[300px] border">
//                 <Search
//                   size={16}
//                   className="absolute text-slate-500 top-[10px] left-[8px]"
//                 />
//                 <input
//                   placeholder="Search here.."
//                   className="w-full py-[9px] pl-8 h-full"
//                   type="text"
//                   value={search}
//                   onChange={(e) => setsearch(e.target.value)}
//                 />
//               </div>
//               {!readonly && (
//                 <div className="flex items-center gap-3">
//                   <Button
//                     disabled={submiting}
//                     onClick={() => submit({})}
//                     size="sm"
//                   >
//                     {submiting ? (
//                       <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
//                     ) : (
//                       <Save size={16} className="mr-2" />
//                     )}
//                     <span>Save Changes</span>
//                   </Button>
//                   <Button
//                     onClick={() => confirmModal.open({})}
//                     size="sm"
//                     className="bg-red-500 hover:bg-red-600"
//                   >
//                     <CheckCircle size={16} className="mr-2" />
//                     <span>Finish Session.</span>
//                   </Button>
//                 </div>
//               )}
//             </div>
//           </div>

//           <div className="overflow-hidden w-full">
//             <ScrollArea className="overflow-x-auto min-w-0">
//               <table className="w-full">
//                 <thead>
//                   <tr className="!font-medium bg-slate-100">
//                     <th className="!font-medium   min-w-[150px]   border-r border-b text-left p-2 text-[13px]">
//                       Item
//                     </th>
//                     <th className="!font-medium border-r-blue-300  min-w-[150px]   border-r border-b text-left p-2 text-[13px]">
//                       Category
//                     </th>
//                     <th
//                       colSpan={3}
//                       className="bg-blue-200 border-blue-400 text-blue-500 font-semibold text-center  min-w-[150px]  truncate border-r border-b p-2 text-[13px]"
//                     >
//                       Opening Stock
//                     </th>
//                     <th
//                       colSpan={2}
//                       className="bg-green-200 border-r-blue-400 border-green-300 font-semibold text-green-500  min-w-[150px] text-center  border-r border-b truncate p-2 text-[13px]"
//                     >
//                       Entrance Stock
//                     </th>
//                     <th
//                       colSpan={3}
//                       className="bg-blue-200 border-blue-400 font-semibold text-blue-500  min-w-[150px]  border-r border-b truncate text-center p-2 text-[13px]"
//                     >
//                       Closing Stock
//                     </th>
//                     <th
//                       colSpan={3}
//                       className="bg-orange-100 border-orange-400 font-semibold text-orange-500  min-w-[150px]  border-r border-b truncate text-center p-2 text-[13px]"
//                     >
//                       Consumed/Damaged
//                     </th>
//                     {(readonly ||
//                       canPerform("view_inventory_session_details")) && (
//                       <>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           BEFORE CLOSE
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           AFTER CLOSE
//                         </th>
//                         <th
//                           colSpan={2}
//                           className="!font-medium bg-red-100 text-red-500 text-center  min-w-[150px]  border-r border-b truncate p-2 text-[13px]"
//                         >
//                           Stock Out/Sales
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           Total Sales
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           POS Sales Count
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           POS Sales amount
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           Offline Sales Count
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-left p-2 text-[13px]">
//                           Offline Sales amount
//                         </th>
//                         <th className="!font-medium  min-w-[150px]  border-r border-b truncate text-right p-2 text-[13px]">
//                           Selling Price
//                         </th>
//                       </>
//                     )}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {itemsToshows.map((item, index) => (
//                     <tr key={index}>
//                       <td className="border-r border-b truncate font-medium capitalize text-[13px] px-3">
//                         {item?.item?.name}
//                       </td>
//                       <td className="border-r border-b text-slate-500  border-r-blue-300 truncate font-medium capitalize text-[13px] px-3">
//                         {item?.item?.category}
//                       </td>

//                       {item?.item?.sold_as_shorts && (
//                         <td className="border-r bg-blue-100/50 border-blue-500 min-w-[100px]  border-b text-sm">
//                           <GramsInput
//                             setItems={setItems}
//                             item={item}
//                             bottleCountKey={`opening_bottle_count`}
//                             stockKey={`opening_stock`}
//                             weightKey={`opening_weight`}
//                             readonly={readonly}
//                           />
//                         </td>
//                       )}

//                       <td
//                         colSpan={item?.item?.sold_as_shorts ? 1 : 2}
//                         className="border-r bg-blue-100/50 border-blue-500 min-w-[100px]  border-b text-sm"
//                       >
//                         <div className="relative">
//                           <input
//                             placeholder="---"
//                             type="number"
//                             disabled={readonly || item?.item?.sold_as_shorts}
//                             className={cn(
//                               "h-full border-[1.5px]  border-blue-500 bg-transparent text-blue-700 py-2 w-full px-3",
//                               {
//                                 "text-slate-500": item?.item?.sold_as_shorts,
//                               }
//                             )}
//                             value={
//                               item.opening_stock == undefined
//                                 ? ""
//                                 : item.opening_stock
//                             }
//                             onChange={(e) => {
//                               setItems((prev) => {
//                                 const newItems = prev.map((prevItem) => {
//                                   if (prevItem.id === item.id) {
//                                     return {
//                                       ...prevItem,
//                                       opening_stock: e.target.value
//                                         ? Number(e.target.value)
//                                         : e.target.value,
//                                     };
//                                   }
//                                   return prevItem;
//                                 });
//                                 return newItems;
//                               });
//                             }}
//                           />
//                           <span className="capitalize absolute right-3 text-[13px] text-slate-500 top-[25%]">
//                             {truncateString(item?.item?.unit?.name, 5)}
//                           </span>
//                         </div>
//                       </td>

//                       <td className="border-r border-blue-400 bg-blue-100/50 min-w-[80px]  border-b text-sm text-left w-[150px] px-3">
//                         <span className="capitalize truncate text-slate-500 text-[13px] font-normal">
//                           {item?.item?.unit?.base_unit?.name ? (
//                             <>
//                               {Number(
//                                 item?.item?.unit?.base_unit?.conversion_factor *
//                                   item?.opening_stock
//                               )
//                                 .toFixed(1)
//                                 .replace(/\.0$/, "")}{" "}
//                               {item?.item?.unit?.base_unit?.name}
//                             </>
//                           ) : (
//                             "---"
//                           )}
//                         </span>
//                       </td>

//                       <td className="border-r  min-w-[80px] bg-green-100/50 border-green-400  border-b text-sm text-left w-[150px] px-3">
//                         <span className="capitalize truncate text-slate-900 text-[13px] font-normal">
//                           {item?.entrance_stock || 0} {item?.item?.unit?.name}
//                         </span>
//                       </td>

//                       <td className="border-r border-r-blue-400 min-w-[80px] bg-green-100/50 border-green-400  border-b text-sm text-left w-[150px] px-3">
//                         <span className="capitalize truncate text-slate-500 text-[13px] font-normal">
//                           {item?.item?.unit?.base_unit?.name ? (
//                             <>
//                               {Number(
//                                 item?.item?.unit?.base_unit?.conversion_factor *
//                                   item?.entrance_stock
//                               )
//                                 .toFixed(1)
//                                 .replace(/\.0$/, "")}{" "}
//                               {item?.item?.unit?.base_unit?.name}
//                             </>
//                           ) : (
//                             "---"
//                           )}
//                         </span>
//                       </td>

//                       {item?.item?.sold_as_shorts && (
//                         <td className="border-r bg-blue-100/50 border-blue-500 min-w-[100px]  border-b text-sm">
//                           <>
//                             <GramsInput
//                               setItems={setItems}
//                               item={item}
//                               bottleCountKey={`closing_bottle_count`}
//                               stockKey={`closing_stock`}
//                               weightKey={`closing_weight`}
//                               readonly={readonly}
//                             />
//                           </>
//                         </td>
//                       )}
//                       <td
//                         colSpan={item?.item?.sold_as_shorts ? 1 : 2}
//                         className="border-r border-blue-400 border-b bg-blue-100/50 min-w-[100px] text-sm"
//                       >
//                         <div className="relative">
//                           <input
//                             placeholder="---"
//                             type="number"
//                             disabled={readonly || item?.item?.sold_as_shorts}
//                             className="h-full border-[1.5px] border-blue-500 bg-transparent py-2 text-blue-500 w-full px-3"
//                             value={
//                               item.closing_stock == undefined
//                                 ? ""
//                                 : item.closing_stock
//                             }
//                             onChange={(e) => {
//                               setItems((prev) => {
//                                 const newItems = prev.map((prevItem) => {
//                                   if (prevItem.id === item.id) {
//                                     return {
//                                       ...prevItem,
//                                       closing_stock: e.target.value
//                                         ? Number(e.target.value)
//                                         : e.target.value,
//                                     };
//                                   }
//                                   return prevItem;
//                                 });
//                                 return newItems;
//                               });
//                             }}
//                           />
//                           <span className="capitalize absolute right-3 text-[13px] text-slate-500 top-[25%]">
//                             {truncateString(item?.item?.unit?.name, 5)}
//                           </span>
//                         </div>
//                       </td>
//                       <td className="border-r border-blue-400 min-w-[80px] bg-blue-100/50  border-b text-sm text-left w-[150px] px-3">
//                         <span className="capitalize truncate text-slate-500 text-[13px] font-normal">
//                           {item?.item?.unit?.base_unit?.name ? (
//                             <>
//                               {Number(
//                                 item?.item?.unit?.base_unit?.conversion_factor *
//                                   item?.closing_stock
//                               )
//                                 .toFixed(1)
//                                 .replace(/\.0$/, "")}{" "}
//                               {item?.item?.unit?.base_unit?.name}
//                             </>
//                           ) : (
//                             "---"
//                           )}
//                         </span>
//                       </td>

//                       {item?.item?.sold_as_shorts && (
//                         <td className="border-r bg-orange-100/50 border-orange-500 min-w-[100px]  border-b text-sm">
//                           <>
//                             <div className="relative">
//                               <GramsInput
//                                 setItems={setItems}
//                                 item={item}
//                                 bottleCountKey={`used_stock_bottle_count`}
//                                 stockKey={`used_stock`}
//                                 weightKey={`used_stock_weight`}
//                                 inputClassName="!border-orange-500 !text-orange-500"
//                                 readonly={readonly}
//                               />
//                               <span className="absolute right-3 text-[13px] text-slate-500 top-[25%]">
//                                 mg
//                               </span>
//                             </div>
//                           </>
//                         </td>
//                       )}
//                       <td
//                         colSpan={item?.item?.sold_as_shorts ? 1 : 2}
//                         className="border-r border-orange-400 border-b bg-orange-100/50 min-w-[100px] text-sm"
//                       >
//                         <div className="relative">
//                           <input
//                             placeholder="---"
//                             type="number"
//                             disabled={readonly || item?.item?.sold_as_shorts}
//                             className="h-full border-[1.5px] border-orange-500 bg-transparent py-2 text-orange-500 w-full px-3"
//                             value={
//                               item.used_stock == undefined
//                                 ? ""
//                                 : item.used_stock
//                             }
//                             onChange={(e) => {
//                               setItems((prev) => {
//                                 const newItems = prev.map((prevItem) => {
//                                   if (prevItem.id === item.id) {
//                                     return {
//                                       ...prevItem,
//                                       used_stock: e.target.value
//                                         ? Number(e.target.value)
//                                         : e.target.value,
//                                     };
//                                   }
//                                   return prevItem;
//                                 });
//                                 return newItems;
//                               });
//                             }}
//                           />
//                           <span className="capitalize absolute right-3 text-[13px] text-slate-500 top-[25%]">
//                             {truncateString(item?.item?.unit?.name, 5)}
//                           </span>
//                         </div>
//                       </td>
//                       <td className="border-r border-orange-400 border-b bg-orange-100/20 min-w-[200px] text-sm">
//                         <div className="relative">
//                           <input
//                             placeholder="Notes"
//                             type="text"
//                             disabled={readonly}
//                             className="h-full border-[1.5px] text-[13px] border-orange-500 bg-transparent py-2 text-slate-500 w-full px-3"
//                             value={item.used_stock_notes}
//                             onChange={(e) => {
//                               setItems((prev) => {
//                                 const newItems = prev.map((prevItem) => {
//                                   if (prevItem.id === item.id) {
//                                     return {
//                                       ...prevItem,
//                                       used_stock_notes: e.target.value,
//                                     };
//                                   }
//                                   return prevItem;
//                                 });
//                                 return newItems;
//                               });
//                             }}
//                           />
//                         </div>
//                       </td>

//                       {(readonly ||
//                         canPerform("view_inventory_session_details")) && (
//                         <>
//                           {" "}
//                           <td className="border-r min-w-[150px]  border-b text-sm text-left w-[150px] px-3">
//                             <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                               {item?.current_stock_before_close || 0}{" "}
//                               {item?.item?.unit?.name}
//                             </span>
//                           </td>
//                           <td className="border-r min-w-[150px]  border-b text-sm text-left w-[150px] px-3">
//                             <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                               {item?.current_stock_after_close || 0}{" "}
//                               {item?.item?.unit?.name}
//                             </span>
//                           </td>
//                           <td className="border-r bg-red-50 min-w-[120px]  border-b text-sm text-left w-[120px] px-3">
//                             <span className="capitalize truncate text-red-600 text-[13px] font-medium">
//                               {item?.stock_out || 0} {item?.item?.unit?.name}
//                             </span>
//                           </td>
//                           <td className="border-r bg-red-50 min-w-[120px]  border-b text-sm text-left w-[120px] px-3">
//                             <span className="capitalize text-red-600 truncate text-[13px] font-medium">
//                               {item?.item?.unit?.base_unit?.name ? (
//                                 <>
//                                   {Number(
//                                     item?.item?.unit?.base_unit
//                                       ?.conversion_factor * item?.stock_out
//                                   )
//                                     .toFixed(1)
//                                     .replace(/\.0$/, "")}{" "}
//                                   {item?.item?.unit?.base_unit?.name}
//                                 </>
//                               ) : (
//                                 "---"
//                               )}
//                             </span>
//                           </td>
//                           <td className="border-r  min-w-[150px]  border-b text-sm text-left w-[150px] px-3">
//                             <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                               {(item?.totalSales || 0)?.toLocaleString() || 0}{" "}
//                               FRW
//                             </span>
//                           </td>
//                           <td className="border-r min-w-[150px]  border-b text-sm text-left w-[150px] px-3">
//                             <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                               {item.pos_sales} {item?.item?.unit?.name}
//                             </span>
//                           </td>
//                           <td className="border-r min-w-[150px]  border-b text-sm text-left w-[150px] px-3">
//                             <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                               {item.pos_sales_amount.toLocaleString()} FRW
//                             </span>
//                           </td>
//                           <td className="border-r min-w-[200px]  border-b text-sm text-left w-[150px] px-3">
//                             <div className="gap-3 flex w-full justify-between items-center">
//                               <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                                 {item.offline_sales.toLocaleString()}{" "}
//                                 {item?.item?.unit?.name}
//                               </span>
//                               {/* {item.offline_sales > 0 && !readonly ? (
//                             <PostButton
//                               session={session}
//                               item={item}
//                               refetch={refetch}
//                             />
//                           ) : null} */}
//                             </div>
//                           </td>
//                           <td className="border-r min-w-[150px]  border-b text-sm text-right- w-[150px] px-3">
//                             <span className="capitalize truncate text-slate-600 text-[13px] font-medium">
//                               {item?.offline_sales_amount?.toLocaleString() ||
//                                 0}{" "}
//                               FRW
//                             </span>
//                           </td>
//                           <td className="border-r border-b min-w-[150px] text-sm">
//                             <div className="relative">
//                               <input
//                                 placeholder="---"
//                                 type="number"
//                                 disabled={readonly}
//                                 className="h-full py-2 w-full px-3"
//                                 value={
//                                   item.selling_price == undefined
//                                     ? ""
//                                     : item.selling_price
//                                 }
//                                 onChange={(e) => {
//                                   setItems((prev) => {
//                                     const newItems = prev.map((prevItem) => {
//                                       if (prevItem.id === item.id) {
//                                         return {
//                                           ...prevItem,
//                                           selling_price: e.target.value
//                                             ? Number(e.target.value)
//                                             : e.target.value,
//                                         };
//                                       }
//                                       return prevItem;
//                                     });
//                                     return newItems;
//                                   });
//                                 }}
//                               />
//                               <span className="capitalize absolute right-3 text-[13px] text-slate-500 top-[25%]">
//                                 FRW
//                               </span>
//                             </div>
//                           </td>
//                         </>
//                       )}
//                     </tr>
//                   ))}
//                   {isLoading && (
//                     <tr>
//                       <td className="py-32" colSpan={10}>
//                         <div className="w-full h-full flex items-center justify-center">
//                           <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
//                         </div>
//                       </td>
//                     </tr>
//                   )}
//                   {!isLoading && !itemsToshows.length ? (
//                     <tr>
//                       <td className="py-32" colSpan={10}>
//                         <div className="w-full h-full flex text-sm text-slate-500 items-center justify-center">
//                           <span>No items found for the selected location.</span>
//                         </div>
//                       </td>
//                     </tr>
//                   ) : null}
//                   {!isLoading &&
//                   itemsToshows.length &&
//                   (readonly || canPerform("view_inventory_session_details")) ? (
//                     <tr className="">
//                       <td
//                         colSpan={17}
//                         className="border-r py-2 font-semibold text-primary  text-sm w-[150px] px-3"
//                       >
//                         Total
//                       </td>
//                       <td className="border-r py-2 text-primary font-semibold text-sm w-[150px] px-3">
//                         {(totals?.totalSales || 0).toLocaleString()} FRW
//                       </td>
//                       <td className="border-r py-2 text-primary font-semibold text-sm w-[150px] px-3"></td>
//                       <td className="border-r py-2 text-primary font-semibold text-sm w-[150px] px-3">
//                         {(totals?.total_pos_sales || 0).toLocaleString()} FRW
//                       </td>
//                       <td className="border-r py-2 text-primary font-semibold text-sm w-[150px] px-3"></td>

//                       <td className="border-r py-2 text-primary font-semibold text-sm w-[150px] px-3">
//                         {(totals?.total_offline_sales || 0).toLocaleString()}{" "}
//                         FRW
//                       </td>
//                     </tr>
//                   ) : null}
//                 </tbody>
//               </table>
//               <ScrollBar orientation="horizontal" />
//             </ScrollArea>
//           </div>
//         </div>
//       </div>

//       <BulkImport
//         open={bulkImportModal.isOpen}
//         setOpen={bulkImportModal.setisOpen}
//         name="units"
//         onComplete={() => {
//           refetch();
//           bulkImportModal.close();
//         }}
//         endPoint={`/inventory-sessions/${session?.id}/import`}
//         sample={items.map((e) => {
//           return {
//             item: e.item.name,
//             opening_stock: e.opening_stock,
//             closing_stock: e.closing_stock,
//             selling_price: e.selling_price,
//           };
//         })}
//         validate={handleValidateBulkImport}
//       />
//     </>
//   );
// }

// function GramsInput({
//   setItems,
//   item,
//   bottleCountKey,
//   stockKey,
//   weightKey,
//   inputClassName,
//   readonly,
// }: any) {
//   const [bottleCount, setBottleCount] = useState(item[bottleCountKey] || "");
//   const [weight, setWeight] = useState(item[weightKey] || "");

//   useEffect(() => {
//     setWeight(item[weightKey]);
//   }, [item[weightKey]]);

//   useEffect(() => {
//     setBottleCount(item[bottleCountKey]);
//   }, [item[bottleCountKey]]);

//   useEffect(() => {
//     if (bottleCount && !readonly) {
//       const weight_found = Number(weight);
//       const empty_bottle_weights =
//         item?.item?.empty_bottle_weight * Number(bottleCount);

//       const availableLiquid = weight_found - empty_bottle_weights;
//       const shots = Math.max(
//         0,
//         Math.round(availableLiquid / item?.item?.shot_weight)
//       );

//       setItems((prev) => {
//         const newItems = prev.map((prevItem) => {
//           if (prevItem.id === item.id) {
//             return {
//               ...prevItem,
//               [stockKey]: shots,
//               [weightKey]: weight,
//               [bottleCountKey]: bottleCount,
//             };
//           }
//           return prevItem;
//         });
//         return newItems;
//       });
//     }
//   }, [bottleCount, weight]);

//   return (
//     <div className="flex items-center w-[170px]-">
//       <input
//         placeholder="---"
//         type="number"
//         step="1"
//         disabled={readonly}
//         value={bottleCount}
//         onChange={(e) => setBottleCount(e.target.value)}
//         className={cn(
//           "h-full border-[1.5px] w-[70px] border-blue-500 bg-transparent text-blue-700 py-2 px-3",
//           inputClassName
//         )}
//       />
//       <input
//         placeholder="---"
//         type="number"
//         step="1"
//         disabled={!bottleCount || readonly}
//         className={cn(
//           "h-full border-[1.5px] border-blue-500 bg-transparent text-blue-500 py-2 w-[120px] px-3",
//           inputClassName
//         )}
//         value={weight}
//         onChange={(e) => setWeight(e.target.value)}
//       />{" "}
//     </div>
//   );
// }
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, FileDown, AlertCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import pocketbase from '@/lib/pocketbase';

const LeaveCell = ({ value, onChange, isEditable, className = "" }) => (
  <input
    type="number"
    min="0"
    value={value || ""}
    onChange={(e) => onChange(e.target.value)}
    disabled={!isEditable} // Disable input when not editable
    className={`w-full h-8 px-2 text-sm border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none text-center disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
  />
);

export default function ExcelStyleLeavePlan() {
  const [staffData, setStaffData] = useState([]);
  const [departments, setDepartments] = useState({}); // Store department names
  const [saving, setSaving] = useState(false);
  const [editable, setEditable] = useState(false); // Track edit mode
  const currentYear = new Date().getFullYear();
  const totalLeaveDaysPerYear = 18; // Default total leave days per year

  // Fetch all necessary data from PocketBase
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch departments
        const departmentRecords = await pocketbase.collection('departments').getFullList();
        const departmentMap = departmentRecords.reduce((acc, department) => {
          acc[department.id] = department.name; // Map department ID to name
          return acc;
        }, {});
        setDepartments(departmentMap);

        // Fetch active users
        const activeUsers = await pocketbase.collection('users').getFullList({
          filter: 'status = "Active"',
        });

        // Fetch LeavePlaneReport data
        const leavePlaneReports = await pocketbase.collection('LeavePlaneReport').getFullList();

        // Format staff data
        const formattedUsers = activeUsers.map(user => {
          // Find the user's LeavePlaneReport (if it exists)
          const userReport = leavePlaneReports.find(report => report.userId === user.id);

          // Initialize monthly leave data
          const months = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          const monthlyLeaveData = months.reduce((acc, month) => {
            acc[month] = userReport?.[month] || 0; // Use data from LeavePlaneReport if available
            return acc;
          }, {});

          // Calculate total leave days taken in the current year
          const totalLeaveTaken = Object.values(monthlyLeaveData).reduce((acc, days) => acc + (Number(days) || 0), 0);

          // Calculate balance
          const balance = totalLeaveDaysPerYear - totalLeaveTaken;

          return {
            id: user.id,
            name: user.name,
            departmentId: user.department, // Store department ID
            totalLeaveDays: totalLeaveDaysPerYear, // Default total leave days
            totalLeaveTaken,
            balance,
            ...monthlyLeaveData, // Populate monthly leave data
          };
        });

        setStaffData(formattedUsers);
      } catch (error) {
        toast.error('Failed to fetch data');
      }
    };

    fetchData();
  }, []);

  // Handle cell changes (for requesting leave)
  const handleCellChange = (staffId, month, value) => {
    setStaffData(prev => 
      prev.map(staff => {
        if (staff.id === staffId) {
          const requestedDays = parseInt(value) || 0;

          // Calculate new total leave taken
          const newMonthlyLeaveData = { ...staff, [month]: requestedDays };
          const newTotalLeaveTaken = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
            .reduce((acc, m) => acc + (Number(newMonthlyLeaveData[m]) || 0), 0);

          // Calculate new balance
          const newBalance = totalLeaveDaysPerYear - newTotalLeaveTaken;

          // Prevent over-requesting
          if (newBalance < 0) {
            toast.error('Cannot request more than available leave days');
            return staff; // Return unchanged staff data
          }

          return {
            ...staff,
            [month]: requestedDays,
            totalLeaveTaken: newTotalLeaveTaken,
            balance: newBalance,
          };
        }
        return staff;
      })
    );
  };

  // Save data to LeavePlaneReport table
  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        staffData.map(async (staff) => {
          // Prepare the data to save
          const dataToSave = {
            userId: staff.id,
            totalLeaveDays: staff.totalLeaveDays,
            totalLeaveTaken: staff.totalLeaveTaken,
            balance: staff.balance,
            april: staff.april || 0,
            may: staff.may || 0,
            june: staff.june || 0,
            july: staff.july || 0,
            august: staff.august || 0,
            september: staff.september || 0,
            october: staff.october || 0,
            november: staff.november || 0,
            december: staff.december || 0,
          };

          // Check if the record already exists
          const existingRecord = await pocketbase.collection('LeavePlaneReport').getFirstListItem(`userId="${staff.id}"`);

          if (existingRecord) {
            // Update the existing record
            await pocketbase.collection('LeavePlaneReport').update(existingRecord.id, dataToSave);
          } else {
            // Create a new record
            await pocketbase.collection('LeavePlaneReport').create(dataToSave);
          }
        })
      );
      toast.success('Leave plan saved successfully');
      setEditable(false); // Disable edit mode after saving
    } catch (error) {
      toast.error('Failed to save leave plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[95vw] mx-auto">
      <Card className="shadow-lg">
        <CardHeader className="bg-white border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-gray-800">
                DNR PARTNERS CPA
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Annual Staff Leave Plan {currentYear}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <FileDown className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button 
                size="sm" 
                onClick={() => setEditable(!editable)} // Toggle edit mode
              >
                <Edit className="w-4 h-4 mr-2" />
                {editable ? "Cancel Edit" : "Edit"}
              </Button>
              <Button 
                size="sm" 
                onClick={handleSave} 
                disabled={saving || !editable} // Disable save button when not in edit mode
              >
                {saving ? (
                  <>
                    <span className="animate-spin mr-2">⭘</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700 sticky left-0 bg-gray-100">Staff Name</th>
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Department</th>
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Total Leave Days</th>
                {['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(month => (
                  <th key={month} className="border px-4 py-2 text-sm font-semibold text-blue-700">
                    {month.charAt(0).toUpperCase() + month.slice(1)}-{currentYear}
                  </th>
                ))}
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Balance</th>
              </tr>
            </thead>
            <tbody>
              {staffData.map((staff, index) => {
                const isFirstRow = index === 0;
                const isLastRow = index === staffData.length - 1;
                
                return (
                  <tr 
                    key={staff.id}
                    className={`
                      hover:bg-blue-50/40 
                      ${isFirstRow ? 'border-t-2 border-t-gray-300' : ''}
                      ${isLastRow ? 'border-b-2 border-b-gray-300' : ''}
                    `}
                  >
                    <td className="border px-4 py-1 text-sm sticky left-0 bg-white">
                      {staff.name}
                    </td>
                    <td className="border px-4 py-1 text-sm text-center">
                      {departments[staff.departmentId] || "Unknown Department"}
                    </td>
                    <td className="border px-4 py-1 text-sm text-center bg-gray-50">
                      {staff.totalLeaveDays}
                    </td>
                    {['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(month => (
                      <td key={month} className="border px-0 py-1">
                        {editable ? (
                          <LeaveCell
                            value={staff[month] || 0}
                            onChange={(value) => handleCellChange(staff.id, month, value)}
                            isEditable={editable} // Editable only in edit mode
                          />
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={staff[month] || 0} // Display real data
                            disabled
                            className="w-full h-8 px-2 text-sm border-0 text-center bg-gray-50 text-gray-500"
                          />
                        )}
                      </td>
                    ))}
                    <td className="border px-4 py-1 text-sm font-medium text-center bg-gray-50">
                      {staff.balance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-gray-50 border-t">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-1">Important Notes:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Each staff member has a total of 18 leave days per year.</li>
                <li>Leave requests cannot exceed the available balance.</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}