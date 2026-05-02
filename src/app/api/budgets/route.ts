import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { budgetsTag } from "@/lib/cache/tags";

// ── Zod schema ──────────────────────────────────────────────────────────────

const CreateBudgetSchema = z.object({
  categoryId: z.string().cuid(),
  amount: z.number().positive(),
  period: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD")
    .nullable()
    .optional(),
  rollover: z.boolean().optional(),
  alertAt: z.number().int().min(0).max(100).nullable().optional(),
});

// ── Shared shape helper ──────────────────────────────────────────────────────

function formatBudget(budget: {
  id: string;
  categoryId: string;
  category: { nameEn: string; color: string; type: string };
  amount: { toString(): string };
  period: string;
  startDate: Date;
  endDate: Date | null;
  rollover: boolean;
  alertAt: number | null;
  createdAt: Date;
}) {
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    categoryName: budget.category.nameEn,
    categoryColor: budget.category.color,
    categoryType: budget.category.type,
    amount: budget.amount.toString(),
    period: budget.period,
    startDate: budget.startDate.toISOString().slice(0, 10),
    endDate: budget.endDate ? budget.endDate.toISOString().slice(0, 10) : null,
    rollover: budget.rollover,
    alertAt: budget.alertAt,
    createdAt: budget.createdAt.toISOString(),
  };
}

const categorySelect = {
  id: true,
  nameEn: true,
  type: true,
  color: true,
  icon: true,
} as const;

// ── GET /api/budgets ─────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const budgets = await prisma.budget.findMany({
    where: { userId: session.user.id },
    include: { category: { select: categorySelect } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ budgets: budgets.map(formatBudget) });
}

// ── POST /api/budgets ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { categoryId, amount, period, startDate, endDate, rollover, alertAt } = parsed.data;

  // Verify category belongs to this user OR is a system category (userId = null)
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      OR: [{ userId: session.user.id }, { userId: null }],
    },
    select: categorySelect,
  });

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const budget = await prisma.budget.create({
    data: {
      userId: session.user.id,
      categoryId,
      amount: amount.toFixed(2),
      period,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      rollover: rollover ?? false,
      alertAt: alertAt ?? null,
    },
    include: { category: { select: categorySelect } },
  });

  revalidateTag(budgetsTag(session.user.id));
  return NextResponse.json({ budget: formatBudget(budget) }, { status: 201 });
}
