<!-- mcp-name: io.github.OjasKord/bizfile-mcp -->

# Bizfile MCP — Company Intelligence for AI Agents

Real-time company verification, KYC, and due diligence across 130+ jurisdictions. Connects directly to official government registries — no scraped data, no hallucinations.

**Free tier: 100 calls/month. No API key required. Just connect and go.**

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
smithery mcp add OjasKord/bizfile-mcp
```

That's it. No API key needed for the first 100 calls.

## Tools

### `search_company`
Search for any company by name across UK Companies House, Singapore ACRA, and 130+ jurisdictions.

```json
{ "query": "Shell", "jurisdiction": "gb" }
```

### `get_company_profile`
Full company profile — registration status, address, SIC codes, accounts, filing history.

```json
{ "company_number": "00445790", "jurisdiction": "gb" }
```

### `verify_company`
KYC-style verification returning confidence rating (HIGH / MEDIUM / LOW).

```json
{ "company_name": "Shell UK Limited", "company_number": "00445790" }
```

### `check_company_risk`
AI-powered risk assessment — score 0–100, risk level, specific risk factors, recommended due diligence actions.

```json
{ "company_name": "Acme Trading Ltd", "jurisdiction": "gb" }
```

### `get_officers`
Full directors and officers list — appointment dates, roles, nationalities, resignation history.

```json
{ "company_number": "00445790" }
```

## Example Usage

```
User: Check the risk of Acme Trading Ltd before we sign a contract.

Agent calls: check_company_risk({ company_name: "Acme Trading Ltd" })

Response:
{
  "risk_score": 23,
  "risk_level": "LOW",
  "risk_factors": ["Relatively new company (incorporated 2019)"],
  "positive_indicators": ["Active status", "Consistent filing history", "3 directors"],
  "recommended_actions": ["Request last 2 years accounts", "Verify director identities"],
  "summary": "Acme Trading Ltd is a low-risk counterparty with consistent compliance history..."
}
```

## Data Sources

| Registry | Coverage |
|---|---|
| UK Companies House | 5M+ UK companies, full filing history |
| Singapore ACRA | All Singapore-registered entities |
| US SEC EDGAR | All US public company filings |
| OpenCorporates | 210M+ companies, 130+ jurisdictions |

## Pricing

| Plan | Calls | Price |
|---|---|---|
| Free | 100/month | No API key required |
| Pro | 10,000/month | $299/month |
| Enterprise | Unlimited | $999/month |

Upgrade at **[kordagencies.com](https://kordagencies.com)**

When you hit the free limit you will receive a message in the tool response with a link to upgrade.

## Use Cases

- **Trade finance** — verify counterparties before signing contracts
- **KYC/AML** — screen companies as part of onboarding workflows
- **Due diligence** — assess risk before investments or partnerships
- **Compliance** — check company status and officer history
- **Legal** — verify registered address and company standing

## Connect

- Website: [kordagencies.com](https://kordagencies.com)
- Smithery: [smithery.ai/server/OjasKord/bizfile-mcp](https://smithery.ai/server/OjasKord/bizfile-mcp)
- GitHub: [github.com/OjasKord/bizfile-mcp](https://github.com/OjasKord/bizfile-mcp)
- Contact: ojas@kordagencies.com
