import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";
import { analyticsTag, txTag } from "@/lib/cache/tags";

const CACHE_TTL_SECONDS = 300; // 5 min; tags drive precise invalidation on tx mutations

// ── Query param validation ────────────────────────────────────────────────────

const QuerySchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD")
    .optional(),
  accountId: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a Date as "YYYY-MM-DD" in local time. */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Enumerate every calendar month between two dates (inclusive),
 * returning an array of "YYYY-MM" strings.
 */
function buildMonthRange(from: Date, to: Date): string[] {
  const months: string[] = [];
  // Always start at the first of the month so the cursor arithmetic is safe.
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor <= last) {
    const y = cursor.getFullYear();
    const mo = String(cursor.getMonth() + 1).padStart(2, "0");
    months.push(`${y}-${mo}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

// ── Raw-query row type ────────────────────────────────────────────────────────
// EXTRACT returns float8 → cast ::int (int4) comes back as JS number.
// SUM(amount) cast ::text so we feed it straight into Decimal.js.

interface MonthlyRawRow {
  year: number;
  month: number;
  type: string;
  total: string;
}

// ── GET /api/analytics/summary ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Parse query params ────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Defaults: dateTo = today, dateFrom = 12 months ago (same day)
  const now = new Date();
  const defaultDateFrom = new Date(
    now.getFullYear() - 1,
    now.getMonth(),
    now.getDate()
  );

  const dateFromStr = parsed.data.dateFrom ?? toDateString(defaultDateFrom);
  const dateToStr = parsed.data.dateTo ?? toDateString(now);
  const accountId = parsed.data.accountId;

  // Parse back to Date for Prisma where clauses.
  // Adding "T00:00:00" without timezone so JS treats them as local midnight.
  const dateFrom = new Date(`${dateFromStr}T00:00:00`);
  const dateTo = new Date(`${dateToStr}T00:00:00`);

  const cached = unstable_cache(
    () =>
      computeSummary({ userId, dateFrom, dateTo, dateFromStr, dateToStr, accountId }),
    ["analytics-summary", userId, dateFromStr, dateToStr, accountId ?? "all"],
    {
      revalidate: CACHE_TTL_SECONDS,
      tags: [analyticsTag(userId), txTag(userId)],
    },
  );

  return NextResponse.json(await cached());
}

// ── Pure compute: pulled out of the request handler so unstable_cache can
// memoize it per (user, dateFrom, dateTo, accountId). Invalidated by either
// `analytics:${userId}` or `tx:${userId}` tag.
async function computeSummary(args: {
  userId: string;
  dateFrom: Date;
  dateTo: Date;
  dateFromStr: string;
  dateToStr: string;
  accountId?: string;
}) {
  const { userId, dateFrom, dateTo, dateFromStr, dateToStr, accountId } = args;

  const baseTxWhere: Prisma.TransactionWhereInput = {
    userId,
    status: "VERIFIED",
    date: { gte: dateFrom, lte: dateTo },
    ...(accountId ? { accountId } : {}),
  };

  const accountFragment = accountId
    ? Prisma.sql`AND t."accountId" = ${accountId}`
    : Prisma.sql``;

  const [
    categoryGroups,
    incomeAggregate,
    expenseAggregate,
    vendorGroups,
    accounts,
    monthlyRaw,
  ] = await Promise.all([
    // ── 1. Spend by category (EXPENSE only) ─────────────────────────────────
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...baseTxWhere, type: "EXPENSE" },
      _sum: { amount: true },
      _count: { _all: true },
    }),

    // ── 2. Total INCOME in range ─────────────────────────────────────────────
    prisma.transaction.aggregate({
      where: { ...baseTxWhere, type: "INCOME" },
      _sum: { amount: true },
    }),

    // ── 3. Total EXPENSE in range ────────────────────────────────────────────
    prisma.transaction.aggregate({
      where: { ...baseTxWhere, type: "EXPENSE" },
      _sum: { amount: true },
    }),

    // ── 4. Top-10 vendors by EXPENSE spend ───────────────────────────────────
    prisma.transaction.groupBy({
      by: ["vendor"],
      where: { ...baseTxWhere, type: "EXPENSE", vendor: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),

    // ── 5. Non-archived accounts (current balance, no date filter) ───────────
    prisma.account.findMany({
      where: { userId, isArchived: false },
      select: {
        id: true,
        name: true,
        color: true,
        balance: true,
        currency: true,
        type: true,
      },
      orderBy: { name: "asc" },
    }),

    // ── 6. Monthly income/expense via raw SQL ────────────────────────────────
    // EXTRACT(…)::int   → int4  → JS number
    // SUM(amount)::text → avoids Decimal/BigInt surprises; parsed by Decimal.js
    prisma.$queryRaw<MonthlyRawRow[]>`
      SELECT
        EXTRACT(YEAR  FROM t.date)::int AS year,
        EXTRACT(MONTH FROM t.date)::int AS month,
        t.type::text                    AS type,
        SUM(t.amount)::text             AS total
      FROM "Transaction" t
      WHERE t."userId"  = ${userId}
        AND t.status    = 'VERIFIED'::"TxStatus"
        AND t.type      IN ('INCOME'::"TxType", 'EXPENSE'::"TxType")
        AND t.date      >= ${dateFromStr}::date
        AND t.date      <= ${dateToStr}::date
        ${accountFragment}
      GROUP BY year, month, t.type
      ORDER BY year, month, t.type
    `,
  ]);

  // ── Build spendByCategory ────────────────────────────────────────────────
  // Fetch category metadata for all non-null categoryIds in one query.
  const nonNullCatIds = categoryGroups
    .filter((r) => r.categoryId !== null)
    .map((r) => r.categoryId as string);

  const categoryMeta =
    nonNullCatIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: nonNullCatIds } },
          select: { id: true, nameEn: true, color: true },
        })
      : [];

  const categoryMap = new Map(categoryMeta.map((c) => [c.id, c]));

  const spendByCategory = categoryGroups
    .map((r) => {
      const total = new Decimal(r._sum.amount?.toString() ?? "0");
      if (r.categoryId === null) {
        return {
          categoryId: null as null,
          categoryName: "Uncategorised",
          categoryColor: "#64748b",
          total: total.toFixed(2),
          txCount: r._count._all,
        };
      }
      const meta = categoryMap.get(r.categoryId);
      return {
        categoryId: r.categoryId,
        categoryName: meta?.nameEn ?? "Unknown",
        categoryColor: meta?.color ?? "#64748b",
        total: total.toFixed(2),
        txCount: r._count._all,
      };
    })
    // Sort descending by total spend (Decimal comparison, no float drift).
    .sort((a, b) =>
      new Decimal(b.total).comparedTo(new Decimal(a.total))
    );

  // ── Build monthlyTrends ──────────────────────────────────────────────────
  // Pivot raw rows into a map keyed by "YYYY-MM".
  const trendMap = new Map<string, { income: Decimal; expenses: Decimal }>();

  for (const row of monthlyRaw) {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    if (!trendMap.has(key)) {
      trendMap.set(key, { income: new Decimal(0), expenses: new Decimal(0) });
    }
    const entry = trendMap.get(key)!;
    const amt = new Decimal(row.total ?? "0");
    if (row.type === "INCOME") {
      entry.income = amt;
    } else if (row.type === "EXPENSE") {
      entry.expenses = amt;
    }
  }

  // Fill every calendar month in the range (including months with zero activity).
  const allMonths = buildMonthRange(dateFrom, dateTo);

  const monthlyTrends = allMonths.map((month) => {
    const data = trendMap.get(month) ?? {
      income: new Decimal(0),
      expenses: new Decimal(0),
    };
    const net = data.income.minus(data.expenses);
    return {
      month,
      income: data.income.toFixed(2),
      expenses: data.expenses.toFixed(2),
      net: net.toFixed(2),
    };
  });

  // ── Build accountDistribution ────────────────────────────────────────────
  const accountDistribution = accounts.map((a) => ({
    accountId: a.id,
    accountName: a.name,
    accountColor: a.color,
    balance: new Decimal(a.balance.toString()).toFixed(2),
    currency: a.currency,
    type: a.type,
  }));

  // ── Build topVendors ─────────────────────────────────────────────────────
  const topVendors = vendorGroups
    .filter((r): r is typeof r & { vendor: string } => r.vendor !== null)
    .map((r) => ({
      vendor: r.vendor,
      total: new Decimal(r._sum.amount?.toString() ?? "0").toFixed(2),
      txCount: r._count._all,
    }));

  // ── Build summary ────────────────────────────────────────────────────────
  const totalIncome = new Decimal(
    incomeAggregate._sum.amount?.toString() ?? "0"
  );
  const totalExpenses = new Decimal(
    expenseAggregate._sum.amount?.toString() ?? "0"
  );
  const netSavings = totalIncome.minus(totalExpenses);

  const savingsRate = totalIncome.isZero()
    ? 0
    : netSavings
        .div(totalIncome)
        .mul(100)
        .toDecimalPlaces(1)
        .toNumber();

  // Divide by the number of months spanned (at least 1 to avoid division by zero).
  const numMonths = new Decimal(Math.max(allMonths.length, 1));
  const avgMonthlyExpenses = totalExpenses.div(numMonths);
  const avgMonthlyIncome = totalIncome.div(numMonths);

  const summary = {
    totalIncome: totalIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    netSavings: netSavings.toFixed(2),
    savingsRate,
    avgMonthlyExpenses: avgMonthlyExpenses.toFixed(2),
    avgMonthlyIncome: avgMonthlyIncome.toFixed(2),
  };

  // ── Return cached payload ────────────────────────────────────────────────
  return {
    dateFrom: dateFromStr,
    dateTo: dateToStr,
    spendByCategory,
    monthlyTrends,
    accountDistribution,
    topVendors,
    summary,
  };
}
