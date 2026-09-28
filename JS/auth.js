// js/auth.js
(function () {
  "use strict";

  const SESSION_KEY = "session_usuario";
  const AUTH_USER_KEY = "authUser";

  window.saveSession = function (data) {
    const user = data.user || {};

    const session = {
      token: data.token || "local-session-" + Date.now(),
      user,
      createdAt: new Date().toISOString()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    localStorage.setItem("ct_token", session.token);
    localStorage.setItem("ct_user", JSON.stringify(user));
  };

  window.getSession = function () {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  };

  window.getCurrentUser = function () {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        localStorage.removeItem(AUTH_USER_KEY);
      }
    }

    const session = window.getSession();
    return session ? session.user : null;
  };

  window.getUser = window.getCurrentUser;

  window.getToken = function () {
    const session = window.getSession();
    return session ? session.token : localStorage.getItem("ct_token");
  };

  window.requireAuth = function () {
    if (!window.getCurrentUser()) {
      window.location.replace("../index.html");
    }
  };

  window.logout = function () {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem("ct_token");
    localStorage.removeItem("ct_user");
    sessionStorage.clear();

    window.location.href = "../index.html";
  };

  window.getMenuUrl = function () {
    return "./Menu-Opciones/menu.html";
  };
})();
