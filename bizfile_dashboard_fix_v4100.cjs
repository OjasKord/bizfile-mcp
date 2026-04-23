// Bizfile dashboard patch — Session 6
// Fixes:
//   1. OpenSanctions stale text (still says "expires 3 May 2026" — now says pay-as-you-go)
//   2. lms-deps panel badge stuck on "checking" — now updated from checkDependencies()
//
// Run from: C:\bizfile-mcp\
// Command:   node bizfile_dashboard_fix_v4100.js
// Then:      git add src/server.js && git commit -m "fix: dashboard OpenSanctions pay-as-you-go text + lms-deps panel badge"
//            railway up

const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, 'src', 'server.js');
const BACKUP = path.join(__dirname, 'src', 'server.js.bak');

const src = fs.readFileSync(TARGET, 'utf8');

// Verify we're patching the right file
if (!src.includes("bizfile-mcp")) {
  console.error('ERROR: This does not look like bizfile server.js — aborting');
  process.exit(1);
}
if (!src.includes("PERSIST_FILE = '/tmp/bizfile_stats.json'")) {
  console.error('ERROR: PERSIST_FILE check failed — wrong base file — aborting');
  process.exit(1);
}

fs.writeFileSync(BACKUP, src);
console.log('Backup written to src/server.js.bak');

let patched = src;
let changeCount = 0;

// ── Fix 1: OpenSanctions stale text in dep-grid HTML ─────────────────────────
// Two places: the dep-url line and the dep-risk line

const OLD_OS_RISK = `<div class=\\"dep-risk medium\\">MEDIUM · key expires 3 May 2026 · renew 25 April</div>`;
const NEW_OS_RISK = `<div class=\\"dep-risk medium\\">MEDIUM · pay-as-you-go €0.10/call · no expiry · monitor billing at opensanctions.org</div>`;

if (patched.includes(OLD_OS_RISK)) {
  patched = patched.replace(OLD_OS_RISK, NEW_OS_RISK);
  console.log('Fix 1a applied: OpenSanctions dep-risk text updated');
  changeCount++;
} else {
  console.warn('WARN Fix 1a: OpenSanctions dep-risk string not found — may already be patched or escaped differently');
}

// Action items section — "25 Apr: Renew OpenSanctions key (expires 3 May 2026)"
const OLD_OS_ACTION = `<div><span class=\\"upcoming\\">25 Apr:</span> Renew OpenSanctions key (expires 3 May 2026)</div>`;
const NEW_OS_ACTION = `<div><span style=\\"color:#5A9E8A\\">✓ Done:</span> OpenSanctions switched to pay-as-you-go €0.10/call — no expiry, monitor billing at opensanctions.org</div>`;

if (patched.includes(OLD_OS_ACTION)) {
  patched = patched.replace(OLD_OS_ACTION, NEW_OS_ACTION);
  console.log('Fix 1b applied: OpenSanctions action item updated');
  changeCount++;
} else {
  console.warn('WARN Fix 1b: OpenSanctions action item string not found — may already be patched');
}

// ── Fix 2: lms-deps panel badge — update from checkDependencies() ─────────────
// Current code in checkDependencies() for LMS:
//   if (lmsDeps) {
//     const lmsAiOk = applyDep('dep-lms-ai', lmsDeps.anthropic);
//     ...
//   } else {
//     set('dep-lms-ai', 'no /deps'); setClass('dep-lms-ai', 'badge warn');
//   }
//
// We add one line inside each branch to also update the panel badge 'lms-deps'

const OLD_LMS_DEPS_BLOCK = `  const lmsDeps = await fetchDeps(\\'https://local-model-suitability-mcp-production.up.railway.app\\');\\n  if (lmsDeps) {\\n    const lmsAiOk = applyDep(\\'dep-lms-ai\\', lmsDeps.anthropic);\\n    if (!lmsAiOk) alerts.push(\\'Anthropic API unreachable on Local Model Suitability MCP\\');\\n  } else {\\n    set(\\'dep-lms-ai\\', \\'no /deps\\'); setClass(\\'dep-lms-ai\\', \\'badge warn\\');\\n  }`;

const NEW_LMS_DEPS_BLOCK = `  const lmsDeps = await fetchDeps(\\'https://local-model-suitability-mcp-production.up.railway.app\\');\\n  if (lmsDeps) {\\n    const lmsAiOk = applyDep(\\'dep-lms-ai\\', lmsDeps.anthropic);\\n    if (!lmsAiOk) alerts.push(\\'Anthropic API unreachable on Local Model Suitability MCP\\');\\n    set(\\'lms-deps\\', lmsAiOk ? \\'ok\\' : \\'degraded\\'); setClass(\\'lms-deps\\', lmsAiOk ? \\'badge ok\\' : \\'badge warn\\');\\n  } else {\\n    set(\\'dep-lms-ai\\', \\'no /deps\\'); setClass(\\'dep-lms-ai\\', \\'badge warn\\');\\n    set(\\'lms-deps\\', \\'error\\'); setClass(\\'lms-deps\\', \\'badge err\\');\\n  }`;

// The DASHBOARD_HTML is a single-quoted string — we need to match the actual escaped content
// Let's use a different approach: find the pattern without escape complexity
const OLD_LMS_SIMPLE = "const lmsDeps = await fetchDeps('https://local-model-suitability-mcp-production.up.railway.app');\n  if (lmsDeps) {\n    const lmsAiOk = applyDep('dep-lms-ai', lmsDeps.anthropic);\n    if (!lmsAiOk) alerts.push('Anthropic API unreachable on Local Model Suitability MCP');\n  } else {\n    set('dep-lms-ai', 'no /deps'); setClass('dep-lms-ai', 'badge warn');\n  }";

const NEW_LMS_SIMPLE = "const lmsDeps = await fetchDeps('https://local-model-suitability-mcp-production.up.railway.app');\n  if (lmsDeps) {\n    const lmsAiOk = applyDep('dep-lms-ai', lmsDeps.anthropic);\n    if (!lmsAiOk) alerts.push('Anthropic API unreachable on Local Model Suitability MCP');\n    set('lms-deps', lmsAiOk ? 'ok' : 'degraded'); setClass('lms-deps', lmsAiOk ? 'badge ok' : 'badge warn');\n  } else {\n    set('dep-lms-ai', 'no /deps'); setClass('dep-lms-ai', 'badge warn');\n    set('lms-deps', 'error'); setClass('lms-deps', 'badge err');\n  }";

if (patched.includes(OLD_LMS_SIMPLE)) {
  patched = patched.replace(OLD_LMS_SIMPLE, NEW_LMS_SIMPLE);
  console.log('Fix 2 applied: lms-deps panel badge now updated from checkDependencies()');
  changeCount++;
} else {
  // The JS is embedded in a template string in DASHBOARD_HTML — try escaped version
  const OLD_ESCAPED = "const lmsDeps = await fetchDeps(\\'https://local-model-suitability-mcp-production.up.railway.app\\');\\n  if (lmsDeps) {\\n    const lmsAiOk = applyDep(\\'dep-lms-ai\\', lmsDeps.anthropic);\\n    if (!lmsAiOk) alerts.push(\\'Anthropic API unreachable on Local Model Suitability MCP\\');\\n  } else {\\n    set(\\'dep-lms-ai\\', \\'no /deps\\'); setClass(\\'dep-lms-ai\\', \\'badge warn\\');\\n  }";
  const NEW_ESCAPED = "const lmsDeps = await fetchDeps(\\'https://local-model-suitability-mcp-production.up.railway.app\\');\\n  if (lmsDeps) {\\n    const lmsAiOk = applyDep(\\'dep-lms-ai\\', lmsDeps.anthropic);\\n    if (!lmsAiOk) alerts.push(\\'Anthropic API unreachable on Local Model Suitability MCP\\');\\n    set(\\'lms-deps\\', lmsAiOk ? \\'ok\\' : \\'degraded\\'); setClass(\\'lms-deps\\', lmsAiOk ? \\'badge ok\\' : \\'badge warn\\');\\n  } else {\\n    set(\\'dep-lms-ai\\', \\'no /deps\\'); setClass(\\'dep-lms-ai\\', \\'badge warn\\');\\n    set(\\'lms-deps\\', \\'error\\'); setClass(\\'lms-deps\\', \\'badge err\\');\\n  }";
  
  if (patched.includes(OLD_ESCAPED)) {
    patched = patched.replace(OLD_ESCAPED, NEW_ESCAPED);
    console.log('Fix 2 applied (escaped path): lms-deps panel badge now updated from checkDependencies()');
    changeCount++;
  } else {
    console.warn('WARN Fix 2: lms-deps block not found in either form.');
    console.warn('The DASHBOARD_HTML string uses different escaping. Apply Fix 2 manually:');
    console.warn('');
    console.warn('In checkDependencies(), find the lmsDeps block and add after lmsAiOk line:');
    console.warn("  set('lms-deps', lmsAiOk ? 'ok' : 'degraded'); setClass('lms-deps', lmsAiOk ? 'badge ok' : 'badge warn');");
    console.warn('And in the else branch add:');
    console.warn("  set('lms-deps', 'error'); setClass('lms-deps', 'badge err');");
  }
}

if (changeCount === 0) {
  console.error('ERROR: No changes applied — check warnings above');
  process.exit(1);
}

fs.writeFileSync(TARGET, patched);
console.log('');
console.log('SUCCESS: ' + changeCount + ' fix(es) applied to Bizfile server.js');
console.log('');
console.log('Changes made:');
console.log('  1. OpenSanctions dep-risk text: now says pay-as-you-go, no expiry');
console.log('  2. OpenSanctions action item: moved to Done, updated wording');
console.log('  3. lms-deps panel badge: now reflects actual /deps result');
console.log('');
console.log('Next steps:');
console.log('  git status  (should show only src/server.js modified)');
console.log('  git add src/server.js');
console.log('  git commit -m "fix: OpenSanctions pay-as-you-go text + lms-deps panel badge"');
console.log('  railway up');
console.log('');
console.log('After deploy:');
console.log('  Open https://bizfile-mcp-production.up.railway.app/dashboard');
console.log('  Verify: OpenSanctions row says pay-as-you-go');
console.log('  Verify: LMS panel Deps badge shows ok/degraded/error (not stuck on checking)');
