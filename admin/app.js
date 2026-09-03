/**
 * عون الدرب — shared admin API client (RECOVERY 01, §28).
 *
 * One place that knows how to talk to the backend, so eight self-contained
 * pages do not each grow their own fetch. It does four things:
 *
 *   · carries the CSRF token on every state-changing call
 *   · turns a 401 into a return to the login page, once, without a loop
 *   · turns a 403 into a message an operator can act on
 *   · never lets a failed call look like a successful one
 *
 * The UI is untouched: pages call AunAPI and render exactly what they rendered
 * before, from real rows instead of a literal array.
 */
(function (global) {
  "use strict";

  var BASE = "/api";
  var csrfToken = null;
  var redirecting = false;

  function readCookie(name) {
    var parts = String(document.cookie || "").split(";");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p.indexOf(name + "=") === 0) return decodeURIComponent(p.slice(name.length + 1));
    }
    return null;
  }

  /* The token is readable from its own cookie; /api/csrf is the fallback for a
     first load, or after the session rotated it. */
  function csrf() {
    if (csrfToken) return Promise.resolve(csrfToken);
    var c = readCookie("aun_csrf");
    if (c) { csrfToken = c; return Promise.resolve(c); }
    return fetch(BASE + "/csrf", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (b) { csrfToken = (b && b.token) || null; return csrfToken; });
  }

  function toLogin() {
    if (redirecting) return;
    redirecting = true;
    var here = (location.pathname.split("/").pop() || "dashboard.html");
    location.href = "login.html?next=" + encodeURIComponent(here) + "&reason=session";
  }

  /**
   * Every response passes through here. An error is an Error with `.status`,
   * `.code` and `.errors` — the caller decides what to show, but it can never
   * mistake a rejection for data.
   */
  function handle(res) {
    return res.text().then(function (text) {
      var body = null;
      try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }

      if (res.status === 401) { toLogin(); }
      if (res.ok && body && body.ok !== false) return body;

      var err = new Error((body && body.error && body.error.message) || "تعذّر إتمام العملية.");
      err.status = res.status;
      err.code = (body && body.error && body.error.code) || "http_" + res.status;
      err.errors = (body && body.errors) || null;
      throw err;
    });
  }

  function get(path, params) {
    var qs = "";
    if (params) {
      var pairs = [];
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v === null || v === undefined || v === "") return;
        pairs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
      });
      if (pairs.length) qs = "?" + pairs.join("&");
    }
    return fetch(BASE + path + qs, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    }).then(handle);
  }

  function post(path, data) {
    return csrf().then(function (token) {
      var payload = {};
      Object.keys(data || {}).forEach(function (k) { payload[k] = data[k]; });
      payload.csrf_token = token;
      return fetch(BASE + path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(payload)
      }).then(function (res) {
        /* the token rotated under us — fetch a fresh one and retry once */
        if (res.status === 419 && !post._retried) {
          post._retried = true;
          csrfToken = null;
          return csrf().then(function () { return post(path, data); })
            .then(function (r) { post._retried = false; return r; });
        }
        post._retried = false;
        return handle(res).then(function (body) {
          /* Anything that changes what the website could show moves the
             "not published yet" count. Hooked here rather than at each call
             site, so a new endpoint cannot forget to do it. */
          if (CHANGES_SITE.test(path)) refreshPending();
          return body;
        });
      });
    });
  }

  /* endpoints whose success can change what a publish would write */
  var CHANGES_SITE =
    /^\/admin\/(content\/(block|item|item\/new|item\/del|reorder)|services\/(save|reorder)|settings\/save|restore)$/;

  global.AunAPI = {
    get: get,
    post: post,
    csrf: csrf,
    toLogin: toLogin,

    me: function () { return get("/auth/me"); },
    onUser: function (fn) { return onUser(fn); },
    refreshPending: function () { return refreshPending(); },
    can: function (m, a) { return can(m, a); },
    logout: function () {
      return post("/auth/logout", {}).then(function () { location.href = "login.html"; });
    },

    summary:       function ()      { return get("/admin/summary"); },
    requests:      function (f)     { return get("/admin/requests", f); },
    request:       function (ref)   { return get("/admin/requests/show", { id: ref }); },
    setStatus:     function (r, s)  { return post("/admin/requests/status", { id: r, status: s }); },
    addNote:       function (r, b)  { return post("/admin/requests/notes", { id: r, body: b }); },
    customers:     function (q)     { return get("/admin/customers", { q: q }); },
    services:      function ()      { return get("/admin/services"); },
    media:         function ()      { return get("/admin/media"); },
    users:         function ()      { return get("/admin/users"); },
    activity:      function (f)     { return get("/admin/activity", f); },
    /* multipart: the browser sets the boundary, so no Content-Type here */
    uploadMedia: function (formData) {
      return csrf().then(function (token) {
        formData.append("csrf_token", token);
        return fetch(BASE + "/admin/media/upload", {
          method: "POST", credentials: "same-origin", body: formData,
          headers: { Accept: "application/json", "X-CSRF-Token": token }
        }).then(handle);
      });
    },
    createService: function (data) { return post("/admin/services/new", data); },
    pending:       function ()      { return get("/admin/content/pending"); },
    publish:       function ()      { return post("/admin/content/publish", {}); },
    previewUrl:    function ()      { return BASE + "/admin/content/preview"; },
    notifications: function ()      { return get("/admin/notifications"); },
    readNotification: function (id, read) {
      return post("/admin/notifications/read", id === null ? { all: 1 } : { id: id, read: read ? 1 : 0 });
    },
    settings:      function (c)     { return get("/admin/settings", { category: c }); },

    /* Stage 6 — passwords. Nothing here ever returns a password: these send
       one and read back only whether it was accepted. */
    changePassword: function (current, next) {
      return post("/auth/password", { current: current, password: next });
    },
    resetUserPassword: function (id, next) {
      return post("/admin/users/password", { id: id, password: next });
    },
    unlockUser:    function (id)    { return post("/admin/users/unlock", { id: id }); },

    /* Stage 6 — backup. The download is a plain navigation rather than a
       fetch, so the browser saves the file instead of holding the whole
       database in a JavaScript string. */
    backupUrl:     function ()      { return BASE + "/admin/backup"; },
    /* Sent as the request body rather than as a file upload: a real backup
       of this system passes PHP's default 2 MB upload_max_filesize, which the
       operator often cannot change, while the body is bounded by the larger
       post_max_size instead. The endpoint still accepts an upload for
       whoever prefers one. */
    restore: function (backup) {
      return post("/admin/restore", { confirm: "استعادة", backup: backup });
    }
  };

  /**
   * Wire the shell every admin page already has: the account menu's logout
   * button, and the header's identity. No markup is added — these elements
   * exist on all nine pages already.
   */
  /* Callbacks queued before /auth/me answered. A page asks "may I edit?" as
     soon as its script runs, which is usually before the reply is back. */
  var waiting = [];

  /**
   * Run fn once the signed-in user is known — immediately if the reply has
   * already arrived. The single place a page learns who it is serving.
   */
  function onUser(fn) {
    if (global.AunUser) { fn(global.AunUser); return; }
    waiting.push(fn);
  }

  /**
   * What the signed-in user may do in one module, read from the matrix the
   * server computed. This hides controls; it does not authorize anything.
   * Every write is checked again in the dispatcher, and the two are allowed
   * to disagree only in the direction of the server saying no (§10).
   */
  function can(module, action) {
    var u = global.AunUser;
    if (!u || !u.permissions) return false;
    var m = u.permissions[module];
    return !!(m && m[action || "view"]);
  }

  function wireShell() {
    /* The account menu, wired here so all eleven module pages get one
       implementation. Two of its three items used to do nothing at all —
       «معلومات الحساب» on every page, and «تغيير كلمة المرور» on the five
       pages that had it (six pages did not offer it) — so the menu looked
       complete and only logout worked. Every item is hooked by data-acct now,
       and the menu is the same three items everywhere. */
    Array.prototype.forEach.call(document.querySelectorAll("[data-acct]"), function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMenus();
        var what = b.getAttribute("data-acct");
        if (what === "logout") {
          AunAPI.logout().catch(function () { location.href = "login.html"; });
        } else if (what === "info") {
          openAccountInfo();
        } else if (what === "password") {
          openPasswordDialog();
        }
      });
    });

    AunAPI.me().then(function (r) {
      var u = r.user;
      if (!u) return;
      var initials = String(u.name || "").trim().split(/\s+/).map(function (w) {
        return (w.length > 2 && w.slice(0, 2) === "ال") ? w.slice(2) : w;
      }).slice(0, 2).map(function (w) { return w.charAt(0); }).join(" ");

      Array.prototype.forEach.call(document.querySelectorAll(".who__av"), function (el) {
        el.textContent = initials;
      });
      var n = document.getElementById("whoname");
      if (n && n.firstChild) n.firstChild.nodeValue = u.name;
      var n2 = document.getElementById("whoname2");
      if (n2) n2.textContent = u.name;
      Array.prototype.forEach.call(document.querySelectorAll("#whorole, #whorole2"), function (el) {
        el.textContent = u.roleLabel || "";
      });
      global.AunUser = u;
      waiting.forEach(function (fn) { try { fn(u); } catch (e) {} });
      waiting.length = 0;
      document.dispatchEvent(new CustomEvent("aun:user", { detail: u }));
    }).catch(function () { /* handle() already redirected on 401 */ });
  }


  /* ------------------------------------------------------------------ */
  /* the account menu's two dialogs                                      */
  /* ------------------------------------------------------------------ */

  /* Built here rather than in each page's markup, because the menu is in the
     shared header and its items have to work wherever you happen to be. Two
     pages (dashboard, activity) do not define the form classes the others do,
     so these carry their own styles — every colour and measure through a
     var() with a fallback, so nothing depends on a token a page may not have. */
  var STYLE_ID = "aun-acct-style";
  var CSS =
    '.aun-dlg{position:fixed;inset:0;z-index:120;display:grid;place-items:center;' +
      'padding:1rem;background:rgba(15,23,34,.45)}' +
    '.aun-dlg[hidden]{display:none}' +
    '.aun-dlg__box{background:var(--white,#fff);color:var(--ink,#1E2733);' +
      'border-radius:var(--r-modal,16px);box-shadow:0 12px 28px rgba(20,32,50,.14),0 32px 64px rgba(20,32,50,.16);' +
      'padding:1.5rem;width:min(28rem,100%);max-height:calc(100vh - 2rem);overflow:auto;' +
      'font-family:var(--f-ar,inherit)}' +
    '.aun-dlg__h{display:flex;align-items:flex-start;gap:.75rem;margin-bottom:.25rem}' +
    '.aun-dlg__ic{inline-size:40px;block-size:40px;border-radius:50%;display:grid;place-items:center;' +
      'flex:0 0 auto;background:var(--mist,#EEF3FA);color:var(--navy,#22406F)}' +
    '.aun-dlg__t{font-size:1.0625rem;font-weight:600;line-height:1.35}' +
    '.aun-dlg__d{font-family:var(--f-ar-body,inherit);font-size:.875rem;color:var(--slate,#5A6675);' +
      'line-height:1.7;margin:.35rem 0 0}' +
    '.aun-dlg__b{margin-top:1.25rem;display:flex;flex-direction:column;gap:.9rem}' +
    '.aun-dlg__f{margin-top:1.5rem;display:flex;gap:.5rem;flex-wrap:wrap}' +
    '.aun-fld{display:flex;flex-direction:column;gap:.35rem}' +
    '.aun-fld > span{font-size:.8125rem;font-weight:600;color:var(--ink,#1E2733)}' +
    '.aun-fld input{font:inherit;font-size:.9375rem;color:var(--ink,#1E2733);' +
      'background:var(--white,#fff);border:1px solid var(--control-border,#8B95A3);' +
      'border-radius:var(--r-control,8px);min-height:44px;padding:.5rem .75rem;' +
      'direction:ltr;text-align:left;font-family:var(--f-mono,ui-monospace,monospace)}' +
    '.aun-fld input:focus{outline:2px solid var(--blue,#4975BA);outline-offset:1px}' +
    '.aun-fld input.is-bad{border-color:var(--error,#C0433B)}' +
    '.aun-fld em{font-style:normal;font-size:.8125rem;color:var(--slate,#5A6675);' +
      'font-family:var(--f-ar-body,inherit)}' +
    '.aun-err{font-size:.8125rem;color:var(--error,#C0433B);font-family:var(--f-ar-body,inherit)}' +
    '.aun-err[hidden]{display:none}' +
    '.aun-btn{font:inherit;font-weight:600;font-size:.9375rem;min-height:44px;padding:0 1.1rem;' +
      'border-radius:var(--r-control,8px);border:1px solid transparent;cursor:pointer;' +
      'background:var(--navy,#22406F);color:#fff}' +
    '.aun-btn:hover{background:var(--blue-pressed,#1A3358)}' +
    '.aun-btn:disabled{opacity:.6;cursor:default}' +
    '.aun-btn--ghost{background:var(--white,#fff);color:var(--navy,#22406F);' +
      'border-color:var(--control-border,#CBD4E1)}' +
    '.aun-btn--ghost:hover{background:var(--mist,#EEF3FA)}' +
    '.aun-dl{display:grid;gap:.65rem;margin:0}' +
    '.aun-dl > div{display:flex;justify-content:space-between;gap:1rem;' +
      'border-bottom:1px solid var(--divider,#E4E9F0);padding-bottom:.55rem}' +
    '.aun-dl > div:last-child{border-bottom:0;padding-bottom:0}' +
    '.aun-dl dt{font-size:.8125rem;color:var(--slate,#5A6675);font-family:var(--f-ar-body,inherit)}' +
    '.aun-dl dd{margin:0;font-size:.875rem;font-weight:600;text-align:left;direction:ltr;min-width:0;' +
      'overflow-wrap:anywhere}';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* Close the header popovers the way the pages' own shell does: they are
     plain [hidden] toggles with an aria-expanded button beside them. */
  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll("#whopop, #notifpop"), function (p) {
      p.hidden = true;
    });
    Array.prototype.forEach.call(document.querySelectorAll("#whobtn, #bell"), function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }

  var openDialog = null;

  function buildDialog(title, description, icon, kind) {
    ensureStyle();
    if (openDialog) { openDialog.remove(); openDialog = null; }
    var wrap = document.createElement("div");
    wrap.className = "aun-dlg";
    /* Named so the three can be told apart — by a person reading the DOM and
       by the gate, which otherwise reads the success confirmation as the form
       it replaced and reports a working change as a failure. */
    wrap.setAttribute("data-dlg", kind || "message");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    var box = document.createElement("div");
    box.className = "aun-dlg__box";
    var head = document.createElement("div");
    head.className = "aun-dlg__h";
    head.innerHTML =
      '<span class="aun-dlg__ic" aria-hidden="true"><svg class="i" width="20" height="20" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"><use href="#' + icon + '"/></svg></span>' +
      '<div><h2 class="aun-dlg__t"></h2><p class="aun-dlg__d"></p></div>';
    head.querySelector(".aun-dlg__t").textContent = title;
    head.querySelector(".aun-dlg__d").textContent = description;
    var body = document.createElement("div");
    body.className = "aun-dlg__b";
    var foot = document.createElement("div");
    foot.className = "aun-dlg__f";
    box.appendChild(head); box.appendChild(body); box.appendChild(foot);
    wrap.appendChild(box);
    document.body.appendChild(wrap);

    var restore = document.activeElement;
    function close() {
      wrap.remove();
      openDialog = null;
      document.removeEventListener("keydown", onKey);
      if (restore && restore.focus) restore.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { close(); return; }
      /* keep the tab ring inside the dialog while it is open */
      if (e.key !== "Tab") return;
      var f = wrap.querySelectorAll("input,button,select,textarea,a[href]");
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey);
    openDialog = wrap;

    var titleId = "aun-dlg-t-" + Date.now();
    head.querySelector(".aun-dlg__t").id = titleId;
    wrap.setAttribute("aria-labelledby", titleId);
    return { wrap: wrap, body: body, foot: foot, close: close };
  }

  function labelled(labelText, help) {
    var l = document.createElement("label");
    l.className = "aun-fld";
    var s = document.createElement("span");
    s.textContent = labelText;
    var i = document.createElement("input");
    i.type = "password";
    i.autocomplete = "new-password";
    l.appendChild(s); l.appendChild(i);
    if (help) { var em = document.createElement("em"); em.textContent = help; l.appendChild(em); }
    var err = document.createElement("span");
    err.className = "aun-err"; err.hidden = true;
    l.appendChild(err);
    return { label: l, input: i, err: err };
  }

  /* ---- معلومات الحساب — read-only, from /auth/me ---------------------- */
  function openAccountInfo() {
    var d = buildDialog("معلومات الحساب",
      "ما يعرفه النظام عن حسابك. لا يمكن تعديله من هنا — الاسم والبريد والدور يغيّرها مدير النظام من صفحة المستخدمين.",
      "ic-user", "account");
    var dl = document.createElement("dl");
    dl.className = "aun-dl";
    dl.innerHTML = '<div><dt>جارٍ التحميل…</dt><dd></dd></div>';
    d.body.appendChild(dl);

    var ok = document.createElement("button");
    ok.type = "button"; ok.className = "aun-btn"; ok.textContent = "إغلاق";
    ok.addEventListener("click", d.close);
    d.foot.appendChild(ok);
    ok.focus();

    AunAPI.me().then(function (r) {
      var u = r.user || {};
      var mods = u.permissions || {};
      var can = Object.keys(mods).filter(function (m) { return mods[m] && mods[m].view; }).length;
      var rows = [
        ["الاسم", u.name || "—"],
        ["البريد الإلكتروني", u.email || "—"],
        ["الدور", u.roleLabel || u.role || "—"],
        ["الأقسام المتاحة", String(can) + " من " + String(Object.keys(mods).length)]
      ];
      dl.textContent = "";
      rows.forEach(function (row) {
        var div = document.createElement("div");
        var dt = document.createElement("dt"); dt.textContent = row[0];
        var dd = document.createElement("dd"); dd.textContent = row[1];
        /* the name and the role read right-to-left; the address does not */
        if (row[0] !== "البريد الإلكتروني") { dd.style.direction = "rtl"; dd.style.textAlign = "right"; }
        div.appendChild(dt); div.appendChild(dd); dl.appendChild(div);
      });
    }).catch(function () {
      dl.textContent = "";
      var div = document.createElement("div");
      div.innerHTML = '<dt>تعذّر تحميل بيانات الحساب.</dt><dd></dd>';
      dl.appendChild(div);
    });
  }

  /* ---- تغيير كلمة المرور --------------------------------------------- */
  var PASSWORD_MIN = 12;

  function openPasswordDialog() {
    var d = buildDialog("تغيير كلمة المرور",
      "يتطلب كلمة المرور الحالية. سيُنهي التغيير جلساتك المفتوحة على الأجهزة الأخرى، وتبقى هذه الجلسة كما هي.",
      "ic-shield", "password");

    var cur = labelled("كلمة المرور الحالية");
    cur.input.autocomplete = "current-password";
    var nw = labelled("كلمة المرور الجديدة", PASSWORD_MIN + " حرفاً على الأقل، ولا تحتوي على بريدك أو اسمك.");
    nw.input.minLength = PASSWORD_MIN;
    var rp = labelled("تأكيد كلمة المرور الجديدة");
    [cur, nw, rp].forEach(function (f) { d.body.appendChild(f.label); });

    var save = document.createElement("button");
    save.type = "button"; save.className = "aun-btn"; save.textContent = "تغيير كلمة المرور";
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "aun-btn aun-btn--ghost"; cancel.textContent = "تراجع";
    cancel.addEventListener("click", d.close);
    d.foot.appendChild(save); d.foot.appendChild(cancel);
    cur.input.focus();

    function clear() {
      [cur, nw, rp].forEach(function (f) { f.err.hidden = true; f.input.classList.remove("is-bad"); });
    }
    function bad(f, msg) {
      f.err.hidden = false; f.err.textContent = msg;
      f.input.classList.add("is-bad"); f.input.focus();
    }

    var busy = false;
    function submit() {
      if (busy) return;
      clear();
      if (!cur.input.value) return bad(cur, "أدخل كلمة المرور الحالية.");
      if (nw.input.value.length < PASSWORD_MIN) {
        return bad(nw, "كلمة المرور يجب ألا تقل عن " + PASSWORD_MIN + " حرفاً.");
      }
      if (nw.input.value !== rp.input.value) return bad(rp, "الكلمتان غير متطابقتين.");
      if (nw.input.value === cur.input.value) {
        return bad(nw, "كلمة المرور الجديدة مطابقة للحالية.");
      }

      busy = true; save.disabled = true; cancel.disabled = true;
      save.textContent = "جارٍ التغيير…";
      AunAPI.changePassword(cur.input.value, nw.input.value).then(function () {
        d.close();
        say("غُيّرت كلمة المرور. أُنهيت جلساتك على الأجهزة الأخرى.");
      }).catch(function (e) {
        var shown = false;
        if (e && e.errors) {
          if (e.errors.current) { bad(cur, e.errors.current); shown = true; }
          else if (e.errors.password) { bad(nw, e.errors.password); shown = true; }
        }
        if (!shown) bad(nw, (e && e.message) ? e.message : "تعذّر تغيير كلمة المرور.");
      }).then(function () {
        busy = false; save.disabled = false; cancel.disabled = false;
        save.textContent = "تغيير كلمة المرور";
      });
    }
    save.addEventListener("click", submit);
    [cur, nw, rp].forEach(function (f) {
      f.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
      });
    });
  }

  /* A confirmation the operator actually sees. Every page defines its own
     toast helper on window.AunShell; when one is there it is used, so the
     message looks like the page it appeared on. */
  function say(message) {
    if (global.AunShell && typeof global.AunShell.toast === "function") {
      try { global.AunShell.toast(message); return; } catch (e) { /* fall through */ }
    }
    var d = buildDialog("تم", message, "ic-checkcircle", "done");
    var ok = document.createElement("button");
    ok.type = "button"; ok.className = "aun-btn"; ok.textContent = "حسناً";
    ok.addEventListener("click", d.close);
    d.foot.appendChild(ok); ok.focus();
  }

  /* ------------------------------------------------------------------ */
  /* the header bell                                                     */
  /* ------------------------------------------------------------------ */

  var ICON = { new_request: "ic-newdot", stale: "ic-clock" };
  var TONE = { new_request: "new",       stale: "warn" };

  /** "قبل ساعتين" and friends, from a UTC timestamp the server wrote. */
  function relative(iso) {
    var t = Date.parse(String(iso).replace(" ", "T") + "Z");
    if (isNaN(t)) return "";
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "الآن";
    if (m < 60) return m === 1 ? "قبل دقيقة" : (m === 2 ? "قبل دقيقتين" : "قبل " + m + (m <= 10 ? " دقائق" : " دقيقة"));
    var h = Math.round(m / 60);
    if (h < 24) return h === 1 ? "قبل ساعة" : (h === 2 ? "قبل ساعتين" : "قبل " + h + (h <= 10 ? " ساعات" : " ساعة"));
    var d = Math.round(h / 24);
    return d === 1 ? "أمس" : (d === 2 ? "قبل يومين" : "قبل " + d + (d <= 10 ? " أيام" : " يوماً"));
  }

  /**
   * Every page has this popup in its header. It used to hold five notices
   * written into the markup — a fixed cast of names that had nothing to do
   * with the database. One implementation here replaces eleven copies, and
   * it shows what الإشعارات وسجل النشاط actually holds, or says there is
   * nothing rather than inventing something.
   */
  function wireNotifications() {
    var list = document.getElementById("notiflist");
    var bell = document.getElementById("bell");
    if (!list || !bell) return;
    var dot  = document.getElementById("belldot");
    var nav  = document.querySelector('[data-navcount="activity"]');
    var all  = document.getElementById("readall");
    var rows = [];

    function empty(text) {
      list.textContent = "";
      var p = document.createElement("p");
      p.className = "pop__empty";
      p.style.cssText = "margin:0;padding:1.25rem 1rem;text-align:center;color:var(--slate);font-size:.875rem";
      p.textContent = text;
      list.appendChild(p);
    }

    function paint() {
      if (!rows.length) { empty("لا توجد تنبيهات."); }
      else {
        list.textContent = "";
        rows.slice(0, 5).forEach(function (n) {
          var a = document.createElement("a");
          a.className = "notif" + (n.read ? " is-read" : "");
          a.href = n.ref ? "requests.html#" + encodeURIComponent(n.ref) : "requests.html";
          a.setAttribute("data-nid", String(n.id));

          var u = document.createElement("span");
          u.className = "notif__unread"; u.setAttribute("aria-hidden", "true");

          var ic = document.createElement("span");
          ic.className = "notif__i notif__i--" + (TONE[n.kind] || "ok");
          ic.innerHTML = '<svg class="i i--sm" aria-hidden="true"><use href="#'
                       + (ICON[n.kind] || "ic-checkcircle") + '"/></svg>';

          var b = document.createElement("span"); b.className = "notif__b";
          var t = document.createElement("span"); t.className = "notif__t"; t.textContent = n.title;
          var m = document.createElement("span"); m.className = "notif__m";
          m.textContent = relative(n.at) + (n.read ? "" : " · غير مقروء");
          b.appendChild(t); b.appendChild(m);

          a.appendChild(u); a.appendChild(ic); a.appendChild(b);
          list.appendChild(a);
        });
      }
      var unread = rows.filter(function (n) { return !n.read; }).length;
      if (dot) dot.hidden = unread === 0;
      bell.setAttribute("aria-label", unread ? "التنبيهات — " + unread + " غير مقروءة" : "التنبيهات — لا جديد");
      if (nav) { nav.hidden = unread === 0; nav.textContent = unread ? String(unread) : ""; }
      if (all) all.disabled = unread === 0;
    }

    list.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest(".notif") : null;
      if (!a) return;
      var id = Number(a.getAttribute("data-nid"));
      rows.forEach(function (n) { if (n.id === id) n.read = true; });
      paint();
      AunAPI.readNotification(id, true).catch(function () {});
    });
    if (all) all.addEventListener("click", function (e) {
      e.stopPropagation();
      rows.forEach(function (n) { n.read = true; });
      paint();
      AunAPI.readNotification(null, true).catch(function () {});
    });

    empty("…");
    AunAPI.notifications().then(function (res) {
      rows = res.rows || [];
      paint();
    }).catch(function (err) {
      if (err && err.status === 401) return;   /* handle() is already redirecting */
      empty("تعذّر تحميل التنبيهات.");
    });
  }

  /**
   * How many saved changes are not on the website yet.
   *
   * Every module that edits site content shows the same number, because a
   * save used to be confirmed and change nothing a visitor could see, with
   * nothing anywhere to say the two had diverged. The number is computed by
   * comparing the records with the published page each time it is asked for,
   * so it cannot be stale in the way a stored counter can.
   */
  function wirePending() {
    var host = document.querySelector(".hdr__acts");
    if (!host) return;

    var chip = document.getElementById("pendingchip");
    if (!chip) {
      chip = document.createElement("a");
      chip.id = "pendingchip";
      chip.href = "content.html#publish";
      chip.hidden = true;
      chip.style.cssText =
        "display:inline-flex;align-items:center;gap:.4rem;min-height:2.25rem;padding:0 .7rem;" +
        "border-radius:999px;background:var(--amber-bg,#FBF3E4);color:var(--amber,#8F6410);" +
        "border:1px solid currentColor;font-size:.8125rem;font-weight:600;text-decoration:none;" +
        "font-family:var(--f-ar-body);white-space:nowrap";
      host.insertBefore(chip, host.firstChild);
    }

    refreshPending();
  }

  function refreshPending() {
    var chip = document.getElementById("pendingchip");
    if (!chip) return Promise.resolve();
    return AunAPI.pending().then(function (r) {
      var n = (r.pending && r.pending.count) || 0;
      chip.hidden = n === 0;
      chip.textContent = n === 1
        ? "تغيير واحد غير منشور"
        : (n === 2 ? "تغييران غير منشورين"
          : (n <= 10 ? n + " تغييرات غير منشورة" : n + " تغييراً غير منشور"));
      chip.setAttribute("title", "محفوظ في النظام ولم يظهر على الموقع بعد — افتح المحتوى للنشر");
      global.AunPending = n;
      document.dispatchEvent(new CustomEvent("aun:pending", { detail: n }));
      return n;
    }).catch(function () { /* a badge is never worth an error message */ });
  }

  function boot() { wireShell(); wireNotifications(); wirePending(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
