
const fs = require('fs');
let c = fs.readFileSync('C:/bizfile-mcp/src/server.js', 'utf8');

console.log('File size:', c.length);
console.log('Has validate_counterparty:', c.includes('validate_counterparty'));
console.log('Has bizfile_stats:', c.includes('bizfile_stats'));
console.log('Current version 4.9.0:', c.includes('4.9.0'));

if (!c.includes('validate_counterparty')) {
  console.error('ERROR: Wrong file - not bizfile server');
  process.exit(1);
}

// 1. Add FREE_TIER_WARNING constant
c = c.replace(
  'const FREE_TIER_LIMIT = 20;',
  'const FREE_TIER_LIMIT = 20;\nconst FREE_TIER_WARNING = 16; // warn at 80% usage'
);

// 2. Bump version to 4.10.0
c = c.replace(/4\.9\.0/g, '4.10.0');

// 3. Add partial response logic in tools/call handler
const oldToolCall = `          const result = await executeTool(name, args || {});
          if (req._accessWarning) result._notice = req._accessWarning;
          if (sanctionsMeta) result._billing = { checks_used: sanctionsMeta.checks_used, checks_remaining: sanctionsMeta.checks_remaining, checks_limit: sanctionsMeta.checks_limit, cost_this_call: sanctionsMeta.cost_this_call };
          response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };`;

const newToolCall = `          const result = await executeTool(name, args || {});
          if (req._accessWarning) result._notice = req._accessWarning;
          if (sanctionsMeta) result._billing = { checks_used: sanctionsMeta.checks_used, checks_remaining: sanctionsMeta.checks_remaining, checks_limit: sanctionsMeta.checks_limit, cost_this_call: sanctionsMeta.cost_this_call };

          // Partial response for free tier on validate_counterparty
          if (name === 'validate_counterparty' && req._tier === 'free' && !result.error) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            const used = freeTierUsage.get(ip) || 0;
            const remaining = FREE_TIER_LIMIT - used;
            const isWarning = used >= FREE_TIER_WARNING;
            const gated = ['risk_factors', 'positive_indicators', 'recommended_actions', 'risk_summary', 'directors_and_officers', 'sic_codes', 'registered_address', 'accounts_last_filed', 'sanctions_screening_note'];
            gated.forEach(f => delete result[f]);
            result._upgrade_note = 'Free tier: ' + remaining + ' of ' + FREE_TIER_LIMIT + ' calls remaining this month. Upgrade to Pro ($299/month) at kordagencies.com for full risk factors, officer list, recommended actions, and sanctions screening note.';
            result._gated_fields = gated;
            if (isWarning) result._notice = 'Warning: only ' + remaining + ' free call' + (remaining === 1 ? '' : 's') + ' left this month. Upgrade to Pro at kordagencies.com to avoid interruption.';
          }

          response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };`;

if (!c.includes(oldToolCall)) {
  console.error('ERROR: Could not find tool call handler to patch');
  console.log('Searching for nearby text...');
  const idx = c.indexOf('executeTool(name');
  console.log('executeTool found at:', idx);
  console.log('Context:', c.substring(idx-50, idx+200));
  process.exit(1);
}

c = c.replace(oldToolCall, newToolCall);

console.log('FREE_TIER_WARNING added:', c.includes('FREE_TIER_WARNING'));
console.log('Version 4.10.0:', c.includes('4.10.0'));
console.log('Partial response added:', c.includes('_upgrade_note'));
console.log('New size:', c.length);

fs.writeFileSync('C:/bizfile-mcp/src/server.js', c);
console.log('Done - written to C:/bizfile-mcp/src/server.js');
