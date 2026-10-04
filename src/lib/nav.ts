export type NavItem = {
  href: string;
  label: string;
  /** Top-bar title when it differs from the sidebar label. */
  title?: string;
};

/** An expandable sidebar entry: a disclosure button over its child links. */
export type NavParent = {
  id: string;
  label: string;
  children: NavItem[];
};

export type NavEntry = NavItem | NavParent;

export type NavGroup = {
  id: string;
  label: string;
  items: NavEntry[];
};

export function isNavParent(entry: NavEntry): entry is NavParent {
  return "children" in entry;
}

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
      {
        id: "historical",
        label: "Historical Comparison",
        children: [
          { href: "/historical", label: "Overview", title: "Historical Comparison" },
          { href: "/historical/compare", label: "Side-by-side view" },
        ],
      },
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

/** Every link in the sidebar, children included, in order. */
export function navLinks(): NavItem[] {
  return NAV_GROUPS.flatMap((g) => g.items.flatMap((e) => (isNavParent(e) ? e.children : [e])));
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The sidebar link for a path: the longest matching href, so /historical/compare marks
 * "Side-by-side view" and not also "Overview".
 */
export function activeNavItem(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const item of navLinks()) {
    if (isActivePath(pathname, item.href) && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/** The parent shows the active style when one of its children is the current page. */
export function isParentActive(parent: NavParent, pathname: string): boolean {
  const active = activeNavItem(pathname);
  return active !== null && parent.children.includes(active);
}

/** A parent is open on its own pages (any path under one of its children) and closed elsewhere. */
export function isParentOpenByDefault(parent: NavParent, pathname: string): boolean {
  return parent.children.some((c) => isActivePath(pathname, c.href));
}

/** Top-bar title for a public path. Detail pages fall back to their section. */
export function pageTitleFor(pathname: string): string {
  if (pathname.startsWith("/events/")) return "Event";
  const item = activeNavItem(pathname);
  return item ? (item.title ?? item.label) : "Northeast Flank Monitor";
}
