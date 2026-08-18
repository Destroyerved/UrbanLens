"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";

/**
 * The UrbanLens application.
 *
 * This is the dashboard that used to live at `/`; the cinematic landing page
 * now owns the root route and its "ENTER URBANLENS" call to action links here.
 */
export default function AppPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 ring-1 ring-accent/40">
            <div className="h-3.5 w-3.5 animate-pulse-soft rounded-sm bg-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">UrbanLens</div>
            <div className="text-[11px] text-muted-foreground">
              Loading spatial intelligence…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
