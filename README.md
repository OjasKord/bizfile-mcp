# Bizfile MCP — Counterparty Validator

[![ToolRank](https://toolrank.dev/badge/dominant.svg)](https://toolrank.dev/ranking)

**AI-powered KYC, company verification, and sanctions screening
for AI agents.**

Real-time counterparty verification against UK Companies House,
with AI risk scoring and risk screening against 386 risk data
sources. Built for supplier onboarding agents, payment approval
workflows, and AML compliance pipelines.

## What This Solves

Every unverified counterparty is a liability. The most common
failure points — shell companies, dissolved entities, sanctioned
parties — share one signal: a company that looks legitimate but
isn't. Claude and other LLMs cannot reliably check live company
registry data or current sanctions lists from training data.

This tool calls authoritative sources directly:

- **UK Companies House API** — live filing data, officer history
- **OpenSanctions** — 386 risk data sources, updated daily

## Tools

| Tool | Free Tier | Use When |
|---|---|---|
| validate_counterparty | 20/month | Before any new supplier approval or contract |
| validate_counterparty_lite | 20/month | High-volume registry check, no AI scoring |
| screen_counterparty | Paid | Before any payment to a KYC-approved counterparty |

## Add to Your Agent

**Claude Code** — add to .mcp.json:
{
  "mcpServers": {
    "bizfile": {
      "type": "sse",
      "url": "https://bizfile-mcp-production.up.railway.app/sse"
    }
  }
}

**LangChain:**
from langchain_mcp import MCPClient
client = MCPClient(
    "https://bizfile-mcp-production.up.railway.app/sse"
)

**OpenAI Agents SDK:**
from agents.mcp import MCPServerSse
mcp_server = MCPServerSse(
    params={
        "url": "https://bizfile-mcp-production.up.railway.app/sse"
    }
)

## Pricing

| Tier | Calls | Price |
|---|---|---|
| Free | 20/month | No card required |
| Bundle 500 | 500, never expire | $20 |
| Bundle 2000 | 2,000, never expire | $70 |
| Pay-as-you-go | Metered | $0.019/query (validate_counterparty), $0.008/query (lite), $0.50/screen (sanctions) |

Upgrade: https://kordagencies.com

## Search Terms

company verification MCP · KYC check agent · sanctions screening
MCP · AML compliance tool · counterparty due diligence ·
Companies House API · supplier onboarding agent · payment verification MCP ·
OFAC screening · MAS Singapore sanctions · UK company check ·
corporate intelligence agent · counterparty risk scoring ·
AI KYC tool · know your customer API · business verification
agent · supplier risk screening · AML agent tool ·
MCP sanctions check
