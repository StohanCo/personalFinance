"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  key: string;
  nameEn: string;
  type: string;
  color: string;
};

type BudgetsSectionProps = {
  categories: Category[];
  onRefresh?: () => void;
};

type Period = "MONTHLY" | "QUARTERLY" | "YEARLY";

type Budget = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryType: string;
  amount: string;
  period: string;
  startDate: string;
  endDate: string | null;
  rollover: boolean;
  alertAt: number | null;
  createdAt: string;
};

type ProgressItem = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budgetAmount: string;
  actualAmount: string;
  remaining: string;
  percentUsed: number;
  isOverBudget: boolean;
  alertTriggered: boolean;
  alertAt: number | null;
};

type ProgressResponse = {
  period: Period;
  periodStart: string;
  periodEnd: string;
  items: ProgressItem[];
};

type BudgetsListResponse = {
  budgets: Budget[];
};

// ── Utilities ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function fmt(amount: string | number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function periodLabel(period: string): string {
  if (period === "MONTHLY") return "Monthly";
  if (period === "QUARTERLY") return "Quarterly";
  if (period === "YEARLY") return "Yearly";
  return period;
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
  });
}

function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const PERIODS: Period[] = ["MONTHLY", "QUARTERLY", "YEARLY"];

// Shared input class
const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40";

// ── Color Dot ─────────────────────────────────────────────────────────────────

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-white/10"
      style={{ backgroundColor: color || "#64748b" }}
      aria-hidden="true"
    />
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const isOver = percent >= 100;
  const isWarn = percent >= 80 && percent < 100;

  const gradient = isOver
    ? "from-red-500 to-red-400"
    : isWarn
    ? "from-amber-500 to-amber-400"
    : "from-emerald-500 to-cyan-500";

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${gradient}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────

function ProgressSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading progress">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-slate-800" />
            <div className="h-4 w-36 rounded bg-slate-800" />
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800" />
          <div className="flex justify-between">
            <div className="h-3 w-32 rounded bg-slate-800" />
            <div className="h-3 w-20 rounded bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BudgetsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading budgets">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse h-16 rounded-xl border border-slate-800 bg-slate-900/60"
        />
      ))}
    </div>
  );
}

// ── Budget Modal ──────────────────────────────────────────────────────────────

type ModalMode = "create" | "edit";

interface BudgetModalProps {
  mode: ModalMode;
  budget?: Budget;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

function BudgetModal({
  mode,
  budget,
  categories,
  onClose,
  onSaved,
}: BudgetModalProps) {
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  const [form, setForm] = useState({
    categoryId: budget?.categoryId ?? expenseCategories[0]?.id ?? "",
    amount: budget?.amount ?? "",
    period: (budget?.period ?? "MONTHLY") as Period,
    startDate: budget?.startDate ?? today(),
    alertAt: budget?.alertAt != null ? String(budget.alertAt) : "",
    rollover: budget?.rollover ?? false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "create" && !form.categoryId) {
      setError("Select a category");
      return;
    }
    const parsedAmount = parseFloat(form.amount);
    if (!form.amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount greater than zero");
      return;
    }

    setLoading(true);
    setError("");

    const alertAtValue =
      form.alertAt.trim() !== "" ? parseInt(form.alertAt, 10) : null;

    const body: Record<string, unknown> = {
      amount: parsedAmount,
      period: form.period,
      startDate: form.startDate,
      rollover: form.rollover,
      alertAt: alertAtValue,
    };

    if (mode === "create") {
      body.categoryId = form.categoryId;
    }

    const url =
      mode === "create" ? "/api/budgets" : `/api/budgets/${budget!.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: unknown };
        setError(
          typeof data.error === "string" ? data.error : "Failed to save budget"
        );
        setLoading(false);
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  // Find the selected category to show its color dot in the dropdown label
  const selectedCategory = expenseCategories.find(
    (c) => c.id === form.categoryId
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2
            id="budget-modal-title"
            className="text-lg font-semibold text-white"
          >
            {mode === "create" ? "Add Budget" : "Edit Budget"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close modal"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 p-6"
        >
          {error && (
            <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Category (create only) */}
          {mode === "create" && (
            <div>
              <label
                htmlFor="budget-category"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Category
              </label>
              <div className="relative">
                {selectedCategory && (
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                    <ColorDot color={selectedCategory.color} />
                  </div>
                )}
                <select
                  id="budget-category"
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm({ ...form, categoryId: e.target.value })
                  }
                  className={`${inputCls} ${selectedCategory ? "pl-8" : ""}`}
                  required
                >
                  <option value="">Select expense category…</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Edit mode: show category name read-only */}
          {mode === "edit" && budget && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2.5">
              <ColorDot color={budget.categoryColor} />
              <span className="text-sm font-medium text-white">
                {budget.categoryName}
              </span>
              <span className="ml-auto text-xs text-slate-600">
                category locked
              </span>
            </div>
          )}

          {/* Amount + Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="budget-amount"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Amount (NZD)
              </label>
              <input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor="budget-period"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Period
              </label>
              <select
                id="budget-period"
                value={form.period}
                onChange={(e) =>
                  setForm({ ...form, period: e.target.value as Period })
                }
                className={inputCls}
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start date + Alert % */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="budget-start"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Start Date
              </label>
              <input
                id="budget-start"
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor="budget-alert"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Alert at{" "}
                <span className="text-slate-500">% (optional)</span>
              </label>
              <input
                id="budget-alert"
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.alertAt}
                onChange={(e) =>
                  setForm({ ...form, alertAt: e.target.value })
                }
                placeholder="e.g. 80"
                className={inputCls}
              />
            </div>
          </div>

          {/* Rollover toggle */}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-4 py-3 transition hover:border-slate-600">
            <input
              type="checkbox"
              checked={form.rollover}
              onChange={(e) =>
                setForm({ ...form, rollover: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
            <div>
              <p className="text-sm font-medium text-slate-200">
                Rollover unspent balance
              </p>
              <p className="text-xs text-slate-500">
                Carry unused budget into the next period
              </p>
            </div>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-400 transition hover:border-slate-500 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 py-2.5 text-sm font-medium text-white shadow-md shadow-cyan-900/30 transition hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-50"
            >
              {loading
                ? "Saving…"
                : mode === "create"
                ? "Create Budget"
                : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Dialog ─────────────────────────────────────────────────────

interface DeleteDialogProps {
  budget: Budget;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteDialog({
  budget,
  loading,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900/95 p-6 shadow-2xl shadow-black/50">
        {/* Icon + Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-900/30">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3
            id="delete-dialog-title"
            className="text-base font-semibold text-white"
          >
            Delete Budget
          </h3>
        </div>

        <p className="mt-3 text-sm text-slate-400">
          Delete the{" "}
          <span className="font-semibold text-white">
            {budget.categoryName}
          </span>{" "}
          {periodLabel(budget.period).toLowerCase()} budget of{" "}
          <span className="font-semibold text-white">
            {fmt(budget.amount)}
          </span>
          ? This action cannot be undone.
        </p>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-400 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BudgetsSection({
  categories,
  onRefresh,
}: BudgetsSectionProps) {
  const [activePeriod, setActivePeriod] = useState<Period>("MONTHLY");
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [progressMeta, setProgressMeta] = useState<{
    periodStart: string;
    periodEnd: string;
  } | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [budgetsError, setBudgetsError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchProgress = useCallback(async (period: Period) => {
    setProgressLoading(true);
    setProgressError(null);
    try {
      const res = await fetch(`/api/budgets/progress?period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ProgressResponse;
      setProgress(data.items ?? []);
      setProgressMeta({
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      });
    } catch {
      setProgressError("Failed to load budget progress");
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const fetchBudgets = useCallback(async () => {
    setBudgetsLoading(true);
    setBudgetsError(null);
    try {
      const res = await fetch("/api/budgets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BudgetsListResponse;
      setBudgets(data.budgets ?? []);
    } catch {
      setBudgetsError("Failed to load budgets");
    } finally {
      setBudgetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProgress(activePeriod);
  }, [activePeriod, fetchProgress]);

  useEffect(() => {
    void fetchBudgets();
  }, [fetchBudgets]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSaved() {
    void fetchProgress(activePeriod);
    void fetchBudgets();
    onRefresh?.();
  }

  async function handleDelete(budget: Budget) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/budgets/${budget.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }
      setDeleteTarget(null);
      void fetchBudgets();
      void fetchProgress(activePeriod);
      onRefresh?.();
    } catch {
      setBudgetsError("Failed to delete budget");
    } finally {
      setDeleteLoading(false);
    }
  }

  // Build a lookup map: budgetId → progress item (for the "All Budgets" list)
  const progressByBudgetId = new Map(
    progress.map((p) => [p.budgetId, p] as const)
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="mt-6 space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Budgets</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Per-category spending limits with real-time progress tracking.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-900/40 transition hover:from-cyan-500 hover:to-emerald-500 active:scale-95"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Budget
        </button>
      </div>

      {/* ── Progress Section ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
        {/* Header row: title + period tabs */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Spending Progress
            </h3>
            {progressMeta && !progressLoading && (
              <p className="mt-0.5 text-xs text-slate-600">
                {fmtShortDate(progressMeta.periodStart)}
                {" – "}
                {fmtLongDate(progressMeta.periodEnd)}
              </p>
            )}
          </div>

          {/* Period tab strip */}
          <div
            className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1"
            role="tablist"
            aria-label="Budget period"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={activePeriod === p}
                onClick={() => setActivePeriod(p)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                  activePeriod === p
                    ? "border border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
                    : "border border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>
        </div>

        {/* Progress error */}
        {progressError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-900/30 px-4 py-2.5 text-sm text-red-400">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {progressError}
          </div>
        )}

        {/* Loading skeleton */}
        {progressLoading && <ProgressSkeleton />}

        {/* Empty state */}
        {!progressLoading && !progressError && progress.length === 0 && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60">
              <svg
                className="h-6 w-6 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">
              No {periodLabel(activePeriod).toLowerCase()} budgets active
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Create a budget above to start tracking your spending
            </p>
          </div>
        )}

        {/* Progress cards */}
        {!progressLoading && !progressError && progress.length > 0 && (
          <div className="space-y-6">
            {progress.map((item) => {
              const pct = Math.round(item.percentUsed);
              const isOver = item.isOverBudget;
              const isAlert = item.alertTriggered && !isOver;
              const remainingNum = Number(item.remaining);

              return (
                <div key={item.budgetId} className="group/progress">
                  {/* Row 1: Name + badges + percentage */}
                  <div className="mb-2 flex items-center gap-2">
                    <ColorDot color={item.categoryColor} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {item.categoryName}
                    </span>

                    {isOver && (
                      <span className="flex-shrink-0 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400 ring-1 ring-red-500/30">
                        Over budget!
                      </span>
                    )}
                    {isAlert && (
                      <span className="flex-shrink-0 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
                        ⚠ Alert threshold reached
                      </span>
                    )}

                    <span
                      className={`flex-shrink-0 font-mono text-xs font-bold tabular-nums ${
                        isOver
                          ? "text-red-400"
                          : isAlert
                          ? "text-amber-400"
                          : "text-slate-400"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <ProgressBar percent={item.percentUsed} />

                  {/* Row 3: Spend detail */}
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
                    <p className="text-xs text-slate-500">
                      <span className="text-slate-300">
                        {fmt(item.actualAmount)}
                      </span>{" "}
                      <span className="text-slate-600">spent of</span>{" "}
                      <span className="text-slate-300">
                        {fmt(item.budgetAmount)}
                      </span>
                    </p>
                    <p
                      className={`text-xs font-medium tabular-nums ${
                        remainingNum < 0
                          ? "text-red-500"
                          : remainingNum === 0
                          ? "text-slate-500"
                          : "text-emerald-400"
                      }`}
                    >
                      {remainingNum < 0
                        ? `${fmt(Math.abs(remainingNum))} over`
                        : `${fmt(remainingNum)} remaining`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── All Budgets List ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
          All Budgets
        </h3>

        {/* Budgets error */}
        {budgetsError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-900/30 px-4 py-2.5 text-sm text-red-400">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {budgetsError}
          </div>
        )}

        {budgetsLoading && <BudgetsSkeleton />}

        {!budgetsLoading && !budgetsError && budgets.length === 0 && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-slate-700 bg-slate-900/60">
              <svg
                className="h-6 w-6 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">
              No budgets yet
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Hit{" "}
              <span className="text-cyan-400">Add Budget</span> to create
              your first spending limit
            </p>
          </div>
        )}

        {!budgetsLoading && !budgetsError && budgets.length > 0 && (
          <div className="space-y-2">
            {budgets.map((b) => {
              const prog = progressByBudgetId.get(b.id);
              const periodMatchesActive = b.period === activePeriod;

              return (
                <div
                  key={b.id}
                  className="group/budget flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900/80"
                >
                  <ColorDot color={b.categoryColor} />

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-white">
                        {b.categoryName}
                      </p>
                      <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-500">
                        {periodLabel(b.period)}
                      </span>
                      {b.rollover && (
                        <span className="rounded-full border border-cyan-800/40 bg-cyan-900/20 px-2 py-0.5 text-xs text-cyan-500">
                          Rollover
                        </span>
                      )}
                      {/* Show progress badge only when viewing matching period */}
                      {prog && periodMatchesActive && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                            prog.isOverBudget
                              ? "bg-red-500/15 text-red-400 ring-red-500/30"
                              : prog.alertTriggered
                              ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                          }`}
                        >
                          {Math.round(prog.percentUsed)}% used
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>
                        <span className="text-slate-300">{fmt(b.amount)}</span>{" "}
                        / {periodLabel(b.period).toLowerCase()}
                      </span>
                      {b.alertAt !== null && (
                        <span className="text-slate-600">
                          ⚡ Alert at {b.alertAt}%
                        </span>
                      )}
                      <span className="text-slate-700">
                        from {fmtShortDate(b.startDate)}
                        {b.endDate ? ` → ${fmtShortDate(b.endDate)}` : ""}
                      </span>
                    </div>
                  </div>

                  {/* Actions (reveal on hover) */}
                  <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/budget:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => setEditBudget(b)}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-cyan-300"
                      aria-label={`Edit ${b.categoryName} budget`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(b)}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-900/30 hover:text-red-400"
                      aria-label={`Delete ${b.categoryName} budget`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {showCreateModal && (
        <BudgetModal
          mode="create"
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onSaved={handleSaved}
        />
      )}

      {editBudget !== null && (
        <BudgetModal
          mode="edit"
          budget={editBudget}
          categories={categories}
          onClose={() => setEditBudget(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget !== null && (
        <DeleteDialog
          budget={deleteTarget}
          loading={deleteLoading}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete(deleteTarget)}
        />
      )}
    </section>
  );
}
