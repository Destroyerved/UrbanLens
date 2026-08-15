"use client";

import dynamic from "next/dynamic";

// MapLibre is browser-only — the whole shell mounts client-side, no SSR.
const AppShell = dynamic(() => import("@/components/layout/AppShell"), {
  ssr: false,
  loading: () => (
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
  ),
});

export default function Home() {
  return <AppShell />;
}
