/**
 * System-provided categories with NZ-contractor deduction defaults.
 *
 * These seed the `Category` table for every new user. Users can override
 * defaults per-transaction and add their own custom categories.
 *
 * Deduction percentages reflect common NZ IR3 treatment for a home-based
 * IT contractor. These are defaults, not legal advice — users can override
 * them per transaction.
 */

import type { TxType } from "@prisma/client";

export type SystemCategory = {
  key: string;
  nameEn: string;
  nameRu: string;
  type: TxType;
  defaultDeductible: boolean;
  defaultDeductiblePercent: number; // 0–100
  defaultGstApplicable: boolean;
  color: string;
  icon: string; // lucide-react icon name
  sortOrder: number;
};

export const EXPENSE_CATEGORIES: SystemCategory[] = [
  // --- Fully deductible, GST claimable ---
  { key: "equipment",     nameEn: "Equipment",          nameRu: "Оборудование",       type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 100, defaultGstApplicable: true,  color: "#60a5fa", icon: "Cpu",           sortOrder: 10 },
  { key: "software",      nameEn: "Software & SaaS",    nameRu: "Софт / Подписки",     type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 100, defaultGstApplicable: true,  color: "#34d399", icon: "Package",       sortOrder: 20 },
  { key: "professional",  nameEn: "Professional Dev",   nameRu: "Обучение",            type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 100, defaultGstApplicable: true,  color: "#fb923c", icon: "GraduationCap", sortOrder: 30 },
  { key: "accounting",    nameEn: "Accounting & Legal", nameRu: "Бухгалтерия / Право", type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 100, defaultGstApplicable: true,  color: "#f472b6", icon: "FileText",      sortOrder: 40 },
  { key: "travel",        nameEn: "Business Travel",    nameRu: "Командировки",        type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 100, defaultGstApplicable: true,  color: "#a3e635", icon: "Plane",         sortOrder: 50 },

  // --- Fully deductible, no GST (insurance is GST-exempt in NZ) ---
  { key: "insurance",     nameEn: "Business Insurance", nameRu: "Бизнес-страховка",    type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 100, defaultGstApplicable: false, color: "#facc15", icon: "Shield",        sortOrder: 60 },

  // --- Partial deductions ---
  { key: "internet",      nameEn: "Internet & Phone",   nameRu: "Интернет / Связь",    type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 70,  defaultGstApplicable: true,  color: "#22d3ee", icon: "Wifi",          sortOrder: 70 },
  { key: "meals-biz",     nameEn: "Business Meals",     nameRu: "Бизнес-обеды",        type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 50,  defaultGstApplicable: true,  color: "#fdba74", icon: "Utensils",      sortOrder: 80 },
  { key: "home-office",   nameEn: "Home Office",        nameRu: "Домашний офис",       type: "EXPENSE", defaultDeductible: true,  defaultDeductiblePercent: 20,  defaultGstApplicable: true,  color: "#a78bfa", icon: "Home",          sortOrder: 90 },

  // --- Personal, not deductible ---
  { key: "groceries",     nameEn: "Groceries",          nameRu: "Продукты",            type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: true,  color: "#4ade80", icon: "ShoppingCart",  sortOrder: 100 },
  { key: "dining",        nameEn: "Dining Out",         nameRu: "Кафе / Рестораны",    type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: true,  color: "#f87171", icon: "Coffee",        sortOrder: 110 },
  { key: "transport",     nameEn: "Transport",          nameRu: "Транспорт",           type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: true,  color: "#38bdf8", icon: "Car",           sortOrder: 120 },
  { key: "rent",          nameEn: "Rent / Mortgage",    nameRu: "Аренда / Ипотека",    type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: false, color: "#c084fc", icon: "Building",      sortOrder: 130 },
  { key: "utilities",     nameEn: "Utilities",          nameRu: "Коммуналка",          type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: true,  color: "#fde047", icon: "Zap",           sortOrder: 140 },
  { key: "health",        nameEn: "Health",             nameRu: "Здоровье",            type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: false, color: "#fb7185", icon: "Heart",         sortOrder: 150 },
  { key: "entertainment", nameEn: "Entertainment",      nameRu: "Развлечения",         type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: true,  color: "#e879f9", icon: "Music",         sortOrder: 160 },
  { key: "other",         nameEn: "Other",              nameRu: "Прочее",              type: "EXPENSE", defaultDeductible: false, defaultDeductiblePercent: 0,   defaultGstApplicable: true,  color: "#94a3b8", icon: "MoreHorizontal", sortOrder: 999 },
];

export const INCOME_CATEGORIES: SystemCategory[] = [
  { key: "contract",     nameEn: "Contract Income", nameRu: "Контракт",       type: "INCOME", defaultDeductible: false, defaultDeductiblePercent: 0, defaultGstApplicable: true,  color: "#10b981", icon: "Briefcase",  sortOrder: 10 },
  { key: "salary",       nameEn: "Salary / PAYE",   nameRu: "Зарплата / PAYE", type: "INCOME", defaultDeductible: false, defaultDeductiblePercent: 0, defaultGstApplicable: false, color: "#06b6d4", icon: "Wallet",     sortOrder: 20 },
  { key: "side",         nameEn: "Side Income",     nameRu: "Подработка",      type: "INCOME", defaultDeductible: false, defaultDeductiblePercent: 0, defaultGstApplicable: true,  color: "#84cc16", icon: "Zap",        sortOrder: 30 },
  { key: "interest",     nameEn: "Interest",        nameRu: "Проценты",        type: "INCOME", defaultDeductible: false, defaultDeductiblePercent: 0, defaultGstApplicable: false, color: "#f59e0b", icon: "TrendingUp", sortOrder: 40 },
  { key: "refund",       nameEn: "Refund / Rebate", nameRu: "Возврат",         type: "INCOME", defaultDeductible: false, defaultDeductiblePercent: 0, defaultGstApplicable: false, color: "#64748b", icon: "Undo2",      sortOrder: 50 },
  { key: "other-income", nameEn: "Other Income",    nameRu: "Другой доход",    type: "INCOME", defaultDeductible: false, defaultDeductiblePercent: 0, defaultGstApplicable: false, color: "#94a3b8", icon: "Plus",       sortOrder: 999 },
];

export const SYSTEM_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export function findCategoryByKey(key: string): SystemCategory | undefined {
  return SYSTEM_CATEGORIES.find((c) => c.key === key);
}
