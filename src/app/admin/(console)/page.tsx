import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  await requireAdminPage();
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Admin · protected</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Moderation dashboard
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-text-secondary">
        All AI-extracted events require human review at launch.         Manual event entry is under Events; the review queue is under Review.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/sources"
          className="block border border-border bg-surface-dark p-4 transition-colors hover:border-teal-blue"
        >
          <p className="meta-label">Source registry</p>
          <p className="mt-2 text-sm text-text-secondary">
            List, add, and edit sources.
          </p>
        </Link>
        <Link
          href="/admin/events"
          className="block border border-border bg-surface-dark p-4 transition-colors hover:border-teal-blue"
        >
          <p className="meta-label">Events</p>
          <p className="mt-2 text-sm text-text-secondary">
            Create and edit draft events with attached sources.
          </p>
        </Link>
        <Link
          href="/admin/review"
          className="block border border-border bg-surface-dark p-4 transition-colors hover:border-teal-blue"
        >
          <p className="meta-label">Review queue</p>
          <p className="mt-2 text-sm text-text-secondary">
            Approve, reject, merge, or edit draft and pending events.
          </p>
        </Link>
        <Link
          href="/admin/digests"
          className="block border border-border bg-surface-dark p-4 transition-colors hover:border-teal-blue"
        >
          <p className="meta-label">Daily digests</p>
          <p className="mt-2 text-sm text-text-secondary">
            Write, save as draft, and publish the daily digest.
          </p>
        </Link>
      </div>
    </section>
  );
}
