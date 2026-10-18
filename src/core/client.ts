import { DeepSeekApiError, InputError } from "./errors.js";
import {
  COUNT_MAX,
  COUNT_MIN,
  DEFAULT_BASE_URL,
  FETCH_PATH,
  FETCH_URL_MAX_CHARS,
  ORI_QUESTION_MAX_CHARS,
  QPS_PER_ACCOUNT,
  SEARCH_PATH,
} from "./limits.js";
import { validateQuery } from "./query.js";
import { RateLimiter, sleep } from "./rate-limit.js";
import {
  FetchResponseSchema,
  SearchResponseSchema,
  type FetchResponse,
  type SearchRequest,
  type SearchResponse,
} from "./types.js";

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Per-attempt timeout. Default 60s; fetch of large pages can be slow. */
  timeoutMs?: number;
  /** Retries for 408, 429, 5xx and network errors. Default 3. */
  maxRetries?: number;
  userAgent?: string;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
}

export class DeepSeekWebClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly userAgent?: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly searchLimiter = new RateLimiter(QPS_PER_ACCOUNT);
  private readonly fetchLimiter = new RateLimiter(QPS_PER_ACCOUNT);

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new InputError("A DeepSeek API key is required (DEEPSEEK_API_KEY).");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.userAgent = options.userAgent;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    validateQuery(request.query);
    const count = request.count;
    if (count !== undefined && (!Number.isInteger(count) || count < COUNT_MIN || count > COUNT_MAX)) {
      throw new InputError(`count must be an integer between ${COUNT_MIN} and ${COUNT_MAX}`);
    }
    const body: SearchRequest = { ...request };
    if (body.ori_question !== undefined) {
      const q = body.ori_question.trim();
      // The API rejects anything over 128 chars; it is only a hint, so trim instead of failing.
      if (q) body.ori_question = [...q].slice(0, ORI_QUESTION_MAX_CHARS).join("");
      else delete body.ori_question;
    }
    const json = await this.post(SEARCH_PATH, body, this.searchLimiter);
    return SearchResponseSchema.parse(json);
  }

  async fetch(url: string): Promise<FetchResponse> {
    validateFetchUrl(url);
    const json = await this.post(FETCH_PATH, { url }, this.fetchLimiter);
    return FetchResponseSchema.parse(json);
  }

  private async post(path: string, body: unknown, limiter: RateLimiter): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      await limiter.acquire();
      try {
        return await this.once(path, body);
      } catch (err) {
        const retryable = err instanceof DeepSeekApiError ? err.retryable : isNetworkError(err);
        if (!retryable || attempt >= this.maxRetries) throw err;
        const retryAfter = err instanceof DeepSeekApiError ? err.retryAfterMs : undefined;
        await sleep(retryAfter ?? backoff(attempt));
        attempt++;
      }
    }
  }

  private async once(path: string, body: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.userAgent) headers["User-Agent"] = this.userAgent;

    const res = await this.fetchImpl(this.baseUrl + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) throw toApiError(res, text);
    try {
      return JSON.parse(text);
    } catch {
      throw new DeepSeekApiError(res.status, "Response was not valid JSON");
    }
  }
}

function toApiError(res: Response, text: string): DeepSeekApiError {
  let message = text.trim().slice(0, 500) || res.statusText || "Request failed";
  let type: string | undefined;
  let code: string | undefined;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown; type?: unknown; code?: unknown } };
    if (parsed.error) {
      if (typeof parsed.error.message === "string") message = parsed.error.message;
      if (typeof parsed.error.type === "string") type = parsed.error.type;
      if (parsed.error.code != null) code = String(parsed.error.code);
    }
  } catch {
    // Non-JSON error body; keep the raw text.
  }
  return new DeepSeekApiError(res.status, message, {
    type,
    code,
    retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds, 0) * 1000, 30_000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  return undefined;
}

function backoff(attempt: number): number {
  const base = 500 * 2 ** attempt;
  return base + Math.random() * base * 0.25;
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TypeError" || err.name === "TimeoutError" || err.name === "AbortError";
}

export function validateFetchUrl(url: string): void {
  if (url.length > FETCH_URL_MAX_CHARS) throw new InputError(`url must be at most ${FETCH_URL_MAX_CHARS} characters`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InputError(`Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new InputError("url must be http or https");
  if (!parsed.hostname) throw new InputError("url must include a host");
  if (parsed.username || parsed.password) throw new InputError("url must not contain a username or password");
}
