export default function ErrorCard() {
  return (
    <div className="flex px-4 text-center items-center py-24 justify-center gap-2 flex-col max-w-sm mx-auto">
      <img className="h-20 w-20" src="/images/alert.png" alt="" />
      <h4 className="font-semibold text-white mt-4">Something went wrong</h4>
      <p className="text-[15px] max-w-sm text-slate-400 leading-7 text-wrap">
        Please try to see if you can refresh the page and see it everything will
        be ok !!
      </p>
    </div>
  );
}
