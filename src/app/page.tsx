import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Home · monitoring shell</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        What changed during the last 24 hours?
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-text-secondary sm:text-base">
        Intelligence-style monitoring surface for NATO&apos;s northeastern
        flank. Panels and live data arrive in later foundation steps — this
        scaffold establishes navigation, design tokens, and route stubs.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="border border-border bg-surface-dark p-4">
          <p className="meta-label">Regional activity</p>
          <p className="mt-2 text-lg text-text-muted">Placeholder</p>
          <p className="mt-1 text-xs text-text-muted">
            Activity Index lands in Phase 6. Not a forecast of conflict.
          </p>
        </div>
        <div className="border border-border bg-surface-dark p-4">
          <p className="meta-label">24-hour snapshot</p>
          <p className="mt-2 font-mono text-sm text-text-secondary">
            Verified events — —
          </p>
          <p className="font-mono text-sm text-text-secondary">
            Active exercises — —
          </p>
          <p className="font-mono text-sm text-text-secondary">
            Reset status — —
          </p>
        </div>
      </div>

      <p className="mt-8 text-sm text-text-secondary">
        Continue to{" "}
        <Link href="/latest" className="text-teal-blue hover:underline">
          Latest
        </Link>{" "}
        or{" "}
        <Link href="/methodology" className="text-teal-blue hover:underline">
          Methodology
        </Link>
        .
      </p>
    </div>
  );
}
