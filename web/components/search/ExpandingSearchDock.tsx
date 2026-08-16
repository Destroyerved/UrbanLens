"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Send,
  X,
  LayoutDashboard,
  TrendingUp,
  Hospital,
  Landmark,
  Target,
  FlaskConical,
  Sparkles,
  MapPin,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { PARCELS } from "@/data/parcels";
import { WARD_BY_ID } from "@/data/wards";
import { cn } from "@/lib/utils";

function useDebounce<T>(value: T, delay: number = 180): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  short?: string;
  end?: string;
  onSelect?: () => void;
}

interface SearchResult {
  actions: Action[];
}

export function ExpandingSearchDock({
  onSearch,
  placeholder = "Search parcels, wards, actions…",
  className,
}: {
  onSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const searchFocused = useApp((s) => s.searchFocused);
  const setSearchFocused = useApp((s) => s.setSearchFocused);

  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const setMode = useApp((s) => s.setMode);
  const selectParcel = useApp((s) => s.selectParcel);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);

  const debouncedQuery = useDebounce(query, 140);

  // Sync external searchFocused state
  useEffect(() => {
    if (!searchFocused) {
      setIsExpanded(false);
      setQuery("");
      setSelectedAction(null);
    }
  }, [searchFocused]);

  const defaultActions: Action[] = [
    {
      id: "mode-overview",
      label: "Overview & Signals",
      icon: <LayoutDashboard className="h-4 w-4 text-cyan-400" />,
      description: "City command center",
      short: "⌘1",
      end: "Mode",
      onSelect: () => setMode("overview"),
    },
    {
      id: "mode-growth",
      label: "Urban Growth 2030",
      icon: <TrendingUp className="h-4 w-4 text-emerald-400" />,
      description: "Built-up expansion forecast",
      short: "⌘2",
      end: "Mode",
      onSelect: () => setMode("growth"),
    },
    {
      id: "mode-infra",
      label: "Infrastructure Gaps",
      icon: <Hospital className="h-4 w-4 text-rose-400" />,
      description: "Healthcare & school deficits",
      short: "⌘3",
      end: "Mode",
      onSelect: () => setMode("infrastructure"),
    },
    {
      id: "mode-land",
      label: "Land & GLIS Intelligence",
      icon: <Landmark className="h-4 w-4 text-amber-400" />,
      description: "Cadastral boundaries & zoning",
      short: "⌘4",
      end: "Mode",
      onSelect: () => setMode("land"),
    },
    {
      id: "mode-sites",
      label: "Smart Site Selection",
      icon: <Target className="h-4 w-4 text-sky-400" />,
      description: "MCDA suitability ranking",
      short: "⌘5",
      end: "Mode",
      onSelect: () => setMode("sites"),
    },
    {
      id: "mode-sim",
      label: "Scenario Simulator",
      icon: <FlaskConical className="h-4 w-4 text-purple-400" />,
      description: "Simulate zoning interventions",
      short: "⌘6",
      end: "Mode",
      onSelect: () => setMode("simulator"),
    },
    {
      id: "copilot",
      label: "Ask AI Spatial Copilot",
      icon: <Sparkles className="h-4 w-4 text-cyan-300" />,
      description: "Natural language query",
      short: "⌘J",
      end: "AI",
      onSelect: () => setCopilotOpen(true),
    },
    {
      id: "parcel-flagship",
      label: "Parcel GJ-AHD-1028",
      icon: <MapPin className="h-4 w-4 text-teal-400" />,
      description: "Thaltej 8.2 Ha · 94% Suitability",
      short: "P",
      end: "Parcel",
      onSelect: () => {
        selectParcel("GJ-AHD-1028", true);
        setMode("sites");
      },
    },
  ];

  // Dynamic search across all actions, parcels, and commands
  useEffect(() => {
    if (!isExpanded) {
      setResult(null);
      return;
    }

    if (!debouncedQuery.trim()) {
      setResult({ actions: defaultActions });
      return;
    }

    const normalized = debouncedQuery.toLowerCase().trim();

    // Search static actions
    const matchedActions = defaultActions.filter((a) =>
      a.label.toLowerCase().includes(normalized) ||
      (a.description && a.description.toLowerCase().includes(normalized))
    );

    // Search live parcel data
    const matchedParcels: Action[] = PARCELS.filter((p) => {
      const wardName = WARD_BY_ID.get(p.wardId)?.name ?? "";
      return (
        p.id.toLowerCase().includes(normalized) ||
        wardName.toLowerCase().includes(normalized) ||
        p.landUse.toLowerCase().includes(normalized)
      );
    })
      .slice(0, 4)
      .map((p) => {
        const wardName = WARD_BY_ID.get(p.wardId)?.name ?? "";
        return {
          id: `p-${p.id}`,
          label: `Parcel ${p.id}`,
          icon: <MapPin className="h-4 w-4 text-accent" />,
          description: `${wardName} · ${p.areaHa} Ha · ${p.landUse}`,
          short: `W${p.wardId}`,
          end: "Parcel",
          onSelect: () => {
            selectParcel(p.id, true);
            setMode("land");
          },
        };
      });

    setResult({ actions: [...matchedActions, ...matchedParcels] });
  }, [debouncedQuery, isExpanded]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCollapse();
      }
    };
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K / Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleExpand();
      }
      if (e.key === "Escape" && isExpanded) {
        handleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  const handleExpand = () => {
    setIsExpanded(true);
    setSearchFocused(true);
    setSelectedAction(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    setSearchFocused(false);
    setQuery("");
    setSelectedAction(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (result && result.actions.length > 0) {
      const first = result.actions[0];
      first.onSelect?.();
      handleCollapse();
    } else if (onSearch && query) {
      onSearch(query);
      handleCollapse();
    } else {
      setPaletteOpen(true);
      handleCollapse();
    }
  };

  const container = {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: {
        height: { duration: 0.35, ease: "easeOut" },
        staggerChildren: 0.05,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: { duration: 0.22, ease: "easeIn" },
        opacity: { duration: 0.18 },
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 14 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.22, ease: "easeOut" },
    },
    exit: {
      opacity: 0,
      y: -8,
      transition: { duration: 0.15 },
    },
  };

  return (
    <div ref={containerRef} className={cn("relative flex items-center select-none", className)}>
      {/* Input container */}
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="collapsed-button"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            type="button"
            onClick={handleExpand}
            className="glass-card group flex h-8 w-[280px] shrink-0 items-center gap-2 rounded-full px-3 text-left transition-all hover:scale-[1.01] hover:border-accent/40 cursor-pointer overflow-hidden whitespace-nowrap backdrop-blur-xl"
            aria-label="Open search bar"
          >
            <Search size={13.5} className="text-muted-foreground shrink-0 transition-colors group-hover:text-accent" />
            <span className="flex-1 text-[12px] font-medium text-muted-foreground group-hover:text-foreground truncate whitespace-nowrap leading-none">
              {placeholder}
            </span>
            <kbd className="num shrink-0 rounded-full border border-border/70 bg-white/20 dark:bg-white/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">
              ⌘K
            </kbd>
          </motion.button>
        ) : (
          <motion.form
            key="expanded-form"
            initial={{ width: 280, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 280, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 340,
              damping: 28,
            }}
            onSubmit={handleSubmit}
            className="relative z-[70]"
          >
            <div className="glass-strong relative flex h-8 items-center gap-2 overflow-hidden rounded-full border border-accent/60 bg-white/20 dark:bg-white/10 shadow-[0_0_20px_rgba(56,189,248,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-2xl px-2.5 ring-2 ring-accent/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                autoFocus
                className="h-full flex-1 bg-transparent text-[12px] text-foreground font-medium outline-none placeholder:text-muted-foreground/80 truncate whitespace-nowrap pl-1"
              />

              {/* Dynamic Icon with popLayout animation */}
              <div className="flex items-center gap-1 shrink-0">
                <AnimatePresence mode="popLayout">
                  {query.length > 0 ? (
                    <motion.button
                      key="send"
                      type="submit"
                      initial={{ y: -12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 12, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="grid h-5 w-5 place-items-center rounded-full text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                      aria-label="Submit search"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </motion.button>
                  ) : (
                    <motion.div
                      key="search-icon"
                      initial={{ y: -12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 12, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="grid h-5 w-5 place-items-center text-muted-foreground"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  type="button"
                  onClick={handleCollapse}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-white/20 dark:hover:bg-white/10 hover:text-foreground transition-colors cursor-pointer ml-0.5"
                  aria-label="Close search"
                >
                  <X size={13} />
                </motion.button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Dropdown Suggestions with staggered spring physics & transparent glass styling */}
      <AnimatePresence>
        {isExpanded && result && result.actions.length > 0 && !selectedAction && (
          <motion.div
            key="suggestions-dropdown"
            variants={container}
            initial="hidden"
            animate="show"
            exit="exit"
            className="glass-strong absolute left-0 top-[42px] z-[80] w-[360px] overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35),0_0_25px_rgba(56,189,248,0.15)] backdrop-blur-3xl border border-white/30 dark:border-white/20 p-1.5 ring-1 ring-white/20 bg-white/25 dark:bg-black/35"
          >
            <motion.ul className="space-y-0.5 max-h-[300px] overflow-y-auto panel-scroll">
              {result.actions.map((action) => (
                <motion.li
                  key={action.id}
                  variants={item}
                  layout
                  onClick={() => {
                    setSelectedAction(action);
                    action.onSelect?.();
                    handleCollapse();
                  }}
                  className="group flex items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/30 dark:hover:bg-white/15 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="shrink-0 grid h-6 w-6 place-items-center rounded-lg bg-white/20 dark:bg-white/10 ring-1 ring-white/20 shadow-xs">
                      {action.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                        {action.label}
                      </div>
                      {action.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {action.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {action.short && (
                      <span className="num rounded-md bg-white/25 dark:bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        {action.short}
                      </span>
                    )}
                    {action.end && (
                      <span className="rounded-md bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent ring-1 ring-accent/40">
                        {action.end}
                      </span>
                    )}
                  </div>
                </motion.li>
              ))}
            </motion.ul>

            {/* Footer */}
            <div className="mt-1 flex items-center justify-end border-t border-border/70 px-2.5 pt-2 pb-1 text-[10px] text-muted-foreground">
              <span>ESC to close</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
