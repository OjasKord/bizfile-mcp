const fs = require('fs');

let s = fs.readFileSync('src/server.js', 'utf8');

// Find and replace the broken analyse_vat_risk handler
// The issue is the template literal got corrupted - replace entire handler with string concat version

const brokenHandler = /if \(name === 'analyse_vat_risk'\) \{[\s\S]*?if \(name === 'compare_invoice_details'\)/;

const fixedHandlers = `if (name === 'analyse_vat_risk') {
    const vat_number = args.vat_number;
    const validation_result = args.validation_result;
    const invoice_amount = args.invoice_amount;
    const invoice_company_name = args.invoice_company_name;
    if (!vat_number || !validation_result) return { error: 'vat_number and validation_result are required' };

    const amountLine = invoice_amount ? 'Invoice Amount: ' + invoice_amount : 'Invoice Amount: Not provided';
    const nameLine = invoice_company_name ? 'Invoice Company Name: ' + invoice_company_name : 'Invoice Company Name: Not provided';
    const regName = validation_result.company_name || 'Not available';

    const prompt = 'You are a B2B fraud detection specialist. Analyse this VAT validation result for fraud signals.\\n\\n' +
      'VAT Number: ' + vat_number + '\\n' +
      'Validation Result: ' + JSON.stringify(validation_result) + '\\n' +
      amountLine + '\\n' +
      nameLine + '\\n' +
      'Registered Company Name: ' + regName + '\\n' +
      'Valid: ' + validation_result.valid + '\\n' +
      'Country: ' + validation_result.country + '\\n\\n' +
      'Analyse for: name mismatch between invoice and registry, recently registered company, dormant/dissolved status, high invoice amount relative to company size, address anomalies, shell company indicators.\\n\\n' +
      'Return ONLY valid JSON: {"recommendation":"CLEAR|REVIEW|BLOCK","risk_level":"LOW|MEDIUM|HIGH|CRITICAL","risk_score":<0-100>,"fraud_signals":[<list of specific concerns>],"positive_indicators":[<list of reassuring factors>],"recommended_action":"<one sentence>","summary":"<2 sentences>"}';

    try {
      const response = await callClaude(prompt);
      const clean = response.replace(/\`\`\`json|\`\`\`/g, '').trim();
      const result = JSON.parse(clean);
      return Object.assign({}, result, { vat_number: vat_number, _disclaimer: LEGAL_DISCLAIMER });
    } catch(e) {
      return { recommendation: 'REVIEW', risk_level: 'MEDIUM', risk_score: 50, vat_number: vat_number, error: 'AI analysis unavailable - manual review recommended', _disclaimer: LEGAL_DISCLAIMER };
    }
  }

  if (name === 'compare_invoice_details') {
    const invoice_company_name = args.invoice_company_name;
    const invoice_address = args.invoice_address;
    const invoice_vat_number = args.invoice_vat_number;
    const validation_result = args.validation_result;
    if (!invoice_company_name || !invoice_vat_number || !validation_result) return { error: 'invoice_company_name, invoice_vat_number, and validation_result are required' };

    const regName = validation_result.company_name || 'Not available from registry';
    const regAddress = validation_result.address || validation_result.registered_address || 'Not available from registry';

    const prompt = 'You are an invoice fraud detection specialist. Compare invoice details against official registry records.\\n\\n' +
      'INVOICE CLAIMS:\\n' +
      'Company Name: ' + invoice_company_name + '\\n' +
      'Address: ' + (invoice_address || 'Not provided') + '\\n' +
      'VAT Number: ' + invoice_vat_number + '\\n\\n' +
      'OFFICIAL REGISTRY RECORDS:\\n' +
      'Registered Company Name: ' + regName + '\\n' +
      'Registered Address: ' + regAddress + '\\n' +
      'VAT Valid: ' + validation_result.valid + '\\n' +
      'Country: ' + validation_result.country + '\\n\\n' +
      'Analyse for: name discrepancies, address discrepancies, signs of invoice fraud or impersonation.\\n\\n' +
      'Return ONLY valid JSON: {"match_status":"MATCH|PARTIAL_MATCH|MISMATCH|UNVERIFIABLE","name_match":"EXACT|SIMILAR|DIFFERENT|UNVERIFIABLE","address_match":"MATCH|DIFFERENT|UNVERIFIABLE","vat_valid":' + validation_result.valid + ',"discrepancies":[<list of differences>],"fraud_risk":"LOW|MEDIUM|HIGH","recommendation":"APPROVE|REVIEW|REJECT","recommended_action":"<one sentence>","summary":"<2 sentences>"}';

    try {
      const response = await callClaude(prompt);
      const clean = response.replace(/\`\`\`json|\`\`\`/g, '').trim();
      const result = JSON.parse(clean);
      return Object.assign({}, result, { invoice_vat_number: invoice_vat_number, _disclaimer: LEGAL_DISCLAIMER });
    } catch(e) {
      return { match_status: 'UNVERIFIABLE', fraud_risk: 'MEDIUM', invoice_vat_number: invoice_vat_number, error: 'AI analysis unavailable - manual review recommended', _disclaimer: LEGAL_DISCLAIMER };
    }
  }

  if (name === 'compare_invoice_details')`;

s = s.replace(brokenHandler, fixedHandlers);

// Verify the fix worked
if (s.includes("Invoice Amount: ${invoice_amount ?")) {
  console.log('ERROR: broken template literal still present');
} else {
  fs.writeFileSync('src/server.js', s);
  console.log('done - server.js fixed');
}
