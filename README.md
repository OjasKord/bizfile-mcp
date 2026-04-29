[![smithery badge](https://smithery.ai/badge/OjasKord/bizfile-mcp)](https://smithery.ai/servers/OjasKord/bizfile-mcp)

<!-- mcp-name: io.github.OjasKord/bizfile-mcp -->

# Bizfile MCP — Counterparty Trust Layer for AI Agents

Verify any company before doing business with them. Real-time company verification, AI-powered risk assessment, and sanctions screening across 328 global lists. Data sourced directly from official government registries — not scraped, not cached, not hallucinated.

**Free tier: 20 calls/month. No API key required. Just connect and go.**

## Quick Start

Add to your MCP config (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "bizfile": {
    "url": "https://bizfile-mcp-production.up.railway.app"
  }
}
```

Or via Smithery:

```bash
npx -y @smithery/cli@latest mcp add OjasKord/bizfile-mcp
```

No API key needed for the first 20 calls/month.

## Why Use This

Before your agent signs a contract, makes a payment, onboards a supplier, or enters any B2B relationship — it should verify the counterparty is real, active, and not on a sanctions list. Scammers use dissolved companies, shell companies, and names similar to legitimate businesses. One check takes 2 seconds. Missing it can cost thousands.

## Tools

### `search_company`
Search for any company by name in official government registries. Use before any B2B transaction to confirm the company exists.

```json
{ "query": "Shell", "jurisdiction": "gb" }
```

### `get_company_profile`
Full company profile — registration status, address, SIC codes, accounts, filing history. Sourced directly from UK Companies House API.

```json
{ "company_number": "00445790", "jurisdiction": "gb" }
```

### `verify_company`
KYC-style verification returning confidence rating HIGH / MEDIUM / LOW. Confirms name match, registration number match, and active status.

```json
{ "company_name": "Shell UK Limited", "company_number": "00445790" }
```

### `check_company_risk` *(AI-powered — NOT a database lookup)*
AI analysis synthesising official registry data into a risk score 0-100, risk level LOW/MEDIUM/HIGH/CRITICAL, specific risk factors, and recommended due diligence actions. Catches recently incorporated companies, dissolved status, high-risk SIC codes, abnormal filing history, and shell company indicators.

```json
{ "company_name": "Acme Trading Ltd", "jurisdiction": "gb" }
```

### `get_officers`
Full directors and officers list — appointment dates, roles, nationalities, resignation history. Use to identify who controls a company before entering a significant contract.

```json
{ "company_number": "00445790" }
```

### `screen_entity` *(Pro / Enterprise only)*
Sanctions screening across 328 global lists via OpenSanctions API (api.opensanctions.org) — updated daily. Covers OFAC SDN, UN Security Council, EU Consolidated, UK OFSI, MAS Singapore, Australia DFAT, Japan METI, Canada SEMA, Switzerland SECO, and 320+ more. Supports fuzzy name matching and handles Arabic, Chinese, Cyrillic scripts.

```json
{ "name": "Acme Trading Ltd", "entity_type": "Company", "country": "gb" }
```

Cost: GBP 0.15/check (Pro), GBP 0.125/check (Enterprise). Cap: 500/month Pro, 2,000/month Enterprise.

## Example Responses

**check_company_risk:**
```json
{
  "risk_score": 23,
  "risk_level": "LOW",
  "analysis_type": "AI-powered — NOT a simple database lookup",
  "risk_factors": ["Relatively new company (incorporated 2019)"],
  "positive_indicators": ["Active status", "Consistent filing history", "3 directors"],
  "recommended_actions": ["Request last 2 years accounts", "Verify director identities"],
  "summary": "Acme Trading Ltd is a low-risk counterparty with consistent compliance history.",
  "source_url": "api.company-information.service.gov.uk",
  "checked_at": "2026-04-09T06:17:00Z"
}
```

## Data Sources

| Tool | Data Source | Update Frequency |
|---|---|---|
| search_company | UK Companies House (api.company-information.service.gov.uk) | Real-time |
| get_company_profile | UK Companies House (api.company-information.service.gov.uk) | Real-time |
| verify_company | UK Companies House (api.company-information.service.gov.uk) | Real-time |
| check_company_risk | UK Companies House + AI synthesis | Real-time |
| get_officers | UK Companies House (api.company-information.service.gov.uk) | Real-time |
| screen_entity | OpenSanctions (api.opensanctions.org) — 328 lists | Daily |

Every response includes `source_url` and `checked_at` so agents can verify exactly where data came from and when.

## Recommended Workflows

**Quick counterparty check (2 calls):**
1. `search_company` — confirm company exists, get registration number
2. `check_company_risk` — AI risk score and due diligence actions

**Full KYC onboarding (5 calls):**
1. `search_company` — confirm company exists
2. `get_company_profile` — verify registration details
3. `verify_company` — KYC confidence rating
4. `get_officers` — beneficial ownership check
5. `screen_entity` — sanctions screening (paid)

**Ongoing monitoring (monthly):**
- `screen_entity` on all active counterparties — sanctions lists change daily

## Pricing

| Plan | Calls | Sanctions | Price |
|---|---|---|---|
| Free | 20/month | Not included | No API key required |
| Pro | 10,000/month | 500 checks/month at GBP 0.15/check | $299/month |
| Enterprise | Unlimited | 2,000 checks/month at GBP 0.125/check | $999/month |

Upgrade at **[kordagencies.com](https://kordagencies.com)**

When you hit the free limit you receive a machine-readable error with an upgrade URL.

## Reliability

- Uptime monitored every 5 minutes via UptimeRobot
- Version history documented in [CHANGELOG.md](CHANGELOG.md)
- Health endpoint: `GET /health`

## Legal

Results are sourced directly from official government registries and sanctions databases. We do not log or store your query content. Results are for informational purposes only and do not constitute legal, compliance, or professional advice. Maximum liability limited to 3 months subscription fees. Full terms: [kordagencies.com/terms.html](https://kordagencies.com/terms.html)

## Connect

- Website: [kordagencies.com](https://kordagencies.com)
- Smithery: [smithery.ai/server/OjasKord/bizfile-mcp](https://smithery.ai/server/OjasKord/bizfile-mcp)
- Contact: ojas@kordagencies.com
