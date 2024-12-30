import { useState } from "react";

export default function useEditRow() {
  const [row, setRow] = useState(undefined);
  const edit = (e) => setRow(e);
  const isOpen = Boolean(row);
  const close = () => setRow(undefined);
  const setOpen = (e) => !e && setRow(undefined);
  return { isOpen, edit, close, row, setOpen };
}
