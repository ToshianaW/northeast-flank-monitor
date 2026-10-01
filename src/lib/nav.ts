export type NavItem = {
  href: string;
  label: string;
};

/** Spec §8 / §52 primary navigation */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/latest", label: "Latest" },
  { href: "/map", label: "Map" },
  { href: "/exercises", label: "Exercises" },
  { href: "/air-activity", label: "Air Activity" },
  { href: "/historical-compare", label: "Historical Compare" },
  { href: "/archive", label: "Archive" },
  { href: "/sources", label: "Sources" },
  { href: "/methodology", label: "Methodology" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/about", label: "About" },
];
