"use client";

/**
 * /settings/fazendas: the account's farms rather than the open farm's data, so
 * no area gates it. Each row opens its farm; the Dono's rows also delete.
 */
import { useState } from "react";
import { Ellipsis, Info, Plus, Tractor, Trash2 } from "lucide-react";
import { deleteVerdict, farmLabel } from "@/lib/domain/farms";
import { formatInstantDate } from "@/lib/domain/invites";
import { useHerdStore, type FarmOption } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { RoleBadge } from "@/components/team/RoleBadge";
import { DeleteFarmDialog } from "@/components/farms/DeleteFarmDialog";
import { NewFarmDialog } from "@/components/farms/NewFarmDialog";
import { useNewFarm } from "@/components/farms/useNewFarm";

export function FarmsPage() {
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<FarmOption | null>(null);
  const newFarm = useNewFarm();
  // A superuser also lists farms they do not belong to (joinedAt null); only
  // memberships count toward "the last farm", as on the server.
  const liveFarmCount = farms.filter((farm) => farm.joinedAt !== null).length;
  // The farm being deleted can disappear from the list before the dialog is
  // closed by hand — a stale farm_not_found refreshes the list out from under
  // it. Treat that as already closed instead of leaving the dialog open on a
  // farm nobody can act on anymore; the next onDelete overwrites `deleting`
  // regardless, so it needs no explicit reset.
  const deletingIsListed = deleting !== null && farms.some((f) => f.id === deleting.id);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Fazendas"
          subtitle="As fazendas em que você trabalha e o seu papel em cada uma"
          actions={
            <Button className="min-h-11 w-full sm:w-auto" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nova fazenda
            </Button>
          }
        />

        <SectionCard title={`Suas fazendas (${farms.length})`}>
          <ul className="-m-4 divide-y divide-hairline">
            {farms.map((farm) => (
              <FarmRow
                key={farm.id}
                farm={farm}
                open={farm.id === activeFarmId}
                liveFarmCount={liveFarmCount}
                onOpen={() => void switchFarm(farm.id)}
                onDelete={() => setDeleting(farm)}
              />
            ))}
          </ul>
        </SectionCard>

        <p className="flex gap-1.5 text-xs text-ink-soft">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          Para sair de uma fazenda em que você não é dono, abra a fazenda e vá em Configurações &gt; Sua
          participação.
        </p>
      </div>

      <NewFarmDialog open={creating} onOpenChange={setCreating} {...newFarm} />
      <DeleteFarmDialog farm={deletingIsListed ? deleting : null} onClose={() => setDeleting(null)} />
    </div>
  );
}

interface FarmRowProps {
  farm: FarmOption;
  open: boolean;
  liveFarmCount: number;
  onOpen: () => void;
  onDelete: () => void;
}

function FarmRow({ farm, open, liveFarmCount, onOpen, onDelete }: FarmRowProps) {
  const label = farmLabel(farm);
  const owned = farm.role === "owner" && farm.joinedAt !== null;
  const verdict = deleteVerdict({ role: farm.role, liveFarmCount });

  return (
    <li className="flex items-center gap-3 px-4 py-3 md:gap-4">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft md:size-8"
      >
        <Tractor className="size-4 text-brand" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 md:w-60 md:shrink-0">
          <p className="truncate text-sm font-medium text-ink">{label}</p>
          {farm.municipality.trim() ? (
            <p className="truncate text-xs text-ink-soft">{farm.municipality}</p>
          ) : null}
        </div>
        {/* Phone: the pill takes the place of "desde". Desktop: "desde" stays and the pill gets its own column. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:flex-1 md:flex-col md:items-start">
          <RoleBadge role={farm.role} preset={farm.preset} />
          {open ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-healthy-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-healthy md:hidden">
              <StatusDot status="healthy" className="size-1.5" />
              Aberta agora
            </span>
          ) : null}
          {farm.joinedAt ? (
            <span className={cn("text-xs text-ink-soft", open && "hidden md:inline")}>
              desde {formatInstantDate(farm.joinedAt)}
            </span>
          ) : null}
        </div>
        {open ? (
          <span className="hidden items-center gap-1.5 rounded-md bg-healthy-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-healthy md:inline-flex">
            <StatusDot status="healthy" className="size-1.5" />
            Aberta agora
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {open ? null : (
          <Button type="button" variant="outline" className="min-h-11 md:min-h-0" onClick={onOpen}>
            Abrir
          </Button>
        )}
        {owned ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações da ${label}`}
                className="min-h-11 min-w-11 text-ink-soft hover:text-ink md:min-h-8 md:min-w-8"
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuItem variant="destructive" disabled={verdict !== "ok"} onSelect={onDelete}>
                <Trash2 aria-hidden />
                Excluir fazenda
              </DropdownMenuItem>
              {verdict === "last_farm" ? (
                <p className="px-2 pb-1.5 pl-[34px] text-xs text-pretty text-ink-soft">
                  Crie ou entre em outra fazenda antes de excluir esta.
                </p>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}
