// Fix: webhook badge shows "secured" when signature check rejects unsigned POST
// Run from: C:\bizfile-mcp\
// node bizfile_webhook_badge_fix.cjs

const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, 'src', 'server.js');

const src = fs.readFileSync(TARGET, 'utf8');

if (!src.includes("PERSIST_FILE = '/tmp/bizfile_stats.json'")) {
  console.error('ERROR: Wrong file — aborting');
  process.exit(1);
}

const OLD = `checkServerWebhook(s) {\\n  const { id, url } = s;\\n  const whId = id + '-webhook';\\n  const el = document.getElementById(whId);\\n  if (!el) return;\\n  try {\\n    const r = await fetch(url + '/webhook/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'ping' }) });\\n    set(whId, r.ok ? 'reachable' : 'error');\\n    setClass(whId, r.ok ? 'badge ok' : 'badge err');\\n  } catch(e) { set(whId, 'error'); setClass(whId, 'badge err'); }\\n}`;

const NEW = `checkServerWebhook(s) {\\n  const { id, url } = s;\\n  const whId = id + '-webhook';\\n  const el = document.getElementById(whId);\\n  if (!el) return;\\n  try {\\n    const r = await fetch(url + '/webhook/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'ping' }) });\\n    if (r.ok) { set(whId, 'reachable'); setClass(whId, 'badge ok'); }\\n    else if (r.status === 400) { set(whId, 'secured'); setClass(whId, 'badge ok'); }\\n    else { set(whId, 'error'); setClass(whId, 'badge err'); }\\n  } catch(e) { set(whId, 'error'); setClass(whId, 'badge err'); }\\n}`;

if (!src.includes(OLD)) {
  console.error('ERROR: Target string not found — aborting');
  process.exit(1);
}

fs.writeFileSync(TARGET, src.replace(OLD, NEW));
console.log('SUCCESS: Webhook badge fix applied — 400 now shows "secured"');
