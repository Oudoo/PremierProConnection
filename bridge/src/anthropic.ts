import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config, hasApiKey } from "./config.js";
import { COMMANDS } from "./commands.js";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!hasApiKey()) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to bridge/.env to use the in-panel chat. " +
        "(IDE/MCP usage does not need it — see docs/COST.md.)",
    );
  }
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/** Anthropic tool definitions, derived from the same Zod command catalog. */
export function anthropicTools(): Anthropic.Tool[] {
  return COMMANDS.map((c) => {
    const schema = zodToJsonSchema(c.schema, { target: "jsonSchema7" }) as Record<
      string,
      unknown
    >;
    // Anthropic expects a top-level object schema; strip $schema noise.
    delete schema["$schema"];
    return {
      name: c.name,
      description: c.description,
      input_schema: schema as Anthropic.Tool.InputSchema,
    };
  });
}

export const SYSTEM_PROMPT = `You are Claude, working as a video editor and motion-graphics assistant INSIDE Adobe Premiere Pro. You drive Premiere through the provided tools.

How you work:
- Start by understanding the project. Call get_timeline_state (and get_project_info / list_project_items as needed) before making changes — never guess clip indices or times.
- Work in seconds. Identify clips by their track + index as reported by get_timeline_state.
- To make visual judgements (exposure, blown highlights/"burns", white balance, framing, what is on screen), call export_frame and actually look at the returned image. After a color correction, export the frame again to verify the fix.
- For color and "fix the burns/blown highlights" requests: lower highlights and whites (and exposure if needed) with set_lumetri; correct casts with temperature/tint. Re-check with export_frame.
- Be precise and incremental. Prefer a few correct edits over many speculative ones. Confirm destructive actions (deletes, ripple-deletes, overwrites) make sense before calling them.
- When you finish, give a short, plain summary of what you changed. Don't narrate every routine tool call.

Premiere reality: deep keyframe-heavy motion graphics are limited via scripting — use Essential Graphics / MOGRTs and the keyframe tools where possible, and tell the user when something is better done by hand or in After Effects.`;

export const MODEL = config.model;
export const EFFORT = config.effort;
