# Claude Pixel Village

A locally hosted pixel village for Claude Code sessions. Original adventurers walk to a library, forge, telescope and training yard as tools run. Subagents become small companions; completed sessions relax by a campfire and eventually sleep.

## Run

Clone the public repository first:

```sh
git clone https://github.com/Sergb39/ClaudePixelVillage.git
cd ClaudePixelVillage
```

Requires Node.js 22.12+ (Node 24 recommended).

Works with the same source on Windows, macOS (Apple Silicon or Intel), and Linux. Install Node on the destination machine and reinstall dependencies there; do not copy `node_modules` between operating systems.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. The first launch creates Willow and Rowan as demo residents. Use **Play a village day** for the scripted story, or try individual controls and hooks. Select a companion before clicking **Finish work** to watch it return to its hero.

For the built version:

```sh
npm run build
npm start
```

Both modes use the same local port. Stop the other server first. This is a local-only application; no hosting account, API key or cloud service is needed. Motion can be reduced from the map control, and the browser's reduced-motion preference is respected.

## macOS setup

Clone the repository on your Mac. In Terminal, from the project directory:

```sh
npm ci
npm run build
npm run hooks:install -- --global
npm start
```

Open **http://127.0.0.1:4317**. In the Claude desktop app, start a fresh **local Code** session. The installer generates hook paths using the Mac's actual Node executable and this project's location, then merges them into `~/.claude/settings.json`. It preserves unrelated settings/hooks, backs up an existing file, and avoids duplicate village handlers. `CLAUDE_CONFIG_DIR` is respected if you use a custom Claude configuration directory.

Do not copy the Windows-generated hook configuration into Mac settings: its `C:` paths will not work there. Regenerate or reinstall on the Mac after moving the project or changing the Node installation. Direct executable hooks avoid shell quoting and do not depend on Node being on the desktop app's PATH. Current Claude Code supports the `command` plus `args` format; if an older version rejects `args`, update Claude or install with `npm run hooks:install -- --global --legacy` instead.

With the server running, check the connection from a second Terminal tab:

```sh
npm run hooks:check
```

This reports whether the global SessionStart hook points at this village and sends a demo test event to the local receiver. It does not prove Claude fired a real hook; start a local Code session for that final check. The server and Claude must run on the same Mac; cloud Code sessions cannot use this loopback connection.

macOS hook generation is covered by portability tests; native macOS behavior still needs end-to-end verification.

## Connect Claude Code

1. Keep the village server running.
2. Check your Claude installation with `claude --version` if you use the CLI, or keep the Claude desktop app updated. Hook names and agent ID coverage depend on the installed version.
3. In **this village directory**, generate hook examples:

   ```sh
   npm run hooks:generate
   ```

4. Open `config/hooks.core.json`. Its handlers use the absolute Node executable plus a separate script argument, so the village can receive events from other projects too, including paths containing spaces.
5. In the **Claude project you want to visualize**, add these entries to `.claude/settings.local.json` (or your chosen Claude settings file). If the file already has a `hooks` object, append the generated handlers to each existing event array. Preserve all other settings and hooks. If it has no hooks, add the generated `hooks` object. The generator does not install or modify settings.
6. Start a new Claude session in that project; one real adventurer should arrive. Submit a prompt and watch it visit a station. Spawn a Claude subagent to get a companion.

For all local projects, merge the same hook entries into **`~/.claude/settings.json`** instead. On Windows, use `%USERPROFILE%\.claude\settings.json` (for example, `C:\Users\example-user\.claude\settings.json`). A file named `settings.local.json` in the home `.claude` folder is not the global user-settings file; that filename is for project-local settings.

Or run **`npm run hooks:install -- --global`** to generate and merge the core hooks automatically for this machine. Use `--expanded` to include the additional supported events, or `--settings /absolute/path/to/project/.claude/settings.local.json` to choose a project settings file instead. Existing settings are backed up before changes; invalid JSON is never overwritten. The generator remains a file-only preview option. To generate legacy shell-form examples, use `npm run hooks:generate -- --legacy`.

In the Claude desktop app, use the **Code tab with a local session**. Local Code sessions share Claude Code's user settings and hooks. Cloud sessions do not read this machine's user settings or reach its loopback receiver. The village integration is for Claude Code sessions, not ordinary Chat conversations. After installing hooks, start a fresh local Code session. See [Desktop configuration](https://code.claude.com/docs/en/desktop#using-cli-configuration).

Use `config/hooks.expanded.json` after verifying your Claude version supports those additional events. The bridge reads the event JSON on stdin, retains only IDs/event names/tool names, and returns no output or control decision. It exits successfully if the server is absent, input is invalid, or delivery times out. Hook events cannot stop or alter your Claude workflow through this bridge.

**Excluded from automatic hook configuration:** `WorktreeCreate` replaces Claude's worktree creation operation, so it cannot be installed as a passive observer. Related worktree lifecycle handlers are excluded. `FileChanged` needs deliberate watched-file matchers, and `MessageDisplay` can be very high volume. The simulator supports the latter two; add them manually only when supported/configured. Worktree-related tool calls can still appear as ordinary tool activity. See the [official Claude Code hook reference](https://code.claude.com/docs/en/hooks).

Local Claude desktop Code hook delivery has been verified on Windows. Compatibility depends on your installed Claude version; use `npm run hooks:check` and then start a fresh local Code session to verify your setup.

## Behavior

| Claude activity | Village behavior |
| --- | --- |
| Session starts/resumes | Stable hero arrives or wakes |
| Prompt submitted | Pick up a quest |
| Read/Glob/Grep | Visit the reading room |
| Edit/Write | Work at the forge |
| Web/MCP tools | Visit the telescope |
| Bash/PowerShell/tests | Visit the training yard |
| Permission / user-input request | Wait with a question bubble |
| Subagent starts | Smaller companion appears |
| Subagent completes | Return to the hero for 12 seconds, then leave |
| Stop | Rest by the campfire |
| 18 seconds resting | Sleep at the dream cottage |
| SessionEnd | Hero and its companions leave through the gate |

`Stop` means the end of a response, not the end of the whole session. Background companions can continue while the hero rests. Multiple active tools are tracked independently. Tool categories are playful visual interpretations; the village does not read your code or infer the actual meaning of a command. Standard hook payloads do not expose a reliable nested parent tree, so companions belong to their session hero.

Finished companions are removed after their departure animation. Duplicate or late completion events do not create figures; a new `SubagentStart` can bring an agent back. Saved completed companions from older versions are dismissed automatically too.

## Local data and endpoints

State and the last 300 sanitized events are persisted in `.village/snapshot.json`; `.village/token` authenticates the bridge. Both are ignored by Git. Prompts, tool inputs/outputs, paths and transcripts are excluded from the event journal. Event IDs and tool names are retained locally. Up to 100 actors are kept; older actors are evicted when the limit is reached.

The server listens only on `127.0.0.1:4317`. Browser writes require a local origin plus HttpOnly SameSite cookie; hook writes require the local token. The token is read by the bridge from this project and is never sent to the browser.

- `GET /api/health`: server status
- `GET /api/state`: full sanitized snapshot
- `GET /api/stream`: SSE snapshots with sequence IDs and reconnect state
- `POST /api/events`: normalized hook JSON
- `POST /api/reset`: clears only `demo-*` residents and events

The journal is bounded rather than a full archival log. Server receipt order is the visual event order; it cannot reconstruct exact source ordering when hooks arrive concurrently. A browser refresh restores actor state but starts characters at the gate before routing them to their current station.

## Development

```sh
npm test
npm run build
```

Tests cover independent parallel tools, duplicate starts, reordered completion, permission waits, local authentication, malformed/oversized input, demo reset preservation, navigation and the silent bridge.

Replay the sample story with `npm run demo:replay`, or replay a saved sanitized journal with `npm run demo:replay -- path/to/snapshot.json`. Replay assigns fresh `demo-replay-*` session IDs, so original session state is preserved. Recorded gaps are capped at eight seconds. **Clear demo residents** removes replay characters too.

The scene uses Phaser, TypeScript and Vite. The server uses Node HTTP and SSE. Sprites and scenery are authored as original pixel templates in code, with no external art assets or runtime image-generation dependency.

- `src/client/sprites.ts`: 24×32 heroes and 16×20 companions, four directions and five animation states
- `src/client/scenery.ts`: village art, stations and obstacle grid
- `src/client/world.ts`: actors, navigation, interactions and animation
- `src/shared/reducer.ts`: hook-to-state mapping
- `src/server/app.ts`: local ingestion, persistence and SSE
- `scripts/hook-bridge.mjs`: silent stdin bridge
- `scripts/install-hooks.mjs`: portable settings merge with backup
- `scripts/check-hooks.mjs`: global configuration and receiver check
- `PLAN.md`: design and future art pipeline

Future art can be refined in Aseprite and exported as PNG/JSON atlases without changing the event system. Current art is inspired by the charm of classic top-down adventures and creature games; all character and village designs are original.

## Privacy and public repository contents

The repository contains source code and synthetic demo/test fixtures. Machine-specific hook files are generated on your computer and are excluded from Git, along with `.village/`, `.claude/`, environment files, logs, screenshots and export archives. Never commit your local snapshot or authentication token. The bridge does not retain prompts, transcripts, tool arguments, results or working-directory paths.

Session and agent identifiers are retained in local state to correlate characters. The server keeps up to 500 closed identities to prevent delayed events from recreating dismissed figures. Keep the server on loopback; this application is designed for local use.

This is an independent entertainment project, not an official Anthropic, Nintendo, Zelda or Pokémon product. All included character and scenery designs are original; see [art provenance](assets/PROVENANCE.md).
