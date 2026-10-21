import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/utils";

// Same four kinds as the ims kit (src/components/ims/Button.tsx): primary navy, secondary white with a
// border, danger red, link blue. Older colour variants (info / success / warning) map onto them.
const PRIMARY = "bg-ims-primary text-white hover:bg-ims-primary-hover";
const SECONDARY = "border border-ims-field bg-ims-card text-ims-text hover:bg-ims-subtle";
const DANGER = "bg-ims-danger text-white hover:bg-ims-danger-hover";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-[14px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: PRIMARY,
        info: PRIMARY,
        success: PRIMARY,
        warning: SECONDARY,
        destructive: DANGER,
        danger: DANGER,
        outline: SECONDARY,
        secondary: SECONDARY,
        ghost: "text-ims-muted hover:bg-ims-subtle hover:text-ims-text",
        link: "h-auto px-0 text-ims-link underline-offset-4 hover:text-ims-primary hover:underline",
      },
      size: {
        default: "h-button px-4",
        sm: "h-[34px] px-3 text-[13px]",
        lg: "h-control px-5",
        icon: "h-button w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
