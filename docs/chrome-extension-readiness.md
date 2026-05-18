# Chrome Extension Readiness

## Future Architecture

Chrome extension
-> quickget-native-host
-> quickget-agent
-> QDM UI

## Responsibility Split

- Chrome extension captures download URLs from the browser UI.
- `quickget-native-host` is a tiny bridge between browser extension messages and local backend calls.
- `quickget-agent` creates and manages downloads.
- QDM displays and controls downloads.

## QDM Readiness Requirements

- QDM must display downloads created outside the QDM UI.
- QDM must merge SSE events for unknown download IDs.
- QDM must not assume manual-origin downloads only.
- QDM must support tray/background operation.
- QDM must show friendly errors for externally-created jobs.

## Not Included

- No media/DRM capture.
- No scraping private pages.
- No bypassing website restrictions.
- No extension implementation in `v0.1.0`.

## Planned Next Milestone

`v0.2.0`: Chrome extension MVP with:

- Right-click "Download with QuickGet".
- Toolbar popup.
- Send URL to native host.
- Native host forwards to `quickget-agent`.
