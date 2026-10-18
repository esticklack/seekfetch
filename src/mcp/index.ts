import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnv } from "../config.js";
import type { DeepSeekWebClient } from "../core/client.js";
import { createServer } from "./server.js";

export async function startStdioServer(): Promise<void> {
  let client: DeepSeekWebClient | undefined;
  const server = createServer(() => (client ??= clientFromEnv()));
  await server.connect(new StdioServerTransport());
  // stdout is the protocol channel; diagnostics go to stderr only.
  console.error("seekfetch MCP server running on stdio");
}
