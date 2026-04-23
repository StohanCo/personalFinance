import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import CurrencySettings from "./CurrencySettings";
import { DEFAULT_CURRENCIES } from "@/lib/currencies";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  let currencies = await prisma.userCurrency.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    select: { code: true, label: true },
  });

  if (currencies.length === 0) {
    await prisma.userCurrency.createMany({
      data: DEFAULT_CURRENCIES.map((c) => ({ ...c, userId })),
    });
    currencies = DEFAULT_CURRENCIES.map(({ code, label }) => ({ code, label }));
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 shadow-lg shadow-emerald-500/25">
                <span className="text-sm font-bold text-white">F</span>
              </div>
              <span className="text-lg font-semibold text-white">FinOps Tracker</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Hero card */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          {/* Ambient glows */}
          <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative flex items-center gap-3">
            {/* Back arrow */}
            <Link
              href="/"
              aria-label="Back to dashboard"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>

            {/* Title block */}
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">
                Configuration
              </p>
              <h1 className="mt-1 text-2xl font-bold text-white">Settings</h1>
              <p className="mt-1 text-sm text-slate-400">
                Manage your currencies and preferences.
              </p>
            </div>
          </div>
        </div>

        {/* Currency settings panel */}
        <CurrencySettings
          initialCurrencies={currencies.map((c) => ({
            code: c.code,
            label: c.label,
          }))}
        />
      </main>
    </div>
  );
}
