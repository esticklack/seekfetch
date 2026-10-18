import { DeepSeekWebClient } from "./core/client.js";
import { USER_AGENT } from "./meta.js";

/** Builds a client from the environment. Throws InputError when no key is set. */
export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekWebClient {
  return new DeepSeekWebClient({
    apiKey: env.DEEPSEEK_API_KEY?.trim() ?? "",
    baseUrl: env.DEEPSEEK_BASE_URL?.trim() || undefined,
    timeoutMs: positiveInt(env.DEEPSEEK_TIMEOUT_MS),
    maxRetries: positiveInt(env.DEEPSEEK_MAX_RETRIES),
    userAgent: USER_AGENT,
  });
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
