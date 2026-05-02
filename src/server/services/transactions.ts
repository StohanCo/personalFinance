import { Decimal } from "decimal.js";
import type { Prisma, TxType, TxStatus, TxSource } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { gstFromInclusive } from "@/lib/tax/gst";

// Re-export enums so route files have one import for everything service-related
export type { TxType, TxStatus };

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

// ---------- clone ----------

export type CloneTxOverrides = {
  date?: Date;
  accountId?: string;
  amount?: Decimal.Value;
  vendor?: string | null;
  description?: string | null;
  notes?: string | null;
};

/**
 * Duplicate an existing transaction. The clone:
 *   - defaults to today's date and PENDING status (forces re-verification)
 *   - never carries the source's receiptId (each receipt is 1:1 with a tx)
 *   - keeps a pointer to the source via clonedFromId for traceability
 *   - re-uses createTransaction so balance + audit log stay correct
 *
 * Throws "Transaction not found" if the source row is missing or owned by
 * another user. Throws if the source is a TRANSFER (handled separately —
 * the user should explicitly create a new transfer pair).
 */
export async function cloneTransaction(
  sourceId: string,
  userId: string,
  overrides: CloneTxOverrides = {},
) {
  const source = await prisma.transaction.findFirst({
    where: { id: sourceId, userId },
  });
  if (!source) throw new Error("Transaction not found");
  if (source.type === "TRANSFER") {
    throw new Error("Cannot clone a TRANSFER — recreate the transfer pair instead");
  }

  const clone = await createTransaction({
    userId,
    accountId: overrides.accountId ?? source.accountId,
    categoryId: source.categoryId,
    type: source.type,
    amount: overrides.amount ?? source.amount,
    date: overrides.date ?? new Date(),
    vendor:
      overrides.vendor !== undefined
        ? overrides.vendor ?? undefined
        : source.vendor ?? undefined,
    description:
      overrides.description !== undefined
        ? overrides.description ?? undefined
        : source.description ?? undefined,
    notes:
      overrides.notes !== undefined
        ? overrides.notes ?? undefined
        : source.notes ?? undefined,
    gstApplicable: source.gstApplicable,
    gstAmount: source.gstAmount,
    gstInclusive: source.gstInclusive,
    isDeductible: source.isDeductible,
    deductiblePercent: source.deductiblePercent,
    // Force re-review on the clone — the user should explicitly verify the
    // new occurrence. Skips balance impact until they confirm.
    status: "PENDING",
    source: "MANUAL",
  });

  // Wire up the back-reference + dedicated audit entry so the operation is
  // visible in the audit log (createTransaction already wrote a "created"
  // row, this one annotates the cause).
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: clone.id },
      data: { clonedFromId: source.id },
    });
    await tx.auditLog.create({
      data: {
        userId,
        entityType: "transaction",
        entityId: clone.id,
        action: "cloned",
        metadata: { sourceId: source.id },
      },
    });
  });

  return clone;
}

// ---------- update ----------

export type UpdateTxInput = {
  userId: string;
  /** All editable fields below are optional — only provided keys are mutated */
  type?: TxType;
  amount?: Decimal.Value;
  date?: Date;
  vendor?: string | null;
  description?: string | null;
  notes?: string | null;
  categoryId?: string | null;
  accountId?: string;
  gstApplicable?: boolean;
  gstAmount?: Decimal.Value;
  gstInclusive?: boolean;
  isDeductible?: boolean;
  deductiblePercent?: number;
  status?: TxStatus;
};

export async function updateTransaction(txId: string, input: UpdateTxInput) {
  return prisma.$transaction(async (tx) => {
    // ── 1. Fetch current record ──────────────────────────────────────────────
    const old = await tx.transaction.findFirst({
      where: { id: txId, userId: input.userId },
    });
    if (!old) throw new Error("Transaction not found");

    // ── 1a. Guard: TRANSFER linkage is immutable through this endpoint.
    // Changing type from/to TRANSFER would silently drop the
    // transferAccountId or fabricate one, leaving balances unrecoverable.
    if (input.type !== undefined && input.type !== old.type) {
      const becomesTransfer = input.type === "TRANSFER";
      const wasTransfer = old.type === "TRANSFER";
      if (becomesTransfer || wasTransfer) {
        throw new Error(
          "Cannot change transaction type to/from TRANSFER. Delete and recreate the transfer instead.",
        );
      }
    }

    // ── 2. Resolve effective values for balance calculations ─────────────────
    const oldStatus = old.status;
    const newStatus: TxStatus = input.status ?? oldStatus;

    const newAmount =
      input.amount != null
        ? new Decimal(input.amount).abs()
        : new Decimal(old.amount.toString());
    const newType: TxType = input.type ?? old.type;
    const newAccountId = input.accountId ?? old.accountId;
    // transferAccountId is intentionally immutable via this endpoint
    const transferAccountId = old.transferAccountId;

    // ── 3. Balance deltas (atomic with the record update) ────────────────────
    if (oldStatus === "VERIFIED" && newStatus !== "VERIFIED") {
      // Transitioning OUT of VERIFIED → reverse the old balance impact
      await applyBalanceDelta(tx, old, true);
    } else if (oldStatus !== "VERIFIED" && newStatus === "VERIFIED") {
      // Transitioning INTO VERIFIED → apply new (potentially edited) values
      await applyBalanceDelta(tx, {
        accountId: newAccountId,
        transferAccountId,
        type: newType,
        amount: newAmount,
      });
    } else if (oldStatus === "VERIFIED" && newStatus === "VERIFIED") {
      // Staying VERIFIED but amount/type/account may have changed → re-settle
      await applyBalanceDelta(tx, old, true); // reverse old impact
      await applyBalanceDelta(tx, {
        accountId: newAccountId,
        transferAccountId,
        type: newType,
        amount: newAmount,
      }); // apply new impact
    }
    // Both non-VERIFIED → no balance changes needed

    // ── 4. GST amount resolution ─────────────────────────────────────────────
    let gstAmountValue: string | undefined;
    if (input.gstAmount !== undefined) {
      // Explicit override wins
      gstAmountValue = new Decimal(input.gstAmount).abs().toFixed(2);
    } else if (input.gstApplicable === false) {
      // Turning off GST → zero out
      gstAmountValue = "0.00";
    }
    // Otherwise: leave unchanged (undefined → Prisma skips the field)

    // ── 5. verifiedAt bookkeeping ─────────────────────────────────────────────
    let verifiedAtValue: Date | null | undefined;
    if (oldStatus !== "VERIFIED" && newStatus === "VERIFIED") {
      verifiedAtValue = new Date();
    } else if (oldStatus === "VERIFIED" && newStatus !== "VERIFIED") {
      verifiedAtValue = null;
    }
    // If no status change: leave verifiedAt untouched (undefined)

    // ── 6. Persist update ────────────────────────────────────────────────────
    const updated = await tx.transaction.update({
      where: { id: txId },
      data: {
        type: input.type,
        amount:
          input.amount !== undefined ? newAmount.toFixed(2) : undefined,
        date: input.date,
        vendor: input.vendor,
        description: input.description,
        notes: input.notes,
        categoryId: input.categoryId,
        accountId: input.accountId,
        gstApplicable: input.gstApplicable,
        gstAmount: gstAmountValue,
        gstInclusive: input.gstInclusive,
        isDeductible: input.isDeductible,
        deductiblePercent: input.deductiblePercent,
        status: input.status,
        verifiedAt: verifiedAtValue,
      },
    });

    // ── 7. Audit log with field-level diff ───────────────────────────────────
    /** Normalise any field value to a JSON-safe string or null */
    function toAuditStr(v: unknown): string | null {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      return String(v);
    }

    const diffFields = [
      "type",
      "amount",
      "date",
      "vendor",
      "description",
      "notes",
      "categoryId",
      "accountId",
      "gstApplicable",
      "gstAmount",
      "gstInclusive",
      "isDeductible",
      "deductiblePercent",
      "status",
      "verifiedAt",
    ] as const;

    type DiffRecord = Record<string, { old: string | null; new: string | null }>;
    const changes: DiffRecord = {};

    for (const field of diffFields) {
      const o = toAuditStr(old[field]);
      const n = toAuditStr(updated[field]);
      if (o !== n) {
        changes[field] = { old: o, new: n };
      }
    }

    await tx.auditLog.create({
      data: {
        userId: input.userId,
        entityType: "transaction",
        entityId: txId,
        action: "updated",
        changes: changes as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
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
  // Pass a string fixed at 2dp; Prisma's Decimal field accepts string and
  // routes it through pg's NUMERIC without going through JS float.
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: delta.toFixed(2) } },
  });
}
