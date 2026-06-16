import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { COMMANDS, returnsImage } from "./commands.js";
import { config } from "./config.js";
import type { WsHub } from "./ws-hub.js";

/**
 * Build a fresh MCP server with the Premiere tool set. Every tool simply runs
 * the corresponding Premiere command through the hub — so an IDE (Claude
 * Desktop, VS Code, Cursor, Claude Code, Antigravity) drives Premiere exactly
 * like the in-panel chat does.
 */
function buildServer(hub: WsHub): McpServer {
  const server = new McpServer({
    name: "premiere-claude",
    version: "0.1.0",
  });

  for (const cmd of COMMANDS) {
    server.registerTool(
      cmd.name,
      {
        title: cmd.name,
        description: cmd.description,
        inputSchema: cmd.schema.shape,
      },
      async (args: Record<string, unknown>) => {
        const outcome = await hub.runCommand(cmd.name, args ?? {});
        if (!outcome.ok) {
          return {
            isError: true,
            content: [{ type: "text", text: outcome.error ?? "Command failed." }],
          };
        }

        // Attach the rendered frame for vision-capable IDE clients.
        if (returnsImage(cmd.name)) {
          const img = await tryLoadImage(outcome.result);
          if (img) {
            return {
              content: [
                { type: "text", text: stringify(outcome.result) },
                { type: "image", data: img.base64, mimeType: img.mediaType },
              ],
            };
          }
        }

        return { content: [{ type: "text", text: stringify(outcome.result) }] };
      },
    );
  }

  return server;
}

function stringify(result: unknown): string {
  if (result == null) return "ok";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

async function tryLoadImage(
  result: unknown,
): Promise<{ base64: string; mediaType: "image/png" | "image/jpeg" } | null> {
  try {
    const r = result as Record<string, unknown> | undefined;
    if (r && typeof r["base64"] === "string") {
      const media = r["mediaType"] === "image/jpeg" ? "image/jpeg" : "image/png";
      return { base64: r["base64"] as string, mediaType: media };
    }
    const path = r && typeof r["path"] === "string" ? (r["path"] as string) : undefined;
    if (!path) return null;
    const buf = await readFile(path);
    const media =
      path.toLowerCase().endsWith(".jpg") || path.toLowerCase().endsWith(".jpeg")
        ? ("image/jpeg" as const)
        : ("image/png" as const);
    return { base64: buf.toString("base64"), mediaType: media };
  } catch {
    return null;
  }
}

/**
 * Streamable HTTP handlers for Express, with per-session transports
 * (the canonical MCP server pattern). Mount POST/GET/DELETE on /mcp.
 */
export function createMcpHttpHandlers(hub: WsHub) {
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  async function handlePost(req: Request, res: Response) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      if (sessionId || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "No valid session; send an initialize request first." },
          id: null,
        });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) delete transports[transport!.sessionId];
      };
      const server = buildServer(hub);
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  }

  async function handleSessionRequest(req: Request, res: Response) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session id.");
      return;
    }
    await transport.handleRequest(req, res);
  }

  return { handlePost, handleSessionRequest };
}

export const mcpInfo = { host: config.host, port: config.httpPort, path: "/mcp" };
