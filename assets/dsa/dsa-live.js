// ---------- dsa-cli, live ----------
// The visitor edits a solution and runs it against dsa-cli's own test cases. The grading is the tool's
// Python (dsa.child.run_case and dsa.checkers), running in Pyodide in a Web Worker (dsa-worker.js),
// loaded on the first run or submit. This file only draws the terminal: the layout follows dsa's
// rich output (ui.results_table and ui.run_summary), and the wording is the tool's own.
(() => {
  const root = document.querySelector('[data-dsa-live]');
  if (!root) return;
  const base = root.dataset.base || '';
  const query = root.dataset.v ? `?v=${root.dataset.v}` : '';
  const TIMEOUT_MS = 5000;   // dsa's DEFAULT_TIMEOUT_MS, applied per case like dsa.child
  const $ = (sel) => root.querySelector(sel);
  const pick = $('.dsa-pick');
  const code = $('.dsa-code');
  const screen = $('.cli-screen');
  const status = $('.dsa-status');
  const buttons = [...root.querySelectorAll('[data-cmd]')];

  // ---- terminal output ----
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sp = (cls, text) => (cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text));
  const dim = (t) => sp('dim', t);
  const CARET = '<span class="caret"></span>';
  const line = (html = '', cls = 'ln') => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    screen.append(el);
    screen.scrollTop = screen.scrollHeight;
    return el;
  };
  const announce = (text) => { status.textContent = ''; setTimeout(() => { status.textContent = text; }, 50); };

  // A rich Table with box=SIMPLE and padding (0, 1): a blank edge row, a dim bold header, a rule, the rows
  const COLS = [
    { w: 3, right: true }, { w: 8 }, { w: 9, right: true },   // fixed widths
    { max: 44 }, { max: 26 }, { max: 26 },                     // the rest fit their content; both word-wrap
  ];
  const wrap = (text, width) => {
    const out = [];
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const word of para.split(/(?<= )/)) {
        if (cur && (cur + word).trimEnd().length > width) { out.push(cur.trimEnd()); cur = ''; }
        let w = word;
        while (w.trimEnd().length > width) { out.push(w.slice(0, width)); w = w.slice(width); }
        cur += w;
      }
      out.push(cur.trimEnd());
    }
    return out;
  };
  const table = (head, rows) => {
    const widths = COLS.map((c, i) => c.w || Math.min(c.max, Math.max(head[i].length,
      ...rows.flatMap((r) => String(r[i].t).split('\n').map((l) => l.length)))));
    const fit = (cell, i) => wrap(cell.t, widths[i]);
    const render = (cells, cls) => {
      const parts = cells.map(fit);
      const height = Math.max(...parts.map((p) => p.length));
      for (let k = 0; k < height; k++) {
        const segs = cells.map((cell, i) => {
          const t = parts[i][k] || '';
          const padded = COLS[i].right ? t.padStart(widths[i]) : t.padEnd(widths[i]);
          const lead = padded.slice(0, padded.length - padded.trimStart().length);
          const body = padded.trim();
          const trail = padded.slice(lead.length + body.length);
          return ` ${lead}${body ? sp(cls || cell.c, body) : ''}${trail} `;
        });
        line(` ${segs.join(' ')}`.replace(/\s+$/, ''));
      }
    };
    line('');
    render(head.map((t) => ({ t })), 'b dim');
    line(dim(` ${'─'.repeat(widths.reduce((a, w) => a + w + 2, 0) + widths.length - 1)}`));
    rows.forEach((r) => render(r));
    line('');
  };

  const STATUS = { pass: ['pass', 'PASS'], fail: ['fail', 'FAIL'], error: ['fail', 'ERROR'], timeout: ['mag', 'TIMEOUT'], skipped: ['dim', 'SKIP'] };
  const resultsTable = (result) => {
    const rows = [];
    for (const c of result.cases) {
      const [style, label] = STATUS[c.status] || ['fail', c.status.toUpperCase()];
      const ok = c.status === 'pass';
      rows.push([
        { t: String(c.index + 1) },
        { t: label, c: `b ${style}` },
        { t: c.elapsed_ms ? `${c.elapsed_ms.toFixed(2)} ms` : '—' },
        c.hidden ? { t: 'hidden', c: 'dim' } : { t: c.input },
        ok ? { t: '—', c: 'dim' } : { t: c.expected },
        ok ? { t: '—', c: 'dim' } : { t: c.actual, c: style },
      ]);
      if (c.note && !ok) rows.push([{ t: '' }, { t: '' }, { t: '' }, { t: `↳ ${c.note}`, c: style }, { t: '' }, { t: '' }]);
    }
    table(['#', 'status', 'time', 'input', 'expected', 'got'], rows);
  };

  const box = (cls, title, html) => line(`${title ? `<b>${esc(title)}</b>` : ''}${html}`, `ln cli-box cli-sum ${cls}`);
  const runSummary = (result, p) => {
    if (result.crashed) return box('is-fail', 'the test process failed', sp('fail', result.crash_note));
    const ok = result.all_passed;
    return box(ok ? 'is-pass' : 'is-fail', '',
      sp(`b ${ok ? 'pass' : 'fail'}`, `${result.passed}/${result.total} tests passed`)
      + dim(`    slowest case ${result.slowest_ms.toFixed(2)} ms`)
      + `\n${dim(`target complexity  time ${p.time}   space ${p.space}`)}`);
  };

  // ---- the worker ----
  let worker = null;
  let ready = null;      // resolves once Pyodide and dsa are loaded
  let isReady = false;
  let current = null;    // the one request in flight: { id, onMessage, resolve, reject }
  let seq = 0;
  const kill = () => {
    worker?.terminate();
    worker = null; ready = null; isReady = false; current = null;
  };
  const ensureWorker = () => {
    if (ready) return ready;
    worker = new Worker(`${base}dsa-worker.js${query}`);
    ready = new Promise((resolve, reject) => {
      worker.onmessage = ({ data: m }) => {
        if (m.type === 'ready') { isReady = true; resolve(); return; }
        if (m.type === 'boot-error') { reject(new Error(m.message)); return; }
        if (!current || m.id !== current.id) return;
        const job = current;
        if (m.type === 'done') { current = null; job.resolve(m.result); }
        else if (m.type === 'failed') { current = null; job.reject(new Error(m.message)); }
        else job.onMessage?.(m);
      };
      worker.onerror = (e) => {
        e.preventDefault();
        const err = new Error(e.message || 'the Python worker stopped');
        if (!isReady) reject(err);
        else if (current) { const job = current; current = null; job.reject(err); }
      };
    });
    ready.catch(kill);   // a failed load can be retried by running again
    return ready;
  };
  const call = (msg, onMessage) => new Promise((resolve, reject) => {
    current = { id: ++seq, onMessage, resolve, reject };
    worker.postMessage({ ...msg, id: current.id });
  });

  // ---- problems and the editor ----
  let problems = [];
  const drafts = new Map();
  const hintsShown = new Map();
  const problem = () => problems.find((p) => p.slug === pick.value) || problems[0];
  let busy = false;
  let runId = 0;   // bumped by every command, so a pending prompt from an earlier one is dropped
  const setBusy = (on) => {
    busy = on;
    buttons.forEach((b) => (on ? b.setAttribute('aria-disabled', 'true') : b.removeAttribute('aria-disabled')));
  };
  const mark = (cmd) => buttons.forEach((b) => b.classList.toggle('is-on', b.dataset.cmd === cmd));

  const startScreen = (p) => {
    ++runId;
    mark('');
    screen.replaceChildren();
    line(`${dim('$')} dsa start ${esc(p.slug)}`);
    line(`  ${dim('created')}  ~/.dsa/solutions/${esc(p.file)}`);
    line(`  ${sp('b', 'when you are ready:')}  dsa run ${esc(p.slug)}`);
  };
  const load = (slug) => {
    const p = problems.find((x) => x.slug === slug);
    code.value = drafts.get(slug) ?? p.starter;
    code.scrollTop = code.scrollHeight;   // the signature to fill in sits under the docstring
    startScreen(p);
  };

  // ---- commands ----
  const timeoutResult = (plan, reports, phase) => {
    if (!phase || phase.phase === 'load') {
      return { crashed: true, crash_note: `your file was still loading after ${(TIMEOUT_MS / 1000).toFixed(1)}s — likely an infinite loop outside a function`, cases: [] };
    }
    // what dsa.child.main writes when a case hangs, then dsa.runner.run_tests's "skipped" fill-in
    let reached = true;
    const cases = plan.indices.map((index, k) => {
      const hidden = plan.hidden[k];
      if (reports.has(index)) return { ...reports.get(index), hidden };
      if (index === phase.index) {
        reached = false;
        return { index, status: 'timeout', elapsed_ms: TIMEOUT_MS, input: phase.input, expected: phase.expected, actual: '—',
          note: `still running after ${(TIMEOUT_MS / 1000).toFixed(1)}s — likely too slow or an infinite loop`, hidden };
      }
      return { index, status: 'skipped', elapsed_ms: 0, input: '', expected: '', actual: '', note: reached ? '' : 'not reached (an earlier case stopped the run)', hidden };
    });
    const passed = cases.filter((c) => c.status === 'pass').length;
    return { cases, passed, total: cases.length, all_passed: false, crashed: false, slowest_ms: Math.max(0, ...cases.map((c) => c.elapsed_ms || 0)) };
  };

  const execute = async (mode) => {
    if (busy || !problems.length) return;
    const p = problem();
    const id = ++runId;
    setBusy(true);
    mark(mode);
    screen.replaceChildren();
    line(`${dim('$')} dsa ${mode} ${esc(p.slug)}`);
    const loading = isReady ? null : line(`  ${dim('Loading Python in your browser (first run only)…')}${CARET}`);
    try {
      await ensureWorker();
    } catch (err) {
      loading?.remove();
      line(`  ${sp('fail', `Python didn't load: ${err.message}`)}`);
      line(`  ${dim('Check your connection, then try again.')}`);
      announce(`Python didn't load. ${err.message}`);
      setBusy(false);
      return;
    }
    loading?.remove();

    const count = mode === 'submit' ? p.cases : p.visible;
    line('');
    line(mode === 'submit'
      ? `  ${sp('b', `submitting ${p.title} — ${count} cases`)}`
      : `  ${dim(`running ${count} case(s) for `)}${sp('b', p.title)}`);
    const working = line(`  ${CARET}`);

    const plan = { indices: [], hidden: [] };
    const reports = new Map();
    let phase = null;
    let timer = 0;
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => { kill(); resolve(timeoutResult(plan, reports, phase)); }, TIMEOUT_MS);
        };
        call({ type: 'run', slug: p.slug, code: code.value, mode }, (m) => {
          if (m.type === 'plan') Object.assign(plan, { indices: m.indices, hidden: m.hidden });
          else if (m.type === 'phase') { phase = m; arm(); }
          else if (m.type === 'case') reports.set(m.index, m);
        }).then(resolve, reject);
      });
    } catch (err) {
      kill();
      result = { crashed: true, crash_note: err.message, cases: [] };
    }
    clearTimeout(timer);
    working.remove();
    if (!worker) ensureWorker().catch(() => {});   // after a timeout or crash, start a fresh Python for next time

    if (!result.crashed) resultsTable(result);
    runSummary(result, p);
    const summary = result.crashed ? 'The test process failed.' : `${result.passed}/${result.total} tests passed.`;
    if (mode === 'run') {
      if (result.all_passed && p.cases > count) {
        line(`  ${sp('b pass', `all sample cases pass — \`dsa submit ${p.slug}\` runs the full suite`)}`);
      }
      announce(summary);
      setBusy(false);
      return;
    }
    if (!result.all_passed) {
      line(`  ${sp('warn', 'not accepted — fix the failing cases and submit again')}`);
      announce(`${summary} Not accepted.`);
      setBusy(false);
      return;
    }
    line(`  ${sp('b pass', 'accepted ✓')}`);
    announce(`${summary} Accepted.`);
    setBusy(false);
    await quiz(p, id);
  };

  // dsa.cli._complexity_quiz: two prompts, answers checked by dsa.complexity in Python
  const ask = (prompt, id) => new Promise((resolve) => {
    const row = line('');
    const label = document.createElement('label');
    label.className = 'cli-q';
    label.textContent = prompt;
    const input = document.createElement('input');
    input.className = 'cli-in';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    label.append(input);
    row.append(label);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      if (id !== runId) return;
      row.textContent = prompt + input.value;
      resolve(input.value);
    });
    input.focus({ preventScroll: true });
    screen.scrollTop = screen.scrollHeight;
  });
  const quiz = async (p, id) => {
    line('');
    line(`  ${sp('b', 'complexity self-check')}${dim('   (blank to skip)')}`);
    const time = await ask('  your time complexity: ', id);
    if (id !== runId) return;
    if (!time.trim()) {
      box('is-plain', 'optimal complexity', `${dim('time   ')}${sp('b', p.time)}\n${dim('space  ')}${sp('b', p.space)}`);
      return;
    }
    const space = await ask('  your space complexity: ', id);
    if (id !== runId || busy) return;
    setBusy(true);
    let res;
    try {
      res = await call({ type: 'complexity', slug: p.slug, time, space });
    } catch (err) {
      line(`  ${sp('fail', err.message)}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (id !== runId) return;
    for (const r of res.rows) {
      line(`  ${esc(r.label)}  ${sp(`b ${r.ok ? 'pass' : 'fail'}`, r.ok ? '✓ ' : '✗ ')}${sp(r.ok ? 'pass' : 'fail', r.shown)}${r.ok ? '' : dim(`   optimal is ${r.reference}`)}`);
    }
    if (res.rows.every((r) => r.ok)) line(`  ${dim('both right — you know why your solution is fast')}`);
    announce(res.rows.map((r) => `${r.label.trim()} ${r.ok ? 'right' : `wrong, optimal is ${r.reference}`}`).join('. '));
  };

  // dsa hint: each press reveals one more, like `dsa hint <slug> -n <count>`
  const hint = () => {
    if (busy || !problems.length) return;
    const p = problem();
    ++runId;
    mark('hint');
    const count = Math.min((hintsShown.get(p.slug) || 0) + 1, p.hints.length);
    hintsShown.set(p.slug, count);
    screen.replaceChildren();
    line(`${dim('$')} dsa hint ${esc(p.slug)}${count > 1 ? ` -n ${count}` : ''}`);
    line('');
    const items = p.hints.slice(0, count).map((h, i) => `<span class="n">${i + 1}.</span> ${esc(h)}`).join('<br>');
    const left = p.hints.length - count;
    line(`<b>hints  ${count}/${p.hints.length}</b>${items}${left ? `<br><br>${dim(`${left} more hint(s): dsa hint ${p.slug} -n ${count + 1}`)}` : ''}`, 'ln cli-box');
    announce(`Hint ${count} of ${p.hints.length}: ${p.hints[count - 1]}`);
  };

  buttons.forEach((b) => b.addEventListener('click', () => (b.dataset.cmd === 'hint' ? hint() : execute(b.dataset.cmd))));

  // ---- editing: Tab indents (Esc, then Tab, moves focus on), Enter keeps the indent ----
  let tabLeaves = false;
  const insert = (text, start, end) => {
    code.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) code.setRangeText(text, start, end, 'end');   // execCommand keeps undo
  };
  const lines = () => {
    const { value, selectionStart: s, selectionEnd: e } = code;
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const to = e > s && value[e - 1] === '\n' ? e - 1 : e;
    const end = value.indexOf('\n', to);
    return { from, to: end === -1 ? value.length : end };
  };
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { tabLeaves = true; return; }
    if (e.key === 'Tab' && !tabLeaves && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value } = code;
      if (!e.shiftKey && !value.slice(s, end).includes('\n')) { insert('    ', s, end); return; }
      const { from, to } = lines();
      const block = value.slice(from, to);
      const next = e.shiftKey ? block.replace(/^ {1,4}/gm, '') : block.replace(/^/gm, '    ');
      if (next === block) return;
      insert(next, from, to);
      code.setSelectionRange(from, from + next.length);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); execute('run'); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.isComposing) {
      const { selectionStart: s, selectionEnd: end, value } = code;
      const before = value.slice(value.lastIndexOf('\n', s - 1) + 1, s);
      const indent = before.match(/^ */)[0] + (before.trimEnd().endsWith(':') ? '    ' : '');
      if (indent) { e.preventDefault(); insert(`\n${indent}`, s, end); }
    }
    if (e.key !== 'Shift') tabLeaves = false;
  });
  code.addEventListener('blur', () => { tabLeaves = false; });
  code.addEventListener('input', () => drafts.set(pick.value, code.value));

  $('.dsa-reset').addEventListener('click', () => {
    const p = problem();
    drafts.delete(p.slug);
    code.value = p.starter;
    code.scrollTop = code.scrollHeight;
    announce('Starter code restored.');
  });
  pick.addEventListener('change', () => { hintsShown.delete(pick.value); load(pick.value); });

  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $('.dsa-keys').textContent = `Tab indents · Esc, then Tab, leaves the editor · ${mac ? '⌘' : 'Ctrl'}+Enter runs`;

  fetch(`${base}dsa-problems.json${query}`)
    .then((r) => r.json())
    .then((data) => {
      problems = data.problems;
      pick.replaceChildren(...problems.map((p) => new Option(p.slug, p.slug)));
      const linked = new URLSearchParams(location.search).get('problem');   // a shared link can name the problem
      pick.value = problems.some((p) => p.slug === linked) ? linked : problems[0].slug;
      load(pick.value);
    })
    .catch(() => { screen.replaceChildren(); line(`  ${sp('fail', "The problems didn't load. Reload the page to try again.")}`); });
})();
