// Smoke test for the MCP server: connects over Streamable HTTP, lists the tools,
// and calls one — verifying the full IDE → bridge → (panel) path end to end.
// Run the bridge first (npm run dev / npm start), then: npm run smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "./config.js";

const url = new URL(`http://${config.host}:${config.httpPort}/mcp`);

async function main() {
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: "premiere-smoke", version: "0.1.0" });

  await client.connect(transport);
  console.log(`connected to MCP at ${url.href}`);

  const { tools } = await client.listTools();
  console.log(`tools advertised: ${tools.length}`);
  console.log("  " + tools.map((t) => t.name).join(", "));

  // Call a read-only tool. With no Premiere panel connected, the bridge returns
  // a clear "panel not connected" message — which is the correct behaviour and
  // proves the request reached the tool handler.
  const res = await client.callTool({ name: "get_project_info", arguments: {} });
  const text = (res.content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  console.log(`get_project_info → isError=${res.isError === true}`);
  console.log(`  ${text}`);

  await client.close();
  console.log("smoke test OK");
}

main().catch((err) => {
  console.error("smoke test FAILED:", err);
  process.exit(1);
});
