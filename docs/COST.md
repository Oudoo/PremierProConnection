# Cost: API vs. MCP-via-subscription

You asked whether MCP can reduce cost vs. the API. Here's the precise answer.

## The key fact

**MCP is a protocol, not a pricing plan.** The language model still reads and
writes tokens to decide and perform edits either way. MCP by itself does *not*
make those tokens cheaper.

## Where the savings actually come from

The savings come from **who you pay** for the model's thinking:

| Mode | What you pay | Good for |
|---|---|---|
| **In-panel chat** | **Anthropic API**, per token (your `ANTHROPIC_API_KEY`) | A self-contained experience entirely inside Premiere. Costs scale with usage. |
| **Drive via MCP from a tool you already subscribe to** (Claude Desktop, Claude Code, VS Code, Cursor, Antigravity) | Your **existing flat subscription** for that tool | Lower/flat cost, especially for heavy use. The bridge needs *no* API key in this mode. |

Because the bridge exposes Premiere as MCP tools, the model that runs inside
your subscription tool can drive Premiere. You're effectively reusing a plan you
already pay for, instead of metered API calls. **That** is the cost win — not
MCP per se, but routing the work through a subscription.

## Practical guidance

- **Just experimenting / occasional use** → in-panel chat with an API key is
  simplest. Set a low [spend limit](https://console.anthropic.com/settings/limits).
- **Heavy/daily use** → drive Premiere over MCP from Claude Desktop / your IDE
  on a subscription. Leave `ANTHROPIC_API_KEY` blank in `bridge/.env`.
- **Both** → you can use the panel sometimes and MCP other times; they share the
  exact same Premiere action set.

## Token-cost levers (when using the API)

- **Vision is the biggest lever.** "👁 see frames" sends images to the model.
  Use it for color/exposure/burn work; turn it off for structural edits. The
  bridge also caps images per tool result (`MAX_VISION_IMAGES` in `.env`) and
  downscales exported frames (`maxWidth` on `export_frame`).
- **Model & effort.** `CLAUDE_MODEL` / `CLAUDE_EFFORT` in `.env`. Lower effort
  (`medium`) or a smaller model (`claude-sonnet-4-6`) costs less; `claude-opus-4-8`
  at `high`/`xhigh` is the most capable.
- **Be specific.** Precise requests = fewer exploratory tool calls = fewer tokens.

## A note on what "free" is not

Even on a subscription, model usage is subject to that plan's limits. There's no
configuration where a capable model edits your project at literally zero cost —
but a subscription is predictable and flat, which is usually what people mean by
"cheaper than the API."
