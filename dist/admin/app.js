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
    /^\/admin\/(content\/(block|item|item\/new|item\/del|reorder)|services\/(save|reorder)|settings\/save)$/;

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
    restore: function (formData) {
      return csrf().then(function (token) {
        formData.append("csrf_token", token);
        return fetch(BASE + "/admin/restore", {
          method: "POST", credentials: "same-origin", body: formData,
          headers: { Accept: "application/json", "X-CSRF-Token": token }
        }).then(handle);
      });
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
    var buttons = document.querySelectorAll(".menu__i--danger");
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        AunAPI.logout().catch(function () { location.href = "login.html"; });
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
