/**********************************************************************
 * Claude for Premiere — ExtendScript host
 *
 * Exposes ONE entry point to the panel:
 *     CLAUDE.run(name, argsJson)  →  JSON string  { ok, result } | { ok:false, error }
 *
 * Each `name` matches a command in bridge/src/commands.ts. The panel relays
 * tool calls here; this file performs them against the Premiere DOM.
 *
 * NOTE ON `// VERIFY:` — those lines use APIs whose exact signature varies by
 * Premiere version. They are best-effort and the most likely things to need a
 * tweak on your install. The inspection commands (get_*), import, markers,
 * bins, Lumetri params, and AME export use the most stable APIs.
 *
 * ExtendScript is ES3: var only, no JSON, no Array.forEach.
 **********************************************************************/

// ───────────────────────── JSON polyfill (json2, trimmed) ─────────────────
if (typeof JSON !== "object") {
  JSON = {};
}
(function () {
  "use strict";
  function f(n) {
    return n < 10 ? "0" + n : n;
  }
  // Built from hex escapes to avoid embedding literal control characters.
  var rx_escapable = new RegExp("[\\\\\"\\x00-\\x1f\\x7f-\\x9f]", "g");
  var gap, indent, meta, rep;
  function quote(string) {
    rx_escapable.lastIndex = 0;
    return rx_escapable.test(string)
      ? '"' +
          string.replace(rx_escapable, function (a) {
            var c = meta[a];
            return typeof c === "string"
              ? c
              : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
          }) +
          '"'
      : '"' + string + '"';
  }
  function str(key, holder) {
    var i, k, v, length, mind = gap, partial, value = holder[key];
    if (value && typeof value === "object" && typeof value.toJSON === "function") {
      value = value.toJSON(key);
    }
    if (typeof rep === "function") value = rep.call(holder, key, value);
    switch (typeof value) {
      case "string":
        return quote(value);
      case "number":
        return isFinite(value) ? String(value) : "null";
      case "boolean":
      case "null":
        return String(value);
      case "object":
        if (!value) return "null";
        gap += indent;
        partial = [];
        if (Object.prototype.toString.apply(value) === "[object Array]") {
          length = value.length;
          for (i = 0; i < length; i += 1) partial[i] = str(i, value) || "null";
          v =
            partial.length === 0
              ? "[]"
              : gap
                ? "[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]"
                : "[" + partial.join(",") + "]";
          gap = mind;
          return v;
        }
        if (rep && typeof rep === "object") {
          length = rep.length;
          for (i = 0; i < length; i += 1) {
            if (typeof rep[i] === "string") {
              k = rep[i];
              v = str(k, value);
              if (v) partial.push(quote(k) + (gap ? ": " : ":") + v);
            }
          }
        } else {
          for (k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              v = str(k, value);
              if (v) partial.push(quote(k) + (gap ? ": " : ":") + v);
            }
          }
        }
        v =
          partial.length === 0
            ? "{}"
            : gap
              ? "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}"
              : "{" + partial.join(",") + "}";
        gap = mind;
        return v;
    }
  }
  if (typeof JSON.stringify !== "function") {
    meta = { "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\" };
    JSON.stringify = function (value, replacer, space) {
      var i;
      gap = "";
      indent = "";
      if (typeof space === "number") {
        for (i = 0; i < space; i += 1) indent += " ";
      } else if (typeof space === "string") {
        indent = space;
      }
      rep = replacer;
      return str("", { "": value });
    };
  }
  if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
      var j;
      function walk(holder, key) {
        var k, v, value = holder[key];
        if (value && typeof value === "object") {
          for (k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              v = walk(value, k);
              if (v !== undefined) value[k] = v;
              else delete value[k];
            }
          }
        }
        return value;
      }
      text = String(text);
      if (
        /^[\],:{}\s]*$/.test(
          text
            .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
            .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
            .replace(/(?:^|:|,)(?:\s*\[)+/g, ""),
        )
      ) {
        j = eval("(" + text + ")");
        return walk({ "": j }, "");
      }
      throw new SyntaxError("JSON.parse");
    };
  }
})();

// ───────────────────────── helpers ─────────────────────────
var TICKS_PER_SECOND = 254016000000;

function ok(result) {
  return { ok: true, result: result === undefined ? "ok" : result };
}
function fail(msg) {
  return { ok: false, error: String(msg) };
}

function ticksFromSeconds(sec) {
  // returns a string of ticks (Premiere uses ticks as strings)
  return String(Math.round(sec * TICKS_PER_SECOND));
}

function project() {
  if (!app.project) throw "No project is open.";
  return app.project;
}

function activeSeqOr(args) {
  var p = project();
  if (args && args.sequenceId) {
    var seqs = p.sequences;
    for (var i = 0; i < seqs.numSequences; i++) {
      var s = seqs[i];
      if (String(s.sequenceID) === String(args.sequenceId) || String(s.id) === String(args.sequenceId)) {
        return s;
      }
    }
    throw "Sequence '" + args.sequenceId + "' not found.";
  }
  if (!p.activeSequence) throw "No active sequence. Open a sequence in the timeline.";
  return p.activeSequence;
}

function seqFrameRate(seq) {
  // frames per second; best-effort across versions.
  try {
    var settings = seq.getSettings();
    if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
      return TICKS_PER_SECOND / Number(settings.videoFrameRate.ticks);
    }
  } catch (e) {}
  try {
    if (seq.videoFrameRate && seq.videoFrameRate.ticks) {
      return TICKS_PER_SECOND / Number(seq.videoFrameRate.ticks);
    }
  } catch (e2) {}
  return 24; // sensible fallback
}

function tcFromSeconds(sec, fps) {
  var total = Math.max(0, sec);
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = Math.floor(total % 60);
  var f = Math.floor((total - Math.floor(total)) * fps);
  function p2(n) {
    return n < 10 ? "0" + n : "" + n;
  }
  return p2(h) + ":" + p2(m) + ":" + p2(s) + ":" + p2(f);
}

function secondsOfTime(t) {
  if (!t) return 0;
  try {
    if (typeof t.seconds === "number") return t.seconds;
  } catch (e) {}
  try {
    if (t.ticks) return Number(t.ticks) / TICKS_PER_SECOND;
  } catch (e2) {}
  return 0;
}

function findProjectItem(nodeId, item) {
  item = item || project().rootItem;
  if (String(item.nodeId) === String(nodeId)) return item;
  if (item.children) {
    for (var i = 0; i < item.children.numItems; i++) {
      var found = findProjectItem(nodeId, item.children[i]);
      if (found) return found;
    }
  }
  return null;
}

function ensureBin(binPath) {
  // binPath like "Footage/Selects". Creates missing bins. Returns the bin item.
  var node = project().rootItem;
  if (!binPath) return node;
  var parts = String(binPath).split("/");
  for (var p = 0; p < parts.length; p++) {
    var name = parts[p];
    if (name === "") continue;
    var child = null;
    for (var i = 0; i < node.children.numItems; i++) {
      var c = node.children[i];
      if (c.name === name && c.type === 2 /* BIN */) {
        child = c;
        break;
      }
    }
    if (!child) child = node.createBin(name);
    node = child;
  }
  return node;
}

function findBin(binPath) {
  var node = project().rootItem;
  if (!binPath) return node;
  var parts = String(binPath).split("/");
  for (var p = 0; p < parts.length; p++) {
    var name = parts[p];
    if (name === "") continue;
    var next = null;
    for (var i = 0; i < node.children.numItems; i++) {
      var c = node.children[i];
      if (c.name === name && c.type === 2) {
        next = c;
        break;
      }
    }
    if (!next) return null;
    node = next;
  }
  return node;
}

function videoTrack(seq, idx) {
  idx = idx || 0;
  if (idx < 0 || idx >= seq.videoTracks.numTracks) throw "Video track " + idx + " does not exist.";
  return seq.videoTracks[idx];
}
function clipOnTrack(seq, trackIdx, clipIdx) {
  var t = videoTrack(seq, trackIdx);
  if (clipIdx < 0 || clipIdx >= t.clips.numItems) throw "Clip " + clipIdx + " not on video track " + trackIdx + ".";
  return t.clips[clipIdx];
}

// QE DOM (needed for razor / transitions / some effects)
function qeSeq() {
  app.enableQE();
  return qe.project.getActiveSequence();
}

// ───────────────────────── commands ─────────────────────────
var CMD = {};

CMD.get_project_info = function () {
  var p = project();
  return ok({
    name: p.name,
    path: p.path,
    activeSequence: p.activeSequence ? p.activeSequence.name : null,
    activeSequenceId: p.activeSequence ? String(p.activeSequence.sequenceID) : null,
    sequenceCount: p.sequences.numSequences,
    hostVersion: app.version,
  });
};

CMD.list_sequences = function () {
  var p = project();
  var out = [];
  for (var i = 0; i < p.sequences.numSequences; i++) {
    var s = p.sequences[i];
    out.push({
      id: String(s.sequenceID),
      name: s.name,
      videoTracks: s.videoTracks.numTracks,
      audioTracks: s.audioTracks.numTracks,
      frameRate: seqFrameRate(s),
    });
  }
  return ok(out);
};

CMD.get_timeline_state = function (args) {
  var seq = activeSeqOr(args);
  var fps = seqFrameRate(seq);
  function readTrack(track, kind, idx) {
    var clips = [];
    for (var c = 0; c < track.clips.numItems; c++) {
      var clip = track.clips[c];
      var start = secondsOfTime(clip.start);
      var end = secondsOfTime(clip.end);
      var info = {
        index: c,
        name: clip.name,
        type: kind,
        startSeconds: start,
        endSeconds: end,
        durationSeconds: end - start,
        startTC: tcFromSeconds(start, fps),
        inPoint: secondsOfTime(clip.inPoint),
        outPoint: secondsOfTime(clip.outPoint),
        selected: clip.isSelected ? clip.isSelected() : false,
        projectItemId: clip.projectItem ? String(clip.projectItem.nodeId) : null,
      };
      if (args && args.includeEffects && clip.components) {
        var fx = [];
        for (var k = 0; k < clip.components.numItems; k++) {
          fx.push(clip.components[k].displayName);
        }
        info.effects = fx;
      }
      clips.push(info);
    }
    return { kind: kind, index: idx, name: track.name, clips: clips };
  }
  var v = [];
  for (var i = 0; i < seq.videoTracks.numTracks; i++) v.push(readTrack(seq.videoTracks[i], "video", i));
  var a = [];
  for (var j = 0; j < seq.audioTracks.numTracks; j++) a.push(readTrack(seq.audioTracks[j], "audio", j));
  return ok({
    sequence: seq.name,
    sequenceId: String(seq.sequenceID),
    frameRate: fps,
    playheadSeconds: secondsOfTime(seq.getPlayerPosition()),
    videoTracks: v,
    audioTracks: a,
  });
};

CMD.list_project_items = function (args) {
  var root = args && args.binPath ? findBin(args.binPath) : project().rootItem;
  if (!root) return fail("Bin '" + args.binPath + "' not found.");
  var out = [];
  function walk(node, path) {
    for (var i = 0; i < node.children.numItems; i++) {
      var c = node.children[i];
      var typeName = c.type === 2 ? "bin" : c.type === 1 ? "clip" : "item";
      var entry = { id: String(c.nodeId), name: c.name, type: typeName, binPath: path };
      try {
        if (c.getMediaPath) entry.mediaPath = c.getMediaPath();
      } catch (e) {}
      out.push(entry);
      if (c.type === 2) walk(c, path ? path + "/" + c.name : c.name);
    }
  }
  walk(root, args && args.binPath ? args.binPath : "");
  return ok(out);
};

CMD.export_frame = function (args) {
  var seq = activeSeqOr(args);
  var sec = args && typeof args.atSeconds === "number" ? args.atSeconds : secondsOfTime(seq.getPlayerPosition());
  var dir = Folder.temp.fsName + "/claude_premiere_frames";
  var f = new Folder(dir);
  if (!f.exists) f.create();
  var path = dir + "/frame_" + new Date().getTime() + ".png";
  // VERIFY: exportFramePNG(ticks, path) exists in recent Premiere; older builds
  // may use exportFrameJPEG or a different signature.
  try {
    seq.exportFramePNG(ticksFromSeconds(sec), path);
  } catch (e) {
    try {
      seq.exportFrameJPEG(ticksFromSeconds(sec), path.replace(/\.png$/, ".jpg"));
      path = path.replace(/\.png$/, ".jpg");
    } catch (e2) {
      return fail("Frame export not supported on this Premiere version: " + e);
    }
  }
  var jpg = path.toLowerCase();
  return ok({
    path: path,
    atSeconds: sec,
    mediaType: jpg.indexOf(".jpg") >= 0 || jpg.indexOf(".jpeg") >= 0 ? "image/jpeg" : "image/png",
  });
};

CMD.import_media = function (args) {
  if (!args || !args.paths || !args.paths.length) return fail("No paths to import.");
  var target = args.binPath ? ensureBin(args.binPath) : project().rootItem;
  // importFiles(paths, suppressUI, targetBin, importAsNumberedStills)
  var okFlag = project().importFiles(args.paths, true, target, false);
  return okFlag ? ok({ imported: args.paths.length, binPath: args.binPath || "" }) : fail("Import failed.");
};

CMD.create_sequence = function (args) {
  if (!args || !args.name) return fail("A sequence name is required.");
  var p = project();
  var seq;
  if (args.fromProjectItemId) {
    var item = findProjectItem(args.fromProjectItemId);
    if (!item) return fail("Project item not found.");
    // VERIFY: createNewSequenceFromClips signature varies; falls back to empty.
    try {
      seq = p.createNewSequenceFromClips(args.name, [item], p.rootItem);
    } catch (e) {
      seq = p.createNewSequence(args.name, args.name);
    }
  } else {
    seq = p.createNewSequence(args.name, args.name);
  }
  return ok({ id: String(seq.sequenceID), name: seq.name });
};

CMD.append_clip = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  var item = findProjectItem(args.projectItemId);
  if (!item) return fail("Project item not found.");
  var vt = videoTrack(seq, args.videoTrack || 0);
  var endSec = secondsOfTime(seq.end);
  // VERIFY: overwriteClip(projectItem, timeSeconds) — time may need Time object.
  vt.overwriteClip(item, endSec);
  return ok({ placedAtSeconds: endSec, track: args.videoTrack || 0 });
};

CMD.insert_clip = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  var item = findProjectItem(args.projectItemId);
  if (!item) return fail("Project item not found.");
  var vt = videoTrack(seq, args.videoTrack || 0);
  vt.insertClip(item, args.atSeconds); // VERIFY: seconds vs Time
  return ok({ insertedAtSeconds: args.atSeconds });
};

CMD.overwrite_clip = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  var item = findProjectItem(args.projectItemId);
  if (!item) return fail("Project item not found.");
  var vt = videoTrack(seq, args.videoTrack || 0);
  vt.overwriteClip(item, args.atSeconds);
  return ok({ atSeconds: args.atSeconds });
};

CMD.move_playhead = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  seq.setPlayerPosition(ticksFromSeconds(args.atSeconds));
  return ok({ playheadSeconds: args.atSeconds });
};

CMD.razor_at = function (args) {
  var seq = activeSeqOr({});
  var fps = seqFrameRate(seq);
  var tc = tcFromSeconds(args.atSeconds, fps);
  var qs = qeSeq();
  // VERIFY: QE razor by track at a timecode string.
  var did = 0;
  var count = qs.numVideoTracks;
  for (var i = 0; i < count; i++) {
    if (typeof args.videoTrack === "number" && i !== args.videoTrack) continue;
    try {
      qs.getVideoTrackAt(i).razor(tc);
      did++;
    } catch (e) {}
  }
  return ok({ cutAtSeconds: args.atSeconds, tracksCut: did });
};

CMD.trim_clip = function (args) {
  var seq = activeSeqOr({});
  var clip = clipOnTrack(seq, args.videoTrack, args.clipIndex);
  if (typeof args.newStartSeconds === "number") clip.start = ticksFromSeconds(args.newStartSeconds); // VERIFY
  if (typeof args.newEndSeconds === "number") clip.end = ticksFromSeconds(args.newEndSeconds); // VERIFY
  return ok({ start: secondsOfTime(clip.start), end: secondsOfTime(clip.end) });
};

CMD.delete_clip = function (args) {
  var seq = activeSeqOr({});
  var clip = clipOnTrack(seq, args.videoTrack, args.clipIndex);
  clip.remove(false, false); // (ripple=false, alignToVideo=false) — leaves a gap
  return ok({ deleted: true });
};

CMD.ripple_delete_range = function (args) {
  // Razor at both ends, then remove the in-between clips with ripple.
  var seq = activeSeqOr({});
  CMD.razor_at({ atSeconds: args.startSeconds, videoTrack: args.videoTrack });
  CMD.razor_at({ atSeconds: args.endSeconds, videoTrack: args.videoTrack });
  var removed = 0;
  function rippleTrack(track) {
    for (var c = track.clips.numItems - 1; c >= 0; c--) {
      var clip = track.clips[c];
      var s = secondsOfTime(clip.start);
      var e = secondsOfTime(clip.end);
      if (s >= args.startSeconds - 0.001 && e <= args.endSeconds + 0.001) {
        clip.remove(true, false); // ripple=true
        removed++;
      }
    }
  }
  for (var i = 0; i < seq.videoTracks.numTracks; i++) {
    if (typeof args.videoTrack === "number" && i !== args.videoTrack) continue;
    rippleTrack(seq.videoTracks[i]);
  }
  return ok({ removedClips: removed });
};

CMD.set_clip_speed = function (args) {
  var seq = activeSeqOr({});
  var clip = clipOnTrack(seq, args.videoTrack, args.clipIndex);
  // VERIFY: changing speed via DOM differs by version; QE has setSpeed.
  try {
    var qs = qeSeq();
    var qclip = qs.getVideoTrackAt(args.videoTrack).getItemAt(args.clipIndex);
    qclip.setSpeed(args.speedPercent / 100, null, false, false, false); // VERIFY signature
    return ok({ speedPercent: args.speedPercent });
  } catch (e) {
    return fail("Could not set speed on this version: " + e);
  }
};

CMD.apply_transition = function (args) {
  var qs = qeSeq();
  // VERIFY: QE transition API. addTransition(qeEffect, addToStart, ...) varies.
  try {
    var qTrack = qs.getVideoTrackAt(args.videoTrack);
    var qItem = qTrack.getItemAt(args.clipIndex);
    var effect = qe.project.getVideoTransitionByName(args.transitionName);
    if (!effect) return fail("Transition '" + args.transitionName + "' not found.");
    var dur = args.durationSeconds || 1;
    if (args.edge === "start" || args.edge === "both") qItem.addTransition(effect, true);
    if (args.edge === "end" || args.edge === "both" || !args.edge) qItem.addTransition(effect, false);
    return ok({ transition: args.transitionName, edge: args.edge || "end", durationSeconds: dur });
  } catch (e) {
    return fail("Could not apply transition: " + e);
  }
};

CMD.apply_effect = function (args) {
  var qs = qeSeq();
  try {
    var qItem = qs.getVideoTrackAt(args.videoTrack).getItemAt(args.clipIndex);
    var effect = qe.project.getVideoEffectByName(args.effectName);
    if (!effect) return fail("Effect '" + args.effectName + "' not found.");
    qItem.addVideoEffect(effect);
    return ok({ effect: args.effectName });
  } catch (e) {
    return fail("Could not apply effect: " + e);
  }
};

function findComponent(clip, effectName) {
  for (var k = 0; k < clip.components.numItems; k++) {
    if (clip.components[k].displayName === effectName) return clip.components[k];
  }
  return null;
}
function findProperty(component, paramName) {
  for (var p = 0; p < component.properties.numItems; p++) {
    if (component.properties[p].displayName === paramName) return component.properties[p];
  }
  return null;
}

CMD.set_effect_param = function (args) {
  var seq = activeSeqOr({});
  var clip = clipOnTrack(seq, args.videoTrack, args.clipIndex);
  var comp = findComponent(clip, args.effectName);
  if (!comp) return fail("Effect '" + args.effectName + "' is not on that clip. Apply it first.");
  var prop = findProperty(comp, args.paramName);
  if (!prop) return fail("Parameter '" + args.paramName + "' not found on " + args.effectName + ".");
  prop.setValue(args.value, true);
  return ok({ effect: args.effectName, param: args.paramName, value: args.value });
};

CMD.add_keyframe = function (args) {
  var seq = activeSeqOr({});
  var clip = clipOnTrack(seq, args.videoTrack, args.clipIndex);
  var comp = findComponent(clip, args.effectName);
  if (!comp) return fail("Effect '" + args.effectName + "' is not on that clip.");
  var prop = findProperty(comp, args.paramName);
  if (!prop) return fail("Parameter '" + args.paramName + "' not found.");
  try {
    prop.setTimeVarying(true);
    // Keyframe time is relative to the clip; the API wants ticks (string).
    prop.addKey(ticksFromSeconds(args.atSeconds)); // VERIFY relative vs absolute time
    prop.setValueAtKey(ticksFromSeconds(args.atSeconds), args.value, true);
    return ok({ keyframeAtSeconds: args.atSeconds, value: args.value });
  } catch (e) {
    return fail("Could not add keyframe: " + e);
  }
};

CMD.create_text = function (args) {
  // Programmatic title creation in Premiere is limited. The reliable path is a
  // text MOGRT. If a default template is configured here, use it; otherwise
  // guide the user to import_mogrt.
  // VERIFY: set DEFAULT_TEXT_MOGRT to a .mogrt that has one editable text field.
  var DEFAULT_TEXT_MOGRT = "";
  if (!DEFAULT_TEXT_MOGRT) {
    return fail(
      "create_text needs a text template. Set DEFAULT_TEXT_MOGRT in host/index.jsx to a .mogrt " +
        "with an editable text field, or use import_mogrt with your own template.",
    );
  }
  return CMD.import_mogrt({
    mogrtPath: DEFAULT_TEXT_MOGRT,
    atSeconds: args.atSeconds,
    videoTrack: args.videoTrack,
    fields: { "Text": args.text },
  });
};

CMD.import_mogrt = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  var sec = typeof args.atSeconds === "number" ? args.atSeconds : secondsOfTime(seq.getPlayerPosition());
  var vTrackOffset = args.videoTrack || 0;
  // VERIFY: importMGT(path, timeTicks, vidTrackOffset, audTrackOffset)
  var item = seq.importMGT(args.mogrtPath, ticksFromSeconds(sec), vTrackOffset, 0);
  if (!item) return fail("Failed to import MOGRT.");
  if (args.fields) {
    try {
      var comp = item.getMGTComponent();
      for (var key in args.fields) {
        if (!args.fields.hasOwnProperty(key)) continue;
        var prop = findProperty(comp, key);
        if (prop) prop.setValue(args.fields[key], true);
      }
    } catch (e) {
      // text set is best-effort
    }
  }
  return ok({ atSeconds: sec });
};

CMD.apply_lumetri_preset = function (args) {
  var qs = qeSeq();
  try {
    var qItem = qs.getVideoTrackAt(args.videoTrack).getItemAt(args.clipIndex);
    // VERIFY: applying a .look/.cube — newer Premiere exposes setLUT/applyPreset.
    qItem.applyPreset ? qItem.applyPreset(args.presetPath) : qItem.setLUT(args.presetPath);
    return ok({ preset: args.presetPath });
  } catch (e) {
    return fail("Could not apply Lumetri preset: " + e);
  }
};

CMD.set_lumetri = function (args) {
  var seq = activeSeqOr({});
  var clip = clipOnTrack(seq, args.videoTrack, args.clipIndex);
  var lumetri = findComponent(clip, "Lumetri Color");
  if (!lumetri) {
    // add Lumetri Color via QE, then re-fetch.
    try {
      var qs = qeSeq();
      var qItem = qs.getVideoTrackAt(args.videoTrack).getItemAt(args.clipIndex);
      var fx = qe.project.getVideoEffectByName("Lumetri Color");
      qItem.addVideoEffect(fx);
      lumetri = findComponent(clip, "Lumetri Color");
    } catch (e) {}
  }
  if (!lumetri) return fail("Could not add/find Lumetri Color on that clip.");

  // Map friendly names → Lumetri Basic Correction property display names.
  // VERIFY: display names can differ by locale/version.
  var map = {
    exposure: "Exposure",
    contrast: "Contrast",
    highlights: "Highlights",
    shadows: "Shadows",
    whites: "Whites",
    blacks: "Blacks",
    saturation: "Saturation",
    temperature: "Temperature",
    tint: "Tint",
  };
  var applied = {};
  for (var key in map) {
    if (!map.hasOwnProperty(key)) continue;
    if (typeof args[key] !== "number") continue;
    var prop = findProperty(lumetri, map[key]);
    if (prop) {
      prop.setValue(args[key], true);
      applied[key] = args[key];
    }
  }
  return ok({ applied: applied });
};

CMD.create_bin = function (args) {
  var parent = args.parentBinPath ? ensureBin(args.parentBinPath) : project().rootItem;
  var bin = parent.createBin(args.name);
  return ok({ name: bin.name, binPath: (args.parentBinPath ? args.parentBinPath + "/" : "") + args.name });
};

CMD.move_to_bin = function (args) {
  var item = findProjectItem(args.projectItemId);
  if (!item) return fail("Project item not found.");
  var bin = ensureBin(args.binPath);
  item.moveBin(bin);
  return ok({ movedTo: args.binPath });
};

CMD.add_marker = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  var marker = seq.markers.createMarker(args.atSeconds);
  if (args.name) marker.name = args.name;
  if (args.comment) marker.comments = args.comment;
  if (args.color) {
    var colors = { green: 0, red: 1, purple: 2, orange: 3, yellow: 4, white: 5, blue: 6, cyan: 7 };
    try {
      marker.setColorByIndex(colors[args.color] || 0);
    } catch (e) {}
  }
  return ok({ atSeconds: args.atSeconds, name: args.name || "" });
};

CMD.list_markers = function () {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  var out = [];
  var m = seq.markers.getFirstMarker();
  while (m) {
    out.push({ start: secondsOfTime(m.start), name: m.name, comment: m.comments });
    m = seq.markers.getNextMarker(m);
  }
  return ok(out);
};

CMD.export_sequence = function (args) {
  var seq = project().activeSequence;
  if (!seq) return fail("No active sequence.");
  if (!app.encoder) return fail("Adobe Media Encoder integration not available.");
  // VERIFY: encodeSequence(seq, outputPath, presetPath, workArea, removeOnCompletion, startQueue)
  try {
    app.encoder.launchEncoder();
    var WORK_AREA_ENTIRE = 0;
    var jobID = app.encoder.encodeSequence(
      seq,
      args.outputPath,
      args.presetPath,
      WORK_AREA_ENTIRE,
      args.useQueue === false ? 0 : 1,
    );
    return ok({ queued: args.useQueue !== false, jobID: String(jobID), output: args.outputPath });
  } catch (e) {
    return fail("Export failed: " + e);
  }
};

// ───────────────────────── dispatch ─────────────────────────
var CLAUDE = {
  run: function (name, argsJson) {
    var args;
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch (e) {
      return JSON.stringify(fail("Bad arguments JSON: " + e));
    }
    var handler = CMD[name];
    if (!handler) return JSON.stringify(fail("Unknown command: " + name));
    try {
      var result = handler(args || {});
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify(fail((err && err.message) || String(err)));
    }
  },
};

// Expose to the panel's evalScript calls.
$._CLAUDE = CLAUDE;
this.CLAUDE = CLAUDE;
