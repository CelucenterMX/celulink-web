# celulink-web

Mono-repo consolidado de CeluCenter. Sirve el dominio **celulink.mx** con una estructura de subcarpetas.

## Estructura

```
celulink.mx/
├── /marca/                          ← brand book, DNA, plantillas
├── /catalogos/
│   ├── /accesorios/                 ← accesorios-mayoreo (2X/F/G)
│   └── /equipos/                    ← catalogo-equipos-celucenter (BM/Ecom/LAFT)
├── /herramientas/
│   ├── /generador-flyers/           ← generador-flyers
│   ├── /cotizador/                  ← cotizador-dolares
│   ├── /prepago/                    ← reporte-prepago
│   ├── /km/                         ← kilometraje
│   └── /publicidad/                 ← herramientas/publicidad
├── /promos/
│   ├── /rifa/                       ← rifa2026
│   ├── /mundial/                    ← rifa-mundial-2026
│   └── /quiniela/                   ← quinielacc2026
└── /admin/
    ├── /reto-equipos/               ← reto-equipos (dashboard competencia)
    └── /encuesta/                   ← encuesta-articulos-celucenter
```

## Deploy

- **Hosting:** GitHub Pages
- **Custom domain:** `celulink.mx`
- **Source:** branch `main`, root
- **HTTPS:** Let's Encrypt (automático)

## Repos originales (para referencia)

Migra contenido desde:

```
CelucenterMX/brand                     → /marca/
CelucenterMX/accesorios-mayoreo        → /catalogos/accesorios/
CelucenterMX/catalogo-equipos-celucenter → /catalogos/equipos/
CelucenterMX/generador-flyers          → /herramientas/generador-flyers/
CelucenterMX/cotizador-dolares         → /herramientas/cotizador/
CelucenterMX/reporte-prepago           → /herramientas/prepago/
CelucenterMX/herramientas              → /herramientas/{km,publicidad}/
CelucenterMX/rifa2026                  → /promos/rifa/
CelucenterMX/rifa-mundial-2026         → /promos/mundial/
CelucenterMX/quinielacc2026            → /promos/quiniela/
CelucenterMX/reto-equipos              → /admin/reto-equipos/
CelucenterMX/encuesta-articulos-celucenter → /admin/encuesta/
```

## Pendientes

- [x] Crear mono-repo
- [x] Estructura base
- [x] Landing en `/`
- [x] Activar GH Pages
- [x] Configurar dominio custom `celulink.mx`
- [ ] DNS ya propagado (verificar 24-48 h)
- [ ] HTTPS funcionando con cert de Let's Encrypt
- [ ] Validar correo `pagos@`, `contacto@`, `ventas@` después del switch DNS
- [ ] Migrar los 11 repos restantes
- [ ] Reemplazar Apps Script URLs en HTML donde aplique
- [ ] Archivar los 12 repos viejos (read-only)
