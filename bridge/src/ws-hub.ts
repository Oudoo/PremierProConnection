import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { COMMANDS } from "./commands.js";
import type {
  BridgeToPanel,
  CommandOutcome,
  PanelToBridge,
} from "./types.js";

type ChatHandler = (
  text: string,
  vision: boolean,
  requestId: string,
  send: (msg: BridgeToPanel) => void,
) => Promise<void> | void;

/**
 * The hub owns the single WebSocket connection to the Premiere panel. It:
 *   • relays "command" requests to the panel and resolves their results,
 *   • forwards chat messages to a registered chat handler,
 *   • lets callers know when a panel is connected.
 *
 * `runCommand` is the one function shared by the MCP server and the chat agent.
 */
export class WsHub extends EventEmitter {
  private wss?: WebSocketServer;
  private panel?: WebSocket;
  private pending = new Map<
    string,
    { resolve: (o: CommandOutcome) => void; timer: NodeJS.Timeout }
  >();
  private chatHandler?: ChatHandler;

  onChat(handler: ChatHandler) {
    this.chatHandler = handler;
  }

  get connected(): boolean {
    return this.panel?.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.wss = new WebSocketServer({ host: config.host, port: config.wsPort });
    this.wss.on("connection", (ws) => this.handleConnection(ws));
    this.wss.on("listening", () =>
      console.log(`[ws]  panel hub listening on ws://${config.host}:${config.wsPort}`),
    );
    this.wss.on("error", (err) => console.error("[ws]  server error:", err));
  }

  private handleConnection(ws: WebSocket) {
    // One panel at a time; the newest wins.
    if (this.panel && this.panel.readyState === WebSocket.OPEN) {
      this.panel.close(1000, "replaced by a new panel connection");
    }
    this.panel = ws;
    console.log("[ws]  panel connected");

    ws.on("message", (data) => {
      let msg: PanelToBridge;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        console.warn("[ws]  dropped non-JSON message from panel");
        return;
      }
      this.onPanelMessage(msg, ws);
    });

    ws.on("close", () => {
      if (this.panel === ws) this.panel = undefined;
      console.log("[ws]  panel disconnected");
      this.emit("panel-disconnected");
    });

    ws.on("error", (err) => console.error("[ws]  socket error:", err));
  }

  private onPanelMessage(msg: PanelToBridge, ws: WebSocket) {
    switch (msg.type) {
      case "hello": {
        this.send({ type: "ready", tools: COMMANDS.map((c) => c.name) });
        this.emit("panel-connected", msg.app);
        console.log(
          `[ws]  panel hello${msg.app?.version ? ` — Premiere ${msg.app.version}` : ""}`,
        );
        break;
      }
      case "commandResult": {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(msg.id);
        entry.resolve({ ok: msg.ok, result: msg.result, error: msg.error });
        break;
      }
      case "chat": {
        if (!this.chatHandler) {
          this.send({
            type: "error",
            requestId: msg.requestId,
            message: "No chat handler is configured (is ANTHROPIC_API_KEY set?).",
          });
          this.send({ type: "chatDone", requestId: msg.requestId });
          return;
        }
        Promise.resolve(
          this.chatHandler(msg.text, msg.vision ?? false, msg.requestId, (m) =>
            this.send(m),
          ),
        ).catch((err) => {
          this.send({
            type: "error",
            requestId: msg.requestId,
            message: String(err?.message ?? err),
          });
          this.send({ type: "chatDone", requestId: msg.requestId });
        });
        break;
      }
      case "cancel":
        this.emit("cancel", msg.requestId);
        break;
    }
  }

  send(msg: BridgeToPanel): void {
    if (this.panel?.readyState === WebSocket.OPEN) {
      this.panel.send(JSON.stringify(msg));
    }
  }

  /**
   * Ask the panel to run a Premiere command and await its result.
   * Used by BOTH the MCP server and the chat agent.
   */
  runCommand(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 120_000,
  ): Promise<CommandOutcome> {
    if (!this.connected) {
      return Promise.resolve({
        ok: false,
        error:
          "The Premiere panel is not connected. Open Premiere Pro and the 'Claude for Premiere' panel (Window → Extensions).",
      });
    }
    const id = randomUUID();
    return new Promise<CommandOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: `Command '${name}' timed out after ${timeoutMs}ms.` });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.send({ type: "command", id, name, args });
    });
  }
}

export const hub = new WsHub();
