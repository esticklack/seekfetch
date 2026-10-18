---
name: seekfetch
description: |
  Web search and page fetch through the DeepSeek Search & Fetch API, using the `seekfetch` CLI. Use when the user wants to search the web, look something up, find sources or recent information, research a question with citations, or read the content of a URL as Markdown ("search for", "look up", "find articles about", "what's the latest on", "fetch this page", "read https://..."). Returns ranked results with model-ready summaries and relevance scores. Not for pages that need clicks, logins or JavaScript interaction, and not for crawling whole sites.
allowed-tools:
  - Bash(seekfetch *)
  - Bash(npx seekfetch *)
  - Bash(npx -y seekfetch *)
---

# seekfetch

CLI over DeepSeek's Search (`/v1/tools/search`) and Fetch (`/v1/tools/fetch`) APIs. Needs `DEEPSEEK_API_KEY` in the environment. If `seekfetch` is not installed, prefix commands with `npx -y`.

## Pick the command

| You have | You need | Run |
|---|---|---|
| a question | sources to read and cite | `seekfetch research "question"` |
| a topic | a list of candidate pages | `seekfetch search "query"` |
| a URL | its content | `seekfetch fetch <url>` |

`research` is usually the right first call for questions: one search returns the top pages with their content, and it only fetches pages whose content came back empty.

## Commands

```bash
# Ranked results with summaries capped at 800 chars (no page bodies)
seekfetch search "rust async runtime comparison" -n 10 --min-score 1.5

# Filters become query operators
seekfetch search "mcp server" --site github.com --lang en --after 2026-01-01
seekfetch search "pricing" --site example.com --exclude-site reddit.com

# Question -> best pages with content + numbered sources
seekfetch research "how does DeepSeek price its search API" -p 5 -o .seekfetch/pricing.md

# Long questions need a short search query (128-char limit)
seekfetch research "<long question>" --query "short keywords"

# Page as Markdown; page through long ones
seekfetch fetch https://example.com/docs --max-chars 20000
seekfetch fetch https://example.com/docs --max-chars 20000 --offset 20000
```

Add `--json` for raw data and `-o <file>` to write to a file instead of stdout.

## Rules of thumb

- **Write large outputs to files** (`-o .seekfetch/<name>.md`) and read the parts you need, instead of printing whole pages into context.
- **Pass the user's question** with `-q "..."` on `search`. DeepSeek uses it to rank (it is trimmed to 128 chars).
- **Trust the score**: `rerank_score` goes from 0 to 3, and 1.5 or more is high quality. Results below 1 are rarely worth fetching.
- **The query is capped at 128 characters, filters included.** Use keywords, not sentences.
- Operators inside the query work too: `"exact phrase"`, `-term`, `-"phrase"`.
- **Don't re-fetch** URLs that `research` already returned with content.
- Cite sources by URL in your answer.

## Errors

| Message | Meaning | Do |
|---|---|---|
| API key is required | `DEEPSEEK_API_KEY` not set | Ask the user to set it |
| 402 | Out of balance | Tell the user; don't retry |
| 403 / 404 on fetch | Blocked by policy or no usable content | Try another source |
| 429 | Rate limit (5 QPS) | Already retried; slow down |
| query is N characters | Over 128 | Shorten the query |

For pages that need a real browser (logins, clicks, heavy JavaScript) or for crawling a whole site, use a browser tool instead.
