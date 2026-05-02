import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/**
 * Look up the closest historical NZD→symbol rate ON OR BEFORE each requested
 * date for a set of currencies. Used to convert past-month transactions at
 * the rate that actually applied on `tx.date`, not at today's rate.
 *
 * Falls back to the earliest available snapshot if a date predates any
 * captured rate; returns `null` for symbols that have no FxRate rows at all,
 * so callers can flag them in the UI.
 */
export async function fetchHistoricalNzdRates(
  symbols: string[],
  on: Date,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const distinct = Array.from(new Set(symbols.filter((s) => s !== "NZD")));
  if (distinct.length === 0) return out;

  // One round-trip: latest rate ≤ `on` per symbol via DISTINCT ON.
  const rows = await prisma.$queryRaw<Array<{ symbol: string; rate: string }>>(
    Prisma.sql`
      SELECT DISTINCT ON (symbol) symbol, rate::text AS rate
      FROM "FxRate"
      WHERE base = 'NZD'
        AND symbol = ANY(${distinct}::text[])
        AND "capturedAt" <= ${on}
      ORDER BY symbol, "capturedAt" DESC
    `,
  );

  for (const row of rows) {
    out.set(row.symbol, Number(row.rate));
  }

  // For symbols with no snapshot ≤ on, try the earliest available row
  // (better an old rate than dropping the line silently).
  const stillMissing = distinct.filter((s) => !out.has(s));
  if (stillMissing.length > 0) {
    const fallback = await prisma.$queryRaw<Array<{ symbol: string; rate: string }>>(
      Prisma.sql`
        SELECT DISTINCT ON (symbol) symbol, rate::text AS rate
        FROM "FxRate"
        WHERE base = 'NZD' AND symbol = ANY(${stillMissing}::text[])
        ORDER BY symbol, "capturedAt" ASC
      `,
    );
    for (const row of fallback) {
      out.set(row.symbol, Number(row.rate));
    }
  }

  for (const s of distinct) {
    if (!out.has(s)) out.set(s, null);
  }
  return out;
}
