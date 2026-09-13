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
  Dna,
  Fence,
  LayoutDashboard,
  Map,
  Settings,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { can, type Area, type Permissions } from "@/lib/domain/permissions";

/** A secondary destination listed under a {@link NavItem}. */
export interface NavChild {
  label: string;
  href: string;
  /** Icon of its own; without one the child borrows its parent's. */
  icon?: LucideIcon;
  /** Hidden from a user whose level in this area is none. */
  area?: Area;
}

/** A primary navigation destination. */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Secondary destinations shown under this item, always visible. */
  children?: readonly NavChild[];
  /** Hidden from a user whose level in this area is none. */
  area?: Area;
}

/** Ordered list of every primary destination in the authenticated app. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Painel", href: "/dashboard", icon: LayoutDashboard },
  { label: "Rebanho", href: "/herd", icon: Beef },
  { label: "Manejo", href: "/manejo", icon: Syringe },
  { label: "Nascimentos", href: "/nascimentos", icon: Baby },
  { label: "Reprodução", href: "/reproducao", icon: Dna },
  { label: "Calendário Sanitário", href: "/calendar", icon: CalendarDays },
  { label: "Lotes", href: "/lots", icon: Fence },
  { label: "Mapa", href: "/map", icon: Map },
  { label: "Financeiro", href: "/finance", icon: CircleDollarSign, area: "finance" },
  {
    label: "Configurações",
    href: "/settings",
    icon: Settings,
    children: [{ label: "Equipe", href: "/settings/equipe", area: "team" }],
  },
];

/**
 * The destinations the user may open. Only Financeiro and Equipe can be at
 * none, so in practice this drops those two; an item left with no children
 * loses the key, so the views draw no empty tree.
 */
export function visibleNav(items: readonly NavItem[], permissions: Permissions): NavItem[] {
  const open = (area?: Area) => area === undefined || can(permissions, area, "view");
  return items
    .filter((item) => open(item.area))
    .map((item) => {
      const children = item.children?.filter((child) => open(child.area));
      return { ...item, children: children && children.length > 0 ? children : undefined };
    });
}

/** True when `pathname` is `href` or a sub-route of it (e.g. /herd/123). */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The child of `item` whose route matches `pathname`, or null when none does. */
export function activeChild(pathname: string, item: NavItem): NavChild | null {
  return item.children?.find((child) => isActiveRoute(pathname, child.href)) ?? null;
}
