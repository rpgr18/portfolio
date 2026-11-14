// Loads every page in headless Chrome at a desktop and a phone width and fails if any page throws
// a script error, can't load one of its own files, scrolls sideways, or has an image with no alt text.
// Usage: node .github/scripts/check-site.mjs http://127.0.0.1:8000 [path to chrome]
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.argv[2] || 'http://127.0.0.1:8000';
const chromePath = process.argv[3] || 'google-chrome';
const pages = ['index.html', 'whoami.html', '404.html', ...readdirSync('work').filter((f) => f.endsWith('.html')).map((f) => `work/${f}`)];
const widths = [[1440, 900], [390, 844]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9333;
const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'chk-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 75 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('Chrome did not start'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); let events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') events.push('script error: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && m.params.response.url.startsWith(root) && !m.params.response.url.endsWith('/404.html'))
    events.push(`HTTP ${m.params.response.status}: ${m.params.response.url.slice(root.length)}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Network.enable');

let failures = 0;
for (const [w, h] of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  for (const page of pages) {
    events = [];
    await send('Page.navigate', { url: `${root}/${page}` });
    await sleep(2500);
    const found = await evaluate(`(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
      scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
      const out = [];
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      if (over > 1) out.push('scrolls sideways by ' + over + 'px');
      document.querySelectorAll('img:not([alt])').forEach((i) => out.push('image without alt: ' + i.getAttribute('src')));
      return out;
    })()`);
    const problems = [...events, ...(found || [])];
    const label = `${page} @ ${w}px`;
    if (problems.length) { failures++; console.log(`✗ ${label}\n  - ${problems.join('\n  - ')}`); }
    else console.log(`✓ ${label}`);
  }
}
ws.close(); chrome.kill();
if (failures) { console.log(`\n${failures} page check(s) failed`); process.exit(1); }
console.log('\nAll pages passed');
