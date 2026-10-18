import { describe, expect, it } from "vitest";
import { DeepSeekWebClient } from "../src/core/client.js";
import { DeepSeekApiError, InputError } from "../src/core/errors.js";
import { result, testClient } from "./helpers.js";

describe("search", () => {
  it("posts to /v1/tools/search with bearer auth", async () => {
    const { client, calls } = testClient([{ body: { results: [result()] } }]);
    const res = await client.search({ query: "hello", count: 3 });
    expect(calls[0]!.url).toBe("https://api.deepseek.com/v1/tools/search");
    expect(calls[0]!.headers.Authorization).toBe("Bearer sk-test");
    expect(calls[0]!.body).toEqual({ query: "hello", count: 3 });
    expect(res.results[0]!.summary).toBe("summary for the model");
  });

  it("tolerates missing, null and unknown fields", async () => {
    const { client } = testClient([{ body: { results: [{ url: "https://x.dev", title: null, brand_new: 1 }], extra: true } }]);
    const [r] = (await client.search({ query: "q" })).results;
    expect(r).toMatchObject({ url: "https://x.dev", title: "", content: "", rerank_score: 0, authority: -1, date: null });
  });

  it("treats a missing results array as no results", async () => {
    const { client } = testClient([{ body: {} }]);
    expect((await client.search({ query: "q" })).results).toEqual([]);
  });

  it("trims ori_question to 128 chars and drops it when blank", async () => {
    const { client, calls } = testClient([{ body: { results: [] } }, { body: { results: [] } }]);
    await client.search({ query: "q", ori_question: "x".repeat(200) });
    await client.search({ query: "q", ori_question: "  " });
    expect((calls[0]!.body.ori_question as string).length).toBe(128);
    expect(calls[1]!.body).not.toHaveProperty("ori_question");
  });

  it("validates count and query locally without calling the API", async () => {
    const { client, calls } = testClient([]);
    await expect(client.search({ query: "q", count: 51 })).rejects.toThrow(InputError);
    await expect(client.search({ query: "a".repeat(129) })).rejects.toThrow(InputError);
    expect(calls).toHaveLength(0);
  });
});

describe("errors and retries", () => {
  it("retries 429 and 5xx, then succeeds", async () => {
    const { client, calls } = testClient([
      { status: 429, body: { error: { message: "slow down" } }, headers: { "retry-after": "0" } },
      { status: 503, body: "upstream", headers: { "retry-after": "0" } },
      { body: { results: [] } },
    ]);
    await client.search({ query: "q" });
    expect(calls).toHaveLength(3);
  });

  it("does not retry 402 and surfaces the API message with a hint", async () => {
    const { client, calls } = testClient([
      { status: 402, body: { error: { message: "Insufficient Balance", type: "billing", code: "insufficient_balance" } } },
    ]);
    const err = await client.search({ query: "q" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeepSeekApiError);
    expect(err).toMatchObject({ status: 402, message: "Insufficient Balance", code: "insufficient_balance", retryable: false });
    expect((err as DeepSeekApiError).hint).toMatch(/Top up/);
    expect(calls).toHaveLength(1);
  });

  it("gives up after maxRetries", async () => {
    const r = { status: 500, body: { error: { message: "boom" } }, headers: { "retry-after": "0" } };
    const { client, calls } = testClient([r, r, r, r]);
    await expect(client.search({ query: "q" })).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(3);
  });

  it("requires an API key", () => {
    expect(() => new DeepSeekWebClient({ apiKey: "" })).toThrow(/DEEPSEEK_API_KEY/);
  });
});

describe("fetch", () => {
  it("posts the url and returns markdown", async () => {
    const { client, calls } = testClient([{ body: { title: "Doc", content: "# Hi" } }]);
    expect(await client.fetch("https://example.com")).toEqual({ title: "Doc", content: "# Hi" });
    expect(calls[0]!.url).toBe("https://api.deepseek.com/v1/tools/fetch");
    expect(calls[0]!.body).toEqual({ url: "https://example.com" });
  });

  it("rejects URLs the API would refuse, before calling it", async () => {
    const { client, calls } = testClient([]);
    for (const bad of ["ftp://x.com", "not a url", "https://user:pw@x.com", `https://x.com/${"a".repeat(8200)}`]) {
      await expect(client.fetch(bad)).rejects.toThrow(InputError);
    }
    expect(calls).toHaveLength(0);
  });
});
