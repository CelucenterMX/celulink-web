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

## Pendientes

- [x] Crear mono-repo
- [x] Estructura base
- [x] Landing en `/`
- [x] Activar GH Pages
- [x] Configurar dominio custom `celulink.mx`
- [x] DNS propagado
- [x] HTTPS funcionando con cert de Let's Encrypt
- [ ] Validar correo `pagos@`, `contacto@`, `ventas@`
- [ ] Migrar los 9 repos restantes (3 quedaron fuera: cotizador, km, rifas)
- [ ] Reemplazar Apps Script URLs en HTML donde aplique
- [ ] Archivar los 9 repos viejos que sí migran (read-only)
- [ ] No migrar: `cotizador-dolares`, `herramientas/km`, `rifa2026`, `rifa-mundial-2026`
