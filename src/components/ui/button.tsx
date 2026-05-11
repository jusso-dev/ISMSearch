import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)] disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-[oklch(0.982_0.008_158)] hover:bg-[var(--accent-strong)]",
        secondary:
          "border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
        ghost: "text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]",
        outline: "border border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-[var(--accent)]",
      },
      size: {
        default: "px-4 py-2",
        sm: "min-h-8 px-3 py-1 text-xs",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
