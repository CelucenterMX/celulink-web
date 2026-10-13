# Proteccion de Endpoints — Diseno Tecnico Implementable

Fecha: 2026-10-13
Estado: Diseno tecnico — codigo de prueba incluido, NO desplegado

---

## 1. Problema actual

### Equipos
- Endpoint: Apps Script desplegado como Web App (acceso: Anyone)
- Token hardcodeado en HTML: visible en codigo fuente publico
- `action=catalog` devuelve TODOS los campos a cualquier request con el token
- Campos expuestos: `listaM`, `listaG`, `listaF`, `existencias` (cantidad exacta por almacen)

### Accesorios
- Mismo patron: token visible, endpoint abierto
- Devuelve `listaM`, `listaG`, `listaF`, `lista2x`, `precioPublico`, existencias

### Impacto
- Competidores pueden ver costos y margenes de CeluCenter
- Stock exacto por almacen revela capacidad logistica
- No existe control server-side real — el token es equivalente a acceso anonimo

---

## 2. Arquitectura de proteccion

### Principio: dos niveles de acceso en el mismo endpoint

```
Visitante anonimo  ──→  action=public   ──→  datos publicos unicamente
Usuario registrado ──→  action=catalog  ──→  datos segun lista asignada
                         + sessionId
```

### Datos por nivel

| Campo | public | catalog (segun lista) |
|-------|--------|-----------------------|
| codigo | Si | Si |
| producto | Si | Si |
| nombreCategoria | Si | Si |
| categoria | Si | Si |
| precioPublico | Si | Si |
| disponible (boolean) | Si | Si |
| existencias (cantidad) | No | Si |
| listaF | No | Solo si lista >= F |
| listaG | No | Solo si lista >= G |
| listaM | No | Solo si lista >= M |
| lista2x | No | Solo si lista >= 2X |
| telmovPay | Si | Si |
| payjoy | Si | Si |
| almacen | Si | Si |

### Autenticacion: session token server-side

```
1. Usuario envia telefono (10 digitos)
2. Apps Script busca en hoja "Registro"
3. Si existe y tiene lista asignada:
   - Genera UUID + timestamp
   - Almacena en hoja "Sesiones" con TTL 24h
   - Devuelve sessionId al frontend
4. Frontend guarda sessionId en sessionStorage
5. Cada request a action=catalog incluye sessionId
6. Apps Script valida sessionId en cada request:
   - Existe en "Sesiones"?
   - No ha expirado?
   - Extrae telefono → busca lista asignada
   - Filtra campos segun lista
```

### Por que NO funcionan las alternativas simples

| Alternativa | Por que no sirve |
|-------------|------------------|
| Cambiar el token | Sigue visible en HTML, solo retrasa el acceso |
| CORS | Apps Script no permite configurar CORS personalizado |
| localStorage / sessionStorage | Son client-side, no protegen el endpoint |
| Parametro URL secreto | Visible en codigo fuente y logs |
| Verificar Referer/Origin | Facilmente falsificable con curl |

---

## 3. Archivos y servicios afectados

| Componente | Cambio requerido |
|------------|------------------|
| Apps Script equipos | Agregar `action=public`, session tokens, filtrado por lista |
| Apps Script accesorios | Mismos cambios |
| `catalogos/equipos/index.html` | Usar `action=public` para carga inicial; `action=catalog` post-login |
| `catalogos/accesorios/index.html` | Usar `action=public` para carga inicial; `action=catalog` post-login |
| `index.html` (landing) | Cambiar a `action=public` para precios del escaparate |
| Hoja de calculo | Agregar pestana "Sesiones" |

---

## 4. Codigo de prueba — Apps Script

Ver archivo: `docs/equipos_apps_script_v2_draft.gs`

Cambios respecto al actual:
- Nueva funcion `getPublicCatalog()` — devuelve solo datos publicos
- Nueva funcion `getAuthorizedCatalog(phone)` — filtra por lista asignada
- Funciones `generateSessionToken()` / `validateSession()` / `cleanExpiredSessions()`
- `doGet` rutea `action=public` vs `action=catalog` con validacion
- Trigger temporal para limpiar sesiones expiradas

---

## 5. Cambios en frontend

### Equipos (`catalogos/equipos/index.html`)

```javascript
// ANTES (actual):
const url = `${APPS_SCRIPT_URL}?token=${TOKEN}&action=catalog`;

// DESPUES:
// Carga inicial — solo datos publicos
const url = `${APPS_SCRIPT_URL}?token=${TOKEN}&action=public`;

// Post-login — datos completos segun lista
const sessionId = sessionStorage.getItem('celulink_session');
const url = `${APPS_SCRIPT_URL}?token=${TOKEN}&action=catalog&sessionId=${sessionId}`;
```

### Landing (`index.html`)

```javascript
// ANTES:
const r = await fetch(ep.url + '?action=catalog&token=' + ...);

// DESPUES:
const r = await fetch(ep.url + '?action=public&token=' + ...);
```

### Login flow

```javascript
// ANTES: login solo verifica existencia
// DESPUES: login devuelve sessionId

async function handleLogin() {
    const phone = document.getElementById('loginPhone').value;
    const resp = await fetch(`${URL}?action=login&token=${TOKEN}&phone=${phone}`);
    const data = await resp.json();
    if (data.exists && data.sessionId) {
        sessionStorage.setItem('celulink_session', data.sessionId);
        // Recargar catalogo con datos completos
        await fetchProducts(); // ahora usa sessionId
    }
}
```

---

## 6. Plan de migracion sin interrupcion

### Fase 0 — Preparacion (sin impacto en produccion)
1. Crear codigo v2 del Apps Script
2. Probar como deployment separado (URL de prueba)
3. Verificar que `action=public` devuelve solo datos publicos
4. Verificar que `action=catalog` sin session valida devuelve error
5. Verificar que `action=catalog` con session valida devuelve datos correctos

### Fase 1 — Deploy paralelo
1. Crear NUEVO deployment del Apps Script (no reemplazar el actual)
2. Actualizar frontend en rama para usar nueva URL
3. Probar catálogo completo: carga, búsqueda, filtros, carrito
4. El endpoint antiguo sigue activo como respaldo

### Fase 2 — Activar en produccion
1. Merge del frontend actualizado a main
2. Verificar funcionamiento 24-48h
3. Monitorear errores en Apps Script (Stackdriver logs)

### Fase 3 — Invalidar acceso anterior
1. Cambiar el token del endpoint antiguo (invalida cualquier copia cacheada)
2. Retirar el deployment antiguo de Apps Script
3. El token nuevo solo funciona con action=public (sin session)

### Fase 4 — Limpieza
1. Configurar trigger de limpieza de sesiones (cada 6h)
2. Verificar que no hay acceso residual al endpoint antiguo

---

## 7. Pruebas requeridas

### Acceso anonimo (post-migracion)
```bash
# Debe devolver solo datos publicos
curl "URL?action=public&token=XXX"
# Verificar: NO contiene listaM, listaG, listaF, existencias (numero)
# Verificar: SI contiene codigo, producto, precioPublico, disponible (boolean)

# Debe fallar sin session
curl "URL?action=catalog&token=XXX"
# Verificar: devuelve {error: "Sesion requerida"}

# Session invalida
curl "URL?action=catalog&token=XXX&sessionId=inventado"
# Verificar: devuelve {error: "Sesion invalida o expirada"}
```

### Acceso autorizado
```bash
# Login con telefono registrado
curl "URL?action=login&token=XXX&phone=3321234567"
# Verificar: devuelve {exists: true, sessionId: "uuid-xxx", lista: "F"}

# Catalog con session valida
curl "URL?action=catalog&token=XXX&sessionId=uuid-xxx"
# Verificar: devuelve datos filtrados segun lista del usuario
# Si lista="F": solo listaF, NO listaM ni listaG
```

### Regresion
- Catalogo publico carga y muestra precioPublico correctamente
- Disponibilidad muestra Si/No (no cantidad exacta)
- Carrito funciona con precios de la lista del usuario post-login
- Landing page muestra precios del escaparate
- Busqueda y filtros sin cambios
- Login/registro sin cambios funcionales

---

## 8. Procedimiento de reversion

| Paso | Accion | Tiempo |
|------|--------|--------|
| 1 | Reactivar deployment anterior del Apps Script | < 1 min |
| 2 | Revertir commit de frontend (git revert) | < 2 min |
| 3 | Push a main | < 1 min |
| 4 | GitHub Pages actualiza automaticamente | < 5 min |
| **Total** | | **< 10 min** |

El frontend anterior es compatible con la respuesta completa del endpoint
antiguo, por lo que revertir el frontend es suficiente.

---

## 9. Autorizacion necesaria para desplegar

1. **Acceso al proyecto Apps Script de equipos** para crear nuevo deployment
2. **Acceso al proyecto Apps Script de accesorios** para crear nuevo deployment
3. **Acceso a la hoja de calculo** para agregar pestana "Sesiones"
4. **Permiso para merge a main** en el repositorio GitHub
5. **Ventana de mantenimiento** de ~30 min para Fase 2
6. **Persona de respaldo** con acceso a Apps Script para reversion
