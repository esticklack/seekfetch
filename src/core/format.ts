import type { ResearchResult } from "./research.js";
import type { FetchResponse, SearchResult } from "./types.js";

// Markdown renderers shared by the MCP server and the CLI. Kept compact:
// every character here ends up in a model's context window.

export interface Slice {
  text: string;
  /** Total length of the original text. */
  total: number;
  /** Offset to pass next time, or undefined when the text is complete. */
  nextOffset?: number;
}

export function slice(text: string, maxChars: number, offset = 0): Slice {
  const total = text.length;
  const end = Math.min(offset + maxChars, total);
  return { text: text.slice(offset, end), total, nextOffset: end < total ? end : undefined };
}

export function resultMeta(r: SearchResult): string {
  const bits = [r.url, `score ${r.rerank_score.toFixed(2)}`];
  if (r.authority >= 0) bits.push(`authority ${r.authority}/4`);
  if (r.date) bits.push(r.date.slice(0, 10));
  if (r.site_name) bits.push(r.site_name);
  return bits.join(" · ");
}

/** Docs say summaries are 600-800 chars; in practice they run 1,000-3,500, so they are capped. */
export const DEFAULT_SUMMARY_CHARS = 800;

export function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}…`;
}

export interface SearchFormatOptions {
  /** Include page content (only present when searched with need_content). */
  includeContent?: boolean;
  maxContentChars?: number;
  maxSummaryChars?: number;
}

export function formatSearch(query: string, results: SearchResult[], opts: SearchFormatOptions = {}): string {
  if (!results.length) return `No results for \`${query}\`.`;
  const max = opts.maxContentChars ?? 4000;
  const maxSummary = opts.maxSummaryChars ?? DEFAULT_SUMMARY_CHARS;
  const blocks = results.map((r, i) => {
    const lines = [`## ${i + 1}. ${r.title || r.url}`, resultMeta(r), "", clip(r.summary || r.snippet, maxSummary)];
    if (opts.includeContent && r.content) {
      const s = slice(r.content, max);
      lines.push("", "<content>", s.text);
      if (s.nextOffset) lines.push(`[truncated at ${max} of ${s.total} chars]`);
      lines.push("</content>");
    }
    return lines.join("\n");
  });
  return [`# Search: \`${query}\` (${results.length} results)`, ...blocks].join("\n\n");
}

export function formatFetch(url: string, page: FetchResponse, maxChars: number, offset = 0): string {
  const s = slice(page.content, maxChars, offset);
  const header = [`# ${page.title || url}`, url];
  if (offset > 0 || s.nextOffset !== undefined) {
    const range = `chars ${offset}-${offset + s.text.length} of ${s.total}`;
    header.push(s.nextOffset !== undefined ? `${range} — call again with offset=${s.nextOffset} for more` : range);
  }
  return [...header, "", s.text || "(empty page)"].join("\n");
}

export function formatResearch(question: string, res: ResearchResult, maxCharsPerPage: number): string {
  const head = [`# Research: ${question}`, `Query: \`${res.query}\` · ${res.pages.length} pages · ${res.dropped} dropped`];
  if (!res.pages.length) {
    head.push("", "No result met the score threshold. Lower `min_score`, broaden the query, or remove filters.");
    return head.join("\n");
  }
  const blocks = res.pages.map((p, i) => {
    const lines = [`## [${i + 1}] ${p.title || p.url}`, resultMeta(p)];
    // The summary is an excerpt of the content, so it is only shown when there is no content.
    if (p.content) {
      const s = slice(p.content, maxCharsPerPage);
      lines.push("", "<content>", s.text);
      if (s.nextOffset) lines.push(`[truncated at ${maxCharsPerPage} of ${s.total} chars; fetch the URL for the rest]`);
      lines.push("</content>");
    } else {
      lines.push("", clip(p.summary || p.snippet, DEFAULT_SUMMARY_CHARS));
      if (p.fetchError) lines.push("", `(no content: ${p.fetchError})`);
    }
    return lines.join("\n");
  });
  const sources = res.pages.map((p, i) => `[${i + 1}] ${p.url}`).join("\n");
  return [head.join("\n"), ...blocks, `## Sources\n${sources}`].join("\n\n");
}
