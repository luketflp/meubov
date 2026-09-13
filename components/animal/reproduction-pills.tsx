/**
 * The two reproduction pills: the pregnancy diagnosis result and the breeding
 * type. Shared by the female's ficha ({@link AnimalReproduction}) and the
 * Reprodução page, so a cobertura reads the same on both screens.
 */
import type { DiagnosisResult, BreedingType } from "@/lib/types";
import {
  DIAGNOSIS_RESULT_LABEL,
  BREEDING_TYPE_LABEL,
} from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const RESULT_STYLE: Record<DiagnosisResult, string> = {
  pregnant: "bg-healthy-soft text-healthy",
  open: "border border-hairline bg-surface text-ink-soft",
  pending: "bg-attention-soft text-attention",
};

const BREEDING_STYLE: Record<BreedingType, string> = {
  timedAI: "bg-scheduled-soft text-scheduled",
  naturalMating: "bg-fmd-soft text-fmd",
};

export function ResultPill({ result }: { result: DiagnosisResult }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        RESULT_STYLE[result]
      )}
    >
      {DIAGNOSIS_RESULT_LABEL[result]}
    </span>
  );
}

export function BreedingPill({ type }: { type: BreedingType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        BREEDING_STYLE[type]
      )}
    >
      {BREEDING_TYPE_LABEL[type]}
    </span>
  );
}
