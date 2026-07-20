import { UserId } from '@genshot/shared/account/identity';
import {
  CENTS_PER_CREDIT,
  COST_PRICE_MULTIPLIER,
  CREDIT_PACK_IDS,
  DEFAULT_PAID_CREDIT_PACK_ID,
  LEMON_PWYW_PLATFORM_MIN_CENTS,
} from '@genshot/shared/billing/pricing';
import { Schema } from 'effect';

/**
 * Purchasable credit pack id.
 * @returns one known Lemon Squeezy-facing credit-pack id.
 * @example
 * Schema.decodeUnknownSync(CreditPackId)('image_credits_10');
 * Used by: checkout creation, pricing responses, and CLI purchase flows.
 */
export const CreditPackId = Schema.Literal(...CREDIT_PACK_IDS).annotations({
  description: 'Identifier of a purchasable credit pack',
});
export type CreditPackId = typeof CreditPackId.Type;

/** True when `value` parses as an absolute URL. */
const isUrl = (value: string): boolean => URL.canParse(value);

/**
 * `POST /billing/checkout` request body.
 * @returns a checkout request with the default pack filled when omitted.
 * @example
 * Schema.decodeUnknownSync(CheckoutCreate)({ returnUrl: 'https://genshot.app/thanks' });
 * Used by: worker billing service and CLI purchase command.
 */
export const CheckoutCreate = Schema.Struct({
  packId: Schema.optionalWith(CreditPackId, {
    default: () => DEFAULT_PAID_CREDIT_PACK_ID,
  }).annotations({
    description: 'Credit pack selected for checkout, defaulting to the standard paid pack',
  }),
  returnUrl: Schema.optional(
    Schema.String.pipe(Schema.filter(isUrl, { message: () => 'returnUrl must be a valid URL.' })),
  ).annotations({
    description: 'Optional absolute URL opened after checkout completes',
  }),
}).annotations({ description: 'POST /billing/checkout request body' });
export type CheckoutCreate = typeof CheckoutCreate.Type;
export type CheckoutCreateInput = typeof CheckoutCreate.Type;

/**
 * `POST /billing/checkout` response body.
 * @returns a hosted checkout URL and the credit pack economics.
 * @example
 * Schema.decodeUnknownSync(CheckoutCreateResponse)(payload);
 * Used by: worker billing controller and CLI purchase command.
 */
export const CheckoutCreateResponse = Schema.Struct({
  checkoutUrl: Schema.String.annotations({
    description: 'Hosted checkout URL for the selected credit pack',
  }),
  credits: Schema.Int.pipe(Schema.greaterThan(0)).annotations({
    description: 'Number of image credits purchased by the checkout',
  }),
  amountCents: Schema.Int.pipe(Schema.greaterThan(0)).annotations({
    description: 'Checkout price in the smallest currency unit',
  }),
}).annotations({ description: 'POST /billing/checkout response body' });
export type CheckoutCreateResponse = typeof CheckoutCreateResponse.Type;

/**
 * One purchasable credit pack as reported by `GET /billing/pricing`.
 * @returns a public pricing row normalized from Lemon Squeezy.
 * @example
 * Schema.decodeUnknownSync(BillingPricingPack)(payload.packs[0]);
 * Used by: worker billing service, web pricing UI, and CLI purchase command.
 */
export const BillingPricingPack = Schema.Struct({
  packId: CreditPackId.annotations({ description: 'Stable genshot credit-pack identifier' }),
  variantId: Schema.String.annotations({
    description: 'Lemon Squeezy variant identifier backing the pack',
  }),
  name: Schema.String.annotations({ description: 'Public display name of the credit pack' }),
  description: Schema.NullOr(Schema.String).annotations({
    description: 'Public pack description, or null when none is configured',
  }),
  priceCents: Schema.Int.annotations({
    description: 'Pack price in the smallest currency unit',
  }),
  currency: Schema.String.annotations({ description: 'ISO currency code for the pack price' }),
  priceFormatted: Schema.String.annotations({
    description: 'Human-formatted pack price including its currency',
  }),
  status: Schema.String.annotations({ description: 'Machine-readable availability state' }),
  statusFormatted: Schema.String.annotations({
    description: 'Human-readable availability state',
  }),
  testMode: Schema.Boolean.annotations({
    description: 'Whether the backing Lemon Squeezy variant is in test mode',
  }),
  buyNowUrl: Schema.NullOr(Schema.String).annotations({
    description: 'Hosted direct-purchase URL, or null when unavailable',
  }),
  sort: Schema.Int.annotations({ description: 'Ascending display order for the pack' }),
}).annotations({ description: 'Public pricing details for one purchasable credit pack' });
export type BillingPricingPack = typeof BillingPricingPack.Type;

/**
 * `GET /billing/pricing` response body.
 * @returns the public credit-pack catalog.
 * @example
 * Schema.decodeUnknownSync(BillingPricingResponse)(payload);
 * Used by: web pricing UI and CLI purchase command.
 */
export const BillingPricingResponse = Schema.Struct({
  configured: Schema.Boolean.annotations({
    description: 'Whether the billing catalog is configured for purchases',
  }),
  source: Schema.Literal('lemon_squeezy').annotations({
    description: 'Merchant-of-record source for the pricing catalog',
  }),
  storeUrl: Schema.NullOr(Schema.String).annotations({
    description: 'Public Lemon Squeezy storefront URL, or null when unavailable',
  }),
  currency: Schema.NullOr(Schema.String).annotations({
    description: 'Shared ISO currency code for the catalog, or null when mixed or empty',
  }),
  packs: Schema.Array(BillingPricingPack).annotations({
    description: 'Purchasable credit packs in display order',
  }),
  centsPerCredit: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => CENTS_PER_CREDIT,
  }).annotations({
    description:
      'List price in USD cents for one credit / one successful image from D1 runtime state (ADR-0028)',
  }),
  pwywMinCents: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => Math.max(LEMON_PWYW_PLATFORM_MIN_CENTS, CENTS_PER_CREDIT),
  }).annotations({
    description:
      'Recommended Lemon PWYW minimum in cents (max of platform floor and one credit list price)',
  }),
  costMultiplier: Schema.optionalWith(Schema.Number.pipe(Schema.greaterThan(0)), {
    default: () => COST_PRICE_MULTIPLIER,
  }).annotations({
    description: 'ADR-0026 measured-cost to list multiplier applied when remeasuring packs',
  }),
  pricingSource: Schema.optionalWith(Schema.Literal('seed', 'd1_remeasure', 'manual', 'unknown'), {
    default: () => 'seed' as const,
  }).annotations({
    description: 'How the current centsPerCredit was last set (seed, remeasure, or manual)',
  }),
  updatedAt: Schema.String.annotations({
    description: 'ISO timestamp when the pricing response was assembled',
  }),
}).annotations({ description: 'GET /billing/pricing response body' });
export type BillingPricingResponse = typeof BillingPricingResponse.Type;

/**
 * `GET /credits` response body.
 * @returns the authenticated user's spendable credit balance.
 * @example
 * Schema.decodeUnknownSync(CreditsBalanceResponse)({ userId: 'usr_abc', balance: 10 });
 * Used by: worker billing controller and CLI status output.
 */
export const CreditsBalanceResponse = Schema.Struct({
  userId: UserId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Identifier of the authenticated user account',
  }),
  balance: Schema.Int.annotations({ description: 'Current spendable credit balance' }),
}).annotations({ description: 'GET /credits response body' });
export type CreditsBalanceResponse = typeof CreditsBalanceResponse.Type;
