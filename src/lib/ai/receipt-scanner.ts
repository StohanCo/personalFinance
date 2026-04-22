import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/domain/categories";

/**
 * Server-side receipt scanner. Runs on the Next.js API route, not the client,
 * so the ANTHROPIC_API_KEY never ships to the browser.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

/**
 * Zod schema mirrors the JSON contract we ask Claude to return.
 * We validate at runtime because LLM output can drift.
 */
export const ReceiptExtractionSchema = z.object({
  vendor: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  total: z.number().nullable(),
  currency: z.enum(["NZD", "USD", "EUR", "AUD", "GBP", "RUB", "other"]),
  gstApplicable: z.boolean(),
  gstAmount: z.number().nullable(),
  gstInclusive: z.boolean(),
  items: z.array(z.object({ name: z.string(), price: z.number() })),
  category: z.string(),
  likelyDeductibleForItContractor: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().optional(),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

const CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key).join(", ");

const SYSTEM_PROMPT = `You are a receipt OCR and tax-categorisation assistant for a New Zealand IT contractor. Return ONLY a single valid JSON object, no markdown fences, no commentary. Be conservative with confidence — use "low" when details are unclear.`;

function buildUserPrompt(): string {
  return `Extract structured data from this receipt image. Return ONLY this JSON:
{
  "vendor": "store/merchant name",
  "date": "YYYY-MM-DD or null if unreadable",
  "total": <number, final amount paid, or null>,
  "currency": "NZD"|"USD"|"EUR"|"AUD"|"GBP"|"RUB"|"other",
  "gstApplicable": <boolean — true if receipt shows GST/VAT or is from a NZ/AU business>,
  "gstAmount": <number or null — GST amount if shown explicitly>,
  "gstInclusive": <boolean — typically true for NZ/AU receipts>,
  "items": [{"name": "short item name", "price": <number>}],
  "category": <one of: ${CATEGORY_KEYS}>,
  "likelyDeductibleForItContractor": <boolean — is this a plausible business expense for a home-based IT contractor>,
  "confidence": "high"|"medium"|"low",
  "notes": "1-line observation if anything is unclear"
}

Rules:
- If NZ receipt shows a total but no explicit GST line, calculate gstAmount = total * 3/23 rounded to 2 dp.
- Default currency to NZD if receipt looks like NZ.
- Equipment, software, SaaS, professional development, business insurance, accounting, business travel, and business meals are typically deductible for IT contractors. Groceries, personal dining, and personal rent are not.

Additional extraction requirements:
- Capture as many visible line items as possible in the items array, not just a summary line.
- Include individual product/service lines with their line price when readable.
- If line-item prices are partially unreadable, still include the item name and set price to 0 for that line.
- Ensure total reflects the final paid amount shown on the receipt.`;
}

export async function scanReceipt(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<ReceiptExtraction> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.mimeType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: params.imageBase64,
            },
          },
          { type: "text", text: buildUserPrompt() },
        ],
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const raw = textBlock.text.replace(/```json|```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse Claude response as JSON: ${raw.slice(0, 200)}`);
  }

  const validated = ReceiptExtractionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Claude response failed validation: ${validated.error.message}`,
    );
  }

  return validated.data;
}
