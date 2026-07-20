import type { Command } from 'commander';

import { pollCliDevice, startCliDevice, startEmailOtp, verifyEmailOtp } from '#cli/api.ts';
import { openBrowser } from '#cli/browser.ts';
import { configPath, defaultApiUrl, saveConfig } from '#cli/config.ts';
import { cliError } from '#cli/errors.ts';
import * as ui from '#cli/ui.ts';
import { sleep } from '#cli/ui.ts';

type LoginCommandOptions = {
  apiUrl?: string;
  code?: string;
  email?: string;
  json?: boolean;
  open?: boolean;
  otp?: boolean;
  test?: boolean;
  timeout?: string;
};

const runLoginAction = async (options: LoginCommandOptions): Promise<void> => {
  const apiUrl = options.apiUrl === undefined ? defaultApiUrl() : options.apiUrl;
  const apiOptions = { apiUrl };
  const json = options.json === true;
  const mode = options.test ? 'test' : 'live';
  ui.startUi({ json });
  ui.introTag();

  const useOtp = options.otp === true || options.email !== undefined || options.code !== undefined;

  if (useOtp) {
    await loginWithEmailOtp({
      apiOptions,
      apiUrl,
      code: options.code,
      email: options.email,
      json,
      mode,
    });
    return;
  }

  try {
    await loginWithBrowserOAuth({
      apiOptions,
      apiUrl,
      json,
      mode,
      openBrowserTab: options.open !== false,
      timeoutSeconds: parseTimeoutSeconds(options.timeout),
    });
  } catch (error) {
    // When Google OAuth is not configured on the worker, fall back to email OTP.
    if (!isGoogleOAuthUnavailable(error)) {
      throw error;
    }
    ui.warn('Browser OAuth is unavailable on this API; falling back to email login.');
    await loginWithEmailOtp({
      apiOptions,
      apiUrl,
      code: undefined,
      email: undefined,
      json,
      mode,
    });
  }
};

/**
 * `genshot login` — store a `gsk_` API key for this machine.
 *
 * Default path (ADR-0025): browser Google OAuth via a device-code flow. The CLI
 * opens a verification URL, the user finishes Google sign-in, and the CLI polls
 * until a one-time key is ready.
 *
 * Secondary path: email OTP (`--email`, `--otp`, or `--code`).
 *
 * `--test` mints a test-mode key; `--api-url` targets a non-production worker;
 * `--json` prints exactly one success object (and keeps interactive UI silent).
 * @param program commander root program
 * @returns void; mutates the program by registering the command
 */
export const registerLogin = (program: Command): void => {
  program
    .command('login')
    .description('Sign in (browser OAuth by default) and store an API key for this machine.')
    .option('--email <email>', 'use email OTP instead of browser OAuth')
    .option('--otp', 'use email OTP instead of browser OAuth')
    .option('--test', 'mint a test-mode key instead of a live key')
    .option('--api-url <url>', 'worker base URL (defaults to production)')
    .option('--code <code>', 'verify a 6-digit email OTP you already received')
    .option('--no-open', 'print the browser URL instead of opening it')
    .option('--json', 'print machine-readable JSON on success')
    .option('--timeout <seconds>', 'max seconds to wait for browser OAuth', '900')
    .action(runLoginAction);
};

const loginWithBrowserOAuth = async (input: {
  readonly apiOptions: { apiUrl: string };
  readonly apiUrl: string;
  readonly json: boolean;
  readonly mode: 'live' | 'test';
  readonly openBrowserTab: boolean;
  readonly timeoutSeconds: number;
}): Promise<void> => {
  const started = await startCliDevice(input.apiOptions, { mode: input.mode });
  const intervalMs = Math.max(1, started.interval) * 1000;
  const deadline = Date.now() + Math.min(input.timeoutSeconds, started.expiresIn) * 1000;

  if (input.openBrowserTab) {
    openBrowser(started.verificationUrl);
    ui.message(`Opened browser sign-in. If nothing opened, visit:\n  ${started.verificationUrl}`);
  } else {
    ui.message(`Open this URL to sign in:\n  ${started.verificationUrl}`);
  }
  ui.info(`Confirm code: ${started.userCode}`);

  const spinner = ui.spinner();
  spinner.start('Waiting for browser sign-in');

  while (Date.now() < deadline) {
    const polled = await pollCliDevice(input.apiOptions, { deviceCode: started.deviceCode });
    if (polled.status === 'complete') {
      spinner.stop(`Signed in as ${polled.email}`);
      await saveConfig({
        apiKey: polled.apiKey,
        apiKeyId: polled.apiKeyId,
        apiUrl: input.apiUrl,
        email: polled.email,
        mode: polled.mode,
        userId: polled.userId,
      });
      finishLoginUi({
        balance: polled.balance,
        created: polled.created,
        email: polled.email,
        json: input.json,
        mode: polled.mode,
      });
      return;
    }
    spinner.update('Waiting for browser sign-in');
    await sleep(intervalMs);
  }

  spinner.stop('Browser sign-in timed out');
  throw cliError(
    'Browser sign-in timed out. Run `genshot login` again (or `genshot login --email`).',
  );
};

const loginWithEmailOtp = async (input: {
  readonly apiOptions: { apiUrl: string };
  readonly apiUrl: string;
  readonly code: string | undefined;
  readonly email: string | undefined;
  readonly json: boolean;
  readonly mode: 'live' | 'test';
}): Promise<void> => {
  const { apiOptions, apiUrl, json, mode } = input;
  let email =
    input.email === undefined
      ? await ui.prompt({
          message: 'Email address',
          placeholder: 'you@acme.com',
          validate: validateEmail,
        })
      : input.email;

  let { code } = input;
  if (code === undefined) {
    const start = await startEmailOtp(apiOptions, email);
    ({ email } = start);
    const minutes = Math.round(start.expiresInSeconds / 60);
    ui.info(`Sent a 6-digit code to ${start.email} (expires in ${minutes}m).`);
    code = await ui.prompt({
      message: 'Enter the 6-digit code',
      validate: validateCode,
    });
  }

  const result = await verifyEmailOtp(apiOptions, {
    email,
    code,
    mode,
  });

  await saveConfig({
    apiKey: result.apiKey,
    apiKeyId: result.apiKeyId,
    apiUrl,
    email: result.email,
    mode: result.mode,
    userId: result.userId,
  });

  finishLoginUi({
    balance: result.balance,
    created: result.created,
    email: result.email,
    json,
    mode: result.mode,
  });
};

const finishLoginUi = (input: {
  readonly balance: number;
  readonly created: boolean;
  readonly email: string;
  readonly json: boolean;
  readonly mode: 'live' | 'test';
}): void => {
  if (input.json) {
    ui.printJson({
      email: input.email,
      mode: input.mode,
      balance: input.balance,
      created: input.created,
      configPath: configPath(),
    });
    return;
  }

  ui.success(`Signed in as ${input.email}.`);
  if (input.created) {
    ui.message('Beta credits granted to your new account.');
  }
  ui.message(`Credit balance: ${input.balance}.`);
  ui.message(`API key (${input.mode}) stored at ${configPath()} (mode 0600).`);
  ui.outro('Ready — run `genshot generate` to create screenshots.');
};

/** Reject input that can't be an email so the prompt fails fast instead of the API. */
const validateEmail = (value: string): string | undefined =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? undefined : 'Enter a valid email address.';

/** Reject anything that isn't a 6-digit code before round-tripping to the worker. */
const validateCode = (value: string): string | undefined =>
  /^\d{6}$/.test(value.trim()) ? undefined : 'Enter the 6-digit code.';

const parseTimeoutSeconds = (raw: string | undefined): number => {
  if (raw === undefined) {
    return 900;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw cliError('--timeout must be a positive number of seconds.');
  }
  return Math.floor(parsed);
};

const isGoogleOAuthUnavailable = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('google oauth is not configured') ||
    message.includes('google_oauth_not_configured')
  );
};
