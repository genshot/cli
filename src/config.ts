import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { ApiKeyMode } from '@genshot/shared/auth';
import { Either, Schema } from 'effect';
import { cliError } from '#cli/errors.ts';

/**
 * Persisted CLI credentials, written to `~/.genshot/config.json` (mode 0600) by
 * `genshot login`. Holds the single `gsk_` API key plus the identity it was
 * minted for, so later commands authenticate offline without re-verifying email.
 * `apiUrl` is captured at login so a key minted against staging keeps talking to
 * staging on every later command.
 */
export const GenshotConfig = Schema.Struct({
  apiKey: Schema.String.annotations({
    description: 'Long-lived gsk_ bearer credential used by public CLI requests',
  }),
  apiKeyId: Schema.String.annotations({
    description: 'Worker API-key identifier associated with the stored credential',
  }),
  apiUrl: Schema.String.annotations({
    description: 'Worker base URL against which the credential was minted',
  }),
  email: Schema.String.annotations({
    description: 'Account email address that owns the stored CLI credential',
  }),
  mode: ApiKeyMode.annotations({
    description: 'Live or test operating mode of the stored API key',
  }),
  userId: Schema.String.annotations({
    description: 'Beta-user identifier that owns the stored CLI credential',
  }),
}).annotations({
  description: 'Persisted public-CLI credential and worker endpoint configuration',
});
export type GenshotConfig = typeof GenshotConfig.Type;

const DEFAULT_API_URL = 'https://api.genshot.dev';
const decodeGenshotConfig = Schema.decodeUnknownEither(GenshotConfig);

/**
 * Resolves the credential-file location used by login and all authenticated commands.
 * Tests override it to avoid touching the user's home directory.
 *
 * @returns Absolute path to the active CLI configuration file.
 * @example
 * const path = configPath();
 */
export const configPath = (): string =>
  process.env.GENSHOT_CONFIG_PATH === undefined
    ? join(homedir(), '.genshot', 'config.json')
    : process.env.GENSHOT_CONFIG_PATH;

/**
 * Resolves the Worker URL used before login has persisted an environment-specific endpoint.
 * Login commands use the override for local and staging authentication.
 *
 * @returns Default Worker base URL for public CLI API requests.
 * @example
 * const apiUrl = defaultApiUrl();
 */
export const defaultApiUrl = (): string =>
  process.env.GENSHOT_API_URL === undefined ? DEFAULT_API_URL : process.env.GENSHOT_API_URL;

/**
 * Reads and validates the credential file for account and generation commands.
 * Missing configuration is represented as null, while malformed credentials fail explicitly.
 *
 * @returns Decoded CLI configuration, or null before the first login.
 * @example
 * const config = await loadConfig();
 */
export const loadConfig = async (): Promise<GenshotConfig | null> =>
  readFile(configPath(), 'utf8').then(
    (raw) => {
      const decoded = decodeGenshotConfig(JSON.parse(raw));
      if (Either.isRight(decoded)) {
        return decoded.right;
      }
      return Promise.reject(cliError('Stored genshot config is invalid. Run `genshot login`.'));
    },
    (error: unknown) => {
      if (isNotFound(error)) {
        return null;
      }
      return Promise.reject(error);
    },
  );

/**
 * Persists login credentials with owner-only permissions for subsequent CLI commands.
 * The login flow calls this only after the Worker has returned a validated key payload.
 *
 * @param config - Validated credential and Worker endpoint configuration.
 * @returns Promise that completes after the file is written and locked to mode 0600.
 * @example
 * await saveConfig(loginResult);
 */
export const saveConfig = async (config: GenshotConfig): Promise<void> => {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await chmod(path, 0o600);
};

/**
 * Deletes stored credentials for the logout command without failing when already signed out.
 *
 * @returns Promise that completes once the credential file is absent.
 * @example
 * await clearConfig();
 */
export const clearConfig = async (): Promise<void> => {
  await rm(configPath(), { force: true });
};

/**
 * Requires stored credentials at authenticated-command boundaries.
 * Account, buy, and generate commands use the actionable error to direct first-time users.
 *
 * @returns Validated CLI configuration for an authenticated command.
 * @example
 * const config = await requireConfig();
 */
export const requireConfig = async (): Promise<GenshotConfig> => {
  const config = await loadConfig();
  if (!config) {
    return Promise.reject(cliError('Not signed in. Run `genshot login` first.'));
  }
  return config;
};

/** Treat a missing config file (ENOENT) as "no credentials", not a hard error. */
const isNotFound = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';
