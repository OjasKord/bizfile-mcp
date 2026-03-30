# <!-- mcp-name: io.github.OjasKord/bizfile-mcp -->

# 

# Bizfile MCP — Global Company Intelligence

> Real-time company verification, KYC, and due diligence across 130+ jurisdictions for AI agents.

[!\[smithery badge](https://smithery.ai/badge/OjasKord/bizfile-mcp)](https://smithery.ai/server/OjasKord/bizfile-mcp)

## What it does

Bizfile MCP gives any AI agent instant access to verified company data from official government registries worldwide. No hallucinated data — every result comes directly from authoritative sources in real time.

Built for compliance, KYC, and due diligence workflows running inside AI agents.

\---

## Tools

### `search\\\_company`

Search for any company by name across UK Companies House, Singapore ACRA, and OpenCorporates (130+ jurisdictions).

**Example:**

```json
{ "company\\\_name": "Shell", "country": "UK" }
```

**Returns:** List of matching companies with registration numbers, status, jurisdiction, incorporation date, and registry URLs.

\---

### `get\\\_company\\\_profile`

Get a full company profile including registration status, registered address, SIC codes, filing history, accounts status, and key officers.

**Example:**

```json
{ "company\\\_name": "Shell PLC", "registration\\\_number": "04366849", "jurisdiction": "gb" }
```

**Returns:** Complete company record with filing history URL, SIC codes, accounts, and officer list.

\---

### `verify\\\_company`

KYC-style verification of a company across multiple registries. Returns a confidence rating (HIGH / MEDIUM / LOW), verified status, and any discrepancies found.

**Example:**

```json
{ "company\\\_name": "Accenture Singapore", "country": "SG" }
```

**Returns:** Verification report with confidence level, confirmed identity fields, data sources checked, and verification gaps.

\---

### `check\\\_company\\\_risk`

AI-powered due diligence risk assessment. Analyses registry data to produce a risk score (0–100), risk level, specific risk factors, and recommended due diligence actions.

**Example:**

```json
{ "company\\\_name": "Acme Trading Ltd", "registration\\\_number": "12345678", "jurisdiction": "gb" }
```

**Returns:** Risk score, risk level (LOW / MEDIUM / HIGH / CRITICAL), list of specific risk factors with severity, positive indicators, and recommended next steps.

\---

### `get\\\_officers`

Get the directors and officers of a UK company including appointment dates, roles, nationalities, and resignation history. Useful for beneficial ownership analysis.

**Example:**

```json
{ "company\\\_name": "Shell PLC", "registration\\\_number": "04366849", "jurisdiction": "gb" }
```

**Returns:** Active and resigned officers with roles, appointment dates, nationalities, and occupations.

\---

## Data Sources

|Source|Coverage|Free|
|-|-|-|
|UK Companies House|5M+ UK companies, full filing history|✅|
|Singapore ACRA|All Singapore-registered entities|✅|
|OpenCorporates|210M+ companies, 130+ jurisdictions|✅|
|US SEC EDGAR|All US public company filings|✅|

All data sourced from official government registries under open data licences. AI analysis powered by Anthropic Claude.

\---

## Quick Start

### Connect via Smithery

```bash
smithery mcp add OjasKord/bizfile-mcp
```

### Connect via Claude Desktop

Add to your `claude\\\_desktop\\\_config.json`:

```json
{
  "mcpServers": {
    "bizfile": {
      "command": "node",
      "args": \\\["/path/to/bizfile-mcp/src/server.js"],
      "env": {
        "ANTHROPIC\\\_API\\\_KEY": "your-key-here",
        "COMPANIES\\\_HOUSE\\\_API\\\_KEY": "your-key-here"
      }
    }
  }
}
```

### Connect via HTTP

```
https://bizfile-mcp--ojaskord.run.tools
```

\---

## Environment Variables

|Variable|Required|Description|
|-|-|-|
|`ANTHROPIC\\\_API\\\_KEY`|✅ Required|Powers AI risk assessment and verification|
|`COMPANIES\\\_HOUSE\\\_API\\\_KEY`|Recommended|Free from developer.company-information.service.gov.uk — unlocks full UK data|
|`OPENCORPORATES\\\_API\\\_TOKEN`|Optional|Higher rate limits on global search|

\---

## Use Cases

* **KYC automation** — Verify counterparties before onboarding
* **Due diligence agents** — Automated company research for M\&A and investment
* **Compliance workflows** — Screen companies against registry data
* **Legal research** — Director history, filing compliance, company status
* **Trade finance** — Verify buyers, sellers, and intermediaries in commodity deals
* **Credit underwriting** — Company age, filing history, officer stability

\---

## Pricing

|Tier|Price|Calls|
|-|-|-|
|Free|—|100 calls/month|
|Pro|$299/month|10,000 calls/month|
|Enterprise|$999/month|Unlimited + SLA|

\---

## Support

* GitHub Issues: [github.com/OjasKord/bizfile-mcp/issues](https://github.com/OjasKord/bizfile-mcp/issues)
* Email: contact@bizfilemcp.com

\---

## Legal

All data retrieved from official public government registries. This tool does not provide legal or financial advice. Always verify critical information with qualified professionals.

MIT License

