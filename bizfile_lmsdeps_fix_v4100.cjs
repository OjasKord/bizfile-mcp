// Fix 2 only: lms-deps panel badge
// Run from: C:\bizfile-mcp\
// Command:   node bizfile_lmsdeps_fix_v4100.cjs

const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, 'src', 'server.js');

const src = fs.readFileSync(TARGET, 'utf8');

if (!src.includes("PERSIST_FILE = '/tmp/bizfile_stats.json'")) {
  console.error('ERROR: Wrong file — aborting');
  process.exit(1);
}

const OLD = `const lmsDeps = await fetchDeps('https://local-model-suitability-mcp-production.up.railway.app');\\n  if (lmsDeps) {\\n    const lmsAiOk = applyDep('dep-lms-ai', lmsDeps.anthropic);\\n    if (!lmsAiOk) alerts.push('Anthropic API unreachable on Local Model Suitability MCP');\\n  } else {\\n    set('dep-lms-ai', 'no /deps'); setClass('dep-lms-ai', 'badge warn');\\n  }`;

const NEW = `const lmsDeps = await fetchDeps('https://local-model-suitability-mcp-production.up.railway.app');\\n  if (lmsDeps) {\\n    const lmsAiOk = applyDep('dep-lms-ai', lmsDeps.anthropic);\\n    if (!lmsAiOk) alerts.push('Anthropic API unreachable on Local Model Suitability MCP');\\n    set('lms-deps', lmsAiOk ? 'ok' : 'degraded'); setClass('lms-deps', lmsAiOk ? 'badge ok' : 'badge warn');\\n  } else {\\n    set('dep-lms-ai', 'no /deps'); setClass('dep-lms-ai', 'badge warn');\\n    set('lms-deps', 'error'); setClass('lms-deps', 'badge err');\\n  }`;

if (!src.includes(OLD)) {
  console.error('ERROR: Target string not found — aborting');
  process.exit(1);
}

const patched = src.replace(OLD, NEW);
fs.writeFileSync(TARGET, patched);
console.log('SUCCESS: lms-deps panel badge fix applied');
console.log('');
console.log('Next steps:');
console.log('  git diff src/server.js   <- verify before committing');
