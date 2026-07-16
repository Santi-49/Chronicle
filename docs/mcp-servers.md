# MCP Servers — AI-Assisted Development Setup

> See also: [Onboarding](onboarding.md) · [System Overview](architecture/overview.md)

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) lets AI agents call tools directly — query the database, control a browser, inspect containers, fetch URLs, and convert documents — without leaving the conversation. This page covers the five servers used in this project and how to wire them into each supported agent.

---

## Servers at a Glance

| Server | Purpose | Runtime |
|--------|---------|---------|
| `postgres-mcp` (Crystal DBA) | Query Postgres, inspect schema, verify migrations | `uvx` |
| `@playwright/mcp` | Drive a real browser — test frontends, screenshot UI | `npx` |
| `mcp-server-docker` | Stream container logs, inspect services, exec into containers | `npx` |
| `mcp-server-fetch` | Fetch URLs, convert HTML → Markdown inline | `uvx` |
| `markitdown-mcp` | Convert files and URLs to Markdown (PDFs, DOCX, HTML, images) | `uvx` |

---

## Prerequisites

### Node.js ≥ 20 LTS
Required for `npx`-based servers (postgres, playwright, docker).

| OS | Install |
|----|---------|
| **macOS** | `brew install node` or [nodejs.org](https://nodejs.org) |
| **Linux** | `curl -fsSL https://fnm.vercel.app/install \| bash && fnm use --install-if-missing 20` |
| **Windows** | [nodejs.org](https://nodejs.org) installer, or `winget install OpenJS.NodeJS.LTS` |

Verify: `node -v` → `v20.x.x`

### Python + uv
Required for `uvx`-based servers (fetch, markitdown).

| OS | Install |
|----|---------|
| **macOS** | `brew install uv` |
| **Linux** | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Windows** | `winget install astral-sh.uv` or `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |

Verify: `uv --version` → `uv 0.x.x`

### Docker Desktop
Required for `mcp-server-docker`. The MCP server connects to the Docker socket — Docker Desktop must be running. No extra config needed; the SDK auto-detects the socket on all platforms.

---

## Configuration by Agent

> **Postgres connection string:** copy `DATABASE_URL` from your `.env` file and change the scheme from `postgresql+asyncpg://` to `postgresql://`. For local dev: `postgresql://hackathon:<password>@localhost:5432/hackathon`

---

### Claude Code (CLI)

Claude Code supports two scopes. For team setups, commit `.mcp.json` at the project root. For personal servers, use `~/.claude/settings.json`.

**Quickest path — CLI wizard (adds to user scope):**

```bash
claude mcp add postgres -- uvx postgres-mcp postgresql://hackathon:changeme@localhost:5432/hackathon
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp add docker -- npx -y mcp-server-docker
claude mcp add fetch -- uvx mcp-server-fetch
claude mcp add markitdown -- uvx markitdown-mcp@latest
```

**Team setup — committed `.mcp.json` in the project root** uses the default local dev credentials. If your `.env` has different credentials, update the connection string locally (the file is committed but local dev credentials are not sensitive):

```json
{
  "mcpServers": {
    "postgres": {
      "type": "stdio",
      "command": "uvx",
      "args": ["postgres-mcp", "postgresql://hackathon:changeme@localhost:5432/hackathon"]
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "docker": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-docker"]
    },
    "fetch": {
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "markitdown": {
      "type": "stdio",
      "command": "uvx",
      "args": ["markitdown-mcp@latest"]
    }
  }
}
```

---

### Claude Desktop

Config file location:

| OS | Path |
|----|------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Linux** | `~/.config/claude-desktop/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |

Open the file (create it if absent) and paste:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "uvx",
      "args": ["postgres-mcp", "postgresql://hackathon:changeme@localhost:5432/hackathon"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "docker": {
      "command": "npx",
      "args": ["-y", "mcp-server-docker"]
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "markitdown": {
      "command": "uvx",
      "args": ["markitdown-mcp@latest"]
    }
  }
}
```

Replace the postgres connection string with your real credentials. Fully quit Claude Desktop (Cmd+Q / system tray → Quit) and reopen — partial closes do not reload config.

**Windows note:** use `npx.cmd` instead of `npx` if servers fail to start, and `uvx.exe` instead of `uvx`.

---

### GitHub Copilot in VS Code

MCP tools are only available in **Agent mode** (not Ask or Edit). Requires VS Code ≥ 1.102.

**Workspace-scoped (committed, shared with team) — `.vscode/mcp.json`** — uses VS Code's `inputs` feature to prompt for the URL once per session (`"password": true` means it is stored securely and never written to disk):

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "db-url",
      "description": "PostgreSQL connection URL",
      "default": "postgresql://hackathon:changeme@localhost:5432/hackathon",
      "password": true
    }
  ],
  "servers": {
    "postgres": {
      "type": "stdio",
      "command": "uvx",
      "args": ["postgres-mcp", "${input:db-url}"]
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "docker": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-docker"]
    },
    "fetch": {
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "markitdown": {
      "type": "stdio",
      "command": "uvx",
      "args": ["markitdown-mcp@latest"]
    }
  }
}
```

> **Note:** Copilot uses `"servers"` (not `"mcpServers"`). The `inputs` array is VS Code's way to securely inject secrets at connection time without storing them in the file.

**User-scoped (personal):** run `MCP: Open User Configuration` from the VS Code command palette to open the equivalent per-user file.

**Windows note:** if `npx` fails, try `"command": "cmd"` with `"args": ["/c", "npx", "-y", "..."]`.

---

### OpenAI Codex

Config file location (TOML format):

| OS | Path |
|----|------|
| **macOS / Linux** | `~/.codex/config.toml` |
| **Windows** | `%USERPROFILE%\.codex\config.toml` |

A project-scoped override is also supported at `.codex/config.toml` in trusted projects.

```toml
[mcp_servers.postgres]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-postgres", "postgresql://hackathon:changeme@localhost:5432/hackathon"]
enabled = true

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
enabled = true

[mcp_servers.docker]
command = "npx"
args = ["-y", "mcp-server-docker"]
enabled = true

[mcp_servers.fetch]
command = "uvx"
args = ["mcp-server-fetch"]
enabled = true

[mcp_servers.markitdown]
command = "uvx"
args = ["markitdown-mcp@latest"]
enabled = true
```

Tool approval modes per server (optional):

```toml
[mcp_servers.postgres]
default_tools_approval_mode = "prompt"   # ask before every query

[mcp_servers.docker]
default_tools_approval_mode = "approve"  # approve destructive ops explicitly
```

Alternatively manage via CLI: `codex mcp add`, `codex mcp list`, `codex mcp remove`.

---

### Antigravity (Google)

Config file location:

| OS | Path |
|----|------|
| **macOS / Linux** | `~/.gemini/antigravity/mcp_config.json` |
| **Windows** | `C:\Users\<USERNAME>\.gemini\antigravity\mcp_config.json` |

You can also open it from inside Antigravity via **`...` menu → MCP Servers → Manage MCP Servers → View raw config**.

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://hackathon:changeme@localhost:5432/hackathon"
      ]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "docker": {
      "command": "npx",
      "args": ["-y", "mcp-server-docker"]
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "markitdown": {
      "command": "uvx",
      "args": ["markitdown-mcp@latest"]
    }
  }
}
```

Antigravity also provides pre-integrated UI connectors for Google Cloud services (BigQuery, AlloyDB, Cloud SQL) — no config file editing required for those.

---

## Server Reference

### `postgres-mcp` (Crystal DBA)
Replaces the deprecated `@modelcontextprotocol/server-postgres` (which also had a SQL injection vulnerability). Find your connection string in `.env` under `DATABASE_URL` — change the scheme:

```
# .env value (asyncpg driver):
DATABASE_URL=postgresql+asyncpg://hackathon:changeme@localhost:5432/hackathon

# MCP connection string (standard psycopg driver):
postgresql://hackathon:changeme@localhost:5432/hackathon
```

Exposes tools for running queries, inspecting schema, and exploring table structure. Useful for verifying migrations, seeding data, and debugging ORM issues.

### `@playwright/mcp`
Launches a Chromium browser (headless by default). To run headed (visible window) during development, add `"--headed"` to the args array. Useful for testing the Astro landing page, the desktop renderer's dev-server URL, and auth flows against the API end-to-end.

### `mcp-server-docker`
Reads the Docker socket. Docker Desktop must be running. The server exposes tools to list containers, stream logs, exec commands, and inspect service state. No extra permissions needed on macOS/Windows (Docker Desktop handles socket access). On Linux you may need to add your user to the `docker` group: `sudo usermod -aG docker $USER` then log out and back in.

### `mcp-server-fetch`
No configuration. Fetches any URL and returns the content as Markdown. Useful for reading API docs, checking deployed pages, or pulling in reference material mid-conversation.

### `markitdown-mcp`
No configuration. Exposes a single `convert_to_markdown(uri)` tool. Supports `http://`, `https://`, `file://`, and `data:` URIs. Handles PDF, DOCX, XLSX, PPTX, HTML, and images (via OCR). Useful for reading design specs, PDFs, or any non-code file inline.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npx: command not found` | Install Node.js — see Prerequisites |
| `uvx: command not found` | Install uv — see Prerequisites |
| Postgres server exits immediately | Check the connection string; confirm Docker Compose is running (`make dev`) |
| Docker server fails to start | Ensure Docker Desktop is running; on Linux check `docker` group membership |
| Playwright can't find browsers | Run `npx playwright install chromium` once |
| Claude Desktop ignores config | Fully quit (Cmd+Q / tray → Quit) and reopen — partial close doesn't reload |
| Copilot tools not showing | Switch to Agent mode; MCP tools are unavailable in Ask and Edit modes |
