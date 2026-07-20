import {
  type ApiKeyMode,
  CliDevicePollResponse,
  CliDeviceStartResponse,
  EmailOtpStartResponse,
  EmailOtpVerifyResponse,
} from '@genshot/shared/auth';
import {
  CheckoutCreateResponse,
  type CreditPackId,
  CreditsBalanceResponse,
} from '@genshot/shared/billing';
import {
  type GenerationCreate,
  GenerationCreateAck,
  GenerationStatus,
  type GenerationStatusResponse,
  type UploadPresignInput,
  UploadPresignResponse,
} from '@genshot/shared/generation';
import { Either, Schema } from 'effect';

import { cliError } from '#cli/errors.ts';

/**
 * Connection details for a single API call: which worker to reach (`apiUrl`),
 * the `gsk_` bearer token when the route needs auth, and an injectable `fetch`
 * so tests can stub the network. Built by each command from the stored config.
 */
export interface ApiOptions {
  apiKey?: string;
  apiUrl: string;
  fetchImpl?: typeof fetch;
}

type ResponseSchema<T, I> = Schema.Schema<T, I, never>;
const decodeApiErrorResponse = Schema.decodeUnknownEither(
  Schema.Struct({
    error: Schema.optional(Schema.String).annotations({
      description: 'Optional stable Worker error code returned to the public CLI',
    }),
    message: Schema.optional(Schema.String).annotations({
      description: 'Optional human-readable Worker error message preferred by the CLI',
    }),
  }).annotations({ description: 'Worker error response consumed by public CLI commands' }),
);

/**
 * Starts the headless email-code login fallback against the public Worker API.
 * The login command uses it when browser device authorization is unavailable.
 *
 * @param options - Worker connection details and optional injectable fetch implementation.
 * @param email - Account email address that should receive the one-time code.
 * @returns Worker acknowledgement describing code expiry and retry timing.
 * @example
 * const started = await startEmailOtp(options, 'dev@example.com');
 */
export const startEmailOtp = (options: ApiOptions, email: string): Promise<EmailOtpStartResponse> =>
  apiRequest(options, 'POST', '/auth/email/start', EmailOtpStartResponse, { email });

/**
 * Verifies a headless email code and returns the API key persisted by the login command.
 * Keeping this response Schema-decoded prevents malformed credentials from reaching disk.
 *
 * @param options - Worker connection details and optional injectable fetch implementation.
 * @param input - Email, one-time code, and requested API-key mode.
 * @returns Authenticated identity and newly minted public-CLI credential.
 * @example
 * const verified = await verifyEmailOtp(options, { email: 'dev@example.com', code: '123456', mode: 'live' });
 */
export const verifyEmailOtp = (
  options: ApiOptions,
  input: { code: string; email: string; mode: ApiKeyMode },
): Promise<EmailOtpVerifyResponse> =>
  apiRequest(options, 'POST', '/auth/email/verify', EmailOtpVerifyResponse, input);

/**
 * Start CLI browser/device OAuth (`POST /auth/cli/device/start`).
 * The login command opens the verification URL before polling with {@link pollCliDevice}.
 *
 * @param options - API connection details.
 * @param input - Optional key mode (`live` default).
 * @returns Device code, user code, verification URL, and poll timing.
 * @example
 * const device = await startCliDevice(options, { mode: 'live' });
 */
export const startCliDevice = (
  options: ApiOptions,
  input: { mode?: ApiKeyMode } = {},
): Promise<CliDeviceStartResponse> =>
  apiRequest(options, 'POST', '/auth/cli/device/start', CliDeviceStartResponse, input);

/**
 * Poll CLI device OAuth until a one-time `gsk_` key is ready.
 * The login command persists only the completed, Schema-decoded key payload.
 *
 * @param options - API connection details.
 * @param input - Secret device code from {@link startCliDevice}.
 * @returns Pending sentinel or completed key payload.
 * @example
 * const status = await pollCliDevice(options, { deviceCode: device.deviceCode });
 */
export const pollCliDevice = (
  options: ApiOptions,
  input: { deviceCode: string },
): Promise<CliDevicePollResponse> =>
  apiRequest(options, 'POST', '/auth/cli/device/poll', CliDevicePollResponse, input);

/**
 * Loads the authenticated account's credit balance for account and generation commands.
 * The shared response Schema keeps terminal output aligned with the Worker contract.
 *
 * @param options - Authenticated Worker connection details.
 * @returns Current user identifier and spendable credit balance.
 * @example
 * const credits = await getCredits(options);
 */
export const getCredits = (options: ApiOptions): Promise<CreditsBalanceResponse> =>
  apiRequest(options, 'GET', '/credits', CreditsBalanceResponse);

/**
 * Creates a Lemon Squeezy checkout URL for the buy command.
 * The command opens the returned URL only after this boundary validates the Worker response.
 *
 * @param options - Authenticated Worker connection details.
 * @param input - Selected credit pack and optional post-checkout return URL.
 * @returns Validated hosted-checkout response.
 * @example
 * const checkout = await createCheckout(options, { packId: 'image_credits_10' });
 */
export const createCheckout = (
  options: ApiOptions,
  input: { packId: CreditPackId; returnUrl?: string },
): Promise<CheckoutCreateResponse> =>
  apiRequest(options, 'POST', '/billing/checkout', CheckoutCreateResponse, input);

/**
 * Queues a generation request for the generate command and validates its acknowledgement.
 * The replay flag lets the command report when idempotency reused an existing job.
 *
 * @param options - Authenticated Worker connection details.
 * @param body - Listing or uploaded-asset generation request.
 * @returns Queued job identity, initial status, and idempotent-replay marker.
 * @example
 * const created = await createGeneration(options, { appStoreUrl, count: 4, prompt });
 */
export const createGeneration = (
  options: ApiOptions,
  body: GenerationCreate,
): Promise<GenerationCreateAck> =>
  apiRequest(options, 'POST', '/generations', GenerationCreateAck, body);

/**
 * Reads one generation job while the generate command polls for terminal status.
 * Shared Schema decoding protects progress rendering from malformed Worker payloads.
 *
 * @param options - Authenticated Worker connection details.
 * @param jobId - Generation job identifier returned by {@link createGeneration}.
 * @returns Validated generation status response.
 * @example
 * const generation = await getGeneration(options, created.jobId);
 */
export const getGeneration = (
  options: ApiOptions,
  jobId: string,
): Promise<GenerationStatusResponse> =>
  apiRequest(options, 'GET', `/generations/${jobId}`, GenerationStatus);

/**
 * Requests a presigned R2 upload target for generate-command source assets.
 * The CLI validates the target before sending user bytes to object storage.
 *
 * @param options - Authenticated Worker connection details.
 * @param input - Upload filename, media type, and byte size.
 * @returns Validated asset identifier, upload URL, headers, and expiry.
 * @example
 * const target = await presignUpload(options, uploadInput);
 */
export const presignUpload = (
  options: ApiOptions,
  input: UploadPresignInput,
): Promise<UploadPresignResponse> =>
  apiRequest(options, 'POST', '/uploads/presign', UploadPresignResponse, input);

/**
 * Uploads source bytes directly to a presigned R2 URL for the generate command.
 * Authentication stays in the presigned query string, so Worker API credentials are not forwarded.
 *
 * @param uploadUrl - Presigned R2 HTTP PUT target.
 * @param bytes - Raw source-asset bytes.
 * @param headers - Required media and signing headers returned by {@link presignUpload}.
 * @param fetchImpl - Optional injectable fetch implementation used by tests.
 * @returns Promise that completes only after R2 accepts the upload.
 * @example
 * await putUpload(target.uploadUrl, bytes, target.headers);
 */
export const putUpload = async (
  uploadUrl: string,
  bytes: Uint8Array,
  headers: Record<string, string>,
  fetchImpl?: typeof fetch,
): Promise<void> => {
  const doFetch = fetchImpl === undefined ? fetch : fetchImpl;
  const response = await doFetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: bytes,
  });
  if (!response.ok) {
    return Promise.reject(cliError(await errorMessage(response)));
  }
};

/**
 * Issue one JSON request against `/api/v1`, attaching auth + content-type as
 * needed, and validate the success body with the supplied schema. Any non-2xx
 * response is surfaced as a `CliError` carrying the worker's `message`.
 */
const apiRequest = async <T, I>(
  options: ApiOptions,
  method: string,
  path: string,
  schema: ResponseSchema<T, I>,
  body?: unknown,
): Promise<T> => {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const doFetch = options.fetchImpl === undefined ? fetch : options.fetchImpl;
  const response = await doFetch(`${options.apiUrl}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    return Promise.reject(cliError(await errorMessage(response)));
  }
  const json: unknown = await response.json();
  const decoded = Schema.decodeUnknownEither(schema)(json);
  if (Either.isRight(decoded)) {
    return decoded.right;
  }
  return Promise.reject(cliError('Unexpected response from the API.'));
};

/** Pull the human-readable error out of the worker's `{ error, message }` body, falling back to the status line. */
const errorMessage = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().then(
    (value: unknown) => value,
    () => undefined,
  );
  const decoded = decodeApiErrorResponse(body);
  if (Either.isRight(decoded) && decoded.right.message !== undefined) {
    return decoded.right.message;
  }
  if (Either.isRight(decoded) && decoded.right.error !== undefined) {
    return decoded.right.error;
  }
  return `${response.status} ${response.statusText}`.trim();
};
