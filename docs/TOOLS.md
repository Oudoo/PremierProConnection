# Tool reference (Premiere actions)

_Auto-generated from `bridge/src/commands.ts` (`npm run tools`). The same set powers both the in-panel chat and the MCP server for IDEs._

## Inspect & see

### `get_project_info`

Get the open project: name, path, active sequence, sequence count, and Premiere/host version.

_No parameters._

### `list_sequences`

List every sequence in the project with id, name, and basic settings.

_No parameters._

### `get_timeline_state`

Read the active (or named) sequence: video/audio tracks, every clip with name, in/out, start/end (seconds + timecode), the selection, and the playhead position. Use this first to understand what you're editing.

| Param | Req | Description |
|---|---|---|
| `sequenceId` |  | Sequence id; omit for the active sequence. |
| `includeEffects` |  | Also include applied effect names per clip (slower). |

### `list_project_items`

List the Project panel contents (bins + media): id, name, type, bin path, and media file path where applicable.

| Param | Req | Description |
|---|---|---|
| `binPath` |  | Limit to a bin, e.g. "Footage/B-Roll". Omit for the whole project. |

### `export_frame` — **returns image**

Render a single frame of the active sequence to a PNG so Claude can VISUALLY inspect it — to judge exposure, blown highlights/burns, white balance, framing, or what is on screen. The image is returned to the model.

| Param | Req | Description |
|---|---|---|
| `atSeconds` |  | Time in the sequence to grab, in seconds. Omit to use the current playhead. |
| `maxWidth` |  | Downscale long edge to this many px to control token cost (default 1280). |

## Import & assembly

### `import_media`

Import one or more media files into the project (optionally into a bin).

| Param | Req | Description |
|---|---|---|
| `paths` | ✓ | Absolute file paths to import. |
| `binPath` |  | Destination bin, e.g. "Footage". Created if missing. |

### `create_sequence`

Create a new sequence. Optionally match settings from an existing project item (clip).

| Param | Req | Description |
|---|---|---|
| `name` | ✓ | Name for the new sequence. |
| `fromProjectItemId` |  | Create matching this clip's settings (resolution/frame rate). |

### `append_clip`

Append a project item (clip) to the end of a track in the active sequence.

| Param | Req | Description |
|---|---|---|
| `projectItemId` | ✓ | The clip to place. |
| `videoTrack` |  | Video track index (default 0). |
| `audioTrack` |  | Audio track index (default 0). |

### `insert_clip`

Insert a clip at a time on a track, pushing later clips right (ripple insert).

| Param | Req | Description |
|---|---|---|
| `projectItemId` | ✓ |  |
| `atSeconds` | ✓ | Insertion point in seconds. |
| `videoTrack` |  | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `audioTrack` |  | 0-based track index (V1 = video track 0, A1 = audio track 0). |

### `overwrite_clip` — **destructive**

Place a clip at a time on a track, overwriting whatever is there.

| Param | Req | Description |
|---|---|---|
| `projectItemId` | ✓ |  |
| `atSeconds` | ✓ | Placement point in seconds. |
| `videoTrack` |  | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `audioTrack` |  | 0-based track index (V1 = video track 0, A1 = audio track 0). |

### `move_playhead`

Move the playhead (current time indicator) of the active sequence.

| Param | Req | Description |
|---|---|---|
| `atSeconds` | ✓ | Target time in seconds. |

## Editing

### `razor_at`

Cut (razor) all clips, or one track's clip, at a time.

| Param | Req | Description |
|---|---|---|
| `atSeconds` | ✓ | Cut point in seconds. |
| `videoTrack` |  | Limit to this video track; omit for all tracks. |

### `trim_clip`

Trim a clip's in or out point. Identify the clip by track + index (from get_timeline_state).

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ | 0-based clip index on that track. |
| `newStartSeconds` |  | New timeline start (moves the head). |
| `newEndSeconds` |  | New timeline end (moves the tail). |

### `delete_clip` — **destructive**

Delete a clip, leaving a gap (lift). Identify by track + index.

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |

### `ripple_delete_range` — **destructive**

Remove a time range from a track and close the gap (ripple delete), pulling later clips left.

| Param | Req | Description |
|---|---|---|
| `startSeconds` | ✓ | Range start. |
| `endSeconds` | ✓ | Range end. |
| `videoTrack` |  | Limit to this track; omit for all. |

### `set_clip_speed`

Change a clip's playback speed / duration (slow-mo, speed-ramp base).

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `speedPercent` | ✓ | 100 = normal, 50 = half speed, 200 = double. |

## Effects & transitions

### `apply_transition`

Apply a video transition (e.g. Cross Dissolve) at a clip edge — start, end, or a cut point.

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `transitionName` | ✓ | e.g. "Cross Dissolve", "Dip to Black". |
| `edge` |  |  |
| `durationSeconds` |  | Transition length (default 1s). |

### `apply_effect`

Apply a video or audio effect to a clip by effect name.

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `effectName` | ✓ | Match name, e.g. "Gaussian Blur", "Lumetri Color". |

### `set_effect_param`

Set a parameter on an effect already applied to a clip (e.g. Gaussian Blur → Blurriness = 20).

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `effectName` | ✓ |  |
| `paramName` | ✓ |  |
| `value` | ✓ |  |

### `add_keyframe`

Add a keyframe to an effect parameter at a time (for motion / animation).

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `effectName` | ✓ |  |
| `paramName` | ✓ |  |
| `atSeconds` | ✓ | Keyframe time, relative to the sequence. |
| `value` | ✓ |  |

## Titles & Essential Graphics

### `create_text`

Create a text / title graphic (Essential Graphics) on the timeline with the given content.

| Param | Req | Description |
|---|---|---|
| `text` | ✓ | The text to display. |
| `atSeconds` |  | Start time on the timeline. |
| `durationSeconds` |  | Default 5s. |
| `videoTrack` |  | Default the topmost video track. |
| `style` |  | Preset layout. Default 'title'. |

### `import_mogrt`

Import a Motion Graphics Template (.mogrt) onto the timeline and optionally fill its text fields.

| Param | Req | Description |
|---|---|---|
| `mogrtPath` | ✓ | Absolute path to the .mogrt file. |
| `atSeconds` |  | Start time on the timeline. |
| `videoTrack` |  | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `fields` |  | Field name → value, e.g. {"Headline":"Hello"}. |

## Color (Lumetri)

### `apply_lumetri_preset`

Apply a Lumetri Color preset / LUT (.look or .cube) to a clip.

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `presetPath` | ✓ | Absolute path to a .look / .cube / .prfpset file. |

### `set_lumetri`

Apply Lumetri Color Basic-Correction adjustments to a clip — exposure, contrast, highlights, shadows, whites, blacks, saturation, and white balance (temperature/tint). Use this to fix burns/blown highlights (lower highlights/whites) or color casts (temperature/tint). Adds Lumetri Color if absent.

| Param | Req | Description |
|---|---|---|
| `videoTrack` | ✓ | 0-based track index (V1 = video track 0, A1 = audio track 0). |
| `clipIndex` | ✓ |  |
| `exposure` |  | Stops, e.g. -0.4 to recover overexposure. |
| `contrast` |  |  |
| `highlights` |  | Negative pulls back blown highlights/burns. |
| `shadows` |  |  |
| `whites` |  | Negative tames clipped whites. |
| `blacks` |  |  |
| `saturation` |  | 100 = unchanged. |
| `temperature` |  | Negative = cooler, positive = warmer. |
| `tint` |  | Green ↔ magenta balance. |

## Organize

### `create_bin`

Create a bin (folder) in the Project panel.

| Param | Req | Description |
|---|---|---|
| `name` | ✓ |  |
| `parentBinPath` |  | Parent bin, e.g. "Footage". Omit for root. |

### `move_to_bin`

Move a project item into a bin.

| Param | Req | Description |
|---|---|---|
| `projectItemId` | ✓ |  |
| `binPath` | ✓ | Destination bin, e.g. "Footage/Selects". |

### `add_marker`

Add a marker to the active sequence at a time, with an optional name/comment.

| Param | Req | Description |
|---|---|---|
| `atSeconds` | ✓ | Marker time in seconds. |
| `name` |  |  |
| `comment` |  |  |
| `color` |  |  |

### `list_markers`

List all markers on the active sequence.

_No parameters._

## Export

### `export_sequence`

Queue/export the active sequence through Adobe Media Encoder using an export preset (.epr).

| Param | Req | Description |
|---|---|---|
| `outputPath` | ✓ | Absolute output file path. |
| `presetPath` | ✓ | Absolute path to an .epr export preset. |
| `useQueue` |  | true = add to AME queue; false = export immediately (default true). |

