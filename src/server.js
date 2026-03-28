#!/usr/bin/env node
/**
 * Bizfile MCP Server v1.2
 * Streamable HTTP transport (Smithery-compatible)
 * Single /mcp endpoint handles all MCP communication
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import http from "http";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-20250514";
const PORT = process.env.PORT || 3000;

// ─── DATA SOURCES ─────────────────────────────────────────────────────────────

async function searchCompaniesHouse(companyName) {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) return null;
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=5`;
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return null;
  return await res.json();
}

async function getCompaniesHouseProfile(companyNumber) {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) return null;
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };
  const [profileRes, officersRes] = await Promise.all([
    fetch(`https://api.company-information.service.gov.uk/company/${companyNumber}`, { headers }),
    fetch(`https://api.company-information.service.gov.uk/company/${companyNumber}/officers`, { headers }),
  ]);
  const profile = profileRes.ok ? await profileRes.json() : null;
  const officers = officersRes.ok ? await officersRes.json() : null;
  return { profile, officers };
}

async function searchACRA(companyName) {
  const url = `https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=${encodeURIComponent(companyName)}&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.result?.records || null;
}

async function searchOpenCorporates(companyName, jurisdiction) {
  const params = new URLSearchParams({ q: companyName, per_page: "5" });
  if (jurisdiction) params.append("jurisdiction_code", jurisdiction);
  const apiToken = process.env.OPENCORPORATES_API_TOKEN;
  if (apiToken) params.append("api_token", apiToken);
  const res = await fetch(`https://api.opencorporates.com/v0.4/companies/search?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results?.companies || [];
}

async function getOpenCorporatesCompany(jurisdictionCode, companyNumber) {
  const apiToken = process.env.OPENCORPORATES_API_TOKEN;
  const tokenParam = apiToken ? `?api_token=${apiToken}` : "";
  const res = await fetch(`https://api.opencorporates.com/v0.4/companies/${jurisdictionCode}/${companyNumber}${tokenParam}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.company || null;
}

// ─── AI ANALYSIS ─────────────────────────────────────────────────────────────

async function analyzeWithClaude(systemPrompt, userContent) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  return response.content[0].text;
}

const RISK_PROMPT = `You are a corporate intelligence and KYC specialist. Analyse the company data and return ONLY valid JSON (no markdown, no backticks) with this structure:
{"risk_score":0-100,"risk_level":"LOW|MEDIUM|HIGH|CRITICAL","risk_factors":[{"factor":"string","detail":"string","severity":"LOW|MEDIUM|HIGH"}],"positive_indicators":["string"],"recommended_actions":["string"],"summary":"string"}`;

const VERIFY_PROMPT = `You are a KYC verification specialist. Return ONLY valid JSON (no markdown, no backticks):
{"verified":true,"confidence":"HIGH|MEDIUM|LOW","identity_confirmed":{"legal_name":"string","registration_number":"string","jurisdiction":"string","status":"ACTIVE|INACTIVE|DISSOLVED|UNKNOWN"},"data_sources_checked":["string"],"discrepancies":["string"],"verification_gaps":["string"],"summary":"string"}`;

// ─── TOOL HANDLERS ────────────────────────────────────────────────────────────

async function handleSearchCompany({ company_name, jurisdiction, country }) {
  const results = { sources: {}, companies: [] };
  await Promise.all([
    searchCompaniesHouse(company_name).then(r => { if (r) results.sources.companies_house = r; }).catch(() => {}),
    searchACRA(company_name).then(r => { if (r) results.sources.acra_singapore = r; }).catch(() => {}),
    searchOpenCorporates(company_name, jurisdiction).then(r => { if (r?.length) results.sources.opencorporates = r; }).catch(() => {}),
  ]);

  if (results.sources.companies_house?.items) {
    results.companies.push(...results.sources.companies_house.items.slice(0, 5).map(c => ({
      source: "Companies House (UK)", name: c.title, registration_number: c.company_number,
      status: c.company_status, type: c.company_type, jurisdiction: "United Kingdom",
      incorporated: c.date_of_creation,
      url: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
    })));
  }
  if (results.sources.acra_singapore) {
    results.companies.push(...results.sources.acra_singapore.slice(0, 5).map(c => ({
      source: "ACRA (Singapore)", name: c.entity_name, registration_number: c.uen,
      status: c.uen_status, type: c.entity_type, jurisdiction: "Singapore",
      incorporated: c.reg_date, url: "https://www.bizfile.gov.sg",
    })));
  }
  if (results.sources.opencorporates?.length) {
    results.companies.push(...results.sources.opencorporates.slice(0, 5).map(item => {
      const c = item.company;
      return { source: "OpenCorporates (Global)", name: c.name, registration_number: c.company_number, status: c.current_status || (c.inactive ? "Inactive" : "Active"), type: c.company_type, jurisdiction: c.jurisdiction_code?.toUpperCase(), incorporated: c.incorporation_date, url: c.opencorporates_url };
    }));
  }
  return { query: company_name, total_results: results.companies.length, companies: results.companies, sources_checked: Object.keys(results.sources) };
}

async function handleGetCompanyProfile({ company_name, registration_number, jurisdiction }) {
  if (!registration_number) {
    return { note: "Full profile requires a registration number. Use search_company first.", search: await handleSearchCompany({ company_name, jurisdiction }) };
  }
  let profileData = {};
  if ((jurisdiction === "gb" || jurisdiction === "uk") && registration_number) {
    const ch = await getCompaniesHouseProfile(registration_number).catch(() => null);
    if (ch) profileData.companies_house = ch;
  }
  try {
    if (jurisdiction && registration_number) {
      const oc = await getOpenCorporatesCompany(jurisdiction, registration_number);
      if (oc) profileData.opencorporates = oc;
    }
  } catch {}

  const ch = profileData.companies_house?.profile;
  const oc = profileData.opencorporates;
  const officers = profileData.companies_house?.officers?.items || [];
  return {
    legal_name: ch?.company_name || oc?.name,
    registration_number: ch?.company_number || oc?.company_number,
    status: ch?.company_status || (oc?.inactive ? "inactive" : "active"),
    type: ch?.type || oc?.company_type,
    jurisdiction: ch ? "United Kingdom" : oc?.jurisdiction_code?.toUpperCase(),
    incorporated: ch?.date_of_creation || oc?.incorporation_date,
    dissolved: ch?.date_of_cessation || oc?.dissolution_date,
    registered_address: ch?.registered_office_address || null,
    sic_codes: ch?.sic_codes || [],
    accounts: ch?.accounts || null,
    officers: officers.slice(0, 10).map(o => ({ name: o.name, role: o.officer_role, appointed: o.appointed_on, resigned: o.resigned_on || null, nationality: o.nationality || null })),
    filing_history_url: ch ? `https://find-and-update.company-information.service.gov.uk/company/${ch.company_number}/filing-history` : null,
    sources: Object.keys(profileData),
  };
}

async function handleVerifyCompany({ company_name, registration_number, jurisdiction, country }) {
  const searchData = await handleSearchCompany({ company_name, jurisdiction: jurisdiction || country, country });
  const analysis = await analyzeWithClaude(VERIFY_PROMPT, JSON.stringify({ company_name, registration_number, search_results: searchData }));
  let parsed;
  try { parsed = JSON.parse(analysis); } catch { parsed = { raw_analysis: analysis }; }
  return { ...parsed, raw_data: searchData };
}

async function handleCheckCompanyRisk({ company_name, registration_number, jurisdiction }) {
  let companyData = {};
  try { companyData.search = await handleSearchCompany({ company_name, jurisdiction }); } catch {}
  if (registration_number && jurisdiction) {
    try { companyData.profile = await handleGetCompanyProfile({ company_name, registration_number, jurisdiction }); } catch {}
  }
  const analysis = await analyzeWithClaude(RISK_PROMPT, JSON.stringify({ company_name, registration_number, jurisdiction, data: companyData }));
  let parsed;
  try { parsed = JSON.parse(analysis); } catch { parsed = { raw_analysis: analysis }; }
  return { company: company_name, registration_number: registration_number || null, jurisdiction: jurisdiction || "unknown", ...parsed, data_sources: companyData.search?.sources_checked || [] };
}

async function handleGetOfficers({ company_name, registration_number, jurisdiction }) {
  if (!registration_number) return { note: "Registration number required. Use search_company to find it.", company: company_name };
  if (jurisdiction !== "gb" && jurisdiction !== "uk") return { note: "Officer data currently available for UK companies (jurisdiction: gb). Use search_company to find the registration number.", company: company_name };
  const ch = await getCompaniesHouseProfile(registration_number).catch(() => null);
  if (!ch?.officers?.items?.length) return { note: "No officer data found for this company.", company: company_name };
  const officers = ch.officers.items.map(o => ({ name: o.name, role: o.officer_role, appointed: o.appointed_on, resigned: o.resigned_on || null, nationality: o.nationality || null, occupation: o.occupation || null }));
  return { company: company_name, registration_number, source: "Companies House (UK)", total_officers: officers.length, active_officers: officers.filter(o => !o.resigned), resigned_officers: officers.filter(o => o.resigned) };
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

const TOOLS = [
  { name: "search_company", description: "Search for a company by name across UK Companies House, Singapore ACRA, and OpenCorporates (130+ jurisdictions). Returns matching companies with registration numbers and status.", inputSchema: { type: "object", properties: { company_name: { type: "string", description: "Company name to search for" }, country: { type: "string", description: "Optional country filter e.g. UK, SG, US" }, jurisdiction: { type: "string", description: "Optional jurisdiction code e.g. gb, sg" } }, required: ["company_name"] } },
  { name: "get_company_profile", description: "Get detailed company profile including status, address, SIC codes, filing history. Provide registration_number and jurisdiction for best results.", inputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string", description: "Company registration number" }, jurisdiction: { type: "string", description: "Jurisdiction code: gb (UK), sg (Singapore)" } }, required: ["company_name"] } },
  { name: "verify_company", description: "KYC-style company verification. Returns confidence rating (HIGH/MEDIUM/LOW), verified status, and any discrepancies found across registries.", inputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, jurisdiction: { type: "string" }, country: { type: "string" } }, required: ["company_name"] } },
  { name: "check_company_risk", description: "AI-powered due diligence risk assessment. Returns risk score 0-100, risk level, specific risk factors, and recommended due diligence actions.", inputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, jurisdiction: { type: "string" } }, required: ["company_name"] } },
  { name: "get_officers", description: "Get directors and officers of a UK company with appointment dates, roles, nationalities, and resignation history. Requires registration_number and jurisdiction: gb.", inputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string", description: "Required for officer lookup" }, jurisdiction: { type: "string", description: "Use gb for UK companies" } }, required: ["company_name", "registration_number", "jurisdiction"] } },
];

// ─── MCP SERVER FACTORY ───────────────────────────────────────────────────────

function createMCPServer() {
  const server = new Server({ name: "bizfile-mcp", version: "1.2.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case "search_company": result = await handleSearchCompany(args); break;
        case "get_company_profile": result = await handleGetCompanyProfile(args); break;
        case "verify_company": result = await handleVerifyCompany(args); break;
        case "check_company_risk": result = await handleCheckCompanyRisk(args); break;
        case "get_officers": result = await handleGetOfficers(args); break;
        default: throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error.message, tool: name }) }], isError: true };
    }
  });
  return server;
}

// ─── HTTP SERVER (Streamable HTTP transport) ──────────────────────────────────

const sessions = new Map();

const httpServer = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost`);

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "bizfile-mcp", version: "1.2.0", status: "running", tools: TOOLS.map(t => t.name) }));
    return;
  }

  // MCP endpoint — handles all MCP protocol messages
  if (url.pathname === "/mcp") {
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", async () => {
        try {
          const message = JSON.parse(body);
          const sessionId = req.headers["mcp-session-id"];

          let transport;
          if (sessionId && sessions.has(sessionId)) {
            transport = sessions.get(sessionId);
          } else if (!sessionId && isInitializeRequest(message)) {
            const server = createMCPServer();
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (id) => sessions.set(id, transport),
            });
            transport.onclose = () => sessions.delete(transport.sessionId);
            await server.connect(transport);
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid request: no session ID or not an initialize request" }));
            return;
          }

          await transport.handleRequest(req, res, message);
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        }
      });
      return;
    }

    if (req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"];
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId).handleRequest(req, res);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
      }
      return;
    }

    if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"];
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId).close();
        sessions.delete(sessionId);
      }
      res.writeHead(200); res.end();
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ─── START ────────────────────────────────────────────────────────────────────

if (process.env.MCP_TRANSPORT === "stdio") {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bizfile MCP Server v1.2 running (STDIO)");
} else {
  httpServer.listen(PORT, () => {
    console.log(`Bizfile MCP Server v1.2 running on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });
}
