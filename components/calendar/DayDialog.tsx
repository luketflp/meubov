"use client";

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
import { weekdayName } from "@/components/calendar/helpers";

interface DayDialogProps {
  iso: string | null;
  treatments: Treatment[];
  onClose: () => void;
  onMarkDone: (id: string) => void;
}

/** Dialog with the full list of treatments of the day clicked on the grid. */
export function DayDialog({ iso, treatments, onClose, onMarkDone }: DayDialogProps) {
  return (
    <Dialog
      open={iso !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {iso !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>
                <span className="font-mono">{formatDate(iso)}</span> · {weekdayName(iso)}
              </DialogTitle>
              <DialogDescription>
                {treatments.length === 1
                  ? "1 tratamento neste dia"
                  : `${treatments.length} tratamentos neste dia`}
              </DialogDescription>
            </DialogHeader>
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
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
