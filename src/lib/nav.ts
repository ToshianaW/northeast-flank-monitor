export type NavItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/** Public sidebar navigation, grouped (spec §8 / §52, plus Digest §16). */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/map", label: "Map" },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    items: [
      { href: "/latest", label: "Latest" },
      { href: "/digest", label: "Digest" },
      { href: "/archive", label: "Archive" },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    items: [
      { href: "/exercises", label: "Exercises" },
      { href: "/air-activity", label: "Air Activity" },
      { href: "/historical", label: "Historical Comparison" },
      { href: "/historical/compare", label: "Side-by-side view" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    items: [
      { href: "/sources", label: "Sources" },
      { href: "/methodology", label: "Methodology" },
      { href: "/about", label: "About" },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The sidebar item for a path: the longest matching href, so /historical/compare marks
 * "Side-by-side view" and not also "Historical Comparison".
 */
export function activeNavItem(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best;
}

/** Top-bar title for a public path. Detail pages fall back to their section. */
export function pageTitleFor(pathname: string): string {
  if (pathname.startsWith("/events/")) return "Event";
  return activeNavItem(pathname)?.label ?? "Northeast Flank Monitor";
}
