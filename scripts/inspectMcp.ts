import { createMarkdownHealthMcpClient } from "../src/mcp/stdioClient";

function textFromResource(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const result = value as { contents?: unknown[] };
  const content = result.contents?.[0];
  if (!content || typeof content !== "object") return "";
  const item = content as { text?: unknown };
  return typeof item.text === "string" ? item.text.trim() : "";
}

function preview(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

async function main() {
  const server = await createMarkdownHealthMcpClient(process.cwd());

  try {
    const tools = await server.listTools();
    const resources = await server.listResources();

    console.log("MCP server: markdown-health");
    console.log("\nTools:");
    for (const tool of tools) {
      console.log(`- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`);
    }

    console.log("\nResources:");
    for (const resource of resources) {
      const readResult = await server.readResource(resource.uri);
      const text = textFromResource(readResult);
      console.log(`- ${resource.uri}${resource.name ? ` (${resource.name})` : ""}`);
      console.log(`  ${text ? preview(text) : "empty resource"}`);
    }
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
