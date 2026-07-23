/**
 * Apps Script para Catalogo de Equipos - Celucenter
 *
 * Soporta:
 *   GET  ?action=catalog&token=XXX         → productos de las 3 listas unificados
 *   GET  ?action=login&token=XXX&phone=XXX → verificar telefono registrado
 *   POST {action:"register", token, phone, email, name} → registrar usuario
 *
 * Pestanas fuente:
 *   - "Lista General BM"    → almacen BM
 *   - "Lista General Ecom"  → almacen Ecom (open box / grado A-C)
 *   - "Lista General LAFT"  → almacen LAFT
 * Pestana "Registro": usuarios registrados para ver precios
 *
 * DESPLIEGUE:
 *   1. Abrir Google Apps Script vinculado al spreadsheet
 *   2. Pegar este codigo
 *   3. Deploy > New deployment > Web app
 *   4. Execute as: Me, Access: Anyone
 *   5. Copiar la URL y pegarla en el HTML (APPS_SCRIPT_URL)
 */

var TOKEN = 'CELUCENTER_EQUIPOS_2026';
var SHEET_ID = '1dN0Z8RER0i1bWwWvy6uHz2A_A7dg7mI1KzWTEzSnrdY';
var REGISTER_SHEET = 'Registro';
var BITRIX_WEBHOOK = 'https://celucenter.bitrix24.es/rest/9/m616r1ki7xm70bjp/';
var BITRIX_USER_CRIS = 9;

// Configuracion de las 3 listas fuente
// BM tiene estructura distinta (sin TELMOV/PAYJOY/COSTO)
var LIST_CONFIGS = [
  {
    sheet: 'Lista General BM',
    almacen: 'BM',
    cols: {
      nombreCategoria: 0,
      categoria: 1,
      codigo: 2,
      producto: 3,
      cantidad: 4,
      listaM: 5,
      listaG: 6,
      listaF: 7,
      precioPublico: 8,
      telmovPay: -1,
      payjoy: -1,
      costo: -1
    }
  },
  {
    sheet: 'Lista General Ecom',
    almacen: 'Ecom',
    cols: {
      nombreCategoria: 0,
      categoria: 1,
      codigo: 2,
      producto: 3,
      telmovPay: 4,
      payjoy: 5,
      cantidad: 6,
      costo: 7,
      listaM: 8,
      listaG: 9,
      listaF: 10,
      precioPublico: 11
    }
  },
  {
    sheet: 'Lista General LAFT',
    almacen: 'LAFT',
    cols: {
      nombreCategoria: 0,
      categoria: 1,
      codigo: 2,
      producto: 3,
      telmovPay: 4,
      payjoy: 5,
      cantidad: 6,
      costo: 7,
      listaM: 8,
      listaG: 9,
      listaF: 10,
      precioPublico: 11
    }
  }
];

function doGet(e) {
  var params = e.parameter || {};
  if (params.token !== TOKEN) {
    return jsonResponse({ error: 'Token invalido' });
  }

  var action = params.action || 'catalog';

  if (action === 'catalog') {
    return getCatalog();
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

  var action = body.action || '';

  if (action === 'register') {
    return doRegister(body.phone || '', body.email || '', body.name || '');
  }

  return jsonResponse({ success: false, message: 'Accion no reconocida' });
}

// ============================================================
// CATALOG
// ============================================================
function getCatalog() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var products = [];

  for (var c = 0; c < LIST_CONFIGS.length; c++) {
    var cfg = LIST_CONFIGS[c];
    var sheet = ss.getSheetByName(cfg.sheet);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    // Fila 0 = headers, datos desde fila 1
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
        listaM: cleanPrice(row[cfg.cols.listaM]),
        listaG: cleanPrice(row[cfg.cols.listaG]),
        listaF: cleanPrice(row[cfg.cols.listaF]),
        precioPublico: cleanPrice(row[cfg.cols.precioPublico]),
        telmovPay: cfg.cols.telmovPay >= 0 ? String(row[cfg.cols.telmovPay] || '').trim().toUpperCase() === 'SI' : false,
        payjoy: cfg.cols.payjoy >= 0 ? String(row[cfg.cols.payjoy] || '').trim().toUpperCase() === 'SI' : false,
        costo: cfg.cols.costo >= 0 ? cleanPrice(row[cfg.cols.costo]) : null
      };

      products.push(item);
    }
  }

  return jsonResponse({ products: products });
}

// Limpia un precio: "$10.000012" → 10.00, "10.000012" → 10.00
function cleanPrice(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  var s = String(v).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  if (isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

// Limpia cantidad: "$12,015.00" → 12015, "93" → 93
function cleanCantidad(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  var s = String(v).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  return Math.round(n);
}

// ============================================================
// REGISTER
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
// LOGIN
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
      return jsonResponse({
        exists: true,
        name: String(data[i][0] || '').trim(),
        email: String(data[i][2] || '').trim(),
        lista: String(data[i][4] || '').trim()
      });
    }
  }

  return jsonResponse({ exists: false });
}

// ============================================================
// BITRIX24 NOTIFICATION
// ============================================================
function notifyBitrix(name, phone, email) {
  try {
    var msg = '📱 Nuevo registro en Catalogo de Equipos\n\n'
      + '👤 Nombre: ' + name + '\n'
      + '📱 Tel: ' + phone + '\n'
      + '✉️ Email: ' + email + '\n\n'
      + '⏳ Pendiente asignar lista de precios (M, G, F o TODAS)';

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
// HELPER
// ============================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
