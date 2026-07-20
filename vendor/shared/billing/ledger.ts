/** Outcome of processing a Lemon Squeezy purchase webhook. */
export const PURCHASE_STATUSES = ['received', 'applied', 'ignored_duplicate', 'rejected'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Entry kinds in the append-only credit ledger. */
export const CREDIT_LEDGER_TYPES = [
  'beta_grant',
  'purchase',
  'manual_grant',
  'reservation',
  'release',
  'adjustment',
] as const;
export type CreditLedgerType = (typeof CREDIT_LEDGER_TYPES)[number];
