/**
 * Apps Script para Catalogo de Equipos - Celucenter
 * VERSION 2 — DRAFT (NO DESPLEGADO)
 *
 * Cambios respecto a v1:
 *   - action=public: devuelve solo datos publicos (sin listas internas ni cantidades)
 *   - action=catalog: requiere sessionId valido, filtra por lista asignada
 *   - action=login: genera session token server-side
 *   - Limpieza automatica de sesiones expiradas
 *
 * IMPORTANTE: Este archivo es un borrador para revision.
 *             NO reemplazar el deployment actual sin pruebas completas.
 */

var TOKEN = 'CELUCENTER_EQUIPOS_2026';
var SHEET_ID = '1dN0Z8RER0i1bWwWvy6uHz2A_A7dg7mI1KzWTEzSnrdY';
var REGISTER_SHEET = 'Registro';
var SESSIONS_SHEET = 'Sesiones';
var SESSION_TTL_HOURS = 24;
var BITRIX_WEBHOOK = 'https://celucenter.bitrix24.es/rest/9/m616r1ki7xm70bjp/';
var BITRIX_USER_CRIS = 9;

var LIST_CONFIGS = [
  {
    sheet: 'Lista General BM',
    almacen: 'BM',
    cols: {
      nombreCategoria: 0, categoria: 1, codigo: 2, producto: 3,
      cantidad: 4, listaM: 5, listaG: 6, listaF: 7, precioPublico: 8,
      telmovPay: -1, payjoy: -1, costo: -1
    }
  },
  {
    sheet: 'Lista General Ecom',
    almacen: 'Ecom',
    cols: {
      nombreCategoria: 0, categoria: 1, codigo: 2, producto: 3,
      telmovPay: 4, payjoy: 5, cantidad: 6, costo: 7,
      listaM: 8, listaG: 9, listaF: 10, precioPublico: 11
    }
  },
  {
    sheet: 'Lista General LAFT',
    almacen: 'LAFT',
    cols: {
      nombreCategoria: 0, categoria: 1, codigo: 2, producto: 3,
      telmovPay: 4, payjoy: 5, cantidad: 6, costo: 7,
      listaM: 8, listaG: 9, listaF: 10, precioPublico: 11
    }
  }
];

// ============================================================
// ROUTING
// ============================================================
function doGet(e) {
  var params = e.parameter || {};
  if (params.token !== TOKEN) {
    return jsonResponse({ error: 'Token invalido' });
  }

  var action = params.action || 'public';

  if (action === 'public') {
    return getPublicCatalog();
  } else if (action === 'catalog') {
    return getAuthorizedCatalog(params.sessionId || '');
  } else if (action === 'login') {
    return doLogin(params.phone || '');
  }

  return jsonResponse({ error: 'Accion no reconocida' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Datos invalidos' });
  }

  if (body.token !== TOKEN) {
    return jsonResponse({ success: false, message: 'Token invalido' });
  }

  if (body.action === 'register') {
    return doRegister(body.phone || '', body.email || '', body.name || '');
  }

  return jsonResponse({ success: false, message: 'Accion no reconocida' });
}

// ============================================================
// PUBLIC CATALOG — sin autenticacion, datos publicos unicamente
// ============================================================
function getPublicCatalog() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var products = [];

  for (var c = 0; c < LIST_CONFIGS.length; c++) {
    var cfg = LIST_CONFIGS[c];
    var sheet = ss.getSheetByName(cfg.sheet);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var codigo = String(row[cfg.cols.codigo] || '').trim();
      var producto = String(row[cfg.cols.producto] || '').trim();
      if (!codigo || !producto) continue;

      var cantidad = cleanCantidad(row[cfg.cols.cantidad]);

      products.push({
        almacen: cfg.almacen,
        codigo: codigo,
        producto: producto,
        nombreCategoria: String(row[cfg.cols.nombreCategoria] || '').trim(),
        categoria: String(row[cfg.cols.categoria] || '').trim(),
        precioPublico: cleanPrice(row[cfg.cols.precioPublico]),
        disponible: cantidad > 0,  // boolean, no cantidad exacta
        telmovPay: cfg.cols.telmovPay >= 0 ? String(row[cfg.cols.telmovPay] || '').trim().toUpperCase() === 'SI' : false,
        payjoy: cfg.cols.payjoy >= 0 ? String(row[cfg.cols.payjoy] || '').trim().toUpperCase() === 'SI' : false,
      });
    }
  }

  return jsonResponse({ products: products });
}

// ============================================================
// AUTHORIZED CATALOG — requiere session valida
// ============================================================
function getAuthorizedCatalog(sessionId) {
  if (!sessionId) {
    return jsonResponse({ error: 'Sesion requerida', code: 'NO_SESSION' });
  }

  var sessionData = validateSession(sessionId);
  if (!sessionData) {
    return jsonResponse({ error: 'Sesion invalida o expirada', code: 'INVALID_SESSION' });
  }

  var phone = sessionData.phone;
  var lista = sessionData.lista;

  if (!lista) {
    return jsonResponse({ error: 'Lista no asignada. Contacta al administrador.', code: 'NO_LIST' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var products = [];

  for (var c = 0; c < LIST_CONFIGS.length; c++) {
    var cfg = LIST_CONFIGS[c];
    var sheet = ss.getSheetByName(cfg.sheet);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var codigo = String(row[cfg.cols.codigo] || '').trim();
      var producto = String(row[cfg.cols.producto] || '').trim();
      if (!codigo || !producto) continue;

      var item = {
        almacen: cfg.almacen,
        codigo: codigo,
        producto: producto,
        nombreCategoria: String(row[cfg.cols.nombreCategoria] || '').trim(),
        categoria: String(row[cfg.cols.categoria] || '').trim(),
        existencias: cleanCantidad(row[cfg.cols.cantidad]),
        precioPublico: cleanPrice(row[cfg.cols.precioPublico]),
        telmovPay: cfg.cols.telmovPay >= 0 ? String(row[cfg.cols.telmovPay] || '').trim().toUpperCase() === 'SI' : false,
        payjoy: cfg.cols.payjoy >= 0 ? String(row[cfg.cols.payjoy] || '').trim().toUpperCase() === 'SI' : false,
      };

      // Filtrar listas segun nivel autorizado
      var listaUpper = lista.toUpperCase();
      if (listaUpper === 'TODAS' || listaUpper === 'M') {
        item.listaM = cleanPrice(row[cfg.cols.listaM]);
        item.listaG = cleanPrice(row[cfg.cols.listaG]);
        item.listaF = cleanPrice(row[cfg.cols.listaF]);
      } else if (listaUpper === 'G') {
        item.listaG = cleanPrice(row[cfg.cols.listaG]);
        item.listaF = cleanPrice(row[cfg.cols.listaF]);
      } else if (listaUpper === 'F') {
        item.listaF = cleanPrice(row[cfg.cols.listaF]);
      }
      // Si lista es "2X" o cualquier otra: solo precioPublico (ya incluido)

      products.push(item);
    }
  }

  return jsonResponse({ products: products, lista: lista });
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
function generateSessionToken(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(SESSIONS_SHEET);
    sheet.appendRow(['Phone', 'SessionId', 'Creado', 'Expira']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  // Limpiar sesiones anteriores del mismo telefono
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === phone) {
      sheet.deleteRow(i + 1);
    }
  }

  var sessionId = Utilities.getUuid();
  var now = new Date();
  var expires = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  sheet.appendRow([phone, sessionId, now, expires]);

  return sessionId;
}

function validateSession(sessionId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === sessionId) {
      var expires = new Date(data[i][3]);
      if (expires > now) {
        var phone = String(data[i][0]).trim();
        // Buscar lista asignada en Registro
        var regSheet = ss.getSheetByName(REGISTER_SHEET);
        if (!regSheet) return null;
        var regData = regSheet.getDataRange().getValues();
        for (var j = 1; j < regData.length; j++) {
          if (String(regData[j][1]).trim() === phone) {
            return {
              phone: phone,
              lista: String(regData[j][4] || '').trim()
            };
          }
        }
        return { phone: phone, lista: '' };
      }
      return null; // expirada
    }
  }

  return null; // no encontrada
}

function cleanExpiredSessions() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var now = new Date();

  // Borrar de abajo hacia arriba para no desplazar indices
  for (var i = data.length - 1; i >= 1; i--) {
    var expires = new Date(data[i][3]);
    if (expires <= now) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ============================================================
// LOGIN — ahora genera session token
// ============================================================
function doLogin(phone) {
  phone = String(phone).trim();

  if (!/^\d{10}$/.test(phone)) {
    return jsonResponse({ exists: false, message: 'Telefono invalido' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);

  if (!sheet) {
    return jsonResponse({ exists: false, message: 'No hay registros' });
  }

  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === phone) {
      var lista = String(data[i][4] || '').trim();
      var sessionId = generateSessionToken(phone);

      return jsonResponse({
        exists: true,
        name: String(data[i][0] || '').trim(),
        email: String(data[i][2] || '').trim(),
        lista: lista,
        sessionId: sessionId
      });
    }
  }

  return jsonResponse({ exists: false });
}

// ============================================================
// REGISTER (sin cambios funcionales)
// ============================================================
function doRegister(phone, email, name) {
  phone = String(phone).trim();
  email = String(email).trim();
  name = String(name || '').trim();

  if (!name) {
    return jsonResponse({ success: false, message: 'Ingresa tu nombre' });
  }
  if (!/^\d{10}$/.test(phone)) {
    return jsonResponse({ success: false, message: 'Telefono debe tener 10 digitos' });
  }
  if (!email || email.indexOf('@') === -1) {
    return jsonResponse({ success: false, message: 'Correo invalido' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(REGISTER_SHEET);
    sheet.appendRow(['Nombre', 'Telefono', 'Email', 'Fecha registro', 'Lista asignada', 'Notas']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === phone) {
      var lista = String(data[i][4] || '').trim();
      return jsonResponse({
        success: true,
        message: 'Ya estas registrado.',
        lista: lista
      });
    }
  }

  var now = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm');
  sheet.appendRow([name, phone, email, now, '', '']);

  notifyBitrix(name, phone, email);

  return jsonResponse({
    success: true,
    message: 'Registro exitoso. Tu lista de precios sera asignada pronto.',
    lista: ''
  });
}

// ============================================================
// BITRIX24 NOTIFICATION (sin cambios)
// ============================================================
function notifyBitrix(name, phone, email) {
  try {
    var msg = 'Nuevo registro en Catalogo de Equipos\n\n'
      + 'Nombre: ' + name + '\n'
      + 'Tel: ' + phone + '\n'
      + 'Email: ' + email + '\n\n'
      + 'Pendiente asignar lista de precios (M, G, F o TODAS)';

    UrlFetchApp.fetch(BITRIX_WEBHOOK + 'im.message.add', {
      method: 'post',
      payload: {
        DIALOG_ID: String(BITRIX_USER_CRIS),
        MESSAGE: msg
      }
    });
  } catch (e) {
    Logger.log('Error notificando Bitrix: ' + e.message);
  }
}

// ============================================================
// HELPERS (sin cambios)
// ============================================================
function cleanPrice(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  var s = String(v).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  if (isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

function cleanCantidad(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  var s = String(v).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  return Math.round(n);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// TRIGGER: configurar limpieza automatica de sesiones
// Para instalar: ejecutar setupCleanupTrigger() una vez manualmente
// ============================================================
function setupCleanupTrigger() {
  // Eliminar triggers existentes de limpieza
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'cleanExpiredSessions') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Crear trigger cada 6 horas
  ScriptApp.newTrigger('cleanExpiredSessions')
    .timeBased()
    .everyHours(6)
    .create();
}
