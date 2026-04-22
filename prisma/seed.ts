import { PrismaClient } from "@prisma/client";
import { SYSTEM_CATEGORIES } from "../src/lib/domain/categories";

const prisma = new PrismaClient();

/**
 * Seeds system-provided categories for all users (global, userId = null)
 * and optionally creates a demo user with realistic data.
 *
 * Run locally:   npm run db:seed
 * Run on staging: DATABASE_URL=... tsx prisma/seed.ts
 */

async function main() {
  console.log("🌱 Seeding database…");

  // 1. System categories (userId = null)
  // Prisma can't upsert on nullable unique fields, so use findFirst + create/update
  for (const cat of SYSTEM_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, key: cat.key },
    });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          nameEn: cat.nameEn,
          nameRu: cat.nameRu,
          defaultDeductible: cat.defaultDeductible,
          defaultDeductiblePercent: cat.defaultDeductiblePercent,
          defaultGstApplicable: cat.defaultGstApplicable,
          color: cat.color,
          icon: cat.icon,
          sortOrder: cat.sortOrder,
        },
      });
    } else {
      await prisma.category.create({ data: { ...cat, userId: null } });
    }
  }
  console.log(`✓ ${SYSTEM_CATEGORIES.length} system categories`);

  // 2. Demo user (only in local/dev)
  if (process.env.NODE_ENV !== "production") {
    const demo = await prisma.user.upsert({
      where: { email: "demo@finops.local" },
      create: {
        email: "demo@finops.local",
        name: "Demo Contractor",
        gstRegistered: true,
        gstNumber: "123-456-789",
        currency: "NZD",
      },
      update: {},
    });

    // Accounts
    const [checking, savings, credit] = await Promise.all([
      prisma.account.upsert({
        where: { id: "demo-checking" },
        create: { id: "demo-checking", userId: demo.id, name: "ANZ Everyday", type: "CHECKING", balance: "8420.55", color: "#0ea5e9" },
        update: {},
      }),
      prisma.account.upsert({
        where: { id: "demo-savings" },
        create: { id: "demo-savings", userId: demo.id, name: "Westpac Notice Saver", type: "SAVINGS", balance: "42100.00", color: "#10b981" },
        update: {},
      }),
      prisma.account.upsert({
        where: { id: "demo-credit" },
        create: { id: "demo-credit", userId: demo.id, name: "ANZ Visa", type: "CREDIT", balance: "-1245.80", creditLimit: "10000", apr: "20.95", color: "#ef4444" },
        update: {},
      }),
    ]);

    // Categories map for demo user (uses system categories)
    const cats = await prisma.category.findMany({ where: { userId: null } });
    const byKey = Object.fromEntries(cats.map((c) => [c.key, c]));
    const cat = (key: string) => {
      const c = byKey[key];
      if (!c) throw new Error(`Category "${key}" not seeded`);
      return c;
    };

    // Wipe and reseed demo transactions for idempotent runs
    await prisma.transaction.deleteMany({ where: { userId: demo.id } });

    const today = new Date();
    const d = (daysAgo: number) => {
      const x = new Date(today);
      x.setDate(x.getDate() - daysAgo);
      return x;
    };

    await prisma.transaction.createMany({
      data: [
        { userId: demo.id, accountId: checking.id, categoryId: cat("contract").id, type: "INCOME", amount: "12500.00", date: d(2), vendor: "Acme Cloud Ltd", description: "Invoice #042 – March sprint", gstApplicable: true, gstAmount: "1630.43", isDeductible: false, deductiblePercent: 0, status: "VERIFIED" },
        { userId: demo.id, accountId: credit.id, categoryId: cat("software").id, type: "EXPENSE", amount: "89.99", date: d(3), vendor: "GitHub", description: "Copilot Pro annual", gstApplicable: true, gstAmount: "11.74", isDeductible: true, deductiblePercent: 100, status: "VERIFIED" },
        { userId: demo.id, accountId: credit.id, categoryId: cat("equipment").id, type: "EXPENSE", amount: "1499.00", date: d(5), vendor: "PB Tech", description: "Dell U2723QE monitor", gstApplicable: true, gstAmount: "195.52", isDeductible: true, deductiblePercent: 100, status: "VERIFIED" },
        { userId: demo.id, accountId: checking.id, categoryId: cat("groceries").id, type: "EXPENSE", amount: "185.40", date: d(6), vendor: "Countdown", description: "Weekly shop", gstApplicable: true, gstAmount: "24.18", isDeductible: false, deductiblePercent: 0, status: "VERIFIED" },
        { userId: demo.id, accountId: credit.id, categoryId: cat("meals-biz").id, type: "EXPENSE", amount: "68.50", date: d(8), vendor: "Orleans", description: "Client lunch", gstApplicable: true, gstAmount: "8.93", isDeductible: true, deductiblePercent: 50, status: "PENDING" },
        { userId: demo.id, accountId: checking.id, categoryId: cat("internet").id, type: "EXPENSE", amount: "125.00", date: d(10), vendor: "Spark NZ", description: "Fibre 300", gstApplicable: true, gstAmount: "16.30", isDeductible: true, deductiblePercent: 70, status: "VERIFIED" },
        { userId: demo.id, accountId: checking.id, categoryId: cat("insurance").id, type: "EXPENSE", amount: "299.00", date: d(14), vendor: "BizCover", description: "PI + PL", gstApplicable: false, gstAmount: "0", isDeductible: true, deductiblePercent: 100, status: "VERIFIED" },
        { userId: demo.id, accountId: checking.id, categoryId: cat("rent").id, type: "EXPENSE", amount: "2150.00", date: d(18), vendor: "Barfoot", description: "Monthly rent", gstApplicable: false, gstAmount: "0", isDeductible: false, deductiblePercent: 0, status: "VERIFIED" },
        { userId: demo.id, accountId: savings.id, categoryId: cat("interest").id, type: "INCOME", amount: "87.50", date: d(28), vendor: "Westpac", description: "Monthly interest", gstApplicable: false, gstAmount: "0", isDeductible: false, deductiblePercent: 0, status: "VERIFIED" },
      ],
    });

    // Budgets
    await prisma.budget.deleteMany({ where: { userId: demo.id } });
    await prisma.budget.createMany({
      data: [
        { userId: demo.id, categoryId: cat("groceries").id, amount: "800", period: "MONTHLY" },
        { userId: demo.id, categoryId: cat("dining").id, amount: "300", period: "MONTHLY" },
        { userId: demo.id, categoryId: cat("transport").id, amount: "250", period: "MONTHLY" },
        { userId: demo.id, categoryId: cat("entertainment").id, amount: "150", period: "MONTHLY" },
      ],
    });

    console.log(`✓ Demo user (${demo.email}) with 3 accounts, 9 transactions, 4 budgets`);
  }

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
