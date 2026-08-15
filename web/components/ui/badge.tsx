import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "ul-chip inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-muted-foreground border border-border",
        good: "bg-good/10 text-good border border-good/25",
        moderate: "bg-moderate/10 text-moderate border border-moderate/25",
        warning: "bg-warning/10 text-warning border border-warning/25",
        critical: "bg-critical/10 text-critical border border-critical/25",
        gov: "bg-gov/10 text-gov border border-gov/25",
        accent: "bg-accent/10 text-accent border border-accent/25",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
