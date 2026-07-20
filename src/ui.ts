import process from 'node:process';
import {
  cancel as clackCancel,
  intro as clackIntro,
  log as clackLog,
  note as clackNote,
  outro as clackOutro,
  spinner as clackSpinner,
  text as clackText,
  isCancel,
} from '@clack/prompts';
import { animateBanner, bannerString as renderBanner } from '@genshot/shared/banner';
import { promptLine } from '#cli/prompt.ts';

/**
 * Terminal presentation layer for the public `genshot` CLI.
 *
 * Every command renders through here so the whole tool shares one look — the
 * `◇ ✔ │` gutter, spinners during waits, boxed notes — and so the
 * rich-vs-plain-vs-JSON decision lives in exactly one place.
 *
 * Why @clack/prompts (the CLI's second and only non-`commander` runtime
 * dependency): it provides spinners, cancel-aware prompts, and gutter framing
 * for free; it is small, pure-ANSI (no native bindings), and esbuild inlines it
 * into the single `dist/index.cjs`, so end users still install one artifact. It
 * is the library behind `create-vite` / Astro's CLI, which is the exact look we
 * want. Hand-rolling the same would mean re-implementing a spinner, prompt
 * cancellation, and box-drawing we'd then own.
 *
 * Three render modes keep the scripting contract intact:
 * - `rich`   — interactive stdout, `--json` off: full clack output.
 * - `plain`  — non-TTY (piped / CI / agent), `--json` off: bare lines, no ANSI.
 * - `silent` — `--json` on: every helper is a no-op so the command's JSON is the
 *              only thing on stdout. (`@clack/prompts` honors `NO_COLOR` too.)
 */
type RenderMode = 'plain' | 'rich' | 'silent';

let mode: RenderMode = 'plain';

/**
 * Select the render mode for the current command. `--json` forces `silent`;
 * otherwise an interactive stdout is `rich` and everything else is `plain`.
 * Routing every command through this keeps one switch governing all output.
 */
export const startUi = (options?: { json?: boolean }): void => {
  const json = options === undefined ? false : options.json === true;
  if (json) {
    mode = 'silent';
    return;
  }
  mode = process.stdout.isTTY ? 'rich' : 'plain';
};

/**
 * Print exactly one JSON object to stdout (the dual-mode `--json` contract).
 * @param value - serializable payload; must be the only stdout content for the command
 * @returns void
 * @example
 * printJson({ jobId: 'job_1', status: 'queued' });
 */
export const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

/** A running spinner; `update` swaps the live label, `stop` settles it to a final line. */
export interface Spinner {
  start: (message: string) => void;
  stop: (message: string) => void;
  update: (message: string) => void;
}

/** The one-line ` genshot ` intro chip shown at the top of every subcommand (rich only). */
export const introTag = (): void => {
  if (mode === 'rich') {
    clackIntro(chip('genshot'));
  }
};

/** Close the command's frame with a concluding line. */
export const outro = (text: string): void => {
  if (mode === 'rich') {
    clackOutro(text);
  }
};

/** A success line (green check in rich mode). */
export const success = (text: string): void => {
  if (mode === 'rich') {
    clackLog.success(text);
  }
};

/** An informational line. */
export const info = (text: string): void => {
  if (mode === 'rich') {
    clackLog.info(text);
  }
};

/** A neutral gutter line — the secondary detail under a success. */
export const message = (line: string): void => {
  if (mode === 'rich') {
    clackLog.message(line);
  }
};

/** A warning line (yellow in rich mode). */
export const warn = (text: string): void => {
  if (mode === 'rich') {
    clackLog.warn(text);
  }
};

/** A boxed note with a title — used for `whoami` and the generated-file list. */
export const note = (body: string, title: string): void => {
  if (mode === 'rich') {
    clackNote(body, title);
  }
};

/** Create a spinner; plain mode logs the start/stop labels, silent mode stays quiet. */
export const spinner = (): Spinner => {
  if (mode === 'rich') {
    const instance = clackSpinner();
    return {
      start: (text) => instance.start(text),
      update: (text) => instance.message(text),
      stop: (text) => instance.stop(text),
    };
  }
  if (mode === 'silent') {
    return { start: () => undefined, update: () => undefined, stop: () => undefined };
  }
  return {
    start: (_message) => undefined,
    update: () => undefined,
    stop: (_message) => undefined,
  };
};

/**
 * Ask for one line of input. In rich mode this is a clack text prompt with
 * Ctrl-C handling; otherwise it falls back to readline, which throws on a
 * non-interactive stdin so scripted callers get a clear "pass it as a flag"
 * error instead of hanging.
 */
export const prompt = async (options: {
  message: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string> => {
  if (mode !== 'rich') {
    return promptLine(`${options.message}: `);
  }

  const validate = options.validate;
  const value = await clackText({
    message: options.message,
    placeholder: options.placeholder,
    validate:
      validate === undefined ? undefined : (input) => validate(input === undefined ? '' : input),
  });
  if (isCancel(value)) {
    clackCancel('Cancelled.');
    process.exit(130);
  }
  return value.trim();
};

/**
 * Render a fatal error. Safe to call without `startUi` (the top-level catch in
 * `main.ts` uses it). In `--json` (silent) mode the message goes to **stderr**
 * so the dual-mode contract still allows exactly one JSON object on stdout.
 * Interactive TTYs use clack; other cases write a single line to stderr.
 */
export const renderError = (text: string): void => {
  if (mode === 'silent') {
    process.stderr.write(`${text}\n`);
    return;
  }
  if (process.stdout.isTTY) {
    clackLog.error(text);
    return;
  }
  process.stderr.write(`${text}\n`);
};

/**
 * Greet with the wordmark banner. On a color TTY the sparkles twinkle for a
 * couple of seconds and then freeze; otherwise the static frame is printed once.
 * Used by the bare `genshot` invocation (the explicit `--help` text uses the
 * synchronous {@link bannerString} instead, since Commander renders it inline).
 */
export const printBanner = (): Promise<void> =>
  animateBanner({
    color: colorEnabled(),
    write: (chunk) => process.stdout.write(chunk),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });

/** One static banner frame; sparkled and cyan when the terminal supports color (see `@genshot/shared/banner`). */
export const bannerString = (): string => renderBanner({ color: colorEnabled() });

/** True when stdout is a color-capable TTY and `NO_COLOR` is unset. */
const colorEnabled = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

/** The ` genshot ` intro chip: black-on-cyan when color is enabled, bare spaces otherwise. */
const chip = (label: string): string =>
  colorEnabled() ? `\x1b[46m\x1b[30m ${label} \x1b[0m` : ` ${label} `;

/** Resolve after `ms` milliseconds — the delay between status/balance polls. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
