// Prints the Premiere tool catalog as Markdown. Used to generate docs/TOOLS.md:
//   npm run tools > ../docs/TOOLS.md
import { zodToJsonSchema } from "zod-to-json-schema";
import { COMMANDS, type CommandDef } from "./commands.js";

const CATEGORY_TITLES: Record<CommandDef["category"], string> = {
  inspect: "Inspect & see",
  assembly: "Import & assembly",
  edit: "Editing",
  effects: "Effects & transitions",
  graphics: "Titles & Essential Graphics",
  color: "Color (Lumetri)",
  organize: "Organize",
  export: "Export",
};

function paramsTable(cmd: CommandDef): string {
  const schema = zodToJsonSchema(cmd.schema, { target: "jsonSchema7" }) as {
    properties?: Record<string, { description?: string; type?: string }>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const keys = Object.keys(props);
  if (keys.length === 0) return "_No parameters._\n";
  let out = "| Param | Req | Description |\n|---|---|---|\n";
  for (const k of keys) {
    const p = props[k];
    out += `| \`${k}\` | ${required.has(k) ? "✓" : ""} | ${p.description ?? ""} |\n`;
  }
  return out;
}

let md = "# Tool reference (Premiere actions)\n\n";
md +=
  "_Auto-generated from `bridge/src/commands.ts` (`npm run tools`). The same set powers both the in-panel chat and the MCP server for IDEs._\n\n";

for (const cat of Object.keys(CATEGORY_TITLES) as CommandDef["category"][]) {
  const cmds = COMMANDS.filter((c) => c.category === cat);
  if (cmds.length === 0) continue;
  md += `## ${CATEGORY_TITLES[cat]}\n\n`;
  for (const c of cmds) {
    const tags: string[] = [];
    if (c.destructive) tags.push("**destructive**");
    if (c.returnsImage) tags.push("**returns image**");
    md += `### \`${c.name}\`${tags.length ? " — " + tags.join(", ") : ""}\n\n`;
    md += `${c.description}\n\n`;
    md += paramsTable(c);
    md += "\n";
  }
}

process.stdout.write(md);
