import type { Metadata } from "next";
import "./landing.css";
import CinematicRoot from "@/components/landing/CinematicRoot";

export const metadata: Metadata = {
  title: "UrbanLens — The intelligence to build better cities",
  description:
    "AI-powered urban planning and land intelligence. UrbanLens observes how a city changes, predicts where it grows next, finds the infrastructure gap, recommends where to build and simulates the impact before anything is built.",
};

/**
 * `/` — the cinematic landing experience.
 * The application itself lives at `/app` (see components/layout/AppShell).
 */
export default function Page() {
  return <CinematicRoot />;
}
