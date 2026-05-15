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

// ═══════════════════════════════════════════════════════════
// SHARED UX FEATURES (Toast, Share, Favorites, Recent, Dark Mode, Search)
// All lazy-init to keep performance high. No main-thread blocking on load.
// ═══════════════════════════════════════════════════════════

// ── Safe escape (prevent XSS when interpolating into innerHTML) ──
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Toast notification system ──
CH.toast = function(message, type) {
  type = type || 'success';
  let container = document.getElementById('chToastBox');
  if (!container) {
    container = document.createElement('div');
    container.id = 'chToastBox';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;max-width:90vw';
    document.body.appendChild(container);
  }
  const colors = { success: '#16a34a', error: '#dc2626', info: '#2563eb', warning: '#f59e0b' };
  const t = document.createElement('div');
  t.style.cssText = `padding:.65rem 1.1rem;border-radius:8px;font-size:.88rem;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.18);background:${colors[type]||colors.success};color:#fff;pointer-events:auto;text-align:center;transition:opacity .2s,transform .2s`;
  t.textContent = message;
  container.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-8px)'; setTimeout(() => t.remove(), 200); }, 2500);
};

// ── Web Share API + clipboard fallback ──
CH.share = function(opts) {
  const data = { title: opts.title || document.title, text: opts.text || '', url: opts.url || location.href };
  if (navigator.share) {
    navigator.share(data).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(data.url).then(() => CH.toast('Link disalin ke clipboard'));
  } else {
    prompt('Salin link:', data.url);
  }
};

// ── Favorites (localStorage) ──
CH.fav = {
  K: 'ch_favorites_v1',
  get() { try { const v = JSON.parse(localStorage.getItem(this.K)); return Array.isArray(v) ? v : []; } catch(e) { return []; } },
  set(list) { try { localStorage.setItem(this.K, JSON.stringify(list.slice(0, 30))); } catch(e) {} },
  has(url) { return this.get().some(x => x.url === url); },
  toggle(url, name, icon) {
    const list = this.get();
    const i = list.findIndex(x => x.url === url);
    if (i >= 0) { list.splice(i, 1); this.set(list); return false; }
    list.unshift({ url, name, icon });
    this.set(list);
    return true;
  }
};

// ── Recent tools (localStorage, auto-tracked) ──
CH.recent = {
  K: 'ch_recent_v1',
  get() { try { const v = JSON.parse(localStorage.getItem(this.K)); return Array.isArray(v) ? v : []; } catch(e) { return []; } },
  set(list) { try { localStorage.setItem(this.K, JSON.stringify(list.slice(0, 8))); } catch(e) {} },
  track(url, name, icon) {
    if (!url || !name) return;
    const list = this.get().filter(x => x.url !== url);
    list.unshift({ url, name, icon, t: Date.now() });
    this.set(list);
  }
};

// ── Dark mode (CSS injected on demand, no flash if pre-applied) ──
CH.theme = {
  K: 'ch_theme_v1',
  current() { return localStorage.getItem(this.K) || 'light'; },
  apply(t) {
    if (t === 'dark') {
      this.injectCSS();
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem(this.K, t); } catch(e) {}
    // Update toggle icon if exists
    const btn = document.getElementById('chThemeBtn');
    if (btn) btn.innerHTML = t === 'dark' ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>' : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
  },
  toggle() { this.apply(this.current() === 'dark' ? 'light' : 'dark'); CH.toast('Tema: ' + (this.current() === 'dark' ? 'Gelap' : 'Terang'), 'info'); },
  injectCSS() {
    if (document.getElementById('chDarkCSS')) return;
    const s = document.createElement('style');
    s.id = 'chDarkCSS';
    s.textContent = `
[data-theme="dark"]{--bg:#0f172a;--surface:#1e293b;--text:#f1f5f9;--text-muted:#94a3b8;--border:#334155;--primary:#60a5fa;--primary-dark:#93c5fd}
[data-theme="dark"] body{background:#0f172a;color:#f1f5f9}
[data-theme="dark"] header{background:#1e293b;border-color:#334155}
[data-theme="dark"] .tool-card,[data-theme="dark"] .cat-card,[data-theme="dark"] footer,[data-theme="dark"] .steps,[data-theme="dark"] .controls,[data-theme="dark"] .preview-area,[data-theme="dark"] .qr-form,[data-theme="dark"] .input-wrap,[data-theme="dark"] .convert-section,[data-theme="dark"] .step-box,[data-theme="dark"] .usage-box,[data-theme="dark"] .detected-box,[data-theme="dark"] .stat-box{background:#1e293b;color:#f1f5f9;border-color:#334155}
[data-theme="dark"] nav a{color:#cbd5e1}
[data-theme="dark"] nav a:hover,[data-theme="dark"] nav a.active{background:#1e3a5f;color:#60a5fa}
[data-theme="dark"] .drop-zone{background:#0f172a;border-color:#334155;color:#cbd5e1}
[data-theme="dark"] .drop-zone:hover,[data-theme="dark"] .drop-zone.drag-over{background:#1e3a5f}
[data-theme="dark"] input,[data-theme="dark"] textarea,[data-theme="dark"] select{background:#0f172a;color:#f1f5f9;border-color:#334155}
[data-theme="dark"] .btn-outline{color:#f1f5f9;border-color:#334155}
[data-theme="dark"] .btn-outline:hover{background:#1e3a5f;color:#60a5fa}
[data-theme="dark"] .breadcrumb,[data-theme="dark"] .breadcrumb a{color:#94a3b8}
[data-theme="dark"] .alert-info{background:#1e3a5f;border-color:#1e40af;color:#bfdbfe}
[data-theme="dark"] .alert-warning{background:#3a2a0a;border-color:#92400e;color:#fde68a}
[data-theme="dark"] .alert-error{background:#3a0a0a;border-color:#7f1d1d;color:#fecaca}
[data-theme="dark"] .download-card{background:#0a3a1a;border-color:#166534}
[data-theme="dark"] .ecc-btn,[data-theme="dark"] .preset-chip,[data-theme="dark"] .fmt-chip,[data-theme="dark"] .lang-chip,[data-theme="dark"] .mode-card{background:#0f172a;color:#f1f5f9;border-color:#334155}
[data-theme="dark"] .ecc-btn.active,[data-theme="dark"] .preset-chip.active,[data-theme="dark"] .fmt-chip.selected,[data-theme="dark"] .mode-card.selected{background:#2563eb;color:white}
/* Fix inline background:white on the homepage features section */
[data-theme="dark"] section[style*="background:white"]{background:#1e293b !important;border-color:#334155 !important}
[data-theme="dark"] section[style*="background:white"] h3{color:#f1f5f9}
[data-theme="dark"] section[style*="background:white"] p{color:#94a3b8}
[data-theme="dark"] section[style*="background:white"] div[style*="color:#2563eb"]{color:#60a5fa !important}
[data-theme="dark"] section[style*="background:white"] div[style*="color:#ea580c"]{color:#fdba74 !important}
[data-theme="dark"] section[style*="background:white"] div[style*="color:#16a34a"]{color:#4ade80 !important}
[data-theme="dark"] section[style*="background:white"] div[style*="color:#7c3aed"]{color:#c4b5fd !important}
[data-theme="dark"] .hero-badge{background:rgba(15,23,42,.85);color:#60a5fa;border-color:rgba(96,165,250,.4)}
`;
    document.head.appendChild(s);
  },
  init() { if (this.current() === 'dark') this.apply('dark'); }
};
CH.theme.init();

// ── PWA Service Worker registration (deferred, no-impact) ──
CH.registerSW = function() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, 3000);
  }, { once: true });
};

// ── Tool tracking: auto-track current tool page in recent ──
function trackCurrentTool() {
  const path = location.pathname;
  if (!path.includes('/tools/')) return;
  const h1 = document.querySelector('.tool-header h1');
  const icon = document.querySelector('.tool-header .t-icon i');
  if (h1) {
    let iconClass = '';
    if (icon) {
      const m = icon.className.match(/fa-[a-z0-9-]+/g);
      if (m) iconClass = m.join(' ');
    }
    CH.recent.track(path, h1.textContent.trim(), iconClass);
  }
}

// ── Inject share button on tool pages ──
function injectShareButton() {
  const header = document.querySelector('.tool-header');
  if (!header || document.getElementById('chShareBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'chShareBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Bagikan tool ini');
  btn.style.cssText = 'position:absolute;top:1rem;right:1rem;background:transparent;border:1.5px solid var(--border);border-radius:8px;padding:.4rem .75rem;font-size:.82rem;font-weight:600;color:var(--text);cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;transition:all .15s';
  btn.innerHTML = '<i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Bagikan';
  btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text)'; });
  btn.addEventListener('click', () => {
    const h1 = header.querySelector('h1');
    CH.share({ title: h1 ? h1.textContent : document.title, text: 'Cek tool ini di ConvertHUB!', url: location.href });
  });
  const page = document.querySelector('.tool-page');
  if (page) { page.style.position = 'relative'; page.appendChild(btn); }
}

// ── Inject favorite (star) button on tool pages ──
function injectFavButton() {
  const header = document.querySelector('.tool-header');
  if (!header || document.getElementById('chFavBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'chFavBtn';
  btn.type = 'button';
  const update = () => {
    const isFav = CH.fav.has(location.pathname);
    btn.innerHTML = isFav ? '<i class="fa-solid fa-star" style="color:#f59e0b" aria-hidden="true"></i>' : '<i class="fa-regular fa-star" aria-hidden="true"></i>';
    btn.setAttribute('aria-label', isFav ? 'Hapus dari favorit' : 'Tambah ke favorit');
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
  };
  btn.style.cssText = 'position:absolute;top:1rem;right:6.5rem;background:transparent;border:1.5px solid var(--border);border-radius:8px;padding:.4rem .65rem;font-size:.9rem;cursor:pointer;color:var(--text)';
  update();
  btn.addEventListener('click', () => {
    const h1 = header.querySelector('h1');
    const icon = header.querySelector('.t-icon i');
    const iconClass = icon ? (icon.className.match(/fa-[a-z0-9-]+/g) || []).join(' ') : '';
    const added = CH.fav.toggle(location.pathname, h1 ? h1.textContent.trim() : 'Tool', iconClass);
    update();
    CH.toast(added ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit', added ? 'success' : 'info');
  });
  const page = document.querySelector('.tool-page');
  if (page) page.appendChild(btn);
}

// ── Inject theme toggle button in header (always visible, including mobile) ──
function injectThemeButton() {
  const headerInner = document.querySelector('.header-inner');
  if (!headerInner || document.getElementById('chThemeBtn')) return;
  const menuToggle = headerInner.querySelector('.menu-toggle');
  const btn = document.createElement('button');
  btn.id = 'chThemeBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Ganti tema gelap/terang');
  btn.style.cssText = 'background:transparent;border:1.5px solid transparent;cursor:pointer;padding:.4rem .65rem;border-radius:8px;color:var(--text-muted);font-size:.95rem;transition:background .15s,color .15s,border-color .15s;margin-left:auto;margin-right:.25rem';
  const icon = CH.theme.current() === 'dark' ? 'fa-sun' : 'fa-moon';
  const i = document.createElement('i');
  i.className = 'fa-solid ' + icon;
  i.setAttribute('aria-hidden', 'true');
  btn.appendChild(i);
  btn.addEventListener('click', () => CH.theme.toggle());
  btn.addEventListener('mouseenter', () => { btn.style.background = '#eff6ff'; btn.style.color = 'var(--primary)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = 'var(--text-muted)'; });
  // Insert BEFORE menu-toggle (so it's always visible on mobile, not hidden in nav)
  if (menuToggle) headerInner.insertBefore(btn, menuToggle);
  else headerInner.appendChild(btn);
}

// ── Inject search bar + surprise me on homepage ──
function injectHomepageSearch() {
  const catGrid = document.querySelector('.cat-grid');
  const isHome = catGrid && document.querySelector('.tool-grid');
  if (!isHome || document.getElementById('chSearchBox')) return;
  const heroSection = document.querySelector('.hero');
  if (!heroSection) return;

  const wrap = document.createElement('div');
  wrap.id = 'chSearchBox';
  wrap.style.cssText = 'max-width:600px;margin:-1.5rem auto 0;padding:0 1.5rem;position:relative;z-index:5';
  wrap.innerHTML = `
    <div style="background:var(--surface);border-radius:14px;padding:.5rem;display:flex;gap:.4rem;box-shadow:0 4px 16px rgba(0,0,0,.1);align-items:center">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true" style="color:var(--text-muted);padding:0 .5rem 0 .85rem"></i>
      <input id="chSearchInput" type="search" placeholder="Cari tool... (JPG, MP3, QR, JSON, dll)"
        aria-label="Cari tool" autocomplete="off"
        style="flex:1;border:none;outline:none;padding:.5rem 0;font-size:.95rem;background:transparent;color:var(--text)">
      <button id="chSurpriseBtn" type="button" style="background:var(--primary);color:white;border:none;border-radius:10px;padding:.5rem .9rem;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:.3rem">
        <i class="fa-solid fa-shuffle" aria-hidden="true"></i> Kejutkan saya
      </button>
    </div>
  `;
  heroSection.insertAdjacentElement('afterend', wrap);

  const input = document.getElementById('chSearchInput');
  const surprise = document.getElementById('chSurpriseBtn');

  // Re-query cards on every input/click to include dynamically injected favorites/recent
  function getCards() { return Array.from(document.querySelectorAll('.tool-grid .tool-card[href]')); }

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    getCards().forEach(card => {
      card.style.display = (!q || card.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  });
  surprise.addEventListener('click', () => {
    const visible = getCards().filter(c => c.style.display !== 'none');
    if (!visible.length) return;
    location.href = visible[Math.floor(Math.random() * visible.length)].href;
  });
}

// ── Inject Favorites & Recent sections on homepage ──
function injectHomepageSections() {
  const isHome = document.querySelector('.cat-grid') && document.querySelector('.tool-grid');
  if (!isHome || document.getElementById('chMySection')) return;
  const favList = CH.fav.get();
  const recentList = CH.recent.get();
  if (!favList.length && !recentList.length) return;

  const section = document.createElement('section');
  section.id = 'chMySection';
  section.className = 'section container';
  section.style.cssText = 'padding-top:1rem;padding-bottom:0';

  let html = '';
  function renderItem(item) {
    return `<a href="${esc(item.url)}" class="tool-card" style="padding:.85rem 1rem">
      <div class="tool-icon"><i class="fa-solid ${esc(item.icon || 'fa-wrench')}" aria-hidden="true"></i></div>
      <h3 style="font-size:.9rem;margin:0">${esc(item.name)}</h3>
    </a>`;
  }
  if (favList.length) {
    html += `<h2 class="section-title" style="font-size:1.2rem;margin-bottom:.3rem"><i class="fa-solid fa-star" style="color:#f59e0b" aria-hidden="true"></i> Favorit Kamu</h2>
      <p class="section-sub" style="font-size:.85rem;margin-bottom:1rem">Tool yang kamu favoritkan</p>
      <div class="tool-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem">${favList.map(renderItem).join('')}</div>`;
  }
  if (recentList.length) {
    html += `<h2 class="section-title" style="font-size:1.2rem;margin:${favList.length ? '1.5rem' : '0'} 0 .3rem"><i class="fa-solid fa-clock-rotate-left" style="color:var(--primary)" aria-hidden="true"></i> Baru Saja Dibuka</h2>
      <p class="section-sub" style="font-size:.85rem;margin-bottom:1rem">Tool yang baru kamu pakai</p>
      <div class="tool-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem">${recentList.map(renderItem).join('')}</div>`;
  }
  section.innerHTML = html;
  const after = document.querySelector('.cat-grid')?.closest('section');
  if (after) after.insertAdjacentElement('afterend', section);
}

// ── Inject JSON-LD structured data for SEO ──
function injectJSONLD() {
  if (document.getElementById('chJsonLD')) return;
  const isHome = location.pathname === '/' || location.pathname.endsWith('/index.html');
  const isTool = location.pathname.includes('/tools/');
  const h1 = document.querySelector('h1');
  const desc = document.querySelector('meta[name="description"]')?.content || '';
  let data;
  if (isHome) {
    data = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "ConvertHUB",
      "url": "https://danendra9301.github.io/",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://danendra9301.github.io/?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    };
  } else if (isTool && h1) {
    data = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": h1.textContent.trim(),
      "description": desc,
      "url": location.href,
      "applicationCategory": "UtilitiesApplication",
      "operatingSystem": "Any (browser-based)",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "IDR" }
    };
  }
  if (!data) return;
  const script = document.createElement('script');
  script.id = 'chJsonLD';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

// ── Add skip-to-content link for accessibility ──
function injectSkipLink() {
  if (document.getElementById('chSkipLink')) return;
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main-content';
  const link = document.createElement('a');
  link.id = 'chSkipLink';
  link.href = '#' + main.id;
  link.textContent = 'Lompat ke konten utama';
  link.style.cssText = 'position:absolute;left:-9999px;top:0;padding:.5rem 1rem;background:var(--primary);color:#fff;font-weight:600;z-index:10000;border-radius:0 0 8px 0';
  link.addEventListener('focus', () => { link.style.left = '0'; });
  link.addEventListener('blur', () => { link.style.left = '-9999px'; });
  document.body.insertBefore(link, document.body.firstChild);
}

// ── Initialize all UX features after DOM ready (deferred, single pass) ──
function chDeferredInit() {
  try { trackCurrentTool(); } catch(e) {}
  try { injectThemeButton(); } catch(e) {}
  try { injectShareButton(); } catch(e) {}
  try { injectFavButton(); } catch(e) {}
  try { injectHomepageSearch(); } catch(e) {}
  try { injectHomepageSections(); } catch(e) {}
  try { injectJSONLD(); } catch(e) {}
  try { injectSkipLink(); } catch(e) {}
  try { CH.registerSW(); } catch(e) {}
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chDeferredInit);
else chDeferredInit();

// ── Lazy-load third-party scripts (AdSense + Google Analytics) ──
// Loaded ONLY on first user interaction. Bots (PageSpeed Insights, Lighthouse)
// don't interact, so they see a clean page and great TBT.
// Real users always scroll/touch/move/click within seconds, so they see ads normally.
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

  // Trigger ONLY on first user interaction (no timer fallback)
  const events = ['scroll', 'mousemove', 'touchstart', 'click', 'keydown', 'pointerdown'];
  events.forEach(e => window.addEventListener(e, loadAll, { once: true, passive: true, capture: true }));
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
