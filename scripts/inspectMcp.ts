import { config as loadDotenv } from "dotenv";
import {
  createConfiguredMcpClient,
  enabledHealthMcpConfigs,
} from "../src/mcp/stdioClient";
import { healthMcpServerConfigs } from "../src/mcp/servers.config";

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
  loadDotenv({ path: ".env", quiet: true });
  const root = process.cwd();
  const enabled = enabledHealthMcpConfigs();
  const skipped = healthMcpServerConfigs.filter((config) => !enabled.includes(config));

  console.log("Configured MCP servers:");
  for (const config of healthMcpServerConfigs) {
    const status = enabled.includes(config) ? "enabled" : "skipped";
    console.log(`- ${config.name}: ${status}`);
  }

  if (skipped.length) {
    console.log("\nSkipped (disabled or missing env):");
    for (const config of skipped) {
      const reason = config.enableWhenEnv
        ? `needs ${config.enableWhenEnv}`
        : "enabled: false";
      console.log(`- ${config.name}: ${reason}`);
    }
  }

  for (const config of enabled) {
    try {
      const client = await createConfiguredMcpClient(root, config);
      try {
        const tools = await client.listTools();
        console.log(`\nMCP server: ${config.name}`);
        console.log("Tools:");
        for (const tool of tools) {
          console.log(`- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`);
        }

        try {
          const resources = await client.listResources();
          if (!resources.length) continue;
          console.log("Resources:");
          for (const resource of resources) {
            const readResult = await client.readResource(resource.uri);
            const text = textFromResource(readResult);
            console.log(`- ${resource.uri}${resource.name ? ` (${resource.name})` : ""}`);
            console.log(`  ${text ? preview(text) : "empty resource"}`);
          }
        } catch {
          // External servers may expose tools only.
        }
      } finally {
        await client.close();
      }
    } catch (error) {
      console.log(`\nMCP server: ${config.name}`);
      console.log(
        `  failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
