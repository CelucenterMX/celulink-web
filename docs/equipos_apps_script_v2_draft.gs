/**
 * Apps Script para Catalogo de Equipos - Celucenter
 * VERSION 2 — IMPLEMENTACION DE PRUEBA (NO DESPLEGADO)
 *
 * CAMBIOS RESPECTO A V1:
 *
 * 1. ENDPOINT PUBLICO (action=public):
 *    - Devuelve solo datos publicos: codigo, producto, categoria, precioPublico,
 *      disponible (boolean), telmovPay, payjoy
 *    - NO devuelve: listaM, listaG, listaF, existencias (cantidad), costo
 *
 * 2. AUTENTICACION CON PIN:
 *    - El admin asigna un PIN de 6 digitos al registrar al usuario
 *    - Login requiere telefono + PIN (no solo telefono)
 *    - PIN se almacena con sal unica + HMAC-SHA256 (ver seccion PIN HASHING)
 *    - Login exitoso genera session token (UUID) con TTL de 24h
 *
 * 3. ENDPOINT AUTORIZADO (action=catalog):
 *    - Requiere sessionId valido (generado por login)
 *    - Devuelve campos filtrados segun lista asignada al usuario
 *    - Session se invalida al expirar o al hacer logout
 *
 * FLUJO DE AUTENTICACION:
 *
 *   Admin asigna usuario:
 *     Hoja "Registro": [Nombre, Telefono, Email, Fecha, Lista, PIN_hash, Notas]
 *     El PIN se genera y comunica al usuario por canal privado (WhatsApp/Bitrix)
 *
 *   Usuario inicia sesion:
 *     POST {action:"login", phone:"3321234567", pin:"123456"}
 *     → Verifica phone + HMAC-SHA256(salt, pin) contra Registro
 *     → Si coincide: genera UUID, almacena en "Sesiones", devuelve sessionId
 *     → Si no: error generico (no revelar si existe el telefono)
 *
 *   Usuario consulta catalogo:
 *     GET ?action=catalog&sessionId=uuid-xxx
 *     → Valida session, extrae lista, filtra campos
 *
 *   Logout:
 *     POST {action:"logout", sessionId:"uuid-xxx"}
 *     → Elimina session de la hoja
 *
 * COMPATIBILIDAD CON CLIENTES ACTUALES:
 *   - Usuarios existentes sin PIN: se les notifica por Bitrix para establecer PIN
 *   - Mientras tanto, action=public sigue funcionando para el catalogo basico
 *   - El catalogo carga siempre con datos publicos; el login desbloquea las listas
 *
 * DESPLIEGUE:
 *   1. Crear NUEVO deployment (no reemplazar el actual)
 *   2. Probar con URL de prueba
 *   3. Migrar frontend a la nueva URL
 *   4. Retirar deployment anterior
 */

// ============================================================
// CONFIGURACION
// ============================================================
var TOKEN = 'CELUCENTER_EQUIPOS_2026';
var SHEET_ID = '1dN0Z8RER0i1bWwWvy6uHz2A_A7dg7mI1KzWTEzSnrdY';
var REGISTER_SHEET = 'Registro';
var SESSIONS_SHEET = 'Sesiones';
var SESSION_TTL_HOURS = 24;
var MAX_LOGIN_ATTEMPTS = 5;
var LOCKOUT_MINUTES = 15;
var BITRIX_WEBHOOK = 'https://celucenter.bitrix24.es/rest/9/m616r1ki7xm70bjp/';
var BITRIX_USER_CRIS = 9;

// Columnas de la hoja Registro (base 0):
// 0=Nombre, 1=Telefono, 2=Email, 3=Fecha, 4=Lista, 5=PIN_hash, 6=Notas
var REG_COL = { NAME: 0, PHONE: 1, EMAIL: 2, DATE: 3, LISTA: 4, PIN_HASH: 5, NOTES: 6 };

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

  // action=public no requiere token (es publico)
  var action = params.action || 'public';

  if (action === 'public') {
    return getPublicCatalog();
  }

  if (action === 'catalog') {
    return getAuthorizedCatalog(params.sessionId || '');
  }

  return jsonResponse({ error: 'Accion no reconocida' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Datos invalidos' });
  }

  var action = body.action || '';

  if (action === 'login') {
    return doLogin(body.phone || '', body.pin || '');
  }

  if (action === 'register') {
    return doRegister(body.phone || '', body.email || '', body.name || '');
  }

  if (action === 'logout') {
    return doLogout(body.sessionId || '');
  }

  return jsonResponse({ success: false, message: 'Accion no reconocida' });
}

// ============================================================
// PUBLIC CATALOG — sin autenticacion
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

      products.push({
        almacen: cfg.almacen,
        codigo: codigo,
        producto: producto,
        nombreCategoria: String(row[cfg.cols.nombreCategoria] || '').trim(),
        categoria: String(row[cfg.cols.categoria] || '').trim(),
        precioPublico: cleanPrice(row[cfg.cols.precioPublico]),
        disponible: cleanCantidad(row[cfg.cols.cantidad]) > 0,
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

  var session = validateSession(sessionId);
  if (!session) {
    return jsonResponse({ error: 'Sesion invalida o expirada', code: 'INVALID_SESSION' });
  }

  var lista = session.lista;
  if (!lista) {
    return jsonResponse({ error: 'Lista no asignada. Contacta al administrador.', code: 'NO_LIST' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var products = [];
  var listaUpper = lista.toUpperCase();

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

      // Filtrar listas segun nivel autorizado — server-side, no client-side
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
      // Si lista es "2X": solo precioPublico (ya incluido)

      products.push(item);
    }
  }

  return jsonResponse({ products: products, lista: lista });
}

// ============================================================
// LOGIN — telefono + PIN
// ============================================================
function doLogin(phone, pin) {
  phone = String(phone).trim();
  pin = String(pin).trim();

  // Validacion basica sin revelar informacion
  if (!/^\d{10}$/.test(phone) || !/^\d{4,6}$/.test(pin)) {
    return jsonResponse({ success: false, message: 'Credenciales invalidas' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Credenciales invalidas' });
  }

  // Rate limiting por telefono
  if (isLockedOut(phone)) {
    return jsonResponse({
      success: false,
      message: 'Demasiados intentos. Intenta en ' + LOCKOUT_MINUTES + ' minutos.',
      code: 'LOCKED_OUT'
    });
  }

  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][REG_COL.PHONE]).trim() === phone) {
      var storedHash = String(data[i][REG_COL.PIN_HASH] || '').trim();

      if (!storedHash) {
        // Usuario sin PIN asignado — misma respuesta generica
        // para no revelar que el telefono existe sin PIN
        recordFailedAttempt(phone);
        return jsonResponse({ success: false, message: 'Credenciales invalidas' });
      }

      if (!verifyPin(pin, storedHash)) {
        recordFailedAttempt(phone);
        return jsonResponse({ success: false, message: 'Credenciales invalidas' });
      }

      // Login exitoso
      clearFailedAttempts(phone);
      var lista = String(data[i][REG_COL.LISTA] || '').trim();
      var sessionId = generateSessionToken(phone);

      return jsonResponse({
        success: true,
        name: String(data[i][REG_COL.NAME] || '').trim(),
        lista: lista,
        sessionId: sessionId
      });
    }
  }

  // Telefono no encontrado — misma respuesta generica
  return jsonResponse({ success: false, message: 'Credenciales invalidas' });
}

// ============================================================
// LOGOUT
// ============================================================
function doLogout(sessionId) {
  if (!sessionId) {
    return jsonResponse({ success: true });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return jsonResponse({ success: true });

  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim() === sessionId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }

  return jsonResponse({ success: true });
}

// ============================================================
// REGISTER (sin cambios funcionales — no asigna PIN)
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
    sheet.appendRow(['Nombre', 'Telefono', 'Email', 'Fecha registro', 'Lista asignada', 'PIN_hash', 'Notas']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][REG_COL.PHONE]).trim() === phone) {
      return jsonResponse({
        success: true,
        message: 'Ya estas registrado. Si no tienes PIN, contacta a tu asesor.'
      });
    }
  }

  var now = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm');
  sheet.appendRow([name, phone, email, now, '', '', '']);

  notifyBitrix(name, phone, email);

  return jsonResponse({
    success: true,
    message: 'Registro exitoso. Tu asesor te enviara tu PIN de acceso.'
  });
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
function generateSessionToken(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss, SESSIONS_SHEET, ['Phone', 'SessionId', 'Creado', 'Expira']);

  // Invalidar sesiones anteriores del mismo telefono
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
      if (expires <= now) return null;

      var phone = String(data[i][0]).trim();
      var regSheet = ss.getSheetByName(REGISTER_SHEET);
      if (!regSheet) return null;

      var regData = regSheet.getDataRange().getValues();
      for (var j = 1; j < regData.length; j++) {
        if (String(regData[j][REG_COL.PHONE]).trim() === phone) {
          return {
            phone: phone,
            lista: String(regData[j][REG_COL.LISTA] || '').trim(),
            name: String(regData[j][REG_COL.NAME] || '').trim()
          };
        }
      }
      return null;
    }
  }

  return null;
}

// ============================================================
// PIN HASHING — sal unica por usuario + HMAC-SHA256
// ============================================================
//
// Por que no SHA-256 simple:
//   Un PIN de 6 digitos tiene solo 1M combinaciones.
//   SHA-256(pin) se puede invertir en < 1 segundo con una tabla precalculada
//   de 1M entradas. Si un atacante obtiene la hoja (backup, export, acceso
//   temporal), todos los PINs quedan expuestos.
//
// Solucion: sal aleatoria de 32 bytes unica por usuario + HMAC-SHA256.
//   - La sal impide tablas precalculadas (rainbow tables).
//   - HMAC es mas robusto que hash(salt+pin) contra extension de longitud.
//   - Cada usuario tiene un hash diferente incluso si comparten PIN.
//   - Fuerza bruta online limitada a 5 intentos / 15 min (rate limiting).
//   - Fuerza bruta offline: requiere obtener la hoja + fuerza bruta
//     individual por usuario (no reutilizable entre usuarios).
//
// Limitacion conocida: Apps Script no ofrece bcrypt/scrypt/PBKDF2.
//   HMAC-SHA256 con sal es el maximo nivel posible en este entorno.
//   La proteccion principal contra fuerza bruta es el rate limiting
//   server-side. Si se necesita proteccion offline mas fuerte, habria
//   que migrar a un proveedor externo (Firebase Auth, Auth0).
//
// Formato almacenado en columna PIN_hash:
//   "salt_hex:hmac_hex"
//   Ejemplo: "a1b2c3...32bytes...:f4e5d6...32bytes..."

function generateSalt() {
  // 32 bytes aleatorios via Utilities.getUuid (2 UUIDs concatenados = 32 hex chars de entropia)
  var uuid1 = Utilities.getUuid().replace(/-/g, '');
  var uuid2 = Utilities.getUuid().replace(/-/g, '');
  return (uuid1 + uuid2).substring(0, 64); // 32 bytes en hex
}

function hmacPin(salt, pin) {
  // HMAC-SHA256(value=pin, key=salt)
  // Apps Script signature: computeHmacSha256Signature(value, key)
  // Usando salt como string directamente (hex) como clave HMAC
  var raw = Utilities.computeHmacSha256Signature(pin, salt);
  return raw.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function hashPinWithSalt(pin) {
  var salt = generateSalt();
  var hmac = hmacPin(salt, pin);
  return salt + ':' + hmac;
}

function verifyPin(pin, storedHash) {
  // storedHash = "salt:hmac"
  var parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  var salt = parts[0];
  var expectedHmac = parts[1];
  var actualHmac = hmacPin(salt, pin);

  // Comparacion en tiempo constante (evitar timing attacks)
  if (actualHmac.length !== expectedHmac.length) return false;
  var diff = 0;
  for (var i = 0; i < actualHmac.length; i++) {
    diff |= actualHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
  }
  return diff === 0;
}

// Funcion auxiliar para que el admin asigne un PIN
// Ejecutar manualmente: setUserPin("3321234567", "123456")
function setUserPin(phone, pin) {
  if (!/^\d{4,6}$/.test(pin)) {
    Logger.log('ERROR: PIN debe ser de 4-6 digitos');
    return;
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(REGISTER_SHEET);
  if (!sheet) { Logger.log('Hoja Registro no encontrada'); return; }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][REG_COL.PHONE]).trim() === phone) {
      var hashed = hashPinWithSalt(pin);
      sheet.getRange(i + 1, REG_COL.PIN_HASH + 1).setValue(hashed);
      Logger.log('PIN actualizado para ' + phone + ' (salt:hmac, ' + hashed.length + ' chars)');
      return;
    }
  }
  Logger.log('Telefono no encontrado: ' + phone);
}

// ============================================================
// RATE LIMITING (intentos fallidos)
// ============================================================
function isLockedOut(phone) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('LoginAttempts');
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  var cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === phone && new Date(data[i][1]) > cutoff) {
      count++;
    }
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
    if (String(data[i][0]).trim() === phone) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ============================================================
// CLEANUP TRIGGERS
// ============================================================
function cleanExpiredSessions() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var now = new Date();
  for (var i = data.length - 1; i >= 1; i--) {
    if (new Date(data[i][3]) <= now) {
      sheet.deleteRow(i + 1);
    }
  }

  // Tambien limpiar intentos de login viejos
  var attempts = ss.getSheetByName('LoginAttempts');
  if (attempts) {
    var cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    var aData = attempts.getDataRange().getValues();
    for (var j = aData.length - 1; j >= 1; j--) {
      if (new Date(aData[j][1]) <= cutoff) {
        attempts.deleteRow(j + 1);
      }
    }
  }
}

function setupCleanupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'cleanExpiredSessions') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('cleanExpiredSessions')
    .timeBased()
    .everyHours(6)
    .create();
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
      + 'Pendiente: asignar lista y PIN de acceso';

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
// HELPERS
// ============================================================
function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

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
