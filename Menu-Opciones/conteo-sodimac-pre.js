document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.requireAuth === "function") window.requireAuth();

  const clienteRaw = localStorage.getItem("clienteSeleccionado");
  if (!clienteRaw) return window.location.href = "./clientes-retail.html";

  const cliente = JSON.parse(clienteRaw);
  const user = typeof window.getUser === "function" ? window.getUser() : null;
  const rol = String(user?.rol || "").toUpperCase();

  if (rol !== "SUPERADMIN" && rol !== "AUDITOR") {
    return window.location.href = "./auditoria-cliente.html";
  }

  // ELEMENTOS DOM
  const clienteLogo = document.getElementById("clienteLogo");
  const subtituloConteo = document.getElementById("subtituloConteo");
  const conteoBody = document.getElementById("conteoBody");
  
  const btnAgregar50Filas = document.getElementById("btnAgregar50Filas");
  const btnGuardarConteo = document.getElementById("btnGuardarConteo");
  const btnFinalizarConteo = document.getElementById("btnFinalizarConteo");

  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingText = document.getElementById("loadingText");
  const appModal = document.getElementById("appModal");
  const appModalIcon = document.getElementById("appModalIcon");
  const appModalTitle = document.getElementById("appModalTitle");
  const appModalMessage = document.getElementById("appModalMessage");
  const appModalOk = document.getElementById("appModalOk");
  
  const confirmModal = document.getElementById("confirmModal");
  const confirmModalTitle = document.getElementById("confirmModalTitle");
  const confirmModalMessage = document.getElementById("confirmModalMessage");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");

  let loteActual = null;

  // 1. CARGAR LOGO Y TÍTULO
  if (clienteLogo) {
    clienteLogo.src = normalizarLogo(cliente.logo_url);
    clienteLogo.onerror = () => { clienteLogo.src = "../IMG/logo.png"; };
  }

  if (subtituloConteo) {
    subtituloConteo.textContent = `Cliente: ${cliente.nombre} | Auditor: ${user?.nombre || user?.email || "-"}`;
  }

  if (appModalOk) appModalOk.addEventListener("click", () => appModal.classList.add("oculto"));

  // 2. MOSTRAR FILAS INICIALES
  conteoBody.innerHTML = "";
  agregarFilas(50);
  enfocarPrimerEAN();

  await cargarConteoExistente();

  // --- EVENTOS ---
  btnAgregar50Filas.addEventListener("click", async () => {
    mostrarLoading("Agregando filas", "Preparando 50 nuevas filas...");
    await esperar(250);
    agregarFilas(50);
    ocultarLoading();
  });

  btnGuardarConteo.addEventListener("click", async () => await guardarConteo(false));
  btnFinalizarConteo.addEventListener("click", async () => await guardarConteo(true));

  conteoBody.addEventListener("keydown", manejarNavegacionEscaner);
  conteoBody.addEventListener("paste", manejarPegadoExcel);
  conteoBody.addEventListener("focusin", seleccionarContenidoCelda);

  // --- FUNCIONES PRINCIPALES ---
  async function cargarConteoExistente() {
    mostrarLoading("Cargando conteo", "Consultando registros del auditor...");
    try {
      loteActual = await window.getOrCreateConteoLote({ clientId: cliente.id, auditorEmail: user.email });
      const registros = await window.getConteoAuditor({ clientId: cliente.id, auditorEmail: user.email });

      if (registros && registros.length > 0) {
        conteoBody.innerHTML = "";
        registros.forEach((r) => {
          agregarFila({
            id: r.id,
            paleta: r.bulto, // TRUCO: La BD devuelve 'bulto', lo mapeamos a 'paleta'
            lpn: r.tienda,   // TRUCO: La BD devuelve 'tienda', lo mapeamos a 'lpn'
            ean: r.ean,
            cantidad: r.cantidad
          });
        });
        if (registros.length < 50) agregarFilas(50 - registros.length);
      }
    } catch (error) {
      console.error("Error cargando conteo:", error);
    } finally {
      ocultarLoading();
      enfocarPrimerEAN();
    }
  }

  async function guardarConteo(finalizar) {
    const items = obtenerItemsTabla();
    if (!items.length) return mostrarModal("Sin registros", "Debe ingresar al menos un EAN.", "error");

    bloquearBotones(true);
    mostrarLoading(finalizar ? "Finalizando conteo" : "Guardando conteo", "Enviando registros...");

    try {
      const resultado = await window.guardarConteoAuditor({ clientId: cliente.id, auditorEmail: user.email, items });
      loteActual = resultado.lote;

      if (finalizar) {
        actualizarLoading("Marcando como finalizado...");
        await window.finalizarConteoAuditor({ loteId: loteActual.id });
      }

      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'REGISTRO_CONTEO', user?.nombre || user?.email || 'Desconocido');
      }

      ocultarLoading();
      mostrarModal(finalizar ? "Conteo finalizado" : "Conteo guardado", `Registros guardados: ${resultado.insertados}.`, "success");
    } catch (error) {
      ocultarLoading();
      mostrarModal("Error", error.message, "error");
    } finally {
      bloquearBotones(false);
    }
  }

  function agregarFilas(cantidad) {
    for (let i = 0; i < cantidad; i++) agregarFila();
  }

  function agregarFila(data = {}) {
    const tr = document.createElement("tr");
    if (data.id) tr.dataset.id = data.id;

    // APLICAMOS LAS NUEVAS CABECERAS PREDISTRIBUIDAS
    const campos = [
      { field: "paleta", placeholder: "Paleta", value: data.paleta },
      { field: "lpn", placeholder: "LPN", value: data.lpn },
      { field: "ean", placeholder: "Escanear EAN", value: data.ean },
      { field: "cantidad", placeholder: "", value: (data.cantidad !== null && data.cantidad !== undefined) ? data.cantidad : "" }
    ];

    campos.forEach((campo) => {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.dataset.field = campo.field;
      if (campo.placeholder) td.dataset.placeholder = campo.placeholder;
      td.textContent = valor(campo.value);
      tr.appendChild(td);
    });

    const tdAccion = document.createElement("td");
    tdAccion.className = "col-btn";
    tdAccion.innerHTML = `<button class="btn-delete-row" title="Eliminar fila">✕</button>`;
    
    tdAccion.querySelector(".btn-delete-row").addEventListener("click", async () => {
      const confirmar = await mostrarConfirmacion("¿Eliminar registro?", "¿Está seguro que desea eliminar esta fila del conteo?");
      if (!confirmar) return;

      if (tr.dataset.id) {
        mostrarLoading("Eliminando...", "Borrando registro de BD");
        try {
          await window.eliminarConteoItem(tr.dataset.id);
          tr.remove();
          ocultarLoading();
        } catch (error) {
          ocultarLoading();
          mostrarModal("Error", error.message, "error");
        }
      } else {
        tr.remove();
      }
    });

    tr.appendChild(tdAccion);
    conteoBody.appendChild(tr);
  }

  function obtenerItemsTabla() {
    const filas = Array.from(conteoBody.querySelectorAll("tr"));
    const items = [];
    let ultimaPaleta = "";
    let ultimoLpn = "";

    filas.forEach((tr) => {
      let paleta = limpiarTexto(tr.querySelector('[data-field="paleta"]')?.textContent);
      let lpn = limpiarTexto(tr.querySelector('[data-field="lpn"]')?.textContent);
      const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
      let cantidad = convertirNumero(tr.querySelector('[data-field="cantidad"]')?.textContent);

      if (!ean) return;

      // Autorellenar si escanea hacia abajo sin repetir datos
      if (paleta) ultimaPaleta = paleta; else paleta = ultimaPaleta;
      if (lpn) ultimoLpn = lpn; else lpn = ultimoLpn;
      if (cantidad <= 0 && cantidad !== null) cantidad = null;

      // TRUCO: Enviamos 'paleta' en el campo 'bulto' y 'lpn' en el campo 'tienda'
      items.push({
        bulto: paleta, 
        tienda: lpn,   
        ean: ean,
        cantidad: cantidad
      });
    });
    return items;
  }

  // --- NAVEGACIÓN Y EXCEL ---
  function manejarNavegacionEscaner(event) {
    const celda = event.target;
    if (!celda || celda.getAttribute("contenteditable") !== "true") return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (celda.dataset.field === "ean") moverASiguienteFilaEAN(celda);
      else moverSiguienteCelda(celda);
    }
  }

  function moverASiguienteFilaEAN(celdaActual) {
    const filaActual = celdaActual.parentElement;
    const indexFila = Array.from(conteoBody.children).indexOf(filaActual);
    let siguienteFila = conteoBody.children[indexFila + 1];

    if (!siguienteFila) {
      agregarFilas(50);
      siguienteFila = conteoBody.children[indexFila + 1];
    }
    const siguienteEAN = siguienteFila.querySelector('[data-field="ean"]');
    if (siguienteEAN) { siguienteEAN.focus(); seleccionarTexto(siguienteEAN); }
  }

  function moverSiguienteCelda(celdaActual) {
    const filaActual = celdaActual.parentElement;
    const celdas = Array.from(filaActual.children);
    const indexCelda = celdas.indexOf(celdaActual);
    const siguienteCelda = celdas[indexCelda + 1];

    if (siguienteCelda && siguienteCelda.getAttribute("contenteditable") === "true") {
      siguienteCelda.focus();
      seleccionarTexto(siguienteCelda);
    } else {
      moverASiguienteFilaEAN(celdaActual);
    }
  }

function manejarPegadoExcel(event) {
    const target = event.target;
    // Solo permitimos pegar si estamos dentro de una celda editable
    if (!target || target.getAttribute("contenteditable") !== "true") return;

    event.preventDefault();

    let texto = (event.clipboardData || window.clipboardData).getData("text/plain");
    if (!texto) return;

    const tieneTabs = texto.includes("\t");

    // CASO 1: Pegado simple de una sola celda
    if (!tieneTabs) {
      let valorLimpio = texto.replace(/\r?\n/g, " ").trim();
      target.textContent = valorLimpio;
      if (target.dataset.field === "ean") moverASiguienteFilaEAN(target);
      return;
    }

    // CASO 2: Pegado Múltiple desde Excel (con Tabulaciones y Saltos de Línea)
    const filasPegadas = texto.split(/\r?\n/);
    const filaInicial = target.parentElement;
    const colInicialFisica = Array.from(filaInicial.children).indexOf(target);
    let rowActualIndex = Array.from(conteoBody.children).indexOf(filaInicial);

    filasPegadas.forEach((filaTexto, i) => {
      // Excel siempre deja un salto de línea vacío al final de la copia, lo ignoramos para no crear filas fantasma
      if (i === filasPegadas.length - 1 && filaTexto.trim() === "") return;

      // Si nos quedamos sin filas visuales, agregamos más en bloques de 50 automáticamente
      while (conteoBody.children.length <= rowActualIndex) {
        agregarFilas(50);
      }

      const tr = conteoBody.children[rowActualIndex];
      const columnas = filaTexto.split("\t");

      columnas.forEach((valorCelda, cIndex) => {
        const td = tr.children[colInicialFisica + cIndex];
        
        // Verificamos que la celda destino exista y sea editable (evita sobreescribir el botón "X")
        if (td && td.getAttribute("contenteditable") === "true") {
          // Limpiamos comillas residuales de Excel y quitamos espacios en los extremos
          let valorLimpio = valorCelda.replace(/^"|"$/g, '').trim();
          td.textContent = valorLimpio;
        }
      });
      
      rowActualIndex++;
    });
    
    // Al terminar de pegar, movemos el cursor al final de la lista para comodidad del usuario
    const ultimaFila = conteoBody.children[rowActualIndex];
    if (ultimaFila) {
      const celdaPaleta = ultimaFila.querySelector('[data-field="paleta"]');
      if (celdaPaleta) celdaPaleta.focus();
    }
  }

  // --- UTILIDADES ---
  function seleccionarContenidoCelda(event) {
    if (event.target && event.target.getAttribute("contenteditable") === "true") seleccionarTexto(event.target);
  }
  function seleccionarTexto(elemento) {
    const range = document.createRange();
    range.selectNodeContents(elemento);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function enfocarPrimerEAN() {
    const primeraCeldaEAN = conteoBody.querySelector('[data-field="ean"]');
    if (primeraCeldaEAN) setTimeout(() => { primeraCeldaEAN.focus(); seleccionarTexto(primeraCeldaEAN); }, 150);
  }
  function bloquearBotones(bloquear) {
    btnAgregar50Filas.disabled = bloquear;
    btnGuardarConteo.disabled = bloquear;
    btnFinalizarConteo.disabled = bloquear;
  }
  function limpiarTexto(v) { return (v === null || v === undefined) ? "" : String(v).replace(/\u00A0/g, " ").trim(); }
  function convertirNumero(v) {
    if (v === null || v === undefined || v === "") return null;
    const num = Number(String(v).replace(/\u00A0/g, " ").replace(",", ".").trim());
    return Number.isFinite(num) ? num : null;
  }
  function valor(v) { return v === null || v === undefined ? "" : v; }
  function normalizarLogo(l) { return !l ? "../IMG/logo.png" : l.startsWith("IMG/") ? "../" + l : l; }
  function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
  function actualizarLoading(m) { if (loadingText) loadingText.textContent = m; }
  function mostrarLoading(t, m) {
    if (loadingTitle) loadingTitle.textContent = t;
    if (loadingText) loadingText.textContent = m;
    if (loadingOverlay) loadingOverlay.classList.remove("oculto");
  }
  function ocultarLoading() { if (loadingOverlay) loadingOverlay.classList.add("oculto"); }
  function mostrarModal(t, m, tipo="success") {
    if (appModalTitle) appModalTitle.textContent = t;
    if (appModalMessage) appModalMessage.textContent = m;
    if (appModalIcon) {
      appModalIcon.className = `app-modal-icon ${tipo}`;
      appModalIcon.textContent = tipo==="success"?"✓":"!";
    }
    if (appModal) appModal.classList.remove("oculto");
  }
  function mostrarConfirmacion(titulo, mensaje) {
    return new Promise((resolve) => {
      if (confirmModalTitle) confirmModalTitle.textContent = titulo;
      if (confirmModalMessage) confirmModalMessage.textContent = mensaje;
      if (confirmModal) confirmModal.classList.remove("oculto");
      confirmCancelBtn.onclick = () => { confirmModal.classList.add("oculto"); resolve(false); };
      confirmAcceptBtn.onclick = () => { confirmModal.classList.add("oculto"); resolve(true); };
    });
  }

});