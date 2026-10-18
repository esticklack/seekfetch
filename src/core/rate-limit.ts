/**
 * Spaces out calls so at most `perSecond` start in any one-second window.
 * In-process only; the API limit is per account, so separate processes
 * sharing a key can still hit 429 and fall back to retries.
 */
export class RateLimiter {
  private readonly intervalMs: number;
  private next = 0;

  constructor(perSecond: number, private readonly now: () => number = Date.now) {
    this.intervalMs = 1000 / perSecond;
  }

  async acquire(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.next);
    this.next = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
