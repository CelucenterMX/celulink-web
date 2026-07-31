/**
 * Taxi Tamazula — Google Apps Script
 * Backend para recibir solicitudes y guardarlas en Sheets + enviar a WhatsApp
 * 
 * FLUJO:
 * 1. doPost recibe solicitud del frontend
 * 2. Valida (solo nombre obligatorio)
 * 3. Construye mensaje de WhatsApp (con o sin teléfono según checkbox)
 * 4. Envía a WhatsApp vía Wazzup o Bitrix24
 * 5. Guarda en Google Sheet "TaxiT Clientes" (hojas Clientes + Solicitudes)
 */

// ─── Config ───────────────────────────────────────────────
const SHEET_ID = '1MlPMMbou8B09qyW6V4twKEGQOjKnCyYZqGkxqrTQju8'; // TaxiT Clientes

// WhatsApp via Wazzup
const WAZZUP_API_URL = 'https://api.wazzup24.com/v1/message';
const WAZZUP_API_KEY = ''; // ⚠️ Pegar API key cuando esté lista

// WhatsApp via Bitrix24
const BITRIX_WEBHOOK_URL = ''; // ⚠️ Webhook URL
const BITRIX_CHAT_ID = ''; // ⚠️ Chat ID del canal

// Canal destino (para Wazzup)
const CANAL_NOMBRE = 'Taxi Tamazula';

// ─── doPost — Recibe solicitud del rider ──────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    const {
      nombre,
      telefono,
      compartirTel,
      lat,
      lng,
      dirManual,
      destino,
      nota,
      ts
    } = payload;

    // Validación: solo nombre obligatorio
    if (!nombre || !nombre.trim()) {
      return jsonResponse({ status: 'error', message: 'Falta el nombre' });
    }

    // Si dio teléfono, validar formato (10 dígitos)
    let telLimpio = '';
    if (telefono && telefono.trim()) {
      telLimpio = telefono.replace(/\D/g, '');
      if (telLimpio.length !== 10) {
        return jsonResponse({ status: 'error', message: 'Teléfono inválido (debe ser 10 dígitos)' });
      }
    }

    // Decidir si se incluye el teléfono en el mensaje de WhatsApp
    const incluyeTel = telLimpio && compartirTel === true;

    // Armar mensaje
    const mensaje = construirMensaje({
      ...payload,
      telefono: incluyeTel ? telLimpio : null
    });

    // Enviar a WhatsApp
    const resultado = enviarWhatsApp(mensaje);

    // Guardar en Sheet
    guardarEnHojas({
      nombre: nombre.trim(),
      telefono: telLimpio || null,
      compartirTel: incluyeTel,
      lat: lat || null,
      lng: lng || null,
      dirManual: dirManual || null,
      destino: destino || null,
      nota: nota || '',
      ts: ts || new Date().toISOString()
    });

    return jsonResponse({
      status: 'ok',
      message: 'Solicitud enviada',
      id: resultado?.id || null
    });

  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// ─── Helper: respuesta JSON ───────────────────────────────
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Construir mensaje de WhatsApp ────────────────────────
function construirMensaje(payload) {
  const { nombre, telefono, lat, lng, dirManual, destino, nota, ts } = payload;

  const fecha = new Date(ts || Date.now());
  const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaStr = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  const mapsLink = lat && lng
    ? `📍 https://www.google.com/maps?q=${lat},${lng}`
    : null;

  let msg = `🚕 SOLICITUD DE TAXI\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${fechaStr} · ${horaStr}\n`;
  msg += `👤 ${nombre}\n`;

  if (telefono) {
    msg += `📞 ${formatearTelefono(telefono)}\n`;
  }

  if (mapsLink) msg += `${mapsLink}\n`;
  else if (dirManual) msg += `📍 ${dirManual}\n`;

  if (destino) msg += `🏁 Destino: ${destino}\n`;
  if (nota) msg += `📝 Nota: ${nota}\n`;

  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += telefono
    ? `🟢 Un taxista te contactará pronto`
    : `🟢 Un taxista te contactará pronto (sin teléfono)`;

  return msg;
}

// ─── Enviar a WhatsApp ────────────────────────────────────
function enviarWhatsApp(mensaje) {
  if (WAZZUP_API_KEY) return enviarWazzup(mensaje);
  if (BITRIX_WEBHOOK_URL) return enviarBitrix(mensaje);

  // Sin credenciales: loguear
  Logger.log('MENSAJE A ENVIAR:\n' + mensaje);
  return { id: 'debug-' + Date.now(), debug: true };
}

function enviarWazzup(mensaje) {
  const payload = {
    channelType: 'whatsapp',
    channelId: CANAL_NOMBRE,
    message: { type: 'text', text: mensaje }
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + WAZZUP_API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(WAZZUP_API_URL, options);
  const result = JSON.parse(response.getContentText());

  if (response.getResponseCode() !== 200) {
    throw new Error('Wazzup error: ' + JSON.stringify(result));
  }

  return result;
}

function enviarBitrix(mensaje) {
  const payload = {
    MESSAGE: mensaje,
    SYSTEM: 'TaxiT Bot'
  };

  const options = {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const url = BITRIX_WEBHOOK_URL + '/im.message.add.json';
  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (!result.response || result.error) {
    throw new Error('Bitrix error: ' + JSON.stringify(result));
  }

  return { id: result.response };
}

// ─── Guardar en Google Sheets ──────────────────────────────
function guardarEnHojas(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    if (!ss) {
      Logger.log('No se pudo abrir Sheet ID: ' + SHEET_ID);
      return;
    }

    // Asegurar que las hojas existan
    let clientes = ss.getSheetByName('Clientes');
    if (!clientes) {
      clientes = ss.insertSheet('Clientes');
      clientes.getRange(1, 1, 1, 6).setValues([[
        'Fecha Registro', 'Nombre', 'Teléfono',
        'Total Solicitudes', 'Última Solicitud', 'Notas'
      ]]);
      clientes.setFrozenRows(1);
      clientes.getRange(1, 1, 1, 6).setFontWeight('bold');
      clientes.getRange(1, 1, 1, 6).setBackground('#FF6B35');
      clientes.getRange(1, 1, 1, 6).setFontColor('#FFFFFF');
    }

    let solicitudes = ss.getSheetByName('Solicitudes');
    if (!solicitudes) {
      solicitudes = ss.insertSheet('Solicitudes');
      solicitudes.getRange(1, 1, 1, 8).setValues([[
        'Timestamp', 'Nombre', 'Tel Compartido', 'Teléfono',
        'Ubicación', 'Destino', 'Nota', 'Mensaje'
      ]]);
      solicitudes.setFrozenRows(1);
      solicitudes.getRange(1, 1, 1, 8).setFontWeight('bold');
      solicitudes.getRange(1, 1, 1, 8).setBackground('#FF6B35');
      solicitudes.getRange(1, 1, 1, 8).setFontColor('#FFFFFF');
    }

    const fecha = new Date(data.ts);

    // 1. Actualizar Clientes (upsert por nombre)
    const nombresRange = clientes.getRange(2, 2, clientes.getLastRow() - 1, 1).getValues();
    let filaExistente = -1;
    for (let i = 0; i < nombresRange.length; i++) {
      if (nombresRange[i][0] === data.nombre) {
        filaExistente = i + 2;
        break;
      }
    }

    if (filaExistente > 0) {
      // Actualizar existente
      if (data.telefono) {
        clientes.getRange(filaExistente, 3).setValue(data.telefono);
      }
      const totalActual = clientes.getRange(filaExistente, 4).getValue() || 0;
      clientes.getRange(filaExistente, 4).setValue(totalActual + 1);
      clientes.getRange(filaExistente, 5).setValue(fecha);
    } else {
      // Nuevo cliente
      clientes.appendRow([
        fecha,                       // Fecha Registro
        data.nombre,                 // Nombre
        data.telefono || '',         // Teléfono
        1,                           // Total Solicitudes
        fecha,                       // Última Solicitud
        ''                           // Notas
      ]);
    }

    // 2. Registrar solicitud
    const ubicacion = data.lat && data.lng
      ? `${data.lat},${data.lng}`
      : (data.dirManual || 'Sin ubicación');

    solicitudes.appendRow([
      fecha,
      data.nombre,
      data.compartirTel ? 'Sí' : 'No',
      data.telefono || '',
      ubicacion,
      data.destino || '',
      data.nota || '',
      '' // mensaje se llena solo si querés loguearlo
    ]);

  } catch (e) {
    Logger.log('Error guardando en Sheet: ' + e.toString());
  }
}

// ─── Formatear teléfono ───────────────────────────────────
function formatearTelefono(tel) {
  if (!tel) return '';
  const t = tel.replace(/\D/g, '');
  if (t.length === 10) {
    return `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6)}`;
  }
  return tel;
}

// ─── Test ──────────────────────────────────────────────────
function testMensaje() {
  const payload = {
    nombre: 'Juan Pérez',
    telefono: '3411234567',
    compartirTel: true,
    lat: 19.935,
    lng: -103.485,
    destino: 'Colonia El Parque',
    nota: 'Estoy frente a la iglesia',
    ts: new Date().toISOString()
  };

  const msg = construirMensaje(payload);
  Logger.log(msg);
}