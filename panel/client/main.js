/*
 * Panel front-end.
 *
 * Responsibilities:
 *   1. Connect to the local bridge over WebSocket.
 *   2. Render the chat (user text, streamed assistant text, tool activity).
 *   3. When the bridge asks to run a Premiere command, dispatch it to
 *      ExtendScript via CSInterface.evalScript and return the result.
 *
 * The bridge — not this panel — talks to Claude. This panel is the "hands".
 */
(function () {
  "use strict";

  // The panel auto-discovers the bridge across this small range of localhost
  // WS ports, so it works no matter which port the bridge ended up on (the
  // installer bumps the port if 3031 is taken).
  var WS_PORTS = [3031, 3032, 3033, 3034, 3035, 3036, 3037, 3038, 3039, 3041];
  var portIdx = 0;

  var cs = new CSInterface();
  var ws = null;
  var reconnectTimer = null;
  var sending = false;

  var els = {
    status: document.getElementById("status"),
    log: document.getElementById("log"),
    input: document.getElementById("input"),
    send: document.getElementById("send"),
    vision: document.getElementById("vision"),
  };

  // ── UI helpers ───────────────────────────────────────────────────────────
  function scrollDown() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function addMessage(role) {
    var wrap = document.createElement("div");
    wrap.className = "msg msg--" + role;
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    wrap.appendChild(bubble);
    els.log.appendChild(wrap);
    scrollDown();
    return bubble;
  }

  function addToolLine(name) {
    var line = document.createElement("div");
    line.className = "msg msg--tool";
    var tool = document.createElement("div");
    tool.className = "tool";
    tool.innerHTML = '<span class="dot"></span><span class="label"></span>';
    tool.querySelector(".label").innerHTML = "running <code>" + escapeHtml(name) + "</code>…";
    line.appendChild(tool);
    els.log.appendChild(line);
    scrollDown();
    return tool;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function setStatus(online) {
    els.status.textContent = online ? "connected" : "offline";
    els.status.className = "status " + (online ? "status--on" : "status--off");
    els.send.disabled = !online;
  }

  // ── Chat turn state ──────────────────────────────────────────────────────
  var current = { bubble: null, requestId: null };

  function appendToken(text) {
    if (!current.bubble) current.bubble = addMessage("assistant");
    current.bubble.textContent += text;
    scrollDown();
  }

  // ── WebSocket lifecycle ──────────────────────────────────────────────────
  function connect() {
    var url = "ws://127.0.0.1:" + WS_PORTS[portIdx];
    try {
      ws = new WebSocket(url);
    } catch (e) {
      advanceAndRetry();
      return;
    }

    ws.onopen = function () {
      setStatus(true); // found the bridge on this port — stop scanning
      var env = cs.getHostEnvironment() || {};
      send({
        type: "hello",
        role: "panel",
        app: { name: env.appName || "PPRO", version: env.appVersion || "", os: navigatorOS() },
      });
    };

    ws.onclose = function () {
      setStatus(false);
      advanceAndRetry();
    };

    ws.onerror = function () {
      try {
        ws.close();
      } catch (e) {}
    };

    ws.onmessage = function (evt) {
      var msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (e) {
        return;
      }
      handleBridgeMessage(msg);
    };
  }

  // Move to the next candidate port and retry. Cheap on localhost; stops the
  // moment a connection opens.
  function advanceAndRetry() {
    portIdx = (portIdx + 1) % WS_PORTS.length;
    scheduleReconnect();
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, 500);
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function navigatorOS() {
    var p = (navigator.platform || "").toLowerCase();
    if (p.indexOf("win") === 0) return "win";
    if (p.indexOf("mac") === 0) return "mac";
    return p;
  }

  // ── Bridge → panel messages ──────────────────────────────────────────────
  function handleBridgeMessage(msg) {
    switch (msg.type) {
      case "ready":
        if (msg.userName) {
          var greet = document.getElementById("greet-hello");
          if (greet) greet.textContent = "Hi " + msg.userName;
        }
        break;

      case "command":
        runPremiereCommand(msg);
        break;

      case "chatToken":
        appendToken(msg.text);
        break;

      case "chatToolUse":
        renderToolUse(msg);
        break;

      case "chatDone":
        endTurn();
        break;

      case "error":
        var b = addMessage("assistant");
        b.style.color = "var(--err)";
        b.textContent = "⚠ " + (msg.message || "Unknown error");
        break;
    }
  }

  var toolLines = {}; // key: name+args → element (best-effort)

  function renderToolUse(msg) {
    if (msg.status === "start") {
      var el = addToolLine(msg.name);
      toolLines[msg.name + JSON.stringify(msg.args || {})] = el;
      return;
    }
    var key = msg.name + JSON.stringify(msg.args || {});
    var line = toolLines[key];
    if (!line) line = addToolLine(msg.name);
    if (msg.status === "ok") {
      line.className = "tool ok";
      line.querySelector(".label").innerHTML = "<code>" + escapeHtml(msg.name) + "</code> done";
    } else if (msg.status === "error") {
      line.className = "tool error";
      line.querySelector(".label").innerHTML =
        "<code>" + escapeHtml(msg.name) + "</code> failed: " + escapeHtml(msg.detail || "");
    }
    delete toolLines[key];
    scrollDown();
  }

  // ── Run an ExtendScript command in Premiere ──────────────────────────────
  function runPremiereCommand(cmd) {
    // host/index.jsx exposes:  CLAUDE.run(name, argsJsonString)  → JSON string
    var argsJson = JSON.stringify(cmd.args || {});
    var script = "CLAUDE.run(" + JSON.stringify(cmd.name) + "," + JSON.stringify(argsJson) + ")";
    cs.evalScript(script, function (raw) {
      var out;
      try {
        out = JSON.parse(raw);
      } catch (e) {
        out = { ok: false, error: "Bad ExtendScript reply: " + String(raw).slice(0, 300) };
      }
      send({
        type: "commandResult",
        id: cmd.id,
        ok: !!out.ok,
        result: out.ok ? out.result : undefined,
        error: out.ok ? undefined : out.error || "Command failed",
      });
    });
  }

  // ── Sending a user message ───────────────────────────────────────────────
  function sendUserMessage() {
    var text = els.input.value.trim();
    if (!text || sending || !ws || ws.readyState !== WebSocket.OPEN) return;

    var bubble = addMessage("user");
    bubble.textContent = text;
    els.input.value = "";
    autoGrow();

    current.bubble = null;
    current.requestId = "r" + Date.now();
    sending = true;
    els.send.disabled = true;

    send({
      type: "chat",
      requestId: current.requestId,
      text: text,
      vision: els.vision.checked,
    });
  }

  function endTurn() {
    sending = false;
    els.send.disabled = !(ws && ws.readyState === WebSocket.OPEN);
    current.bubble = null;
    current.requestId = null;
  }

  // ── Input behaviour ──────────────────────────────────────────────────────
  function autoGrow() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 140) + "px";
  }

  els.input.addEventListener("input", autoGrow);
  els.input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage();
    }
  });
  els.send.addEventListener("click", sendUserMessage);

  // ── Go ───────────────────────────────────────────────────────────────────
  setStatus(false);
  connect();
})();
