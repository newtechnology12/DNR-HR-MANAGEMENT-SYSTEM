import { useMediaQuery } from "@/hooks/use-media-query";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DialogTitle } from "@radix-ui/react-dialog";
import { Button } from "./ui/button";
import { useNavigate } from "react-router-dom";
import { Download, Printer } from "lucide-react";

export function KitchenModalPrint({ open, setOpen, ...props }: any) {
  const isDesktop = useMediaQuery("(min-width: 620px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px] !gap-[6px] !px-0">
          <DialogHeader>
            <DialogTitle>
              <span className="font-medium block pl-4">
                {" "}
                Kitchen
              </span>
            </DialogTitle>
          </DialogHeader>
          <Content {...props} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="!px-0">
        <div className="pb-3 pt-3">
          <Content {...props} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Content({ order, handlePay, isReciept, isKitchen }) {
  const navigate = useNavigate();
  console.log(isReciept);
  return (
    <div>
      <div className="px-4 pb-4">
        <table className="w-full">
          <tr>
            <td className="text-[13.5px] py-2  font-medium">Waiter:</td>
            <td className="text-[13.5px] py-2  text-slate-500 px-4 font-medium">
              Admistrator
            </td>
          </tr>
          {order.customer && (
            <tr>
              <td className="text-[13.5px] py-2  font-medium">Customer:</td>
              <td className="text-[13.5px] py-2  text-slate-500 px-4 font-medium">
                {order.customer.name}
              </td>
            </tr>
          )}
        </table>
        <div>
          <div className="w-full h-[1px] bg-slate-200"></div>
          <div className="pt-1">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  <th className="text-left uppercase py-2  text-slate-700 text-[12.5px] font-medium">
                    Name
                  </th>
                  <th className="text-left uppercase py-2  text-slate-700 text-[12.5px] font-medium">
                    quantity
                  </th>
                  <th className="text-right uppercase py-2  text-slate-700 text-[12.5px] font-medium">
                    price
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((e, i) => {
                  return (
                    <tr key={i}>
                      <td className="text-left py-2  text-slate-500 capitalize text-[12.5px] font-medium">
                        {e.expand.menu.name}
                      </td>
                      <td className="text-left py-2  text-slate-500 capitalize text-[12.5px] font-medium">
                        {e.quantity}
                      </td>
                      <td className="text-right py-2  text-slate-500 capitalize text-[12.5px] font-medium">
                        {(e.amount * e.quantity).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
         
                
          </div>
        </div>
      </div>
      <div className="flex px-3 border-t pt-3 items-center gap-2">
        {
          !isKitchen && 
            <Button
            onClick={() => navigate("/pos/orders/23?show_cart=yes")}
            className="text-primary gap-3 w-full"
            size="sm"
            variant="secondary"
          >
            <span>Download</span>
            <Download strokeWidth={3} size={14} className="text-sm" />
          </Button>
        }
       
        <Button onClick={() => window.print()} className="w-full" size="sm">
          <span>Print</span>
          <Printer strokeWidth={3} size={14} className="text-sm ml-3" />
        </Button>
      </div>
    </div>
  );
}
