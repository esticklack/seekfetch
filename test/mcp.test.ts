import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { DeepSeekWebClient } from "../src/core/client.js";
import { createServer } from "../src/mcp/server.js";
import { result, testClient } from "./helpers.js";

async function connect(getClient: () => DeepSeekWebClient) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(getClient).connect(serverSide);
  const mcp = new Client({ name: "test", version: "0" });
  await mcp.connect(clientSide);
  return mcp;
}

const text = (res: Awaited<ReturnType<Client["callTool"]>>) => (res.content as { text: string }[])[0]!.text;

describe("MCP server", () => {
  it("lists the three read-only tools", async () => {
    const mcp = await connect(() => testClient([]).client);
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name)).toEqual(["deepseek_search", "deepseek_fetch", "deepseek_research"]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("search builds operators from filters and applies min_score", async () => {
    const { client, calls } = testClient([
      { body: { results: [result({ title: "Keep", rerank_score: 2 }), result({ title: "Drop", rerank_score: 1 })] } },
    ]);
    const mcp = await connect(() => client);
    const res = await mcp.callTool({ name: "deepseek_search", arguments: { query: "mcp", sites: ["github.com"], min_score: 1.5 } });
    expect(calls[0]!.body).toMatchObject({ query: "mcp site:github.com", need_content: false });
    expect(text(res)).toContain("Keep");
    expect(text(res)).not.toContain("Drop");
  });

  it("fetch pages long content with offset", async () => {
    const { client } = testClient([{ body: { title: "Long", content: "a".repeat(1500) } }]);
    const mcp = await connect(() => client);
    const res = await mcp.callTool({ name: "deepseek_fetch", arguments: { url: "https://x.com", max_chars: 1000 } });
    expect(text(res)).toContain("call again with offset=1000");
  });

  it("reports errors as tool errors, including a missing key", async () => {
    const mcp = await connect(() => new DeepSeekWebClient({ apiKey: "" }));
    const res = await mcp.callTool({ name: "deepseek_search", arguments: { query: "q" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/DEEPSEEK_API_KEY/);
  });
});
