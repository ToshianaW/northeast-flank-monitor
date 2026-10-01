import { PageStub } from "@/components/page-stub";

export const metadata = { title: "Archive" };

export default function ArchivePage() {
  return (
    <PageStub
      title="Archive"
      description="Browse published events by date, country, actor, category, confidence, and source type."
      nextStep="1.9 — basic archive filters + persistent URLs"
    />
  );
}
