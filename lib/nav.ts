/**
 * Single source of truth for the app's primary navigation.
 *
 * Both the desktop Sidebar and the mobile tab bar derive their views from
 * {@link NAV_ITEMS}, so labels and hrefs never drift between the two. Each view
 * decides how to split/relabel these items for its own layout. `isActiveRoute`
 * and `activeChild` are shared so active-state matching stays identical
 * everywhere.
 */
import {
  Baby,
  Beef,
  CalendarDays,
  CircleDollarSign,
  Fence,
  LayoutDashboard,
  Map,
  Settings,
  Syringe,
  type LucideIcon,
} from "lucide-react";

/** A secondary destination listed under a {@link NavItem}. */
export interface NavChild {
  label: string;
  href: string;
}

/** A primary navigation destination. */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Secondary destinations shown under this item, always visible. */
  children?: readonly NavChild[];
}

/** Ordered list of every primary destination in the authenticated app. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Painel", href: "/dashboard", icon: LayoutDashboard },
  { label: "Rebanho", href: "/herd", icon: Beef },
  { label: "Manejo", href: "/manejo", icon: Syringe },
  {
    label: "Nascimentos",
    href: "/nascimentos",
    icon: Baby,
    children: [{ label: "Coberturas", href: "/nascimentos/coberturas" }],
  },
  { label: "Calendário Sanitário", href: "/calendar", icon: CalendarDays },
  { label: "Lotes", href: "/lots", icon: Fence },
  { label: "Mapa", href: "/map", icon: Map },
  { label: "Financeiro", href: "/finance", icon: CircleDollarSign },
  { label: "Configurações", href: "/settings", icon: Settings },
];

/** True when `pathname` is `href` or a sub-route of it (e.g. /herd/123). */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The child of `item` whose route matches `pathname`, or null when none does. */
export function activeChild(pathname: string, item: NavItem): NavChild | null {
  return item.children?.find((child) => isActiveRoute(pathname, child.href)) ?? null;
}
