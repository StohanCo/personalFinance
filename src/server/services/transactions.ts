import { Decimal } from "decimal.js";
import type { Prisma, TxType, TxStatus, TxSource } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { gstFromInclusive } from "@/lib/tax/gst";

/**
 * Business logic for transactions.
 *
 * Rules that live here (not in the API layer):
 * - Balance mutations on the parent Account are atomic with the Tx write.
 * - GST amount is computed from the category default + user override.
 * - Audit log entry is written for every mutation.
 * - PENDING transactions DO NOT affect the account balance until verified.
 */

export type CreateTxInput = {
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TxType;
  amount: Decimal.Value;
  date: Date;
  vendor?: string;
  description?: string;
  notes?: string;
  gstApplicable: boolean;
  gstAmount?: Decimal.Value;
  gstInclusive?: boolean;
  isDeductible: boolean;
  deductiblePercent: number;
  status?: TxStatus;
  source?: TxSource;
  receiptId?: string;
  transferAccountId?: string;
};

export async function createTransaction(input: CreateTxInput) {
  const amount = new Decimal(input.amount).abs();

  // Compute GST if not explicitly provided
  let gstAmount = new Decimal(0);
  if (input.gstApplicable) {
    if (input.gstAmount != null) {
      gstAmount = new Decimal(input.gstAmount);
    } else if (input.gstInclusive !== false) {
      gstAmount = gstFromInclusive(amount).gst;
    }
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId: input.userId,
        accountId: input.accountId,
        categoryId: input.categoryId,
        type: input.type,
        amount: amount.toFixed(2),
        date: input.date,
        vendor: input.vendor,
        description: input.description,
        notes: input.notes,
        gstApplicable: input.gstApplicable,
        gstAmount: gstAmount.toFixed(2),
        gstInclusive: input.gstInclusive ?? true,
        isDeductible: input.isDeductible,
        deductiblePercent: input.deductiblePercent,
        status: input.status ?? "VERIFIED",
        source: input.source ?? "MANUAL",
        receiptId: input.receiptId,
        transferAccountId: input.transferAccountId,
      },
    });

    // Only VERIFIED transactions move money
    if (created.status === "VERIFIED") {
      await applyBalanceDelta(tx, created);
    }

    await tx.auditLog.create({
      data: {
        userId: input.userId,
        entityType: "transaction",
        entityId: created.id,
        action: "created",
        metadata: { source: created.source },
      },
    });

    return created;
  });
}

export async function verifyTransaction(txId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({
      where: { id: txId, userId },
    });
    if (!t) throw new Error("Transaction not found");
    if (t.status === "VERIFIED") return t;

    const updated = await tx.transaction.update({
      where: { id: txId },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });

    await applyBalanceDelta(tx, updated);

    await tx.auditLog.create({
      data: {
        userId,
        entityType: "transaction",
        entityId: txId,
        action: "verified",
      },
    });

    return updated;
  });
}

export async function deleteTransaction(txId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({
      where: { id: txId, userId },
    });
    if (!t) throw new Error("Transaction not found");

    // Only VERIFIED txs were moving the balance; reverse only those.
    if (t.status === "VERIFIED") {
      await applyBalanceDelta(tx, t, true /* reverse */);
    }

    await tx.transaction.delete({ where: { id: txId } });

    await tx.auditLog.create({
      data: {
        userId,
        entityType: "transaction",
        entityId: txId,
        action: "deleted",
        changes: { snapshot: t as unknown as Prisma.JsonValue },
      },
    });
  });
}

// ---------- internals ----------

async function applyBalanceDelta(
  tx: Prisma.TransactionClient,
  t: {
    accountId: string;
    transferAccountId: string | null;
    type: TxType;
    amount: Prisma.Decimal | Decimal;
  },
  reverse = false,
) {
  const amount = new Decimal(t.amount.toString());
  const sign = reverse ? -1 : 1;

  if (t.type === "INCOME") {
    await incrementBalance(tx, t.accountId, amount.mul(sign));
  } else if (t.type === "EXPENSE") {
    await incrementBalance(tx, t.accountId, amount.mul(-sign));
  } else if (t.type === "TRANSFER" && t.transferAccountId) {
    // Source out, destination in
    await incrementBalance(tx, t.accountId, amount.mul(-sign));
    await incrementBalance(tx, t.transferAccountId, amount.mul(sign));
  }
}

async function incrementBalance(
  tx: Prisma.TransactionClient,
  accountId: string,
  delta: Decimal,
) {
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: delta.toFixed(2) as unknown as number } },
  });
}
