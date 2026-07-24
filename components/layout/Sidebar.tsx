"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useSignOut } from "@/lib/auth/navigation";
import { displayName, getInitials } from "@/lib/auth/user";
import { NAV_ITEMS, isActiveRoute } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const signOut = useSignOut();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar md:flex">
      <div className="px-5 pt-6 pb-5">
        <p className="font-heading text-xl font-semibold text-surface">MeuBov</p>
        <p className="mt-0.5 text-[11px] text-surface/60">Gestão de rebanho de corte</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-2" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-surface/75 transition-colors hover:bg-sidebar-active/60 hover:text-surface",
                active &&
                  "bg-sidebar-active text-surface before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brand"
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-surface/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-surface"
          >
            {isPending ? "…" : getInitials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-surface">
              {isPending ? "Carregando…" : displayName(user?.name, user?.email)}
            </p>
            {user?.email ? (
              <p className="truncate text-[11px] text-surface/60">{user.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sair"
            title="Sair"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-surface/60 transition-colors hover:bg-sidebar-active/60 hover:text-surface"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
