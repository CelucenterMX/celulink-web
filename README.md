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
│   ├── /prepago/                    ← reporte-prepago
│   └── /publicidad/                 ← herramientas/publicidad
├── /promos/
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

## Repos originales (de referencia — NO se migran a celulink)

Estos se quedan en sus repos originales y NO entran a celulink.mx:

| Repo | Razón |
|------|-------|
| `cotizador-dolares` | Se quitó (no aplica) |
| `herramientas/km` (kilometraje) | Se quitó (no aplica) |
| `rifa2026` | Se quitó (no aplica) |
| `rifa-mundial-2026` | Se quitó (no aplica) |

## Repos que SÍ se migran

```
CelucenterMX/brand                     → /marca/
CelucenterMX/accesorios-mayoreo        → /catalogos/accesorios/
CelucenterMX/catalogo-equipos-celucenter → /catalogos/equipos/
CelucenterMX/generador-flyers          → /herramientas/generador-flyers/
CelucenterMX/reporte-prepago           → /herramientas/prepago/
CelucenterMX/herramientas/publicidad   → /herramientas/publicidad/
CelucenterMX/quinielacc2026            → /promos/quiniela/
CelucenterMX/reto-equipos              → /admin/reto-equipos/
CelucenterMX/encuesta-articulos-celucenter → /admin/encuesta/
```

## Estructura final

```
celulink.mx/
├── /                          ← landing CeluCenter (página principal)
├── /menu/                     ← hub de enlaces a herramientas y catálogos
├── /marca/                    ← brand book
├── /catalogos/
│   ├── /accesorios/           ← accesorios-mayoreo (2X/F/G) ✨ MIGRADO
│   └── /equipos/              ← catalogo-equipos-celucenter
├── /herramientas/
│   ├── /generador-flyers/     ← generador-flyers ✨ MIGRADO
│   ├── /prepago/              ← reporte-prepago
│   └── /publicidad/           ← herramientas/publicidad
├── /promos/
│   └── /quiniela/             ← quinielacc2026
└── /admin/
    ├── /reto-equipos/         ← reto-equipos
    └── /encuesta/             ← encuesta-articulos-celucenter
```

## Pendientes

- [x] Crear mono-repo
- [x] Estructura base
- [x] Landing CeluCenter en `/` (rediseñado)
- [x] Hub de enlaces en `/menu`
- [x] Activar GH Pages
- [x] Configurar dominio custom `celulink.mx`
- [x] DNS propagado
- [x] HTTPS con cert Let's Encrypt
- [x] Migrar generador-flyers
- [x] Migrar accesorios-mayoreo
- [ ] Validar correo `pagos@`, `contacto@`, `ventas@`
- [ ] Migrar 7 repos restantes
- [ ] Reemplazar Apps Script URLs en HTML
- [ ] Archivar repos viejos
- [ ] No migrar: `cotizador-dolares`, `herramientas/km`, `rifa2026`, `rifa-mundial-2026`
