// Library entry: the same client the MCP server and CLI use.
export { DeepSeekWebClient, validateFetchUrl, type ClientOptions } from "./core/client.js";
export { DeepSeekApiError, InputError, describeError } from "./core/errors.js";
export { buildQuery, validateQuery, type QueryFilters } from "./core/query.js";
export { research, type ResearchOptions, type ResearchPage, type ResearchResult } from "./core/research.js";
export type { FetchResponse, SearchRequest, SearchResponse, SearchResult } from "./core/types.js";
export { createServer } from "./mcp/server.js";
