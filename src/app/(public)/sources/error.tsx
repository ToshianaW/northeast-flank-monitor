"use client";

import { Button } from "@/components/ui/button";

export default function SourcesError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Source hierarchy</p>
      <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
      <p className="mt-3 text-sm text-text-secondary">
        The source registry could not be loaded right now.
      </p>
      <Button variant="outline" className="mt-4" onClick={() => reset()}>
        Try again
      </Button>
    </section>
  );
}
