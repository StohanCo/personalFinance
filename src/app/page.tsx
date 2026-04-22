import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { Decimal } from "decimal.js";
import SignOutButton from "@/components/SignOutButton";

function fmt(amount: Decimal | string | number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  const [accounts, recentTxs] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
      take: 10,
    }),
  ]);

  const totalBalance = accounts.reduce(
    (sum, a) => sum.plus(a.balance),
    new Decimal(0),
  );

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const monthTxs = recentTxs.filter((t) => new Date(t.date) >= thisMonth);
  const monthIncome = monthTxs
    .filter((t) => t.type === "INCOME" && t.status === "VERIFIED")
    .reduce((s, t) => s.plus(t.amount), new Decimal(0));
  const monthExpenses = monthTxs
    .filter((t) => t.type === "EXPENSE" && t.status === "VERIFIED")
    .reduce((s, t) => s.plus(t.amount), new Decimal(0));

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500">
              <span className="text-sm font-bold text-white">F</span>
            </div>
            <span className="text-lg font-semibold text-white">FinOps Tracker</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Net Worth" value={fmt(totalBalance)} color="emerald" />
          <SummaryCard label="Income This Month" value={fmt(monthIncome)} color="blue" />
          <SummaryCard label="Expenses This Month" value={fmt(monthExpenses)} color="red" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Accounts */}
          <section>
            <h2 className="mb-4 text-lg font-semibold text-white">Accounts</h2>
            {accounts.length === 0 ? (
              <EmptyState message="No accounts yet" />
            ) : (
              <div className="space-y-3">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: a.color }}
                      />
                      <div>
                        <p className="font-medium text-white">{a.name}</p>
                        <p className="text-xs text-slate-500">{a.type}</p>
                      </div>
                    </div>
                    <span
                      className={`font-semibold ${Number(a.balance) < 0 ? "text-red-400" : "text-emerald-400"}`}
                    >
                      {fmt(a.balance, a.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent transactions */}
          <section>
            <h2 className="mb-4 text-lg font-semibold text-white">Recent Transactions</h2>
            {recentTxs.length === 0 ? (
              <EmptyState message="No transactions yet" />
            ) : (
              <div className="space-y-2">
                {recentTxs.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">
                        {t.vendor ?? t.description ?? "Unnamed"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.category?.nameEn ?? t.type} ·{" "}
                        {new Date(t.date).toLocaleDateString("en-NZ")}
                        {t.status === "PENDING" && (
                          <span className="ml-2 rounded bg-amber-900/50 px-1 py-0.5 text-xs text-amber-400">
                            pending
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`ml-4 font-semibold ${t.type === "INCOME" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {t.type === "INCOME" ? "+" : "-"}
                      {fmt(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "blue" | "red";
}) {
  const colors = {
    emerald: "border-emerald-800 bg-emerald-950/50 text-emerald-400",
    blue: "border-blue-800 bg-blue-950/50 text-blue-400",
    red: "border-red-800 bg-red-950/50 text-red-400",
  };
  return (
    <div className={`rounded-xl border px-5 py-4 ${colors[color]}`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-slate-500">
      {message}
    </div>
  );
}
