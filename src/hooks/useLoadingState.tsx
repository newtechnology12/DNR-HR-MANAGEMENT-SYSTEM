import { useState } from "react";

export default function useLoadingState() {
  const [isLoading, setIsLoading] = useState(false);
  const start = () => setIsLoading(true);
  const stop = () => setIsLoading(false);
  return { start, stop, isLoading };
}
