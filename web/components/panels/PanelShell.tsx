"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function PanelShell({
  title,
  caption,
  children,
  footer,
  className,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.175, 0.885, 0.32, 1.2] }}
      className={cn(
        "glass-strong flex max-h-full flex-col overflow-hidden rounded-3xl shadow-elev-3",
        className
      )}
    >
      <div className="border-b border-border/70 bg-white/15 dark:bg-white/[0.05] px-4 py-3 backdrop-blur-md">
        <div className="text-[14px] font-bold tracking-tight text-foreground">{title}</div>
        {caption && (
          <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{caption}</div>
        )}
      </div>
      <div className="panel-scroll flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
      {footer && (
        <div className="border-t border-border/70 bg-white/15 dark:bg-white/[0.05] px-4 py-2.5 backdrop-blur-md">
          {footer}
        </div>
      )}
    </motion.div>
  );
}

export function Section({
  label,
  children,
  className,
  right,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-caps font-bold text-foreground/80">{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function LoadingBlock({ label = "Running analysis…" }: { label?: string }) {
  return (
    <div className="space-y-2 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-2xl bg-white/20 dark:bg-white/10"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
      <div className="pt-1 text-center text-[11px] font-semibold text-muted-foreground">{label}</div>
    </div>
  );
}

export function EmptyBlock({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl border-dashed border-border/90 px-4 py-6 text-center">
      <div className="text-[12.5px] font-bold text-foreground">{title}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
