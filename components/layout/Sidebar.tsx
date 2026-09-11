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
 * Quiet, paper-toned rows: the sidebar is one tone below the canvas, rows are
 * flat text that gain a soft pill on hover, and the active row keeps the pill.
 * No accent bars — the only colour in the rail is the ear tag on the mark and
 * the avatar.
 */
const rowClass =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-ink/80 transition-colors hover:bg-sidebar-active/60 hover:text-ink";

/** Highlight shared by an active parent row and an active child row. */
const activeClass = "bg-sidebar-active font-medium text-ink";

/**
 * Child rows hang off a hairline rule under the parent's icon (px 10 + half of
 * the 16px icon = 18) so they read as part of that area.
 */
const childClass =
  "flex items-center rounded-md px-2.5 py-1 text-[13px] text-ink-soft transition-colors hover:bg-sidebar-active/60 hover:text-ink";

export function Sidebar() {
  const pathname = usePathname();
  const signOut = useSignOut();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-hairline bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        {/* Draws once on mount and freezes with the tag in place. */}
        <NeloreMark
          viewBox={NELORE_HEAD_VIEWBOX}
          maskId="nelore-sidebar"
          durationMs={2500}
          loop={false}
          className="size-8 shrink-0"
          style={{ display: "block", overflow: "hidden" }}
        />
        <p className="font-heading text-lg leading-none font-semibold text-ink">MeuBov</p>
      </div>

      {farms.length > 1 && (
        <div className="px-2.5 pb-3">
          <Select
            value={activeFarmId === null ? undefined : String(activeFarmId)}
            onValueChange={(value) => void switchFarm(Number(value))}
          >
            <SelectTrigger
              aria-label="Selecionar fazenda"
              className="w-full rounded-lg border-hairline bg-panel text-ink shadow-none hover:bg-surface [&_svg]:text-ink-soft"
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
          // On a child route the child row takes the highlight and the parent
          // keeps only the darker text.
          const active = child === null && isActiveRoute(pathname, item.href);
          return (
            <Fragment key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(rowClass, active && activeClass, child !== null && "text-ink")}
              >
                <item.icon
                  className={cn("size-4 shrink-0", active || child !== null ? "text-ink" : "text-ink-soft")}
                  aria-hidden
                />
                {item.label}
              </Link>
              {item.children && (
                <div className="ml-[18px] space-y-0.5 border-l border-hairline pl-2">
                  {item.children.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      aria-current={sub === child ? "page" : undefined}
                      className={cn(childClass, sub === child && activeClass)}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="border-t border-hairline px-2.5 py-2.5">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-surface"
          >
            {isPending ? "…" : getInitials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {isPending ? "Carregando…" : displayName(user?.name, user?.email)}
            </p>
            {user?.email ? (
              <p className="truncate text-[11px] text-ink-soft">{user.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sair"
            title="Sair"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-sidebar-active/60 hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
