import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Decimal } from "decimal.js";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import Dashboard from "@/components/Dashboard";
import FxNormalizedTotal from "@/components/FxNormalizedTotal";
import { DEFAULT_CURRENCIES } from "@/lib/currencies";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEndExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const [
    accounts,
    recentTxs,
    categories,
    userCurrenciesDb,
    monthIncomeAgg,
    monthExpensesAgg,
  ] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        date: true,
        vendor: true,
        description: true,
        category: { select: { nameEn: true, color: true } },
        account: { select: { name: true, currency: true } },
      },
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
    prisma.transaction.groupBy({
      by: ["currency"],
      where: {
        userId,
        type: "INCOME",
        status: "VERIFIED",
        date: { gte: monthStart, lt: monthEndExclusive },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["currency"],
      where: {
        userId,
        type: "EXPENSE",
        status: "VERIFIED",
        date: { gte: monthStart, lt: monthEndExclusive },
      },
      _sum: { amount: true },
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

  // Raw sums per currency (fallback when FX unavailable). FX-normalized totals
  // are streamed by <FxNormalizedTotal> below so the SSR critical path never
  // blocks on the third-party rate API.
  const monthIncome = monthIncomeAgg.reduce(
    (s, row) => s.plus(row._sum.amount?.toString() ?? "0"),
    new Decimal(0),
  );
  const monthExpenses = monthExpensesAgg.reduce(
    (s, row) => s.plus(row._sum.amount?.toString() ?? "0"),
    new Decimal(0),
  );

  const accountsForFx = accounts.map((a) => ({
    balance: a.balance.toString(),
    currency: a.currency,
  }));
  const monthIncomeByCurrency = monthIncomeAgg.map((row) => ({
    currency: row.currency,
    amount: row._sum.amount?.toString() ?? "0",
  }));
  const monthExpensesByCurrency = monthExpensesAgg.map((row) => ({
    currency: row.currency,
    amount: row._sum.amount?.toString() ?? "0",
  }));

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
          apr: a.apr?.toString() ?? null,
          notes: a.notes,
          isArchived: a.isArchived,
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
          monthIncome: monthIncome.toFixed(2),
          monthExpenses: monthExpenses.toFixed(2),
          currencies: distinctCurrencies,
          rawBalancesByCurrency,
        }}
        fxSlot={
          <Suspense fallback={<FxNormalizedTotalFallback />}>
            <FxNormalizedTotal
              accounts={accountsForFx}
              monthIncomeByCurrency={monthIncomeByCurrency}
              monthExpensesByCurrency={monthExpensesByCurrency}
              currencies={distinctCurrencies}
            />
          </Suspense>
        }
        currencies={enabledCurrencies}
      />
    </div>
  );
}

function FxNormalizedTotalFallback() {
  return (
    <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-widest text-cyan-300/80">FX Normalized Total</p>
      <p className="mt-1 h-8 w-48 animate-pulse rounded bg-slate-800" />
      <p className="mt-2 text-xs text-slate-500">Fetching exchange rates…</p>
    </div>
  );
}
