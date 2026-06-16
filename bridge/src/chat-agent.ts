import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { anthropicTools, getClient, SYSTEM_PROMPT, MODEL, EFFORT } from "./anthropic.js";
import { returnsImage } from "./commands.js";
import type { BridgeToPanel } from "./types.js";
import type { WsHub } from "./ws-hub.js";

const MAX_TURNS = 24;

type Send = (msg: BridgeToPanel) => void;

/** Conversation memory per panel session (the API is stateless). */
const history: Anthropic.MessageParam[] = [];

export function resetConversation() {
  history.length = 0;
}

/**
 * Run one user turn through Claude with the Premiere tool set, executing tool
 * calls against the panel via the hub, looping until Claude is done.
 */
export async function runChatTurn(
  hub: WsHub,
  userText: string,
  vision: boolean,
  requestId: string,
  send: Send,
): Promise<void> {
  const client = getClient();
  const tools = anthropicTools();

  history.push({ role: "user", content: userText });

  let imagesUsedThisTurn = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        tools,
        messages: history,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      send({ type: "error", requestId, message: `Claude API error: ${msg}` });
      send({ type: "chatDone", requestId });
      return;
    }

    // Stream any text the model produced this step to the panel.
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        send({ type: "chatToken", requestId, text: block.text });
      }
    }

    history.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      // Natural end of the turn.
      send({ type: "chatDone", requestId });
      return;
    }

    // Execute each tool_use block and collect results.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const name = block.name;
      const args = (block.input ?? {}) as Record<string, unknown>;

      send({ type: "chatToolUse", requestId, name, args, status: "start" });

      const visionAllowed =
        vision && returnsImage(name) && imagesUsedThisTurn < config.maxVisionImages;

      const outcome = await hub.runCommand(name, args);

      if (!outcome.ok) {
        send({ type: "chatToolUse", requestId, name, args, status: "error", detail: outcome.error });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: outcome.error ?? "Command failed.",
        });
        continue;
      }

      send({ type: "chatToolUse", requestId, name, args, status: "ok" });

      // For frame exports, attach the image so Claude can actually see it.
      if (returnsImage(name) && visionAllowed) {
        const img = await tryLoadImage(outcome.result);
        if (img) {
          imagesUsedThisTurn++;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: [
              { type: "text", text: summarize(outcome.result) },
              {
                type: "image",
                source: { type: "base64", media_type: img.mediaType, data: img.base64 },
              },
            ],
          });
          continue;
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: summarize(outcome.result),
      });
    }

    history.push({ role: "user", content: toolResults });
  }

  send({
    type: "error",
    requestId,
    message: `Stopped after ${MAX_TURNS} tool turns to avoid a loop.`,
  });
  send({ type: "chatDone", requestId });
}

function summarize(result: unknown): string {
  if (result == null) return "ok";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/**
 * export_frame returns either a path on disk or an inline base64 payload.
 * Resolve it to base64 PNG/JPEG bytes for the Anthropic image block.
 */
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
    const media = path.toLowerCase().endsWith(".jpg") || path.toLowerCase().endsWith(".jpeg")
      ? ("image/jpeg" as const)
      : ("image/png" as const);
    return { base64: buf.toString("base64"), mediaType: media };
  } catch {
    return null;
  }
}
