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

  async function cargarConteoExistente() {
    mostrarLoading("Cargando conteo", "Consultando registros del auditor...");

    try {
      loteActual = await window.getOrCreateConteoLote({
        clientId: cliente.id,
        auditorEmail: user.email
      });

      const registros = await window.getConteoAuditor({
        clientId: cliente.id,
        auditorEmail: user.email
      });

      if (registros && registros.length > 0) {
        conteoBody.innerHTML = "";

registros.forEach((r) => {
          agregarFila({
            id: r.id, // <- NUEVO: Pasamos el ID real de Supabase
            tienda: r.tienda,
            bulto: r.bulto,
            ean: r.ean,
            cantidad: r.cantidad
          });
        });

        if (registros.length < 50) {
          agregarFilas(50 - registros.length);
        }
      }

    } catch (error) {
      console.error("Error cargando conteo existente:", error);

      mostrarModal(
        "Aviso",
        "No se pudo consultar conteo previo. Puede continuar registrando nuevas líneas.",
        "error"
      );

    } finally {
      ocultarLoading();
      enfocarPrimerEAN();
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

    bloquearBotones(true);

    mostrarLoading(
      finalizar ? "Finalizando conteo" : "Guardando conteo",
      "Enviando registros a Supabase..."
    );

    try {
      if (typeof window.guardarConteoAuditor !== "function") {
        throw new Error("No existe la función guardarConteoAuditor en js/api.js.");
      }

      const resultado = await window.guardarConteoAuditor({
        clientId: cliente.id,
        auditorEmail: user.email,
        items
      });

      loteActual = resultado.lote;

if (finalizar) {
        actualizarLoading("Marcando lote como finalizado...");

        if (typeof window.finalizarConteoAuditor !== "function") {
          throw new Error("No existe la función finalizarConteoAuditor en js/api.js.");
        }

        await window.finalizarConteoAuditor({
          loteId: loteActual.id
        });
      }

      // --- INICIO NUEVO CÓDIGO (AUDITORÍA REGISTRO_CONTEO) ---
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'REGISTRO_CONTEO', user?.nombre || user?.email || 'Auditor Desconocido');
      }
      // --- FIN NUEVO CÓDIGO ---

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
          tr.remove(); // Desaparece de la pantalla
          ocultarLoading();
        } catch (error) {
          ocultarLoading();
          mostrarModal("Error", "No se pudo eliminar de la base de datos: " + error.message, "error");
        }
      } else {
        // Si es una fila nueva vacía, solo la desaparecemos visualmente
        tr.remove(); 
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
      const celdaTienda = ultimaFila.querySelector('[data-field="tienda"]');
      if (celdaTienda) celdaTienda.focus();
    }
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
