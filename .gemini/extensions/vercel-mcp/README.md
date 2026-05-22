# Vercel MCP

<p align="right">
    <b>English</b> | <a href="./README_zh.md">简体中文</a>
</p>

[![GitHub last commit](https://img.shields.io/github/last-commit/ZhanZiyuan/vercel-mcp)](https://github.com/ZhanZiyuan/vercel-mcp/commits/main/)
[![GitHub License](https://img.shields.io/github/license/ZhanZiyuan/vercel-mcp)](https://github.com/ZhanZiyuan/vercel-mcp/blob/main/LICENSE)
[![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/ZhanZiyuan/vercel-mcp/total)](https://github.com/ZhanZiyuan/vercel-mcp/releases)

Bring the power of Vercel directly into your terminal with this Gemini CLI extension.
It utilizes the Model Context Protocol (MCP) to allow Gemini to manage deployments,
check build logs, and analyze project status natively.

## Features

- **Full Vercel Integration**: Access 11+ tools and 12+ prompts provided by the official Vercel MCP server.
- **Bilingual Support**: Optimized `GEMINI.md` context for seamless interaction in both English and Chinese.
- **Custom Commands**: Shortcuts for common tasks (e.g., `/vercel:status`, `/vercel:debug`).

## Prerequisites

- [Gemini CLI](https://geminicli.com) installed.
- Node.js and `npx` installed on your system.
- A Vercel account.

## Installation

- **Clone or Create Directory**:

Ensure your project structure looks like this:

```text
vercel-mcp/
├── commands/
│   └── vercel/
├── GEMINI.md
└── gemini-extension.json
```

- **Link the Extension**:

  - Navigate to the project root and link it to Gemini CLI:

    ```bash
    gemini extensions link .
    ```

  - Or install the extension using the following command:

    ```bash
    gemini extensions install https://github.com/ZhanZiyuan/vercel-mcp
    ```

- **Restart Gemini CLI**:

Close and reopen your terminal or restart the CLI session.

- **Authenticate**:

Upon first usage (e.g., running `/vercel:status`), Vercel will prompt you to authenticate via your browser.

## Configuration

The extension is configured via `gemini-extension.json`.
It uses `npx` to run the remote MCP server directly, so no local build is required.

```json
{
  "name": "vercel-mcp",
  "version": "1.0.0",
  "description": "A Gemini CLI extension for Vercel's official MCP server.",
  "contextFileName": "GEMINI.md",
  "mcpServers": {
    "vercel": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.vercel.com"
      ]
    }
  }
}
```

## Usage

### Custom Commands

We have mapped powerful MCP prompts to easy-to-use CLI commands:

| Command          | Description                              | Underlying Prompt         |
| ---------------- | ---------------------------------------- | ------------------------- |
| `/vercel:status` | Get a summary of your latest deployment  | `quick_status`            |
| `/vercel:debug`  | Analyze logs for the recent failed build | `debug_deployment_issues` |
| `/vercel:help`   | Search Vercel documentation              | `vercel_help`             |

### Natural Language

You can also ask Gemini naturally:

- *"List my recent projects."* (Uses `list_projects`)
- *"Why did my last deployment fail?"* (Uses `get_deployment_build_logs`)
- *"Check if the domain my-app.com is available."* (Uses `check_domain_availability_and_price`)

## Available Tools & Prompts

This extension exposes the following capabilities from Vercel:

- **Tools**: `deploy_to_vercel`, `get_deployment`, `get_deployment_build_logs`, `list_projects`, `search_vercel_documentation`, and more.
- **Prompts**: `analyze_deployment_performance`, `fix_recent_build`, `project_health_check`, etc.

---

*Based on the [Gemini CLI Extensions Guide](https://geminicli.com/docs/extensions/getting-started-extensions/) and [Vercel MCP Documentation](https://vercel.com/docs/mcp/vercel-mcp).*
