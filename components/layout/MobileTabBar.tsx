"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut } from "lucide-react";
import { Label } from "@/components/ui/label";
import { FarmSwitcher } from "@/components/farms/FarmSwitcher";
import { roleLabel } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSignOut } from "@/lib/auth/navigation";
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute, visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Number of leading {@link NAV_ITEMS} shown as bottom tabs; the rest live behind
 * the "Mais" dialog.
 */
const PRIMARY_TAB_COUNT = 4;

/** Shorter labels for the cramped bottom bar (keyed by href). */
const SHORT_LABELS: Record<string, string> = {
  "/calendar": "Agenda",
  "/nascimentos": "Partos",
};

/** Applies the mobile short label when one exists, otherwise keeps the default. */
function tabLabel(item: NavItem): string {
  return SHORT_LABELS[item.href] ?? item.label;
}

const tabClass =
  "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5";

const moreLinkClass =
  "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-ink transition-colors hover:bg-surface";

export function MobileTabBar() {
  const pathname = usePathname();
  const signOut = useSignOut();
  const [moreOpen, setMoreOpen] = useState(false);
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);
  const items = visibleNav(NAV_ITEMS, useActivePermissions());
  const tabs = items.slice(0, PRIMARY_TAB_COUNT);
  const moreLinks = items.slice(PRIMARY_TAB_COUNT);
  const moreActive = moreLinks.some(
    (link) => isActiveRoute(pathname, link.href) || activeChild(pathname, link) !== null
  );

  async function handleSignOut() {
    setMoreOpen(false);
    await signOut();
  }

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = isActiveRoute(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(tabClass, active ? "text-brand" : "text-ink-soft")}
            >
              <tab.icon className="size-5" aria-hidden />
              <span className="text-[10px] font-medium">{tabLabel(tab)}</span>
            </Link>
          );
        })}

        <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
          <DialogTrigger
            className={cn(tabClass, moreActive ? "text-brand" : "text-ink-soft")}
          >
            <Ellipsis className="size-5" aria-hidden />
            <span className="text-[10px] font-medium">Mais</span>
          </DialogTrigger>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="font-heading">Mais opções</DialogTitle>
              <DialogDescription>Outras áreas do MeuBov</DialogDescription>
            </DialogHeader>
            {/* The sidebar's switcher, for the phone, with the same Nova fazenda and Gerenciar fazendas. */}
            <div className="grid gap-1.5 border-b border-hairline pb-3">
              <Label htmlFor="mobile-farm">Fazenda</Label>
              <FarmSwitcher variant="field" id="mobile-farm" onNavigate={() => setMoreOpen(false)} />
              {activeFarm ? (
                <p className="text-xs text-ink-soft">
                  Você é {roleLabel(activeFarm.role, activeFarm.preset)} nesta fazenda
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              {/* Primary tabs already sit in the bar, so only their children are listed here. */}
              {items.map((item, index) => (
                <Fragment key={item.href}>
                  {index >= PRIMARY_TAB_COUNT && (
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={moreLinkClass}
                    >
                      <item.icon className="size-4 text-ink-soft" aria-hidden />
                      {item.label}
                    </Link>
                  )}
                  {item.children?.map((child) => {
                    const ChildIcon = child.icon ?? item.icon;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMoreOpen(false)}
                        className={moreLinkClass}
                      >
                        {/* Its own icon, or the parent's so the child reads as part of that area. */}
                        <ChildIcon className="size-4 text-ink-soft" aria-hidden />
                        {child.label}
                        <span className="ml-auto text-[11px] text-ink-soft">em {item.label}</span>
                      </Link>
                    );
                  })}
                </Fragment>
              ))}
              <button
                type="button"
                onClick={handleSignOut}
                className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface"
              >
                <LogOut className="size-4" aria-hidden />
                Sair
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </nav>
  );
}
