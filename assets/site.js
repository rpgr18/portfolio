// Shared by every page. Each block only runs when the page has the elements it needs.

// ---------- Black-Scholes (normal CDF: Hart 1968 via West 2005, same as optlib/normal.py) ----------
const SQRT_2PI = 2.5066282746310002;
const HART_NUM = [220.206867912376, 221.213596169931, 112.079291497871, 33.912866078383,
  6.37396220353165, 0.700383064443688, 3.52624965998911e-2];
const HART_DEN = [440.413735824752, 793.826512519948, 637.333633378831, 296.564248779674,
  86.7807322029461, 16.064177579207, 1.75566716318264, 8.83883476483184e-2];
const horner = (coeffs, x) => coeffs.reduceRight((acc, c) => acc * x + c, 0);

function normCdf(z) {
  const za = Math.abs(z);
  let upper = 0;
  if (za <= 37) {
    const e = Math.exp(-0.5 * za * za);
    if (za < 7.071067811865475) {
      upper = e * horner(HART_NUM, za) / horner(HART_DEN, za);
    } else {
      let cf = za + 0.65;
      for (const k of [4, 3, 2, 1]) cf = za + k / cf;
      upper = e / (cf * SQRT_2PI);
    }
  }
  return z > 0 ? 1 - upper : upper;
}
const normPdf = (z) => Math.exp(-0.5 * z * z) / SQRT_2PI;

// European, no dividends. Vega per vol point, theta per day, rho per 1%.
function blackScholes(S, K, T, sigma, r) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const df = Math.exp(-r * T);
  const nd1 = normPdf(d1);
  const call = S * normCdf(d1) - K * df * normCdf(d2);
  const put = K * df * normCdf(-d2) - S * normCdf(-d1);
  const decay = -S * nd1 * sigma / (2 * sqrtT);
  return {
    call: { price: call, delta: normCdf(d1), theta: (decay - r * K * df * normCdf(d2)) / 365, rho: K * T * df * normCdf(d2) / 100 },
    put: { price: put, delta: normCdf(d1) - 1, theta: (decay + r * K * df * normCdf(-d2)) / 365, rho: -K * T * df * normCdf(-d2) / 100 },
    gamma: nd1 / (S * sigma * sqrtT),
    vega: S * nd1 * sqrtT / 100,
    parityError: Math.abs(call - put - (S - K * df)),
  };
}

(() => {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minus = (s) => s.replace('-', '−');
  const fmt = (x) => minus((Math.abs(x) < 5e-5 ? 0 : x).toFixed(4));

  // ---------- Theme: white by default, dark on request, remembered per visitor ----------
  // The inline script in <head> applies a saved choice before first paint; this keeps the toggle,
  // its label and the browser's theme colour in step.
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const syncTheme = () => {
    const dark = root.dataset.theme === 'dark';
    themeMeta?.setAttribute('content', dark ? '#0d0d0f' : '#ffffff');
    document.querySelectorAll('.theme-toggle').forEach((b) => b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'));
  };
  const applyTheme = () => {
    if (root.dataset.theme === 'dark') delete root.dataset.theme;
    else root.dataset.theme = 'dark';
    try { localStorage.setItem('theme', root.dataset.theme || 'light'); } catch {}
    syncTheme();
  };
  // The new theme spreads out as a circle from the toggle button (a view transition), where supported
  const toggleTheme = () => {
    const button = document.querySelector('.theme-toggle');
    if (!document.startViewTransition || reduceMotion || !button) { applyTheme(); return; }
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('theme-switching');
    const t = document.startViewTransition(applyTheme);
    t.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 760, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
    t.finished.finally(() => root.classList.remove('theme-switching'));
  };
  document.querySelectorAll('.theme-toggle').forEach((b) => b.addEventListener('click', toggleTheme));
  syncTheme();

  // ---------- Appear animations ----------
  // site.css hides these until .is-in is added. Things visible at load use the CSS stagger;
  // anything revealed later by scrolling plays straight away, staggered within its batch.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('motion');
    const appearing = document.querySelectorAll([
      '.ed-avatar', '.ed-sentence', '.ed-actions', '.ed-facts', '.ed-head', '.ed-body', '.works > li', '.site-foot--home',
      '.cs-head > *', '.cs-cover', '.cs-facts', '.cs-metrics', '.cs-body', '.cs-next', '.who-photos > figure',
    ].join(','));
    const loadedAt = performance.now();
    const onScreen = (node) => {
      const r = node.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    };
    const reveal = new IntersectionObserver((entries) => {
      const late = performance.now() - loadedAt > 900;
      let batch = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        if (late) node.style.setProperty('--delay', `${(batch++ * 0.08).toFixed(2)}s`);
        node.classList.add('is-in');
        reveal.unobserve(node);
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    // Anything already on screen plays its CSS stagger right away; the rest waits to be scrolled to
    appearing.forEach((node) => (onScreen(node) ? node.classList.add('is-in') : reveal.observe(node)));
  }

  // ---------- Toast ----------
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('p');
    toast.className = 'toast';
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  let toastTimer;
  const showToast = (text) => {
    toast.textContent = text;
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 1800);
  };

  // ---------- Copy email ----------
  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(email);
        showToast('Email copied');
      } catch {
        location.href = `mailto:${email}`;
      }
    });
  }

  // ---------- Local time in New York, beside the intro ----------
  const nyTimes = document.querySelectorAll('.ny-time');
  if (nyTimes.length) {
    const fmtNy = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    const tickNy = () => {
      const now = new Date();
      nyTimes.forEach((t) => { t.textContent = fmtNy.format(now); t.dateTime = now.toISOString(); });
    };
    tickNy();
    setInterval(tickNy, 15000);
  }

  document.querySelector('.ed-sentence')?.addEventListener('animationend', (e) => {
    if (e.animationName === 'wipe') e.currentTarget.classList.add('is-wiped');
  });

  // ---------- The sentence's cards ----------
  // CSS opens a card on hover or focus; a tap toggles it (touch screens don't hover), and a card
  // that would run off the right edge shifts left to fit
  const words = [...document.querySelectorAll('.hc-word')];
  const fit = (word) => {
    const card = word.querySelector('.hc');
    if (getComputedStyle(card).position === 'fixed') return;
    card.style.left = '0px';
    const over = card.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
    if (over > 0) card.style.left = `${-over}px`;
  };
  words.forEach((word) => {
    word.addEventListener('pointerenter', () => fit(word));
    word.addEventListener('focus', () => fit(word));
    word.addEventListener('click', (e) => {
      if (e.target.closest('.hc')) return;
      const open = !word.classList.contains('is-open');
      words.forEach((w) => w.classList.remove('is-open'));
      if (open) { fit(word); word.classList.add('is-open'); }
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest?.('.hc-word')) words.forEach((w) => w.classList.remove('is-open')); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { words.forEach((w) => w.classList.remove('is-open')); document.activeElement?.closest?.('.hc-word')?.blur(); } });

  // ---------- Demos: one at a time ----------
  // A tab list: click a demo, or move between them with the arrow, Home and End keys.
  const demoTabs = [...document.querySelectorAll('.demo-picker [role="tab"]')];
  if (demoTabs.length) {
    const select = (tab, focus) => {
      for (const t of demoTabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !on;
      }
      if (focus) tab.focus();
    };
    demoTabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: demoTabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        select(demoTabs[(to + demoTabs.length) % demoTabs.length], true);
      });
    });
  }

  // ---------- Pricer ----------
  if ($('pricer')) {
    const sliders = {
      S: { el: $('s-spot'), out: $('v-spot'), show: (v) => v.toFixed(2), say: (v) => v.toFixed(2) },
      K: { el: $('s-strike'), out: $('v-strike'), show: (v) => v.toFixed(2), say: (v) => v.toFixed(2) },
      days: { el: $('s-days'), out: $('v-days'), show: (v) => `${v}d`, say: (v) => `${v} days` },
      vol: { el: $('s-vol'), out: $('v-vol'), show: (v) => `${v.toFixed(1)}%`, say: (v) => `${v.toFixed(1)} percent` },
      r: { el: $('s-rate'), out: $('v-rate'), show: (v) => minus(`${v.toFixed(2)}%`), say: (v) => `${v.toFixed(2)} percent` },
    };
    const readSliders = () => {
      const values = {};
      for (const [key, s] of Object.entries(sliders)) {
        const v = Number(s.el.value);
        values[key] = v;
        s.out.textContent = s.show(v);
        s.el.setAttribute('aria-valuetext', s.say(v));
        s.el.style.setProperty('--pct', `${((v - Number(s.el.min)) / (Number(s.el.max) - Number(s.el.min))) * 100}%`);
      }
      return values;
    };

    const W = 320, BASE = 100, TOP = 6, X0 = 50, X1 = 150, N = 100;
    const px = (x) => ((x - X0) / (X1 - X0)) * W;
    const drawCurve = (kind, S, K, T, sigma, r, spotValue) => {
      const xs = Array.from({ length: N + 1 }, (_, i) => X0 + ((X1 - X0) * i) / N);
      const value = xs.map((x) => blackScholes(x, K, T, sigma, r)[kind].price);
      const payoff = xs.map((x) => (kind === 'call' ? Math.max(x - K, 0) : Math.max(K - x, 0)));
      const yMax = Math.max(...value, ...payoff) * 1.08 || 1;
      const py = (y) => BASE - (y / yMax) * (BASE - TOP);
      const line = (ys) => ys.map((y, i) => `${i ? 'L' : 'M'}${px(xs[i]).toFixed(1)} ${py(y).toFixed(1)}`).join('');
      const valuePath = line(value);
      $('c-value').setAttribute('d', valuePath);
      $('c-area').setAttribute('d', `${valuePath}L${W} ${BASE}L0 ${BASE}Z`);
      $('c-payoff').setAttribute('d', line(payoff));
      const kx = px(K);
      $('c-strike').setAttribute('x1', kx);
      $('c-strike').setAttribute('x2', kx);
      $('c-strike-label').setAttribute('x', Math.min(Math.max(kx, 24), W - 30));
      $('c-strike-label').textContent = `K ${K}`;
      const sx = px(S), sy = py(spotValue);
      $('c-dot').setAttribute('cx', sx);
      $('c-dot').setAttribute('cy', sy);
      $('c-spot').setAttribute('x1', sx);
      $('c-spot').setAttribute('x2', sx);
      $('c-spot').setAttribute('y1', sy);
    };

    let last = null;
    let flashTimer, announceTimer;
    const update = () => {
      const kind = document.querySelector('input[name="kind"]:checked').value;
      const { S, K, days, vol, r } = readSliders();
      const T = days / 365, sigma = vol / 100, rate = r / 100;
      const res = blackScholes(S, K, T, sigma, rate);
      const leg = res[kind];
      const label = kind === 'call' ? 'Call value' : 'Put value';
      const price = $('q-price');
      const change = $('q-change');

      $('quote-label').textContent = label;
      price.textContent = fmt(leg.price);
      price.classList.remove('is-up', 'is-down');
      change.className = 'change';
      if (last && last.kind === kind) {
        const d = leg.price - last.price;
        if (Math.abs(d) < 5e-5) {
          change.textContent = 'unch';
        } else {
          const dir = d > 0 ? 'is-up' : 'is-down';
          change.textContent = `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}`;
          change.classList.add(dir);
          price.classList.add(dir);
          clearTimeout(flashTimer);
          flashTimer = setTimeout(() => price.classList.remove('is-up', 'is-down'), 500);
        }
      } else {
        change.textContent = 'per share';
      }
      last = { kind, price: leg.price };

      $('g-delta').textContent = fmt(leg.delta);
      $('g-gamma').textContent = fmt(res.gamma);
      $('g-vega').textContent = fmt(res.vega);
      $('g-theta').textContent = fmt(leg.theta);
      $('g-rho').textContent = fmt(leg.rho);
      const err = res.parityError === 0 ? '0' : res.parityError.toExponential(1).replace('e-', 'e−');
      $('parity').innerHTML = `Put–call parity holds to <span class="is-up">${err}</span>.`;

      drawCurve(kind, S, K, T, sigma, rate, leg.price);
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => { $('pricer-status').textContent = `${label} ${fmt(leg.price)}`; }, 600);
    };
    $('pricer').addEventListener('input', update);
    update();
  }

  // ---------- dsa-cli demo ----------
  // Real output from the tool (its README and Valid Anagram's own hints), replayed: each command clears
  // the screen, types itself, then prints line by line. Answers at an interactive prompt are typed too.
  const cli = $('cli-demo');
  if (cli) {
    const screen = cli.querySelector('.cli-screen');
    const buttons = [...cli.querySelectorAll('[data-cmd]')];
    const dim = (t) => `<span class="dim">${t}</span>`;
    const ok = (t) => `<span class="pass">${t}</span>`;
    const bad = (t) => `<span class="fail">${t}</span>`;
    const row = (n, pass, input, expected) => `  ${n}  ${pass ? ok('PASS') : bad('FAIL')}    ${input.padEnd(24)}${expected}`;
    const SESSIONS = {
      run: ['dsa run valid-anagram', [
        '', '  running 6 case(s) for Valid Anagram', '',
        dim('  #  status  input                   expected'),
        row(1, true, '["racecar", "carrace"]', '—'),
        row(2, false, '["jar", "jam"]', 'false'),
        row(3, true, '["", ""]', '—'),
        row(4, true, '["a", "ab"]', '—'),
        row(5, false, '["aacc", "ccac"]', 'false'),
        row(6, true, '["anagram", "nagaram"]', '—'),
        '', `  4/6 tests passed  ${dim('·  target O(n) time, O(1) space')}`,
      ]],
      hint: ['dsa hint valid-anagram', [
        '',
        { box: `<b>hints  1/3</b><span class="n">1.</span> Two strings of different lengths can never be anagrams — check that first.<br><br>${dim('2 more hint(s): dsa hint valid-anagram -n 2')}` },
      ]],
      submit: ['dsa submit valid-anagram', [
        '', `  ${ok('accepted ✓')}`, '',
        `  complexity self-check   ${dim('(blank to skip)')}`,
        { prompt: '  your time complexity: ', answer: 'O(n log n)' },
        { prompt: '  your space complexity: ', answer: 'O(1)' },
        `  time   ${bad('✗')} O(n log n)   ${dim('optimal is O(n)')}`,
        `  space  ${ok('✓')} O(1)`,
        '', `  how did that feel?  ${dim('again · hard · good · easy')}`,
        { prompt: '  grade [good]: ', answer: 'hard' },
        dim('  scheduled for review in 1 day   (ease 2.35, reps 1)'),
      ]],
    };
    let run = 0;   // bumped on every click, so a replay in progress stops when another starts
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const line = (html, cls = 'ln') => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      screen.append(el);
      return el;
    };
    const type = async (el, prefix, text, id, speed) => {
      for (let i = 1; i <= text.length; i++) {
        if (id !== run) return false;
        el.innerHTML = `${prefix}${text.slice(0, i)}<span class="caret"></span>`;
        await wait(speed);
      }
      el.innerHTML = prefix + text;
      return true;
    };
    const play = async (name, animate) => {
      const id = ++run;
      const [command, out] = SESSIONS[name];
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cmd === name)));
      screen.replaceChildren();
      const prompt = `${dim('$')} `;
      if (!animate) {
        line(prompt + command);
        for (const l of out) {
          if (typeof l === 'string') line(l);
          else if (l.box) line(l.box, 'ln cli-box');
          else line(l.prompt + l.answer);
        }
        return;
      }
      if (!(await type(line(''), prompt, command, id, 34))) return;
      await wait(260);
      for (const l of out) {
        if (id !== run) return;
        if (typeof l === 'string') line(l);
        else if (l.box) line(l.box, 'ln cli-box');
        else {
          const el = line(`${l.prompt}<span class="caret"></span>`);
          await wait(420);
          if (!(await type(el, l.prompt, l.answer, id, 70))) return;
          await wait(180);
        }
        await wait(55);
      }
    };
    buttons.forEach((b) => b.addEventListener('click', () => play(b.dataset.cmd, !reduceMotion)));
    play('run', false);   // the page opens on a finished run
  }

  // ---------- Top bar ----------
  // Sticky: it takes a background and a hairline once the page scrolls. On phones the sections fold
  // into a Menu button. On the home page, the link for the section you're reading is underlined.
  const topbar = document.querySelector('.topbar');
  const links = [...document.querySelectorAll('a.nav-link')];
  if (topbar) {
    const onScroll = () => topbar.classList.toggle('is-scrolled', scrollY > 4);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const menu = topbar.querySelector('.tb-menu');
    const setMenu = (open) => {
      topbar.classList.toggle('is-open', open);
      if (!menu) return;
      menu.setAttribute('aria-expanded', String(open));
      menu.querySelector('span').textContent = open ? 'Close' : 'Menu';
    };
    menu?.addEventListener('click', () => setMenu(!topbar.classList.contains('is-open')));
    links.forEach((a) => a.addEventListener('click', () => setMenu(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    document.addEventListener('click', (e) => { if (!topbar.contains(e.target)) setMenu(false); });
  }
  if (document.body.dataset.page === 'home') {
    // Links from the old project popup (#work/NAME) go to that project's page
    const legacy = location.hash.match(/^#work\/([\w-]+)$/);
    if (legacy) location.replace(`work/${legacy[1]}.html`);
    const sections = links.map((a) => (a.hash ? document.querySelector(a.hash) : null));
    const markCurrent = () => {
      const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      let current = -1;
      sections.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top <= innerHeight * 0.35) current = i; });
      if (atBottom) current = sections.map(Boolean).lastIndexOf(true);   // the last section, not the whoami link
      links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    };
    addEventListener('scroll', markCurrent, { passive: true });
    markCurrent();
  }

  // ---------- Project pages: reading progress along the top bar ----------
  if (topbar && document.body.dataset.page === 'work') {
    const progress = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      topbar.style.setProperty('--progress', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
    };
    addEventListener('scroll', progress, { passive: true });
    addEventListener('resize', progress);
    progress();
  }

  // ---------- Project pages: the contents list follows the section you're reading ----------
  const toc = [...document.querySelectorAll('.cs-toc a')];
  if (toc.length) {
    const heads = toc.map((a) => document.querySelector(a.hash));
    const mark = () => {
      let current = 0;
      heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top <= innerHeight * 0.3) current = i; });
      toc.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    };
    addEventListener('scroll', mark, { passive: true });
    mark();
  }

  // ---------- Titles carry across pages (cross-document view transitions) ----------
  const nameTitle = (el, slug) => { if (el) el.style.viewTransitionName = `t-${slug}`; };
  // Leaving: only the clicked project's title is named (in the list, or "Next project"), and the
  // current page's heading gives its name up, so nothing else floats across
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a.work, a.cs-next');
    const slug = a?.getAttribute('href').match(/([\w-]+)\.html$/)?.[1];
    if (!slug) return;
    document.querySelectorAll('.work-t, .cs-next-t').forEach((el) => { el.style.viewTransitionName = ''; });
    document.querySelector('.cs-head h1')?.style.setProperty('view-transition-name', 'none');
    nameTitle(a.querySelector('.work-t, .cs-next-t'), slug);
  });
  // Arriving home from a project: that project's row takes the heading's name, so it glides back
  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition || document.body.dataset.page !== 'home') return;
    const slug = window.navigation?.activation?.from?.url?.match(/\/work\/([\w-]+)\.html/)?.[1];
    if (slug) nameTitle(document.querySelector(`a.work[href="work/${slug}.html"] .work-t`), slug);
  });

  // ---------- Keys: T switches the theme, 1–5 jump to the sections, 6 opens whoami ----------
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); return; }
    const link = links.find((a) => a.dataset.key === e.key);
    if (!link) return;
    e.preventDefault();
    const url = new URL(link.href);
    if (url.pathname !== location.pathname) { location.href = link.href; return; }
    document.querySelector(url.hash)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  });
})();
