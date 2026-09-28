// cabecera.js
document.addEventListener("DOMContentLoaded", () => {
  const contenedor = document.getElementById("contenedor-cabecera");
  if (!contenedor) return;

  const user = getStoredAuthUser();
  const routes = getRoutes();

  if (!user) {
    window.location.replace(routes.indexUrl);
    return;
  }

  const pageInfo = getPageInfo();
  const nombreUsuario = String(user.nombre || user.username || user.usuario || "Usuario").trim();
  
  // CORRECCIÓN: Leer primero 'cargo' en lugar de 'rol'
  const cargoUsuario = String(user.cargo || user.rol || "USUARIO").trim();
  
  const inicialesUsuario = obtenerIniciales(nombreUsuario);

  contenedor.innerHTML = `
    <div class="header-wrapper">
      <header class="topbar">
        <div class="topbar-left">
          ${pageInfo.isMenuPage ? "" : `
            <button type="button" id="backBtn" class="btn-atras">
              <span class="back-icon">⬅</span>
              <span class="back-text">Atrás</span>
            </button>
          `}

          <div class="brand-block">
            <div class="brand-mark">
              <img src="${routes.logoUrl}" alt="Logo">
            </div>
            <div class="brand-text">
              <h1>${pageInfo.title}</h1>
              <p>${pageInfo.subtitle}</p>
            </div>
          </div>
        </div>

        <div class="session-box">
          <div class="session-text">
            <strong>${nombreUsuario}</strong>
            <span class="role-pill">${cargoUsuario}</span>
          </div>

          <div class="user-menu-container">
            <button type="button" id="avatarTrigger" class="avatar-trigger" aria-label="Abrir menú de usuario">
              <div class="session-avatar">
                <img id="topUserPhoto" src="" alt="Usuario" class="oculto">
                <div id="topUserInitials" class="session-avatar-fallback">${inicialesUsuario}</div>
              </div>
            </button>

            <div class="dropdown-menu" id="dropdownMenu">
              <div class="dropdown-user-info">
                <span class="d-name">${nombreUsuario}</span>
                <span class="d-role">${cargoUsuario}</span>
              </div>

              <div class="dropdown-divider"></div>

              ${pageInfo.isMenuPage ? "" : `
                <button type="button" id="btnIrMenu" class="dropdown-item">
                  <span>Menú principal</span>
                </button>
              `}

              <button type="button" id="logoutBtnDropdown" class="dropdown-item logout-danger">
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          <button type="button" id="logoutBtnDesktop" class="logout-btn-desktop">Cerrar sesión</button>
        </div>
      </header>

      <div class="sub-topbar">
        <div class="sub-left">
          <a href="${routes.menuUrl}" class="home-link">
            <span>PE / BPE</span>
          </a>
        </div>
        <div class="sub-right"></div>
      </div>
    </div>
  `;

  const backBtn = document.getElementById("backBtn");
  const avatarTrigger = document.getElementById("avatarTrigger");
  const dropdownMenu = document.getElementById("dropdownMenu");
  const logoutBtnDesktop = document.getElementById("logoutBtnDesktop");
  const logoutBtnDropdown = document.getElementById("logoutBtnDropdown");
  const btnIrMenu = document.getElementById("btnIrMenu");

  if (backBtn) {
    backBtn.addEventListener("click", () => window.history.back());
  }

  function cerrarDropdown() {
    dropdownMenu?.classList.remove("active");
  }

  if (avatarTrigger && dropdownMenu) {
    avatarTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle("active");
    });

    dropdownMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", cerrarDropdown);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarDropdown();
    });
  }

  if (btnIrMenu) {
    btnIrMenu.addEventListener("click", () => {
      window.location.href = routes.menuUrl;
    });
  }

  function ensureLogoutModal() {
    let modal = document.getElementById("logoutModal");

    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "logoutModal";
    modal.className = "logout-modal-backdrop";

    modal.innerHTML = `
      <div class="logout-modal-box">
        <div id="logoutModalContent">
          <h3>Cerrar sesión</h3>
          <p>¿Desea cerrar sesión?</p>

          <div class="logout-modal-actions">
            <button type="button" class="logout-modal-btn cancel" id="logoutCancelBtn">
              Cancelar
            </button>

            <button type="button" class="logout-modal-btn accept" id="logoutAcceptBtn">
              Aceptar
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function showLogoutConfirm() {
    return new Promise((resolve) => {
      const modal = ensureLogoutModal();
      const content = document.getElementById("logoutModalContent");

      content.innerHTML = `
        <h3>Cerrar sesión</h3>
        <p>¿Desea cerrar sesión?</p>

        <div class="logout-modal-actions">
          <button type="button" class="logout-modal-btn cancel" id="logoutCancelBtn">
            Cancelar
          </button>

          <button type="button" class="logout-modal-btn accept" id="logoutAcceptBtn">
            Aceptar
          </button>
        </div>
      `;

      modal.classList.add("is-open");

      document.getElementById("logoutCancelBtn").onclick = () => {
        modal.classList.remove("is-open");
        resolve(false);
      };

      document.getElementById("logoutAcceptBtn").onclick = () => {
        resolve(true);
      };
    });
  }

  function showLogoutLoading() {
    const modal = ensureLogoutModal();
    const content = document.getElementById("logoutModalContent");

    content.innerHTML = `
      <div class="logout-loader">
        <div class="logout-loader-spinner"></div>
        <div>
          <h3 style="margin-bottom:4px;">Cerrando sesión...</h3>
          <p>Espere un momento.</p>
        </div>
      </div>
    `;

    modal.classList.add("is-open");
  }

  async function ejecutarLogout(event) {
    event?.preventDefault();
    event?.stopPropagation();

    cerrarDropdown();
    const confirmar = await showLogoutConfirm();

    if (!confirmar) return;
    showLogoutLoading();

    try {
      if (typeof window.logout === "function") {
        await window.logout();
        return;
      }
    } catch (error) {
      console.error("Error cerrando sesión:", error);
    } finally {
      localStorage.removeItem("authUser");
      sessionStorage.removeItem("authUser");
      localStorage.removeItem("ct_token");
      localStorage.removeItem("ct_user");
      window.location.replace(routes.indexUrl);
    }
  }

  logoutBtnDesktop?.addEventListener("click", ejecutarLogout);
  logoutBtnDropdown?.addEventListener("click", ejecutarLogout);

  cargarFotoCabecera(user);

  function getStoredAuthUser() {
    const raw = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem("authUser");
      sessionStorage.removeItem("authUser");
      return null;
    }
  }

  function getRoutes() {
    const path = window.location.pathname.toLowerCase();
    const isInsideMenuFolder = path.includes("/menu-opciones/");
    return {
      indexUrl: isInsideMenuFolder ? "../index.html" : "./index.html",
      menuUrl: isInsideMenuFolder ? "./menu.html" : "./Menu-Opciones/menu.html",
      logoUrl: isInsideMenuFolder ? "../IMG/logo.png" : "./img/logo.png"
    };
  }

  function getPageInfo() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/menu-opciones/menu")) {
      return { isMenuPage: true, title: "Menú Principal", subtitle: "Aplicativos disponibles" };
    }
    if (path.includes("/temperatura")) {
      return { isMenuPage: false, title: "Control de Temperatura", subtitle: "Carga y análisis de registros" };
    }
    return { isMenuPage: false, title: "Sistema de Gestion Logistico", subtitle: "Panel principal de operaciones" };
  }

  function obtenerIniciales(nombre) {
    const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "US";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  // CORRECCIÓN: Función para convertir links de Drive
  function convertirLinkDrive(url) {
    if (typeof url !== "string" || !url) return "";
    const urlLimpia = url.trim();
    const driveRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = urlLimpia.match(driveRegex);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return urlLimpia;
  }

  function obtenerFuentesFoto(user) {
    return [
      user?.fotoDataUrl,
      user?.fotoWeb,
      user?.foto
    ]
      .map(v => typeof v === "string" ? v.trim() : "")
      .filter(Boolean)
      .map(url => convertirLinkDrive(url)); // Convertimos los links de Drive aquí
  }

  function cargarFotoCabecera(user) {
    const img = document.getElementById("topUserPhoto");
    const fallback = document.getElementById("topUserInitials");

    if (!img || !fallback) return;

    const fuentes = obtenerFuentesFoto(user);

    if (!fuentes.length) {
      img.classList.add("oculto");
      fallback.classList.remove("oculto");
      return;
    }

    let index = 0;

    img.onload = function () {
      fallback.classList.add("oculto");
      img.classList.remove("oculto");
    };

    img.onerror = function () {
      index++;
      if (index < fuentes.length) {
        img.src = fuentes[index];
        return;
      }
      img.classList.add("oculto");
      fallback.classList.remove("oculto");
    };

    fallback.classList.remove("oculto");
    img.classList.add("oculto");
    img.src = fuentes[index];
  }
});
