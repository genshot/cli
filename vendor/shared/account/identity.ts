import { Schema } from 'effect';

/** Free credits granted to a new beta account on creation. */
export const DEFAULT_FREE_BETA_CREDITS = 10;

/**
 * Branded identifier for a `users` row.
 * @returns a schema branding a plain string as `UserId`.
 * @example
 * Schema.decodeUnknownSync(UserId)('usr_abc');
 * Used by: auth, billing ledger entries, and generation ownership checks.
 */
export const UserId = Schema.String.pipe(Schema.brand('UserId')).annotations({
  description: 'Branded identifier for a user account',
});
export type UserId = typeof UserId.Type;
