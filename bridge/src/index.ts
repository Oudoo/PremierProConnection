import express from "express";
import { config, hasApiKey } from "./config.js";
import { hub } from "./ws-hub.js";
import { createMcpHttpHandlers } from "./mcp-server.js";
import { runChatTurn, resetConversation } from "./chat-agent.js";
import { COMMANDS } from "./commands.js";

function banner() {
  console.log("");
  console.log("  Claude for Premiere — local bridge");
  console.log("  ──────────────────────────────────");
  console.log(`  MCP (for IDEs):  http://${config.host}:${config.httpPort}/mcp`);
  console.log(`  Panel WebSocket: ws://${config.host}:${config.wsPort}`);
  console.log(`  Model (panel chat): ${config.model}  effort=${config.effort}`);
  console.log(`  Tools registered:   ${COMMANDS.length}`);
  console.log(
    `  Panel chat:         ${hasApiKey() ? "enabled (API key found)" : "DISABLED (no ANTHROPIC_API_KEY) — IDE/MCP still works"}`,
  );
  console.log(`  Scratch dir:        ${config.scratchDir}`);
  console.log("");
}

function main() {
  // Wire the in-panel chat to the agent loop.
  hub.onChat((text, vision, requestId, send) => {
    if (text.trim() === "/reset") {
      resetConversation();
      send({ type: "chatToken", requestId, text: "Conversation reset." });
      send({ type: "chatDone", requestId });
      return;
    }
    if (!hasApiKey()) {
      send({
        type: "error",
        requestId,
        message:
          "In-panel chat needs ANTHROPIC_API_KEY in bridge/.env. " +
          "Alternatively drive Premiere from an IDE over MCP (see docs/COST.md).",
      });
      send({ type: "chatDone", requestId });
      return;
    }
    return runChatTurn(hub, text, vision, requestId, send);
  });

  hub.start();

  // HTTP server: MCP endpoint + health.
  const app = express();
  app.use(express.json({ limit: "16mb" }));

  const { handlePost, handleSessionRequest } = createMcpHttpHandlers(hub);
  app.post("/mcp", handlePost);
  app.get("/mcp", handleSessionRequest);
  app.delete("/mcp", handleSessionRequest);

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      panelConnected: hub.connected,
      panelChat: hasApiKey(),
      tools: COMMANDS.length,
    });
  });

  app.listen(config.httpPort, config.host, () => {
    banner();
  });
}

main();
