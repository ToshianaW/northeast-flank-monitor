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

export function SiteNav() {
  return (
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
  );
}
