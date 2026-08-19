"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CornerDownLeft, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Where should Ahmedabad build a new hospital?",
  "Show underserved areas near government land",
  "Which wards face infrastructure stress by 2030?",
  "Show agricultural-to-residential conversion",
  "Why did GJ-AHD-1028 rank first?",
];

/** Minimal rich-text: **bold**, bullet lines, line breaks. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        const content = parts.map((p, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="font-bold text-foreground">
              {p}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          )
        );
        const isBullet = line.startsWith("•") || line.startsWith("⚠");
        return (
          <div key={i} className={cn(isBullet && "pl-1.5", line === "" && "h-2")}>
            {content}
          </div>
        );
      })}
    </>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
      <span className="ml-1.5 text-[10.5px] font-medium text-muted-foreground">
        Running spatial analysis…
      </span>
    </div>
  );
}

export default function CopilotDrawer() {
  const setOpen = useApp((s) => s.setCopilotOpen);
  const messages = useApp((s) => s.copilotMessages);
  const busy = useApp((s) => s.copilotBusy);
  const sendCopilot = useApp((s) => s.sendCopilot);
  const applyAction = useApp((s) => s.applyAction);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    void sendCopilot(q);
  };

  return (
    <motion.aside
      // Stable hook for scripts/verify-ui.mjs — the parcel drawer is also an
      // <aside>, and parcel ids appear in the panel behind, so assertions
      // must scope to the copilot rather than the page.
      data-copilot=""
      key="copilot-drawer"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="glass-strong pointer-events-auto absolute bottom-5 right-4 top-[76px] z-[30] flex w-[336px] flex-col max-h-[calc(100vh-96px)] overflow-hidden rounded-[26px] shadow-elev-3 backdrop-blur-2xl border border-white/20 dark:border-white/10"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/80 bg-surface-2/50 px-4 py-3 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-accent/20 ring-1 ring-accent/40 shadow-sm">
            <Sparkles size={14} className="text-accent" />
          </div>
          <div>
            <div className="text-[13.5px] font-bold text-foreground leading-tight">AI Copilot</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              Natural-language GIS assistant
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close copilot"
          className="grid h-7 w-7 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-surface-3 hover:text-foreground active:scale-95 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="panel-scroll flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed shadow-sm",
                m.role === "user"
                  ? "rounded-br-sm bg-accent text-accent-foreground font-semibold shadow-md shadow-accent/20"
                  : "glass-card rounded-bl-sm text-foreground/90 font-normal"
              )}
            >
              {m.thinking ? <ThinkingDots /> : <Rich text={m.text} />}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {m.actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => {
                        applyAction(a.action);
                        toast(`Copilot: ${a.label}`);
                      }}
                      className="glass rounded-xl bg-accent/20 px-2.5 py-1 text-[10.5px] font-bold text-accent ring-1 ring-accent/40 shadow-xs transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {messages.length <= 1 && (
          <div className="space-y-1.5 pt-1">
            <div className="label-caps font-bold text-[10px] text-muted-foreground uppercase tracking-wider">Try asking</div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="glass-card block w-full rounded-2xl px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground transition-all hover:scale-[1.01] hover:border-accent/40 hover:text-foreground cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-border/80 bg-surface-2/50 p-3 backdrop-blur-md shrink-0"
      >
        <div className="glass flex items-center gap-2 rounded-2xl px-3 focus-within:ring-1 focus-within:ring-accent/60 bg-white/10 dark:bg-white/[0.04]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about growth, gaps, sites, parcels…"
            className="h-10 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/70 text-foreground"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="grid h-7 w-7 place-items-center rounded-xl bg-accent text-accent-foreground shadow-sm transition-all hover:scale-105 active:scale-90 disabled:opacity-40 cursor-pointer shrink-0"
          >
            <CornerDownLeft size={13} />
          </button>
        </div>
      </form>
    </motion.aside>
  );
}
