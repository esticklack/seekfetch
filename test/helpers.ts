import { DeepSeekWebClient } from "../src/core/client.js";

export interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

/** A fake fetch that replays `replies` in order and records each call. */
export function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
      headers: init?.headers as Record<string, string>,
    });
    const reply = replies.shift() ?? { status: 500, body: { error: { message: "no more replies" } } };
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {});
    return new Response(text, { status: reply.status ?? 200, headers: reply.headers });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function testClient(replies: Reply[]) {
  const fake = fakeFetch(replies);
  const client = new DeepSeekWebClient({ apiKey: "sk-test", fetch: fake.fetch, maxRetries: 2 });
  return { client, calls: fake.calls };
}

export const result = (over: Record<string, unknown> = {}) => ({
  title: "Title",
  url: "https://example.com/a",
  snippet: "snippet",
  summary: "summary for the model",
  content: "",
  rerank_score: 2,
  authority: 3,
  site_name: "Example",
  site_icon: null,
  date: "2026-10-17T00:00:00Z",
  ...over,
});
