import { PageStub } from "@/components/page-stub";

export const metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <PageStub
      eyebrow="Admin · protected"
      title="Moderation dashboard"
      description="Source registry, manual event entry, and the review queue will live here. All AI-extracted events require human review at launch."
      nextStep="1.3 — source registry CRUD; 1.5 — review queue"
    />
  );
}
