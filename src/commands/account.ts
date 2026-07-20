import type { ApiKeyMode } from '@genshot/shared/auth';
import type { Command } from 'commander';

import { getCredits } from '#cli/api.ts';
import { clearConfig, configPath, type GenshotConfig, requireConfig } from '#cli/config.ts';
import * as ui from '#cli/ui.ts';

/** Machine-readable identity for `whoami --json` (API key always redacted). */
export interface WhoamiJson {
  apiKey: string;
  apiUrl: string;
  configPath: string;
  email: string;
  mode: ApiKeyMode;
  userId: string;
}

/**
 * JSON payload for `balance --json` — the spendable balance only.
 * @param balance credit balance from `GET /credits`
 * @returns single-field object for the dual-mode `--json` contract
 * @example
 * balanceJson(10); // { balance: 10 }
 */
export const balanceJson = (balance: number): { balance: number } => ({ balance });

/**
 * Local identity payload for `whoami` (TTY note and `--json`).
 * Never includes the full raw API key — first 12 characters + ellipsis only.
 * @param config stored CLI credentials
 * @param path absolute path of the config file (injected so tests stay hermetic)
 * @returns redacted identity object
 * @example
 * whoamiJson(config, '/tmp/genshot-config.json');
 */
export const whoamiJson = (config: GenshotConfig, path: string): WhoamiJson => ({
  apiKey: `${config.apiKey.slice(0, 12)}…`,
  apiUrl: config.apiUrl,
  configPath: path,
  email: config.email,
  mode: config.mode,
  userId: config.userId,
});

const runBalance = async (json: boolean): Promise<void> => {
  const config = await requireConfig();
  const { balance } = await getCredits({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
  });
  ui.startUi({ json });
  if (json) {
    ui.printJson(balanceJson(balance));
    return;
  }
  ui.introTag();
  ui.outro(`Credit balance: ${balance}.`);
};

const runWhoami = async (json: boolean): Promise<void> => {
  const config = await requireConfig();
  const identity = whoamiJson(config, configPath());
  ui.startUi({ json });
  if (json) {
    ui.printJson(identity);
    return;
  }
  ui.introTag();
  ui.note(
    [
      `Email     ${identity.email}`,
      `User id   ${identity.userId}`,
      `Mode      ${identity.mode}`,
      `API key   ${identity.apiKey}`,
      `API URL   ${identity.apiUrl}`,
      `Config    ${identity.configPath}`,
    ].join('\n'),
    'Signed in',
  );
  ui.outro('This identity is stored locally — `genshot logout` to remove it.');
};

/**
 * Account/credential commands: `balance` (live credit balance from the worker),
 * `whoami` (the identity stored on this machine, fully offline), and `logout`
 * (delete the stored key).
 * @param program commander root program
 * @returns void; mutates the program by registering account commands
 */
export const registerAccount = (program: Command): void => {
  program
    .command('balance')
    .description('Show your current credit balance.')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: { json?: boolean }) => {
      await runBalance(options.json === true);
    });

  program
    .command('whoami')
    .description('Show the signed-in account stored on this machine.')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: { json?: boolean }) => {
      await runWhoami(options.json === true);
    });

  program
    .command('logout')
    .description('Delete the stored API key from this machine.')
    .action(async () => {
      await clearConfig();
      ui.startUi();
      ui.introTag();
      ui.outro('Signed out. Stored credentials removed.');
    });
};
