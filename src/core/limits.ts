// Every documented API limit lives here, so a change on DeepSeek's side is a one-line fix.

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const SEARCH_PATH = "/v1/tools/search";
export const FETCH_PATH = "/v1/tools/fetch";

export const QUERY_MAX_CHARS = 128;
export const ORI_QUESTION_MAX_CHARS = 128;
export const COUNT_MIN = 1;
export const COUNT_MAX = 50;
export const COUNT_DEFAULT = 10;
export const FETCH_URL_MAX_CHARS = 8192;

/** Per account, independent for search and fetch. */
export const QPS_PER_ACCOUNT = 5;

/** rerank_score >= 1.5 is what the docs call "high quality". */
export const HIGH_QUALITY_SCORE = 1.5;
