/** Request schemas of the contas bancárias and the transferências between them. */

import { t } from "elysia";

import { DateString, NonBlankString } from "@/lib/api/schemas/shared.schema";

const Day = t.Integer({ minimum: 1, maximum: 31 });
const Name = t.String({ minLength: 1, maxLength: 60, pattern: "\\S" });
const Label = t.String({ maxLength: 60 });

export const BankAccountKindModel = t.Union([t.Literal("checking"), t.Literal("cash"), t.Literal("card")]);

/** Body of POST /bank-accounts. A cartão takes closingDay and dueDay, and may name the conta that pays it. */
export const NewBankAccountBody = t.Object({
  kind: BankAccountKindModel,
  name: Name,
  label: t.Optional(Label),
  openingBalanceBrl: t.Optional(t.Number()),
  openingDate: DateString,
  isMain: t.Optional(t.Boolean()),
  closingDay: t.Optional(Day),
  dueDay: t.Optional(Day),
  paysFromId: t.Optional(t.String()),
});

/** Body of PATCH /bank-accounts/:id; the kind never changes, null clears. */
export const UpdateBankAccountBody = t.Object({
  name: t.Optional(Name),
  label: t.Optional(t.Nullable(Label)),
  openingBalanceBrl: t.Optional(t.Number()),
  openingDate: t.Optional(DateString),
  isMain: t.Optional(t.Boolean()),
  closingDay: t.Optional(Day),
  dueDay: t.Optional(Day),
  paysFromId: t.Optional(t.Nullable(t.String())),
});

export const ArchiveBankAccountBody = t.Object({ archived: t.Boolean() });

export const NewTransferBody = t.Object({
  fromId: NonBlankString,
  toId: NonBlankString,
  date: DateString,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String({ maxLength: 200 })),
});

export const UpdateTransferBody = t.Object({
  fromId: t.Optional(NonBlankString),
  toId: t.Optional(NonBlankString),
  date: t.Optional(DateString),
  amountBrl: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
});

/** Body of PATCH /movements/:id/bank-account: the conta of a venda or compra, null for none. */
export const MovementBankAccountBody = t.Object({ bankAccountId: t.Nullable(t.String()) });
