import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { scanReceipt } from "@/lib/ai/receipt-scanner";

export const runtime = "nodejs";
export const maxDuration = 60; // vision calls can be slow

/**
 * POST /api/receipts/scan
 * multipart/form-data: { file: File }
 *
 * 1. Auth check
 * 2. Upload image to Vercel Blob
 * 3. Create Receipt row (status = PROCESSING)
 * 4. Call Claude vision scanner
 * 5. Update Receipt with extracted data (status = COMPLETED or FAILED)
 * 6. Return Receipt (the UI creates the Transaction separately after user confirms)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  // 1. Upload to Blob
  const blob = await put(`receipts/${session.user.id}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  // 2. Create Receipt row
  const receipt = await prisma.receipt.create({
    data: {
      userId: session.user.id,
      storageKey: blob.pathname,
      storageUrl: blob.url,
      mimeType: file.type,
      fileSize: file.size,
      scanStatus: "PROCESSING",
    },
  });

  // 3. Scan with Claude
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const extracted = await scanReceipt({
      imageBase64: base64,
      mimeType: file.type,
    });

    const updated = await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        scanStatus: "COMPLETED",
        scannedAt: new Date(),
        extractedData: extracted as unknown as object,
        confidence: extracted.confidence,
        vendor: extracted.vendor,
        receiptDate: extracted.date ? new Date(extracted.date) : null,
        total: extracted.total,
        currency: extracted.currency === "other" ? null : extracted.currency,
        extractedGst: extracted.gstAmount,
      },
    });

    return NextResponse.json({ receipt: updated, extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { scanStatus: "FAILED", scanError: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
