"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/nav";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`meta-label whitespace-nowrap border-b-2 pb-1 transition-colors ${
        active
          ? "border-teal-blue text-teal-blue"
          : "border-transparent text-text-secondary hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-deep-navy/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="block">
              <p className="font-sans text-lg font-semibold tracking-wide text-foreground sm:text-xl">
                Northeast Flank Monitor
              </p>
            </Link>
            <p className="mt-1 max-w-xl text-sm text-text-secondary">
              Open-source monitoring of military activity across NATO&apos;s
              northeastern flank.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:text-right">
            <span
              className="inline-block h-2 w-2 rounded-full bg-operational-teal shadow-[0_0_8px_rgba(0,133,116,0.55)]"
              aria-hidden
            />
            <div>
              <p className="meta-label">Last update</p>
              <p className="font-mono text-xs text-text-secondary">
                Stub · awaiting data
              </p>
            </div>
          </div>
        </div>
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <span className="hidden text-border sm:inline" aria-hidden>
            |
          </span>
          {SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
      </div>
    </header>
  );
}
