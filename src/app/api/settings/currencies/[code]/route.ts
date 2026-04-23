import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

/** DELETE — remove a currency from the user's list */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const code = params.code.toUpperCase();

  const existing = await prisma.userCurrency.findUnique({
    where: { userId_code: { userId, code } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Currency not found" }, { status: 404 });
  }

  await prisma.userCurrency.delete({
    where: { userId_code: { userId, code } },
  });

  return new NextResponse(null, { status: 204 });
}
