"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AddAccountModal from "./AddAccountModal";
import AddTransactionModal from "./AddTransactionModal";
import TransactionsSection from "./TransactionsSection";
import BudgetsSection from "./BudgetsSection";
import StatsSection from "./StatsSection";
import AnalyticsSection from "./AnalyticsSection";

type Account = {
  id: string; name: string; type: string; currency: string;
  balance: string; color: string; creditLimit: string | null;
  apr?: string | null; notes?: string | null; isArchived?: boolean;
};
type Transaction = {
  id: string; type: string; status: string; amount: string;
  date: string; vendor: string | null; description: string | null;
  categoryName: string | null; accountName: string; currency: string;
};
type Category = { id: string; key: string; nameEn: string; type: string; color: string };
type Summary = {
  totalBalance: string;
  totalBalanceNzd: string | null;
  monthIncome: string;
  monthExpenses: string;
  fxCheckedAt: string | null;
  fxProvider: string | null;
  currencies: string[];
  rawBalancesByCurrency: { currency: string; total: string }[];
};
type SectionId = "overview" | "accounts" | "transactions" | "budgets" | "analytics" | "stats" | "receipts" | "tax";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "transactions", label: "Transactions" },
  { id: "budgets", label: "Budgets" },
  { id: "analytics", label: "Analytics" },
  { id: "stats", label: "Stats" },
  { id: "receipts", label: "Receipts" },
  { id: "tax", label: "Tax" },
];

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [nzdTotal, setNzdTotal] = useState<string | null>(summary.totalBalanceNzd);
  const [fxCheckedAt, setFxCheckedAt] = useState<string | null>(summary.fxCheckedAt);
  const [fxProvider, setFxProvider] = useState<string | null>(summary.fxProvider);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section && SECTIONS.some((s) => s.id === section)) {
      setActiveSection(section as SectionId);
      return;
    }
    setActiveSection("overview");
  }, [searchParams]);

  function navigate(section: SectionId) {
    setActiveSection(section);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function recheckFx() {
    setFxLoading(true);
    setFxError(null);

    try {
      const res = await fetch("/api/fx/latest", { cache: "no-store" });
      const data = await res.json() as {
        rates?: Record<string, number>;
        updatedAt?: string | null;
        provider?: string;
      };

      if (!res.ok || !data.rates) {
        throw new Error("Failed to load exchange rates");
      }

      const convertedTotal = accounts.reduce((sum, a) => {
        if (a.currency === "NZD") return sum + Number(a.balance);
        const rateFromNzd = data.rates?.[a.currency];
        if (!rateFromNzd || rateFromNzd <= 0) return sum + Number(a.balance);
        return sum + Number(a.balance) / rateFromNzd;
      }, 0);

      setNzdTotal((Math.round(convertedTotal * 100) / 100).toFixed(2));
      setFxCheckedAt(data.updatedAt ?? null);
      setFxProvider(data.provider ?? null);
    } catch (error) {
      setFxError(error instanceof Error ? error.message : "Failed to refresh rates");
    } finally {
      setFxLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
        <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Control Center</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Financial cockpit for every account and transaction</h1>
          <p className="mt-2 text-sm text-slate-400">Navigate accounts, inspect transaction details, build budgets, and view spending intelligence.</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => navigate(section.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
              activeSection === section.id
                ? "border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
                : "border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeSection === "overview" && (
        <>
          <div className="mb-8 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {summary.rawBalancesByCurrency.length > 1 ? (
              <div className="rounded-xl border border-emerald-900/60 bg-gradient-to-br from-emerald-950/80 to-slate-900/80 px-5 py-4 shadow-lg shadow-emerald-950/50 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Raw Net Worth (by currency)</p>
                <div className="mt-2 space-y-1.5">
                  {summary.rawBalancesByCurrency.map((item) => (
                    <div key={item.currency} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{item.currency}</span>
                      <span className="font-semibold text-emerald-300">{fmt(item.total, item.currency)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-600">Separated because multiple account currencies are present.</p>
              </div>
            ) : (
              <SummaryCard
                label="Net Worth (Original)"
                value={fmt(summary.totalBalance)}
                sub="raw sum across account currencies"
                accent="emerald"
              />
            )}
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

          <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-cyan-300/80">FX Normalized Total</p>
                <p className="mt-1 text-2xl font-bold text-white">{nzdTotal ? fmt(nzdTotal, "NZD") : "Unavailable"}</p>
                <p className="text-xs text-slate-500">
                  {summary.currencies.length > 1
                    ? `Converted from: ${summary.currencies.join(", ")}`
                    : "All balances already in NZD"}
                </p>
                {(fxCheckedAt || fxProvider) && (
                  <p className="mt-1 text-xs text-slate-500">Source: {fxProvider ?? "public API"} {fxCheckedAt ? `· ${new Date(fxCheckedAt).toLocaleString("en-NZ")}` : ""}</p>
                )}
              </div>
              <button
                onClick={recheckFx}
                disabled={fxLoading}
                className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {fxLoading ? "Checking..." : "Recheck via public FX API"}
              </button>
            </div>
            {fxError && <p className="mt-2 text-xs text-red-400">{fxError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    <AccountRow key={a.id} account={a} onClick={() => setSelectedAccount(a)} />
                  ))}
                </div>
              )}
            </section>

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
        </>
      )}

      {activeSection === "accounts" && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Account Directory</h2>
            <button
              onClick={() => setShowAddAccount(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/30 hover:text-emerald-300"
            >
              <span className="text-base leading-none">+</span> Add Account
            </button>
          </div>
          <div className="space-y-2">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} onClick={() => setSelectedAccount(a)} />
            ))}
          </div>
        </section>

      )}

      {activeSection === "transactions" && (
        <TransactionsSection
          accounts={accounts}
          categories={categories}
          onAddTransaction={() => setShowAddTx(true)}
        />
      )}

      {activeSection === "budgets" && (
        <BudgetsSection categories={categories} />
      )}

      {activeSection === "analytics" && (
        <AnalyticsSection accounts={accounts} />
      )}

      {activeSection === "stats" && (
        <StatsSection />
      )}

      {activeSection === "receipts" && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-lg font-semibold text-white">Receipts</h2>
          <p className="mt-2 text-sm text-slate-400">Receipt scanning exists via API and this section is reserved for scan queue and verification workflow UI.</p>
        </section>
      )}

      {activeSection === "tax" && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-lg font-semibold text-white">Tax</h2>
          <p className="mt-2 text-sm text-slate-400">Tax summary dashboards are planned in the next delivery slices.</p>
        </section>
      )}

      {/* Modals */}
      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
      {showAddTx && (
        <AddTransactionModal
          accounts={accounts}
          categories={categories}
          onClose={() => setShowAddTx(false)}
        />
      )}
      {selectedAccount && (
        <AccountDetailsModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </main>
  );
}

function AccountRow({ account, onClick }: { account: Account; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 text-left transition hover:border-cyan-700/70 hover:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 flex-shrink-0 rounded-lg shadow-md"
          style={{ backgroundColor: account.color + "33", border: `1.5px solid ${account.color}66` }}
        >
          <div className="flex h-full items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: account.color }} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-white">{account.name}</p>
          <p className="text-xs text-slate-500">{account.type.charAt(0) + account.type.slice(1).toLowerCase()} · tap for details</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${Number(account.balance) < 0 ? "text-red-400" : "text-emerald-400"}`}>
          {fmt(account.balance, account.currency)}
        </p>
        {account.creditLimit && (
          <p className="text-xs text-slate-600">of {fmt(account.creditLimit, account.currency)} limit</p>
        )}
      </div>
    </button>
  );
}

function AccountDetailsModal({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: account.balance,
    creditLimit: account.creditLimit ?? "",
    apr: account.apr ?? "",
    notes: account.notes ?? "",
    color: account.color,
    isArchived: account.isArchived ?? false,
  });
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      setLoadingDetails(true);
      try {
        const res = await fetch(`/api/accounts/${account.id}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load account details");
        }

        const data = await res.json() as {
          account?: {
            name: string;
            type: string;
            currency: string;
            balance: string;
            creditLimit: string | null;
            apr: string | null;
            notes: string | null;
            color: string;
            isArchived: boolean;
          };
        };

        if (!cancelled && data.account) {
          setForm({
            name: data.account.name,
            type: data.account.type,
            currency: data.account.currency,
            balance: data.account.balance,
            creditLimit: data.account.creditLimit ?? "",
            apr: data.account.apr ?? "",
            notes: data.account.notes ?? "",
            color: data.account.color,
            isArchived: data.account.isArchived,
          });
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load account details");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, [account.id]);

  async function save() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          currency: form.currency,
          balance: Number(form.balance),
          creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
          apr: form.apr ? Number(form.apr) : null,
          notes: form.notes || null,
          color: form.color,
          isArchived: form.isArchived,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to save account");
      }

      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save account");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Account Details</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white">✕</button>
        </div>

        <div className="space-y-4 p-6">
          {error && <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
                {[
                  { value: "CHECKING", label: "Checking" },
                  { value: "SAVINGS", label: "Savings" },
                  { value: "CREDIT", label: "Credit" },
                  { value: "LOAN", label: "Loan" },
                ].map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Balance</label>
              <input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls}>
                {["NZD", "AUD", "USD", "EUR", "GBP", "RUB"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {form.type === "CREDIT" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Credit Limit</label>
                <input type="number" step="0.01" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">APR</label>
                <input type="number" step="0.001" value={form.apr} onChange={(e) => setForm({ ...form, apr: e.target.value })} className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={inputCls} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Color</label>
            <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className={inputCls} />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 transition hover:border-slate-600">
            <input type="checkbox" checked={form.isArchived} onChange={(e) => setForm({ ...form, isArchived: e.target.checked })} className="h-4 w-4 accent-cyan-500" />
            <span className="text-sm text-slate-300">Archive account</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-400 transition hover:border-slate-500 hover:text-white">Cancel</button>
            <button type="button" disabled={loading || loadingDetails} onClick={save} className="flex-1 rounded-lg bg-cyan-600 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50">
              {loading ? "Saving..." : loadingDetails ? "Loading..." : "Save Details"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
