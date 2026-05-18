# QuickGet Download Manager (QDM)

![CI](https://github.com/OWNER/QuickGet_Download_Manager/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/OWNER/QuickGet_Download_Manager/actions/workflows/release.yml/badge.svg)
![License](https://img.shields.io/badge/license-TBD-lightgrey.svg)

QuickGet Download Manager (QDM) is currently `v0.1.0-alpha`.
It is a Windows-first alpha desktop application built with Tauri v2, React, TypeScript, Vite, and Tailwind CSS.

If you fork this repository, replace `OWNER/QuickGet_Download_Manager` in the badge URLs above.

## Status (`v0.1.0-alpha`)

- Alpha quality, not a stable release.
- Primary tested platform: Windows.
- macOS/Linux build outputs may exist but are untested and experimental.
- Full cross-platform support is not claimed yet.

## QuickGet backend / CLI repository

QDM relies on `quickget-agent` from the QuickGet backend repository:

- https://github.com/KingHacker9000/quickget

## Platform support

See:

- [docs/platform-support.md](docs/platform-support.md)

## Development

Install dependencies:

```bash
npm ci
```

Run Tauri dev with a release-fetched sidecar:

```bash
npm run tauri:dev
```

Run Tauri dev with a local sibling `QuickGet_CLI` sidecar:

```bash
npm run dev:local-agent
```

## Fetch quickget-agent

Download and prepare the sidecar binary:

```bash
npm run fetch-agent
```

Use local sibling backend binary instead of GitHub Releases:

```bash
QDM_USE_LOCAL_AGENT=1 npm run fetch-agent
```

## Build (Windows app)

Build frontend:

```bash
npm run build
```

Build desktop installer/package:

```bash
npm run tauri:build
```

Windows is the only actively tested target for this alpha.
macOS/Linux artifacts are experimental and currently untested.

## CI and release docs

- [docs/building.md](docs/building.md)
- [docs/releasing.md](docs/releasing.md)
