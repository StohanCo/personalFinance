type FxApiResponse = {
  result?: string;
  provider?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
};

export type FxSnapshot = {
  base: "NZD";
  provider: string;
  updatedAt: string | null;
  rates: Record<string, number>;
};

const FX_URL = "https://open.er-api.com/v6/latest/NZD";

export async function fetchNzdFxRates(): Promise<FxSnapshot> {
  const response = await fetch(FX_URL, {
    next: { revalidate: 3600 },
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`FX request failed with status ${response.status}`);
  }

  const data = (await response.json()) as FxApiResponse;
  if (!data.rates || typeof data.rates !== "object") {
    throw new Error("FX response did not include rates");
  }

  return {
    base: "NZD",
    provider: data.provider ?? "open.er-api.com",
    updatedAt: data.time_last_update_utc ?? null,
    rates: data.rates,
  };
}

/**
 * Convert an amount in `currency` to NZD.
 *
 * Returns null when no usable rate exists for `currency` so callers can
 * surface the gap in the UI instead of silently summing the un-converted
 * amount into an NZD total (which would mix currencies).
 */
export function convertToNzd(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): number | null {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "NZD") return amount;

  const rateFromNzd = rates[currency];
  if (!rateFromNzd || rateFromNzd <= 0) return null;

  // API provides 1 NZD -> X currency, so invert to convert currency -> NZD.
  return amount / rateFromNzd;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
