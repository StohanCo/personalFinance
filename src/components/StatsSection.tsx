"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type VolatilityLabel = "low" | "moderate" | "high";
type ConcentrationLabel = "diversified" | "moderate" | "concentrated";

type AccountSnapshot = {
  date: string;
  balance: string;
};

type AccountSnapshotGroup = {
  accountId: string;
  accountName: string;
  accountColor: string;
  snapshots: AccountSnapshot[];
};

type StatsData = {
  volatility: {
    monthlyExpenseStdDev: string;
    coefficientOfVariation: number;
    label: VolatilityLabel;
  };
  runRate: {
    avgMonthlyExpenses: string;
    avgMonthlyIncome: string;
    projectedYearlyExpenses: string;
    projectedYearlyIncome: string;
  };
  categoryConcentration: {
    topCategoryShare: number;
    topCategoryName: string;
    herfindahlIndex: number;
    label: ConcentrationLabel;
  };
  accountSnapshots: AccountSnapshotGroup[];
};

type FxRate = {
  id: string;
  rate: string;
  capturedAt: string;
  provider: string;
};

type FxHistory = {
  symbol: string;
  rates: FxRate[];
  nextCursor: string | null;
  total: number;
};

type TooltipData = {
  x: number;
  y: number;
  line1: string;
  line2: string;
  color: string;
};

// ── SVG Chart Helpers ──────────────────────────────────────────────────────────

function scaleX(index: number, total: number, width: number): number {
  if (total <= 1) return width / 2;
  return (index / (total - 1)) * width;
}

function scaleY(value: number, min: number, max: number, height: number): number {
  if (max === min) return height / 2;
  return height - ((value - min) / (max - min)) * height;
}

/** Returns SVG path `d` attribute for a smooth cubic-bezier polyline. */
function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    if (!p) return "";
    return `M ${p.x} ${p.y}`;
  }
  const first = points[0];
  if (!first) return "";
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

// ── Formatting Helpers ─────────────────────────────────────────────────────────

function fmtCurrency(amount: string | number, currency = "NZD"): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(
    Number(amount),
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
  });
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ── Chart Layout Constants ─────────────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 200;
const PAD = { top: 16, right: 20, bottom: 38, left: 62 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

// ── Label Badge ────────────────────────────────────────────────────────────────

function LabelBadge({
  label,
  greenValue,
  redValue,
}: {
  label: string;
  greenValue: string;
  redValue: string;
}) {
  const isGreen = label === greenValue;
  const isRed = label === redValue;
  const cls = isGreen
    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : isRed
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {label}
    </span>
  );
}

// ── Shared SVG Tooltip ─────────────────────────────────────────────────────────

function SvgTooltip({
  tooltip,
  maxX,
}: {
  tooltip: TooltipData;
  maxX: number;
}) {
  const boxW = 172;
  const boxH = 36;
  const rawX = tooltip.x - boxW / 2;
  const clampedX = Math.max(PAD.left, Math.min(rawX, maxX - boxW));
  const boxY = tooltip.y - boxH - 10;
  const safeY = boxY < 4 ? tooltip.y + 14 : boxY;
  return (
    <g pointerEvents="none">
      <rect
        x={clampedX}
        y={safeY}
        width={boxW}
        height={boxH}
        rx="6"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="1"
      />
      <circle
        cx={clampedX + 12}
        cy={safeY + 12}
        r="3.5"
        fill={tooltip.color}
      />
      <text
        x={clampedX + 22}
        y={safeY + 15}
        fontSize="9"
        fill="#94a3b8"
      >
        {tooltip.line1}
      </text>
      <text
        x={clampedX + 22}
        y={safeY + 28}
        fontSize="10"
        fontWeight="600"
        fill="#f1f5f9"
      >
        {tooltip.line2}
      </text>
    </g>
  );
}

// ── Account Balance Trend Chart ────────────────────────────────────────────────

function AccountBalanceTrendChart({
  accountSnapshots,
}: {
  accountSnapshots: AccountSnapshotGroup[];
}) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  const hasData = accountSnapshots.some((a) => a.snapshots.length > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
        <p className="px-4 text-center text-sm text-slate-500">
          Balance history will appear after your first daily snapshot
        </p>
      </div>
    );
  }

  // Unified sorted X-axis dates
  const allDates = Array.from(
    new Set(
      accountSnapshots.flatMap((a) =>
        a.snapshots.map((s) => s.date.slice(0, 10)),
      ),
    ),
  ).sort();

  // Y range
  const allBalances = accountSnapshots.flatMap((a) =>
    a.snapshots.map((s) => Number(s.balance)),
  );
  const rawMin = Math.min(...allBalances);
  const rawMax = Math.max(...allBalances);
  const pad = (rawMax - rawMin) * 0.12 || 100;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    yMin + ((yMax - yMin) * i) / yTickCount,
  );

  const step = Math.max(1, Math.floor(allDates.length / 5));
  const xLabelIndexes = new Set<number>(
    allDates
      .map((_, i) => i)
      .filter((i) => i % step === 0 || i === allDates.length - 1),
  );

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ height: "220px" }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y grid lines */}
        {yTicks.map((val, i) => {
          const cy = PAD.top + scaleY(val, yMin, yMax, INNER_H);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={cy}
                x2={PAD.left + INNER_W}
                y2={cy}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={cy + 4}
                textAnchor="end"
                fontSize="9"
                fill="#475569"
              >
                {fmtCurrency(val).replace(/[^0-9,.-]/g, "").trim()}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {allDates.map((date, i) => {
          if (!xLabelIndexes.has(i)) return null;
          const cx = PAD.left + scaleX(i, allDates.length, INNER_W);
          return (
            <text
              key={date}
              x={cx}
              y={CHART_H - PAD.bottom + 14}
              textAnchor="middle"
              fontSize="9"
              fill="#475569"
            >
              {fmtDate(date)}
            </text>
          );
        })}

        {/* Lines per account */}
        {accountSnapshots.map((account) => {
          if (account.snapshots.length === 0) return null;
          const sorted = [...account.snapshots].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          const points = sorted.map((snap) => {
            const dateStr = snap.date.slice(0, 10);
            const idx = allDates.indexOf(dateStr);
            return {
              x: PAD.left + scaleX(idx < 0 ? 0 : idx, allDates.length, INNER_W),
              y: PAD.top + scaleY(Number(snap.balance), yMin, yMax, INNER_H),
            };
          });
          const d = buildLinePath(points);
          const animStyle: React.CSSProperties = animated
            ? {
                strokeDasharray: "3000",
                strokeDashoffset: "0",
                transition: "stroke-dashoffset 1.3s ease-out",
              }
            : { strokeDasharray: "3000", strokeDashoffset: "3000" };

          return (
            <g key={account.accountId}>
              <path
                d={d}
                fill="none"
                stroke={account.accountColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={animStyle}
              />
              {points.map((pt, pi) => {
                const snap = sorted[pi];
                if (!snap) return null;
                return (
                  <circle
                    key={pi}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill={account.accountColor}
                    opacity="0.85"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() =>
                      setTooltip({
                        x: pt.x,
                        y: pt.y,
                        line1: `${account.accountName} · ${fmtDate(snap.date)}`,
                        line2: fmtCurrency(snap.balance),
                        color: account.accountColor,
                      })
                    }
                  />
                );
              })}
            </g>
          );
        })}

        {tooltip && (
          <SvgTooltip tooltip={tooltip} maxX={PAD.left + INNER_W} />
        )}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-3 px-1">
        {accountSnapshots
          .filter((a) => a.snapshots.length > 0)
          .map((account) => (
            <div key={account.accountId} className="flex items-center gap-1.5">
              <div
                className="h-2 w-5 rounded-full"
                style={{ backgroundColor: account.accountColor }}
              />
              <span className="text-xs text-slate-400">{account.accountName}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── FX Rate Chart ──────────────────────────────────────────────────────────────

const FX_SYMBOLS = ["USD", "EUR", "GBP", "AUD", "RUB"] as const;
type FxSymbol = (typeof FX_SYMBOLS)[number];

function FxRateChart() {
  const [symbol, setSymbol] = useState<FxSymbol>("USD");
  const [history, setHistory] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAnimated(false);
    setLoading(true);
    setError(null);
    setHistory([]);

    fetch(`/api/fx/history?symbol=${symbol}&limit=90`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<FxHistory>;
      })
      .then((data) => {
        if (cancelled) return;
        setHistory(data.rates ?? []);
        setLoading(false);
        setTimeout(() => setAnimated(true), 120);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load FX history");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const sorted = [...history].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  );
  const hasData = sorted.length > 0;

  const rates = sorted.map((r) => Number(r.rate));
  const rawMin = hasData ? Math.min(...rates) : 0;
  const rawMax = hasData ? Math.max(...rates) : 1;
  const rPad = (rawMax - rawMin) * 0.12 || 0.005;
  const yMin = rawMin - rPad;
  const yMax = rawMax + rPad;

  const points = sorted.map((r, i) => ({
    x: PAD.left + scaleX(i, sorted.length, INNER_W),
    y: PAD.top + scaleY(Number(r.rate), yMin, yMax, INNER_H),
  }));

  const linePath = buildLinePath(points);

  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const areaPath =
    hasData && lastPt && firstPt
      ? `${linePath} L ${lastPt.x} ${PAD.top + INNER_H} L ${firstPt.x} ${PAD.top + INNER_H} Z`
      : "";

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    yMin + ((yMax - yMin) * i) / yTickCount,
  );

  const xStep = Math.max(1, Math.floor(sorted.length / 5));
  const xLabelIndexes = new Set<number>(
    sorted
      .map((_, i) => i)
      .filter((i) => i % xStep === 0 || i === sorted.length - 1),
  );

  const animStyle: React.CSSProperties = animated
    ? {
        strokeDasharray: "3000",
        strokeDashoffset: "0",
        transition: "stroke-dashoffset 1.4s ease-out",
      }
    : { strokeDasharray: "3000", strokeDashoffset: "3000" };

  return (
    <div>
      {/* Currency selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FX_SYMBOLS.map((sym) => (
          <button
            key={sym}
            type="button"
            onClick={() => setSymbol(sym)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
              symbol === sym
                ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300"
                : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-red-400">⚠ {error}</p>
      )}

      {/* Empty state */}
      {!loading && !error && !hasData && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
          <p className="max-w-xs px-4 text-center text-sm text-slate-500">
            No rate history yet — use &ldquo;Recheck via public FX API&rdquo; on
            the Overview to capture rates
          </p>
        </div>
      )}

      {/* Chart */}
      {!loading && !error && hasData && (
        <div className="relative">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full"
            style={{ height: "220px" }}
            onMouseLeave={() => setTooltip(null)}
          >
            <defs>
              <linearGradient
                id="fxAreaGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((val, i) => {
              const cy = PAD.top + scaleY(val, yMin, yMax, INNER_H);
              return (
                <g key={i}>
                  <line
                    x1={PAD.left}
                    y1={cy}
                    x2={PAD.left + INNER_W}
                    y2={cy}
                    stroke="#1e293b"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 6}
                    y={cy + 4}
                    textAnchor="end"
                    fontSize="9"
                    fill="#475569"
                  >
                    {val.toFixed(4)}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {sorted.map((r, i) => {
              if (!xLabelIndexes.has(i)) return null;
              const cx = PAD.left + scaleX(i, sorted.length, INNER_W);
              return (
                <text
                  key={r.id}
                  x={cx}
                  y={CHART_H - PAD.bottom + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#475569"
                >
                  {fmtDate(r.capturedAt)}
                </text>
              );
            })}

            {/* Area fill */}
            {areaPath && (
              <path d={areaPath} fill="url(#fxAreaGradient)" />
            )}

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={animStyle}
            />

            {/* Dots */}
            {points.map((pt, i) => {
              const r = sorted[i];
              if (!r) return null;
              return (
                <circle
                  key={r.id}
                  cx={pt.x}
                  cy={pt.y}
                  r="3"
                  fill="#06b6d4"
                  opacity="0.8"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() =>
                    setTooltip({
                      x: pt.x,
                      y: pt.y,
                      line1: fmtDate(r.capturedAt),
                      line2: `1 NZD = ${Number(r.rate).toFixed(5)} ${symbol}`,
                      color: "#06b6d4",
                    })
                  }
                />
              );
            })}

            {tooltip && (
              <SvgTooltip tooltip={tooltip} maxX={PAD.left + INNER_W} />
            )}
          </svg>

          <p className="mt-1 text-xs text-slate-600">
            NZD → {symbol} · {sorted.length} data point
            {sorted.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main StatsSection ──────────────────────────────────────────────────────────

export default function StatsSection() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const dateTo = now.toISOString().slice(0, 10);
    const threeMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 3,
      now.getDate(),
    );
    const dateFrom = threeMonthsAgo.toISOString().slice(0, 10);

    fetch(`/api/analytics/stats?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<StatsData>;
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load statistics",
        );
        setLoading(false);
      });
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading financial statistics…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-red-900/50 bg-red-950/20 p-5">
        <p className="text-sm text-red-400">⚠ {error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const cvPct = Math.min(100, stats.volatility.coefficientOfVariation * 100);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6 space-y-6">
      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">
          Advanced Analytics
        </p>
        <h2 className="mt-1 text-xl font-bold text-white">
          Statistical Summary
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Quantitative metrics on spending patterns, run-rates, and FX history.
        </p>
      </div>

      {/* ── 2×2 Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Spending Volatility */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Spending Volatility
            </p>
            <LabelBadge
              label={stats.volatility.label}
              greenValue="low"
              redValue="high"
            />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {fmtCurrency(stats.volatility.monthlyExpenseStdDev)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            std dev per month
          </p>
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Coefficient of variation</span>
              <span className="font-medium text-slate-300">
                {cvPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all duration-700"
                style={{ width: `${cvPct.toFixed(0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Expense Run-Rate */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Expense Run-Rate
            </p>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
              Expenses
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {fmtCurrency(stats.runRate.avgMonthlyExpenses)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">avg monthly expenses</p>
          <div className="mt-4 rounded-lg bg-slate-800/60 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Projected yearly</span>
              <span className="text-sm font-semibold text-red-400">
                {fmtCurrency(stats.runRate.projectedYearlyExpenses)}
              </span>
            </div>
          </div>
        </div>

        {/* Income Run-Rate */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Income Run-Rate
            </p>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              Income
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {fmtCurrency(stats.runRate.avgMonthlyIncome)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">avg monthly income</p>
          <div className="mt-4 rounded-lg bg-slate-800/60 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Projected yearly</span>
              <span className="text-sm font-semibold text-emerald-400">
                {fmtCurrency(stats.runRate.projectedYearlyIncome)}
              </span>
            </div>
          </div>
        </div>

        {/* Category Concentration */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Category Concentration
            </p>
            <LabelBadge
              label={stats.categoryConcentration.label}
              greenValue="diversified"
              redValue="concentrated"
            />
          </div>
          <p className="truncate text-2xl font-bold tracking-tight text-white">
            {stats.categoryConcentration.topCategoryName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            top category ·{" "}
            <span className="font-medium text-slate-300">
              {fmtPct(stats.categoryConcentration.topCategoryShare)}
            </span>{" "}
            of total spend
          </p>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2.5">
            <span className="text-xs text-slate-500">
              Herfindahl–Hirschman Index
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300">
              {stats.categoryConcentration.herfindahlIndex.toFixed(4)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Account Balance History ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-white">
              Account Balance History
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Daily snapshots per account · NZD
            </p>
          </div>
        </div>
        <div className="mt-4">
          <AccountBalanceTrendChart
            accountSnapshots={stats.accountSnapshots}
          />
        </div>
      </div>

      {/* ── FX Rate History ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-white">
            FX Rate History
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Exchange rates captured from public API · NZD to selected currency
          </p>
        </div>
        <FxRateChart />
      </div>
    </div>
  );
}
