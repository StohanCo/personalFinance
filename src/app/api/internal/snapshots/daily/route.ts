import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await prisma.$queryRaw<{ snapshot_all_accounts_for_today: number }[]>`
      SELECT snapshot_all_accounts_for_today();
    `;

    const affected = result[0]?.snapshot_all_accounts_for_today ?? 0;

    return NextResponse.json({
      ok: true,
      affectedRows: affected,
      runAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
