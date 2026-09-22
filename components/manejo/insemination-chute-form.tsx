"use client";

/**
 * Inseminação chute form: the cow in the brete takes one dose. The operator
 * picks the bull on a chip — the chips are the touros picked when the
 * inseminação opened, the first comes marked, and the pick stays from cow to
 * cow, so a morning with one bull is one tap per cow — then taps "Inseminar"
 * or "Pular". Each chip reads the bull's doses left live from the store; when
 * the picked bull runs out the pick drops and a notice asks for another, or
 * says the touros are over, instead of the server refusing the next cow. The
 * cow herself can be edited on the spot, a baixa included (chute-animal.tsx).
 *
 * Also here, for the runner and the record: the "Doses usadas hoje" line, the
 * cobertura a pass recorded and the title with the lote of the cows.
 */
import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { Animal, Breeding, Lot, ManejoSession, ManejoSessionAnimal } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { inseminationBulls, predominantLotId, sessionDosesByBull } from "@/lib/domain/semen";
import { formatNumber } from "@/lib/domain/format";
import { breedLabel, ChuteEditAnimal } from "@/components/manejo/chute-animal";
import { AttentionNotice } from "@/components/semen/attention-notice";
import { BULL_CHIP_GRID, BullChip } from "@/components/semen/bull-chip";
import { useSemenStock } from "@/components/semen/use-semen-stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";

/** "Inseminação · Matrizes com cria": the manejo and the lote most of its cows are in now. */
export function inseminationTitle(session: ManejoSession, animals: Animal[], lots: Lot[]): string {
  const lotId = predominantLotId(
    session.animals.map((entry) => entry.earTag),
    animals
  );
  const lot = lots.find((item) => item.id === lotId);
  return lot ? `${session.name} · ${lot.name}` : session.name;
}

/** The cobertura an inseminação pass recorded, found on the cow's record. */
export function passBreeding(
  entry: ManejoSessionAnimal,
  cow: Animal | undefined
): Breeding | undefined {
  if (entry.breedingId === undefined) return undefined;
  return cow?.reproduction?.breedings.find((breeding) => breeding.id === entry.breedingId);
}

/** "Doses usadas hoje · Tufão da Serra 11 · Diamante MB 3", under the progress bar. */
export function DosesUsedToday({ session }: { session: ManejoSession }) {
  const animals = useHerdStore((s) => s.animals);
  const { bulls } = useSemenStock();
  const used = useMemo(() => sessionDosesByBull(session, animals), [session, animals]);
  if (used.size === 0) return null;
  const nameById = new Map(bulls.map((bull) => [bull.id, bull.name]));
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-hairline pt-3 text-xs text-ink">
      <span className="font-medium text-ink-soft">Doses usadas hoje</span>
      {[...used].map(([bullId, doses]) => (
        <span key={bullId} className="inline-flex items-baseline gap-1.5">
          {nameById.get(bullId) ?? "—"}
          <span className="font-mono font-medium">{formatNumber(doses)}</span>
        </span>
      ))}
    </p>
  );
}

interface InseminationChuteFormProps {
  session: ManejoSession;
  /** The cow in the brete now. */
  entry: ManejoSessionAnimal;
  /** Called after each pass, inseminated or skipped, so the queue moves on. */
  onDone: () => void;
  /** Called after the cow was edited, with her ear tag now, so a rename keeps her in the brete. */
  onSaved: (earTag: string) => void;
}

export function InseminationChuteForm({
  session,
  entry,
  onDone,
  onSaved,
}: InseminationChuteFormProps) {
  const cow = useHerdStore((s) => s.animals.find((a) => a.earTag === entry.earTag));
  const lots = useHerdStore((s) => s.lots);
  const completeManejoAnimal = useHerdStore((s) => s.completeManejoAnimal);
  const skipManejoAnimal = useHerdStore((s) => s.skipManejoAnimal);
  const { bulls: registered, dosesLeft } = useSemenStock();
  // The touros picked when the inseminação opened: the brete offers no other.
  const bulls = useMemo(() => inseminationBulls(session, registered), [session, registered]);

  const [pickedId, setPickedId] = useState<string | null>(session.semenBullIds?.[0] ?? null);
  const [note, setNote] = useState("");
  /** True while a pass is in flight — a chute action must not double-fire. */
  const [busy, setBusy] = useState(false);

  const picked = bulls.find((bull) => bull.id === pickedId);
  const soldOut = picked !== undefined && dosesLeft(picked.id) <= 0 ? picked : undefined;
  const allOut = bulls.length > 0 && bulls.every((bull) => dosesLeft(bull.id) <= 0);
  const bullId = picked !== undefined && soldOut === undefined ? picked.id : null;
  const lotName = lots.find((lot) => lot.id === cow?.lotId)?.name;

  async function onInseminate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || bullId === null) return;
    setBusy(true);
    try {
      const saved = await completeManejoAnimal(session.id, entry.earTag, {
        semenBullId: bullId,
        notes: note.trim() === "" ? undefined : note.trim(),
      });
      // Nothing saved (say the bull ran out meanwhile): the cow and her note stay in the brete.
      if (!saved) return;
      setNote("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    if (busy) return;
    setBusy(true);
    try {
      await skipManejoAnimal(
        session.id,
        entry.earTag,
        note.trim() === "" ? undefined : note.trim()
      );
      setNote("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="No brete agora">
      <div className="space-y-4">
        {/* Outside the chute form: the edit dialog's own submit would bubble
            through the portal into it and inseminate the cow. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-3xl font-semibold text-ink">{entry.earTag}</span>
          {cow ? (
            <span className="text-sm text-ink-soft">
              {CATEGORY_LABEL[cow.category]}
              {` · ${breedLabel(cow)}`}
              {lotName ? ` · ${lotName}` : ""}
            </span>
          ) : null}
          {cow ? (
            <ChuteEditAnimal
              key={cow.id}
              sessionId={session.id}
              animal={cow}
              onSaved={onSaved}
              onBaixa={() => {
                setNote("");
                onDone();
              }}
            />
          ) : null}
        </div>

        <form onSubmit={onInseminate} className="space-y-4">
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-ink">Touro</legend>
            <div className={BULL_CHIP_GRID}>
              {bulls.map((bull) => (
                <BullChip
                  key={bull.id}
                  bull={bull}
                  left={dosesLeft(bull.id)}
                  selected={bull.id === bullId}
                  onClick={() => setPickedId(bull.id)}
                />
              ))}
            </div>
            {bulls.length === 0 ? (
              <AttentionNotice className="mt-1">
                Os touros desta inseminação não estão mais cadastrados.
              </AttentionNotice>
            ) : allOut ? (
              <AttentionNotice className="mt-1">
                {bulls.length === 1 ? `${bulls[0].name} acabou.` : "Os touros desta inseminação acabaram."}{" "}
                Pule as vacas que faltam ou registre uma compra na aba Touros.
              </AttentionNotice>
            ) : soldOut ? (
              <AttentionNotice className="mt-1">
                {soldOut.name} acabou. Escolha outro touro para continuar.
              </AttentionNotice>
            ) : null}
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="pass-note">Observação (opcional)</Label>
            <Input
              id="pass-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: corrimento, vaca agitada…"
              className="min-h-11"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={busy || bullId === null}
              className="min-h-12 flex-1 sm:flex-none sm:px-8"
            >
              <CheckCircle2 aria-hidden />
              Inseminar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              disabled={busy}
              onClick={onSkip}
            >
              Pular (não passou)
            </Button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
