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

/**
 * Planned pages, kept off the sidebar until built. The side-by-side view is roadmap Phase 5
 * (spec §21-22: synchronized timelines and the indicator matrix) and will live at /historical/compare.
 */
export const PLANNED_PAGES: NavItem[] = [{ href: "/historical/compare", label: "Side-by-side view" }];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Top-bar title for a public path. Detail pages fall back to their section. */
export function pageTitleFor(pathname: string): string {
  if (pathname.startsWith("/events/")) return "Event";
  for (const item of PLANNED_PAGES) {
    if (isActivePath(pathname, item.href)) return item.label;
  }
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href)) return item.label;
    }
  }
  return "Northeast Flank Monitor";
}
