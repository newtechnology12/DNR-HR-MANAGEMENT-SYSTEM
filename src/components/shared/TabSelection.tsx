import { ScrollArea } from "@radix-ui/react-scroll-area";
import { ScrollBar } from "../ui/scroll-area";
import { cn } from "@/utils";
import { PropsWithChildren } from "react";
import { TabsRoot, TabsTrigger, TabsList } from "./Tabs";

export default function TabSelection({
  handleStatus,
  status,
  options,
  whichOne,
  children,
}: PropsWithChildren<{
  handleStatus;
  options: string[];
  status: string;
  whichOne: string;
}>) {
  return (
    <>
      <TabsRoot defaultValue="0" className="w-full" value={status}>
        <ScrollArea className="w-full whitespace-nowrap overflow-auto">
          {whichOne === "display" && (
            <>
              <TabsList className="flex bg-ims-card border-t items-center border-b justify-around w-full flex-wrap sm:flex-nowrap">
                {options.map((e, i) => {
                  return (
                    <TabsTrigger
                      value={e}
                      key={i}
                      className={cn(
                        "cursor-pointer px-4 capitalize !text-base !pt-2 text-center relative w-full- text-ims-body text-t-small sm:text-sm py-3 font-medium "
                      )}
                      onClick={() => {
                        handleStatus(e);
                      }}
                    >
                      {status === e && (
                        <div
                          className={cn(
                            "h-[3px] left-0 rounded-t-md absolute bottom-0 w-full"
                          )}
                        ></div>
                      )}
                      <span className="text-sm py-1"> {e} (12)</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {children}
            </>
          )}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TabsRoot>
    </>
  );
}
