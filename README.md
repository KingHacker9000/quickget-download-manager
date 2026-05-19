# QuickGet Download Manager (QDM)

![CI](https://github.com/OWNER/QuickGet_Download_Manager/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/OWNER/QuickGet_Download_Manager/actions/workflows/release.yml/badge.svg)
![Version](https://img.shields.io/badge/version-v0.1.0-22c55e.svg)
![Platform](https://img.shields.io/badge/platform-Windows--first-0ea5e9.svg)

Desktop UI for managing downloads powered by `quickget-agent`.

QDM `v0.1.0` is a Windows-first release built with Tauri v2, React, TypeScript, Vite, and Tailwind CSS.

If you fork this repo, replace `OWNER/QuickGet_Download_Manager` in the badge URLs.

## Why QDM

- Clean desktop workflow for creating and controlling QuickGet downloads
- Live download status with pause/resume/cancel/delete controls
- Tray/background operation while downloads continue
- Friendly error handling for common agent/network/runtime failures

## Status

- Stable `v0.1.0` release
- Primary tested platform: Windows
- macOS/Linux artifacts may exist but are currently experimental and untested
- Full cross-platform support is not claimed yet

Chrome extension download capture is planned next. QDM `v0.1.0` is prepared to display downloads created through `quickget-agent`, but the extension is not included yet.

## Architecture

QDM relies on `quickget-agent` from the QuickGet backend/CLI repository:

- https://github.com/KingHacker9000/quickget

## Quick Start

Install dependencies:

```bash
npm ci
```

Fetch `quickget-agent` sidecar:

```bash
npm run fetch-agent
```

`fetch-agent` also prepares the `quickget-native-host` sidecar used by the browser extension bridge.
Set browser extension origin(s) in `qdm.config.json` (`extensionOrigins`) so QDM can auto-register native messaging on startup.

Run desktop app (release-fetched sidecar):

```bash
npm run tauri:dev
```

Run desktop app with local sibling `QuickGet_CLI` sidecar:

```bash
npm run dev:local-agent
```

## Build

Build frontend:

```bash
npm run build
```

Build desktop installer/package:

```bash
npm run tauri:build
```

Windows is the only actively tested target for `v0.1.0`.
macOS/Linux artifacts remain experimental.

## Docs

- Platform support: [docs/platform-support.md](docs/platform-support.md)
- Build details: [docs/building.md](docs/building.md)
- Release process: [docs/releasing.md](docs/releasing.md)

