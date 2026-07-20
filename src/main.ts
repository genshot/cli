#!/usr/bin/env node
import process from 'node:process';
import { Command } from 'commander';
import { registerAccount } from '#cli/commands/account.ts';
import { registerBuy } from '#cli/commands/buy.ts';
import { registerGenerate } from '#cli/commands/generate.ts';
import { registerLogin } from '#cli/commands/login.ts';
import { bannerString, printBanner, renderError } from '#cli/ui.ts';

const program = new Command();
program
  .name('genshot')
  .description(
    'Generate App Store, Chrome Web Store, and Google Play screenshots from your terminal.',
  )
  .version('3.0.2');

// Set once bare `genshot` has already drawn (and animated) the banner, so the
// usage text that follows doesn't print a second, static copy.
let bannerShown = false;

// Wordmark above the root help only; subcommand `--help` stays clean (it shows
// the one-line intro tag at runtime instead).
program.addHelpText('beforeAll', ({ command }) =>
  command.name() === 'genshot' && !bannerShown ? bannerString() : '',
);

registerLogin(program);
registerBuy(program);
registerGenerate(program);
registerAccount(program);

const run = async (): Promise<void> => {
  // Bare `genshot` greets with the animated banner, then prints usage and exits.
  if (process.argv.slice(2).length === 0) {
    await printBanner();
    bannerShown = true;
    program.help();
    return;
  }
  await program.parseAsync(process.argv);
};

void run().then(undefined, (error: unknown) => {
  renderError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
