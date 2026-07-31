/**
 * Taxi Tamazula — Google Apps Script
 * Backend para recibir solicitudes y enviarlas al canal de WhatsApp
 * 
 * INSTRUCCIONES:
 * 1. Crear un Google Apps Script (script.google.com)
 * 2. Copiar este código en Code.gs
 * 3. Desplegar como Web App (Deploy → New deployment → Web App)
 * 4. Ejecutar como: "Yo"
 * 5. Acceder: "Cualquier persona"
 * 6. Copiar la URL y ponerla en index.html como APPS_SCRIPT_URL
 * 7. Añadir la URL como URL permitida en manifest.json de Apps Script
 */

// ─── Config ───────────────────────────────────────────────
// ⚠️ EDITAR: URL del canal de WhatsApp via Wazzup/Bitrix24
// Esta es la URL del webhook o la API de Wazzup para enviar mensajes
const WAZZUP_API_URL = 'https://api.wazzup24.com/v1/message';
const WAZZUP_API_KEY = ''; // ⚠️ Tu API key de Wazzup

// Si usas Bitrix24 en lugar de Wazzup directo:
const BITRIX_WEBHOOK_URL = ''; // ⚠️ Tu webhook de Bitrix24
const BITRIX_CHAT_ID = ''; // ⚠️ ID del chat/canal de WhatsApp

// Canal destino (nombre o número)
const CANAL_NOMBRE = 'Taxi Tamazula';

// ─── doPost — Recibe solicitud del rider ──────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    const {
      nombre,
      telefono,
      lat,
      lng,
      dirManual,
      destino,
      nota,
      ts
    } = payload;

    // Validación básica
    if (!nombre || !telefono) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Faltan campos requeridos'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Armar mensaje
    const mensaje = construirMensaje(payload);

    // Enviar a WhatsApp
    const resultado = enviarWhatsApp(mensaje);

    // Guardar en spreadsheet (opcional, para tener historial)
    guardarHistorial(payload, resultado);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'Solicitud enviada',
      id: resultado?.id || null
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── Construir mensaje ────────────────────────────────────
function construirMensaje(payload) {
  const { nombre, telefono, lat, lng, dirManual, destino, nota, ts } = payload;
  
  const fecha = new Date(ts || Date.now());
  const horaStr = fecha.toLocaleTimeString('es-MX', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  const fechaStr = fecha.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short'
  });

  const mapsLink = lat && lng
    ? `📍 https://www.google.com/maps?q=${lat},${lng}`
    : null;

  const zonaTexto = dirManual 
    ? `📍 ${dirManual}` 
    : (mapsLink ? '📍 Tamazula de Gordiano' : '📍 Sin ubicación');

  let msg = `🚕 SOLICITUD DE TAXI\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${fechaStr} · ${horaStr}\n`;
  msg += `👤 ${nombre}\n`;
  msg += `📞 ${formatearTelefono(telefono)}\n`;
  
  if (mapsLink) msg += `${mapsLink}\n`;
  else if (dirManual) msg += `${zonaTexto}\n`;
  
  if (destino) msg += `🏁 Destino: ${destino}\n`;
  if (nota) msg += `📝 Nota: ${nota}\n`;
  
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `🟢 Un taxista te contactará pronto`;

  return msg;
}

// ─── Enviar a WhatsApp ────────────────────────────────────
function enviarWhatsApp(mensaje) {
  // Opción 1: Wazzup API
  if (WAZZUP_API_KEY) {
    return enviarWazzup(mensaje);
  }
  
  // Opción 2: Bitrix24 webhook
  if (BITRIX_WEBHOOK_URL) {
    return enviarBitrix(mensaje);
  }
  
  // Opción 3: Debug — guardar en sheet y return
  Logger.log('MENSAJE A ENVIAR:\n' + mensaje);
  return { id: 'debug-' + Date.now(), debug: true };
}

function enviarWazzup(mensaje) {
  const payload = {
    channelType: 'whatsapp',
    channelId: CANAL_NOMBRE, // o el ID del canal
    message: {
      type: 'text',
      text: mensaje
    }
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

// ─── Guardar historial ────────────────────────────────────
function guardarHistorial(payload, resultado) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Solicitudes');
    
    if (!sheet) {
      sheet = ss.insertSheet('Solicitudes');
      sheet.getRange(1, 1, 1, 8).setValues([[
        'Fecha', 'Hora', 'Nombre', 'Teléfono', 
        'Lat', 'Lng', 'Dirección', 'Destino', 'Nota', 'Resultado'
      ]]);
      sheet.setFrozenRows(1);
    }

    const fecha = new Date(payload.ts || Date.now());
    
    sheet.appendRow([
      fecha.toLocaleDateString('es-MX'),
      fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      payload.nombre,
      payload.telefono,
      payload.lat || '',
      payload.lng || '',
      payload.dirManual || '',
      payload.destino || '',
      payload.nota || '',
      JSON.stringify(resultado)
    ]);
  } catch (e) {
    Logger.log('Error guardando historial: ' + e.toString());
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
    lat: 19.935,
    lng: -103.485,
    dirManual: null,
    destino: 'Colonia El Parque',
    nota: 'Estoy frente a la iglesia',
    ts: new Date().toISOString()
  };
  
  const msg = construirMensaje(payload);
  Logger.log(msg);
}
