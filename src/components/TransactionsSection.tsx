"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type TxFull = {
  id: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  date: string;
  vendor: string | null;
  description: string | null;
  notes: string | null;
  gstApplicable: boolean;
  gstAmount: string | null;
  gstInclusive: boolean;
  isDeductible: boolean;
  deductiblePercent: number;
  accountId: string;
  accountName: string;
  accountColor: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  receiptId: string | null;
  source: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  transactions: TxFull[];
  nextCursor: string | null;
  total: number;
};

type EditForm = {
  vendor: string;
  description: string;
  notes: string;
  amount: string;
  date: string;
  type: string;
  categoryId: string;
  gstApplicable: boolean;
  isDeductible: boolean;
  deductiblePercent: string;
};

export type TransactionsSectionProps = {
  accounts: { id: string; name: string; color: string }[];
  categories: { id: string; key: string; nameEn: string; type: string; color?: string }[];
  onAddTransaction?: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: string | number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(
    Number(amount),
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
  });
}

const TYPE_COLOR: Record<string, string> = {
  INCOME: "text-emerald-400",
  EXPENSE: "text-red-400",
  TRANSFER: "text-blue-400",
};

const TYPE_PILL: Record<string, string> = {
  INCOME: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  EXPENSE: "bg-red-500/15 border-red-500/30 text-red-400",
  TRANSFER: "bg-blue-500/15 border-blue-500/30 text-blue-400",
};

const TYPE_ICON: Record<string, string> = {
  INCOME: "↑",
  EXPENSE: "↓",
  TRANSFER: "⇄",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  VERIFIED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/20 line-through",
};

const EMPTY_EDIT: EditForm = {
  vendor: "",
  description: "",
  notes: "",
  amount: "",
  date: "",
  type: "EXPENSE",
  categoryId: "",
  gstApplicable: false,
  isDeductible: false,
  deductiblePercent: "0",
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TransactionsSection({
  accounts,
  categories,
  onAddTransaction,
}: TransactionsSectionProps) {
  const router = useRouter();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data state ────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<TxFull[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Drawer state ──────────────────────────────────────────────────────────
  const [selectedTx, setSelectedTx] = useState<TxFull | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasFilters =
    filterType !== "ALL" ||
    filterStatus !== "ALL" ||
    filterAccountId !== "" ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    debouncedSearch !== "";

  const filteredCats = categories.filter(
    (c) => c.type === editForm.type || editForm.type === "TRANSFER",
  );

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(filterSearch);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filterSearch]);

  // ── Fetch transactions ────────────────────────────────────────────────────
  // First page asks for ?withCount=1 to populate the header counter; subsequent
  // load-more pages skip the count to avoid the full-table aggregate scan.
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const p = new URLSearchParams({ limit: "50", withCount: "1" });
      if (filterType !== "ALL") p.set("type", filterType);
      if (filterStatus !== "ALL") p.set("status", filterStatus);
      if (filterAccountId) p.set("accountId", filterAccountId);
      if (filterDateFrom) p.set("dateFrom", filterDateFrom);
      if (filterDateTo) p.set("dateTo", filterDateTo);
      if (debouncedSearch) p.set("search", debouncedSearch);

      const res = await fetch(`/api/transactions?${p.toString()}`);
      if (!res.ok) throw new Error("Failed to load transactions");
      const data = (await res.json()) as ApiResponse;
      setTransactions(data.transactions);
      setNextCursor(data.nextCursor);
      if (data.total !== null && data.total !== undefined) setTotal(data.total);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error loading transactions");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, filterAccountId, filterDateFrom, filterDateTo, debouncedSearch]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  // ── Load more ─────────────────────────────────────────────────────────────
  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams({ limit: "50", cursor: nextCursor });
      if (filterType !== "ALL") p.set("type", filterType);
      if (filterStatus !== "ALL") p.set("status", filterStatus);
      if (filterAccountId) p.set("accountId", filterAccountId);
      if (filterDateFrom) p.set("dateFrom", filterDateFrom);
      if (filterDateTo) p.set("dateTo", filterDateTo);
      if (debouncedSearch) p.set("search", debouncedSearch);

      const res = await fetch(`/api/transactions?${p.toString()}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as ApiResponse;
      setTransactions((prev) => [...prev, ...data.transactions]);
      setNextCursor(data.nextCursor);
    } catch {
      /* silently ignore load-more failures */
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Clear filters ─────────────────────────────────────────────────────────
  function clearFilters() {
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterAccountId("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterSearch("");
    setDebouncedSearch("");
  }

  // ── Drawer helpers ────────────────────────────────────────────────────────
  function openDrawer(tx: TxFull) {
    setSelectedTx(tx);
    setDrawerOpen(true);
    setEditMode(false);
    setDeleteConfirm(false);
    setSaveError(null);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditMode(false);
    setDeleteConfirm(false);
    setSaveError(null);
    // delay clearing tx until slide-out animation completes
    setTimeout(() => setSelectedTx(null), 300);
  }

  function beginEdit(tx: TxFull) {
    setEditMode(true);
    setSaveError(null);
    setEditForm({
      vendor: tx.vendor ?? "",
      description: tx.description ?? "",
      notes: tx.notes ?? "",
      amount: tx.amount,
      date: tx.date.slice(0, 10),
      type: tx.type,
      categoryId: tx.categoryId ?? "",
      gstApplicable: tx.gstApplicable,
      isDeductible: tx.isDeductible,
      deductiblePercent: String(tx.deductiblePercent),
    });
  }

  // ── Verify / Reject ───────────────────────────────────────────────────────
  async function updateStatus(status: "VERIFIED" | "REJECTED") {
    if (!selectedTx) return;
    setStatusLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/transactions/${selectedTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status update failed");
      const updated = (await res.json()) as TxFull;
      setSelectedTx(updated);
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTx) return;
    setSaveLoading(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        vendor: editForm.vendor || null,
        description: editForm.description || null,
        notes: editForm.notes || null,
        amount: parseFloat(editForm.amount),
        date: editForm.date,
        type: editForm.type,
        categoryId: editForm.categoryId || null,
        gstApplicable: editForm.gstApplicable,
        isDeductible: editForm.isDeductible,
        deductiblePercent: parseInt(editForm.deductiblePercent) || 0,
      };
      const res = await fetch(`/api/transactions/${selectedTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = (await res.json()) as TxFull;
      setSelectedTx(updated);
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditMode(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaveLoading(false);
    }
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────
  // Clones the selected tx as PENDING with today's date. The user can then
  // edit/verify/reject from the same drawer without needing to retype data.
  async function duplicateTx() {
    if (!selectedTx) return;
    setCloneLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/transactions/${selectedTx.id}/clone`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Duplicate failed");
      }
      const { transaction: created } = (await res.json()) as { transaction: TxFull };
      // Insert the new tx at the top of the list, jump the drawer to it so the
      // user can adjust the date/amount/etc immediately.
      setTransactions((prev) => [created, ...prev]);
      setTotal((prev) => prev + 1);
      setSelectedTx(created);
      setEditMode(true);
      setEditForm({
        vendor: created.vendor ?? "",
        description: created.description ?? "",
        notes: created.notes ?? "",
        amount: created.amount,
        date: created.date.slice(0, 10),
        type: created.type,
        categoryId: created.categoryId ?? "",
        gstApplicable: created.gstApplicable,
        isDeductible: created.isDeductible,
        deductiblePercent: String(created.deductiblePercent),
      });
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setCloneLoading(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteTx() {
    if (!selectedTx) return;
    setDeleteLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/transactions/${selectedTx.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      setTransactions((prev) => prev.filter((t) => t.id !== selectedTx.id));
      setTotal((prev) => Math.max(0, prev - 1));
      closeDrawer();
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to delete");
      setDeleteLoading(false);
      setDeleteConfirm(false);
    }
  }

  // ── Shared input class ────────────────────────────────────────────────────
  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30";

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <section className="mt-6">

      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Transaction Journal{" "}
          {!loading && (
            <span className="ml-1 text-sm font-normal text-slate-400">({total})</span>
          )}
        </h2>
        <button
          onClick={onAddTransaction}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-600/30 hover:text-emerald-300"
        >
          <span className="text-sm leading-none">+</span> Add Transaction
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Filters
          </span>
          <div className="flex items-center gap-3">
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-cyan-400 transition hover:text-cyan-300"
              >
                Clear filters
              </button>
            )}
            <button
              onClick={() => setFiltersOpen((p) => !p)}
              className="text-xs text-slate-500 transition hover:text-slate-300"
            >
              {filtersOpen ? "▲ Collapse" : "▼ Expand"}
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="space-y-3">
            {/* Type pills */}
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", "INCOME", "EXPENSE", "TRANSFER"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                    filterType === t
                      ? t === "INCOME"
                        ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                        : t === "EXPENSE"
                          ? "border-red-500/60 bg-red-500/20 text-red-300"
                          : t === "TRANSFER"
                            ? "border-blue-500/60 bg-blue-500/20 text-blue-300"
                            : "border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t === "ALL" ? "All Types" : t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", "PENDING", "VERIFIED", "REJECTED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                    filterStatus === s
                      ? s === "PENDING"
                        ? "border-amber-500/60 bg-amber-500/20 text-amber-300"
                        : s === "VERIFIED"
                          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                          : s === "REJECTED"
                            ? "border-red-500/60 bg-red-500/20 text-red-300"
                            : "border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  {s === "ALL" ? "All Statuses" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Account / Date range / Search */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className={inputCls}
              >
                <option value="">All Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className={inputCls}
                title="From date"
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className={inputCls}
                title="To date"
              />
              <input
                type="search"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search vendor / description…"
                className={inputCls}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Transaction list ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="animate-pulse text-sm text-slate-400">Loading transactions…</p>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-red-400">{fetchError}</p>
            <button
              onClick={() => void fetchTransactions()}
              className="text-xs text-cyan-400 transition hover:text-cyan-300"
            >
              Retry
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <div className="mb-3 text-3xl opacity-20">📋</div>
            <p className="text-sm font-medium text-slate-300">
              {hasFilters ? "No transactions match these filters" : "No transactions yet"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {hasFilters
                ? "Try adjusting the filters above"
                : "Add your first transaction to get started"}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-3 text-xs text-cyan-400 transition hover:text-cyan-300"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div>
            {transactions.map((tx, idx) => (
              <button
                key={tx.id}
                onClick={() => openDrawer(tx)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-800/50 ${
                  idx < transactions.length - 1 ? "border-b border-slate-800/80" : ""
                }`}
              >
                {/* Type icon badge */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${
                    TYPE_PILL[tx.type] ?? "border-slate-600 bg-slate-700/30 text-slate-400"
                  }`}
                >
                  {TYPE_ICON[tx.type] ?? "·"}
                </div>

                {/* Vendor + meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`truncate text-sm font-medium ${
                        tx.status === "REJECTED"
                          ? "text-slate-500 line-through"
                          : "text-white"
                      }`}
                    >
                      {tx.vendor ?? tx.description ?? "Unnamed transaction"}
                    </p>
                    {tx.status !== "VERIFIED" && (
                      <span
                        className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          STATUS_BADGE[tx.status] ?? ""
                        }`}
                      >
                        {tx.status === "PENDING" ? "Pending" : "Rejected"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {tx.accountName}
                    {tx.categoryName ? ` · ${tx.categoryName}` : ""}
                    {" · "}
                    {fmtDateShort(tx.date)}
                  </p>
                </div>

                {/* Amount */}
                <div className="flex-shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      TYPE_COLOR[tx.type] ?? "text-slate-400"
                    }`}
                  >
                    {tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "−" : ""}
                    {fmt(tx.amount, tx.currency)}
                  </p>
                  {tx.isDeductible && (
                    <p className="text-[10px] text-slate-600">
                      {tx.deductiblePercent}% deductible
                    </p>
                  )}
                </div>
              </button>
            ))}

            {/* Load more */}
            {nextCursor && (
              <div className="border-t border-slate-800 px-4 py-3 text-center">
                <button
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="text-xs font-medium text-cyan-400 transition hover:text-cyan-300 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more transactions"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Drawer backdrop ─────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* ── Detail / Edit drawer ─────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-md transform flex-col border-l border-slate-700 bg-slate-900 shadow-2xl transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedTx && (
          <>
            {/* Drawer header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${
                    TYPE_PILL[selectedTx.type] ??
                    "border-slate-600 bg-slate-700/30 text-slate-400"
                  }`}
                >
                  {TYPE_ICON[selectedTx.type] ?? "·"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {editMode
                      ? "Edit Transaction"
                      : (selectedTx.vendor ?? selectedTx.description ?? "Transaction")}
                  </p>
                  <p className="text-xs text-slate-500">{fmtDate(selectedTx.date)}</p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close drawer"
                className="ml-3 flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-5">
              {editMode ? (
                /* ── Edit form ───────────────────────────────────────────── */
                <form onSubmit={(e) => void saveEdit(e)} className="space-y-4">
                  {saveError && (
                    <p className="rounded-lg bg-red-900/40 px-3 py-2 text-xs text-red-400">
                      {saveError}
                    </p>
                  )}

                  {/* Type selector — TRANSFER is immutable once a tx is created
                      because it carries an account-pair invariant. */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Type
                    </label>
                    {editForm.type === "TRANSFER" ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-300">
                        Transfer
                        <span className="ml-2 text-slate-600">
                          (locked — delete & recreate to change)
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["INCOME", "EXPENSE"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              setEditForm((p) => ({ ...p, type: t, categoryId: "" }))
                            }
                            className={`rounded-lg py-1.5 text-xs font-medium transition ${
                              editForm.type === t
                                ? t === "INCOME"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-red-700 text-white"
                                : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                            }`}
                          >
                            {t.charAt(0) + t.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Vendor
                      </label>
                      <input
                        value={editForm.vendor}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, vendor: e.target.value }))
                        }
                        className={inputCls}
                        placeholder="Vendor name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Amount
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={editForm.amount}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, amount: e.target.value }))
                        }
                        className={inputCls}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Date
                      </label>
                      <input
                        type="date"
                        required
                        value={editForm.date}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, date: e.target.value }))
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Category
                      </label>
                      <select
                        value={editForm.categoryId}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, categoryId: e.target.value }))
                        }
                        className={inputCls}
                      >
                        <option value="">Uncategorised</option>
                        {filteredCats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Description
                    </label>
                    <input
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, description: e.target.value }))
                      }
                      className={inputCls}
                      placeholder="Short description"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Notes
                    </label>
                    <textarea
                      rows={3}
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, notes: e.target.value }))
                      }
                      className={inputCls}
                      placeholder="Additional notes"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 transition hover:border-slate-600">
                      <input
                        type="checkbox"
                        checked={editForm.gstApplicable}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, gstApplicable: e.target.checked }))
                        }
                        className="h-3.5 w-3.5 accent-cyan-500"
                      />
                      <span className="text-xs text-slate-300">GST Applicable</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 transition hover:border-slate-600">
                      <input
                        type="checkbox"
                        checked={editForm.isDeductible}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, isDeductible: e.target.checked }))
                        }
                        className="h-3.5 w-3.5 accent-cyan-500"
                      />
                      <span className="text-xs text-slate-300">Tax Deductible</span>
                    </label>
                  </div>

                  {editForm.isDeductible && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Deductible %{" "}
                        <span className="text-slate-600">({editForm.deductiblePercent}%)</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="10"
                        value={editForm.deductiblePercent}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, deductiblePercent: e.target.value }))
                        }
                        className="w-full accent-cyan-500"
                      />
                      <div className="mt-1 flex justify-between text-xs text-slate-600">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setSaveError(null);
                      }}
                      className="flex-1 rounded-lg border border-slate-700 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saveLoading}
                      className="flex-1 rounded-lg bg-cyan-600 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                    >
                      {saveLoading ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                /* ── View mode ───────────────────────────────────────────── */
                <div className="space-y-4">
                  {saveError && (
                    <p className="rounded-lg bg-red-900/40 px-3 py-2 text-xs text-red-400">
                      {saveError}
                    </p>
                  )}

                  {/* Amount hero */}
                  <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-2xl font-bold tabular-nums ${
                          TYPE_COLOR[selectedTx.type] ?? "text-white"
                        }`}
                      >
                        {selectedTx.type === "INCOME"
                          ? "+"
                          : selectedTx.type === "EXPENSE"
                            ? "−"
                            : ""}
                        {fmt(selectedTx.amount, selectedTx.currency)}
                      </p>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                          STATUS_BADGE[selectedTx.status] ?? ""
                        }`}
                      >
                        {selectedTx.status === "VERIFIED"
                          ? "✓ Verified"
                          : selectedTx.status.charAt(0) +
                            selectedTx.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedTx.currency} ·{" "}
                      {selectedTx.type.charAt(0) + selectedTx.type.slice(1).toLowerCase()}
                    </p>
                  </div>

                  {/* Core fields */}
                  <dl className="space-y-2.5">
                    <DetailRow label="Vendor" value={selectedTx.vendor} />
                    <DetailRow label="Description" value={selectedTx.description} />
                    {selectedTx.notes && (
                      <div>
                        <dt className="text-xs text-slate-500">Notes</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                          {selectedTx.notes}
                        </dd>
                      </div>
                    )}
                    <DetailRow label="Account" value={selectedTx.accountName} />
                    <DetailRow
                      label="Category"
                      value={selectedTx.categoryName ?? "Uncategorised"}
                    />
                    <DetailRow label="Date" value={fmtDate(selectedTx.date)} />
                    <DetailRow label="Source" value={selectedTx.source} />
                    {selectedTx.verifiedAt && (
                      <DetailRow label="Verified at" value={fmtDate(selectedTx.verifiedAt)} />
                    )}
                  </dl>

                  {/* GST section */}
                  {selectedTx.gstApplicable && (
                    <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        GST Details
                      </p>
                      <dl className="space-y-1.5">
                        <DetailRow label="GST Applicable" value="Yes" />
                        <DetailRow
                          label="GST Amount"
                          value={
                            selectedTx.gstAmount
                              ? fmt(selectedTx.gstAmount, selectedTx.currency)
                              : "Auto-calculated"
                          }
                        />
                        <DetailRow
                          label="GST Inclusive"
                          value={selectedTx.gstInclusive ? "Yes" : "No"}
                        />
                      </dl>
                    </div>
                  )}

                  {/* Deductibility section */}
                  {selectedTx.isDeductible && (
                    <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Tax Deductibility
                      </p>
                      <dl className="space-y-1.5">
                        <DetailRow label="Deductible" value="Yes" />
                        <DetailRow
                          label="Deductible %"
                          value={`${selectedTx.deductiblePercent}%`}
                        />
                        {selectedTx.gstAmount && (
                          <DetailRow
                            label="Deductible amount"
                            value={fmt(
                              (
                                (Number(selectedTx.amount) * selectedTx.deductiblePercent) /
                                100
                              ).toFixed(2),
                              selectedTx.currency,
                            )}
                          />
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Receipt */}
                  {selectedTx.receiptId && (
                    <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/20 p-3">
                      <p className="text-xs text-slate-500">Receipt attached</p>
                      <p className="mt-0.5 font-mono text-xs text-cyan-400">
                        {selectedTx.receiptId}
                      </p>
                    </div>
                  )}

                  {/* Metadata footer */}
                  <div className="space-y-0.5 text-xs text-slate-600">
                    <p>Created: {fmtDate(selectedTx.createdAt)}</p>
                    <p>Updated: {fmtDate(selectedTx.updatedAt)}</p>
                    <p className="font-mono opacity-50">{selectedTx.id}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer actions (view mode only) ─────────────────────────── */}
            {!editMode && (
              <div className="flex-shrink-0 space-y-2 border-t border-slate-800 px-5 py-4">
                {/* Verify / Reject — only for PENDING */}
                {selectedTx.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void updateStatus("VERIFIED")}
                      disabled={statusLoading}
                      className="flex-1 rounded-lg border border-emerald-600/30 bg-emerald-600/20 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-600/30 disabled:opacity-50"
                    >
                      {statusLoading ? "…" : "✓ Verify"}
                    </button>
                    <button
                      onClick={() => void updateStatus("REJECTED")}
                      disabled={statusLoading}
                      className="flex-1 rounded-lg border border-red-600/30 bg-red-600/20 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-600/30 disabled:opacity-50"
                    >
                      {statusLoading ? "…" : "✕ Reject"}
                    </button>
                  </div>
                )}

                {/* Edit + Duplicate + Delete */}
                <div className="flex gap-2">
                  <button
                    onClick={() => beginEdit(selectedTx)}
                    className="flex-1 rounded-lg border border-slate-700 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-600/50 hover:text-cyan-300"
                  >
                    Edit
                  </button>

                  {selectedTx.type !== "TRANSFER" && (
                    <button
                      onClick={() => void duplicateTx()}
                      disabled={cloneLoading}
                      title="Clone as a new PENDING transaction dated today"
                      className="flex-1 rounded-lg border border-cyan-700/50 py-2 text-xs font-medium text-cyan-300 transition hover:border-cyan-500 hover:bg-cyan-900/20 disabled:opacity-50"
                    >
                      {cloneLoading ? "Duplicating…" : "Duplicate"}
                    </button>
                  )}

                  {deleteConfirm ? (
                    <div className="flex flex-1 gap-1">
                      <button
                        onClick={() => void deleteTx()}
                        disabled={deleteLoading}
                        className="flex-1 rounded-lg bg-red-700 py-2 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                      >
                        {deleteLoading ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="flex-1 rounded-lg border border-red-900/50 py-2 text-xs font-medium text-red-400 transition hover:border-red-700 hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex-shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-xs text-slate-300">{value}</dd>
    </div>
  );
}
