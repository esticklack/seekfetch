import { z } from "zod";

// Response schemas are deliberately tolerant: the API is new and may add,
// drop or null out fields. Unknown fields are ignored, missing ones defaulted.

const str = z.string().nullish().transform((v) => v ?? "");
const nullableStr = z.string().nullish().transform((v) => v ?? null);

export const SearchResultSchema = z.object({
  title: str,
  url: str,
  snippet: str,
  summary: str,
  content: str,
  rerank_score: z.number().nullish().transform((v) => v ?? 0),
  authority: z.number().int().nullish().transform((v) => v ?? -1),
  site_name: nullableStr,
  site_icon: nullableStr,
  date: nullableStr,
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema).nullish().transform((v) => v ?? []),
});

export const FetchResponseSchema = z.object({
  title: str,
  content: str,
});

export type SearchResult = z.output<typeof SearchResultSchema>;
export type SearchResponse = z.output<typeof SearchResponseSchema>;
export type FetchResponse = z.output<typeof FetchResponseSchema>;

/** Body sent to POST /v1/tools/search. */
export interface SearchRequest {
  query: string;
  count?: number;
  ori_question?: string;
  localization?: string;
  need_content?: boolean;
}
