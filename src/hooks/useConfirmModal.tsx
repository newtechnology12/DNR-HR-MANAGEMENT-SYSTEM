import { useState } from "react";

export default function useConfirmModal() {
  const [isOpen, setisOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [meta, setmeta] = useState<any>(undefined);

  const open = ({ meta }) => {
    setisOpen(true);
    setmeta(meta);
  };
  const close = () => {
    setmeta(undefined);
    setisOpen(false);
    setIsLoading(false);
  };
  return { isOpen, open, close, setisOpen, isLoading, setIsLoading, meta };
}
