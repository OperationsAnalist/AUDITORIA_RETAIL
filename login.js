// login.js
(function () {
  "use strict";

  const el = {};
  let currentUser = null;
  let validateTimer = null;
  let validationSequence = 0;
  let lastValidatedKey = "";

  // Placeholder en formato SVG
  const FOTO_PLACEHOLDER =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
        <rect width="120" height="120" rx="16" fill="#e2e8f0"/>
        <circle cx="60" cy="42" r="22" fill="#94a3b8"/>
        <path d="M22 101c7-18 22-28 38-28s31 10 38 28" fill="#94a3b8"/>
      </svg>
    `);

  document.addEventListener("DOMContentLoaded", initLogin);

  function initLogin() {
    el.form = document.getElementById("loginForm");
    el.usuario = document.getElementById("usuario");
    el.password = document.getElementById("password");
    el.seccionPassword = document.getElementById("seccionPassword");

    el.estadoValidacion = document.getElementById("estadoValidacion");
    el.textoValidacion = document.getElementById("textoValidacion");

    el.vistaUsuario = document.getElementById("vistaUsuario");
    el.fotoUsuario = document.getElementById("fotoUsuario");
    el.nombreUsuario = document.getElementById("nombreUsuario");
    el.rolUsuario = document.getElementById("rolUsuario");

    el.customAlert = document.getElementById("customAlert");
    el.customAlertTitle = document.getElementById("customAlertTitle");
    el.customAlertMessage = document.getElementById("customAlertMessage");
    el.customAlertBtn = document.getElementById("customAlertBtn");

    if (!el.form || !el.usuario || !el.password) {
      console.error("No se encontraron los elementos principales del login.");
      return;
    }

    if (typeof window.apiPost !== "function") {
      mostrarAlertaBonita("No se cargó correctamente js/api.js.", "Error de configuración");
      return;
    }

// if (typeof window.getToken === "function" && window.getToken()) {
//   window.location.replace(getSafeMenuUrl());
//   return;
// }


    resetVista();

    el.usuario.addEventListener("input", handleUsuarioInput);
    el.usuario.addEventListener("blur", function () {
      validateUser(false);
    });

    el.usuario.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && isHidden(el.seccionPassword)) {
        event.preventDefault();
        validateUser(true);
      }
    });

    el.form.addEventListener("submit", handleLoginSubmit);

    // Alertas
    if (el.customAlertBtn) {
      el.customAlertBtn.addEventListener("click", ocultarAlertaBonita);
    }
    if (el.customAlert) {
      el.customAlert.addEventListener("click", function (event) {
        if (event.target === el.customAlert) ocultarAlertaBonita();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.customAlert && !el.customAlert.classList.contains("oculto")) {
        ocultarAlertaBonita();
      }
    });
  }

  function getSafeMenuUrl() {
    if (typeof window.getMenuUrl === "function") {
      return window.getMenuUrl();
    }
    return "./Menu-Opciones/menu.html";
  }

  function isHidden(element) {
    return !element || element.classList.contains("oculto");
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function mostrarAlertaBonita(mensaje, titulo = "Aviso") {
    if (el.customAlertTitle) el.customAlertTitle.textContent = titulo;
    if (el.customAlertMessage) el.customAlertMessage.textContent = mensaje;
    if (el.customAlert) el.customAlert.classList.remove("oculto");
    else alert(`${titulo}\n${mensaje}`);
  }

  function ocultarAlertaBonita() {
    if (el.customAlert) el.customAlert.classList.add("oculto");
  }

  function mostrarSpinner(texto) {
    if (el.textoValidacion) el.textoValidacion.textContent = texto || "Cargando...";
    if (el.estadoValidacion) el.estadoValidacion.classList.remove("oculto");
  }

  function ocultarSpinner() {
    if (el.estadoValidacion) el.estadoValidacion.classList.add("oculto");
  }

  function resetVista() {
    currentUser = null;
    lastValidatedKey = "";

    if (el.vistaUsuario) {
      el.vistaUsuario.classList.add("oculto");
      el.vistaUsuario.classList.remove("error-usuario");
    }

    if (el.fotoUsuario) {
      el.fotoUsuario.onload = null;
      el.fotoUsuario.onerror = null;
      el.fotoUsuario.src = "";
      el.fotoUsuario.style.display = "none";
    }

    if (el.nombreUsuario) {
      el.nombreUsuario.textContent = "Usuario detectado";
      el.nombreUsuario.style.color = "#0f172a";
    }

    if (el.rolUsuario) {
      el.rolUsuario.textContent = "";
    }

    ocultarSpinner();
    ocultarPassword();
  }

  function ocultarPassword() {
    if (el.seccionPassword) el.seccionPassword.classList.add("oculto");
    if (el.password) el.password.value = "";
  }

  function mostrarPassword() {
    if (el.seccionPassword) el.seccionPassword.classList.remove("oculto");
    setTimeout(() => {
      if (el.password) el.password.focus();
    }, 80);
  }

  function mostrarVistaSimple(nombre, rol, esValido) {
    if (el.vistaUsuario) {
      el.vistaUsuario.classList.remove("oculto");
      el.vistaUsuario.classList.toggle("error-usuario", !esValido);
    }

    if (el.fotoUsuario) {
      el.fotoUsuario.onload = null;
      el.fotoUsuario.onerror = null;
      el.fotoUsuario.src = "";
      el.fotoUsuario.style.display = "none";
    }

    if (el.nombreUsuario) {
      el.nombreUsuario.textContent = nombre || "Usuario detectado";
      el.nombreUsuario.style.color = esValido ? "#0f172a" : "#b91c1c";
    }

    if (el.rolUsuario) {
      el.rolUsuario.textContent = rol || "";
    }
  }

  function handleUsuarioInput() {
    clearTimeout(validateTimer);
    const usuario = el.usuario.value.trim();
    
    lastValidatedKey = "";
    ocultarPassword();
    ocultarSpinner();

    if (usuario.length < 2) {
      resetVista();
      return;
    }

    mostrarSpinner("Buscando usuario...");

    validateTimer = setTimeout(function () {
      validateUser(false);
    }, 500);
  }

  async function validateUser(showErrors) {
    clearTimeout(validateTimer);

    const usuario = el.usuario.value.trim();
    const normalized = normalizeText(usuario);

    if (!usuario) {
      resetVista();
      return null;
    }

    const sequence = ++validationSequence;

    try {
      mostrarSpinner("Validando usuario...");

      // Conexión con Supabase a través de api.js
      const response = await window.apiPost("validarUsuario", { usuario });

      if (sequence !== validationSequence) return null;

      if (!response || !response.user) {
        throw new Error("Usuario no encontrado.");
      }

      currentUser = response.user;
      mostrarUsuarioValidado(currentUser, normalized);
      return currentUser;

    } catch (error) {
      if (sequence !== validationSequence) return null;

      currentUser = null;
      ocultarSpinner();
      mostrarVistaSimple("Usuario no disponible", "Verifique el usuario", false);
      ocultarPassword();

      if (showErrors) {
        mostrarAlertaBonita(error.message || "Verifique el usuario ingresado.", "Usuario no encontrado");
      }

      return null;
    }
  }

  function mostrarUsuarioValidado(user, normalizedKey) {
    mostrarVistaSimple(user.nombre || "Usuario detectado", user.cargo || user.rol || "USUARIO", true);

    cargarFotoRobusta(user, () => {
      ocultarSpinner();
      lastValidatedKey = normalizedKey || normalizeText(el.usuario.value.trim());
      mostrarPassword();
    });
  }

  // FUNCIÓN ACTUALIZADA: Usa lh3.googleusercontent.com para evitar bloqueos
  function convertirLinkDrive(url) {
    if (typeof url !== "string" || !url) return "";
    const urlLimpia = url.trim();
    
    // Extrae el ID del archivo de Google Drive
    const driveRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = urlLimpia.match(driveRegex);
    
    if (match && match[1]) {
      // Este endpoint de Google permite cargar imágenes sin ser bloqueadas por CORS
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    
    return urlLimpia;
  }

  function cargarFotoRobusta(user, onReady) {
    // Usamos la nueva función para adaptar los links
    const fuentes = [
      convertirLinkDrive(user.fotoWeb),
      convertirLinkDrive(user.foto)
    ].filter(Boolean);

    let finalizado = false;

    function done() {
      if (finalizado) return;
      finalizado = true;
      if (typeof onReady === "function") onReady();
    }

    if (!fuentes.length || !el.fotoUsuario) {
      if (el.fotoUsuario) {
        el.fotoUsuario.src = FOTO_PLACEHOLDER;
        el.fotoUsuario.style.display = "block";
      }
      done();
      return;
    }

    let index = 0;

    el.fotoUsuario.onload = function () {
      this.style.display = "block";
      done();
    };

    el.fotoUsuario.onerror = function () {
      index++;
      if (index < fuentes.length) {
        this.src = fuentes[index];
        return;
      }
      this.onerror = null;
      this.src = FOTO_PLACEHOLDER;
      this.style.display = "block";
      done();
    };

    el.fotoUsuario.src = fuentes[index];
  }

  function setBotonLoading(loading) {
    const btnIngresar = el.form.querySelector('button[type="submit"]');
    if (!btnIngresar) return;

    btnIngresar.disabled = loading;
    btnIngresar.textContent = loading ? "Ingresando..." : "Ingresar";
    btnIngresar.classList.toggle("btn-cargando", loading);
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const usuario = el.usuario.value.trim();
    const password = el.password.value;
    const normalized = normalizeText(usuario);

    if (!usuario) {
      mostrarAlertaBonita("Ingrese su usuario.", "Usuario requerido");
      el.usuario.focus();
      return;
    }

    if (!currentUser || lastValidatedKey !== normalized) {
      mostrarAlertaBonita("Primero valide el usuario saliendo del campo.", "Validación requerida");
      return;
    }

    if (!password) {
      mostrarAlertaBonita("Ingrese su contraseña.", "Contraseña requerida");
      el.password.focus();
      return;
    }

    setBotonLoading(true);

    try {
      const response = await window.apiPost("login", {
        usuario,
        username: usuario,
        password
      });

      if (typeof window.saveSession !== "function") {
        throw new Error("No se cargó correctamente js/auth.js.");
      }

      window.saveSession(response);
      window.location.replace(getSafeMenuUrl());
      
    } catch (error) {
      mostrarAlertaBonita(error.message || "Verifique sus datos.", "Acceso denegado");
      el.password.focus();
    } finally {
      setBotonLoading(false);
    }
  }

})();
