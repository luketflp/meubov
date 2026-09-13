"use client";

/**
 * Tratamentos do calendário route: the applications marked feito on the
 * Calendário sanitário that share a day, type and name with treatment `[id]`,
 * opened from the Histórico de manejos.
 */
import { useParams } from "next/navigation";
import { CalendarTreatmentsDetail } from "@/components/manejo/calendar-treatments-detail";

export default function CalendarTreatmentsPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <CalendarTreatmentsDetail treatmentId={params.id} />
    </div>
  );
}
