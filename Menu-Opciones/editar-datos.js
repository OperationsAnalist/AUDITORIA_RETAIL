document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.requireAuth === "function") window.requireAuth();

  const clienteRaw = localStorage.getItem("clienteSeleccionado");
  if (!clienteRaw) return window.location.href = "./clientes-retail.html";
  
  const cliente = JSON.parse(clienteRaw);
  
  // NECESITAMOS AL USUARIO PARA GUARDAR NUEVAS FILAS A SU NOMBRE
  const user = typeof window.getUser === "function" ? window.getUser() : null;

  document.getElementById("clienteNombreSplit").textContent = cliente.nombre;

  const clienteLogoSplit = document.getElementById("clienteLogoSplit");
  if (clienteLogoSplit) {
    clienteLogoSplit.src = normalizarLogo(cliente.logo_url);
    clienteLogoSplit.onerror = () => { clienteLogoSplit.src = "../IMG/logo.png"; };
  }

  // Elementos
  const bodyQuery = document.getElementById("bodyQuery");
  const bodyConteo = document.getElementById("bodyConteo");
  const buscarQuery = document.getElementById("buscarQuery");
  const buscarConteo = document.getElementById("buscarConteo");
  const btnGuardarQuery = document.getElementById("btnGuardarQuery");
  const btnGuardarConteo = document.getElementById("btnGuardarConteo");
  const btnAgregarConteo = document.getElementById("btnAgregarConteo");
  const loadingOverlay = document.getElementById("loadingOverlay");

  // Arrays en memoria
  let dataQuery = [];
  let dataConteo = [];
  let conteoEliminados = []; // <--- AQUI VAN LOS IDS DE LAS FILAS QUE ELIMINAS VISUALMENTE

// --- ADAPTAR CABECERAS SI ES PREDISTRIBUIDO ---
  if (cliente.tipo_flujo === "PREDISTRIBUIDO") {
    // Tabla Query
    document.querySelector("#bodyQuery").previousElementSibling.innerHTML = `<tr><th>LPN</th><th>SKU</th><th>Descripción</th><th>UM</th><th>Cantidad</th></tr>`;
    
    // Tabla Conteo Predistribuido
    document.querySelector("#bodyConteo").previousElementSibling.innerHTML = `<tr><th>Auditor</th><th>Paleta</th><th>LPN</th><th>EAN</th><th>Cantidad</th><th style="width:70px;text-align:center;">Eliminar</th></tr>`;
  } else {
    // Tabla Conteo Regular
    document.querySelector("#bodyConteo").previousElementSibling.innerHTML = `<tr><th>Auditor</th><th>Tienda</th><th>Bulto (Pallet)</th><th>EAN</th><th>Cantidad</th><th style="width:70px;text-align:center;">Eliminar</th></tr>`;
  }

  // --- MODALES ---
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
    if(icon) {
      icon.className = `app-modal-icon ${tipo}`;
      icon.textContent = tipo === "success" ? "✓" : "!";
    }
    if(appModal) appModal.classList.remove("oculto");
  }

  function mostrarConfirmacion(titulo, mensaje) {
    return new Promise((resolve) => {
      document.getElementById("confirmModalTitle").textContent = titulo;
      document.getElementById("confirmModalMessage").textContent = mensaje;
      if(confirmModal) confirmModal.classList.remove("oculto");

      if(confirmCancelBtn) confirmCancelBtn.onclick = () => { confirmModal.classList.add("oculto"); resolve(false); };
      if(confirmAcceptBtn) confirmAcceptBtn.onclick = () => { confirmModal.classList.add("oculto"); resolve(true); };
    });
  }

  // --- INICIO DE CARGA ---
  await cargarDatos();

  async function cargarDatos() {
    loadingOverlay.classList.remove("oculto");
    try {
      [dataQuery, dataConteo] = await Promise.all([
        window.getQueryItems(cliente.id),
        window.getConteoItems(cliente.id)
      ]);
      renderQuery(dataQuery);
      renderConteo(dataConteo);
    } catch (error) {
      mostrarModal("Error de carga", "No se pudieron cargar los datos: " + error.message, "error");
    } finally {
      loadingOverlay.classList.add("oculto");
    }
  }

  // --- RENDERIZAR TABLA QUERY ---
  function renderQuery(lista) {
    bodyQuery.innerHTML = "";
    if(!lista.length) return bodyQuery.innerHTML = "<tr><td colspan='5'>No hay datos</td></tr>";

    lista.forEach(r => {
      const tr = document.createElement("tr");
      tr.dataset.id = r.id; 
      
      if (cliente.tipo_flujo === "PREDISTRIBUIDO") {
          tr.innerHTML = `
            <td contenteditable="true" data-field="lpn">${r.columna_e || ''}</td>
            <td contenteditable="true" data-field="sku">${r.sku || ''}</td>
            <td contenteditable="true" data-field="descripcion">${r.descripcion || ''}</td>
            <td contenteditable="true" data-field="um">${r.um || ''}</td>
            <td contenteditable="true" data-field="cantidad" class="col-number">${r.cantidad !== null && r.cantidad !== undefined ? r.cantidad : ''}</td>
          `;
      } else {
          tr.innerHTML = `
            <td>${r.fila_excel || ''}</td>
            <td contenteditable="true" data-field="sku">${r.sku || ''}</td>
            <td contenteditable="true" data-field="descripcion">${r.descripcion || ''}</td>
            <td contenteditable="true" data-field="um">${r.um || ''}</td>
            <td contenteditable="true" data-field="cantidad" class="col-number">${r.cantidad !== null && r.cantidad !== undefined ? r.cantidad : ''}</td>
          `;
      }
      tr.addEventListener("input", () => tr.classList.add("row-modified"));
      bodyQuery.appendChild(tr);
    });
  }

  // --- RENDERIZAR TABLA CONTEO Y CREAR FILAS ---
  function renderConteo(lista) {
    bodyConteo.innerHTML = "";
    conteoEliminados = []; // Reiniciamos la basura temporal
    if(!lista.length) return bodyConteo.innerHTML = "<tr><td colspan='6'>No hay datos</td></tr>";

    lista.forEach(r => agregarFilaConteo(r));
  }

  function agregarFilaConteo(r = {}) {
    const tr = document.createElement("tr");
    if (r.id) tr.dataset.id = r.id;
    
    // Si r viene vacío (nueva fila), usamos el auditor actual
    const auditorName = (r.auditor_email || user?.email || '').split('@')[0];
    
    if (cliente.tipo_flujo === "PREDISTRIBUIDO") {
        tr.innerHTML = `
          <td>${auditorName}</td>
          <td contenteditable="true" data-field="bulto">${r.bulto || ''}</td>
          <td contenteditable="true" data-field="tienda">${r.tienda || ''}</td>
          <td contenteditable="true" data-field="ean">${r.ean || ''}</td>
          <td contenteditable="true" data-field="cantidad" class="col-number">${r.cantidad !== null && r.cantidad !== undefined ? r.cantidad : ''}</td>
          <td style="text-align:center;"><button class="btn-delete-row" style="color:#dc2626; font-weight:bold; background:transparent; border:none; cursor:pointer; font-size:16px;">✕</button></td>
        `;
    } else {
        tr.innerHTML = `
          <td>${auditorName}</td>
          <td contenteditable="true" data-field="tienda">${r.tienda || ''}</td>
          <td contenteditable="true" data-field="bulto">${r.bulto || ''}</td>
          <td contenteditable="true" data-field="ean">${r.ean || ''}</td>
          <td contenteditable="true" data-field="cantidad" class="col-number">${r.cantidad !== null && r.cantidad !== undefined ? r.cantidad : ''}</td>
          <td style="text-align:center;"><button class="btn-delete-row" style="color:#dc2626; font-weight:bold; background:transparent; border:none; cursor:pointer; font-size:16px;">✕</button></td>
        `;
    }
    
    // Si editan el texto, marcamos la fila
    tr.addEventListener("input", () => tr.classList.add("row-modified"));
    
    // BOTÓN ELIMINAR (Solo borra visualmente. La DB se actualiza al Guardar)
    tr.querySelector(".btn-delete-row").addEventListener("click", () => {
       if (tr.dataset.id) {
         conteoEliminados.push(tr.dataset.id); // Guardamos el ID en la basura temporal
       }
       tr.remove(); // Desaparece de pantalla
    });

    bodyConteo.appendChild(tr);
  }

  // --- BOTÓN AGREGAR FILA ---
  if (btnAgregarConteo) {
    btnAgregarConteo.addEventListener("click", () => {
      const trVacio = bodyConteo.querySelector("td[colspan]");
      if (trVacio) bodyConteo.innerHTML = ""; // Borramos el texto "No hay datos"
      
      agregarFilaConteo({}); // Fila vacía
      
      const ultimaFila = bodyConteo.lastElementChild;
      ultimaFila.classList.add("row-modified"); // Fuerza a que lo reconozca como "nuevo"
      
      // Foco automático en la primera celda editable
      const primeraCeldaEditable = ultimaFila.querySelector("td[contenteditable='true']");
      if(primeraCeldaEditable) primeraCeldaEditable.focus();
    });
  }

// --- BUSCADORES ---
  buscarQuery.addEventListener("input", (e) => {
    const text = e.target.value.toLowerCase();
    const filtrado = dataQuery.filter(r => 
      (r.sku || "").toLowerCase().includes(text) || 
      (r.descripcion || "").toLowerCase().includes(text) ||
      (r.columna_e || "").toLowerCase().includes(text) // Añadida búsqueda por LPN en Query
    );
    renderQuery(filtrado);
  });
  
  buscarConteo.addEventListener("input", (e) => {
    const text = e.target.value.toLowerCase();
    const filtrado = dataConteo.filter(r => 
      (r.ean || "").toLowerCase().includes(text) || 
      (r.bulto || "").toLowerCase().includes(text) ||
      (r.tienda || "").toLowerCase().includes(text) // Añadida búsqueda por LPN (Tienda) en Conteo
    );
    renderConteo(filtrado);
  });

  // --- GUARDAR CAMBIOS QUERY ---
  btnGuardarQuery.addEventListener("click", async () => {
    const filasModificadas = Array.from(bodyQuery.querySelectorAll(".row-modified"));
    if(!filasModificadas.length) return mostrarModal("Sin cambios", "No hay modificaciones para guardar en Datos Query.", "error");

    const confirmar = await mostrarConfirmacion("¿Guardar Query?", `Se actualizarán ${filasModificadas.length} filas en la base de datos.`);
    if (!confirmar) return;

    btnGuardarQuery.disabled = true;
    loadingOverlay.classList.remove("oculto");

    try {
      for (const tr of filasModificadas) {
        const id = tr.dataset.id;
        const cantValor = tr.querySelector('[data-field="cantidad"]').textContent.trim();
        
        const payload = {
          sku: tr.querySelector('[data-field="sku"]').textContent.trim(),
          descripcion: tr.querySelector('[data-field="descripcion"]').textContent.trim(),
          um: tr.querySelector('[data-field="um"]').textContent.trim(),
          cantidad: cantValor === "" ? null : Number(cantValor) 
        };

        if (cliente.tipo_flujo === "PREDISTRIBUIDO") {
          payload.columna_e = tr.querySelector('[data-field="lpn"]').textContent.trim();
        }

        await window.actualizarQueryItem(id, payload);
        tr.classList.remove("row-modified");
      }
      
      localStorage.removeItem(`reportePredi_${cliente.id}`); // Forza recalculo
      mostrarModal("Éxito", "Cambios de QUERY guardados en Supabase.", "success");
      await cargarDatos(); 
    } catch (e) {
      mostrarModal("Error", "Error al guardar Query: " + e.message, "error");
    } finally {
      btnGuardarQuery.disabled = false;
      loadingOverlay.classList.add("oculto");
    }
  });

  // --- GUARDAR CAMBIOS CONTEO (MAGIA TEMPORAL APLICADA) ---
  btnGuardarConteo.addEventListener("click", async () => {
    const filasModificadas = Array.from(bodyConteo.querySelectorAll(".row-modified"));
    
    if(!filasModificadas.length && !conteoEliminados.length) {
      return mostrarModal("Sin cambios", "No eliminaste ni modificaste ninguna fila.", "error");
    }

    const confirmar = await mostrarConfirmacion("¿Guardar Conteo?", `Se actualizarán/crearán ${filasModificadas.length} filas y se eliminarán ${conteoEliminados.length} de la base de datos.`);
    if (!confirmar) return;

    btnGuardarConteo.disabled = true;
    loadingOverlay.classList.remove("oculto");

    try {
      // 1. ELIMINAMOS EN SUPABASE LO QUE BORRASTE DE LA PANTALLA
      for (const idEliminado of conteoEliminados) {
        await window.eliminarConteoItem(idEliminado);
      }

      // 2. CREAMOS UN LOTE SI HAY FILAS NUEVAS
      let loteActual = null;
      if (filasModificadas.some(tr => !tr.dataset.id)) {
        loteActual = await window.getOrCreateConteoLote({ clientId: cliente.id, auditorEmail: user.email });
      }

      // 3. ACTUALIZAMOS O INSERTAMOS
      for (const tr of filasModificadas) {
        const id = tr.dataset.id;
        const cantValor = tr.querySelector('[data-field="cantidad"]').textContent.trim();

        const payload = {
          tienda: tr.querySelector('[data-field="tienda"]').textContent.trim(),
          bulto: tr.querySelector('[data-field="bulto"]').textContent.trim(),
          ean: tr.querySelector('[data-field="ean"]').textContent.trim(),
          cantidad: cantValor === "" ? null : Number(cantValor) 
        };

        if (id) {
          // Si tiene ID, existía y solo lo modificó
          await window.actualizarConteoItem(id, payload);
        } else {
          // Si no tiene ID, es una fila agregada con el botón
          payload.client_id = cliente.id;
          payload.conteo_lote_id = loteActual.id;
          payload.auditor_email = user.email;
          await window.insertarConteoItem(payload); 
        }
        tr.classList.remove("row-modified");
      }
      
      conteoEliminados = []; // Vaciamos la basura
      localStorage.removeItem(`reportePredi_${cliente.id}`); // Forza recalculo
      mostrarModal("Éxito", "Tus cambios de CONTEO se guardaron en la Nube.", "success");
      await cargarDatos();
    } catch (e) {
      mostrarModal("Error", "Error al guardar Conteo: " + e.message, "error");
    } finally {
      btnGuardarConteo.disabled = false;
      loadingOverlay.classList.add("oculto");
    }
  });

  function normalizarLogo(logoUrl) {
    if (!logoUrl) return "../IMG/logo.png";
    if (logoUrl.startsWith("IMG/")) return "../" + logoUrl;
    return logoUrl;
  }
});