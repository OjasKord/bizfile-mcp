<!-- mcp-name: io.github.OjasKord/bizfile-mcp -->

# Bizfile MCP — Company Intelligence for AI Agents

Real-time company verification, KYC, due diligence, and sanctions screening across 130+ jurisdictions. Connects directly to official government registries — no scraped data, no hallucinations.

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

No API key needed for the first 20 calls.

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
AI-powered risk assessment — score 0-100, risk level, specific risk factors, recommended due diligence actions.

```json
{ "company_name": "Acme Trading Ltd", "jurisdiction": "gb" }
```

### `get_officers`
Full directors and officers list — appointment dates, roles, nationalities, resignation history.

```json
{ "company_number": "00445790" }
```

### `screen_entity` *(Pro / Enterprise only)*
Sanctions screening across 328 global lists including OFAC, UN, EU, UK, MAS Singapore, Australia DFAT, and more. Returns match status, matched entity details, and billing metadata.

```json
{ "name": "Acme Trading Ltd", "entity_type": "company" }
```

Cost: GBP 0.15 per check (Pro), GBP 0.125 per check (Enterprise). Cap: 500/month (Pro), 2,000/month (Enterprise).

LEGAL NOTICE: Results are for informational purposes only and do not constitute a compliance clearance. Full terms: kordagencies.com/terms.html

## Example Usage

```
User: Check the risk of Acme Trading Ltd before we sign a contract.

Agent calls: check_company_risk({ "company_name": "Acme Trading Ltd" })

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
| OpenSanctions | 328 global sanctions lists |

## Pricing

| Plan | Calls | Price |
|---|---|---|
| Free | 20/month | No API key required |
| Pro | 10,000/month + 500 sanctions checks | $299/month |
| Enterprise | Unlimited + 2,000 sanctions checks | $999/month |

Upgrade at **[kordagencies.com](https://kordagencies.com)**

When you hit the free limit you will receive a machine-readable error in the tool response with a link to upgrade.

## Recommended Workflows

**Quick counterparty check:**
1. `search_company` — find the company and get registration number
2. `check_company_risk` — get risk score and due diligence actions

**Full KYC onboarding:**
1. `search_company` — confirm company exists
2. `get_company_profile` — verify registration details
3. `verify_company` — KYC confidence rating
4. `get_officers` — beneficial ownership check
5. `screen_entity` — sanctions screening (paid)

**Trade finance due diligence:**
1. `search_company` — confirm counterparty exists
2. `check_company_risk` — assess risk before contract
3. `get_officers` — verify directors
4. `screen_entity` — sanctions check on entity and directors

## Jurisdiction Codes

- `gb` — United Kingdom (Companies House)
- `sg` — Singapore (ACRA)
- `us` — United States (SEC EDGAR)
- `ie` — Ireland
- `au` — Australia
- 130+ more via OpenCorporates

## Use Cases

- **Trade finance** — verify counterparties before signing contracts
- **KYC/AML** — screen companies as part of onboarding workflows
- **Due diligence** — assess risk before investments or partnerships
- **Sanctions compliance** — screen against 328 global sanctions lists
- **Compliance** — check company status and officer history
- **Legal** — verify registered address and company standing

## Legal

Use of this service is subject to the Terms of Service at [kordagencies.com/terms.html](https://kordagencies.com/terms.html). Results are provided for informational purposes only and do not constitute legal, compliance, or professional advice. Maximum liability is limited to 3 months of subscription fees paid.

## Connect

- Website: [kordagencies.com](https://kordagencies.com)
- Smithery: [smithery.ai/server/OjasKord/bizfile-mcp](https://smithery.ai/server/OjasKord/bizfile-mcp)
- GitHub: [github.com/OjasKord/bizfile-mcp](https://github.com/OjasKord/bizfile-mcp)
- Contact: ojas@kordagencies.com
