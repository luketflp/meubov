"use client";

import { useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TreatmentRow } from "@/components/calendar/TreatmentRow";
import { ScheduleTreatmentForm } from "@/components/calendar/ScheduleTreatmentForm";
import { weekdayName } from "@/components/calendar/helpers";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/providers/Toasts";

interface DayDialogProps {
  iso: string | null;
  treatments: Treatment[];
  onClose: () => void;
  onMarkDone: (id: string) => void;
}

/** Dialog with the full list of treatments of the day clicked on the grid. */
export function DayDialog({ iso, treatments, onClose, onMarkDone }: DayDialogProps) {
  const [scheduling, setScheduling] = useState(false);
  const { addToast } = useToast();

  function close(): void {
    setScheduling(false);
    onClose();
  }

  return (
    <Dialog
      open={iso !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        {iso !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {scheduling ? (
                  "Agendar tratamento"
                ) : (
                  <>
                    <span className="font-mono">{formatDate(iso)}</span> · {weekdayName(iso)}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {scheduling
                  ? `Novo agendamento para ${formatDate(iso)}.`
                  : treatments.length === 1
                    ? "1 tratamento neste dia"
                    : `${treatments.length} tratamentos neste dia`}
              </DialogDescription>
            </DialogHeader>
            {scheduling ? (
              <ScheduleTreatmentForm
                date={iso}
                onCancel={() => setScheduling(false)}
                onScheduled={(count) => {
                  addToast({
                    messageType: "success",
                    text:
                      count === 1
                        ? "Tratamento agendado para 1 animal"
                        : `Tratamento agendado para ${count} animais`,
                  });
                  setScheduling(false);
                }}
              />
            ) : (
              <>
                {treatments.length === 0 ? (
                  <EmptyState
                    icon={CalendarPlus}
                    title="Nenhum tratamento neste dia"
                    description="Crie um agendamento usando um protocolo ou um tratamento avulso."
                    className="py-7"
                  />
                ) : (
                  <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
                    {treatments.map((t) => (
                      <TreatmentRow
                        key={t.id}
                        treatment={t}
                        status={deriveTreatmentStatus(t, todayISO())}
                        onMarkDone={onMarkDone}
                      />
                    ))}
                  </ul>
                )}
                <Button
                  type="button"
                  onClick={() => setScheduling(true)}
                  className="min-h-11 w-full md:min-h-8"
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  Agendar tratamento
                </Button>
              </>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
