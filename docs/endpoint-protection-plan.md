# Proteccion de Endpoints — Diseno Tecnico V2

Fecha: 2026-10-13
Estado: Implementacion de prueba lista — NO desplegado

---

## 1. Problema

Los endpoints de equipos y accesorios entregan todas las listas de precios
mayoristas y cantidades exactas por almacen a cualquier visitante.
El "token" esta en el HTML publico y no constituye proteccion.
El "login" actual solo verifica que un telefono existe — no hay secreto
compartido, y los datos de sesion se guardan en localStorage del navegador.

## 2. Solucion

### Dos niveles de acceso server-side

| Nivel | Endpoint | Autenticacion | Datos |
|-------|----------|--------------|-------|
| Publico | `action=public` | Ninguna | codigo, producto, categoria, precioPublico, disponible (bool), telmovPay, payjoy |
| Autorizado | `action=catalog` | sessionId (UUID generado por login con telefono + PIN) | Campos anteriores + existencias + listas segun nivel asignado |

### Autenticacion: telefono + PIN

**Por que PIN y no solo telefono:**
- Un telefono de 10 digitos no es secreto (aparece en facturas, directorios, contactos)
- Un PIN de 4-6 digitos es un secreto compartido que el admin entrega por canal privado
- Combinado con rate limiting (5 intentos / 15 min), un PIN de 4 digitos tiene
  ~33 horas de fuerza bruta — suficiente para detectar y bloquear

**Por que no OTP/SMS/OAuth:**
- Apps Script no soporta envio de SMS propio
- Los clientes mayoristas son distribuidores con relacion directa — el admin
  les comunica el PIN por WhatsApp o en persona
- Un sistema mas complejo retrasaria la implementacion y podria ahuyentar
  a distribuidores que ya estan acostumbrados al flujo simple

**Flujo:**
```
1. Admin registra usuario en hoja → asigna lista + PIN
2. Admin comunica PIN al usuario por WhatsApp/Bitrix
3. Usuario abre catalogo → ve datos publicos (precioPublico, disponible)
4. Usuario hace login: telefono + PIN
5. Backend verifica hash(PIN) + genera sessionId (UUID, TTL 24h)
6. Frontend guarda sessionId en sessionStorage (no localStorage)
7. Cada request a action=catalog incluye sessionId
8. Backend valida session + filtra campos segun lista del usuario
9. Session expira en 24h o al cerrar pestana (sessionStorage)
```

### Filtrado server-side por lista

| Lista asignada | Campos que recibe |
|----------------|-------------------|
| 2X | Solo precioPublico |
| F | listaF |
| G | listaG + listaF |
| M | listaM + listaG + listaF |
| TODAS | listaM + listaG + listaF |

El backend NUNCA devuelve listas superiores a la asignada.

### Protecciones adicionales

- **PIN con sal**: HMAC-SHA256 con sal unica de 32 bytes por usuario (formato salt:hmac)
- **Comparacion constante**: verificacion en tiempo constante contra timing attacks
- **Rate limiting**: 5 intentos fallidos → bloqueo 15 min (hoja LoginAttempts)
- **Respuesta generica**: login fallido no revela si el telefono existe
- **Session unica**: login invalida sesiones anteriores del mismo telefono
- **Logout explicito**: elimina session de la hoja
- **Limpieza automatica**: trigger cada 6h borra sesiones e intentos expirados

## 3. Archivos afectados

| Archivo | Cambio |
|---------|--------|
| Apps Script equipos | Reescribir doGet/doPost, agregar public/catalog/login/logout |
| Apps Script accesorios | Mismos cambios (endpoint separado) |
| Hoja de calculo | Agregar columna PIN_hash en Registro, crear hojas Sesiones y LoginAttempts |
| `catalogos/equipos/index.html` | Carga inicial con action=public; login envia PIN; catalog usa sessionId |
| `catalogos/accesorios/index.html` | Mismos cambios |
| `index.html` (landing) | Cambiar a action=public |

## 4. Codigo

### Apps Script v2: `docs/equipos_apps_script_v2_draft.gs`

Implementacion completa lista para probar como deployment separado.

### Frontend: cambios necesarios en equipos/index.html

```javascript
// 1. Carga inicial — datos publicos
async function loadCatalog() {
    const res = await fetch(APPS_SCRIPT_URL + '?action=public');
    // ... productos con precioPublico y disponible (bool)
}

// 2. Login — ahora con PIN
async function handleLogin() {
    const phone = document.getElementById('loginPhone').value.trim();
    const pin = document.getElementById('loginPin').value.trim();
    const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', phone, pin })
    });
    const data = await res.json();
    if (data.success) {
        sessionStorage.setItem('celulink_session', data.sessionId);
        await loadAuthorizedCatalog();
    }
}

// 3. Catalogo autorizado
async function loadAuthorizedCatalog() {
    const sid = sessionStorage.getItem('celulink_session');
    if (!sid) return;
    const res = await fetch(APPS_SCRIPT_URL + '?action=catalog&sessionId=' + sid);
    const data = await res.json();
    if (data.code === 'INVALID_SESSION') {
        sessionStorage.removeItem('celulink_session');
        return;
    }
}

// 4. Logout
function logout() {
    const sid = sessionStorage.getItem('celulink_session');
    if (sid) {
        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'logout', sessionId: sid })
        });
    }
    sessionStorage.removeItem('celulink_session');
    location.reload();
}
```

## 5. Plan de migracion

### Fase 0 — Preparar hoja de calculo (5 min)
1. Agregar columna "PIN_hash" a hoja Registro (columna F, despues de Lista)
2. Las celdas vacias significan "usuario sin PIN, requiere activacion"

### Fase 1 — Deploy de prueba AISLADO (15 min)
1. Crear proyecto Apps Script STANDALONE (no en la hoja productiva)
2. Usar hoja de prueba con datos ficticios
3. Pegar codigo v2 → Deploy como Web App
4. Ejecutar los 6 tests de seguridad con test-endpoint.html
5. Verificar que action=public NO devuelve listaM/G/F ni existencias

### Fase 2 — Asignar PINs a usuarios existentes (variable)
1. Ejecutar `setUserPin("phone", "pin")` para cada usuario activo
2. Notificar a cada usuario su PIN por WhatsApp/Bitrix
3. Los usuarios sin PIN solo ven datos publicos (action=public)

### Fase 3 — Migrar frontend (30 min)
1. Actualizar equipos/index.html + accesorios/index.html
2. Agregar campo PIN al formulario de login
3. Cambiar localStorage → sessionStorage
4. Cambiar APPS_SCRIPT_URL a la URL del nuevo deployment V2
5. Eliminar la constante TOKEN del HTML (ya no se necesita)
6. Deploy a main

### Fase 4 — Retirar endpoint V1 INSEGURO (CRITICO — 10 min)
**IMPORTANTE: Si no se completa esta fase, la proteccion es nula.**
El endpoint V1 sigue entregando listaM/G/F + existencias a cualquiera.
1. En Apps Script productivo: archivar/eliminar el deployment V1
   (Manage deployments → seleccionar el deployment actual → Archive)
2. Verificar que la URL V1 ya no responde con datos
3. Buscar en TODO el frontend que ninguna pagina use la URL V1
4. Verificar index.html (landing), equipos, accesorios, menu
5. Buscar la URL V1 en Google (site:celulink.mx + cache)
6. Documentar SHA del commit final y URL nueva

**Nota sobre accesorios**: El endpoint de accesorios tambien requiere
la misma migracion. Actualmente expone 79 productos con todas las
listas y stock. Necesita su propio script V2 con la misma proteccion.

## 6. Pruebas

### Acceso anonimo
- `GET ?action=public` → solo datos publicos, sin listaM/G/F ni existencias
- `GET ?action=catalog` sin session → error NO_SESSION
- `GET ?action=catalog&sessionId=fake` → error INVALID_SESSION

### Acceso autorizado
- Login con PIN correcto → recibe sessionId
- `GET ?action=catalog&sessionId=valid` → datos filtrados segun lista
- Usuario con lista "F" no recibe listaM ni listaG

### Rate limiting
- 5 intentos fallidos → bloqueo 15 min

## 7. Reversion

| Paso | Accion | Tiempo |
|------|--------|--------|
| 1 | Reactivar deployment anterior | < 1 min |
| 2 | git revert del commit de frontend | < 2 min |
| 3 | Push a main + GitHub Pages | < 5 min |
| **Total** | | **< 10 min** |

## 8. Autorizacion necesaria

1. ~~Decision: PIN de 4 o 6 digitos~~ → **6 digitos (decidido)**
2. ~~Acceso desde clasp~~ → **Disponible (OAuth activo)**
3. Autorizar creacion de hoja de prueba con datos ficticios
4. Autorizar deployment de prueba aislado (no toca produccion)
5. Conteo de usuarios activos por lista (para planificar notificacion)
6. Canal para comunicar PINs (WhatsApp/Bitrix)
7. Ventana para Fase 3+4 (~45 min, requiere retiro simultaneo de V1)

## 9. Estado actual de la exposicion

Verificado 2026-10-13:

| Endpoint | Productos | listaM | listaG | listaF | Stock | Token en HTML |
|----------|-----------|--------|--------|--------|-------|---------------|
| Equipos V1 | 1,194 | 1,193 | 1,193 | 1,193 | 1,185 | Si |
| Accesorios V1 | 79 | 79 | 79 | 79 | 66 | Si |
| **Total expuesto** | **1,273** | **1,272** | **1,272** | **1,272** | **1,251** | |

Cualquier visitante puede obtener TODOS los precios mayoristas y stock
exacto por almacen con una sola peticion HTTP usando el token que esta
en el codigo fuente publico de la pagina.

## 10. Seguridad del almacenamiento de PIN

### Modelo de amenaza
- **Fuerza bruta online**: Mitigada por rate limiting (5 intentos / 15 min)
- **Fuerza bruta offline** (si atacante obtiene la hoja): Cada PIN
  tiene sal unica → no se pueden usar tablas precalculadas. Pero un PIN
  de 6 digitos (1M combinaciones) con HMAC-SHA256 se puede forzar en
  ~1 segundo por usuario con hardware moderno.
- **Mitigacion**: La proteccion principal es el rate limiting online +
  seguridad de acceso a la hoja de Google. Si se requiere proteccion
  offline mas fuerte, migrar a Firebase Auth o Auth0.

### Por que no bcrypt/scrypt/PBKDF2
Apps Script no ofrece estas funciones. Las alternativas son:
1. HMAC-SHA256 con sal (implementado) — maximo posible en Apps Script
2. Firebase Auth — proteccion completa pero requiere migracion mayor
3. Auth0 — mismo caso

La decision actual (HMAC + sal + rate limiting) es el mejor balance
entre seguridad y viabilidad para el entorno Apps Script.
