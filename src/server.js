#!/usr/bin/env node
/**
 * Bizfile MCP Server v1.0
 * Company Intelligence across global registries
 *
 * Tools:
 *   1. search_company       — find a company by name across jurisdictions
 *   2. get_company_profile  — full profile: status, directors, filings
 *   3. verify_company       — quick KYC-style verification check
 *   4. check_company_risk   — AI-powered risk assessment
 *   5. get_officers         — directors and officers of a company
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-20250514";

// ─── DATA SOURCE HELPERS ──────────────────────────────────────────────────────

/**
 * OpenCorporates — 210M+ companies across 130+ jurisdictions, free tier
 * https://api.opencorporates.com
 */
async function searchOpenCorporates(companyName, jurisdiction = null) {
  const params = new URLSearchParams({ q: companyName, per_page: "5" });
  if (jurisdiction) params.append("jurisdiction_code", jurisdiction);

  const apiToken = process.env.OPENCORPORATES_API_TOKEN;
  if (apiToken) params.append("api_token", apiToken);

  const url = `https://api.opencorporates.com/v0.4/companies/search?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenCorporates error: ${res.status}`);
  const data = await res.json();
  return data.results?.companies || [];
}

async function getOpenCorporatesCompany(jurisdictionCode, companyNumber) {
  const apiToken = process.env.OPENCORPORATES_API_TOKEN;
  const tokenParam = apiToken ? `?api_token=${apiToken}` : "";
  const url = `https://api.opencorporates.com/v0.4/companies/${jurisdictionCode}/${companyNumber}${tokenParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenCorporates error: ${res.status}`);
  const data = await res.json();
  return data.results?.company || null;
}

/**
 * UK Companies House — free, authoritative, excellent API
 * https://developer.company-information.service.gov.uk
 */
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

/**
 * Singapore ACRA — open data via data.gov.sg
 * Free, no API key required for basic search
 */
async function searchACRA(companyName) {
  const url = `https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=${encodeURIComponent(companyName)}&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.result?.records || null;
}

/**
 * US SEC EDGAR — free, public company filings
 * https://efts.sec.gov/LATEST/search-index
 */
async function searchEDGAR(companyName) {
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&dateRange=custom&startdt=2020-01-01&forms=10-K,20-F&hits.hits._source=period_of_report,display_names,file_date,form_type`;
  const res = await fetch(url, {
    headers: { "User-Agent": "BizfileMCP contact@bizfilemcp.com" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.hits?.hits?.slice(0, 3) || null;
}

async function getEDGARCompany(cik) {
  const url = `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "BizfileMCP contact@bizfilemcp.com" },
  });
  if (!res.ok) return null;
  return await res.json();
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

const RISK_SYSTEM_PROMPT = `You are a corporate intelligence and KYC specialist. You analyse company data to assess risk for due diligence purposes.

Analyse the provided company data and return a JSON risk assessment:
{
  "risk_score": 0-100,
  "risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "risk_factors": [
    {
      "factor": "name of risk factor",
      "detail": "specific detail",
      "severity": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "positive_indicators": ["list of things that reduce risk"],
  "recommended_actions": ["specific due diligence steps"],
  "summary": "2-3 sentence plain English assessment for a compliance officer"
}

Risk factors to consider: company age, active/inactive status, jurisdiction risk, filing regularity, officer changes, dissolved subsidiaries, registered agent only address, missing financial filings, shell company indicators.`;

const VERIFY_SYSTEM_PROMPT = `You are a KYC verification specialist. Given company registry data, produce a structured verification report.

Return JSON:
{
  "verified": true | false,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "identity_confirmed": {
    "legal_name": "confirmed name or null",
    "registration_number": "number or null",
    "jurisdiction": "country/state",
    "status": "ACTIVE" | "INACTIVE" | "DISSOLVED" | "UNKNOWN"
  },
  "data_sources_checked": ["list of sources"],
  "discrepancies": ["any mismatches found"],
  "verification_gaps": ["what could not be verified"],
  "summary": "plain English verification statement"
}`;

// ─── TOOL HANDLERS ────────────────────────────────────────────────────────────

async function handleSearchCompany({ company_name, jurisdiction, country }) {
  const results = { sources: {}, companies: [] };

  // Determine where to search
  const searchAll = !country && !jurisdiction;
  const searchUK = searchAll || country === "UK" || country === "GB" || jurisdiction === "gb";
  const searchSG = searchAll || country === "SG" || country === "Singapore" || jurisdiction === "sg";
  const searchUS = searchAll || country === "US" || country === "USA" || jurisdiction === "us";

  // Run searches in parallel
  const searches = [];

  if (searchUK) {
    searches.push(
      searchCompaniesHouse(company_name)
        .then((r) => { if (r) results.sources.companies_house = r; })
        .catch(() => {})
    );
  }

  if (searchSG) {
    searches.push(
      searchACRA(company_name)
        .then((r) => { if (r) results.sources.acra_singapore = r; })
        .catch(() => {})
    );
  }

  // Always search OpenCorporates as the global fallback
  searches.push(
    searchOpenCorporates(company_name, jurisdiction)
      .then((r) => { results.sources.opencorporates = r; })
      .catch(() => {})
  );

  await Promise.all(searches);

  // Normalise results into a clean list
  if (results.sources.companies_house?.items) {
    results.companies.push(
      ...results.sources.companies_house.items.slice(0, 5).map((c) => ({
        source: "Companies House (UK)",
        name: c.title,
        registration_number: c.company_number,
        status: c.company_status,
        type: c.company_type,
        jurisdiction: "United Kingdom",
        incorporated: c.date_of_creation,
        address: c.registered_office_address
          ? `${c.registered_office_address.address_line_1 || ""}, ${c.registered_office_address.locality || ""}, ${c.registered_office_address.postal_code || ""}`.trim()
          : null,
        url: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
      }))
    );
  }

  if (results.sources.acra_singapore) {
    results.companies.push(
      ...results.sources.acra_singapore.slice(0, 5).map((c) => ({
        source: "ACRA (Singapore)",
        name: c.entity_name || c.uen_status,
        registration_number: c.uen,
        status: c.uen_status,
        type: c.entity_type,
        jurisdiction: "Singapore",
        incorporated: c.reg_date,
        address: `${c.street_name || ""} ${c.postal_code || ""}`.trim() || null,
        url: `https://www.bizfile.gov.sg`,
      }))
    );
  }

  if (results.sources.opencorporates) {
    results.companies.push(
      ...results.sources.opencorporates.slice(0, 5).map((item) => {
        const c = item.company;
        return {
          source: "OpenCorporates (Global)",
          name: c.name,
          registration_number: c.company_number,
          status: c.current_status || (c.inactive ? "Inactive" : "Active"),
          type: c.company_type,
          jurisdiction: c.jurisdiction_code?.toUpperCase(),
          incorporated: c.incorporation_date,
          address: null,
          url: c.opencorporates_url,
        };
      })
    );
  }

  return {
    query: company_name,
    jurisdiction_filter: jurisdiction || country || "Global",
    total_results: results.companies.length,
    companies: results.companies,
    sources_checked: Object.keys(results.sources),
  };
}

async function handleGetCompanyProfile({ company_name, registration_number, jurisdiction }) {
  let profileData = {};

  if (jurisdiction === "gb" || jurisdiction === "uk") {
    if (registration_number) {
      const ch = await getCompaniesHouseProfile(registration_number);
      if (ch) profileData.companies_house = ch;
    }
  }

  // Always try OpenCorporates for enrichment
  if (registration_number && jurisdiction) {
    try {
      const oc = await getOpenCorporatesCompany(jurisdiction, registration_number);
      if (oc) profileData.opencorporates = oc;
    } catch {}
  }

  // If no structured data found, do a search first
  if (Object.keys(profileData).length === 0 && company_name) {
    const searchResults = await handleSearchCompany({ company_name, jurisdiction });
    return {
      note: "Full profile requires registration number. Returning search results.",
      search_results: searchResults,
    };
  }

  // Build clean unified profile
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
    confirmation_statement: ch?.confirmation_statement || null,
    officers: officers.slice(0, 10).map((o) => ({
      name: o.name,
      role: o.officer_role,
      appointed: o.appointed_on,
      resigned: o.resigned_on || null,
      nationality: o.nationality || null,
    })),
    filing_history_url: ch
      ? `https://find-and-update.company-information.service.gov.uk/company/${ch.company_number}/filing-history`
      : null,
    sources: Object.keys(profileData),
  };
}

async function handleVerifyCompany({ company_name, registration_number, jurisdiction, country }) {
  // Gather data
  const searchData = await handleSearchCompany({
    company_name,
    registration_number,
    jurisdiction: jurisdiction || country,
    country,
  });

  const dataForAnalysis = JSON.stringify({ company_name, registration_number, jurisdiction, search_results: searchData });

  const analysis = await analyzeWithClaude(VERIFY_SYSTEM_PROMPT, dataForAnalysis);

  let parsed;
  try {
    parsed = JSON.parse(analysis);
  } catch {
    parsed = { raw_analysis: analysis };
  }

  return {
    ...parsed,
    raw_data: searchData,
  };
}

async function handleCheckCompanyRisk({ company_name, registration_number, jurisdiction }) {
  // Gather as much data as possible
  let companyData = {};

  try {
    companyData.search = await handleSearchCompany({ company_name, jurisdiction });
  } catch {}

  if (registration_number && jurisdiction) {
    try {
      companyData.profile = await handleGetCompanyProfile({
        company_name,
        registration_number,
        jurisdiction,
      });
    } catch {}
  }

  const dataForAnalysis = JSON.stringify({ company_name, registration_number, jurisdiction, data: companyData });

  const analysis = await analyzeWithClaude(RISK_SYSTEM_PROMPT, dataForAnalysis);

  let parsed;
  try {
    parsed = JSON.parse(analysis);
  } catch {
    parsed = { raw_analysis: analysis };
  }

  return {
    company: company_name,
    registration_number: registration_number || null,
    jurisdiction: jurisdiction || "unknown",
    ...parsed,
    data_sources: companyData.search?.sources_checked || [],
  };
}

async function handleGetOfficers({ company_name, registration_number, jurisdiction }) {
  let officers = [];
  let source = null;

  if ((jurisdiction === "gb" || jurisdiction === "uk") && registration_number) {
    const ch = await getCompaniesHouseProfile(registration_number);
    if (ch?.officers?.items) {
      officers = ch.officers.items.map((o) => ({
        name: o.name,
        role: o.officer_role,
        appointed: o.appointed_on,
        resigned: o.resigned_on || null,
        nationality: o.nationality || null,
        date_of_birth: o.date_of_birth
          ? `${o.date_of_birth.month}/${o.date_of_birth.year}`
          : null,
        address_country: o.address?.country || null,
        occupation: o.occupation || null,
      }));
      source = "Companies House (UK)";
    }
  }

  if (officers.length === 0) {
    // Fall back to OpenCorporates
    if (registration_number && jurisdiction) {
      try {
        const oc = await getOpenCorporatesCompany(jurisdiction, registration_number);
        if (oc?.officers) {
          officers = oc.officers.map((item) => ({
            name: item.officer?.name,
            role: item.officer?.position,
            appointed: item.officer?.start_date,
            resigned: item.officer?.end_date || null,
          }));
          source = "OpenCorporates";
        }
      } catch {}
    }
  }

  if (officers.length === 0) {
    return {
      note: "Officer data requires a UK company number (jurisdiction: gb) or a valid OpenCorporates record. Try searching first with search_company.",
      company: company_name,
    };
  }

  const active = officers.filter((o) => !o.resigned);
  const resigned = officers.filter((o) => o.resigned);

  return {
    company: company_name,
    registration_number,
    source,
    total_officers: officers.length,
    active_officers: active,
    resigned_officers: resigned,
  };
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_company",
    description:
      "Search for a company by name across global registries including UK Companies House, Singapore ACRA, and OpenCorporates (130+ jurisdictions). Returns matching companies with registration numbers, status, and jurisdiction.",
    inputSchema: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "The company name to search for",
        },
        country: {
          type: "string",
          description: "Optional country filter e.g. UK, SG, US, IN. Leave blank for global search.",
        },
        jurisdiction: {
          type: "string",
          description: "Optional jurisdiction code e.g. gb, sg, us_de. Used for OpenCorporates filtering.",
        },
      },
      required: ["company_name"],
    },
  },
  {
    name: "get_company_profile",
    description:
      "Get a detailed company profile including registration details, status, SIC codes, filing history, registered address, and key dates. Best results with a registration number and jurisdiction.",
    inputSchema: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "Company name",
        },
        registration_number: {
          type: "string",
          description: "Company registration number (e.g. 12345678 for UK)",
        },
        jurisdiction: {
          type: "string",
          description: "Jurisdiction code: gb (UK), sg (Singapore), us (USA)",
        },
      },
      required: ["company_name"],
    },
  },
  {
    name: "verify_company",
    description:
      "KYC-style verification of a company. Checks existence, active status, and identity across multiple registries. Returns a structured verification report with confidence level and any discrepancies found.",
    inputSchema: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "The company name to verify",
        },
        registration_number: {
          type: "string",
          description: "Known registration number if available",
        },
        jurisdiction: {
          type: "string",
          description: "Jurisdiction code if known",
        },
        country: {
          type: "string",
          description: "Country of incorporation if known",
        },
      },
      required: ["company_name"],
    },
  },
  {
    name: "check_company_risk",
    description:
      "AI-powered due diligence risk assessment for a company. Analyses registry data to produce a risk score (0-100), risk level, specific risk factors, and recommended due diligence actions. Designed for compliance and KYC workflows.",
    inputSchema: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "Company name to assess",
        },
        registration_number: {
          type: "string",
          description: "Registration number for deeper analysis",
        },
        jurisdiction: {
          type: "string",
          description: "Jurisdiction code",
        },
      },
      required: ["company_name"],
    },
  },
  {
    name: "get_officers",
    description:
      "Get the directors and officers of a company including appointment dates, roles, nationality, and resignation dates. Useful for identifying beneficial ownership and director history.",
    inputSchema: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "Company name",
        },
        registration_number: {
          type: "string",
          description: "Registration number (required for UK Companies House data)",
        },
        jurisdiction: {
          type: "string",
          description: "Jurisdiction code e.g. gb, sg",
        },
      },
      required: ["company_name"],
    },
  },
];

// ─── MCP SERVER ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: "bizfile-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "search_company":
        result = await handleSearchCompany(args);
        break;
      case "get_company_profile":
        result = await handleGetCompanyProfile(args);
        break;
      case "verify_company":
        result = await handleVerifyCompany(args);
        break;
      case "check_company_risk":
        result = await handleCheckCompanyRisk(args);
        break;
      case "get_officers":
        result = await handleGetOfficers(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error.message, tool: name }),
        },
      ],
      isError: true,
    };
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Bizfile MCP Server v1.0 running");
