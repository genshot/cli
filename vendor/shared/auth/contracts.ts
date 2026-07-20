import { UserId } from '@genshot/shared/account/identity';
import { Schema } from 'effect';

/**
 * Branded identifier for an `api_keys` row.
 * @returns a schema branding a plain string as `ApiKeyId`.
 * @example
 * Schema.decodeUnknownSync(ApiKeyId)('key_abc');
 * Used by: authenticated worker context and API-key audit records.
 */
export const ApiKeyId = Schema.String.pipe(Schema.brand('ApiKeyId')).annotations({
  description: 'Branded identifier for a persisted API key',
});
export type ApiKeyId = typeof ApiKeyId.Type;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email address, trimmed and lowercased on decode.
 * @returns a normalized email string.
 * @example
 * Schema.decodeUnknownSync(Email)('  DEV@example.com ');
 * Used by: auth OTP and account admin contracts.
 */
export const Email = Schema.transform(
  Schema.String.pipe(
    Schema.filter((value) => emailPattern.test(value.trim()), {
      message: () => 'Enter a valid email address.',
    }),
  ),
  Schema.String,
  { strict: true, decode: (value) => value.trim().toLowerCase(), encode: (value) => value },
).annotations({ description: 'Normalized email address used for account authentication' });

/**
 * Six-digit login code, trimmed on decode.
 * @returns the normalized OTP string.
 * @example
 * Schema.decodeUnknownSync(OtpCode)(' 123456 ');
 * Used by: email OTP verification.
 */
export const OtpCode = Schema.transform(
  Schema.String,
  Schema.String.pipe(Schema.pattern(/^\d{6}$/)),
  { strict: true, decode: (value) => value.trim(), encode: (value) => value },
).annotations({ description: 'Normalized six-digit email login code' });

/**
 * API-key mode carried by minted keys.
 * @returns either `test` or `live`.
 * @example
 * Schema.decodeUnknownSync(ApiKeyMode)('live');
 * Used by: auth, admin user creation, and platform key rows.
 */
export const ApiKeyMode = Schema.Literal('test', 'live').annotations({
  description: 'Operating mode for a minted API key',
});
export type ApiKeyMode = typeof ApiKeyMode.Type;

/**
 * `POST /auth/email/start` request body.
 * @returns a normalized email start request.
 * @example
 * Schema.decodeUnknownSync(EmailOtpStart)({ email: 'dev@example.com' });
 * Used by: worker auth service and CLI login.
 */
export const EmailOtpStart = Schema.Struct({
  email: Email.annotations({ description: 'Email address that will receive the login code' }),
}).annotations({ description: 'POST /auth/email/start request body' });
export type EmailOtpStart = typeof EmailOtpStart.Type;
export type EmailOtpStartInput = typeof EmailOtpStart.Type;

/**
 * `POST /auth/email/start` response body.
 * @returns expiry and resend timing for the issued OTP.
 * @example
 * Schema.decodeUnknownSync(EmailOtpStartResponse)({
 *   email: 'dev@example.com',
 *   expiresInSeconds: 600,
 *   resendAfterSeconds: 30,
 * });
 * Used by: worker auth service and CLI login.
 */
export const EmailOtpStartResponse = Schema.Struct({
  email: Email.annotations({ description: 'Normalized email address receiving the login code' }),
  expiresInSeconds: Schema.Int.pipe(Schema.greaterThan(0)).annotations({
    description: 'Seconds until the issued login code expires',
  }),
  resendAfterSeconds: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: 'Seconds before another login code may be requested',
  }),
  devCode: Schema.optional(Schema.String).annotations({
    description: 'Development-only login code when local disclosure is enabled',
  }),
}).annotations({ description: 'POST /auth/email/start response body' });
export type EmailOtpStartResponse = typeof EmailOtpStartResponse.Type;

/**
 * `POST /auth/email/verify` request body.
 * @returns a normalized verify request with `mode` defaulted to `live`.
 * @example
 * Schema.decodeUnknownSync(EmailOtpVerify)({
 *   email: 'dev@example.com',
 *   code: '123456',
 * });
 * Used by: worker auth service and CLI login.
 */
export const EmailOtpVerify = Schema.Struct({
  email: Email.annotations({ description: 'Email address associated with the login code' }),
  code: OtpCode.annotations({ description: 'Six-digit login code sent to the email address' }),
  mode: Schema.optionalWith(ApiKeyMode, { default: () => 'live' as const }).annotations({
    description: 'API-key mode to mint after verification, defaulting to live',
  }),
}).annotations({ description: 'POST /auth/email/verify request body' });
export type EmailOtpVerify = typeof EmailOtpVerify.Type;
export type EmailOtpVerifyInput = typeof EmailOtpVerify.Type;

/**
 * `POST /auth/email/verify` response body.
 * @returns the minted API key plus account balance metadata.
 * @example
 * Schema.decodeUnknownSync(EmailOtpVerifyResponse)(payload);
 * Used by: worker auth service and CLI login.
 */
export const EmailOtpVerifyResponse = Schema.Struct({
  userId: UserId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Authenticated user account identifier',
  }),
  email: Email.annotations({ description: 'Authenticated normalized email address' }),
  apiKey: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: 'Plaintext API key returned once for immediate storage',
  }),
  apiKeyId: ApiKeyId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Identifier of the persisted API key',
  }),
  mode: ApiKeyMode.annotations({ description: 'Operating mode of the minted API key' }),
  balance: Schema.Int.annotations({ description: 'Spendable credit balance after login' }),
  created: Schema.Boolean.annotations({
    description: 'Whether verification created a new user account',
  }),
}).annotations({ description: 'POST /auth/email/verify response body' });
export type EmailOtpVerifyResponse = typeof EmailOtpVerifyResponse.Type;

/**
 * `POST /auth/cli/device/start` request body.
 * @returns a device-auth start request with `mode` defaulted to `live`.
 * Used by: worker CLI device auth and `genshot login` browser flow.
 */
export const CliDeviceStart = Schema.Struct({
  mode: Schema.optionalWith(ApiKeyMode, { default: () => 'live' as const }).annotations({
    description: 'API-key mode to mint after Google OAuth (`live` or `test`)',
  }),
}).annotations({ description: 'POST /auth/cli/device/start request body' });
export type CliDeviceStart = typeof CliDeviceStart.Type;
export type CliDeviceStartInput = typeof CliDeviceStart.Type;

/**
 * `POST /auth/cli/device/start` response body.
 * @returns device/user codes, verification URL, and poll timing.
 * Used by: worker CLI device auth and `genshot login` browser flow.
 */
export const CliDeviceStartResponse = Schema.Struct({
  deviceCode: Schema.String.pipe(Schema.minLength(16)).annotations({
    description: 'Secret device code the CLI polls with (never display to the user)',
  }),
  userCode: Schema.String.pipe(Schema.minLength(4)).annotations({
    description: 'Short user code shown in the terminal (also embedded in verificationUrl)',
  }),
  verificationUrl: Schema.String.pipe(Schema.minLength(8)).annotations({
    description: 'Browser URL that starts Google OAuth for this device login',
  }),
  expiresIn: Schema.Int.pipe(Schema.greaterThan(0)).annotations({
    description: 'Seconds until the device code expires',
  }),
  interval: Schema.Int.pipe(Schema.greaterThan(0)).annotations({
    description: 'Minimum seconds the CLI should wait between poll attempts',
  }),
}).annotations({ description: 'POST /auth/cli/device/start response body' });
export type CliDeviceStartResponse = typeof CliDeviceStartResponse.Type;

/**
 * `POST /auth/cli/device/poll` request body.
 * @returns a poll request carrying the secret device code.
 * Used by: worker CLI device auth and `genshot login` browser flow.
 */
export const CliDevicePoll = Schema.Struct({
  deviceCode: Schema.String.pipe(Schema.minLength(16)).annotations({
    description: 'Secret device code issued by /auth/cli/device/start',
  }),
}).annotations({ description: 'POST /auth/cli/device/poll request body' });
export type CliDevicePoll = typeof CliDevicePoll.Type;
export type CliDevicePollInput = typeof CliDevicePoll.Type;

/**
 * Pending poll response while the user has not finished Google OAuth.
 * @returns `{ status: 'pending' }`.
 * Used by: worker CLI device auth and `genshot login` browser flow.
 */
export const CliDevicePollPending = Schema.Struct({
  status: Schema.Literal('pending').annotations({
    description: 'User has not finished browser OAuth yet',
  }),
}).annotations({ description: 'CLI device poll still waiting for browser OAuth' });
export type CliDevicePollPending = typeof CliDevicePollPending.Type;

/**
 * Completed poll response: minted `gsk_` key plus account metadata (OTP verify shape).
 * @returns the one-time API key payload after a successful browser OAuth.
 * @example
 * Schema.decodeUnknownSync(CliDevicePollComplete)(payload);
 * Used by: worker CLI device auth and `genshot login` browser flow.
 */
export const CliDevicePollComplete = Schema.Struct({
  status: Schema.Literal('complete').annotations({
    description: 'Browser OAuth finished; API key is included once',
  }),
  userId: UserId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Authenticated user id',
  }),
  email: Email.annotations({ description: 'Authenticated email (from Google)' }),
  apiKey: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: 'Plaintext `gsk_` API key (shown once; store immediately)',
  }),
  apiKeyId: ApiKeyId.pipe(Schema.minLength(3), Schema.maxLength(80)).annotations({
    description: 'Persisted API key id',
  }),
  mode: ApiKeyMode.annotations({ description: 'Minted key mode' }),
  balance: Schema.Int.annotations({ description: 'Credit balance after login' }),
  created: Schema.Boolean.annotations({
    description: 'True when this login created the user account',
  }),
}).annotations({
  description: 'CLI device poll complete — same identity fields as email OTP verify',
});
export type CliDevicePollComplete = typeof CliDevicePollComplete.Type;

/**
 * `POST /auth/cli/device/poll` response body.
 * @returns either still-pending or a one-time completed key payload.
 * Used by: worker CLI device auth and `genshot login` browser flow.
 */
export const CliDevicePollResponse = Schema.Union(
  CliDevicePollPending,
  CliDevicePollComplete,
).annotations({
  description: 'POST /auth/cli/device/poll response body',
});
export type CliDevicePollResponse = typeof CliDevicePollResponse.Type;

/**
 * Authenticated dashboard user carried by `GET /auth/me`.
 * @returns the stable dashboard user payload.
 * @example
 * Schema.decodeUnknownSync(DashboardAuthUser)(payload.user);
 * Used by: worker OAuth/session routes and web dashboard state.
 */
export const DashboardAuthUser = Schema.Struct({
  id: UserId.annotations({ description: 'Authenticated dashboard user identifier' }),
  email: Schema.String.annotations({ description: 'Email address shown in the dashboard' }),
  displayName: Schema.NullOr(Schema.String).annotations({
    description: 'Display name from the identity provider, or null when unavailable',
  }),
  avatarUrl: Schema.NullOr(Schema.String).annotations({
    description: 'Avatar URL from the identity provider, or null when unavailable',
  }),
  creditBalance: Schema.Int.annotations({ description: 'Current spendable credit balance' }),
}).annotations({ description: 'Authenticated dashboard user payload' });
export type DashboardAuthUser = typeof DashboardAuthUser.Type;

/**
 * `GET /auth/me` response.
 * @returns a signed-in session or the signed-out sentinel.
 * @example
 * Schema.decodeUnknownSync(DashboardAuthMe)({ authenticated: false, user: null, session: null });
 * Used by: worker OAuth/session routes and web dashboard state.
 */
export const DashboardAuthMe = Schema.Union(
  Schema.Struct({
    authenticated: Schema.Literal(true).annotations({
      description: 'Indicates that the dashboard session is authenticated',
    }),
    user: DashboardAuthUser.annotations({ description: 'Authenticated dashboard user details' }),
    session: Schema.Struct({
      expiresAt: Schema.String.annotations({
        description: 'ISO timestamp when the dashboard session expires',
      }),
    }).annotations({ description: 'Authenticated dashboard session metadata' }),
  }).annotations({ description: 'Authenticated GET /auth/me response variant' }),
  Schema.Struct({
    authenticated: Schema.Literal(false).annotations({
      description: 'Indicates that no dashboard session is authenticated',
    }),
    user: Schema.Null.annotations({
      description: 'Null user sentinel for an unauthenticated dashboard request',
    }),
    session: Schema.Null.annotations({
      description: 'Null session sentinel for an unauthenticated dashboard request',
    }),
  }).annotations({ description: 'Unauthenticated GET /auth/me response variant' }),
).annotations({ description: 'GET /auth/me response body' });
export type DashboardAuthMe = typeof DashboardAuthMe.Type;
export type DashboardAuthMeResponse = typeof DashboardAuthMe.Type;
