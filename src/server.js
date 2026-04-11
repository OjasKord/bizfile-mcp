const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const PERSIST_FILE = '/tmp/bizfile_stats.json';

function saveStats() {
  try {
    const data = { freeTierUsage: Array.from(freeTierUsage.entries()), usageLog: usageLog.slice(-1000) };
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(data));
  } catch(e) { console.error('Stats save error:', e.message); }
}

function loadStats() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
      if (data.freeTierUsage) data.freeTierUsage.forEach(([k, v]) => freeTierUsage.set(k, v));
      if (data.usageLog) usageLog.push(...data.usageLog);
      console.log('Stats loaded: ' + freeTierUsage.size + ' IPs, ' + usageLog.length + ' calls');
    }
  } catch(e) { console.error('Stats load error:', e.message); }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OPENSANCTIONS_API_KEY = process.env.OPENSANCTIONS_API_KEY || '';
const PORT = process.env.PORT || 3000;
const STATS_KEY = process.env.STATS_KEY || 'ojas2026';

const freeTierUsage = new Map();
const usageLog = [];
const FREE_TIER_LIMIT = 20;
const apiKeys = new Map();
const PLAN_LIMITS = { pro: 10000, enterprise: Infinity };
const SANCTIONS_LIMITS = { pro: 500, enterprise: 2000 };
const SANCTIONS_PRICE = { pro: 0.15, enterprise: 0.125 };

const LEGAL_DISCLAIMER = 'Results are sourced directly from official government registries (UK Companies House, Singapore ACRA, US SEC EDGAR) and the OpenSanctions database (api.opensanctions.org) covering 328 global sanctions lists. We do not log or store your query content. Results are for informational purposes only and do not constitute a legal determination of company status or sanctions clearance. Operator must independently verify all results before making compliance decisions. Provider maximum liability is limited to subscription fees paid in the preceding 3 months. Full terms: kordagencies.com/terms.html';

function nowISO() { return new Date().toISOString(); }
function generateApiKey() { return 'biz_' + crypto.randomBytes(24).toString('hex'); }
function getPlanFromProduct(productName) {
  if (!productName) return 'pro';
  if (productName.toLowerCase().includes('enterprise')) return 'enterprise';
  return 'pro';
}

async function sendEmail(to, subject, html) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ from: 'Bizfile MCP <ojas@kordagencies.com>', to: [to], subject, html });
    const req = https.request({
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', e => resolve({ error: e.message }));
    req.write(body); req.end();
  });
}

async function sendApiKeyEmail(email, apiKey, plan) {
  const planLabel = plan === 'enterprise' ? 'Enterprise' : 'Pro';
  const limit = plan === 'enterprise' ? 'Unlimited' : '10,000';
  const sanctionsLimit = plan === 'enterprise' ? '2,000' : '500';
  const sanctionsPrice = plan === 'enterprise' ? 'GBP 0.125' : 'GBP 0.15';
  const html = '<!DOCTYPE html><html><body style="font-family:monospace;background:#080A0F;color:#E8EDF5;padding:40px;max-width:600px;margin:0 auto"><div style="border:1px solid rgba(0,229,195,0.3);border-radius:8px;padding:32px"><div style="color:#00E5C3;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:24px">Counterparty Validator MCP - ' + planLabel + ' Plan</div><h1 style="font-size:24px;font-weight:700;margin-bottom:8px;color:#FFFFFF">Your API key is ready.</h1><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#5A6478;font-size:11px;text-transform:uppercase;margin-bottom:8px">Your API Key</div><div style="color:#00E5C3;font-size:14px;word-break:break-all">' + apiKey + '</div></div><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#5A6478;font-size:11px;text-transform:uppercase;margin-bottom:8px">MCP Config</div><div style="color:#86EFAC;font-size:12px">{"bizfile":{"url":"https://bizfile-mcp-production.up.railway.app","headers":{"x-api-key":"' + apiKey + '"}}}</div></div><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#E8EDF5;font-size:13px">Plan: ' + planLabel + ' | Calls: ' + limit + '/month<br>Sanctions: ' + sanctionsPrice + '/check (max ' + sanctionsLimit + '/month)</div></div><div style="background:#0D1219;border-radius:6px;padding:16px;margin-bottom:24px;font-size:11px;color:#5A6478;line-height:1.7">Results are for informational purposes only. We do not log your query content. Verify all results independently. Liability capped at 3 months fees. Full terms: kordagencies.com/terms.html</div><p style="color:#5A6478;font-size:12px">Questions? ojas@kordagencies.com</p></div></body></html>';
  return sendEmail(email, 'Your Counterparty Validator MCP ' + planLabel + ' API Key', html);
}

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d).content?.[0]?.text || ''); } catch(e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function searchCompaniesHouse(query) {
  return new Promise((resolve) => {
    const auth = Buffer.from(COMPANIES_HOUSE_API_KEY + ':').toString('base64');
    const req = https.request({ hostname: 'api.company-information.service.gov.uk', path: '/search/companies?q=' + encodeURIComponent(query) + '&items_per_page=5', method: 'GET', headers: { 'Authorization': 'Basic ' + auth } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
    req.on('error', () => resolve({}));
    req.setTimeout(8000, () => { req.destroy(); resolve({ _timeout: true }); });
    req.end();
  });
}

async function getCompanyDetails(number) {
  return new Promise((resolve) => {
    const auth = Buffer.from(COMPANIES_HOUSE_API_KEY + ':').toString('base64');
    const req = https.request({ hostname: 'api.company-information.service.gov.uk', path: '/company/' + number, method: 'GET', headers: { 'Authorization': 'Basic ' + auth } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
    req.on('error', () => resolve({}));
    req.setTimeout(8000, () => { req.destroy(); resolve({ _timeout: true }); });
    req.end();
  });
}

async function getOfficersData(number) {
  return new Promise((resolve) => {
    const auth = Buffer.from(COMPANIES_HOUSE_API_KEY + ':').toString('base64');
    const req = https.request({ hostname: 'api.company-information.service.gov.uk', path: '/company/' + number + '/officers', method: 'GET', headers: { 'Authorization': 'Basic ' + auth } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
    req.on('error', () => resolve({}));
    req.setTimeout(8000, () => { req.destroy(); resolve({ _timeout: true }); });
    req.end();
  });
}

async function screenEntityOpenSanctions(name, schema, country) {
  return new Promise((resolve) => {
    const query = { schema: schema || 'Thing', properties: { name: [name] } };
    if (country) query.properties.country = [country];
    const body = JSON.stringify({ queries: { q1: query } });
    const req = https.request({
      hostname: 'api.opensanctions.org', path: '/match/default', method: 'POST',
      headers: { 'Authorization': 'ApiKey ' + OPENSANCTIONS_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } }); });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

// ─── TOOLS ────────────────────────────────────────────────────────────────────
// Consolidated from 6 tools to 2. Agents no longer need to choose between
// overlapping tools. One call validates everything. One call screens everything.
// ─────────────────────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'validate_counterparty',
    description: 'Call this tool before your agent onboards any vendor, processes any payment, signs any contract, or begins any business relationship with a company. One call returns a complete counterparty validation package: registry lookup, active status, full registered profile, directors and officers, KYC confidence rating, and an AI-powered risk score. This is NOT a simple database lookup — the AI analysis synthesises official registry data, filing history, incorporation patterns, SIC codes, and structural signals to detect shell companies, dormant entities, recently incorporated vehicles, and high-risk counterparties that a plain registry check would miss. An agent that skips counterparty validation is onboarding blind — every unverified counterparty is a potential fraudster, sanctioned entity, or criminal vehicle. Use as the first step in any B2B workflow. Data sourced directly from official government registries: UK Companies House (api.company-information.service.gov.uk), Singapore ACRA, US SEC EDGAR. AI risk scoring powered by Claude — AI-powered analysis, NOT a simple database lookup. Returns: company_found, registered_name, registration_number, status (active/dissolved/struck-off), incorporation_date, registered_address, sic_codes, kyc_confidence (HIGH/MEDIUM/LOW), risk_score (0-100), risk_level (LOW/MEDIUM/HIGH/CRITICAL), risk_factors, positive_indicators, recommended_actions, directors_and_officers list, source_url, checked_at. LEGAL NOTICE: Results sourced from official government registries. We do not log your query content. Results are informational only — not a substitute for professional compliance advice. Full terms: kordagencies.com/terms.html. Free tier: first 20 calls/month, no API key needed.',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Full or partial name of the company to validate' },
        company_number: { type: 'string', description: 'Optional: registration number for exact match (more accurate)' },
        jurisdiction: { type: 'string', description: 'Optional: gb (UK, default), sg (Singapore), us (USA)' }
      },
      required: ['company_name']
    }
  },
  {
    name: 'screen_counterparty',
    description: 'Call this tool after validate_counterparty to screen the company AND all its directors against 328 global sanctions lists simultaneously. A clean company registration means nothing if the beneficial owner is on a sanctions list — this tool catches both. Covers OFAC SDN, UN Security Council, EU Consolidated, UK OFSI, MAS Singapore, Australia DFAT, Japan METI, Canada SEMA, Switzerland SECO, and 319 more — updated daily via OpenSanctions (api.opensanctions.org). Pass the officers array from validate_counterparty directly into this call to screen every director in one go. Returns a BLOCK / ENHANCED_DUE_DILIGENCE / PROCEED verdict for the company and each officer, with the specific sanction programs and lists that triggered each match. A single BLOCK on any director should stop the entire transaction. Use before issuing any Letter of Credit, processing any payment, signing any contract, or approving any new vendor. Also use monthly for ongoing monitoring of active counterparties — sanctions lists change daily and a clean check today does not guarantee clean tomorrow. LEGAL NOTICE: Billed at GBP 0.15/check Pro, GBP 0.125/check Enterprise. Each entity screened counts as one check. Paid API key required — upgrade at kordagencies.com. Results sourced from OpenSanctions covering 328 global lists. We do not log your query content. Results do not constitute a legal determination of sanctions status. Full terms: kordagencies.com/terms.html',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Name of the company to screen' },
        officers: { type: 'array', description: 'Optional: array of officer objects from validate_counterparty to screen all directors simultaneously', items: { type: 'object' } },
        country: { type: 'string', description: 'Optional: ISO country code to narrow search (e.g. ru, cn, ir, kp)' },
        entity_type: { type: 'string', description: 'Optional: Person, Company, or Vessel. Defaults to Thing (all types).' }
      },
      required: ['company_name']
    }
  }
];

// ─── TOOL EXECUTION ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  const checkedAt = nowISO();

  // ── validate_counterparty ──────────────────────────────────────────────────
  // Runs in parallel: registry search + company details + officers + AI risk
  // Returns a single comprehensive validation object
  if (name === 'validate_counterparty') {
    const companyName = args.company_name;
    const companyNumber = args.company_number;

    // Step 1: Find the company in the registry
    const searchResult = await searchCompaniesHouse(companyName);
    if (searchResult._timeout) {
      return { error: 'UK Companies House API is temporarily unavailable. This is not a problem with your query. Please retry in 2-3 minutes.', source_url: 'api.company-information.service.gov.uk', checked_at: checkedAt, _disclaimer: LEGAL_DISCLAIMER };
    }

    const items = searchResult.items || [];
    const company = companyNumber
      ? items.find(c => c.company_number === companyNumber) || items[0]
      : items.find(c => c.title.toLowerCase() === companyName.toLowerCase()) || items[0];

    if (!company) {
      return {
        company_found: false,
        company_name_searched: companyName,
        kyc_confidence: 'LOW',
        risk_score: 75,
        risk_level: 'HIGH',
        risk_factors: ['Company not found in UK Companies House registry'],
        recommended_actions: ['Verify company name spelling and jurisdiction', 'Request official registration documents from counterparty', 'Do not proceed without independent verification'],
        message: 'No matching company found. This may mean the company does not exist, is registered in a different jurisdiction, or the name differs from the official registered name.',
        source_url: 'api.company-information.service.gov.uk',
        checked_at: checkedAt,
        _disclaimer: LEGAL_DISCLAIMER
      };
    }

    // Step 2: Fetch full profile and officers in parallel
    const [details, officersData] = await Promise.all([
      getCompanyDetails(company.company_number),
      getOfficersData(company.company_number)
    ]);

    const officers = (officersData.items || []).map(o => ({
      name: o.name,
      role: o.officer_role,
      appointed: o.appointed_on,
      resigned: o.resigned_on || null,
      nationality: o.nationality || null
    }));

    // Step 3: KYC confidence rating
    const nameMatch = company.title.toLowerCase() === companyName.toLowerCase();
    const numberMatch = !companyNumber || company.company_number === companyNumber;
    const isActive = company.company_status === 'active';
    let kycConfidence = 'LOW';
    if (nameMatch && numberMatch && isActive) kycConfidence = 'HIGH';
    else if ((nameMatch || numberMatch) && isActive) kycConfidence = 'MEDIUM';

    // Step 4: AI risk scoring — always run, never skip
    const aiPrompt = 'You are a trade finance and KYC risk analyst. Assess the counterparty risk of this company.\n\n' +
      'Company name searched: ' + companyName + '\n' +
      'Registry match: ' + JSON.stringify({ name: company.title, number: company.company_number, status: company.company_status, type: company.company_type, incorporated: company.date_of_creation, address: company.address_snippet }) + '\n' +
      'Full profile: ' + JSON.stringify({ sic_codes: details.sic_codes, accounts: details.accounts, jurisdiction: details.jurisdiction, type: details.type }) + '\n' +
      'Officers (' + officers.length + '): ' + JSON.stringify(officers.slice(0, 5)) + '\n\n' +
      'This is AI-powered analysis synthesising official registry data — NOT a simple database lookup.\n' +
      'Assess: shell company indicators, dormancy, recent incorporation as risk vehicle, high-risk SIC codes, filing gaps, officer patterns.\n\n' +
      'Return ONLY valid JSON with no preamble:\n' +
      '{"risk_score":<0-100>,"risk_level":"LOW|MEDIUM|HIGH|CRITICAL","risk_factors":[<up to 5 specific factors>],"positive_indicators":[<up to 3>],"recommended_actions":[<up to 3 specific actions>],"summary":"<2 sentences max>"}';

    let aiRisk = { risk_score: 50, risk_level: 'MEDIUM', risk_factors: ['AI analysis unavailable — manual review recommended'], positive_indicators: [], recommended_actions: ['Conduct manual due diligence'], summary: 'AI risk scoring temporarily unavailable. Manual review required before proceeding.' };
    try {
      const aiResponse = await callClaude(aiPrompt);
      aiRisk = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
    } catch(e) {
      console.error('AI risk scoring error:', e.message);
    }

    return {
      company_found: true,
      // Registry data
      registered_name: company.title,
      registration_number: company.company_number,
      status: company.company_status,
      type: details.type || company.company_type,
      incorporation_date: company.date_of_creation,
      registered_address: details.registered_office_address || company.address_snippet,
      sic_codes: details.sic_codes || [],
      jurisdiction: details.jurisdiction || 'gb',
      accounts_last_filed: details.accounts ? details.accounts.last_accounts : null,
      // KYC
      kyc_confidence: kycConfidence,
      name_match: nameMatch,
      number_match: numberMatch,
      active: isActive,
      // AI risk — clearly labelled
      risk_score: aiRisk.risk_score,
      risk_level: aiRisk.risk_level,
      risk_factors: aiRisk.risk_factors,
      positive_indicators: aiRisk.positive_indicators,
      recommended_actions: aiRisk.recommended_actions,
      risk_summary: aiRisk.summary,
      analysis_type: 'AI-powered — NOT a simple database lookup',
      // Officers
      directors_and_officers: officers,
      total_officers: officers.length,
      // Sanctions note
      sanctions_screening_note: 'Registry validation complete. Run screen_counterparty to check this company and all directors against 328 global sanctions lists before proceeding.',
      // Standard fields
      source_url: 'api.company-information.service.gov.uk',
      checked_at: checkedAt,
      _disclaimer: LEGAL_DISCLAIMER
    };
  }

  // ── screen_counterparty ────────────────────────────────────────────────────
  // Screens the company + all provided officers against 328 sanctions lists
  // Returns a consolidated verdict with per-entity results
  if (name === 'screen_counterparty') {
    const companyName = args.company_name;
    const officers = args.officers || [];
    const country = args.country;
    const entityType = args.entity_type || 'Thing';

    // Build list of entities to screen: company + all active officers
    const entitiesToScreen = [{ name: companyName, type: 'Company', role: 'company' }];
    officers.forEach(o => {
      if (!o.resigned && o.name) {
        entitiesToScreen.push({ name: o.name, type: 'Person', role: o.role || 'officer' });
      }
    });

    const screeningResults = [];
    let overallVerdict = 'PROCEED';
    let blockCount = 0;
    let eddCount = 0;

    // Screen each entity sequentially to respect API limits
    for (const entity of entitiesToScreen) {
      const raw = await screenEntityOpenSanctions(entity.name, entity.type === 'Person' ? 'Person' : (entityType || 'Thing'), country);

      if (!raw) {
        screeningResults.push({
          entity: entity.name,
          role: entity.role,
          verdict: 'UNABLE_TO_SCREEN',
          error: 'OpenSanctions API is temporarily unavailable for this entity. Do not proceed — retry before making any compliance decision.'
        });
        overallVerdict = 'ENHANCED_DUE_DILIGENCE';
        eddCount++;
        continue;
      }

      const results = raw.responses?.q1?.results || [];
      const matches = results.filter(r => r.match === true && r.score >= 0.7);
      const topMatch = matches[0];

      if (!topMatch) {
        screeningResults.push({
          entity: entity.name,
          role: entity.role,
          verdict: 'PROCEED',
          sanctioned: false,
          match_found: false,
          summary: 'No matches found across 328 global sanctions lists.',
          lists_checked: 328
        });
        continue;
      }

      const topics = topMatch.properties?.topics || [];
      const isSanctioned = topics.includes('sanction') || topics.includes('debarment');
      const programs = topMatch.properties?.programId || [];
      const datasets = topMatch.datasets || [];

      let verdict = 'ENHANCED_DUE_DILIGENCE';
      if (isSanctioned) { verdict = 'BLOCK'; blockCount++; }
      else if (topics.includes('wanted') || topics.includes('export.control')) { verdict = 'ENHANCED_DUE_DILIGENCE'; eddCount++; }
      else if (topics.includes('role.pep')) { verdict = 'ENHANCED_DUE_DILIGENCE'; eddCount++; }
      else { eddCount++; }

      screeningResults.push({
        entity: entity.name,
        role: entity.role,
        verdict,
        sanctioned: isSanctioned,
        match_found: true,
        matched_name: topMatch.caption,
        match_score: Math.round(topMatch.score * 100) / 100,
        topics,
        sanction_programs: programs.slice(0, 10),
        lists_hit: datasets.slice(0, 10),
        lists_checked: 328,
        birth_date: topMatch.properties?.birthDate?.[0] || null,
        nationality: topMatch.properties?.nationality?.[0] || null,
        summary: isSanctioned
          ? 'SANCTIONED: Appears on ' + programs.length + ' sanctions programs including ' + datasets.slice(0, 3).join(', ') + '. BLOCK this transaction immediately.'
          : 'MATCH: Flagged as ' + topics.join(', ') + '. Enhanced due diligence required before proceeding.'
      });
    }

    // Determine overall verdict — worst case wins
    if (blockCount > 0) overallVerdict = 'BLOCK';
    else if (eddCount > 0) overallVerdict = 'ENHANCED_DUE_DILIGENCE';

    return {
      company_name: companyName,
      entities_screened: entitiesToScreen.length,
      overall_verdict: overallVerdict,
      block_count: blockCount,
      edd_count: eddCount,
      overall_summary: overallVerdict === 'BLOCK'
        ? 'BLOCK: ' + blockCount + ' entity/entities matched active sanctions lists. Do not proceed with this transaction. Notify compliance officer immediately.'
        : overallVerdict === 'ENHANCED_DUE_DILIGENCE'
        ? 'ENHANCED DUE DILIGENCE REQUIRED: Matches found requiring further investigation before proceeding.'
        : 'PROCEED: No sanctions matches found for the company or any of its directors across 328 global lists.',
      trade_finance_note: overallVerdict === 'BLOCK'
        ? 'Do not issue Letter of Credit, Bill of Lading, or process any payment. Notify compliance officer immediately and retain screening records.'
        : overallVerdict === 'ENHANCED_DUE_DILIGENCE'
        ? 'Conduct enhanced due diligence. Obtain additional documentation. Consider escalating to compliance officer before proceeding.'
        : 'Sanctions check passed. Proceed subject to other due diligence requirements.',
      screening_results: screeningResults,
      source_url: 'api.opensanctions.org',
      lists_checked: 328,
      checked_at: checkedAt,
      _disclaimer: LEGAL_DISCLAIMER
    };
  }

  return { error: 'Unknown tool: ' + name };
}

// ─── ACCESS CONTROL ───────────────────────────────────────────────────────────

function checkAccess(req) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const record = apiKeys.get(apiKey);
    if (!record) return { allowed: false, reason: 'Invalid API key. Get yours at kordagencies.com', tier: 'invalid' };
    if (record.limit !== Infinity && record.calls >= record.limit) return { allowed: false, reason: 'Monthly limit of ' + record.limit + ' calls reached. Upgrade at kordagencies.com', tier: 'limit_reached' };
    record.calls++;
    return { allowed: true, tier: record.plan, record, key: apiKey };
  }
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const calls = freeTierUsage.get(ip) || 0;
  if (calls >= FREE_TIER_LIMIT) return { allowed: false, reason: 'Free tier limit of ' + FREE_TIER_LIMIT + ' calls/month reached. You have seen it work — upgrade to Pro ($299/month) at kordagencies.com for 10,000 calls/month.', upgrade_url: 'https://kordagencies.com', tier: 'free_limit_reached' };
  freeTierUsage.set(ip, calls + 1);
  saveStats();
  const remaining = FREE_TIER_LIMIT - calls - 1;
  return { allowed: true, tier: 'free', remaining, warning: remaining < 5 ? remaining + ' free calls remaining. Upgrade at kordagencies.com' : null };
}

function checkSanctionsAccess(req) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return { allowed: false, reason: 'Sanctions screening requires a paid API key. Get yours at kordagencies.com. Billed at GBP 0.15/check Pro, GBP 0.125/check Enterprise.' };
  const record = apiKeys.get(apiKey);
  if (!record) return { allowed: false, reason: 'Invalid API key. Get yours at kordagencies.com' };
  const limit = SANCTIONS_LIMITS[record.plan] || 500;
  const used = record.sanctionsChecks || 0;
  if (used >= limit) return { allowed: false, reason: 'Sanctions screening limit of ' + limit + ' checks/month reached. Contact ojas@kordagencies.com to discuss higher limits.', checks_used: used, checks_limit: limit };
  record.sanctionsChecks = used + 1;
  const price = SANCTIONS_PRICE[record.plan] || 0.15;
  return { allowed: true, checks_used: used + 1, checks_remaining: limit - used - 1, checks_limit: limit, cost_this_call: 'GBP ' + price.toFixed(3), plan: record.plan };
}

// ─── STRIPE WEBHOOK ───────────────────────────────────────────────────────────

async function handleStripeWebhook(body) {
  try {
    const event = JSON.parse(body);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;
      const plan = getPlanFromProduct(session.metadata?.product_name || '');
      if (email) {
        const apiKey = generateApiKey();
        apiKeys.set(apiKey, { email, plan, createdAt: new Date().toISOString(), calls: 0, limit: PLAN_LIMITS[plan], sanctionsChecks: 0 });
        await sendApiKeyEmail(email, apiKey, plan);
        console.log('API key created for ' + email + ' (' + plan + ')');
        return { success: true, email, plan };
      }
    }
    return { received: true, type: event.type };
  } catch(e) { console.error('Webhook error:', e.message); return { error: e.message }; }
}

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-api-key, mcp-session-id, x-stats-key' };
  if (req.method === 'OPTIONS') { res.writeHead(200, cors); res.end(); return; }

  if (req.url === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '4.7.0', service: 'counterparty-validator-mcp', free_tier: 'no API key required for first 20 calls', paid_keys_issued: apiKeys.size, sanctions_screening: OPENSANCTIONS_API_KEY ? 'enabled' : 'disabled' }));
    return;
  }

  if (req.url === '/stats' && req.method === 'GET') {
    if (req.headers['x-stats-key'] !== STATS_KEY) { res.writeHead(401, cors); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const totalFreeCalls = Array.from(freeTierUsage.values()).reduce((a, b) => a + b, 0);
    const toolCounts = {};
    usageLog.forEach(e => { toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1; });
    const totalSanctionsChecks = Array.from(apiKeys.values()).reduce((a, r) => a + (r.sanctionsChecks || 0), 0);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ free_tier_unique_ips: freeTierUsage.size, free_tier_total_calls: totalFreeCalls, paid_keys_issued: apiKeys.size, total_sanctions_checks: totalSanctionsChecks, tool_usage: toolCounts, recent_calls: usageLog.slice(-20).reverse() }));
    return;
  }

  if (req.url === '/webhook/stripe' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => { const result = await handleStripeWebhook(body); res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); });
    return;
  }

  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        let sanctionsMeta = null;

        if (request.method !== 'initialize' && request.method !== 'notifications/initialized') {
          const toolName = request.method === 'tools/call' ? request.params?.name : null;
          if (toolName === 'screen_counterparty') {
            const sanctionsAccess = checkSanctionsAccess(req);
            if (!sanctionsAccess.allowed) {
              res.writeHead(402, { ...cors, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32002, message: sanctionsAccess.reason, data: sanctionsAccess } }));
              return;
            }
            sanctionsMeta = sanctionsAccess;
          } else {
            const access = checkAccess(req);
            if (!access.allowed) {
              res.writeHead(429, { ...cors, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: access.reason, upgrade_url: 'https://kordagencies.com' } }));
              return;
            }
            req._accessWarning = access.warning;
            req._tier = access.tier;
          }
        }

        let response;

        if (request.method === 'initialize') {
          response = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'bizfile-mcp', version: '4.7.0', description: 'Counterparty Validator for AI agents. One call validates any company: registry status, KYC confidence, AI risk score 0-100, directors and officers. Separate sanctions screening tool covers 328 global lists. Free tier: 20 calls/month, no API key needed.' } } };
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(204, cors); res.end(); return;
        } else if (request.method === 'tools/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { tools } };
        } else if (request.method === 'resources/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { resources: [] } };
        } else if (request.method === 'prompts/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { prompts: [] } };
        } else if (request.method === 'tools/call') {
          const { name, arguments: args } = request.params;
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          usageLog.push({ tool: name, tier: req._tier || (sanctionsMeta ? sanctionsMeta.plan : 'paid'), time: new Date().toISOString(), ip: ip.slice(0, 8) + '...' });
          if (usageLog.length > 1000) usageLog.shift();
          saveStats();
          const result = await executeTool(name, args || {});
          if (req._accessWarning) result._notice = req._accessWarning;
          if (sanctionsMeta) result._billing = { checks_used: sanctionsMeta.checks_used, checks_remaining: sanctionsMeta.checks_remaining, checks_limit: sanctionsMeta.checks_limit, cost_this_call: sanctionsMeta.cost_this_call };
          response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
        } else {
          response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found: ' + request.method } };
        }

        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch(e) {
        res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'bizfile-mcp', version: '4.7.0', status: 'ok', tools: 2, description: 'Counterparty Validator MCP. validate_counterparty: full registry + AI risk + officers in one call. screen_counterparty: 328 global sanctions lists for company + all directors. Free tier: 20 calls/month.', upgrade: 'https://kordagencies.com' }));
    return;
  }

  res.writeHead(404, cors); res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  loadStats();
  console.log('Counterparty Validator MCP v4.7.0 running on port ' + PORT);
  console.log('Tools: 2 (validate_counterparty, screen_counterparty)');
  console.log('Free tier: ' + FREE_TIER_LIMIT + ' calls/IP, no API key required');
  console.log('Sanctions screening: ' + (OPENSANCTIONS_API_KEY ? 'enabled' : 'DISABLED - set OPENSANCTIONS_API_KEY'));
  console.log('Resend: ' + (RESEND_API_KEY ? 'configured' : 'MISSING'));
  console.log('Anthropic: ' + (ANTHROPIC_API_KEY ? 'configured' : 'MISSING'));
});
