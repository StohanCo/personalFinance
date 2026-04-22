"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; name: string; type: string; currency: string };
type Category = { id: string; nameEn: string; type: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function AddTransactionModal({
  accounts,
  categories,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    accountId: accounts[0]?.id ?? "",
    type: "EXPENSE" as "INCOME" | "EXPENSE" | "TRANSFER",
    categoryId: "",
    amount: "",
    date: today(),
    vendor: "",
    description: "",
    gstApplicable: false,
    isDeductible: false,
    deductiblePercent: "0",
    transferAccountId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredCats = categories.filter(
    (c) => c.type === form.type || form.type === "TRANSFER",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountId) { setError("Select an account"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Enter a valid amount"); return; }
    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      accountId: form.accountId,
      type: form.type,
      categoryId: form.categoryId || null,
      amount: parseFloat(form.amount),
      date: form.date,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
      gstApplicable: form.gstApplicable,
      isDeductible: form.isDeductible,
      deductiblePercent: parseInt(form.deductiblePercent) || 0,
    };
    if (form.type === "TRANSFER" && form.transferAccountId) {
      body.transferAccountId = form.transferAccountId;
    }

    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === "string" ? data.error : "Failed to create transaction");
      setLoading(false);
      return;
    }

    router.refresh();
    onClose();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Add Transaction</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
          {error && (
            <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-400">{error}</p>
          )}

          {/* Type selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t, categoryId: "" })}
                  className={`rounded-lg py-2 text-sm font-medium transition ${
                    form.type === t
                      ? t === "INCOME"
                        ? "bg-emerald-600 text-white"
                        : t === "EXPENSE"
                        ? "bg-red-700 text-white"
                        : "bg-blue-700 text-white"
                      : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Account</label>
              <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className={inputCls}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Amount</label>
              <input
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
          </div>

          {form.type === "TRANSFER" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Transfer To Account</label>
              <select value={form.transferAccountId} onChange={(e) => setForm({ ...form, transferAccountId: e.target.value })} className={inputCls}>
                <option value="">Select destination account</option>
                {accounts.filter((a) => a.id !== form.accountId).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Category</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputCls}>
                <option value="">Uncategorised</option>
                {filteredCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameEn}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Vendor (optional)</label>
              <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Countdown" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Description (optional)</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Weekly groceries" className={inputCls} />
            </div>
          </div>

          {/* GST + Deductible toggles */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 transition hover:border-slate-600">
              <input
                type="checkbox"
                checked={form.gstApplicable}
                onChange={(e) => setForm({ ...form, gstApplicable: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm text-slate-300">GST Applicable</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 transition hover:border-slate-600">
              <input
                type="checkbox"
                checked={form.isDeductible}
                onChange={(e) => setForm({ ...form, isDeductible: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm text-slate-300">Tax Deductible</span>
            </label>
          </div>

          {form.isDeductible && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Deductible % <span className="text-slate-500">({form.deductiblePercent}%)</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={form.deductiblePercent}
                onChange={(e) => setForm({ ...form, deductiblePercent: e.target.value })}
                className="w-full accent-emerald-500"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-600">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-400 transition hover:border-slate-500 hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {loading ? "Saving…" : "Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
