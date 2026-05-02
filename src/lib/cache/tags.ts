/**
 * Cache tag conventions for `unstable_cache` and `revalidateTag`.
 *
 * Every cached query is keyed by user, so invalidation is also per-user.
 * Mutations call `bump*(userId)` after the DB write.
 */

export const txTag = (userId: string) => `tx:${userId}`;
export const analyticsTag = (userId: string) => `analytics:${userId}`;
export const accountsTag = (userId: string) => `accounts:${userId}`;
export const budgetsTag = (userId: string) => `budgets:${userId}`;
