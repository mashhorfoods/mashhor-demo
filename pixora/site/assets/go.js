/* =============================================================================
   Campaign landing (/go) — views, WhatsApp, the lead form, and attribution.

   External rather than inline so the site's Content-Security-Policy
   (script-src 'self' + per-script hashes) needs no new hash.

   TRACKING, AND WHAT IT IS NOT
   Attribution is read from the landing URL (utm_* and the ad platforms' click
   ids), kept for the visit in sessionStorage, and attached to:
     - the analytics events below (through window.plausible, which the site
       already loads — the same `track()` shape as the main site's script);
     - the lead the form sends (hidden fields, so the team sees which ad a
       request came from);
     - a short reference code (PX-XXXXX) at the end of the WhatsApp message,
       which is the only trace the visitor ever sees.
   Nothing typed into the form is ever sent to analytics. No cookies.

   Events
     lp_view        landing loaded       entry, device, source, medium, campaign, content, ref
     lp_cta         a CTA was pressed    cta (work|contact), placement
     lp_step        a view was shown     step (home|work|contact|sent), path
     channel_tap    WhatsApp opened      channel=whatsapp, placement, path
     enquiry_started / enquiry_sent / enquiry_failed   service, path
   ============================================================================= */
(() => {
  'use strict';

  const CONFIG = {
    // The approved business number, digits only, as in the main site's links.
    whatsapp: '249962672192',
    endpoint: '/lead.php',
    // Optional: campaign code (lower case) → the words a customer would use. When a code is
    // listed here, the WhatsApp greeting mentions it ("بخصوص عرض الإطلاق").
    // Unlisted codes never appear in the message.
    campaigns: {
      // 'launch-q4': 'عرض الإطلاق',
    },
  };

  const STORE = 'pixora:campaign';
  const LANG_KEY = 'site-lang';

  // utm_source values → how a person would name the platform.
  const PLATFORMS = {
    snapchat: 'سناب شات', snap: 'سناب شات',
    instagram: 'إنستغرام', ig: 'إنستغرام',
    facebook: 'فيسبوك', fb: 'فيسبوك', meta: 'إنستغرام وفيسبوك',
    tiktok: 'تيك توك',
    x: 'إكس', twitter: 'إكس',
    google: 'جوجل', youtube: 'يوتيوب',
    linkedin: 'لينكدإن',
  };
  // Click ids the ad platforms append, for ads that were set up without utm_*.
  const CLICK_IDS = {
    gclid: 'google', gbraid: 'google', wbraid: 'google',
    fbclid: 'meta', ttclid: 'tiktok', sccid: 'snapchat',
    twclid: 'x', li_fat_id: 'linkedin',
  };
  const SERVICES = {
    branding: 'الهوية والتصميم',
    websites: 'المواقع الإلكترونية',
    social: 'إدارة وسائل التواصل',
    marketing: 'التسويق الرقمي والإعلانات',
    integrated: 'الحلول الرقمية المتكاملة',
    unsure: 'استشارة لاختيار الخدمة',
  };
  const ROUTES = { '': 'home', top: 'home', work: 'work', contact: 'contact', sent: 'sent' };
  const STEP_PATH = { work: 'portfolio', contact: 'contact' };
  const TITLES = {
    home: 'Pixora — علامتك. حضورك الرقمي. شريك واحد.',
    work: 'أعمالنا — Pixora',
    contact: 'تواصل معنا — Pixora',
    sent: 'تم استلام طلبك — Pixora',
  };

  /* ---------------------------------------------------------------------------
     Storage — every access guarded: private mode and blocked storage throw.
     ------------------------------------------------------------------------ */
  const session = {
    get(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* not kept */ } },
  };

  /* ---------------------------------------------------------------------------
     Attribution
     ------------------------------------------------------------------------ */
  const clean = (value, max = 80) => String(value || '')
    .trim().toLowerCase().slice(0, max).replace(/[^\p{L}\p{N} _.:/|-]+/gu, '-');

  function device() {
    const ua = navigator.userAgent || '';
    if (navigator.userAgentData?.mobile) return 'mobile';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
    // iPadOS reports itself as a Mac; a touch Mac is an iPad.
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'tablet';
    if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile';
    return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768 ? 'mobile' : 'desktop';
  }

  function makeRef() {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let bytes = new Uint8Array(5);
    try { crypto.getRandomValues(bytes); } catch { bytes = bytes.map(() => Math.floor(Math.random() * 256)); }
    return `PX-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
  }

  function referrerSource() {
    try {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (!host || host === location.hostname) return '';
      return clean(host.split('.').slice(-2, -1)[0] || host);
    } catch { return ''; }
  }

  function readAttribution(params, entry) {
    const lower = new Map([...params].map(([k, v]) => [k.toLowerCase(), v]));
    const fromUrl = {
      source: clean(lower.get('utm_source')),
      medium: clean(lower.get('utm_medium')),
      campaign: clean(lower.get('utm_campaign')),
      content: clean(lower.get('utm_content')),
      term: clean(lower.get('utm_term')),
    };
    const clickPlatform = Object.keys(CLICK_IDS).find((key) => lower.has(key));
    if (!fromUrl.source && clickPlatform) fromUrl.source = CLICK_IDS[clickPlatform];
    if (!fromUrl.medium && clickPlatform) fromUrl.medium = 'paid';
    const fresh = Object.values(fromUrl).some(Boolean);

    const stored = session.get(STORE);
    // A new ad click in the same visit wins (last touch); a reload or a hop
    // back from the main site keeps what the visit arrived with.
    if (stored && !fresh) return stored;
    const data = {
      ...fromUrl,
      source: fromUrl.source || referrerSource() || 'direct',
      paid: fresh,
      landing: location.pathname.replace(/\.html$/, '') || '/',
      entry,
      device: device(),
      ref: stored?.ref || makeRef(),
      path: '',
    };
    session.set(STORE, data);
    return data;
  }

  // The address bar should read like a page, not a tracking link. Runs after
  // Plausible (earlier in document order) has already sent its pageview.
  function tidyUrl(params) {
    const keep = [...params].filter(([k]) => !/^utm_/i.test(k) && !(k.toLowerCase() in CLICK_IDS) && k !== 'v');
    const query = keep.length ? `?${new URLSearchParams(keep)}` : '';
    try { history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`); } catch { /* fine */ }
  }

  /* ---------------------------------------------------------------------------
     Analytics — the main site's track() shape, plus attribution.
     ------------------------------------------------------------------------ */
  let visit;
  function track(name, props = {}) {
    const detail = {
      ...props,
      lang: 'ar',
      source: visit.source,
      campaign: visit.campaign || '(none)',
      device: visit.device,
      entry: visit.entry,
      ref: visit.ref,
    };
    try {
      document.dispatchEvent(new CustomEvent('pixora:event', { detail: { name, ...detail } }));
      if (typeof window.plausible === 'function') window.plausible(name, { props: detail });
      else if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, detail);
      if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...detail });
    } catch { /* analytics must never break the page */ }
  }

  /* ---------------------------------------------------------------------------
     WhatsApp — a natural first message, carrying context in plain words.
     ------------------------------------------------------------------------ */
  let lastLead = null;

  function arrivalLine() {
    const platform = PLATFORMS[visit.source];
    const offer = CONFIG.campaigns[visit.campaign];
    const via = visit.paid
      ? `وصلت إليكم من إعلانكم${platform ? ` على ${platform}` : ''}`
      : 'وصلت إليكم من موقعكم';
    const saw = visit.path.includes('portfolio') ? ' واطّلعت على أعمالكم' : '';
    return `${via}${offer ? ` بخصوص ${offer}` : ''}${saw}، وأودّ التحدث عن مشروعي.`;
  }

  function waMessage(kind) {
    const lines = ['مرحبًا بيكسورا،'];
    if (kind === 'sent' && lastLead) {
      lines.push(`أرسلت طلبي الآن من الموقع باسم ${lastLead.name} بخصوص ${SERVICES[lastLead.service] || 'مشروعي'}، وأودّ متابعة الحديث هنا.`);
    } else if (kind === 'fallback' && lastLead) {
      lines.push(`${arrivalLine()}`, '');
      lines.push(`الاسم: ${lastLead.name}`);
      lines.push(`الدولة / المدينة: ${lastLead.location}`);
      lines.push(`الخدمة: ${SERVICES[lastLead.service] || '—'}`);
      if (lastLead.note) lines.push(`ملاحظة: ${lastLead.note}`);
    } else {
      lines.push(arrivalLine());
    }
    lines.push('', `رقم المرجع: ${visit.ref}`);
    return lines.join('\n');
  }

  function refreshWhatsApp() {
    document.querySelectorAll('[data-wa]').forEach((link) => {
      const text = waMessage(link.dataset.wa || 'default');
      link.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
    });
    const preview = document.querySelector('[data-wa-preview]');
    if (preview) preview.textContent = waMessage('default');
  }

  /* ---------------------------------------------------------------------------
     Views
     ------------------------------------------------------------------------ */
  const views = new Map([...document.querySelectorAll('[data-view]')].map((el) => [el.dataset.view, el]));
  let current = null;

  function routeFromHash() {
    const key = decodeURIComponent(location.hash.slice(1));
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(ROUTES, key) ? ROUTES[key] : null;
  }

  function show(route, { initial = false } = {}) {
    if (route === 'sent' && !session.get('pixora:sent')) route = 'contact';
    if (route === current) return;
    current = route;
    views.forEach((el, name) => el.classList.toggle('is-active', name === route));
    document.body.dataset.route = route;
    document.title = TITLES[route];

    const step = STEP_PATH[route];
    if (step && !visit.path.split('>').includes(step)) {
      visit.path = visit.path ? `${visit.path}>${step}` : step;
      session.set(STORE, visit);
      refreshWhatsApp();
      syncHiddenFields();
    }
    if (!initial) {
      // 'instant' overrides the site's smooth scrolling; very old engines
      // reject the value, so fall back to the plain form.
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch { window.scrollTo(0, 0); }
      // Move focus to the new view's heading so screen readers announce it.
      views.get(route)?.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
    }
    track('lp_step', { step: route, path: visit.path || '(none)' });
  }

  function initRouting() {
    window.addEventListener('hashchange', () => show(routeFromHash() || 'home'));
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-cta]');
      if (!link) return;
      track('lp_cta', { cta: link.dataset.cta, placement: link.dataset.placement || 'unknown' });
    });
    // Clicking the link for the view you are already on still lands you at
    // its top — the hash does not change, so hashchange would not fire.
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.getAttribute('href') === '#main') return;
      const target = ROUTES[link.getAttribute('href').slice(1)];
      if (target && target === current) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  /* ---------------------------------------------------------------------------
     Form
     ------------------------------------------------------------------------ */
  const form = document.querySelector('[data-lead-form]');
  const TRACKED = ['source', 'medium', 'campaign', 'content', 'term', 'landing', 'entry', 'device', 'path', 'ref'];

  function syncHiddenFields() {
    const holder = form?.querySelector('[data-tracking-fields]');
    if (!holder) return;
    holder.replaceChildren(...TRACKED.map((key) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = `t_${key}`;
      input.value = String(visit[key] ?? '');
      return input;
    }));
  }

  // Gulf keyboards type Arabic-Indic digits; the number must still validate.
  const toLatinDigits = (value) => value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

  function normalisePhone(raw) {
    let value = toLatinDigits(raw).replace(/[\s\-().‎‏]/g, '');
    if (value.startsWith('00')) value = `+${value.slice(2)}`;
    return value;
  }

  const RULES = {
    name: (v) => (v.trim().length < 2 ? 'اكتب اسمك من فضلك.' : ''),
    whatsapp: (v) => {
      if (!v.trim()) return 'اكتب رقم واتساب لنتواصل معك عليه.';
      return /^\+?\d{8,15}$/.test(normalisePhone(v)) ? '' : 'تأكد من الرقم — اكتبه مع رمز الدولة، مثل ‎+966 5X XXX XXXX‎.';
    },
    location: (v) => (v.trim().length < 2 ? 'اكتب الدولة أو المدينة.' : ''),
    service: (v) => (v ? '' : 'اختر نوع الخدمة المطلوبة.'),
  };

  // By name, not by element: the service is a group of radio chips, and
  // RadioNodeList.value gives the checked one's value like any other field.
  function controlsOf(name) {
    const el = form.elements[name];
    return el instanceof RadioNodeList ? [...el] : [el];
  }

  function validateName(name) {
    const message = RULES[name](form.elements[name].value || '');
    const controls = controlsOf(name);
    const wrapper = controls[0].closest('.c-field');
    const error = wrapper?.querySelector('.c-field__error');
    if (error) error.textContent = message;
    if (wrapper) wrapper.dataset.invalid = String(Boolean(message));
    controls.forEach((control) => control.setAttribute('aria-invalid', String(Boolean(message))));
    return !message;
  }

  function initForm() {
    if (!form) return;
    form.noValidate = true; // our Arabic messages, not the browser's
    syncHiddenFields();
    const names = Object.keys(RULES);
    const phone = form.elements.whatsapp;
    const submit = form.querySelector('[data-submit]');
    const label = form.querySelector('[data-submit-label]');
    const status = form.querySelector('[data-form-status]');

    phone.addEventListener('input', () => {
      const latin = toLatinDigits(phone.value);
      if (latin !== phone.value) phone.value = latin;
    });
    // Validate after the first visit to a field, not on every keystroke before;
    // once a field has shown an error, clear it the moment it is fixed.
    names.forEach((name) => {
      controlsOf(name).forEach((control) => {
        if (control.type !== 'radio') {
          control.addEventListener('blur', () => { if (control.value) validateName(name); });
        }
        control.addEventListener(control.type === 'radio' ? 'change' : 'input', () => {
          if (control.closest('.c-field')?.dataset.invalid === 'true') validateName(name);
        });
      });
    });
    // "Next" on a phone keyboard moves to the next field instead of submitting
    // a half-filled form.
    const order = ['name', 'whatsapp', 'location'];
    order.forEach((name, i) => {
      form.elements[name].addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        const next = order[i + 1] ? form.elements[order[i + 1]] : form.querySelector('input[name="service"]:checked') || controlsOf('service')[0];
        next.focus();
      });
    });
    form.addEventListener('focusin', () => {
      track('enquiry_started', { path: visit.path || '(none)' });
    }, { once: true });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const invalid = names.filter((name) => !validateName(name));
      if (invalid.length) {
        const first = controlsOf(invalid[0])[0];
        first.focus();
        first.closest('.c-field')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      phone.value = normalisePhone(phone.value);
      syncHiddenFields();
      const data = new FormData(form);
      lastLead = {
        name: String(data.get('name')).trim(),
        location: String(data.get('location')).trim(),
        service: String(data.get('service')),
        note: String(data.get('note') || '').trim(),
      };

      status.hidden = true;
      submit.setAttribute('aria-busy', 'true');
      label.textContent = 'جارٍ الإرسال…';
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15000);
      let ok = false;
      try {
        const response = await fetch(CONFIG.endpoint, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        ok = response.ok && body.ok === true;
      } catch {
        ok = false;
      } finally {
        window.clearTimeout(timer);
        submit.removeAttribute('aria-busy');
        label.textContent = 'أرسل الطلب';
      }

      if (ok) {
        track('enquiry_sent', { service: lastLead.service, path: visit.path || '(none)' });
        session.set('pixora:sent', true);
        const greeting = document.querySelector('[data-sent-name]');
        if (greeting) greeting.textContent = `شكرًا ${lastLead.name}، وصلنا طلبك. `;
        refreshWhatsApp();
        form.reset();
        // Replace, so Back from the confirmation does not return to a form
        // that looks unsent.
        location.replace('#sent');
      } else {
        // Say what happened, and hand over a way that still reaches a person.
        track('enquiry_failed', { service: lastLead.service, path: visit.path || '(none)' });
        refreshWhatsApp();
        status.hidden = false;
        status.querySelector('a')?.focus();
      }
    });
  }

  /* ---------------------------------------------------------------------------
     Header, WhatsApp taps, year
     ------------------------------------------------------------------------ */
  function initHeader() {
    const header = document.querySelector('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function initWhatsApp() {
    refreshWhatsApp();
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-wa]');
      if (!link) return;
      // Rebuild at the moment of the tap so the message is always current.
      link.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(waMessage(link.dataset.wa || 'default'))}`;
      track('channel_tap', { channel: 'whatsapp', placement: link.dataset.placement || 'unknown', path: visit.path || '(none)' });
    });
  }

  function boot() {
    const params = new URLSearchParams(location.search);
    // ?v=work|contact deep-links a view for ad platforms that drop fragments.
    const requested = routeFromHash() || ROUTES[params.get('v') || ''] || 'home';
    const entry = requested === 'sent' ? 'contact' : requested;
    visit = readAttribution(params, entry);
    if (!location.hash && entry !== 'home') {
      try { history.replaceState(null, '', `#${entry}`); } catch { /* fine */ }
    }

    // Someone who arrives in Arabic should find the main site in Arabic too —
    // unless they have already chosen a language there.
    try { if (!localStorage.getItem(LANG_KEY)) localStorage.setItem(LANG_KEY, 'ar'); } catch { /* fine */ }
    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

    initHeader();
    initWhatsApp();
    initForm();
    initRouting();
    track('lp_view', {
      medium: visit.medium || '(none)',
      content: visit.content || '(none)',
    });
    show(requested, { initial: true });
    window.addEventListener('load', () => window.setTimeout(() => tidyUrl(params), 0), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
