import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  invernadas,
} from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import {
  toInvernada,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import {
  sanitizeBoundary,
  type InvalidBoundary,
} from "../_shared/boundary";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Invernada,
} from "@/lib/types";

/** Editable physical-pasture fields; null clears optional values. */
export interface InvernadaPatchInput {
  /** One-time correction of a LEGACY-* code synthesized at cutover. */
  code?: string;
  name?: string | null;
  grass?: string;
  hectares?: number;
  boundary?: [number, number][] | null;
}

export type InvernadaUpdateError =
  | InvalidBoundary
  | "duplicate_code"
  | "immutable_code"
  | "invalid_code"
  | "invalid_grass"
  | "invalid_name"
  | "empty_patch"
  | "not_found";

interface UpdateInvernadaUseCaseProps {
  farmId: number;
  id: string;
  patch: InvernadaPatchInput;
}

type UpdateInvernadaUseCaseResponse = Invernada | InvernadaUpdateError;

type CurrUseCase = _UseCase<UpdateInvernadaUseCaseProps, UpdateInvernadaUseCaseResponse>;

/** Updates one physical invernada and returns its complete domain shape. */
export class UpdateInvernadaUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateInvernadaUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const set: Partial<typeof invernadas.$inferInsert> = {};
    const code = patch.code?.trim();
    if (
      patch.code !== undefined &&
      (!code || code.toUpperCase().startsWith("LEGACY-"))
    ) {
      return "invalid_code";
    }
    if (patch.name !== undefined) {
      if (patch.name === null) {
        set.name = null;
      } else {
        const name = patch.name.trim();
        if (!name) return "invalid_name";
        set.name = name;
      }
    }
    if (patch.grass !== undefined) {
      const grass = patch.grass.trim();
      if (!grass) return "invalid_grass";
      set.grass = grass;
    }
    if (patch.hectares !== undefined) set.hectares = patch.hectares;
    if (patch.boundary !== undefined) {
      if (patch.boundary === null) {
        set.boundary = null;
      } else {
        const sanitized = sanitizeBoundary(patch.boundary);
        if (sanitized === "invalid") return "invalid_boundary";
        set.boundary = sanitized;
      }
    }
    return this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(invernadas)
        .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)))
        .for("update");
      if (!current) return "not_found";

      if (code !== undefined && code !== current.code) {
        if (!current.code.startsWith("LEGACY-")) return "immutable_code";
        set.code = code;
      }
      if (Object.keys(set).length === 0) return "empty_patch";

      try {
        const [row] = await tx
          .update(invernadas)
          .set(set)
          .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)))
          .returning();
        return toInvernada(row);
      } catch (error) {
        if (isUniqueViolation(error)) return "duplicate_code";
        throw error;
      }
    });
  };
}
