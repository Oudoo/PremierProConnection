// Merge a "premiere" MCP server entry into an MCP client config file, pointing
// at the given URL via mcp-remote (works for Claude Desktop, Antigravity, etc.).
// Preserves any other servers already configured. Creates the file/dirs if
// missing. Usage: node _write-mcp.cjs <configPath> <mcpUrl>
const fs = require("fs");
const path = require("path");

const [file, url] = process.argv.slice(2);
if (!file || !url) {
  console.error("usage: _write-mcp.cjs <configPath> <mcpUrl>");
  process.exit(2);
}

let cfg = {};
try {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (raw) cfg = JSON.parse(raw);
} catch {
  cfg = {};
}
if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) cfg = {};

cfg.mcpServers = cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {};
cfg.mcpServers.premiere = {
  command: "npx",
  args: ["-y", "mcp-remote", url],
};

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log("wrote " + file);
