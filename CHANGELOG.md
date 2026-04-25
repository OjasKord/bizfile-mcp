# Changelog — Bizfile MCP

All notable changes to Bizfile MCP are documented here.
Format: version number, date, what changed.

---

## v4.10.2 — 2026-04-25

### Fixed
- `const VERSION` added as single source of truth -- all /health, initialize, GET /, and startup log now use VERSION constant
- SSE /messages initialize capabilities now includes `resources: {}` and `prompts: {}` -- was `{ tools: {} }` only
- `/.well-known/mcp/server-card.json` endpoint added -- required by Smithery for server discovery
- `agent_action` added to all `validate_counterparty` result paths: PROCEED / ENHANCED_DUE_DILIGENCE / BLOCK derived from `risk_level`
- `agent_action` added to all error responses across HTTP POST, SSE, and executeTool paths
- `resources/list` and `prompts/list` cases added to SSE handler

### Added
- stdio transport handler (`setupStdio()`) -- enables direct Claude Desktop / npm package usage
- `description` field added to all `serverInfo` objects in initialize responses (HTTP, SSE, stdio)

---

## v4.6.0 — 2026-04-09

### Added
- `source_url` field in every tool response — agents can verify exactly which government API provided the data
- `checked_at` ISO timestamp in every tool response — agents know exactly when the data was retrieved
- "We do not log or store your query content" added to legal disclaimer — privacy signal for operators
- "AI-powered analysis — NOT a simple database lookup" explicitly stated in `check_company_risk` responses and description
- Honest timeout error messages — HMRC and Companies House timeouts now explain the issue is with the external API, not the query

### Changed
- `check_company_risk` tool description updated to clearly highlight AI synthesis vs database lookup
- Free tier limit error message updated: "You have seen it work — upgrade to Pro at kordagencies.com"
- All tool descriptions updated with exact data source URLs
- Legal disclaimer updated across all responses

---

## v4.5.0 — 2026-04-07

### Added
- Counterparty trust layer reframe — broader positioning covering anti-scam, HR onboarding, ongoing monitoring
- Trigger-based tool descriptions — all tools use "Call this tool when..." format for agent discoverability
- `screen_entity` tool highlighted for ongoing monthly monitoring use case, not just one-time checks

### Changed
- All tool descriptions broadened beyond trade finance to cover any B2B workflow
- `screen_entity` description updated to highlight 328 global sanctions lists with named sources

---

## v4.4.0 — 2026-04-06

### Added
- Trigger-based tool descriptions written for agent consumption
- HR use case added to `screen_entity` — screen candidates and contractors before employment

---

## v4.3.0 — 2026-04-05

### Added
- Stats persistence to `/tmp/bizfile_stats.json` — survives server session, resets on deploy
- `tool_usage` tracking per tool name
- `recent_calls` log in stats endpoint

---

## v4.2.0 — 2026-04-04

### Added
- `resources/list` handler — returns empty array, required for Smithery compatibility
- `prompts/list` handler — returns empty array, required for Smithery compatibility
- Both declared in capabilities object in initialize response

---

## v4.1.0 — 2026-04-03

### Added
- `screen_entity` tool — sanctions screening across 328 global lists via OpenSanctions API
- Per-check billing metadata in response (`_billing` field)
- Sanctions cap enforcement: 500/month Pro, 2,000/month Enterprise
- Legal notice in `screen_entity` description and response

---

## v1.0.0 — 2026-03-28

### Added
- Initial release
- `search_company` — UK Companies House search
- `get_company_profile` — full company profile
- `verify_company` — KYC confidence rating HIGH/MEDIUM/LOW
- `check_company_risk` — AI-powered risk assessment
- `get_officers` — directors and officers list
- Free tier: 20 calls/month, no API key required
- Stripe webhook → API key email delivery
- Stats endpoint protected by STATS_KEY
