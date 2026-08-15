"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-elev-1 hover:brightness-110",
        secondary:
          "bg-surface-3 text-foreground border border-border hover:bg-surface-2",
        ghost: "text-muted-foreground hover:text-foreground hover:bg-surface-3/70",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-surface-3/60",
        destructive: "bg-critical text-white hover:brightness-110",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-7.5 px-2.5 text-xs h-8",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
