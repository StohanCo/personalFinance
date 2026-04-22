"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AnalyticsSectionProps = {
  accounts: { id: string; name: string; color: string }[];
};

type SpendByCategory = {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  total: string;
  txCount: number;
};

type MonthlyTrend = {
  month: string; // "YYYY-MM"
  income: string;
  expenses: string;
  net: string;
};

type AccountDistribution = {
  accountId: string;
  accountName: string;
  accountColor: string;
  balance: string;
  currency: string;
  type: string;
};

type TopVendor = {
  vendor: string;
  total: string;
  txCount: number;
};

type AnalyticsSummary = {
  dateFrom: string;
  dateTo: string;
  spendByCategory: SpendByCategory[];
  monthlyTrends: MonthlyTrend[];
  accountDistribution: AccountDistribution[];
  topVendors: TopVendor[];
  summary: {
    totalIncome: string;
    totalExpenses: string;
    netSavings: string;
    savingsRate: number;
    avgMonthlyExpenses: string;
    avgMonthlyIncome: string;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRESETS = ["Last 30 days", "Last 3 months", "Last 6 months", "This year", "Last 12 months"] as const;
type Preset = (typeof PRESETS)[number];

function fmt(amount: string | number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(
    Number(amount),
  );
}

function fmtCompact(amount: string | number) {
  const n = Number(amount);
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}k`;
  }
  return `$${Math.round(n)}`;
}

function monthShort(yyyyMM: string): string {
  const parts = yyyyMM.split("-");
  const year = Number(parts[0] ?? 0);
  const month = Number(parts[1] ?? 1);
  return new Date(year, month - 1).toLocaleDateString("en-NZ", { month: "short" });
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

function getDateRange(preset: Preset): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = isoDate(now);

  if (preset === "Last 30 days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { dateFrom: isoDate(from), dateTo };
  }
  if (preset === "Last 3 months") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return { dateFrom: isoDate(from), dateTo };
  }
  if (preset === "Last 6 months") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 6);
    return { dateFrom: isoDate(from), dateTo };
  }
  if (preset === "This year") {
    return { dateFrom: `${now.getFullYear()}-01-01`, dateTo };
  }
  // "Last 12 months" (default)
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);
  return { dateFrom: isoDate(from), dateTo };
}

// ── MonthlyTrendsChart ────────────────────────────────────────────────────────

const SVG_W = 800;
const SVG_H = 280;
const PAD_L = 62;
const PAD_R = 20;
const PAD_T = 20;
const PAD_B = 42;

type TooltipState = {
  svgX: number;
  month: string;
  income: number;
  expenses: number;
};

function MonthlyTrendsChart({ data }: { data: MonthlyTrend[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [mounted, setMounted] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  if (data.length === 0) return null;

  const incomes = data.map((d) => Number(d.income));
  const expenses = data.map((d) => Number(d.expenses));
  const maxVal = Math.max(...incomes, ...expenses, 1);

  const innerW = SVG_W - PAD_L - PAD_R;
  const innerH = SVG_H - PAD_T - PAD_B;
  const n = data.length;
  const groupW = innerW / n;
  const barPad = groupW * 0.14;
  const barW = Math.max(4, (groupW - barPad * 2 - 3) / 2);
  const baseY = PAD_T + innerH;

  function valToY(v: number) {
    return PAD_T + innerH - (v / maxVal) * innerH;
  }

  const TICK_COUNT = 5;
  const yTicks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => (maxVal / TICK_COUNT) * i);

  function handleGroupEnter(i: number, d: MonthlyTrend) {
    const groupCenterSvgX = PAD_L + i * groupW + groupW / 2;
    setTooltip({
      svgX: groupCenterSvgX,
      month: d.month,
      income: Number(d.income),
      expenses: Number(d.expenses),
    });
  }

  /* Convert SVG-space x → percent of viewBox for tooltip left positioning */
  function svgXToPercent(x: number) {
    return `${((x / SVG_W) * 100).toFixed(2)}%`;
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ height: "auto", display: "block" }}
        onMouseLeave={() => setTooltip(null)}
        aria-label="Monthly income vs expenses chart"
        role="img"
      >
        {/* Horizontal grid lines + Y labels */}
        {yTicks.map((tick) => {
          const y = valToY(tick);
          return (
            <g key={tick}>
              <line
                x1={PAD_L}
                y1={y}
                x2={SVG_W - PAD_R}
                y2={y}
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? "none" : "4 3"}
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fill="#475569"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {fmtCompact(tick)}
              </text>
            </g>
          );
        })}

        {/* Bottom axis line */}
        <line
          x1={PAD_L}
          y1={baseY}
          x2={SVG_W - PAD_R}
          y2={baseY}
          stroke="#334155"
          strokeWidth="1"
        />

        {/* Bar groups */}
        {data.map((d, i) => {
          const groupX = PAD_L + i * groupW;
          const incomeH = mounted ? Math.max(2, (Number(d.income) / maxVal) * innerH) : 0;
          const expensesH = mounted ? Math.max(2, (Number(d.expenses) / maxVal) * innerH) : 0;
          const incomeBarY = mounted ? valToY(Number(d.income)) : baseY;
          const expensesBarY = mounted ? valToY(Number(d.expenses)) : baseY;
          const incomeX = groupX + barPad;
          const expenseX = incomeX + barW + 3;
          const labelX = groupX + groupW / 2;

          return (
            <g
              key={d.month}
              onMouseEnter={() => handleGroupEnter(i, d)}
              style={{ cursor: "default" }}
            >
              {/* Hover target */}
              <rect
                x={groupX + 2}
                y={PAD_T}
                width={groupW - 4}
                height={innerH + 2}
                fill="transparent"
              />

              {/* Income bar */}
              <rect
                x={incomeX}
                y={incomeBarY}
                width={barW}
                height={incomeH}
                rx="2"
                ry="2"
                fill="#10b981"
                fillOpacity="0.9"
                style={{
                  transition: mounted
                    ? "y 0.55s cubic-bezier(.22,1,.36,1), height 0.55s cubic-bezier(.22,1,.36,1)"
                    : "none",
                }}
              />

              {/* Expense bar */}
              <rect
                x={expenseX}
                y={expensesBarY}
                width={barW}
                height={expensesH}
                rx="2"
                ry="2"
                fill="#f43f5e"
                fillOpacity="0.9"
                style={{
                  transition: mounted
                    ? "y 0.55s cubic-bezier(.22,1,.36,1) 0.05s, height 0.55s cubic-bezier(.22,1,.36,1) 0.05s"
                    : "none",
                }}
              />

              {/* X-axis month label */}
              <text
                x={labelX}
                y={SVG_H - 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
              >
                {monthShort(d.month)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating tooltip — positioned in % so it scales with the SVG */}
      {tooltip !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-slate-700/80 bg-slate-950/95 px-3.5 py-2.5 text-xs shadow-2xl shadow-black/60 backdrop-blur-md"
          style={{ left: svgXToPercent(tooltip.svgX), marginTop: "6px" }}
        >
          <p className="mb-2 font-semibold text-slate-200">
            {monthShort(tooltip.month)}{" "}
            <span className="text-slate-400">{tooltip.month.split("-")[0]}</span>
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-sm bg-emerald-500" />
              <span className="text-slate-400">Income</span>
              <span className="ml-auto pl-4 tabular-nums text-emerald-400">
                {fmt(tooltip.income)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-sm bg-rose-500" />
              <span className="text-slate-400">Expenses</span>
              <span className="ml-auto pl-4 tabular-nums text-rose-400">
                {fmt(tooltip.expenses)}
              </span>
            </div>
            <div className="mt-1 border-t border-slate-800 pt-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 flex-shrink-0 rounded-sm bg-cyan-500" />
                <span className="text-slate-400">Net</span>
                <span
                  className={`ml-auto pl-4 tabular-nums ${
                    tooltip.income - tooltip.expenses >= 0 ? "text-cyan-400" : "text-red-400"
                  }`}
                >
                  {fmt(tooltip.income - tooltip.expenses)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          <span>Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />
          <span>Expenses</span>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6">
      {/* Controls skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-full bg-slate-800" />
        ))}
        <div className="h-8 w-36 rounded-lg bg-slate-800" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-4">
            <div className="h-3 w-20 rounded bg-slate-800" />
            <div className="mt-3 h-7 w-28 rounded bg-slate-800" />
            <div className="mt-2 h-2.5 w-16 rounded bg-slate-800" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="mb-4 h-4 w-40 rounded bg-slate-800" />
        <div className="h-64 w-full rounded-xl bg-slate-800" />
      </div>

      {/* Bottom panels skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-4 h-4 w-32 rounded bg-slate-800" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-8 w-full rounded bg-slate-800" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

type AccentColor = "emerald" | "rose" | "cyan" | "blue";

const ACCENT_STYLES: Record<
  AccentColor,
  { card: string; value: string; badge: string }
> = {
  emerald: {
    card: "border-emerald-900/60 bg-gradient-to-br from-emerald-950/80 to-slate-900/80 shadow-emerald-950/50",
    value: "text-emerald-400",
    badge: "bg-emerald-900/40 text-emerald-300",
  },
  rose: {
    card: "border-rose-900/60 bg-gradient-to-br from-rose-950/80 to-slate-900/80 shadow-rose-950/50",
    value: "text-rose-400",
    badge: "bg-rose-900/40 text-rose-300",
  },
  cyan: {
    card: "border-cyan-900/60 bg-gradient-to-br from-cyan-950/80 to-slate-900/80 shadow-cyan-950/50",
    value: "text-cyan-400",
    badge: "bg-cyan-900/40 text-cyan-300",
  },
  blue: {
    card: "border-blue-900/60 bg-gradient-to-br from-blue-950/80 to-slate-900/80 shadow-blue-950/50",
    value: "text-blue-400",
    badge: "bg-blue-900/40 text-blue-300",
  },
};

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: AccentColor;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <div className={`rounded-xl border px-5 py-4 shadow-lg backdrop-blur-sm ${s.card}`}>
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${s.value}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-600">{sub}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AnalyticsSection({ accounts }: AnalyticsSectionProps) {
  const [preset, setPreset] = useState<Preset>("Last 12 months");
  const [accountId, setAccountId] = useState<string>("all");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { dateFrom, dateTo } = getDateRange(preset);
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (accountId !== "all") params.set("accountId", accountId);

    async function load() {
      try {
        const res = await fetch(`/api/analytics/summary?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const json = await res.json() as AnalyticsSummary;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [preset, accountId]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const topCategories = data?.spendByCategory.slice(0, 8) ?? [];
  const maxCategorySpend = Math.max(...topCategories.map((c) => Number(c.total)), 1);

  const topVendors = data?.topVendors.slice(0, 10) ?? [];

  const accountDist = data?.accountDistribution ?? [];
  const accountTotal = accountDist.reduce((s, a) => s + Number(a.balance), 0);

  const hasData =
    data !== null &&
    (data.monthlyTrends.length > 0 ||
      data.spendByCategory.length > 0 ||
      data.topVendors.length > 0);

  const { dateFrom, dateTo } = getDateRange(preset);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-center">
        <p className="text-2xl">⚠️</p>
        <p className="mt-2 text-sm font-medium text-red-400">{error}</p>
        <button
          onClick={() => { setPreset(preset); }}
          className="mt-4 rounded-lg border border-red-700/50 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-900/30"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
              preset === p
                ? "border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
                : "border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {p}
          </button>
        ))}

        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 outline-none transition focus:border-cyan-500"
        >
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Empty state ── */}
      {!hasData && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 py-16 text-center">
          <p className="text-4xl">📊</p>
          <p className="mt-4 text-base font-semibold text-slate-300">No data for this period</p>
          <p className="mt-1.5 text-sm text-slate-500">
            No transactions found between{" "}
            <span className="text-slate-400">{dateFrom}</span> and{" "}
            <span className="text-slate-400">{dateTo}</span>.
          </p>
          <p className="mt-1 text-xs text-slate-600">Try "Last 12 months" or "This year" for a broader view.</p>
          <button
            onClick={() => setPreset("Last 12 months")}
            className="mt-5 rounded-full border border-cyan-700/50 bg-cyan-900/20 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-900/40"
          >
            View last 12 months
          </button>
        </div>
      )}

      {hasData && data !== null && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Total Income"
              value={fmt(data.summary.totalIncome)}
              sub="across selected period"
              accent="emerald"
            />
            <KpiCard
              label="Total Expenses"
              value={fmt(data.summary.totalExpenses)}
              sub="across selected period"
              accent="rose"
            />
            <KpiCard
              label="Net Savings"
              value={fmt(data.summary.netSavings)}
              sub="income minus expenses"
              accent={Number(data.summary.netSavings) >= 0 ? "cyan" : "rose"}
            />
            <KpiCard
              label="Savings Rate"
              value={`${data.summary.savingsRate.toFixed(1)}%`}
              sub="of total income saved"
              accent="blue"
            />
          </div>

          {/* ── Monthly Trends Chart ── */}
          {data.monthlyTrends.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/40">
              <div className="mb-1 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Monthly Trends</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Income &amp; expenses month-over-month · {data.monthlyTrends.length} months
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Avg monthly income</p>
                  <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                    {fmt(data.summary.avgMonthlyIncome)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Avg monthly expenses</p>
                  <p className="text-sm font-semibold text-rose-400 tabular-nums">
                    {fmt(data.summary.avgMonthlyExpenses)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <MonthlyTrendsChart data={data.monthlyTrends} />
              </div>
            </section>
          )}

          {/* ── Bottom three-panel grid ── */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* ── Spend by Category ── */}
            <section className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="mb-4 text-base font-semibold text-white">Spend by Category</h2>
              {topCategories.length === 0 ? (
                <p className="text-sm text-slate-500">No category data yet.</p>
              ) : (
                <div className="space-y-3.5">
                  {topCategories.map((cat) => {
                    const pct = Math.max(
                      6,
                      Math.round((Number(cat.total) / maxCategorySpend) * 100),
                    );
                    return (
                      <div key={cat.categoryName}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: cat.categoryColor || "#64748b" }}
                            />
                            <span className="truncate text-xs font-medium text-slate-300">
                              {cat.categoryName}
                            </span>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2 text-right">
                            <span className="text-xs text-slate-500">{cat.txCount}×</span>
                            <span className="text-xs font-semibold tabular-nums text-slate-200">
                              {fmt(cat.total)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: cat.categoryColor || "#64748b",
                              opacity: 0.85,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Top Vendors ── */}
            <section className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="mb-4 text-base font-semibold text-white">Top Vendors</h2>
              {topVendors.length === 0 ? (
                <p className="text-sm text-slate-500">No vendor data yet.</p>
              ) : (
                <ol className="space-y-2">
                  {topVendors.map((v, i) => (
                    <li
                      key={v.vendor}
                      className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2.5"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] font-bold tabular-nums text-slate-400">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
                        {v.vendor}
                      </span>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-semibold tabular-nums text-rose-400">
                          {fmt(v.total)}
                        </p>
                        <p className="text-[10px] text-slate-500">{v.txCount} txn</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Account Distribution ── */}
            <section className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="mb-4 text-base font-semibold text-white">Account Distribution</h2>
              {accountDist.length === 0 ? (
                <p className="text-sm text-slate-500">No account data.</p>
              ) : (
                <div className="space-y-2">
                  {accountDist.map((a) => (
                    <div
                      key={a.accountId}
                      className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2.5"
                    >
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: a.accountColor || "#64748b" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-200">
                          {a.accountName}
                        </p>
                        <span className="mt-0.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          {a.type.charAt(0) + a.type.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p
                          className={`text-xs font-semibold tabular-nums ${
                            Number(a.balance) < 0 ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {fmt(a.balance, a.currency)}
                        </p>
                        <p className="text-[10px] text-slate-500">{a.currency}</p>
                      </div>
                    </div>
                  ))}

                  {/* Total row */}
                  <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Total (NZD)
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        accountTotal < 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {fmt(accountTotal)}
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
