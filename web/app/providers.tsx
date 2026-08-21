"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { warmEngine } from "@/lib/api";

import { GlobalSpotlight } from "@/components/ui/spotlight-card";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Begin waking a sleeping free backend while the user is still on the
    // landing experience. requestIdleCallback keeps this off the critical path.
    const start = () => warmEngine();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 900);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["light", "dark", "dim"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={250}>
        <GlobalSpotlight />
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "glass-strong !rounded-xl !text-foreground",
            style: { zIndex: 60 },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
