# Building QDM

This project currently targets `v0.1.0` and is Windows-first.

## Prerequisites

- Node.js 20+
- Rust (stable toolchain)
- Platform prerequisites for Tauri v2:
  - Windows: Visual Studio Build Tools (MSVC) + WebView2 runtime
  - macOS: Xcode command line tools
  - Linux: GTK/WebKit2GTK development packages (see CI workflow)

## Install dependencies

```bash
npm ci
```

## Build frontend only

```bash
npm run build
```

## Fetch quickget-agent sidecar

```bash
npm run fetch-agent
```

The script downloads an OS/arch-matching `quickget-agent` release binary from:

- `https://github.com/KingHacker9000/quickget`

For local backend testing, you can use a local sibling `QuickGet_CLI` binary:

```bash
QDM_USE_LOCAL_AGENT=1 npm run fetch-agent
```

## Build desktop app

```bash
npm run tauri:build
```

On Windows this produces tested release artifacts for `v0.1.0`.
macOS/Linux artifacts are currently experimental and untested.
