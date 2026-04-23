import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { Decimal } from "decimal.js";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import Dashboard from "@/components/Dashboard";
import { convertToNzd, fetchNzdFxRates, roundMoney } from "@/lib/fx/exchange";

const DEFAULT_CURRENCIES = [
  { code: "NZD", label: "New Zealand Dollar", sortOrder: 1 },
  { code: "AUD", label: "Australian Dollar",  sortOrder: 2 },
  { code: "USD", label: "US Dollar",          sortOrder: 3 },
  { code: "EUR", label: "Euro",               sortOrder: 4 },
  { code: "GBP", label: "British Pound",      sortOrder: 5 },
  { code: "RUB", label: "Russian Ruble",      sortOrder: 6 },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  const [accounts, recentTxs, categories, userCurrenciesDb] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: true, account: { select: { name: true, currency: true } } },
      orderBy: { date: "desc" },
      take: 20,
    }),
    prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.userCurrency.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  let userCurrencies = userCurrenciesDb;
  if (userCurrencies.length === 0) {
    await prisma.userCurrency.createMany({
      data: DEFAULT_CURRENCIES.map((c) => ({ ...c, userId })),
    });
    userCurrencies = DEFAULT_CURRENCIES.map((c) => ({
      ...c,
      id: "",
      userId,
      createdAt: new Date(),
    }));
  }

  const enabledCurrencies = userCurrencies.map((c) => c.code);

  const totalBalance = accounts.reduce(
    (sum, a) => sum.plus(a.balance),
    new Decimal(0),
  );

  const rawBalancesByCurrencyMap = accounts.reduce((acc, a) => {
    const current = acc.get(a.currency) ?? new Decimal(0);
    acc.set(a.currency, current.plus(a.balance));
    return acc;
  }, new Map<string, Decimal>());

  const rawBalancesByCurrency = [...rawBalancesByCurrencyMap.entries()].map(([currency, total]) => ({
    currency,
    total: total.toFixed(2),
  }));

  const distinctCurrencies = [...new Set(accounts.map((a) => a.currency))];
  let totalBalanceNzd: string | null = null;
  let fxCheckedAt: string | null = null;
  let fxProvider: string | null = null;

  try {
    const fx = await fetchNzdFxRates();
    fxCheckedAt = fx.updatedAt;
    fxProvider = fx.provider;

    const converted = accounts.reduce((sum, a) => {
      const nzdAmount = convertToNzd(Number(a.balance.toString()), a.currency, fx.rates);
      return sum + nzdAmount;
    }, 0);

    totalBalanceNzd = roundMoney(converted).toFixed(2);
  } catch {
    // Keep dashboard available if FX provider is unavailable.
    totalBalanceNzd = null;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const monthIncome = recentTxs
    .filter((t) => t.type === "INCOME" && t.status === "VERIFIED" && new Date(t.date) >= monthStart)
    .reduce((s, t) => s.plus(t.amount), new Decimal(0));

  const monthExpenses = recentTxs
    .filter((t) => t.type === "EXPENSE" && t.status === "VERIFIED" && new Date(t.date) >= monthStart)
    .reduce((s, t) => s.plus(t.amount), new Decimal(0));

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 shadow-lg shadow-emerald-500/25">
              <span className="text-sm font-bold text-white">F</span>
            </div>
            <span className="text-lg font-semibold text-white">FinOps Tracker</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">{session.user.email}</span>
            <Link
              href="/settings"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <Dashboard
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          balance: a.balance.toString(),
          color: a.color,
          creditLimit: a.creditLimit?.toString() ?? null,
        }))}
        transactions={recentTxs.map((t) => ({
          id: t.id,
          type: t.type,
          status: t.status,
          amount: t.amount.toString(),
          date: t.date.toISOString(),
          vendor: t.vendor,
          description: t.description,
          categoryName: t.category?.nameEn ?? null,
          accountName: t.account.name,
          currency: t.account.currency,
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          key: c.key,
          nameEn: c.nameEn,
          type: c.type,
          color: c.color,
        }))}
        summary={{
          totalBalance: totalBalance.toFixed(2),
          totalBalanceNzd,
          monthIncome: monthIncome.toFixed(2),
          monthExpenses: monthExpenses.toFixed(2),
          fxCheckedAt,
          fxProvider,
          currencies: distinctCurrencies,
          rawBalancesByCurrency,
        }}
        currencies={enabledCurrencies}
      />
    </div>
  );
}
