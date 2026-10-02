type PageStubProps = {
  title: string;
  eyebrow?: string;
  description: string;
  nextStep?: string;
};

export function PageStub({
  title,
  eyebrow = "Stub",
  description,
  nextStep,
}: PageStubProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">{eyebrow}</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
        {description}
      </p>
      {nextStep ? (
        <p className="mt-6 border border-border bg-surface-dark px-4 py-3 font-mono text-xs text-text-muted">
          Roadmap: {nextStep}
        </p>
      ) : null}
    </section>
  );
}
