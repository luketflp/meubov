"use client";

/**
 * The /convites screen: answer each convite, or — with none left — create a
 * farm of one's own. Accepting stores the farm as the active one and reloads
 * into the app, so the herd store hydrates from that farm.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { MailX, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { setActiveFarmId } from "@/lib/api/activeFarm";
import type { MyInvites } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import { useSignOut } from "@/lib/auth/navigation";
import { farmLabel } from "@/lib/domain/farms";
import type { NewFarmInput } from "@/lib/store/useHerdStore";
import { FIRST_FARM_DESCRIPTION, NewFarmDialog } from "@/components/farms/NewFarmDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NELORE_HEAD_VIEWBOX, NeloreMark } from "@/components/ui/nelore-mark";
import { InviteCard } from "@/components/invites/InviteCard";

export function InvitesScreen({ email }: { email: string }) {
  const signOut = useSignOut();
  const [mine, setMine] = useState<MyInvites | null>(null);
  const [declinedFarm, setDeclinedFarm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void api.invites.get().then(({ data, error }) => {
      if (error) {
        toast.error("Não foi possível carregar os convites.");
        return;
      }
      setMine(data);
    });
  }, []);

  /** Stores the farm as active and reloads the app into `path`. */
  function enter(farmId: number, path: "/dashboard" | "/settings") {
    setActiveFarmId(farmId);
    window.location.assign(path);
  }

  async function accept(id: number) {
    setBusy(true);
    const { data, error } = await api.invites({ id }).accept.post();
    if (error || !data) {
      setBusy(false);
      toast.error("Este convite não está mais disponível.");
      setMine((current) => current && { ...current, invites: current.invites.filter((i) => i.id !== id) });
      return;
    }
    enter(data.farmId, "/dashboard");
  }

  async function decline(id: number, farmName: string) {
    setBusy(true);
    const { error } = await api.invites({ id }).decline.post();
    setBusy(false);
    if (error) {
      toast.error("Não foi possível recusar o convite.");
      return;
    }
    setDeclinedFarm(farmName);
    setMine((current) => current && { ...current, invites: current.invites.filter((i) => i.id !== id) });
  }

  // No herd store runs here: the new farm is stored as active and the app reloads into its Configurações.
  async function createFarm(input: NewFarmInput) {
    const { data, error } = await api.farms.post({
      name: input.name,
      municipality: input.municipality,
    });
    if (error || !data) {
      toast.error("Não foi possível criar a fazenda.");
      throw new Error(`create farm failed (status ${error?.status})`);
    }
    // Keep the button disabled through the redirect: the dialog closes before
    // window.location.assign completes, and POST /farms is not idempotent.
    setBusy(true);
    enter(data.farmId, "/settings");
  }

  const count = mine?.invites.length ?? 0;

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-panel">
            <NeloreMark
              viewBox={NELORE_HEAD_VIEWBOX}
              maskId="nelore-convites"
              durationMs={2500}
              loop={false}
              className="size-[26px] shrink-0"
              style={{ display: "block", overflow: "hidden" }}
            />
          </span>
          <p className="font-heading text-lg leading-none font-semibold text-ink">MeuBov</p>
        </div>

        {mine === null ? (
          <p className="text-sm text-ink-soft">Carregando convites…</p>
        ) : count > 0 ? (
          <>
            <header>
              <h1 className="font-heading text-2xl font-semibold text-ink">
                {count === 1 ? "Você tem um convite" : `Você tem ${count} convites`}
              </h1>
              <p className="mt-0.5 text-sm text-ink-soft">
                Aceite para entrar na fazenda e começar a trabalhar.
              </p>
            </header>
            {mine.invites.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                busy={busy}
                onAccept={() => accept(invite.id)}
                onDecline={() => decline(invite.id, farmLabel({ id: invite.farmId, name: invite.farmName }))}
              />
            ))}
          </>
        ) : (
          <section className="flex flex-col gap-2 rounded-lg border border-hairline bg-panel p-4">
            <EmptyState
              icon={MailX}
              title="Nenhum convite pendente"
              description={
                mine.hasFarm
                  ? "Os convites que você recebeu já foram respondidos."
                  : declinedFarm
                    ? `Você recusou o convite da ${declinedFarm}. Para usar o MeuBov na sua própria fazenda, crie uma agora.`
                    : "Para usar o MeuBov na sua própria fazenda, crie uma agora."
              }
            />
            {mine.hasFarm ? (
              <Button asChild className="min-h-11 w-full">
                <Link href="/dashboard">Ir para o painel</Link>
              </Button>
            ) : (
              <Button type="button" className="min-h-11 w-full" onClick={() => setCreating(true)} disabled={busy}>
                <Plus aria-hidden />
                Criar minha fazenda
              </Button>
            )}
          </section>
        )}

        <p className="text-center text-xs text-ink-soft">
          Convites para <span className="text-ink">{email}</span> ·{" "}
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-medium text-brand hover:underline"
          >
            Sair
          </button>
        </p>
      </div>

      <NewFarmDialog
        open={creating}
        onOpenChange={setCreating}
        source={null}
        description={FIRST_FARM_DESCRIPTION}
        onSubmit={createFarm}
      />
    </main>
  );
}
