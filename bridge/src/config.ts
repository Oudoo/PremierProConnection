import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v == null || v === "") return dflt;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function int(v: string | undefined, dflt: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : dflt;
}

const scratchDir =
  process.env.SCRATCH_DIR && process.env.SCRATCH_DIR.trim() !== ""
    ? resolve(process.env.SCRATCH_DIR)
    : resolve(__dirname, "..", ".scratch");

mkdirSync(scratchDir, { recursive: true });

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? "",
  model: process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-8",
  effort: (process.env.CLAUDE_EFFORT?.trim() || "high") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",
  host: process.env.HOST?.trim() || "127.0.0.1",
  httpPort: int(process.env.HTTP_PORT, 3030),
  wsPort: int(process.env.WS_PORT, 3031),
  scratchDir,
  maxVisionImages: int(process.env.MAX_VISION_IMAGES, 2),
  confirmDestructive: bool(process.env.CONFIRM_DESTRUCTIVE, true),
  /** Optional: how Claude should address you (e.g. "Oudo"). */
  userName: process.env.USER_NAME?.trim() || "",
};

export function hasApiKey(): boolean {
  return config.anthropicApiKey.length > 0;
}
