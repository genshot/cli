import { Schema } from 'effect';

/** Lifecycle of a generation job. `deleted` is a soft-delete tombstone. */
export const JOB_STATUSES = ['queued', 'processing', 'succeeded', 'failed', 'deleted'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Terminal state of a single generated output within a job. */
export const OUTPUT_STATUSES = ['succeeded', 'failed', 'deleted'] as const;
export type OutputStatus = (typeof OUTPUT_STATUSES)[number];

/** Lifecycle of a user-uploaded source asset, from presign to attachment or expiry. */
export const UPLOADED_ASSET_STATUSES = [
  'pending',
  'uploaded',
  'attached',
  'expired',
  'deleted',
] as const;
export type UploadedAssetStatus = (typeof UPLOADED_ASSET_STATUSES)[number];

/** Max images one generation request may ask for. */
export const DEFAULT_MAX_GENERATION_COUNT = 10;

/** Max characters allowed in a caller-supplied prompt; admin-overridable per account settings. */
export const DEFAULT_MAX_USER_PROMPT_CHARS = 8000;

/** Version tag stamped onto each job's server-owned system prompt. */
export const SYSTEM_PROMPT_VERSION_APPSTORE_V1 = 'appstore-v1';

/**
 * Branded identifier for a `generation_jobs` row.
 * @returns a schema that decodes/encodes a plain string but brands the type so a
 * `JobId` is not accidentally passed where another id is expected.
 * Used by: worker generation repository rows and shared generation responses.
 * @example
 * Schema.decodeUnknownSync(JobId)('job_abc');
 */
export const JobId = Schema.String.pipe(Schema.brand('JobId')).annotations({
  description: 'Branded identifier for a generation job',
});
export type JobId = typeof JobId.Type;

/**
 * Branded identifier for a `generation_outputs` row.
 * @returns a schema branding a plain string as `OutputId`.
 * @example
 * Schema.decodeUnknownSync(OutputId)('out_abc');
 * Used by: generation output status payloads and signed output URLs.
 */
export const OutputId = Schema.String.pipe(Schema.brand('OutputId')).annotations({
  description: 'Branded identifier for a generated output',
});
export type OutputId = typeof OutputId.Type;

/**
 * Branded identifier for an uploaded source asset.
 * @returns a schema branding a plain string as `UploadedAssetId`.
 * @example
 * Schema.decodeUnknownSync(UploadedAssetId)('asset_abc');
 * Used by: upload-presign responses and generation create requests.
 */
export const UploadedAssetId = Schema.String.pipe(Schema.brand('UploadedAssetId')).annotations({
  description: 'Branded identifier for an uploaded source asset',
});
export type UploadedAssetId = typeof UploadedAssetId.Type;

/**
 * Pure R2 key for one paid Generation Output panel (worker + operator generator).
 * Panel numbers are **1-based** (`panel-1.png`) to match the generator protocol.
 * @param userId owning Beta user id
 * @param jobId Generation job id
 * @param panelNumber one-based panel index (1..N)
 * @returns object key under the generations prefix
 * @example
 * buildGenerationOutputKey('usr_1', 'job_1', 1); // 'generations/usr_1/job_1/panel-1.png'
 */
export const buildGenerationOutputKey = (
  userId: string,
  jobId: string,
  panelNumber: number,
): string => `generations/${userId}/${jobId}/panel-${panelNumber}.png`;

/**
 * `POST /generations` acknowledgement (202 queued, or 200 idempotent replay).
 * @returns job id, status, and optional replay marker.
 * Used by: worker generation view and public CLI generate command.
 */
export const GenerationCreateAck = Schema.Struct({
  jobId: JobId.annotations({ description: 'Queued or replayed generation job id' }),
  status: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: 'Job lifecycle status at acknowledge time (usually queued)',
  }),
  idempotentReplay: Schema.optionalWith(Schema.Boolean, { default: () => false }).annotations({
    description: 'True when an existing job was returned for the same Idempotency-Key',
  }),
}).annotations({ description: 'POST /generations acknowledgement body' });
export type GenerationCreateAck = typeof GenerationCreateAck.Type;

/** Public storefronts that accept a generated asset set. */
export const Marketplace = Schema.Literal(
  'app_store',
  'chrome_web_store',
  'google_play',
).annotations({
  description: 'Storefront that receives a generated asset set.',
});
export type Marketplace = typeof Marketplace.Type;

/** Immutable, versioned source snapshot for one public generation job. */
export const MarketplaceGenerationRequest = Schema.Struct({
  version: Schema.Literal(1).annotations({ description: 'Generation request schema version.' }),
  marketplace: Marketplace,
  sourceUrl: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: 'Public listing URL for the selected marketplace.',
  }),
  count: Schema.Int.pipe(Schema.between(1, DEFAULT_MAX_GENERATION_COUNT)).annotations({
    description: 'Number of generated assets requested.',
  }),
  prompt: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: 'Art-direction prompt for the generated asset set.',
  }),
}).annotations({ description: 'Versioned public marketplace generation request.' });
export type MarketplaceGenerationRequest = typeof MarketplaceGenerationRequest.Type;

/** True when `value` is an `https://apps.apple.com/.../id<number>` URL. */
const isAppStoreUrl = (value: string): boolean => {
  if (!URL.canParse(value)) {
    return false;
  }

  const url = new URL(value);
  return (
    url.protocol === 'https:' && url.hostname === 'apps.apple.com' && /\/id\d+/.test(url.pathname)
  );
};

/**
 * App Store listing URL, validated to the Apple `.../id<number>` shape.
 * @returns a validated Apple App Store listing URL.
 * @example
 * Schema.decodeUnknownSync(AppStoreUrl)('https://apps.apple.com/us/app/example/id123');
 * Used by: generation and public-demo create requests.
 */
export const AppStoreUrl = Schema.String.pipe(
  Schema.filter(isAppStoreUrl, {
    message: () => 'App Store URL must be an https://apps.apple.com/.../id<number> URL.',
  }),
).annotations({
  description: 'App Store listing URL (https://apps.apple.com/.../id<number>)',
});

/**
 * `POST /generations` request body.
 * @returns a decoded generation request with `count` defaulted to 4.
 * @example
 * Schema.decodeUnknownSync(GenerationCreate)({
 *   appStoreUrl: 'https://apps.apple.com/app/id123',
 *   prompt: 'Bold headlines, real UI',
 * });
 * Used by: worker generation controller and CLI generation command.
 */
export const GenerationCreate = Schema.Struct({
  request: Schema.optional(MarketplaceGenerationRequest).annotations({
    description: 'Versioned marketplace request replacing the legacy App Store/upload shape.',
  }),
  appStoreUrl: Schema.optional(AppStoreUrl).annotations({
    description: 'Optional App Store listing URL to scrape screenshots from',
  }),
  count: Schema.optionalWith(Schema.Int.pipe(Schema.between(1, DEFAULT_MAX_GENERATION_COUNT)), {
    default: () => 4,
  }).annotations({
    description: 'Number of panels to generate, defaulting to four',
  }),
  uploadedAssetIds: Schema.optional(
    Schema.Array(UploadedAssetId.pipe(Schema.minLength(3), Schema.maxLength(80))).pipe(
      Schema.maxItems(DEFAULT_MAX_GENERATION_COUNT),
    ),
  ).annotations({
    description: 'Optional uploaded source asset identifiers used instead of an App Store URL',
  }),
  prompt: Schema.optionalWith(Schema.String.pipe(Schema.minLength(1)), {
    default: () => 'Generate marketplace-ready assets from the provided source.',
  }).annotations({
    description: 'Art-direction prompt for the set',
  }),
})
  .pipe(
    Schema.filter((value) =>
      value.request !== undefined ||
      value.appStoreUrl !== undefined ||
      (value.uploadedAssetIds !== undefined && value.uploadedAssetIds.length > 0)
        ? undefined
        : 'Either appStoreUrl or uploadedAssetIds is required.',
    ),
  )
  .annotations({ description: 'POST /generations request body' });
export type GenerationCreate = typeof GenerationCreate.Type;
export type GenerationCreateInput = typeof GenerationCreate.Type;

/** One generated image as reported on the wire. */
const GenerationOutput = Schema.Struct({
  id: OutputId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Identifier of the generated output asset',
  }),
  index: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: 'Zero-based panel index in the set',
  }),
  status: Schema.Literal(...OUTPUT_STATUSES).annotations({
    description: 'Terminal status of this output',
  }),
  url: Schema.NullOr(Schema.String).annotations({
    description: 'Signed download URL, or null when unavailable',
  }),
  expiresAt: Schema.NullOr(Schema.String).annotations({
    description: 'ISO expiry of the signed URL, or null',
  }),
}).annotations({ description: 'One generated image on a generation job' });

/**
 * `GET /generations/:id` response body.
 * @returns the public status payload for a generation job.
 * @example
 * Schema.decodeUnknownSync(GenerationStatus)(payload);
 * Used by: worker generation view and CLI polling.
 */
export const GenerationStatus = Schema.Struct({
  jobId: JobId.annotations({ description: 'Generation job id' }),
  status: Schema.Literal(...JOB_STATUSES).annotations({
    description: 'Lifecycle status of the job',
  }),
  requestedCount: Schema.Int.annotations({ description: 'Panels requested' }),
  succeededCount: Schema.Int.annotations({ description: 'Panels that succeeded' }),
  failedCount: Schema.Int.annotations({ description: 'Panels that failed' }),
  creditsReserved: Schema.Int.annotations({ description: 'Credits held for this job' }),
  creditsSpent: Schema.Int.annotations({ description: 'Credits charged for successes' }),
  creditsReleased: Schema.Int.annotations({ description: 'Credits released on failure' }),
  outputs: Schema.Array(GenerationOutput).annotations({
    description: 'Per-panel outputs with signed URLs when ready',
  }),
  error: Schema.NullOr(
    Schema.Struct({
      code: Schema.String.annotations({ description: 'Machine error code' }),
      message: Schema.String.annotations({ description: 'Human-readable error message' }),
    }).annotations({ description: 'Job-level error when status is failed' }),
  ).annotations({
    description: 'Job-level error details, or null when no job error is present',
  }),
  createdAt: Schema.String.annotations({ description: 'ISO created timestamp' }),
  updatedAt: Schema.String.annotations({ description: 'ISO updated timestamp' }),
  deletedAt: Schema.NullOr(Schema.String).annotations({
    description: 'ISO soft-delete timestamp, or null',
  }),
}).annotations({ description: 'GET /generations/:id response body' });
export type GenerationStatus = typeof GenerationStatus.Type;
export type GenerationStatusResponse = typeof GenerationStatus.Type;

/**
 * One row in the dashboard conversation / job list.
 * @example
 * Schema.decodeUnknownSync(GenerationListItem)(row);
 * Used by: GET /dashboard/generations and the chat sidebar.
 */
export const GenerationListItem = Schema.Struct({
  jobId: JobId.annotations({ description: 'Generation job id' }),
  status: Schema.Literal(...JOB_STATUSES).annotations({
    description: 'Lifecycle status of the job',
  }),
  title: Schema.String.annotations({ description: 'Short title derived from the user prompt' }),
  prompt: Schema.String.annotations({ description: 'User art-direction prompt' }),
  requestedCount: Schema.Int.annotations({ description: 'Panels requested' }),
  appStoreUrl: Schema.NullOr(Schema.String).annotations({
    description: 'Optional App Store URL used as a source',
  }),
  createdAt: Schema.String.annotations({ description: 'ISO created timestamp' }),
  updatedAt: Schema.String.annotations({ description: 'ISO updated timestamp' }),
}).annotations({ description: 'One generation job summary for the dashboard list' });
export type GenerationListItem = typeof GenerationListItem.Type;

/** `GET /dashboard/generations` response body. */
export const GenerationListResponse = Schema.Struct({
  items: Schema.Array(GenerationListItem).annotations({
    description: 'Newest-first generation jobs for the signed-in user',
  }),
}).annotations({ description: 'GET /dashboard/generations response body' });
export type GenerationListResponse = typeof GenerationListResponse.Type;

/**
 * `POST /uploads/presign` request body.
 * @returns a validated file upload request for one source asset.
 * @example
 * Schema.decodeUnknownSync(UploadPresign)({
 *   filename: 'screen.png',
 *   contentType: 'image/png',
 *   byteSize: 120_000,
 * });
 * Used by: worker upload route and CLI upload path.
 */
export const UploadPresign = Schema.Struct({
  filename: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(180)).annotations({
    description: 'Original filename for the upload',
  }),
  contentType: Schema.Literal('image/png', 'image/jpeg', 'image/webp').annotations({
    description: 'MIME type of the file body',
  }),
  byteSize: Schema.Int.pipe(Schema.between(1, 50 * 1024 * 1024)).annotations({
    description: 'Exact byte length of the file (1 B – 50 MiB)',
  }),
}).annotations({ description: 'POST /uploads/presign request body' });
export type UploadPresign = typeof UploadPresign.Type;
export type UploadPresignInput = typeof UploadPresign.Type;

/**
 * `POST /uploads/presign` response body.
 * @returns the signed upload URL and required request headers.
 * @example
 * Schema.decodeUnknownSync(UploadPresignResponse)(payload);
 * Used by: worker upload route and CLI uploader.
 */
export const UploadPresignResponse = Schema.Struct({
  assetId: UploadedAssetId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Uploaded asset identifier to pass into a generation request',
  }),
  uploadUrl: Schema.String.annotations({ description: 'Presigned URL for HTTP PUT' }),
  expiresAt: Schema.String.annotations({ description: 'ISO expiry of the presigned URL' }),
  headers: Schema.Record({ key: Schema.String, value: Schema.String }).annotations({
    description: 'Headers that must be sent with the PUT',
  }),
}).annotations({ description: 'POST /uploads/presign response body' });
export type UploadPresignResponse = typeof UploadPresignResponse.Type;
