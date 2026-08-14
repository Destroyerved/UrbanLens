"use client";

import * as React from "react";
import { Sparkles, Send, Wrench, MapPin, ArrowRight } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import type { LayerKey, MapMarker, WardMetric } from "@/components/map/CityMap";
import { postJSON } from "@/lib/client";
import { cn, scoreColor } from "@/lib/ui";

interface CopilotItem { id?: string; label: string; sub?: string; score?: number; centroid?: [number, number] }
interface CopilotMap {
  highlightParcelIds?: string[];
  focus?: { lng: number; lat: number; zoom?: number };
  layers?: LayerKey[];
  wardMetric?: WardMetric;
  markers?: MapMarker[];
}
interface CopilotResponse { tool: string; answer: string; items?: CopilotItem[]; map?: CopilotMap }
interface Msg { role: "user" | "assistant"; text: string; tool?: string; items?: CopilotItem[] }

const SUGGESTIONS = [
  "Where should Ahmedabad build a new hospital?",
  "Which wards have poor access to parks?",
  "Find government land larger than 5 hectares",
  "Show rapid agricultural-to-residential conversion",
  "Which government parcels have the highest development potential?",
  "Where are zoning conflicts occurring?",
];

export default function CopilotPage() {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [mapState, setMapState] = React.useState<CopilotMap>({ layers: ["boundary", "roads", "parcels", "facilities"] });
  const [selected, setSelected] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const ask = async (query: string) => {
    if (!query.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text: query }]);
    setInput("");
    setBusy(true);
    try {
      const res = await postJSON<CopilotResponse>("/api/copilot/query", { query });
      setMessages((m) => [...m, { role: "assistant", text: res.answer, tool: res.tool, items: res.items }]);
      if (res.map)
        setMapState((prev) => ({
          layers: res.map!.layers ?? prev.layers,
          highlightParcelIds: res.map!.highlightParcelIds,
          focus: res.map!.focus,
          wardMetric: res.map!.wardMetric ?? "none",
          markers: res.map!.markers,
        }));
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong reaching the spatial engine." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex">
      {/* map */}
      <div className="relative flex-1 min-w-0">
        <MapView
          layers={mapState.layers ?? ["boundary", "roads", "parcels"]}
          parcelColorMode="development"
          wardMetric={mapState.wardMetric}
          highlightParcelIds={mapState.highlightParcelIds}
          markers={mapState.markers}
          focus={mapState.focus}
          selectedParcelId={selected}
          onSelectParcel={setSelected}
        />
      </div>

      {/* chat */}
      <div className="w-[400px] shrink-0 h-full flex flex-col border-l border-[var(--line)] bg-[var(--bg-elev)]">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[#0ea5e9] flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-[var(--accent-ink)]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">Planning Copilot</div>
            <div className="text-[11px] text-dim">Natural language → real GIS analysis</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="panel p-3 text-[12px] text-muted leading-relaxed">
                Ask a planning question in plain English. Every answer is computed by the spatial
                engine — the assistant interprets intent, calls a GIS tool, and explains the result.
                It never invents numbers.
              </div>
              <div className="text-[11px] uppercase tracking-wide text-dim">Try asking</div>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="w-full text-left rounded-lg border border-[var(--line)] px-3 py-2 text-[13px] text-muted hover:text-ink hover:border-[var(--accent)] hover:bg-[var(--panel)] transition-colors flex items-center justify-between group"
                  >
                    {s}
                    <ArrowRight className="h-3.5 w-3.5 text-dim group-hover:text-[var(--accent)]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[92%]", m.role === "user" ? "" : "w-full")}>
                {m.role === "user" ? (
                  <div className="bg-[var(--accent)] text-[var(--accent-ink)] rounded-2xl rounded-br-sm px-3.5 py-2 text-[13px]">
                    {m.text}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {m.tool && m.tool !== "help" && (
                      <div className="flex items-center gap-1.5 text-[10px] text-dim">
                        <Wrench className="h-3 w-3" /> tool: <span className="mono text-muted">{m.tool}</span>
                      </div>
                    )}
                    <div className="panel px-3.5 py-2.5 text-[13px] text-ink leading-relaxed">{m.text}</div>
                    {m.items && m.items.length > 0 && (
                      <div className="space-y-1">
                        {m.items.map((it, j) => (
                          <button
                            key={j}
                            onClick={() => {
                              if (it.id) setSelected(it.id);
                              if (it.centroid) setMapState((prev) => ({ ...prev, focus: { lng: it.centroid![0], lat: it.centroid![1], zoom: 14 } }));
                            }}
                            className="w-full flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 hover:bg-[var(--panel-hover)] text-left"
                          >
                            {it.centroid && <MapPin className="h-3 w-3 text-[var(--accent)] shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] text-ink truncate">{it.label}</div>
                              {it.sub && <div className="text-[10px] text-dim truncate">{it.sub}</div>}
                            </div>
                            {it.score != null && (
                              <span className="tnum text-[13px] font-bold" style={{ color: scoreColor(it.score) }}>
                                {it.score}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)] animate-spin" />
              Querying spatial engine…
            </div>
          )}
        </div>

        <div className="p-3 border-t border-[var(--line)]">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(input)}
              placeholder="Ask a planning question…"
              className="flex-1 bg-[var(--panel-2)] border border-[var(--line)] rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-dim outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={() => ask(input)}
              disabled={busy || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
