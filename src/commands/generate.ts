import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { GenerationCreate, UploadedAssetId } from '@genshot/shared/generation';
import {
  DEFAULT_MAX_GENERATION_COUNT,
  type GenerationStatusResponse,
} from '@genshot/shared/generation';
import type { Command } from 'commander';
import { Either } from 'effect';
import type { ApiOptions } from '#cli/api.ts';

import { createGeneration, getGeneration, presignUpload, putUpload } from '#cli/api.ts';
import { requireConfig } from '#cli/config.ts';
import { type CliError, cliError } from '#cli/errors.ts';
import * as ui from '#cli/ui.ts';
import { sleep } from '#cli/ui.ts';

/** Options collected from the `generate` flags (all optional; commander fills string defaults). */
interface GenerateOptions {
  appStoreUrl?: string;
  count?: string;
  json?: boolean;
  out?: string;
  prompt?: string;
  screenshot?: string[];
  wait?: boolean;
}

const CONTENT_TYPE_BY_EXT: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const DEFAULT_PROMPT = 'Polished, high-converting store screenshots with bold, legible headlines.';
const STATUS_POLL_INTERVAL_MS = 3000;
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * `genshot generate` — create store screenshots from a listing URL or local
 * images. By default it waits for the job and downloads the finished PNGs;
 * `--no-wait` returns the job id immediately for agent/scripted use.
 * @param program commander root program
 * @returns void; mutates the program by registering the command
 */
export const registerGenerate = (program: Command): void => {
  program
    .command('generate')
    .description('Generate store screenshots from a listing URL or your own images.')
    .option('--app-store-url <url>', 'App Store listing URL to derive screenshots from')
    .option('--screenshot <paths...>', 'local image files to use as sources')
    .option('--count <n>', 'number of images to generate', '4')
    .option('--prompt <text>', 'art-direction prompt')
    .option('--out <dir>', 'directory to write generated PNGs into')
    .option('--no-wait', 'return the job id immediately instead of waiting')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: GenerateOptions) => {
      const config = await requireConfig();
      const apiOptions: ApiOptions = {
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
      };
      const json = options.json === true;
      ui.startUi({ json });
      ui.introTag();
      const count = await resolveCliResult(parseCount(options.count));
      const prompt = options.prompt === undefined ? DEFAULT_PROMPT : options.prompt;
      const body = await buildGenerationBody(apiOptions, options, count, prompt);

      const job = await createGeneration(apiOptions, body);

      if (options.wait === false) {
        if (json) {
          ui.printJson({ jobId: job.jobId, status: job.status });
        } else {
          ui.outro(`Queued job ${job.jobId} (status: ${job.status}).`);
        }
        return;
      }

      const spinner = ui.spinner();
      spinner.start(`Generating ${count} screenshot(s)`);
      const final = await waitForGeneration(apiOptions, job.jobId, (status) =>
        spinner.update(jobProgressLabel(status, count)),
      ).then(undefined, (error: unknown) => {
        // Poll timeout / network failures must not leave `--json` with empty stdout.
        if (json) {
          ui.printJson({
            jobId: job.jobId,
            status: 'failed',
            error: {
              code: 'wait_failed',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
        return Promise.reject(error);
      });

      if (final.status === 'succeeded') {
        spinner.update('Downloading images');
        const outDir = options.out === undefined ? join('.', 'genshot', final.jobId) : options.out;
        const files = await downloadOutputs(final, outDir).then(undefined, (error: unknown) => {
          if (json) {
            ui.printJson({
              jobId: final.jobId,
              status: final.status,
              error: {
                code: 'download_failed',
                message: error instanceof Error ? error.message : String(error),
              },
            });
          }
          return Promise.reject(error);
        });
        spinner.stop(`Generated ${files.length} image(s)`);
        if (json) {
          ui.printJson({
            jobId: final.jobId,
            status: final.status,
            outDir,
            files,
          });
          return;
        }
        ui.note(files.join('\n'), `Saved to ${outDir}`);
        ui.outro(`Done · ${files.length} image(s) ready.`);
        return;
      }

      const reason = final.error === null ? `Job ${final.status}.` : final.error.message;
      spinner.stop(`Generation ${final.status}`);
      if (json) {
        ui.printJson({
          jobId: final.jobId,
          status: final.status,
          error: final.error === null ? { code: 'job_failed', message: reason } : final.error,
        });
      }
      return Promise.reject(cliError(`Generation ${final.status}: ${reason}`));
    });
};

const resolveCliResult = <A>(result: Either.Either<A, CliError>): Promise<A> =>
  Either.isRight(result) ? Promise.resolve(result.right) : Promise.reject(result.left);

/** Build the request body, enforcing the worker's "URL xor uploads" rule and presigning local files. */
const buildGenerationBody = async (
  apiOptions: ApiOptions,
  options: GenerateOptions,
  count: number,
  prompt: string,
): Promise<GenerationCreate> => {
  const sources = options.screenshot === undefined ? [] : options.screenshot;
  const hasUrl = Boolean(options.appStoreUrl);
  const hasFiles = sources.length > 0;
  if (hasUrl === hasFiles) {
    return Promise.reject(
      cliError('Pass exactly one of --app-store-url or --screenshot <paths...>.'),
    );
  }

  if (hasUrl) {
    return { appStoreUrl: options.appStoreUrl, count, prompt };
  }

  const uploadedAssetIds: UploadedAssetId[] = [];
  for (const path of sources) {
    uploadedAssetIds.push(await uploadSource(apiOptions, path));
  }
  return { uploadedAssetIds, count, prompt };
};

/** Presign + PUT one local image, returning the asset id the generation will consume. */
const uploadSource = async (apiOptions: ApiOptions, path: string): Promise<UploadedAssetId> => {
  const contentType = CONTENT_TYPE_BY_EXT[extname(path).toLowerCase()];
  if (!contentType) {
    return Promise.reject(
      cliError(`Unsupported image type for ${path}. Use .png, .jpg, .jpeg, or .webp.`),
    );
  }
  const bytes = await readFile(path);
  const presign = await presignUpload(apiOptions, {
    filename: basename(path),
    contentType,
    byteSize: bytes.byteLength,
  });
  await putUpload(presign.uploadUrl, bytes, presign.headers);
  return presign.assetId;
};

/** Parse and bound the `--count` flag to the worker's allowed range. */
const parseCount = (value: string | undefined): Either.Either<number, CliError> => {
  const count = Number.parseInt(value === undefined ? '4' : value, 10);
  if (!Number.isFinite(count) || count < 1 || count > DEFAULT_MAX_GENERATION_COUNT) {
    return Either.left(cliError(`--count must be between 1 and ${DEFAULT_MAX_GENERATION_COUNT}.`));
  }
  return Either.right(count);
};

/** Poll the job until it reaches a terminal state, or fail after the timeout. */
const waitForGeneration = async (
  apiOptions: ApiOptions,
  jobId: string,
  onStatus?: (status: GenerationStatusResponse) => void,
): Promise<GenerationStatusResponse> => {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  for (;;) {
    const status = await getGeneration(apiOptions, jobId);
    if (
      status.status === 'succeeded' ||
      status.status === 'failed' ||
      status.status === 'deleted'
    ) {
      return status;
    }
    if (onStatus !== undefined) {
      onStatus(status);
    }
    if (Date.now() >= deadline) {
      return Promise.reject(
        cliError(
          `Timed out waiting for job ${jobId}; it may still finish — check back with \`genshot generate\` later.`,
        ),
      );
    }
    await sleep(STATUS_POLL_INTERVAL_MS);
  }
};

/** Humanize a non-terminal job status into a live spinner label. */
const jobProgressLabel = (status: GenerationStatusResponse, count: number): string => {
  if (status.status === 'queued') {
    return 'Queued — waiting for a worker';
  }
  const done = status.succeededCount + status.failedCount;
  return done > 0
    ? `Generating screenshots (${done}/${count})`
    : `Generating ${count} screenshot(s)`;
};

/** Download every succeeded output's signed URL into `outDir` as `panel-N.png`. */
const downloadOutputs = async (
  status: GenerationStatusResponse,
  outDir: string,
): Promise<string[]> => {
  await mkdir(outDir, { recursive: true });
  const files: string[] = [];
  for (const output of status.outputs) {
    if (output.status === 'succeeded' && output.url) {
      const response = await fetch(output.url);
      if (!response.ok) {
        return Promise.reject(
          cliError(`Failed to download image ${output.index + 1} (${response.status}).`),
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = join(outDir, `panel-${output.index + 1}.png`);
      await writeFile(file, bytes);
      files.push(file);
    }
  }
  if (files.length === 0) {
    return Promise.reject(cliError('The job succeeded but returned no downloadable images.'));
  }
  return files;
};
