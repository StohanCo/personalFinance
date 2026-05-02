import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { createTransaction } from "@/server/services/transactions";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

// ── Shared include / formatter (also used by [id]/route.ts) ──────────────────

export const txInclude = {
  account: { select: { name: true, color: true } },
  category: { select: { nameEn: true, color: true } },
} as const;

export type TxWithRelations = Prisma.TransactionGetPayload<{
  include: typeof txInclude;
}>;

export function formatTx(t: TxWithRelations) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    amount: t.amount.toString(),
    currency: t.currency,
    date: t.date.toISOString().slice(0, 10),
    vendor: t.vendor,
    description: t.description,
    notes: t.notes,
    gstApplicable: t.gstApplicable,
    gstAmount: t.gstAmount.toString(),
    gstInclusive: t.gstInclusive,
    isDeductible: t.isDeductible,
    deductiblePercent: t.deductiblePercent,
    accountId: t.accountId,
    accountName: t.account.name,
    accountColor: t.account.color,
    categoryId: t.categoryId,
    categoryName: t.category?.nameEn ?? null,
    categoryColor: t.category?.color ?? null,
    receiptId: t.receiptId,
    source: t.source,
    verifiedAt: t.verifiedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ── GET /api/transactions ─────────────────────────────────────────────────────

const ListQuerySchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
  accountId: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD")
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  withCount: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Parse & validate query params ────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const rawParams = {
    type: searchParams.get("type") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  };

  const parsed = ListQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { type, status, accountId, dateFrom, dateTo, search, limit, cursor, withCount } =
    parsed.data;

  // ── Build where clause ────────────────────────────────────────────────────
  const where: Prisma.TransactionWhereInput = {
    userId,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(accountId ? { accountId } : {}),
    ...(dateFrom ?? dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { vendor: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { notes: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // ── Cursor-based pagination ───────────────────────────────────────────────
  // count(*) is opt-in via ?withCount=1; default response uses hasMore from cursor.
  const rowsPromise = prisma.transaction.findMany({
    where,
    include: txInclude,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const [rows, total] = await Promise.all([
    rowsPromise,
    withCount ? prisma.transaction.count({ where }) : Promise.resolve(null),
  ]);

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const last = rows.pop(); // returns undefined only when array was empty
    if (last) nextCursor = last.id;
  }

  return NextResponse.json({
    transactions: rows.map(formatTx),
    nextCursor,
    hasMore: nextCursor !== null,
    total, // null unless ?withCount=1
  });
}

// ── POST /api/transactions ────────────────────────────────────────────────────

const CreateTxSchema = z.object({
  accountId: z.string().cuid(),
  categoryId: z.string().cuid().nullable().default(null),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  gstApplicable: z.boolean().default(false),
  gstAmount: z.number().optional(),
  gstInclusive: z.boolean().default(true),
  isDeductible: z.boolean().default(false),
  deductiblePercent: z.number().min(0).max(100).default(0),
  transferAccountId: z.string().cuid().optional(),
  receiptId: z.string().cuid().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateTxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tx = await createTransaction({
    ...parsed.data,
    userId: session.user.id,
    date: new Date(parsed.data.date),
    status: "VERIFIED",
    source: parsed.data.receiptId ? "SCAN" : "MANUAL",
  });

  return NextResponse.json({ transaction: tx }, { status: 201 });
}
