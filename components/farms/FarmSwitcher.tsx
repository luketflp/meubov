"use client";

/**
 * The farm switcher of the rail and of the phone's "Mais": every farm of the
 * account with the caller's role and município, then "Nova fazenda" and
 * "Gerenciar fazendas". It shows even with a single farm — it is the way in to
 * a second one. A Radix Select cannot hold those two action rows, hence a menu.
 */
import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, Settings2, Tractor } from "lucide-react";
import { farmLabel } from "@/lib/domain/farms";
import { roleLabel } from "@/lib/domain/permissions";
import { useHerdStore, type NewFarmInput } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewFarmDialog } from "@/components/farms/NewFarmDialog";
import { useNewFarm } from "@/components/farms/useNewFarm";

interface FarmSwitcherProps {
  /** "rail": the green sidebar trigger. "field": the 44px field inside "Mais". */
  variant: "rail" | "field";
  /** For a Label's htmlFor. */
  id?: string;
  /** Runs once the user has gone somewhere, so "Mais" can close itself. */
  onNavigate?: () => void;
}

const TRIGGER_CLASS: Record<FarmSwitcherProps["variant"], string> = {
  rail: "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-sidebar-line/60 bg-sidebar-hover py-2 pr-2 pl-2.5 text-sm text-sidebar-ink outline-none focus-visible:ring-3 focus-visible:ring-sidebar-active/35",
  field:
    "flex min-h-11 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
};

export function FarmSwitcher({ variant, id, onNavigate }: FarmSwitcherProps) {
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const [creating, setCreating] = useState(false);
  const newFarm = useNewFarm();
  const active = farms.find((farm) => farm.id === activeFarmId);

  // "Nova fazenda" opens over "Mais", so "Mais" closes only once the farm exists.
  async function create(input: NewFarmInput) {
    await newFarm.onSubmit(input);
    onNavigate?.();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          id={id}
          aria-label={variant === "rail" ? "Selecionar fazenda" : undefined}
          className={TRIGGER_CLASS[variant]}
        >
          {/* One flex child so justify-between only separates it from the chevron. */}
          <span className="flex min-w-0 items-center gap-2">
            <Tractor className={cn("size-4 shrink-0", variant === "field" && "text-ink-soft")} aria-hidden />
            <span className="truncate">{active ? farmLabel(active) : "Fazenda"}</span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0",
              variant === "rail" ? "text-sidebar-ink-soft" : "text-muted-foreground"
            )}
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64">
          {farms.map((farm) => {
            const open = farm.id === activeFarmId;
            const place = farm.municipality.trim();
            return (
              <DropdownMenuItem
                key={farm.id}
                className="py-1.5"
                onSelect={() => {
                  onNavigate?.();
                  void switchFarm(farm.id);
                }}
              >
                {open ? (
                  <Check className="text-brand!" aria-hidden />
                ) : (
                  <span className="size-4 shrink-0" aria-hidden />
                )}
                <span className="grid min-w-0">
                  <span className={cn("truncate", open && "font-medium")}>{farmLabel(farm)}</span>
                  <span className="truncate text-xs text-ink-soft">
                    {roleLabel(farm.role, farm.preset)}
                    {place ? ` · ${place}` : ""}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus aria-hidden />
            Nova fazenda
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/fazendas" onClick={onNavigate}>
              <Settings2 aria-hidden />
              Gerenciar fazendas
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewFarmDialog
        open={creating}
        onOpenChange={setCreating}
        source={newFarm.source}
        description={newFarm.description}
        onSubmit={create}
      />
    </>
  );
}
