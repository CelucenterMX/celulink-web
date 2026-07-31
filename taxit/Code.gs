/**
 * Taxi Tamazula (TaxiT) — Backend MVP
 *
 * HOJAS DEL SHEET:
 * - Clientes: nombre + teléfono de riders
 * - Taxistas: nombre + teléfono de conductores registrados
 * - Solicitudes: cola de solicitudes (pendiente / asignada / completada)
 *
 * FLUJOS:
 * - Rider: doPost con nombre + ubicación → crea Solicitud pendiente
 * - Taxista: doPost con action=registrar_taxista / login_taxista / listar_solicitudes / aceptar_solicitud / completar_solicitud
 */

// ─── Config ───────────────────────────────────────────────
const SHEET_ID = '1MlPMMbou8B09qyW6V4twKEGQOjKnCyYZqGkxqrTQju8';
const TIMEZONE = 'America/Mexico_City';

// ─── doPost — Router principal ─────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'nueva_solicitud';

    switch (action) {
      case 'nueva_solicitud':
        return handleNuevaSolicitud(payload);
      case 'registrar_taxista':
        return handleRegistrarTaxista(payload);
      case 'login_taxista':
        return handleLoginTaxista(payload);
      case 'listar_solicitudes':
        return handleListarSolicitudes();
      case 'aceptar_solicitud':
        return handleAceptarSolicitud(payload);
      case 'completar_solicitud':
        return handleCompletarSolicitud(payload);
      default:
        return jsonResponse({ status: 'error', message: 'Acción desconocida: ' + action });
    }
  } catch (error) {
    Logger.log('doPost ERROR: ' + error.toString());
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// ─── Handlers ──────────────────────────────────────────────

// 1. Nueva solicitud de rider
function handleNuevaSolicitud(payload) {
  const { nombre, telefono, compartirTel, lat, lng, dirManual, destino, nota, ts } = payload;

  if (!nombre || !nombre.trim()) {
    return jsonResponse({ status: 'error', message: 'Falta el nombre' });
  }

  let telLimpio = '';
  if (telefono && telefono.trim()) {
    telLimpio = telefono.replace(/\D/g, '');
    if (telLimpio.length !== 10) {
      return jsonResponse({ status: 'error', message: 'Teléfono inválido (10 dígitos)' });
    }
  }

  const incluyeTel = telLimpio && compartirTel === true;
  const fecha = new Date(ts || new Date().toISOString());

  ensureHojas();

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const clientes = ss.getSheetByName('Clientes');
  const solicitudes = ss.getSheetByName('Solicitudes');

  // Upsert en Clientes
  upsertCliente(clientes, fecha, nombre.trim(), telLimpio || '');

  // Crear solicitud
  const ubicacion = lat && lng ? `${lat},${lng}` : (dirManual || 'Sin ubicación');
  solicitudes.appendRow([
    fecha,                                // Timestamp
    nombre.trim(),                        // Nombre Rider
    incluyeTel ? 'Sí' : 'No',             // Tel Compartido
    telLimpio || '',                      // Teléfono
    ubicacion,                            // Ubicación
    destino || '',                        // Destino
    nota || '',                           // Nota
    construirMensaje(payload),            // Mensaje (para log)
    'pendiente',                          // Estado
    '',                                   // Taxista Asignado
    '',                                   // Tel Taxista
    '',                                   // Fecha Asignación
    ''                                    // Fecha Completada
  ]);

  return jsonResponse({ status: 'ok', message: 'Solicitud en cola' });
}

// 2. Registrar taxista
function handleRegistrarTaxista(payload) {
  const { nombre, telefono } = payload;

  if (!nombre || !nombre.trim()) {
    return jsonResponse({ status: 'error', message: 'Falta tu nombre' });
  }
  if (!telefono || telefono.replace(/\D/g, '').length !== 10) {
    return jsonResponse({ status: 'error', message: 'Tu teléfono debe tener 10 dígitos' });
  }

  const telLimpio = telefono.replace(/\D/g, '');
  ensureHojas();

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const taxistas = ss.getSheetByName('Taxistas');

  // Buscar si ya existe
  const lastRow = taxistas.getLastRow();
  const telsRange = lastRow > 1 ? taxistas.getRange(2, 3, lastRow - 1, 1).getValues() : [];
  let filaExistente = -1;
  for (let i = 0; i < telsRange.length; i++) {
    if (telsRange[i][0] === telLimpio) {
      filaExistente = i + 2;
      break;
    }
  }

  const fecha = new Date();

  if (filaExistente > 0) {
    // Actualizar nombre y status
    taxistas.getRange(filaExistente, 2).setValue(nombre.trim());
    taxistas.getRange(filaExistente, 4).setValue('activo');
    taxistas.getRange(filaExistente, 6).setValue(fecha);
    return jsonResponse({ status: 'ok', message: 'Bienvenido de nuevo', nombre: nombre.trim() });
  } else {
    taxistas.appendRow([
      fecha,                       // Fecha Registro
      nombre.trim(),               // Nombre
      telLimpio,                   // Teléfono
      'activo',                    // Status
      0,                           // Total Aceptadas
      fecha                        // Última Actividad
    ]);
    return jsonResponse({ status: 'ok', message: 'Registrado como taxista', nombre: nombre.trim() });
  }
}

// 3. Login taxista (verifica que existe)
function handleLoginTaxista(payload) {
  const { telefono } = payload;

  if (!telefono || telefono.replace(/\D/g, '').length !== 10) {
    return jsonResponse({ status: 'error', message: 'Tu teléfono debe tener 10 dígitos' });
  }

  const telLimpio = telefono.replace(/\D/g, '');
  ensureHojas();

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const taxistas = ss.getSheetByName('Taxistas');

  const lastRow = taxistas.getLastRow();
  const data = lastRow > 1 ? taxistas.getRange(2, 1, lastRow - 1, 6).getValues() : [];
  for (const row of data) {
    if (row[2] === telLimpio && row[3] === 'activo') {
      // Actualizar última actividad
      const fila = data.indexOf(row) + 2;
      taxistas.getRange(fila, 6).setValue(new Date());
      return jsonResponse({
        status: 'ok',
        nombre: row[1],
        telefono: telLimpio
      });
    }
  }
  return jsonResponse({ status: 'error', message: 'No estás registrado como taxista. Regístrate primero.' });
}

// 4. Listar solicitudes pendientes (y asignadas a mí)
function handleListarSolicitudes() {
  const { taxistaTel } = arguments[0] || {};

  ensureHojas();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const solicitudes = ss.getSheetByName('Solicitudes');

  const lastRow = solicitudes.getLastRow();
  const data = lastRow > 1 ? solicitudes.getRange(2, 1, lastRow - 1, 13).getValues() : [];

  const pendientes = [];
  const mias = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const estado = row[8];
    const item = {
      fila: i + 2,
      timestamp: row[0] ? new Date(row[0]).toISOString() : null,
      nombre: row[1],
      telCompartido: row[2],
      telefono: row[3],
      ubicacion: row[4],
      destino: row[5],
      nota: row[6],
      estado: estado,
      taxista: row[9],
      telTaxista: row[10],
      fechaAsignacion: row[11] ? new Date(row[11]).toISOString() : null
    };

    if (estado === 'pendiente') {
      pendientes.push(item);
    } else if (estado === 'asignada' && taxistaTel && row[10] === taxistaTel) {
      mias.push(item);
    }
  }

  // Más recientes primero
  pendientes.reverse();
  mias.reverse();

  return jsonResponse({ status: 'ok', pendientes, mias });
}

// 5. Aceptar solicitud
function handleAceptarSolicitud(payload) {
  const { fila, taxistaNombre, taxistaTel } = payload;

  if (!fila || !taxistaNombre || !taxistaTel) {
    return jsonResponse({ status: 'error', message: 'Faltan datos para aceptar' });
  }

  ensureHojas();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const solicitudes = ss.getSheetByName('Solicitudes');
  const taxistas = ss.getSheetByName('Taxistas');

  const estadoActual = solicitudes.getRange(fila, 9).getValue();
  if (estadoActual !== 'pendiente') {
    return jsonResponse({ status: 'error', message: 'Esta solicitud ya no está disponible (estado: ' + estadoActual + ')' });
  }

  const fecha = new Date();
  solicitudes.getRange(fila, 9).setValue('asignada');
  solicitudes.getRange(fila, 10).setValue(taxistaNombre);
  solicitudes.getRange(fila, 11).setValue(taxistaTel);
  solicitudes.getRange(fila, 12).setValue(fecha);

  // Incrementar contador del taxista
  const lastRowTax = taxistas.getLastRow();
  const telsTax = lastRowTax > 1 ? taxistas.getRange(2, 3, lastRowTax - 1, 1).getValues() : [];
  for (let i = 0; i < telsTax.length; i++) {
    if (telsTax[i][0] === taxistaTel) {
      const filaTax = i + 2;
      const totalActual = taxistas.getRange(filaTax, 5).getValue() || 0;
      taxistas.getRange(filaTax, 5).setValue(totalActual + 1);
      taxistas.getRange(filaTax, 6).setValue(fecha);
      break;
    }
  }

  // Datos del rider para que el taxista contacte
  const riderNombre = solicitudes.getRange(fila, 2).getValue();
  const riderTelCompartido = solicitudes.getRange(fila, 3).getValue();
  const riderTel = solicitudes.getRange(fila, 4).getValue();
  const ubicacion = solicitudes.getRange(fila, 5).getValue();
  const destino = solicitudes.getRange(fila, 6).getValue();

  return jsonResponse({
    status: 'ok',
    message: 'Solicitud aceptada',
    rider: {
      nombre: riderNombre,
      telefono: riderTelCompartido === 'Sí' ? riderTel : null,
      ubicacion: ubicacion,
      destino: destino
    }
  });
}

// 6. Completar solicitud
function handleCompletarSolicitud(payload) {
  const { fila, taxistaTel } = payload;

  if (!fila || !taxistaTel) {
    return jsonResponse({ status: 'error', message: 'Faltan datos' });
  }

  ensureHojas();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const solicitudes = ss.getSheetByName('Solicitudes');

  const estadoActual = solicitudes.getRange(fila, 9).getValue();
  const telTaxistaActual = solicitudes.getRange(fila, 11).getValue();

  if (estadoActual !== 'asignada' || telTaxistaActual !== taxistaTel) {
    return jsonResponse({ status: 'error', message: 'No puedes completar esta solicitud' });
  }

  solicitudes.getRange(fila, 9).setValue('completada');
  solicitudes.getRange(fila, 13).setValue(new Date());

  return jsonResponse({ status: 'ok', message: 'Solicitud completada' });
}

// ─── Helpers ───────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Asegurar que las 3 hojas existan con headers correctos
function ensureHojas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (!ss) throw new Error('No se pudo abrir el Sheet');

  // Clientes
  let clientes = ss.getSheetByName('Clientes');
  if (!clientes) {
    clientes = ss.insertSheet('Clientes');
    clientes.getRange(1, 1, 1, 6).setValues([[
      'Fecha Registro', 'Nombre', 'Teléfono',
      'Total Solicitudes', 'Última Solicitud', 'Notas'
    ]]);
    clientes.setFrozenRows(1);
    formatHeader(clientes, 6);
  }

  // Taxistas
  let taxistas = ss.getSheetByName('Taxistas');
  if (!taxistas) {
    taxistas = ss.insertSheet('Taxistas');
    taxistas.getRange(1, 1, 1, 6).setValues([[
      'Fecha Registro', 'Nombre', 'Teléfono', 'Status',
      'Total Aceptadas', 'Última Actividad'
    ]]);
    taxistas.setFrozenRows(1);
    formatHeader(taxistas, 6);
  }

  // Solicitudes (13 columnas)
  let solicitudes = ss.getSheetByName('Solicitudes');
  if (!solicitudes) {
    solicitudes = ss.insertSheet('Solicitudes');
  }
  const expectedHeaders = [
    'Timestamp', 'Nombre Rider', 'Tel Compartido', 'Teléfono',
    'Ubicación', 'Destino', 'Nota', 'Mensaje',
    'Estado', 'Taxista Asignado', 'Tel Taxista', 'Fecha Asignación', 'Fecha Completada'
  ];
  const currentHeaders = solicitudes.getRange(1, 1, 1, 13).getValues()[0];
  const headersOk = currentHeaders.every((h, i) => h === expectedHeaders[i]);
  if (!headersOk) {
    solicitudes.getRange(1, 1, 1, 13).setValues([expectedHeaders]);
    formatHeader(solicitudes, 13);
  }
}

function formatHeader(sheet, nCols) {
  sheet.getRange(1, 1, 1, nCols).setFontWeight('bold');
  sheet.getRange(1, 1, 1, nCols).setBackground('#FF6B35');
  sheet.getRange(1, 1, 1, nCols).setFontColor('#FFFFFF');
}

function upsertCliente(sheet, fecha, nombre, telefono) {
  const lastRow = sheet.getLastRow();
  const data = lastRow > 1 ? sheet.getRange(2, 2, lastRow - 1, 1).getValues() : [];
  let filaExistente = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === nombre) {
      filaExistente = i + 2;
      break;
    }
  }
  if (filaExistente > 0) {
    if (telefono) sheet.getRange(filaExistente, 3).setValue(telefono);
    const total = sheet.getRange(filaExistente, 4).getValue() || 0;
    sheet.getRange(filaExistente, 4).setValue(total + 1);
    sheet.getRange(filaExistente, 5).setValue(fecha);
  } else {
    sheet.appendRow([fecha, nombre, telefono || '', 1, fecha, '']);
  }
}

function construirMensaje(payload) {
  const { nombre, telefono, lat, lng, dirManual, destino, nota, ts } = payload;
  const fecha = new Date(ts || new Date().toISOString());
  const mapsLink = lat && lng ? `📍 https://www.google.com/maps?q=${lat},${lng}` : null;
  let msg = `🚕 SOLICITUD DE TAXI\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${fecha.toLocaleString('es-MX')}\n`;
  msg += `👤 ${nombre}\n`;
  if (telefono) msg += `📞 ${telefono}\n`;
  if (mapsLink) msg += `${mapsLink}\n`;
  else if (dirManual) msg += `📍 ${dirManual}\n`;
  if (destino) msg += `🏁 Destino: ${destino}\n`;
  if (nota) msg += `📝 Nota: ${nota}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n🟢 Esperando taxista`;
  return msg;
}