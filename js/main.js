// ── Client-side security hardening ──
// Anti-clickjacking: bust out of frames (since GitHub Pages doesn't allow X-Frame-Options header)
(function antiClickjacking() {
  try {
    if (window.self !== window.top) {
      // We are being framed — bust out
      window.top.location.href = window.self.location.href;
    }
  } catch (e) {
    // Cross-origin top frame access denied — hide content to prevent clickjacking
    document.documentElement.style.display = 'none';
    setTimeout(() => { document.documentElement.style.display = 'block'; }, 50);
  }
})();

// Strip dangerous protocols from URL params (defense in depth)
(function sanitizeUrl() {
  const href = location.href.toLowerCase();
  if (href.includes('javascript:') || href.includes('vbscript:') || href.includes('data:text/html')) {
    location.href = location.origin + location.pathname;
  }
})();

// Mobile nav toggle
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !nav.contains(e.target)) nav.classList.remove('open');
  });
}

// Mark active nav link
const path = location.pathname;
document.querySelectorAll('nav a').forEach(a => {
  if (a.getAttribute('href') && path.includes(a.getAttribute('href').replace('../', '').replace('index.html', ''))) {
    a.classList.add('active');
  }
});

// Drag-over styling for drop zones
document.querySelectorAll('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); });
});

// Utility: format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

// Utility: format seconds as mm:ss
function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// Utility: trigger download from blob
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Utility: set progress bar
function setProgress(id, pct, label) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  wrap.classList.remove('hidden');
  const fill = wrap.querySelector('.progress-fill');
  const lbl = wrap.querySelector('.progress-label span:last-child');
  if (fill) fill.style.width = pct + '%';
  if (lbl && label) lbl.textContent = label;
}

// Expose helpers globally
window.CH = { formatSize, formatTime, downloadBlob, setProgress };

// ── Lazy-load third-party scripts (AdSense + Google Analytics) ──
// Loaded on first user interaction OR 3.5s after page load — drastically reduces TBT
(function lazyLoadThirdParty() {
  let loaded = false;
  function loadAll() {
    if (loaded) return;
    loaded = true;

    // Google Analytics 4
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', 'G-18SPRHVYGN');
    const ga = document.createElement('script');
    ga.async = true;
    ga.src = 'https://www.googletagmanager.com/gtag/js?id=G-18SPRHVYGN';
    document.head.appendChild(ga);

    // Google AdSense
    const ad = document.createElement('script');
    ad.async = true;
    ad.crossOrigin = 'anonymous';
    ad.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6762425743604699';
    document.head.appendChild(ad);
  }

  // Trigger on first user interaction
  const events = ['scroll', 'mousemove', 'touchstart', 'click', 'keydown'];
  events.forEach(e => window.addEventListener(e, loadAll, { once: true, passive: true, capture: true }));

  // Fallback: load 3.5s after page load
  function timer() { setTimeout(loadAll, 3500); }
  if (document.readyState === 'complete') timer();
  else window.addEventListener('load', timer, { once: true });
})();

// ── Visitor counter (counterapi.dev — gratis, no signup) ──
// Defer to idle so it doesn't compete with critical render path
(function visitorCounter() {
  function init() {
    const footer = document.querySelector('footer .footer-inner');
    if (!footer || document.getElementById('chVisitorBox')) return;

    const box = document.createElement('div');
    box.id = 'chVisitorBox';
    box.style.cssText = 'margin-top:.85rem;padding:.55rem .9rem;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);border-radius:999px;display:inline-flex;align-items:center;gap:.5rem;font-size:.82rem;color:#1e40af;font-weight:600';
    box.innerHTML = '<i class="fa-solid fa-eye" style="color:#2563eb"></i> Total pengunjung: <strong id="chVisitorCount" style="color:#1d4ed8">memuat...</strong>';

    // wrap so it's centered nicely
    const wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;margin-top:.5rem';
    wrap.appendChild(box);
    footer.appendChild(wrap);

    // Increment once per day per visitor
    const today = new Date().toDateString();
    const lastVisit = localStorage.getItem('ch_last_visit');
    const isNewToday = lastVisit !== today;
    const base = 'https://api.counterapi.dev/v1/converthub-danendra9301/visits';
    const url = isNewToday ? base + '/up' : base + '/';

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById('chVisitorCount');
        if (!el) return;
        const n = data.count ?? data.value ?? 0;
        el.textContent = (typeof n === 'number') ? n.toLocaleString('id-ID') : '—';
        if (isNewToday) localStorage.setItem('ch_last_visit', today);
      })
      .catch(() => {
        const el = document.getElementById('chVisitorCount');
        if (el) el.textContent = '—';
      });
  }
  // Defer to after page load + idle callback to keep critical path clean
  function deferred() {
    if ('requestIdleCallback' in window) requestIdleCallback(init, { timeout: 3000 });
    else setTimeout(init, 1500);
  }
  if (document.readyState === 'complete') deferred();
  else window.addEventListener('load', deferred, { once: true });
})();
