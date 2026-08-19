"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function PanelShell({
  title,
  caption,
  children,
  footer,
  className,
  onClose,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  const setPanelOpen = useApp((s) => s.setPanelOpen);
  const handleClose = onClose ?? (() => setPanelOpen(false));

  return (
    <motion.div
      // Stable hook for scripts/verify-ui.mjs: the panel is the one region
      // every mode swaps, so assertions can find it without matching on
      // presentation classes the design is free to change.
      data-panel={title}
      data-glow
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.175, 0.885, 0.32, 1.2] }}
      className={cn(
        "glass-strong flex max-h-[calc(100vh-96px)] flex-col overflow-hidden rounded-3xl shadow-elev-3 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-white/15 dark:bg-white/[0.05] px-4 py-3 backdrop-blur-md">
        <div className="min-w-0 flex-1 pr-2">
          <div className="text-[14px] font-bold tracking-tight text-foreground truncate">{title}</div>
          {caption && (
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">{caption}</div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Hide panel"
          title="Hide panel"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-white/20 dark:hover:bg-white/10 hover:text-foreground active:scale-95 cursor-pointer"
        >
          <X size={15} />
        </button>
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
    <div data-glow className="glass-glow-card rounded-2xl border-dashed border-border/90 px-4 py-6 text-center">
      <div className="text-[12.5px] font-bold text-foreground">{title}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
