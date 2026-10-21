/**
 * Buttons: primary navy (one per page or section), secondary white with a border, danger red
 * (delete / reject, always behind a confirmation), link blue. 40px high, icon + text, verb first.
 * Icon-only buttons must have an aria-label.
 */
import * as React from "react";
import { Link, LinkProps } from "react-router-dom";
import { Loader2, LucideIcon } from "lucide-react";
import { cn } from "@/utils";

export type ButtonVariant = "primary" | "secondary" | "danger" | "link" | "ghost";
export type ButtonSize = "md" | "sm" | "icon" | "icon-sm";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "rounded-control bg-ims-primary text-white hover:bg-ims-primary-hover",
  secondary: "rounded-control border border-ims-field bg-ims-card text-ims-text hover:bg-ims-subtle",
  danger: "rounded-control bg-ims-danger text-white hover:bg-ims-danger-hover",
  link: "rounded-sm px-0 text-ims-link underline-offset-4 hover:text-ims-primary hover:underline",
  ghost: "rounded-control text-ims-muted hover:bg-ims-subtle hover:text-ims-text",
};

const SIZE: Record<ButtonSize, string> = {
  md: "h-button px-4 text-[14px]",
  sm: "h-[34px] px-3 text-[13px]",
  icon: "h-button w-10 text-[14px]",
  "icon-sm": "h-[34px] w-[34px] text-[13px]",
};

export function buttonClass({ variant = "secondary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(BASE, VARIANT[variant], variant === "link" ? "h-auto text-[14px]" : SIZE[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading, className, children, type = "button", disabled, ...props },
  ref
) {
  if (import.meta.env.DEV && (size === "icon" || size === "icon-sm") && !props["aria-label"] && !props.title) {
    console.warn("ims/Button: icon-only buttons need an aria-label");
  }
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass({ variant, size, className })} {...props}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : Icon ? <Icon size={16} aria-hidden /> : null}
      {children}
    </button>
  );
});

/** A react-router link that looks like a button. */
export function ButtonLink({ variant = "secondary", size = "md", icon: Icon, className, children, ...props }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ButtonProps["icon"] }) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...props}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </Link>
  );
}
