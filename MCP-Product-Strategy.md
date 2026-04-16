# MCP Product Strategy — Physical Commodity Trade Intelligence
## Session Codification Document

*Read this at the start of every new product/knowledge session with Ojas.
The technical build playbook is separate: MCP-Build-Playbook.md*

---

## The Core Strategy (Agreed and Locked)

- Build multiple MCP servers encoding Ojas's 30 years of physical commodity trade knowledge
- Customers are **AI agents**, not humans — zero direct sales
- Agents discover servers via Smithery, Glama, mcp.so, Anthropic MCP Registry
- Slower adoption is accepted — planting flags in an uncrowded space early
- Each server follows the proven Bizfile build playbook (Railway + npm + Stripe + registries)
- Pricing model: Free tier (limited calls) → Pro ($299/month) → Enterprise ($999/month)

---

## Why This Market Gap Exists

- The MCP ecosystem for finance is almost entirely focused on stock markets, crypto, and institutional banking
- Physical commodity trade (coal, rice, cashew nuts, bulk shipping, LCs) has **zero meaningful MCP coverage**
- Companies like CommodityAI (YC W24) are building AI agents for physical commodity operations but their agents can process documents — they cannot *reason* about operational risk
- Generic AI has no knowledge of: GAR vs NAR mismatches, Indonesian mine topology, barge-layering quality issues, floating crane economics, laytime traps by port
- That reasoning gap = Ojas's product

---

## What Ojas's Knowledge Actually Is

Ojas does not price trades. Ojas sees what traders miss:

> "A trader looks at cost. Ojas looks at cost + the full operational risk stack = true cost of trade."

The knowledge falls into distinct categories:

### 1. Operational Risk by Origin
Things that only someone who has been there knows:
- **Mine topology**: Deep bowl-shaped mines are more susceptible to rain delays than large shallow open-cut mines
- **Road infrastructure**: A single impassable road segment (e.g. due to heavy rain) can prevent cargo reaching the port entirely — demurrage clock keeps running
- **Loading method**: Indonesian coal is loaded by barges in layers (not blended). Chinese buyers expect well-blended coal. Hourly sampling at discharge shows quality variation even when overall parcel quality is correct — leads to disputes
- **Floating crane availability**: Proximity of floating cranes to a mine jetty dramatically affects freight costs — an edge most traders don't check

### 2. Specification Traps (Contractual Landmines)
- **GAR vs NAR**: Indonesians quote calorific value as GAR (Gross As Received). Chinese buyers are accustomed to NAR (Net As Received). NAR is always lower than GAR. Traders who don't reconcile this create specification mismatches that result in rejection, repricing, or claims at discharge

### 3. Contract Clause Intelligence
- Protective clauses that experienced traders insist on but juniors miss
- Force majeure language that actually covers road/port infrastructure failure vs language that sounds protective but doesn't
- Laytime terms — where buy-side and sell-side exposure can be mismatched
- Quality sampling clauses — especially critical for layered-loading origins

### 4. Counterparty Risk Patterns
- Red flags specific to commodity trade that generic KYC tools never check
- Pattern recognition from 30 years — not specific intelligence on named individuals
- Signals that a counterparty may not be who they claim to be
- Risk patterns that are corridor-specific (e.g. relevant to Indonesia FOB but not Australia FOB)

---

## Ojas's Coverage — Be Honest About Scope

### Commodities Ojas can speak to with authority:
- Thermal coal
- Iron ore
- Rice
- Cashew nuts
- Palm oil
- A few others (to be confirmed in knowledge sessions)

### Commodities Ojas does NOT cover:
- Everything else — do not pretend otherwise in system prompts

### Trade corridors Ojas knows well:
- Indonesia → China (richest knowledge base, start here)
- Indonesia → India
- Others to be confirmed in knowledge sessions

**This narrow scope is a strength, not a weakness.** Agents need reliable, specific outputs. A server that says "I know Indonesia→China thermal coal deeply" is more valuable than one that pretends to know everything.

---

## The MCP Server Roadmap

### Server 1: Commodity Contract Intelligence MCP ✅ START HERE
**Status:** Knowledge extraction not yet started

**What an agent calls it for:**
Given a trade (commodity, origin, destination, trade terms), return:
- Protective clauses the contract must contain
- Common specification traps for this corridor
- Red flags in the draft terms presented

**Input structure:**
- Commodity
- Origin country / port
- Destination country / port
- Trade terms (FOB / CIF / CFR etc.)
- Optional: draft clause text to review

**Output structure:**
- Required protective clauses (with explanation)
- Specification traps to watch for
- Missing clauses flagged
- Corridor-specific warnings

**Why this is Server 1:**
- Most codeable — finite rule set
- Clearest agent use case
- Ojas has already demonstrated knowledge depth here (GAR/NAR, barge layering, force majeure)
- No external API needed — Claude-as-brain with Ojas's knowledge in system prompt

**Knowledge extraction status:**
- Indonesia → China thermal coal: **partially started** (see session notes below)
- All other corridors: **not yet started**

---

### Server 2: Origin Operational Risk MCP
**Status:** Concept only — knowledge extraction not started

**What an agent calls it for:**
Given a commodity + origin, return operational risk factors that affect contract performance and true cost of trade.

**Agreed knowledge already captured:**
- Mine topology risk (deep bowl vs shallow open-cut)
- Road-to-port infrastructure vulnerability (rain, single road dependency)
- Loading method risk (barge layering vs conveyor blending)
- Floating crane availability as freight cost lever

**Why this is Server 2 not Server 1:**
Slightly harder to structure as deterministic tool outputs — requires more knowledge extraction sessions first.

---

### Server 3: Counterparty Risk Intelligence MCP
**Status:** Concept agreed — architecture designed, knowledge extraction not started

**What an agent calls it for:**
Given a counterparty profile + trade details, score against a red flag library and return risk tier + triggered flags.

**Input structure:**
- Counterparty name, country, claimed role (mine owner / trader / end buyer)
- Commodity
- Origin → Destination corridor
- Trade terms
- Payment terms requested
- Any other signals (vessel nomination entity, inspection agency named, etc.)

**Output structure:**
- Risk tier: Green / Amber / Red
- Triggered red flags with explanation
- Flags relevant to this specific trade flow only
- Recommended due diligence actions

**Each flag in the library has 4 attributes:**
1. The signal (what the agent observes)
2. Why it matters (what it indicates)
3. Risk level (Red / Amber / Green)
4. Relevant trade flows (all trades / Indonesia FOB only / etc.)

**Why Ojas is excited about this:**
Generic KYC tools check company registrations and sanctions lists. Ojas knows the trade-specific patterns that indicate fraud, misrepresentation, or operational unreliability — things no database captures.

**Important distinction:** This encodes *pattern recognition*, not intelligence on specific named individuals. The server teaches agents what signals to look for, not "trader X is dodgy."

---

### Servers 4+: To Be Defined
Ideas considered and current status:

| Idea | Status | Reason |
|---|---|---|
| Laytime / Demurrage Calculator | **Dropped** | Ojas finds it boring — not his passion |
| Back-to-back contract gap checker | **Possible future server** | Could be part of Server 1 or standalone |
| University / educator tool | **Dropped** | Sales cycle too long, wrong buyer |

---

## What "Claude as Brain" Means for These Servers

These servers do NOT use hardcoded rules alone. The architecture is:

1. Agent calls the MCP tool with structured inputs
2. Server constructs a prompt using Ojas's knowledge (encoded in system prompt)
3. Claude API call reasons over the inputs using that knowledge
4. Structured output returned to agent

This means the quality of the product = quality of the knowledge extraction sessions.

**Before writing any code for Server 1, we need the knowledge extraction session completed for at least one corridor (Indonesia → China thermal coal).**

---

## Knowledge Extraction — Session Notes

### Indonesia → China Thermal Coal (partial — from first session)

**Specification traps identified:**
- GAR vs NAR calorific value mismatch — Indonesians use GAR, Chinese accustomed to NAR. NAR is always lower. Missing reconciliation = rejection / repricing / claims at discharge

**Operational risks identified:**
- Deep bowl-shaped mines more susceptible to rain delays vs large shallow open-cut
- Road to port: single road segment impassable in heavy rain = vessel waiting, demurrage running
- Indonesian barge loading = layered coal (not blended). Chinese discharge ports do hourly sampling = quality variation disputes even when overall parcel is correct spec
- Floating crane availability near mine jetty = significant freight cost differential

**Protective clauses — NOT YET EXTRACTED**
**Force majeure language — NOT YET EXTRACTED**
**Laytime terms — NOT YET EXTRACTED**
**Payment / title transfer — NOT YET EXTRACTED**
**Sampling and analysis at discharge — NOT YET EXTRACTED**

---

## Knowledge Extraction Question Framework

Use these questions in future sessions to extract knowledge systematically:

**Category 1 — Specification Traps**
- What contractual terms do traders routinely get wrong for [commodity]?
- What unit, measurement, or definition differences between [origin] and [destination] cause disputes?

**Category 2 — Protective Clauses**
- What clauses do you always insist on as a seller? As a buyer?
- What's the minimum acceptable laytime for loading at [origin port type]?
- What force majeure language actually protects you vs language that sounds protective but doesn't?

**Category 3 — Back-to-Back Gaps**
- What's the most common mismatch between a trader's buy contract and sell contract?
- Which side — buy or sell — do junior traders typically leave exposed, and how?

**Category 4 — Commodity-Specific Quirks**
- What's unique about contracting for [commodity A] vs [commodity B]?
- What quality clauses does [commodity] need that traders forget?

**Category 5 — Costly Mistakes**
- What's the most expensive contract mistake you've personally witnessed or fixed?
- What clause, if missing, has cost traders the most money in your experience?

**Category 6 — Counterparty Red Flags (for Server 3)**
- What signals make you suspicious about a seller/buyer's identity or legitimacy?
- What payment term requests are red flags for [corridor]?
- What inspection agency patterns indicate risk?
- What entity structure patterns indicate the trader is not who they claim to be?

---

## Session Sequencing — What to Do Next

**Next session should be:**
Knowledge extraction for Server 1 — Indonesia → China thermal coal contract intelligence.

**Do NOT start coding until:**
At least one full corridor is extracted and documented (all 5 clause categories above answered).

**After first corridor is complete:**
Build Server 1 with that corridor only. Add corridors as knowledge is extracted. This is the correct sequencing — ship narrow and deep, expand over time.

---

## Decisions Made — Do Not Revisit Unless Ojas Initiates

| Decision | Outcome |
|---|---|
| Sell to traders directly? | No — agents only, passive discovery |
| Sell to universities/educators? | No — sales cycle too long |
| Partner with CommodityAI directly? | Ojas may pursue personally but not the focus |
| Price like Bizfile ($299/$999)? | Yes, same model |
| Build broad or narrow? | Narrow and deep per corridor — expand over time |
| Start with which server? | Server 1: Contract Intelligence |
| Start with which corridor? | Indonesia → China thermal coal |
