# Claude Pixel Village

Design baseline: local-only entertainment website for visualizing Claude Code session and subagent activity.

Implementation status: playable village, original animated art, simulator, authenticated event service, persistence, replay, portable hook installer and lifecycle cleanup are implemented. The build and 22 regression tests pass. Local Claude desktop Code integration has been verified on Windows; native macOS verification, Aseprite refinement and optional sound remain future work.

## Experience

A cozy top-down adventure village inspired by the pixel scale, color and playful movement of classic Zelda and Pokemon. Use original adventurers and creature designs. Each Claude session has a stable adventurer; its subagents become smaller companions sharing its colors. Multiple sessions occupy the same village.

The village contains a library (reading), forge (writing/editing), telescope (research), training yard (commands/tests), quest board (tasks), campfire (rest), and beds (sleep). Characters walk around obstacles, face their destination, animate at stations, greet companions and celebrate completed work. Clicking a character shows its session, current activity and companions.

Hook events drive the story; they do not supply continuous motion or exact knowledge of Claude's thoughts. Movement, social interactions and idle behavior are generated locally. A tool category is a playful interpretation, not proof of the semantic task performed.

## Technical decision

Use TypeScript + Vite + Phaser for the browser, and a small Node server for local event ingestion and static hosting. Avoid React for the first version: the main experience is a game scene, with a small HTML overlay.

Data flow:

```text
Claude command hook -> Node stdin bridge -> POST /api/events
                                            |
                                 normalize + reduce + journal
                                            |
                                     SSE /api/stream
                                            |
                                   browser world controller
                                            |
                                path + animation + interaction
```

SSE fits one-way updates; browser controls use normal POST endpoints. Bind to 127.0.0.1. Use a local event token, validate request origin/body size, and retain only needed metadata. No prompt text, tool contents, transcripts or file contents in the default event log.

Bridge reads JSON stdin, extracts metadata, sends a short request, and exits successfully with no stdout. A stopped/unreachable server must not affect Claude. Version-check command-hook configuration before installation. Keep hook configuration additive and reversible.

Server assigns receive sequence and timestamp, offers a snapshot on connect, and maintains a bounded journal for replay/debugging. Snapshot plus subsequent events must have a sequence boundary to prevent reconnect races. Deduplicate correlated tool events; tolerate duplicate lifecycle events, resumed sessions, out-of-order delivery, and browser reconnects. Simulator and replay use the same normalized event contract as real hooks.

## State and movement

Separate reducer state (what an actor should do) from visual state (where it is, how it moves). Actor key is session_id plus agent_id when supplied. Correlate tools with tool_use_id. SessionStart on resume reuses the existing hero. SubagentStop finishes a companion's work; it does not terminate its parent.

Core states: arriving, thinking, walking, working, waiting, celebrating, resting, sleeping, leaving, interrupted. Waiting for user input overrides decorative activity. Track active tools as a set so one completed parallel tool cannot incorrectly mark the actor idle. Stop means end of a response: main character rests, then sleeps after a configurable idle interval. SessionEnd initiates departure. Unexpected disappearance gets an unknown/stale badge rather than a falsely certain completion.

Use a tile walkability grid and A* navigation, with separate station interaction slots. Depth-sort by feet position. Rate-limit destination changes and coalesce rapid tool activity so actors do not jitter between stations. Main characters can rest while background companions continue working. Restrict cheerful social behavior to idle actors so it does not hide active work.

Standard hooks expose session/agent identity but do not document a universal parent_agent_id. For MVP, attach companions to the session hero; only show deeper ancestry when explicit correlation is available. Do not infer an exact nested tree from concurrent timing.

## Hook coverage

The current official reference lists more hooks than older examples. Support a versioned event registry, preserve unknown event names for debugging, and install only supported/eligible hooks. Final payload schemas and installed version are checked during implementation.

| Event family | Village behavior |
| --- | --- |
| SessionStart | Spawn or wake the stable hero |
| UserPromptSubmit | Wake, receive a quest, begin thinking |
| UserPromptExpansion | Unroll a quest scroll |
| PreToolUse | Go to the tool's station and work |
| PostToolUse | Complete the correlated action; small success effect |
| PostToolUseFailure | Interrupted animation and error badge |
| PostToolBatch | Gather results after parallel work |
| PermissionRequest, Elicitation | Wait with a question bubble |
| ElicitationResult | Resume after response |
| PermissionDenied | Locked gate/denied badge; no automatic permission changes |
| Notification | Contextual bell or bubble |
| MessageDisplay | Optional speech indicator; throttle heavily, no text capture by default |
| SubagentStart | Spawn a smaller companion and greet the hero |
| SubagentStop | Companion returns with a sparkle for 12 seconds, then departs and is removed |
| TaskCreated | Add a visual quest marker |
| TaskCompleted | Celebration at quest board |
| Stop | Rest at campfire, then sleep |
| StopFailure | Interrupted/worried pose |
| TeammateIdle | Idle/rest behavior for the known teammate |
| PreCompact, PostCompact | Organize backpack, then resume |
| Setup | Prepare the village/workbench |
| InstructionsLoaded | Read a scroll |
| ConfigChange | Adjust equipment |
| CwdChanged, DirectoryAdded | Move project sign/add a destination marker |
| FileChanged | Station pulse for configured watched files |
| PreModelSwitch, PostModelSwitch | Costume change effect |
| WorktreeRemove | Special integration only: remove a known outpost |
| SessionEnd | Hero and its companions wave goodbye and depart |
| WorktreeCreate | Special handling only: this hook replaces default worktree creation |

“All hooks” means visual coverage where observable safely. Keep worktree lifecycle hooks out of the observer configuration: WorktreeCreate takes ownership of Git worktree creation, and related removal belongs to that integration. Start with indirect visualization of related tool activity; an explicit creation/removal wrapper is a separate advanced feature. FileChanged also requires explicit watch matchers rather than an indiscriminate filesystem watch.

## Character creation

Start with deterministic pixel templates: hero frames 24x32, companion frames 16x20, terrain tiles 16x16. Use a shared limited palette and a fixed feet anchor. Derive colors, hair, hats and accessories from session identity. Author companions at their smaller size rather than fractionally shrinking heroes.

Four facing directions, four walk frames per direction, two idle frames per direction, and short work, think, sleep and cheer sequences. Arrival/departure effects and status bubbles supplement reusable animation; we do not need a separate sprite sheet for every hook.

Render with nearest-neighbor filtering and integer zoom. Walking cycles around 6–8 fps while world position updates smoothly. Keep simulation coordinates precise and round for display. Reduce background-tab activity and cap particles.

Upgrade art using Aseprite: hand-author/refine source sprites, tag animation names, export PNG + JSON atlas, validate frame bounds/anchors, and load animations into Phaser. AI images are useful for concept exploration; generated animation sheets need frame consistency and alignment checks before use. No image-generation API dependency at runtime.

Optional CC0 Kenney Tiny Town/Tiny Dungeon assets can accelerate scenery. Keep an asset provenance file even for public-domain packs. Prefer original figures over importing recognizable franchise characters.

## Build sequence and agent assignments

1. **Playable simulator.** Scaffold Phaser scene and original animated atlas; implement walkability, stations, two heroes and companions. Add demo controls for start, prompt, tool success/failure, permission wait, subagent start/stop, stop and end. This proves the entertainment experience without Claude.
2. **Event service.** Add schema, reducer, local ingestion, SSE snapshot/reconnect, journal and replay. Verify parallel tools, duplicate starts and resumed sessions.
3. **Claude integration.** Verify installed Claude version, implement stdin bridge, generate an additive hook configuration and document Windows setup. Validate a real session and subagent. Do not modify global user settings automatically during development.
4. **Expanded hooks and interactions.** Cover eligible event registry, custom tool categorization, sleep timing, companion delivery/greetings, project selection and status inspection.
5. **Art polish.** Refine sprites and scenery, sound opt-in, camera zoom, accessible status overlay and reduced-motion support.

Implementation can delegate three bounded lanes after the shared event contract is established: world/navigation, sprites/scenery, and bridge/server. One owner integrates and checks the full flow. Research agents already independently assessed hooks, rendering and sprite production.

Proposed structure:

```text
src/shared/       event contract and reducer
src/client/       Phaser scenes, actors, paths, UI
src/server/       HTTP, SSE, journal
scripts/          hook bridge, config generator, sprite export
assets/           original sources, exported atlases, provenance
fixtures/         demo/replay event sequences
```

## Acceptance checks

- New session creates exactly one stable hero; resume wakes that hero.
- Prompt and tools visibly trigger walking and animation at appropriate stations.
- Parallel tool completion never falsely idles an actor with ongoing work.
- Two concurrent subagents remain distinct and interact with their hero.
- Stop rests the hero; SessionEnd makes it depart; background companions can continue.
- Refresh/reconnect reconstructs the current village without duplicate actors.
- Stopped server, malformed input and network timeout cannot interrupt Claude.
- Pixel edges and feet remain stable at supported integer zoom levels.
- Simulator covers lifecycle, errors, waits, concurrency and replay.

## Primary references

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Phaser sprites](https://docs.phaser.io/phaser/concepts/gameobjects/sprite)
- [Phaser animation system](https://docs.phaser.io/phaser/concepts/animations)
- [Phaser configuration](https://docs.phaser.io/api-documentation/constant/core)
- [Pixi ticker comparison](https://pixijs.com/8.x/guides/components/application/ticker-plugin)
- [Aseprite sprite sheets](https://www.aseprite.org/docs/sprite-sheet/)
- [Aseprite CLI export](https://www.aseprite.org/docs/cli/)
- [Kenney Tiny Town](https://kenney.nl/assets/tiny-town)
- [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon)

