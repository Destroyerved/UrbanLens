"use client";

import {
  LayoutDashboard,
  TrendingUp,
  Hospital,
  Landmark,
  Target,
  FlaskConical,
  Sparkles,
  Search,
  SunMoon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { Mode } from "@/types";
import { useApp } from "@/lib/store";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";
import { cn } from "@/lib/utils";

type NavItem =
  | { kind: "mode"; id: Mode; label: string; icon: React.ReactNode }
  | { kind: "action"; id: string; label: string; icon: React.ReactNode; onClick: () => void }
  | { kind: "separator" };

export default function AppDock() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);
  const copilotOpen = useApp((s) => s.copilotOpen);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order = ["dark", "dim", "light"];
    const next = order[(order.indexOf(theme ?? "dark") + 1) % order.length];
    setTheme(next);
  };

  const themeLabel =
    theme === "light" ? "Light Mode" : theme === "dim" ? "Dim Mode" : "Dark Mode";

  const iconCls = "h-full w-full";

  const items: NavItem[] = [
    {
      kind: "mode",
      id: "overview",
      label: "Overview",
      icon: <LayoutDashboard className={iconCls} />,
    },
    {
      kind: "mode",
      id: "growth",
      label: "Growth",
      icon: <TrendingUp className={iconCls} />,
    },
    {
      kind: "mode",
      id: "infrastructure",
      label: "Infrastructure",
      icon: <Hospital className={iconCls} />,
    },
    {
      kind: "mode",
      id: "land",
      label: "Land Use",
      icon: <Landmark className={iconCls} />,
    },
    {
      kind: "mode",
      id: "sites",
      label: "Site Selection",
      icon: <Target className={iconCls} />,
    },
    {
      kind: "mode",
      id: "simulator",
      label: "Simulator",
      icon: <FlaskConical className={iconCls} />,
    },
    { kind: "separator" },
    {
      kind: "action",
      id: "search",
      label: "Search",
      icon: <Search className={iconCls} />,
      onClick: () => setPaletteOpen(true),
    },
    {
      kind: "action",
      id: "copilot",
      label: "Copilot",
      icon: <Sparkles className={iconCls} />,
      onClick: () => setCopilotOpen(!copilotOpen),
    },
    {
      kind: "action",
      id: "theme",
      label: themeLabel,
      icon: <SunMoon className={iconCls} />,
      onClick: cycleTheme,
    },
  ];

  return (
    <div className="pointer-events-auto flex items-end justify-center">
      <Dock
        magnification={58}
        distance={120}
        panelHeight={52}
        spring={{ mass: 0.1, stiffness: 180, damping: 14 }}
        className="glass shadow-elev-3 gap-1 px-3"
      >
        {items.map((item, idx) => {
          if (item.kind === "separator") {
            return (
              <div
                key={`sep-${idx}`}
                className="self-center h-6 w-px bg-white/25 dark:bg-white/15 mx-1"
              />
            );
          }

          const isActiveMode = item.kind === "mode" && mode === item.id;
          const isCopilotActive =
            item.kind === "action" && item.id === "copilot" && copilotOpen;
          const isActive = isActiveMode || isCopilotActive;

          const handleClick = () => {
            if (item.kind === "mode") setMode(item.id);
            else if (item.kind === "action") item.onClick();
          };

          return (
            <DockItem
              key={item.id}
              className={cn(
                "aspect-square rounded-2xl transition-all duration-200 cursor-pointer",
                isActive
                  ? "bg-accent shadow-md shadow-accent/40 ring-1 ring-accent/60"
                  : "bg-white/10 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10"
              )}
              onClick={handleClick}
            >
              <DockLabel>{item.label}</DockLabel>
              <DockIcon>
                <span
                  className={cn(
                    "transition-colors",
                    isActive ? "text-accent-foreground" : "text-foreground/70"
                  )}
                >
                  {item.icon}
                </span>
              </DockIcon>
            </DockItem>
          );
        })}
      </Dock>
    </div>
  );
}
