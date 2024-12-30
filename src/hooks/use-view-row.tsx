import { useState } from "react";

export default function useViewRow() {
  const [row, setRow] = useState(undefined);
  const view = (e) => setRow(e);
  const isOpen = Boolean(row);
  const close = () => setRow(undefined);
  const setOpen = (e) => !e && setRow(undefined);
  return { isOpen, view, close, row, setOpen };
}
