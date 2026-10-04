"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_GROUPS, activeNavItem, pageTitleFor } from "@/lib/nav";

/**
 * Public page frame: grouped sidebar, top bar and main column.
 * Below `lg` the sidebar becomes a drawer behind the menu button.
 * Server-rendered parts (the update stamp, the page itself) come in as props.
 */
export function SiteFrame({
  updated,
  children,
}: {
  updated: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeHref = activeNavItem(pathname)?.href;
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) menuButton.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("a, button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-full flex-1">
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-background/70 lg:hidden"
          aria-hidden
          onClick={() => close(true)}
        />
      ) : null}

      <aside
        id="site-sidebar"
        ref={drawer}
        aria-label="Site"
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface-dark lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-5">
          <Link href="/" className="block" onClick={() => close(false)}>
            <p className="text-base font-semibold tracking-wide text-foreground">
              Northeast Flank Monitor
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Open-source monitoring of military activity across NATO&apos;s
              northeastern flank.
            </p>
          </Link>
          <button
            type="button"
            onClick={() => close(true)}
            className="-mr-1 rounded-md p-1 text-text-secondary hover:text-foam lg:hidden"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-6 px-3 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <h2 id={`nav-${group.id}`} className="meta-label mb-2 px-3">
                {group.label}
              </h2>
              <ul aria-labelledby={`nav-${group.id}`} className="grid gap-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={activeHref === item.href ? "page" : undefined}
                      onClick={() => close(false)}
                      className="nav-item flex w-full text-sm"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-deep-navy/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              ref={menuButton}
              type="button"
              aria-expanded={open}
              aria-controls="site-sidebar"
              onClick={() => setOpen((o) => !o)}
              className="-ml-1 rounded-md p-1 text-text-secondary hover:text-foam lg:hidden"
            >
              <Menu className="size-5" aria-hidden />
              <span className="sr-only">Menu</span>
            </button>
            <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              {pageTitleFor(pathname)}
            </p>
            {updated}
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
          {children}
        </main>

        <footer className="border-t border-border bg-surface-dark/60">
          <p className="px-4 py-4 text-xs text-text-muted sm:px-6">
            Similarity is not trajectory. This site does not predict intent or
            conflict.
          </p>
        </footer>
      </div>
    </div>
  );
}
