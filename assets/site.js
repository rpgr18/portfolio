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
    themeMeta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#0d0d0f' : '#ffffff'));   // whoami has its own paper colour
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
      '.cs-head > *', '.cs-cover', '.cs-facts', '.cs-metrics', '.cs-body', '.cs-next', '.who-head', '.lib > .who-zoom',
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
    // On narrow screens the tabs drop their intros, so the chosen one is shown under the row instead
    const now = document.createElement('p');
    now.className = 'pick-now';
    now.setAttribute('aria-hidden', 'true');
    demoTabs[0].closest('.demo-picker').after(now);
    const select = (tab, focus) => {
      now.textContent = tab.querySelector('.pick-d')?.textContent || '';
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
    select(demoTabs.find((t) => t.getAttribute('aria-selected') === 'true') || demoTabs[0], false);
  }

  // ---------- Demos: a link that opens a demo as you left it ----------
  // ?demo=pricer&type=put&S=105&K=100&days=90&vol=35&r=4.5#demos, or ?demo=cli&cmd=hint#demos.
  // Read before the demos start, so they open on the linked state; "Copy link" writes one.
  const linkQ = new URLSearchParams(location.search);
  const SLIDER_IDS = { S: 's-spot', K: 's-strike', days: 's-days', vol: 's-vol', r: 's-rate' };
  if (linkQ.get('demo') === 'pricer' && $('pricer')) {
    $('tab-pricer')?.click();
    const kind = $(`kind-${linkQ.get('type')}`);
    if (kind) kind.checked = true;
    for (const [k, id] of Object.entries(SLIDER_IDS)) {
      const v = Number(linkQ.get(k));
      if (linkQ.has(k) && Number.isFinite(v)) $(id).value = v;   // a range input clamps to its own min and max
    }
  }
  if (linkQ.get('demo') === 'cli') $('tab-cli')?.click();
  const stage = document.querySelector('.demo-stage');
  if (stage && demoTabs.length) {
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn-copy demo-share';
    share.textContent = 'Copy link';
    stage.append(share);
    share.addEventListener('click', async () => {
      const q = new URLSearchParams();
      if (!$('pricer').hidden) {
        q.set('demo', 'pricer');
        q.set('type', document.querySelector('input[name="kind"]:checked').value);
        for (const [k, id] of Object.entries(SLIDER_IDS)) q.set(k, $(id).value);
      } else {
        q.set('demo', 'cli');
        q.set('problem', document.querySelector('#cli-demo .dsa-pick')?.value || 'valid-anagram');
      }
      const url = `${location.origin}${location.pathname}?${q}#demos`;
      try { await navigator.clipboard.writeText(url); showToast('Link copied'); } catch { history.replaceState(null, '', url); }
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

  // ---------- whoami: rows of photos that fill the width ----------
  // Photos go into a row until it's full at about the target height; the row then ends either there
  // or one photo earlier, whichever lands nearer the target, and is scaled to span the width exactly.
  // The last row keeps the target height rather than stretching. (Without JS, flex does a rougher job.)
  const lib = document.querySelector('.lib');
  if (lib) {
    const items = [...lib.querySelectorAll('.who-zoom')];
    const ratios = items.map((b) => { const i = b.querySelector('img'); return i.getAttribute('width') / i.getAttribute('height'); });
    const justify = () => {
      const W = lib.clientWidth - 0.5, gap = parseFloat(getComputedStyle(lib).columnGap) || 0;
      const target = W < 600 ? W * 0.46 : Math.min(300, Math.max(140, W * 0.21));   // phones: one or two to a row
      const fit = (n, sum) => (W - gap * (n - 1)) / sum;
      const set = (row, h) => row.forEach((i) => { items[i].style.width = `${ratios[i] * h}px`; items[i].style.height = `${h}px`; });
      let row = [], sum = 0;
      items.forEach((_, i) => {
        row.push(i); sum += ratios[i];
        const h = fit(row.length, sum);
        if (h > target) return;
        const before = row.length > 1 ? fit(row.length - 1, sum - ratios[i]) : Infinity;
        if (Math.abs(before - target) < Math.abs(h - target)) { row.pop(); set(row, before); row = [i]; sum = ratios[i]; }
        else { set(row, h); row = []; sum = 0; }
      });
      if (row.length) set(row, Math.min(target, fit(row.length, sum)));
      lib.classList.add('is-justified');
    };
    new ResizeObserver(justify).observe(lib);
  }

  // ---------- whoami: any photo opens full screen ----------
  // The photo lifts out of its place in the rows and glides to full size while the page fades to its
  // own background; closing sends it back to where it came from. Arrow keys, the buttons or a swipe
  // move between photos; Esc, the X or a click beside the photo closes it. Buttons that share a
  // data-i are copies of one photo (a layout may show a photo more than once).
  const zooms = [...document.querySelectorAll('.who-zoom')];
  if (zooms.length) {
    const lb = document.createElement('dialog');
    lb.className = 'lb';
    lb.setAttribute('aria-label', 'Photo, full screen');
    lb.innerHTML = '<div class="lb-bg"></div>'
      + '<div class="lb-bar"><span class="lb-n" aria-live="polite"></span><button class="lb-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button></div>'
      + '<div class="lb-stage"><img alt="" decoding="async"></div>'
      + '<div class="lb-foot"><div class="lb-nav"><button class="lb-prev" type="button" aria-label="Previous photo"><svg aria-hidden="true"><use href="#i-arrow"/></svg></button><button class="lb-next" type="button" aria-label="Next photo"><svg aria-hidden="true"><use href="#i-arrow"/></svg></button></div></div>';
    document.body.append(lb);
    const bg = lb.querySelector('.lb-bg'), big = lb.querySelector('.lb-stage img'), label = lb.querySelector('.lb-n');
    const chrome = [lb.querySelector('.lb-bar'), lb.querySelector('.lb-foot')];
    const keyOf = (z) => z.dataset.i ?? String(zooms.indexOf(z));
    const firsts = new Map();
    zooms.forEach((z) => { if (!firsts.has(keyOf(z))) firsts.set(keyOf(z), z.querySelector('img')); });
    const keys = [...firsts.keys()].sort((a, b) => a - b);
    const thumbs = keys.map((k) => firsts.get(k));
    const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
    let cur = 0, from = null, busy = false;
    const show = (i) => {
      cur = (i + thumbs.length) % thumbs.length;
      const t = thumbs[cur], want = cur;
      big.src = t.currentSrc || t.src;   // the copy the page already has, so it's there at once...
      big.alt = t.alt;
      label.textContent = `${cur + 1} / ${thumbs.length}`;
      const sharp = new Image();         // ...and the sharpest size for the screen once it has loaded
      sharp.sizes = '100vw'; sharp.srcset = t.getAttribute('srcset') || ''; sharp.src = t.getAttribute('src');
      sharp.decode().then(() => { if (cur === want && lb.open) big.src = sharp.currentSrc || sharp.src; }).catch(() => {});
      [cur - 1, cur + 1].forEach((j) => { const n = thumbs[(j + thumbs.length) % thumbs.length]; if (n.loading === 'lazy') n.loading = 'eager'; });
    };
    // The transform that puts the full-screen photo exactly over `el` on the page
    const over = (el) => {
      const a = el.getBoundingClientRect(), b = big.getBoundingClientRect();
      return `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`;
    };
    const fade = (el, from, to, o) => el.animate([{ opacity: from }, { opacity: to }], { easing: 'ease', fill: 'both', ...o });
    const open = async (i, z) => {
      if (busy || lb.open) return;
      busy = true; from = z;
      show(i);
      big.style.opacity = 0;
      lb.showModal();
      const fades = [fade(bg, 0, 1, { duration: 420 }), ...chrome.map((c) => fade(c, 0, 1, { duration: 300, delay: 240 }))];
      await big.decode?.().catch(() => {});
      big.style.opacity = '';
      if (!reduceMotion) {
        z.style.visibility = 'hidden';
        await big.animate([{ transform: over(z) }, { transform: 'none' }], { duration: 620, easing: EASE }).finished.catch(() => {});
        z.style.visibility = '';
      }
      fades.forEach((f) => f.cancel());
      busy = false;
    };
    const close = async () => {
      if (!lb.open || busy) return;
      busy = true;
      const back = from && keyOf(from) === keys[cur] ? from : thumbs[cur].closest('.who-zoom');
      const r = back.getBoundingClientRect(), onScreen = r.bottom > 0 && r.top < innerHeight;
      if (!reduceMotion) {
        chrome.forEach((c) => fade(c, 1, 0, { duration: 160 }));
        fade(bg, 1, 0, { duration: 420, delay: 60 });
        if (onScreen) back.style.visibility = 'hidden';
        const end = onScreen ? [{ transform: 'none' }, { transform: over(back) }] : [{ opacity: 1 }, { opacity: 0, transform: 'translateY(16px) scale(0.97)' }];
        await big.animate(end, { duration: onScreen ? 560 : 300, easing: EASE, fill: 'forwards' }).finished.catch(() => {});
      }
      lb.close();
      back.style.visibility = '';
      [big, bg, ...chrome].forEach((el) => el.getAnimations().forEach((x) => x.cancel()));
      busy = false;
    };
    const step = (d) => {
      if (busy) return;
      show(cur + d);
      if (!reduceMotion) big.animate([{ opacity: 0, transform: `translateX(${d * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
    };
    zooms.forEach((z) => z.addEventListener('click', () => open(keys.indexOf(keyOf(z)), z)));
    lb.querySelector('.lb-x').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', () => step(-1));
    lb.querySelector('.lb-next').addEventListener('click', () => step(1));
    lb.addEventListener('cancel', (e) => { e.preventDefault(); close(); });   // Esc, with the animation
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target === bg || e.target.classList.contains('lb-stage')) close(); });
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    // Swipe sideways on touch screens
    let sx = null;
    lb.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
    lb.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
  }

  // ---------- Command menu: ⌘K (or Ctrl+K, or /) to jump anywhere or run an action ----------
  // Built on first open from one list, so every page offers the same places with the right paths.
  const base = /\/work\//.test(location.pathname) ? '../' : '';
  const EMAIL = 'greene.ry@northeastern.edu';
  const places = [
    ['Work', 'index.html#projects', 'Section', 'projects selected'],
    ['Demos', 'index.html#demos', 'Section', 'live dsa-cli options pricer'],
    ['Experience', 'index.html#experience', 'Section', 'jobs internships flow traders flexcar khoury general dynamics'],
    ['Education', 'index.html#education', 'Section', 'northeastern sydney school'],
    ['Stack', 'index.html#stack', 'Section', 'skills languages tools'],
    ['Contact', 'index.html#contact', 'Section', 'email reach'],
    ['whoami', 'whoami.html', 'Page', 'photos personal about'],
    ['Matching Engine', 'work/matching-engine.html', 'Project', 'c++ order book itch'],
    ['Marine Seismic Deep Learning', 'work/marine-seismic.html', 'Project', 'pytorch cnn faults horizons'],
    ['dsa-cli', 'work/dsa-cli.html', 'Project', 'python neetcode terminal'],
    ['Options Pricing & Greeks Workbench', 'work/options-pricing.html', 'Project', 'black-scholes volatility'],
    ['Portfolio Construction Workbench', 'work/portfolio-optimizer.html', 'Project', 'allocators covariance'],
    ['SurfPy API', 'work/surfpy-api.html', 'Project', 'flask surf forecast noaa'],
    ['Java Paper-Trading Simulator', 'work/papertrade-sim.html', 'Project', 'java stocks swing'],
  ].map(([t, href, kind, k]) => ({ t, kind, k, go: () => { location.href = base + href; } }));
  const actions = [
    { t: 'Copy email', kind: 'Action', k: 'mail address', go: async () => { try { await navigator.clipboard.writeText(EMAIL); showToast('Email copied'); } catch { location.href = 'mailto:' + EMAIL; } } },
    { t: 'Send an email', kind: 'Action', k: 'mail contact', go: () => { location.href = 'mailto:' + EMAIL; } },
    { t: 'Switch theme', kind: 'Action', k: 'dark light mode', go: () => toggleTheme() },
    { t: 'GitHub', kind: 'Link', k: 'code repositories', go: () => window.open('https://github.com/rpgr18', '_blank', 'noopener') },
    { t: 'LinkedIn', kind: 'Link', k: 'profile', go: () => window.open('https://www.linkedin.com/in/rpgr18/', '_blank', 'noopener') },
    { t: 'Print this page', kind: 'Action', k: 'pdf save resume', go: () => setTimeout(() => print(), 50) },
  ];
  const commands = [...places, ...actions];
  let palette = null;
  const openPalette = () => {
    if (!palette) {
      palette = document.createElement('dialog');
      palette.className = 'cmd';
      palette.setAttribute('aria-label', 'Go to');
      palette.innerHTML = '<div class="cmd-box"><input class="cmd-in" type="text" placeholder="Go to a project, section or action" aria-label="Search" aria-controls="cmd-list" aria-autocomplete="list" autocomplete="off" spellcheck="false">'
        + '<ul class="cmd-list" id="cmd-list" role="listbox" aria-label="Results"></ul></div>';
      document.body.append(palette);
      const input = palette.querySelector('.cmd-in'), list = palette.querySelector('.cmd-list');
      let shown = [], cur = 0;
      const render = () => {
        const q = input.value.trim().toLowerCase();
        shown = commands.filter((c) => !q || q.split(/\s+/).every((w) => (c.t + ' ' + c.kind + ' ' + c.k).toLowerCase().includes(w)));
        cur = Math.min(cur, Math.max(0, shown.length - 1));
        list.innerHTML = shown.length ? shown.map((c, i) => `<li role="option" id="cmd-${i}" aria-selected="${i === cur}"><span>${c.t.replace('&', '&amp;')}</span><small>${c.kind}</small></li>`).join('')
          : '<li class="cmd-empty">Nothing matches. Try a project name, or “email”.</li>';
        input.setAttribute('aria-activedescendant', shown.length ? `cmd-${cur}` : '');
        list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      };
      const run = (i) => { const c = shown[i]; if (!c) return; palette.close(); c.go(); };
      input.addEventListener('input', () => { cur = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); render(); }
        if (e.key === 'Enter') { e.preventDefault(); run(cur); }
      });
      list.addEventListener('mousemove', (e) => { const li = e.target.closest('[role="option"]'); if (!li) return; const i = +li.id.slice(4); if (i !== cur) { cur = i; render(); } });
      list.addEventListener('click', (e) => { const li = e.target.closest('[role="option"]'); if (li) run(+li.id.slice(4)); });
      palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });
      palette.render = render;
    }
    if (palette.open) return;
    const input = palette.querySelector('.cmd-in');
    input.value = '';
    palette.render();
    palette.showModal();
    input.focus();
  };
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
    if (((e.metaKey || e.ctrlKey) && k === 'k') || (k === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      if (document.querySelector('.lb[open]')) return;
      e.preventDefault();
      if (palette?.open) palette.close(); else openPalette();
    }
  });
  // A small ⌘K key in the top bar, for people with a keyboard
  const themeBtn = document.querySelector('.topbar .theme-toggle');
  if (themeBtn && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const kbtn = document.createElement('button');
    kbtn.type = 'button';
    kbtn.className = 'tb-btn tb-cmd';
    kbtn.setAttribute('aria-label', 'Go to a project, section or action');
    kbtn.innerHTML = `<kbd>${mac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd>`;
    kbtn.addEventListener('click', openPalette);
    themeBtn.before(kbtn);
  }

  // ---------- Footer: when the site last changed, from its latest commit on GitHub ----------
  const colophon = document.querySelector('.site-foot .colophon');
  if (colophon) {
    const stamp = (iso) => {
      const d = new Date(iso); if (isNaN(d)) return;
      const el = document.createElement('span');
      el.className = 'updated';
      el.textContent = ` · Updated ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
      colophon.append(el);
    };
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('site-updated') || 'null'); } catch {}
    if (cached && Date.now() - cached.at < 6 * 3600e3) stamp(cached.iso);
    else if (location.hostname.endsWith('github.io')) {
      fetch('https://api.github.com/repos/rpgr18/portfolio/commits?per_page=1')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { const iso = j?.[0]?.commit?.committer?.date; if (!iso) return; stamp(iso); try { localStorage.setItem('site-updated', JSON.stringify({ iso, at: Date.now() })); } catch {} })
        .catch(() => {});
    }
  }

  // ---------- Print: open the collapsed "details" so they print, then put them back ----------
  let printOpened = [];
  addEventListener('beforeprint', () => { printOpened = [...document.querySelectorAll('details:not([open])')]; printOpened.forEach((d) => { d.open = true; }); });
  addEventListener('afterprint', () => { printOpened.forEach((d) => { d.open = false; }); printOpened = []; });

  // ---------- Matching engine: race the native numbers in this browser ----------
  // The engine's WebAssembly build replays its benchmark in a worker; the bars share one scale.
  const race = $('race');
  if (race) {
    const btn = race.querySelector('.btn-race');
    const note = race.querySelector('.race-note');
    const rows = [...race.querySelectorAll('.race-bars li')];
    const you = (k) => race.querySelector(`[data-race="${k}"]`);
    const scale = () => {
      const max = Math.max(...rows.map((li) => Number(li.style.getPropertyValue('--v')) || 0));
      rows.forEach((li) => li.style.setProperty('--max', max));
    };
    scale();
    const int = (n) => Math.round(n).toLocaleString('en-US');
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Running…';
      race.classList.add('is-running');
      for (const k of ['dense', 'map']) { you(k).style.removeProperty('--v'); you(k).querySelector('.race-v').textContent = '–'; }
      scale();
      const src = document.querySelector('script[src*="site.js"]').src;
      const worker = new Worker(new URL('lob/race-worker.js', src), { type: 'module' });
      const done = (text) => {
        note.textContent = text;
        btn.disabled = false;
        btn.textContent = 'Run it again';
        race.classList.remove('is-running');
        worker.terminate();
      };
      worker.onmessage = ({ data }) => {
        if (data.phase === 'dense') note.textContent = 'Generating a million requests, then replaying them through the dense ladder…';
        if (data.phase === 'map') note.textContent = 'Now the same requests through std::map and unordered_map…';
        if (data.phase === 'error') done(`The benchmark couldn’t run here: ${data.message}`);
        if (data.phase !== 'done') return;
        const rate = (ms) => data.n / ms / 1000;   // million requests a second
        const a = rate(data.denseMs), b = rate(data.mapMs);
        [['dense', a], ['map', b]].forEach(([k, v]) => {
          you(k).style.setProperty('--v', v.toFixed(2));
          you(k).querySelector('.race-v').textContent = `${v.toFixed(1)}M/s`;
        });
        scale();
        const pct = Math.round((a / 56.2) * 100);
        done(`${a.toFixed(1)}M requests a second here, ${pct}% of the M2 running natively, and ${(a / b).toFixed(1)}× faster than std::map in this browser (3.1× natively). ` +
          (data.agree ? `Both designs made the same ${int(data.trades)} trades.` : 'The two designs disagreed on the trades, which would be a bug.'));
      };
      worker.onerror = (e) => { e.preventDefault(); done('The benchmark couldn’t run in this browser.'); };
      worker.postMessage({ requests: Number(race.dataset.requests), reps: Number(race.dataset.reps) });
    });
  }

  // ---------- Options pricing: rotatable 3-D surfaces ----------
  // Implied vol from the four fits and the true surface, and three Greeks, all precomputed by the
  // project's own Python (optlib) into one JSON file. Drawn on a 2-D canvas: a grid of quads projected
  // with an orthographic camera and painted back to front. Drag or the arrow keys rotate it; pointing
  // at (or tapping) the surface reads the value there. Nothing moves on its own.
  const surfBoxes = [$('vol-surface'), $('greek-surface')].filter(Boolean);
  if (surfBoxes.length) {
    const sources = {};
    const load = (url) => (sources[url] ||= fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
    const minusSign = (s) => s.replace('-', '−');
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const rgbOf = (c) => {
      if (c.startsWith('#')) {
        const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1, 7);
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      }
      const m = c.match(/[\d.]+/g);
      return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
    };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const rgb = (c, f = 1) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v * f)))).join(' ')})`;
    const niceStep = (span, n) => {
      const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
      return p * (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10);
    };
    const ticks = (lo, hi, n) => {
      const s = niceStep(hi - lo, n), out = [];
      for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + 1e-9; v += s) out.push(Math.abs(v) < s * 1e-6 ? 0 : v);
      return { s, out };
    };
    const decimals = (s) => Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
    const days = (T) => `${Math.round(T * 365)} days`;

    // What each box shows, keyed by its seg buttons' data-set
    const VOL_NAMES = { svi: 'Raw SVI', ssvi: 'SSVI', cubic: 'Cubic spline', rbf: 'Thin-plate RBF', truth: 'True surface' };
    const specs = {
      'vol-surface': (d) => {
        const v = d.vol;
        const zt = ticks(v.zmin, v.zmax, 4);
        return {
          grid: v, nu: v.nu,
          sets: Object.fromEntries(Object.entries(v.z).map(([k, z]) => [k, { z, zlo: Math.floor(v.zmin / zt.s) * zt.s, zhi: Math.ceil(v.zmax / zt.s) * zt.s }])),
          xName: 'ln(K/F)', yName: 'years to expiry', zName: () => 'implied vol, %',
          xFmt: (x, s) => minusSign(x.toFixed(decimals(s))), zFmt: (z, s) => z.toFixed(decimals(s)),
          aria: (k) => `3-D implied volatility surface, ${VOL_NAMES[k]}, over log-moneyness and expiry. Arrow keys rotate it.`,
          read: (k, T, z, key) => {
            const strike = v.spot * Math.exp((v.r - v.q) * T + k);
            return `ln(K/F) ${minusSign(k.toFixed(2))}, strike ${strike.toFixed(1)}, ${days(T)}: ${key === 'truth' ? 'true vol' : 'implied vol'} ${z.toFixed(1)}%`;
          },
          note: (key) => {
            if (key === 'truth') return `The SSVI surface the ${v.n_quotes} quotes were generated from.`;
            const f = v.fits[key];
            return `${VOL_NAMES[key]}: ${f.truth_rmse.toFixed(2)} vol points from the true surface, ${f.holdout_rmse.toFixed(2)} on held-out strikes. ` +
              (f.butterfly_ok && f.calendar_ok ? 'Arbitrage-free.' : 'Admits arbitrage.');
          },
        };
      },
      'greek-surface': (d) => {
        const g = d.greeks, c = g.contract;
        return {
          grid: g, nu: g.nu,
          sets: Object.fromEntries(Object.entries(g.sets).map(([k, s]) => {
            const t = ticks(s.zmin, s.zmax, 4);
            return [k, { z: s.z, unit: s.unit, zlo: Math.floor(s.zmin / t.s) * t.s, zhi: Math.ceil(s.zmax / t.s) * t.s }];
          })),
          xName: 'strike', yName: 'years to expiry', zName: (key) => key,
          xFmt: (x) => x.toFixed(0), zFmt: (z, s) => minusSign(z.toFixed(decimals(s))),
          aria: (k) => `3-D surface of a call’s ${k} over strike and expiry. Arrow keys rotate it.`,
          read: (K, T, z, key) => `strike ${K.toFixed(1)}, ${days(T)}: ${key} ${minusSign(z.toFixed(key === 'gamma' ? 4 : 3))}`,
          note: (key, set) => `A call’s ${key}, ${set.unit}, at spot ${c.S}, vol ${c.sigma * 100}%, r ${(c.r * 100).toFixed(1)}%, q ${c.q * 100}%.`,
        };
      },
    };

    const mountSurface = (box, spec) => {
      const canvas = box.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const readEl = box.querySelector('.vsurf-read');
      const noteEl = box.querySelector('.vsurf-note');
      const buttons = [...box.querySelectorAll('.seg button')];
      const touchOnly = matchMedia('(hover: none)').matches;
      const idle = touchOnly ? 'Drag sideways to rotate. Tap the surface to read a value.' : 'Drag to rotate, or use the arrow keys. Point at the surface to read a value.';
      const { grid, nu } = spec;
      const nT = grid.T.length;
      const xLo = Math.min(...grid.klo), xHi = Math.max(...grid.khi), yHi = grid.T[nT - 1];
      const xAt = (j, i) => grid.klo[j] + (grid.khi[j] - grid.klo[j]) * (i / (nu - 1));
      // World coordinates: x and y in [-1, 1], height in [0, ZH]
      const ZH = 1.05;
      const X = (x) => 2 * (x - xLo) / (xHi - xLo) - 1;
      const Y = (T) => 2 * T / yHi - 1;
      let key = buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.set || Object.keys(spec.sets)[0];
      const PITCH0 = 0.46;   // the default view: a little above, from the front left
      let yaw = -0.62, pitch = PITCH0;
      let W = 0, H = 0, lastDpr = 0, view = null, quads = [], verts = null, hover = null, colors = null, raf = 0;

      const readTokens = () => {
        const card = rgbOf(css('--card') || '#fafafa'), ink = rgbOf(css('--text') || '#171717');
        const dark = document.documentElement.dataset.theme === 'dark';
        colors = {
          lo: mix(card, ink, dark ? 0.2 : 0.1), hi: mix(card, ink, dark ? 0.92 : 0.78), bg: rgbOf(css('--bg') || '#fff'),
          line: css('--line'), line2: css('--line-2'), muted: css('--muted'), text2: css('--text-2'), strong: css('--strong'),
          mono: css('--mono') || 'ui-monospace, monospace',
        };
      };

      const project = (x, y, z) => {
        const { cy, cx, s, cos, sin, cp, sp } = view;
        const xr = x * cos - y * sin, yr = x * sin + y * cos;
        return [cx + s * xr, cy - s * (z * cp + yr * sp), yr * cp - z * sp];
      };

      const margins = (w) => (w < 420 ? { x: 26, t: 26, b: 36 } : { x: 46, t: 30, b: 46 });
      const layout = () => {
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const { x: mx, t: mt, b: mb } = margins(W);
        const top = ZH * cp + Math.SQRT2 * sp, span = ZH * cp + 2 * Math.SQRT2 * sp;
        const s = Math.min((W - 2 * mx) / (2 * Math.SQRT2), (H - mt - mb) / span);
        const extra = (H - mt - mb) - s * span;
        view = { cx: W / 2, cy: mt + extra / 2 + s * top, s, cos: Math.cos(yaw), sin: Math.sin(yaw), cp, sp };
      };

      const build = () => {
        const set = spec.sets[key];
        const zOf = (z) => ZH * (z - set.zlo) / (set.zhi - set.zlo);
        verts = new Float64Array(nT * nu * 4);   // screen x, screen y, depth, value
        for (let j = 0; j < nT; j++) {
          for (let i = 0; i < nu; i++) {
            const z = set.z[j][i], p = project(X(xAt(j, i)), Y(grid.T[j]), zOf(z)), o = (j * nu + i) * 4;
            verts[o] = p[0]; verts[o + 1] = p[1]; verts[o + 2] = p[2]; verts[o + 3] = z;
          }
        }
        // A fixed light up and to the front-left, so turning the surface changes which faces catch it
        const L = [-0.35, -0.55, 0.76];
        quads = [];
        for (let j = 0; j < nT - 1; j++) {
          for (let i = 0; i < nu - 1; i++) {
            const a = j * nu + i, b = a + 1, c = a + nu + 1, d = a + nu;
            const x0 = X(xAt(j, i)), x1 = X(xAt(j, i + 1)), x3 = X(xAt(j + 1, i));
            const y0 = Y(grid.T[j]), y3 = Y(grid.T[j + 1]);
            const z0 = zOf(set.z[j][i]), z1 = zOf(set.z[j][i + 1]), z3 = zOf(set.z[j + 1][i]);
            const u = [x1 - x0, 0, z1 - z0], v = [x3 - x0, y3 - y0, z3 - z0];
            const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const len = Math.hypot(...n) || 1;
            const lit = Math.abs((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / len);
            const depth = (verts[a * 4 + 2] + verts[b * 4 + 2] + verts[c * 4 + 2] + verts[d * 4 + 2]) / 4;
            const t = ((set.z[j][i] + set.z[j][i + 1] + set.z[j + 1][i] + set.z[j + 1][i + 1]) / 4 - set.zlo) / (set.zhi - set.zlo);
            quads.push({ j, i, a, b, c, d, depth, t, lit });
          }
        }
        quads.sort((p, q) => q.depth - p.depth);
        quads.forEach((q, k) => { q.order = k; });
      };

      // Labels are kept inside the canvas, however the box is turned
      const text = (s, x, y, align, base, color) => {
        const w = ctx.measureText(s).width;
        const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = base;
        ctx.fillText(s, Math.max(3, Math.min(W - w - 3, left)), y);
      };
      // Place a label beside a world point, pushed outward along a world direction
      const labelAt = (wx, wy, wz, ox, oy, s, color, gap = 0.1) => {
        const p = project(wx + ox * gap, wy + oy * gap, wz), q = project(wx, wy, wz);
        const dx = p[0] - q[0], dy = p[1] - q[1], m = Math.hypot(dx, dy) || 1;
        const align = dx / m > 0.35 ? 'left' : dx / m < -0.35 ? 'right' : 'center';
        const base = dy / m > 0.35 ? 'top' : dy / m < -0.35 ? 'bottom' : 'middle';
        text(s, p[0], p[1], align, base, color);
      };

      const draw = () => {
        raf = 0;
        if (!W) return;
        const set = spec.sets[key];
        layout(); build();
        ctx.clearRect(0, 0, W, H);
        ctx.lineJoin = 'round';
        const small = W < 420;
        ctx.font = `400 ${small ? 10 : 11}px ${colors.mono}`;
        const zOf = (z) => ZH * (z - set.zlo) / (set.zhi - set.zlo);
        const line = (pts, color, width) => {
          ctx.beginPath();
          pts.forEach((p, k) => { const q = project(...p); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
          ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        };
        const xt = ticks(xLo, xHi, small ? 4 : 6), yt = ticks(0, yHi, 4), zt = ticks(set.zlo, set.zhi, 4);

        // Floor grid, then the two walls that face away from the viewer, with height gridlines
        xt.out.forEach((x) => line([[X(x), -1, 0], [X(x), 1, 0]], colors.line, 1));
        yt.out.forEach((T) => line([[-1, Y(T), 0], [1, Y(T), 0]], colors.line, 1));
        line([[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 0]], colors.line2, 1);
        const walls = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([nx, ny]) => (nx * view.sin + ny * view.cos) > 0);
        walls.forEach(([nx, ny]) => {
          const e = nx ? [[nx, -1], [nx, 1]] : [[-1, ny], [1, ny]];
          zt.out.forEach((z) => line([[...e[0], zOf(z)], [...e[1], zOf(z)]], colors.line, 1));
          line([[...e[0], 0], [...e[0], ZH], [...e[1], ZH], [...e[1], 0]], colors.line, 1);
        });

        // The surface, back to front. Each quad is stroked in a lighter (or, in the dark theme, darker)
        // tone of its own fill: that draws the mesh and closes the antialiasing seams between quads.
        for (const q of quads) {
          const c = mix(colors.lo, colors.hi, Math.max(0, Math.min(1, q.t)));
          const f = 0.6 + 0.4 * q.lit;
          ctx.beginPath();
          for (const [k, idx] of [q.a, q.b, q.c, q.d].entries()) {
            const x = verts[idx * 4], y = verts[idx * 4 + 1];
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = rgb(c, f); ctx.fill();
          ctx.strokeStyle = rgb(mix(c, colors.bg, 0.42), f); ctx.lineWidth = 0.6; ctx.stroke();
        }

        // The slice under the pointer (one expiry's smile), drawn on top: a segment is kept only where
        // the front-most quad at its midpoint is one of the two it borders, so hidden stretches stay hidden
        if (hover) {
          const r = hover.row;
          ctx.beginPath();
          let open = false;
          for (let i = 0; i < nu - 1; i++) {
            const p0 = (r * nu + i) * 4, p1 = p0 + 4;
            const hit = frontQuad((verts[p0] + verts[p1]) / 2, (verts[p0 + 1] + verts[p1 + 1]) / 2);
            const seen = hit && Math.abs(hit.q.i - i) <= 1 && (hit.q.j === r || hit.q.j === r - 1);
            if (!seen) { open = false; continue; }
            if (!open) ctx.moveTo(verts[p0], verts[p0 + 1]);
            ctx.lineTo(verts[p1], verts[p1 + 1]);
            open = true;
          }
          ctx.strokeStyle = colors.strong; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
        }

        // Tick labels: x along the nearer y-edge, y along the nearer x-edge, z up the leftmost corner
        const nearY = project(0, -1, 0)[2] < project(0, 1, 0)[2] ? -1 : 1;
        const nearX = project(-1, 0, 0)[2] < project(1, 0, 0)[2] ? -1 : 1;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        const [zx, zy] = corners.reduce((best, c) => (project(c[0], c[1], 0)[0] < project(best[0], best[1], 0)[0] ? c : best));
        // Leave out a floor tick that would sit on the height axis's own labels
        const clear = (wx, wy) => Math.hypot(wx - zx, wy - zy) > 0.12;
        xt.out.forEach((x) => clear(X(x), nearY) && labelAt(X(x), nearY, 0, 0, nearY, spec.xFmt(x, xt.s), colors.muted));
        // Expiry ticks carry their unit ("0.5y"), so the axis title can go when space is short
        yt.out.forEach((T) => clear(nearX, Y(T)) && labelAt(nearX, Y(T), 0, nearX, 0, `${+T.toFixed(decimals(yt.s))}y`, colors.muted));
        // Axis titles sit between the two middle ticks, never on one
        const between = (t) => { const m = Math.floor(t.length / 2); return (t[m - 1] + t[m]) / 2; };
        labelAt(X(between(xt.out)), nearY, 0, 0, nearY, spec.xName, colors.text2, small ? 0.36 : 0.32);
        if (W >= 560) labelAt(nearX, Y(between(yt.out)), 0, nearX, 0, spec.yName, colors.text2, 0.34);
        line([[zx, zy, 0], [zx, zy, ZH]], colors.line2, 1);
        zt.out.forEach((z) => { const p = project(zx, zy, zOf(z)); text(spec.zFmt(z, zt.s), p[0] - 6, p[1], 'right', 'middle', colors.muted); });
        const top = project(zx, zy, ZH);
        const zw = ctx.measureText(spec.zName(key)).width;
        text(spec.zName(key), Math.max(4, Math.min(W - zw - 4, top[0] - zw / 2)), top[1] - 10, 'left', 'bottom', colors.text2);

        if (hover) {
          const p = project(hover.wx, hover.wy, zOf(hover.z));
          ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7);
          ctx.fillStyle = colors.strong; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = rgb(colors.bg); ctx.stroke();
        }
      };
      const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

      // The front-most quad under (mx, my), and the values there by barycentric interpolation
      const frontQuad = (mx, my) => {
        for (let k = quads.length - 1; k >= 0; k--) {
          const q = quads[k];
          for (const tri of [[q.a, q.b, q.c], [q.a, q.c, q.d]]) {
            const [p0, p1, p2] = tri.map((idx) => [verts[idx * 4], verts[idx * 4 + 1]]);
            const det = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
            if (Math.abs(det) < 1e-9) continue;
            const l0 = ((p1[1] - p2[1]) * (mx - p2[0]) + (p2[0] - p1[0]) * (my - p2[1])) / det;
            const l1 = ((p2[1] - p0[1]) * (mx - p2[0]) + (p0[0] - p2[0]) * (my - p2[1])) / det;
            const l2 = 1 - l0 - l1;
            if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
            return { q, tri, l: [l0, l1, l2] };
          }
        }
        return null;
      };
      const pick = (mx, my) => {
        const hit = quads.length && frontQuad(mx, my);
        if (!hit) return null;
        const at = (idx) => { const j = Math.floor(idx / nu), i = idx % nu; return [xAt(j, i), grid.T[j], verts[idx * 4 + 3], j]; };
        const P = hit.tri.map(at);
        const val = (n) => hit.l[0] * P[0][n] + hit.l[1] * P[1][n] + hit.l[2] * P[2][n];
        const x = val(0), T = val(1);
        return { x, T, z: val(2), wx: X(x), wy: Y(T), row: Math.round(val(3)) };
      };
      const setHover = (h) => {
        hover = h;
        readEl.textContent = h ? spec.read(h.x, h.T, h.z, key) : idle;
        redraw();
      };

      const select = (k) => {
        key = k;
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === k)));
        canvas.setAttribute('aria-label', spec.aria(k));
        noteEl.textContent = spec.note(k, spec.sets[k]);
        if (hover && lastPt) { draw(); setHover(pick(...lastPt)); } else redraw();
      };
      buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.set)));

      // Drag to rotate (sideways only on touch, so the page still scrolls); a tap or a still pointer reads
      let drag = null, lastPt = null;
      const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false, id: e.pointerId };
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (drag && drag.id === e.pointerId) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (!drag.moved && Math.hypot(dx, dy) < 4) return;
          drag.moved = true;
          yaw = drag.yaw - dx * 0.01;
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') pitch = Math.max(0.08, Math.min(1.3, drag.pitch + dy * 0.008));
          if (hover) setHover(null); else redraw();
          return;
        }
        if (e.pointerType === 'mouse') { lastPt = local(e); setHover(pick(...lastPt)); }
      });
      const end = (e) => {
        if (!drag || drag.id !== e.pointerId) return;
        const tapped = !drag.moved && e.type === 'pointerup';
        drag = null;
        if (tapped) { lastPt = local(e); setHover(pick(...lastPt)); }
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) setHover(null); });
      canvas.addEventListener('keydown', (e) => {
        const turn = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
        if (!turn) return;
        e.preventDefault();
        yaw += turn[0];
        pitch = Math.max(0.08, Math.min(1.3, pitch + turn[1]));
        if (hover) setHover(null); else redraw();
      });

      // Crisp at any pixel ratio; the height follows the width
      const resize = () => {
        const w = canvas.parentElement.clientWidth;
        if (!w) return;
        // As tall as the box needs at the default tilt when it fills the width, within limits
        const m = margins(w), span = ZH * Math.cos(PITCH0) + 2 * Math.SQRT2 * Math.sin(PITCH0);
        const h = Math.round(Math.max(240, Math.min(460, m.t + m.b + span * (w - 2 * m.x) / (2 * Math.SQRT2))));
        const dpr = window.devicePixelRatio || 1;
        if (w === W && h === H && dpr === lastDpr) return;
        W = w; H = h; lastDpr = dpr;
        canvas.style.height = `${h}px`;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (hover) setHover(null);
        draw();
      };
      readTokens();
      new ResizeObserver(resize).observe(canvas.parentElement);
      // Colours come from the site's tokens, so follow the theme toggle
      new MutationObserver(() => { readTokens(); redraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      document.fonts?.ready.then(redraw);
      readEl.textContent = idle;
      select(key);
      box.classList.add('is-ready');
    };

    const start = (box) => load(box.dataset.src).then((d) => mountSurface(box, specs[box.id](d))).catch(() => {
      box.querySelector('.vsurf-read').textContent = 'The surface couldn’t load.';
    });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { io.unobserve(en.target); start(en.target); }
      }), { rootMargin: '600px 0px' });
      surfBoxes.forEach((b) => io.observe(b));
    } else surfBoxes.forEach(start);
  }

  // ---------- Project pages: whether the project's tests pass on main right now ----------
  // From the latest finished CI run on GitHub, cached for six hours so visitors stay well under
  // the API's rate limit. Says nothing if GitHub can't be reached.
  document.querySelectorAll('[data-ci]').forEach(async (el) => {
    const [repo, workflow] = el.dataset.ci.split(' ');
    const key = `ci:${repo}`;
    let run;
    try { const c = JSON.parse(localStorage.getItem(key)); if (c && Date.now() - c.at < 6 * 3600e3) run = c.run; } catch {}
    if (!run) {
      try {
        const r = await fetch(`https://api.github.com/repos/rpgr18/${repo}/actions/workflows/${workflow}/runs?branch=main&status=completed&per_page=1`);
        const latest = r.ok && (await r.json()).workflow_runs?.[0];
        if (!latest) return;
        run = { ok: latest.conclusion === 'success', url: latest.html_url, when: latest.updated_at };
        try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), run })); } catch {}
      } catch { return; }
    }
    const when = new Date(run.when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const a = document.createElement('a');
    a.href = run.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = run.ok ? `Tests pass on main as of the last run, ${when}.` : `The last test run on main, ${when}, failed.`;
    el.replaceChildren(a);
  });

  // ---------- Portfolio optimizer: the estimated frontier against what its portfolios deliver ----------
  // Every number comes from frontier.json, written by gen_frontier.py with the project's own code.
  // Uses $, minus and reduceMotion from the top of this file.
  const fx = $('frontier-fig');
  if (fx) {
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs, parent) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      parent?.append(e);
      return e;
    };
    const hl = (tag, cls, text, parent) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      parent?.append(e);
      return e;
    };
    const pct = (x, d = 1) => minus(`${(Math.abs(x) < 0.5 * 10 ** -(d + 2) ? 0 : x * 100).toFixed(d)}%`);
    const pts = (x, d) => minus(`${(Math.abs(x) < 0.5 * 10 ** -(d + 2) ? 0 : x * 100).toFixed(d)} pts`);
    const sharpe = (x) => (x == null ? '–' : minus(x.toFixed(2)));
    const sci = (x) => (x == null ? '' : x.toExponential(1));

    const build = (d) => {
      const st = { cov: 'ledoit_wolf', mean: 'sample', sel: 'max_sharpe', hover: null };
      const conf = () => d.configs.find((c) => c.cov === st.cov && c.mean === st.mean);
      const keys = Object.keys(d.allocators);
      const cap = fx.querySelector('figcaption');
      const add = (node) => fx.insertBefore(node, cap);

      // Controls: two segmented groups
      const controls = hl('div', 'fx-controls');
      const seg = (label, opts, key) => {
        const wrap = hl('div', 'fx-ctl', null, controls);
        const l = hl('span', 'fx-ctl-l', label, wrap);
        l.id = `fx-${key}-l`;
        const g = hl('div', `seg seg-${opts.length}`, null, wrap);
        g.setAttribute('role', 'group');
        g.setAttribute('aria-labelledby', l.id);
        for (const [v, text] of opts) {
          const b = hl('button', null, text, g);
          b.type = 'button';
          b.dataset.v = v;
          b.setAttribute('aria-pressed', String(st[key] === v));
          b.addEventListener('click', () => {
            if (st[key] === v) return;
            st[key] = v;
            g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            update(true);
          });
        }
      };
      seg('Covariance', Object.entries(d.estimators), 'cov');
      seg('Returns', [['sample', 'Sample mean'], ['true', 'True']], 'mean');
      add(controls);

      // Chart
      const plot = hl('div', 'fx-plot');
      const svg = sv('svg', { role: 'group', 'aria-label': 'Efficient frontier: return against risk' }, plot);
      const gStatic = sv('g', {}, svg);
      const gCurves = sv('g', {}, svg);
      const truePath = sv('path', { class: 'fx-true' }, gCurves);
      const estPath = sv('path', { class: 'fx-est' }, gCurves);
      const realPath = sv('path', { class: 'fx-real' }, gCurves);
      const gPts = sv('g', {}, svg);
      const marks = {};
      for (const k of keys) {
        const g = sv('g', { class: 'fx-pt', tabindex: k === st.sel ? '0' : '-1', role: 'button' }, gPts);
        marks[k] = {
          g,
          link: sv('line', { class: 'fx-link' }, g),
          e: sv('circle', { class: 'fx-pe', r: 3.5 }, g),
          t: sv('circle', { class: 'fx-pr', r: 4 }, g),
          ring: sv('circle', { class: 'fx-ring', r: 9 }, g),
        };
      }
      const label = sv('text', { class: 'fx-lab', 'aria-hidden': 'true' }, svg);
      add(plot);

      // Legend: line plus marker, as drawn
      const key = hl('ul', 'fx-key');
      const swatch = (li, line, dot) => {
        const s = sv('svg', { width: 26, height: 10, viewBox: '0 0 26 10', 'aria-hidden': 'true' });
        sv('line', { class: line, x1: 1, y1: 5, x2: 25, y2: 5 }, s);
        if (dot) sv('circle', { class: dot, cx: 13, cy: 5, r: dot === 'fx-pr' ? 3.5 : 3 }, s);
        li.prepend(s);
      };
      [['True frontier', 'fx-true'], ['Estimated', 'fx-est', 'fx-pe'], ['Realized', 'fx-real', 'fx-pr']]
        .forEach(([t, line, dot]) => swatch(hl('li', null, t, key), line, dot));
      add(key);

      // Summary of the gap, for the chosen inputs
      const stats = hl('dl', 'fx-stats');
      const stat = (t) => { const w = hl('div', null, null, stats); hl('dt', null, t, w); return hl('dd', null, '', w); };
      const sOver = stat('Return overstated');
      const sRisk = stat('Risk misstated');
      const sShort = stat('Below true frontier');
      const sKkt = stat('Worst KKT residual');
      add(stats);

      // The selected allocator: its numbers and weights
      const det = hl('div', 'fx-detail');
      const dHead = hl('div', 'fx-d-head', null, det);
      const dName = hl('span', 'fx-name', '', dHead);
      const dKkt = hl('span', 'fx-d-kkt', '', dHead);
      const nums = hl('table', 'fx-nums', null, det);
      const hr = hl('tr', null, null, hl('thead', null, null, nums));
      ['', 'Estimated', 'Realized'].forEach((t) => hl('th', null, t, hr));
      const tb = hl('tbody', null, null, nums);
      const row = (t) => { const r = hl('tr', null, null, tb); hl('th', null, t, r); return [hl('td', null, '', r), hl('td', null, '', r)]; };
      const nRet = row('Return');
      const nRisk = row('Risk');
      const nSh = row('Sharpe');
      const wl = hl('ul', 'fx-w', null, det);
      wl.setAttribute('aria-label', 'Weights');
      const wmax = Math.max(...d.configs.flatMap((c) => c.alloc.flatMap((a) => a.w)));
      const wRows = d.assets.map((name) => {
        const li = hl('li', null, null, wl);
        hl('span', 'fx-w-n', name, li);
        const bar = hl('span', 'fx-w-b', null, hl('span', 'fx-w-t', null, li));
        return { li, bar, val: hl('span', 'fx-w-v', '', li) };
      });
      add(det);

      // The same numbers as a table, for screen readers
      const tblWrap = hl('div', 'sr-only');   // on a wrapper: a table ignores the 1px width and would widen the page
      const tbl = hl('table', null, null, tblWrap);
      const tCap = hl('caption', null, '', tbl);
      const th = hl('tr', null, null, hl('thead', null, null, tbl));
      ['Allocator', 'Estimated return', 'Estimated risk', 'Realized return', 'Realized risk'].forEach((t) => hl('th', null, t, th));
      const tBody = hl('tbody', null, null, tbl);
      add(tblWrap);

      // Scales: fixed across every input, so switching moves the data and not the axes
      const all = d.configs.flatMap((c) => [...c.est.v, ...c.real.v, ...c.alloc.flatMap((a) => [a.e[0], a.t[0]])]).concat(d.true.v);
      const allR = d.configs.flatMap((c) => [...c.est.r, ...c.real.r, ...c.alloc.flatMap((a) => [a.e[1], a.t[1]])]).concat(d.true.r);
      const step = 0.05;
      const xMax = Math.max(...all) * 1.04;
      const yMin = Math.min(0, Math.floor(Math.min(...allR) / step) * step);
      const yMax = Math.max(...allR) * 1.06;
      let W = 0, H = 0, M = null;
      const X = (v) => M.l + (v / xMax) * (W - M.l - M.r);
      const Y = (r) => H - M.b - ((r - yMin) / (yMax - yMin)) * (H - M.t - M.b);
      const line = (p) => p.map(([v, r], i) => `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(r).toFixed(1)}`).join('');
      const zip = (o) => o.v.map((v, i) => [v, o.r[i]]);

      const layout = () => {
        W = Math.round(plot.clientWidth);
        if (!W) return false;
        H = Math.round(Math.min(420, Math.max(300, W * (W < 480 ? 0.9 : 0.62))));
        M = { l: 38, r: 10, t: 26, b: 40 };
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('width', W);
        svg.setAttribute('height', H);
        gStatic.replaceChildren();
        const grid = sv('g', { class: 'fx-grid' }, gStatic);
        const ax = sv('g', { class: 'fx-axis', 'aria-hidden': 'true' }, gStatic);
        const tickStep = W < 480 ? 0.1 : step;
        for (let r = yMin; r <= yMax + 1e-9; r += step) {
          sv('line', { x1: M.l, x2: W - M.r, y1: Y(r), y2: Y(r) }, grid);
          sv('text', { x: M.l - 8, y: Y(r) + 4, 'text-anchor': 'end' }, ax).textContent = pct(r, 0);
        }
        for (let v = 0; v <= xMax + 1e-9; v += tickStep) {
          sv('line', { class: 'fx-tick', x1: X(v), x2: X(v), y1: H - M.b, y2: H - M.b + 4 }, grid);
          sv('text', { x: X(v), y: H - M.b + 17, 'text-anchor': 'middle' }, ax).textContent = pct(v, 0);
        }
        sv('line', { class: 'fx-base', x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }, grid);
        sv('text', { class: 'fx-axis-t', x: 0, y: 12 }, ax).textContent = 'Return, annualized';
        sv('text', { class: 'fx-axis-t', x: W - M.r, y: H - 4, 'text-anchor': 'end' }, ax).textContent = 'Risk, annualized volatility';
        truePath.setAttribute('d', line(zip(d.true)));
        return true;
      };

      // Frames: what is drawn, so a switch can tween from whatever is on screen
      const frameOf = (c) => ({
        est: zip(c.est), real: zip(c.real),
        pts: Object.fromEntries(c.alloc.map((a) => [a.k, { e: a.e, t: a.t }])),
      });
      const resample = (p, n) => Array.from({ length: n }, (_, i) => {
        const f = (i / (n - 1)) * (p.length - 1), j = Math.min(Math.floor(f), p.length - 2), u = f - j;
        return [p[j][0] + (p[j + 1][0] - p[j][0]) * u, p[j][1] + (p[j + 1][1] - p[j][1]) * u];
      });
      const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      let shown = null, raf = 0;

      const active = () => st.hover || st.sel;
      const paint = (f) => {
        shown = f;
        if (!M) return;
        estPath.setAttribute('d', line(f.est));
        realPath.setAttribute('d', line(f.real));
        for (const k of keys) {
          const m = marks[k], p = f.pts[k];
          const ex = X(p.e[0]), ey = Y(p.e[1]), tx = X(p.t[0]), ty = Y(p.t[1]);
          m.link.setAttribute('x1', ex); m.link.setAttribute('y1', ey);
          m.link.setAttribute('x2', tx); m.link.setAttribute('y2', ty);
          m.e.setAttribute('cx', ex); m.e.setAttribute('cy', ey);
          m.t.setAttribute('cx', tx); m.t.setAttribute('cy', ty);
          m.ring.setAttribute('cx', tx); m.ring.setAttribute('cy', ty);
        }
        const p = f.pts[active()];
        const tx = X(p.t[0]), ty = Y(p.t[1]);
        const right = tx < W * 0.6;
        label.textContent = d.allocators[active()];
        label.setAttribute('x', right ? tx + 13 : tx - 13);
        label.setAttribute('y', Math.max(ty + 16, M.t + 4));
        label.setAttribute('text-anchor', right ? 'start' : 'end');
      };

      const showDetail = () => {
        const c = conf(), k = active(), a = c.alloc.find((x) => x.k === k);
        dName.textContent = d.allocators[k];
        dKkt.textContent = a.kkt == null ? '' : `KKT residual ${sci(a.kkt)}`;
        nRet[0].textContent = pct(a.e[1]); nRet[1].textContent = pct(a.t[1]);
        nRisk[0].textContent = pct(a.e[0]); nRisk[1].textContent = pct(a.t[0]);
        nSh[0].textContent = sharpe(a.e[2]); nSh[1].textContent = sharpe(a.t[2]);
        a.w.forEach((w, i) => {
          const r = wRows[i];
          r.bar.style.width = `${(w / wmax) * 100}%`;
          r.val.textContent = pct(w);
          r.li.classList.toggle('is-zero', w < 0.0005);
        });
        for (const kk of keys) {
          marks[kk].g.classList.toggle('is-on', kk === k);
          marks[kk].g.setAttribute('aria-pressed', String(kk === st.sel));
        }
        // Draw the active one on top by moving the others under it; moving a focused node would blur it
        const top = marks[k].g, f = document.activeElement;
        if (!gPts.contains(f) || f === top) for (const kk of keys) if (kk !== k) gPts.insertBefore(marks[kk].g, top);
      };

      const update = (animate) => {
        const c = conf();
        sOver.textContent = pts(c.gap.over, 1);
        sRisk.textContent = pct(c.gap.risk);
        sShort.textContent = pts(c.gap.short, 2);
        sKkt.textContent = sci(c.kkt);
        tCap.textContent = `Allocators with ${d.estimators[c.cov]} covariance and ${c.mean === 'true' ? 'true' : 'sample-mean'} returns`;
        tBody.replaceChildren();
        for (const a of c.alloc) {
          const name = d.allocators[a.k];
          marks[a.k].g.setAttribute('aria-label',
            `${name}: estimated ${pct(a.e[1])} return at ${pct(a.e[0])} risk, realized ${pct(a.t[1])} at ${pct(a.t[0])}`);
          const r = hl('tr', null, null, tBody);
          [name, pct(a.e[1]), pct(a.e[0]), pct(a.t[1]), pct(a.t[0])].forEach((t) => hl('td', null, t, r));
        }
        showDetail();
        const to = frameOf(c);
        cancelAnimationFrame(raf);
        if (!animate || reduceMotion || !shown) { paint(to); return; }
        const n = 96, from = shown;
        const a0 = { est: resample(from.est, n), real: resample(from.real, n) };
        const a1 = { est: resample(to.est, n), real: resample(to.real, n) };
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / 280);
          const u = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
          if (t < 1) {
            paint({
              est: a0.est.map((p, i) => mix(p, a1.est[i], u)),
              real: a0.real.map((p, i) => mix(p, a1.real[i], u)),
              pts: Object.fromEntries(keys.map((k) => [k, { e: mix(from.pts[k].e, to.pts[k].e, u), t: mix(from.pts[k].t, to.pts[k].t, u) }])),
            });
            raf = requestAnimationFrame(tick);
          } else paint(to);
        };
        raf = requestAnimationFrame(tick);
      };

      // Pointer: the nearest allocator marker within reach, estimated or realized
      const nearest = (e) => {
        if (!shown) return null;
        const b = svg.getBoundingClientRect();
        const x = (e.clientX - b.left) * (W / b.width), y = (e.clientY - b.top) * (H / b.height);
        let best = null, bd = 24 * 24;
        for (const k of keys) {
          for (const p of [shown.pts[k].t, shown.pts[k].e]) {
            const dd = (X(p[0]) - x) ** 2 + (Y(p[1]) - y) ** 2;
            if (dd < bd) { bd = dd; best = k; }
          }
        }
        return best;
      };
      const setHover = (k) => {
        if (st.hover === k) return;
        st.hover = k;
        svg.classList.toggle('is-pointing', !!k);
        showDetail();
        paint(shown);
      };
      const select = (k, focus) => {
        st.sel = k;
        st.hover = null;
        for (const kk of keys) marks[kk].g.setAttribute('tabindex', kk === k ? '0' : '-1');
        if (focus) marks[k].g.focus();
        showDetail();
        paint(shown);
      };
      svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') setHover(nearest(e)); });
      svg.addEventListener('pointerleave', () => setHover(null));
      svg.addEventListener('click', (e) => { const k = nearest(e); if (k) select(k, false); });
      for (const k of keys) {
        const g = marks[k].g;
        g.addEventListener('focus', () => { if (st.sel !== k) select(k, false); });
        g.addEventListener('keydown', (e) => {
          const i = keys.indexOf(k);
          const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: keys.length - 1 }[e.key];
          if (to === undefined) return;
          e.preventDefault();
          select(keys[(to + keys.length) % keys.length], true);
        });
      }

      // Size to the column, and redraw when it changes
      const redraw = () => { if (layout()) paint(shown || frameOf(conf())); };
      new ResizeObserver(() => { if (Math.round(plot.clientWidth) !== W) redraw(); }).observe(plot);
      fx.classList.add('is-ready');
      layout();
      update(false);
    };

    fetch(fx.dataset.src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(build)
      .catch(() => { fx.hidden = true; });
  }

  // ---------- Matching engine: scrub through the real NASDAQ day ----------
  // The books the ITCH handler rebuilt from NASDAQ's feed for 30 January 2019, ten levels a side
  // once a second from 09:30:00 to 16:00:00, for four symbols. One small file per symbol
  // (data-src + "aapl.bin.gz"), fetched when the viewer nears the screen or its symbol is picked,
  // gunzipped with DecompressionStream and decoded once into typed arrays. Format: encode.mjs.
  // decode:start
  function decodeDay(buf) {
    const b = new Uint8Array(buf);
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'LOBD' || b[4] !== 2) throw new Error('not a LOBD v2 file');
    const hl = b[5] + b[6] * 256 + b[7] * 65536 + b[8] * 16777216;
    const h = JSON.parse(new TextDecoder().decode(b.subarray(9, 9 + hl)));
    // Four varint streams, back to back: heads and prices, level changes, volume, last price
    const at = [9 + hl];
    for (const len of h.streams) at.push(at[at.length - 1] + len);
    if (at[4] !== b.length) throw new Error('stream lengths do not match the file');
    const cur = at.slice(0, 4);
    const u = (s) => { let v = 0, m = 1, x; do { x = b[cur[s]++]; v += (x & 127) * m; m *= 128; } while (x & 128); return v; };
    const z = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
    const { n, levels: L } = h;
    const price = new Int32Array(n * 2 * L), shares = new Uint32Array(n * 2 * L), orders = new Uint32Array(n * 2 * L);
    const depth = new Uint8Array(n * 2), volume = new Float64Array(n), last = new Int32Array(n);
    const best = [0, 0];
    let lastPx = 0;
    for (let i = 0; i < n; i++) {
      const head = u(0);
      for (let side = 0; side < 2; side++) {
        const k = (i * 2 + side) * L, pk = k - 2 * L, dir = side ? 1 : -1;
        const pn = i ? depth[(i - 1) * 2 + side] : 0;
        let nl = pn;
        if (head & (1 << side)) {
          const f = u(0);
          if (f & 1) {
            // Edit: keep last second's prices minus the gone ones, add the new ones, re-sort
            const gone = u(0), list = [];
            for (let j = 0; j < pn; j++) if (!(gone & (1 << j))) list.push(price[pk + j]);
            let ref = price[pk];
            for (let a = f >> 1; a > 0; a--) { ref += z(u(0)); list.push(ref); }
            list.sort((x, y) => (x - y) * dir);
            nl = list.length;
            for (let l = 0; l < nl; l++) price[k + l] = list[l];
          } else {
            nl = f >> 2;
            if (nl) {
              price[k] = best[side] + z(u(0));
              for (let l = 1; l < nl; l++) price[k + l] = price[k + l - 1] + dir * (f & 2 ? 1 : u(0) + 1);
            }
          }
          if (nl) best[side] = price[k];
        } else {
          for (let l = 0; l < nl; l++) price[k + l] = price[pk + l];
        }
        depth[i * 2 + side] = nl;
        const mask = (head >> (2 + 10 * side)) & 1023;
        for (let l = 0, j = 0; l < nl; l++) {
          let q = 0, c = 0;
          while (j < pn && (price[pk + j] - price[k + l]) * dir < 0) j++;   // a second earlier, sorted the same way
          if (j < pn && price[pk + j] === price[k + l]) { q = shares[pk + j]; c = orders[pk + j]; }
          if (mask & (1 << l)) {
            const t = u(1), kc = t % 8, s = z(Math.floor(t / 16));
            q += t & 8 ? s * 100 : s;
            c += z(kc < 7 ? kc : 7 + u(1));
          }
          shares[k + l] = q;
          orders[k + l] = c;
        }
      }
      volume[i] = u(2);
      lastPx += z(u(3));
      last[i] = lastPx;
    }
    for (let s = 0; s < 4; s++) if (cur[s] !== at[s + 1]) throw new Error('stream not fully read');
    return { ...h, L, price, shares, orders, depth, volume, last };
  }
  // decode:end

  const nasdaqDay = document.getElementById('nasdaq-day');
  if (nasdaqDay && 'DecompressionStream' in window) {
    const SYMBOLS = ['AAPL', 'MSFT', 'AMZN', 'QQQ'];
    const OPEN = 9 * 3600 + 30 * 60, CLOSE = 16 * 3600;
    const SPEED = 60;   // market seconds per second of playback: the day in six and a half minutes
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const base = nasdaqDay.dataset.src || '';
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const clock = (s) => [s / 3600 | 0, (s / 60 | 0) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':');
    const int = new Intl.NumberFormat('en-US');

    // Markup: symbol switch, strip, transport, ladder, note
    const top = el('div', 'tape-top');
    const title = el('p', 'tape-h', 'Replay the day');
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Symbol');
    const symButtons = SYMBOLS.map((s, i) => {
      const b = el('button', null, s);
      b.type = 'button';
      b.dataset.sym = s;
      b.setAttribute('aria-pressed', String(i === 0));
      seg.append(b);
      return b;
    });
    top.append(title, seg);

    const strip = el('div', 'tape-strip');
    const canvas = el('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const axis = el('div', 'tape-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.append(el('span', null, '09:30'), el('span', null, '12:00'), el('span', null, '16:00'));
    strip.append(canvas, axis);

    const ctl = el('div', 'tape-ctl');
    const play = el('button', 'tape-play');
    play.type = 'button';
    play.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-play" d="M4.5 2.8v10.4L13 8z"/><path class="i-pause" d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';
    const range = el('input', 'tape-range');
    Object.assign(range, { type: 'range', min: OPEN, max: CLOSE, step: 1, value: CLOSE - 1 });
    range.setAttribute('aria-label', 'Time of day');
    const time = el('output', 'tape-time');
    ctl.append(play, range, time);

    const book = el('table', 'tape-book');
    const head = book.createTHead().insertRow();
    for (const [t, c] of [['Price', ''], ['Shares', 'q'], ['Orders', 'n']]) { const th = el('th', c, t); th.scope = 'col'; head.append(th); }
    const body = book.createTBody();
    const mkRow = (cls) => {
      const r = body.insertRow();
      r.className = cls;
      const p = r.insertCell(), q = r.insertCell(), n = r.insertCell();
      q.className = 'q';
      n.className = 'n';
      const bar = el('i');
      bar.setAttribute('aria-hidden', 'true');
      const qv = el('span');
      q.append(bar, qv);
      return { r, p, qv, bar, n };
    };
    const asks = [], bids = [];
    for (let l = 9; l >= 0; l--) asks[l] = mkRow('is-ask');
    const midRow = body.insertRow();
    midRow.className = 'tape-mid';
    const midLast = midRow.insertCell(), midSpread = midRow.insertCell();
    midSpread.colSpan = 2;
    midSpread.className = 'n';
    for (let l = 0; l < 10; l++) bids[l] = mkRow('is-bid');
    const bookWrap = el('div', 'tape-book-wrap');
    bookWrap.append(book);

    const note = el('p', 'caption tape-note', 'Ten levels a side, once a second, as the handler rebuilt them from NASDAQ’s feed. Times are New York time.');
    note.setAttribute('aria-live', 'polite');
    nasdaqDay.replaceChildren(top, strip, ctl, bookWrap, note);
    nasdaqDay.hidden = false;

    // State
    const days = new Map();   // symbol -> Promise of decoded day
    let sym = SYMBOLS[0], day = null, t = CLOSE - 1, playing = false, raf = 0, prevNow = 0, acc = 0;
    let colors = {}, cols = null, stripImg = null;

    const load = (s) => {
      if (!days.has(s)) {
        days.set(s, fetch(`${base}${s.toLowerCase()}.bin.gz`).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        }).then(async (buf) => {
          const b = new Uint8Array(buf);
          if (b[0] === 0x1f && b[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();   // unless the server already did
          return decodeDay(buf);
        }));
        days.get(s).catch(() => days.delete(s));
      }
      return days.get(s);
    };

    const select = async (s) => {
      sym = s;
      symButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sym === s)));
      nasdaqDay.setAttribute('aria-busy', 'true');
      try {
        const d = await load(s);
        if (sym !== s) return;
        day = d;
        cols = null;
        nasdaqDay.removeAttribute('aria-busy');
        nasdaqDay.classList.remove('is-error');
        draw();
      } catch {
        if (sym !== s) return;
        nasdaqDay.removeAttribute('aria-busy');
        nasdaqDay.classList.add('is-error');
        note.textContent = 'The replay didn’t load. Reload the page to try again.';
      }
    };

    // Ladder
    // Prices: book levels are whole cents; trades can print at half a cent (midpoint orders)
    const money = (v) => (v / 10000).toFixed(v % 100 === 0 ? 2 : v % 10 === 0 ? 3 : 4);   // v in 1e-4 dollars
    const px = (v) => money(v * day.unit);
    const pxLast = (v) => money(v * day.lastUnit);
    const fill = (row, k, on) => {
      if (!on) { row.r.classList.add('is-empty'); row.p.textContent = row.qv.textContent = row.n.textContent = ''; row.bar.style.transform = 'scaleX(0)'; return; }
      row.r.classList.remove('is-empty');
      row.p.textContent = px(day.price[k]);
      row.qv.textContent = int.format(day.shares[k]);
      row.n.textContent = int.format(day.orders[k]);
    };
    const renderBook = () => {
      const i = t - day.t0, L = day.L;
      const kb = (i * 2) * L, ka = (i * 2 + 1) * L;
      const nb = day.depth[i * 2], na = day.depth[i * 2 + 1];
      let max = 1;
      for (let l = 0; l < nb; l++) max = Math.max(max, day.shares[kb + l]);
      for (let l = 0; l < na; l++) max = Math.max(max, day.shares[ka + l]);
      for (let l = 0; l < L; l++) {
        fill(bids[l], kb + l, l < nb);
        fill(asks[l], ka + l, l < na);
        if (l < nb) bids[l].bar.style.transform = `scaleX(${day.shares[kb + l] / max})`;
        if (l < na) asks[l].bar.style.transform = `scaleX(${day.shares[ka + l] / max})`;
      }
      midLast.textContent = day.last[i] ? `Last ${pxLast(day.last[i])}` : '';
      if (nb && na) {
        const sp = day.price[ka] - day.price[kb];
        midSpread.textContent = sp > 0 ? `Spread ${px(sp)}` : sp === 0 ? 'Locked' : 'Crossed';
      } else midSpread.textContent = '';
    };

    // Strip: the last trade price each second as a line, volume as bars beneath, the scrub position marked
    const readColors = () => {
      const cs = getComputedStyle(nasdaqDay);
      const v = (name) => cs.getPropertyValue(name).trim();
      colors = { text: v('--text'), strong: v('--strong'), muted: v('--muted'), line: v('--line'), bg: v('--bg'), font: v('--mono') || 'monospace' };
      stripImg = null;
    };
    const layout = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; cols = null; stripImg = null; }
      return dpr;
    };
    const columns = (w) => {
      // Per device pixel column: low, high and closing price, and total volume
      const n = CLOSE - OPEN + 1, lo = new Float64Array(w), hi = new Float64Array(w), close = new Float64Array(w), vol = new Float64Array(w);
      lo.fill(Infinity); hi.fill(-Infinity);
      for (let s = 0; s < n; s++) {
        const i = OPEN + s - day.t0;
        if (i < 0 || i >= day.n) continue;
        const c = Math.min(w - 1, Math.floor(s / n * w)), p = day.last[i];
        vol[c] += day.volume[i];
        if (!p) continue;
        lo[c] = Math.min(lo[c], p); hi[c] = Math.max(hi[c], p); close[c] = p;
      }
      let pMin = Infinity, pMax = -Infinity, vMax = 1;
      for (let c = 0; c < w; c++) { if (hi[c] > pMax) pMax = hi[c]; if (lo[c] < pMin) pMin = lo[c]; if (vol[c] > vMax) vMax = vol[c]; }
      // A few columns hold the busiest seconds; scale to a high percentile so the rest stay visible
      const sorted = Float64Array.from(vol).sort();
      vMax = Math.max(1, sorted[Math.floor(w * 0.99)]);
      return { w, lo, hi, close, vol, pMin, pMax, vMax };
    };
    const drawStrip = (dpr) => {
      const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
      if (!cols || cols.w !== W) { cols = columns(W); stripImg = null; }
      const priceH = Math.round(H * 0.68), volTop = priceH + Math.round(6 * dpr);
      const y = (p) => Math.round(4 * dpr) + (cols.pMax - p) / Math.max(1, cols.pMax - cols.pMin) * (priceH - 8 * dpr);
      if (!stripImg) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = colors.muted;
        ctx.globalAlpha = 0.45;
        for (let c = 0; c < W; c++) {
          const v = Math.min(1, cols.vol[c] / cols.vMax);
          if (v > 0) { const bh = Math.max(dpr * 0.5, v * (H - volTop)); ctx.fillRect(c, H - bh, 1, bh); }
        }
        // Each column's range of prices, faint, then its closing prices as one line
        ctx.fillStyle = colors.text;
        ctx.globalAlpha = 0.28;
        for (let c = 0; c < W; c++) if (cols.hi[c] > cols.lo[c]) ctx.fillRect(c, y(cols.hi[c]), 1, y(cols.lo[c]) - y(cols.hi[c]));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 1.25 * dpr;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        for (let c = 0; c < W; c++) {
          if (!cols.close[c]) continue;
          if (!started) { ctx.moveTo(c + 0.5, y(cols.close[c])); started = true; } else ctx.lineTo(c + 0.5, y(cols.close[c]));
        }
        ctx.stroke();
        // The day's high and low, on a chip of background so the line never runs through them
        ctx.font = `${11 * dpr}px ${colors.font}`;
        const label = (text, yTop) => {
          const w = ctx.measureText(text).width, h = 14 * dpr;
          ctx.fillStyle = colors.bg;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(0, yTop, w + 6 * dpr, h);
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors.muted;
          ctx.textBaseline = 'middle';
          ctx.fillText(text, 0, yTop + h / 2);
        };
        label(pxLast(cols.pMax), 0);
        label(pxLast(cols.pMin), priceH - 14 * dpr);
        stripImg = ctx.getImageData(0, 0, W, H);
      } else ctx.putImageData(stripImg, 0, 0);
      // Scrub marker
      const x = Math.round((t - OPEN) / (CLOSE - OPEN) * (W - 1)) + 0.5;
      ctx.strokeStyle = colors.strong;
      ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      const p = day.last[t - day.t0];
      if (p) {
        ctx.fillStyle = colors.bg;
        ctx.beginPath(); ctx.arc(x, y(p), 4 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.strong;
        ctx.beginPath(); ctx.arc(x, y(p), 2.75 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    };

    const draw = () => {
      time.textContent = clock(t);
      range.value = t;
      range.setAttribute('aria-valuetext', clock(t));
      range.style.setProperty('--pct', `${((t - OPEN) / (CLOSE - OPEN)) * 100}%`);
      if (!day) return;
      renderBook();
      drawStrip(layout());
    };

    const seek = (s) => { t = Math.max(OPEN, Math.min(CLOSE, Math.round(s))); draw(); };

    // Transport: play runs a minute of the day each second (a minute at a time with reduced motion)
    const setPlaying = (on) => {
      playing = on;
      play.setAttribute('aria-label', on ? 'Pause' : 'Play');
      nasdaqDay.classList.toggle('is-playing', on);
      cancelAnimationFrame(raf);
      if (!on) return;
      if (t >= CLOSE - 60) seek(OPEN);
      prevNow = performance.now();
      acc = 0;
      const step = (now) => {
        acc += (now - prevNow) / 1000 * SPEED;
        prevNow = now;
        const chunk = motion.matches ? 60 : 1;
        if (acc >= chunk) { const adv = Math.floor(acc / chunk) * chunk; acc -= adv; seek(t + adv); }
        if (t >= CLOSE) { setPlaying(false); return; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    play.addEventListener('click', () => setPlaying(!playing));
    setPlaying(false);

    range.addEventListener('input', () => seek(+range.value));
    range.addEventListener('keydown', (e) => {
      // Arrows move a second (native); Page Up and Page Down a minute
      if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
      e.preventDefault();
      seek(t + (e.key === 'PageUp' ? 60 : -60));
    });
    // Dragging across the strip scrubs too
    const fromPointer = (e) => { const r = canvas.getBoundingClientRect(); seek(OPEN + (e.clientX - r.left) / r.width * (CLOSE - OPEN)); };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); fromPointer(e); });
    canvas.addEventListener('pointermove', (e) => { if (canvas.hasPointerCapture(e.pointerId)) fromPointer(e); });

    seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-sym]'); if (b && b.dataset.sym !== sym) select(b.dataset.sym); });

    // Colours follow the theme toggle; the canvas follows its width
    readColors();
    new MutationObserver(() => { readColors(); if (day) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new ResizeObserver(() => { if (day) draw(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) setPlaying(false); });

    draw();
    // Fetch the first symbol as the viewer nears the screen; the others (about 300-400 KB each)
    // only when picked
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((x) => x.isIntersecting)) return;
      io.disconnect();
      select(sym);
    }, { rootMargin: '600px 0px' });
    io.observe(nasdaqDay);
  }

  // ---------- Copy buttons on code blocks ----------
  document.querySelectorAll('[data-copy-code]').forEach((btn) => btn.addEventListener('click', async () => {
    const code = btn.closest('.run-it')?.querySelector('code')?.innerText.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); showToast('Copied'); } catch {}
  }));

  // ---------- Keys: T switches the theme, 1–5 jump to the sections, 6 opens whoami ----------
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.lb[open], .cmd[open]')) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); return; }
    const link = links.find((a) => a.dataset.key === e.key);
    if (!link) return;
    e.preventDefault();
    const url = new URL(link.href);
    if (url.pathname !== location.pathname) { location.href = link.href; return; }
    document.querySelector(url.hash)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  });
})();
