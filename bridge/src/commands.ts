import { z } from "zod";

/**
 * The Premiere Pro action catalog.
 *
 * Each command is defined ONCE here with a Zod schema. From this single source
 * we derive:
 *   • MCP tools  (native Zod shape → registerTool)            → for IDEs
 *   • Anthropic tools (Zod → JSON Schema)                     → for panel chat
 *   • The dispatch table the CEP panel uses to run ExtendScript.
 *
 * Every command name maps to a function of the same name in
 * `panel/host/index.jsx`. Keep the two in sync.
 */

export interface CommandDef {
  name: string;
  description: string;
  category:
    | "inspect"
    | "assembly"
    | "edit"
    | "effects"
    | "graphics"
    | "color"
    | "organize"
    | "export";
  schema: z.ZodObject<z.ZodRawShape>;
  /** Hard-to-reverse → may require confirmation in the panel. */
  destructive?: boolean;
  /** Returns image(s) Claude should see (frames/thumbnails). */
  returnsImage?: boolean;
}

const Empty = z.object({});

// Reusable fragments -------------------------------------------------------
const trackIndex = z
  .number()
  .int()
  .min(0)
  .describe("0-based track index (V1 = video track 0, A1 = audio track 0).");

const seconds = (desc: string) => z.number().describe(desc);

export const COMMANDS: CommandDef[] = [
  // ── Inspect ────────────────────────────────────────────────────────────
  {
    name: "get_project_info",
    category: "inspect",
    description:
      "Get the open project: name, path, active sequence, sequence count, and Premiere/host version.",
    schema: Empty,
  },
  {
    name: "list_sequences",
    category: "inspect",
    description: "List every sequence in the project with id, name, and basic settings.",
    schema: Empty,
  },
  {
    name: "get_timeline_state",
    category: "inspect",
    description:
      "Read the active (or named) sequence: video/audio tracks, every clip with name, in/out, start/end (seconds + timecode), the selection, and the playhead position. Use this first to understand what you're editing.",
    schema: z.object({
      sequenceId: z
        .string()
        .optional()
        .describe("Sequence id; omit for the active sequence."),
      includeEffects: z
        .boolean()
        .optional()
        .describe("Also include applied effect names per clip (slower)."),
    }),
  },
  {
    name: "list_project_items",
    category: "inspect",
    description:
      "List the Project panel contents (bins + media): id, name, type, bin path, and media file path where applicable.",
    schema: z.object({
      binPath: z
        .string()
        .optional()
        .describe('Limit to a bin, e.g. "Footage/B-Roll". Omit for the whole project.'),
    }),
  },
  {
    name: "export_frame",
    category: "inspect",
    returnsImage: true,
    description:
      "Render a single frame of the active sequence to a PNG so Claude can VISUALLY inspect it — to judge exposure, blown highlights/burns, white balance, framing, or what is on screen. The image is returned to the model.",
    schema: z.object({
      atSeconds: seconds(
        "Time in the sequence to grab, in seconds. Omit to use the current playhead.",
      ).optional(),
      maxWidth: z
        .number()
        .int()
        .optional()
        .describe("Downscale long edge to this many px to control token cost (default 1280)."),
    }),
  },

  // ── Assembly ───────────────────────────────────────────────────────────
  {
    name: "import_media",
    category: "assembly",
    description: "Import one or more media files into the project (optionally into a bin).",
    schema: z.object({
      paths: z.array(z.string()).min(1).describe("Absolute file paths to import."),
      binPath: z.string().optional().describe('Destination bin, e.g. "Footage". Created if missing.'),
    }),
  },
  {
    name: "create_sequence",
    category: "assembly",
    description:
      "Create a new sequence. Optionally match settings from an existing project item (clip).",
    schema: z.object({
      name: z.string().describe("Name for the new sequence."),
      fromProjectItemId: z
        .string()
        .optional()
        .describe("Create matching this clip's settings (resolution/frame rate)."),
    }),
  },
  {
    name: "append_clip",
    category: "assembly",
    description: "Append a project item (clip) to the end of a track in the active sequence.",
    schema: z.object({
      projectItemId: z.string().describe("The clip to place."),
      videoTrack: trackIndex.optional().describe("Video track index (default 0)."),
      audioTrack: trackIndex.optional().describe("Audio track index (default 0)."),
    }),
  },
  {
    name: "insert_clip",
    category: "assembly",
    description:
      "Insert a clip at a time on a track, pushing later clips right (ripple insert).",
    schema: z.object({
      projectItemId: z.string(),
      atSeconds: seconds("Insertion point in seconds."),
      videoTrack: trackIndex.optional(),
      audioTrack: trackIndex.optional(),
    }),
  },
  {
    name: "overwrite_clip",
    category: "assembly",
    destructive: true,
    description: "Place a clip at a time on a track, overwriting whatever is there.",
    schema: z.object({
      projectItemId: z.string(),
      atSeconds: seconds("Placement point in seconds."),
      videoTrack: trackIndex.optional(),
      audioTrack: trackIndex.optional(),
    }),
  },
  {
    name: "move_playhead",
    category: "assembly",
    description: "Move the playhead (current time indicator) of the active sequence.",
    schema: z.object({ atSeconds: seconds("Target time in seconds.") }),
  },

  // ── Edit ───────────────────────────────────────────────────────────────
  {
    name: "razor_at",
    category: "edit",
    description: "Cut (razor) all clips, or one track's clip, at a time.",
    schema: z.object({
      atSeconds: seconds("Cut point in seconds."),
      videoTrack: trackIndex.optional().describe("Limit to this video track; omit for all tracks."),
    }),
  },
  {
    name: "trim_clip",
    category: "edit",
    description:
      "Trim a clip's in or out point. Identify the clip by track + index (from get_timeline_state).",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0).describe("0-based clip index on that track."),
      newStartSeconds: z.number().optional().describe("New timeline start (moves the head)."),
      newEndSeconds: z.number().optional().describe("New timeline end (moves the tail)."),
    }),
  },
  {
    name: "delete_clip",
    category: "edit",
    destructive: true,
    description: "Delete a clip, leaving a gap (lift). Identify by track + index.",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
    }),
  },
  {
    name: "ripple_delete_range",
    category: "edit",
    destructive: true,
    description:
      "Remove a time range from a track and close the gap (ripple delete), pulling later clips left.",
    schema: z.object({
      startSeconds: seconds("Range start."),
      endSeconds: seconds("Range end."),
      videoTrack: trackIndex.optional().describe("Limit to this track; omit for all."),
    }),
  },
  {
    name: "set_clip_speed",
    category: "edit",
    description: "Change a clip's playback speed / duration (slow-mo, speed-ramp base).",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      speedPercent: z.number().positive().describe("100 = normal, 50 = half speed, 200 = double."),
    }),
  },

  // ── Effects & transitions ────────────────────────────────────────────────
  {
    name: "apply_transition",
    category: "effects",
    description:
      "Apply a video transition (e.g. Cross Dissolve) at a clip edge — start, end, or a cut point.",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      transitionName: z.string().describe('e.g. "Cross Dissolve", "Dip to Black".'),
      edge: z.enum(["start", "end", "both"]).default("end"),
      durationSeconds: z.number().positive().optional().describe("Transition length (default 1s)."),
    }),
  },
  {
    name: "apply_effect",
    category: "effects",
    description: "Apply a video or audio effect to a clip by effect name.",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      effectName: z.string().describe('Match name, e.g. "Gaussian Blur", "Lumetri Color".'),
    }),
  },
  {
    name: "set_effect_param",
    category: "effects",
    description:
      "Set a parameter on an effect already applied to a clip (e.g. Gaussian Blur → Blurriness = 20).",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      effectName: z.string(),
      paramName: z.string(),
      value: z.union([z.number(), z.boolean(), z.array(z.number())]),
    }),
  },
  {
    name: "add_keyframe",
    category: "effects",
    description: "Add a keyframe to an effect parameter at a time (for motion / animation).",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      effectName: z.string(),
      paramName: z.string(),
      atSeconds: seconds("Keyframe time, relative to the sequence."),
      value: z.union([z.number(), z.array(z.number())]),
    }),
  },

  // ── Graphics / titles ─────────────────────────────────────────────────────
  {
    name: "create_text",
    category: "graphics",
    description:
      "Create a text / title graphic (Essential Graphics) on the timeline with the given content.",
    schema: z.object({
      text: z.string().describe("The text to display."),
      atSeconds: seconds("Start time on the timeline.").optional(),
      durationSeconds: z.number().positive().optional().describe("Default 5s."),
      videoTrack: trackIndex.optional().describe("Default the topmost video track."),
      style: z
        .enum(["title", "lower_third", "caption"])
        .optional()
        .describe("Preset layout. Default 'title'."),
    }),
  },
  {
    name: "import_mogrt",
    category: "graphics",
    description:
      "Import a Motion Graphics Template (.mogrt) onto the timeline and optionally fill its text fields.",
    schema: z.object({
      mogrtPath: z.string().describe("Absolute path to the .mogrt file."),
      atSeconds: seconds("Start time on the timeline.").optional(),
      videoTrack: trackIndex.optional(),
      fields: z
        .record(z.string())
        .optional()
        .describe('Field name → value, e.g. {"Headline":"Hello"}.'),
    }),
  },

  // ── Color (Lumetri) ────────────────────────────────────────────────────────
  {
    name: "apply_lumetri_preset",
    category: "color",
    description: "Apply a Lumetri Color preset / LUT (.look or .cube) to a clip.",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      presetPath: z.string().describe("Absolute path to a .look / .cube / .prfpset file."),
    }),
  },
  {
    name: "set_lumetri",
    category: "color",
    description:
      "Apply Lumetri Color Basic-Correction adjustments to a clip — exposure, contrast, highlights, shadows, whites, blacks, saturation, and white balance (temperature/tint). Use this to fix burns/blown highlights (lower highlights/whites) or color casts (temperature/tint). Adds Lumetri Color if absent.",
    schema: z.object({
      videoTrack: trackIndex,
      clipIndex: z.number().int().min(0),
      exposure: z.number().optional().describe("Stops, e.g. -0.4 to recover overexposure."),
      contrast: z.number().optional(),
      highlights: z.number().optional().describe("Negative pulls back blown highlights/burns."),
      shadows: z.number().optional(),
      whites: z.number().optional().describe("Negative tames clipped whites."),
      blacks: z.number().optional(),
      saturation: z.number().optional().describe("100 = unchanged."),
      temperature: z.number().optional().describe("Negative = cooler, positive = warmer."),
      tint: z.number().optional().describe("Green ↔ magenta balance."),
    }),
  },

  // ── Organize ───────────────────────────────────────────────────────────────
  {
    name: "create_bin",
    category: "organize",
    description: "Create a bin (folder) in the Project panel.",
    schema: z.object({
      name: z.string(),
      parentBinPath: z.string().optional().describe('Parent bin, e.g. "Footage". Omit for root.'),
    }),
  },
  {
    name: "move_to_bin",
    category: "organize",
    description: "Move a project item into a bin.",
    schema: z.object({
      projectItemId: z.string(),
      binPath: z.string().describe('Destination bin, e.g. "Footage/Selects".'),
    }),
  },
  {
    name: "add_marker",
    category: "organize",
    description: "Add a marker to the active sequence at a time, with an optional name/comment.",
    schema: z.object({
      atSeconds: seconds("Marker time in seconds."),
      name: z.string().optional(),
      comment: z.string().optional(),
      color: z
        .enum(["green", "red", "purple", "orange", "yellow", "white", "blue", "cyan"])
        .optional(),
    }),
  },
  {
    name: "list_markers",
    category: "organize",
    description: "List all markers on the active sequence.",
    schema: Empty,
  },

  // ── Export ─────────────────────────────────────────────────────────────────
  {
    name: "export_sequence",
    category: "export",
    description:
      "Queue/export the active sequence through Adobe Media Encoder using an export preset (.epr).",
    schema: z.object({
      outputPath: z.string().describe("Absolute output file path."),
      presetPath: z.string().describe("Absolute path to an .epr export preset."),
      useQueue: z
        .boolean()
        .optional()
        .describe("true = add to AME queue; false = export immediately (default true)."),
    }),
  },
];

export const COMMANDS_BY_NAME: Record<string, CommandDef> = Object.fromEntries(
  COMMANDS.map((c) => [c.name, c]),
);

export function isDestructive(name: string): boolean {
  return COMMANDS_BY_NAME[name]?.destructive === true;
}

export function returnsImage(name: string): boolean {
  return COMMANDS_BY_NAME[name]?.returnsImage === true;
}
