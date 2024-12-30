import { useState } from "react";
import { Checkbox } from "../ui/checkbox";

export default function CheckBoxWord({
  checked = false,
  text,
}: {
  checked?: boolean;
  text: string;
}) {
  const [check, setCheck] = useState(checked);
  return (
    <div
      className="flex gap-2 items-center cursor-pointer"
      onClick={() => setCheck((prev) => !prev)}
    >
      <Checkbox
        className="text-white"
        defaultChecked={checked}
        checked={check}
      />
      <span className="m-0 p-0 leading-none mt-0.5 text-sm text-slate-600 capitalize">
        {text}
      </span>
    </div>
  );
}
