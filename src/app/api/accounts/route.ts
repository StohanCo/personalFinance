import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { accountsTag, analyticsTag } from "@/lib/cache/tags";

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT", "LOAN"]),
  currency: z.string().default("NZD"),
  balance: z.number().default(0),
  color: z.string().default("#10b981"),
  creditLimit: z.number().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { balance, creditLimit, ...rest } = parsed.data;

  const account = await prisma.account.create({
    data: {
      ...rest,
      balance: balance.toFixed(2),
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : undefined,
      userId: session.user.id,
    },
  });

  revalidateTag(accountsTag(session.user.id));
  revalidateTag(analyticsTag(session.user.id));
  return NextResponse.json({ account }, { status: 201 });
}
