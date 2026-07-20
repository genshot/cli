/**
 * The `genshot` wordmark banner, shared by the public CLI (`packages/cli`, via
 * `ui.ts`) and the local `pnpm demo` harness (`scripts/demo.ts`) so both render
 * the identical mark from one source instead of two hand-synced copies.
 *
 * Two surfaces:
 * - `bannerString({ color })` — one static frame (wordmark + the App Store → terminal
 *   flow scene). Sparkles around the wordmark are frozen in a single random layout.
 *   Used for synchronous contexts like Commander's `--help` text, and for plain /
 *   piped output where animation would corrupt logs.
 * - `animateBanner({ color, write, sleep })` — twinkles the sparkles for a couple of
 *   seconds (redrawing the frame in place) then settles, for the interactive
 *   bare-`genshot` greeting and the demo intro.
 *
 * Pure string work — zero dependencies, no `process` / clock access. The caller
 * decides whether the terminal supports color (TTY + no `NO_COLOR`) and injects
 * the `write` / `sleep` primitives for the animation, so this stays
 * runtime-agnostic. With `color` off there are no sparkles and no animation, so
 * piped / CI output is deterministic.
 */

const BANNER_ART = [
  '                       _           _   ',
  '   __ _  ___ _ __  ___| |__   ___ | |_ ',
  "  / _` |/ _ \\ '_ \\/ __| '_ \\ / _ \\| __|",
  ' | (_| |  __/ | | \\__ \\ | | | (_) | |_ ',
  '  \\__, |\\___|_| |_|___/_| |_|\\___/ \\__|',
  '  |___/                                 ',
];

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RED = '\x1b[91m';
const GREEN = '\x1b[92m';

/** Glyphs scattered into the empty space around the wordmark, smallest to brightest. */
const SPARKLE_GLYPHS = ['·', '˖', '⋆', '✧', '✦', '✶'];

/** A spread of colors — bright cyan, white, cyan, gold, dim — so no two sparkles look alike. */
const SPARKLE_COLORS = ['\x1b[96m', '\x1b[97m', CYAN, '\x1b[93m', DIM];

/** Blank columns padded on each side of the art, giving sparkles room to land. */
const BANNER_MARGIN = 6;

/** One rendered character; `color` null means a bare space (emitted with no escape codes). */
interface BannerCell {
  char: string;
  color: string | null;
}

/** A row's letter span in canvas columns, or `-1`/`-1` for a fully blank row. */
interface LetterSpan {
  end: number;
  start: number;
}

/** One colored run of the static flow scene; `color` null prints the text bare. */
interface SceneSegment {
  color: string | null;
  text: string;
}

/** The 13-column middle spacer separating the apple from the terminal window. */
const blank = (): SceneSegment => ({ color: null, text: '             ' });

const border = (text: string): SceneSegment => ({ color: DIM, text });

/** The apple body — the bulk of the App Store logo. */
const apple = (text: string): SceneSegment => ({ color: RED, text });

/** The apple's leaf (the logo's top row), the one green accent. */
const leaf = (text: string): SceneSegment => ({ color: GREEN, text });

const term = (text: string): SceneSegment => ({ color: GREEN, text });

const accent = (text: string): SceneSegment => ({ color: CYAN, text });

const label = (text: string): SceneSegment => ({ color: DIM, text });

/**
 * The "App Store screenshots, from your terminal" tagline drawn as a little
 * scene: the iconic Apple logo (App Store) on the left — the classic line-art
 * silhouette with the leaf on top and the bite on the right — an arrow +
 * "screenshots" label through the middle, and a terminal window on the right.
 * Pure data, colored per segment: the apple body is red with a green leaf, the
 * terminal border dim with green text, the arrow/label cyan. Every apple cell
 * is padded to a fixed 16-column field and every middle cell to 13, so the
 * terminal box edges line up on every row and both columns stand 7 rows tall.
 */
const SCENE_ROWS: SceneSegment[][] = [
  [leaf("       .:'      "), blank(), border('.------------------.')],
  [apple("   __ :'__      "), blank(), border('|'), term(' user@mac ~ %     '), border('|')],
  [apple(".'`__`-'__``.   "), blank(), border('|'), term('                  '), border('|')],
  [
    apple(":__________.-'  "),
    accent(' screenshots '),
    border('|'),
    term('  $ genshot ▮     '),
    border('|'),
  ],
  [
    apple(':_________:     '),
    accent(' ─────────▶  '),
    border('|'),
    term('                  '),
    border('|'),
  ],
  [apple(' :_________`-;  '), blank(), border('|'), term('  ~/shots ✓       '), border('|')],
  [apple("  `.__.-.__.'   "), blank(), border("'------------------'")],
  [label('    App Store   '), blank(), label('      Terminal      ')],
];

/**
 * Total lines a color frame occupies — the cursor-rewind distance while
 * animating: one top pad + the wordmark grid (art + a blank row above and
 * below) + a gap + the scene + one bottom pad.
 */
const COLOR_FRAME_HEIGHT = 1 + (BANNER_ART.length + 2) + 1 + SCENE_ROWS.length + 1;

/**
 * Build one static banner frame: the wordmark (cyan + a random sparkle layout
 * when `color`, plain ASCII otherwise) above the App Store → terminal scene.
 */
export const bannerString = (options?: { color?: boolean }): string => {
  const color = options === undefined || options.color === undefined ? false : options.color;
  return bannerFrameLines(Boolean(color)).join('\n');
};

/**
 * Options for {@link animateBanner}. `write` / `sleep` are injected by the caller
 * so this module never touches `process` or the clock; `durationMs` / `frameMs`
 * tune how long it twinkles before freezing on the final frame.
 */
export interface AnimateBannerOptions {
  color: boolean;
  durationMs?: number;
  frameMs?: number;
  sleep: (ms: number) => Promise<void>;
  write: (chunk: string) => void;
}

/**
 * Print the banner and, when `color` is on, twinkle the sparkles for ~2–3s
 * before settling. Each frame redraws the whole banner in place (cursor moved
 * back up `COLOR_FRAME_HEIGHT` lines) with a fresh random sparkle layout; the
 * cursor is hidden for the duration and restored in a `finally` so an aborted
 * run never leaves it invisible. With `color` off it writes the static frame
 * once and returns — no cursor games, safe for pipes and CI.
 */
export const animateBanner = async (options: AnimateBannerOptions): Promise<void> => {
  const { color, sleep, write } = options;
  if (!color) {
    write(`${bannerString({ color: false })}\n`);
    return;
  }

  const frameMs = options.frameMs === undefined ? 120 : options.frameMs;
  const durationMs = options.durationMs === undefined ? 2200 : options.durationMs;
  const frames = Math.max(1, Math.round(durationMs / frameMs));

  write('\x1b[?25l');
  write(`${bannerFrameLines(true).join('\n')}\n`);
  const animationError = await animateBannerFrames({ frameMs, frames, sleep, write }).then(
    () => null,
    (error: unknown) => error,
  );
  write('\x1b[?25h');
  if (animationError !== null) {
    return Promise.reject(animationError);
  }
};

const animateBannerFrames = async (input: {
  frameMs: number;
  frames: number;
  sleep: (ms: number) => Promise<void>;
  write: (chunk: string) => void;
}): Promise<void> => {
  for (let frame = 1; frame < input.frames; frame++) {
    await input.sleep(input.frameMs);
    const lines = bannerFrameLines(true).map((line) => `\x1b[2K${line}`);
    input.write(`\x1b[${COLOR_FRAME_HEIGHT}A${lines.join('\n')}\n`);
  }
};

/** The full banner as lines: pad, wordmark, gap, the flow scene, pad. */
const bannerFrameLines = (color: boolean): string[] => {
  const wordmark = color ? renderSparkledArt() : [...BANNER_ART];
  const scene = SCENE_ROWS.map((row) => renderSceneRow(row, color));
  return ['', ...wordmark, '', ...scene, ''];
};

/** Lay the art on a padded grid, scatter sparkles into the surrounding space, render each row. */
const renderSparkledArt = (): string[] => {
  const artWidth = Math.max(...BANNER_ART.map((line) => line.length));
  const width = BANNER_MARGIN * 2 + artWidth;
  const margin = ' '.repeat(BANNER_MARGIN);

  const grid: BannerCell[][] = [];
  const spans: LetterSpan[] = [];
  const pushRow = (text: string, isArt: boolean, span: LetterSpan): void => {
    grid.push(
      Array.from(text, (char) => ({
        char,
        color: isArt && char !== ' ' ? CYAN : null,
      })),
    );
    spans.push(span);
  };

  const blankSpan: LetterSpan = { start: -1, end: -1 };
  pushRow(' '.repeat(width), false, blankSpan);
  for (const line of BANNER_ART) {
    const first = line.search(/\S/);
    const last = line.replace(/\s+$/, '').length - 1;
    pushRow(margin + line.padEnd(artWidth) + margin, true, {
      start: first < 0 ? -1 : BANNER_MARGIN + first,
      end: last < 0 ? -1 : BANNER_MARGIN + last,
    });
  }
  pushRow(' '.repeat(width), false, blankSpan);

  scatterSparkles(collectMarginCells(grid, spans), grid);
  return grid.map(renderRow);
};

/** Every space cell sitting OUTSIDE its row's letter span — i.e. the area around the mark. */
const collectMarginCells = (grid: BannerCell[][], spans: LetterSpan[]): [number, number][] => {
  const cells: [number, number][] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const span = spans[r];
    if (row && span) {
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell?.char === ' ' && (span.start < 0 || c < span.start || c > span.end)) {
          cells.push([r, c]);
        }
      }
    }
  }
  return cells;
};

/** Light up a random handful of the eligible cells with random glyphs + colors. */
const scatterSparkles = (cells: [number, number][], grid: BannerCell[][]): void => {
  const count = 8 + Math.floor(Math.random() * 6);
  const used = new Set<number>();
  for (let i = 0; i < count && used.size < cells.length; i++) {
    let idx = Math.floor(Math.random() * cells.length);
    while (used.has(idx)) {
      idx = (idx + 1) % cells.length;
    }
    used.add(idx);
    const slot = cells[idx];
    const cell = slot && grid[slot[0]]?.[slot[1]];
    if (cell) {
      cell.char = pick(SPARKLE_GLYPHS);
      cell.color = pick(SPARKLE_COLORS);
    }
  }
};

/** Render one grid row, coalescing same-color runs so the art is one escape pair and sparkles their own. */
const renderRow = (row: BannerCell[]): string => {
  let out = '';
  let i = 0;
  while (i < row.length) {
    const cell = row[i];
    if (cell === undefined) {
      i++;
    } else if (cell.color === null) {
      out += cell.char;
      i++;
    } else {
      const { color } = cell;
      let run = '';
      while (i < row.length) {
        const next = row[i];
        if (!next || next.color !== color) {
          break;
        }
        run += next.char;
        i++;
      }
      out += `${color}${run}${RESET}`;
    }
  }
  return out;
};

/** Render one scene row: wrap each segment in its color when `color`, else concatenate bare. */
const renderSceneRow = (segments: SceneSegment[], color: boolean): string =>
  segments
    .map((segment) =>
      color && segment.color ? `${segment.color}${segment.text}${RESET}` : segment.text,
    )
    .join('');

/** Pick a random element from a non-empty list. */
const pick = (items: readonly string[]): string => {
  const selected = items[Math.floor(Math.random() * items.length)];
  if (selected !== undefined) {
    return selected;
  }

  const first = items[0];
  return first === undefined ? '' : first;
};
