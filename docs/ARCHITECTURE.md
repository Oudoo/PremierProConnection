# Architecture

## Goal

One "Premiere brain" that can be driven **either** from a chat panel inside
Premiere **or** from any MCP-capable IDE — and that can *see* the footage. Built
so it's shareable and so cost can be routed through a subscription.

## Components

```
 ┌──────────────────────────── Premiere Pro ────────────────────────────┐
 │  panel/  (CEP extension)                                              │
 │    index.html ─ chat UI                                               │
 │    client/main.js ─ WebSocket client; dispatches commands to JSX      │
 │    client/CSInterface.js ─ bridge to the host                         │
 │    host/index.jsx ─ ExtendScript: timeline read, edits, Lumetri,      │
 │                     frame export, AME export  (CLAUDE.run)            │
 └───────────────────────────────┬──────────────────────────────────────┘
                                  │ WebSocket  ws://127.0.0.1:3031
                                  ▼
 ┌──────────────────────────── bridge/ (Node) ──────────────────────────┐
 │  ws-hub.ts ─ owns the panel socket; runCommand(name,args)            │
 │  commands.ts ─ ONE Zod catalog of Premiere actions (source of truth) │
 │  mcp-server.ts ─ Streamable HTTP MCP at /mcp  (Zod shape → tools)    │
 │  chat-agent.ts ─ Claude agent loop for the panel (Zod → JSON schema) │
 │  anthropic.ts ─ Claude client (model claude-opus-4-8, tool use)      │
 │  index.ts ─ Express: /mcp + /health, starts the WS hub               │
 └──────────┬─────────────────────────────────────┬─────────────────────┘
            │ MCP (HTTP)                           │ Claude API (panel chat)
            ▼                                       ▼
   IDEs: Claude Desktop / Claude Code /        api.anthropic.com
   VS Code / Cursor / Antigravity              (tool use / vision)
```

## Data flow — a single edit

1. **Request.** User types in the panel **or** an IDE issues an MCP tool call.
2. **Decide.** For panel chat, `chat-agent.ts` asks Claude (with the tool
   catalog) what to do; Claude returns `tool_use` blocks. For IDE/MCP, the IDE's
   model decides and calls the MCP tool directly.
3. **Execute.** Either path calls `hub.runCommand(name, args)`. The hub sends a
   `command` message over WebSocket to the panel.
4. **Act.** `main.js` runs `CLAUDE.run(name, argsJson)` in ExtendScript; the
   handler manipulates the Premiere DOM and returns `{ ok, result }`.
5. **Return.** The result flows back to the caller. For `export_frame`, the
   bridge reads the PNG and returns it as an **image** so the model can *see* it.
6. **Loop.** The agent repeats until the task is done (e.g. export frame →
   inspect → adjust Lumetri → export frame → confirm).

## Why one Zod catalog

`commands.ts` defines each action once as a Zod schema. From it we derive:
- **MCP tools** — `registerTool(name, { inputSchema: schema.shape }, …)`.
- **Anthropic tools** — `zod-to-json-schema(schema)`.
- **Docs** — `npm run tools` → `docs/TOOLS.md`.

Add an action in one place and it appears in the panel chat, every IDE, and the
docs. The matching ExtendScript handler goes in `panel/host/index.jsx`.

## "Seeing everything"

- **Structure:** `get_timeline_state` / `list_project_items` give the model the
  tracks, clips, in/out points, selection, playhead, and media — so it knows
  exactly what it's editing.
- **Pixels:** `export_frame` renders a frame to PNG; the bridge feeds it to the
  model as an image. That's how it judges exposure, **blown highlights/burns**,
  white balance, and framing — then fixes them with `set_lumetri` and re-checks.

## Trust & safety

- Binds to `127.0.0.1` only. No inbound internet exposure.
- API key lives in `bridge/.env` (gitignored); the panel never holds it.
- Destructive actions (`delete`, `ripple_delete`, `overwrite`) are flagged in
  the catalog; `CONFIRM_DESTRUCTIVE` is reserved for an in-panel confirm step.

## CEP now, UXP later

v1 targets **CEP** because its ExtendScript DOM has the most complete automation
coverage (timeline, Lumetri, QE operations, AME export) and works across current
Premiere versions. The bridge/MCP/UI layers are platform-agnostic — only
`panel/` is CEP-specific. A future **UXP** plugin can reuse the bridge unchanged
by swapping `panel/host/*` for UXP's `premierepro` API and the CEP socket glue
for UXP networking. Tracked as a follow-up.

## Known version-sensitive spots

Search `// VERIFY:` in `panel/host/index.jsx`. These use APIs whose signature
varies by Premiere version (razor/QE, transitions, MOGRT import, frame export,
speed). They're isolated per-command so fixing one is a small, local change.
