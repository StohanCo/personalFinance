import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchNzdFxRates } from "@/lib/fx/exchange";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fx = await fetchNzdFxRates();
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
