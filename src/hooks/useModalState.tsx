import { useState } from "react";

export default function useModalState() {
  const [isOpen, setisOpen] = useState(false);
  const open = () => setisOpen(true);
  const close = () => setisOpen(false);
  return { isOpen, open, close, setisOpen };
}
