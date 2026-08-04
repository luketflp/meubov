/**
 * Read path of the herd API: assembles the whole HerdData of a farm.
 *
 * One parallel round of farm-scoped selects; animal children are scoped by
 * joining through `animals` (they carry no farm_id of their own). Weighings
 * come sorted asc from SQL, matching the domain invariant.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  animals,
  breedings,
  breeds,
  calvings,
  customCategories,
  expenses,
  farm,
  healthProtocols,
  lots,
  manejoSessionAnimals,
  manejoSessions,
  movements,
  pregnancyDiagnoses,
  treatments,
  weighings,
} from "@/lib/db/schema";
import type { HerdData, ReproductionRecord, Weighing } from "@/lib/types";
import {
  toAnimal,
  toBreeding,
  toCalving,
  toCustomCategory,
  toDiagnosis,
  toExpense,
  toFarmData,
  toLot,
  toManejoSession,
  toManejoSessionAnimal,
  toMovement,
  toProtocol,
  toTreatment,
  toWeighing,
} from "@/lib/api/services/mappers";

export async function loadHerdData(farmId: number): Promise<HerdData> {
  const [
    farmRows,
    animalRows,
    lotRows,
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
  ] = await Promise.all([
    db.select().from(farm).where(eq(farm.id, farmId)),
    db.select().from(animals).where(eq(animals.farmId, farmId)).orderBy(asc(animals.earTag)),
    db.select().from(lots).where(eq(lots.farmId, farmId)).orderBy(asc(lots.id)),
    db.select().from(breeds).where(eq(breeds.farmId, farmId)).orderBy(asc(breeds.name)),
    db.select().from(movements).where(eq(movements.farmId, farmId)).orderBy(asc(movements.date)),
    db
      .select()
      .from(healthProtocols)
      .where(eq(healthProtocols.farmId, farmId))
      .orderBy(asc(healthProtocols.id)),
    db
      .select()
      .from(manejoSessions)
      .where(eq(manejoSessions.farmId, farmId))
      .orderBy(asc(manejoSessions.date), asc(manejoSessions.id)),
    db
      .select()
      .from(expenses)
      .where(eq(expenses.farmId, farmId))
      .orderBy(asc(expenses.date), asc(expenses.id)),
    db
      .select()
      .from(customCategories)
      .where(eq(customCategories.farmId, farmId))
      .orderBy(asc(customCategories.name)),
    db
      .select({ row: weighings })
      .from(weighings)
      .innerJoin(animals, eq(weighings.animalId, animals.id))
      .where(eq(animals.farmId, farmId))
      .orderBy(asc(weighings.date), asc(weighings.id)),
    db
      .select({ row: treatments, earTag: animals.earTag })
      .from(treatments)
      .innerJoin(animals, eq(treatments.animalId, animals.id))
      .where(eq(animals.farmId, farmId))
      .orderBy(asc(treatments.date)),
    db
      .select({ row: breedings })
      .from(breedings)
      .innerJoin(animals, eq(breedings.animalId, animals.id))
      .where(eq(animals.farmId, farmId))
      .orderBy(asc(breedings.date)),
    db
      .select({ row: pregnancyDiagnoses, animalId: breedings.animalId })
      .from(pregnancyDiagnoses)
      .innerJoin(breedings, eq(pregnancyDiagnoses.breedingId, breedings.id))
      .innerJoin(animals, eq(breedings.animalId, animals.id))
      .where(eq(animals.farmId, farmId))
      .orderBy(asc(pregnancyDiagnoses.date)),
    db
      .select({ row: calvings })
      .from(calvings)
      .innerJoin(animals, eq(calvings.animalId, animals.id))
      .where(eq(animals.farmId, farmId))
      .orderBy(asc(calvings.date)),
    db
      .select({ row: manejoSessionAnimals, earTag: animals.earTag })
      .from(manejoSessionAnimals)
      .innerJoin(manejoSessions, eq(manejoSessionAnimals.sessionId, manejoSessions.id))
      .innerJoin(animals, eq(manejoSessionAnimals.animalId, animals.id))
      .where(eq(manejoSessions.farmId, farmId))
      .orderBy(asc(manejoSessionAnimals.position)),
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

  return {
    animals: animalRows.map((row) =>
      toAnimal(row, weighingsByAnimal.get(row.id) ?? [], reproductionByAnimal.get(row.id))
    ),
    treatments: treatmentRows.map(({ row, earTag }) => toTreatment(row, earTag)),
    lots: lotRows.map(toLot),
    movements: movementRows.map(toMovement),
    breeds: breedRows.map((row) => row.name),
    protocols: protocolRows.map(toProtocol),
    manejoSessions: sessionRows.map((row) =>
      toManejoSession(row, sessionAnimalsBySession.get(row.id) ?? [])
    ),
    expenses: expenseRows.map(toExpense),
    customCategories: customCategoryRows.map(toCustomCategory),
    farm: farmRows.length
      ? toFarmData(farmRows[0])
      : { name: "", municipality: "", stateRegistration: "", manager: "" },
  };
}
