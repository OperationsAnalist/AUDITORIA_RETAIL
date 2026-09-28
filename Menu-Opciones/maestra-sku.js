document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.requireAuth === "function") window.requireAuth();

  // 1. Seguridad
  const user = window.getUser();
  const rol = String(user?.rol || "").toUpperCase();
  if (rol !== "SUPERADMIN" && rol !== "AUDITOR") {
    alert("Acceso denegado. No tiene permisos para ver la Data Maestra.");
    window.location.href = "./clientes-retail.html";
    return;
  }

  // 2. Variables del DOM
  const bodyMaestra = document.getElementById("bodyMaestra");
  const buscadorSku = document.getElementById("buscadorSku");
  const btnAgregarFila = document.getElementById("btnAgregarFila");
  const btnGuardarMaestra = document.getElementById("btnGuardarMaestra");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  const auditTrailBox = document.getElementById("auditTrailBox");

  let dataMaestra = [];

  // --- LÓGICA DE MODALES PERSONALIZADOS ---
  const appModal = document.getElementById("appModal");
  const appModalOk = document.getElementById("appModalOk");
  if (appModalOk) appModalOk.addEventListener("click", () => appModal.classList.add("oculto"));

  const confirmModal = document.getElementById("confirmModal");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");

  function mostrarModal(titulo, mensaje, tipo = "success") {
    document.getElementById("appModalTitle").textContent = titulo;
    document.getElementById("appModalMessage").textContent = mensaje;
    const icon = document.getElementById("appModalIcon");
    icon.className = `app-modal-icon ${tipo}`;
    icon.textContent = tipo === "success" ? "✓" : "!";
    appModal.classList.remove("oculto");
  }

  function mostrarConfirmacion(titulo, mensaje) {
    return new Promise((resolve) => {
      document.getElementById("confirmModalTitle").textContent = titulo;
      document.getElementById("confirmModalMessage").textContent = mensaje;
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

  // 3. Inicializar (Auditoría y Data)
  if (rol === "SUPERADMIN" && auditTrailBox) {
    auditTrailBox.classList.remove("oculto");
    cargarLogsMaestra();
  }

  await cargarData(); 

  // --- FUNCIONES PRINCIPALES ---
  async function cargarData() {
    mostrarLoading("Cargando base de datos...");
    try {
      dataMaestra = await window.getMaestraSku();
      renderTabla(dataMaestra);
    } catch (error) {
      bodyMaestra.innerHTML = `<tr><td colspan="11" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    } finally {
      ocultarLoading();
    }
  }

  function renderTabla(lista) {
    bodyMaestra.innerHTML = "";
    
    if (lista.length === 0) {
      bodyMaestra.innerHTML = `<tr><td colspan="11" style="text-align:center;">No se encontraron registros.</td></tr>`;
      return;
    }

    lista.forEach(r => {
      const tr = document.createElement("tr");
      tr.dataset.id = r.id; 
      tr.dataset.estado = "old"; 
      
      tr.innerHTML = `
        <td contenteditable="true" data-field="stock_number">${valor(r.stock_number)}</td>
        <td contenteditable="true" data-field="descripcion" class="col-desc">${valor(r.descripcion)}</td>
        <td contenteditable="true" data-field="unid_medida">${valor(r.unid_medida)}</td>
        <td contenteditable="true" data-field="ean_13">${valor(r.ean_13)}</td>
        <td contenteditable="true" data-field="valor_ean_13" class="col-val">${valor(r.valor_ean_13)}</td>
        <td contenteditable="true" data-field="inner_code">${valor(r.inner_code)}</td>
        <td contenteditable="true" data-field="valor_inner" class="col-val">${valor(r.valor_inner)}</td>
        <td contenteditable="true" data-field="ean_14">${valor(r.ean_14)}</td>
        <td contenteditable="true" data-field="valor_ean_14" class="col-val">${valor(r.valor_ean_14)}</td>
        <td contenteditable="true" data-field="valor_fisico" class="col-val">${valor(r.valor_fisico)}</td>
        <td class="col-btn"><button class="btn-delete-row" title="Eliminar SKU">✕</button></td>
      `;

      tr.addEventListener("input", () => {
        if(tr.dataset.estado !== "new") {
          tr.dataset.estado = "edited";
          tr.classList.add("row-modified");
        }
      });

      const btnDelete = tr.querySelector('.btn-delete-row');
      btnDelete.addEventListener('click', async () => {
        const confirmar = await mostrarConfirmacion(
          "¿Eliminar SKU?", 
          `¿Está seguro que desea eliminar permanentemente el SKU: ${r.stock_number || 'Seleccionado'}?`
        );
        if (!confirmar) return;

        mostrarLoading("Eliminando registro...");
        try {
          await window.eliminarMaestraSku(r.id);
          dataMaestra = dataMaestra.filter(item => item.id !== r.id);
          tr.remove(); 
          
          if (typeof window.registrarLog === "function") {
            await window.registrarLog('MAESTRA_SKU', 'ELIMINAR', user.nombre || user.email);
            if (rol === "SUPERADMIN") cargarLogsMaestra();
          }
          
          mostrarModal("SKU Eliminado", "El registro se eliminó de la base de datos.", "success");
        } catch (error) {
          mostrarModal("Error", "No se pudo eliminar: " + error.message, "error");
        } finally {
          ocultarLoading();
        }
      });

      bodyMaestra.appendChild(tr);
    });
  }

  // 4. EVENTOS
  buscadorSku.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (term === "") {
      renderTabla(dataMaestra);
      return;
    }
    const filtrado = dataMaestra.filter(r => 
      (r.stock_number || "").toLowerCase().includes(term) || 
      (r.descripcion || "").toLowerCase().includes(term) ||
      (r.ean_13 || "").toLowerCase().includes(term) ||
      (r.inner_code || "").toLowerCase().includes(term) ||
      (r.ean_14 || "").toLowerCase().includes(term)
    );
    renderTabla(filtrado);
  });

  btnAgregarFila.addEventListener("click", () => {
    if (bodyMaestra.querySelector("td[colspan]")) bodyMaestra.innerHTML = "";

    const tr = document.createElement("tr");
    tr.dataset.estado = "new";
    tr.classList.add("row-new");
    tr.innerHTML = `
        <td contenteditable="true" data-field="stock_number"></td>
        <td contenteditable="true" data-field="descripcion" class="col-desc"></td>
        <td contenteditable="true" data-field="unid_medida"></td>
        <td contenteditable="true" data-field="ean_13"></td>
        <td contenteditable="true" data-field="valor_ean_13" class="col-val"></td>
        <td contenteditable="true" data-field="inner_code"></td>
        <td contenteditable="true" data-field="valor_inner" class="col-val"></td>
        <td contenteditable="true" data-field="ean_14"></td>
        <td contenteditable="true" data-field="valor_ean_14" class="col-val"></td>
        <td contenteditable="true" data-field="valor_fisico" class="col-val"></td>
        <td class="col-btn"><button class="btn-delete-row" title="Quitar Fila">✕</button></td>
    `;
    
    const btnDelete = tr.querySelector('.btn-delete-row');
    btnDelete.addEventListener('click', () => {
      tr.remove();
    });

    bodyMaestra.insertBefore(tr, bodyMaestra.firstChild);
  });

  btnGuardarMaestra.addEventListener("click", async () => {
    const filasNuevas = Array.from(bodyMaestra.querySelectorAll("tr[data-estado='new']"));
    const filasEditadas = Array.from(bodyMaestra.querySelectorAll("tr[data-estado='edited']"));

    if (filasNuevas.length === 0 && filasEditadas.length === 0) {
      return mostrarModal("Sin cambios", "No hay modificaciones para guardar.", "error");
    }

    const confirmar = await mostrarConfirmacion(
      "¿Guardar cambios?", 
      `Se actualizará la base de datos:\n- Nuevos registros: ${filasNuevas.length}\n- Editados: ${filasEditadas.length}`
    );
    if (!confirmar) return;

    mostrarLoading("Guardando en base de datos...");

    try {
      for (const tr of filasEditadas) {
        const id = tr.dataset.id;
        const payload = extraerDataFila(tr);
        await window.actualizarMaestraSku(id, payload);
      }
      for (const tr of filasNuevas) {
        const payload = extraerDataFila(tr);
        if (payload.stock_number) await window.insertarMaestraSku(payload);
      }

      // Registro de Auditoría para GUARDAR
      if (typeof window.registrarLog === "function") {
        await window.registrarLog('MAESTRA_SKU', 'GUARDAR', user.nombre || user.email);
        if (rol === "SUPERADMIN") cargarLogsMaestra();
      }

      mostrarModal("Sincronización Exitosa", "Data Maestra actualizada correctamente.", "success");
      buscadorSku.value = "";
      await cargarData(); 

    } catch (error) {
      console.error(error);
      mostrarModal("Error", "Error sincronizando: " + error.message, "error");
    } finally {
      ocultarLoading();
    }
  });

  // 5. FUNCIONES SECUNDARIAS
  async function cargarLogsMaestra() {
    try {
      const logs = await window.obtenerUltimosLogs('MAESTRA_SKU');
      const logGuardar = logs.find(l => l.accion === 'GUARDAR');
      const logEliminar = logs.find(l => l.accion === 'ELIMINAR');

      document.getElementById("lblUltimoGuardar").textContent = logGuardar 
        ? `${logGuardar.usuario} - ${formatearFecha(logGuardar.fecha)}` 
        : "Sin registros";
        
      document.getElementById("lblUltimoEliminar").textContent = logEliminar 
        ? `${logEliminar.usuario} - ${formatearFecha(logEliminar.fecha)}` 
        : "Sin registros";
    } catch (e) { console.error("Error cargando logs:", e); }
  }

  function formatearFecha(fechaISO) {
    const d = new Date(fechaISO);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hor = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hor}:${min}:${sec}`;
  }

  function extraerDataFila(tr) {
    return {
      stock_number: limpiar(tr.querySelector('[data-field="stock_number"]').textContent),
      descripcion: limpiar(tr.querySelector('[data-field="descripcion"]').textContent),
      unid_medida: limpiar(tr.querySelector('[data-field="unid_medida"]').textContent),
      ean_13: limpiar(tr.querySelector('[data-field="ean_13"]').textContent),
      valor_ean_13: limpiar(tr.querySelector('[data-field="valor_ean_13"]').textContent),
      inner_code: limpiar(tr.querySelector('[data-field="inner_code"]').textContent),
      valor_inner: limpiar(tr.querySelector('[data-field="valor_inner"]').textContent),
      ean_14: limpiar(tr.querySelector('[data-field="ean_14"]').textContent),
      valor_ean_14: limpiar(tr.querySelector('[data-field="valor_ean_14"]').textContent),
      valor_fisico: limpiar(tr.querySelector('[data-field="valor_fisico"]').textContent)
    };
  }

  function valor(v) { return (v === null || v === undefined) ? "" : v; }
  function limpiar(texto) { const t = texto.trim(); return t === "" ? null : t; }
  function mostrarLoading(mensaje) { if (loadingText) loadingText.textContent = mensaje; loadingOverlay.classList.remove("oculto"); }
  function ocultarLoading() { loadingOverlay.classList.add("oculto"); }
});