# Vercel MCP

<p align="right">
    <a href="./README.md">English</a> | <b>简体中文</b>
</p>

[![GitHub last commit](https://img.shields.io/github/last-commit/ZhanZiyuan/vercel-mcp)](https://github.com/ZhanZiyuan/vercel-mcp/commits/main/)
[![GitHub License](https://img.shields.io/github/license/ZhanZiyuan/vercel-mcp)](https://github.com/ZhanZiyuan/vercel-mcp/blob/main/LICENSE)
[![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/ZhanZiyuan/vercel-mcp/total)](https://github.com/ZhanZiyuan/vercel-mcp/releases)

通过此扩展，你可以将Vercel的强大功能直接集成到Gemini CLI中。
它利用模型上下文协议（MCP），让Gemini能够以原生方式管理部署、查看构建日志并分析项目状态。

## 功能特性

- **完整的Vercel集成**：访问Vercel官方MCP服务器提供的11+种工具（Tools）和12+种提示词（Prompts）。
- **双语支持**：内置`GEMINI.md`上下文优化，支持中英文无缝交互，技术术语准确。
- **自定义指令**：为高频任务提供快捷指令（如`/vercel:status`、`/vercel:debug`）。

## 前置要求

- 已安装[Gemini CLI](https://geminicli.com)。
- 系统已安装Node.js和`npx`。
- 拥有Vercel账号。

## 安装指南

- **准备项目目录**：

确保你的项目文件结构如下所示：

```text
vercel-mcp/
├── commands/
│   └── vercel/
├── GEMINI.md
└── gemini-extension.json
```

- **链接扩展**：

  - 在项目根目录下运行以下命令，将扩展链接到Gemini CLI：

    ```bash
    gemini extensions link .
    ```

  - 或者通过以下命令安装：

    ```bash
    gemini extensions install https://github.com/ZhanZiyuan/vercel-mcp
    ```

- **重启Gemini CLI**：

    关闭并重新打开终端，或重启CLI会话。

- **授权认证**：

    首次使用功能（例如运行`/vercel:status`）时，CLI会提示你通过浏览器完成Vercel的授权认证。

## 配置说明

扩展通过`gemini-extension.json`进行配置。它使用`npx`直接运行远程MCP服务器，因此无需本地编译代码。

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

## 使用说明

### 快捷指令 (Custom Commands)

我们将常用的MCP Prompts映射为了便捷的CLI指令：

| 指令             | 描述                             | 对应的 MCP Prompt         |
| ---------------- | -------------------------------- | ------------------------- |
| `/vercel:status` | 获取最新部署的状态摘要           | `quick_status`            |
| `/vercel:debug`  | 分析最近失败构建的日志并给出建议 | `debug_deployment_issues` |
| `/vercel:help`   | 搜索 Vercel 官方文档             | `vercel_help`             |

### 自然语言交互

你也可以直接用自然语言向Gemini提问：

- *"列出我最近的项目。"* (调用 `list_projects`)
- *"帮我看看上一次部署为什么失败了？"* (调用 `get_deployment_build_logs`)
- *"检查域名 my-cool-app.com 现在的价格和可用性。"* (调用 `check_domain_availability_and_price`)

## 可用工具与提示词

此扩展通过Vercel MCP暴露了以下能力：

- **工具 (Tools)**: `deploy_to_vercel`, `get_deployment`, `get_deployment_build_logs`, `list_projects`, `search_vercel_documentation` 等。
- **提示词 (Prompts)**: `analyze_deployment_performance`, `fix_recent_build`, `project_health_check` 等。

---

*基于[Gemini CLI扩展指南](https://geminicli.com/docs/extensions/getting-started-extensions/)与[Vercel MCP文档](https://vercel.com/docs/mcp/vercel-mcp)构建。*
