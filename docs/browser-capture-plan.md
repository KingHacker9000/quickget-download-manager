# Browser Capture Plan

## Scope
- Future browser capture starts in a Chrome extension.
- The extension sends selected download URLs to a native host.
- The native host forwards those requests to `quickget-agent` (`POST /downloads`).
- QDM loads download state from `quickget-agent` and updates from agent events.

## Architecture
1. Chrome extension gathers user-selected URL input.
2. `quickget-native-host` receives the URL payload.
3. Native host calls `quickget-agent` to create/manage downloads.
4. QDM fetches the full list from `quickget-agent` and subscribes to SSE events.
5. Downloads created externally appear and are manageable in QDM.

## QDM Responsibilities
- Treat `quickget-agent` as the source of truth for all downloads.
- Display and control downloads no matter where they were created.
- Handle partial/early events safely (for example, created/started before full metadata is available).

## Non-Goals
- QDM does not scrape browser pages directly.
- QDM does not add browser permissions.
- No media ripping or DRM capture support.
