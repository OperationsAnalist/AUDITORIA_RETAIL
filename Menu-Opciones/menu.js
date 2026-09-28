document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.requireAuth === "function") window.requireAuth();

  const user = typeof window.getUser === "function" ? window.getUser() : null;

  const mensajeBienvenida = document.getElementById("mensajeBienvenida");
  const mensajeDescripcion = document.getElementById("mensajeDescripcion");
  const heroPerfil = document.getElementById("heroPerfil");
  const heroTotalApps = document.getElementById("heroTotalApps");
  const appsGrid = document.getElementById("appsGrid");

  const heroLeft = document.getElementById("heroLeft");
  const heroRight = document.getElementById("heroRight");
  const heroScene = document.getElementById("heroScene");
  const heroSceneMini = document.getElementById("heroSceneMini");
  const heroShift = document.getElementById("heroShift");
  const heroFechaCorta = document.getElementById("heroFechaCorta");
  const heroFechaLarga = document.getElementById("heroFechaLarga");
  const heroHora = document.getElementById("heroHora");
  const heroSaludo = document.getElementById("heroSaludo");

  function resolveAsset(path) {
    return new URL(path, window.location.href).href;
  }

  const apps = [
    {
      title: "Auditoria Retail",
      desc: "Carga, conteo y procesamiento de auditoría retail por cliente.",
      pill: "Módulo activo",
      accent: "accent-blue",
      image: resolveAsset("../IMG/auditoria.jpg"),
      url: "./clientes-retail.html"
    }
  ];

  if (mensajeBienvenida) {
    mensajeBienvenida.textContent = `Hola, ${user?.nombre || "Usuario"}.`;
  }

  if (heroPerfil) {
    heroPerfil.textContent = (user?.cargo || user?.rol || "USUARIO").toUpperCase();
  }

  if (mensajeDescripcion) {
    mensajeDescripcion.textContent = "Seleccione el módulo que desea utilizar hoy.";
  }

  if (heroTotalApps) {
    heroTotalApps.textContent = `${apps.length} módulo`;
  }

  function renderApps() {
    if (!appsGrid) return;

    appsGrid.innerHTML = "";

    apps.forEach((app) => {
      const card = document.createElement("article");
      card.className = `app-card ${app.accent}`;

      card.innerHTML = `
        <div class="app-media">
          <img src="${app.image}" alt="${app.title}">
        </div>

        <div class="app-card-body">
          <span class="app-pill">${app.pill}</span>
          <h3>${app.title}</h3>
          <p>${app.desc}</p>

          <div class="app-card-bottom">
            <span>Ingresar</span>
            <span>→</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        window.location.href = app.url;
      });

      appsGrid.appendChild(card);
    });
  }

  function updateClock() {
    const now = new Date();
    const hour = now.getHours();

    let theme = "theme-dia";
    let icon = "☀️";
    let saludo = "Buenos días";

    if (hour >= 18) {
      theme = "theme-noche";
      icon = "🌙";
      saludo = "Buenas noches";
    } else if (hour >= 12) {
      theme = "theme-tarde";
      icon = "🌤️";
      saludo = "Buenas tardes";
    }

    if (heroLeft) heroLeft.className = `hero-left ${theme}`;
    if (heroRight) heroRight.className = `hero-right ${theme}`;
    if (heroScene) heroScene.textContent = icon;
    if (heroSceneMini) heroSceneMini.textContent = icon;
    if (heroShift) heroShift.textContent = saludo;
    if (heroSaludo) heroSaludo.textContent = `${saludo}, bienvenido al sistema`;

    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    if (heroFechaCorta) heroFechaCorta.textContent = dias[now.getDay()];
    if (heroFechaLarga) {
      heroFechaLarga.textContent = `${String(now.getDate()).padStart(2, "0")} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
    }

    if (heroHora) heroHora.textContent = now.toLocaleTimeString("es-PE");

    const minute = now.getMinutes();
    const second = now.getSeconds();

    const hourDeg = ((hour % 12) + minute / 60) * 30;
    const minuteDeg = (minute + second / 60) * 6;
    const secondDeg = second * 6;

    const hourHand = document.getElementById("hourHand");
    const minuteHand = document.getElementById("minuteHand");
    const secondHand = document.getElementById("secondHand");

    if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
    if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
    if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
  }

  renderApps();
  updateClock();
  setInterval(updateClock, 1000);
});
