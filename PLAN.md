# Architecture and design

Claude Pixel Village is a local entertainment view of Claude Code activity. A Claude Code mod delivers sanitized event metadata to a Node receiver; a Phaser scene animates the browser village. The receiver, browser and local Claude session run on the same computer.

```text
Claude Code mod -> POST /api/events -> sanitize/reduce -> persisted snapshot
                                                      |
                                             SSE /api/stream
                                                      |
                                     browser sidebar + Phaser world
```

## Event model

`src/shared/reducer.ts` owns the authoritative resident state. Residents have a stable session/agent key, active tools keyed by `tool_use_id`, completion tombstones independent from the display journal, an explicit permission-wait correlation, and a last-observed timestamp. The last 300 events support the UI timeline; they are not the source of truth for in-progress tools. Status becomes stale after five minutes without an event while active, preserving uncertainty. Stop rests the hero, whereas SessionEnd departs the whole session. A companion returns after SubagentStop and then leaves.

`src/server/app.ts` binds to loopback, authenticates browser writes by origin/cookie and mod writes by a private token, persists sanitized state, and sends SSE snapshots. Streams that stop reading are closed if their buffer grows too large. The server's `close()` helper ends open streams before closing. Browser-only demo reset preserves real sessions. The mod queues metadata while the receiver is unavailable and reads the token on delivery retry.

Only metadata needed for identity and activity is retained. Prompts, source code, paths, tool inputs/results, and transcripts never enter the event reducer. See the [README](README.md) for the complete privacy and setup guide.

## Visual model

`src/client/scenery.ts` draws the original top-down village and its walkability grid. `src/client/navigation.ts` routes around solid props. `src/client/world.ts` assigns station slots, animates residents, gives each station a distinct action, provides selection/zoom, draws earned decorative banners, and applies an optional night overlay. `src/client/sprites.ts` generates pixel adventurers and companions from code-native templates, palettes, and look variants. The sidebar is ordinary HTML for accessible status, search, attention, timeline, and controls. Custom names, looks, night mode and gentle sounds are browser-local preferences.

The world uses nearest-neighbor rendering and a fixed feet anchor. Reduced motion follows the browser preference and can be toggled on the map. Crowded stations spread residents in rings; occupancy and pathfinding should be checked together when adding props or stations.

## Project boundaries

The village depicts events it can observe; it does not infer Claude's private thoughts or judge productivity. A tool name maps to a playful station category. Standard events do not supply a universal nested subagent parent, so companions are grouped by session. Decorative progress counts observed TaskCompleted events only and is capped visually. The local mod is the supported connection path. A one-time cleanup command remains for users migrating from older settings hooks; the old installer and bridge are retired.

## Verify changes

```sh
npm test
npm run build
npm run mod:prepare
claude plugin validate ./mod
claude plugin test ./mod
```

Also run the built server and visit the browser at desktop and narrow widths. Check demo start/stop, attention, nickname/look persistence, night/motion settings, and SSE reconnect. Native mod validation checks API shape; a fresh real Claude session is the event-delivery check. CI runs the core tests/build across operating systems and supported Node versions.

See [art provenance](assets/PROVENANCE.md) before adding visual assets. The [overview visual](public/village-preview.svg) is a hand-authored SVG derived from the same village design. Phaser and npm dependencies retain their own licenses.
