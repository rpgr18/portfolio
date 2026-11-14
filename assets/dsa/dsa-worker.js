// Web Worker: loads Pyodide and dsa-cli's own judging code, then grades solutions on request.
// It runs off the main thread so the page can terminate it when a solution loops forever.
// Messages in:  { id, type: 'run', slug, code, mode: 'run' | 'submit' }
//               { id, type: 'complexity', slug, time, space }
// Messages out: { type: 'ready' } | { type: 'boot-error', message }
//               { id, type: 'phase', phase: 'load' | 'case', index, input?, expected? }   (before each step, for the timeout)
//               { id, type: 'case', index, status } | { id, type: 'done', result } | { id, type: 'failed', message }
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
importScripts(`${PYODIDE}pyodide.js`);

const ROOT = '/home/pyodide/dsa-web';
let py = null;

const boot = (async () => {
  const [pyodide, bundle] = await Promise.all([
    loadPyodide({ indexURL: PYODIDE }),
    fetch(`dsa-bundle.json${self.location.search}`).then((r) => {
      if (!r.ok) throw new Error(`dsa-bundle.json: HTTP ${r.status}`);
      return r.json();
    }),
  ]);
  for (const [path, source] of Object.entries(bundle.files)) {
    const full = `${ROOT}/${path}`;
    pyodide.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
    pyodide.FS.writeFile(full, source);
  }
  pyodide.runPython(`import sys; sys.dont_write_bytecode = True; sys.path.insert(0, ${JSON.stringify(ROOT)})`);
  const harness = pyodide.pyimport('harness');
  harness.setup(JSON.stringify(bundle.modules));
  py = harness;
  postMessage({ type: 'ready' });
})().catch((err) => postMessage({ type: 'boot-error', message: String(err && err.message || err) }));

self.onmessage = async ({ data: msg }) => {
  await boot;
  if (!py) return;
  const { id } = msg;
  try {
    if (msg.type === 'run') {
      const notify = (kind, json) => postMessage({ id, type: kind, ...JSON.parse(json) });
      const out = py.run(msg.slug, msg.code, msg.mode, notify);
      postMessage({ id, type: 'done', result: JSON.parse(out) });
    } else if (msg.type === 'complexity') {
      postMessage({ id, type: 'done', result: JSON.parse(py.check_complexity(msg.slug, msg.time, msg.space)) });
    }
  } catch (err) {
    // Python errors inside a case are reported by dsa itself; this only catches harness or runtime failures
    const text = String(err && err.message || err).trim().split('\n');
    postMessage({ id, type: 'failed', message: text[text.length - 1] });
  }
};
