# seekfetch

**Web search and page-to-Markdown for AI agents, powered by the DeepSeek Search & Fetch API.**
One package, three ways to use it: an MCP server, a CLI, and a TypeScript library.

> **Unofficial community project.** seekfetch is not affiliated with, endorsed by, or sponsored by DeepSeek.
> It is a client for DeepSeek's public API and needs your own API key.

[![CI](https://github.com/esticklack/seekfetch/actions/workflows/ci.yml/badge.svg)](https://github.com/esticklack/seekfetch/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/seekfetch)](https://www.npmjs.com/package/seekfetch)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Why

- **Calls the dedicated endpoints** (`/v1/tools/search`, `/v1/tools/fetch`). No chat model sits in between, so a search costs one API request and no model tokens.
- **Search, fetch and research.** `research` returns the best pages *with their content* from a single search request, and only fetches the pages that came back empty.
- **Built for context windows.** It returns DeepSeek's model-ready summaries by default, filters by relevance score, and pages through long documents with an offset.
- **Production behavior.** It retries 408/429/5xx with backoff and honors `Retry-After`. It paces requests to the 5 QPS account limit and validates inputs locally so bad requests never cost a call. It parses responses tolerantly, so new or missing fields don't break it.

## Quick start

1. Get an API key at [platform.deepseek.com](https://platform.deepseek.com/api_keys).
2. Add seekfetch to your MCP client (below), or run it from the shell:

```bash
export DEEPSEEK_API_KEY=sk-...
npx -y seekfetch search "model context protocol registry"
```

Requires Node.js 22.12 or later.

## MCP setup

The server runs over stdio with `npx -y seekfetch mcp`.

<details open>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add seekfetch -e DEEPSEEK_API_KEY=sk-... -- npx -y seekfetch mcp
```
</details>

<details>
<summary><b>Claude Desktop</b> — <code>claude_desktop_config.json</code></summary>

```json
{
  "mcpServers": {
    "seekfetch": {
      "command": "npx",
      "args": ["-y", "seekfetch", "mcp"],
      "env": { "DEEPSEEK_API_KEY": "sk-..." }
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b> — <code>~/.cursor/mcp.json</code></summary>

```json
{
  "mcpServers": {
    "seekfetch": {
      "command": "npx",
      "args": ["-y", "seekfetch", "mcp"],
      "env": { "DEEPSEEK_API_KEY": "sk-..." }
    }
  }
}
```
</details>

<details>
<summary><b>VS Code</b> — <code>.vscode/mcp.json</code></summary>

```json
{
  "inputs": [
    { "type": "promptString", "id": "deepseek-key", "description": "DeepSeek API key", "password": true }
  ],
  "servers": {
    "seekfetch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "seekfetch", "mcp"],
      "env": { "DEEPSEEK_API_KEY": "${input:deepseek-key}" }
    }
  }
}
```
</details>

<details>
<summary><b>Codex</b> — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.seekfetch]
command = "npx"
args = ["-y", "seekfetch", "mcp"]
env = { DEEPSEEK_API_KEY = "sk-..." }
```
</details>

On Windows, if your client can't find `npx`, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "seekfetch", "mcp"]`.

### Tools

| Tool | What it does |
|---|---|
| `deepseek_search` | Ranked web results with a summary each (capped at 800 chars; `summary_chars` to change). Optional filters: `sites`, `exclude_sites`, `lang`, `after`, `before`, `min_score`; `include_content` adds page text. |
| `deepseek_fetch` | A URL as Markdown. Long pages come in chunks of `max_chars`; continue with `offset`. |
| `deepseek_research` | Question → top-scoring pages with content and numbered sources, in one call. |

All tools are read-only.

## CLI

```bash
npm i -g seekfetch          # or prefix each command with npx -y

seekfetch search "rust async runtimes" -n 5 --min-score 1.5
seekfetch search "mcp server" --site github.com --lang en --after 2026-01-01
seekfetch research "how is the DeepSeek search API priced?" -o notes.md
seekfetch fetch https://example.com --max-chars 20000
seekfetch search "query" --json | jq '.results[].url'
```

Run `seekfetch <command> --help` for every flag.

### Agent skill

[`skills/seekfetch/SKILL.md`](skills/seekfetch/SKILL.md) teaches agents with a shell (Claude Code, Codex and others that read `SKILL.md`) when and how to use the CLI. Copy the folder into your agent's skills directory, for example `~/.claude/skills/seekfetch/`.

## Library

```ts
import { DeepSeekWebClient, buildQuery, research } from "seekfetch";

const client = new DeepSeekWebClient({ apiKey: process.env.DEEPSEEK_API_KEY! });

const { results } = await client.search({
  query: buildQuery("vector databases", { sites: ["github.com"], after: "2026" }),
  count: 10,
});

const page = await client.fetch("https://example.com"); // { title, content (Markdown) }
const report = await research(client, { question: "What changed in MCP this year?", maxPages: 3 });
```

## Configuration

| Variable | Default | |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | Required. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Override for proxies. |
| `DEEPSEEK_TIMEOUT_MS` | `60000` | Per attempt. |
| `DEEPSEEK_MAX_RETRIES` | `3` | For 408, 429, 5xx and network errors. |

## API limits and pricing

As documented by DeepSeek on 2026-10-18; check the [Search & Fetch guide](https://api-docs.deepseek.com/guides/search) for current terms.

- Queries are limited to 128 characters, filters included. `count` is 1–50.
- Observed in practice: summaries run 1,000–3,500 characters (the docs say 600–800), page content from search is capped around 20,000 characters, and `site:` is a strong preference rather than a strict filter.
- 5 QPS per account for search, and separately for fetch. Fetch also has a per-domain limit.
- Billing is per successful request, published at $0.75 per 1,000 for each API. Empty results and errors are not billed.

## Development

```bash
npm install
npm test          # unit + MCP tests against a fake API
npm run build
```

Issues and PRs are welcome.

## License

[MIT](LICENSE). "DeepSeek" is a trademark of its owner and is used here only to describe the API this client calls.
