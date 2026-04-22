import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { Decimal } from "decimal.js";
import SignOutButton from "@/components/SignOutButton";
import Dashboard from "@/components/Dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  const [accounts, recentTxs, categories] = await Promise.all([
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
  ]);

  const totalBalance = accounts.reduce(
    (sum, a) => sum.plus(a.balance),
    new Decimal(0),
  );

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
          nameEn: c.nameEn,
          type: c.type,
        }))}
        summary={{
          totalBalance: totalBalance.toFixed(2),
          monthIncome: monthIncome.toFixed(2),
          monthExpenses: monthExpenses.toFixed(2),
        }}
      />
    </div>
  );
}
