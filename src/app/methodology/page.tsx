import { PageStub } from "@/components/page-stub";

export const metadata = { title: "Methodology" };

export default function MethodologyPage() {
  return (
    <PageStub
      title="Methodology"
      description="How events are collected, reviewed, labeled for confidence, and compared historically. AI assists under human review; digests do not determine truth independently."
      nextStep="1.10 — methodology + AI disclosure copy"
    />
  );
}
