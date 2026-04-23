/**
 * Bizfile MCP — Quick Test Script
 * Tests each data source independently
 * Run: node test.js
 */

const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

console.log("=== Bizfile MCP — Data Source Tests ===\n");

// Test 1: Companies House
async function testCompaniesHouse() {
  console.log("TEST 1: UK Companies House...");
  if (!COMPANIES_HOUSE_API_KEY) {
    console.log("  ⚠️  COMPANIES_HOUSE_API_KEY not set — skipping\n");
    return;
  }
  try {
    const auth = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString("base64");
    const res = await fetch(
      "https://api.company-information.service.gov.uk/search/companies?q=Shell&items_per_page=3",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      console.log(`  ✅ Working — found ${data.total_results} results for "Shell"`);
      console.log(`  First result: ${data.items[0].title} (${data.items[0].company_number})\n`);
    } else {
      console.log("  ❌ No results returned\n");
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }
}

// Test 2: Singapore ACRA
async function testACRA() {
  console.log("TEST 2: Singapore ACRA...");
  try {
    const res = await fetch(
      "https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=singapore+airlines&limit=3"
    );
    const data = await res.json();
    if (data.result?.records?.length > 0) {
      console.log(`  ✅ Working — found ${data.result.total} results for "Singapore Airlines"`);
      console.log(`  First result: ${data.result.records[0].entity_name}\n`);
    } else {
      console.log("  ⚠️  No results — ACRA dataset may have changed\n");
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }
}

// Test 3: SEC EDGAR
async function testEDGAR() {
  console.log("TEST 3: US SEC EDGAR...");
  try {
    const res = await fetch(
      "https://efts.sec.gov/LATEST/search-index?q=%22Apple+Inc%22&forms=10-K&hits.hits._source=display_names,file_date,form_type",
      { headers: { "User-Agent": "BizfileMCP contact@bizfilemcp.com" } }
    );
    const data = await res.json();
    if (data.hits?.hits?.length > 0) {
      console.log(`  ✅ Working — found SEC filings for Apple Inc`);
      console.log(`  Latest filing: ${data.hits.hits[0]._source.form_type} on ${data.hits.hits[0]._source.file_date}\n`);
    } else {
      console.log("  ⚠️  No results returned\n");
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }
}

// Test 4: OpenCorporates (no key needed for basic search)
async function testOpenCorporates() {
  console.log("TEST 4: OpenCorporates (global)...");
  try {
    const res = await fetch(
      "https://api.opencorporates.com/v0.4/companies/search?q=Accenture&per_page=3"
    );
    const data = await res.json();
    if (data.results?.companies?.length > 0) {
      console.log(`  ✅ Working — found ${data.results.total_count} results for "Accenture"`);
      console.log(`  First result: ${data.results.companies[0].company.name} (${data.results.companies[0].company.jurisdiction_code})\n`);
    } else {
      console.log("  ⚠️  No results returned\n");
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }
}

// Test 5: Anthropic API
async function testAnthropic() {
  console.log("TEST 5: Anthropic API...");
  if (!ANTHROPIC_API_KEY) {
    console.log("  ⚠️  ANTHROPIC_API_KEY not set — skipping\n");
    return;
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{ role: "user", content: "Reply with just: API working" }],
      }),
    });
    const data = await res.json();
    if (data.content?.[0]?.text) {
      console.log(`  ✅ Working — ${data.content[0].text}\n`);
    } else {
      console.log(`  ❌ Unexpected response: ${JSON.stringify(data)}\n`);
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}\n`);
  }
}

// Run all tests
async function runTests() {
  await testCompaniesHouse();
  await testACRA();
  await testEDGAR();
  await testOpenCorporates();
  await testAnthropic();
  console.log("=== Tests complete ===");
}

runTests();
