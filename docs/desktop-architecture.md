# Desktop Architecture

## Roles

- QDM (QuickGet Download Manager) is the desktop UI and user-facing controller.
- `quickget-agent` is the background download manager process from the QuickGet CLI/backend repo.

## Separation of concerns

- QDM does not perform downloading itself.
- QDM delegates download lifecycle work to `quickget-agent`.

## Communication model

- QDM communicates with `quickget-agent` over localhost HTTP for commands and queries.
- QDM consumes SSE from the same localhost API for progress, state updates, and events.

## Forward compatibility

- A future Chrome extension will communicate with the same `quickget-agent` API.
- QDM and the extension are both clients of one shared backend agent.
