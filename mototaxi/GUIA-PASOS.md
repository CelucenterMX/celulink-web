# 🏍️ MotoTaxi Tamazula — Guía de Despliegue

> **Estado actual (31-jul-2026):** ✅ Desplegado y funcional
> Web app: https://celulink.mx/mototaxi/
> Apps Script: `13_a8JgfBCMaQdg5qvBsgo2ZgcFBALQtn_-cdLUnvfkqeBfDD2K1Rupbz`

---

## TL;DR — Si necesitas re-desplegar

```bash
# 1. Subir código al Apps Script
python3 ~/clawd/proyectos/mototaxi-tamazula/fix-apps-script.py

# 2. Crear nueva versión
cd ~/clawd/proyectos/mototaxi-tamazula
clasp version

# 3. ⚠️ NO re-deployes con clasp — rompe el "tipo" del deployment
#    En vez de eso, haz el deploy desde la UI:
#    Apps Script → Implementar → Nueva implementación → Aplicación web
#    Copia la URL /exec

# 4. Actualizar index.html con la nueva URL
~/clawd/proyectos/mototaxi-tamazula/deploy-script.sh "URL/exec"
```

---

## Historia del deploy (lo que pasó)

### Setup inicial

1. **Proyecto Apps Script** creado con `clasp create` → ID `13_a8JgfBCMaQdg5qvBsgo2ZgcFBALQtn_-cdLUnvfkqeBfDD2K1Rupbz`
2. **Código subido** con `fix-apps-script.py` (script que limpia el proyecto: solo deja Code.gs y appsscript.json, ignora index.html/sw.js)
3. **Deploy inicial desde la UI** (Implementar → Nueva implementación → Aplicación web)
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona**
   - URL generada: `https://script.google.com/macros/s/AKfycbyx3xigwO2ocZqLU0XZcY07fu9MaZstyeVaNAq-hpAaCBe-Dtr7BUIOpt9kwz3O0yd4jg/exec`

### Bugs encontrados y arreglados

**Bug 1: `HtmlService.MimeType.JSON` no existe en runtime V8**
- Síntoma: `TypeError: Cannot read properties of undefined (reading 'JSON') (línea 71, archivo "Code")`
- Fix: Usar `ContentService.MimeType.JSON` con `ContentService.createTextOutput()`
- Esto es el patrón estándar moderno para `doPost` en Apps Script

**Bug 2: Re-deploy con clasp rompía el tipo del deployment**
- Síntoma: 401 "No se pudo abrir el archivo en este momento" después de `clasp deploy`
- Causa: Cuando Cris hizo el primer deploy desde la UI, el deployment se creó como "Web App". Cuando intenté re-deployar con `clasp deploy -i <deploymentId> -V <version>`, clasp convirtió el deployment a "API Executable" (porque clasp no sabe que es Web App)
- Fix: Hacer todos los deploys desde la UI de Apps Script. clasp solo se usa para subir código y crear versiones.

**Bug 3: `clasp push` subía archivos que no son GAS (sw.js, index.html)**
- Causa: `clasp push` por defecto sube todo el directorio, incluyendo archivos del frontend
- Resultado: Apps Script intentaba ejecutar `sw.js` como código GAS → `ReferenceError: self is not defined`
- Fix: `fix-apps-script.py` usa `PUT /content` con solo Code.gs y appsscript.json

**Bug 4: `ignoreFiles` en `.clasp.json` no funciona con `--force`**
- Sintoma: `clasp push --force` ignora la lista de ignoreFiles
- Solución: No usar `--force`, usar el script Python directamente

---

## Estructura de archivos

```
~/clawd/proyectos/mototaxi-tamazula/
├── index.html       ← Web app (frontend)
├── manifest.json    ← PWA
├── sw.js           ← Service Worker (NO se sube al Apps Script)
├── Code.gs         ← Backend (Apps Script)
├── appsscript.json ← Config Apps Script
├── .clasp.json     ← Config clasp
├── fix-apps-script.py ← Script para subir código limpio al Apps Script
├── deploy-script.sh ← Script para actualizar URL en index.html y push GitHub
├── SPEC.md
├── README.md
└── GUIA-PASOS.md   ← Esta guía
```

## Configuración de credenciales

### Sin credenciales (modo debug)

Si no tienes Wazzup ni Bitrix24, deja las constantes vacías. El sistema **loguea** los mensajes en Apps Script pero **no los manda a WhatsApp**.

Para ver los mensajes:
1. Apps Script → **Ejecuciones** (menú izquierdo)
2. Click en la ejecución más reciente de `doPost`
3. Verás el mensaje que se habría enviado

### Con Wazzup

Edita `Code.gs` y rellena:
```javascript
const WAZZUP_API_KEY = 'tu_api_key_de_wazzup';
```

### Con Bitrix24

Edita `Code.gs` y rellena:
```javascript
const BITRIX_WEBHOOK_URL = 'https://tu-dominio.bitrix24.com/rest/1/tu-webhook/';
const BITRIX_CHAT_ID = 'id_del_chat';
```

---

## Próximos pasos pendientes

- [ ] Crear canal de WhatsApp Business "MotoTaxi Tamazula"
- [ ] Conectar el canal a Wazzup o Bitrix24
- [ ] (Opcional) Crear Google Sheet para historial de solicitudes
  - Apps Script → agregar `SpreadsheetApp.getActiveSpreadsheet()` requiere un spreadsheet asociado

---

## URLs importantes

| Recurso | URL |
|---------|-----|
| Web app live | https://celulink.mx/mototaxi/ |
| Apps Script editor | https://script.google.com/home/projects/13_a8JgfBCMaQdg5qvBsgo2ZgcFBALQtn_-cdLUnvfkqeBfDD2K1Rupbz/edit |
| Apps Script executions | https://script.google.com/home/projects/13_a8JgfBCMaQdg5qvBsgo2ZgcFBALQtn_-cdLUnvfkqeBfDD2K1Rupbz/executions |
| Repo GitHub | https://github.com/CelucenterMX/celulink-web |