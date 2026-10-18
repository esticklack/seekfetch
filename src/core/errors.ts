/** Error returned by the DeepSeek Search & Fetch API (OpenAI-style error body). */
export class DeepSeekApiError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly code?: string;
  /** From the Retry-After header, when the server sent one. */
  readonly retryAfterMs?: number;

  constructor(status: number, message: string, opts: { type?: string; code?: string; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "DeepSeekApiError";
    this.status = status;
    this.type = opts.type;
    this.code = opts.code;
    this.retryAfterMs = opts.retryAfterMs;
  }

  /** Per the docs: retry 408, 429 and 5xx. Anything else needs a different request. */
  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }

  /** Short, actionable hint for humans and agents. */
  get hint(): string | undefined {
    switch (this.status) {
      case 401:
        return "Missing or invalid API key. Set DEEPSEEK_API_KEY.";
      case 402:
        return "Insufficient DeepSeek balance. Top up at https://platform.deepseek.com before retrying.";
      case 403:
        return "The URL was rejected by DeepSeek's fetch security policy.";
      case 404:
        return "DeepSeek could not get usable content from that URL.";
      case 429:
        return "Rate limit hit (5 QPS per account, plus a per-domain limit for fetch).";
      default:
        return undefined;
    }
  }
}

/** Invalid input caught locally, before spending a request. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export function describeError(err: unknown): string {
  if (err instanceof DeepSeekApiError) {
    const hint = err.hint ? ` ${err.hint}` : "";
    return `DeepSeek API error ${err.status}: ${err.message}.${hint}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
