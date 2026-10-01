import { PageStub } from "@/components/page-stub";

export const metadata = { title: "Latest" };

export default function LatestPage() {
  return (
    <PageStub
      title="Latest verified events"
      description="Compact log-style feed of published events. Manual entry and public feed land in steps 1.4–1.6."
      nextStep="1.6 — public Latest feed + event detail"
    />
  );
}
