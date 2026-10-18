import type { DeepSeekWebClient } from "./client.js";
import { describeError, InputError } from "./errors.js";
import { HIGH_QUALITY_SCORE, QUERY_MAX_CHARS } from "./limits.js";
import { buildQuery, type QueryFilters } from "./query.js";
import type { SearchResult } from "./types.js";

export interface ResearchOptions extends QueryFilters {
  /** The user's question, passed to DeepSeek as ori_question. */
  question: string;
  /** Search query; defaults to the question when it fits in 128 chars. */
  query?: string;
  /** Results to request from search. Default 10. */
  count?: number;
  /** Drop results below this rerank_score. Default 1.5 ("high quality"). */
  minScore?: number;
  /** Pages to return with full content. Default 5. */
  maxPages?: number;
  localization?: string;
}

export interface ResearchPage extends SearchResult {
  /** Where `content` came from: the search response, a follow-up fetch, or nowhere. */
  contentSource: "search" | "fetch" | "none";
  fetchError?: string;
}

export interface ResearchResult {
  query: string;
  pages: ResearchPage[];
  /** Results returned by search but dropped for low score or the page cap. */
  dropped: number;
}

export async function research(client: DeepSeekWebClient, opts: ResearchOptions): Promise<ResearchResult> {
  const base = opts.query ?? opts.question;
  if (!opts.query && [...base].length > QUERY_MAX_CHARS) {
    throw new InputError(`question is longer than ${QUERY_MAX_CHARS} characters; pass a short \`query\` as well`);
  }
  const query = buildQuery(base, opts);
  const minScore = opts.minScore ?? HIGH_QUALITY_SCORE;
  const maxPages = opts.maxPages ?? 5;

  // need_content lets one billed search call return page text for most results.
  const { results } = await client.search({
    query,
    count: opts.count ?? 10,
    ori_question: opts.question,
    localization: opts.localization,
    need_content: true,
  });

  const kept = results
    .filter((r) => r.url && r.rerank_score >= minScore)
    .sort((a, b) => b.rerank_score - a.rerank_score)
    .slice(0, maxPages);

  const pages = await Promise.all(
    kept.map(async (r): Promise<ResearchPage> => {
      if (r.content.trim()) return { ...r, contentSource: "search" };
      try {
        const page = await client.fetch(r.url);
        return { ...r, content: page.content, contentSource: page.content.trim() ? "fetch" : "none" };
      } catch (err) {
        return { ...r, contentSource: "none", fetchError: describeError(err) };
      }
    }),
  );

  return { query, pages, dropped: results.length - pages.length };
}
