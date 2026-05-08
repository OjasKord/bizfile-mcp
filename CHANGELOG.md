# Changelog — Bizfile MCP

All notable changes to Bizfile MCP are documented here.
Format: version number, date, what changed.

---

## v4.10.16 — 2026-05-08

billing upgrade: Upstash Redis persistent key storage, monthly period reset, metered billing via Stripe Meter Events API, dual billing options (pay-as-you-go + bundles), /subscribe and /subscribed endpoints, FREE_TIER_LIMIT updated

## v4.10.15 — 2026-05-08

version bump: publish 4.10.15 to npm with discovery rewrite changes.

## v4.10.14 — 2026-05-08

discovery rewrite: tool descriptions rewritten with workflow triggers and consequence framing. README rewritten with AI engine search terms. smithery.yaml description updated.

## v4.10.13 — 2026-05-07

### Docs
- docs: add harness config blocks and improve registry description for developer discovery

## v4.10.12 — 2026-05-06

### Added
- Dashboard: add document-integrity-validator-mcp panel (9th server).

## v4.10.11 — 2026-05-05

### Fixed
- `_upgrade_note` denominator now reflects effective limit (30) after a trial extension is granted, not the base limit (20)

## v4.10.10 — 2026-05-05

### Fixed
- Free tier gate now only applies to tool calls, not discovery requests (tools/list, resources/list, prompts/list no longer consume free tier quota)

## v4.10.5 — 2026-04-28

### Changed
- Payment links updated to prepaid bundle URLs: 500 calls for $20 (PRO) and 2,000 calls for $80 (Enterprise) -- calls never expire
- Free tier limit error now directs agents to prepaid bundle purchase link directly

## v4.10.4 — 2026-04-27

### Added
- `token_count` field on all tool responses — lets orchestrator budget ledgers track token cost per call
- `/ready` endpoint — returns 200 when `ANTHROPIC_API_KEY` and `COMPANIES_HOUSE_API_KEY` are present, 503 otherwise
- Phase 4 enhanced error objects: `category`, `retryable`, `retry_after_ms`, `fallback_tool`, `trace_id` on all error returns
- `validate_counterparty_lite` tool — registry-only lookup with no AI call, ~60% lower token cost for budget-constrained orchestrators

## v4.10.3 — 2026-04-26

### Improved
- validate_counterparty and screen_counterparty descriptions rewritten with TCO framework: irresistibility opening, criminal liability consequence, exact data source hostnames, prepaid bundle pricing last
- Initialize serverInfo description rewritten with TCO framework (all 3 transport paths)

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
