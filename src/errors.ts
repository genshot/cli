import { Data } from 'effect';

/**
 * Error type for expected, user-facing CLI failures — bad input, a non-2xx API
 * response, or a missing login. `index.ts` catches these at the top level and
 * prints only `.message` (no stack) before exiting with code 1, so every message
 * must read as something the user can act on.
 */
export class CliError extends Data.TaggedError('CliError')<{
  readonly message: string;
}> {}

/**
 * Builds a user-facing CLI error with a stable tagged shape.
 * @param message actionable failure message to print at the CLI edge
 * @returns tagged CLI error
 */
export const cliError = (message: string): CliError => new CliError({ message });
