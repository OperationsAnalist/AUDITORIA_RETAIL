document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.requireAuth === "function") {
    window.requireAuth();
  }

  const clienteRaw = localStorage.getItem("clienteSeleccionado");

  if (!clienteRaw) {
    window.location.href = "./clientes-retail.html";
    return;
  }

const cliente = JSON.parse(clienteRaw);
  const user = typeof window.getUser === "function" ? window.getUser() : null;
  const rol = String(user?.rol || "").toUpperCase();

  // --- NUEVA CLAVE DE RESPALDO LOCAL ---
  const STORAGE_KEY = `conteo_backup_${cliente.id}_${user?.email || 'anon'}`;
  // -------------------------------------

  if (rol !== "SUPERADMIN" && rol !== "AUDITOR") {
    window.location.href = "./auditoria-cliente.html";
    return;
  }

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

  // --- NUEVAS VARIABLES DE CONFIRMACIÓN ---
  const confirmModal = document.getElementById("confirmModal");
  const confirmModalTitle = document.getElementById("confirmModalTitle");
  const confirmModalMessage = document.getElementById("confirmModalMessage");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");
  // -----------------------------------------

  let loteActual = null;
  let guardandoManual = false;
  let guardadosActivos = 0;

  if (clienteLogo) {
    clienteLogo.src = normalizarLogo(cliente.logo_url);
    clienteLogo.onerror = () => {
      clienteLogo.src = "../IMG/logo.png";
    };
  }

  if (subtituloConteo) {
    subtituloConteo.textContent = `Cliente: ${cliente.nombre} | Auditor: ${user?.nombre || user?.email || "-"}`;
  }

  if (appModalOk) {
    appModalOk.addEventListener("click", () => {
      appModal.classList.add("oculto");
    });
  }

  // Mostrar 50 filas inmediatamente por defecto
  conteoBody.innerHTML = "";
  agregarFilas(50);
  enfocarPrimerEAN();

  await cargarConteoExistente();

  btnAgregar50Filas.addEventListener("click", async () => {
    mostrarLoading("Agregando filas", "Preparando 50 nuevas filas de conteo...");

    await esperar(250);

    agregarFilas(50);
    ocultarLoading();

    mostrarModal(
      "Filas agregadas",
      "Se agregaron 50 filas adicionales para continuar el conteo.",
      "success"
    );
  });

  btnGuardarConteo.addEventListener("click", async () => {
    await guardarConteo(false);
  });

  btnFinalizarConteo.addEventListener("click", async () => {
    await guardarConteo(true);
  });

conteoBody.addEventListener("keydown", manejarNavegacionEscaner);
  conteoBody.addEventListener("paste", manejarPegadoExcel);
  conteoBody.addEventListener("focusin", seleccionarContenidoCelda);

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

    const tienda = limpiarTexto(tr.querySelector('[data-field="tienda"]')?.textContent);
    let bulto = limpiarTexto(tr.querySelector('[data-field="bulto"]')?.textContent);
    const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
    let cantidad = convertirNumero(tr.querySelector('[data-field="cantidad"]')?.textContent);

    if (!bulto) {
      for (let i = idx - 1; i >= 0; i--) {
        const val = limpiarTexto(filas[i].querySelector('[data-field="bulto"]')?.textContent);
        if (val) { bulto = val; break; }
      }
    }
    if (cantidad <= 0 && cantidad !== null) cantidad = null;

    return { tienda, bulto, ean, cantidad };
  }

  function guardarRespaldoLocal() {
    const filas = Array.from(conteoBody.querySelectorAll("tr"));
    const borrador = [];

    filas.forEach((tr) => {
      const tienda = limpiarTexto(tr.querySelector('[data-field="tienda"]')?.textContent);
      const bulto = limpiarTexto(tr.querySelector('[data-field="bulto"]')?.textContent);
      const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
      const cantidad = convertirNumero(tr.querySelector('[data-field="cantidad"]')?.textContent);

      if (!tienda && !bulto && !ean && cantidad === null) return;

      borrador.push({
        id: tr.dataset.id || null,
        syncPendiente: tr.dataset.syncPendiente === "true",
        tienda,
        bulto,
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

  async function sincronizarFila(tr) {
    if (!tr || !tr.isConnected || guardandoManual) return;

    if (tr._guardando) {
      tr._pendienteReintento = true;
      return;
    }

    const datos = extraerDatosFila(tr);
    if (!datos.ean) return;

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
        await window.actualizarConteoItem(tr.dataset.id, {
          tienda: datos.tienda,
          bulto: datos.bulto,
          ean: datos.ean,
          cantidad: datos.cantidad
        });
      } else {
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
          tr.dataset.id = creado.id;
        }
      }

      delete tr.dataset.syncPendiente;
      guardarRespaldoLocal();
      actualizarIndicador("Guardado en nube ✓", "#16a34a");
    } catch (error) {
      console.error("Error guardando fila en Supabase:", error);
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
      const datos = extraerDatosFila(tr);
      if (!datos.ean) return;
      if (tr.dataset.id) existentes.push(tr);
      else nuevas.push({ tr, datos });
    });

    if (nuevas.length > 0) {
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
              delete tr.dataset.syncPendiente;
            }
          });
        }
        guardarRespaldoLocal();
        actualizarIndicador("Guardado en nube ✓", "#16a34a");
      } catch (error) {
        console.error("Error guardando pegado en Supabase:", error);
        nuevas.forEach(({ tr }) => { tr.dataset.syncPendiente = "true"; });
        guardarRespaldoLocal();
        actualizarIndicador("Offline (Respaldo local)", "#dc2626");
      } finally {
        guardadosActivos--;
      }
    }

    for (const tr of existentes) {
      await sincronizarFila(tr);
    }
  }

  async function sincronizarPendientes() {
    if (guardandoManual) return;
    const filasPendientes = Array.from(conteoBody.querySelectorAll("tr")).filter((tr) => {
      const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
      return ean !== "" && (!tr.dataset.id || tr.dataset.syncPendiente === "true");
    });
    if (filasPendientes.length > 0) {
      await sincronizarMultiplesFilas(filasPendientes);
    }
  }

  async function esperarGuardadosEnCurso() {
    Array.from(conteoBody.querySelectorAll("tr")).forEach((tr) => {
      if (tr._debounceTimer) clearTimeout(tr._debounceTimer);
    });
    let intentos = 0;
    while (guardadosActivos > 0 && intentos < 50) {
      await esperar(100);
      intentos++;
    }
  }

  async function sincronizarIdsPostGuardado() {
    try {
      const datosNube = await window.getConteoAuditor({ clientId: cliente.id, auditorEmail: user.email });
      const filasConEan = Array.from(conteoBody.querySelectorAll("tr")).filter(
        tr => limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent) !== ""
      );
      filasConEan.forEach((tr, idx) => {
        if (datosNube[idx]) {
          tr.dataset.id = datosNube[idx].id;
          delete tr.dataset.syncPendiente;
        }
      });
    } catch (e) {
      console.warn("No se pudieron refrescar IDs tras guardar:", e);
    }
  }

  // --- EVENTOS DE AUTOGUARDADO CELDA A CELDA ---
  conteoBody.addEventListener("input", (e) => {
    if (!e.target || e.target.getAttribute("contenteditable") !== "true") return;
    const tr = e.target.parentElement;
    tr.dataset.syncPendiente = "true";
    guardarRespaldoLocal();

    clearTimeout(tr._debounceTimer);
    tr._debounceTimer = setTimeout(() => sincronizarFila(tr), 400);
  });

  conteoBody.addEventListener("blur", (e) => {
    if (!e.target || e.target.getAttribute("contenteditable") !== "true") return;
    const tr = e.target.parentElement;
    clearTimeout(tr._debounceTimer);
    if (tr.dataset.syncPendiente === "true") {
      sincronizarFila(tr);
    }
  }, true);

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
  // ---------------------------------------------

  async function cargarConteoExistente() {
    mostrarLoading("Cargando conteo", "Consultando registros del auditor...");

    let borradorItems = [];
    const respaldoLocalRaw = localStorage.getItem(STORAGE_KEY);
    if (respaldoLocalRaw) {
      try {
        const parsed = JSON.parse(respaldoLocalRaw);
        if (Array.isArray(parsed)) {
          borradorItems = parsed.map(r => ({
            id: r.id || null,
            tienda: r.tienda || "",
            bulto: r.bulto || "",
            ean: r.ean || "",
            cantidad: r.cantidad ?? null,
            syncPendiente: Boolean(r.syncPendiente || !r.id)
          }));
        }
      } catch (e) {
        console.error("Error leyendo respaldo local:", e);
      }
    }

    let datosNube = [];
    let nubeOk = false;

    try {
      loteActual = await window.getOrCreateConteoLote({
        clientId: cliente.id,
        auditorEmail: user.email
      });
      datosNube = await window.getConteoAuditor({
        clientId: cliente.id,
        auditorEmail: user.email
      });
      nubeOk = true;
    } catch (error) {
      console.error("Error consultando Supabase (usando respaldo local si existe):", error);
      if (borradorItems.length === 0) {
        mostrarModal(
          "Aviso",
          "No se pudo consultar conteo previo. Puede continuar registrando nuevas líneas.",
          "error"
        );
      }
    }

    let itemsParaCargar = [];
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

      itemsParaCargar = datosNube.map((n) => {
        const localEdit = pendientesPorId.get(String(n.id));
        if (localEdit) return { ...localEdit, id: n.id, syncPendiente: true };
        return {
          id: n.id,
          tienda: n.tienda,
          bulto: n.bulto,
          ean: n.ean,
          cantidad: n.cantidad,
          syncPendiente: false
        };
      });

      nuevosSinId.forEach((b) => itemsParaCargar.push({ ...b, syncPendiente: true }));
    } else {
      itemsParaCargar = borradorItems;
    }

    conteoBody.innerHTML = "";
    if (itemsParaCargar.length > 0) {
      itemsParaCargar.forEach((r) => agregarFila(r));
      if (itemsParaCargar.length < 50) {
        agregarFilas(50 - itemsParaCargar.length);
      } else {
        agregarFilas(20);
      }
    } else {
      agregarFilas(50);
    }
    ocultarLoading();
    enfocarPrimerEAN();

    if (nubeOk) {
      sincronizarPendientes();
    }
  }

  async function guardarConteo(finalizar) {
    const items = obtenerItemsTabla();

    if (!items.length) {
      mostrarModal(
        "Sin registros",
        "Debe ingresar al menos un EAN para guardar el conteo.",
        "error"
      );
      return;
    }

    guardandoManual = true;
    bloquearBotones(true);

    mostrarLoading(
      finalizar ? "Finalizando conteo" : "Guardando conteo",
      "Enviando registros a Supabase..."
    );

    try {
      await esperarGuardadosEnCurso();

      if (typeof window.guardarConteoAuditor !== "function") {
        throw new Error("No existe la función guardarConteoAuditor en js/api.js.");
      }

      const resultado = await window.guardarConteoAuditor({
        clientId: cliente.id,
        auditorEmail: user.email,
        items
      });

      loteActual = resultado.lote;
      localStorage.removeItem(STORAGE_KEY);

      if (finalizar) {
        actualizarLoading("Marcando lote como finalizado...");

        if (typeof window.finalizarConteoAuditor !== "function") {
          throw new Error("No existe la función finalizarConteoAuditor en js/api.js.");
        }

        await window.finalizarConteoAuditor({
          loteId: loteActual.id
        });
      }

      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'REGISTRO_CONTEO', user?.nombre || user?.email || 'Auditor Desconocido');
      }

      await sincronizarIdsPostGuardado();

      ocultarLoading();

      mostrarModal(
        finalizar ? "Conteo finalizado" : "Conteo guardado",
        `Registros guardados: ${resultado.insertados}. Estos registros se consolidarán con los demás auditores del cliente.`,
        "success"
      );

    } catch (error) {
      console.error("Error guardando conteo:", error);

      ocultarLoading();

      mostrarModal(
        "Error al guardar",
        error.message || "No se pudo guardar el conteo.",
        "error"
      );

    } finally {
      guardandoManual = false;
      bloquearBotones(false);
    }
  }

  function agregarFilas(cantidad) {
    for (let i = 0; i < cantidad; i++) {
      agregarFila();
    }
  }

function agregarFila(data = {}) {
    const tr = document.createElement("tr");
    
    // Si la fila ya venía de Supabase, le guardamos su ID oculto
    if (data.id) tr.dataset.id = data.id;
    if (data.syncPendiente) tr.dataset.syncPendiente = "true";
    const campos = [
      { field: "tienda", placeholder: "Tienda", value: data.tienda },
      { field: "bulto", placeholder: "Pallet", value: data.bulto },
      { field: "ean", placeholder: "Escanear EAN", value: data.ean },
      { field: "cantidad", placeholder: "", value: (data.cantidad !== null && data.cantidad !== undefined) ? data.cantidad : "" }
    ];

    campos.forEach((campo) => {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.dataset.field = campo.field;
      td.dataset.placeholder = campo.placeholder;
      td.textContent = valor(campo.value);
      tr.appendChild(td);
    });

    // --- NUEVA COLUMNA: BOTÓN ELIMINAR (X) ---
    const tdAccion = document.createElement("td");
    tdAccion.className = "col-btn";
    tdAccion.innerHTML = `<button class="btn-delete-row" title="Eliminar fila">✕</button>`;
    
    const btnDelete = tdAccion.querySelector(".btn-delete-row");
    btnDelete.addEventListener("click", async () => {
      
      const confirmar = await mostrarConfirmacion("¿Eliminar registro?", "¿Está seguro que desea eliminar esta fila del conteo?");
      if (!confirmar) return;

      // Si la fila ya existe en Supabase (tiene ID)
      if (tr.dataset.id) {
        mostrarLoading("Eliminando...", "Borrando registro de base de datos");
        try {
          await window.eliminarConteoItem(tr.dataset.id);
          tr.remove();
          guardarRespaldoLocal();
          ocultarLoading();
        } catch (error) {
          ocultarLoading();
          mostrarModal("Error", "No se pudo eliminar de la base de datos: " + error.message, "error");
        }
      } else {
        tr.remove();
        guardarRespaldoLocal();
      }
    });

    tr.appendChild(tdAccion);
    // -----------------------------------------

    conteoBody.appendChild(tr);
  }

  function manejarNavegacionEscaner(event) {
    const celda = event.target;

    if (!celda || celda.getAttribute("contenteditable") !== "true") return;

    const campo = celda.dataset.field;

    if (event.key === "Enter") {
      event.preventDefault();

      if (campo === "ean") {
        moverASiguienteFilaEAN(celda);
      } else {
        moverSiguienteCelda(celda);
      }
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

    if (siguienteEAN) {
      siguienteEAN.focus();
      seleccionarTexto(siguienteEAN);
    }
  }

  function moverSiguienteCelda(celdaActual) {
    const filaActual = celdaActual.parentElement;
    const celdas = Array.from(filaActual.children);
    const indexCelda = celdas.indexOf(celdaActual);

    const siguienteCelda = celdas[indexCelda + 1];

    if (siguienteCelda) {
      siguienteCelda.focus();
      seleccionarTexto(siguienteCelda);
      return;
    }

    moverASiguienteFilaEAN(celdaActual);
  }

  function seleccionarContenidoCelda(event) {
    const celda = event.target;

    if (!celda || celda.getAttribute("contenteditable") !== "true") return;

    seleccionarTexto(celda);
  }

  function seleccionarTexto(elemento) {
    const range = document.createRange();
    range.selectNodeContents(elemento);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function obtenerItemsTabla() {
    const filas = Array.from(conteoBody.querySelectorAll("tr"));
    const items = [];

    let ultimoBulto = "";

    filas.forEach((tr) => {
      const tienda = limpiarTexto(tr.querySelector('[data-field="tienda"]')?.textContent);
      let bulto = limpiarTexto(tr.querySelector('[data-field="bulto"]')?.textContent);
      const ean = limpiarTexto(tr.querySelector('[data-field="ean"]')?.textContent);
      let cantidad = convertirNumero(tr.querySelector('[data-field="cantidad"]')?.textContent);

      if (!ean) return;

if (bulto) {
        ultimoBulto = bulto;
      } else {
        bulto = ultimoBulto;
      }

      // Cambio: Dejamos el valor nulo intacto, sin forzar "1"
      if (cantidad <= 0 && cantidad !== null) {
        cantidad = null;
      }

      items.push({
        tienda,
        bulto,
        ean,
        cantidad
      });
    });

    return items;
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
      sincronizarFila(trActual);
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
      const celdaTienda = ultimaFila.querySelector('[data-field="tienda"]');
      if (celdaTienda) celdaTienda.focus();
    }

    guardarRespaldoLocal();
    sincronizarMultiplesFilas(filasAfectadas);
  }
  function enfocarPrimerEAN() {
    const primeraCeldaEAN = conteoBody.querySelector('[data-field="ean"]');

    if (primeraCeldaEAN) {
      setTimeout(() => {
        primeraCeldaEAN.focus();
        seleccionarTexto(primeraCeldaEAN);
      }, 150);
    }
  }

  function bloquearBotones(bloquear) {
    btnAgregar50Filas.disabled = bloquear;
    btnGuardarConteo.disabled = bloquear;
    btnFinalizarConteo.disabled = bloquear;
  }

  function limpiarTexto(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor).replace(/\u00A0/g, " ").trim();
  }

  function convertirNumero(valor) {
    if (valor === null || valor === undefined || valor === "") return null;

    const txt = String(valor)
      .replace(/\u00A0/g, " ")
      .replace(",", ".")
      .trim();

    const num = Number(txt);
    return Number.isFinite(num) ? num : null;
  }

  function valor(v) {
    return v === null || v === undefined ? "" : v;
  }

  function normalizarLogo(logoUrl) {
    if (!logoUrl) return "../IMG/logo.png";
    if (logoUrl.startsWith("IMG/")) return "../" + logoUrl;
    return logoUrl;
  }

  function mostrarLoading(titulo, mensaje) {
    if (loadingTitle) loadingTitle.textContent = titulo || "Procesando...";
    if (loadingText) loadingText.textContent = mensaje || "Espere un momento.";
    if (loadingOverlay) loadingOverlay.classList.remove("oculto");
  }

  function actualizarLoading(mensaje) {
    if (loadingText) loadingText.textContent = mensaje;
  }

  function ocultarLoading() {
    if (loadingOverlay) loadingOverlay.classList.add("oculto");
  }

  function mostrarModal(titulo, mensaje, tipo = "success") {
    if (appModalTitle) appModalTitle.textContent = titulo;
    if (appModalMessage) appModalMessage.textContent = mensaje;

    if (appModalIcon) {
      appModalIcon.classList.remove("success", "error");
      appModalIcon.classList.add(tipo);
      appModalIcon.textContent = tipo === "success" ? "✓" : "!";
    }

    if (appModal) appModal.classList.remove("oculto");
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

function mostrarConfirmacion(titulo, mensaje) {
    return new Promise((resolve) => {
      if (!confirmModal || !confirmModalTitle || !confirmModalMessage || !confirmCancelBtn || !confirmAcceptBtn) {
        mostrarModal("Error interno", "Faltan elementos del modal de confirmación en el HTML.", "error");
        resolve(false);
        return;
      }

      confirmModalTitle.textContent = titulo;
      confirmModalMessage.textContent = mensaje;
      confirmModal.classList.remove("oculto");

      confirmCancelBtn.onclick = () => {
        confirmModal.classList.add("oculto");
        resolve(false);
      };

      confirmAcceptBtn.onclick = () => {
        confirmModal.classList.add("oculto");
        resolve(true);
      };
    });
  }

});
