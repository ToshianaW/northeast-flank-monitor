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
      aria-current={active ? "page" : undefined}
      className="meta-label nav-item whitespace-nowrap"
    >
      {label}
    </Link>
  );
}

export function SiteNav() {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-wrap items-center gap-x-2 gap-y-2"
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
