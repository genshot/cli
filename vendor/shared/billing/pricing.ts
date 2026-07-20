/**
 * Purchasable credit bundles, keyed by Lemon Squeezy-facing pack id. One credit
 * buys one successfully generated image. Price per image is flat; pack sizes
 * amortize checkout fees rather than offering a volume discount.
 *
 * **List price (ADR-0026 + ADR-0028):** target = measured average cost per
 * successful image × {@link COST_PRICE_MULTIPLIER}. Compile-time
 * {@link CREDIT_PACKS} / {@link CENTS_PER_CREDIT} are the **seed** defaults.
 * The worker’s D1 `billing_pricing_state.cents_per_credit` is the runtime SSOT
 * for PWYW grants and remeasure; update Lemon fixed-pack catalog prices when
 * that value moves (variant API or dashboard automation).
 *
 * ### Last seed remeasure (2026-07-18)
 *
 * Source: operator `pnpm cli cost --json` over `data/generates` (136 priced
 * images, 27 manifests with cost). Avg measured cost ≈ **$0.1909/image** →
 * `Math.round(0.1909 × 100) = 19¢` cost → `targetPriceCentsFromCost(19) = 29¢`
 * list per image. Pack `amountCents` = credits × 29.
 *
 * ### Remeasure (runtime)
 *
 * 1. Real paid generations persist `generation_outputs.estimated_cost_usd`.
 * 2. `GET /api/v1/admin/generation-cost` aggregates samples.
 * 3. `POST /api/v1/admin/billing/remeasure` writes `billing_pricing_state` when
 *    sample count and delta thresholds pass (see {@link decideRemeasure}).
 * 4. Offline operator manifests: `pnpm cli cost`.
 * 5. Sync Lemon fixed pack list prices to `credits × cents_per_credit`; PWYW
 *    min floor is {@link pwywMinPriceCents}.
 */
export const CREDIT_PACKS = {
  image_credits_12: {
    id: 'image_credits_12',
    credits: 12,
    amountCents: 348,
  },
  image_credits_30: {
    id: 'image_credits_30',
    credits: 30,
    amountCents: 870,
  },
  image_credits_60: {
    id: 'image_credits_60',
    credits: 60,
    amountCents: 1740,
  },
  /**
   * Lemon “Pay what you want” variant. Catalog `credits` / `amountCents` are the
   * **suggested** checkout defaults only; the webhook grants
   * {@link creditsFromPaidAmountCents} from the paid total using runtime
   * cents-per-credit.
   */
  image_credits_custom: {
    id: 'image_credits_custom',
    credits: 100,
    amountCents: 2900,
  },
} as const;

/**
 * Seed list cents per credit / successful image (ADR-0026). Used when D1 has no
 * pricing row yet. Fixed pack seed amounts are `credits × CENTS_PER_CREDIT`.
 */
export const CENTS_PER_CREDIT =
  CREDIT_PACKS.image_credits_12.amountCents / CREDIT_PACKS.image_credits_12.credits;

/** Seed measured average cost (USD cents) that produced {@link CENTS_PER_CREDIT}. */
export const SEED_MEASURED_AVG_COST_CENTS = 19;

/** Pack whose paid total maps to credits at runtime (not a fixed bundle size). */
export const DYNAMIC_CREDIT_PACK_ID = 'image_credits_custom' as const;

/**
 * Margin multiplier over measured provider cost (ADR-0026). List price target is
 * `round(costCents × COST_PRICE_MULTIPLIER)`, not the older ×3 floor story.
 */
export const COST_PRICE_MULTIPLIER = 1.5;

/**
 * Minimum succeeded cost samples before an automatic remeasure may apply.
 * Protects against thrashing on sparse D1 data after a reset.
 */
export const REMEASURE_MIN_SAMPLES = 50;

/**
 * Minimum absolute change in list cents-per-credit before remeasure applies.
 * Avoids oscillating on sub-cent noise after rounding.
 */
export const REMEASURE_MIN_DELTA_CENTS = 2;

/**
 * Lemon Squeezy platform floor for Pay-what-you-want minimum (USD cents).
 * One credit below this still floors checkout at $0.50.
 */
export const LEMON_PWYW_PLATFORM_MIN_CENTS = 50;

/**
 * Credits granted for a paid order total on the custom / pay-what-you-want pack.
 * @param amountCents - Order total in USD cents (Lemon `attributes.total`).
 * @param centsPerCredit - List cents per credit (runtime SSOT; defaults to seed).
 * @returns Whole credits at `centsPerCredit` (floored); never negative.
 * @example
 * ```ts
 * creditsFromPaidAmountCents(2900); // 100 at 29¢ seed
 * creditsFromPaidAmountCents(58); // 2
 * creditsFromPaidAmountCents(2900, 36); // 80 when runtime list is 36¢
 * ```
 * Used by: Lemon webhook purchase apply path.
 */
export const creditsFromPaidAmountCents = (
  amountCents: number,
  centsPerCredit: number = CENTS_PER_CREDIT,
): number => {
  if (amountCents <= 0 || centsPerCredit <= 0) {
    return 0;
  }
  return Math.floor(amountCents / centsPerCredit);
};

/**
 * Convert measured per-image provider cost (integer USD cents) into the ADR-0026
 * list-price target in cents: `round(cost × 1.5)`.
 *
 * @param costCents - Measured average cost per successful image, in USD cents.
 * @returns List-price target in USD cents for one credit / one image.
 * @example
 * ```ts
 * targetPriceCentsFromCost(12); // 18 — $0.12 cost → $0.18 list
 * targetPriceCentsFromCost(100); // 150
 * ```
 * Used by: remeasure, `GET /admin/generation-cost`, operator `pnpm cli cost`.
 */
export const targetPriceCentsFromCost = (costCents: number): number =>
  Math.round(costCents * COST_PRICE_MULTIPLIER);

/**
 * Lemon PWYW checkout minimum in cents for a given list rate: at least one
 * credit’s list price, never below Lemon’s platform floor.
 *
 * @param centsPerCredit - Runtime or seed list cents per credit.
 * @returns Minimum payable cents for the custom pack.
 * @example
 * ```ts
 * pwywMinPriceCents(29); // 50 — Lemon floor beats 29¢
 * pwywMinPriceCents(58); // 58
 * ```
 */
export const pwywMinPriceCents = (centsPerCredit: number): number => {
  if (centsPerCredit <= 0) {
    return LEMON_PWYW_PLATFORM_MIN_CENTS;
  }
  return Math.max(LEMON_PWYW_PLATFORM_MIN_CENTS, centsPerCredit);
};

/**
 * Catalog list amount for a fixed pack at the current cents-per-credit.
 * @param credits - Images in the pack.
 * @param centsPerCredit - Runtime or seed list cents per credit.
 * @returns Pack list price in USD cents.
 */
export const packListAmountCents = (credits: number, centsPerCredit: number): number =>
  credits * centsPerCredit;

/** Outcome of comparing measured cost against current list cents. */
export type RemeasureDecision =
  | {
      readonly action: 'apply';
      readonly previousCentsPerCredit: number;
      readonly nextCentsPerCredit: number;
      readonly measuredAvgCostCents: number;
      readonly samples: number;
      readonly deltaCents: number;
    }
  | {
      readonly action: 'skip';
      readonly reason:
        | 'insufficient_samples'
        | 'below_threshold'
        | 'invalid_avg'
        | 'non_positive_target';
      readonly previousCentsPerCredit: number;
      readonly nextCentsPerCredit: number | null;
      readonly measuredAvgCostCents: number | null;
      readonly samples: number;
      readonly deltaCents: number | null;
    };

/**
 * Pure remeasure gate: avg provider cost → list cents; apply only when sample
 * count and absolute delta thresholds pass (ADR-0028).
 *
 * @param input - Aggregate cost stats and current runtime cents.
 * @returns Apply with next cents, or skip with a machine reason.
 * @example
 * ```ts
 * decideRemeasure({ samples: 100, avgCostUsd: 0.24, currentCentsPerCredit: 29 });
 * // → apply nextCentsPerCredit 36
 * ```
 * Used by: `POST /admin/billing/remeasure`.
 */
export const decideRemeasure = (input: {
  readonly samples: number;
  readonly avgCostUsd: number | null;
  readonly currentCentsPerCredit: number;
  readonly minSamples?: number;
  readonly minDeltaCents?: number;
}): RemeasureDecision => {
  const minSamples = input.minSamples === undefined ? REMEASURE_MIN_SAMPLES : input.minSamples;
  const minDeltaCents =
    input.minDeltaCents === undefined ? REMEASURE_MIN_DELTA_CENTS : input.minDeltaCents;
  const previous = input.currentCentsPerCredit;

  if (input.samples < minSamples) {
    return {
      action: 'skip',
      reason: 'insufficient_samples',
      previousCentsPerCredit: previous,
      nextCentsPerCredit: null,
      measuredAvgCostCents: null,
      samples: input.samples,
      deltaCents: null,
    };
  }

  if (input.avgCostUsd === null || !(input.avgCostUsd > 0) || !Number.isFinite(input.avgCostUsd)) {
    return {
      action: 'skip',
      reason: 'invalid_avg',
      previousCentsPerCredit: previous,
      nextCentsPerCredit: null,
      measuredAvgCostCents: null,
      samples: input.samples,
      deltaCents: null,
    };
  }

  const measuredAvgCostCents = Math.round(input.avgCostUsd * 100);
  const next = targetPriceCentsFromCost(measuredAvgCostCents);
  if (next <= 0) {
    return {
      action: 'skip',
      reason: 'non_positive_target',
      previousCentsPerCredit: previous,
      nextCentsPerCredit: next,
      measuredAvgCostCents,
      samples: input.samples,
      deltaCents: Math.abs(next - previous),
    };
  }

  const deltaCents = Math.abs(next - previous);
  if (deltaCents < minDeltaCents) {
    return {
      action: 'skip',
      reason: 'below_threshold',
      previousCentsPerCredit: previous,
      nextCentsPerCredit: next,
      measuredAvgCostCents,
      samples: input.samples,
      deltaCents,
    };
  }

  return {
    action: 'apply',
    previousCentsPerCredit: previous,
    nextCentsPerCredit: next,
    measuredAvgCostCents,
    samples: input.samples,
    deltaCents,
  };
};

/** Valid pack ids accepted by checkout and pricing contracts. */
export const CREDIT_PACK_IDS = [
  'image_credits_12',
  'image_credits_30',
  'image_credits_60',
  'image_credits_custom',
] as const;
type CreditPackId = (typeof CREDIT_PACK_IDS)[number];

/** Pack pre-selected when the caller does not specify one. */
export const DEFAULT_PAID_CREDIT_PACK_ID = 'image_credits_30' satisfies CreditPackId;
export const DEFAULT_PAID_CREDIT_PACK_SIZE = CREDIT_PACKS[DEFAULT_PAID_CREDIT_PACK_ID].credits;
export const DEFAULT_PAID_CREDIT_PACK_AMOUNT_CENTS =
  CREDIT_PACKS[DEFAULT_PAID_CREDIT_PACK_ID].amountCents;
