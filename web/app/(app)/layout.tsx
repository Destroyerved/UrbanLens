import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { CityProvider, CityScope, type CityOption } from "@/components/shell/CityProvider";
import { CITIES, DEFAULT_CITY } from "@/lib/config";

/**
 * Cities are declared server-side in lib/config.ts and handed to the client, so
 * adding a city is a config change rather than a UI change (PRD §38 — Ahmedabad
 * is the default demo city, not a hard-coded assumption).
 */
const cityOptions: CityOption[] = Object.values(CITIES)
  .map((c) => ({ id: c.id, name: c.name, state: c.state, center: c.center, zoom: c.zoom }))
  .sort((a, b) => (a.id === DEFAULT_CITY.id ? -1 : b.id === DEFAULT_CITY.id ? 1 : a.name.localeCompare(b.name)));

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <CityProvider cities={cityOptions}>
      <div className="h-full flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 min-h-0 overflow-hidden">
            <CityScope>{children}</CityScope>
          </main>
        </div>
      </div>
    </CityProvider>
  );
}
