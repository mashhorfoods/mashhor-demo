(() => {
const SERVICE_LINKS = [
  { id: 'branding', href: '/services/branding', label: 'Branding & Design', labelAr: 'الهوية والتصميم' },
  { id: 'websites', href: '/services/websites', label: 'Websites', labelAr: 'المواقع الإلكترونية' },
  { id: 'social', href: '/services/social', label: 'Social Media Management', labelAr: 'إدارة وسائل التواصل' },
  { id: 'marketing', href: '/services/marketing', label: 'Digital Marketing & Advertising', labelAr: 'التسويق الرقمي والإعلانات' },
  { id: 'integrated', href: '/services/integrated', label: 'Integrated Digital Solutions', labelAr: 'الحلول الرقمية المتكاملة' },
];
const SECTIONS = [
  { id: 'home', label: 'Home', labelAr: 'الرئيسية' },
  { id: 'services', label: 'Services', labelAr: 'خدماتنا', children: SERVICE_LINKS },
  { id: 'pricing', label: 'Pricing', labelAr: 'الأسعار', href: '/pricing' },
  { id: 'story', label: 'Story', labelAr: 'القصة', href: '/story' },
  { id: 'about', label: 'About', labelAr: 'من نحن', href: '/about' },
  // Reached through the primary CTA rather than a sixth nav link, so the
  // header keeps one unambiguous conversion action (§11, §19). It still
  // appears in the footer quick links.
  { id: 'faq', label: 'FAQ', labelAr: 'الأسئلة الشائعة', inNav: false, inMenu: true },
  { id: 'contact', label: 'Contact', labelAr: 'تواصل معنا', inNav: true, inMenu: true },
];
const PRIMARY_CTA = {
  target: 'contact',
  label: 'Start Your Project',
  labelAr: 'ابدأ مشروعك',
};
const SOCIAL_LINKS = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/muhalabsalah/' },
  { label: 'Behance', href: 'https://www.behance.net/MuhalabSalah' },
  { label: "Founder's portfolio", labelAr: 'أعمال المؤسس', href: 'https://muhalabsalah.github.io/muhalabsalah/' },
];
const STRINGS = {
  en: {
    brandHome: 'Pixora, Digital Agency — home',
    primaryNav: 'Primary',
    challengeSteps: 'Challenge progress',
    menuNav: 'Menu',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    menuEyebrow: 'Menu',
    followUs: 'Follow us',
    language: 'Language',
    footerNav: 'Quick links',
    footerServices: 'Services',
    footerStart: 'Start',
    footerElsewhere: 'Elsewhere',
    opensNewTab: '(opens in a new tab)',
    // Two region names that were English on the Arabic page until 7 Sep.
    // They carry no data, so they take a key rather than a translated
    // duplicate of something that lives elsewhere.
    serviceFlow: 'How the connected offering runs',
    notFoundLinks: 'Main destinations',
    reelVideo: 'Showreel — sixty seconds of recent work',
    backToTop: 'Back to top',
    // The Brand Challenge's copy button restores this after saying what
    // happened. (The Mystery Reward used it too, until docs/111 removed it.)
    rewardCopy: 'Copy code',
    // Names a focusable scroll region, so a screen reader can announce it
    // before the visitor decides whether to enter it.
    //
    // ONE KEY WAS DOING THE JOB OF SIX, AND IT UNDID THE MARKUP TO DO IT.
    // index.html had written two good, distinct labels — "Selected work" and
    // "Campaigns" — and both carried data-i18n-label="galleryScroller", so
    // the i18n pass replaced both with this one generic string at runtime.
    // Three regions on the site ended up announcing the SAME name, and the
    // author's own words were destroyed to achieve it. Exactly the shape
    // docs/67 §1 already found once ("five identical 'See what it covers'
    // links"), so it gets a key each. Found 7 Sep while preparing the
    // screen-reader brief; qa.js §32 now fails on a repeated region name.
    galleryScroller: 'The work delivered — scroll for more',
    galleryWork: 'Selected work — scroll for more',
    galleryCampaigns: 'Campaigns — scroll for more',
    // The three phone scrollers from docs/113. They were given tabindex="0"
    // to satisfy axe's scrollable-region-focusable and NO NAME AT ALL, which
    // axe does not check — so a keyboard visitor landed in an unnamed group
    // three times on the way down the page.
    scrollerBrandboard: 'Identity boards — scroll for more',
    scrollerDevices: 'Website screens — scroll for more',
    scrollerModules: 'Social formats — scroll for more',
    rights: 'All rights reserved.',
    // Currency SYMBOL only — the price figure itself is business data and is
    // authored in the markup, never here.
    currency: 'USD',
    billingOnce: 'One-time',
    billingMonthly: 'Monthly',
    // Add-ons are quoted as starting prices, never as a final figure.
    priceFrom: 'From',
    // The response promise lives here, once, so the verification band, the
    // contact section and any future page cannot state different windows.
    replyWindow: 'We reply within 2 working hours',
    replyHours: 'Sunday to Thursday',
    verifyHeading: 'Who you are talking to',
    verifyCheck: 'Check us:',
    contactChannels: 'Direct channels',
    contactElsewhere: 'Elsewhere',
    formAbout: 'About',
    copyEmail: 'Copy',
    copyEmailLabel: 'Copy the email address',
    copied: 'Copied',
    copyFailed: 'Press to select, then copy',
    formName: 'Your name',
    formEmail: 'Your email',
    formMessage: 'What are you looking to build?',
    formSend: 'Send message',
    formNote: 'Opens your email app with the message ready to send.',
  },
  ar: {
    brandHome: 'بيكسورا، وكالة رقمية — الصفحة الرئيسية',
    primaryNav: 'التنقل الرئيسي',
    challengeSteps: 'مسار التحدي',
    menuNav: 'القائمة',
    openMenu: 'فتح القائمة',
    closeMenu: 'إغلاق القائمة',
    menuEyebrow: 'القائمة',
    followUs: 'تابعنا',
    language: 'اللغة',
    footerNav: 'روابط سريعة',
    footerServices: 'خدماتنا',
    footerStart: 'ابدأ',
    footerElsewhere: 'مواقع أخرى',
    opensNewTab: '(يفتح في نافذة جديدة)',
    serviceFlow: 'كيف تعمل الخدمة المتكاملة',
    notFoundLinks: 'الوجهات الرئيسية',
    reelVideo: 'الفيلم الترويجي — ستون ثانية من أعمال حديثة',
    backToTop: 'العودة إلى الأعلى',
    rewardCopy: 'انسخ الرمز',
    galleryScroller: 'الأعمال المسلَّمة — مرّر للمزيد',
    galleryWork: 'أعمال مختارة — مرّر للمزيد',
    galleryCampaigns: 'حملات — مرّر للمزيد',
    scrollerBrandboard: 'لوحات الهوية — مرّر للمزيد',
    scrollerDevices: 'شاشات الموقع — مرّر للمزيد',
    scrollerModules: 'صيغ التواصل — مرّر للمزيد',
    rights: 'جميع الحقوق محفوظة.',
    currency: 'دولار',
    billingOnce: 'لمرة واحدة',
    billingMonthly: 'شهريًا',
    priceFrom: 'يبدأ من',
    replyWindow: 'نردّ خلال ساعتين في أوقات العمل',
    replyHours: 'من الأحد إلى الخميس',
    verifyHeading: 'مع من تتحدث',
    verifyCheck: 'تحقّق بنفسك:',
    contactChannels: 'قنوات التواصل',
    contactElsewhere: 'روابط أخرى',
    formAbout: 'بخصوص',
    copyEmail: 'نسخ',
    copyEmailLabel: 'نسخ عنوان البريد الإلكتروني',
    copied: 'تم النسخ',
    copyFailed: 'اضغط للتحديد ثم انسخ',
    formName: 'الاسم',
    formEmail: 'البريد الإلكتروني',
    formMessage: 'ما الذي تريد إنشاءه؟',
    formSend: 'إرسال الرسالة',
    formNote: 'يفتح تطبيق البريد لديك والرسالة جاهزة للإرسال.',
  },
};
function currentLang() {
  return document.documentElement.lang?.startsWith('ar') ? 'ar' : 'en';
}
function sectionsFor(surface) {
  if (surface === 'footer') return SECTIONS.filter((s) => s.inFooter !== false);
  if (surface === 'menu') {
    return SECTIONS.filter((s) => (s.inMenu !== undefined ? s.inMenu : s.inNav !== false));
  }
  return SECTIONS.filter((s) => s.inNav !== false);
}
function labelFor(entry) {
  return currentLang() === 'ar' && entry.labelAr ? entry.labelAr : entry.label;
}
function t(key) {
  return STRINGS[currentLang()][key] ?? STRINGS.en[key] ?? key;
}
const SCROLL_THRESHOLD = 24; // separation appears
const COMPACT_THRESHOLD = 200; // compacting may begin
const SCROLL_DELTA = 6; // ignore sub-pixel jitter
const LANG_KEY = 'site-lang';
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
function buildNavLink(section) {
  const link = document.createElement('a');
  link.href = destination(section);
  link.className = 'c-nav__link';
  link.dataset.navLink = '';
  const label = document.createElement('span');
  label.className = 'c-nav__label';
  label.textContent = labelFor(section);
  link.append(label);
  // Consumed by ::before to reserve the semibold width — see navigation.css.
  link.dataset.label = label.textContent;
  return link;
}
function destination(entry) {
  return entry.href ?? `${HOME}#${entry.id}`;
}
function buildDrawerLink(section, index) {
  const link = document.createElement('a');
  link.href = destination(section);
  link.className = 'c-drawer__link';
  link.dataset.navLink = '';
  const idx = document.createElement('span');
  idx.className = 'c-drawer__index';
  idx.setAttribute('aria-hidden', 'true');
  idx.textContent = String(index + 1).padStart(2, '0');
  const label = document.createElement('span');
  label.textContent = labelFor(section);
  link.append(idx, label);
  return link;
}
function buildDrawerSubLink(entry) {
  const link = document.createElement('a');
  link.href = destination(entry);
  link.className = 'c-drawer__sublink';
  link.dataset.navLink = '';
  link.textContent = labelFor(entry);
  return link;
}
function buildFooterLink(section) {
  const link = document.createElement('a');
  link.href = destination(section);
  link.className = 'c-link';
  link.dataset.navLink = '';
  link.textContent = labelFor(section);
  return link;
}
function markCurrentPage() {
  const norm = (s) => s.replace(/\.html$/, '') || 'index';
  const here = norm(window.location.pathname.split('/').pop());
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const file = (link.getAttribute('href') || '').split('#')[0];
    // A bare fragment is a section of this page: the scroll spy owns that one.
    if (!file) return;
    if (norm(file.split('/').pop()) === here) link.setAttribute('aria-current', 'page');
  });
}
function resolveCrossPageAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const id = link.getAttribute('href').slice(1);
    if (!id || document.getElementById(id)) return;
    link.setAttribute('href', `${HOME}#${id}`);
  });
}
const HOME = document.getElementById('home') ? '' : '/';
function renderSurfaces() {
  document.querySelectorAll('[data-nav-render]').forEach((container) => {
    const kind = container.dataset.navRender;
    // The services column renders from its own array rather than from
    // SECTIONS — the six categories are not page-level navigation, but they
    // are still a single source, so the footer cannot drift from the Services
    // section.
    if (kind === 'services') {
      container.replaceChildren(
        ...SERVICE_LINKS.map((service) => {
          const item = document.createElement('li');
          item.append(buildFooterLink(service));
          return item;
        })
      );
      return;
    }
    const surface = kind === 'footer'
      ? 'footer'
      : (container.dataset.navStyle === 'drawer' ? 'menu' : 'nav');
    const style = container.dataset.navStyle ?? surface;
    const sections = sectionsFor(surface);
    container.replaceChildren(
      ...sections.map((section, index) => {
        const item = document.createElement('li');
        if (style === 'drawer') {
          item.className = 'c-drawer__item';
          item.style.setProperty('--i', String(index));
          item.append(buildDrawerLink(section, index));
          // Children render as an indented list under their parent. The
          // parent link still works — tapping "Services" goes to the section,
          // tapping a child goes straight to that service.
          if (section.children?.length) {
            const list = document.createElement('ul');
            list.className = 'c-drawer__sub';
            list.setAttribute('role', 'list');
            list.append(...section.children.map((child) => {
              const row = document.createElement('li');
              row.append(buildDrawerSubLink(child));
              return row;
            }));
            item.append(list);
          }
        } else if (style === 'footer') {
          item.append(buildFooterLink(section));
        } else {
          item.append(buildNavLink(section));
        }
        return item;
      })
    );
  });
  resolveCrossPageAnchors();
  markCurrentPage();
  // Social links render only if real profiles exist — none are invented.
  document.querySelectorAll('[data-social-render]').forEach((container) => {
    const block = container.closest('[data-social-block]') ?? container;
    block.hidden = SOCIAL_LINKS.length === 0;
    container.replaceChildren(
      ...SOCIAL_LINKS.map(({ label, labelAr, href }) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = href;
        link.textContent = (currentLang() === 'ar' && labelAr) ? labelAr : label;
        // These are the only off-site destinations on the site. They leave it,
        // so they open in a new tab, say so to a screen reader, and carry the
        // rel that stops the opened page reaching back through window.opener.
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const note = document.createElement('span');
        note.className = 'u-visually-hidden';
        note.textContent = ` ${t('opensNewTab')}`;
        link.append(note);
        item.append(link);
        return item;
      })
    );
  });
}
const TITLE_EN = document.title;
function renderTitle() {
  const ar = document.querySelector('meta[name="title-ar"]')?.content?.trim();
  document.title = (currentLang() === 'ar' && ar) ? ar : TITLE_EN;
}
function renderStrings() {
  renderTitle();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  });
  document.querySelectorAll('[data-alt-en][data-alt-ar]').forEach((el) => {
    const next = currentLang() === 'ar' ? el.dataset.altAr : el.dataset.altEn;
    if (next) el.setAttribute('alt', next);
  });
  document.querySelectorAll('[data-cta-label]').forEach((el) => {
    el.textContent = labelFor(PRIMARY_CTA);
  });
  document.querySelectorAll('[data-cta-link]').forEach((el) => {
    // HOME is '' on the homepage, so this stays a plain fragment there and
    // becomes a real cross-page link everywhere else. Set here rather than
    // patched afterwards, because renderStrings() runs after renderSurfaces()
    // and would otherwise put the dead fragment back.
    el.setAttribute('href', `${HOME}#${PRIMARY_CTA.target}`);
  });
}
function initPhoneAction() {
  const bar = document.querySelector('[data-phone-cta]');
  if (!bar) return;
  const targets = [
    ...document.querySelectorAll('#main .c-btn, .c-footer .c-btn'),
  ];
  if (!('IntersectionObserver' in window) || !targets.length) {
    bar.classList.add('is-on');
    return;
  }
  const onScreen = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      bar.classList.toggle('is-on', onScreen.size === 0);
    },
    { threshold: 0 }
  );
  targets.forEach((el) => observer.observe(el));
}
function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;
  let lastY = window.scrollY;
  let hidden = false;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const delta = y - lastY;
    header.classList.toggle('is-scrolled', y > SCROLL_THRESHOLD);
    header.classList.toggle('is-compact', y > COMPACT_THRESHOLD);
    if (Math.abs(delta) > SCROLL_DELTA) {
      if (delta > 0 && y > COMPACT_THRESHOLD) hidden = true;
      else if (delta < 0) hidden = false;
      lastY = y;
    }
    if (y <= COMPACT_THRESHOLD) hidden = false;
    header.classList.toggle('is-hidden', hidden);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
  return {
    reset() {
      hidden = false;
      lastY = window.scrollY;
      header.classList.remove('is-hidden');
    },
  };
}
function initDrawer(header) {
  const trigger = document.querySelector('[data-menu-trigger]');
  const drawer = document.querySelector('[data-drawer]');
  if (!trigger || !drawer) return;
  let lastFocused = null;
  const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';
  const setTriggerLabel = () => {
    trigger.setAttribute('aria-label', t(isOpen() ? 'closeMenu' : 'openMenu'));
  };
  const open = () => {
    lastFocused = document.activeElement;
    trigger.setAttribute('aria-expanded', 'true');
    drawer.classList.add('is-open');
    drawer.removeAttribute('inert');
    document.documentElement.classList.add('is-scroll-locked');
    // The trigger doubles as the close control, so the full-height header
    // must be showing while the menu is open.
    header?.reset();
    setTriggerLabel();
    const focusFirstItem = (attempt = 0) => {
      if (!isOpen()) return;
      const first = drawer.querySelector(FOCUSABLE);
      if (!first) return;
      first.focus();
      if (document.activeElement !== first && attempt < 5) {
        requestAnimationFrame(() => focusFirstItem(attempt + 1));
      }
    };
    focusFirstItem();
  };
  const close = ({ restoreFocus = true } = {}) => {
    trigger.setAttribute('aria-expanded', 'false');
    drawer.classList.remove('is-open');
    drawer.setAttribute('inert', '');
    document.documentElement.classList.remove('is-scroll-locked');
    setTriggerLabel();
    if (restoreFocus) {
      (lastFocused instanceof HTMLElement ? lastFocused : trigger).focus();
    }
  };
  trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  // Following a link closes the menu; focus goes to the section, not back to
  // the trigger.
  drawer.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) close({ restoreFocus: false });
  });
  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // The trigger sits outside the drawer but is part of the menu, so it is
    // included in the cycle — otherwise the close control is untabbable.
    const focusable = [
      trigger,
      ...drawer.querySelectorAll(FOCUSABLE),
    ].filter((el) => el.offsetParent !== null || el === trigger);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  // Crossing to desktop must not strand the scroll lock or the focus trap.
  window.matchMedia('(min-width: 64em)').addEventListener('change', (event) => {
    if (event.matches && isOpen()) close({ restoreFocus: false });
  });
  close({ restoreFocus: false });
  return { close, refreshLabel: setTriggerLabel };
}
function initScrollSpy() {
  const targets = SECTIONS
    .flatMap((section) => [section, ...(section.children ?? [])])
    // A page entry has no section in this document; getElementById returns
    // null and it drops out here, which is the right answer for it.
    .map((section) => document.getElementById(section.id))
    .filter(Boolean);
  if (targets.length === 0) return;
  const setCurrent = (id) => {
    document.querySelectorAll('[data-nav-link]').forEach((link) => {
      const isCurrent = link.getAttribute('href') === `#${id}`;
      if (isCurrent) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };
  const visible = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visible.set(entry.target.id, entry.intersectionRatio);
        } else {
          visible.delete(entry.target.id);
        }
      });
      if (visible.size === 0) return;
      // Whichever section occupies most of the reading band wins.
      const [topId] = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
      setCurrent(topId);
    },
    {
      // A band beneath the header — the section being read, not merely the one
      // touching the viewport edge.
      rootMargin: '-20% 0px -60% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    }
  );
  targets.forEach((target) => observer.observe(target));
}
function initLanguage(onChange) {
  const options = [...document.querySelectorAll('[data-lang]')];
  if (options.length === 0) return;
  const apply = (lang, { persist = true } = {}) => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    options.forEach((option) => {
      option.setAttribute('aria-pressed', String(option.dataset.lang === lang));
    });
    if (persist) {
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // Private browsing or storage disabled — the choice simply does not
        // persist across page loads.
      }
    }
    renderSurfaces();
    renderStrings();
    onChange?.();
  };
  options.forEach((option) => {
    option.addEventListener('click', () => apply(option.dataset.lang));
  });
  let stored = null;
  try {
    stored = localStorage.getItem(LANG_KEY);
  } catch {
    stored = null;
  }
  apply(stored === 'ar' || stored === 'en' ? stored : currentLang(), {
    persist: false,
  });
}
function initYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll('[data-year]').forEach((el) => {
    if (el.textContent.trim() !== year) el.textContent = year;
  });
}
function initNavigation() {
  renderSurfaces();
  renderStrings();
  initYear();
  const header = initHeader();
  const drawer = initDrawer(header);
  initLanguage(() => drawer?.refreshLabel());
  initScrollSpy();
  initPhoneAction();
}
let uid = 0;
const nextId = (prefix) => `${prefix}-${(uid += 1)}`;
function initAccordion(root) {
  const single = root.hasAttribute('data-accordion-single');
  const items = [...root.querySelectorAll('[data-accordion-trigger]')].map((trigger) => {
    // Keyed off the behaviour hook, not a style class: per the naming
    // convention, data-* attributes are what JavaScript binds to, so
    // restyling or renaming a component can never break its behaviour.
    const item = trigger.closest('[data-accordion-item]') ?? trigger.parentElement;
    const panel = item?.querySelector('[data-accordion-panel]');
    return panel ? { trigger, panel, item } : null;
  });
  const pairs = items.filter(Boolean);
  if (pairs.length === 0) return;
  const setExpanded = ({ trigger, panel }, expanded) => {
    trigger.setAttribute('aria-expanded', String(expanded));
    panel.dataset.collapsed = String(!expanded);
    // Keep collapsed content out of the tab order without display:none, so the
    // grid-rows transition still runs.
    if (expanded) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
  };
  pairs.forEach((pair) => {
    const { trigger, panel, item } = pair;
    if (!trigger.id) trigger.id = nextId('accordion-trigger');
    if (!panel.id) panel.id = nextId('accordion-panel');
    trigger.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', trigger.id);
    trigger.type = 'button';
    setExpanded(pair, item?.hasAttribute('data-accordion-open') ?? false);
    trigger.addEventListener('click', () => {
      const willExpand = trigger.getAttribute('aria-expanded') !== 'true';
      if (single && willExpand) {
        pairs.forEach((other) => other !== pair && setExpanded(other, false));
      }
      setExpanded(pair, willExpand);
    });
  });
  // Roving arrow-key movement between triggers, per the WAI-ARIA pattern.
  root.addEventListener('keydown', (event) => {
    const index = pairs.findIndex((pair) => pair.trigger === event.target);
    if (index === -1) return;
    const keys = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: pairs.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const target = (keys[event.key] + pairs.length) % pairs.length;
    pairs[target].trigger.focus();
  });
}
function initTabs(root) {
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const panels = [...root.querySelectorAll('[data-tab-panel]')];
  if (tabs.length === 0 || panels.length === 0) return;
  const panelFor = (key) => panels.find((panel) => panel.dataset.tabPanel === key);
  tabs.forEach((tab) => {
    const panel = panelFor(tab.dataset.tab);
    if (!panel) return;
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    if (!tab.id) tab.id = nextId('tab');
    if (!panel.id) panel.id = nextId('tabpanel');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
  });
  const select = (tab, { moveFocus = true } = {}) => {
    tabs.forEach((candidate) => {
      const selected = candidate === tab;
      candidate.setAttribute('aria-selected', String(selected));
      // Roving tabindex: only the selected tab is in the tab order.
      candidate.tabIndex = selected ? 0 : -1;
      const panel = panelFor(candidate.dataset.tab);
      if (!panel) return;
      panel.hidden = !selected;
      if (selected) {
        panel.dataset.entering = 'true';
        panel.addEventListener(
          'animationend',
          () => delete panel.dataset.entering,
          { once: true }
        );
      }
    });
    if (moveFocus) tab.focus();
  };
  root.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab && tabs.includes(tab)) select(tab, { moveFocus: false });
  });
  const list = root.querySelector('[role="tablist"]');
  const vertical = list?.getAttribute('aria-orientation') === 'vertical';
  root.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(event.target);
    if (index === -1) return;
    // A vertical tablist moves on Up/Down. A horizontal one moves on
    // Left/Right, swapped under RTL so travel follows the reading direction.
    const rtl = getComputedStyle(root).direction === 'rtl';
    const forward = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
    const keys = {
      [forward]: index + 1,
      [back]: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(tabs[(keys[event.key] + tabs.length) % tabs.length]);
  });
  // Opt-in hover activation for preview-style tablists. Fine pointers only —
  // on touch there is no hover, and tapping already selects. Focus is never
  // moved, so a mouse passing over the list cannot steal it from the keyboard.
  if (root.hasAttribute('data-tabs-hover') && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    tabs.forEach((tab) => {
      tab.addEventListener('pointerenter', () => select(tab, { moveFocus: false }));
    });
  }
  const initial = tabs.find((tab) => tab.hasAttribute('data-tab-selected')) ?? tabs[0];
  select(initial, { moveFocus: false });
}
function initTooltip(root) {
  const trigger = root.querySelector('[data-tooltip-trigger]');
  const bubble = root.querySelector('[data-tooltip-bubble]');
  if (!trigger || !bubble) return;
  if (!bubble.id) bubble.id = nextId('tooltip');
  bubble.setAttribute('role', 'tooltip');
  trigger.setAttribute('aria-describedby', bubble.id);
  // A bubble centred on a trigger near the viewport edge would be clipped.
  // Measure just before it shows and nudge it back inside. The bubble is
  // visibility:hidden rather than display:none, so it always has a box to
  // measure — no reflow thrash and no flash of a mispositioned tooltip.
  const EDGE = 16;
  const position = () => {
    bubble.style.setProperty('--tooltip-shift', '0px');
    const rect = bubble.getBoundingClientRect();
    const overflowStart = EDGE - rect.left;
    const overflowEnd = rect.right - (document.documentElement.clientWidth - EDGE);
    let shift = 0;
    if (overflowStart > 0) shift = overflowStart;
    else if (overflowEnd > 0) shift = -overflowEnd;
    bubble.style.setProperty('--tooltip-shift', `${Math.round(shift)}px`);
  };
  root.addEventListener('pointerenter', position);
  root.addEventListener('focusin', position);
}
function initExpandable(root) {
  const trigger = root.querySelector('[data-expand-trigger]');
  const panel = root.querySelector('[data-expand-panel]');
  if (!trigger || !panel) return;
  if (!trigger.id) trigger.id = nextId('expand-trigger');
  if (!panel.id) panel.id = nextId('expand-panel');
  trigger.type = 'button';
  trigger.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-labelledby', trigger.id);
  const staticAbove = root.dataset.expandStaticAbove;
  const mq = staticAbove ? window.matchMedia(`(min-width: ${staticAbove})`) : null;
  const setExpanded = (expanded) => {
    trigger.setAttribute('aria-expanded', String(expanded));
    panel.dataset.collapsed = String(!expanded);
    if (expanded) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
  };
  const apply = () => {
    // Above the breakpoint the panel is static content: always open, never
    // inert, and the trigger is out of the tree entirely rather than merely
    // hidden — so it cannot be reached by keyboard or screen reader.
    if (mq?.matches) {
      root.dataset.expandStatic = 'true';
      setExpanded(true);
      trigger.hidden = true;
    } else {
      root.dataset.expandStatic = 'false';
      trigger.hidden = false;
      setExpanded(trigger.getAttribute('aria-expanded') === 'true');
    }
  };
  trigger.addEventListener('click', () => {
    setExpanded(trigger.getAttribute('aria-expanded') !== 'true');
  });
  setExpanded(false);
  apply();
  mq?.addEventListener('change', apply);
}
function initDisclosure(scope = document) {
  scope.querySelectorAll('[data-accordion]').forEach(initAccordion);
  scope.querySelectorAll('[data-tabs]').forEach(initTabs);
  scope.querySelectorAll('[data-tooltip]').forEach(initTooltip);
  scope.querySelectorAll('[data-expand]').forEach(initExpandable);
}
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function initReveal() {
  const targets = [...document.querySelectorAll('[data-reveal], [data-reveal-group]')];
  if (targets.length === 0) return;
  const revealAll = () => targets.forEach((el) => el.classList.add('is-revealed'));
  // No IntersectionObserver, or motion is unwanted: show everything now.
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    revealAll();
    return;
  }
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        obs.unobserve(entry.target);
      });
    },
    // Fire slightly before the element reaches the fold so the transition has
    // finished by the time it is properly in view.
    { rootMargin: '0px 0px -12% 0px', threshold: 0.1 }
  );
  targets.forEach((target) => observer.observe(target));
  // If the preference changes mid-session, stop animating and settle.
  window
    .matchMedia('(prefers-reduced-motion: reduce)')
    .addEventListener('change', (event) => {
      if (event.matches) {
        observer.disconnect();
        revealAll();
      }
    });
}
const DURATION = 1400;
const easeOut = (t) => 1 - (1 - t) ** 3;
function animateCount(el) {
  const target = Number(el.dataset.countTo);
  if (!Number.isFinite(target)) return;
  const decimals = Number(el.dataset.countDecimals ?? 0);
  const locale = document.documentElement.lang || 'en';
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / DURATION, 1);
    el.textContent = format.format(target * easeOut(progress));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function initCounters() {
  const counters = [...document.querySelectorAll('[data-count-to]')];
  if (counters.length === 0) return;
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) return;
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );
  counters.forEach((counter) => observer.observe(counter));
}
function initMotion() {
  initReveal();
  document.documentElement.setAttribute('data-motion-ready', '');
  initCounters();
}
const REMEMBERED = 'pixora:about';
function initContact(scope = document) {
  scope.querySelectorAll('[data-contact-form]').forEach((form) => {
    const status = form.querySelector('[data-contact-status]');
    const about = form.querySelector('[data-contact-about]');
    const to = form.dataset.contactForm;
    const fallback = form.querySelector('[data-contact-fallback]');
    restoreAbout(about);
    wireFallback(form, fallback, to);
    form.addEventListener('submit', (event) => {
      // Let the browser run native validation first; if it fails, this
      // handler never sees the event.
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') ?? '').trim();
      const email = String(data.get('email') ?? '').trim();
      const message = String(data.get('message') ?? '').trim();
      // The visible label, not the id: the person reading the mail wants
      // "Social Growth — 400 USD", not "social:soc-growth".
      const chosen = about?.selectedOptions?.[0]?.value
        ? about.selectedOptions[0].textContent.trim()
        : '';
      const subject = [
        chosen || 'Project enquiry',
        name ? `— ${name}` : '',
      ].filter(Boolean).join(' ');
      const body = [
        chosen ? `About: ${chosen}` : '',
        chosen ? '' : null,
        message,
        '',
        `— ${name}`,
        email,
      ].filter((line) => line !== null && line !== '').join('\n');
      // encodeURIComponent, not the raw strings: an apostrophe or a line break
      // in the message would otherwise truncate the URL.
      const href = `mailto:${to}?subject=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`;
      window.location.href = href;
      if (status) status.textContent = t('formNote');
      if (fallback) fallback.hidden = false;
    });
  });
  initRemember(scope);
  initCopy(scope);
  watchLanguage(scope);
}
function wireFallback(form, fallback, address) {
  if (!fallback) return;
  const wa = fallback.querySelector('[data-contact-fallback-wa]');
  const channel = document.querySelector('.c-channel--primary[href*="wa.me"]');
  if (wa) {
    if (channel) {
      wa.href = channel.getAttribute('href');
      if (channel.dataset.waEn) wa.dataset.waEn = channel.dataset.waEn;
      if (channel.dataset.waAr) wa.dataset.waAr = channel.dataset.waAr;
      if (channel.hasAttribute('data-wa')) wa.setAttribute('data-wa', '');
    } else {
      wa.remove();
    }
  }
  const copy = fallback.querySelector('[data-contact-copy-address]');
  if (copy && address) copy.setAttribute('data-copy', address);
}
function initRemember(scope) {
  scope.querySelectorAll('[data-wa][data-about]').forEach((link) => {
    link.addEventListener('click', () => {
      try {
        sessionStorage.setItem(REMEMBERED, link.dataset.about);
      } catch {  }
    });
  });
}
function restoreAbout(select) {
  if (!select) return;
  let value = '';
  try {
    value = sessionStorage.getItem(REMEMBERED) ?? '';
  } catch { return; }
  if (!value) return;
  // A service-level CTA stores "branding"; the select holds "branding:tier-…".
  // Match the exact option, or the first one in that service's group.
  const exact = select.querySelector(`option[value="${CSS.escape(value)}"]`);
  const first = select.querySelector(`option[value^="${CSS.escape(value)}:"]`);
  const option = exact || first;
  if (option) select.value = option.value;
}
function initCopy(scope) {
  scope.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy;
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // Older browsers, and any context where the clipboard is denied.
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch { copied = false; }
        field.remove();
      }
      // Say what happened, never what was hoped for.
      button.textContent = t(copied ? 'copied' : 'copyFailed');
      button.dataset.i18n = copied ? 'copied' : 'copyFailed';
      window.setTimeout(() => {
        button.textContent = t('copyEmail');
        button.dataset.i18n = 'copyEmail';
      }, 2400);
    });
  });
}
function applyLanguage(scope) {
  const ar = document.documentElement.lang?.startsWith('ar');
  scope.querySelectorAll('[data-wa]').forEach((link) => {
    const next = ar ? link.dataset.waAr : link.dataset.waEn;
    if (next) link.setAttribute('href', next);
  });
  scope.querySelectorAll('option[data-label-ar], optgroup[data-label-ar]').forEach((el) => {
    if (!el.dataset.labelEn) {
      el.dataset.labelEn = el.tagName === 'OPTGROUP' ? el.label : el.textContent;
    }
    const value = ar ? el.dataset.labelAr : el.dataset.labelEn;
    if (el.tagName === 'OPTGROUP') el.label = value;
    else el.textContent = value;
  });
}
function watchLanguage(scope) {
  applyLanguage(scope);
  new MutationObserver(() => applyLanguage(scope))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}
const CHAPTERS = '.c-chapter, .c-chapter__joint';
function initStory() {
  const targets = [...document.querySelectorAll(CHAPTERS)];
  if (targets.length === 0) return;
  // No IntersectionObserver: draw everything now rather than nothing ever.
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-drawing'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-drawing');
        // Once drawn, it is drawn. Nothing here runs a second time.
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: '0px 0px -18% 0px',
      threshold: 0.15,
    }
  );
  targets.forEach((el) => observer.observe(el));
}
const NATURALLY_FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
function focusTarget(id) {
  if (!id) return;
  let target;
  try {
    target = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
  } catch {
    return;
  }
  if (!target) return;
  const borrowed = !target.matches(NATURALLY_FOCUSABLE);
  if (borrowed) {
    target.setAttribute('tabindex', '-1');
    // Hand it back, so the DOM looks the way it was authored.
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  }
  target.focus({ preventScroll: true });
}
function initFocus() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = link.getAttribute('href') || '';
    // Same document only. A link to another page takes its own focus with it.
    if (!href.startsWith('#') || href === '#') return;
    requestAnimationFrame(() => focusTarget(decodeURIComponent(href.slice(1))));
  });
  window.addEventListener('hashchange', () => {
    focusTarget(decodeURIComponent(window.location.hash.slice(1)));
  });
}
const seen = new Set();
function lang() {
  return document.documentElement.lang?.startsWith('ar') ? 'ar' : 'en';
}
function track(name, props = {}) {
  const detail = { ...props, lang: lang() };
  try {
    document.dispatchEvent(new CustomEvent('pixora:event', { detail: { name, ...detail } }));
    // Plausible, Umami, Fathom and Simple Analytics all expose a global with
    // this shape. If none is present, the event stays local — which is the
    // state until a provider is chosen.
    if (typeof window.plausible === 'function') window.plausible(name, { props: detail });
    else if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, detail);
  } catch {  }
}
function initAnalytics(scope = document) {
  // Conversions. `data-about` is the package or service the CTA carries, which
  // is the same value the WhatsApp message quotes.
  scope.querySelectorAll('[data-wa]').forEach((link) => {
    link.addEventListener('click', () => {
      track('channel_tap', { channel: 'whatsapp', about: link.dataset.about || 'general' });
    });
  });
  scope.querySelectorAll('.c-channel[href^="tel:"]').forEach((link) => {
    link.addEventListener('click', () => track('channel_tap', { channel: 'phone' }));
  });
  scope.querySelectorAll('.c-channel[href^="mailto:"]').forEach((link) => {
    link.addEventListener('click', () => track('channel_tap', { channel: 'email' }));
  });
  scope.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => track('channel_tap', { channel: 'copy' }));
  });
  // The form. `once` on the start event: engagement is a single fact, not a
  // count of keystrokes.
  scope.querySelectorAll('[data-contact-form]').forEach((form) => {
    form.addEventListener('focusin', () => {
      track('enquiry_started', { about: form.querySelector('[data-contact-about]')?.value || 'general' });
    }, { once: true });
    form.addEventListener('submit', () => {
      track('enquiry_sent', { about: form.querySelector('[data-contact-about]')?.value || 'general' });
    });
  });
  observePackages(scope);
}
function observePackages(scope) {
  const cards = [...scope.querySelectorAll('.c-tier')];
  if (!cards.length || !('IntersectionObserver' in window)) return;
  const timers = new WeakMap();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target;
      const id = card.querySelector('[data-about]')?.dataset.about
        || card.querySelector('.c-tier__name')?.textContent.trim();
      if (!id || seen.has(id)) { observer.unobserve(card); return; }
      if (entry.isIntersecting) {
        timers.set(card, window.setTimeout(() => {
          seen.add(id);
          track('package_view', { about: id });
          observer.unobserve(card);
        }, 1000));
      } else {
        window.clearTimeout(timers.get(card));
      }
    });
  }, { threshold: 0.5 });
  cards.forEach((card) => observer.observe(card));
}
const WIDE = '(min-width: 48em)';
function connectionIsCheap() {
  const c = navigator.connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !/(^|-)2g$/.test(c.effectiveType || '');
}
function initHeroFilm() {
  const film = document.querySelector('[data-hero-film]');
  if (!film) return;
  const video = film.querySelector('video[data-film-mp4]');
  if (!video) return;
  const wide = window.matchMedia(WIDE);
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  let started = false;
  const start = () => {
    if (started) return;
    if (!wide.matches || still.matches || !connectionIsCheap()) return;
    started = true;
    for (const [type, url] of [['video/webm', video.dataset.filmWebm], ['video/mp4', video.dataset.filmMp4]]) {
      if (!url) continue;
      const source = document.createElement('source');
      source.type = type;
      source.src = url;
      video.appendChild(source);
    }
    video.load();
    video.autoplay = true;
    const reveal = () => film.setAttribute('data-film-playing', '');
    video.addEventListener('playing', reveal, { once: true });
    const play = video.play();
    if (play && typeof play.catch === 'function') {
      play.catch(() => { started = false; });
    }
  };
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', function once() {
      if (document.visibilityState !== 'hidden') {
        document.removeEventListener('visibilitychange', once);
        start();
      }
    });
  } else {
    start();
  }
  const onChange = () => { if (!still.matches) start(); };
  wide.addEventListener('change', onChange);
  still.addEventListener('change', onChange);
}
const CHALLENGE_MOTION_OK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function readState(key) {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function saveState(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {  }
}
function drawTier(tiers) {
  const w = tiers.map((el) => Number(el.dataset.challengeWeight) || 1);
  const total = w.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < tiers.length; i += 1) {
    roll -= w[i];
    if (roll <= 0) return tiers[i];
  }
  return tiers[tiers.length - 1];
}
function showPane(root, name) {
  const panes = {
    intro: root.querySelector('[data-challenge-intro]'),
    quiz: root.querySelector('[data-challenge-quiz]'),
    wrong: root.querySelector('[data-challenge-wrong]'),
    spent: root.querySelector('[data-challenge-spent]'),
    won: root.querySelector('[data-challenge-won]'),
  };
  Object.entries(panes).forEach(([key, el]) => { if (el) el.hidden = key !== name; });
  root.dataset.challengeState = name;
  showStep(root, name);
}
const CHALLENGE_STEPS = ['brief', 'answer', 'reward'];
const CHALLENGE_STEP_OF = {
  intro: 'brief', quiz: 'answer', wrong: 'answer', spent: 'reward', won: 'reward',
};
function showStep(root, paneName) {
  const at = CHALLENGE_STEP_OF[paneName] || 'brief';
  const reached = CHALLENGE_STEPS.indexOf(at);
  root.querySelectorAll('[data-challenge-step]').forEach((el) => {
    const i = CHALLENGE_STEPS.indexOf(el.dataset.challengeStep);
    el.dataset.challengeAt = i < reached ? 'done' : i === reached ? 'now' : 'ahead';
    if (i === reached) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
}
function sweep(root) {
  const line = root.querySelector('[data-challenge-sweep]');
  if (!line || !CHALLENGE_MOTION_OK()) return;
  line.classList.add('is-running');
  line.addEventListener('animationend', () => line.classList.remove('is-running'), { once: true });
}
function showReward(root, tierId) {
  const tiers = [...root.querySelectorAll('[data-challenge-tier]')];
  const tier = tiers.find((el) => el.dataset.challengeTier === tierId) || tiers[0];
  tiers.forEach((el) => { el.dataset.challengeDrawn = el === tier ? 'yes' : 'no'; });
  const code = tier.dataset.challengeCode;
  const slot = root.querySelector('[data-challenge-code-slot]');
  if (slot) slot.textContent = code;
  const number = root.dataset.challengeWhatsapp;
  const claim = root.querySelector('[data-challenge-claim]');
  const percent = (tier.querySelector('.c-challenge__percent')?.textContent || '').trim();
  const prize = root.querySelector('[data-challenge-prize]');
  if (prize) prize.textContent = percent;
  if (claim && number && code) {
    const say = (lang) => (lang === 'ar'
      ? `مرحبًا بيكسورا — حللت تحدي العلامة وفزت بخصم ${percent}. الرمز: ${code}.`
      : `Hi Pixora — I solved the brand challenge and unlocked ${percent} off. Code: ${code}.`);
    const link = (lang) => `https://wa.me/${number}?text=${encodeURIComponent(say(lang))}`;
    claim.dataset.waEn = link('en');
    claim.dataset.waAr = link('ar');
    claim.setAttribute('data-wa', '');
    claim.setAttribute('target', '_blank');
    claim.setAttribute('rel', 'noopener noreferrer');
    if (!claim.querySelector('[data-newtab-note]')) {
      const note = document.createElement('span');
      note.className = 'u-visually-hidden';
      note.setAttribute('data-newtab-note', '');
      note.innerHTML = '<span data-lang-copy="en"> (opens in a new tab)</span>'
        + '<span data-lang-copy="ar" lang="ar"> (يفتح في نافذة جديدة)</span>';
      claim.append(note);
    }
    const ar = document.documentElement.lang?.startsWith('ar');
    claim.setAttribute('href', link(ar ? 'ar' : 'en'));
  }
  const share = root.querySelector('[data-challenge-share]');
  if (share && navigator.share) {
    share.hidden = false;
    share.addEventListener('click', (event) => {
      event.preventDefault();
      const ar = document.documentElement.lang?.startsWith('ar');
      navigator.share({
        title: document.title,
        text: ar ? 'حللتُ تحدي العلامة. هل تستطيع؟' : 'I solved the brand challenge. Can you?',
        url: `${location.origin}${location.pathname}#challenge-title`,
      }).catch(() => {  });
    });
  }
  showPane(root, 'won');
}
function initChallengeCopy(root) {
  const button = root.querySelector('[data-challenge-copy]');
  if (!button) return;
  const label = button.querySelector('span');
  button.addEventListener('click', async () => {
    const code = root.querySelector('[data-challenge-code-slot]')?.textContent.trim();
    if (!code) return;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; }
    catch {
      const field = document.createElement('textarea');
      field.value = code; field.setAttribute('readonly', '');
      field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      field.remove();
    }
    label.textContent = t(ok ? 'copied' : 'copyFailed');
    window.setTimeout(() => { label.textContent = t('rewardCopy'); }, 2400);
  });
}
function initChallenge(scope = document) {
  scope.querySelectorAll('[data-challenge]').forEach((root) => {
    const quiz = root.querySelector('[data-challenge-quiz]');
    const list = root.querySelector('[data-challenge-options]');
    if (!quiz || !list) return;
    const key = root.dataset.challengeStorage || 'pixora:challenge';
    const id = root.dataset.challengeId || '';
    const answer = root.dataset.challengeAnswer || '';
    const max = Number(root.dataset.challengeAttempts) || 2;
    const remainingSlot = root.querySelector('[data-challenge-remaining]');
    const dots = [...root.querySelectorAll('[data-challenge-dot]')];
    initChallengeCopy(root);
    const saved = readState(key);
    let used = saved && saved.id === id ? Number(saved.used) || 0 : 0;
    const setRemaining = () => {
      if (remainingSlot) remainingSlot.textContent = String(Math.max(0, max - used));
      dots.forEach((dot, i) => { dot.dataset.challengeDot = i < used ? 'spent' : 'left'; });
    };
    if (saved && saved.id === id && saved.done === 'won' && saved.tier) {
      showReward(root, saved.tier);
      return;
    }
    if (saved && saved.id === id && used >= max) { setRemaining(); showPane(root, 'spent'); return; }
    setRemaining();
    showPane(root, 'intro');
    const start = root.querySelector('[data-challenge-start]');
    if (start) {
      start.hidden = false;
      start.addEventListener('click', () => {
        if (root.dataset.challengeShuffle === 'true') {
          const items = [...list.children];
          for (let i = items.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
          }
          items.forEach((li, n) => {
            list.append(li);
            const marker = li.querySelector('.c-challenge__marker');
            if (marker) marker.textContent = String.fromCharCode(65 + n);
          });
        }
        showPane(root, 'quiz');
        list.querySelector('input')?.focus();
      });
    }
    root.querySelector('[data-challenge-retry]')?.addEventListener('click', () => {
      showPane(root, 'quiz');
      list.querySelector('input:checked')?.focus();
    });
    quiz.addEventListener('submit', (event) => {
      event.preventDefault();
      const picked = quiz.querySelector('[data-challenge-option]:checked');
      if (!picked) return;
      if (picked.value === answer) {
        const tier = drawTier([...root.querySelectorAll('[data-challenge-tier]')]);
        saveState(key, { id, used, done: 'won', tier: tier.dataset.challengeTier, at: Date.now() });
        sweep(root);
        window.setTimeout(() => showReward(root, tier.dataset.challengeTier), CHALLENGE_MOTION_OK() ? 460 : 0);
        return;
      }
      used += 1;
      setRemaining();
      saveState(key, { id, used, done: used >= max ? 'spent' : null, at: Date.now() });
      quiz.querySelectorAll('[data-challenge-option]').forEach((el) => { el.checked = false; });
      showPane(root, used >= max ? 'spent' : 'wrong');
    });
  });
}
function linePrice({ type, from = 0, factor = 1, quantity = 1, isPart = false }) {
  const unpriced = type === 'included' || type === 'quote';
  const unitAmount = unpriced ? 0 : Math.round(from * factor);
  const counted = type === 'unit' ? quantity : 1;
  const amount = unpriced || isPart ? 0 : unitAmount * counted;
  return { unitAmount, amount };
}
const SEL = '[data-build]';
const list = (el, sel) => Array.from(el.querySelectorAll(sel));
const ids = (el, attr) => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
function textIn(el, ar) {
  if (!el) return '';
  const want = el.querySelector(`[data-lang-copy="${ar ? 'ar' : 'en'}"]`);
  return (want || el).textContent.trim();
}
function readRows(root) {
  const rows = new Map();
  for (const li of list(root, '.c-pick[data-feature]')) {
    const id = li.dataset.feature;
    rows.set(id, {
      id,
      el: li,
      service: li.dataset.service,
      input: li.querySelector('[data-pick]'),
      qtyWrap: li.querySelector('.c-pick__qty'),
      qtyInput: li.querySelector('[data-qty]'),
      note: li.querySelector('[data-pick-note]'),
      label: li.querySelector('.c-pick__label'),
      priceType: li.dataset.priceType,
      price: li.dataset.price ? Number(li.dataset.price) : 0,
      monthly: li.dataset.period === 'monthly',
      composedOf: ids(li, 'data-composed-of'),
      optionsDriveQty: li.hasAttribute('data-options-drive-qty'),
      tierInputs: Array.from(li.querySelectorAll('[data-tier]')),
      tierWrap: li.querySelector('.c-pick__tiers'),
      tierFactors: new Map((li.getAttribute('data-tiers') || '').split(/\s+/).filter(Boolean)
        .map((pair) => { const [id, f] = pair.split(':'); return [id, Number(f)]; })),
      optionInputs: Array.from(li.querySelectorAll('[data-option]')),
      optionWrap: li.querySelector('.c-pick__options'),
      addonGroup: li.dataset.addonGroup || null,
      requires: ids(li, 'data-requires'),
      recommends: ids(li, 'data-recommends'),
      conflicts: ids(li, 'data-conflicts'),
      supersedes: ids(li, 'data-supersedes'),
      selectable: Boolean(li.querySelector('[data-pick]')),
    });
  }
  return rows;
}
const COPY = {
  addedFor: {
    en: (name) => `Added — ${name} needs it`,
    ar: (name) => `أُضيف — ${name} يحتاجه`,
  },
  replacedBy: {
    en: (name) => `Replaced by ${name}`,
    ar: (name) => `استُبدل بـ ${name}`,
  },
  notWith: {
    en: (name) => `Not available with ${name}`,
    ar: (name) => `غير متاح مع ${name}`,
  },
  chosen: { en: (n) => `Chosen: ${n}`, ar: (n) => `المختار: ${n}` },
  included: { en: 'Included', ar: 'مشمول' },
  currency: { en: 'USD', ar: 'دولار' },
  partOf: { en: (name) => `Included in ${name}`, ar: (name) => `مشمول ضمن ${name}` },
  covers: {
    en: (pkg, price, period) => `${pkg} covers everything you chose here — ${price} USD ${period}.`,
    ar: (pkg, price, period) => `باقة ${pkg} تغطي كل ما اخترته هنا — ${price} دولار ${period}.`,
  },
  once: { en: 'one-time', ar: 'لمرة واحدة' },
  monthlyWord: { en: 'monthly', ar: 'شهريًا' },
  quoted: { en: 'Quoted', ar: 'يُسعَّر لاحقًا' },
  quotedCount: {
    en: (n) => `${n === 1 ? 'One item' : `${n} items`} priced after we talk — nothing here is guessed at.`,
    ar: (n) => `${n === 1 ? 'بند واحد' : `${n} بنود`} تُسعَّر بعد الحديث معك — لا شيء هنا مُقدَّر بالتخمين.`,
  },
  consider: { en: 'Often taken with', ar: 'غالبًا ما يُؤخذ معه' },
  perMonth: { en: '/month', ar: 'شهريًا' },
  msgHead: {
    en: 'Hi Pixora — I built this scope on your site:',
    ar: 'مرحبًا بيكسورا — كوّنت نطاق العمل هذا على موقعكم:',
  },
  msgOnce: { en: 'One-time, from', ar: 'مرة واحدة، من' },
  msgMonthly: { en: 'Monthly, from', ar: 'شهريًا، من' },
  msgQuote: { en: 'Plus items to be quoted', ar: 'إضافة إلى بنود تُسعَّر لاحقًا' },
  msgMore: { en: (n) => `…and ${n} more`, ar: (n) => `…و${n} غيرها` },
  msgEstimate: {
    en: 'An estimate from your site, not a quotation.',
    ar: 'تقدير من موقعكم، وليس عرض سعر.',
  },
};
const say = (key, ar, ...args) => {
  const v = COPY[key][ar ? 'ar' : 'en'];
  return typeof v === 'function' ? v(...args) : v;
};
function initBuilder(scope = document) {
  const root = scope.querySelector(SEL);
  if (!root) return; // Every page but /pricing.
  const rows = readRows(root);
  if (!rows.size) return;
  const manual = new Set();
  const isAr = () => (document.documentElement.lang || '').startsWith('ar');
  const nameOf = (id) => textIn(rows.get(id)?.label, isAr());
  function closure(seed) {
    const out = new Set();
    const stack = [...seed];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id) || !rows.has(id)) continue;
      out.add(id);
      for (const q of rows.get(id).requires) if (rows.get(q)?.selectable) stack.push(q);
    }
    return out;
  }
  function derive() {
    const selected = closure(manual);
    const blocked = new Map();
    for (const id of selected) {
      const r = rows.get(id);
      if (!r) continue;
      for (const sup of r.supersedes) blocked.set(sup, { reason: 'replacedBy', by: id });
      for (const c of r.conflicts) blocked.set(c, { reason: 'notWith', by: id });
    }
    for (const id of selected) blocked.delete(id);
    const pulled = new Map();
    const reach = new Map([...manual].map((m) => [m, closure([m])]));
    for (const id of selected) {
      if (manual.has(id)) continue;
      for (const [m, set] of reach) if (set.has(id)) { pulled.set(id, m); break; }
    }
    for (const r of rows.values()) {
      if (!r.composedOf.length || selected.has(r.id)) continue;
      if (r.composedOf.every((part) => selected.has(part))) selected.add(r.id);
    }
    const partOf = new Map();
    for (const id of selected) {
      for (const part of rows.get(id)?.composedOf || []) {
        if (rows.has(part)) partOf.set(part, id);
      }
    }
    for (const part of partOf.keys()) selected.add(part);
    const active = new Set(selected);
    let grew = true;
    let guard = 0;
    while (grew && guard < 12) {
      grew = false; guard += 1;
      for (const r of rows.values()) {
        if (r.selectable || active.has(r.id)) continue;
        const serviceOn = [...active].some((id) => rows.get(id)?.service === r.service);
        if (serviceOn && r.requires.every((q) => active.has(q))) { active.add(r.id); grew = true; }
      }
    }
    return { blocked, needed: pulled, active, partOf };
  }
  function chosenOptions(r) {
    return r.optionInputs.filter((i) => i.checked).map((i) => i.value);
  }
  function tierOf(r) {
    if (!r.tierInputs.length) return null;
    const on = r.tierInputs.find((i) => i.checked);
    return on ? on.value : r.el.dataset.tierDefault || null;
  }
  function qtyOf(r) {
    if (r.optionsDriveQty) return Math.max(1, chosenOptions(r).length);
    if (!r.qtyInput) return 1;
    const n = Math.round(Number(r.qtyInput.value));
    const min = Number(r.qtyInput.min) || 1;
    const max = Number(r.qtyInput.max) || min;
    return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);
  }
  const scopeList = root.querySelector('[data-build-list]');
  const empty = root.querySelector('[data-build-empty]');
  const totals = root.querySelector('[data-build-totals]');
  const onceRow = root.querySelector('[data-build-once]');
  const onceAmt = root.querySelector('[data-build-once-amount]');
  const monthRow = root.querySelector('[data-build-monthly]');
  const monthAmt = root.querySelector('[data-build-monthly-amount]');
  const quoted = root.querySelector('[data-build-quoted]');
  const send = root.querySelector('[data-build-send]');
  const cheaper = root.querySelector('[data-build-cheaper]');
  const payloadEl = root.querySelector('[data-build-payload]');
  const CURRENCY_CODE = root.dataset.currency || 'USD';
  let ALLOWANCE = null;
  try { ALLOWANCE = JSON.parse(root.dataset.pageAllowance || 'null'); } catch { ALLOWANCE = null; }
  let PACKAGES = [];
  try {
    const el = document.getElementById('build-packages');
    if (el) PACKAGES = JSON.parse(el.textContent || '[]');
  } catch { PACKAGES = []; }
  const money = (n) => n.toLocaleString('en-US');
  function render() {
    const ar = isAr();
    const { blocked, needed, active, partOf } = derive();
    for (const r of rows.values()) {
      const b = blocked.get(r.id);
      const pulled = needed.get(r.id);
      if (r.input) {
        r.input.checked = active.has(r.id) && !b;
        r.input.disabled = Boolean(b);
      }
      r.el.dataset.state = b ? 'blocked' : (r.input?.checked || active.has(r.id) ? 'on' : '');
      let note = '';
      if (b) note = say(b.reason, ar, nameOf(b.by));
      else if (pulled) note = say('addedFor', ar, nameOf(pulled));
      if (r.note) {
        r.note.textContent = note;
        r.note.hidden = !note;
      }
      const on = Boolean(r.input && r.input.checked && !b);
      if (r.qtyWrap) r.qtyWrap.hidden = !on;
      if (r.tierWrap) r.tierWrap.hidden = !on;
      if (r.optionWrap) r.optionWrap.hidden = !on;
    }
    for (const details of list(root, '[data-build-service]')) {
      const svc = details.dataset.buildService;
      const n = [...active].filter((id) => rows.get(id)?.service === svc && rows.get(id)?.selectable).length;
      const badge = details.querySelector('[data-build-chosen]');
      if (badge) {
        badge.textContent = n ? say('chosen', ar, n) : '';
        badge.hidden = !n;
      }
    }
    const picked = [...active].map((id) => rows.get(id)).filter(Boolean);
    let once = 0; let month = 0; let quotes = 0;
    const perService = new Map();
    const lines = [];
    const entries = [];
    const services = [...new Set(picked.map((r) => r.service))];
    for (const svc of services) {
      const details = root.querySelector(`[data-build-service="${svc}"]`);
      const svcName = textIn(details?.querySelector('.c-build__name'), ar);
      const mine = picked.filter((r) => r.service === svc);
      if (!mine.length) continue;
      lines.push({ heading: svcName });
      for (const r of mine) {
        const q = qtyOf(r);
        const tier = tierOf(r);
        let price;
        if (partOf.has(r.id)) {
          price = say('partOf', ar, textIn(rows.get(partOf.get(r.id))?.label, ar));
        } else if (r.priceType === 'included') price = say('included', ar);
        else if (r.priceType === 'quote') { price = say('quoted', ar); quotes += 1; }
        else {
          const factor = tier ? (r.tierFactors.get(tier) || 1) : 1;
          const counted = (r.qtyInput || r.optionsDriveQty) ? q : 1;
          const sum = linePrice({ type: r.priceType, from: r.price, factor, quantity: counted }).amount;
          if (r.monthly) month += sum; else once += sum;
          perService.set(r.service, (perService.get(r.service) || 0) + sum);
          price = `${money(sum)} ${say('currency', ar)}${r.monthly ? ` ${say('perMonth', ar)}` : ''}`;
        }
        const level = tier && r.tierInputs.length
          ? textIn(r.tierInputs.find((i) => i.value === tier)?.closest('.c-pick__tier')
            ?.querySelector('.c-pick__tier-label'), ar)
          : '';
        const opts = r.optionInputs.length
          ? chosenOptions(r).map((id) => textIn(
            r.optionInputs.find((i) => i.value === id)?.closest('.c-pick__option')
              ?.querySelector('.c-pick__option-label'), ar)).filter(Boolean)
          : [];
        let name = level || textIn(r.label, ar);
        if (opts.length) name += ` — ${opts.join(ar ? '، ' : ', ')}`;
        else if ((r.qtyInput || r.optionsDriveQty) && q > 1) name += ` × ${q}`;
        lines.push({ name, price });
        const factor = tier ? (r.tierFactors.get(tier) || 1) : 1;
        const counted = (r.qtyInput || r.optionsDriveQty) ? q : 1;
        const priced = linePrice({ type: r.priceType, from: r.price, factor, quantity: counted, isPart: partOf.has(r.id) });
        const entry = {
          featureId: r.id,
          serviceId: r.service,
          quantity: counted,
          origin: manual.has(r.id) ? 'chosen'
            : (partOf.has(r.id) ? 'part'
              : (needed.has(r.id) ? 'required' : 'included')),
          pricing: {
            type: partOf.has(r.id) ? 'part' : r.priceType,
            billing: r.monthly ? 'monthly' : 'once',
            unitAmount: priced.unitAmount,
            amount: priced.amount,
          },
        };
        if (tier) entry.tier = tier;
        if (r.optionInputs.length) entry.options = chosenOptions(r);
        if (r.addonGroup) entry.addonGroup = r.addonGroup;
        if (partOf.has(r.id)) entry.partOf = partOf.get(r.id);
        if (r.composedOf.length) entry.composedOf = [...r.composedOf];
        entries.push(entry);
      }
    }
    const suggestions = [...new Set(
      [...manual].flatMap((id) => rows.get(id)?.recommends || [])
        .filter((id) => rows.has(id) && !active.has(id) && !blocked.has(id)),
    )].slice(0, 4);
    if (scopeList) {
      scopeList.textContent = '';
      for (const line of lines) {
        const li = document.createElement('li');
        if (line.heading) {
          li.className = 'c-build__chosen-head';
          const h = document.createElement('span');
          h.className = 'c-build__chosen-service';
          h.textContent = line.heading;
          li.append(h);
        } else {
          const n = document.createElement('span');
          n.textContent = line.name;
          const p = document.createElement('span');
          p.className = 'c-build__chosen-price';
          p.textContent = line.price;
          li.append(n, p);
        }
        scopeList.append(li);
      }
      if (suggestions.length) {
        const li = document.createElement('li');
        li.className = 'c-build__chosen-head';
        const h = document.createElement('span');
        h.className = 'c-build__chosen-service';
        h.textContent = say('consider', ar);
        const body = document.createElement('span');
        body.textContent = suggestions.map(nameOf).join(ar ? '، ' : ', ');
        li.append(h, body);
        scopeList.append(li);
      }
      scopeList.hidden = !lines.length;
    }
    if (empty) empty.hidden = lines.length > 0;
    if (totals) totals.hidden = !lines.length;
    if (onceRow) { onceRow.hidden = once <= 0; if (onceAmt) onceAmt.textContent = money(once); }
    if (monthRow) { monthRow.hidden = month <= 0; if (monthAmt) monthAmt.textContent = money(month); }
    if (quoted) {
      quoted.textContent = quotes ? say('quotedCount', ar, quotes) : '';
      quoted.hidden = !quotes;
    }
    const covering = [];
    if (cheaper) {
      const suggestions = [];
      for (const cat of PACKAGES) {
        const wanted = [...active].filter((id) => rows.get(id)?.service === cat.service
          && rows.get(id)?.selectable && !partOf.has(id));
        if (!wanted.length) continue;
        const fits = cat.tiers.filter((t) => {
          const has = new Map(t.contents.map((c) => [c.ref, c]));
          return wanted.every((id) => {
            const c = has.get(id);
            if (!c) return false;
            const r = rows.get(id);
            const mine = qtyOf(r);
            const theirs = c.qty ?? mine;
            if (mine > theirs) return false;
            const tier = tierOf(r);
            if (tier && r.tierFactors.size) {
              const order = [...r.tierFactors.keys()];
              if (order.indexOf(c.tier) < order.indexOf(tier)) return false;
            }
            return true;
          });
        });
        if (!fits.length) continue;
        const best = fits.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b));
        const period = say(best.billing === 'billingMonthly' ? 'monthlyWord' : 'once', ar);
        suggestions.push(say('covers', ar, best.name, money(Number(best.price)), period));
        covering.push({
          packageId: best.id,
          serviceId: cat.service,
          name: best.name,
          price: {
            amount: Number(best.price),
            currency: CURRENCY_CODE,
            billing: best.billing === 'billingMonthly' ? 'monthly' : 'once',
            from: Boolean(best.from),
          },
          coversEverythingChosen: true,
        });
      }
      cheaper.textContent = suggestions.join(' ');
      cheaper.hidden = !suggestions.length;
    }
    {
      const build = (lang) => {
        const a = lang === 'ar';
        const out = [say('msgHead', a)];
        let shown = 0;
        for (const line of lines) {
          if (line.heading) { out.push(`\n${line.heading}`); continue; }
          if (shown >= 25) continue;
          out.push(`• ${line.name} — ${line.price}`);
          shown += 1;
        }
        const hidden = lines.filter((l) => !l.heading).length - shown;
        if (hidden > 0) out.push(say('msgMore', a, hidden));
        out.push('');
        if (once > 0) out.push(`${say('msgOnce', a)} ${money(once)} ${say('currency', a)}`);
        if (month > 0) out.push(`${say('msgMonthly', a)} ${money(month)} ${say('currency', a)}`);
        if (quotes > 0) out.push(`${say('msgQuote', a)}: ${quotes}`);
        out.push(say('msgEstimate', a));
        return out.join('\n');
      };
      const base = send ? (send.dataset.waEn || '') : '';
      const wa = /^https:\/\/wa\.me\/(\d+)/.exec(base);
      if (send && wa && lines.length) {
        send.dataset.waEn = `https://wa.me/${wa[1]}?text=${encodeURIComponent(build('en'))}`;
        send.dataset.waAr = `https://wa.me/${wa[1]}?text=${encodeURIComponent(build('ar'))}`;
        send.href = ar ? send.dataset.waAr : send.dataset.waEn;
      }
      if (payloadEl) {
        const byService = new Map();
        for (const e of entries) {
          if (!byService.has(e.serviceId)) byService.set(e.serviceId, []);
          byService.get(e.serviceId).push(e);
        }
        const servicesOut = [...byService.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([serviceId, list]) => ({
            serviceId,
            features: [...list].sort((a, b) => (a.featureId < b.featureId ? -1 : 1)),
          }));
        const scope = {};
        if (ALLOWANCE) {
          const buildsPages = (ALLOWANCE.builtBy || []).some((id) => active.has(id));
          if (buildsPages) {
            const extra = entries.find((e) => e.featureId === ALLOWANCE.beyondFirst);
            scope.pages = (ALLOWANCE.firstPageIncluded ? 1 : 0) + (extra ? extra.quantity : 0);
          }
        }
        const priced = entries.filter((e) => e.pricing.amount > 0);
        const payload = {
          version: '1.0',
          source: 'pixora.package-builder',
          currency: CURRENCY_CODE,
          language: ar ? 'ar' : 'en',
          services: servicesOut,
          addons: entries.filter((e) => e.addonGroup)
            .map((e) => ({
              featureId: e.featureId,
              serviceId: e.serviceId,
              addonGroup: e.addonGroup,
              quantity: e.quantity,
              amount: e.pricing.amount,
            }))
            .sort((a, b) => (a.featureId < b.featureId ? -1 : 1)),
          packages: [...covering].sort((a, b) => (a.packageId < b.packageId ? -1 : 1)),
          pricing: {
            currency: CURRENCY_CODE,
            subtotal: { oneTime: once, monthly: month },
            discount: { oneTime: 0, monthly: 0 },
            total: { oneTime: once, monthly: month },
            quotedItems: quotes,
            lineItems: priced.length,
          },
          message: build(ar ? 'ar' : 'en'),
        };
        if (Object.keys(scope).length) payload.scope = scope;
        if (!entries.length) {
          payloadEl.textContent = '{}';
        } else {
          payloadEl.textContent = JSON.stringify(payload);
        }
        root.dispatchEvent(new CustomEvent('pixora:scope', {
          bubbles: true,
          detail: entries.length ? payload : null,
        }));
      }
    }
  }
  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-pick]');
    if (box) {
      const id = box.value;
      if (box.checked) {
        for (const gone of [...rows.get(id).supersedes, ...rows.get(id).conflicts]) manual.delete(gone);
        manual.add(id);
      } else {
        manual.delete(id);
        for (const m of [...manual]) if (closure([m]).has(id)) manual.delete(m);
      }
      render();
      return;
    }
    if (e.target.closest('[data-tier]') || e.target.closest('[data-option]')) { render(); return; }
    const qty = e.target.closest('[data-qty]');
    if (qty) {
      const row = rows.get(qty.dataset.qty);
      if (row) qty.value = String(qtyOf(row));
      render();
    }
  });
  root.addEventListener('submit', (e) => e.preventDefault());
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => render())
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  render();
}
function boot() {
  // Before the rest: every other module's links inherit this behaviour.
  initFocus();
  initNavigation();
  initDisclosure();
  initMotion();
  initContact();
  // No-op on every page without chapters, which is every page but one.
  initStory();
  // Decoration, so it runs after everything the page needs to work. No-op on
  // every page but the homepage, and usually a no-op there too — see the
  // four reasons it declines in hero-film.js.
  initHeroFilm();
  // Marketing, not machinery: it enhances a panel that already reads correctly
  // without it, and is a no-op on every page that has no challenge.
  initChallenge();
  // The package builder. A no-op on every page but /pricing, and there it
  // enhances a catalogue that is already complete in the markup: with this
  // module absent the page is still every service, every feature and every
  // price, in both languages.
  initBuilder();
  // Last: it only listens, and it must never be the reason something else
  // failed to initialise.
  initAnalytics();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
})();
