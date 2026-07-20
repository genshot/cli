# @genshot/cli

The public command-line client for [genshot](https://genshot.dev) — generate
App Store, Chrome Web Store, and Google Play screenshots from your terminal.

This is a thin HTTP client for the genshot API (`https://api.genshot.dev`). It
holds no secrets and runs no generation locally; it authenticates you, manages
credits, and streams generation jobs to and from the hosted service.

## Install

```sh
npm install -g @genshot/cli
# or run once without installing:
npx @genshot/cli
```

Requires Node.js >= 22.13.0.

## Usage

```sh
genshot            # animated banner + help
genshot login      # sign in by email (stores a gsk_ key at ~/.genshot/config.json)
genshot account    # show the signed-in account and credit balance
genshot buy        # open a credit-pack checkout in your browser
genshot generate   # generate a screenshot set from an app listing
```

Run `genshot <command> --help` for the flags on any command. Commands that emit
machine-readable output support `--json`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GENSHOT_API_URL` | Override the API base URL (defaults to `https://api.genshot.dev`). |
| `GENSHOT_CONFIG_PATH` | Override the credential file location (defaults to `~/.genshot/config.json`). |

Credentials are written with owner-only (`0600`) permissions.

## Development

```sh
pnpm install
pnpm dev            # run the CLI from source via tsx
pnpm typecheck
pnpm test
pnpm build          # bundle to dist/index.cjs via esbuild
```

The `vendor/shared` directory contains the small set of shared `effect/Schema`
API contracts the CLI needs to stay in lockstep with the genshot service; it is
generated from the genshot service's shared contracts and should not be edited
by hand.

## License

[MIT](./LICENSE)
