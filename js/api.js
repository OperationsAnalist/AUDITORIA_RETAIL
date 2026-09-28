// js/api.js
(function () {
  "use strict";

  const SUPABASE_URL = "https://nejbtfzioxmernkknkmv.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lamJ0Znppb3htZXJua2tua212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzQ0NDUsImV4cCI6MjEwNTg1MDQ0NX0.UAGuqFHP8i-OK9pNEZSMgEGxcdPctZDM3TigMN_cxI8";

  async function rpc(functionName, payload) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;

    console.log("URL Supabase:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Error Supabase:", response.status, responseText);
      throw new Error("Error conectando con Supabase.");
    }

    return responseText ? JSON.parse(responseText) : [];
  }

  window.apiPost = async function (action, payload) {
    if (action === "validarUsuario") {
      const data = await rpc("validar_usuario_planilla", {
        p_email: payload.usuario
      });

      if (!data || data.length === 0) {
        throw new Error("Usuario no encontrado.");
      }

      const user = data[0];

      return {
user: {
  email: user.email,
  nombre: user.nombre,
  rol: user.rol,
  cargo: user.cargo || user.rol,
  foto: user.foto || user.fotoweb,
  fotoWeb: user.fotoweb || user.foto
}


      };
    }

    if (action === "login") {
      const data = await rpc("login_planilla", {
        p_email: payload.usuario || payload.username,
        p_clave: payload.password
      });

      if (!data || data.length === 0) {
        throw new Error("Usuario o contraseña incorrectos.");
      }

      const user = data[0];

      return {
        token: "local-session-" + Date.now(),
user: {
  email: user.email,
  nombre: user.nombre,
  rol: user.rol,
  cargo: user.cargo || user.rol,
  foto: user.foto || user.fotoweb,
  fotoWeb: user.fotoweb || user.foto
}


      };
    }

    throw new Error("Acción API no reconocida: " + action);
  };
window.getClientesRetail = async function () {
  const data = await rpc("obtener_clientes_retail", {});
  return data || [];
};
window.getEstadoCliente = async function (clientId) {
  try {
    const response = await fetch(
      // ¡Aquí está el truco! Agregamos conteos_guardados al select
      `${SUPABASE_URL}/rest/v1/vw_estado_cliente?select=query_cargado,conteo_cargado,puede_procesar,conteos_consolidados,conteos_guardados&client_id=eq.${clientId}`,
      {
        method: "GET",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error("No se pudo obtener el estado del cliente.");
    }

    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error("Error en getEstadoCliente:", error);
    throw error;
  }
};

window.procesarCliente = async function (codigoCliente) {
  const data = await rpc("procesar_cliente", {
    p_codigo_cliente: codigoCliente
  });

  return data;
};

window.getReporteCliente = async function (clientId) {
  const url = `${SUPABASE_URL}/rest/v1/reporte_items?select=*&client_id=eq.${clientId}&order=nro.asc`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error("No se pudo cargar el reporte.");
  }

  return await response.json();
};

window.desactivarQueryUploadsCliente = async function (clientId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/query_uploads?client_id=eq.${clientId}&activo=eq.true`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        activo: false,
        estado: "REEMPLAZADO"
      })
    }
  );

  const txt = await response.text();

  if (!response.ok) {
    console.error("Error desactivarQueryUploadsCliente:", response.status, txt);
    throw new Error("No se pudo desactivar el QUERY anterior: " + txt);
  }
};

window.crearQueryUpload = async function ({ clientId, archivoNombre, email }) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/query_uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      client_id: clientId,
      archivo_nombre: archivoNombre,
      cargado_por_email: email,
      estado: "CARGADO",
      activo: true
    })
  });

  const txt = await response.text();

  if (!response.ok) {
    console.error("Error crearQueryUpload:", response.status, txt);
    throw new Error("No se pudo crear la carga QUERY: " + txt);
  }

  const data = txt ? JSON.parse(txt) : [];

  if (!data.length) {
    throw new Error("Supabase no devolvió el registro query_uploads creado.");
  }

  return data[0];
};

window.insertarQueryItems = async function (items) {
  if (!items || !items.length) {
    throw new Error("No hay registros QUERY para insertar.");
  }

  const chunkSize = 500;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/query_items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(chunk)
    });

    const txt = await response.text();

    if (!response.ok) {
      console.error("Error insertarQueryItems:", response.status, txt);
      throw new Error("No se pudieron insertar registros QUERY: " + txt);
    }
  }
};
window.existeQueryCliente = async function (clientId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/query_items?select=id&client_id=eq.${clientId}&limit=1`,
    {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("No se pudo verificar QUERY existente: " + txt);
  }

  const data = await response.json();
  return data.length > 0;
};

window.limpiarQueryCliente = async function (clientId) {
  let response;
  let txt;

  response = await fetch(
    `${SUPABASE_URL}/rest/v1/reporte_items?client_id=eq.${clientId}`,
    {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      }
    }
  );

  txt = await response.text();
  if (!response.ok) throw new Error("Error limpiando reporte: " + txt);

  response = await fetch(
    `${SUPABASE_URL}/rest/v1/query_items?client_id=eq.${clientId}`,
    {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      }
    }
  );

  txt = await response.text();
  if (!response.ok) throw new Error("Error limpiando QUERY items: " + txt);

  response = await fetch(
    `${SUPABASE_URL}/rest/v1/query_uploads?client_id=eq.${clientId}`,
    {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      }
    }
  );

  txt = await response.text();
  if (!response.ok) throw new Error("Error limpiando QUERY uploads: " + txt);
};

window.getOrCreateConteoLote = async function ({ clientId, auditorEmail }) {
  const auditor = encodeURIComponent(auditorEmail);

  let response = await fetch(
    `${SUPABASE_URL}/rest/v1/conteo_lotes?select=*&client_id=eq.${clientId}&auditor_email=eq.${auditor}&estado=eq.ABIERTO&limit=1`,
    {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  if (!response.ok) {
    throw new Error("No se pudo consultar lote de conteo.");
  }

  let data = await response.json();

  if (data.length > 0) return data[0];

  response = await fetch(`${SUPABASE_URL}/rest/v1/conteo_lotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      client_id: clientId,
      auditor_email: auditorEmail,
      estado: "ABIERTO"
    })
  });

  const txt = await response.text();

  if (!response.ok) {
    throw new Error("No se pudo crear lote de conteo: " + txt);
  }

  return JSON.parse(txt)[0];
};

window.getConteoAuditor = async function ({ clientId, auditorEmail }) {
  const auditor = encodeURIComponent(auditorEmail);

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/conteo_items?select=*&client_id=eq.${clientId}&auditor_email=eq.${auditor}&order=id.asc`,
    {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  if (!response.ok) {
    throw new Error("No se pudo cargar el conteo del auditor.");
  }

  return await response.json();
};

window.guardarConteoAuditor = async function ({ clientId, auditorEmail, items }) {
  const lote = await window.getOrCreateConteoLote({ clientId, auditorEmail });
  const auditor = encodeURIComponent(auditorEmail);

  let response = await fetch(
    `${SUPABASE_URL}/rest/v1/conteo_items?client_id=eq.${clientId}&auditor_email=eq.${auditor}`,
    {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      }
    }
  );

  let txt = await response.text();

  if (!response.ok) {
    throw new Error("No se pudo limpiar el conteo anterior del auditor: " + txt);
  }

  if (!items.length) {
    return { lote, insertados: 0 };
  }

  const registros = items.map((item) => ({
    conteo_lote_id: lote.id,
    client_id: clientId,
    auditor_email: auditorEmail,
    tienda: item.tienda,
    bulto: item.bulto,
    ean: item.ean,
    cantidad: item.cantidad
  }));

  const chunkSize = 500;

  for (let i = 0; i < registros.length; i += chunkSize) {
    const chunk = registros.slice(i, i + chunkSize);

    response = await fetch(`${SUPABASE_URL}/rest/v1/conteo_items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(chunk)
    });

    txt = await response.text();

    if (!response.ok) {
      throw new Error("No se pudo guardar el conteo: " + txt);
    }
  }

  return { lote, insertados: registros.length };
};

window.finalizarConteoAuditor = async function ({ loteId }) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/conteo_lotes?id=eq.${loteId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        estado: "CERRADO"
      })
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("No se pudo finalizar el conteo: " + txt);
  }
};

window.getQueryItems = async function (clientId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/query_items?select=*&client_id=eq.${clientId}&order=fila_excel.asc`,
    { method: "GET", headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!response.ok) throw new Error("No se pudo cargar el QUERY.");
  return await response.json();
};

window.getConteoItems = async function (clientId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/conteo_items?select=*&client_id=eq.${clientId}&order=id.asc`,
    { method: "GET", headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!response.ok) throw new Error("No se pudo cargar el CONTEO.");
  return await response.json();
};

window.actualizarQueryItem = async function (id, payload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/query_items?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Prefer": "return=minimal" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Error actualizando Query Item.");
};

window.actualizarConteoItem = async function (id, payload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/conteo_items?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Prefer": "return=minimal" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Error actualizando Conteo Item.");
};

window.reiniciarCliente = async function (clientId) {
  // Tablas a limpiar para dejar al cliente en cero
  const tablas = ['reporte_items', 'query_items', 'query_uploads', 'conteo_items', 'conteo_lotes'];
  
  for (let tabla of tablas) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?client_id=eq.${clientId}`, {
      method: "DELETE",
      headers: { 
        "apikey": SUPABASE_ANON_KEY, 
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, 
        "Prefer": "return=minimal" 
      }
    });
    
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Error limpiando ${tabla}: ${txt}`);
    }
  }
};
// ... (tus otras funciones como reiniciarCliente) ...

  // --- LAS 3 NUEVAS FUNCIONES DE DATA MAESTRA ---
window.getMaestraSku = async function () {
  const response = await fetch(
    // Le agregamos &limit=5000 al final de la URL para sobreescribir el límite de Supabase
    `${SUPABASE_URL}/rest/v1/maestra_sku?select=*&order=stock_number.asc&limit=5000`, 
    {
      method: "GET", 
      headers: { 
        "apikey": SUPABASE_ANON_KEY, 
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}` 
      }
    }
  );
  if (!response.ok) throw new Error("Error al cargar la Data Maestra.");
  return await response.json();
};

  window.actualizarMaestraSku = async function (id, payload) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/maestra_sku?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Error actualizando SKU.");
  };

  window.insertarMaestraSku = async function (payload) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/maestra_sku`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Prefer": "return=minimal" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Error insertando nuevo SKU.");
  };

window.eliminarMaestraSku = async function (id) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/maestra_sku?id=eq.${id}`, {
      method: "DELETE",
      headers: { 
        "apikey": SUPABASE_ANON_KEY, 
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, 
        "Prefer": "return=minimal" 
      }
    });
    if (!response.ok) throw new Error("Error eliminando SKU.");
  };

window.registrarLog = async function (modulo, accion, usuario) {
    // 1. Imprimimos en consola qué estamos intentando enviar para verificar que llegue la info
    console.log("Intentando guardar Log:", { modulo, accion, usuario });

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/auditoria_logs`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "apikey": SUPABASE_ANON_KEY, 
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, 
          // 2. Quitamos el Prefer=minimal para que Supabase nos devuelva el error completo si falla
          "Prefer": "return=representation" 
        },
        // 3. Formateamos el objeto asegurando que no haya datos nulos que rompan la base
        body: JSON.stringify({ 
          modulo: String(modulo || 'DESCONOCIDO'), 
          accion: String(accion || 'DESCONOCIDA'), 
          usuario: String(usuario || 'Sistema') 
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("🚨 Supabase rechazó el Log. Detalles:", response.status, errorText);
      } else {
        console.log("✅ Log guardado en Supabase con éxito.");
      }
    } catch (error) {
      console.error("🚨 Error de RED al registrar log:", error);
    }
  };

  window.obtenerUltimosLogs = async function (modulo) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/auditoria_logs?modulo=eq.${modulo}&order=fecha.desc&limit=50`, 
        {
          method: "GET",
          headers: { 
            "apikey": SUPABASE_ANON_KEY, 
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}` 
          }
        }
      );
      
      if (!response.ok) {
        const errorTxt = await response.text();
        console.error("🚨 Error leyendo logs de Supabase:", errorTxt);
        return []; 
      }
      return await response.json();
    } catch (error) {
      console.error("🚨 Error de red al leer logs:", error);
      return [];
    }
  };

window.eliminarConteoItem = async function (id) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/conteo_items?id=eq.${id}`, {
      method: "DELETE",
      headers: { 
        "apikey": SUPABASE_ANON_KEY, 
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, 
        "Prefer": "return=minimal" 
      }
    });
    if (!response.ok) throw new Error("Error eliminando registro del conteo.");
  };

})(); 

