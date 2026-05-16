# QuickGet Download Manager (QDM)

QuickGet Download Manager (QDM) is a Windows-first alpha desktop application for QuickGet.

QDM is built with Tauri v2, React, TypeScript, Vite, and Tailwind CSS.

## Platform status

- Primary tested platform: Windows
- macOS/Linux builds may exist but are currently untested

## Architecture

QDM does not implement downloading logic itself.

QDM connects to `quickget-agent` from the sibling `QuickGet_CLI` backend repository over localhost HTTP and SSE.

## Agent setup

Fetch and prepare a bundled sidecar agent binary:

```bash
npm run fetch-agent
```

`fetch-agent` writes sidecar metadata to:
- `src-tauri/binaries/quickget-agent.meta.json`

This file records source (`local` or `github`), resolved tag, asset name, and fetch timestamp.

Use local sibling backend binary instead of GitHub Releases:

```bash
QDM_USE_LOCAL_AGENT=1 npm run fetch-agent
```

Local fallback paths:
- Windows: `../QuickGet_CLI/quickget-agent.exe`
- macOS/Linux: `../QuickGet_CLI/quickget-agent`

## Development

Run with release-fetched agent:

```bash
npm run tauri:dev
```

Run with local sibling repo agent:

```bash
npm run dev:local-agent
```

Create a production desktop build:

```bash
npm run tauri:build
```

## Verifying agent version in app

1. Run `npm run fetch-agent`.
2. Check `src-tauri/binaries/quickget-agent.meta.json` for the resolved release tag.
3. Start QDM and confirm:
   - Connection badge text includes `v<agent-version>`
   - Dev console logs `[QDM] quickget-agent connected` with `version`, `apiVersion`, `buildCommit`, `buildDate`.

To pin a specific release instead of `latest`, set `quickgetAgentVersion` in `qdm.config.json` to your tag (for example `v1.2.3`) before running `npm run fetch-agent`.
