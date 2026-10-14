/**
 * Apps Script para Catalogo de Accesorios - Celucenter
 * VERSION 2 — BORRADOR DE PRODUCCION (NO DESPLEGADO)
 *
 * Misma arquitectura de seguridad que equipos V2:
 * - Endpoint publico (action=public): precioPublico, disponible, archivo, nuevo
 * - Autenticacion: telefono + PIN (PBKDF2-HMAC-SHA256, 10K iteraciones)
 * - Endpoint autorizado (action=catalog): listas filtradas segun nivel del usuario
 * - Rate limiting: 5 intentos / 15 min
 * - Sesion unica por telefono, TTL 24h
 *
 * DIFERENCIAS CON EQUIPOS:
 * - Campo "nombre" en lugar de "producto"
 * - Campo "lista2x" adicional
 * - Campos "archivo", "linkWeb", "nuevo"
 * - Una sola hoja fuente (no multiples almacenes)
 *
 * NOTA: Este archivo comparte Registro/Sesiones/LoginAttempts con equipos V2
 * ya que ambos apuntan a la misma hoja de calculo de produccion.
 */

var SHEET_ID = ''; // TODO: asignar el ID de la hoja de accesorios de produccion
var REGISTER_SHEET = 'Registro';
var SESSIONS_SHEET = 'Sesiones';
var SESSION_TTL_HOURS = 24;
var MAX_LOGIN_ATTEMPTS = 5;
var LOCKOUT_MINUTES = 15;
var PBKDF2_ITERATIONS = 10000;

var REG_COL = { NAME: 0, PHONE: 1, EMAIL: 2, DATE: 3, LISTA: 4, PIN_HASH: 5, NOTES: 6 };

// Columnas del catalogo de accesorios — ajustar segun hoja real
var CATALOG_SHEET = 'Catalogo'; // TODO: nombre real de la pestana
var CAT_COL = { CODIGO: 0, NOMBRE: 1, CATEGORIA: 2, LISTA_M: 3, LISTA_G: 4, LISTA_F: 5, LISTA_2X: 6, PRECIO_PUBLICO: 7, ARCHIVO: 8, ALMACEN: 9, NUEVO: 10, EXISTENCIAS: 11, LINK_WEB: 12 };

// ============================================================
// PBKDF2-HMAC-SHA256
// ============================================================
function bytesToHex(bytes) {
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function hexToSignedBytes(hex) {
  var bytes = [];
  for (var i = 0; i < hex.length; i += 2) {
    var v = parseInt(hex.substr(i, 2), 16);
    bytes.push(v > 127 ? v - 256 : v);
  }
  return bytes;
}
function pbkdf2HmacSha256(password, saltHex, iterations) {
  var saltBytes = hexToSignedBytes(saltHex);
  saltBytes.push(0, 0, 0, 1);
  var keyBlob = Utilities.newBlob(password);
  var u = Utilities.computeHmacSha256Signature(saltBytes, keyBlob.getBytes());
  var result = u.slice();
  for (var i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSha256Signature(u, keyBlob.getBytes());
    for (var j = 0; j < result.length; j++) { result[j] = (result[j] ^ u[j]); }
  }
  return bytesToHex(result);
}
function hashPinPBKDF2(pin) {
  var salt = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  salt = salt.substring(0, 64);
  var derived = pbkdf2HmacSha256(pin, salt, PBKDF2_ITERATIONS);
  return PBKDF2_ITERATIONS + ':' + salt + ':' + derived;
}
function verifyPinPBKDF2(pin, storedHash) {
  if (!storedHash) return false;
  var parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  var iterations = parseInt(parts[0], 10);
  var salt = parts[1];
  var expectedDerived = parts[2];
  if (!iterations || iterations < 1000 || !salt || !expectedDerived) return false;
  var actualDerived = pbkdf2HmacSha256(pin, salt, iterations);
  if (actualDerived.length !== expectedDerived.length) return false;
  var diff = 0;
  for (var i = 0; i < actualDerived.length; i++) {
    diff |= actualDerived.charCodeAt(i) ^ expectedDerived.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// ROUTING
// ============================================================
function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || 'public';
  if (action === 'public') return getPublicCatalog();
  if (action === 'catalog') return getAuthorizedCatalog(params.sessionId || '');
  return jsonResponse({ error: 'Accion no reconocida' });
}

function doPost(e) {
  try { var body = JSON.parse(e.postData.contents); } catch (err) { return jsonResponse({ success: false, message: 'Datos invalidos' }); }
  var action = body.action || '';
  if (action === 'login') return doLogin(body.phone || '', body.pin || '');
  if (action === 'logout') return doLogout(body.sessionId || '');
  if (action === 'register') return doRegister(body.phone || '', body.email || '', body.name || '');
  return jsonResponse({ success: false, message: 'Accion no reconocida' });
}

// ============================================================
// PUBLIC CATALOG
// ============================================================
function getPublicCatalog() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(CATALOG_SHEET);
  if (!sheet) return jsonResponse({ products: [] });
  var data = sheet.getDataRange().getValues();
  var products = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var codigo = String(row[CAT_COL.CODIGO] || '').trim();
    var nombre = String(row[CAT_COL.NOMBRE] || '').trim();
    if (!codigo || !nombre) continue;
    products.push({
      codigo: codigo,
      nombre: nombre,
      categoria: String(row[CAT_COL.CATEGORIA] || '').trim(),
      precioPublico: cleanPrice(row[CAT_COL.PRECIO_PUBLICO]),
      disponible: cleanCantidad(row[CAT_COL.EXISTENCIAS]) > 0,
      archivo: String(row[CAT_COL.ARCHIVO] || '').trim(),
      almacen: String(row[CAT_COL.ALMACEN] || '').trim(),
      nuevo: row[CAT_COL.NUEVO] === true,
      linkWeb: String(row[CAT_COL.LINK_WEB] || '').trim()
    });
  }
  return jsonResponse({ products: products });
}

// ============================================================
// AUTHORIZED CATALOG
// ============================================================
function getAuthorizedCatalog(sessionId) {
  if (!sessionId) return jsonResponse({ error: 'Sesion requerida', code: 'NO_SESSION' });
  var session = validateSession(sessionId);
  if (!session) return jsonResponse({ error: 'Sesion invalida o expirada', code: 'INVALID_SESSION' });
  var lista = session.lista;
  if (!lista) return jsonResponse({ error: 'Lista no asignada', code: 'NO_LIST' });

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(CATALOG_SHEET);
  if (!sheet) return jsonResponse({ products: [], lista: lista });
  var data = sheet.getDataRange().getValues();
  var products = [];
  var listaUpper = lista.toUpperCase();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var codigo = String(row[CAT_COL.CODIGO] || '').trim();
    var nombre = String(row[CAT_COL.NOMBRE] || '').trim();
    if (!codigo || !nombre) continue;
    var item = {
      codigo: codigo, nombre: nombre,
      categoria: String(row[CAT_COL.CATEGORIA] || '').trim(),
      precioPublico: cleanPrice(row[CAT_COL.PRECIO_PUBLICO]),
      existencias: cleanCantidad(row[CAT_COL.EXISTENCIAS]),
      archivo: String(row[CAT_COL.ARCHIVO] || '').trim(),
      almacen: String(row[CAT_COL.ALMACEN] || '').trim(),
      nuevo: row[CAT_COL.NUEVO] === true,
      linkWeb: String(row[CAT_COL.LINK_WEB] || '').trim()
    };
    if (listaUpper === 'TODAS' || listaUpper === 'M') {
      item.listaM = cleanPrice(row[CAT_COL.LISTA_M]);
      item.listaG = cleanPrice(row[CAT_COL.LISTA_G]);
      item.listaF = cleanPrice(row[CAT_COL.LISTA_F]);
      item.lista2x = cleanPrice(row[CAT_COL.LISTA_2X]);
    } else if (listaUpper === 'G') {
      item.listaG = cleanPrice(row[CAT_COL.LISTA_G]);
      item.listaF = cleanPrice(row[CAT_COL.LISTA_F]);
      item.lista2x = cleanPrice(row[CAT_COL.LISTA_2X]);
    } else if (listaUpper === 'F') {
      item.listaF = cleanPrice(row[CAT_COL.LISTA_F]);
      item.lista2x = cleanPrice(row[CAT_COL.LISTA_2X]);
    } else if (listaUpper === '2X') {
      item.lista2x = cleanPrice(row[CAT_COL.LISTA_2X]);
    }
    products.push(item);
  }
  return jsonResponse({ products: products, lista: lista });
}

// ============================================================
// LOGIN
// ============================================================
function doLogin(phone, pin) {
  phone = String(phone).trim();
  pin = String(pin).trim();
  if (!/^\d{10}$/.test(phone) || !/^\d{4,6}$/.test(pin)) {
    return jsonResponse({ success: false, message: 'Credenciales invalidas' });
  }
  if (isLockedOut(phone)) {
    return jsonResponse({ success: false, message: 'Demasiados intentos. Intenta en ' + LOCKOUT_MINUTES + ' minutos.', code: 'LOCKED_OUT' });
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);
  if (!sheet) return jsonResponse({ success: false, message: 'Credenciales invalidas' });
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][REG_COL.PHONE]).trim() === phone) {
      var storedHash = String(data[i][REG_COL.PIN_HASH] || '').trim();
      if (!storedHash || !verifyPinPBKDF2(pin, storedHash)) {
        recordFailedAttempt(phone);
        return jsonResponse({ success: false, message: 'Credenciales invalidas' });
      }
      clearFailedAttempts(phone);
      var lista = String(data[i][REG_COL.LISTA] || '').trim();
      var name = String(data[i][REG_COL.NAME] || '').trim();
      var sessionId = generateSessionToken(phone);
      return jsonResponse({ success: true, name: name, lista: lista, sessionId: sessionId });
    }
  }
  recordFailedAttempt(phone);
  return jsonResponse({ success: false, message: 'Credenciales invalidas' });
}

// ============================================================
// LOGOUT / REGISTER
// ============================================================
function doLogout(sessionId) {
  if (!sessionId) return jsonResponse({ success: true });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return jsonResponse({ success: true });
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim() === sessionId) { sheet.deleteRow(i + 1); break; }
  }
  return jsonResponse({ success: true });
}

function doRegister(phone, email, name) {
  phone = String(phone).trim(); email = String(email).trim(); name = String(name || '').trim();
  if (!name) return jsonResponse({ success: false, message: 'Ingresa tu nombre' });
  if (!/^\d{10}$/.test(phone)) return jsonResponse({ success: false, message: 'Telefono debe tener 10 digitos' });
  if (!email || email.indexOf('@') === -1) return jsonResponse({ success: false, message: 'Correo invalido' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][REG_COL.PHONE]).trim() === phone) return jsonResponse({ success: true, message: 'Ya registrado.' });
  }
  var now = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm');
  sheet.appendRow([name, phone, email, now, '', '', '']);
  return jsonResponse({ success: true, message: 'Registro exitoso.' });
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
function generateSessionToken(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SESSIONS_SHEET, ['Phone', 'SessionId', 'Creado', 'Expira']);
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === phone) sheet.deleteRow(i + 1);
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
      if (new Date(data[i][3]) <= now) return null;
      var phone = String(data[i][0]).trim();
      var regSheet = ss.getSheetByName(REGISTER_SHEET);
      if (!regSheet) return null;
      var regData = regSheet.getDataRange().getValues();
      for (var j = 1; j < regData.length; j++) {
        if (String(regData[j][REG_COL.PHONE]).trim() === phone) {
          return { phone: phone, lista: String(regData[j][REG_COL.LISTA] || '').trim(), name: String(regData[j][REG_COL.NAME] || '').trim() };
        }
      }
      return null;
    }
  }
  return null;
}

// ============================================================
// RATE LIMITING
// ============================================================
function isLockedOut(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('LoginAttempts');
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  var cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === phone && new Date(data[i][1]) > cutoff) count++;
  }
  return count >= MAX_LOGIN_ATTEMPTS;
}
function recordFailedAttempt(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, 'LoginAttempts', ['Phone', 'Timestamp']);
  sheet.appendRow([phone, new Date()]);
}
function clearFailedAttempts(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('LoginAttempts');
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === phone) sheet.deleteRow(i + 1);
  }
}

// ============================================================
// CLEANUP TRIGGER (ejecutar cada 6h)
// ============================================================
function cleanupExpired() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var now = new Date();
  // Sesiones expiradas
  var sessions = ss.getSheetByName(SESSIONS_SHEET);
  if (sessions) {
    var data = sessions.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (new Date(data[i][3]) <= now) sessions.deleteRow(i + 1);
    }
  }
  // Intentos viejos (>1h)
  var attempts = ss.getSheetByName('LoginAttempts');
  if (attempts) {
    var cutoff = new Date(now.getTime() - 60 * 60 * 1000);
    var aData = attempts.getDataRange().getValues();
    for (var i = aData.length - 1; i >= 1; i--) {
      if (new Date(aData[i][1]) < cutoff) attempts.deleteRow(i + 1);
    }
  }
}

// ============================================================
// HELPERS
// ============================================================
function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold'); }
  return sheet;
}
function cleanPrice(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}
function cleanCantidad(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function setUserPin(phone, pin) {
  if (!/^\d{4,6}$/.test(pin)) { Logger.log('PIN debe ser 4-6 digitos'); return; }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);
  if (!sheet) { Logger.log('No encontrada'); return; }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][REG_COL.PHONE]).trim() === phone) {
      sheet.getRange(i + 1, REG_COL.PIN_HASH + 1).setValue(hashPinPBKDF2(pin));
      Logger.log('PIN asignado a ' + phone);
      return;
    }
  }
  Logger.log('Telefono no encontrado');
}
