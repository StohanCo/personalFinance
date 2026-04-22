import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

// ── Zod schema ──────────────────────────────────────────────────────────────

const UpdateBudgetSchema = z.object({
  amount: z.number().positive().optional(),
  period: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD")
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD")
    .nullable()
    .optional(),
  rollover: z.boolean().optional(),
  alertAt: z.number().int().min(0).max(100).nullable().optional(),
});

// ── Shared shape helper ──────────────────────────────────────────────────────

const categorySelect = {
  id: true,
  nameEn: true,
  type: true,
  color: true,
  icon: true,
} as const;

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

// ── GET /api/budgets/[id] ────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const budget = await prisma.budget.findFirst({
    where: { id, userId: session.user.id },
    include: { category: { select: categorySelect } },
  });

  if (!budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  return NextResponse.json({ budget: formatBudget(budget) });
}

// ── PATCH /api/budgets/[id] ──────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json();
  const parsed = UpdateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.budget.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  const { amount, period, startDate, endDate, rollover, alertAt } = parsed.data;

  const updated = await prisma.budget.update({
    where: { id },
    data: {
      ...(amount !== undefined && { amount: amount.toFixed(2) }),
      ...(period !== undefined && { period }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      // endDate can be null (clear it) or a new date string
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(rollover !== undefined && { rollover }),
      // alertAt can be null (clear it) or a new value
      ...(alertAt !== undefined && { alertAt }),
    },
    include: { category: { select: categorySelect } },
  });

  return NextResponse.json({ budget: formatBudget(updated) });
}

// ── DELETE /api/budgets/[id] ─────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership before deletion
  const existing = await prisma.budget.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  await prisma.budget.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
