# Plan de Migración V1 → V2 — Equipos y Accesorios

Fecha: 2026-10-13
Estado: Pendiente de autorización

---

## 1. Estado actual

### Endpoints V1 (INSEGUROS — activos)

| Endpoint | URL | Token | Expone |
|----------|-----|-------|--------|
| Equipos | `AKfycbzzS-Mc4Y...` | `CELUCENTER_EQUIPOS_2026` | 1,194 productos con listaM/G/F + existencias |
| Accesorios | `AKfycbyIMh3or...` | `CELUCENTER_SECURE_2025` | 79 productos con listaM/G/F/2x + existencias |

Ambos tokens están en el HTML público. Cualquier visitante obtiene todos los datos.

### Endpoints V2 (probados en entorno aislado)

| Endpoint | Tests | Estado |
|----------|-------|--------|
| Equipos V2 | 25/25 PASS | Listo para producción |
| Accesorios V2 | Pendiente autorización OAuth | Código listo, falta probar |

### Páginas que consumen V1

| Archivo | Endpoint | Acciones |
|---------|----------|----------|
| `catalogos/equipos/index.html` | Equipos V1 | catalog, login, register |
| `catalogos/accesorios/index.html` | Accesorios V1 | catalog, login, register |
| `catalogos/accesorios/detalle.html` | Accesorios V1 | catalog, register |
| `index.html` (landing) | Ambos V1 | catalog (solo precios públicos para preview) |

---

## 2. Cambios del frontend

### 2.1 Equipos — `catalogos/equipos/index.html`

**Eliminar:**
- Línea 639: `const TOKEN = 'CELUCENTER_EQUIPOS_2026';`

**Cambiar:**
- Línea 638: `APPS_SCRIPT_URL` → URL del deployment V2

**Modificar función `handleLogin()` (línea ~678):**
```javascript
// ANTES (V1): login solo con teléfono
const res = await fetch(`${APPS_SCRIPT_URL}?action=login&token=${TOKEN}&phone=...`);

// DESPUÉS (V2): login con teléfono + PIN
const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'login', phone, pin })
});
const data = await res.json();
if (data.success) {
    sessionStorage.setItem('celulink_session', data.sessionId);
    // ... cargar catálogo autorizado
}
```

**Agregar campo PIN al formulario de login:**
```html
<div class="form-group">
    <label>PIN de acceso</label>
    <input type="password" id="loginPin" maxlength="6" inputmode="numeric"
           pattern="[0-9]*" placeholder="6 dígitos">
</div>
```

**Cambiar `fetchProducts()` (línea ~758):**
```javascript
// ANTES: fetch con token
const res = await fetch(`${APPS_SCRIPT_URL}?action=catalog&token=${TOKEN}`);

// DESPUÉS: dos modos
// Anónimo → datos públicos
const res = await fetch(`${APPS_SCRIPT_URL}?action=public`);

// Autenticado → datos completos según lista
const sid = sessionStorage.getItem('celulink_session');
const res = await fetch(`${APPS_SCRIPT_URL}?action=catalog&sessionId=${sid}`);
```

**Cambiar `localStorage` → `sessionStorage`:**
- Líneas 686, 704, 708, 716, 723, 728, 742: reemplazar todas las referencias
- `celucenter_session` ya no guarda `{phone, email, lista}` sino solo el `sessionId`
- El carrito (`celu_equipos_cart`) puede quedarse en localStorage

**Agregar botón de logout:**
```javascript
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

### 2.2 Accesorios — `catalogos/accesorios/index.html`

Mismos cambios que equipos, adaptados a la estructura de accesorios:
- Línea 1559: cambiar `APPS_SCRIPT_URL` a URL V2 de accesorios
- Línea 1560: eliminar `TOKEN`
- Líneas ~1593-1613: `localStorage` → `sessionStorage`
- Líneas ~1642, 1715, 1767, 1804: cambiar fetches a nuevo esquema
- Agregar campo PIN al formulario de login
- Agregar logout

### 2.3 Accesorios detalle — `catalogos/accesorios/detalle.html`

- Línea 1021: cambiar `APPS_SCRIPT_URL`
- Línea 1022: eliminar `TOKEN`
- Línea 1116: fetch catalogo → `action=public` o `action=catalog&sessionId=`

### 2.4 Landing — `index.html`

- Línea 386-387: ambas URLs y tokens → URLs V2 con `action=public`
- El landing solo muestra precios públicos, no requiere autenticación

---

## 3. Migración de usuarios

### 3.1 Asignación de PINs

**Procedimiento por usuario:**
1. Admin ejecuta `setUserPin("teléfono", "PIN")` en el editor de Apps Script
2. La función genera PBKDF2 hash y lo guarda en la columna PIN_hash
3. Admin comunica el PIN al usuario por WhatsApp directo (no grupo)
4. El PIN NO aparece en logs, URLs ni código

**Mensaje tipo (WhatsApp individual):**
```
Hola [nombre], actualizamos el catálogo de Celucenter.
Ahora necesitas un PIN para ver precios mayoristas.
Tu PIN: [xxxxxx]
Entra en celulink.mx/catalogos/equipos → Iniciar sesión → tu teléfono + PIN.
Si tienes problemas, escríbeme.
```

### 3.2 Restablecimiento de PIN

Si un usuario olvida su PIN:
1. Admin ejecuta `setUserPin("teléfono", "nuevoPIN")` en Apps Script
2. El hash anterior se sobreescribe
3. Admin comunica nuevo PIN por WhatsApp directo

### 3.3 Revocación de acceso

Para revocar acceso a un usuario:
1. Borrar la celda PIN_hash del usuario en la hoja Registro
2. Sin PIN_hash, el login falla automáticamente
3. Las sesiones activas expiran en max 24h (o se pueden borrar manualmente de la hoja Sesiones)

### 3.4 Orden de activación

1. Empezar con 1-2 usuarios de confianza (prueba piloto)
2. Verificar que pueden hacer login y ver sus precios correctamente
3. Expandir al resto de usuarios
4. Los usuarios sin PIN ven solo datos públicos (catálogo funcional pero sin precios mayoristas)

---

## 4. Retiro de V1

### Pre-requisitos
- [ ] V2 de equipos y accesorios desplegados y funcionando
- [ ] Frontend actualizado con URLs V2
- [ ] Al menos 1 usuario piloto confirmó acceso correcto
- [ ] Commit del frontend pusheado a main

### Procedimiento (ventana de ~15 min)

**Paso 1: Archivar deployments V1 (2 min)**
1. Abrir Apps Script de equipos productivo
2. Deploy > Manage deployments
3. Seleccionar el deployment activo (el que tiene la URL `AKfycbzzS-Mc4Y...`)
4. Click en Archive
5. Repetir para el Apps Script de accesorios (`AKfycbyIMh3or...`)

**Paso 2: Verificar que V1 ya no responde (2 min)**
```
curl "https://script.google.com/macros/s/AKfycbzzS-Mc4Y.../exec?token=CELUCENTER_EQUIPOS_2026&action=catalog"
# Debe devolver error o 404, NO datos de productos

curl "https://script.google.com/macros/s/AKfycbyIMh3or.../exec?token=CELUCENTER_SECURE_2025&action=catalog"
# Idem
```

**Paso 3: Verificar frontend (5 min)**
1. Abrir https://celulink.mx/catalogos/equipos/ — debe cargar catálogo público
2. Login con usuario piloto — debe ver precios según su lista
3. Abrir https://celulink.mx/catalogos/accesorios/ — idem
4. Abrir https://celulink.mx/ — landing debe cargar precios públicos
5. Verificar que `detalle.html` funciona

**Paso 4: Buscar URLs residuales (5 min)**
1. `grep -r "AKfycbzzS-Mc4Y" .` — no debe encontrar nada en el código actual
2. `grep -r "AKfycbyIMh3or" .` — idem
3. `grep -r "CELUCENTER_EQUIPOS_2026" .` — solo en el gs de referencia
4. `grep -r "CELUCENTER_SECURE_2025" .` — idem
5. Google: `site:celulink.mx "AKfycbzzS"` — verificar caché

### Reversión (< 5 min)
Si algo falla después del retiro:
1. En Apps Script > Manage deployments > restaurar el deployment archivado
2. `git revert HEAD` en el repo (revierte cambios de frontend)
3. `git push origin main` → GitHub Pages redeploya con URLs V1
4. Los tokens V1 vuelven a funcionar inmediatamente

**IMPORTANTE:** La reversión re-expone los datos mayoristas. Solo usar como último recurso.

---

## 5. Pruebas de aceptación (antes de autorizar migración)

| # | Prueba | Criterio |
|---|--------|----------|
| 1 | Visitante anónimo ve catálogo | Solo precioPublico y disponible (bool) |
| 2 | Login con PIN correcto | Recibe sessionId, ve listas según nivel |
| 3 | Usuario M ve listaM/G/F | Todas las listas + existencias |
| 4 | Usuario F ve solo listaF | NO ve listaM ni listaG |
| 5 | Usuario 2X ve solo lista2x | Solo en accesorios |
| 6 | PIN incorrecto 5 veces | Bloqueo 15 min |
| 7 | Logout | Sesión invalidada inmediatamente |
| 8 | URL V1 archivada | No devuelve datos |
| 9 | Landing carga sin token | Precios públicos visibles |
| 10 | Detalle accesorios funciona | Página de detalle carga correctamente |

---

## 6. Limpieza de seguridad (pre-producción)

### En el código V2 de producción:
- [ ] Eliminar `action=diag` del routing
- [ ] Eliminar `action=resettest` del routing
- [ ] Eliminar campos `_debug` de todas las respuestas
- [ ] Eliminar función `setup()` (solo para entorno de prueba)
- [ ] Verificar que `setUserPin()` no imprime el PIN en logs (solo confirma éxito)
- [ ] PBKDF2: 10,000 iteraciones (verificar que no exceda timeout de 30s en producción)

### En el frontend:
- [ ] Eliminar constante `TOKEN` de todos los HTML
- [ ] Cambiar `localStorage` → `sessionStorage` para datos de sesión
- [ ] Verificar que `sessionId` no aparece en URLs visibles (solo en query params de fetch)
- [ ] No imprimir `sessionId` en console.log

### Permisos de la hoja:
- [ ] Solo el owner tiene acceso de edición a la hoja productiva
- [ ] Verificar que compartir con editores adicionales está desactivado

---

## 7. Decisiones pendientes

| # | Decisión | Impacto |
|---|----------|---------|
| 1 | ¿Equipos y accesorios comparten hoja de Registro? | Si comparten: un solo login para ambos. Si no: PINs separados. |
| 2 | ¿Qué pasa con detalle.html de accesorios? | Necesita migrar al mismo esquema V2. |
| 3 | ¿El landing necesita precios mayoristas? | Actualmente usa V1 con token. V2 solo mostraría precioPublico. |
| 4 | ¿Hay más consumidores de la API V1? | El panel de resumen (key=cris) también usa la URL de accesorios. |
| 5 | ¿Mantener registro abierto? | V2 soporta action=register pero sin PIN. El admin debe activar después. |

---

## 8. Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Usuario no recibe/pierde PIN | Media | Procedimiento de restablecimiento documentado |
| Usuario confundido por campo PIN | Baja | Mensaje claro en el formulario |
| Apps Script timeout con PBKDF2 | Baja | 10K iteraciones ~5s, bien dentro del límite de 30s |
| Sesión compartida entre equipos/accesorios | Depende decisión #1 | Documentar comportamiento esperado |
| Caché de Google sirve URL V1 archivada | Muy baja | La URL devuelve error, no datos |
