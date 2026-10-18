import { describe, expect, it } from "vitest";
import { formatResearch } from "../src/core/format.js";
import { research } from "../src/core/research.js";
import { result, testClient } from "./helpers.js";

describe("research", () => {
  it("keeps high-scoring results, sorts them and fetches only missing content", async () => {
    const { client, calls } = testClient([
      {
        body: {
          results: [
            result({ url: "https://a.com", rerank_score: 1.6, content: "A body" }),
            result({ url: "https://low.com", rerank_score: 0.4 }),
            result({ url: "https://b.com", rerank_score: 2.8, content: "" }),
          ],
        },
      },
      { body: { title: "B", content: "B fetched" } },
    ]);

    const res = await research(client, { question: "what is mcp" });

    expect(calls[0]!.body).toMatchObject({ query: "what is mcp", ori_question: "what is mcp", need_content: true });
    expect(calls[1]!.body).toEqual({ url: "https://b.com" });
    expect(res.pages.map((p) => [p.url, p.contentSource])).toEqual([
      ["https://b.com", "fetch"],
      ["https://a.com", "search"],
    ]);
    expect(res.dropped).toBe(1);
  });

  it("records fetch failures instead of failing the whole call", async () => {
    const { client } = testClient([
      { body: { results: [result({ url: "https://blocked.com" })] } },
      { status: 403, body: { error: { message: "blocked" } } },
    ]);
    const res = await research(client, { question: "q" });
    expect(res.pages[0]).toMatchObject({ contentSource: "none" });
    expect(res.pages[0]!.fetchError).toMatch(/403/);
  });

  it("asks for a short query when the question is too long", async () => {
    const { client } = testClient([]);
    await expect(research(client, { question: "x".repeat(200) })).rejects.toThrow(/pass a short `query`/);
  });

  it("formats numbered sources and shows the summary only when there is no content", async () => {
    const { client } = testClient([
      {
        body: {
          results: [
            result({ url: "https://a.com", content: "body", summary: "SUMMARY-A" }),
            result({ url: "https://b.com", content: "", summary: "SUMMARY-B" }),
          ],
        },
      },
      { status: 404, body: { error: { message: "failed to fetch URL" } } },
    ]);
    const text = formatResearch("q", await research(client, { question: "q" }), 1000);
    expect(text).toContain("## [1] Title");
    expect(text).toContain("## Sources\n[1] https://a.com\n[2] https://b.com");
    expect(text).not.toContain("SUMMARY-A");
    expect(text).toContain("SUMMARY-B");
  });
});
