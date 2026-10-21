import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils"

// Colours of the status glossary (src/components/ims/status.ts).
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-[3px] text-[12.5px] font-semibold leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-ims-focus focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-ims-info-bg text-ims-info",
        secondary: "bg-ims-neutral-bg text-ims-neutral",
        info: "bg-ims-info-bg text-ims-info",
        success: "bg-ims-success-bg text-ims-success",
        warning: "bg-ims-warning-bg text-ims-warning",
        destructive: "bg-ims-danger-bg text-ims-danger",
        danger: "bg-ims-danger-bg text-ims-danger",
        outline: "bg-ims-card text-ims-body ring-1 ring-inset ring-ims-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
