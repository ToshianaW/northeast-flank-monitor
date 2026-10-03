/**
 * Shared sub-layout for public pages: a page header (eyebrow, h1, intro),
 * a main column and an optional right-hand column that stacks below on mobile.
 * Pages that render their own h1 (digest, event detail) omit `title`.
 */
export function PageShell({
  eyebrow,
  title,
  intro,
  aside,
  asideLabel,
  asideFirstOnMobile = false,
  children,
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  intro?: React.ReactNode;
  aside?: React.ReactNode;
  asideLabel?: string;
  /** Put the aside above the main column on small screens (e.g. a contents list). */
  asideFirstOnMobile?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      {title ? (
        <header className="mb-8 border-b border-border pb-6">
          {eyebrow ? <p className="meta-label mb-3">{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {intro ? (
            <div className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
              {intro}
            </div>
          ) : null}
        </header>
      ) : null}

      {aside ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">{children}</div>
          <aside
            aria-label={asideLabel}
            className={`min-w-0 lg:col-span-4 ${asideFirstOnMobile ? "order-first lg:order-none" : ""}`}
          >
            {aside}
          </aside>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
