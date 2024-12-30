import { Skeleton } from "../ui/skeleton";

export default function OrderCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array(count)
        .fill("11")
        .map((_, idx) => {
          return (
            <div
              key={idx}
              className="bg-white pt-2 px-3 pb-0.5 h-fit border border-slate-200 hover:bg-white/50 rounded-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-12 w-12 bg-slate-200 rounded-[4px]" />
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-3 w-20 bg-slate-200" />
                    <Skeleton className="h-2 w-16 bg-slate-200" />
                  </div>
                </div>
                <div className="flex flex-col items-start">
                  <Skeleton className="h-5 w-20 bg-slate-200 mb-1 rounded-full" />
                  <Skeleton className="h-2 w-16 bg-slate-200 ml-auto" />
                </div>
              </div>

              <div className="flex mt-1 items-center justify-between py-3">
                <Skeleton className="h-2 w-24 bg-slate-200" />
                <Skeleton className="h-2 w-16 bg-slate-200" />
              </div>
              <div className="w-full h-[1px] bg-slate-200"></div>
              <div className="pt-1">
                <div className="flex flex-col gap-4 mt-2 h-[25vh] overflow-auto">
                  {Array(4)
                    .fill("")
                    .map((_, idx) => (
                      <div
                        className="flex justify-between items-start border-b pb-4"
                        key={idx}
                      >
                        <div className="flex flex-col items-start">
                          <Skeleton className="h-2 w-36 bg-slate-200 mb-2" />
                          <div className="flex items-start gap-2 mt-2">
                            <span className="text-xs leading-none underline text-slate-600 w-14">
                              <Skeleton className="h-2 w-12 bg-slate-200" />
                            </span>
                            <div className="flex items-center gap-2 flex-wrap flex-1">
                              {Array(5)
                                .fill("")
                                .map((_, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md text-xs px-2.5 pt-0.5 pb-1 capitalize text-slate-600 bg-slate-200"
                                  >
                                    <Skeleton className="h-2 w-8 bg-slate-200" />
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div className="flex items-start gap-2 mt-2">
                            <span className="text-xs leading-none underline text-slate-600 w-14">
                              <Skeleton className="h-2 w-12 bg-slate-200" />
                            </span>
                            <div className="flex items-center gap-2 flex-wrap flex-1">
                              {Array(3)
                                .fill("")
                                .map((_, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md text-xs px-2.5 pt-0.5 pb-1 capitalize text-slate-600 bg-slate-200"
                                  >
                                    <Skeleton className="h-2 w-12 bg-slate-200 rounded-sm" />
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                        <Skeleton className="h-4 w-1 bg-slate-200" />
                      </div>
                    ))}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Skeleton className="h-10 w-full mb-2" />
                </div>
              </div>
            </div>
          );
        })}
    </>
  );
}
