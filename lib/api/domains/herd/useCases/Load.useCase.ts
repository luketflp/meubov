/**
 * Read path of the herd API: assembles the whole HerdData of a farm.
 *
 * One parallel round of farm-scoped selects; animal children are scoped by
 * joining through `animals` (they carry no farm_id of their own). Weighings
 * come sorted asc from SQL, matching the domain invariant.
 */
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  animals,
  attachments,
  bankAccounts,
  breedings,
  breeds,
  calvings,
  customCategories,
  expenseSeries,
  expenses,
  farm,
  healthProtocols,
  invernadas,
  lotPlacements,
  lots,
  manejoSessionAnimals,
  manejoSessions,
  movements,
  pregnancyDiagnoses,
  semenBulls,
  semenPurchases,
  statementImports,
  statementLines,
  transfers,
  treatments,
  weighings,
} from "@/lib/db/schema";
import type { HerdData, ReproductionRecord, SemenPurchase, Weighing } from "@/lib/types";
import { herdMovements } from "@/lib/domain/movements";
import { todayISO } from "@/lib/domain/dates";
import { pairKey } from "@/lib/domain/statements/match";
import { TopUpSeriesUseCase } from "@/lib/api/domains/expenses/useCases/TopUpSeries.useCase";
import {
  toAccount,
  toAnimal,
  toBankAccount,
  toBreeding,
  toCalving,
  toCustomCategory,
  toDiagnosis,
  toExpense,
  toFarmData,
  toInvernada,
  toLot,
  toLotPlacement,
  toManejoSession,
  toManejoSessionAnimal,
  toMovement,
  toProtocol,
  toSemenBull,
  toSemenPurchase,
  toTransfer,
  toTreatment,
  toWeighing,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface LoadHerdUseCaseProps {
  farmId: number;
}

type LoadHerdUseCaseResponse = HerdData;

type CurrUseCase = _UseCase<LoadHerdUseCaseProps, LoadHerdUseCaseResponse>;

/** Assembles the whole HerdData of one farm in a single parallel read. */
export class LoadHerdUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("LoadHerdUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId }) => {
    // Recorrências keep a year of bills ahead in Contas: write what now falls in the window.
    // A failure there never blocks the load: the next one tries again.
    try {
      await new TopUpSeriesUseCase(this.repository).run({ farmId, todayIso: todayISO() });
    } catch (error) {
      console.error("[recorrências] top-up failed", farmId, error);
    }

    const [
      farmRows,
      animalRows,
      lotRows,
      invernadaRows,
      lotPlacementRows,
      breedRows,
      movementRows,
      protocolRows,
      sessionRows,
      expenseRows,
      customCategoryRows,
      weighingRows,
      treatmentRows,
      breedingRows,
      diagnosisRows,
      calvingRows,
      sessionAnimalRows,
      semenBullRows,
      semenPurchaseRows,
      accountRows,
      seriesRows,
      attachmentCountRows,
      bankAccountRows,
      transferRows,
      lineSummaryRows,
      reconciledRows,
    ] = await Promise.all([
      this.repository.select().from(farm).where(eq(farm.id, farmId)),
      this.repository.select().from(animals).where(eq(animals.farmId, farmId)).orderBy(asc(animals.earTag)),
      this.repository.select().from(lots).where(eq(lots.farmId, farmId)).orderBy(asc(lots.id)),
      this.repository
        .select()
        .from(invernadas)
        .where(eq(invernadas.farmId, farmId))
        .orderBy(asc(invernadas.code), asc(invernadas.id)),
      this.repository
        .select()
        .from(lotPlacements)
        .where(eq(lotPlacements.farmId, farmId))
        .orderBy(
          asc(lotPlacements.startedOn),
          asc(lotPlacements.lotId),
          asc(lotPlacements.id)
        ),
      this.repository.select().from(breeds).where(eq(breeds.farmId, farmId)).orderBy(asc(breeds.name)),
      this.repository.select().from(movements).where(eq(movements.farmId, farmId)).orderBy(asc(movements.date)),
      this.repository
        .select()
        .from(healthProtocols)
        .where(eq(healthProtocols.farmId, farmId))
        .orderBy(asc(healthProtocols.id)),
      this.repository
        .select()
        .from(manejoSessions)
        .where(and(eq(manejoSessions.farmId, farmId), isNull(manejoSessions.deletedAt)))
        .orderBy(asc(manejoSessions.date), asc(manejoSessions.id)),
      this.repository
        .select()
        .from(expenses)
        .where(eq(expenses.farmId, farmId))
        .orderBy(asc(expenses.date), asc(expenses.id)),
      this.repository
        .select()
        .from(customCategories)
        .where(eq(customCategories.farmId, farmId))
        .orderBy(asc(customCategories.name)),
      this.repository
        .select({ row: weighings })
        .from(weighings)
        .innerJoin(animals, eq(weighings.animalId, animals.id))
        .where(and(eq(animals.farmId, farmId), isNull(weighings.deletedAt)))
        .orderBy(asc(weighings.date), asc(weighings.id)),
      this.repository
        .select({ row: treatments, earTag: animals.earTag })
        .from(treatments)
        .innerJoin(animals, eq(treatments.animalId, animals.id))
        .where(and(eq(animals.farmId, farmId), isNull(treatments.deletedAt)))
        .orderBy(asc(treatments.date)),
      this.repository
        .select({ row: breedings })
        .from(breedings)
        .innerJoin(animals, eq(breedings.animalId, animals.id))
        .where(eq(animals.farmId, farmId))
        .orderBy(asc(breedings.date)),
      this.repository
        .select({ row: pregnancyDiagnoses, animalId: breedings.animalId })
        .from(pregnancyDiagnoses)
        .innerJoin(breedings, eq(pregnancyDiagnoses.breedingId, breedings.id))
        .innerJoin(animals, eq(breedings.animalId, animals.id))
        .where(eq(animals.farmId, farmId))
        .orderBy(asc(pregnancyDiagnoses.date)),
      this.repository
        .select({ row: calvings })
        .from(calvings)
        .innerJoin(animals, eq(calvings.animalId, animals.id))
        .where(eq(animals.farmId, farmId))
        .orderBy(asc(calvings.date)),
      this.repository
        .select({ row: manejoSessionAnimals, earTag: animals.earTag })
        .from(manejoSessionAnimals)
        .innerJoin(manejoSessions, eq(manejoSessionAnimals.sessionId, manejoSessions.id))
        .innerJoin(animals, eq(manejoSessionAnimals.animalId, animals.id))
        .where(and(eq(manejoSessions.farmId, farmId), isNull(manejoSessions.deletedAt)))
        .orderBy(asc(manejoSessionAnimals.position)),
      this.repository
        .select()
        .from(semenBulls)
        .where(eq(semenBulls.farmId, farmId))
        .orderBy(asc(semenBulls.name)),
      this.repository
        .select({ row: semenPurchases })
        .from(semenPurchases)
        .innerJoin(semenBulls, eq(semenPurchases.bullId, semenBulls.id))
        .where(eq(semenBulls.farmId, farmId))
        .orderBy(asc(semenPurchases.date), asc(semenPurchases.id)),
      this.repository
        .select()
        .from(accounts)
        .where(eq(accounts.farmId, farmId))
        .orderBy(asc(accounts.group), asc(accounts.name)),
      this.repository.select().from(expenseSeries).where(eq(expenseSeries.farmId, farmId)),
      this.repository
        .select({ expenseId: attachments.expenseId, total: count() })
        .from(attachments)
        .where(eq(attachments.farmId, farmId))
        .groupBy(attachments.expenseId),
      this.repository
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.farmId, farmId))
        .orderBy(asc(bankAccounts.createdAt), asc(bankAccounts.id)),
      this.repository
        .select()
        .from(transfers)
        .where(eq(transfers.farmId, farmId))
        .orderBy(asc(transfers.date), asc(transfers.id)),
      // Per conta: how many linhas wait, and the dates "conciliado até" comes from.
      this.repository
        .select({
          bankAccountId: statementLines.bankAccountId,
          pending: sql<number>`count(*) filter (where ${statementLines.status} = 'pending')`.mapWith(Number),
          firstDate: sql<string | null>`min(${statementLines.date})::text`,
          firstPendingDate: sql<string | null>`(min(${statementLines.date}) filter (where ${statementLines.status} = 'pending'))::text`,
          lastDate: sql<string | null>`max(${statementLines.date})::text`,
          // The oldest import still holding a pending linha, and the latest import.
          pendingImportId: sql<string | null>`(array_agg(${statementLines.importId} order by ${statementImports.createdAt}, ${statementImports.id}) filter (where ${statementLines.status} = 'pending'))[1]`,
          lastImportId: sql<string | null>`(array_agg(${statementLines.importId} order by ${statementImports.createdAt} desc, ${statementImports.id} desc))[1]`,
        })
        .from(statementLines)
        .innerJoin(statementImports, eq(statementImports.id, statementLines.importId))
        .where(eq(statementLines.farmId, farmId))
        .groupBy(statementLines.bankAccountId),
      this.repository
        .select({
          bankAccountId: statementLines.bankAccountId,
          expenseId: statementLines.expenseId,
          movementId: statementLines.movementId,
          transferId: statementLines.transferId,
        })
        .from(statementLines)
        .where(
          and(
            eq(statementLines.farmId, farmId),
            inArray(statementLines.status, ["matched", "created", "transfer"])
          )
        ),
    ]);

    const weighingsByAnimal = new Map<string, Weighing[]>();
    for (const { row } of weighingRows) {
      const list = weighingsByAnimal.get(row.animalId) ?? [];
      list.push(toWeighing(row));
      weighingsByAnimal.set(row.animalId, list);
    }

    const reproductionByAnimal = new Map<string, ReproductionRecord>();
    const reproductionOf = (animalId: string): ReproductionRecord => {
      let record = reproductionByAnimal.get(animalId);
      if (!record) {
        record = { breedings: [], diagnoses: [], calvings: [] };
        reproductionByAnimal.set(animalId, record);
      }
      return record;
    };
    for (const { row } of breedingRows) reproductionOf(row.animalId).breedings.push(toBreeding(row));
    for (const { row, animalId } of diagnosisRows) reproductionOf(animalId).diagnoses.push(toDiagnosis(row));
    for (const { row } of calvingRows) reproductionOf(row.animalId).calvings.push(toCalving(row));

    const sessionAnimalsBySession = new Map<
      string,
      ReturnType<typeof toManejoSessionAnimal>[]
    >();
    for (const { row, earTag } of sessionAnimalRows) {
      const list = sessionAnimalsBySession.get(row.sessionId) ?? [];
      list.push(toManejoSessionAnimal(row, earTag));
      sessionAnimalsBySession.set(row.sessionId, list);
    }

    const purchasesByBull = new Map<string, SemenPurchase[]>();
    for (const { row } of semenPurchaseRows) {
      const list = purchasesByBull.get(row.bullId) ?? [];
      list.push(toSemenPurchase(row));
      purchasesByBull.set(row.bullId, list);
    }

    const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
    const linesByAccount = new Map(lineSummaryRows.map((row) => [row.bankAccountId, row]));
    const attachmentsByExpense = new Map(
      attachmentCountRows.map((row) => [row.expenseId, row.total])
    );

    const herdAnimals = animalRows.map((row) =>
      toAnimal(row, weighingsByAnimal.get(row.id) ?? [], reproductionByAnimal.get(row.id))
    );
    const herdLots = lotRows.map(toLot);
    const sessions = sessionRows.map((row) =>
      toManejoSession(row, sessionAnimalsBySession.get(row.id) ?? [])
    );

    return {
      animals: herdAnimals,
      treatments: treatmentRows.map(({ row, earTag }) => toTreatment(row, earTag)),
      lots: herdLots,
      // A removed invernada only names the past placements that still point at it.
      invernadas: invernadaRows.filter((row) => row.removedAt === null).map(toInvernada),
      removedInvernadas: invernadaRows.filter((row) => row.removedAt !== null).map(toInvernada),
      lotPlacements: lotPlacementRows.map(toLotPlacement),
      // The ledger is the legacy rows plus what the manejo sessions moved: head
      // count and category always come from the animals that actually passed.
      movements: herdMovements(
        movementRows.map(toMovement),
        sessions,
        herdAnimals,
        new Map(herdLots.map((lot) => [lot.id, lot.name]))
      ),
      breeds: breedRows.map((row) => row.name),
      protocols: protocolRows.map(toProtocol),
      manejoSessions: sessions,
      expenses: expenseRows.map((row) =>
        toExpense(
          row,
          row.seriesId === null ? undefined : seriesById.get(row.seriesId),
          attachmentsByExpense.get(row.id) ?? 0
        )
      ),
      accounts: accountRows.map(toAccount),
      bankAccounts: bankAccountRows.map((row) => toBankAccount(row, linesByAccount.get(row.id))),
      transfers: transferRows.map(toTransfer),
      reconciledIds: reconciledRows.map(pairKey).filter((key): key is string => key !== undefined),
      customCategories: customCategoryRows.map(toCustomCategory),
      semenBulls: semenBullRows.map((row) => toSemenBull(row, purchasesByBull.get(row.id) ?? [])),
      farm: farmRows.length
        ? toFarmData(farmRows[0])
        : { name: "", municipality: "", stateRegistration: "", manager: "" },
    };
  };
}
