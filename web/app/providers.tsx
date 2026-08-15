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
      {/* `reducedMotion="user"` makes every motion component in the app honour
          the reader's OS setting: transforms and layout animations stop, while
          opacity and colour still animate so nothing appears or vanishes
          abruptly.

          This is not only a preference. The mode rail floats on a 7-second
          `repeat: Infinity` transform, which means the primary navigation is
          never at rest — awkward for anyone with a vestibular disorder, harder
          to hit with imprecise pointing, and impossible for assistive or
          automated tooling to treat as a settled target. AnimatedNumber already
          made this call for itself; this extends it to the whole tree. */}
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
