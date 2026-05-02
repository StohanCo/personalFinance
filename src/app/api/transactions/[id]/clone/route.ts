import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { cloneTransaction } from "@/server/services/transactions";
import { txInclude, formatTx, bumpTxCaches } from "@/app/api/transactions/route";

type RouteContext = { params: Promise<{ id: string }> };

const CloneSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .optional(),
    accountId: z.string().cuid().optional(),
    amount: z.number().positive().optional(),
    vendor: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .partial();

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // Body is optional — empty body means "clone with sensible defaults".
  let overrides: z.infer<typeof CloneSchema> = {};
  if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
    const body: unknown = await req.json().catch(() => ({}));
    const parsed = CloneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    overrides = parsed.data;
  }

  let clone;
  try {
    clone = await cloneTransaction(id, userId, {
      date: overrides.date ? new Date(overrides.date) : undefined,
      accountId: overrides.accountId,
      amount: overrides.amount,
      vendor: overrides.vendor,
      description: overrides.description,
      notes: overrides.notes,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Transaction not found") {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err.message.startsWith("Cannot clone a TRANSFER")) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }
    throw err;
  }

  // Re-fetch with relations so the client gets the same shape as
  // GET /api/transactions/:id.
  const full = await prisma.transaction.findFirst({
    where: { id: clone.id, userId },
    include: txInclude,
  });
  if (!full) {
    return NextResponse.json({ error: "Clone not found" }, { status: 500 });
  }

  bumpTxCaches(userId);
  return NextResponse.json({ transaction: formatTx(full) }, { status: 201 });
}
