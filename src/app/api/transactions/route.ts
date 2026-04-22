import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createTransaction } from "@/server/services/transactions";
import { z } from "zod";

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
    source: "MANUAL",
  });

  return NextResponse.json({ transaction: tx }, { status: 201 });
}
