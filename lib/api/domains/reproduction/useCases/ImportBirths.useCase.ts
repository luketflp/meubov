import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, breeds, calvings, weighings } from "@/lib/db/schema";
import { todayISO } from "@/lib/domain/dates";
import { breedKey } from "@/lib/domain/birthImport";
import { normalizeEarTag } from "@/lib/domain/earTags";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Sex } from "@/lib/types";

/** One line of a maternidade caderno, already matched by the preview. */
export interface ImportBirthInput {
  calfEarTag: string;
  calfSex: Sex;
  /** Raça name; matched to the farm's ignoring case and accents, created when new. */
  breed: string;
  lotId: string;
  /** Day of the parto: the calf's birth, its parto and its first weighing. */
  date: string;
  /** Absent, or not a female of the farm: the calf enters without a parto. */
  damId?: string;
  weightKg?: number;
  /** Present: the calf died — baixa por morte on `date` with this note. */
  deathNotes?: string;
}

/** What the import wrote, by calf brinco, for the dialog's last screen. */
export interface ImportBirthsResult {
  imported: string[];
  calvings: number;
  withoutDam: string[];
  deaths: string[];
  skipped: string[];
  createdBreeds: string[];
}

interface ImportBirthsUseCaseProps {
  farmId: number;
  rows: ImportBirthInput[];
}

type ImportBirthsUseCaseResponse = ImportBirthsResult | "future_date" | LotAssignmentError;

type CurrUseCase = _UseCase<ImportBirthsUseCaseProps, ImportBirthsUseCaseResponse>;

/**
 * Imports a maternidade caderno in one transaction. Add-only: a calf brinco
 * already on the farm, or repeated earlier in the batch, is skipped. A parto
 * dated after today or a lot that is missing, cross-farm or unplaced refuses
 * the batch before the first write.
 *
 * Every calf is a bezerro born on the parto date, in its lot. A dam that is not
 * a female of this farm degrades the line to calf only — the preview already
 * said so. Missing raças are created; birth weights become weighings dated the
 * parto; a dead calf goes in already inactive, with its baixa.
 */
export class ImportBirthsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ImportBirthsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, rows }) => {
    const today = todayISO();
    if (rows.some((row) => row.date > today)) return "future_date";

    return this.repository.transaction(async (tx) => {
      for (const lotId of new Set(rows.map((row) => row.lotId))) {
        const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId });
        if (lotError) return lotError;
      }

      const lines = rows.map((row) => ({ ...row, calfEarTag: normalizeEarTag(row.calfEarTag) }));
      const taken = await tx
        .select({ earTag: animals.earTag })
        .from(animals)
        .where(
          and(
            eq(animals.farmId, farmId),
            inArray(animals.earTag, [...new Set(lines.map((line) => line.calfEarTag))])
          )
        );
      const takenTags = new Set(taken.map((row) => row.earTag));

      const skipped: string[] = [];
      const skip = (earTag: string) => {
        if (!skipped.includes(earTag)) skipped.push(earTag);
      };
      const seen = new Set<string>();
      const toImport: ImportBirthInput[] = [];
      for (const line of lines) {
        if (takenTags.has(line.calfEarTag) || seen.has(line.calfEarTag)) {
          skip(line.calfEarTag);
          continue;
        }
        seen.add(line.calfEarTag);
        toImport.push(line);
      }
      const empty = { imported: [], calvings: 0, withoutDam: [], deaths: [], createdBreeds: [] };
      if (toImport.length === 0) return { ...empty, skipped };

      const damIds = [...new Set(toImport.flatMap((line) => (line.damId ? [line.damId] : [])))];
      const dams =
        damIds.length === 0
          ? []
          : await tx
              .select({ id: animals.id })
              .from(animals)
              .where(
                and(
                  eq(animals.farmId, farmId),
                  eq(animals.sex, "female"),
                  inArray(animals.id, damIds)
                )
              );
      const damSet = new Set(dams.map((dam) => dam.id));

      const farmBreeds = await tx
        .select({ name: breeds.name })
        .from(breeds)
        .where(eq(breeds.farmId, farmId));
      const breedByKey = new Map(farmBreeds.map((row) => [breedKey(row.name), row.name]));
      const createdBreeds: string[] = [];
      const breedFor = (raw: string): string => {
        const key = breedKey(raw);
        const known = breedByKey.get(key);
        if (known) return known;
        const name = raw.trim().replace(/\s+/g, " ");
        breedByKey.set(key, name);
        createdBreeds.push(name);
        return name;
      };
      const resolvedBreeds = toImport.map((line) => breedFor(line.breed));
      if (createdBreeds.length > 0) {
        await tx
          .insert(breeds)
          .values(createdBreeds.map((name) => ({ farmId, name })))
          .onConflictDoNothing();
      }

      const inserted = await tx
        .insert(animals)
        .values(
          toImport.map((line, index) => {
            const notes = line.deathNotes?.trim();
            return {
              id: randomUUID(),
              farmId,
              earTag: line.calfEarTag,
              category: "calf" as const,
              breed: resolvedBreeds[index],
              sex: line.calfSex,
              birthDate: line.date,
              lotId: line.lotId,
              active: line.deathNotes === undefined,
              ...(line.deathNotes === undefined
                ? {}
                : {
                    inactiveReason: "death" as const,
                    inactiveDate: line.date,
                    inactiveNotes: notes ? notes : null,
                  }),
            };
          })
        )
        .onConflictDoNothing({ target: [animals.farmId, animals.earTag] })
        .returning({ id: animals.id, earTag: animals.earTag });
      const idByTag = new Map(inserted.map((row) => [row.earTag, row.id]));

      // A concurrent registration can take a brinco after the check above;
      // those lines did not insert and are reported as skipped.
      const written = toImport.filter((line) => {
        if (idByTag.has(line.calfEarTag)) return true;
        skip(line.calfEarTag);
        return false;
      });

      const partos = written.flatMap((line) =>
        line.damId && damSet.has(line.damId)
          ? [{ animalId: line.damId, date: line.date, calfEarTag: line.calfEarTag }]
          : []
      );
      if (partos.length > 0) await tx.insert(calvings).values(partos);

      const firstWeighings = written.flatMap((line) =>
        line.weightKg === undefined
          ? []
          : [{ animalId: idByTag.get(line.calfEarTag)!, date: line.date, weightKg: line.weightKg }]
      );
      if (firstWeighings.length > 0) await tx.insert(weighings).values(firstWeighings);

      return {
        imported: written.map((line) => line.calfEarTag),
        calvings: partos.length,
        withoutDam: written
          .filter((line) => !line.damId || !damSet.has(line.damId))
          .map((line) => line.calfEarTag),
        deaths: written
          .filter((line) => line.deathNotes !== undefined)
          .map((line) => line.calfEarTag),
        skipped,
        createdBreeds,
      };
    });
  };
}
