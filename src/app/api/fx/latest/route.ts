import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { fetchNzdFxRates } from "@/lib/fx/exchange";
import Decimal from "decimal.js";

const PERSIST_EPSILON = 1e-6; // skip persistence if every rate matches the last snapshot to 6dp

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fx = await fetchNzdFxRates();

    // Persist a snapshot only when at least one rate has moved. Failures here
    // must not break the response.
    try {
      const symbols = Object.keys(fx.rates);
      const previous = await prisma.fxRate.findMany({
        where: { base: "NZD", symbol: { in: symbols } },
        orderBy: { capturedAt: "desc" },
        take: symbols.length * 4, // generous, latest-per-symbol filtered below
      });
      const latestBySymbol = new Map<string, number>();
      for (const row of previous) {
        if (!latestBySymbol.has(row.symbol)) {
          latestBySymbol.set(row.symbol, Number(row.rate.toString()));
        }
      }
      const moved = Object.entries(fx.rates).some(([symbol, rate]) => {
        const prev = latestBySymbol.get(symbol);
        return prev === undefined || Math.abs(prev - rate) > PERSIST_EPSILON;
      });

      if (moved) {
        const capturedAt = new Date();
        await prisma.fxRate.createMany({
          data: Object.entries(fx.rates).map(([symbol, rate]) => ({
            base: "NZD",
            symbol,
            rate: new Decimal(rate).toFixed(6),
            provider: fx.provider,
            capturedAt,
          })),
          skipDuplicates: false,
        });
      }
    } catch (dbError) {
      console.error("[fx/latest] DB persistence failed:", dbError);
    }

    return NextResponse.json(
      {
        base: fx.base,
        provider: fx.provider,
        updatedAt: fx.updatedAt,
        rates: fx.rates,
      },
      {
        headers: {
          // CDN cache for 1h, serve stale up to 24h while we revalidate.
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "FX lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
