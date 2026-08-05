/**
 * MeuBov local seed CLI.
 *
 * Seeds the LOCAL database with the deterministic Fazenda Boa Vista herd
 * (lib/data/seed.ts) for one existing user:
 *
 *   pnpm db:seed --email dev@example.com [--force]
 *
 * The user must already exist (sign up through the app first). Refuses to run
 * when the user already owns a farm, unless --force is passed — then the owned
 * farms are deleted first (FKs cascade the whole tenant away).
 *
 * Every text id from the seed (lot-1, treatment-3, ...) is remapped to a fresh
 * uuid: those ids are globally-unique primary keys in Postgres, and two seeded
 * farms would otherwise collide.
 */
import { randomUUID } from "node:crypto";
import process from "node:process";

import * as dotenv from "dotenv";
import { Command } from "commander";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../lib/db/schema";
import { generateInitialData } from "../lib/data/seed";

dotenv.config({ path: ".env.local" });

async function seed(email: string, force: boolean): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (expected in .env.local).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema, casing: "snake_case" });

  try {
    const [user] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    if (!user) {
      console.error(`No user with email "${email}". Sign up through the app first.`);
      process.exit(1);
    }

    const owned = await db
      .select({ farmId: schema.farmUsers.farmId })
      .from(schema.farmUsers)
      .where(and(eq(schema.farmUsers.userId, user.id), eq(schema.farmUsers.role, "owner")));
    if (owned.length > 0) {
      if (!force) {
        console.error(
          `User already owns ${owned.length} farm(s). Pass --force to delete and reseed.`
        );
        process.exit(1);
      }
      await db.delete(schema.farm).where(
        inArray(
          schema.farm.id,
          owned.map((o) => o.farmId)
        )
      );
      console.log(`Deleted ${owned.length} owned farm(s) (cascade).`);
    }

    const data = generateInitialData();

    await db.transaction(async (tx) => {
      const [createdFarm] = await tx
        .insert(schema.farm)
        .values({
          name: data.farm.name,
          municipality: data.farm.municipality,
          stateRegistration: data.farm.stateRegistration,
          manager: data.farm.manager,
          headquartersLat: data.farm.headquarters?.lat,
          headquartersLng: data.farm.headquarters?.lng,
        })
        .returning({ id: schema.farm.id });
      const farmId = createdFarm.id;

      await tx
        .insert(schema.farmUsers)
        .values({ farmId, userId: user.id, role: "owner" });

      if (data.breeds.length > 0) {
        await tx
          .insert(schema.breeds)
          .values(data.breeds.map((name) => ({ farmId, name })));
      }

      const invernadaIdMap = new Map(
        data.invernadas.map((invernada) => [invernada.id, randomUUID()])
      );
      if (data.invernadas.length > 0) {
        await tx.insert(schema.invernadas).values(
          data.invernadas.map((invernada) => ({
            id: invernadaIdMap.get(invernada.id)!,
            farmId,
            code: invernada.code,
            name: invernada.name,
            grass: invernada.grass,
            hectares: invernada.hectares,
            boundary: invernada.boundary,
          }))
        );
      }

      const lotIdMap = new Map(data.lots.map((lot) => [lot.id, randomUUID()]));
      if (data.lots.length > 0) {
        await tx.insert(schema.lots).values(
          data.lots.map((lot) => ({
            id: lotIdMap.get(lot.id)!,
            farmId,
            name: lot.name,
            needsReview: lot.needsReview ?? false,
          }))
        );
      }

      if (data.lotPlacements.length > 0) {
        await tx.insert(schema.lotPlacements).values(
          data.lotPlacements.map((placement) => ({
            id: randomUUID(),
            farmId,
            lotId: lotIdMap.get(placement.lotId)!,
            invernadaId: invernadaIdMap.get(placement.invernadaId)!,
            startedOn: placement.startedOn,
            endedOn: placement.endedOn,
            notes: placement.notes,
            baseline: placement.baseline ?? false,
          }))
        );
      }

      const animalIdMap = new Map(data.animals.map((a) => [a.earTag, randomUUID()]));
      if (data.animals.length > 0) {
        await tx.insert(schema.animals).values(
          data.animals.map((a) => ({
            id: animalIdMap.get(a.earTag)!,
            farmId,
            earTag: a.earTag,
            category: a.category,
            breed: a.breed,
            sex: a.sex,
            birthDate: a.birthDate,
            lotId: lotIdMap.get(a.lotId)!,
            active: a.active,
          }))
        );
      }

      const weighingRows = data.animals.flatMap((a) =>
        a.weighings.map((w) => ({
          animalId: animalIdMap.get(a.earTag)!,
          date: w.date,
          weightKg: w.weightKg,
        }))
      );
      if (weighingRows.length > 0) {
        await tx.insert(schema.weighings).values(weighingRows);
      }

      if (data.treatments.length > 0) {
        await tx.insert(schema.treatments).values(
          data.treatments.map((t) => ({
            id: randomUUID(),
            animalId: animalIdMap.get(t.animalEarTag)!,
            type: t.type,
            name: t.name,
            date: t.date,
            status: t.status,
            withdrawalDays: t.withdrawalDays,
            dose: t.dose,
            responsible: t.responsible,
            costBrl: t.costBrl,
            notes: t.notes,
          }))
        );
      }

      const breedingIdMap = new Map<string, string>();
      const breedingRows: (typeof schema.breedings.$inferInsert)[] = [];
      const diagnosisRows: (typeof schema.pregnancyDiagnoses.$inferInsert)[] = [];
      const calvingRows: (typeof schema.calvings.$inferInsert)[] = [];
      for (const a of data.animals) {
        if (!a.reproduction) continue;
        const animalId = animalIdMap.get(a.earTag)!;
        for (const b of a.reproduction.breedings) {
          const id = randomUUID();
          breedingIdMap.set(b.id, id);
          breedingRows.push({
            id,
            animalId,
            date: b.date,
            type: b.type,
            bullEarTag: b.bullEarTag,
          });
        }
        for (const d of a.reproduction.diagnoses) {
          diagnosisRows.push({
            breedingId: breedingIdMap.get(d.breedingId)!,
            result: d.result,
            date: d.date,
          });
        }
        for (const c of a.reproduction.calvings) {
          calvingRows.push({ animalId, date: c.date, calfEarTag: c.calfEarTag });
        }
      }
      if (breedingRows.length > 0) await tx.insert(schema.breedings).values(breedingRows);
      if (diagnosisRows.length > 0) {
        await tx.insert(schema.pregnancyDiagnoses).values(diagnosisRows);
      }
      if (calvingRows.length > 0) await tx.insert(schema.calvings).values(calvingRows);

      if (data.movements.length > 0) {
        await tx.insert(schema.movements).values(
          data.movements.map((m) => ({
            id: randomUUID(),
            farmId,
            type: m.type,
            date: m.date,
            quantity: m.quantity,
            category: m.category,
            origin: m.origin,
            destination: m.destination,
            amountBrl: m.amountBrl,
            notes: m.notes,
          }))
        );
      }

      // Compras, vendas e transferências of the demo: closed manejo sessions
      // whose animals all passed the chute (the ledger derives from them).
      for (const session of data.manejoSessions) {
        const [sessionRow] = await tx
          .insert(schema.manejoSessions)
          .values({
            id: randomUUID(),
            farmId,
            name: session.name,
            date: session.date,
            status: session.status,
            kind: session.kind,
            weighing: session.weighing,
            notes: session.notes,
            destinationLotId:
              session.destinationLotId === undefined
                ? undefined
                : lotIdMap.get(session.destinationLotId)!,
            counterparty: session.counterparty,
            pricePerArroba: session.pricePerArroba,
            totalAmountBrl: session.totalAmountBrl,
          })
          .returning({ id: schema.manejoSessions.id });
        if (session.animals.length === 0) continue;
        await tx.insert(schema.manejoSessionAnimals).values(
          session.animals.map((entry, position) => ({
            sessionId: sessionRow.id,
            animalId: animalIdMap.get(entry.earTag)!,
            position,
            outcome: entry.outcome,
            weightKg: entry.weightKg,
            notes: entry.notes,
            amountBrl: entry.amountBrl,
            previousLotId:
              entry.previousLotId === undefined
                ? undefined
                : lotIdMap.get(entry.previousLotId)!,
            createdAnimal: entry.createdAnimal ?? false,
          }))
        );
      }

      if (data.expenses.length > 0) {
        await tx.insert(schema.expenses).values(
          data.expenses.map((e) => ({
            id: randomUUID(),
            farmId,
            date: e.date,
            category: e.category,
            amountBrl: e.amountBrl,
            notes: e.notes,
          }))
        );
      }

      if (data.protocols.length > 0) {
        await tx.insert(schema.healthProtocols).values(
          data.protocols.map((p) => ({
            id: randomUUID(),
            farmId,
            name: p.name,
            type: p.type,
            intervalMonths: p.intervalMonths,
            withdrawalDays: p.withdrawalDays,
            mandatory: p.mandatory,
          }))
        );
      }

      console.log(
        `Seeded farm "${data.farm.name}" (id ${farmId}) for ${email}: ` +
          `${data.animals.length} animals, ${weighingRows.length} weighings, ` +
          `${data.treatments.length} treatments, ${data.lots.length} lots, ` +
          `${data.invernadas.length} invernadas, ${data.lotPlacements.length} placements, ` +
          `${data.manejoSessions.length} manejo sessions, ` +
          `${data.movements.length} legacy movements, ${data.protocols.length} protocols, ` +
          `${data.expenses.length} expenses.`
      );
    });
  } finally {
    await pool.end();
  }
}

const program = new Command();
program
  .name("seedCli")
  .description("Seed the LOCAL database with the mock herd for one user")
  .requiredOption("--email <email>", "email of an existing user")
  .option("--force", "delete the user's owned farms and reseed", false)
  .action(async (opts: { email: string; force: boolean }) => {
    await seed(opts.email, opts.force);
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
