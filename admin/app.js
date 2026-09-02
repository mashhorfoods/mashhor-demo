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
        return handle(res);
      });
    });
  }

  global.AunAPI = {
    get: get,
    post: post,
    csrf: csrf,
    toLogin: toLogin,

    me: function () { return get("/auth/me"); },
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
    notifications: function ()      { return get("/admin/notifications"); },
    readNotification: function (id, read) {
      return post("/admin/notifications/read", id === null ? { all: 1 } : { id: id, read: read ? 1 : 0 });
    },
    settings:      function (c)     { return get("/admin/settings", { category: c }); }
  };

  /**
   * Wire the shell every admin page already has: the account menu's logout
   * button, and the header's identity. No markup is added — these elements
   * exist on all nine pages already.
   */
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
      Array.prototype.forEach.call(document.querySelectorAll("#whorole, #whorole2"), function (el) {
        el.textContent = u.roleLabel || "";
      });
      /* the role preview switch in the demo bar reflects the real role now */
      global.AunUser = u;
      document.dispatchEvent(new CustomEvent("aun:user", { detail: u }));
    }).catch(function () { /* handle() already redirected on 401 */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireShell);
  } else {
    wireShell();
  }
})(window);
