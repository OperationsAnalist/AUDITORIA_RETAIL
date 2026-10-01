document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.requireAuth === "function") window.requireAuth();

  const clienteRaw = localStorage.getItem("clienteSeleccionado");
  if (!clienteRaw) return window.location.href = "./clientes-retail.html";
  
  const cliente = JSON.parse(clienteRaw);
  if (cliente.tipo_flujo !== "PREDISTRIBUIDO") return window.location.href = "./auditoria-cliente.html";

  const user = typeof window.getUser === "function" ? window.getUser() : null;
  const rol = String(user?.rol || "").toUpperCase();

  // --- DOM Elements ---
  const clienteLogo = document.getElementById("clienteLogo");
  const auditTrailBox = document.getElementById("auditTrailBox");
  
  const estadoQuery = document.getElementById("estadoQuery");
  const estadoConteo = document.getElementById("estadoConteo");
  const estadoProceso = document.getElementById("estadoProceso");
  const textoQuery = document.getElementById("textoQuery");
  const textoConteo = document.getElementById("textoConteo");
  const textoProceso = document.getElementById("textoProceso");
  const timelineBadgeConteo = document.getElementById("timelineBadgeConteo");
  
  const btnCargarQuery = document.getElementById("btnCargarQuery");
  const btnRegistrarConteo = document.getElementById("btnRegistrarConteo");
  const btnProcesar = document.getElementById("btnProcesar");
  const btnDescargar = document.getElementById("btnDescargar");
  const btnReiniciar = document.getElementById("btnReiniciar");
  const btnIrEditarDatos = document.getElementById("btnIrEditarDatos");
  const btnForzarN1 = document.getElementById("btnForzarN1");
  const inputQueryExcel = document.getElementById("inputQueryExcel");
  const reporteBody = document.getElementById("reporteBody");

  let queryCargadoActual = false;
  let reporteActualEnMemoria = [];

  // Modales
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingText = document.getElementById("loadingText");
  const appModal = document.getElementById("appModal");
  const appModalOk = document.getElementById("appModalOk");
  if (appModalOk) appModalOk.addEventListener("click", () => appModal.classList.add("oculto"));

  if (clienteLogo) {
    clienteLogo.src = normalizarLogo(cliente.logo_url);
    clienteLogo.onerror = () => { clienteLogo.src = "../IMG/logo.png"; };
  }

// --- INICIALIZACIÓN ---
  configurarPermisos();
  
  if (rol === "SUPERADMIN" && auditTrailBox) {
    auditTrailBox.classList.remove("oculto");
    cargarLogsCliente();
  }

  await cargarEstado();

  // --- EVENTOS PREDISTRIBUIDO ---
  btnCargarQuery.addEventListener("click", () => {
    inputQueryExcel.click();
  });

inputQueryExcel.addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;

    if (rol !== "SUPERADMIN" && rol !== "RETAIL") {
      mostrarModal("Acceso denegado", "No tiene permisos para cargar QUERY.", "error");
      inputQueryExcel.value = "";
      return;
    }

try {
      btnCargarQuery.disabled = true;
      localStorage.removeItem(`reportePredi_${cliente.id}`); // LÍNEA NUEVA: Limpia la memoria
      mostrarLoading("Cargando QUERY Predistribuido", "Leyendo archivo...");

      // 1. Leer y agrupar con la lógica de la Macro VBA
      const registros = await leerExcelQuerySodimac(archivo);

      if (!registros.length) {
        ocultarLoading();
        mostrarModal("Archivo sin datos", "El archivo no contiene registros válidos (LPN y SN).", "error");
        return;
      }

      actualizarLoading("Eliminando QUERY anterior...");
      await window.limpiarQueryCliente(cliente.id);

      actualizarLoading("Creando nueva carga...");
      const upload = await window.crearQueryUpload({
        clientId: cliente.id,
        archivoNombre: archivo.name,
        email: user?.email || ""
      });

      // 2. Mapear datos a la estructura de Supabase (LPN irá en columna_e)
      const items = registros.map((r, index) => ({
        upload_id: upload.id,
        client_id: cliente.id,
        fila_excel: index + 2,
        columna_e: r.lpn,      // Guardamos el LPN aquí
        sku: r.sn,             // Guardamos el SN aquí
        descripcion: r.descripcion,
        um: "EACH",            // UM Forzada por la macro
        cantidad: r.cantidad
      }));

      actualizarLoading("Guardando en base de datos...");
      await window.insertarQueryItems(items);

// Auditoría
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'CARGA_QUERY', user?.nombre || user?.email || 'Desconocido');
        if (rol === "SUPERADMIN") cargarLogsCliente();
      }

      await cargarEstado();
      await cargarReporteBase(); // Dibujamos la tabla inicial

      ocultarLoading();
      mostrarModal("Carga Exitosa", `Se agruparon y cargaron ${items.length} registros únicos (agrupados por LPN y SN).`, "success");

    } catch (error) {
      console.error(error);
      ocultarLoading();
      mostrarModal("Error", error.message, "error");
    } finally {
      btnCargarQuery.disabled = false;
      inputQueryExcel.value = "";
    }
  });

btnRegistrarConteo.addEventListener("click", () => {
    const rol = String(user?.rol || "").toUpperCase();

    // 1. Validar Permisos
    if (rol !== "SUPERADMIN" && rol !== "AUDITOR") {
      mostrarModal("Acceso denegado", "No tiene permisos para registrar CONTEO.", "error");
      return;
    }

    // 2. Validar que el Query esté cargado
    if (!queryCargadoActual) {
      mostrarModal(
        "QUERY pendiente",
        "Primero debe existir un QUERY cargado para este cliente.",
        "error"
      );
      return;
    }

    // 3. Dirigir a la nueva pantalla predistribuida
    window.location.href = "./conteo-sodimac-pre.html";
  });

  
// --- NUEVOS EVENTOS PARA PREDISTRIBUIDO ---
  if (btnIrEditarDatos) {
    btnIrEditarDatos.addEventListener("click", () => {
      // 1. Validamos que el Query ya esté cargado antes de dejarlo editar
      if (!queryCargadoActual) {
        mostrarModal("No permitido", "Debe cargar un QUERY antes de editar datos.", "error");
        return;
      }
      window.location.href = "./editar-datos.html";
    });
  }

  // Ocultamos permanentemente el botón FORZAR N1 para Predistribuido
  if (btnForzarN1) {
    btnForzarN1.style.display = "none";
  }


btnProcesar.addEventListener("click", async () => {
    if (btnProcesar.disabled) return;

    try {
      btnProcesar.disabled = true;
      mostrarLoading("Procesando...", "Obteniendo datos y cruzando información...");

      const queryData = await window.getQueryItems(cliente.id);
      const conteoData = await window.getConteoItems(cliente.id);
      
      let maestraData = [];
      if (window.supabase) {
        const { data } = await window.supabase.from('maestra_sku').select('*');
        if (data) maestraData = data;
      } else if (typeof window.getMaestraSku === "function") {
        maestraData = await window.getMaestraSku();
      }

      const limpiar = (str) => String(str || "").replace(/^0+/, "").trim();

      const dictMaestra = new Map();
      maestraData.forEach(m => {
        const clave = limpiar(m.stock_number || m.sku || "");
        if (clave) dictMaestra.set(clave, m);
      });

      let reporte = queryData.map(q => {
        const lpn = String(q.columna_e || "").trim();
        const snRaw = String(q.sku || "");
        const snLimpio = limpiar(snRaw);
        const qty = Number(q.cantidad) || 0;
        const um = String(q.um || "").trim().toUpperCase();

        const m = dictMaestra.get(snLimpio) || {};
        let um_min = "N2";
        if (["EACH", "UN", "PZA", "UNIDAD", "CJ", "PCS"].includes(um)) um_min = "N1";

        return {
          id_query: q.id,
          lpn: lpn,
          sku: snRaw, 
          descripcion: m.descripcion || q.descripcion || "",
          um: um,
          cantidad: qty,
          ean_13: m.ean_13 || "AGREGAR EN BD",
          valor_ean_13: m.valor_ean_13 || 1,
          inner_code: m.inner_code || "AGREGAR EN BD",
          valor_inner: m.valor_inner || 1,
          ean_14: m.ean_14 || "AGREGAR EN BD",
          valor_ean_14: m.valor_ean_14 || 1,
          um_min: um_min,
          plan: 0, 
          real: 0,
          paleta: "",
          comentario: "",
          comentario_2: "",
          key: lpn.length > 10 ? lpn.slice(-10) : lpn,
          condicion: ""
        };
      });

      const conteoKeys = {};
      reporte.forEach(r => { conteoKeys[r.key] = (conteoKeys[r.key] || 0) + 1; });
      reporte.forEach(r => {
        if (conteoKeys[r.key] > 1) r.condicion = "PRIORIDAD AUDITAR";
      });

      conteoData.forEach(c => {
        const cEanLimpio = limpiar(c.ean);
        const cLpn = String(c.tienda || "").trim(); 
        const cQty = Number(c.cantidad) || 1;
        const cPaleta = String(c.bulto || "").trim(); 

        let encontrado = false;
        let matchSoloEan = false;

        for (let r of reporte) {
          const e13Limpio = limpiar(r.ean_13);
          const eInLimpio = limpiar(r.inner_code);
          const e14Limpio = limpiar(r.ean_14);
          const skuLimpio = limpiar(r.sku); // EXTRA: También buscamos por si escaneó el SKU

          // MATCH EXTREMO: Busca por EAN13, Inner, EAN14, ¡o incluso el propio SKU!
          if (cEanLimpio === e13Limpio || cEanLimpio === eInLimpio || cEanLimpio === e14Limpio || cEanLimpio === skuLimpio) {
            
            let factor = 1;
            if (cEanLimpio === e13Limpio) factor = Number(r.valor_ean_13) || 1;
            else if (cEanLimpio === eInLimpio) factor = Number(r.valor_inner) || 1;
            else if (cEanLimpio === e14Limpio) factor = Number(r.valor_ean_14) || 1;
            // Si cEanLimpio === skuLimpio, el factor se queda en 1

            // MATCH LPN BLINDADO (Compara limpiando ceros y espacios de ambos lados)
            if (limpiar(cLpn) === limpiar(r.lpn)) {
              r.real += (cQty * factor); 
              
              if (!r.paleta.includes(cPaleta)) {
                r.paleta = r.paleta ? r.paleta + ", " + cPaleta : cPaleta;
              }
              encontrado = true;
              break;
            } else {
              matchSoloEan = true; 
            }
          }
        }

        if (!encontrado && matchSoloEan) {
          for (let r of reporte) {
            if (cEanLimpio === limpiar(r.ean_13) || cEanLimpio === limpiar(r.inner_code) || cEanLimpio === limpiar(r.ean_14) || cEanLimpio === limpiar(r.sku)) {
              if (!r.paleta) r.paleta = "LPN NO COINCIDE";
            }
          }
        }
      });

// LÍNEAS NUEVAS: Guarda en memoria persistente local
      reporteActualEnMemoria = reporte;
      localStorage.setItem(`reportePredi_${cliente.id}`, JSON.stringify(reporte));
      
      // ¡NUEVO! SUBIR A LA NUBE: Mapeamos los datos para la tabla genérica de Supabase
      actualizarLoading("Guardando en la nube...");
      const payloadDB = reporte.map((r, i) => ({
        client_id: cliente.id,
        nro: i + 1,
        columna_b: r.lpn,
        sku: r.sku,
        descripcion: r.descripcion,
        um: r.um,
        cantidad: r.cantidad,
        ean_13: r.ean_13,
        valor_ean_13: r.valor_ean_13,
        inner_code: r.inner_code,
        valor_inner: r.valor_inner,
        ean_14: r.ean_14,
        valor_ean_14: r.valor_ean_14,
        um_min: r.um_min,
        plan: r.plan,
        real: r.real,
        ubicacion: r.paleta,      // Guardamos la Paleta aquí
        comentario: r.condicion,  // Guardamos la Condición Prioridad aquí
        comentario_2: r.key       // Guardamos la Key aquí
      }));
      await window.guardarReporteJS(cliente.id, payloadDB);

      renderizarReporteDinamico(); 

      // Auditoría
      if (typeof window.registrarLog === "function") {
        await window.registrarLog(`CLIENTE_${cliente.id}`, 'CARGA_QUERY', user?.nombre || user?.email || 'Desconocido');
        if (rol === "SUPERADMIN") cargarLogsCliente();
      }

      ocultarLoading();
      mostrarModal("Proceso terminado", "El cruce se guardó y calculó con éxito.", "success");

    } catch (error) {
      console.error(error);
      ocultarLoading();
      mostrarModal("Error", "Ocurrió un problema: " + error.message, "error");
    } finally {
      btnProcesar.disabled = false;
    }
  });
  // --- FUNCIONES CORE ---
  async function cargarEstado() {
    try {
      const estado = await window.getEstadoCliente(cliente.id);
      const queryOk = !!estado?.query_cargado;
      const conteoOk = !!estado?.conteo_cargado;
      const puedeProcesar = !!estado?.puede_procesar;

      queryCargadoActual = queryOk;
// --- LÓGICA PARA MOSTRAR LA BURBUJA DE CONTEOS EN TIEMPO REAL Y TOOLTIP ---
      let totalConteos = Number(estado?.conteos_guardados || 0);
      const contenedorBadge = document.getElementById("contenedorBadgeConteo");
      const lblAuditores = document.getElementById("lblAuditores");

      if (timelineBadgeConteo) {
        timelineBadgeConteo.textContent = totalConteos;
        
        if (totalConteos > 0) {
          if (contenedorBadge) contenedorBadge.classList.remove("oculto");
          
          timelineBadgeConteo.classList.remove("oculto", "timeline-badge-red", "timeline-badge-green");
          timelineBadgeConteo.classList.add("timeline-badge-blue"); // Se pinta de Azul Corporativo
          
          // Asigna el texto "Auditor:" o "Auditores:" al nuevo label izquierdo
          if (lblAuditores) lblAuditores.textContent = totalConteos === 1 ? "Auditor:" : "Auditores:";

          // Obtenemos los nombres usando la función que ya existe en tu api.js
          try {
            const data = await window.getConteoItems(cliente.id);
            
            if (data && data.length > 0) {
              // Limpiamos el correo (ej: jcelisc@... -> JCELISC) y sacamos únicos
              const auditoresUnicos = [...new Set(data.map(d => (d.auditor_email || 'Auditor').split('@')[0].toUpperCase()))];
              
              // Armamos la lista para el Tooltip (Al pasar el mouse)
              const tooltipHtml = auditoresUnicos.map((u, i) => `${i+1}. ${u}`).join("\n");
              timelineBadgeConteo.title = tooltipHtml; // Insertamos en el Title Nativo
            } else {
              timelineBadgeConteo.title = "Auditores registrados"; 
            }
          } catch (err) {
            console.error("Error cargando nombres de auditores:", err);
            timelineBadgeConteo.title = "Auditores registrados"; 
          }
        } else {
          if (contenedorBadge) contenedorBadge.classList.add("oculto");
          timelineBadgeConteo.title = "Sin conteos";
        }
      }

      // Mantiene el texto superior como "Pendiente" o "Registrado"
      pintarEstado(estadoQuery, textoQuery, queryOk, queryOk ? "Cargado" : "Pendiente");
      pintarEstado(estadoConteo, textoConteo, conteoOk, conteoOk ? "Registrado" : "Pendiente");
      pintarEstado(estadoProceso, textoProceso, puedeProcesar, puedeProcesar ? "Disponible" : "Bloqueado");

      btnProcesar.disabled = !puedeProcesar;
    } catch (error) {
      console.error("Error cargando estado:", error);
      btnProcesar.disabled = true;
    }
  }

  function pintarEstado(item, texto, ok, mensaje) {
    if (item && texto) {
      item.classList.toggle("ok", ok);
      texto.textContent = mensaje;
    }
  }

  function configurarPermisos() {
    if (btnCargarQuery) btnCargarQuery.style.display = "none";
    if (btnRegistrarConteo) btnRegistrarConteo.style.display = "none";
    if (btnProcesar) btnProcesar.style.display = "none";
    if (btnDescargar) btnDescargar.style.display = "none";
    if (btnReiniciar) btnReiniciar.style.display = "none";
    if (btnIrEditarDatos) btnIrEditarDatos.style.display = "none";
    if (btnForzarN1) btnForzarN1.style.display = "none";

    if (rol === "SUPERADMIN") {
      if (btnCargarQuery) btnCargarQuery.style.display = "inline-flex";
      if (btnRegistrarConteo) btnRegistrarConteo.style.display = "inline-flex";
      if (btnProcesar) btnProcesar.style.display = "inline-flex";
      if (btnDescargar) btnDescargar.style.display = "inline-flex";
      if (btnReiniciar) btnReiniciar.style.display = "inline-flex";
      if (btnIrEditarDatos) btnIrEditarDatos.style.display = "inline-flex";
      if (btnForzarN1) btnForzarN1.style.display = "inline-flex";
    } else if (rol === "RETAIL") {
      if (btnCargarQuery) btnCargarQuery.style.display = "inline-flex";
    } else if (rol === "AUDITOR") {
      if (btnRegistrarConteo) btnRegistrarConteo.style.display = "inline-flex";
      if (btnProcesar) btnProcesar.style.display = "inline-flex";
      if (btnDescargar) btnDescargar.style.display = "inline-flex";
      if (btnReiniciar) btnReiniciar.style.display = "inline-flex";
      if (btnIrEditarDatos) btnIrEditarDatos.style.display = "inline-flex";
      if (btnForzarN1) btnForzarN1.style.display = "inline-flex";
    }
  }
// --- LÓGICA VBA MACRO 1 TRADUCIDA A JS ---
  async function leerExcelQuerySodimac(archivo) {
    if (typeof XLSX === "undefined") throw new Error("Falta librería XLSX.");

    const buffer = await archivo.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const hoja = workbook.Sheets[workbook.SheetNames[0]]; 

    // raw: false fuerza a leer los LPN como texto puro para no perder números grandes
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" });

    const mapAgrupado = new Map();
    let lineasRealesLeidas = 0; // Contador para auditoría

    // Iteramos todo el Excel
    for (let i = 0; i < filas.length; i++) {
      const row = filas[i];
      if (!row || row.length === 0) continue;

      const lpn = String(row[0] || "").trim();
      const sn = String(row[1] || "").trim();
      const desc = String(row[2] || "").trim();
      
      let qty = 0;
      if (row[3] !== undefined && row[3] !== "") {
        qty = Number(String(row[3]).replace(/,/g, "")) || 0;
      }

      // Ignoramos vacíos y todas las cabeceras "LPN" intermedias
      if (lpn !== "" && lpn.toUpperCase() !== "LPN") {
        lineasRealesLeidas++; // Sumamos 1 línea leída
        
        const key = `${lpn}|${sn}`; // Llave compuesta

        if (mapAgrupado.has(key)) {
          // MACRO VBA: Si ya existe el LPN + SN, suma la cantidad
          const existente = mapAgrupado.get(key);
          existente.cantidad += qty;
        } else {
          // MACRO VBA: Si no existe, lo agrega limpio
          mapAgrupado.set(key, { lpn, sn, descripcion: desc, cantidad: qty });
        }
      }
    }

    // Comprobación interna para ti (Presiona F12 en Chrome para verlo)
    console.log(`Líneas de datos leídas (sin cabeceras ni vacíos): ${lineasRealesLeidas}`);
    console.log(`Registros finales tras agrupar los duplicados: ${mapAgrupado.size}`);

    return Array.from(mapAgrupado.values());
  }

// --- RENDERIZAR TABLA (LEE SIEMPRE DE LA NUBE PARA SINCRONIZAR USUARIOS) ---
  async function cargarReporteBase() {
    try {
      // 1. OBTENER DESDE LA NUBE PRIMERO
      const dataDB = await window.getReporteCliente(cliente.id);
      
      if (dataDB && dataDB.length > 0) {
        // Transformamos el formato genérico de la BD de vuelta a nuestro formato Predistribuido
        reporteActualEnMemoria = dataDB.map(d => ({
          lpn: d.columna_b,
          sku: d.sku,
          descripcion: d.descripcion,
          um: d.um,
          cantidad: d.cantidad,
          ean_13: d.ean_13,
          valor_ean_13: d.valor_ean_13,
          inner_code: d.inner_code,
          valor_inner: d.valor_inner,
          ean_14: d.ean_14,
          valor_ean_14: d.valor_ean_14,
          um_min: d.um_min,
          plan: d.plan,
          real: d.real,
          paleta: d.ubicacion,
          condicion: d.comentario,
          key: d.comentario_2
        }));
        
        // Refrescamos la memoria local por si acaso y dibujamos
        localStorage.setItem(`reportePredi_${cliente.id}`, JSON.stringify(reporteActualEnMemoria));
        renderizarReporteDinamico();
        return; 
      }

      // 2. SI LA NUBE ESTÁ VACÍA (Aún no le dan a procesar), dibuja el cascarón de Query
      const dataQuery = await window.getQueryItems(cliente.id);
      
      if (!dataQuery || dataQuery.length === 0) {
        reporteBody.innerHTML = `<tr><td colspan="20">Sin registros. Cargue un archivo Excel.</td></tr>`;
        return;
      }

      reporteBody.innerHTML = "";
      
      dataQuery.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.columna_e || "-"}</td>
          <td style="font-weight: bold;">${r.sku || "-"}</td>
          <td>${r.descripcion || "-"}</td>
          <td>${r.um || "-"}</td>
          <td>${r.cantidad || "0"}</td>
          <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
          <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
          <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
        `;
        reporteBody.appendChild(tr);
      });
      
    } catch (e) {
      console.error("Error pintando tabla:", e);
    }
  }

// Llamar a la tabla base al iniciar (después de cargarEstado)
  cargarReporteBase();

// =================================================================================
  // REEMPLAZO DESDE AQUÍ HASTA EL FINAL DEL ARCHIVO (Línea 541 en adelante aprox.)
  // =================================================================================

  // Función matemática unificada para calcular la diferencia
  function calcularDiferenciaPredistribuido(r) {
    let cantidad = Number(r.cantidad) || 0;
    let valorInner = Number(r.valor_inner) || 1;
    let valorEan14 = Number(r.valor_ean_14) || 1;
    let valPlan = 0;
    
    if (r.um_min === "N1") valPlan = cantidad;
    else if (r.um_min === "N2") valPlan = cantidad * valorInner;
    else if (r.um_min === "N3") valPlan = cantidad * valorEan14;
    else valPlan = cantidad;

    let valReal = Number(r.real) || 0;
    return valReal - valPlan;
  }

  function renderizarReporteDinamico(listaATrabajar = reporteActualEnMemoria, esFiltrado = false) {
    if (reporteActualEnMemoria.length === 0) {
      reporteBody.innerHTML = `<tr><td colspan="20">Sin reporte procesado.</td></tr>`;
      document.getElementById("kpiPlan").textContent = "0 ITEMS";
      document.getElementById("kpiReal").textContent = "0 ITEMS";
      document.getElementById("kpiEfectividad").textContent = "0.00%";
      document.getElementById("kpiEfectividadBox").className = "kpi-box bg-red";
      return;
    }

    reporteBody.innerHTML = "";

    if (listaATrabajar.length === 0) {
      reporteBody.innerHTML = `<tr><td colspan="20" style="text-align:center; font-weight: bold;">No hay resultados para esta combinación de filtros.</td></tr>`;
    } else {
      let hayFaltantes = false;
      let haySobrantes = false;
      let hayPrioridad = false;

      listaATrabajar.forEach(r => {
        const tr = document.createElement("tr");

        let valDif = calcularDiferenciaPredistribuido(r);

        if (valDif < 0) hayFaltantes = true;
        if (valDif > 0) haySobrantes = true;
        if (r.condicion === "PRIORIDAD AUDITAR") hayPrioridad = true;

        let valPlan = (Number(r.real) || 0) - valDif; 
        let valReal = Number(r.real) || 0;

        let claseColorDif = "";
        if (valDif === 0) claseColorDif = "dif-cero"; 
        else if (valDif > 0) claseColorDif = "dif-pos"; 
        else if (valDif < 0) claseColorDif = "dif-neg"; 

        let clasePaleta = (r.paleta === "LPN NO COINCIDE") ? "estado-error" : "";
        let claseCondicion = (r.condicion === "PRIORIDAD AUDITAR") ? "estado-warning" : "";

        // ¡EL ATRIBUTO t="s" OBLIGA A EXCEL A EXPORTAR COMO TEXTO Y NO COMO NÚMERO CIENTÍFICO!
        tr.innerHTML = `
          <td t="s">${r.lpn || "-"}</td>
          <td t="s" style="font-weight: bold;">${r.sku || "-"}</td>
          <td>${r.descripcion || "-"}</td>
          <td>${r.um || "-"}</td>
          <td>${r.cantidad || 0}</td>
          <td t="s">${r.ean_13 || "-"}</td>
          <td>${r.valor_ean_13 || ""}</td>
          <td t="s">${r.inner_code || "-"}</td>
          <td>${r.valor_inner || ""}</td>
          <td t="s">${r.ean_14 || "-"}</td>
          <td>${r.valor_ean_14 || ""}</td>
          <td style="font-weight: 900;">${r.um_min || "N1"}</td>
          <td>${valPlan > 0 ? valPlan : ""}</td>
          <td>${valReal > 0 ? valReal : ""}</td>
          <td t="s" class="${clasePaleta}">${r.paleta || ""}</td>
          <td class="${claseColorDif}">${valDif}</td>
          <td>${r.comentario || ""}</td>
          <td>${r.comentario_2 || ""}</td>
          <td t="s">${r.key || ""}</td>
          <td t="s" class="${claseCondicion}">${r.condicion || ""}</td>
        `;
        reporteBody.appendChild(tr);
      });

      // Solo evaluamos mostrar/ocultar botones base si NO estamos filtrando
      if (!esFiltrado) {
        const btnP = document.getElementById("btnFiltroPrioridad");
        const btnF = document.getElementById("btnFiltroFaltante");
        const btnS = document.getElementById("btnFiltroSobrante");
        if(btnP) { btnP.classList.toggle("oculto", !hayPrioridad); btnP.style.opacity = "1"; }
        if(btnF) { btnF.classList.toggle("oculto", !hayFaltantes); btnF.style.opacity = "1"; }
        if(btnS) { btnS.classList.toggle("oculto", !haySobrantes); btnS.style.opacity = "1"; }
      }
    }

    // Recalcular KPIs GLOBALES (siempre sobre memoria total para no alterar el %)
    let totalPlanG = 0, totalRealG = 0;
    reporteActualEnMemoria.forEach(r => {
      let dif = calcularDiferenciaPredistribuido(r);
      let p = (Number(r.real) || 0) - dif;
      if (p > 0) totalPlanG++;
      if ((Number(r.real) || 0) > 0) totalRealG++;
    });

    document.getElementById("kpiPlan").textContent = `${totalPlanG} ITEMS`;
    document.getElementById("kpiReal").textContent = `${totalRealG} ITEMS`;

    const efectividad = totalPlanG > 0 ? (totalRealG / totalPlanG) * 100 : 0;
    const kpiEfectividadBox = document.getElementById("kpiEfectividadBox");
    document.getElementById("kpiEfectividad").textContent = `${efectividad.toFixed(2)}%`;

    kpiEfectividadBox.classList.remove("bg-grad-red", "bg-grad-yellow", "bg-grad-green", "bg-red");
    if (efectividad < 60) kpiEfectividadBox.classList.add("bg-grad-red");
    else if (efectividad < 90) kpiEfectividadBox.classList.add("bg-grad-yellow");
    else kpiEfectividadBox.classList.add("bg-grad-green");
  }

  // --- ESTADO Y LÓGICA DE FILTROS APILABLES ---
  let estadoFiltro = {
    prioridad: false,
    diferencia: null // "faltante", "sobrante", o null
  };

  function aplicarFiltrosMultiples() {
    let resultado = reporteActualEnMemoria;

    // 1. Filtrar por PRIORIDAD
    if (estadoFiltro.prioridad) {
      resultado = resultado.filter(r => r.condicion === "PRIORIDAD AUDITAR");
    }
    
    // 2. Evaluamos dinámicamente si mostrar Faltantes/Sobrantes basado en la lista reducida
    let hayF = false;
    let hayS = false;
    resultado.forEach(r => {
      let dif = calcularDiferenciaPredistribuido(r);
      if (dif < 0) hayF = true;
      if (dif > 0) hayS = true;
    });

    const btnF = document.getElementById("btnFiltroFaltante");
    const btnS = document.getElementById("btnFiltroSobrante");
    const btnP = document.getElementById("btnFiltroPrioridad");

    if (btnF) {
      btnF.classList.toggle("oculto", !hayF);
      btnF.style.opacity = estadoFiltro.diferencia === "faltante" ? "0.5" : "1";
    }
    if (btnS) {
      btnS.classList.toggle("oculto", !hayS);
      btnS.style.opacity = estadoFiltro.diferencia === "sobrante" ? "0.5" : "1";
    }
    if (btnP) {
      btnP.style.opacity = estadoFiltro.prioridad ? "0.5" : "1";
    }

    // Si había un filtro activo pero la lista reducida ya no tiene esos errores, lo apagamos
    if (estadoFiltro.diferencia === "faltante" && !hayF) estadoFiltro.diferencia = null;
    if (estadoFiltro.diferencia === "sobrante" && !hayS) estadoFiltro.diferencia = null;

    // 3. Aplicamos Filtro DIFERENCIA
    if (estadoFiltro.diferencia === "faltante") {
      resultado = resultado.filter(r => calcularDiferenciaPredistribuido(r) < 0);
    } else if (estadoFiltro.diferencia === "sobrante") {
      resultado = resultado.filter(r => calcularDiferenciaPredistribuido(r) > 0);
    }

    renderizarReporteDinamico(resultado, true); 
    
    // Mostramos el botón "QUITAR FILTROS"
    const btnTodos = document.getElementById("btnFiltroTodos");
    if (btnTodos) {
      if (estadoFiltro.prioridad || estadoFiltro.diferencia !== null) {
        btnTodos.classList.remove("oculto");
      } else {
        btnTodos.classList.add("oculto");
      }
    }
  }

  // --- EVENTOS DE LOS BOTONES DE FILTRO ---
  const btnFiltroPrioridad = document.getElementById("btnFiltroPrioridad");
  const btnFiltroFaltante = document.getElementById("btnFiltroFaltante");
  const btnFiltroSobrante = document.getElementById("btnFiltroSobrante");
  const btnFiltroTodos = document.getElementById("btnFiltroTodos");

  if(btnFiltroPrioridad) {
    btnFiltroPrioridad.addEventListener("click", () => {
      estadoFiltro.prioridad = !estadoFiltro.prioridad; // Funciona como interruptor
      aplicarFiltrosMultiples();
    });
  }

  if(btnFiltroFaltante) {
    btnFiltroFaltante.addEventListener("click", () => {
      estadoFiltro.diferencia = estadoFiltro.diferencia === "faltante" ? null : "faltante";
      aplicarFiltrosMultiples();
    });
  }

  if(btnFiltroSobrante) {
    btnFiltroSobrante.addEventListener("click", () => {
      estadoFiltro.diferencia = estadoFiltro.diferencia === "sobrante" ? null : "sobrante";
      aplicarFiltrosMultiples();
    });
  }

  if(btnFiltroTodos) {
    btnFiltroTodos.addEventListener("click", () => {
      estadoFiltro.prioridad = false;
      estadoFiltro.diferencia = null;
      aplicarFiltrosMultiples(); 
    });
  }

  // --- BOTÓN DESCARGAR (EXCEL) PARA PREDISTRIBUIDO ---
  if (btnDescargar) {
    btnDescargar.addEventListener("click", async () => {
      try {
        mostrarLoading("Generando Excel", "Compilando hojas...");

        const wb = XLSX.utils.book_new();

        const dataQuery = await window.getQueryItems(cliente.id);
        const wsQuery = XLSX.utils.json_to_sheet(dataQuery.map(q => ({
          "LPN": String(q.columna_e || ""), 
          "SKU (SN)": String(q.sku || ""),
          "Descripción": q.descripcion || "",
          "UM": q.um || "",
          "Cantidad": Number(q.cantidad) || 0
        })));
        XLSX.utils.book_append_sheet(wb, wsQuery, "QUERY");

        const dataConteo = await window.getConteoItems(cliente.id);
        const wsConteo = XLSX.utils.json_to_sheet(dataConteo.map(c => ({
          "Auditor": c.auditor_email || "",
          "Paleta": String(c.bulto || ""),
          "LPN": String(c.tienda || ""), 
          "EAN": String(c.ean || ""),
          "Cantidad": Number(c.cantidad) || 0
        })));
        XLSX.utils.book_append_sheet(wb, wsConteo, "CONTEO");

        const tablaHtml = document.querySelector(".tabla-scroll table");
        // sheetJS lee el atributo t="s" que agregamos en el HTML para forzar texto puro
        const wsReporte = XLSX.utils.table_to_sheet(tablaHtml, { raw: false }); 
        XLSX.utils.book_append_sheet(wb, wsReporte, "Reporte");

        const hoy = new Date();
        const dia = String(hoy.getDate()).padStart(2, '0');
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const nombreArchivo = `${dia}-${mes} Reporte Predistribuido ${cliente.nombre}.xlsx`;

        XLSX.writeFile(wb, nombreArchivo);
        ocultarLoading();

        if (typeof window.registrarLog === "function") {
          await window.registrarLog(`CLIENTE_${cliente.id}`, 'DESCARGAR', user?.nombre || user?.email || 'Desconocido');
          if (rol === "SUPERADMIN") cargarLogsCliente();
        }
      } catch (error) {
        console.error(error);
        ocultarLoading();
        mostrarModal("Error", "No se pudo generar el Excel: " + error.message, "error");
      }
    });
  }

  // --- Utilidades Finales ---
  function normalizarLogo(logoUrl) { return !logoUrl ? "../IMG/logo.png" : (logoUrl.startsWith("IMG/") ? "../" + logoUrl : logoUrl); }
  function mostrarLoading(t, m) { if(loadingTitle) loadingTitle.textContent = t; if(loadingText) loadingText.textContent = m; if(loadingOverlay) loadingOverlay.classList.remove("oculto"); }
  function ocultarLoading() { if(loadingOverlay) loadingOverlay.classList.add("oculto"); }
  function actualizarLoading(mensaje) { if(loadingText) loadingText.textContent = mensaje; }
  function mostrarModal(t, m, tipo="success") { document.getElementById("appModalTitle").textContent = t; document.getElementById("appModalMessage").textContent = m; const icon = document.getElementById("appModalIcon"); if(icon){ icon.className = `app-modal-icon ${tipo}`; icon.textContent = tipo==="success"?"✓":"!"; } if (appModal) appModal.classList.remove("oculto"); }

  // --- FUNCIONES DE AUDITORÍA PARA CLIENTE PREDISTRIBUIDO ---
  async function cargarLogsCliente() {
    try {
      const moduloId = `CLIENTE_${cliente.id}`;
      const logs = await window.obtenerUltimosLogs(moduloId);
      const logQuery = logs.find(l => l.accion === 'CARGA_QUERY');
      const logProcesar = logs.find(l => l.accion === 'PROCESAR');
      const logDescargar = logs.find(l => l.accion === 'DESCARGAR');
      const logReiniciar = logs.find(l => l.accion === 'REINICIAR');

      if(document.getElementById("lblLogQuery")) document.getElementById("lblLogQuery").textContent = formatoLog(logQuery);
      if(document.getElementById("lblLogProcesar")) document.getElementById("lblLogProcesar").textContent = formatoLog(logProcesar);
      if(document.getElementById("lblLogDescargar")) document.getElementById("lblLogDescargar").textContent = formatoLog(logDescargar);
      if(document.getElementById("lblLogReiniciar")) document.getElementById("lblLogReiniciar").textContent = formatoLog(logReiniciar);

      const logsConteos = logs.filter(l => l.accion === 'REGISTRO_CONTEO').reverse(); 
      const contenedorConteos = document.getElementById("contenedorLogsConteos");
      if(contenedorConteos) {
        contenedorConteos.innerHTML = "";
        logsConteos.forEach((log, index) => {
          contenedorConteos.innerHTML += `<div class="audit-item"><span class="audit-label">Conteo ${index + 1}:</span> <span class="audit-value">${formatoLog(log)}</span></div>`;
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