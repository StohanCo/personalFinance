import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { DEFAULT_CURRENCIES } from "@/lib/currencies";

/** GET — return the user's enabled currencies (seeds defaults on first call) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  let currencies = await prisma.userCurrency.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    select: { code: true, label: true, sortOrder: true },
  });

  // Seed defaults for new users
  if (currencies.length === 0) {
    await prisma.userCurrency.createMany({
      data: DEFAULT_CURRENCIES.map((c) => ({ ...c, userId })),
    });
    currencies = DEFAULT_CURRENCIES.map((c) => ({ ...c }));
  }

  return NextResponse.json({ currencies });
}

const AddCurrencySchema = z.object({
  code: z.string().min(3).max(3).toUpperCase(),
  label: z.string().min(1).max(80),
});

/** POST — add a currency to the user's list */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = AddCurrencySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = session.user.id;
  const { code, label } = parsed.data;

  const maxOrder = await prisma.userCurrency.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 10;

  const currency = await prisma.userCurrency.upsert({
    where: { userId_code: { userId, code } },
    create: { userId, code, label, sortOrder },
    update: { label },
    select: { code: true, label: true, sortOrder: true },
  });

  return NextResponse.json({ currency }, { status: 201 });
}
