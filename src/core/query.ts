import { InputError } from "./errors.js";
import { QUERY_MAX_CHARS } from "./limits.js";

export interface QueryFilters {
  /** Restrict to these sites (joined with OR). */
  sites?: string[];
  /** Exclude these sites. */
  excludeSites?: string[];
  /** Language codes, e.g. ["es", "en"]. */
  lang?: string[];
  /** Year or YYYY-MM-DD. */
  after?: string;
  /** Year or YYYY-MM-DD. */
  before?: string;
}

const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Turns structured filters into DeepSeek's query operators. */
export function buildQuery(base: string, filters: QueryFilters = {}): string {
  const parts = [base.trim()];

  const sites = clean(filters.sites);
  if (sites.length) parts.push(sites.map((s) => `site:${s}`).join(" OR "));
  for (const s of clean(filters.excludeSites)) parts.push(`-site:${s}`);

  const lang = clean(filters.lang);
  if (lang.length) parts.push(`lang:${lang.join(",")}`);

  for (const [op, value] of [["after", filters.after], ["before", filters.before]] as const) {
    if (value === undefined || value === "") continue;
    if (!DATE_RE.test(value)) throw new InputError(`${op} must be YYYY, YYYY-MM or YYYY-MM-DD, got "${value}"`);
    parts.push(`${op}:${value}`);
  }

  return parts.filter(Boolean).join(" ");
}

export function validateQuery(query: string): void {
  if (!query.trim()) throw new InputError("query must not be empty");
  const length = [...query].length;
  if (length > QUERY_MAX_CHARS) {
    throw new InputError(
      `query is ${length} characters, DeepSeek allows ${QUERY_MAX_CHARS} (operators included). Shorten it or move context to the original question.`,
    );
  }
}

function clean(values?: string[]): string[] {
  return (values ?? []).map((v) => v.trim()).filter(Boolean);
}
