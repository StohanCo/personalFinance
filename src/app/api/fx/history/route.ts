import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

// FX rates are public data — no auth required.

const MAX_LIMIT = 365;
const DEFAULT_LIMIT = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // ── Validate `symbol` ───────────────────────────────────────────────────────
  const symbol = searchParams.get("symbol");
  if (!symbol || symbol.trim().length === 0) {
    return NextResponse.json(
      { error: "Query parameter 'symbol' is required (e.g. ?symbol=USD)" },
      { status: 400 }
    );
  }
  const normalizedSymbol = symbol.trim().toUpperCase();

  // ── Validate `limit` ────────────────────────────────────────────────────────
  const rawLimit = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed < 1) {
      return NextResponse.json(
        { error: "'limit' must be a positive integer" },
        { status: 400 }
      );
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  // ── Cursor for keyset pagination ────────────────────────────────────────────
  const cursor = searchParams.get("cursor") ?? undefined;

  // ── Fetch one extra record to determine whether a next page exists ──────────
  const rows = await prisma.fxRate.findMany({
    where: { symbol: normalizedSymbol },
    orderBy: { capturedAt: "desc" },
    take: limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1, // skip the cursor record itself
        }
      : {}),
    select: {
      id: true,
      rate: true,
      capturedAt: true,
      provider: true,
    },
  });

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;
  const lastRow = page[page.length - 1];
  const nextCursor = hasNext && lastRow ? lastRow.id : null;

  // ── Total count for the given symbol (independent of cursor/limit) ──────────
  const total = await prisma.fxRate.count({
    where: { symbol: normalizedSymbol },
  });

  return NextResponse.json({
    symbol: normalizedSymbol,
    rates: page.map((r) => ({
      id: r.id,
      rate: r.rate.toFixed(6),
      capturedAt: r.capturedAt.toISOString(),
      provider: r.provider,
    })),
    nextCursor,
    total,
  });
}
