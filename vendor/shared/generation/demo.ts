import { AppStoreUrl, JOB_STATUSES, JobId } from '@genshot/shared/generation/contracts';
import { Schema } from 'effect';

/**
 * Global free-demo budget shared by every visitor (UI + API): $10 USD total
 * at the list price of $1 per image. Once spent across all runs, create is blocked.
 */
export const DEMO_BUDGET_USD_CENTS = 1000;

/** List price used for the public demo budget math (matches $1 / image packs). */
export const DEMO_USD_CENTS_PER_IMAGE = 100;

/**
 * Max image-credits the public demo may ever spend (global, not per visitor).
 * Equals `DEMO_BUDGET_USD_CENTS / DEMO_USD_CENTS_PER_IMAGE` (= 10).
 */
export const DEMO_MAX_IMAGES = DEMO_BUDGET_USD_CENTS / DEMO_USD_CENTS_PER_IMAGE;

/** Ordered pipeline stages shown live in the landing demo progress UI. */
export const DEMO_STAGE_IDS = [
  'validate',
  'pull',
  'analyze',
  'budget',
  'generate',
  'compose',
  'done',
] as const;
export type DemoStageId = (typeof DEMO_STAGE_IDS)[number];

/** Human labels for each demo stage (web + worker share the same copy). */
export const DEMO_STAGE_LABELS: Record<DemoStageId, string> = {
  validate: 'Validate App Store URL',
  pull: 'Pull listing screenshots',
  analyze: 'Read app name & description',
  budget: 'Reserve free demo credits',
  generate: 'Generate polished panels',
  compose: 'Compose before / after pairs',
  done: 'Ready to review',
};

/** Lifecycle of one stage chip in the live progress rail. */
export const DEMO_STAGE_STATUSES = ['pending', 'active', 'done', 'failed'] as const;
export type DemoStageStatus = (typeof DEMO_STAGE_STATUSES)[number];

/**
 * One stage row returned on create/status so the UI never invents the pipeline.
 * @returns a schema for one public-demo progress stage.
 * @example
 * Schema.decodeUnknownSync(DemoStage)({ id: 'validate', label: 'Validate URL', status: 'active' });
 * Used by: public-demo create/status responses and the landing progress rail.
 */
export const DemoStage = Schema.Struct({
  id: Schema.Literal(...DEMO_STAGE_IDS).annotations({
    description: 'Stable identifier of the demo pipeline stage',
  }),
  label: Schema.String.annotations({ description: 'Human-readable label for the demo stage' }),
  status: Schema.Literal(...DEMO_STAGE_STATUSES).annotations({
    description: 'Current lifecycle state of the demo stage',
  }),
}).annotations({ description: 'One progress stage in the public-demo pipeline' });
export type DemoStage = typeof DemoStage.Type;

/**
 * One source screenshot pulled from the App Store listing (BEFORE).
 * @returns a schema for an indexed source screenshot.
 * @example
 * Schema.decodeUnknownSync(DemoBeforeImage)({ index: 0, url: 'https://example.com/source.png' });
 * Used by: public-demo status responses and before/after comparisons.
 */
export const DemoBeforeImage = Schema.Struct({
  index: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: 'Zero-based position of the source screenshot',
  }),
  url: Schema.String.annotations({ description: 'Public URL of the source screenshot' }),
}).annotations({ description: 'Source App Store screenshot shown before generation' });
export type DemoBeforeImage = typeof DemoBeforeImage.Type;

/**
 * One generated panel (AFTER) once the generator uploads it.
 * @returns a schema for an indexed generated demo panel.
 * @example
 * Schema.decodeUnknownSync(DemoAfterImage)({ index: 0, status: 'pending', url: null });
 * Used by: public-demo status responses and before/after comparisons.
 */
export const DemoAfterImage = Schema.Struct({
  index: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: 'Zero-based position of the generated panel',
  }),
  status: Schema.Literal('pending', 'succeeded', 'failed').annotations({
    description: 'Generation lifecycle state for this demo panel',
  }),
  url: Schema.NullOr(Schema.String).annotations({
    description: 'Public URL of the generated panel, or null until available',
  }),
}).annotations({ description: 'Generated panel shown after the demo completes' });
export type DemoAfterImage = typeof DemoAfterImage.Type;

/**
 * `POST /api/v1/demo/listings` body — public, no API key.
 * @returns a decoded App Store URL for the free demo path.
 * @example
 * Schema.decodeUnknownSync(DemoListingCreate)({
 *   appStoreUrl: 'https://apps.apple.com/us/app/example/id123',
 * });
 * Used by: public-demo listing creation.
 */
export const DemoListingCreate = Schema.Struct({
  appStoreUrl: AppStoreUrl.annotations({
    description: 'App Store listing URL used as the public-demo source',
  }),
}).annotations({ description: 'POST /api/v1/demo/listings request body' });
export type DemoListingCreate = typeof DemoListingCreate.Type;

/**
 * Public demo job status — polled by the landing page.
 * @returns stages, before/after image pairs, and budget accounting.
 * @example
 * Schema.decodeUnknownSync(DemoListingStatus)(payload);
 * Used by: public-demo create/status endpoints and the landing page.
 */
export const DemoListingStatus = Schema.Struct({
  jobId: JobId.annotations({ description: 'Identifier of the public-demo generation job' }),
  status: Schema.Literal(...JOB_STATUSES).annotations({
    description: 'Overall lifecycle state of the public-demo job',
  }),
  stage: Schema.Literal(...DEMO_STAGE_IDS).annotations({
    description: 'Furthest active or completed demo pipeline stage',
  }),
  stages: Schema.Array(DemoStage).annotations({
    description: 'Ordered progress rows for every demo pipeline stage',
  }),
  appStoreUrl: AppStoreUrl.annotations({
    description: 'App Store listing URL used as the demo source',
  }),
  appName: Schema.NullOr(Schema.String).annotations({
    description: 'App name extracted from the listing, or null before discovery',
  }),
  requestedCount: Schema.Int.annotations({
    description: 'Number of generated panels requested for the demo',
  }),
  succeededCount: Schema.Int.annotations({
    description: 'Number of demo panels generated successfully',
  }),
  failedCount: Schema.Int.annotations({
    description: 'Number of demo panels that failed to generate',
  }),
  budgetUsdCents: Schema.Literal(DEMO_BUDGET_USD_CENTS).annotations({
    description: 'Global public-demo budget in US-dollar cents',
  }),
  estimatedCostUsdCents: Schema.Int.annotations({
    description: 'Estimated cost consumed by this demo job in US-dollar cents',
  }),
  remainingBudgetUsdCents: Schema.Int.annotations({
    description: 'Unspent global demo budget in US-dollar cents',
  }),
  before: Schema.Array(DemoBeforeImage).annotations({
    description: 'Source App Store screenshots ordered for comparison',
  }),
  after: Schema.Array(DemoAfterImage).annotations({
    description: 'Generated demo panels ordered for comparison',
  }),
  error: Schema.NullOr(
    Schema.Struct({
      code: Schema.String.annotations({ description: 'Machine-readable demo failure code' }),
      message: Schema.String.annotations({
        description: 'Human-readable explanation of the demo failure',
      }),
    }).annotations({ description: 'Public-demo job failure details' }),
  ).annotations({
    description: 'Public-demo job failure details, or null when no error is present',
  }),
  createdAt: Schema.String.annotations({
    description: 'ISO timestamp when the public-demo job was created',
  }),
  updatedAt: Schema.String.annotations({
    description: 'ISO timestamp when the public-demo job was last updated',
  }),
  /** True when this IP already ran once and we returned the existing job. */
  reusedExisting: Schema.optionalWith(Schema.Boolean, { default: () => false }).annotations({
    description: 'Whether an existing demo job was reused for the requester IP',
  }),
}).annotations({ description: 'Public-demo listing job status response' });
export type DemoListingStatus = typeof DemoListingStatus.Type;

/**
 * Build the ordered stage list for a given active stage id.
 * @param activeStage - The furthest stage that should be active or completed.
 * @param failed - Whether the pipeline failed, marking the active stage as failed.
 * @returns Wire-ready stage rows for the progress rail.
 * @example
 * buildDemoStages('generate');
 * Used by: the public-demo worker controller and landing progress rail.
 */
export const buildDemoStages = (activeStage: DemoStageId, failed = false): readonly DemoStage[] => {
  const activeIndex = DEMO_STAGE_IDS.indexOf(activeStage);
  return DEMO_STAGE_IDS.map((id, index) => {
    const label = DEMO_STAGE_LABELS[id];
    if (failed && index === activeIndex) {
      return { id, label, status: 'failed' as const };
    }
    if (index < activeIndex) {
      return { id, label, status: 'done' as const };
    }
    if (index === activeIndex) {
      return {
        id,
        label,
        status: id === 'done' && !failed ? ('done' as const) : ('active' as const),
      };
    }
    return { id, label, status: 'pending' as const };
  });
};
