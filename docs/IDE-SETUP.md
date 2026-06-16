# Drive Premiere from an IDE (MCP)

The bridge is also an **MCP server**, so any MCP-capable tool can call the same
Premiere actions. This lets you drive Premiere from **Claude Desktop, Claude
Code, VS Code, Cursor, Antigravity** — using that tool's own Claude
subscription instead of per-token API billing (see [COST.md](COST.md)).

**Prerequisites for all of these:**
1. The **bridge is running** (`cd bridge && npm run dev`).
2. **Premiere + the panel are open and connected** (the panel relays commands
   into Premiere). The MCP tools fail with a clear message if the panel isn't
   connected.

The MCP endpoint is:

```
http://127.0.0.1:3030/mcp        (Streamable HTTP)
```

---

## Clients that support URL/HTTP MCP servers directly

### Claude Code
```bash
claude mcp add --transport http premiere http://127.0.0.1:3030/mcp
```
Then in a session: *"Use the premiere tools to read my timeline and fix the
exposure on the second clip."*

### Cursor — `.cursor/mcp.json` (or Settings → MCP)
```json
{
  "mcpServers": {
    "premiere": { "url": "http://127.0.0.1:3030/mcp" }
  }
}
```

### VS Code (Copilot/agent MCP) — `.vscode/mcp.json`
```json
{
  "servers": {
    "premiere": { "type": "http", "url": "http://127.0.0.1:3030/mcp" }
  }
}
```

### Antigravity / other agentic IDEs
Add an MCP server of type **HTTP / streamable-http** pointing at
`http://127.0.0.1:3030/mcp`. (If it only accepts a command/stdio server, use the
stdio bridge below.)

---

## Clients that only support stdio MCP servers (e.g. Claude Desktop)

Use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) to bridge stdio →
the bridge's HTTP endpoint. No install needed (`npx` fetches it).

**Claude Desktop** — `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "premiere": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3030/mcp"]
    }
  }
}
```

Restart Claude Desktop; you'll see the Premiere tools available. Ask it to read
the timeline and make edits.

---

## What you can ask for

Anything in [TOOLS.md](TOOLS.md). Good starters:

- *"Read the active sequence and summarize what's on each track."*
- *"Export a frame at 12 seconds and tell me if the highlights are blown."*
- *"Pull the highlights and whites down on the first clip of V1 to recover the
  sky, then export the frame again to confirm."*
- *"Add markers at every cut on V1."*
- *"Import these files and build a rough assembly on V1."*

---

## Sharing this with other people

The whole thing is a folder. To share:

1. Zip the repo (or push it to a Git host) and send it.
2. They run the bridge (`npm install && npm run dev`) and install the panel
   ([INSTALL.md](INSTALL.md)).
3. Each person uses **their own** Claude API key (for panel chat) or their own
   IDE subscription (for MCP). No keys are committed — `.env` is gitignored.

For a turnkey share, you can later sign and package the panel as a `.zxp` with
[ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources) so others can install
it without enabling unsigned extensions. (Not required for personal use.)
