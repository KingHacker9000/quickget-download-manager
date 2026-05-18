# Releasing QDM

QDM is currently targeting stable `v0.1.0` releases.

## Tag-based release workflow

The GitHub Actions release workflow runs when you push a tag matching:

- `v*` (example: `v0.1.0`)

Workflow file:

- `.github/workflows/release.yml`

## What the workflow does

1. Builds on Windows (tested) plus macOS/Linux (experimental).
2. Installs Node and Rust.
3. Runs `npm ci`.
4. Runs `npm run fetch-agent` to download `quickget-agent` release binary.
5. Runs `npm run tauri:build`.
6. Uploads installer/package artifacts from `src-tauri/target/release/bundle/**`.

## Release command

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Notes

- Do not mark macOS/Linux artifacts as tested.
- Windows remains the only actively tested platform at this stage.
