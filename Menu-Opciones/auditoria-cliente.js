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
  const rol = String(user?.rol || "").toUpperCase(); // Hace que el ROL sea visible para todo el archivo
  const auditTrailBox = document.getElementById("auditTrailBox"); // Conecta con la caja visual del HTML
  

  const clienteLogo = document.getElementById("clienteLogo");

  const estadoQuery = document.getElementById("estadoQuery");
  const estadoConteo = document.getElementById("estadoConteo");
  const estadoProceso = document.getElementById("estadoProceso");

  const textoQuery = document.getElementById("textoQuery");
  const textoConteo = document.getElementById("textoConteo");
  const textoProceso = document.getElementById("textoProceso");

  const btnCargarQuery = document.getElementById("btnCargarQuery");
  const btnRegistrarConteo = document.getElementById("btnRegistrarConteo");
  const btnProcesar = document.getElementById("btnProcesar");

  const inputQueryExcel = document.getElementById("inputQueryExcel");
  const reporteBody = document.getElementById("reporteBody");

  let queryCargadoActual = false;

  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingText = document.getElementById("loadingText");

  const appModal = document.getElementById("appModal");
  const appModalIcon = document.getElementById("appModalIcon");
  const appModalTitle = document.getElementById("appModalTitle");
  const appModalMessage = document.getElementById("appModalMessage");
  const appModalOk = document.getElementById("appModalOk");

  const timelineBadgeConteo = document.getElementById("timelineBadgeConteo");
  const btnForzarN1 = document.getElementById("btnForzarN1");
  let reporteActualEnMemoria = [];

  const confirmModal = document.getElementById("confirmModal");
  const confirmModalTitle = document.getElementById("confirmModalTitle");
  const confirmModalMessage = document.getElementById("confirmModalMessage");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");

  const btnDescargar = document.getElementById("btnDescargar");
  const btnReiniciar = document.getElementById("btnReiniciar");

  if (appModalOk) {
    appModalOk.addEventListener("click", () => {
      appModal.classList.add("oculto");
    });
  }

  if (clienteLogo) {
    clienteLogo.src = normalizarLogo(cliente.logo_url);

    clienteLogo.onerror = () => {
      clienteLogo.src = "../IMG/logo.png";
    };
  }

configurarPermisos();

  // --- INICIALIZAR CAJA DE AUDITORÍA (PASO 3-A) ---
  if (rol === "SUPERADMIN" && auditTrailBox) {
    auditTrailBox.classList.remove("oculto");
    cargarLogsCliente();
  }

  await cargarEstado();
  await cargarReporte();

  btnProcesar.addEventListener("click", async () => {
    if (btnProcesar.disabled) return;

    try {
      btnProcesar.disabled = true;
      btnProcesar.textContent = "Procesando...";

      mostrarLoading("Procesando auditoría", "Generando reporte del cliente...");

      const resultado = await window.procesarCliente(cliente.codigo);
      console.log("Resultado proceso:", resultado);

      actualizarLoading("Actualizando reporte...");

      await cargarEstado();
      await cargarReporte();

ocultarLoading();

      // --- INICIO NUEVO CÓDIGO (PROCESAR) ---
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'PROCESAR', user?.nombre || user?.email || 'Desconocido');
        if (rol === "SUPERADMIN") cargarLogsCliente();
      }
      // --- FIN NUEVO CÓDIGO ---

      mostrarModal(
        "Proceso terminado",
        "El reporte fue generado correctamente.",
        "success"
      );

    } catch (error) {
      console.error("Error procesando cliente:", error);

      ocultarLoading();

      mostrarModal(
        "No se pudo procesar",
        error.message || "Ocurrió un error durante el procesamiento.",
        "error"
      );

    } finally {
      btnProcesar.textContent = "Procesar";
      await cargarEstado();
    }
  });

// --- BOTÓN REINICIAR (RESET TOTAL) ---
  btnReiniciar.addEventListener("click", async () => {
    const confirmar = await mostrarConfirmacion(
      "¿Reiniciar ciclo de auditoría?",
      "ATENCIÓN: Esto eliminará permanentemente TODOS los datos de Query, Conteo y Reportes de este cliente en Supabase. El ciclo empezará desde cero. ¿Desea continuar?"
    );

    if (!confirmar) return;

    try {
      mostrarLoading("Reiniciando", "Eliminando registros de Supabase...");
      
      await window.reiniciarCliente(cliente.id);
      
      // Limpiamos memoria
      reporteActualEnMemoria = [];
      queryCargadoActual = false;
      
// Recargamos vista
      await cargarEstado();
      renderizarReporteDinamico();
      
      ocultarLoading();

      // --- INICIO NUEVO CÓDIGO (REINICIAR) ---
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'REINICIAR', user?.nombre || user?.email || 'Desconocido');
        if (rol === "SUPERADMIN") cargarLogsCliente();
      }
      // --- FIN NUEVO CÓDIGO ---

      mostrarModal("Reinicio Completo", "Se ha limpiado toda la data del cliente.", "success");
    } catch (error) {
      console.error(error);
      ocultarLoading();
      mostrarModal("Error", "No se pudo reiniciar el cliente: " + error.message, "error");
    }
  });

  // --- BOTÓN DESCARGAR (EXCEL 3 HOJAS) ---
  btnDescargar.addEventListener("click", async () => {
    try {
      mostrarLoading("Generando Excel", "Compilando hojas de Query, Conteo y Reporte...");

      // 1. Crear Libro de Excel
      const wb = XLSX.utils.book_new();

// 2. Hoja: QUERY
      const dataQuery = await window.getQueryItems(cliente.id);
      const wsQuery = XLSX.utils.json_to_sheet(dataQuery.map(q => ({
        "SKU": String(q.sku || ""), // Forzado a Texto
        "Descripción": q.descripcion || "",
        "UM": q.um || "",
        "Cantidad": Number(q.cantidad) || 0,
        "Pedido (E)": String(q.columna_e || "")
      })));
      XLSX.utils.book_append_sheet(wb, wsQuery, "QUERY");

      // 3. Hoja: CONTEO
      const dataConteo = await window.getConteoItems(cliente.id);
      const wsConteo = XLSX.utils.json_to_sheet(dataConteo.map(c => ({
        "Auditor": c.auditor_email || "",
        "Tienda": c.tienda || "",
        "Pallet": String(c.bulto || ""), // Forzado a Texto
        "EAN": String(c.ean || ""), // Forzado a Texto
        "Cantidad": Number(c.cantidad) || 0
      })));
      XLSX.utils.book_append_sheet(wb, wsConteo, "CONTEO");

      // 4. Hoja: REPORTE (Se extrae directo de la tabla HTML dibujada)
      const tablaHtml = document.querySelector(".tabla-scroll table");
      const wsReporte = XLSX.utils.table_to_sheet(tablaHtml);
      XLSX.utils.book_append_sheet(wb, wsReporte, "Reporte");

      // 5. Generar Nombre del Archivo Dinámico
      const hoy = new Date();
      const dia = String(hoy.getDate()).padStart(2, '0');
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      const nombreArchivo = `${dia}-${mes} Verificación de Picking Regular ${cliente.nombre}.xlsx`;

// 6. Descargar
      XLSX.writeFile(wb, nombreArchivo);
      
      ocultarLoading();

      // --- INICIO NUEVO CÓDIGO (DESCARGAR) ---
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'DESCARGAR', user?.nombre || user?.email || 'Desconocido');
        if (rol === "SUPERADMIN") cargarLogsCliente();
      }
      // --- FIN NUEVO CÓDIGO ---
    } catch (error) {
      console.error(error);
      ocultarLoading();
      mostrarModal("Error", "No se pudo generar el Excel: " + error.message, "error");
    }
  });

  btnCargarQuery.addEventListener("click", async () => {
    const rol = String(user?.rol || "").toUpperCase();

    if (rol !== "SUPERADMIN" && rol !== "RETAIL") {
      mostrarModal("Acceso denegado", "No tiene permisos para cargar QUERY.", "error");
      return;
    }

    try {
      if (typeof window.existeQueryCliente === "function") {
        queryCargadoActual = await window.existeQueryCliente(cliente.id);
      }

      if (queryCargadoActual) {
        const confirmar = await mostrarConfirmacion(
          "QUERY existente",
          "Ya existe un QUERY cargado para este cliente. Si continúa, los datos actuales serán eliminados y reemplazados por la nueva carga."
        );

        if (!confirmar) return;
      }

      inputQueryExcel.click();

    } catch (error) {
      console.error("Error verificando QUERY existente:", error);

      mostrarModal(
        "No se pudo verificar el QUERY",
        error.message || "Ocurrió un error validando la carga existente.",
        "error"
      );
    }
  });

btnForzarN1.addEventListener("click", async () => {
    if (!reporteActualEnMemoria || reporteActualEnMemoria.length === 0) return;

    // Usamos el modal personalizado que ya tienes creado
    const confirmar = await mostrarConfirmacion(
      "¿Forzar a N1?",
      "Toda la columna 'UM Min' cambiará a 'N1' y se recalcularán automáticamente el Plan y las Diferencias."
    );

    if (!confirmar) return;

    // Cambiamos el valor en memoria para cada fila
    reporteActualEnMemoria.forEach(r => {
      r.um_min = "N1";
    });

    // Volvemos a dibujar la tabla, lo que activará todas las fórmulas
    renderizarReporteDinamico();
  });

  inputQueryExcel.addEventListener("change", async (event) => {
    const archivo = event.target.files[0];

    if (!archivo) return;

    const rol = String(user?.rol || "").toUpperCase();

    if (rol !== "SUPERADMIN" && rol !== "RETAIL") {
      mostrarModal("Acceso denegado", "No tiene permisos para cargar QUERY.", "error");
      inputQueryExcel.value = "";
      return;
    }

    let totalImportados = 0;

    try {
      btnCargarQuery.disabled = true;
      btnCargarQuery.textContent = "Cargando QUERY...";

      mostrarLoading("Cargando QUERY", "Leyendo archivo Excel...");

      const registros = await leerExcelQuery(archivo);

      if (!registros.length) {
        ocultarLoading();

        mostrarModal(
          "Archivo sin datos",
          "El archivo no contiene registros válidos desde la columna A hasta E.",
          "error"
        );

        return;
      }

      actualizarLoading("Eliminando QUERY anterior...");

      if (typeof window.limpiarQueryCliente !== "function") {
        throw new Error("No existe la función limpiarQueryCliente en js/api.js.");
      }

      await window.limpiarQueryCliente(cliente.id);

      actualizarLoading("Creando nueva carga QUERY...");

      const upload = await window.crearQueryUpload({
        clientId: cliente.id,
        archivoNombre: archivo.name,
        email: user?.email || ""
      });

      const items = registros.map((r) => ({
        upload_id: upload.id,
        client_id: cliente.id,
        fila_excel: r.fila_excel,
        sku: r.sku,
        descripcion: r.descripcion,
        um: r.um,
        cantidad: r.cantidad,
        columna_e: r.columna_e
      }));

      actualizarLoading("Guardando registros QUERY...");

      await window.insertarQueryItems(items);

      totalImportados = items.length;

      actualizarLoading("Actualizando línea de tiempo...");

await cargarEstado();
      await cargarReporte();

      ocultarLoading();

      // --- INICIO NUEVO CÓDIGO (CARGA QUERY) ---
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'CARGA_QUERY', user?.nombre || user?.email || 'Desconocido');
        if (rol === "SUPERADMIN") cargarLogsCliente();
      }
      // --- FIN NUEVO CÓDIGO ---

      mostrarModal(
        "QUERY cargado correctamente",
        `Registros importados: ${totalImportados}`,
        "success"
      );

    } catch (error) {
      console.error("Error cargando QUERY:", error);

      ocultarLoading();

      mostrarModal(
        "No se pudo cargar el QUERY",
        error.message || "Revise el archivo o la conexión con Supabase.",
        "error"
      );

    } finally {
      btnCargarQuery.disabled = false;
      btnCargarQuery.textContent = "Cargar QUERY";
      inputQueryExcel.value = "";
    }
  });

const btnIrEditarDatos = document.getElementById("btnIrEditarDatos");
  if (btnIrEditarDatos) {
    btnIrEditarDatos.addEventListener("click", () => {
      window.location.href = "./editar-datos.html";
    });
  }


btnRegistrarConteo.addEventListener("click", () => {
  const rol = String(user?.rol || "").toUpperCase();

  if (rol !== "SUPERADMIN" && rol !== "AUDITOR") {
    mostrarModal("Acceso denegado", "No tiene permisos para registrar CONTEO.", "error");
    return;
  }

  if (!queryCargadoActual) {
    mostrarModal(
      "QUERY pendiente",
      "Primero debe existir un QUERY cargado para este cliente.",
      "error"
    );
    return;
  }

  window.location.href = "./conteo-cliente.html";
});


function configurarPermisos() {
    // Capturamos los botones nuevos por si acaso
    const btnEditar = document.getElementById("btnIrEditarDatos");
    const btnForzar = document.getElementById("btnForzarN1");

    // 1. Ocultamos TODOS los botones por defecto (Seguridad máxima)
    if (btnCargarQuery) btnCargarQuery.style.display = "none";
    if (btnRegistrarConteo) btnRegistrarConteo.style.display = "none";
    if (btnProcesar) btnProcesar.style.display = "none";
    if (btnDescargar) btnDescargar.style.display = "none";
    if (btnReiniciar) btnReiniciar.style.display = "none";
    if (btnEditar) btnEditar.style.display = "none";
    if (btnForzar) btnForzar.style.display = "none";

    // 2. Permisos SUPERADMIN (Acceso total a todo)
    if (rol === "SUPERADMIN") {
      if (btnCargarQuery) btnCargarQuery.style.display = "inline-flex";
      if (btnRegistrarConteo) btnRegistrarConteo.style.display = "inline-flex";
      if (btnProcesar) btnProcesar.style.display = "inline-flex";
      if (btnDescargar) btnDescargar.style.display = "inline-flex";
      if (btnReiniciar) btnReiniciar.style.display = "inline-flex";
      if (btnEditar) btnEditar.style.display = "inline-flex";
      if (btnForzar) btnForzar.style.display = "inline-flex";
      return;
    }

    // 3. Permisos RETAIL (SOLO Cargar Query)
    if (rol === "RETAIL") {
      if (btnCargarQuery) btnCargarQuery.style.display = "inline-flex";
      // Editar Datos y Forzar N1 se quedan ocultos automáticamente
      return;
    }

    // 4. Permisos AUDITOR (Todo EXCEPTO Cargar Query)
    if (rol === "AUDITOR") {
      if (btnRegistrarConteo) btnRegistrarConteo.style.display = "inline-flex";
      if (btnProcesar) btnProcesar.style.display = "inline-flex";
      if (btnDescargar) btnDescargar.style.display = "inline-flex";
      if (btnReiniciar) btnReiniciar.style.display = "inline-flex";
      if (btnEditar) btnEditar.style.display = "inline-flex";
      if (btnForzar) btnForzar.style.display = "inline-flex";
      return;
    }
  }
  async function cargarEstado() {
    try {
      const estado = await window.getEstadoCliente(cliente.id);

      const queryOk = !!estado?.query_cargado;
      const conteoOk = !!estado?.conteo_cargado;
      const puedeProcesar = !!estado?.puede_procesar;

      queryCargadoActual = queryOk;

// --- LÓGICA PARA MOSTRAR LA BURBUJA DE CONTEOS EN TIEMPO REAL ---
      // Ahora lee directamente el conteo exacto de Supabase
      let totalConteos = Number(estado?.conteos_guardados || 0);

      if (timelineBadgeConteo) {
        timelineBadgeConteo.textContent = totalConteos;
        if (totalConteos > 0) {
          timelineBadgeConteo.classList.remove("oculto");
        } else {
          timelineBadgeConteo.classList.add("oculto");
        }
      }

      pintarEstado(estadoQuery, textoQuery, queryOk, queryOk ? "Cargado" : "Pendiente");
      pintarEstado(estadoConteo, textoConteo, conteoOk, conteoOk ? "Registrado" : "Pendiente");
      pintarEstado(estadoProceso, textoProceso, puedeProcesar, puedeProcesar ? "Disponible" : "Bloqueado");

      btnProcesar.disabled = !puedeProcesar;

    } catch (error) {
      console.error("Error cargando estado:", error);

      pintarEstado(estadoQuery, textoQuery, false, "Error");
      pintarEstado(estadoConteo, textoConteo, false, "Error");
      pintarEstado(estadoProceso, textoProceso, false, "Bloqueado");

      btnProcesar.disabled = true;
    }
  }
  function pintarEstado(item, texto, ok, mensaje) {
    item.classList.toggle("ok", ok);
    texto.textContent = mensaje;
    texto.className = ok ? "estado-ok" : "estado-error";
  }

  async function cargarReporte() {
    try {
      // 1. Obtenemos los datos limpios de la base de datos
      const data = await window.getReporteCliente(cliente.id);
      
      if (!data || data.length === 0) {
        reporteActualEnMemoria = [];
      } else {
        // 2. Los guardamos en nuestra memoria local
        reporteActualEnMemoria = data;
      }
      
      // 3. Dibujamos la tabla aplicando fórmulas y colores
      renderizarReporteDinamico();

    } catch (error) {
      console.error("Error cargando reporte:", error);
      reporteBody.innerHTML = `<tr><td colspan="19">No se pudo cargar el reporte.</td></tr>`;
    }
  }

  function renderizarReporteDinamico() {
    if (reporteActualEnMemoria.length === 0) {
      reporteBody.innerHTML = `<tr><td colspan="19">Sin reporte procesado.</td></tr>`;
      document.getElementById("kpiPlan").textContent = "0 ITEMS";
      document.getElementById("kpiReal").textContent = "0 ITEMS";
      document.getElementById("kpiEfectividad").textContent = "0.00%";
      document.getElementById("kpiEfectividadBox").className = "kpi-box bg-red";
      return;
    }

    reporteBody.innerHTML = "";
    
    let countPlan = 0;
    let countReal = 0;

    reporteActualEnMemoria.forEach((r) => {
      const tr = document.createElement("tr");

      // --- EMULAR FÓRMULAS DE EXCEL EN TIEMPO REAL ---
      let cantidad = Number(r.cantidad) || 0;
      let valorInner = Number(r.valor_inner) || 1;
      let valorEan14 = Number(r.valor_ean_14) || 1;
      
      let valPlan = 0;
      
      // Fórmula de Columna N (Plan): =SI(M="N1";F;SI(M="N2";F*J;SI(M="N3";F*L;"")))
      if (r.um_min === "N1") {
        valPlan = cantidad;
      } else if (r.um_min === "N2") {
        valPlan = cantidad * valorInner;
      } else if (r.um_min === "N3") {
        valPlan = cantidad * valorEan14;
      } else {
        valPlan = cantidad;
      }

      let valReal = Number(r.real) || 0;
      
      // Fórmula de Columna Q (Diferencia): = REAL - PLAN
      let valDif = valReal - valPlan;

      // Conteo para KPIs
      if (valPlan > 0) countPlan++;
      if (valReal > 0) countReal++;

      // Determinar color de la celda Diferencia
      let claseColorDif = "";
      if (valDif === 0) {
        claseColorDif = "dif-cero";
      } else if (valDif > 0) {
        claseColorDif = "dif-pos";
      } else if (valDif < 0) {
        claseColorDif = "dif-neg";
      }

tr.innerHTML = `
        <td>${valor(r.nro)}</td>
        <td>${valor(r.columna_b)}</td>
        <td t="s">${valor(r.sku)}</td>
        <td>${valor(r.descripcion)}</td>
        <td>${valor(r.um)}</td>
        <td>${valor(r.cantidad)}</td>
        <td t="s">${valor(r.ean_13)}</td>
        <td>${valor(r.valor_ean_13)}</td>
        <td t="s">${valor(r.inner_code)}</td>
        <td>${valor(r.valor_inner)}</td>
        <td t="s">${valor(r.ean_14)}</td>
        <td>${valor(r.valor_ean_14)}</td>
        
        <td style="font-weight: 900;">${r.um_min}</td>
        <td>${valPlan > 0 ? valPlan : ""}</td>
        <td>${valReal > 0 ? valReal : ""}</td>
        <td t="s">${valor(r.ubicacion)}</td>
        
        <td class="${claseColorDif}">${valDif}</td>
        
        <td>${valor(r.comentario)}</td>
        <td>${valor(r.comentario_2)}</td>
      `;

      reporteBody.appendChild(tr);
    });

    // ACTUALIZAR LOS KPIs Y PORCENTAJE
    document.getElementById("kpiPlan").textContent = `${countPlan} ITEMS`;
    document.getElementById("kpiReal").textContent = `${countReal} ITEMS`;

    const efectividad = countPlan > 0 ? (countReal / countPlan) * 100 : 0;
    const kpiEfectividadBox = document.getElementById("kpiEfectividadBox");
    
    document.getElementById("kpiEfectividad").textContent = `${efectividad.toFixed(2)}%`;
    
kpiEfectividadBox.classList.remove("bg-grad-red", "bg-grad-yellow", "bg-grad-green", "bg-red"); // Agrego bg-red por si estaba en memoria
    if (efectividad < 60) {
      kpiEfectividadBox.classList.add("bg-grad-red");
    } else if (efectividad < 90) {
      kpiEfectividadBox.classList.add("bg-grad-yellow");
    } else {
      kpiEfectividadBox.classList.add("bg-grad-green");
    }
  }
  async function leerExcelQuery(archivo) {
    if (typeof XLSX === "undefined") {
      throw new Error("No se cargó la librería XLSX. Verifique ../LIB/xlsx.full.min.js.");
    }

    const buffer = await archivo.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: false
    });

    const hojaNombre =
      workbook.SheetNames.find((n) => n.toUpperCase() === "QUERY") ||
      workbook.SheetNames.find((n) => n.toUpperCase() === "AUDIT") ||
      workbook.SheetNames[0];

    const hoja = workbook.Sheets[hojaNombre];

    if (!hoja) {
      throw new Error("No se encontró una hoja válida en el archivo Excel.");
    }

    const filas = XLSX.utils.sheet_to_json(hoja, {
      header: 1,
      defval: "",
      raw: false
    });

    const registros = [];

    for (let i = 1; i < filas.length; i++) {
      const row = filas[i];

      const sku = limpiarTexto(row[0]);
      const descripcion = limpiarTexto(row[1]);
      const um = limpiarTexto(row[2]);
      const cantidad = convertirNumero(row[3]);
      const columnaE = limpiarTexto(row[4]);

      if (!sku) continue;

      registros.push({
        fila_excel: i + 1,
        sku,
        descripcion,
        um,
        cantidad,
        columna_e: columnaE
      });
    }

    return registros;
  }

  function mostrarConfirmacion(titulo, mensaje) {
    return new Promise((resolve) => {
      if (
        !confirmModal ||
        !confirmModalTitle ||
        !confirmModalMessage ||
        !confirmCancelBtn ||
        !confirmAcceptBtn
      ) {
        mostrarModal(
          "Modal no configurado",
          "No se encontró el modal de confirmación en el HTML.",
          "error"
        );
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
    return v === null || v === undefined || v === "" ? "-" : v;
  }

  function normalizarLogo(logoUrl) {
    if (!logoUrl) return "../IMG/logo.png";

    if (logoUrl.startsWith("IMG/")) {
      return "../" + logoUrl;
    }

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

  // --- FUNCIONES DE AUDITORÍA PARA CLIENTE ---
  async function cargarLogsCliente() {
    try {
      // El "modulo" será un ID único combinando el prefijo y el ID del cliente (Ej: CLIENTE_15)
      const moduloId = `CLIENTE_${cliente.id}`;
      const logs = await window.obtenerUltimosLogs(moduloId);

      // Mapear logs individuales
      const logQuery = logs.find(l => l.accion === 'CARGA_QUERY');
      const logProcesar = logs.find(l => l.accion === 'PROCESAR');
      const logDescargar = logs.find(l => l.accion === 'DESCARGAR');
      const logReiniciar = logs.find(l => l.accion === 'REINICIAR');

      // Pintar individuales
      if(document.getElementById("lblLogQuery")) document.getElementById("lblLogQuery").textContent = formatoLog(logQuery);
      if(document.getElementById("lblLogProcesar")) document.getElementById("lblLogProcesar").textContent = formatoLog(logProcesar);
      if(document.getElementById("lblLogDescargar")) document.getElementById("lblLogDescargar").textContent = formatoLog(logDescargar);
      if(document.getElementById("lblLogReiniciar")) document.getElementById("lblLogReiniciar").textContent = formatoLog(logReiniciar);

      // Pintar los CONTEOS (pueden ser múltiples)
      const logsConteos = logs.filter(l => l.accion === 'REGISTRO_CONTEO').reverse(); // Reverse para mostrar del 1 al N
      const contenedorConteos = document.getElementById("contenedorLogsConteos");
      
      if(contenedorConteos) {
        contenedorConteos.innerHTML = "";
        logsConteos.forEach((log, index) => {
          contenedorConteos.innerHTML += `
            <div class="audit-item">
              <span class="audit-label">Conteo ${index + 1}:</span> 
              <span class="audit-value">${formatoLog(log)}</span>
            </div>
          `;
        });
      }

    } catch (e) { console.error("Error cargando logs:", e); }
  }

  function formatoLog(log) {
    if(!log) return "Sin registros";
    const d = new Date(log.fecha);
    const fechaF = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    return `${log.usuario} - ${fechaF}`;
  }
});