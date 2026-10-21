import * as React from "react";

import { cn } from "@/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[104px] w-full rounded-control border border-ims-field bg-ims-card px-3 py-2 text-[14px] text-ims-text transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ims-faint focus-visible:outline-none focus-visible:border-ims-focus focus-visible:ring-2 focus-visible:ring-ims-focus/25 disabled:cursor-not-allowed disabled:bg-ims-subtle disabled:text-ims-muted disabled:opacity-100 aria-[invalid=true]:border-ims-danger aria-[invalid=true]:ring-ims-danger/15 leading-relaxed",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
