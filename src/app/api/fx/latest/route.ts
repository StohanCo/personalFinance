import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { fetchNzdFxRates } from "@/lib/fx/exchange";
import Decimal from "decimal.js";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fx = await fetchNzdFxRates();

    // Persist a fresh snapshot to the DB; a failure here must not break the response.
    try {
      const capturedAt = new Date();
      await prisma.fxRate.createMany({
        data: Object.entries(fx.rates).map(([symbol, rate]) => ({
          base: "NZD",
          symbol,
          rate: new Decimal(rate).toFixed(6),
          provider: fx.provider,
          capturedAt,
        })),
        skipDuplicates: false, // always insert new snapshot
      });
    } catch (dbError) {
      // Log but do not surface — FX data is still returned successfully.
      console.error("[fx/latest] DB persistence failed:", dbError);
    }

    return NextResponse.json({
      base: fx.base,
      provider: fx.provider,
      updatedAt: fx.updatedAt,
      rates: fx.rates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FX lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
