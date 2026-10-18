#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command, InvalidArgumentError } from "commander";
import { clientFromEnv } from "../config.js";
import { describeError } from "../core/errors.js";
import { formatFetch, formatResearch, formatSearch } from "../core/format.js";
import { buildQuery, type QueryFilters } from "../core/query.js";
import { research } from "../core/research.js";
import { startStdioServer } from "../mcp/index.js";
import { PACKAGE_NAME, VERSION } from "../meta.js";

const program = new Command()
  .name(PACKAGE_NAME)
  .description("Web search and page fetch powered by the DeepSeek Search & Fetch API (unofficial). Reads DEEPSEEK_API_KEY.")
  .version(VERSION);

program
  .command("mcp")
  .description("start the MCP server on stdio (for Claude Desktop, Cursor, Codex, VS Code...)")
  .action(startStdioServer);

const int = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new InvalidArgumentError("must be an integer");
  return n;
};
const float = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InvalidArgumentError("must be a number");
  return n;
};
const list = (v: string, prev: string[] = []) => [...prev, ...v.split(",").map((s) => s.trim()).filter(Boolean)];

interface FilterFlags {
  site?: string[];
  excludeSite?: string[];
  lang?: string[];
  after?: string;
  before?: string;
  localization?: string;
}

function withFilters(cmd: Command): Command {
  return cmd
    .option("-s, --site <domain>", "only these sites (repeatable or comma-separated)", list)
    .option("-x, --exclude-site <domain>", "exclude these sites (repeatable or comma-separated)", list)
    .option("-l, --lang <codes>", "language codes, e.g. es,en", list)
    .option("--after <date>", "pages after YYYY[-MM[-DD]]")
    .option("--before <date>", "pages before YYYY[-MM[-DD]]")
    .option("--localization <ip>", "IP address used to localize results");
}

function filtersOf(o: FilterFlags): QueryFilters {
  return { sites: o.site, excludeSites: o.excludeSite, lang: o.lang, after: o.after, before: o.before };
}

withFilters(
  program
    .command("search")
    .description("search the web")
    .argument("<query...>", "search query (max 128 chars including filters)")
    .option("-n, --count <n>", "number of results (1-50)", int)
    .option("-q, --question <text>", "the original question, to improve ranking")
    .option("--min-score <score>", "drop results below this rerank_score (0-3)", float)
    .option("--summary-chars <n>", "max characters per summary (default 800)", int)
    .option("-c, --content", "include page content")
    .option("--json", "print the raw JSON response")
    .option("-o, --output <file>", "write output to a file instead of stdout"),
).action(async (words: string[], o: FilterFlags & { count?: number; question?: string; minScore?: number; summaryChars?: number; content?: boolean; json?: boolean; output?: string }) => {
  const query = buildQuery(words.join(" "), filtersOf(o));
  const res = await clientFromEnv().search({
    query,
    count: o.count,
    ori_question: o.question,
    localization: o.localization,
    need_content: o.content ?? false,
  });
  const results = o.minScore === undefined ? res.results : res.results.filter((r) => r.rerank_score >= o.minScore!);
  await emit(o.json ? JSON.stringify({ query, results }, null, 2) : formatSearch(query, results, { includeContent: o.content, maxSummaryChars: o.summaryChars }), o.output);
});

program
  .command("fetch")
  .description("fetch a page as Markdown")
  .argument("<url>")
  .option("--max-chars <n>", "characters to print (default: all)", int)
  .option("--offset <n>", "character offset to start from", int)
  .option("--json", "print the raw JSON response")
  .option("-o, --output <file>", "write output to a file instead of stdout")
  .action(async (url: string, o: { maxChars?: number; offset?: number; json?: boolean; output?: string }) => {
    const page = await clientFromEnv().fetch(url);
    const text = o.json
      ? JSON.stringify({ url, ...page }, null, 2)
      : formatFetch(url, page, o.maxChars ?? Number.MAX_SAFE_INTEGER, o.offset ?? 0);
    await emit(text, o.output);
  });

withFilters(
  program
    .command("research")
    .description("search, keep the best results and return their full content with sources")
    .argument("<question...>")
    .option("--query <text>", "search query to use instead of the question")
    .option("-p, --pages <n>", "pages to include (default 5)", int)
    .option("--min-score <score>", "minimum rerank_score (default 1.5)", float)
    .option("--max-chars <n>", "content per page (default 6000)", int)
    .option("--json", "print structured JSON")
    .option("-o, --output <file>", "write output to a file instead of stdout"),
).action(async (words: string[], o: FilterFlags & { query?: string; pages?: number; minScore?: number; maxChars?: number; json?: boolean; output?: string }) => {
  const question = words.join(" ");
  const res = await research(clientFromEnv(), {
    question,
    query: o.query,
    maxPages: o.pages,
    minScore: o.minScore,
    localization: o.localization,
    ...filtersOf(o),
  });
  await emit(o.json ? JSON.stringify(res, null, 2) : formatResearch(question, res, o.maxChars ?? 6000), o.output);
});

async function emit(text: string, file?: string): Promise<void> {
  if (!file) {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    return;
  }
  await writeFile(file, text, "utf8");
  console.error(`Wrote ${text.length} chars to ${file}`);
}

program.parseAsync().catch((err: unknown) => {
  console.error(describeError(err));
  process.exitCode = 1;
});
