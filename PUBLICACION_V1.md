# Procedimiento de publicación y rollback · Celulink V1

> **Estado:** V1 **PENDIENTE DE REVISIÓN DEL USUARIO (Cris)**. No se considera aprobada ni rechazada hasta visto bueno explícito tras revisar capturas actuales y vista previa en `http://localhost:8765/`.
> Sin commit/push/merge hasta entonces.
> **Última actualización:** 2026-10-12

---

## Estado actual

| Item | Estado |
|---|---|
| Rama de trabajo | `feature/redesign-2026` |
| Último commit en `main` | `c9db1a1a754f18023de5cd2cf892141a7e132572` (pre-cambios) |
| Archivos modificados en rama | 5 HTMLs + 5 imágenes + 2 CSS nuevos |
| Commits en rama | 0 (cambios sin commit) |
| Push | NO realizado |
| Producción (`https://celulink.mx/`) | INTACTA |

---

## 1. Antes de publicar

### Política vigente confirmada
- **Cotización pública sin login**: precios por volumen visibles para todos sin autenticación.
- **Bodegas invisibles en UI pública** (filtro de almacén ocultado al cliente, Oct 2026).
- **Login opcional**: disponible solo para funciones avanzadas (historial, guardar pedidos). No bloquea ni exige registro.
- **Filtro BM de equipos** se conserva por ahora.

### 1.1 Pruebas que requieren Cris (no automatizables)
Estas pruebas se ejecutan en `http://localhost:8765/`:

- [ ] **Búsqueda de productos** en ambos catálogos
- [ ] **Filtros de marca y precio** en equipos
- [ ] **Filtros de categoría** en accesorios (almacén NO visible al cliente)
- [ ] **Carrito y pedido por WhatsApp** — verificar que el mensaje se genera correctamente
- [ ] **Aumento de volumen y cambio de lista** (2X / F / G / M) — verificar umbrales
- [ ] **CTA "📲 Cotizar"** del header abre WhatsApp con texto prellenado
- [ ] **Responsive** en iPhone / iPad / Android (no en headless)
- [ ] **Comparativa visual** con `https://celulink.mx/` en producción

### 1.2 Pruebas ya verificadas automáticamente
- [x] 3 páginas cargan HTTP 200 (`/`, `/catalogos/equipos/`, `/catalogos/accesorios/`)
- [x] Apps Script URLs preservados
- [x] Funciones JS críticas intactas (`handleLogin`, `filterProducts`, `refreshSessionUI`, `logout`)
- [x] `index-samsung.html` **eliminado** del repo activo (2026-10-12, autorizado por Cris). Backup conservado en `/tmp/celulink-samsung-backup/`. Recursos compartidos (CSS, logo, icono) se mantienen porque los usan las páginas vigentes.
- [x] **Regresión de login corregida** (2026-10-12): header `index.html` accesorios ya no exige registro. Botón "Registrate para ver precios" reemplazado por `📲 Cotizar` (enlace directo a WhatsApp). Modales y mensajes cambiaron su copy.
- [x] **Overflow mobile corregido** (2026-10-12): `clk-nav` ahora oculta `nav-links` y search-input en mobile (≤640px); body con `overflow-x: hidden` evita scroll horizontal.
- [x] Imágenes reales (Xiaomi, Infinix, Samsung, BLU) verificadas
- [x] `chrome.css`, `home.css`, `tokens.css` cargan sin errores 404
- [x] HTML balanceado (sin etiquetas mal cerradas)
- [x] CSS con llaves balanceadas

---

## 2. Procedimiento de publicación

### Paso 1: Commit local (no requiere push)
```bash
cd ~/clawd/repos/celulink-web

# Verificar que no hay cambios sin agregar
git status -s

# Agregar todo
git add index.html \
        assets/css/tokens.css \
        assets/css/chrome.css \
        assets/css/home.css \
        assets/xiaomi-redmi-15c-frente.png \
        assets/infinix-smart-20-frente.png \
        assets/samsung-a17-frente.png \
        assets/samsung-a17-atras.png \
        assets/blu-g75-frente.png \
        catalogos/equipos/index.html \
        catalogos/accesorios/index.html \
        catalogos/accesorios/detalle.html \
        MEJORAS_V1.1.md \
        PUBLICACION_V1.md

# Verificar que `detalle.html` no tiene cambios que no quieras subir
git diff --staged -- catalogos/accesorios/detalle.html

# Commit
git commit -m "feat: rediseño 2026 V1 — paleta v2.1, header unificado, hero premium con foto real

- Home: hero con smartphone Xiaomi real, strip de confianza,
  escaparate de 4 smartphones, categorías visuales, marcas, sucursales, footer premium.
- Catálogos: header clk-nav + catalog-header con gradiente v2.1,
  preservando login, filtros, carrito, Apps Script, JS intacto.
- Imágenes reales del STX (Xiaomi 15C, Infinix Smart 20, Samsung A17, BLU G75).
- chrome.css / home.css / tokens.css separados por concern.
- MEJORAS_V1.1.md con backlog visual.
- PUBLICACION_V1.md con procedimiento de rollback."
```

### Paso 2: Push a GitHub (requiere autorización explícita)
```bash
git push origin feature/redesign-2026
```

### Paso 3: Pull Request en GitHub
- URL: `https://github.com/CelucenterMX/celulink-web/pull/new/feature/redesign-2026`
- Título: "feat: rediseño 2026 V1"
- Descripción: pegar el cuerpo del commit
- Reviewer: Cris

### Paso 4: Merge a `main` (una vez aprobado)
**Opción A — Merge via GitHub UI:**
- "Squash and merge" (recomendado para mantener historia limpia)
- O "Create a merge commit" (preserva el branch completo)

**Opción B — Merge local:**
```bash
git checkout main
git pull
git merge --no-ff feature/redesign-2026
git push origin main
```

### Paso 5: GitHub Pages publica automáticamente
- Tiempo de propagación: **1-3 minutos** después del push a `main`.
- URL: `https://celulink.mx/` se actualiza sola.

---

## 3. Procedimiento de rollback

### Opción A — Rollback via `git revert` (RECOMENDADO)
Mantiene la historia limpia. Crea un commit que deshace los cambios.

```bash
cd ~/clawd/repos/celulink-web

# Ver el log para encontrar el commit del merge
git log --oneline -5

# Identifica el hash del merge o del commit directo
# Si fue merge commit:
git revert -m 1 <hash-del-merge-commit>

# Si fue commit directo (squash merge):
git revert <hash-del-commit>

# Push del revert
git push origin main
```

**Resultado:** GitHub Pages publica la versión anterior en 1-3 minutos. La historia de git queda limpia.

### Opción B — Rollback via reset (DESTRUCTIVO, último recurso)
Borra la historia. Solo usar si Opción A no funciona.

```bash
cd ~/clawd/repos/celulink-web

# Identifica el último commit bueno
git log --oneline -10

# Reset duro al commit anterior al rediseño
git reset --hard c9db1a1a754f18023de5cd2cf892141a7e132572

# Force push
git push origin main --force
```

⚠️ **ADVERTENCIA:** `--force` sobrescribe el historial remoto. Otros colaboradores podrían perder commits. **Solo usar si no hay otra opción.**

### Opción C — Rollback via GitHub UI (sin tocar local)
1. Ir a `https://github.com/CelucenterMX/celulink-web/settings/pages`
2. En "Source", cambiar el branch a un commit anterior al rediseño
3. GitHub Pages publica la versión anterior en 1-3 minutos

---

## 4. Backup de seguridad

### Backup completo pre-cambio (ya generado)
- **Ubicación:** `~/clawd/prototipos/celulink-web-backup-20261010-2214.tar.gz`
- **Tamaño:** 16.9 MB
- **Contenido:** estado exacto de `~/clawd/repos/celulink-web/` ANTES de cualquier cambio (rama `main@ c9db1a1a`)
- **Uso:** restaurar manualmente el estado pre-V1 si todo falla

### Para restaurar desde el backup (emergencia total)
```bash
cd ~/clawd
rm -rf celulink-web
tar xzf prototipos/celulink-web-backup-20261010-2214.tar.gz
cd celulink-web
git status  # debería estar en main limpio
```

---

## 5. Snapshot pre-push (opcional, recomendado)

Antes de hacer push de la rama, generar un snapshot local para comparar si hay problemas:

```bash
cd ~/clawd/prototipos
tar czf celulink-web-pre-push-$(date +%Y%m%d-%H%M).tar.gz \
    --exclude='.git' \
    -C ~/clawd/repos celulink-web
ls -la celulink-web-pre-push-*.tar.gz
```

Si después del push algo falla, puedes comparar con:
```bash
tar xzf celulink-web-pre-push-*.tar.gz -C /tmp/pre-push
diff -r /tmp/pre-push ~/clawd/repos/celulink-web
```

---

## 6. Verificación post-publicación

Una vez que GitHub Pages propague (1-3 minutos):

```bash
# Verificar que la home está publicada
curl -sI https://celulink.mx/ | head -5
curl -s https://celulink.mx/ | grep -E "clk-nav|hero-grid|home.css" | head -5

# Verificar que los catálogos cargan
curl -sI https://celulink.mx/catalogos/equipos/ | head -3
curl -sI https://celulink.mx/catalogos/accesorios/ | head -3
```

Visualmente, abrir en el navegador y confirmar:
- [ ] Hero con smartphone real
- [ ] Strip de confianza
- [ ] Escaparate con 4 cards
- [ ] Categorías visuales
- [ ] Marcas
- [ ] 28 tiendas en 4 estados
- [ ] Footer premium azul

---

*Documento de procedimiento mantenido por Main (Celu). Última actualización 2026-10-10.*
