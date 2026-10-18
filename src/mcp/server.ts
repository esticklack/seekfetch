import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { DeepSeekWebClient } from "../core/client.js";
import { describeError } from "../core/errors.js";
import { formatFetch, formatResearch, formatSearch } from "../core/format.js";
import { COUNT_DEFAULT, COUNT_MAX, COUNT_MIN, HIGH_QUALITY_SCORE, QUERY_MAX_CHARS } from "../core/limits.js";
import { buildQuery } from "../core/query.js";
import { research } from "../core/research.js";
import { PACKAGE_NAME, VERSION } from "../meta.js";

const filters = {
  sites: z.array(z.string()).optional().describe("Only return results from these domains, e.g. [\"github.com\"]."),
  exclude_sites: z.array(z.string()).optional().describe("Exclude results from these domains."),
  lang: z.array(z.string()).optional().describe("Language codes, e.g. [\"en\", \"es\"]."),
  after: z.string().optional().describe("Only pages dated after this: YYYY, YYYY-MM or YYYY-MM-DD."),
  before: z.string().optional().describe("Only pages dated before this: YYYY, YYYY-MM or YYYY-MM-DD."),
  localization: z.string().optional().describe("Optional IP address used to localize results."),
};

const readOnly = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;

/**
 * `getClient` is called per tool call so the server can start (and list tools)
 * without an API key; the missing key is reported when a tool is used.
 */
export function createServer(getClient: () => DeepSeekWebClient): McpServer {
  const server = new McpServer({ name: PACKAGE_NAME, version: VERSION });

  server.registerTool(
    "deepseek_search",
    {
      title: "DeepSeek web search",
      description:
        "Search the live web with DeepSeek's search engine. Returns ranked results with a model-ready summary " +
        `(600-800 chars) per result. rerank_score ranges 0-3; >= ${HIGH_QUALITY_SCORE} is high quality. ` +
        "Use this to discover sources; then call deepseek_fetch on a URL for the full page, or use deepseek_research " +
        `to do both in one step. The query is limited to ${QUERY_MAX_CHARS} characters including filters and supports ` +
        'operators: "exact phrase", -term, -"phrase".',
      inputSchema: {
        query: z.string().min(1).describe(`Search query, max ${QUERY_MAX_CHARS} chars after filters are added.`),
        original_question: z
          .string()
          .optional()
          .describe("The user's original question, in their words. Improves ranking; trimmed to 128 chars."),
        count: z.number().int().min(COUNT_MIN).max(COUNT_MAX).optional().describe(`Results to return (default ${COUNT_DEFAULT}).`),
        min_score: z.number().min(0).max(3).optional().describe("Drop results below this rerank_score."),
        include_content: z
          .boolean()
          .optional()
          .describe("Also return each page's text (truncated). Costs no extra request but uses much more context."),
        ...filters,
      },
      annotations: readOnly,
    },
    async (args) =>
      run(async () => {
        const query = buildQuery(args.query, {
          sites: args.sites,
          excludeSites: args.exclude_sites,
          lang: args.lang,
          after: args.after,
          before: args.before,
        });
        const { results } = await getClient().search({
          query,
          count: args.count,
          ori_question: args.original_question,
          localization: args.localization,
          need_content: args.include_content ?? false,
        });
        const kept = args.min_score === undefined ? results : results.filter((r) => r.rerank_score >= args.min_score!);
        return formatSearch(query, kept, { includeContent: args.include_content });
      }),
  );

  server.registerTool(
    "deepseek_fetch",
    {
      title: "DeepSeek fetch page",
      description:
        "Fetch a web page through DeepSeek and return its content as Markdown. Long pages are returned in chunks: " +
        "when the output says to call again with an offset, do so to read further.",
      inputSchema: {
        url: z.string().describe("http(s) URL to fetch."),
        max_chars: z.number().int().min(500).max(200_000).optional().describe("Characters to return (default 20000)."),
        offset: z.number().int().min(0).optional().describe("Character offset to start from, for paging long pages."),
      },
      annotations: readOnly,
    },
    async (args) =>
      run(async () => {
        const page = await getClient().fetch(args.url);
        return formatFetch(args.url, page, args.max_chars ?? 20_000, args.offset ?? 0);
      }),
  );

  server.registerTool(
    "deepseek_research",
    {
      title: "DeepSeek research",
      description:
        "Answer-oriented web research in one call: searches, keeps the best-scoring results and returns their full " +
        "page content with numbered sources for citation. Prefer this over search+fetch when you need to read sources, " +
        "not just find them.",
      inputSchema: {
        question: z.string().min(1).describe("The question to research, in the user's words."),
        query: z
          .string()
          .optional()
          .describe(`Search query to use instead of the question. Required if the question exceeds ${QUERY_MAX_CHARS} chars.`),
        max_pages: z.number().int().min(1).max(10).optional().describe("Pages to return with content (default 5)."),
        min_score: z.number().min(0).max(3).optional().describe(`Minimum rerank_score (default ${HIGH_QUALITY_SCORE}).`),
        max_chars_per_page: z.number().int().min(500).max(50_000).optional().describe("Content per page (default 6000)."),
        ...filters,
      },
      annotations: readOnly,
    },
    async (args) =>
      run(async () => {
        const res = await research(getClient(), {
          question: args.question,
          query: args.query,
          maxPages: args.max_pages,
          minScore: args.min_score,
          sites: args.sites,
          excludeSites: args.exclude_sites,
          lang: args.lang,
          after: args.after,
          before: args.before,
          localization: args.localization,
        });
        return formatResearch(args.question, res, args.max_chars_per_page ?? 6000);
      }),
  );

  return server;
}

async function run(fn: () => Promise<string>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: await fn() }] };
  } catch (err) {
    return { content: [{ type: "text", text: describeError(err) }], isError: true };
  }
}
