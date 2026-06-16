# Premiere Pro Connection — Claude inside Adobe Premiere Pro

Chat with Claude **inside Premiere Pro** (a dockable panel) and let it actually
*do the editing* — cut, trim, transitions, titles/Essential Graphics, Lumetri
color, fix burns/blown highlights, organize bins, export — driving Premiere's
scripting API in an agent loop.

The exact same "Premiere brain" is also exposed as an **MCP server**, so you can
drive Premiere from **any MCP-capable tool** — Claude Desktop, Claude Code,
VS Code, Cursor, Antigravity — using a subscription you already pay for instead
of per-token API billing. It's all just a folder, so it's easy to **share**.

> ⚠️ **Status: v1 scaffold, not yet tested against a live Premiere install.**
> The architecture, bridge, MCP server, chat UI, and a real set of Premiere
> actions are implemented. The Premiere-specific ExtendScript needs to be
> exercised against your actual Premiere version and iterated on (you run it,
> paste errors, we fix). Spots that depend on your Premiere version are marked
> `// VERIFY:` in `panel/host/index.jsx`.

---

## What it can do (v1 action set)

| Area | Examples |
|---|---|
| **See everything** | read the timeline (tracks, clips, in/out, selection), list bins/media, **export a frame so Claude can visually inspect it** |
| **Cutting & assembly** | import media, create sequences, append/insert/overwrite clips, razor, trim, ripple-delete, move playhead |
| **Transitions & effects** | apply transitions, apply effects, set effect parameters, add keyframes |
| **Titles & Essential Graphics** | create text / lower-thirds, import & populate MOGRTs |
| **Color (Lumetri)** | apply Lumetri presets, set exposure/contrast/white-balance/highlights/shadows, **fix burns** via an export-frame → analyze → correct loop |
| **Organize & export** | create bins, move items, add markers, export via Adobe Media Encoder |

The full, current list is generated from code — see [`docs/TOOLS.md`](docs/TOOLS.md).

---

## How it fits together

```
   Adobe Premiere Pro
   ┌───────────────────────────────────────────────┐
   │  CEP Panel  (panel/)                           │
   │   • chat UI                                     │
   │   • runs edits/color/frame-export via          │
   │     ExtendScript (host/index.jsx)              │
   └───────────────┬───────────────────────────────┘
                   │  WebSocket (localhost)
                   ▼
   ┌───────────────────────────────────────────────┐
   │  Local Bridge  (bridge/)  — "the local proxy"  │
   │   • holds your Claude API key (panel chat mode)│
   │   • IS an MCP server (Streamable HTTP)         │
   │   • one Zod-defined tool registry drives both  │
   └──────────┬───────────────────────┬────────────┘
              │ MCP                    │ Claude API (panel chat only)
              ▼                        ▼
   Claude Desktop / Claude Code /   api.anthropic.com
   VS Code / Cursor / Antigravity   (model: claude-opus-4-8)
   (drive Premiere on a subscription = low cost + shareable)
```

Two ways to use the same brain:

1. **In-panel chat** — type in Premiere; the bridge runs a Claude agent loop
   (your API key) and executes actions. Best for a self-contained experience.
2. **From an IDE via MCP** — connect VS Code / Cursor / Claude Desktop / Claude
   Code / Antigravity to the bridge's MCP endpoint and drive Premiere from
   there. Best for **cost** (subscription, not per-token) and power-users.

You can use either or both. See [`docs/COST.md`](docs/COST.md) for the
cost/MCP-vs-API explanation.

---

## Quick start

1. **Bridge** (the brain):
   ```bash
   cd bridge
   cp .env.example .env      # add your Claude API key (only needed for panel chat)
   npm install
   npm run dev               # starts WebSocket hub + MCP server on 127.0.0.1:3030
   ```
2. **Panel** (inside Premiere): see [`docs/INSTALL.md`](docs/INSTALL.md) — copy
   `panel/` into your CEP extensions folder, enable unsigned panels, restart
   Premiere, open **Window → Extensions → Claude for Premiere**.
3. **(Optional) Connect an IDE** over MCP: see [`docs/IDE-SETUP.md`](docs/IDE-SETUP.md).

Full, OS-specific steps live in [`docs/INSTALL.md`](docs/INSTALL.md).

---

## Honest caveats

- **Not yet live-tested in Premiere** (no Premiere in the build sandbox). The
  bridge/MCP/UI are real; the ExtendScript needs iteration on your machine.
- **Premiere API limits.** Editing, assembly, titles, Lumetri color, and export
  are well-supported. *Deep* motion graphics (complex animation) is partly
  After Effects territory; in Premiere we work through Essential Graphics /
  MOGRTs and keyframes.
- **Vision costs tokens.** "Seeing" frames means sending images to Claude —
  great for fixing color/burns, but it adds cost. Toggle it per request.
- **CEP vs UXP.** v1 targets **CEP** (mature, full ExtendScript automation,
  works across current Premiere versions). A UXP migration is noted in
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Repo layout

```
bridge/    Node/TypeScript: WebSocket hub + MCP server + Claude chat agent
panel/     Adobe CEP extension: chat UI + ExtendScript Premiere actions
docs/      Install, IDE setup, cost, architecture, tool reference
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.
