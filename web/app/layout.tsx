import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Fonts are self-hosted via next/font rather than linked from Google's CDN.
 * The <link> this replaces fetched the stylesheet at runtime, so the typography
 * depended on a third party being reachable at demo time — and it was already
 * failing: Google's own css2 response references an IBM Plex Sans subset that
 * 404s, so that unicode range silently fell back to a system font.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "UrbanLens — AI-Powered Urban Planning & Land Intelligence",
  description:
    "Spatial decision-support system for government urban planners. Detect growth, find infrastructure gaps, recommend sites, simulate impact. SIH 2026 · PS-SW-001.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
