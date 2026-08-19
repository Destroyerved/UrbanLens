"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["light", "dark", "dim"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      {/* Honour the reader's OS motion setting across every motion component.
          The mode rail floats on an infinite transform, so without this the
          primary navigation is never at rest — awkward with a vestibular
          disorder, and impossible for tooling to treat as a settled target. */}
      <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "glass-strong !rounded-xl !text-foreground",
            style: { zIndex: 60 },
          }}
        />
      </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
