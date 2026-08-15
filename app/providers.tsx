"use client";

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
    </ThemeProvider>
  );
}
