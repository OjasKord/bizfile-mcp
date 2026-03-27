# Bizfile MCP — Company Intelligence Server

Real-time company verification and due diligence across global registries.
Built for AI agents doing KYC, compliance, and corporate intelligence workflows.

## What it does

Bizfile MCP gives any AI agent instant access to company data from:
- **UK Companies House** — 5M+ UK companies, full filing history
- **Singapore ACRA** — All Singapore-registered entities
- **OpenCorporates** — 210M+ companies across 130+ jurisdictions
- **US SEC EDGAR** — All US public company filings

## Tools

| Tool | What it does |
|------|-------------|
| `search_company` | Find a company by name across all registries |
| `get_company_profile` | Full profile: status, address, SIC codes, filings |
| `verify_company` | KYC-style verification with confidence rating |
| `check_company_risk` | AI risk score (0-100) with due diligence flags |
| `get_officers` | Directors, appointment dates, resignation history |

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Run locally

```bash
npm start
```

### 4. Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bizfile": {
      "command": "node",
      "args": ["/path/to/bizfile-mcp/src/server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Optional: Unlock more data

For richer results, add these free API keys to your `.env`:

**UK Companies House** (highly recommended)
- Sign up free at: https://developer.company-information.service.gov.uk
- Unlocks: full filing history, detailed officer data, accounts

**OpenCorporates**
- Sign up free at: https://opencorporates.com/api_accounts/new
- Unlocks: higher rate limits across 130+ jurisdictions

## Example Usage

Once connected, an AI agent can:

```
Search for "Accenture" globally
→ Returns matches across UK, Singapore, US with registration numbers

Verify company "Shell International" registered in UK
→ Returns KYC verification report with confidence level

Check risk for company number 00102498 in jurisdiction gb
→ Returns risk score, red flags, recommended due diligence steps

Get officers of company 00102498
→ Returns all directors with appointment dates and nationalities
```

## Pricing

| Tier | Price | Calls |
|------|-------|-------|
| Starter | Pay per call | $0.05/call |
| Pro | $299/month | 10,000 calls/month |
| Enterprise | $999/month | Unlimited + SLA |

## Data Sources

All data is sourced from official government registries and OpenCorporates under open data licences. AI analysis is powered by Anthropic Claude.

## Support

contact@bizfilemcp.com
