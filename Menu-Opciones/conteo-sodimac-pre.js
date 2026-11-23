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
  const STORAGE_KEY = `borrador_conteo_sodimac_${cliente.id}_${user?.email || "anon"}`;
  let guardandoManual = false;
  let guardadosActivos = 0;
  let sincronizandoLote = false;
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

    let borradorItems = [];
    const borradorRaw = localStorage.getItem(STORAGE_KEY);
    if (borradorRaw) {
      try {
        const parsed = JSON.parse(borradorRaw);
        if (Array.isArray(parsed)) {
          borradorItems = parsed.map(r => ({
            id: r.id || null,
            paleta: r.paleta !== undefined ? r.paleta : (r.bulto || ""),
            lpn: r.lpn !== undefined ? r.lpn : (r.tienda || ""),
            paletaEfectiva: r.paletaEfectiva !== undefined ? r.paletaEfectiva : (r.paleta !== undefined ? r.paleta : (r.bulto || "")),
            lpnEfectivo: r.lpnEfectivo !== undefined ? r.lpnEfectivo : (r.lpn !== undefined ? r.lpn : (r.tienda || "")),
            ean: r.ean || "",
            cantidad: r.cantidad ?? null,
            enVuelo: Boolean(r.enVuelo),
            syncPendiente: Boolean(r.syncPendiente || r.dirty === "1" || !r.id)
          }));
        }
      } catch (e) {
        console.error("Error leyendo borrador local:", e);
      }
    }

    let datosNube = [];
    let nubeOk = false;

    try {
      loteActual = await window.getOrCreateConteoLote({ clientId: cliente.id, auditorEmail: user.email });
      datosNube = await window.getConteoAuditor({ clientId: cliente.id, auditorEmail: user.email });
      nubeOk = true;
    } catch (errorRed) {
      console.warn("Sin conexión a Supabase; trabajando con respaldo local:", errorRed);
    }

    let registros = [];
    if (nubeOk) {
      const pendientesPorId = new Map();
      const nuevosSinId = [];

      borradorItems.forEach((b) => {
        if (b.id && b.syncPendiente) {
          pendientesPorId.set(String(b.id), b);
        } else if (!b.id) {
          nuevosSinId.push(b);
        }
      });

      const idsLocales = new Set(borradorItems.filter(b => b.id).map(b => String(b.id)));
      const firma = (paleta, lpn, ean, cant) =>
        `${limpiarTexto(paleta)}|${limpiarTexto(lpn)}|${limpiarTexto(ean)}|${cant ?? ""}`;

      // Contamos filas que ya aparecieron en la nube sin tener aún ID guardado en localStorage
      const conteoExtraNube = new Map();
      datosNube.forEach((n) => {
        if (!idsLocales.has(String(n.id))) {
          const k = firma(n.bulto, n.tienda, n.ean, n.cantidad);
          conteoExtraNube.set(k, (conteoExtraNube.get(k) || 0) + 1);
        }
      });

      registros = datosNube.map((n) => {
        const localEdit = pendientesPorId.get(String(n.id));
        if (localEdit) return { ...localEdit, id: n.id, syncPendiente: true };
        return {
          id: n.id,
          paleta: n.bulto,
          lpn: n.tienda,
          ean: n.ean,
          cantidad: n.cantidad,
          syncPendiente: false
        };
      });

      // Solo agregamos filas sin ID si no fueron ya confirmadas en la nube justo antes del F5
      nuevosSinId.forEach((b) => {
        const k = firma(b.paletaEfectiva, b.lpnEfectivo, b.ean, b.cantidad);
        if (b.enVuelo && (conteoExtraNube.get(k) || 0) > 0) {
          conteoExtraNube.set(k, conteoExtraNube.get(k) - 1);
          return;
        }
        registros.push({ ...b, enVuelo: false, syncPendiente: true });
      });
    } else {
      registros = borradorItems;
    }

    conteoBody.innerHTML = "";
    if (registros.length > 0) {
      registros.forEach((r) => agregarFila(r));
      if (registros.length < 50) {
        agregarFilas(50 - registros.length);
      } else {
        agregarFilas(20);
      }
    } else {
      agregarFilas(50);
    }

    ocultarLoading();
    enfocarPrimerEAN();

    if (nubeOk) {
      guardarRespaldoLocal();
      sincronizarPendientes();
    }
  }
async function guardarConteo(finalizar) {
    if (guardandoManual) return;
    const items = obtenerItemsTabla();
    if (!items.length) return mostrarModal("Sin registros", "Debe ingresar al menos un EAN.", "error");

    guardandoManual = true;
    bloquearBotones(true);
    mostrarLoading(finalizar ? "Finalizando conteo" : "Guardando conteo", "Sincronizando registros en Supabase...");

    try {
      await esperarGuardadosEnCurso();

      const resultado = await window.guardarConteoAuditor({ clientId: cliente.id, auditorEmail: user.email, items });
      loteActual = resultado.lote;

      localStorage.removeItem(STORAGE_KEY);

      if (finalizar) {
        actualizarLoading("Marcando como finalizado...");
        await window.finalizarConteoAuditor({ loteId: loteActual.id });
        loteActual = null;
      }

      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'REGISTRO_CONTEO', user?.nombre || user?.email || 'Desconocido');
      }

      // Actualizar los nuevos IDs en el DOM para seguir editando fila por fila sin desfase
      const idsOk = await sincronizarIdsPostGuardado();
      if (!idsOk) {
        await cargarConteoExistente();
      }
      ocultarLoading();
      mostrarModal(finalizar ? "Conteo finalizado" : "Conteo guardado", `Registros guardados: ${resultado.insertados}.`, "success");
    } catch (error) {
      console.error("Error guardando conteo:", error);
      ocultarLoading();
      mostrarModal("Error", error.message, "error");
    } finally {
      guardandoManual = false;
      bloquearBotones(false);
    }
  }
  function agregarFilas(cantidad) {
    for (let i = 0; i < cantidad; i++) agregarFila();
  }

  function agregarFila(data = {}) {
    const tr = document.createElement("tr");
    if (data.id) tr.dataset.id = data.id;
    if (data.syncPendiente) tr.dataset.syncPendiente = "true";
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
          guardarRespaldoLocal();
          ocultarLoading();
        } catch (error) {
          ocultarLoading();
          mostrarModal("Error", error.message, "error");
        }
      } else {
        tr.remove();
        guardarRespaldoLocal();
      }
    });

tr.appendChild(tdAccion);
    conteoBody.appendChild(tr);
    return tr;
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
      const trActual = target.parentElement;
      trActual.dataset.syncPendiente = "true";
      guardarRespaldoLocal();
      sincronizarFilaConHijas(trActual, target.dataset.field);
      if (target.dataset.field === "ean") moverASiguienteFilaEAN(target);
      return;
    }
    // CASO 2: Pegado Múltiple desde Excel (con Tabulaciones y Saltos de Línea)
    const filasPegadas = texto.split(/\r?\n/);
    const filaInicial = target.parentElement;
    const colInicialFisica = Array.from(filaInicial.children).indexOf(target);
    let rowActualIndex = Array.from(conteoBody.children).indexOf(filaInicial);
    const filasAfectadas = [];

    filasPegadas.forEach((filaTexto, i) => {
      if (i === filasPegadas.length - 1 && filaTexto.trim() === "") return;

      while (conteoBody.children.length <= rowActualIndex) {
        agregarFilas(50);
      }

      const tr = conteoBody.children[rowActualIndex];
      const columnas = filaTexto.split("\t");

      columnas.forEach((valorCelda, cIndex) => {
        const td = tr.children[colInicialFisica + cIndex];
        if (td && td.getAttribute("contenteditable") === "true") {
          let valorLimpio = valorCelda.replace(/^"|"$/g, '').trim();
          td.textContent = valorLimpio;
        }
      });

      tr.dataset.syncPendiente = "true";
      filasAfectadas.push(tr);
      rowActualIndex++;
    });

    const ultimaFila = conteoBody.children[rowActualIndex];
    if (ultimaFila) {
      const celdaPaleta = ultimaFila.querySelector('[data-field="paleta"]');
      if (celdaPaleta) celdaPaleta.focus();
    }

    guardarRespaldoLocal();
    sincronizarMultiplesFilas(filasAfectadas);
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

// --- AUTOGUARDADO FILA POR FILA EN SUPABASE + RESPALDO LOCAL ---
  function actualizarIndicador(texto, color) {
    const el = document.getElementById("indicadorAutoguardado");
    if (el) {
      el.textContent = texto;
      el.style.color = color;
    }
  }

  function extraerDatosFila(tr) {
    const filas = Array.from(conteoBody.querySelectorAll("tr"));
    const idx = filas.indexOf(tr);

    let paleta = limpiarTexto(tr.querySelector('[data-field="paleta"]')?.textContent);
    let lpn = limpiarTexto(tr.querySelector('[data-field="lpn"]')?.textContent);
    const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
    let cantidad = convertirNumero(tr.querySelector('[data-field="cantidad"]')?.textContent);

    if (!paleta) {
      for (let i = idx - 1; i >= 0; i--) {
        const val = limpiarTexto(filas[i].querySelector('[data-field="paleta"]')?.textContent);
        if (val) { paleta = val; break; }
      }
    }
    if (!lpn) {
      for (let i = idx - 1; i >= 0; i--) {
        const val = limpiarTexto(filas[i].querySelector('[data-field="lpn"]')?.textContent);
        if (val) { lpn = val; break; }
      }
    }
    if (cantidad <= 0 && cantidad !== null) cantidad = null;

    return { bulto: paleta, tienda: lpn, ean, cantidad };
  }

  function guardarRespaldoLocal() {
    const filas = Array.from(conteoBody.querySelectorAll("tr"));
    const borrador = [];
    let ultimaPaleta = "";
    let ultimoLpn = "";

    filas.forEach((tr) => {
      const paleta = limpiarTexto(tr.querySelector('[data-field="paleta"]')?.textContent);
      const lpn = limpiarTexto(tr.querySelector('[data-field="lpn"]')?.textContent);
      const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
      const cantidad = convertirNumero(tr.querySelector('[data-field="cantidad"]')?.textContent);

      if (paleta) ultimaPaleta = paleta;
      if (lpn) ultimoLpn = lpn;

      if (!paleta && !lpn && !ean && cantidad === null) return;

      borrador.push({
        id: tr.dataset.id || null,
        enVuelo: tr.dataset.enVuelo === "true",
        syncPendiente: tr.dataset.syncPendiente === "true",
        paleta,
        lpn,
        paletaEfectiva: paleta || ultimaPaleta,
        lpnEfectivo: lpn || ultimoLpn,
        ean,
        cantidad
      });
    });

    if (borrador.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(borrador));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function obtenerFilasHijasAfectadas(trPadre, campo) {
    const afectadas = [];
    let siguiente = trPadre.nextElementSibling;
    while (siguiente) {
      const valorCampo = limpiarTexto(siguiente.querySelector(`[data-field="${campo}"]`)?.textContent);
      if (valorCampo) break; // Se encontró otra paleta/LPN explícita
      const eanHijo = limpiarTexto(siguiente.querySelector('[data-field="ean"]')?.textContent);
      if (eanHijo) {
        siguiente.dataset.syncPendiente = "true";
        afectadas.push(siguiente);
      }
      siguiente = siguiente.nextElementSibling;
    }
    return afectadas;
  }

  async function sincronizarFila(tr) {
    if (!tr || !tr.isConnected || guardandoManual) return;

    if (tr._guardando) {
      tr._pendienteReintento = true;
      return;
    }

    const datos = extraerDatosFila(tr);

    // Si el auditor borró el EAN de una fila que ya estaba en Supabase, eliminarla para evitar filas fantasma
    if (!datos.ean) {
      if (tr.dataset.id) {
        tr._guardando = true;
        tr._pendienteReintento = false;
        guardadosActivos++;
        actualizarIndicador("Eliminando línea vacía...", "#ca8a04");
        try {
          await window.eliminarConteoItem(tr.dataset.id);
          delete tr.dataset.id;
          delete tr.dataset.syncPendiente;
          delete tr.dataset.enVuelo;
          guardarRespaldoLocal();
          actualizarIndicador("Guardado en nube ✓", "#16a34a");
        } catch (error) {
          console.error("Error eliminando fila sin EAN:", error);
          tr.dataset.syncPendiente = "true";
          guardarRespaldoLocal();
          actualizarIndicador("Offline (Respaldo local)", "#dc2626");
        } finally {
          guardadosActivos--;
          tr._guardando = false;
        }
      }
      return;
    }

    tr._guardando = true;
    tr._pendienteReintento = false;
    guardadosActivos++;
    actualizarIndicador("Guardando...", "#ca8a04");

    try {
      if (!loteActual) {
        loteActual = await window.getOrCreateConteoLote({
          clientId: cliente.id,
          auditorEmail: user.email
        });
      }

      if (tr.dataset.id) {
        const payloadUpdate = {
          tienda: datos.tienda,
          bulto: datos.bulto,
          ean: datos.ean,
          cantidad: datos.cantidad
        };

        // Verificar que la fila aún exista en Supabase (evita pérdida silenciosa si se borró en Editar Datos)
        if (typeof window.actualizarConteoItemVerificado === "function") {
          const actualizado = await window.actualizarConteoItemVerificado(tr.dataset.id, payloadUpdate);
          if (!actualizado) {
            delete tr.dataset.id;
            tr.dataset.enVuelo = "true";
            guardarRespaldoLocal();
            const recreado = await window.insertarConteoItemRetorno({
              conteo_lote_id: loteActual.id,
              client_id: cliente.id,
              auditor_email: user.email,
              ...payloadUpdate
            });
            if (recreado && recreado.id) tr.dataset.id = recreado.id;
          }
        } else {
          await window.actualizarConteoItem(tr.dataset.id, payloadUpdate);
        }
      } else {
        tr.dataset.enVuelo = "true";
        guardarRespaldoLocal();
        const creado = await window.insertarConteoItemRetorno({
          conteo_lote_id: loteActual.id,
          client_id: cliente.id,
          auditor_email: user.email,
          tienda: datos.tienda,
          bulto: datos.bulto,
          ean: datos.ean,
          cantidad: datos.cantidad
        });
        if (creado && creado.id) {
          // Si el usuario borró la fila con "✕" mientras el POST viajaba, la eliminamos de Supabase
          if (!tr.isConnected) {
            await window.eliminarConteoItem(creado.id);
            guardarRespaldoLocal();
            return;
          }
          tr.dataset.id = creado.id;
        }
      }
      delete tr.dataset.enVuelo;
      delete tr.dataset.syncPendiente;
      guardarRespaldoLocal();
      actualizarIndicador("Guardado en nube ✓", "#16a34a");
    } catch (error) {
      console.error("Error guardando fila en Supabase:", error);
      // Solo quitamos enVuelo si sabemos que el navegador está sin red
      if (!navigator.onLine) delete tr.dataset.enVuelo;
      tr.dataset.syncPendiente = "true";
      guardarRespaldoLocal();
      actualizarIndicador("Offline (Respaldo local)", "#dc2626");
    } finally {
      guardadosActivos--;
      tr._guardando = false;
      if (tr._pendienteReintento && !guardandoManual) {
        await sincronizarFila(tr);
      }
    }
  }

  async function sincronizarMultiplesFilas(filas) {
    if (!filas || !filas.length || guardandoManual) return;

    const nuevas = [];
    const existentes = [];

    filas.forEach((tr) => {
      if (!tr || !tr.isConnected || tr._guardando) return; // Evita doble POST con sincronizarFila
      const datos = extraerDatosFila(tr);
      if (!datos.ean) return;
      if (tr.dataset.id) {
        existentes.push(tr);
      } else {
        tr._guardando = true; // Bloquea la fila antes del POST en bloque
        tr.dataset.enVuelo = "true";
        nuevas.push({ tr, datos });
      }
    });

    if (nuevas.length > 0) {
      guardarRespaldoLocal();
      guardadosActivos++;
      actualizarIndicador("Guardando bloque...", "#ca8a04");
      try {
        if (!loteActual) {
          loteActual = await window.getOrCreateConteoLote({
            clientId: cliente.id,
            auditorEmail: user.email
          });
        }

        const chunkSize = 500;
        for (let i = 0; i < nuevas.length; i += chunkSize) {
          const loteChunk = nuevas.slice(i, i + chunkSize);
          const payload = loteChunk.map(({ datos }) => ({
            conteo_lote_id: loteActual.id,
            client_id: cliente.id,
            auditor_email: user.email,
            tienda: datos.tienda,
            bulto: datos.bulto,
            ean: datos.ean,
            cantidad: datos.cantidad
          }));

          const insertados = await window.insertarConteoItemRetorno(payload);
          loteChunk.forEach(({ tr }, idx) => {
            if (insertados && insertados[idx] && insertados[idx].id) {
              tr.dataset.id = insertados[idx].id;
              delete tr.dataset.enVuelo;
              delete tr.dataset.syncPendiente;
            }
          });
        }
        guardarRespaldoLocal();
        actualizarIndicador("Guardado en nube ✓", "#16a34a");
      } catch (error) {
        console.error("Error guardando pegado en Supabase:", error);
        nuevas.forEach(({ tr }) => {
          if (!navigator.onLine) delete tr.dataset.enVuelo;
          tr.dataset.syncPendiente = "true";
        });
        guardarRespaldoLocal();
        actualizarIndicador("Offline (Respaldo local)", "#dc2626");
      } finally {
        nuevas.forEach(({ tr }) => { tr._guardando = false; });
        guardadosActivos--;
      }
    }

    for (const tr of existentes) {
      await sincronizarFila(tr);
    }
  }

  async function sincronizarPendientes() {
    if (guardandoManual || sincronizandoLote) return;
    sincronizandoLote = true;
    try {
      const filasPendientes = Array.from(conteoBody.querySelectorAll("tr")).filter((tr) => {
        if (tr._guardando) return false;
        const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
        return ean !== "" && (!tr.dataset.id || tr.dataset.syncPendiente === "true");
      });
      if (filasPendientes.length > 0) {
        await sincronizarMultiplesFilas(filasPendientes);
      }
    } finally {
      sincronizandoLote = false;
    }
  }

  async function esperarGuardadosEnCurso() {
    Array.from(conteoBody.querySelectorAll("tr")).forEach((tr) => {
      if (tr._debounceTimer) clearTimeout(tr._debounceTimer);
    });
    let intentos = 0;
    while ((guardadosActivos > 0 || sincronizandoLote) && intentos < 150) {
      await esperar(100);
      intentos++;
    }
    if (guardadosActivos > 0 || sincronizandoLote) {
      throw new Error("Aún hay envíos automáticos en curso por red lenta. Espere unos segundos y vuelva a presionar Guardar.");
    }
  }

  async function sincronizarIdsPostGuardado() {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const datosNube = await window.getConteoAuditor({ clientId: cliente.id, auditorEmail: user.email });
        const filasConEan = Array.from(conteoBody.querySelectorAll("tr")).filter(
          tr => limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent) !== ""
        );
        if (datosNube.length === filasConEan.length) {
          filasConEan.forEach((tr, idx) => {
            tr.dataset.id = datosNube[idx].id;
            delete tr.dataset.enVuelo;
            delete tr.dataset.syncPendiente;
          });
          return true;
        }
      } catch (e) {
        console.warn("Reintentando refrescar IDs tras guardar:", e);
      }
      await esperar(400);
    }
    return false;
  }
  async function sincronizarFilaConHijas(tr, campo) {
    await sincronizarFila(tr);
    if (campo === "paleta" || campo === "lpn") {
      const hijas = obtenerFilasHijasAfectadas(tr, campo);
      if (hijas.length > 0) {
        guardarRespaldoLocal();
        await sincronizarMultiplesFilas(hijas);
      }
    }
  }

  // Respaldo instantáneo al digitar + envío a Supabase 400ms después
  conteoBody.addEventListener("input", (e) => {
    if (!e.target.hasAttribute("contenteditable")) return;
    const tr = e.target.parentElement;
    const campo = e.target.dataset.field;
    tr.dataset.syncPendiente = "true";
    guardarRespaldoLocal();

    clearTimeout(tr._debounceTimer);
    tr._debounceTimer = setTimeout(() => sincronizarFilaConHijas(tr, campo), 400);
  });

  // Envío inmediato al salir de la celda (evitando reenvío innecesario si ya está guardando)
  conteoBody.addEventListener("blur", (e) => {
    if (!e.target || e.target.getAttribute("contenteditable") !== "true") return;
    const tr = e.target.parentElement;
    const campo = e.target.dataset.field;
    clearTimeout(tr._debounceTimer);
    if (tr.dataset.syncPendiente === "true" && !tr._guardando) {
      sincronizarFilaConHijas(tr, campo);
    }
  }, true);

  // Re-sincronizar automáticamente si vuelve el Wi-Fi o se desbloquea la tablet
  window.addEventListener("online", sincronizarPendientes);
  window.addEventListener("pagehide", () => {
    guardarRespaldoLocal();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      guardarRespaldoLocal();
    } else if (document.visibilityState === "visible") {
      sincronizarPendientes();
    }
  });

});
