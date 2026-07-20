import {
  CREDIT_PACK_IDS,
  type CreditPackId,
  DEFAULT_PAID_CREDIT_PACK_ID,
} from '@genshot/shared/billing';
import type { Command } from 'commander';
import { Either } from 'effect';

import type { ApiOptions } from '#cli/api.ts';

import { createCheckout, getCredits } from '#cli/api.ts';
import { openBrowser } from '#cli/browser.ts';
import { requireConfig } from '#cli/config.ts';
import { type CliError, cliError } from '#cli/errors.ts';
import * as ui from '#cli/ui.ts';
import { sleep } from '#cli/ui.ts';

const POLL_INTERVAL_MS = 4000;

/**
 * `genshot buy` — purchase a credit pack. Opens Lemon Squeezy checkout in the
 * browser (the user pays there), then polls `GET /credits` until the balance
 * rises, so the terminal reflects the purchase without a manual refresh.
 * @param program commander root program
 * @returns void; mutates the program by registering the command
 */
export const registerBuy = (program: Command): void => {
  program
    .command('buy')
    .description('Buy a credit pack — opens checkout, then waits for the credits to land.')
    .argument('[pack]', 'credit pack id (e.g. image_credits_30)')
    .option('--pack <id>', 'credit pack id')
    .option('--no-open', 'print the checkout URL instead of opening a browser')
    .option('--json', 'print machine-readable JSON')
    .option('--timeout <seconds>', 'how long to wait for credits to arrive', '600')
    .action(
      async (
        pack: string | undefined,
        options: {
          json?: boolean;
          open?: boolean;
          pack?: string;
          timeout?: string;
        },
      ) => {
        const config = await requireConfig();
        const apiOptions: ApiOptions = {
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
        };
        const json = options.json === true;
        ui.startUi({ json });
        ui.introTag();
        const requestedPack = pack === undefined ? options.pack : pack;
        const packId = await resolveCliResult(resolvePackId(requestedPack));
        const timeoutMs = await resolveCliResult(parseTimeout(options.timeout));

        const before = (await getCredits(apiOptions)).balance;
        const checkout = await createCheckout(apiOptions, { packId });

        if (options.open === false) {
          ui.message(`Open this URL to complete your purchase:\n  ${checkout.checkoutUrl}`);
        } else {
          openBrowser(checkout.checkoutUrl);
          ui.message(
            `Opened checkout in your browser. If nothing opened, visit:\n  ${checkout.checkoutUrl}`,
          );
        }

        const spinner = ui.spinner();
        spinner.start('Waiting for the purchase to complete');
        const balance = await waitForCredits(apiOptions, before, timeoutMs);
        spinner.stop(
          balance === null
            ? 'Still waiting for the purchase'
            : `Purchase complete · balance ${balance}`,
        );

        if (balance === null) {
          if (json) {
            // Include checkoutUrl so `--json --no-open` agents still receive the pay link.
            ui.printJson({
              status: 'waiting',
              balance: null,
              checkoutUrl: checkout.checkoutUrl,
            });
            return;
          }
          ui.outro('Still waiting on the purchase. Run `genshot balance` once it completes.');
          return;
        }

        if (json) {
          ui.printJson({
            status: 'complete',
            balance,
            checkoutUrl: checkout.checkoutUrl,
          });
          return;
        }
        ui.outro(`Credit balance: ${balance}.`);
      },
    );
};

const resolveCliResult = <A>(result: Either.Either<A, CliError>): Promise<A> =>
  Either.isRight(result) ? Promise.resolve(result.right) : Promise.reject(result.left);

/** Resolve the requested pack id to a known pack, defaulting when none is given. */
const resolvePackId = (value: string | undefined): Either.Either<CreditPackId, CliError> => {
  if (!value) {
    return Either.right(DEFAULT_PAID_CREDIT_PACK_ID);
  }
  const match = CREDIT_PACK_IDS.find((id) => id === value);
  if (!match) {
    return Either.left(
      cliError(`Unknown pack "${value}". Choose one of: ${CREDIT_PACK_IDS.join(', ')}.`),
    );
  }
  return Either.right(match);
};

/** Parse the `--timeout` seconds flag into milliseconds, rejecting non-positive values. */
const parseTimeout = (value: string | undefined): Either.Either<number, CliError> => {
  const seconds = Number.parseInt(value === undefined ? '600' : value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Either.left(cliError('--timeout must be a positive number of seconds.'));
  }
  return Either.right(seconds * 1000);
};

/** Poll the balance until it rises above `before`, or `null` if the timeout elapses first. */
const waitForCredits = async (
  apiOptions: ApiOptions,
  before: number,
  timeoutMs: number,
): Promise<number | null> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const { balance } = await getCredits(apiOptions);
    if (balance > before) {
      return balance;
    }
  }
  return null;
};
