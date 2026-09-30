/** Request schemas of the extrato imports and the conciliação of their lines. */

import { t } from "elysia";

import { NewExpenseBody } from "@/lib/api/domains/expenses/schemas/expense.schema";
import { MAX_STATEMENT_BYTES } from "@/lib/domain/statements/common";

const Column = t.Integer({ minimum: 0, maximum: 100 });

export const CsvMappingModel = t.Object({
  delimiter: t.String({ minLength: 1, maxLength: 1 }),
  dateColumn: Column,
  descriptionColumn: Column,
  amountColumn: t.Optional(Column),
  inColumn: t.Optional(Column),
  outColumn: t.Optional(Column),
  dateFormat: t.Union([t.Literal("dmy"), t.Literal("ymd")]),
  decimal: t.Union([t.Literal(","), t.Literal(".")]),
  skipRows: t.Integer({ minimum: 0, maximum: 50 }),
});

/** Body of POST /bank-accounts/:id/imports: the file's text, decoded by the browser. */
export const ImportStatementBody = t.Object({
  fileName: t.String({ minLength: 1, maxLength: 200 }),
  content: t.String({ minLength: 1, maxLength: MAX_STATEMENT_BYTES }),
  /** A CSV's columns; stored on the conta for the next imports. */
  mapping: t.Optional(CsvMappingModel),
});

export const MatchBody = t.Object({
  kind: t.Union([t.Literal("expense"), t.Literal("movement"), t.Literal("transfer")]),
  id: t.String({ minLength: 1 }),
});

/** "Criar lançamento": the EntryDialog's body; the line fixes the pagamento and the conta. */
export const CreateFromLineBody = t.Omit(NewExpenseBody, ["repeat", "bankAccountId", "kind"]);

export const TransferFromLineBody = t.Object({ otherAccountId: t.String({ minLength: 1 }) });

export const IgnoreLineBody = t.Object({ reason: t.String({ minLength: 1, maxLength: 120, pattern: "\\S" }) });

/** "Confirmar as N de confiança alta": the pairs the page shows as alta. */
export const ConfirmHighBody = t.Object({
  pairs: t.Array(t.Object({ lineId: t.String({ minLength: 1 }), kind: MatchBody.properties.kind, id: t.String({ minLength: 1 }) }), {
    maxItems: 500,
  }),
});
