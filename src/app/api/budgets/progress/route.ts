import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import Decimal from "decimal.js";

// ── Period date-range helpers ────────────────────────────────────────────────

type PeriodKey = "MONTHLY" | "QUARTERLY" | "YEARLY";

interface DateRange {
  start: Date;
  end: Date;
}

function getPeriodRange(period: PeriodKey, now: Date): DateRange {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (period) {
    case "MONTHLY": {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0); // last day of month
      return { start, end };
    }
    case "QUARTERLY": {
      const quarterStartMonth = Math.floor(month / 3) * 3; // 0, 3, 6, or 9
      const start = new Date(year, quarterStartMonth, 1);
      const end = new Date(year, quarterStartMonth + 3, 0); // last day of quarter
      return { start, end };
    }
    case "YEARLY": {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return { start, end };
    }
  }
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── GET /api/budgets/progress ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse & validate the `period` query param
  const { searchParams } = new URL(req.url);
  const rawPeriod = searchParams.get("period") ?? "MONTHLY";

  const VALID_PERIODS: PeriodKey[] = ["MONTHLY", "QUARTERLY", "YEARLY"];
  if (!VALID_PERIODS.includes(rawPeriod as PeriodKey)) {
    return NextResponse.json(
      { error: "period must be MONTHLY, QUARTERLY, or YEARLY" },
      { status: 400 }
    );
  }
  const period = rawPeriod as PeriodKey;

  // Compute date range for the current period
  const now = new Date();
  const { start: periodStart, end: periodEnd } = getPeriodRange(period, now);

  // Fetch all active budgets for this user matching the period
  const budgets = await prisma.budget.findMany({
    where: {
      userId: session.user.id,
      period,
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
    },
    include: {
      category: {
        select: {
          id: true,
          nameEn: true,
          color: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (budgets.length === 0) {
    return NextResponse.json({
      period,
      periodStart: toDateString(periodStart),
      periodEnd: toDateString(periodEnd),
      items: [],
    });
  }

  // Gather all relevant categoryIds for a single aggregation query
  const categoryIds = budgets.map((b) => b.categoryId);

  // Aggregate actual spend per category in one query
  const spendRows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId: session.user.id,
      type: "EXPENSE",
      status: "VERIFIED",
      categoryId: { in: categoryIds },
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    _sum: { amount: true },
  });

  // Build a lookup map: categoryId → Decimal spend
  const spendMap = new Map<string, Decimal>();
  for (const row of spendRows) {
    if (row.categoryId) {
      spendMap.set(
        row.categoryId,
        new Decimal(row._sum.amount?.toString() ?? "0")
      );
    }
  }

  // Build progress items
  const items = budgets.map((budget) => {
    const budgetAmount = new Decimal(budget.amount.toString());
    const actualAmount = spendMap.get(budget.categoryId) ?? new Decimal(0);

    // percentUsed = (actual / budgeted) * 100, rounded to 1 decimal place
    const percentUsed = budgetAmount.isZero()
      ? new Decimal(0)
      : actualAmount.div(budgetAmount).mul(100).toDecimalPlaces(1);

    const remaining = budgetAmount.minus(actualAmount);
    const isOverBudget = actualAmount.greaterThan(budgetAmount);
    const alertTriggered =
      budget.alertAt != null &&
      percentUsed.greaterThanOrEqualTo(new Decimal(budget.alertAt));

    return {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category.nameEn,
      categoryColor: budget.category.color,
      budgetAmount: budgetAmount.toFixed(2),
      actualAmount: actualAmount.toFixed(2),
      remaining: remaining.toFixed(2),
      percentUsed: percentUsed.toNumber(),
      isOverBudget,
      alertTriggered,
      alertAt: budget.alertAt,
    };
  });

  return NextResponse.json({
    period,
    periodStart: toDateString(periodStart),
    periodEnd: toDateString(periodEnd),
    items,
  });
}
