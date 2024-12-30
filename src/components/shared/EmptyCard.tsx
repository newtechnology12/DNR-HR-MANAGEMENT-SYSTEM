export default function EmptyCard() {
  return (
    <div className="flex px-4 text-center items-center py-24 justify-center gap-2 flex-col max-w-sm mx-auto">
      <img className="h-20 w-20" src="/images/dish.png" alt="" />
      <h4 className="font-semibold mt-4">No Order Items Found</h4>
      <p className="text-[15px] max-w-sm text-slate-500 w-full text-wrap">
        The Food menu items you are looking are not available.Try again later or
        clear the filters.
      </p>
    </div>
  );
}
