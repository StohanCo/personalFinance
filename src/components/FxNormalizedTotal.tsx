import Decimal from "decimal.js";
import { prisma } from "@/lib/db/client";
import { fetchNzdFxRates } from "@/lib/fx/exchange";
import FxNormalizedTotalClient from "./FxNormalizedTotalClient";

type CurrencyAmount = { currency: string; amount: string };

type Props = {
  accounts: { balance: string; currency: string }[];
  monthIncomeByCurrency: CurrencyAmount[];
  monthExpensesByCurrency: CurrencyAmount[];
  currencies: string[];
};

type RateLookup = Record<string, number>;

async function loadRates(): Promise<{
  rates: RateLookup;
  provider: string | null;
  updatedAt: string | null;
} | null> {
  // Try the network first; on any failure fall back to the most recent FxRate
  // snapshot so the dashboard never waits on a third-party outage.
  try {
    const fx = await fetchNzdFxRates();
    return { rates: fx.rates, provider: fx.provider, updatedAt: fx.updatedAt };
  } catch {
    const latest = await prisma.fxRate.findMany({
      where: { base: "NZD" },
      orderBy: { capturedAt: "desc" },
      take: 24,
    });
    if (latest.length === 0) return null;
    const rates: RateLookup = {};
    let provider: string | null = null;
    let updatedAt: Date | null = null;
    for (const row of latest) {
      if (!(row.symbol in rates)) {
        rates[row.symbol] = Number(row.rate.toString());
        provider = provider ?? row.provider;
        updatedAt = updatedAt ?? row.capturedAt;
      }
    }
    return {
      rates,
      provider,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
    };
  }
}

function convert(amount: Decimal, currency: string, rates: RateLookup): Decimal {
  if (currency === "NZD") return amount;
  const rate = rates[currency];
  if (!rate || rate <= 0) return amount;
  return amount.div(rate);
}

export default async function FxNormalizedTotal({
  accounts,
  monthIncomeByCurrency,
  monthExpensesByCurrency,
  currencies,
}: Props) {
  const fx = await loadRates();

  if (!fx) {
    return (
      <FxNormalizedTotalClient
        totalNzd={null}
        monthIncomeNzd={null}
        monthExpensesNzd={null}
        provider={null}
        updatedAt={null}
        currencies={currencies}
        rates={null}
      />
    );
  }

  const totalNzd = accounts.reduce(
    (sum, a) => sum.plus(convert(new Decimal(a.balance), a.currency, fx.rates)),
    new Decimal(0),
  );

  const monthIncomeNzd = monthIncomeByCurrency.reduce(
    (sum, row) =>
      sum.plus(convert(new Decimal(row.amount), row.currency, fx.rates)),
    new Decimal(0),
  );

  const monthExpensesNzd = monthExpensesByCurrency.reduce(
    (sum, row) =>
      sum.plus(convert(new Decimal(row.amount), row.currency, fx.rates)),
    new Decimal(0),
  );

  return (
    <FxNormalizedTotalClient
      totalNzd={totalNzd.toFixed(2)}
      monthIncomeNzd={monthIncomeNzd.toFixed(2)}
      monthExpensesNzd={monthExpensesNzd.toFixed(2)}
      provider={fx.provider}
      updatedAt={fx.updatedAt}
      currencies={currencies}
      rates={fx.rates}
    />
  );
}
