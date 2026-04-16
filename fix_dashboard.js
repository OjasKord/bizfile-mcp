const fs = require('fs');
let c = fs.readFileSync('C:/bizfile-mcp/src/server.js', 'utf8');

console.log('Size before:', c.length);
console.log('Dashboard occurrences:', c.split("req.url === '/dashboard'").length - 1);

// Find both dashboard route blocks
// Each block starts with: if (req.url === '/dashboard' && req.method === 'GET') {
// and ends with: return;\n  }\n\n  if (req.url === '/stats'

const dashMarker = "  if (req.url === '/dashboard' && req.method === 'GET') {";
const statsMarker = "  if (req.url === '/stats' && req.method === 'GET') {";

const firstDash = c.indexOf(dashMarker);
const secondDash = c.indexOf(dashMarker, firstDash + 1);
const statsPos = c.indexOf(statsMarker);

console.log('First dashboard at:', firstDash);
console.log('Second dashboard at:', secondDash);
console.log('Stats at:', statsPos);

if (secondDash === -1) {
  console.log('Only one dashboard route found - nothing to fix');
  process.exit(0);
}

// Keep everything before first dashboard, skip to second dashboard, keep from there
const before = c.substring(0, firstDash);
const fromSecond = c.substring(secondDash);

c = before + fromSecond;

console.log('Size after:', c.length);
console.log('Dashboard occurrences after:', c.split("req.url === '/dashboard'").length - 1);

fs.writeFileSync('C:/bizfile-mcp/src/server.js', c);
console.log('Done');
