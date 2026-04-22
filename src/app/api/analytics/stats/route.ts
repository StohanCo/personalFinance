import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import Decimal from "decimal.js";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? fallback : d;
}

function sixMonthsAgo(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Return the ISO year-month key ("2024-03") for a given Date. */
function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Decimal statistics helpers ────────────────────────────────────────────────

/**
 * Population standard deviation of an array of Decimal values.
 * Returns zero when n < 2 (single-point or empty series).
 */
function stdDev(values: Decimal[]): Decimal {
  const n = values.length;
  if (n < 2) return new Decimal(0);

  const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0));
  const mean = sum.div(n);

  const varianceSum = values.reduce((acc, v) => {
    const diff = v.minus(mean);
    return acc.plus(diff.mul(diff));
  }, new Decimal(0));

  const variance = varianceSum.div(n);
  // Decimal.js sqrt via Newton–Raphson (built-in)
  return variance.sqrt();
}

// ── GET /api/analytics/stats ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const dateFrom = parseDate(searchParams.get("dateFrom"), sixMonthsAgo());
  const dateTo = parseDate(searchParams.get("dateTo"), startOfToday());

  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: "'dateFrom' must be earlier than 'dateTo'" },
      { status: 400 }
    );
  }

  // ── 1. Aggregate monthly expense & income totals ───────────────────────────
  //
  // We pull raw verified transactions for the date range and bucket them
  // server-side by month so we can reuse the data for volatility AND run-rate
  // without a second round-trip.

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      status: "VERIFIED",
      type: { in: ["INCOME", "EXPENSE"] },
      date: { gte: dateFrom, lte: dateTo },
    },
    select: {
      type: true,
      amount: true,
      categoryId: true,
      category: { select: { nameEn: true } },
      date: true,
    },
  });

  // Monthly buckets: { "2024-03": { expenses: Decimal, income: Decimal } }
  const monthlyMap = new Map<string, { expenses: Decimal; income: Decimal }>();

  // Category totals for concentration analysis
  const categoryMap = new Map<string, { name: string; total: Decimal }>();

  for (const tx of transactions) {
    const key = monthKey(new Date(tx.date));
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { expenses: new Decimal(0), income: new Decimal(0) });
    }
    const bucket = monthlyMap.get(key)!;
    const amt = new Decimal(tx.amount.toString());

    if (tx.type === "EXPENSE") {
      bucket.expenses = bucket.expenses.plus(amt);

      // Category concentration
      const catId = tx.categoryId ?? "__uncategorized__";
      const catName =
        tx.category?.nameEn ?? "Uncategorized";
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, { name: catName, total: new Decimal(0) });
      }
      categoryMap.get(catId)!.total = categoryMap.get(catId)!.total.plus(amt);
    } else {
      bucket.income = bucket.income.plus(amt);
    }
  }

  const monthKeys = Array.from(monthlyMap.keys()).sort();
  const n = new Decimal(Math.max(monthKeys.length, 1));

  // ── 2. Volatility ─────────────────────────────────────────────────────────

  const monthlyExpenses = monthKeys.map((k) => monthlyMap.get(k)!.expenses);
  const monthlyExpenseStdDev = stdDev(monthlyExpenses);

  const totalExpensesAll = monthlyExpenses.reduce(
    (a, v) => a.plus(v),
    new Decimal(0)
  );
  const avgMonthlyExpenses = totalExpensesAll.div(n);

  const coefficientOfVariation: number = avgMonthlyExpenses.isZero()
    ? 0
    : monthlyExpenseStdDev.div(avgMonthlyExpenses).toNumber();

  const volatilityLabel: "low" | "moderate" | "high" =
    coefficientOfVariation < 0.2
      ? "low"
      : coefficientOfVariation <= 0.5
      ? "moderate"
      : "high";

  // ── 3. Run-rate ───────────────────────────────────────────────────────────

  const totalIncomeAll = monthKeys.reduce((acc, k) => {
    return acc.plus(monthlyMap.get(k)!.income);
  }, new Decimal(0));

  const avgMonthlyIncome = totalIncomeAll.div(n);
  const projectedYearlyExpenses = avgMonthlyExpenses.mul(12);
  const projectedYearlyIncome = avgMonthlyIncome.mul(12);

  // ── 4. Category concentration ─────────────────────────────────────────────

  const totalExpenses = Array.from(categoryMap.values()).reduce(
    (acc, c) => acc.plus(c.total),
    new Decimal(0)
  );

  let topCategoryShare = 0;
  let topCategoryName = "N/A";
  let herfindahlIndex = 0;
  let concentrationLabel: "diversified" | "moderate" | "concentrated" =
    "diversified";

  if (!totalExpenses.isZero() && categoryMap.size > 0) {
    // Find category with the highest spend
    let topTotal = new Decimal(0);
    for (const [, cat] of categoryMap) {
      if (cat.total.greaterThan(topTotal)) {
        topTotal = cat.total;
        topCategoryName = cat.name;
      }
    }

    topCategoryShare = topTotal.div(totalExpenses).mul(100).toNumber();

    // Herfindahl-Hirschman Index: sum of squared share fractions
    let hhi = new Decimal(0);
    for (const [, cat] of categoryMap) {
      const share = cat.total.div(totalExpenses); // fraction 0–1
      hhi = hhi.plus(share.mul(share));
    }
    herfindahlIndex = hhi.toNumber();

    concentrationLabel =
      herfindahlIndex < 0.15
        ? "diversified"
        : herfindahlIndex <= 0.25
        ? "moderate"
        : "concentrated";
  }

  // ── 5. Account snapshots (last 90 days) ───────────────────────────────────

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  ninetyDaysAgo.setHours(0, 0, 0, 0);

  const snapshots = await prisma.accountSnapshot.findMany({
    where: {
      userId,
      snapshotDate: { gte: ninetyDaysAgo },
    },
    select: {
      accountId: true,
      snapshotDate: true,
      balance: true,
      account: {
        select: {
          name: true,
          color: true,
        },
      },
    },
    orderBy: { snapshotDate: "asc" },
  });

  // Group snapshots by account
  const accountSnapshotMap = new Map<
    string,
    {
      accountId: string;
      accountName: string;
      accountColor: string;
      snapshots: { date: string; balance: string }[];
    }
  >();

  for (const snap of snapshots) {
    if (!accountSnapshotMap.has(snap.accountId)) {
      accountSnapshotMap.set(snap.accountId, {
        accountId: snap.accountId,
        accountName: snap.account.name,
        accountColor: snap.account.color,
        snapshots: [],
      });
    }
    accountSnapshotMap.get(snap.accountId)!.snapshots.push({
      date: toDateString(new Date(snap.snapshotDate)),
      balance: new Decimal(snap.balance.toString()).toFixed(2),
    });
  }

  const accountSnapshots = Array.from(accountSnapshotMap.values());

  // ── 6. Compose response ───────────────────────────────────────────────────

  return NextResponse.json({
    volatility: {
      monthlyExpenseStdDev: monthlyExpenseStdDev.toFixed(2),
      coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(4)),
      label: volatilityLabel,
    },
    runRate: {
      avgMonthlyExpenses: avgMonthlyExpenses.toFixed(2),
      avgMonthlyIncome: avgMonthlyIncome.toFixed(2),
      projectedYearlyExpenses: projectedYearlyExpenses.toFixed(2),
      projectedYearlyIncome: projectedYearlyIncome.toFixed(2),
    },
    categoryConcentration: {
      topCategoryShare: parseFloat(topCategoryShare.toFixed(4)),
      topCategoryName,
      herfindahlIndex: parseFloat(herfindahlIndex.toFixed(4)),
      label: concentrationLabel,
    },
    accountSnapshots,
  });
}
