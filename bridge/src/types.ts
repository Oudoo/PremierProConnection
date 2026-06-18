// Wire protocol between the bridge and the Premiere CEP panel (over WebSocket),
// plus the shared command-result shape used by both the MCP server and the
// in-panel chat agent.

/** A command the bridge asks the panel to run against Premiere (ExtendScript). */
export interface PanelCommandRequest {
  type: "command";
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** The panel's reply after running an ExtendScript command. */
export interface PanelCommandResult {
  type: "commandResult";
  id: string;
  ok: boolean;
  /** JSON-serialisable result on success. */
  result?: unknown;
  /** Human-readable error on failure. */
  error?: string;
}

/** Panel → bridge: a chat message typed by the user in the panel. */
export interface PanelChatMessage {
  type: "chat";
  requestId: string;
  text: string;
  /** Let Claude export & inspect frames for this turn (vision). */
  vision?: boolean;
}

/** Panel → bridge: handshake. */
export interface PanelHello {
  type: "hello";
  role: "panel";
  /** Optional info about the Premiere host (version, OS). */
  app?: { name?: string; version?: string; os?: string };
}

export type PanelToBridge =
  | PanelHello
  | PanelChatMessage
  | PanelCommandResult
  | { type: "cancel"; requestId: string };

// Bridge → panel messages.
export type BridgeToPanel =
  | { type: "ready"; tools: string[]; userName?: string }
  | PanelCommandRequest
  | { type: "chatToken"; requestId: string; text: string }
  | {
      type: "chatToolUse";
      requestId: string;
      name: string;
      args: Record<string, unknown>;
      status: "start" | "ok" | "error";
      detail?: string;
    }
  | { type: "chatDone"; requestId: string }
  | { type: "error"; requestId?: string; message: string };

/** Normalised result of executing a Premiere command, from the panel. */
export interface CommandOutcome {
  ok: boolean;
  result?: unknown;
  error?: string;
}
