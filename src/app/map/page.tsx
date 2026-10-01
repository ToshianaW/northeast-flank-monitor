import { PageStub } from "@/components/page-stub";

export const metadata = { title: "Map" };

export default function MapPage() {
  return (
    <PageStub
      title="Regional map"
      description="Interactive MapLibre map of the northeast flank with generalized event markers."
      nextStep="3.1 — MapLibre map + markers"
    />
  );
}
