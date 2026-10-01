import Link from "next/link";

export const metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Admin · protected</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Moderation dashboard
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-text-secondary">
        All AI-extracted events require human review at launch. Manual event
        entry and the review queue arrive in steps 1.4 and 1.5.
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
      </div>
    </section>
  );
}
