/**
 * The undo shared by `reopen` and a forced pass. Reopen's own tests keep
 * covering the undo branch by branch; this file pins what moved with it: the
 * lot put back after a transferência, the refusal before the first write,
 * the entrada pass a force never undoes, and the refusal that rolls a forced
 * undo back.
 *
 * The transaction is a hand-made chainable stub: selects answer from a queued
 * list of rows, and every write lands in one log, in call order, with its table.
 */
import { getTableName, type Table } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { answerRefusal, forceReopen, Refused, revertEntry } from "../../_shared/revert";

function stubTx(selectResults: Record<string, unknown>[][]) {
  const writes: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const select = () => {
    const rows = selectResults.shift() ?? [];
    const builder = {
      from: () => builder,
      where: () => builder,
      for: () => builder,
      limit: () => builder,
      then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
    };
    return builder;
  };
  const tx = {
    select,
    update: (table: Table) => {
      writes.push(`update ${getTableName(table)}`);
      let columns: Record<string, unknown> = {};
      const builder = {
        set(set: Record<string, unknown>) {
          columns = set;
          updates.push(set);
          return builder;
        },
        where: () => builder,
        returning: () => Promise.resolve([{ ...columns }]),
      };
      return builder;
    },
    delete: (table: Table) => ({
      where: () => {
        writes.push(`delete ${getTableName(table)}`);
        return Promise.resolve(undefined);
      },
    }),
  };
  return { tx: tx as never, writes, updates };
}

const SESSION = { id: "s-1", farmId: 7, kind: "transfer", status: "open" };
const DONE_ENTRY = {
  sessionId: "s-1",
  animalId: "a-1",
  outcome: "done",
  previousLotId: "lot-0",
  createdAnimal: false,
  treatmentId: "t-1",
  boosterId: null,
  weighingId: null,
  breedingId: null,
};
const ANIMAL = { id: "a-1", earTag: "V-01", lotId: "lot-2", active: true };
const ctx = (entry: Record<string, unknown> = DONE_ENTRY) =>
  ({ farmId: 7, session: SESSION, entry, animal: ANIMAL }) as never;

describe("revertEntry", () => {
  it("undoes a transferência: the treatment goes, the animal goes back to its old lot", async () => {
    // The old lot's lock and its open placement.
    const { tx, writes, updates } = stubTx([[{ id: "lot-0" }], [{ id: "pl-1" }]]);

    const result = await revertEntry(tx, ctx());

    expect(writes).toEqual(["update animals", "update manejo_session_animals", "delete treatments"]);
    expect(updates[0]).toEqual({ lotId: "lot-0" });
    expect(result).toMatchObject({
      entry: { earTag: "V-01", outcome: "pending" },
      removedTreatmentIds: ["t-1"],
      animal: { lotId: "lot-0" },
    });
  });

  it("answers lot_not_found and writes nothing when the old lot is gone", async () => {
    const { tx, writes } = stubTx([[]]);

    expect(await revertEntry(tx, ctx())).toBe("lot_not_found");
    expect(writes).toEqual([]);
  });
});

describe("forceReopen", () => {
  it("never forces an entrada's pass, whose undo would delete the animal", async () => {
    const { tx, writes } = stubTx([]);

    const result = await forceReopen(tx, ctx({ ...DONE_ENTRY, createdAnimal: true }));

    expect(result).toEqual({ conflict: "entry_not_actionable" });
    expect(writes).toEqual([]);
  });
});

describe("answerRefusal", () => {
  it("answers a refusal thrown out of the transaction", async () => {
    const answer = await answerRefusal(async () => {
      throw new Refused({ conflict: "out_of_stock" });
    });

    expect(answer).toEqual({ conflict: "out_of_stock" });
  });

  it("lets any other error through", async () => {
    await expect(
      answerRefusal(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
