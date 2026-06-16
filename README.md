# Bizfile MCP — Counterparty Validator

[![ToolRank](https://toolrank.dev/badge/dominant.svg)](https://toolrank.dev/ranking)

**AI-powered KYC, company verification, and sanctions screening
for AI agents.**

Real-time counterparty verification across 210M+ companies in
130+ jurisdictions, with AI risk scoring and sanctions screening
against 328 global lists. Built for supplier onboarding agents,
payment approval workflows, and AML compliance pipelines.

## What This Solves

Every unverified counterparty is a liability. The most common
failure points — shell companies, dissolved entities, sanctioned
parties — share one signal: a company that looks legitimate but
isn't. Claude and other LLMs cannot reliably check live company
registry data or current sanctions lists from training data.

This tool calls authoritative sources directly:

- **UK Companies House API** — live filing data, officer history
- **Singapore ACRA** — real-time business registry
- **OpenCorporates** — 210M+ companies, 130+ jurisdictions
- **OpenSanctions** — 328 global sanctions lists, updated daily

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
| Pro | Unlimited | $299/month |
| Enterprise | Unlimited + priority | $999/month |

Upgrade: https://kordagencies.com

## Search Terms

company verification MCP · KYC check agent · sanctions screening
MCP · AML compliance tool · counterparty due diligence ·
Companies House API · Singapore ACRA lookup · OpenCorporates MCP ·
supplier onboarding agent · payment verification MCP ·
OFAC screening · MAS Singapore sanctions · UK company check ·
corporate intelligence agent · counterparty risk scoring ·
AI KYC tool · know your customer API · business verification
agent · supplier risk screening · AML agent tool ·
MCP sanctions check
