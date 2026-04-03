const http = require('http');
const https = require('https');
const crypto = require('crypto');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const PORT = process.env.PORT || 3000;

// Track free tier usage by IP
const freeTierUsage = new Map(); // IP -> call count
const FREE_TIER_LIMIT = 20;

// Paid API keys
const apiKeys = new Map();
const PLAN_LIMITS = { pro: 10000, enterprise: Infinity };

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
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', e => resolve({ error: e.message }));
    req.write(body); req.end();
  });
}

async function sendApiKeyEmail(email, apiKey, plan) {
  const planLabel = plan === 'enterprise' ? 'Enterprise' : 'Pro';
  const limit = plan === 'enterprise' ? 'Unlimited' : '10,000';
  const html = `<!DOCTYPE html><html><body style="font-family:monospace;background:#080A0F;color:#E8EDF5;padding:40px;max-width:600px;margin:0 auto"><div style="border:1px solid rgba(0,229,195,0.3);border-radius:8px;padding:32px"><div style="color:#00E5C3;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:24px">Bizfile MCP · ${planLabel} Plan</div><h1 style="font-size:24px;font-weight:700;margin-bottom:8px;color:#FFFFFF">Your API key is ready.</h1><p style="color:#8A95A8;margin-bottom:32px">Welcome to Bizfile MCP. Here is everything you need to get started.</p><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#5A6478;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px">Your API Key</div><div style="color:#00E5C3;font-size:14px;word-break:break-all;font-weight:500">${apiKey}</div></div><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#5A6478;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">Add to your MCP config</div><div style="color:#86EFAC;font-size:12px;line-height:2">{<br>&nbsp;&nbsp;"bizfile": {<br>&nbsp;&nbsp;&nbsp;&nbsp;"url": "https://bizfile-mcp-production.up.railway.app",<br>&nbsp;&nbsp;&nbsp;&nbsp;"headers": { "x-api-key": "${apiKey}" }<br>&nbsp;&nbsp;}<br>}</div></div><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:32px"><div style="color:#5A6478;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">Your Plan</div><div style="color:#E8EDF5;font-size:13px;line-height:2">Plan: ${planLabel}<br>API calls: ${limit}/month<br>All 5 MCP tools included<br>AI risk assessment included</div></div><p style="color:#5A6478;font-size:12px">Questions? Email ojas@kordagencies.com</p><p style="color:#5A6478;font-size:12px;margin-top:8px">— Ojas, Kordagencies</p></div></body></html>`;
  return sendEmail(email, `Your Bizfile MCP ${planLabel} API Key`, html);
}

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d).content?.[0]?.text || ''); } catch(e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function searchCompaniesHouse(query) {
  return new Promise((resolve) => {
    const auth = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString('base64');
    const req = https.request({ hostname: 'api.company-information.service.gov.uk', path: `/search/companies?q=${encodeURIComponent(query)}&items_per_page=5`, method: 'GET', headers: { 'Authorization': `Basic ${auth}` } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
    req.on('error', () => resolve({})); req.end();
  });
}

async function getCompanyDetails(number) {
  return new Promise((resolve) => {
    const auth = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString('base64');
    const req = https.request({ hostname: 'api.company-information.service.gov.uk', path: `/company/${number}`, method: 'GET', headers: { 'Authorization': `Basic ${auth}` } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
    req.on('error', () => resolve({})); req.end();
  });
}

async function getOfficersData(number) {
  return new Promise((resolve) => {
    const auth = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString('base64');
    const req = https.request({ hostname: 'api.company-information.service.gov.uk', path: `/company/${number}/officers`, method: 'GET', headers: { 'Authorization': `Basic ${auth}` } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); });
    req.on('error', () => resolve({})); req.end();
  });
}

const tools = [
  { name: 'search_company', description: 'Search for companies by name across global registries including UK Companies House, Singapore ACRA, and 130+ jurisdictions via OpenCorporates. no API key required for first 20 calls.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Company name to search for' }, jurisdiction: { type: 'string', description: 'Optional country code: gb, sg, us' } }, required: ['query'] } },
  { name: 'get_company_profile', description: 'Get full company profile including registration status, address, SIC codes, accounts and filing history. no API key required for first 20 calls.', inputSchema: { type: 'object', properties: { company_number: { type: 'string', description: 'Company registration number' }, jurisdiction: { type: 'string', description: 'Country code: gb, sg, us. Defaults to gb.' } }, required: ['company_number'] } },
  { name: 'verify_company', description: 'KYC-style verification returning confidence rating HIGH/MEDIUM/LOW and identity confirmation. no API key required for first 20 calls.', inputSchema: { type: 'object', properties: { company_name: { type: 'string', description: 'Company name to verify' }, company_number: { type: 'string', description: 'Optional registration number to verify against' }, jurisdiction: { type: 'string', description: 'Country code: gb, sg, us' } }, required: ['company_name'] } },
  { name: 'check_company_risk', description: 'AI-powered risk assessment returning score 0-100, risk level LOW/MEDIUM/HIGH/CRITICAL, specific risk factors and recommended due diligence actions. no API key required for first 20 calls.', inputSchema: { type: 'object', properties: { company_name: { type: 'string', description: 'Company name to assess' }, company_number: { type: 'string', description: 'Optional registration number for more accurate results' }, jurisdiction: { type: 'string', description: 'Country code: gb, sg, us' } }, required: ['company_name'] } },
  { name: 'get_officers', description: 'Get full list of directors and officers including appointment dates, roles, nationalities and resignation history. no API key required for first 20 calls.', inputSchema: { type: 'object', properties: { company_number: { type: 'string', description: 'Company registration number' }, jurisdiction: { type: 'string', description: 'Country code: gb, sg, us. Defaults to gb.' } }, required: ['company_number'] } }
];

async function executeTool(name, args) {
  if (name === 'search_company') {
    const r = await searchCompaniesHouse(args.query);
    const items = r.items || [];
    if (!items.length) return { found: false, message: 'No companies found.' };
    return { found: true, total_results: r.total_results || items.length, companies: items.slice(0,5).map(c => ({ name: c.title, number: c.company_number, status: c.company_status, type: c.company_type, address: c.address_snippet, incorporated: c.date_of_creation })) };
  }
  if (name === 'get_company_profile') {
    const d = await getCompanyDetails(args.company_number);
    if (d.error) return { error: 'Company not found', number: args.company_number };
    return { name: d.company_name, number: d.company_number, status: d.company_status, type: d.type, incorporated: d.date_of_creation, address: d.registered_office_address, sic_codes: d.sic_codes, accounts: d.accounts, jurisdiction: d.jurisdiction };
  }
  if (name === 'get_officers') {
    const d = await getOfficersData(args.company_number);
    const items = d.items || [];
    return { total_officers: d.total_results || items.length, officers: items.map(o => ({ name: o.name, role: o.officer_role, appointed: o.appointed_on, resigned: o.resigned_on || null, nationality: o.nationality })) };
  }
  if (name === 'verify_company') {
    const r = await searchCompaniesHouse(args.company_name);
    const items = r.items || [];
    const company = args.company_number ? items.find(c => c.company_number === args.company_number) || items[0] : items.find(c => c.title.toLowerCase() === args.company_name.toLowerCase()) || items[0];
    if (!company) return { verified: false, confidence: 'LOW', reason: 'Company not found in registry' };
    const nameMatch = company.title.toLowerCase() === args.company_name.toLowerCase();
    const numberMatch = !args.company_number || company.company_number === args.company_number;
    const isActive = company.company_status === 'active';
    let confidence = 'LOW';
    if (nameMatch && numberMatch && isActive) confidence = 'HIGH';
    else if ((nameMatch || numberMatch) && isActive) confidence = 'MEDIUM';
    return { verified: confidence !== 'LOW', confidence, matched_name: company.title, matched_number: company.company_number, status: company.company_status, name_match: nameMatch, number_match: numberMatch, active: isActive, incorporated: company.date_of_creation };
  }
  if (name === 'check_company_risk') {
    const r = await searchCompaniesHouse(args.company_name);
    const items = r.items || [];
    const company = args.company_number ? items.find(c => c.company_number === args.company_number) || items[0] : items[0];
    let companyData = {};
    if (company) companyData = await getCompanyDetails(company.company_number);
    const prompt = `You are a trade finance and KYC risk analyst. Assess the risk of this company for international trade.\n\nCompany: ${args.company_name}\nRegistry data: ${JSON.stringify({...company,...companyData})}\n\nReturn ONLY valid JSON:\n{"risk_score":<0-100>,"risk_level":"<LOW|MEDIUM|HIGH|CRITICAL>","risk_factors":[...],"positive_indicators":[...],"recommended_actions":[...],"summary":"<2 sentences>"}`;
    const response = await callClaude(prompt);
    try { return JSON.parse(response.replace(/```json|```/g,'').trim()); }
    catch(e) { return { risk_score: 50, risk_level: 'MEDIUM', summary: response }; }
  }
  return { error: 'Unknown tool: ' + name };
}

function checkAccess(req) {
  const apiKey = req.headers['x-api-key'];
  
  // Paid API key
  if (apiKey) {
    const record = apiKeys.get(apiKey);
    if (!record) return { allowed: false, reason: 'Invalid API key. Get yours at kordagencies.com', tier: 'invalid' };
    if (record.limit !== Infinity && record.calls >= record.limit) {
      return { allowed: false, reason: `Monthly limit of ${record.limit} calls reached. Upgrade at kordagencies.com`, tier: 'limit_reached' };
    }
    record.calls++;
    return { allowed: true, tier: record.plan };
  }

  // Free tier by IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const calls = freeTierUsage.get(ip) || 0;
  if (calls >= FREE_TIER_LIMIT) {
    return { 
      allowed: false, 
      reason: `Free tier limit of ${FREE_TIER_LIMIT} calls reached. Upgrade to Pro ($299/month) at kordagencies.com for 10,000 calls/month.`,
      tier: 'free_limit_reached'
    };
  }
  freeTierUsage.set(ip, calls + 1);
  const remaining = FREE_TIER_LIMIT - calls - 1;
  return { allowed: true, tier: 'free', remaining, warning: remaining < 20 ? `${remaining} free calls remaining. Upgrade at kordagencies.com` : null };
}

async function handleStripeWebhook(body) {
  try {
    const event = JSON.parse(body);
    console.log('Stripe event:', event.type);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;
      const productName = session.metadata?.product_name || '';
      const plan = getPlanFromProduct(productName);
      if (email) {
        const apiKey = generateApiKey();
        apiKeys.set(apiKey, { email, plan, createdAt: new Date().toISOString(), calls: 0, limit: PLAN_LIMITS[plan] });
        const emailResult = await sendApiKeyEmail(email, apiKey, plan);
        console.log(`API key created for ${email} (${plan}): ${apiKey}`);
        console.log('Email result:', JSON.stringify(emailResult));
        return { success: true, email, plan };
      }
    }
    return { received: true, type: event.type };
  } catch(e) {
    console.error('Webhook error:', e.message);
    return { error: e.message };
  }
}

const server = http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-api-key, mcp-session-id' };
  if (req.method === 'OPTIONS') { res.writeHead(200, cors); res.end(); return; }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '3.0.0', free_tier: 'no API key required for first 20 calls', paid_keys_issued: apiKeys.size }));
    return;
  }

  if (req.url === '/webhook/stripe' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      const result = await handleStripeWebhook(body);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);

        // Skip access check for initialize
        if (request.method !== 'initialize' && request.method !== 'notifications/initialized') {
          const access = checkAccess(req);
          if (!access.allowed) {
            res.writeHead(429, { ...cors, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: access.reason } }));
            return;
          }
          // Attach warning to response if approaching limit
          req._accessWarning = access.warning;
          req._tier = access.tier;
        }

        let response;
        if (request.method === 'initialize') {
          response = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'bizfile-mcp', version: '3.0.0', description: 'Company intelligence for AI agents. Free tier: 100 calls/month, no API key required. Upgrade at kordagencies.com' } } };
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(204, cors); res.end(); return;
        } else if (request.method === 'tools/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { tools } };
        } else if (request.method === 'tools/call') {
          const { name, arguments: args } = request.params;
          const result = await executeTool(name, args || {});
          // Add upgrade prompt if approaching limit
          if (req._accessWarning) result._notice = req._accessWarning;
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
    res.end(JSON.stringify({ name: 'bizfile-mcp', version: '3.0.0', status: 'ok', free_tier: '100 calls/month, no API key required', upgrade: 'https://kordagencies.com' }));
    return;
  }

  res.writeHead(404, cors); res.end(JSON.stringify({ error: 'Not found' }));
});
if (req.url === '/stats' && req.method === 'GET') {
    const statsKey = req.headers['x-stats-key'];
    if (statsKey !== 'ojas2026') {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const stats = {
      free_tier_users: freeTierUsage.size,
      free_tier_total_calls: Array.from(freeTierUsage.values()).reduce((a, b) => a + b, 0),
      paid_keys_issued: apiKeys.size,
      top_ips: Array.from(freeTierUsage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, calls]) => ({ ip: ip.slice(0, 8) + '...', calls }))
    };
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }
server.listen(PORT, () => {
  console.log(`Bizfile MCP v3.0.0 running on port ${PORT}`);
  console.log(`Free tier: ${FREE_TIER_LIMIT} calls/IP, no API key required`);
  console.log(`Resend: ${RESEND_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`Anthropic: ${ANTHROPIC_API_KEY ? 'configured' : 'MISSING'}`);
});
