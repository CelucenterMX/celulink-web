/**
 * SCRIPT DE AUDITORIA — Ejecutar UNA VEZ desde Apps Script
 *
 * Cuenta usuarios registrados en la hoja "Registro" y genera
 * un resumen sin exponer datos personales.
 *
 * Instrucciones:
 * 1. Abrir el proyecto Apps Script vinculado a la hoja del catalogo de equipos
 * 2. Crear un archivo nuevo (ej: "auditoria.gs")
 * 3. Pegar este codigo
 * 4. Ejecutar la funcion auditRegisteredUsers()
 * 5. Ver resultado en Logs (View → Logs o Ctrl+Enter)
 * 6. BORRAR este archivo despues de ejecutar
 *
 * NO MODIFICA DATOS. Solo lee y cuenta.
 */

function auditRegisteredUsers() {
  var SHEET_ID = '1dN0Z8RER0i1bWwWvy6uHz2A_A7dg7mI1KzWTEzSnrdY';
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Registro');

  if (!sheet) {
    Logger.log('No existe hoja "Registro"');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var total = data.length - 1; // sin header

  var conLista = 0;
  var sinLista = 0;
  var porLista = {};

  for (var i = 1; i < data.length; i++) {
    var lista = String(data[i][4] || '').trim().toUpperCase();
    if (lista) {
      conLista++;
      porLista[lista] = (porLista[lista] || 0) + 1;
    } else {
      sinLista++;
    }
  }

  Logger.log('=== AUDITORIA DE USUARIOS REGISTRADOS ===');
  Logger.log('Total registrados: ' + total);
  Logger.log('Con lista asignada: ' + conLista);
  Logger.log('Sin lista (pendientes): ' + sinLista);
  Logger.log('');
  Logger.log('Desglose por lista:');
  for (var l in porLista) {
    Logger.log('  Lista ' + l + ': ' + porLista[l] + ' usuarios');
  }
  Logger.log('');
  Logger.log('Estos ' + conLista + ' usuarios necesitan recibir PIN de 6 digitos');
  Logger.log('para acceder a listas especiales con el nuevo sistema.');
}
