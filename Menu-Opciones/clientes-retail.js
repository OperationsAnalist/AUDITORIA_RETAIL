document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.requireAuth === "function") {
    window.requireAuth();
  }

  // --- VARIABLES Y DOM ---
  const user = typeof window.getUser === "function" ? window.getUser() : null;
  const rol = String(user?.rol || "").toUpperCase();
  const btnDataMaestra = document.getElementById("btnDataMaestra");
  const grid = document.getElementById("clientesGrid");

  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingText = document.getElementById("loadingText");

  // Variables Modal Sodimac
  const modalSodimac = document.getElementById("modalSodimac");
  const btnSodimacRegular = document.getElementById("btnSodimacRegular");
  const btnSodimacPre = document.getElementById("btnSodimacPre");
  const btnCerrarModalSodimac = document.getElementById("btnCerrarModalSodimac");
  const imgModalSodimac = document.getElementById("imgModalSodimac");
  let clienteTemporal = null; // Guarda el cliente al hacer clic

  // --- PERMISOS PARA BOTÓN DATA MAESTRA ---
  if (btnDataMaestra) {
    if (rol === "SUPERADMIN" || rol === "AUDITOR") {
      btnDataMaestra.classList.remove("oculto"); 
      btnDataMaestra.addEventListener("click", () => {
        window.location.href = "./maestra-sku.html"; 
      });
    }
  }

  // --- EVENTOS DEL MODAL SODIMAC ---
  if (btnCerrarModalSodimac) {
    btnCerrarModalSodimac.addEventListener("click", () => {
      modalSodimac.classList.add("oculto");
      clienteTemporal = null;
    });
  }

  if (btnSodimacRegular) {
    btnSodimacRegular.addEventListener("click", () => {
      if (clienteTemporal) {
        clienteTemporal.tipo_flujo = "REGULAR";
        localStorage.setItem("clienteSeleccionado", JSON.stringify(clienteTemporal));
        window.location.href = "./auditoria-cliente.html";
      }
    });
  }

  if (btnSodimacPre) {
    btnSodimacPre.addEventListener("click", () => {
      if (clienteTemporal) {
        clienteTemporal.tipo_flujo = "PREDISTRIBUIDO";
        localStorage.setItem("clienteSeleccionado", JSON.stringify(clienteTemporal));
        window.location.href = "./auditoria-sodimac-pre.html"; // NUEVA PANTALLA
      }
    });
  }

  if (!grid) return;

  // --- LÓGICA DE CARGA DE CLIENTES ---
  await cargarClientes();

  async function cargarClientes() {
    mostrarLoading("Cargando clientes", "Consultando base de datos...");
    grid.innerHTML = "";

    try {
      if (typeof window.getClientesRetail !== "function") {
        throw new Error("No existe window.getClientesRetail. Verifique JS/api.js.");
      }

      const clientes = await window.getClientesRetail();

      if (!clientes || clientes.length === 0) {
        grid.innerHTML = `<div class="estado-error" style="width: 100%; text-align: center; color: #64748b;">No hay clientes activos registrados.</div>`;
        return;
      }

      // Dibujar las tarjetas
      clientes.forEach((cliente) => {
        const card = document.createElement("article");
        card.className = "cliente-card";

        const logo = normalizarLogo(cliente.logo_url);

        card.innerHTML = `
          <div class="cliente-logo-box">
            <img class="cliente-logo" src="${logo}" alt="${cliente.nombre}">
          </div>
          <div class="cliente-nombre">${cliente.nombre}</div>
          <div class="cliente-ingresar">Ingresar →</div>
        `;

        const img = card.querySelector("img");
        img.onerror = () => { img.src = "../IMG/logo.png"; };

        // LÓGICA DE CLIC EN LA TARJETA
        card.addEventListener("click", () => {
          // Si el nombre del cliente contiene "SODIMAC"
          if (cliente.nombre.toUpperCase().includes("SODIMAC")) {
            clienteTemporal = cliente;
            if(imgModalSodimac) imgModalSodimac.src = logo;
            modalSodimac.classList.remove("oculto");
          } else {
            // Flujo normal para el resto de clientes
            cliente.tipo_flujo = "REGULAR";
            localStorage.setItem("clienteSeleccionado", JSON.stringify(cliente));
            window.location.href = "./auditoria-cliente.html";
          }
        });

        grid.appendChild(card);
      });

    } catch (error) {
      console.error("Error cargando clientes:", error);
      grid.innerHTML = `
        <div class="estado-error" style="width: 100%; text-align: center; color: #dc2626; background: #fee2e2; padding: 20px; border-radius: 12px;">
          No se pudieron cargar los clientes.<br>Revise su conexión con Supabase.
        </div>
      `;
    } finally {
      ocultarLoading();
    }
  }

  // --- FUNCIONES SECUNDARIAS ---
  function normalizarLogo(logoUrl) {
    if (!logoUrl) return "../IMG/logo.png";
    if (logoUrl.startsWith("IMG/")) return "../" + logoUrl;
    if (logoUrl.startsWith("./IMG/")) return "." + logoUrl;
    return logoUrl;
  }

  function mostrarLoading(titulo, mensaje) {
    if (loadingTitle) loadingTitle.textContent = titulo || "Procesando...";
    if (loadingText) loadingText.textContent = mensaje || "Espere un momento.";
    if (loadingOverlay) loadingOverlay.classList.remove("oculto");
  }

  function ocultarLoading() {
    if (loadingOverlay) loadingOverlay.classList.add("oculto");
  }
});