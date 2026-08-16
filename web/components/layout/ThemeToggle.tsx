"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export type Theme = "light" | "dark" | "dim";

interface ThemeSwitcherProps {
  defaultValue?: Theme;
  value?: Theme;
  onValueChange?: (theme: Theme) => void;
  className?: string;
}

const themeOptions: { value: Theme; label: string; cOption: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light Mode",
    cOption: "1",
    icon: (
      <svg
        className="switcher__icon"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 36 36"
      >
        <path
          fill="var(--c)"
          fillRule="evenodd"
          d="M18 12a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
          clipRule="evenodd"
        />
        <path
          fill="var(--c)"
          d="M17 6.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 7.742a1 1 0 1 1 1.618 1.176L24.1 11.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 13.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM29.722 20.795a1 1 0 0 1-.619 1.902l-2.853-.927a1 1 0 1 1 .618-1.902l2.854.927ZM25.862 27.159a1 1 0 0 1-1.618 1.175l-1.763-2.427a1 1 0 1 1 1.618-1.175l1.763 2.427ZM19 30.038a1 1 0 0 1-2 0v-3a1 1 0 1 1 2 0v3ZM11.755 28.334a1 1 0 0 1-1.618-1.175l1.764-2.427a1 1 0 1 1 1.618 1.175l-1.764 2.427ZM6.896 22.697a1 1 0 1 1-.618-1.902l2.853-.927a1 1 0 1 1 .618 1.902l-2.853.927ZM6.278 15.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 8.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark Mode",
    cOption: "2",
    icon: (
      <svg
        className="switcher__icon"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 36 36"
      >
        <path
          fill="var(--c)"
          d="M12.5 8.473a10.968 10.968 0 0 1 8.785-.97 7.435 7.435 0 0 0-3.737 4.672l-.09.373A7.454 7.454 0 0 0 28.732 20.4a10.97 10.97 0 0 1-5.232 7.125l-.497.27c-5.014 2.566-11.175.916-14.234-3.813l-.295-.483C5.53 18.403 7.13 11.93 12.017 8.77l.483-.297Zm4.234.616a8.946 8.946 0 0 0-2.805.883l-.429.234A9 9 0 0 0 10.206 22.5l.241.395A9 9 0 0 0 22.5 25.794l.416-.255a8.94 8.94 0 0 0 2.167-1.99 9.433 9.433 0 0 1-2.782-.313c-5.043-1.352-8.036-6.535-6.686-11.578l.147-.491c.242-.745.573-1.44.972-2.078Z"
        />
      </svg>
    ),
  },
  {
    value: "dim",
    label: "Dim Mode",
    cOption: "3",
    icon: (
      <svg
        className="switcher__icon"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 36 36"
      >
        <path
          fill="var(--c)"
          d="M5 21a1 1 0 0 1 1-1h24a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1ZM12 25a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H13a1 1 0 0 1-1-1ZM15 29a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1ZM18 13a6 6 0 0 1 5.915 7h-2.041A4.005 4.005 0 0 0 18 15a4 4 0 0 0-3.874 5h-2.041A6 6 0 0 1 18 13ZM17 7.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 8.742a1 1 0 1 1 1.618 1.176L24.1 12.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 14.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM6.278 16.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 9.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
        />
      </svg>
    ),
  },
];

export function ThemeSwitcher({
  value,
  onValueChange,
  className,
}: ThemeSwitcherProps) {
  const activeValue = value ?? "dark";

  return (
    <TooltipProvider delayDuration={150}>
      <fieldset
        className={cn("switcher", className)}
        data-previous={themeOptions.find((o) => o.value === activeValue)?.cOption}
      >
        <legend className="switcher__legend">Choose theme</legend>

        {themeOptions.map((option) => {
          const isActive = activeValue === option.value;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <label
                  className="switcher__option"
                  data-value={option.value}
                  data-active={isActive ? "true" : "false"}
                >
                  <input
                    className="switcher__input"
                    type="radio"
                    name="theme"
                    value={option.value}
                    c-option={option.cOption}
                    checked={isActive}
                    onChange={() => onValueChange?.(option.value)}
                    aria-label={option.label}
                  />

                  {/* Animated sliding liquid glass pill background */}
                  {isActive && (
                    <motion.span
                      layoutId="theme-switcher-pill"
                      className={cn(
                        "absolute inset-0 rounded-full border shadow-sm",
                        option.value === "light" &&
                          "border-amber-500/50 bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.35)]",
                        option.value === "dark" &&
                          "border-cyan-400/50 bg-cyan-400/20 shadow-[0_0_12px_rgba(56,189,248,0.35)]",
                        option.value === "dim" &&
                          "border-purple-400/50 bg-purple-400/20 shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                      )}
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    />
                  )}

                  <span className="relative z-10 flex items-center justify-center">
                    {option.icon}
                  </span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {option.label}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Soft-focus filters for the switcher glass.
            These carried an feImage displacement map embedded as a base64 WebP,
            but the payload was truncated — 16,285 base64 characters, which is
            1 mod 4 and so cannot be decoded at any padding. The browser rejected
            the whole data URI (ERR_INVALID_URL on every page load) and feImage
            produced nothing, leaving feDisplacementMap with no map to sample:
            the liquid distortion has never actually rendered. Removed rather
            than left erroring, which also drops ~32 KB of dead payload. To bring
            the effect back, re-export the displacement map and reinstate the
            feImage + feDisplacementMap pair. */}
        <div className="switcher__filter">
          <svg>
            <filter id="switcher" primitiveUnits="objectBoundingBox">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="0.04"
                result="blur"
              />
            </filter>

            <filter id="toggler" primitiveUnits="objectBoundingBox">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="0.01"
                result="blur"
              />
            </filter>
          </svg>
        </div>
      </fieldset>
    </TooltipProvider>
  );
}

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme: Theme = (theme === "light" || theme === "dim" || theme === "dark")
    ? (theme as Theme)
    : (resolvedTheme === "light" ? "light" : "dark");

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    if (newTheme === "light") {
      if (basemap === "dark") setBasemap("light");
    } else if (newTheme === "dim") {
      setBasemap("dark");
    } else {
      if (basemap === "light") setBasemap("satellite");
    }
  };

  if (!mounted) {
    return <div className="h-8 w-[96px] rounded-full border border-border/60 bg-surface-2/60" />;
  }

  return (
    <ThemeSwitcher
      value={activeTheme}
      onValueChange={handleThemeChange}
    />
  );
}
