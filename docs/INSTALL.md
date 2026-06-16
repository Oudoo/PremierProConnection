# Install & run

Two pieces: the **bridge** (a Node process on your machine) and the **panel**
(a CEP extension inside Premiere). Install the bridge once; install the panel
once; then just run the bridge whenever you want to use Claude in Premiere.

---

## 0. Prerequisites

- **Node.js 20+** — <https://nodejs.org>
- **Adobe Premiere Pro 2020 (v14) or newer** (CEP 11). Newer is better.
- A **Claude API key** *only if* you want the in-panel chat
  (<https://console.anthropic.com/settings/keys>). Driving Premiere from an IDE
  over MCP does **not** need a key here — see [COST.md](COST.md).

---

## 1. Bridge (the brain)

```bash
cd bridge
cp .env.example .env          # then edit .env and paste your API key (optional)
npm install
npm run dev                   # leave this running
```

You should see:

```
  MCP (for IDEs):  http://127.0.0.1:3030/mcp
  Panel WebSocket: ws://127.0.0.1:3031
  Tools registered:   29
```

Sanity check from another terminal: `curl http://127.0.0.1:3030/health`.

> Production: `npm run build && npm start`.

---

## 2. Panel (inside Premiere)

### 2a. Enable unsigned extensions (one time)

The panel is unsigned during development, so allow unsigned CEP extensions.

**macOS** (run in Terminal — adjust the CSXS version 9–12 to match your Premiere;
doing all four is harmless):
```bash
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

**Windows** (run `regedit`, or save as a `.reg` and run it):
```
[HKEY_CURRENT_USER\Software\Adobe\CSXS.11]
"PlayerDebugMode"="1"
```
(Repeat for `CSXS.9`, `CSXS.10`, `CSXS.12` if present.)

### 2b. Copy the panel into the CEP extensions folder

Copy the whole `panel/` folder (rename it to `com.claudeforpremiere.panel`) into:

- **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/`
- **Windows:** `C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\`

```bash
# macOS example
cp -R panel "$HOME/Library/Application Support/Adobe/CEP/extensions/com.claudeforpremiere.panel"
```

> Prefer a symlink during development so edits show up live:
> `ln -s "$(pwd)/panel" "$HOME/Library/Application Support/Adobe/CEP/extensions/com.claudeforpremiere.panel"`

### 2c. Open it

Restart Premiere, then **Window → Extensions → Claude for Premiere**.
The status chip turns **connected** (green) when it reaches the bridge.

---

## 3. Use it

1. Open a project and a sequence.
2. In the panel, type what you want — e.g. *"read the timeline"*,
   *"fix the blown highlights on clip 3 of V1"*, *"add a 1-second cross
   dissolve at the end of the first clip"*.
3. Toggle **👁 see frames** when you want Claude to visually inspect footage
   (color/burns/framing). It costs more tokens.

`/reset` in the chat clears the conversation.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Panel shows **offline** | Is the bridge running (`npm run dev`)? Ports 3030/3031 free? |
| Panel not in the Extensions menu | Unsigned-extension flag not set, or folder in the wrong place. Re-check step 2a/2b, restart Premiere. |
| "No active sequence" | Open a sequence in the timeline first. |
| A command errors with a version note | That action hit a `// VERIFY:` API. Paste the error back and we'll adjust `panel/host/index.jsx` for your Premiere version. |
| Want to debug the panel UI | Open `http://localhost:8088` in Chrome (enabled by `panel/.debug`). |
