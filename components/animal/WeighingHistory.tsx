"use client";

/**
 * "Pesagens" of the "Editar animal" dialog: every weighing of the animal,
 * newest first, each one correctable in place. A weighing a manejo wrote shows
 * that manejo's pill, keeps the session's day and has no removal — reopening the
 * animal in the manejo takes it back; its kg and a priced venda's value follow
 * the correction.
 */
import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { Animal } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { weighingSessions } from "@/lib/domain/manejoDetail";
import { weighingError } from "@/lib/domain/weights";
import { sessionKind } from "@/components/manejo/helpers";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Which row is open, and for what. */
type RowMode = { weighingId: number; kind: "edit" | "remove" } | null;

export function WeighingHistory({ animal }: { animal: Animal }) {
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const editWeighing = useHerdStore((s) => s.editWeighing);
  const removeWeighing = useHerdStore((s) => s.removeWeighing);
  const { addToast } = useToast();

  const [mode, setMode] = useState<RowMode>(null);
  const [date, setDate] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sessionByWeighing = useMemo(() => weighingSessions(manejoSessions), [manejoSessions]);
  const rows = animal.weighings
    .filter((w): w is typeof w & { id: number } => w.id !== undefined)
    .reverse();

  function open(weighingId: number, kind: "edit" | "remove") {
    const current = rows.find((w) => w.id === weighingId);
    setMode({ weighingId, kind });
    setDate(current?.date ?? "");
    setWeight(current ? String(current.weightKg) : "");
    setError(null);
  }

  function close() {
    setMode(null);
    setError(null);
  }

  async function onSave(event: FormEvent<HTMLFormElement>, weighingId: number) {
    event.preventDefault();
    const input = { date, weightKg: weight.trim() === "" ? Number.NaN : Number(weight) };
    const invalid = weighingError(input, { birthDate: animal.birthDate, todayIso: todayISO() });
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await editWeighing(animal.earTag, weighingId, input);
      addToast({ messageType: "success", text: `Pesagem de ${formatDate(input.date)} corrigida` });
      close();
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(weighingId: number, day: string) {
    setSaving(true);
    try {
      await removeWeighing(animal.earTag, weighingId);
      addToast({ messageType: "success", text: `Pesagem de ${formatDate(day)} excluída` });
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 border-t border-hairline pt-4">
      <p className="text-sm font-medium text-ink">Pesagens</p>
      <p className="mt-0.5 text-xs text-ink-soft">
        Corrija a data ou o peso de uma pesagem. As de um manejo mantêm a data do manejo e
        saem reabrindo o animal nele.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-ink-soft">Nenhuma pesagem registrada.</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {rows.map((w) => {
            const session = sessionByWeighing.get(w.id);
            const editing = mode?.weighingId === w.id && mode.kind === "edit";
            const removing = mode?.weighingId === w.id && mode.kind === "remove";

            if (editing) {
              return (
                <li key={w.id} className="py-2">
                  <form
                    onSubmit={(event) => onSave(event, w.id)}
                    noValidate
                    className="grid gap-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        aria-label="Data da pesagem"
                        value={date}
                        min={animal.birthDate}
                        max={todayISO()}
                        disabled={session !== undefined}
                        onChange={(e) => setDate(e.target.value)}
                        className="min-h-11 font-mono"
                      />
                      <Input
                        type="number"
                        aria-label="Peso (kg)"
                        inputMode="decimal"
                        min="1"
                        step="0.5"
                        value={weight}
                        autoFocus
                        onChange={(e) => setWeight(e.target.value)}
                        className="min-h-11 font-mono"
                      />
                    </div>
                    {session ? (
                      <p className="text-xs text-ink-soft">
                        A data segue o manejo “{session.name}”.
                      </p>
                    ) : null}
                    {error ? <p className="text-xs text-overdue">{error}</p> : null}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" className="min-h-11" onClick={close}>
                        Cancelar
                      </Button>
                      <Button type="submit" className="min-h-11" disabled={saving}>
                        {saving ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </form>
                </li>
              );
            }

            if (removing) {
              return (
                <li key={w.id} className="flex min-h-11 flex-wrap items-center gap-2 py-2">
                  <p className="min-w-0 flex-1 text-sm text-ink">
                    Excluir a pesagem de{" "}
                    <span className="font-mono">{formatDate(w.date)}</span>?
                  </p>
                  <Button type="button" variant="outline" className="min-h-11" onClick={close}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 text-overdue hover:text-overdue"
                    disabled={saving}
                    onClick={() => onRemove(w.id, w.date)}
                  >
                    {saving ? "Excluindo…" : "Excluir"}
                  </Button>
                </li>
              );
            }

            return (
              <li key={w.id} className="flex min-h-11 items-center gap-3 py-1.5">
                <span className="w-20 shrink-0 font-mono text-xs text-ink-soft">
                  {formatDate(w.date)}
                </span>
                <span className="font-mono text-sm font-medium text-ink">
                  {/* The kg as typed: a correction of half a kilo must show. */}
                  {formatNumber(w.weightKg, Number.isInteger(w.weightKg) ? 0 : 1)} kg
                </span>
                <span className="min-w-0 flex-1">
                  {session ? (
                    <ManejoTypePill action={sessionKind(session)} className="max-w-full" />
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Corrigir pesagem de ${formatDate(w.date)}`}
                  className="size-9 shrink-0 text-ink-soft hover:text-ink"
                  onClick={() => open(w.id, "edit")}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                {session ? (
                  <span className="size-9 shrink-0" aria-hidden />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Excluir pesagem de ${formatDate(w.date)}`}
                    className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                    onClick={() => open(w.id, "remove")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
