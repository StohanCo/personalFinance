import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  updateTransaction,
  deleteTransaction,
} from "@/server/services/transactions";
import { txInclude, formatTx, bumpTxCaches } from "@/app/api/transactions/route";
import { z } from "zod";

// ── Shared route-segment context type (Next.js 15 async params) ──────────────
type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/transactions/[id] ────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tx = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
    include: txInclude,
  });

  if (!tx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json({ transaction: formatTx(tx) });
}

// ── PATCH /api/transactions/[id] ──────────────────────────────────────────────

const PatchTxSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  amount: z.number().positive().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  vendor: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  categoryId: z.string().cuid().nullable().optional(),
  gstApplicable: z.boolean().optional(),
  gstAmount: z.number().min(0).optional(),
  gstInclusive: z.boolean().optional(),
  isDeductible: z.boolean().optional(),
  deductiblePercent: z.number().int().min(0).max(100).optional(),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await params;

  // ── Validate body ─────────────────────────────────────────────────────────
  const body: unknown = await req.json();
  const parsed = PatchTxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // ── Guard: reject completely empty PATCH bodies ───────────────────────────
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "No fields provided for update" },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // ── Service call ──────────────────────────────────────────────────────────
  let updated;
  try {
    updated = await updateTransaction(id, {
      userId,
      type: data.type,
      amount: data.amount,
      date: data.date ? new Date(data.date) : undefined,
      vendor: data.vendor,
      description: data.description,
      notes: data.notes,
      categoryId: data.categoryId,
      gstApplicable: data.gstApplicable,
      gstAmount: data.gstAmount,
      gstInclusive: data.gstInclusive,
      isDeductible: data.isDeductible,
      deductiblePercent: data.deductiblePercent,
      status: data.status,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Transaction not found") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    throw err; // let Next.js convert to 500
  }

  // ── Return updated transaction with relations ─────────────────────────────
  const full = await prisma.transaction.findFirst({
    where: { id, userId },
    include: txInclude,
  });

  if (!full) {
    // Shouldn't happen, but type-safety requires a check
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  bumpTxCaches(userId);
  return NextResponse.json({ transaction: formatTx(full) });
}

// ── DELETE /api/transactions/[id] ─────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await deleteTransaction(id, session.user.id);
  } catch (err) {
    if (err instanceof Error && err.message === "Transaction not found") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    throw err;
  }

  bumpTxCaches(session.user.id);
  return new NextResponse(null, { status: 204 });
}
