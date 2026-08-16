import Component from "@/components/ui/highlight-card";
import { Rocket } from "lucide-react";

export default function DemoOne() {
  return (
    <Component
      title="Space Explorer"
      description={[
        "Embark on interstellar adventures,",
        "discover new planets and galaxies,",
        "share your discoveries with friends,",
        "and reach for the stars together."
      ]}
      icon={<Rocket className="w-8 h-8 text-white" />}
    />
  );
}
