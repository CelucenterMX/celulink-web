# Plan de Proteccion de Endpoints — Celulink V1

Fecha: 2026-10-13
Estado: Propuesta — NO implementado

## Problema

Los endpoints de Apps Script para equipos y accesorios entregan todos los campos
(listas M, G, F, existencias detalladas) a cualquier request que incluya el token,
el cual esta visible en el HTML publico.

## Arquitectura propuesta

### A. Separar acciones publicas de privadas en Apps Script

**Equipos** (`equipos_apps_script.gs`):

```
action=public  → No requiere autenticacion
  Devuelve: codigo, producto, nombreCategoria, categoria, precioPublico,
            disponible (boolean), telmovPay, payjoy
  NO devuelve: listaM, listaG, listaF, existencias (cantidad), almacen

action=catalog → Requiere phone + session token
  Devuelve: todos los campos, filtrados segun lista asignada al usuario
  Validacion: verificar phone en hoja Registro + que tenga lista asignada
```

**Accesorios** (Apps Script correspondiente):

```
action=public  → No requiere autenticacion
  Devuelve: codigo, nombre, categoria, precioPublico, archivo, disponible (boolean)
  NO devuelve: listaM, listaG, listaF, lista2x, existencias

action=catalog → Requiere phone + session token
  Devuelve: campos completos segun lista asignada
```

### B. Session token (server-side)

1. Usuario hace login con telefono (ya existe)
2. Apps Script genera un token temporal (UUID + timestamp)
3. Token se almacena en una hoja "Sesiones" con TTL de 24h
4. Frontend almacena el token en sessionStorage
5. Requests a `action=catalog` incluyen el session token
6. Apps Script valida token en cada request

```javascript
// Nuevo en Apps Script
function generateSessionToken(phone) {
  var token = Utilities.getUuid() + '-' + Date.now();
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Sesiones');
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SHEET_ID).insertSheet('Sesiones');
    sheet.appendRow(['Phone', 'Token', 'Creado', 'Expira']);
  }
  var now = new Date();
  var expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  sheet.appendRow([phone, token, now, expires]);
  return token;
}

function validateSession(sessionToken) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Sesiones');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === sessionToken && new Date(data[i][3]) > now) {
      return data[i][0]; // phone
    }
  }
  return null;
}
```

### C. Filtrado por lista asignada

El campo `lista` de la hoja Registro determina que precios ve cada usuario:
- Lista "F" → solo listaF
- Lista "G" → listaG y listaF
- Lista "M" → listaM, listaG, listaF
- Lista "TODAS" → todas las listas

El backend NUNCA devuelve listas superiores a la asignada.

## Archivos y servicios afectados

| Archivo | Cambio |
|---------|--------|
| `equipos_apps_script.gs` | Agregar action=public, session tokens, filtrado por lista |
| `catalogos/equipos/index.html` | Usar action=public para carga inicial, action=catalog post-login |
| Apps Script accesorios (no en repo) | Mismos cambios que equipos |
| `catalogos/accesorios/index.html` | Usar action=public para carga inicial |
| `index.html` (landing) | Cambiar a action=public para precios del escaparate |

## Plan de migracion sin interrupcion

### Fase 1 — Preparar (sin deploy)
1. Escribir el nuevo codigo de Apps Script con las dos acciones
2. Probar en deploy de prueba (New deployment → test URL)
3. Verificar que action=public devuelve solo datos publicos
4. Verificar que action=catalog con session valida devuelve datos completos

### Fase 2 — Deploy en paralelo
1. Crear un NUEVO deployment de Apps Script (no reemplazar el actual)
2. Actualizar frontend para usar nueva URL con action=public
3. Login/registro usa el nuevo endpoint con session tokens
4. El endpoint antiguo sigue funcionando como fallback

### Fase 3 — Cortar acceso antiguo
1. Verificar que todo funciona con el nuevo endpoint (24-48h)
2. Retirar el deployment antiguo de Apps Script
3. Cambiar el token del endpoint antiguo (invalida cualquier cache)

### Fase 4 — Limpieza
1. Rotar tokens de API
2. Limpiar sesiones expiradas periodicamente (trigger en Apps Script)

## Pruebas requeridas

### Acceso anonimo
- [ ] `curl "URL?action=public&token=XXX"` devuelve solo campos publicos
- [ ] `curl "URL?action=catalog&token=XXX"` sin session → error 401
- [ ] Verificar que listaM, listaG, listaF NO aparecen en respuesta publica
- [ ] Verificar que existencias se devuelve como boolean, no cantidad

### Acceso autorizado
- [ ] Login con telefono registrado → recibe session token
- [ ] `action=catalog` con session valida → recibe precios segun lista asignada
- [ ] Usuario con lista "F" no recibe listaM ni listaG
- [ ] Session expirada → error 401, requiere re-login

### Regresion
- [ ] Catalogo publico carga y muestra precios publicos correctamente
- [ ] Carrito funciona con precios de lista del usuario
- [ ] Landing page muestra precios del escaparate
- [ ] Busqueda y filtros funcionan sin cambios

## Procedimiento de reversion

1. En Apps Script: reactivar el deployment anterior (o crear uno nuevo con codigo anterior)
2. En frontend: revertir URLs de endpoint al deployment anterior
3. El codigo anterior del frontend es compatible con la respuesta completa
4. Tiempo estimado de reversion: < 5 minutos

## Notas

- Google Apps Script no soporta CORS personalizado, asi que restriccion por origen
  NO es una opcion viable como control principal
- Los tokens hardcodeados en HTML son equivalentes a no tener token — la proteccion
  real debe ser server-side con session validada
- El campo `costo` ya fue retirado en un commit anterior (7b4cfbd)
