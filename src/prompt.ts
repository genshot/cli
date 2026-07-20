import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { cliError } from '#cli/errors.ts';

/**
 * Read a single trimmed line from the user. Throws a `CliError` on a
 * non-interactive stdin so scripted/agent callers get a clear "pass it as a
 * flag" message instead of hanging on a prompt that can never be answered.
 */
export const promptLine = async (question: string): Promise<string> => {
  if (!process.stdin.isTTY) {
    return Promise.reject(
      cliError('Non-interactive terminal; pass the value as a command-line flag instead.'),
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question).finally(() => rl.close());
  return answer.trim();
};
