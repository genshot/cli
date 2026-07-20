import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * Best-effort "open this URL in the user's browser" without taking on the `open`
 * npm dependency — keeps the CLI dependency-light and installable offline.
 * Failures are swallowed on purpose: every caller also prints the URL, so a
 * headless box (CI, SSH) just falls back to copy-paste.
 * @param url checkout or OAuth URL to open
 * @returns void; failures are ignored intentionally
 */
export const openBrowser = (url: string): void => {
  const [command, args] = browserCommand(url);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // Ignore — the caller always prints the URL as a manual fallback.
  });
  child.unref();
};

/** Per-platform "open a URL" command: `open` (macOS), `start` (Windows), `xdg-open` (Linux). */
const browserCommand = (url: string): [string, string[]] => {
  if (process.platform === 'darwin') {
    return ['open', [url]];
  }
  if (process.platform === 'win32') {
    return ['cmd', ['/c', 'start', '', url]];
  }
  return ['xdg-open', [url]];
};
