"use client";

import { useState } from "react";
import AddAccountModal from "./AddAccountModal";
import AddTransactionModal from "./AddTransactionModal";

type Account = {
  id: string; name: string; type: string; currency: string;
  balance: string; color: string; creditLimit: string | null;
};
type Transaction = {
  id: string; type: string; status: string; amount: string;
  date: string; vendor: string | null; description: string | null;
  categoryName: string | null; accountName: string; currency: string;
};
type Category = { id: string; nameEn: string; type: string };
type Summary = { totalBalance: string; monthIncome: string; monthExpenses: string };

function fmt(amount: string | number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(Number(amount));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

export default function Dashboard({
  accounts, transactions, categories, summary,
}: {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  summary: Summary;
}) {
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Net Worth"
          value={fmt(summary.totalBalance)}
          sub="across all accounts"
          accent="emerald"
        />
        <SummaryCard
          label="Income This Month"
          value={fmt(summary.monthIncome)}
          sub="verified transactions"
          accent="blue"
        />
        <SummaryCard
          label="Expenses This Month"
          value={fmt(summary.monthExpenses)}
          sub="verified transactions"
          accent="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Accounts */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Accounts</h2>
            <button
              onClick={() => setShowAddAccount(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/30 hover:text-emerald-300"
            >
              <span className="text-base leading-none">+</span> Add Account
            </button>
          </div>

          {accounts.length === 0 ? (
            <EmptyState
              icon="🏦"
              message="No accounts yet"
              action="Add your first account to get started"
              onAction={() => setShowAddAccount(true)}
              actionLabel="Add Account"
            />
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="group flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-8 w-8 flex-shrink-0 rounded-lg shadow-md"
                      style={{ backgroundColor: a.color + "33", border: `1.5px solid ${a.color}66` }}
                    >
                      <div className="flex h-full items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{a.name}</p>
                      <p className="text-xs text-slate-500">{a.type.charAt(0) + a.type.slice(1).toLowerCase()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${Number(a.balance) < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {fmt(a.balance, a.currency)}
                    </p>
                    {a.creditLimit && (
                      <p className="text-xs text-slate-600">of {fmt(a.creditLimit, a.currency)} limit</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Recent Transactions</h2>
            <button
              onClick={() => setShowAddTx(true)}
              disabled={accounts.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/30 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-base leading-none">+</span> Add Transaction
            </button>
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              icon="💳"
              message="No transactions yet"
              action={accounts.length === 0 ? "Add an account first" : "Record your first transaction"}
              onAction={accounts.length > 0 ? () => setShowAddTx(true) : undefined}
              actionLabel="Add Transaction"
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm ${
                      t.type === "INCOME" ? "bg-emerald-900/50 text-emerald-400"
                      : t.type === "EXPENSE" ? "bg-red-900/50 text-red-400"
                      : "bg-blue-900/50 text-blue-400"
                    }`}>
                      {t.type === "INCOME" ? "↑" : t.type === "EXPENSE" ? "↓" : "⇄"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {t.vendor ?? t.description ?? "Unnamed"}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>{t.categoryName ?? t.type.charAt(0) + t.type.slice(1).toLowerCase()}</span>
                        <span>·</span>
                        <span>{fmtDate(t.date)}</span>
                        {t.status === "PENDING" && (
                          <span className="rounded bg-amber-900/50 px-1 py-0.5 text-amber-400">pending</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className={`ml-3 flex-shrink-0 text-sm font-semibold tabular-nums ${
                    t.type === "INCOME" ? "text-emerald-400" : t.type === "EXPENSE" ? "text-red-400" : "text-blue-400"
                  }`}>
                    {t.type === "INCOME" ? "+" : t.type === "EXPENSE" ? "−" : ""}
                    {fmt(t.amount, t.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
      {showAddTx && (
        <AddTransactionModal
          accounts={accounts}
          categories={categories}
          onClose={() => setShowAddTx(false)}
        />
      )}
    </main>
  );
}

function SummaryCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub: string; accent: "emerald" | "blue" | "rose";
}) {
  const styles = {
    emerald: "border-emerald-900/60 bg-gradient-to-br from-emerald-950/80 to-slate-900/80 shadow-emerald-950/50",
    blue:    "border-blue-900/60    bg-gradient-to-br from-blue-950/80    to-slate-900/80 shadow-blue-950/50",
    rose:    "border-rose-900/60    bg-gradient-to-br from-rose-950/80    to-slate-900/80 shadow-rose-950/50",
  };
  const valueStyles = { emerald: "text-emerald-400", blue: "text-blue-400", rose: "text-rose-400" };

  return (
    <div className={`rounded-xl border px-5 py-4 shadow-lg backdrop-blur-sm ${styles[accent]}`}>
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueStyles[accent]}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-600">{sub}</p>
    </div>
  );
}

function EmptyState({
  icon, message, action, onAction, actionLabel,
}: {
  icon: string; message: string; action: string;
  onAction?: () => void; actionLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800 py-10 text-center">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-sm font-medium text-slate-400">{message}</p>
        <p className="mt-0.5 text-xs text-slate-600">{action}</p>
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="mt-1 rounded-lg bg-emerald-600/20 px-4 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/30"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
