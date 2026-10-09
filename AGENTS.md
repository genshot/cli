# Agent instructions

## Local CI

Run `act workflow_dispatch -W .github/workflows/ci.yml` before opening a PR.
The root `.actrc` selects the Docker runner. Dependency caches use `actions/cache`.
