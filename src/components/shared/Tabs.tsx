import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/utils";

const TabsRoot = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center bg-muted text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "justify-center whitespace-nowrap gap-0.5 text-xs px-3 py-1 flex-wrap sm:flex-nowrap sm:px-6 sm:py-2 sm:text-base text-slate-700 ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50  data-[state=active]:text-white h-full flex items-center sm:gap-2 rounded-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { TabsRoot, TabsList, TabsTrigger, TabsContent };

export default function Tabs({
  tabsTriggers,
  tabsContents,
}: {
  tabsTriggers: React.ReactElement<{ id: string }>[];
  tabsContents: React.ReactElement<{ id: string }>[];
}) {
  return (
    <TabsRoot defaultValue="0" className="w-full">
      <div className="flex flex-col items-center sticky sm:top-4 top-0">
        <TabsList className="bg-white rounded-sm w-fit px-3 py-2.5 border">
          {tabsTriggers.map((value, idx) => {
            return (
              <TabsTrigger
                key={idx}
                value={idx.toString()}
                className={cn({
                  "data-[state=active]:bg-cyan-500": idx === 0,
                  "data-[state=active]:bg-orange-500": idx === 1,
                  "data-[state=active]:bg-blue-500": idx === 2,
                  "data-[state=active]:bg-primary": idx === 3,
                  "data-[state=active]:bg-red-500": idx === 4,
                })}
              >
                {value}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <div className="overflow-auto pb-32 h-screen">
        {tabsContents.map((value, idx) => {
          return (
            <TabsContent
              key={idx}
              value={idx.toString()}
              className="overflow-auto mt-10"
            >
              {value}
            </TabsContent>
          );
        })}
      </div>
    </TabsRoot>
  );
}
