"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Tractor } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useSignOut } from "@/lib/auth/navigation";
import { displayName, getInitials } from "@/lib/auth/user";
import { NAV_ITEMS, activeChild, isActiveRoute } from "@/lib/nav";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";
import { NELORE_HEAD_VIEWBOX, NeloreMark } from "@/components/ui/nelore-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Brand-green rail: the only dark surface in the app, so navigation reads as
 * its own place rather than as a paler stripe of the canvas. Rows are flat
 * cream text that gain a lighter green veil on hover, and the active row
 * inverts to a cream pill with green ink — the highest-contrast pair in the
 * rail, which is what "you are here" deserves.
 */
const rowClass =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-ink transition-colors hover:bg-sidebar-hover";

/** Highlight shared by an active parent row and an active child row. */
const activeClass = "bg-sidebar-active font-medium text-sidebar-active-ink";

/**
 * Child rows hang off a tree line that drops from the parent's icon (px 10 +
 * half of the 16px icon = 18). Each row draws its own elbow with `before` (a
 * rounded corner that reaches the row's edge) and, unless it is the last
 * child, continues the trunk down to the next row with `after`; both stretch
 * 2px past the row to bridge the `space-y-0.5` gap.
 */
const childClass =
  "relative flex items-center gap-2 rounded-md py-1 pr-2.5 pl-2 text-[13px] text-sidebar-ink-soft transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink before:absolute before:-top-0.5 before:-left-2.5 before:h-[calc(50%+2px)] before:w-2.5 before:rounded-bl-md before:border-b before:border-l before:border-sidebar-line";

const childTrunkClass =
  "after:absolute after:top-1/2 after:-left-2.5 after:h-[calc(50%+2px)] after:w-px after:bg-sidebar-line";

export function Sidebar() {
  const pathname = usePathname();
  const signOut = useSignOut();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        {/* The mark keeps its own dark ink and green ear tag, so on a green
            rail it needs a light ground of its own: a cream tile, the same
            colour as the active pill. */}
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-active">
          {/* Draws once on mount and freezes with the tag in place. */}
          <NeloreMark
            viewBox={NELORE_HEAD_VIEWBOX}
            maskId="nelore-sidebar"
            durationMs={2500}
            loop={false}
            className="size-[26px] shrink-0"
            style={{ display: "block", overflow: "hidden" }}
          />
        </span>
        <p className="font-heading text-lg leading-none font-semibold text-sidebar-ink">MeuBov</p>
      </div>

      {farms.length > 1 && (
        <div className="px-2.5 pb-3">
          <Select
            value={activeFarmId === null ? undefined : String(activeFarmId)}
            onValueChange={(value) => void switchFarm(Number(value))}
          >
            <SelectTrigger
              aria-label="Selecionar fazenda"
              className="w-full rounded-lg border-sidebar-line/60 bg-sidebar-hover text-sidebar-ink shadow-none hover:bg-sidebar-hover [&_svg]:text-sidebar-ink-soft"
            >
              {/* One flex child so the trigger's justify-between only separates it from the chevron. */}
              <span className="flex min-w-0 items-center gap-2">
                <Tractor className="size-4 shrink-0" aria-hidden />
                <SelectValue placeholder="Fazenda" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {farms.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name.trim() || `Fazenda #${f.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => {
          const child = activeChild(pathname, item);
          // On a child route the child row takes the cream pill and the
          // parent is marked only by its brighter icon.
          const active = child === null && isActiveRoute(pathname, item.href);
          return (
            <Fragment key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(rowClass, active && activeClass)}
              >
                {/* The parent of an active child keeps a brighter icon: it is
                    the only tint left to mark it once every row's text is the
                    same cream. */}
                <item.icon
                  className={cn(
                    "size-4 shrink-0",
                    active
                      ? "text-sidebar-active-ink"
                      : child !== null
                        ? "text-sidebar-ink"
                        : "text-sidebar-icon"
                  )}
                  aria-hidden
                />
                {item.label}
              </Link>
              {item.children && (
                <div className="ml-[18px] space-y-0.5 pl-2.5">
                  {item.children.map((sub, index, all) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      aria-current={sub === child ? "page" : undefined}
                      className={cn(
                        childClass,
                        index < all.length - 1 && childTrunkClass,
                        sub === child && activeClass
                      )}
                    >
                      {sub.icon && <sub.icon className="size-3.5 shrink-0" aria-hidden />}
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-line/40 px-2.5 py-2.5">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-[11px] font-semibold text-sidebar-active-ink"
          >
            {isPending ? "…" : getInitials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-ink">
              {isPending ? "Carregando…" : displayName(user?.name, user?.email)}
            </p>
            {user?.email ? (
              <p className="truncate text-[11px] text-sidebar-ink-soft">{user.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sair"
            title="Sair"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-ink-soft transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
