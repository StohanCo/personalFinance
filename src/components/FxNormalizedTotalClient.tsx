"use client";

import { useState } from "react";

type Props = {
  totalNzd: string | null;
  monthIncomeNzd: string | null;
  monthExpensesNzd: string | null;
  provider: string | null;
  updatedAt: string | null;
  currencies: string[];
  missingCurrencies: string[];
  rates: Record<string, number> | null;
};

function fmt(amount: string, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(
    Number(amount),
  );
}

export default function FxNormalizedTotalClient({
  totalNzd: initialTotal,
  monthIncomeNzd: _monthIncomeNzd,
  monthExpensesNzd: _monthExpensesNzd,
  provider: initialProvider,
  updatedAt: initialUpdatedAt,
  currencies,
  missingCurrencies,
  rates: _initialRates,
}: Props) {
  const [totalNzd, setTotalNzd] = useState<string | null>(initialTotal);
  const [provider, setProvider] = useState<string | null>(initialProvider);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fx/latest", { cache: "no-store" });
      const data = (await res.json()) as {
        rates?: Record<string, number>;
        updatedAt?: string | null;
        provider?: string;
      };
      if (!res.ok || !data.rates) throw new Error("Failed to load exchange rates");

      // Re-convert client-side from initial total; we don't have raw balances
      // here, so rely on server pre-render for the headline number unless the
      // server gave us nothing — in that case the dashboard simply re-renders
      // from a router.refresh() upstream.
      setProvider(data.provider ?? null);
      setUpdatedAt(data.updatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh rates");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-cyan-300/80">FX Normalized Total</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {totalNzd ? fmt(totalNzd) : "Unavailable"}
          </p>
          <p className="text-xs text-slate-500">
            {currencies.length > 1
              ? `Converted from: ${currencies.join(", ")}`
              : "All balances already in NZD"}
          </p>
          {(updatedAt || provider) && (
            <p className="mt-1 text-xs text-slate-500">
              Source: {provider ?? "public API"}
              {updatedAt ? ` · ${new Date(updatedAt).toLocaleString("en-NZ")}` : ""}
            </p>
          )}
          {missingCurrencies.length > 0 && (
            <p className="mt-2 rounded-md border border-amber-700/50 bg-amber-900/20 px-2 py-1 text-xs text-amber-300">
              No FX rate for {missingCurrencies.join(", ")} — those balances are
              excluded from the NZD total.
            </p>
          )}
        </div>
        <button
          onClick={() => void recheck()}
          disabled={loading}
          className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {loading ? "Checking..." : "Recheck via public FX API"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
