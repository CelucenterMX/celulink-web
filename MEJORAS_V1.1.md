# Mejoras visuales pendientes · Celulink V1.1

> **Estado:** Lista de cambios visuales para la **V1.1**, planeados pero **NO** incluidos en V1.
> La V1 actual está aprobada y funcional.
> Este documento es solo de referencia; no requiere acción inmediata.

**Fecha de cierre V1:** 2026-10-10
**Rama de trabajo V1:** `feature/redesign-2026`
**Rama de trabajo V1.1:** por crear cuando se inicie

---

## 1. Fotografía

### 1.1 Hero — imagen principal del smartphone
- **Actual:** foto recortada con fondo transparente de Xiaomi Redmi 15C 128GB (azul), descargada del STX (pro_id 11858). Vista frontal.
- **Pendiente V1.1:** contratar/producir foto lifestyle mexicana con el smartphone en mano, persona sonriendo, fondo de tienda o ciudad. El STX solo tiene fotos de producto en blanco; hace falta foto de contexto.
- **Reemplazo:** `assets/xiaomi-redmi-15c-frente.png` por una foto lifestyle de mayor calidad.

### 1.2 Catálogo de equipos — fotos por SKU
- **Actual:** 4 fotos reales (Xiaomi, Infinix, Samsung, BLU). El resto del catálogo depende de `image_map.js` o Apps Script.
- **Pendiente V1.1:** auditar qué SKUs del STX tienen foto (`cam_per_imagen_frente`) y cuáles no. Para los que no tengan, decidir entre:
  - (a) foto lifestyle genérica con placeholder elegante
  - (b) foto de referencia con marca/modelo
  - (c) dejar solo el placeholder actual

### 1.3 Catálogo de accesorios — fotos por SKU
- **Actual:** la URL de accesorios apunta al repo externo `piztian/Accesorios-Celucenter/main/fotos/` (126 imágenes). Muchas funcionan, otras devuelven 404.
- **Pendiente V1.1:** pasar las imágenes a un hosting propio (no depender de un repo externo que puede cambiar). Auditar cuáles imágenes existen y cuáles no.

---

## 2. Marca

### 2.1 Logo Celulink standalone
- **Actual:** se usa el logo de Celucenter en header y footer, con la palabra "Celulink" como texto al lado.
- **Pendiente V1.1:** crear/contratar logo oficial de Celulink en formato horizontal y versión blanca para header. Hoy no existe como activo digital.

### 2.2 Logo blanco sobre fondos oscuros
- **Actual:** en `clk-catalog-header-left img` se aplica `filter: brightness(0) invert(1)` al logo de Celucenter para hacerlo blanco. Funciona visualmente pero no es la marca oficial.
- **Pendiente V1.1:** variante blanca real del logo de Celucenter (PNG/SVG transparente).

### 2.3 Logo de marcas en home
- **Actual:** chips de texto con el nombre de la marca (Samsung, Apple, Xiaomi, etc.) en escala de grises.
- **Pendiente V1.1:** versiones oficiales de los logos de marca (PNG/SVG) usados con permiso de "Distribuidor autorizado". Cuidar uso de marca de Apple, Samsung, etc.

---

## 3. Contenido del home

### 3.1 Sección "Marcas"
- **Actual:** 13 chips de texto (Samsung, Apple, Xiaomi, Motorola, Infinix, Honor, Oppo, ZTE, TCL, Hisense, BLU, Google, Realme).
- **Pendiente V1.1:** evaluar si incluir solo las marcas que efectivamente se venden (revisar contra datos del ERP). Quitar marcas que no aparecen en stock.

### 3.2 Sección "Sucursales"
- **Actual:** conteo estático (Jalisco 14, Michoacán 8, Colima 4, Sinaloa 2). Total 28.
- **Pendiente V1.1:** link a una página `/sucursales/` con mapa interactivo, dirección, horario y teléfono de cada tienda.

### 3.3 Hero — copy
- **Actual:** "El celular que necesitas, cerca de ti." + "28 tiendas en occidente de México. Variedad real, financiamiento flexible y gente que te conoce por tu nombre. Sin letras chiquitas."
- **Pendiente V1.1:** revisar con el equipo de marca. Variantes A/B para conversión. La versión actual está aprobada, pero puede iterarse.

### 3.4 Botón flotante WhatsApp
- **Actual:** mensaje predefinido "Hola, vengo de celulink.mx. Quiero información sobre [smartphones/accesorios/tienda]." en el link, pero el bot no tiene lógica de routing.
- **Pendiente V1.1:** definir si el WhatsApp va a un número general o a una cola con respuestas automáticas.

---

## 4. Diseño

### 4.1 Tipografía
- **Actual:** Montserrat (display + body) + Nunito (CTA). Google Fonts CDN.
- **Pendiente V1.1:** autoalojar las fuentes (no depender del CDN de Google, que puede fallar o bloquearse en某些地区). Beneficio: rendimiento y privacidad.

### 4.2 Imágenes responsive del hero
- **Actual:** una sola imagen del Xiaomi para todos los viewports.
- **Pendiente V1.1:** tener una imagen cuadrada para móvil, horizontal para desktop. Hoy se ve OK pero puede optimizarse.

### 4.3 Animaciones
- **Actual:** hover en cards (lift + zoom), sin más animaciones.
- **Pendiente V1.1:** microanimaciones de entrada en hero, transición de páginas, loading states. Decidir si vale la pena para evitar distraer.

### 4.4 Página `/sucursales/` dedicada
- **Actual:** la home tiene resumen (4 cards por estado), pero no hay página `/sucursales/` con mapa.
- **Pendiente V1.1:** crear `/sucursales/index.html` con mapa interactivo (Leaflet/Google Maps), listado completo de 28 tiendas, horarios y teléfonos.

### 4.5 Página `/nosotros/`
- **Pendiente V1.1:** la home no tiene "nosotros" / "historia" / "valores". Considerar agregar para SEO y confianza.

### 4.6 Página `/contacto/` propia
- **Actual:** el contacto en la home son 3 botones (WhatsApp, Tel, Email).
- **Pendiente V1.1:** considerar página `/contacto/` con formulario, mapa y datos.

---

## 5. SEO / Performance

### 5.1 Open Graph y Twitter Cards
- **Actual:** solo `<title>` y `<meta description>`.
- **Pendiente V1.1:** agregar `og:title`, `og:description`, `og:image`, `twitter:card` para mejor preview al compartir en redes.

### 5.2 Schema.org / datos estructurados
- **Pendiente V1.1:** agregar JSON-LD con datos de organización (Organization, LocalBusiness) para mejorar SEO local.

### 5.3 Sitemap y robots.txt
- **Pendiente V1.1:** crear `/sitemap.xml` y verificar `/robots.txt` para indexación correcta.

### 5.4 Lighthouse / performance
- **Actual:** sin auditar. Probablemente necesita mejoras en LCP (imágenes grandes), CLS (carga de fuentes), etc.
- **Pendiente V1.1:** correr Lighthouse y resolver los warnings rojos (90+ en performance).

---

## 6. Funcionalidades (no visuales)

### 6.1 Búsqueda global
- **Pendiente:** la home no tiene buscador. Considerar agregar uno en el header para buscar productos.

### 6.2 Catálogo de equipos con más filtros
- **Actual:** filtros por marca, precio, modelo, almacenamiento.
- **Pendiente V1.1:** filtros por tienda disponible, por rango de RAM, por tipo de equipo (nuevo, reacondicionado, Open Box).

### 6.3 Wishlist / favoritos
- **Pendiente V1.1:** permitir a usuarios guardar productos.

### 6.4 Comparador de productos
- **Pendiente V1.1:** tabla comparativa de 2-3 productos lado a lado.

---

## 7. Accesibilidad

### 7.1 Contraste de color
- **Pendiente V1.1:** validar WCAG AA en todos los textos. El naranja `#F5A623` sobre blanco puede tener contraste bajo en algunos tamaños.

### 7.2 Navegación por teclado
- **Actual:** no auditado. El modal de login probablemente necesita trampa de foco.
- **Pendiente V1.1:** probar navegación completa con teclado y agregar skip-links.

### 7.3 Lectores de pantalla
- **Pendiente V1.1:** agregar `aria-label` a botones de WhatsApp, al hero-floating, al header.

---

## 8. Internacionalización

### 8.1 Idioma
- **Actual:** español únicamente, hardcoded.
- **Pendiente V1.1 (futuro):** si Celulink.mx se abre a otros mercados, considerar estructura para i18n.

---

## Cómo retomar la V1.1

1. Crear nueva rama desde `main`:
   ```bash
   cd ~/clawd/repos/celulink-web
   git checkout main
   git pull
   git checkout -b feature/v1.1-mejoras-visuales
   ```
2. Hacer merge de la rama V1 (`feature/redesign-2026`) si ya está mergeada a `main`, o cherry-pick del commit V1.
3. Empezar por las prioridades 1 (fotografía) y 2 (marca) — son las que más afectan la primera impresión.
4. Cada cambio se mide con captura desktop + móvil antes de merge.

---

*Documento mantenido por Main (Celu) para Cris. Actualizado al cierre de V1 el 2026-10-10.*
