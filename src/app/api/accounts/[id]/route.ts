import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT", "LOAN"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  balance: z.number().finite().optional(),
  color: z.string().optional(),
  creditLimit: z.number().nullable().optional(),
  apr: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toString(),
      creditLimit: account.creditLimit?.toString() ?? null,
      apr: account.apr?.toString() ?? null,
      notes: account.notes,
      color: account.color,
      isArchived: account.isArchived,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = UpdateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.account.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const data = parsed.data;

  const updated = await prisma.account.update({
    where: { id: params.id },
    data: {
      name: data.name,
      type: data.type,
      currency: data.currency,
      balance: data.balance != null ? data.balance.toFixed(2) : undefined,
      color: data.color,
      creditLimit: data.creditLimit === null ? null : data.creditLimit?.toFixed(2),
      apr: data.apr === null ? null : data.apr?.toFixed(3),
      notes: data.notes,
      isArchived: data.isArchived,
    },
  });

  return NextResponse.json({ account: updated });
}
