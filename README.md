<p align="center">
  <a href="https://genshot.dev">
    <img src="https://genshot.dev/logos/genshot-wordmark-dark.png" alt="Genshot" width="420" />
  </a>
</p>

# @genshot/cli

The public command-line client for [genshot](https://genshot.dev) — generate
App Store, Chrome Web Store, and Google Play screenshots from your terminal.

> This repository is **generated** from the private genshot monorepo. Do not edit
> it directly; changes are made in the monorepo and synced here. It is a thin HTTP
> client for the genshot API (`https://api.genshot.dev`) and holds no secrets.

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

## Related

- [@genshot/sdk](https://github.com/genshot/sdk) — TypeScript / JavaScript API client
- [API docs](https://genshot.dev/api-docs) — full HTTP contract

## License

[MIT](./LICENSE)
