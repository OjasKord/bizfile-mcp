const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PERSIST_FILE = '/tmp/bizfile_stats.json';

function saveStats() {
  try {
    const data = { freeTierUsage: Array.from(freeTierUsage.entries()), usageLog: usageLog.slice(-1000), toolUsageCounts, trialExtensions: Array.from(trialExtensions.entries()) };
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(data));
  } catch(e) { console.error('Stats save error:', e.message); }
}

function loadStats() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
      if (data.freeTierUsage) data.freeTierUsage.forEach(([k, v]) => freeTierUsage.set(k, v));
      if (data.usageLog) usageLog.push(...data.usageLog);
      if (data.toolUsageCounts) Object.assign(toolUsageCounts, data.toolUsageCounts);
      if (data.trialExtensions) data.trialExtensions.forEach(([k, v]) => trialExtensions.set(k, v));
      console.log('Stats loaded: ' + freeTierUsage.size + ' IPs, ' + usageLog.length + ' calls, ' + trialExtensions.size + ' trial extensions');
    }
  } catch(e) { console.error('Stats load error:', e.message); }
}

function getMonthKey(ip) { return ip + ':' + new Date().toISOString().slice(0, 7); }

function getEffectiveLimit(ip) {
  for (const record of trialExtensions.values()) {
    if (record.ip === ip) return FREE_TIER_LIMIT + TRIAL_EXTENSION_CALLS;
  }
  return FREE_TIER_LIMIT;
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const res = await fetch(
      `${UPSTASH_URL}/get/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
    const data = await res.json();
    if (data.error) console.error('[Redis] redisGet error:', data.error, 'key:', key);
    if (!data.result) return null;
    return JSON.parse(data.result);
  } catch(e) { return null; }
}

async function redisSet(key, value) {
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    if (data.error) console.error('[Redis] redisSet error:', data.error, 'key:', key);
  } catch(e) { console.error('[Redis] redisSet failed:', e); }
}

async function redisExpire(key, seconds) {
  try {
    const res = await fetch(
      `${UPSTASH_URL}/expire/${encodeURIComponent(key)}/${seconds}`,
      { method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
    const data = await res.json();
    if (data.error) console.error('[Redis] redisExpire error:', data.error, 'key:', key);
  } catch(e) { console.error('[Redis] redisExpire failed:', e); }
}

async function appendSessionLog(ip, tool) {
  try {
    const ipSafe = ip.replace(/:/g, '_').replace(/\s/g, '');
    const dayKey = new Date().toISOString().slice(0, 10);
    const key = `${REDIS_PREFIX}:session:${ipSafe}:${dayKey}`;
    const existing = await redisGet(key) || [];
    existing.push({ tool, timestamp: new Date().toISOString() });
    await redisSet(key, existing);
    await redisExpire(key, 86400);
  } catch(e) { console.error('[SessionLog] internal error:', e); }
}

async function redisKeys(pattern) {
  try {
    const res = await fetch(
      `${UPSTASH_URL}/keys/${encodeURIComponent(pattern)}`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
    const data = await res.json();
    if (data.error) console.error('[Redis] redisKeys error:', data.error, 'pattern:', pattern);
    return data.result || [];
  } catch(e) { return []; }
}

async function saveKeyToRedis(apiKey, record, prefix) {
  await redisSet(`${prefix}:key:${apiKey}`, record);
}

async function loadApiKeysFromRedis(prefix) {
  const keys = await redisKeys(`${prefix}:key:*`);
  for (const redisKey of keys) {
    const record = await redisGet(redisKey);
    if (record) {
      const apiKey = redisKey.replace(`${prefix}:key:`, '');
      apiKeys.set(apiKey, record);
    }
  }
  console.log(`Loaded ${apiKeys.size} API keys from Redis`);
}

async function loadFreeTierFromRedis() {
  try {
    const data = await redisGet(FREE_TIER_REDIS_KEY);
    if (data && Array.isArray(data)) {
      data.forEach(([k, v]) => freeTierUsage.set(k, v));
      console.log('[FreeTier] Loaded ' + freeTierUsage.size + ' IPs from Redis');
    }
  } catch(e) { console.error('[FreeTier] load failed:', e); }
}

async function saveFreeTierToRedis() {
  try {
    await redisSet(FREE_TIER_REDIS_KEY, Array.from(freeTierUsage.entries()));
  } catch(e) { console.error('[FreeTier] save failed:', e); }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OPENSANCTIONS_API_KEY = process.env.OPENSANCTIONS_API_KEY || '';
const PORT = process.env.PORT || 3000;
const STATS_KEY = process.env.STATS_KEY || 'ojas2026';
const VERSION = '4.10.25';
const REDIS_PREFIX = 'bizfile';
const FREE_TIER_REDIS_KEY = 'bizfile:free_tier_usage';
const FREE_TIER_LIMIT = 20;
const METERED_SUBSCRIBE_URL = 'https://bizfile-mcp-production.up.railway.app/subscribe';
const BUNDLE_500_URL = 'https://buy.stripe.com/fZu00ifYF2eV1tyaVGebu0k';
const BUNDLE_2000_URL = 'https://buy.stripe.com/5kQ28q8wd1aR8W03teebu0j';

const freeTierUsage = new Map();
const usageLog = [];
const FREE_TIER_WARNING = 16;
const apiKeys = new Map();
const toolUsageCounts = {};
const trialExtensions = new Map();
const TRIAL_EXTENSION_CALLS = 10;
const SANCTIONS_LIMITS = { bundle_500: 500, bundle_2000: 2000, metered: Infinity, internal: Infinity };
const SANCTIONS_PRICE = { bundle_500: 0.15, bundle_2000: 0.125, metered: 0.50 };

const LEGAL_DISCLAIMER = 'Results are sourced directly from official government registries (UK Companies House, Singapore ACRA, US SEC EDGAR) and the OpenSanctions database (api.opensanctions.org) covering 328 global sanctions lists. We do not log or store your query content. Results are for informational purposes only and do not constitute a legal determination of company status or sanctions clearance. Operator must independently verify all results before making compliance decisions. Provider maximum liability is limited to subscription fees paid in the preceding 3 months. Full terms: kordagencies.com/terms.html';

const DASHBOARD_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Kord Agencies — MCP Dashboard</title>\n<style>\n* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0D1117; color: #E8EDF5; font-size: 15px; line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }\nh1 { font-size: 18px; font-weight: 500; color: #fff; }\n.subtitle { font-size: 12px; color: #5A6478; margin-top: 2px; }\n.top-row { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }\nbutton { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.14); background: transparent; color: #E8EDF5; cursor: pointer; }\nbutton:hover { background: rgba(255,255,255,0.06); }\n.summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }\n.card { background: #141B24; border-radius: 8px; padding: 14px 16px; }\n.card-label { font-size: 11px; color: #8A95A8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }\n.card-value { font-size: 26px; font-weight: 500; color: #fff; line-height: 1; }\n.card-value.green { color: #00E5C3; }\n.card-value.amber { color: #EF9F27; }\n.card-sub { font-size: 11px; color: #5A6478; margin-top: 5px; }\n.servers-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }\n.server-panel { background: #111820; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 1.2rem; }\n.server-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }\n.server-name { font-size: 13px; font-weight: 500; }\n.server-name.bizfile { color: #00E5C3; }\n.server-name.vat { color: #A78BFA; }\n.server-name.tender { color: #EF9F27; }\n.server-name.lms { color: #7DD3FC; }\n.server-name.url { color: #FB923C; }\n.server-name.hs { color: #34D399; }\n.server-name.quantum { color: #818CF8; }\n.server-version { font-size: 10px; color: #5A6478; font-family: monospace; margin-top: 2px; }\n.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #5A6478; flex-shrink: 0; }\n.status-dot.online { background: #00E5C3; box-shadow: 0 0 6px rgba(0,229,195,0.5); }\n.status-dot.offline { background: #E07070; }\n.stat-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; }\n.stat-row:last-child { border-bottom: none; }\n.stat-label { color: #5A6478; }\n.stat-value { color: #E8EDF5; font-weight: 500; font-family: monospace; }\n.stat-value.highlight { color: #00E5C3; }\n.stat-value.amber { color: #EF9F27; }\n.badge { font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }\n.badge.ok { background: rgba(0,229,195,0.12); color: #00E5C3; }\n.badge.err { background: rgba(224,112,112,0.12); color: #E07070; }\n.badge.warn { background: rgba(239,159,39,0.12); color: #EF9F27; }\n.badge.checking { background: rgba(255,255,255,0.06); color: #5A6478; }\n.tool-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }\n.tool-pill { border-radius: 4px; padding: 2px 8px; font-size: 11px; }\n.tool-pill.bizfile { background: rgba(0,229,195,0.08); border: 1px solid rgba(0,229,195,0.2); color: #00E5C3; }\n.tool-pill.vat { background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.2); color: #A78BFA; }\n.tool-pill.tender { background: rgba(239,159,39,0.08); border: 1px solid rgba(239,159,39,0.2); color: #EF9F27; }\n.tool-pill.lms { background: rgba(125,211,252,0.08); border: 1px solid rgba(125,211,252,0.2); color: #7DD3FC; }\n.call-server.lms { background: rgba(125,211,252,0.1); color: #7DD3FC; }\n.tool-pill.url { background: rgba(251,146,60,0.08); border: 1px solid rgba(251,146,60,0.2); color: #FB923C; }\n.tool-pill.hs { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); color: #34D399; }\n.tool-pill.quantum { background: rgba(129,140,248,0.08); border: 1px solid rgba(129,140,248,0.2); color: #818CF8; }\n.call-server.url { background: rgba(251,146,60,0.1); color: #FB923C; }\n.call-server.hs { background: rgba(52,211,153,0.1); color: #34D399; }\n.call-server.quantum { background: rgba(129,140,248,0.1); color: #818CF8; }\n.server-name.docintegrity { color: #F472B6; }\n.tool-pill.docintegrity { background: rgba(244,114,182,0.08); border: 1px solid rgba(244,114,182,0.2); color: #F472B6; }\n.call-server.docintegrity { background: rgba(244,114,182,0.1); color: #F472B6; }\n.section { background: #111820; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 1.2rem; margin-bottom: 16px; }\n.section-title { font-size: 11px; font-weight: 500; color: #5A6478; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.08em; }\n.recent-call { font-size: 12px; color: #8A95A8; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; justify-content: space-between; align-items: center; gap: 1rem; }\n.recent-call:last-child { border-bottom: none; }\n.call-server { font-size: 10px; padding: 1px 7px; border-radius: 3px; flex-shrink: 0; }\n.call-server.bizfile { background: rgba(0,229,195,0.1); color: #00E5C3; }\n.call-server.vat { background: rgba(167,139,250,0.1); color: #A78BFA; }\n.call-server.tender { background: rgba(239,159,39,0.1); color: #EF9F27; }\n.alert-banner { background: rgba(224,112,112,0.08); border: 1px solid rgba(224,112,112,0.3); border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #E07070; line-height: 1.8; display: none; }\n.alert-banner.visible { display: block; }\n.dep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }\n.dep-group-title { font-size: 10px; color: #5A6478; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }\n.dep-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }\n.dep-row:last-child { border-bottom: none; }\n.dep-name { font-size: 12px; font-weight: 500; color: #E8EDF5; }\n.dep-url { font-size: 10px; color: #5A6478; font-family: monospace; margin-top: 2px; }\n.dep-risk { font-size: 10px; margin-top: 3px; }\n.dep-risk.low { color: #5A9E8A; }\n.dep-risk.medium { color: #EF9F27; }\n.dep-risk.high { color: #E07070; }\n.action-list { font-size: 12px; color: #E8EDF5; line-height: 2; }\n.action-list .urgent { color: #E07070; font-weight: 500; }\n.action-list .upcoming { color: #EF9F27; font-weight: 500; }\n.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }\n.row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }\n.row:last-child { border-bottom: none; }\n.row-name { color: #E8EDF5; font-size: 13px; }\n.row-url { font-size: 11px; color: #5A6478; font-family: monospace; margin-top: 1px; }\na.link { font-size: 12px; color: #7DD3FC; text-decoration: none; }\na.link:hover { text-decoration: underline; }\n.last-checked { font-size: 11px; color: #5A6478; margin-top: 12px; text-align: right; }\n@media(max-width:1000px) { .servers-grid { grid-template-columns: repeat(2,1fr); } }\n@media(max-width:700px) { .servers-grid,.dep-grid,.two-col { grid-template-columns: 1fr; } .summary-grid { grid-template-columns: repeat(3,1fr); } }\n</style>\n</head>\n<body>\n\n<div class=\"top-row\">\n  <div>\n    <h1>Kord Agencies — MCP Dashboard</h1>\n    <div class=\"subtitle\">9 servers · bizfile-mcp · vat-validator-mcp · tender-mcp · local-model-suitability-mcp · data-compliance-mcp · url-safety-validator-mcp · hs-code-classifier-mcp · quantum-suitability-validator-mcp · document-integrity-validator-mcp</div>\n  </div>\n  <button onclick=\"runAll()\">↻ Refresh all</button>\n</div>\n\n<div class=\"alert-banner\" id=\"alert-banner\"></div>\n\n<div class=\"summary-grid\">\n  <div class=\"card\">\n    <div class=\"card-label\">Servers online</div>\n    <div class=\"card-value green\" id=\"sum-online\">—</div>\n    <div class=\"card-sub\">of 9 total</div>\n  </div>\n  <div class=\"card\">\n    <div class=\"card-label\">Total free users</div>\n    <div class=\"card-value green\" id=\"sum-free-ips\">—</div>\n    <div class=\"card-sub\">unique IPs across all</div>\n  </div>\n  <div class=\"card\">\n    <div class=\"card-label\">Total free calls</div>\n    <div class=\"card-value\" id=\"sum-free-calls\">—</div>\n    <div class=\"card-sub\">across all servers</div>\n  </div>\n  <div class=\"card\">\n    <div class=\"card-label\">Paid keys issued</div>\n    <div class=\"card-value amber\" id=\"sum-keys\">—</div>\n    <div class=\"card-sub\">across all servers</div>\n  </div>\n  <div class=\"card\">\n    <div class=\"card-label\">Total tools</div>\n    <div class=\"card-value\" id=\"sum-tools\">—</div>\n    <div class=\"card-sub\">live MCP tools</div>\n  </div>\n  <div class=\"card\" style=\"border:1px solid rgba(167,139,250,0.2)\">\n    <div class=\"card-label\" style=\"color:#A78BFA\">Tool calls</div>\n    <div class=\"card-value\" id=\"sum-tool-calls\" style=\"color:#A78BFA\">—</div>\n    <div class=\"card-sub\">real agent executions</div>\n  </div>\n</div>\n\n<div class=\"servers-grid\">\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name bizfile\">bizfile-mcp</div><div class=\"server-version\" id=\"biz-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"biz-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"biz-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"biz-tools\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"biz-tool-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"biz-ips\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"biz-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"biz-keys\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"biz-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/bizfile-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"biz-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name vat\">vat-validator-mcp</div><div class=\"server-version\" id=\"vat-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"vat-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"vat-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"vat-tools\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"vat-tool-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"vat-ips\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"vat-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"vat-keys\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"vat-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/vat-validator-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"vat-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name tender\">tender-mcp</div><div class=\"server-version\" id=\"ten-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"ten-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"ten-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"ten-tools\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"ten-tool-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"ten-ips\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"ten-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"ten-keys\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"ten-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/tender-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"ten-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name lms\">local-model-suitability-mcp</div><div class=\"server-version\" id=\"lms-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"lms-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"lms-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"lms-tools\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"lms-tool-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"lms-ips\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"lms-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"lms-keys\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Deps</span><span class=\"badge checking\" id=\"lms-deps\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/local-model-suitability-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"lms-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name\" style=\"color:#F87171\">data-compliance-mcp</div><div class=\"server-version\" id=\"dcc-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"dcc-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"dcc-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"dcc-tools\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"dcc-tool-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"dcc-ips\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"dcc-calls\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"dcc-keys\">—</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"dcc-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/data-compliance-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"dcc-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name url\">url-safety-validator-mcp</div><div class=\"server-version\" id=\"url-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"url-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"url-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"url-tools\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"url-tool-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"url-ips\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"url-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"url-keys\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"url-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/url-safety-validator-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"url-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name hs\">hs-code-classifier-mcp</div><div class=\"server-version\" id=\"hs-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"hs-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"hs-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"hs-tools\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"hs-tool-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"hs-ips\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"hs-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"hs-keys\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"hs-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/hs-code-classifier-mcp-server\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"hs-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name quantum\">quantum-suitability-validator-mcp</div><div class=\"server-version\" id=\"qsv-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"qsv-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"qsv-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"qsv-tools\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"qsv-tool-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"qsv-ips\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"qsv-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"qsv-keys\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"qsv-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/quantum-suitability-validator-mcp-server\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"qsv-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n  <div class=\"server-panel\">\n    <div class=\"server-header\">\n      <div><div class=\"server-name docintegrity\">document-integrity-validator-mcp</div><div class=\"server-version\" id=\"docintegrity-version\">checking...</div></div>\n      <div class=\"status-dot\" id=\"docintegrity-dot\"></div>\n    </div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"badge checking\" id=\"docintegrity-status\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tools</span><span class=\"stat-value highlight\" id=\"docintegrity-tools\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Tool calls</span><span class=\"stat-value\" style=\"color:#A78BFA\" id=\"docintegrity-tool-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free tier IPs</span><span class=\"stat-value highlight\" id=\"docintegrity-ips\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Free calls</span><span class=\"stat-value\" id=\"docintegrity-calls\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Paid keys</span><span class=\"stat-value amber\" id=\"docintegrity-keys\">--</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Webhook</span><span class=\"badge checking\" id=\"docintegrity-webhook\">checking</span></div>\n    <div class=\"stat-row\"><span class=\"stat-label\">Smithery Connect</span><span class=\"stat-value\"><a href=\"https://smithery.ai/servers/OjasKord/document-integrity-validator-mcp\" target=\"_blank\" class=\"link\">View on Smithery ↗</a></span></div>\n    <div class=\"tool-bar\" id=\"docintegrity-tool-bar\"><span style=\"font-size:11px;color:#5A6478\">No calls yet</span></div>\n  </div>\n</div>\n\n<div class=\"section\">\n  <div class=\"section-title\">Recent calls — all servers</div>\n  <div id=\"all-recent-calls\"><span style=\"font-size:12px;color:#5A6478\">Loading...</span></div>\n  <div class=\"last-checked\" id=\"last-checked\">Never checked</div>\n</div>\n\n<div class=\"section\">\n  <div class=\"section-title\">API dependency health — live checks + risk register</div>\n  <div class=\"dep-grid\">\n    <div>\n      <div class=\"dep-group-title\">Bizfile MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">Companies House UK</div><div class=\"dep-url\">api.company-information.service.gov.uk</div><div class=\"dep-risk low\">LOW · no version in path · stable govt API</div></div>\n        <span class=\"badge checking\" id=\"dep-ch\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">OpenSanctions</div><div class=\"dep-url\">api.opensanctions.org/match/default</div><div class=\"dep-risk medium\">MEDIUM · pay-as-you-go €0.10/call · no expiry · monitor billing at opensanctions.org</div></div>\n        <span class=\"badge checking\" id=\"dep-os\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">Anthropic Claude (all servers)</div><div class=\"dep-url\">api.anthropic.com · claude-sonnet-4-6</div><div class=\"dep-risk medium\">MEDIUM · model will deprecate · check every 6 months</div></div>\n        <span class=\"badge ok\" id=\"dep-ai\">active key set</span>\n      </div>\n      <div class=\"dep-group-title\" style=\"margin-top:16px\">VAT Validator MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">EU VIES</div><div class=\"dep-url\">ec.europa.eu/taxation_customs/vies/rest-api</div><div class=\"dep-risk medium\">MEDIUM · known instability · no auth · URL could change</div></div>\n        <span class=\"badge checking\" id=\"dep-vies\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">UK HMRC VAT</div><div class=\"dep-url\">api.service.hmrc.gov.uk · Accept: vnd.hmrc.1.0+json</div><div class=\"dep-risk medium\">MEDIUM · version 1.0 in Accept header · monitor for v2 announcement</div></div>\n        <span class=\"badge checking\" id=\"dep-hmrc\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">AU ABR</div><div class=\"dep-url\">abr.business.gov.au/json · GUID from env var</div><div class=\"dep-risk low\">LOW · GUID registered ✓ · set in Railway ABR_GUID env var</div></div>\n        <span class=\"badge checking\" id=\"dep-abr\">checking</span>\n      </div>\n      <div class=\"dep-group-title\" style=\"margin-top:16px\">Local Model Suitability MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">Anthropic Claude</div><div class=\"dep-url\">api.anthropic.com · claude-sonnet-4-6</div><div class=\"dep-risk medium\">MEDIUM · only external dependency</div></div>\n        <span class=\"badge checking\" id=\"dep-lms-ai\">checking</span>\n      </div>\n    </div>\n    <div>\n      <div class=\"dep-group-title\">Tender MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">UK Contracts Finder</div><div class=\"dep-url\">contractsfinder.service.gov.uk/Published/Notices/OCDS</div><div class=\"dep-risk low\">LOW · no version · stable UK govt API</div></div>\n        <span class=\"badge checking\" id=\"dep-cf\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">EU TED</div><div class=\"dep-url\">api.ted.europa.eu/v3/notices/search</div><div class=\"dep-risk medium\">MEDIUM · v3 in path · v4 planned · monitor docs.ted.europa.eu</div></div>\n        <span class=\"badge checking\" id=\"dep-ted\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">US SAM.gov</div><div class=\"dep-url\">api.sam.gov/prod/opportunities/v2/search</div><div class=\"dep-risk medium\">MEDIUM · v2 in path · rotate key every 90 days</div></div>\n        <span class=\"badge checking\" id=\"dep-sam\">checking</span>\n      </div>\n            <div class=\"dep-group-title\" style=\"margin-top:16px\">HS Code Classifier MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">HSPing API</div><div class=\"dep-url\">api.hsping.com/api/v1/find</div><div class=\"dep-risk low\">LOW · official govt tariff data · commercial use permitted</div></div>\n        <span class=\"badge checking\" id=\"dep-hsping\">checking</span>\n      </div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">Anthropic Claude (HS classifier)</div><div class=\"dep-url\">api.anthropic.com · claude-sonnet-4-6</div><div class=\"dep-risk medium\">MEDIUM · AI classification · model will deprecate</div></div>\n        <span class=\"badge checking\" id=\"dep-hs-ai\">checking</span>\n      </div>\n      <div class=\"dep-group-title\" style=\"margin-top:16px\">Quantum Suitability Validator MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">Anthropic Claude (quantum triage)</div><div class=\"dep-url\">api.anthropic.com - claude-sonnet-4-6</div><div class=\"dep-risk medium\">MEDIUM - only external dependency - model will deprecate</div></div>\n        <span class=\"badge checking\" id=\"dep-qsv-ai\">checking</span>\n      </div>\n<div class=\"dep-group-title\" style=\"margin-top:16px\">Document Integrity Validator MCP</div>\n      <div class=\"dep-row\">\n        <div><div class=\"dep-name\">Anthropic Claude (document integrity)</div><div class=\"dep-url\">api.anthropic.com - claude-sonnet-4-6</div><div class=\"dep-risk medium\">MEDIUM - only external dependency - model will deprecate</div></div>\n        <span class=\"badge checking\" id=\"dep-docintegrity-ai\">checking</span>\n      </div>\n<div class=\"dep-group-title\" style=\"margin-top:16px\">Action items</div>\n      <div class=\"action-list\">\n        <div><span style=\"color:#5A9E8A\">✓ Done:</span> AU ABR GUID registered — set in Railway env var ✓</div>\n        <div><span style=\"color:#5A9E8A\">✓ Done:</span> OpenSanctions switched to pay-as-you-go €0.10/call — no expiry, monitor billing at opensanctions.org</div>\n        <div><span class=\"upcoming\">~10 Jul:</span> Rotate SAM.gov API key (90-day policy)</div>\n        <div><span class=\"upcoming\">Every 6mo:</span> Verify claude-sonnet-4-6 still valid — check console.anthropic.com</div>\n        <div><span class=\"upcoming\">Monitor:</span> HMRC vnd.hmrc.2.0 announcement · EU TED v4 announcement</div>\n      </div>\n    </div>\n  </div>\n</div>\n\n<div class=\"two-col\">\n  <div class=\"section\">\n    <div class=\"section-title\">Revenue & billing</div>\n    <div class=\"row\"><div><div class=\"row-name\">Stripe — subscriptions</div></div><a class=\"link\" href=\"https://dashboard.stripe.com/subscriptions\" target=\"_blank\">Open ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">Stripe — payments</div></div><a class=\"link\" href=\"https://dashboard.stripe.com/payments\" target=\"_blank\">Open ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">Resend — email log</div></div><a class=\"link\" href=\"https://resend.com/emails\" target=\"_blank\">Open ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">UptimeRobot</div></div><a class=\"link\" href=\"https://dashboard.uptimerobot.com\" target=\"_blank\">Open ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">Anthropic Console</div></div><a class=\"link\" href=\"https://console.anthropic.com\" target=\"_blank\">Open ↗</a></div>\n  </div>\n  <div class=\"section\">\n    <div class=\"section-title\">Directories</div>\n    <div class=\"row\"><div><div class=\"row-name\">Anthropic MCP Registry</div><div class=\"row-url\">io.github.OjasKord/*</div></div><a class=\"link\" href=\"https://registry.modelcontextprotocol.io\" target=\"_blank\">View ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">Smithery</div><div class=\"row-url\">smithery.ai/servers/OjasKord</div></div><a class=\"link\" href=\"https://smithery.ai/servers/OjasKord/bizfile-mcp\" target=\"_blank\">View ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">Glama</div><div class=\"row-url\">glama.ai/mcp/servers/OjasKord</div></div><a class=\"link\" href=\"https://glama.ai/mcp/servers/OjasKord/bizfile-mcp\" target=\"_blank\">View ↗</a></div>\n    <div class=\"row\"><div><div class=\"row-name\">kordagencies.com</div></div><a class=\"link\" href=\"https://kordagencies.com\" target=\"_blank\">View ↗</a></div>\n  </div>\n</div>\n\n<script>\nconst STATS_KEY = 'ojas2026';\nconst SERVERS = [\n  { id: 'biz', name: 'bizfile', url: 'https://bizfile-mcp-production.up.railway.app' },\n  { id: 'vat', name: 'vat', url: 'https://vat-validator-mcp-production.up.railway.app' },\n  { id: 'ten', name: 'tender', url: 'https://tender-mcp-production.up.railway.app' },\n  { id: 'lms', name: 'lms', url: 'https://local-model-suitability-mcp-production.up.railway.app' },\n  { id: 'dcc', name: 'dcc', url: 'https://data-compliance-mcp-production.up.railway.app' },\n  { id: 'url', name: 'url', url: 'https://url-safety-validator-mcp-production.up.railway.app' },\n  { id: 'hs', name: 'hs', url: 'https://hs-code-classifier-mcp-server-production.up.railway.app', mcpPath: '/mcp' },\n  { id: 'qsv', name: 'quantum', url: 'https://quantum-suitability-validator-mcp-production.up.railway.app', mcpPath: '/mcp' },\n  { id: 'docintegrity', name: 'docintegrity', url: 'https://document-integrity-validator-mcp-production.up.railway.app', mcpPath: '/mcp' }\n];\n\nfunction set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }\nfunction setClass(id, cls) { const el = document.getElementById(id); if (el) el.className = cls; }\nfunction setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }\n\nasync function safeFetch(url, opts, timeoutMs) {\n  try {\n    const controller = new AbortController();\n    const t = setTimeout(() => controller.abort(), timeoutMs || 8000);\n    const r = await fetch(url, { ...opts, signal: controller.signal });\n    clearTimeout(t);\n    return r;\n  } catch(e) { return null; }\n}\n\nasync function checkDependencies() {\n  const alerts = [];\n\n  async function fetchDeps(url) {\n    try {\n      const r = await safeFetch(url + '/deps', {}, 10000);\n      if (!r) return null;\n      const d = await r.json();\n      return d.dependencies || null;\n    } catch(e) { return null; }\n  }\n\n  function applyDep(id, result) {\n    if (!result) { set(id, 'no data'); setClass(id, 'badge warn'); return false; }\n    const ok = result.ok;\n    set(id, ok ? 'reachable' : (result.error || result.status + ' error'));\n    setClass(id, ok ? 'badge ok' : 'badge err');\n    return ok;\n  }\n\n  const bizDeps = await fetchDeps('https://bizfile-mcp-production.up.railway.app');\n  if (bizDeps) {\n    const chOk = applyDep('dep-ch', bizDeps.companies_house);\n    if (!chOk) alerts.push('Companies House unreachable — company lookup broken on Bizfile MCP');\n    const osOk = applyDep('dep-os', bizDeps.opensanctions);\n    if (!osOk) alerts.push('OpenSanctions unreachable — sanctions screening broken on Bizfile MCP');\n    const aiOk = applyDep('dep-ai', bizDeps.anthropic);\n    if (!aiOk) alerts.push('Anthropic API unreachable — AI scoring broken on all servers. Check key at console.anthropic.com');\n  } else {\n    ['dep-ch','dep-os','dep-ai'].forEach(id => { set(id, 'server offline'); setClass(id, 'badge err'); });\n    alerts.push('Bizfile MCP /deps endpoint unreachable — server may be down');\n  }\n\n  const vatDeps = await fetchDeps('https://vat-validator-mcp-production.up.railway.app');\n  if (vatDeps) {\n    const viesOk = applyDep('dep-vies', vatDeps.vies);\n    if (!viesOk) alerts.push('EU VIES unreachable — EU VAT validation broken on VAT Validator MCP');\n    const hmrcOk = applyDep('dep-hmrc', vatDeps.hmrc);\n    if (!hmrcOk) alerts.push('HMRC unreachable — UK VAT validation broken on VAT Validator MCP');\n    applyDep('dep-abr', vatDeps.abr);\n  } else {\n    ['dep-vies','dep-hmrc','dep-abr'].forEach(id => { set(id, 'server offline'); setClass(id, 'badge err'); });\n  }\n\n  const tenDeps = await fetchDeps('https://tender-mcp-production.up.railway.app');\n  if (tenDeps) {\n    const cfOk = applyDep('dep-cf', tenDeps.contracts_finder);\n    if (!cfOk) alerts.push('UK Contracts Finder unreachable — UK tenders broken on Tender MCP');\n    const tedOk = applyDep('dep-ted', tenDeps.eu_ted);\n    if (!tedOk) alerts.push('EU TED unreachable — EU tenders broken on Tender MCP');\n    const samOk = applyDep('dep-sam', tenDeps.sam_gov);\n    if (!samOk) alerts.push('SAM.gov unreachable — US tenders broken on Tender MCP');\n  } else {\n    ['dep-cf','dep-ted','dep-sam'].forEach(id => { set(id, 'server offline'); setClass(id, 'badge err'); });\n  }\n\n  const lmsDeps = await fetchDeps('https://local-model-suitability-mcp-production.up.railway.app');\n  if (lmsDeps) {\n    const lmsAiOk = applyDep('dep-lms-ai', lmsDeps.anthropic);\n    if (!lmsAiOk) alerts.push('Anthropic API unreachable on Local Model Suitability MCP');\n    set('lms-deps', lmsAiOk ? 'ok' : 'degraded'); setClass('lms-deps', lmsAiOk ? 'badge ok' : 'badge warn');\n  } else {\n    set('dep-lms-ai', 'no /deps'); setClass('dep-lms-ai', 'badge warn');\n    set('lms-deps', 'error'); setClass('lms-deps', 'badge err');\n  }\n\n\n  const hsRawDeps = await (async () => { try { const r = await safeFetch('https://hs-code-classifier-mcp-server-production.up.railway.app/deps', {}, 10000); if (!r) return null; const d = await r.json(); return Array.isArray(d.dependencies) ? d.dependencies : null; } catch(e) { return null; } })();\n  if (hsRawDeps) {\n    function applyDepArr(id, dep) { if (!dep) { set(id, 'no data'); setClass(id, 'badge warn'); return false; } set(id, dep.ok ? 'reachable' : 'error'); setClass(id, dep.ok ? 'badge ok' : 'badge err'); return dep.ok; }\n    const hspingDep = hsRawDeps.find(d => d.name && d.name.toLowerCase().includes('hsping'));\n    const hsAiDep = hsRawDeps.find(d => d.name && d.name.toLowerCase().includes('anthropic'));\n    const hspingOk = applyDepArr('dep-hsping', hspingDep);\n    if (!hspingOk) alerts.push('HSPing API unreachable -- HS code classification broken');\n    const hsAiOk = applyDepArr('dep-hs-ai', hsAiDep);\n    if (!hsAiOk) alerts.push('Anthropic API unreachable on HS Code Classifier MCP');\n  } else {\n    ['dep-hsping','dep-hs-ai'].forEach(id => { set(id, 'server offline'); setClass(id, 'badge err'); });\n  }\n\n  const qsvRawDeps = await (async () => { try { const r = await safeFetch('https://quantum-suitability-validator-mcp-production.up.railway.app/deps', {}, 10000); if (!r) return null; const d = await r.json(); return Array.isArray(d.dependencies) ? d.dependencies : null; } catch(e) { return null; } })();\n  if (qsvRawDeps) {\n    function applyDepArrQ(id, dep) { if (!dep) { set(id, 'no data'); setClass(id, 'badge warn'); return false; } set(id, dep.ok ? 'reachable' : 'error'); setClass(id, dep.ok ? 'badge ok' : 'badge err'); return dep.ok; }\n    const qsvAiDep = qsvRawDeps.find(d => d.name && d.name.toLowerCase().includes('anthropic'));\n    const qsvAiOk = applyDepArrQ('dep-qsv-ai', qsvAiDep);\n    if (!qsvAiOk) alerts.push('Anthropic API unreachable on Quantum Suitability Validator MCP');\n  } else {\n    set('dep-qsv-ai', 'server offline'); setClass('dep-qsv-ai', 'badge err');\n  }\n  const docintegrityRawDeps = await (async () => { try { const r = await safeFetch('https://document-integrity-validator-mcp-production.up.railway.app/deps', {}, 10000); if (!r) return null; const d = await r.json(); return Array.isArray(d.dependencies) ? d.dependencies : null; } catch(e) { return null; } })();\n  if (docintegrityRawDeps) {\n    function applyDepArrDI(id, dep) { if (!dep) { set(id, 'no data'); setClass(id, 'badge warn'); return false; } set(id, dep.ok ? 'reachable' : 'error'); setClass(id, dep.ok ? 'badge ok' : 'badge err'); return dep.ok; }\n    const diAiDep = docintegrityRawDeps.find(d => d.name && d.name.toLowerCase().includes('anthropic'));\n    const diAiOk = applyDepArrDI('dep-docintegrity-ai', diAiDep);\n    if (!diAiOk) alerts.push('Anthropic API unreachable on Document Integrity Validator MCP');\n  } else {\n    set('dep-docintegrity-ai', 'server offline'); setClass('dep-docintegrity-ai', 'badge err');\n  }\n  const banner = document.getElementById('alert-banner');\n  if (alerts.length > 0) {\n    banner.innerHTML = '<strong>⚠ Issues detected:</strong><br>' + alerts.map(a => '· ' + a).join('<br>');\n    banner.classList.add('visible');\n  } else { banner.classList.remove('visible'); }\n}\n\nasync function checkServer(s) {\n  const { id, url } = s;\n  try {\n    const r = await fetch(url + '/health');\n    if (!r.ok) throw new Error();\n    const d = await r.json();\n    set(id + '-version', 'v' + (d.version || '?') + ' · online');\n    set(id + '-status', 'online'); setClass(id + '-status', 'badge ok');\n    setClass(id + '-dot', 'status-dot online');\n    set(id + '-keys', d.paid_keys_issued ?? '0');\n    return true;\n  } catch(e) {\n    set(id + '-version', 'offline');\n    set(id + '-status', 'offline'); setClass(id + '-status', 'badge err');\n    setClass(id + '-dot', 'status-dot offline');\n    return false;\n  }\n}\n\nasync function checkServerTools(s) {\n  const { id, url, mcpPath } = s;\n  const toolsUrl = mcpPath ? url + mcpPath : url;\n  try {\n    const r = await fetch(toolsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });\n    if (!r.ok) { set(id + '-tools', '?'); return 0; }\n    const ct = r.headers.get('content-type') || '';\n    const text = await r.text();\n    let d = null;\n    if (ct.includes('application/json')) {\n      try { d = JSON.parse(text); } catch(e) {}\n    } else {\n      const m = text.match(/data:\\s*(\\{[\\s\\S]*?\\})\\s*\\n/);\n      if (m) { try { d = JSON.parse(m[1]); } catch(e) {} }\n      if (!d) { const m2 = text.match(/\\{[\\s\\S]*\\}/); if (m2) { try { d = JSON.parse(m2[0]); } catch(e) {} } }\n    }\n    const count = d?.result?.tools?.length ?? 0;\n    set(id + '-tools', count); return count;\n  } catch(e) { set(id + '-tools', '?'); return 0; }\n}\n\nasync function checkServerStats(s) {\n  const { id, name, url } = s;\n  try {\n    const r = await fetch(url + '/stats', { headers: { 'x-stats-key': STATS_KEY } });\n    const d = await r.json();\n    set(id + '-ips', d.free_tier_unique_ips ?? '0');\n    set(id + '-calls', d.free_tier_total_calls ?? '0');\n    const toolUsage = d.tool_usage || {};\n    const totalToolCalls = Object.values(toolUsage).reduce((a, b) => a + b, 0);\n    set(id + '-tool-calls', totalToolCalls);\n    const bar = document.getElementById(id + '-tool-bar');\n    if (bar && Object.keys(toolUsage).length > 0) {\n      bar.innerHTML = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).map(([t, c]) => '<span class=\"tool-pill ' + name + '\">' + t + ': ' + c + '</span>').join('');\n    }\n    const recent = (d.recent_calls || []).map(c => ({ ...c, server: name }));\n    return { ips: d.free_tier_unique_ips || 0, calls: d.free_tier_total_calls || 0, toolCalls: totalToolCalls, recent };\n  } catch(e) { return { ips: 0, calls: 0, toolCalls: 0, recent: [] }; }\n}\n\nasync function checkServerWebhook(s) {\n  const { id, url } = s;\n  const whId = id + '-webhook';\n  const el = document.getElementById(whId);\n  if (!el) return;\n  try {\n    const r = await fetch(url + '/webhook/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'ping' }) });\n    if (r.ok) { set(whId, 'reachable'); setClass(whId, 'badge ok'); }\n    else if (r.status === 400) { set(whId, 'secured'); setClass(whId, 'badge ok'); }\n    else { set(whId, 'error'); setClass(whId, 'badge err'); }\n  } catch(e) { set(whId, 'error'); setClass(whId, 'badge err'); }\n}\n\nfunction renderAllRecentCalls(calls) {\n  const sorted = calls.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 20);\n  if (!sorted.length) { setHTML('all-recent-calls', '<span style=\"font-size:12px;color:#5A6478\">No recent calls logged</span>'); return; }\n  setHTML('all-recent-calls', sorted.map(c =>\n    '<div class=\"recent-call\"><span class=\"call-server ' + c.server + '\">' + c.server + '</span><span style=\"flex:1\">' + c.tool + '</span><span style=\"color:#5A6478;font-size:11px\">' + c.tier + ' · ' + c.ip + ' · ' + new Date(c.time).toLocaleTimeString() + '</span></div>'\n  ).join(''));\n}\n\nasync function runAll() {\n  SERVERS.forEach(s => {\n    setClass(s.id + '-dot', 'status-dot');\n    set(s.id + '-status', 'checking'); setClass(s.id + '-status', 'badge checking');\n    const whEl = document.getElementById(s.id + '-webhook');\n    if (whEl) { set(s.id + '-webhook', 'checking'); setClass(s.id + '-webhook', 'badge checking'); }\n  });\n  let totalOnline = 0, totalIps = 0, totalCalls = 0, totalKeys = 0, totalTools = 0, totalToolCalls = 0, allRecent = [];\n  await Promise.all(SERVERS.map(async s => {\n    const [online, toolCount, stats] = await Promise.all([checkServer(s), checkServerTools(s), checkServerStats(s)]);\n    checkServerWebhook(s);\n    if (online) totalOnline++;\n    totalTools += toolCount; totalIps += stats.ips; totalCalls += stats.calls; totalToolCalls += stats.toolCalls || 0;\n    allRecent = allRecent.concat(stats.recent);\n    totalKeys += parseInt(document.getElementById(s.id + '-keys')?.textContent || '0') || 0;\n  }));\n  set('sum-online', totalOnline);\n  setClass('sum-online', totalOnline === 9 ? 'card-value green' : 'card-value amber');\n  set('sum-free-ips', totalIps); set('sum-free-calls', totalCalls);\n  set('sum-keys', totalKeys); set('sum-tools', totalTools); set('sum-tool-calls', totalToolCalls);\n  renderAllRecentCalls(allRecent);\n  set('last-checked', 'Last checked: ' + new Date().toLocaleTimeString());\n  checkDependencies();\n}\n\nrunAll();\nsetInterval(runAll, 60000);\n</script>\n</body>\n</html>";

function nowISO() { return new Date().toISOString(); }
function generateApiKey() { return 'biz_' + crypto.randomBytes(24).toString('hex'); }
function getPlanFromProduct(productName) {
  if (!productName) return 'bundle_500';
  const n = productName.toLowerCase();
  if (n.includes('metered') || n.includes('pay as you go') || n === 'metered') return 'metered';
  if (n.includes('2000') || n.includes('2,000') || n.includes('enterprise')) return 'bundle_2000';
  return 'bundle_500';
}

function checkAndResetPeriod(record) {
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - record.periodStart > thirtyDays) {
    record.calls = 0;
    if (record.sanctionsChecks !== undefined) {
      record.sanctionsChecks = 0;
    }
    record.periodStart = Date.now();
    return true;
  }
  return false;
}

async function reportMeteredUsage(customerId, eventName) {
  try {
    await stripe.billing.meterEvents.create({
      event_name: eventName,
      payload: {
        stripe_customer_id: customerId,
        value: '1'
      }
    });
  } catch(e) {
    console.error('Stripe metered usage report failed:', e.message);
  }
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
  const planLabel = plan === 'metered' ? 'Pay-as-you-go' : plan === 'bundle_2000' ? 'Bundle 2000' : 'Bundle 500';
  const limitNote = plan === 'metered' ? 'Pay only for what you use — billed monthly' : plan === 'bundle_2000' ? '2,000 calls included' : '500 calls included';
  const html = '<!DOCTYPE html><html><body style="font-family:monospace;background:#080A0F;color:#E8EDF5;padding:40px;max-width:600px;margin:0 auto"><div style="border:1px solid rgba(0,229,195,0.3);border-radius:8px;padding:32px"><div style="color:#00E5C3;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:24px">Bizfile MCP - ' + planLabel + '</div><h1 style="font-size:24px;font-weight:700;margin-bottom:8px;color:#FFFFFF">Your API key is ready.</h1><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#5A6478;font-size:11px;text-transform:uppercase;margin-bottom:8px">Your API Key</div><div style="color:#00E5C3;font-size:14px;word-break:break-all">' + apiKey + '</div></div><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#5A6478;font-size:11px;text-transform:uppercase;margin-bottom:8px">MCP Config</div><div style="color:#86EFAC;font-size:12px">{"bizfile":{"url":"https://bizfile-mcp-production.up.railway.app","headers":{"x-api-key":"' + apiKey + '"}}}</div></div><div style="background:#141B24;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;margin-bottom:24px"><div style="color:#E8EDF5;font-size:13px">Plan: ' + planLabel + '<br>' + limitNote + '</div></div><div style="background:#0D1219;border-radius:6px;padding:16px;margin-bottom:24px;font-size:11px;color:#5A6478;line-height:1.7">Results are for informational purposes only. We do not log your query content. Verify all results independently. Liability capped at 3 months fees. Full terms: kordagencies.com/terms.html</div><p style="color:#5A6478;font-size:12px">Questions? ojas@kordagencies.com</p></div></body></html>';
  return sendEmail(email, 'Your Bizfile MCP API Key — ' + planLabel, html);
}

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] });
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
    idempotent: true,
    description: 'Call this at the moment your workflow has identified a new counterparty and has not yet executed any payment, contract, or transaction with them. Returns PROCEED/EDD/BLOCK verdict with AI risk score 0-100, KYC confidence HIGH/MEDIUM/LOW, company status, directors, and filing history — sourced live from UK Companies House, Singapore ACRA, and OpenCorporates (210M+ companies, 130+ jurisdictions). A BLOCK verdict means do not proceed under any circumstances. An EDD verdict means halt and request additional verification before executing. Skipping this call and proceeding to payment with an unverified counterparty creates direct financial loss with no recovery path — there is no human checkpoint downstream. Call screen_counterparty next with the officers array returned by this tool.',
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
    idempotent: true,
    description: 'Call this immediately after validate_counterparty, passing the officers array from that response. Screens the company and all directors simultaneously against 328 global sanctions lists — UN, EU, OFAC, UK HMT, MAS Singapore — updated daily. Returns PROCEED/HOLD verdict per entity with match confidence score and matched list names. A HOLD verdict means stop execution immediately and do not proceed regardless of other verdicts. A missed sanctions match on an executed payment creates criminal liability for the operator — not financial loss, criminal liability. Do not execute any payment, contract, or transaction until this returns PROCEED.',
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
  },
  {
    name: 'validate_counterparty_lite',
    idempotent: true,
    description: 'Call this instead of validate_counterparty when your workflow is screening a high volume of counterparties and needs registry status only — no AI scoring, no officers, no risk analysis. Returns company status, registration number, and registered address in under one second. Use when you need to filter a large list down to active registered companies before running full validation on shortlisted candidates. Do not use as a substitute for validate_counterparty before payment execution — it does not return a risk score or PROCEED/BLOCK verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Full or partial name of the company to look up' },
        company_number: { type: 'string', description: 'Optional: registration number for exact match' }
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
      const _rTimeout = { error: 'UK Companies House API is temporarily unavailable. This is not a problem with your query. Please retry in 2-3 minutes.', agent_action: 'RETRY_IN_2_MIN', category: 'upstream_unavailable', retryable: true, retry_after_ms: 120000, fallback_tool: 'validate_counterparty_lite', likely_cause: 'upstream API timeout — transient network issue', trace_id: Math.random().toString(36).slice(2, 10), source_url: 'api.company-information.service.gov.uk', checked_at: checkedAt, _disclaimer: LEGAL_DISCLAIMER };
      _rTimeout.token_count = Math.ceil(JSON.stringify(_rTimeout).length / 4);
      return _rTimeout;
    }

    const items = searchResult.items || [];
    const company = companyNumber
      ? items.find(c => c.company_number === companyNumber) || items[0]
      : items.find(c => c.title.toLowerCase() === companyName.toLowerCase()) || items[0];

    if (!company) {
      const _rNotFound = {
        company_found: false,
        company_name_searched: companyName,
        agent_action: 'ENHANCED_DUE_DILIGENCE',
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
      _rNotFound.token_count = Math.ceil(JSON.stringify(_rNotFound).length / 4);
      return _rNotFound;
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

    const _rValidate = {
      company_found: true,
      agent_action: aiRisk.risk_level === 'CRITICAL' ? 'BLOCK' : (aiRisk.risk_level === 'HIGH' || aiRisk.risk_level === 'MEDIUM') ? 'ENHANCED_DUE_DILIGENCE' : 'PROCEED',
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
    _rValidate.token_count = Math.ceil(JSON.stringify(_rValidate).length / 4);
    return _rValidate;
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

    const _rScreen = {
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
    _rScreen.token_count = Math.ceil(JSON.stringify(_rScreen).length / 4);
    return _rScreen;
  }

  // ── validate_counterparty_lite ────────────────────────────────────────────
  // Registry-only check. No AI call, no officers. Fast + low token cost.
  if (name === 'validate_counterparty_lite') {
    const companyName = args.company_name;
    const companyNumber = args.company_number;
    const searchResult = await searchCompaniesHouse(companyName);
    if (searchResult._timeout) {
      const _rLiteTimeout = { error: 'UK Companies House API is temporarily unavailable. Please retry in 2-3 minutes.', agent_action: 'RETRY_IN_2_MIN', category: 'upstream_unavailable', retryable: true, retry_after_ms: 120000, fallback_tool: 'validate_counterparty_lite', likely_cause: 'upstream API timeout — transient network issue', trace_id: Math.random().toString(36).slice(2, 10), source_url: 'api.company-information.service.gov.uk', checked_at: checkedAt, _disclaimer: LEGAL_DISCLAIMER };
      _rLiteTimeout.token_count = Math.ceil(JSON.stringify(_rLiteTimeout).length / 4);
      return _rLiteTimeout;
    }
    const items = searchResult.items || [];
    const company = companyNumber
      ? items.find(c => c.company_number === companyNumber) || items[0]
      : items.find(c => c.title.toLowerCase() === companyName.toLowerCase()) || items[0];
    if (!company) {
      const _rLiteNotFound = { company_found: false, company_name_searched: companyName, agent_action: 'ENHANCED_DUE_DILIGENCE', kyc_confidence: 'LOW', message: 'No matching company found in UK Companies House registry.', source_url: 'api.company-information.service.gov.uk', checked_at: checkedAt, _disclaimer: LEGAL_DISCLAIMER };
      _rLiteNotFound.token_count = Math.ceil(JSON.stringify(_rLiteNotFound).length / 4);
      return _rLiteNotFound;
    }
    const isActive = company.company_status === 'active';
    const nameMatch = company.title.toLowerCase() === companyName.toLowerCase();
    const numberMatch = !companyNumber || company.company_number === companyNumber;
    let kycConfidence = 'LOW';
    if (nameMatch && numberMatch && isActive) kycConfidence = 'HIGH';
    else if ((nameMatch || numberMatch) && isActive) kycConfidence = 'MEDIUM';
    const _rLite = {
      company_found: true,
      agent_action: isActive ? 'PROCEED' : 'ENHANCED_DUE_DILIGENCE',
      registered_name: company.title,
      registration_number: company.company_number,
      status: company.company_status,
      incorporation_date: company.date_of_creation,
      registered_address: company.address_snippet,
      kyc_confidence: kycConfidence,
      active: isActive,
      analysis_type: 'Registry lookup only -- no AI analysis. Use validate_counterparty for full AI risk scoring.',
      source_url: 'api.company-information.service.gov.uk',
      checked_at: checkedAt,
      _disclaimer: LEGAL_DISCLAIMER
    };
    _rLite.token_count = Math.ceil(JSON.stringify(_rLite).length / 4);
    return _rLite;
  }

  return { error: 'Unknown tool: ' + name, agent_action: 'RETRY_IN_2_MIN', category: 'unknown_tool', retryable: false, retry_after_ms: null, fallback_tool: null, likely_cause: 'required field missing or malformed', trace_id: Math.random().toString(36).slice(2, 10) };
}

// ─── ACCESS CONTROL ───────────────────────────────────────────────────────────

function checkAccess(req) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const record = apiKeys.get(apiKey);
    if (!record) {
      return { allowed: false, error: 'Invalid API key' };
    }

    const wasReset = checkAndResetPeriod(record);
    if (wasReset) {
      saveKeyToRedis(apiKey, record, REDIS_PREFIX).catch(() => {});
    }

    if (record.plan === 'metered') {
      record.calls++;
      saveKeyToRedis(apiKey, record, REDIS_PREFIX).catch(() => {});
      return {
        allowed: true,
        paid: true,
        plan: 'metered',
        stripeCustomerId: record.stripeCustomerId
      };
    }

    if (record.calls >= record.limit) {
      return {
        allowed: false,
        error: `Bundle exhausted. You have used all ${record.limit} calls in this bundle. Purchase another bundle or switch to pay-as-you-go.`,
        subscribe_url: METERED_SUBSCRIBE_URL,
        bundle_500_url: BUNDLE_500_URL,
        bundle_2000_url: BUNDLE_2000_URL,
        agent_action: 'PAUSE_AND_NOTIFY_USER'
      };
    }

    record.calls++;
    saveKeyToRedis(apiKey, record, REDIS_PREFIX).catch(() => {});
    return { allowed: true, paid: true, plan: record.plan };
  }
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ip = rawIp.split(',')[0].trim();
  const monthKey = getMonthKey(ip);
  const calls = freeTierUsage.get(monthKey) || 0;
  if (calls >= FREE_TIER_LIMIT) return {
    allowed: false,
    error: 'Free tier limit of 20 calls/month reached. Bizfile MCP has been verifying companies against UK Companies House, Singapore ACRA, and 130+ jurisdictions with AI risk scoring and sanctions screening against 328 global lists. Upgrade to continue this workflow without interruption.',
    agent_action: 'PAUSE_AND_NOTIFY_USER',
    upgrade_options: {
      bundle_500: {
        calls: 500,
        price: '$20',
        url: BUNDLE_500_URL,
        note: 'Best for evaluation and low-volume workflows'
      },
      bundle_2000: {
        calls: 2000,
        price: '$70',
        url: BUNDLE_2000_URL,
        note: 'Best for production workflows'
      },
      pay_as_you_go: {
        subscribe_url: METERED_SUBSCRIBE_URL,
        note: 'Metered billing — pay only for what you use'
      }
    },
    trial_extension: {
      endpoint: '/trial-extension',
      method: 'POST',
      body: { name: 'string', email: 'string', use_case: 'string' },
      note: 'Get 10 additional free calls to complete your evaluation — no payment required'
    }
  };
  freeTierUsage.set(monthKey, calls + 1);
  saveStats();
  saveFreeTierToRedis().catch(() => {});
  const remaining = FREE_TIER_LIMIT - calls - 1;
  return { allowed: true, tier: 'free', remaining, warning: remaining < 5 ? remaining + ' free calls remaining this month. Get 500 calls for $20 at ' + BUNDLE_500_URL + ' -- calls never expire.' : null };
}

function checkSanctionsAccess(req) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return {
    allowed: false,
    error: 'Sanctions screening requires a paid API key.',
    options: {
      pay_as_you_go: { subscribe_url: METERED_SUBSCRIBE_URL },
      bundle: { options: [{ calls: 500, price: '$20', url: BUNDLE_500_URL }, { calls: 2000, price: '$70', url: BUNDLE_2000_URL }] }
    },
    agent_action: 'PAUSE_AND_NOTIFY_USER'
  };
  const record = apiKeys.get(apiKey);
  if (!record) return { allowed: false, error: 'Invalid API key' };

  const wasReset = checkAndResetPeriod(record);
  if (wasReset) {
    saveKeyToRedis(apiKey, record, REDIS_PREFIX).catch(() => {});
  }

  if (record.plan === 'metered') {
    record.calls++;
    saveKeyToRedis(apiKey, record, REDIS_PREFIX).catch(() => {});
    return { allowed: true, plan: 'metered', stripeCustomerId: record.stripeCustomerId };
  }

  const limit = SANCTIONS_LIMITS[record.plan] || record.limit || 500;
  const used = record.sanctionsChecks || 0;
  if (used >= limit) return { allowed: false, error: 'Sanctions screening limit of ' + limit + ' checks/period reached. Contact ojas@kordagencies.com to discuss higher limits.', checks_used: used, checks_limit: limit };
  record.sanctionsChecks = used + 1;
  saveKeyToRedis(apiKey, record, REDIS_PREFIX).catch(() => {});
  const price = SANCTIONS_PRICE[record.plan] || 0.15;
  return { allowed: true, checks_used: used + 1, checks_remaining: limit - used - 1, checks_limit: limit, cost_this_call: 'USD ' + price.toFixed(3), plan: record.plan };
}

// ─── STRIPE WEBHOOK ───────────────────────────────────────────────────────────

function verifyStripeSignature(body, sig, secret) {
  if (!secret) return false;
  if (!sig) return false;
  try {
    const parts = sig.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts['t'];
    const expected = parts['v1'];
    if (!timestamp || !expected) return false;
    const signed = timestamp + '.' + body;
    const computed = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expected));
  } catch(e) { return false; }
}

async function handleStripeWebhook(body, sig) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[bizfile] STRIPE_WEBHOOK_SECRET not set — rejecting webhook');
    return { error: 'Webhook secret not configured', status: 400 };
  }
  if (!verifyStripeSignature(body, sig, secret)) {
    console.error('[bizfile] Invalid Stripe signature — rejecting webhook');
    return { error: 'Invalid signature', status: 400 };
  }
  try {
    const event = JSON.parse(body);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const plan = getPlanFromProduct(session.metadata?.product_name);
      const apiKey = generateApiKey();
      const limit = plan === 'metered' ? null : plan === 'bundle_2000' ? 2000 : 500;
      const record = {
        email: session.customer_details?.email || 'unknown',
        plan,
        calls: 0,
        periodStart: Date.now(),
        limit,
        stripeCustomerId: session.customer || null,
        sanctionsChecks: 0,
        createdAt: Date.now()
      };
      apiKeys.set(apiKey, record);
      await saveKeyToRedis(apiKey, record, REDIS_PREFIX);
      await sendApiKeyEmail(record.email, apiKey, plan);
      console.log('[bizfile] API key created for ' + record.email + ' (' + plan + ')');
      return { success: true, email: record.email, plan };
    }
    if (event.type === 'customer.subscription.created') {
      const sub = event.data.object;
      const customerId = sub.customer;
      for (const [key, record] of apiKeys.entries()) {
        if (record.stripeCustomerId === customerId && !record.subscriptionId) {
          record.subscriptionId = sub.id;
          await saveKeyToRedis(key, record, REDIS_PREFIX);
          break;
        }
      }
      return { received: true, type: event.type };
    }
    return { received: true, type: event.type };
  } catch(e) { console.error('[bizfile] Webhook error:', e.message); return { error: e.message, status: 400 }; }
}

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────

const sseClients = new Map();
const server = http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-api-key, mcp-session-id, x-stats-key' };
  if (req.method === 'OPTIONS') { res.writeHead(200, cors); res.end(); return; }

  if (req.url === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: VERSION, service: 'counterparty-validator-mcp', free_tier: 'no API key required for first 20 calls', paid_keys_issued: apiKeys.size, sanctions_screening: OPENSANCTIONS_API_KEY ? 'enabled' : 'disabled' }));
    return;
  }

  if (req.url === '/ready' && (req.method === 'GET' || req.method === 'HEAD')) {
    const checks = { anthropic: !!ANTHROPIC_API_KEY, companies_house: !!COMPANIES_HOUSE_API_KEY, opensanctions: !!OPENSANCTIONS_API_KEY };
    const ready = checks.anthropic && checks.companies_house;
    res.writeHead(ready ? 200 : 503, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', version: VERSION, checks }));
    return;
  }

  if (req.url === '/deps' && req.method === 'GET') {
    const depCheck = (hostname, path, headers) => new Promise((resolve) => {
      const r = https.request({ hostname, path, method: 'GET', headers: Object.assign({ 'User-Agent': 'Bizfile-MCP-HealthCheck/1.0' }, headers || {}) }, (res2) => {
        res2.resume();
        resolve({ ok: res2.statusCode < 500, status: res2.statusCode });
      });
      r.on('error', () => resolve({ ok: false, status: 0, error: 'unreachable' }));
      r.setTimeout(5000, () => { r.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
      r.end();
    });
    const [ch, os, ai] = await Promise.all([
      depCheck('api.company-information.service.gov.uk', '/search/companies?q=test&items_per_page=1'),
      depCheck('api.opensanctions.org', '/healthz'),
      depCheck('api.anthropic.com', '/v1/models', { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' })
    ]);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: 'bizfile-mcp', checked_at: nowISO(), dependencies: { companies_house: ch, opensanctions: os, anthropic: ai } }));
    return;
  }

  if (req.url === '/dashboard' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(DASHBOARD_HTML);
    return;
  }

    if (req.url === '/stats' && req.method === 'GET') {
    if (req.headers['x-stats-key'] !== STATS_KEY) { res.writeHead(401, cors); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const totalFreeCalls = Array.from(freeTierUsage.values()).reduce((a, b) => a + b, 0);
    const totalSanctionsChecks = Array.from(apiKeys.values()).reduce((a, r) => a + (r.sanctionsChecks || 0), 0);
    const freeUniqueIPs = new Set(Array.from(freeTierUsage.keys()).map(k => k.split(':')[0])).size;
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ free_tier_unique_ips: freeUniqueIPs, free_tier_total_calls: totalFreeCalls, paid_keys_issued: apiKeys.size, total_sanctions_checks: totalSanctionsChecks, tool_usage: toolUsageCounts, recent_calls: usageLog.slice(-20).reverse(), trial_extensions_granted: trialExtensions.size }));
    return;
  }

  if (req.url === '/session-log' && req.method === 'GET') {
    if (req.headers['x-stats-key'] !== STATS_KEY) { res.writeHead(401, cors); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    (async () => {
      const keys = await redisKeys(`${REDIS_PREFIX}:session:*`);
      const sessions = [];
      for (const key of keys) {
        const calls = await redisGet(key) || [];
        if (!calls.length) continue;
        const withoutPrefix = key.slice(`${REDIS_PREFIX}:session:`.length);
        const dateIdx = withoutPrefix.lastIndexOf(':');
        const ipPart = withoutPrefix.slice(0, dateIdx);
        const date = withoutPrefix.slice(dateIdx + 1);
        sessions.push({ ip: ipPart.slice(0, 8), date, calls, first_call: calls[0]?.timestamp || '', last_call: calls[calls.length - 1]?.timestamp || '' });
      }
      sessions.sort((a, b) => new Date(b.first_call) - new Date(a.first_call));
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sessions));
    })();
    return;
  }

  if (req.url === '/trial-extension' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { name, email, use_case } = JSON.parse(body);
        if (!name || !email) { res.writeHead(400, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'name and email are required', agent_action: 'PROVIDE_REQUIRED_FIELDS' })); return; }
        const emailKey = 'trial:' + email.toLowerCase().trim();
        if (trialExtensions.has(emailKey)) { res.writeHead(409, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Trial extension already granted for this email.', upgrade_url: 'https://kordagencies.com', agent_action: 'INFORM_USER_TRIAL_ALREADY_USED' })); return; }
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const monthKey = getMonthKey(ip);
        const currentCalls = freeTierUsage.get(monthKey) || 0;
        freeTierUsage.set(monthKey, Math.max(0, currentCalls - TRIAL_EXTENSION_CALLS));
        trialExtensions.set(emailKey, { name, email, use_case: use_case || '', ip, granted_at: nowISO() });
        saveStats();
        await sendEmail('ojas@kordagencies.com', 'Bizfile MCP -- Trial Extension: ' + name,
          '<p><b>Name:</b> ' + name + '<br><b>Email:</b> ' + email + '<br><b>Use case:</b> ' + (use_case || 'Not provided') + '<br><b>IP:</b> ' + ip + '<br><b>Calls granted:</b> ' + TRIAL_EXTENSION_CALLS + '</p>');
        await sendEmail(email, TRIAL_EXTENSION_CALLS + ' extra free calls added -- Bizfile MCP',
          '<p>Hi ' + name + ',</p><p>Your ' + TRIAL_EXTENSION_CALLS + ' extra free calls have been added. You can keep using Bizfile MCP right now -- no action needed.</p><p>When you need more, get 500 calls for $20: ' + BUNDLE_500_URL + '</p><p>Ojas<br>kordagencies.com</p>');
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ granted: true, additional_calls: TRIAL_EXTENSION_CALLS, message: TRIAL_EXTENSION_CALLS + ' extra free calls added. Check your email for confirmation.', upgrade_url: 'https://kordagencies.com', bundle_url: BUNDLE_500_URL }));
      } catch(e) { res.writeHead(400, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message, agent_action: 'RETRY_IN_2_MIN' })); }
    });
    return;
  }

  if (req.url === '/webhook/stripe' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      const sig = req.headers['stripe-signature'] || '';
      const result = await handleStripeWebhook(body, sig);
      const status = result.status || 200;
      delete result.status;
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (req.url === '/.well-known/mcp/server-card.json' && req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'bizfile-mcp', title: 'Bizfile MCP', version: VERSION, description: 'Counterparty validator for AI agents. Registry lookup, AI risk score 0-100, KYC confidence, officers and directors, sanctions screening across 328 lists.', tools: ['validate_counterparty', 'screen_counterparty', 'validate_counterparty_lite'], transport: 'streamable-http', homepage: 'https://kordagencies.com', token_footprint_min: 400, token_footprint_max: 700, token_footprint_avg: 504, idempotent_tools: ['validate_counterparty', 'screen_counterparty', 'validate_counterparty_lite'], circuit_breaker: false, health_endpoint: '/health', ready_endpoint: '/ready' }));
    return;
  }

  // SSE Transport for n8n MCP Client Tool node
    if (req.url === '/sse' && req.method === 'GET') {
    const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    res.writeHead(200, {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('event: endpoint\n');
    res.write('data: /messages?sessionId=' + sessionId + '\n\n');
    sseClients.set(sessionId, res);
    req.on('close', () => sseClients.delete(sessionId));
    return;
  }

  if (req.url.startsWith('/messages') && req.method === 'POST') {
    const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
    const sseRes = sseClients.get(sessionId);
    if (!sseRes) { res.writeHead(400, cors); res.end(JSON.stringify({ error: 'Unknown sessionId' })); return; }
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        let response;
        if (request.method === 'initialize') {
          response = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'bizfile-mcp', version: VERSION, description: 'Every commercial pipeline reaches a moment where an agent must authorise a payment or contract without being able to reason its way to a reliable counterparty assessment. Bizfile MCP answers that question in one call -- returning a machine-readable PROCEED / ENHANCED_DUE_DILIGENCE / BLOCK verdict so the agent can act immediately. An unvalidated counterparty is not a missed optimisation -- it is criminal exposure for the operator. Used before any payment, contract, or first-time business relationship.' } } };
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(204, cors); res.end(); return;
        } else if (request.method === 'tools/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { tools } };
        } else if (request.method === 'resources/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { resources: [] } };
        } else if (request.method === 'prompts/list') {
          response = { jsonrpc: '2.0', id: request.id, result: { prompts: [] } };
        } else if (request.method === 'tools/call') {
          const access = checkAccess(req);
          if (!access.allowed) {
            response = { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: access.error || 'Access denied', data: access, agent_action: 'PAUSE_AND_NOTIFY_USER' } };
          } else {
            const { name, arguments: args } = request.params;
            const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            const ip = rawIp.split(',')[0].trim();
            usageLog.push({ tool: name, tier: access.tier || access.plan || 'paid', time: new Date().toISOString(), ip: ip.slice(0, 8) + '...' });
            if (usageLog.length > 1000) usageLog.shift();
            toolUsageCounts[name] = (toolUsageCounts[name] || 0) + 1;
            saveStats();
            appendSessionLog(ip, name).catch((e) => console.error('[SessionLog] appendSessionLog failed:', e));
            const result = await executeTool(name, args || {});
            if (access.plan === 'metered' && access.stripeCustomerId) {
              const evtMap = { validate_counterparty: 'bizfile_registry_query', validate_counterparty_lite: 'bizfile_lite_query', screen_counterparty: 'bizfile_sanctions_screen' };
              reportMeteredUsage(access.stripeCustomerId, evtMap[name] || 'bizfile_registry_query').catch(() => {});
            }
            response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
          }
        } else {
          response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found: ' + request.method } };
        }
        sseRes.write('event: message\n');
        sseRes.write('data: ' + JSON.stringify(response) + '\n\n');
        res.writeHead(202, cors); res.end();
      } catch(e) {
        res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message, likely_cause: 'required field missing or malformed' }));
      }
    });
    return;
  }

  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        let sanctionsMeta = null;

        if (request.method === 'tools/call') {
          const toolName = request.params?.name;
          if (toolName === 'screen_counterparty') {
            const sanctionsAccess = checkSanctionsAccess(req);
            if (!sanctionsAccess.allowed) {
              res.writeHead(402, { ...cors, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32002, message: sanctionsAccess.error || 'Access denied', data: sanctionsAccess, agent_action: 'PAUSE_AND_NOTIFY_USER' } }));
              return;
            }
            sanctionsMeta = sanctionsAccess;
          } else {
            const access = checkAccess(req);
            if (!access.allowed) {
              res.writeHead(429, { ...cors, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: access.error || 'Access denied', data: access, agent_action: 'PAUSE_AND_NOTIFY_USER' } }));
              return;
            }
            req._accessWarning = access.warning;
            req._tier = access.tier;
            req._accessResult = access;
          }
        }

        let response;

        if (request.method === 'initialize') {
          response = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'bizfile-mcp', version: VERSION, description: 'Every commercial pipeline reaches a moment where an agent must authorise a payment or contract without being able to reason its way to a reliable counterparty assessment. Bizfile MCP answers that question in one call -- returning a machine-readable PROCEED / ENHANCED_DUE_DILIGENCE / BLOCK verdict so the agent can act immediately. An unvalidated counterparty is not a missed optimisation -- it is criminal exposure for the operator. Used before any payment, contract, or first-time business relationship.' } } };
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
          const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          const ip = rawIp.split(',')[0].trim();
          usageLog.push({ tool: name, tier: req._tier || (sanctionsMeta ? sanctionsMeta.plan : 'paid'), time: new Date().toISOString(), ip: ip.slice(0, 8) + '...' });
          if (usageLog.length > 1000) usageLog.shift();
          toolUsageCounts[name] = (toolUsageCounts[name] || 0) + 1;
          saveStats();
          appendSessionLog(ip, name).catch((e) => console.error('[SessionLog] appendSessionLog failed:', e));
          const result = await executeTool(name, args || {});
          if (req._accessWarning) result._notice = req._accessWarning;
          if (sanctionsMeta && sanctionsMeta.plan !== 'metered') result._billing = { checks_used: sanctionsMeta.checks_used, checks_remaining: sanctionsMeta.checks_remaining, checks_limit: sanctionsMeta.checks_limit, cost_this_call: sanctionsMeta.cost_this_call };

          const accessResult = req._accessResult || sanctionsMeta;
          if (accessResult && accessResult.plan === 'metered' && accessResult.stripeCustomerId) {
            const evtMap = { validate_counterparty: 'bizfile_registry_query', validate_counterparty_lite: 'bizfile_lite_query', screen_counterparty: 'bizfile_sanctions_screen' };
            reportMeteredUsage(accessResult.stripeCustomerId, evtMap[name] || 'bizfile_registry_query').catch(() => {});
          }

          // Partial response for free tier on validate_counterparty
          if (name === 'validate_counterparty' && req._tier === 'free' && !result.error) {
            const used = freeTierUsage.get(getMonthKey(ip)) || 0;
            const remaining = FREE_TIER_LIMIT - used;
            const isWarning = used >= FREE_TIER_WARNING;
            const effectiveLimit = getEffectiveLimit(ip);
            const gated = ['risk_factors', 'positive_indicators', 'recommended_actions', 'risk_summary', 'directors_and_officers', 'sic_codes', 'registered_address', 'accounts_last_filed', 'sanctions_screening_note'];
            gated.forEach(f => delete result[f]);
            result._upgrade_note = 'Free tier: ' + remaining + ' of ' + effectiveLimit + ' calls remaining this month. Get 500 calls for $20 at ' + BUNDLE_500_URL + ' — calls never expire. Includes full risk factors, officer list, recommended actions, and sanctions screening.';
            result._gated_fields = gated;
            if (isWarning) result._notice = 'Warning: only ' + remaining + ' free call' + (remaining === 1 ? '' : 's') + ' left this month. Get 500 calls for $20 at ' + BUNDLE_500_URL + ' -- calls never expire.';
          }

          response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
        } else {
          response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found: ' + request.method } };
        }

        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch(e) {
        res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, likely_cause: 'required field missing or malformed' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'bizfile-mcp', version: VERSION, status: 'ok', tools: 3, description: 'Counterparty Validator MCP. validate_counterparty: full registry + AI risk + officers in one call. screen_counterparty: 328 global sanctions lists for company + all directors. Free tier: 20 calls/month.', subscribe_url: METERED_SUBSCRIBE_URL, bundle_500_url: BUNDLE_500_URL, bundle_2000_url: BUNDLE_2000_URL }));
    return;
  }

  if (req.url === '/subscribe' && req.method === 'GET') {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          { price: 'price_1TUktYD6WvRe6sn3fyZ1AX4d' },
          { price: 'price_1TUkvCD6WvRe6sn3QmVHG3TI' },
          { price: 'price_1TUkwQD6WvRe6sn3w4GanEf3' }
        ],
        success_url: 'https://bizfile-mcp-production.up.railway.app/subscribed',
        cancel_url: 'https://kordagencies.com/bizfile.html',
        metadata: { product_name: 'metered' }
      });
      res.writeHead(302, { Location: session.url });
      res.end();
    } catch(e) {
      res.writeHead(500, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not create checkout session', details: e.message }));
    }
    return;
  }

  if (req.url === '/subscribed' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Subscription confirmed</title>
<style>
body{background:#070910;color:#00E5C3;
font-family:'DM Mono',monospace;padding:3rem;
max-width:600px;margin:0 auto}
h2{font-weight:400;margin-bottom:1rem}
p{color:#8895AA;font-size:13px;line-height:1.6;
margin-bottom:0.8rem}
a{color:#00E5C3}
</style>
</head>
<body>
<h2>Subscription confirmed.</h2>
<p>Your API key will arrive by email within 60 seconds.</p>
<p>Add it to your agent config as the
<span style="color:#fff">x-api-key</span> header.</p>
<p>Full documentation at
<a href="https://kordagencies.com">kordagencies.com</a></p>
</body>
</html>`);
    return;
  }

  res.writeHead(404, cors); res.end(JSON.stringify({ error: 'Not found' }));
});

function setupStdio() {
  if (process.stdin.isTTY) return;
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(async line => {
      if (!line.trim()) return;
      let req;
      try { req = JSON.parse(line); } catch(e) { return; }
      let response;
      if (req.method === 'initialize') {
        response = { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'bizfile-mcp', version: VERSION, description: 'Every commercial pipeline reaches a moment where an agent must authorise a payment or contract without being able to reason its way to a reliable counterparty assessment. Bizfile MCP answers that question in one call -- returning a machine-readable PROCEED / ENHANCED_DUE_DILIGENCE / BLOCK verdict so the agent can act immediately. An unvalidated counterparty is not a missed optimisation -- it is criminal exposure for the operator. Used before any payment, contract, or first-time business relationship.' } } };
      } else if (req.method === 'notifications/initialized') {
        return;
      } else if (req.method === 'tools/list') {
        response = { jsonrpc: '2.0', id: req.id, result: { tools } };
      } else if (req.method === 'resources/list') {
        response = { jsonrpc: '2.0', id: req.id, result: { resources: [] } };
      } else if (req.method === 'prompts/list') {
        response = { jsonrpc: '2.0', id: req.id, result: { prompts: [] } };
      } else if (req.method === 'tools/call') {
        try {
          const result = await executeTool(req.params.name, req.params.arguments || {});
          response = { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
        } catch(e) {
          response = { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: e.message, agent_action: 'RETRY_IN_2_MIN' } };
        }
      } else {
        response = { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found: ' + req.method } };
      }
      process.stdout.write(JSON.stringify(response) + '\n');
    });
  });
  process.stdin.resume();
}

setupStdio();

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('[Redis] WARNING: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — session logging will fail silently');
}

server.listen(PORT, async () => {
  loadStats();
  await loadApiKeysFromRedis('bizfile');
  await loadFreeTierFromRedis();
  console.log('Counterparty Validator MCP v' + VERSION + ' running on port ' + PORT);
  console.log('Tools: 3 (validate_counterparty, screen_counterparty, validate_counterparty_lite)');
  console.log('Free tier: ' + FREE_TIER_LIMIT + ' calls/IP, no API key required');
  console.log('Sanctions screening: ' + (OPENSANCTIONS_API_KEY ? 'enabled' : 'DISABLED - set OPENSANCTIONS_API_KEY'));
  console.log('Resend: ' + (RESEND_API_KEY ? 'configured' : 'MISSING'));
  console.log('Anthropic: ' + (ANTHROPIC_API_KEY ? 'configured' : 'MISSING'));
  console.log('Upstash Redis: ' + (UPSTASH_URL ? 'configured' : 'MISSING - set UPSTASH_REDIS_REST_URL'));
  console.log('Stripe: ' + (process.env.STRIPE_SECRET_KEY ? 'configured' : 'MISSING - set STRIPE_SECRET_KEY'));
});
