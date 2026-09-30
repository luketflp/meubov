/**
 * OFX extratos, 1.x (SGML: `<TRNAMT>-64.90` with no closing tag) and 2.x
 * (XML). Reads each STMTTRN (DTPOSTED, TRNAMT, FITID, MEMO or NAME), the
 * LEDGERBAL and the BANKTRANLIST window. Pure; no dependency.
 */
import {
  isoDate,
  lineHashes,
  linesPeriod,
  parseAmountText,
  type ParseResult,
  type ParsedLine,
} from "@/lib/domain/statements/common";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** The text of the first `<TAG>` in `block`, closed or not; null when absent or empty. */
function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  const value = match?.[1].replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]).trim();
  return value ? value : null;
}

/** "20260923120000[-3:BRT]" → "2026-09-23". */
function ofxDate(text: string | null): string | null {
  const match = text ? /^(\d{4})(\d{2})(\d{2})/.exec(text) : null;
  return match ? isoDate(match[1], match[2], match[3]) : null;
}

/**
 * OFX writes "." as decimal; a few Brazilian banks write "," instead, some
 * with "." thousands ("-1.234,56"): the last of the two is the decimal.
 */
export function ofxAmount(text: string | null): number | null {
  if (text === null) return null;
  return parseAmountText(text, text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".");
}

export function parseOfx(text: string): ParseResult {
  if (!/<OFX>/i.test(text)) return { ok: false, error: "not_ofx" };

  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].map(
    (m) => m[1]
  );
  if (blocks.length === 0) return { ok: false, error: "no_lines" };

  const lines: Omit<ParsedLine, "externalId">[] = [];
  const fitIds: (string | null)[] = [];
  for (const [index, block] of blocks.entries()) {
    const row = index + 1;
    const date = ofxDate(tag(block, "DTPOSTED"));
    if (date === null) return { ok: false, error: `bad_date:${row}` };
    const amountBrl = ofxAmount(tag(block, "TRNAMT"));
    if (amountBrl === null) return { ok: false, error: `bad_amount:${row}` };
    const description = tag(block, "MEMO") ?? tag(block, "NAME") ?? "";
    lines.push({ date, description, amountBrl });
    fitIds.push(tag(block, "FITID"));
  }

  // A FITID seen twice in one file (some banks repeat them) gets its count; no FITID, the hash.
  const hashes = lineHashes(lines);
  const seen = new Map<string, number>();
  const parsed: ParsedLine[] = lines.map((line, i) => {
    const fitId = fitIds[i];
    if (fitId === null) return { ...line, externalId: hashes[i] };
    const n = (seen.get(fitId) ?? 0) + 1;
    seen.set(fitId, n);
    return { ...line, externalId: n === 1 ? `f:${fitId}` : `f:${fitId}:${n}` };
  });

  const ledger = /<LEDGERBAL>([\s\S]*?)(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(text)?.[1];
  const balanceAmount = ledger ? ofxAmount(tag(ledger, "BALAMT")) : null;
  const balanceDate = ledger ? ofxDate(tag(ledger, "DTASOF")) : null;

  const span = linesPeriod(parsed);
  const from = ofxDate(tag(text, "DTSTART"));
  const to = ofxDate(tag(text, "DTEND"));
  return {
    ok: true,
    statement: {
      lines: parsed,
      bankBalance:
        balanceAmount !== null && balanceDate !== null
          ? { amountBrl: balanceAmount, date: balanceDate }
          : undefined,
      period: {
        from: from !== null && from < span.from ? from : span.from,
        to: to !== null && to > span.to ? to : span.to,
      },
    },
  };
}
